//! Port of `main/ipc/ai.ts`.
//
// ─────────────────────────────────────────────────────────────────────────────
// AI assistant for DRAFTING certificate/document templates.
//
// Design goals:
//   • Low-spec friendly — the laptop only makes one small HTTPS request. No local
//     model, no heavy compute. Works on 4GB no-GPU machines.
//   • Privacy first — the model only ever sees the list of *placeholder tokens*
//     and the staff's plain-language instruction. NO resident data is ever sent.
//   • Provider-agnostic — any OpenAI-compatible "chat completions" endpoint works
//     (Google Gemini free tier, Groq, OpenRouter, or a local Ollama server).
//   • Optional & graceful — if not configured or offline, the core app is
//     unaffected; the feature just reports a friendly error.
// ─────────────────────────────────────────────────────────────────────────────

use super::{auth, fail, Args, HResult};
use crate::db;
use crate::db::queries::settings::{get_setting, set_setting};
use crate::utils::events;
use crate::utils::logger::{log_error, log_info};
use anyhow::{anyhow, bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "ai:test" => ai_test().await,
        "ai:generateTemplate" => generate_template(a).await,
        "ai:improveTemplate" => improve_template(a).await,
        _ => return None,
    })
}

struct AIConfig {
    enabled: bool,
    base_url: String,
    model: String,
    api_key: String,
}

fn get_ai_config() -> Result<AIConfig> {
    let conn = db::conn();
    let s = |k: &str| -> Result<String> { Ok(get_setting(&conn, k)?.unwrap_or_default()) };
    Ok(AIConfig {
        enabled: s("ai_enabled")? == "1",
        base_url: s("ai_base_url")?.trim().trim_end_matches('/').to_string(),
        model: s("ai_model")?.trim().to_string(),
        api_key: s("ai_api_key")?.trim().to_string(),
    })
}

fn msg(role: &str, content: impl Into<String>) -> Value {
    json!({ "role": role, "content": content.into() })
}

// Single place that talks to the provider. Returns the assistant text or throws
// a human-readable Error. A 45s timeout keeps a laggy connection from hanging
// the UI forever.
async fn call_chat(messages: &[Value], cfg: &AIConfig, timeout_ms: u64) -> Result<String> {
    if cfg.base_url.is_empty() {
        bail!("No AI server URL set. Open Settings → AI Assistant.");
    }
    if cfg.model.is_empty() {
        bail!("No AI model set. Open Settings → AI Assistant.");
    }

    // JS: AbortController + setTimeout → reqwest's whole-request timeout (it
    // covers reading the body too, like the abort signal did).
    let timed_out = || anyhow!("The AI request timed out — your internet may be slow. Please try again.");
    // fetch network failures surface as TypeError with a terse message
    let unreachable =
        || anyhow!("Could not reach the AI server. Check your internet connection and the server URL.");
    let map_err = |e: reqwest::Error| {
        if e.is_timeout() {
            timed_out()
        } else if e.is_decode() {
            // A non-JSON success body is a SyntaxError in JS — rethrown as-is.
            anyhow!("{e}")
        } else {
            unreachable()
        }
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|_| unreachable())?;

    let mut req = client
        .post(format!("{}/chat/completions", cfg.base_url))
        .header("Content-Type", "application/json");
    // Some providers (e.g. Ollama) ignore the key; that's fine.
    if !cfg.api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
    }
    let body = json!({
        "model": cfg.model,
        "messages": messages,
        "temperature": 0.4,
        "max_tokens": 2000,
    });

    let res = req.body(body.to_string()).send().await.map_err(map_err)?;

    let status = res.status();
    if !status.is_success() {
        // non-JSON error body → no detail
        let err_body: Option<Value> = res.json().await.ok();
        let detail = err_body
            .as_ref()
            .and_then(|b| {
                b.pointer("/error/message")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .or_else(|| b.get("message").and_then(Value::as_str))
            })
            .unwrap_or("")
            .to_string();
        let code = status.as_u16();
        if code == 401 || code == 403 {
            bail!("The AI server rejected the API key. Check it in Settings → AI Assistant.");
        }
        if code == 429 {
            bail!("AI free-tier limit reached for now. Wait a bit and try again.");
        }
        if detail.is_empty() {
            bail!("AI server error ({code}).");
        }
        bail!("AI server error ({code}): {detail}.");
    }

    let data: Value = res.json().await.map_err(map_err)?;
    let text = data.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or("");
    if text.trim().is_empty() {
        bail!("The AI returned an empty response. Try rephrasing.");
    }
    Ok(text.to_string())
}

// Remove any ```html ... ``` fences a model might wrap the output in.
fn strip_code_fences(text: &str) -> String {
    static OPEN: OnceLock<Regex> = OnceLock::new();
    static CLOSE: OnceLock<Regex> = OnceLock::new();
    let open = OPEN.get_or_init(|| Regex::new(r"^```[a-zA-Z]*\s*\n?").expect("valid regex"));
    let close = CLOSE.get_or_init(|| Regex::new(r"\n?```\s*$").expect("valid regex"));
    let t = text.trim();
    let t = open.replace(t, "");
    let t = close.replace(&t, "");
    t.trim().to_string()
}

/// JS template-literal stringification of a field (`undefined` when missing).
fn js_str(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// `variables: { key, label }[]` from the renderer payload.
fn build_system_prompt(variables: &[Value]) -> String {
    let var_list = variables
        .iter()
        .map(|v| format!("  {{{{{}}}}} — {}", js_str(v.get("key")), js_str(v.get("label"))))
        .collect::<Vec<_>>()
        .join("\n");
    [
        "You help a Philippine barangay (village government) office write a printable",
        "certificate or document TEMPLATE.",
        "",
        "Rules:",
        "- Output ONLY the inner HTML body of the template. No <html>, <head>, or <body>",
        "  tags, no markdown, no code fences, and no explanation before or after.",
        "- Use simple inline-styled HTML suitable for an A4 page in Times New Roman:",
        "  <p>, <strong>, <em>, <h2 style=\"text-align:center\">, <div>, etc.",
        "- Insert data using these EXACT placeholder tokens. Never invent new tokens",
        "  and never write real names, dates, or values — only tokens:",
        &var_list,
        "",
        "Special tokens:",
        "- {{header}} — the official barangay letterhead. Put it at the very top.",
        "- {{input:field_name}} — a value the staff types when generating the document.",
        "  Use snake_case names, e.g. {{input:purpose}}, {{input:amount}}.",
        "- {{signatory:punong_barangay}} — a signature block for an official. Put it at",
        "  the bottom. Other roles: {{signatory:secretary}}, {{signatory:treasurer}}.",
        "",
        "Keep the wording formal and appropriate for an official Philippine barangay",
        "document. A typical structure is: {{header}}, a centered TITLE, \"TO WHOM IT MAY",
        "CONCERN:\", the body paragraphs, then a {{signatory:...}} block.",
    ]
    .join("\n")
}

// ─── Local-AI performance guard ──────────────────────────────────────────────
// A local model (e.g. Ollama) runs in its OWN process and can strain a low-spec
// laptop. We can't safely kill another app's process, but we CAN: abort our
// request (which disconnects from the local server and stops its generation) and
// auto-disable the feature so the app stops driving the load. This only applies
// to LOCAL providers — hosted ones (Gemini) don't tax the laptop.
const HOSTED_TIMEOUT_MS: u64 = 45_000;
const LOCAL_TIMEOUT_MS: u64 = 90_000; // local models can be legitimately slower
const LAG_LATENCY_MS: u128 = 45_000; // a local reply slower than this = lagging
const LAG_EVENTLOOP_MS: f64 = 750.0; // main-process event-loop stall = thrashing
const MIN_FREE_RAM_BYTES: u64 = 700 * 1024 * 1024;
const MAX_LOCAL_SLOW_STRIKES: u32 = 2; // disable after this many laggy runs
static LOCAL_SLOW_STRIKES: AtomicU32 = AtomicU32::new(0);

fn is_local_provider(base_url: &str) -> bool {
    // Same comparison as the TS (`new URL(baseUrl).hostname`); note both WHATWG
    // URL and the `url` crate report IPv6 hosts bracketed ("[::1]").
    match url::Url::parse(base_url) {
        Ok(u) => matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "::1" | "0.0.0.0")),
        Err(_) => false,
    }
}

fn notify_auto_disabled() {
    events::emit("ai:autoDisabled", json!({ "reason": "local-lag" }));
}

/// Free RAM in bytes (`os.freemem()`). sysinfo's "available" memory is used —
/// it counts reclaimable cache, which is what "is RAM tight right now" means.
fn free_mem() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.available_memory()
}

// Substitute for Node's `perf_hooks.monitorEventLoopDelay({ resolution: 20 })`.
// Rust has no single event loop to measure, so we measure the same symptom: a
// tokio task sleeps 20ms in a loop on the app's async runtime (the one that also
// serves IPC calls) and records how late each wake-up is. When the computer is
// thrashing (CPU pegged / swapping because a local model is hogging it) the
// wake-ups drift by hundreds of ms — exactly what the event-loop mean caught.
struct LagMonitor {
    stop: Arc<AtomicBool>,
    sum_ns: Arc<AtomicU64>,
    count: Arc<AtomicU64>,
}

impl LagMonitor {
    const RESOLUTION: Duration = Duration::from_millis(20);

    fn start() -> Self {
        let m = LagMonitor {
            stop: Arc::new(AtomicBool::new(false)),
            sum_ns: Arc::new(AtomicU64::new(0)),
            count: Arc::new(AtomicU64::new(0)),
        };
        let (stop, sum_ns, count) = (m.stop.clone(), m.sum_ns.clone(), m.count.clone());
        tauri::async_runtime::spawn(async move {
            while !stop.load(Ordering::Relaxed) {
                let t = Instant::now();
                tokio::time::sleep(Self::RESOLUTION).await;
                let drift = t.elapsed().saturating_sub(Self::RESOLUTION);
                sum_ns.fetch_add(drift.as_nanos() as u64, Ordering::Relaxed);
                count.fetch_add(1, Ordering::Relaxed);
            }
        });
        m
    }

    /// Stop sampling and return the mean delay in ms (`loop.mean / 1e6`).
    fn finish(self) -> f64 {
        self.stop.store(true, Ordering::Relaxed);
        let n = self.count.load(Ordering::Relaxed);
        if n == 0 {
            return 0.0;
        }
        self.sum_ns.load(Ordering::Relaxed) as f64 / n as f64 / 1e6
    }
}

// Runs a chat request. For local providers it watches latency, main-process
// event-loop delay, and free RAM; repeated lag auto-disables the AI feature so
// the app stops loading the machine.
async fn chat_guarded(messages: &[Value], cfg: &AIConfig) -> Result<String> {
    if !is_local_provider(&cfg.base_url) {
        // Hosted provider — no local load to guard against.
        return call_chat(messages, cfg, HOSTED_TIMEOUT_MS).await;
    }

    let low_ram_at_start = free_mem() < MIN_FREE_RAM_BYTES;
    let lag = LagMonitor::start();
    let started = Instant::now();

    let outcome = call_chat(messages, cfg, LOCAL_TIMEOUT_MS).await;
    let event_loop_mean_ms = lag.finish();

    let elapsed = started.elapsed().as_millis();
    let timed_out = match &outcome {
        Err(e) => e.to_string().to_lowercase().contains("timed out"),
        Ok(_) => false,
    };
    let laggy = timed_out
        || elapsed > LAG_LATENCY_MS
        || event_loop_mean_ms > LAG_EVENTLOOP_MS
        || (low_ram_at_start && free_mem() < MIN_FREE_RAM_BYTES);

    if laggy {
        let strikes = LOCAL_SLOW_STRIKES.fetch_add(1, Ordering::SeqCst) + 1;
        log_info(&format!(
            "Local AI lag detected (elapsed={elapsed}ms, eventLoopMean={event_loop_mean_ms:.0}ms, lowRam={low_ram_at_start}, strikes={strikes}/{MAX_LOCAL_SLOW_STRIKES})."
        ));
        if strikes >= MAX_LOCAL_SLOW_STRIKES {
            LOCAL_SLOW_STRIKES.store(0, Ordering::SeqCst);
            {
                let conn = db::conn();
                set_setting(&conn, "ai_enabled", "0")?; // stop the app from driving the local model
            }
            notify_auto_disabled();
            bail!("Local AI was slowing this computer down, so it was turned off automatically. Re-enable it in Settings → AI Assistant, or switch to a hosted provider like Gemini.");
        }
        // Under the limit: surface the real error if it failed, else return the slow
        // result this once (the strike is recorded for next time).
        return outcome;
    }

    // Healthy run — clear the strike counter.
    LOCAL_SLOW_STRIKES.store(0, Ordering::SeqCst);
    outcome
}

/// `err?.message || fallback`.
fn err_msg(e: &anyhow::Error, fallback: &str) -> String {
    let m = e.to_string();
    if m.is_empty() {
        fallback.to_string()
    } else {
        m
    }
}

fn payload_str(p: &Value, key: &str) -> String {
    p.get(key).and_then(Value::as_str).unwrap_or("").trim().to_string()
}

fn payload_vars(p: &Value) -> Vec<Value> {
    p.get("variables").and_then(Value::as_array).cloned().unwrap_or_default()
}

// Lightweight connection test used by the Settings page.
async fn ai_test() -> HResult {
    let cfg = get_ai_config()?;
    if cfg.base_url.is_empty() || cfg.model.is_empty() {
        return Ok(fail("Set the server URL and model first."));
    }
    let timeout = if is_local_provider(&cfg.base_url) { LOCAL_TIMEOUT_MS } else { HOSTED_TIMEOUT_MS };
    let messages = [msg("system", "Reply with exactly the word: OK"), msg("user", "ping")];
    match call_chat(&messages, &cfg, timeout).await {
        Ok(reply) => {
            log_info("AI connection test succeeded.");
            let short: String = reply.trim().chars().take(40).collect();
            Ok(json!({ "success": true, "model": cfg.model, "reply": short }))
        }
        Err(e) => {
            log_error("AI connection test failed", &e);
            Ok(fail(err_msg(&e, "Connection failed.")))
        }
    }
}

// Draft a brand-new template from a plain-language instruction.
async fn generate_template(a: &Args) -> HResult {
    if auth::current_user().is_none() {
        return Ok(fail("Not signed in."));
    }

    let cfg = get_ai_config()?;
    if !cfg.enabled {
        return Ok(fail("The AI Assistant is turned off. Enable it in Settings → AI Assistant."));
    }

    let payload = a.val(0);
    let instruction = payload_str(&payload, "instruction");
    if instruction.is_empty() {
        return Ok(fail("Describe the document you want first."));
    }

    let messages = [
        msg("system", build_system_prompt(&payload_vars(&payload))),
        msg("user", format!("Write a barangay document template for: {instruction}")),
    ];
    match chat_guarded(&messages, &cfg).await {
        Ok(text) => Ok(json!({ "success": true, "html": strip_code_fences(&text) })),
        Err(e) => {
            log_error("AI generateTemplate failed", &e);
            Ok(fail(err_msg(&e, "Generation failed.")))
        }
    }
}

// Revise the current template per an instruction (keeps it token-safe).
async fn improve_template(a: &Args) -> HResult {
    if auth::current_user().is_none() {
        return Ok(fail("Not signed in."));
    }

    let cfg = get_ai_config()?;
    if !cfg.enabled {
        return Ok(fail("The AI Assistant is turned off. Enable it in Settings → AI Assistant."));
    }

    let payload = a.val(0);
    let instruction = payload_str(&payload, "instruction");
    let current_html = payload_str(&payload, "currentHtml");
    if instruction.is_empty() {
        return Ok(fail("Describe the change you want first."));
    }
    if current_html.is_empty() {
        return Ok(fail("There is no template content to improve yet."));
    }

    let messages = [
        msg("system", build_system_prompt(&payload_vars(&payload))),
        msg(
            "user",
            format!("Here is the current template HTML:\n\n{current_html}\n\n")
                + &format!("Revise it as follows, keeping all rules and tokens valid: {instruction}\n\n")
                + "Return the full revised template HTML.",
        ),
    ];
    match chat_guarded(&messages, &cfg).await {
        Ok(text) => Ok(json!({ "success": true, "html": strip_code_fences(&text) })),
        Err(e) => {
            log_error("AI improveTemplate failed", &e);
            Ok(fail(err_msg(&e, "Revision failed.")))
        }
    }
}
