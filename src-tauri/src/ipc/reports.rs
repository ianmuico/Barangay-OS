//! Document generation, PDF export and printing (port of `main/ipc/reports.ts`).
//!
//! The generated HTML is kept byte-for-byte identical to the Electron build so
//! documents look the same. `printToPDF` → `utils::pdf` (system Edge/Chrome);
//! `webContents.print` → the finished document is returned as `__print_html`
//! and the renderer bridge prints it.

use super::{auth, fail, truthy, Args, HResult, ObjExt};
use crate::db::{
    self,
    queries::{
        audit::log_audit,
        officials::list_officials,
        rbi_form_c::get_rbi_form_c_counts,
        reports::{create_generated_report, next_control_number},
        residents::get_resident_by_id,
        settings::get_setting,
        templates::{get_template_by_id, get_template_by_name},
    },
};
use crate::utils::dialogs::{self, DialogOptions};
use crate::utils::paper::{self, PaperSettings};
use crate::utils::pdf::{html_to_pdf_async, PdfOptions};
use anyhow::{anyhow, Result};
use base64::Engine;
use chrono::{Datelike, Local, NaiveDate};
use regex::{NoExpand, Regex};
use rusqlite::Connection;
use rust_xlsxwriter::{Format, Workbook};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "reports:getInputFields" => get_input_fields(a),
        "reports:generate" => generate(a),
        "reports:generateFormC" => generate_form_c(a),
        "reports:exportFormCXlsx" => export_form_c_xlsx(),
        "reports:exportPDF" => export_pdf(a).await,
        "reports:print" => print(a),
        "reports:generateMulti" => generate_multi(a),
        "reports:exportMultiPDF" => export_multi_pdf(a).await,
        "reports:printList" => print_list(a).await,
        "reports:printGroupedList" => print_grouped_list(a).await,
        _ => return None,
    })
}

// ─── JS-compat helpers ──────────────────────────────────────────────────────

/// JS number → string (`${n}`).
fn js_num(f: f64) -> String {
    if f.is_nan() {
        "NaN".into()
    } else if f.is_infinite() {
        if f > 0.0 { "Infinity".into() } else { "-Infinity".into() }
    } else if f.fract() == 0.0 && f.abs() < 1e21 {
        format!("{}", f as i64)
    } else {
        format!("{f}")
    }
}

/// `String(v)` / template-literal interpolation of a JSON value.
fn js_str(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => match n.as_i64() {
            Some(i) => i.to_string(),
            None => js_num(n.as_f64().unwrap_or(f64::NAN)),
        },
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(|x| if x.is_null() { String::new() } else { js_str(x) })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

/// Interpolation of a possibly-missing value (`undefined`).
fn js_tpl(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(v) => js_str(v),
    }
}

/// `obj.key || ''`
fn or_empty(obj: &Value, key: &str) -> String {
    match obj.get(key) {
        Some(v) if truthy(v) => js_str(v),
        _ => String::new(),
    }
}

/// `getSetting(key) || ''` (empty string counts as unset, like JS `||`).
fn setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(get_setting(conn, key)?.filter(|s| !s.is_empty()))
}

/// `[a, b, ...].filter(Boolean).join(' ')`
fn join_truthy(obj: &Value, keys: &[&str]) -> String {
    keys.iter().map(|k| or_empty(obj, k)).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}

/// `str.replace(/[^a-zA-Z0-9]/g, '_')` — per UTF-16 code unit, like JS.
fn safe_filename(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else {
            for _ in 0..ch.len_utf16() {
                out.push('_');
            }
        }
    }
    out
}

/// `parseInt(s, 10)` — leading integer prefix, `None` for NaN.
fn js_parse_int(s: &str) -> Option<i64> {
    static RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[+-]?\d+").expect("regex"));
    RE.find(s.trim_start()).and_then(|m| m.as_str().parse::<f64>().ok()).map(|f| f as i64)
}

/// `parseFloat(s)` — leading float prefix, `None` for NaN.
fn js_parse_float(s: &str) -> Option<f64> {
    static RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^[+-]?(Infinity|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)").expect("regex")
    });
    let m = RE.find(s.trim_start())?;
    let t = m.as_str();
    if t.ends_with("Infinity") {
        return Some(if t.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY });
    }
    t.parse::<f64>().ok()
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/// `new Date(str)` for the date strings stored in the DB ("YYYY-MM-DD…").
fn parse_js_date(s: &str) -> Option<NaiveDate> {
    let head = s.get(..10).unwrap_or(s);
    NaiveDate::parse_from_str(head, "%Y-%m-%d").ok()
}

fn calculate_age(birth_date: &str) -> String {
    let Some(birth) = parse_js_date(birth_date) else {
        return "NaN".into();
    };
    let today = Local::now().date_naive();
    let mut age = today.year() - birth.year();
    let month_diff = today.month() as i32 - birth.month() as i32;
    if month_diff < 0 || (month_diff == 0 && today.day() < birth.day()) {
        age -= 1;
    }
    age.to_string()
}

/// `toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })` → "June 10, 2026"
fn format_date(d: NaiveDate) -> String {
    d.format("%B %-d, %Y").to_string()
}

fn ordinal(n: u32) -> String {
    let rem10 = n % 10;
    let rem100 = n % 100;
    if rem10 == 1 && rem100 != 11 {
        return format!("{n}st");
    }
    if rem10 == 2 && rem100 != 12 {
        return format!("{n}nd");
    }
    if rem10 == 3 && rem100 != 13 {
        return format!("{n}rd");
    }
    format!("{n}th")
}

// "10th day of June, 2026" — the legalese form used in certificates
fn format_date_ordinal(d: NaiveDate) -> String {
    format!("{} day of {}, {}", ordinal(d.day()), d.format("%B"), d.year())
}

// ─── HTML building ──────────────────────────────────────────────────────────

fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#039;"),
            _ => out.push(c),
        }
    }
    out
}

fn get_logo_base64(conn: &Connection) -> Result<Option<String>> {
    let Some(logo_path) = setting(conn, "barangay_logo_path")? else {
        return Ok(None);
    };
    let p = std::path::Path::new(&logo_path);
    if !p.exists() {
        return Ok(None);
    }
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let mime = if ext == "png" {
        "image/png".to_string()
    } else if ext == "jpg" || ext == "jpeg" {
        "image/jpeg".to_string()
    } else {
        format!("image/{ext}")
    };
    let data = std::fs::read(p)?;
    Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(data))))
}

struct Watermark {
    enabled: bool,
    size: i64,
    opacity: f64,
}

// Watermark display settings — admin-tunable in Settings → Barangay
fn get_watermark_settings(conn: &Connection) -> Result<Watermark> {
    let enabled = get_setting(conn, "watermark_enabled")?.as_deref() != Some("0"); // on by default
    let size_s = setting(conn, "watermark_size")?.unwrap_or_else(|| "420".into());
    let size = js_parse_int(&size_s).filter(|n| *n != 0).unwrap_or(420).clamp(100, 800);
    let op_s = setting(conn, "watermark_opacity")?.unwrap_or_else(|| "0.06".into());
    let opacity = js_parse_float(&op_s).filter(|f| *f != 0.0).unwrap_or(0.06).clamp(0.01, 0.5);
    Ok(Watermark { enabled, size, opacity })
}

fn logo_img(logo: &Option<String>) -> String {
    match logo {
        Some(b64) => format!(r#"<img src="{b64}" style="width:70px;height:70px;object-fit:contain;" />"#),
        None => String::new(),
    }
}

fn build_header_html(conn: &Connection) -> Result<String> {
    // Check if user has a custom header template stored
    if let Some(custom_header) = setting(conn, "header_template")? {
        // Resolve settings variables in the custom header
        let barangay_name = setting(conn, "barangay_name")?.unwrap_or_default();
        let municipality = setting(conn, "municipality")?.unwrap_or_default();
        let province = setting(conn, "province")?.unwrap_or_default();
        let logo = get_logo_base64(conn)?;
        let html = custom_header
            .replace("{{barangay}}", &barangay_name)
            .replace("{{municipality}}", &municipality)
            .replace("{{province}}", &province)
            .replace("{{logo}}", &logo_img(&logo));
        return Ok(format!("<div data-letterhead>{html}</div>"));
    }

    // Default header matching the actual report format
    let barangay_name = setting(conn, "barangay_name")?.unwrap_or_else(|| "BARANGAY".into());
    let municipality = setting(conn, "municipality")?.unwrap_or_default();
    let province = setting(conn, "province")?.unwrap_or_default();
    let logo = logo_img(&get_logo_base64(conn)?);

    let mut s = String::new();
    s.push_str(r#"<div data-letterhead style="text-align:center;margin-bottom:16px;">
    <table style="width:100%;border:none;border-collapse:collapse;">
      <tr>
        <td style="width:80px;text-align:center;border:none;padding:0;vertical-align:middle;">"#);
    s.push_str(&logo);
    s.push_str(r#"</td>
        <td style="text-align:center;border:none;padding:0;vertical-align:middle;">
          <p style="margin:0;font-size:10pt;">Republic of the Philippines</p>
          <p style="margin:0;font-size:10pt;">Province of "#);
    s.push_str(&province);
    s.push_str(r#"</p>
          <p style="margin:0;font-size:10pt;">Municipality of "#);
    s.push_str(&municipality);
    s.push_str(r#"</p>
          <p style="margin:2px 0 0;font-size:13pt;font-weight:bold;">"#);
    s.push_str(&barangay_name);
    s.push_str(r#"</p>
        </td>
        <td style="width:80px;border:none;padding:0;"></td>
      </tr>
    </table>
  </div>"#);
    Ok(s)
}

fn normalize_role(s: &str) -> String {
    s.to_lowercase().chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit()).collect()
}

fn find_official_by_role<'a>(officials: &'a [Value], role: &str) -> Option<&'a Value> {
    // Normalize both sides to bare alphanumerics so "punong_barangay" matches "Punong Barangay"
    let role_key = normalize_role(role);
    officials.iter().find(|o| {
        let pos = normalize_role(&js_tpl(o.get("position")));
        pos.contains(&role_key) || role_key.contains(&pos)
    })
}

fn official_full_name(official: &Value) -> String {
    join_truthy(official, &["first_name", "last_name"])
}

static RE_OFFICIAL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{official:([A-Za-z0-9_]+)\}\}").expect("regex"));
static RE_SIGNATORY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{signatory:([A-Za-z0-9_]+)\}\}").expect("regex"));
static RE_INPUT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{input:([A-Za-z0-9_]+)\}\}").expect("regex"));
static RE_COUNT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{count:[a-zA-Z0-9_]+\}\}").expect("regex"));
static RE_HEADER_TEST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"data-chip-block="header"|\{\{header\}\}"#).expect("regex"));
static RE_HEADER_CHIP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<div[^>]*data-chip-block="header"[^>]*>\s*</div>"#).expect("regex"));

fn resolve_signatories(conn: &Connection, html: &str) -> Result<String> {
    let officials = list_officials(conn)?;

    // {{official:role}} — inline name only (e.g. inside a sentence)
    let result = RE_OFFICIAL.replace_all(html, |caps: &regex::Captures| {
        let role = &caps[1];
        match find_official_by_role(&officials, role) {
            Some(o) => escape_html(&official_full_name(o)),
            None => format!(r#"<span style="color:#666;text-decoration:underline;">___{role}___</span>"#),
        }
    });

    let result = RE_SIGNATORY.replace_all(&result, |caps: &regex::Captures| {
        let role = &caps[1];
        match find_official_by_role(&officials, role) {
            Some(o) => {
                let name = official_full_name(o);
                let position = js_tpl(o.get("position"));
                format!(
                    r#"<div style="text-align:center;margin-top:40px;">
        <div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">
          <strong>{}</strong><br/>
          <span style="font-size:10pt;">{}</span>
        </div>
      </div>"#,
                    name.to_uppercase(),
                    position
                )
            }
            // Return placeholder if no official found
            None => format!(
                r#"<div style="text-align:center;margin-top:40px;">
      <div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">
        <strong>_________________________</strong><br/>
        <span style="font-size:10pt;">{role}</span>
      </div>
    </div>"#
            ),
        }
    });
    Ok(result.into_owned())
}

fn resolve_variables(
    conn: &Connection,
    html: &str,
    resident: &Value,
    input_values: Option<&Map<String, Value>>,
    extras: Option<&[(String, String)]>,
) -> Result<String> {
    let full_name = join_truthy(resident, &["first_name", "middle_name", "last_name", "suffix"]);

    let middle_name = or_empty(resident, "middle_name");
    let middle_initial = match middle_name.chars().next() {
        Some(c) => format!("{c}."),
        None => String::new(),
    };

    let mut partner_name = String::new();
    if let Some(pid) = resident.get("partner_id").filter(|v| truthy(v)).and_then(super::as_i64) {
        if let Some(partner) = get_resident_by_id(conn, pid)? {
            partner_name = join_truthy(&partner, &["first_name", "middle_name", "last_name", "suffix"]);
        }
    }

    let birth_date = or_empty(resident, "birth_date");
    let today = Local::now().date_naive();
    let citizenship = match or_empty(resident, "citizenship") {
        s if s.is_empty() => "Filipino".to_string(),
        s => s,
    };

    let mut variables: Vec<(String, String)> = vec![
        ("fullName".into(), full_name),
        ("firstName".into(), or_empty(resident, "first_name")),
        ("middleName".into(), middle_name),
        ("lastName".into(), or_empty(resident, "last_name")),
        ("suffix".into(), or_empty(resident, "suffix")),
        ("middleInitial".into(), middle_initial),
        ("purok".into(), or_empty(resident, "purok")),
        ("address".into(), or_empty(resident, "address")),
        (
            "birthDate".into(),
            if birth_date.is_empty() {
                String::new()
            } else {
                parse_js_date(&birth_date).map(format_date).unwrap_or_else(|| "Invalid Date".into())
            },
        ),
        ("birthPlace".into(), or_empty(resident, "birth_place")),
        ("age".into(), if birth_date.is_empty() { String::new() } else { calculate_age(&birth_date) }),
        ("gender".into(), or_empty(resident, "gender")),
        ("civilStatus".into(), or_empty(resident, "civil_status")),
        ("contactNumber".into(), or_empty(resident, "contact_number")),
        ("email".into(), or_empty(resident, "email")),
        ("occupation".into(), or_empty(resident, "occupation")),
        ("voterStatus".into(), or_empty(resident, "voter_status")),
        ("bloodType".into(), or_empty(resident, "blood_type")),
        ("partnerName".into(), partner_name),
        // New fields
        ("religion".into(), or_empty(resident, "religion")),
        ("citizenship".into(), citizenship),
        ("philsysCardNo".into(), or_empty(resident, "philsys_card_no")),
        ("educationalAttainment".into(), or_empty(resident, "educational_attainment")),
        ("ethnicity".into(), or_empty(resident, "ethnicity")),
        ("laborForceStatus".into(), or_empty(resident, "labor_force_status")),
        ("residencyStatus".into(), or_empty(resident, "residency_status")),
        ("disabilityType".into(), or_empty(resident, "disability_type")),
        ("pwdIdNo".into(), or_empty(resident, "pwd_id_no")),
        // Settings
        ("barangay".into(), setting(conn, "barangay_name")?.unwrap_or_default()),
        ("barangayAddress".into(), setting(conn, "barangay_address")?.unwrap_or_default()),
        ("municipality".into(), setting(conn, "municipality")?.unwrap_or_default()),
        ("province".into(), setting(conn, "province")?.unwrap_or_default()),
        ("date".into(), format_date(today)),
        ("dateOrdinal".into(), format_date_ordinal(today)),
        ("year".into(), today.year().to_string()),
        ("controlNumber".into(), String::new()),
    ];

    // Extra runtime values (e.g. allocated control number, case context) override defaults.
    if let Some(extras) = extras {
        for (k, v) in extras {
            match variables.iter_mut().find(|(key, _)| key == k) {
                Some(slot) => slot.1 = v.clone(),
                None => variables.push((k.clone(), v.clone())),
            }
        }
    }

    // Resolve {{header}} tag
    let mut result = html.replace("{{header}}", &build_header_html(conn)?);

    // Resolve {{input:fieldName}} — replace with provided values or leave placeholder (HTML-escaped)
    result = RE_INPUT
        .replace_all(&result, |caps: &regex::Captures| {
            let field = &caps[1];
            match input_values.and_then(|m| m.get(field)) {
                Some(v) => escape_html(&js_str(v)),
                None => format!(r#"<span style="color:#666;text-decoration:underline;">___{field}___</span>"#),
            }
        })
        .into_owned();

    // Resolve {{signatory:role}} tags
    result = resolve_signatories(conn, &result)?;

    // Resolve standard variables (HTML-escaped to prevent XSS)
    for (key, value) in &variables {
        result = result.replace(&format!("{{{{{key}}}}}"), &escape_html(value));
    }

    Ok(result)
}

fn build_full_html(conn: &Connection, html: &str, paper: &PaperSettings) -> Result<String> {
    let barangay_name = setting(conn, "barangay_name")?.unwrap_or_else(|| "BARANGAY".into());
    let logo = get_logo_base64(conn)?;
    let m = paper.margins;
    let wm = get_watermark_settings(conn)?;

    // Custom documents keep their letterhead as a template marker so it always
    // reflects the current Settings → Barangay header. Resolve it now.
    let mut html = html.to_string();
    if RE_HEADER_TEST.is_match(&html) {
        let header_html = build_header_html(conn)?;
        html = RE_HEADER_CHIP.replace_all(&html, NoExpand(&header_html)).into_owned();
        html = html.replace("{{header}}", &header_html);
    }

    let watermark_content = if !wm.enabled {
        String::new()
    } else if let Some(b64) = &logo {
        format!(r#"<img src="{b64}" class="watermark" />"#)
    } else {
        let mut s = String::new();
        s.push_str(r##"<svg class="watermark" viewBox="0 0 420 420" xmlns="http://www.w3.org/2000/svg">
        <circle cx="210" cy="210" r="195" fill="none" stroke="#1a1a1a" stroke-width="4"/>
        <circle cx="210" cy="210" r="175" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
        <text x="210" y="160" text-anchor="middle" font-size="20" font-family="serif" font-weight="bold" fill="#1a1a1a">REPUBLIC OF THE</text>
        <text x="210" y="185" text-anchor="middle" font-size="20" font-family="serif" font-weight="bold" fill="#1a1a1a">PHILIPPINES</text>
        <text x="210" y="230" text-anchor="middle" font-size="28" font-family="serif" font-weight="bold" fill="#1a1a1a">"##);
        s.push_str(&barangay_name.to_uppercase());
        s.push_str(r##"</text>
        <text x="210" y="270" text-anchor="middle" font-size="14" font-family="serif" fill="#1a1a1a">OFFICIAL DOCUMENT</text>
      </svg>"##);
        s
    };

    let mut s = String::new();
    s.push_str(r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: "#);
    s.push_str(&paper::page_size_css(paper));
    s.push_str("; margin: ");
    s.push_str(&format!(
        "{}in {}in {}in {}in",
        js_num(m.top),
        js_num(m.right),
        js_num(m.bottom),
        js_num(m.left)
    ));
    s.push_str(r#"; }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      position: relative;
    }
    .page-break { page-break-after: always; break-after: page; height: 0; border: none; margin: 0; }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: "#);
    s.push_str(&js_num(wm.opacity));
    s.push_str(r#";
      z-index: -1;
      width: "#);
    s.push_str(&wm.size.to_string());
    s.push_str(r#"px;
      height: "#);
    s.push_str(&wm.size.to_string());
    s.push_str(r#"px;
      pointer-events: none;
      object-fit: contain;
    }
    h1, h2, h3 { margin-top: 0; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #000; padding: 4px 8px; }
    /* Borders hidden in the document editor stay hidden in print */
    table[data-borderless] td, table[data-borderless] th,
    td[data-no-border], th[data-no-border] { border: none !important; }
    img { max-width: 100%; }
    [data-letterhead] img { max-height: 110px; max-width: 240px; object-fit: contain; }
    .pm-page-spacer { display: none; }
  </style>
</head>
<body>
  "#);
    s.push_str(&watermark_content);
    s.push_str("\n  ");
    s.push_str(&html);
    s.push_str(r#"
</body>
</html>"#);
    Ok(s)
}

// Extract {{input:fieldName}} tags from template HTML
fn extract_input_fields(html: &str) -> Vec<String> {
    let mut fields: Vec<String> = Vec::new();
    for caps in RE_INPUT.captures_iter(html) {
        let f = caps[1].to_string();
        if !fields.contains(&f) {
            fields.push(f);
        }
    }
    fields
}

fn paper_from_template(template: &Value) -> PaperSettings {
    paper::parse_paper_json(template.get("paper_json").and_then(|v| v.as_str()))
}

/// `parsePaperJson(paperInput ? JSON.stringify(paperInput) : null)`
fn paper_from_arg(v: &Value) -> PaperSettings {
    if truthy(v) {
        paper::parse_paper_json(Some(&v.to_string()))
    } else {
        paper::parse_paper_json(None)
    }
}

fn content_html(template: &Value) -> String {
    js_tpl(template.get("content_html"))
}

// ─── Handlers ───────────────────────────────────────────────────────────────

// Get input fields required by a template
fn get_input_fields(a: &Args) -> HResult {
    let conn = db::conn();
    let template = match a.opt_i64(0) {
        Some(id) => get_template_by_id(&conn, id)?,
        None => None,
    };
    let Some(template) = template else {
        return Ok(json!([]));
    };
    Ok(json!(extract_input_fields(&content_html(&template))))
}

fn generate(a: &Args) -> HResult {
    let user_id = auth::current_user_id();
    let conn = db::conn();
    let template = match a.opt_i64(0) {
        Some(id) => get_template_by_id(&conn, id)?,
        None => None,
    };
    let Some(template) = template else {
        return Ok(fail("Template not found"));
    };

    let resident = match a.opt_i64(1) {
        Some(id) => get_resident_by_id(&conn, id)?,
        None => None,
    };
    let Some(resident) = resident else {
        return Ok(fail("Resident not found"));
    };

    let html = content_html(&template);
    let template_name = js_tpl(template.get("name"));

    // Allocate a control number only if the template opts in with {{controlNumber}}.
    let mut control_number: Option<String> = None;
    if html.contains("{{controlNumber}}") {
        control_number = Some(next_control_number(&conn, &template_name)?);
    }

    let extras: Option<Vec<(String, String)>> =
        control_number.as_ref().map(|c| vec![("controlNumber".to_string(), c.clone())]);
    let input_values = a.raw(2).as_object();
    let resolved_html = resolve_variables(&conn, &html, &resident, input_values, extras.as_deref())?;

    let mut data = Map::new();
    data.insert("template_id".into(), a.val(0));
    data.insert("resident_id".into(), a.val(1));
    data.insert("content_html".into(), Value::String(resolved_html.clone()));
    data.insert("generated_by".into(), json!(user_id.unwrap_or(0)));
    data.insert("control_number".into(), json!(control_number));
    let report_id = create_generated_report(&conn, &data)?;

    log_audit(
        &conn,
        user_id,
        "REPORT_GENERATED",
        Some(&format!(
            "Generated \"{}\" for {} {}",
            template_name,
            js_tpl(resident.get("first_name")),
            js_tpl(resident.get("last_name"))
        )),
    )?;

    Ok(json!({
        "success": true,
        "html": resolved_html,
        "reportId": report_id,
        "paper": paper_from_template(&template),
    }))
}

// RBI Form C — statutory semestral summary. Counts injected as {{count:*}} variables
// into an editable seeded template; boilerplate/wording stays user-editable.
fn generate_form_c(a: &Args) -> HResult {
    let conn = db::conn();
    let Some(template) = get_template_by_name(&conn, "RBI Form C (Semestral Summary)")? else {
        return Ok(fail("RBI Form C template not found"));
    };

    let counts = get_rbi_form_c_counts(&conn)?;
    let mut extras: Vec<(String, String)> = Vec::new();
    if let Some(m) = counts.as_object() {
        for (k, v) in m {
            extras.push((format!("count:{k}"), js_str(v)));
        }
    }

    let empty = Value::Object(Map::new());
    let html = resolve_variables(&conn, &content_html(&template), &empty, a.raw(0).as_object(), Some(&extras))?;
    // Any {{count:*}} the template references but we didn't compute → show 0.
    let html = RE_COUNT.replace_all(&html, "0").into_owned();

    Ok(json!({ "success": true, "html": html, "paper": paper_from_template(&template), "counts": counts }))
}

// Export the RBI Form C counts as an Excel workbook (report data, not just PDF).
fn export_form_c_xlsx() -> HResult {
    match export_form_c_xlsx_inner() {
        Ok(v) => Ok(v),
        Err(e) => Ok(fail(e)),
    }
}

fn export_form_c_xlsx_inner() -> Result<Value> {
    let counts = {
        let conn = db::conn();
        get_rbi_form_c_counts(&conn)?
    };
    let labels: &[(&str, &str)] = &[
        ("total", "Total Population"),
        ("male", "Male"),
        ("female", "Female"),
        ("households", "Households"),
        ("children", "Children (0-14)"),
        ("youth", "Youth (15-30)"),
        ("adults", "Adults (31-59)"),
        ("seniors", "Senior Citizens (60+)"),
        ("seniorsMale", "Seniors - Male"),
        ("seniorsFemale", "Seniors - Female"),
        ("pwd", "PWD"),
        ("soloParents", "Solo Parents"),
        ("osy", "Out-of-School Youth"),
        ("ofw", "OFW"),
        ("ip", "Indigenous People"),
        ("indigent", "Indigent"),
        ("fourps", "4Ps Beneficiaries"),
        ("voters", "Registered Voters"),
    ];
    let mut wb = Workbook::new();
    let bold = Format::new().set_bold();
    {
        let ws = wb.add_worksheet();
        ws.set_name("RBI Form C")?;
        ws.set_row_format(0, &bold)?;
        ws.write_string_with_format(0, 0, "Indicator", &bold)?;
        ws.write_string_with_format(0, 1, "Count", &bold)?;
        if let Some(m) = counts.as_object() {
            for (i, (k, v)) in m.iter().enumerate() {
                let label = labels.iter().find(|(key, _)| key == k).map(|(_, l)| *l).unwrap_or(k.as_str());
                let row = (i + 1) as u32;
                ws.write_string(row, 0, label)?;
                ws.write_number(row, 1, v.as_f64().unwrap_or(0.0))?;
            }
        }
        ws.set_column_width(0, 28)?;
        ws.set_column_width(1, 28)?;
    }

    let buffer = wb.save_to_buffer()?;
    let save = dialogs::save_file(&DialogOptions::new(
        "Export RBI Form C (Excel)",
        "RBI_Form_C.xlsx",
        &[("Excel Workbook", &["xlsx"])],
    ));
    let Some(path) = save else {
        return Ok(fail("Save cancelled"));
    };
    std::fs::write(&path, buffer)?;
    Ok(json!({ "success": true, "path": path.to_string_lossy() }))
}

/// Render → PDF, then ask where to save it (the TS rendered before the dialog too).
async fn render_and_save_pdf(full_html: String, opts: PdfOptions, title: &str, default_path: &str) -> Result<Value> {
    let pdf_buffer = html_to_pdf_async(full_html, opts).await?;

    let save = dialogs::save_file(&DialogOptions::new(title, default_path, &[("PDF", &["pdf"])]));
    let Some(path) = save else {
        return Ok(fail("Save cancelled"));
    };

    std::fs::write(&path, pdf_buffer)?;
    Ok(json!({ "success": true, "path": path.to_string_lossy() }))
}

async fn export_pdf(a: &Args) -> HResult {
    let res: Result<Value> = async {
        let paper = paper_from_arg(a.raw(2));
        let full_html = {
            let conn = db::conn();
            build_full_html(&conn, &js_tpl(a.0.first()), &paper)?
        };
        let filename = js_tpl(a.0.get(1));
        render_and_save_pdf(full_html, paper::pdf_options(&paper), "Save PDF", &format!("{filename}.pdf")).await
    }
    .await;
    Ok(res.unwrap_or_else(fail))
}

fn print(a: &Args) -> HResult {
    let res: Result<Value> = (|| {
        let paper = paper_from_arg(a.raw(1));
        let conn = db::conn();
        let full_html = build_full_html(&conn, &js_tpl(a.0.first()), &paper)?;
        // Printed by the renderer bridge (replaces webContents.print with the OS dialog).
        Ok(json!({ "success": true, "__print_html": full_html }))
    })();
    Ok(res.unwrap_or_else(fail))
}

// Multi-template generate: generate multiple templates for one resident
fn generate_multi(a: &Args) -> HResult {
    let template_ids: Vec<Value> = a.get(0)?;
    let user_id = auth::current_user_id();
    let conn = db::conn();
    let resident = match a.opt_i64(1) {
        Some(id) => get_resident_by_id(&conn, id)?,
        None => None,
    };
    let Some(resident) = resident else {
        return Ok(fail("Resident not found"));
    };

    let mut results: Vec<Value> = Vec::new();

    for tid in &template_ids {
        let Some(id) = super::as_i64(tid) else { continue };
        let Some(template) = get_template_by_id(&conn, id)? else { continue };
        let resolved_html = resolve_variables(&conn, &content_html(&template), &resident, None, None)?;
        let mut data = Map::new();
        data.insert("template_id".into(), tid.clone());
        data.insert("resident_id".into(), a.val(1));
        data.insert("content_html".into(), Value::String(resolved_html.clone()));
        data.insert("generated_by".into(), json!(user_id.unwrap_or(0)));
        create_generated_report(&conn, &data)?;
        results.push(json!({
            "templateName": template.get("name").cloned().unwrap_or(Value::Null),
            "html": resolved_html,
            "paper": paper_from_template(&template),
        }));
    }

    log_audit(
        &conn,
        user_id,
        "REPORT_BATCH_GENERATED",
        Some(&format!(
            "Generated {} reports for {} {}",
            results.len(),
            js_tpl(resident.get("first_name")),
            js_tpl(resident.get("last_name"))
        )),
    )?;

    Ok(json!({ "success": true, "reports": results }))
}

// Export multi-page PDF (each template on its own page)
async fn export_multi_pdf(a: &Args) -> HResult {
    let res: Result<Value> = async {
        let paper = paper_from_arg(a.raw(2));
        let html_pages = a.raw(0).as_array().ok_or_else(|| anyhow!("htmlPages.map is not a function"))?;

        let combined_html = html_pages
            .iter()
            .enumerate()
            .map(|(i, html)| {
                let page_break = if i < html_pages.len() - 1 { "page-break-after: always;" } else { "" };
                format!(r#"<div style="{page_break}">{}</div>"#, js_str(html))
            })
            .collect::<Vec<_>>()
            .join("\n");

        let full_html = {
            let conn = db::conn();
            build_full_html(&conn, &combined_html, &paper)?
        };
        let filename = js_tpl(a.0.get(1));
        render_and_save_pdf(full_html, paper::pdf_options(&paper), "Save PDF", &format!("{filename}.pdf")).await
    }
    .await;
    Ok(res.unwrap_or_else(fail))
}

// ─── List prints ────────────────────────────────────────────────────────────

// Shared table CSS for all list prints
const LIST_TABLE_CSS: &str = r#"
    @page { size: A4; margin: 0.75in 0.75in 1in 0.75in; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    .header { text-align: center; margin-bottom: 24px; }
    .header p { margin: 2px 0; font-size: 9pt; color: #666; }
    .header h2 { margin: 6px 0 2px; font-size: 16pt; font-weight: 700; letter-spacing: 0.5px; }
    .header h3 { margin: 2px 0 0; font-size: 11pt; font-weight: 600; color: #444; }
    .custom-header { margin-bottom: 20px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    thead th {
      background: #f8f9fa;
      font-weight: 600;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #555;
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
      text-align: left;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #ddd;
      color: #333;
    }
    tbody tr.alt { background: #fafbfc; }
    .row-num {
      text-align: center;
      color: #999;
      font-size: 8pt;
      width: 30px;
    }
    .summary {
      margin-top: 16px;
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #ddd;
      padding-top: 8px;
    }
    .group-title { text-align: center; margin-bottom: 16px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
    .group-title h3 { margin: 0 0 4px; font-size: 12pt; font-weight: 600; color: #222; text-transform: uppercase; letter-spacing: 0.5px; }
    .group-label { font-size: 14pt; font-weight: 700; color: #111; }
    .group-count { font-size: 10pt; font-weight: 400; color: #666; }
    .group-summary {
      margin-top: 12px;
      font-size: 9pt;
      color: #666;
      text-align: right;
      font-style: italic;
    }
  "#;

// Electron used A4 portrait with custom margins and a "Page X of Y" footer
// (displayHeaderFooter). `utils::pdf` has no header/footer template support,
// so the page-number footer is not rendered.
fn list_pdf_options() -> PdfOptions {
    PdfOptions {
        paper_width_in: 8.27,
        paper_height_in: 11.69,
        landscape: false,
        print_background: true,
        margins_in: Some((0.5, 0.8, 0.5, 0.5)),
        prefer_css_page_size: false,
        header_template: Some("<span></span>".into()),
        footer_template: Some(r#"<div style="width:100%;text-align:center;font-size:8px;color:#999;font-family:sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>"#.into()),
    }
}

// Helper: generate PDF buffer or print directly
async fn generate_list_pdf(html: String, mode: &str, default_filename: &str) -> Result<Value> {
    if mode == "print" {
        return Ok(json!({ "success": true, "__print_html": html }));
    }
    // Download mode
    render_and_save_pdf(html, list_pdf_options(), "Save List PDF", default_filename).await
}

struct ListCommon {
    barangay_name: String,
    municipality: String,
    province: String,
    watermark: String,
}

fn list_common(conn: &Connection) -> Result<ListCommon> {
    let barangay_name = setting(conn, "barangay_name")?.unwrap_or_else(|| "BARANGAY".into());
    let municipality = setting(conn, "municipality")?.unwrap_or_default();
    let province = setting(conn, "province")?.unwrap_or_default();
    let logo = get_logo_base64(conn)?;

    let wm = get_watermark_settings(conn)?;
    let watermark = match (&logo, wm.enabled) {
        (Some(b64), true) => format!(
            r#"<img src="{b64}" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);opacity:{};width:{}px;height:{}px;object-fit:contain;z-index:-1;pointer-events:none;" />"#,
            js_num(wm.opacity),
            wm.size,
            wm.size
        ),
        _ => String::new(),
    };
    Ok(ListCommon { barangay_name, municipality, province, watermark })
}

fn arr<'a>(obj: &'a Map<String, Value>, key: &str) -> Result<&'a Vec<Value>> {
    match obj.get(key) {
        Some(Value::Array(v)) => Ok(v),
        Some(_) => Err(anyhow!("options.{key}.map is not a function")),
        None => Err(anyhow!("Cannot read properties of undefined (reading 'map')")),
    }
}

fn table_headers(columns: &[Value]) -> String {
    columns.iter().map(|c| format!("<th>{}</th>", js_tpl(c.get("label")))).collect()
}

fn table_rows(rows: &[Value], columns: &[Value]) -> String {
    rows.iter()
        .enumerate()
        .map(|(i, row)| {
            let cells: String = columns
                .iter()
                .map(|c| {
                    let key = js_tpl(c.get("key"));
                    let cell = match row.get(&key) {
                        Some(v) if !v.is_null() => js_str(v),
                        _ => "-".to_string(),
                    };
                    format!("<td>{cell}</td>")
                })
                .collect();
            let class = if i % 2 == 1 { "alt" } else { "" };
            format!(r#"<tr class="{class}"><td class="row-num">{}</td>{cells}</tr>"#, i + 1)
        })
        .collect()
}

fn opt_string(obj: &Map<String, Value>, key: &str) -> String {
    js_tpl(obj.get(key))
}

// Print resident list as table
async fn print_list(a: &Args) -> HResult {
    let res: Result<Value> = async {
        let options = a.obj(0);
        let common = {
            let conn = db::conn();
            list_common(&conn)?
        };

        let columns = arr(&options, "columns")?;
        let rows = arr(&options, "rows")?;
        let headers = table_headers(columns);
        let body_rows = table_rows(rows, columns);
        let title = opt_string(&options, "title");

        let header_part = if options.is_truthy("headerHtml") {
            format!(r#"<div class="custom-header">{}</div>"#, opt_string(&options, "headerHtml"))
        } else {
            let mut h = String::new();
            h.push_str(r#"
  <div class="header">
    <p>Republic of the Philippines</p>
    <p>"#);
            h.push_str(&common.municipality);
            if !common.province.is_empty() {
                h.push_str(", ");
                h.push_str(&common.province);
            }
            h.push_str(r#"</p>
    <h2>"#);
            h.push_str(&common.barangay_name);
            h.push_str(r#"</h2>
    <h3>"#);
            h.push_str(&title);
            h.push_str(r#"</h3>
  </div>"#);
            h
        };

        let mut full_html = String::new();
        full_html.push_str(r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>"#);
        full_html.push_str(LIST_TABLE_CSS);
        full_html.push_str(r#"</style>
</head>
<body>
  "#);
        full_html.push_str(&common.watermark);
        full_html.push_str("\n  ");
        full_html.push_str(&header_part);
        full_html.push_str(r#"
  <table>
    <thead><tr><th class="row-num">#</th>"#);
        full_html.push_str(&headers);
        full_html.push_str(r#"</tr></thead>
    <tbody>"#);
        full_html.push_str(&body_rows);
        full_html.push_str(r#"</tbody>
  </table>
  <div class="summary">Total: <strong>"#);
        full_html.push_str(&rows.len().to_string());
        full_html.push_str(r#"</strong> records</div>
</body>
</html>"#);

        let filename = format!("{}.pdf", safe_filename(&title));
        let mode = options.get("mode").filter(|v| truthy(v)).map(js_str).unwrap_or_else(|| "download".into());
        generate_list_pdf(full_html, &mode, &filename).await
    }
    .await;
    Ok(res.unwrap_or_else(fail))
}

// Print grouped resident list — each group on a fresh page
async fn print_grouped_list(a: &Args) -> HResult {
    let res: Result<Value> = async {
        let options = a.obj(0);
        let common = {
            let conn = db::conn();
            list_common(&conn)?
        };

        let columns = arr(&options, "columns")?;
        let headers = table_headers(columns);
        let title = opt_string(&options, "title");

        let header_block = if options.is_truthy("headerHtml") {
            format!(r#"<div class="custom-header">{}</div>"#, opt_string(&options, "headerHtml"))
        } else {
            let mut h = String::new();
            h.push_str(r#"<div class="header">
            <p>Republic of the Philippines</p>
            <p>"#);
            h.push_str(&common.municipality);
            if !common.province.is_empty() {
                h.push_str(", ");
                h.push_str(&common.province);
            }
            h.push_str(r#"</p>
            <h2>"#);
            h.push_str(&common.barangay_name);
            h.push_str(r#"</h2>
          </div>"#);
            h
        };

        let groups = arr(&options, "groups")?;
        let mut pages: Vec<String> = Vec::with_capacity(groups.len());
        for (group_idx, group) in groups.iter().enumerate() {
            let rows: &[Value] = match group.get("rows") {
                Some(Value::Array(v)) => v,
                _ => return Err(anyhow!("Cannot read properties of undefined (reading 'map')")),
            };
            let body_rows = table_rows(rows, columns);
            let page_break = if group_idx < groups.len() - 1 { "page-break-after: always;" } else { "" };
            let label = js_tpl(group.get("groupLabel"));
            let n = rows.len();

            let mut p = String::new();
            p.push_str(r#"
          <div class="group-page" style=""#);
            p.push_str(page_break);
            p.push_str(r#"">
            "#);
            p.push_str(&header_block);
            p.push_str(r#"
            <div class="group-title">
              <h3>"#);
            p.push_str(&title);
            p.push_str(r#"</h3>
              <div class="group-label">"#);
            p.push_str(&label);
            p.push_str(r#" <span class="group-count">("#);
            p.push_str(&n.to_string());
            p.push_str(r#" records)</span></div>
            </div>
            <table>
              <thead><tr><th class="row-num">#</th>"#);
            p.push_str(&headers);
            p.push_str(r#"</tr></thead>
              <tbody>"#);
            p.push_str(&body_rows);
            p.push_str(r#"</tbody>
            </table>
            <div class="group-summary">"#);
            p.push_str(&n.to_string());
            p.push_str(r#" records in this group</div>
          </div>"#);
            pages.push(p);
        }
        let group_pages = pages.join("\n");

        let mut full_html = String::new();
        full_html.push_str(r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>"#);
        full_html.push_str(LIST_TABLE_CSS);
        full_html.push_str(r#"</style>
</head>
<body>
  "#);
        full_html.push_str(&common.watermark);
        full_html.push_str("\n  ");
        full_html.push_str(&group_pages);
        full_html.push_str(r#"
</body>
</html>"#);

        let filename = format!(
            "{}_by_{}.pdf",
            safe_filename(&title),
            safe_filename(&opt_string(&options, "groupByLabel"))
        );
        let mode = options.get("mode").filter(|v| truthy(v)).map(js_str).unwrap_or_else(|| "download".into());
        generate_list_pdf(full_html, &mode, &filename).await
    }
    .await;
    Ok(res.unwrap_or_else(fail))
}
