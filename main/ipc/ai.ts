import { ipcMain, BrowserWindow } from 'electron';
import os from 'os';
import { monitorEventLoopDelay } from 'perf_hooks';
import { getSetting, setSetting } from '../database/queries/settings';
import { getCurrentSessionUser } from './auth';
import { logInfo, logError } from '../utils/logger';

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

interface AIConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
}

function getAIConfig(): AIConfig {
  return {
    enabled: getSetting('ai_enabled') === '1',
    baseUrl: (getSetting('ai_base_url') || '').trim().replace(/\/+$/, ''),
    model: (getSetting('ai_model') || '').trim(),
    apiKey: (getSetting('ai_api_key') || '').trim(),
  };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Single place that talks to the provider. Returns the assistant text or throws
// a human-readable Error. A 45s timeout keeps a laggy connection from hanging
// the UI forever.
async function callChat(messages: ChatMessage[], cfg: AIConfig, timeoutMs: number): Promise<string> {
  if (!cfg.baseUrl) throw new Error('No AI server URL set. Open Settings → AI Assistant.');
  if (!cfg.model) throw new Error('No AI model set. Open Settings → AI Assistant.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Some providers (e.g. Ollama) ignore the key; that's fine.
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.4,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errBody: any = await res.json();
        detail = errBody?.error?.message || errBody?.message || '';
      } catch { /* non-JSON error body */ }
      if (res.status === 401 || res.status === 403) {
        throw new Error('The AI server rejected the API key. Check it in Settings → AI Assistant.');
      }
      if (res.status === 429) {
        throw new Error('AI free-tier limit reached for now. Wait a bit and try again.');
      }
      throw new Error(`AI server error (${res.status})${detail ? `: ${detail}` : ''}.`);
    }

    const data: any = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text || !text.trim()) throw new Error('The AI returned an empty response. Try rephrasing.');
    return text;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('The AI request timed out — your internet may be slow. Please try again.');
    }
    // fetch network failures surface as TypeError with a terse message
    if (err instanceof TypeError) {
      throw new Error('Could not reach the AI server. Check your internet connection and the server URL.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Remove any ```html ... ``` fences a model might wrap the output in.
function stripCodeFences(text: string): string {
  let t = text.trim();
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, '');
  t = t.replace(/\n?```\s*$/, '');
  return t.trim();
}

interface VariableHint {
  key: string;
  label: string;
}

function buildSystemPrompt(variables: VariableHint[]): string {
  const varList = variables.map((v) => `  {{${v.key}}} — ${v.label}`).join('\n');
  return [
    'You help a Philippine barangay (village government) office write a printable',
    'certificate or document TEMPLATE.',
    '',
    'Rules:',
    '- Output ONLY the inner HTML body of the template. No <html>, <head>, or <body>',
    '  tags, no markdown, no code fences, and no explanation before or after.',
    '- Use simple inline-styled HTML suitable for an A4 page in Times New Roman:',
    '  <p>, <strong>, <em>, <h2 style="text-align:center">, <div>, etc.',
    '- Insert data using these EXACT placeholder tokens. Never invent new tokens',
    '  and never write real names, dates, or values — only tokens:',
    varList,
    '',
    'Special tokens:',
    '- {{header}} — the official barangay letterhead. Put it at the very top.',
    '- {{input:field_name}} — a value the staff types when generating the document.',
    '  Use snake_case names, e.g. {{input:purpose}}, {{input:amount}}.',
    '- {{signatory:punong_barangay}} — a signature block for an official. Put it at',
    '  the bottom. Other roles: {{signatory:secretary}}, {{signatory:treasurer}}.',
    '',
    'Keep the wording formal and appropriate for an official Philippine barangay',
    'document. A typical structure is: {{header}}, a centered TITLE, "TO WHOM IT MAY',
    'CONCERN:", the body paragraphs, then a {{signatory:...}} block.',
  ].join('\n');
}

// ─── Local-AI performance guard ──────────────────────────────────────────────
// A local model (e.g. Ollama) runs in its OWN process and can strain a low-spec
// laptop. We can't safely kill another app's process, but we CAN: abort our
// request (which disconnects from the local server and stops its generation) and
// auto-disable the feature so the app stops driving the load. This only applies
// to LOCAL providers — hosted ones (Gemini) don't tax the laptop.
const HOSTED_TIMEOUT_MS = 45_000;
const LOCAL_TIMEOUT_MS = 90_000;        // local models can be legitimately slower
const LAG_LATENCY_MS = 45_000;          // a local reply slower than this = lagging
const LAG_EVENTLOOP_MS = 750;           // main-process event-loop stall = thrashing
const MIN_FREE_RAM_BYTES = 700 * 1024 * 1024;
const MAX_LOCAL_SLOW_STRIKES = 2;       // disable after this many laggy runs
let localSlowStrikes = 0;

function isLocalProvider(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

function notifyAutoDisabled(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('ai:autoDisabled', { reason: 'local-lag' });
  }
}

// Runs a chat request. For local providers it watches latency, main-process
// event-loop delay, and free RAM; repeated lag auto-disables the AI feature so
// the app stops loading the machine.
async function chatGuarded(messages: ChatMessage[], cfg: AIConfig): Promise<string> {
  if (!isLocalProvider(cfg.baseUrl)) {
    // Hosted provider — no local load to guard against.
    return callChat(messages, cfg, HOSTED_TIMEOUT_MS);
  }

  const lowRamAtStart = os.freemem() < MIN_FREE_RAM_BYTES;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const started = Date.now();

  let result: string | undefined;
  let thrown: any;
  try {
    result = await callChat(messages, cfg, LOCAL_TIMEOUT_MS);
  } catch (err: any) {
    thrown = err;
  } finally {
    loop.disable();
  }

  const elapsed = Date.now() - started;
  const eventLoopMeanMs = loop.mean / 1e6; // nanoseconds → ms
  const timedOut = /timed out/i.test(thrown?.message || '');
  const laggy =
    timedOut ||
    elapsed > LAG_LATENCY_MS ||
    eventLoopMeanMs > LAG_EVENTLOOP_MS ||
    (lowRamAtStart && os.freemem() < MIN_FREE_RAM_BYTES);

  if (laggy) {
    localSlowStrikes++;
    logInfo(`Local AI lag detected (elapsed=${elapsed}ms, eventLoopMean=${eventLoopMeanMs.toFixed(0)}ms, lowRam=${lowRamAtStart}, strikes=${localSlowStrikes}/${MAX_LOCAL_SLOW_STRIKES}).`);
    if (localSlowStrikes >= MAX_LOCAL_SLOW_STRIKES) {
      localSlowStrikes = 0;
      setSetting('ai_enabled', '0');     // stop the app from driving the local model
      notifyAutoDisabled();
      throw new Error('Local AI was slowing this computer down, so it was turned off automatically. Re-enable it in Settings → AI Assistant, or switch to a hosted provider like Gemini.');
    }
    // Under the limit: surface the real error if it failed, else return the slow
    // result this once (the strike is recorded for next time).
    if (thrown) throw thrown;
    return result!;
  }

  // Healthy run — clear the strike counter.
  localSlowStrikes = 0;
  if (thrown) throw thrown;
  return result!;
}

export function registerAIHandlers(): void {
  // Lightweight connection test used by the Settings page.
  ipcMain.handle('ai:test', async () => {
    const cfg = getAIConfig();
    if (!cfg.baseUrl || !cfg.model) {
      return { success: false, error: 'Set the server URL and model first.' };
    }
    try {
      const reply = await callChat(
        [
          { role: 'system', content: 'Reply with exactly the word: OK' },
          { role: 'user', content: 'ping' },
        ],
        cfg,
        isLocalProvider(cfg.baseUrl) ? LOCAL_TIMEOUT_MS : HOSTED_TIMEOUT_MS,
      );
      logInfo('AI connection test succeeded.');
      return { success: true, model: cfg.model, reply: reply.trim().slice(0, 40) };
    } catch (err: any) {
      logError('AI connection test failed', err);
      return { success: false, error: err?.message || 'Connection failed.' };
    }
  });

  // Draft a brand-new template from a plain-language instruction.
  ipcMain.handle('ai:generateTemplate', async (_e, payload: { instruction: string; variables: VariableHint[] }) => {
    const user = getCurrentSessionUser();
    if (!user) return { success: false, error: 'Not signed in.' };

    const cfg = getAIConfig();
    if (!cfg.enabled) return { success: false, error: 'The AI Assistant is turned off. Enable it in Settings → AI Assistant.' };

    const instruction = (payload?.instruction || '').trim();
    if (!instruction) return { success: false, error: 'Describe the document you want first.' };

    try {
      const html = stripCodeFences(
        await chatGuarded(
          [
            { role: 'system', content: buildSystemPrompt(payload.variables || []) },
            { role: 'user', content: `Write a barangay document template for: ${instruction}` },
          ],
          cfg,
        ),
      );
      return { success: true, html };
    } catch (err: any) {
      logError('AI generateTemplate failed', err);
      return { success: false, error: err?.message || 'Generation failed.' };
    }
  });

  // Revise the current template per an instruction (keeps it token-safe).
  ipcMain.handle('ai:improveTemplate', async (_e, payload: { instruction: string; currentHtml: string; variables: VariableHint[] }) => {
    const user = getCurrentSessionUser();
    if (!user) return { success: false, error: 'Not signed in.' };

    const cfg = getAIConfig();
    if (!cfg.enabled) return { success: false, error: 'The AI Assistant is turned off. Enable it in Settings → AI Assistant.' };

    const instruction = (payload?.instruction || '').trim();
    const currentHtml = (payload?.currentHtml || '').trim();
    if (!instruction) return { success: false, error: 'Describe the change you want first.' };
    if (!currentHtml) return { success: false, error: 'There is no template content to improve yet.' };

    try {
      const html = stripCodeFences(
        await chatGuarded(
          [
            { role: 'system', content: buildSystemPrompt(payload.variables || []) },
            {
              role: 'user',
              content:
                `Here is the current template HTML:\n\n${currentHtml}\n\n` +
                `Revise it as follows, keeping all rules and tokens valid: ${instruction}\n\n` +
                `Return the full revised template HTML.`,
            },
          ],
          cfg,
        ),
      );
      return { success: true, html };
    } catch (err: any) {
      logError('AI improveTemplate failed', err);
      return { success: false, error: err?.message || 'Revision failed.' };
    }
  });
}
