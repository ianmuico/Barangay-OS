//! Admin-side handlers from `main/ipc/database.ts`: users, templates,
//! generated reports, settings, mobile API clients / app roles / app users,
//! audit, file operations, log + analytics export, and the Danger Zone.

use super::auth::{current_user, require_admin, require_auth};
use super::{fail, truthy, Args, HResult, ObjExt};
use crate::db::{
    self,
    queries::{analytics, api_clients, app_auth, audit::log_audit, reports, residents, settings, templates, users},
};
use crate::utils::dialogs::{self, DialogOptions};
use crate::utils::hash::{hash_password, verify_password};
use anyhow::{anyhow, bail, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::Rng;
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};

// ─── Small JS-compat helpers ────────────────────────────────────────────────

/// How a value prints inside a JS template literal (`${x}`).
fn js_disp(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => match n.as_f64() {
            Some(f) if n.as_i64().is_none() && f.fract() == 0.0 && f.abs() < 1e21 => format!("{}", f as i64),
            _ => n.to_string(),
        },
        Some(other) => other.to_string(),
    }
}

/// `data.key.trim()` on a missing key throws in JS.
fn need_str(v: Option<String>) -> Result<String> {
    v.ok_or_else(|| anyhow!("Cannot read properties of undefined (reading 'trim')"))
}

/// Node's `path.extname` (includes the dot; `""` when none / dotfile).
fn extname(p: &str) -> String {
    Path::new(p).extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default()
}

/// Node's `path.resolve` — absolute and lexically normalized (`..` removed).
fn resolve_path(p: &str) -> PathBuf {
    let raw = PathBuf::from(p);
    let abs = if raw.is_absolute() {
        raw
    } else {
        std::env::current_dir().unwrap_or_default().join(raw)
    };
    let mut out = PathBuf::new();
    for comp in abs.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn image_mime(path: &str) -> String {
    let ext = extname(path).to_lowercase().replacen('.', "", 1);
    match ext.as_str() {
        "png" => "image/png".into(),
        "jpg" | "jpeg" => "image/jpeg".into(),
        _ => format!("image/{ext}"),
    }
}

fn data_url(path: &str) -> Result<Value> {
    let data = fs::read(path)?;
    Ok(Value::from(format!("data:{};base64,{}", image_mime(path), B64.encode(data))))
}

fn today_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

fn non_empty(v: Option<String>) -> Option<String> {
    v.filter(|s| !s.is_empty())
}

// ─── Users (admin-only for create/delete/reset) ─────────────────────────────

fn users_list() -> HResult {
    require_admin()?;
    let conn = db::conn();
    Ok(json!(users::list_users(&conn)?))
}

fn users_create(a: &Args) -> HResult {
    let user = require_admin()?;
    let data = a.obj(0);
    let password = data
        .s("password")
        .ok_or_else(|| anyhow!("Illegal arguments: undefined, number"))?;
    let hash = hash_password(&password);
    let username = data.s("username").unwrap_or_default();
    let role = data.s("role").unwrap_or_default();
    let full_name = data.s("full_name");
    let conn = db::conn();
    let id = users::create_user(&conn, &username, &hash, &role, full_name.as_deref())?;
    log_audit(&conn, Some(user.id), "USER_CREATED", Some(&format!("Created user: {}", js_disp(data.get("username")))))?;
    Ok(json!(id))
}

fn users_update(a: &Args) -> HResult {
    require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    users::update_user(&conn, id, &a.obj(1))?;
    Ok(json!({ "success": true }))
}

fn users_delete(a: &Args) -> HResult {
    let user = require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    let target = users::get_user_by_id(&conn, id)?;
    users::delete_user(&conn, id)?;
    let name = target.map(|t| t.username).unwrap_or_else(|| "undefined".into());
    log_audit(&conn, Some(user.id), "USER_DELETED", Some(&format!("Deleted user: {name}")))?;
    Ok(json!({ "success": true }))
}

fn users_update_password(a: &Args) -> HResult {
    require_auth()?;
    let id = a.i64(0)?;
    let old_password = a.opt_str(1).unwrap_or_default();
    let new_password = a.opt_str(2).unwrap_or_default();
    let conn = db::conn();
    let Some(user) = users::get_user_by_id(&conn, id)? else {
        return Ok(fail("User not found"));
    };

    if !verify_password(&old_password, &user.password_hash) {
        return Ok(fail("Current password is incorrect"));
    }

    let hash = hash_password(&new_password);
    users::update_password(&conn, id, &hash)?;
    Ok(json!({ "success": true }))
}

// Admin reset password (no old password required — admin-only)
fn users_reset_password(a: &Args) -> HResult {
    require_admin()?;
    let id = a.i64(0)?;
    let hash = hash_password(&a.opt_str(1).unwrap_or_default());
    let conn = db::conn();
    users::update_password(&conn, id, &hash)?;
    Ok(json!({ "success": true }))
}

// ─── Templates ──────────────────────────────────────────────────────────────

fn templates_list() -> HResult {
    let conn = db::conn();
    Ok(json!(templates::list_templates(&conn)?))
}

fn templates_get(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(templates::get_template_by_id(&conn, id)?))
}

fn templates_create(a: &Args) -> HResult {
    let user = current_user();
    let mut data = a.obj(0);
    data.insert("created_by".into(), user.map(|u| Value::from(u.id)).filter(truthy).unwrap_or(Value::Null));
    let conn = db::conn();
    Ok(json!(templates::create_template(&conn, &data)?))
}

fn templates_update(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    templates::update_template(&conn, id, &a.obj(1))?;
    Ok(json!({ "success": true }))
}

fn templates_delete(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    templates::delete_template(&conn, id)?;
    Ok(json!({ "success": true }))
}

// ─── Generated Reports ──────────────────────────────────────────────────────

fn reports_list(a: &Args) -> HResult {
    let resident_id = a.opt_i64(0);
    let conn = db::conn();
    Ok(json!(reports::list_generated_reports(&conn, resident_id)?))
}

// Custom/case documents: explicit saves AND every print/export is kept.
// Pass `id` to update an existing saved document in place.
fn reports_save_doc(a: &Args) -> HResult {
    let user_id = current_user().map(|u| u.id).filter(|id| *id != 0);
    let data = a.obj(0);
    let conn = db::conn();
    if data.is_truthy("id") {
        let id = data.i("id").ok_or_else(|| anyhow!("Invalid document id"))?;
        let mut upd = Map::new();
        for key in ["title", "content_html"] {
            if let Some(v) = data.get(key) {
                upd.insert(key.into(), v.clone());
            }
        }
        reports::update_generated_report(&conn, id, &upd)?;
        return Ok(data.get("id").cloned().unwrap_or(Value::Null));
    }
    let mut rec = Map::new();
    rec.insert("case_id".into(), data.get("case_id").cloned().unwrap_or(Value::Null));
    rec.insert("resident_id".into(), data.get("resident_id").cloned().unwrap_or(Value::Null));
    rec.insert("business_id".into(), data.get("business_id").cloned().unwrap_or(Value::Null));
    rec.insert("title".into(), data.get("title").cloned().unwrap_or(Value::Null));
    rec.insert("content_html".into(), data.get("content_html").cloned().unwrap_or(Value::Null));
    rec.insert("generated_by".into(), Value::from(user_id.unwrap_or(0)));
    let id = reports::create_generated_report(&conn, &rec)?;
    log_audit(&conn, user_id, "DOCUMENT_SAVED", Some(&format!("Saved \"{}\"", js_disp(data.get("title")))))?;
    Ok(json!(id))
}

// Back-compat alias
fn reports_save_case_doc(a: &Args) -> HResult {
    let user_id = current_user().map(|u| u.id).filter(|id| *id != 0);
    let data = a.obj(0);
    let conn = db::conn();
    let mut rec = Map::new();
    rec.insert("case_id".into(), data.get("case_id").cloned().unwrap_or(Value::Null));
    rec.insert("title".into(), data.get("title").cloned().unwrap_or(Value::Null));
    rec.insert("content_html".into(), data.get("content_html").cloned().unwrap_or(Value::Null));
    rec.insert("generated_by".into(), Value::from(user_id.unwrap_or(0)));
    let id = reports::create_generated_report(&conn, &rec)?;
    log_audit(&conn, user_id, "CASE_DOC_SAVED", Some(&format!("Saved \"{}\"", js_disp(data.get("title")))))?;
    Ok(json!(id))
}

fn reports_get(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(reports::get_generated_report_by_id(&conn, id)?))
}

fn reports_delete(a: &Args) -> HResult {
    let user = require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    reports::delete_generated_report(&conn, id)?;
    log_audit(&conn, Some(user.id).filter(|i| *i != 0), "DOCUMENT_DELETED", Some(&format!("Deleted generated document #{id}")))?;
    Ok(json!({ "success": true }))
}

fn reports_void(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let user_id = current_user().map(|u| u.id).filter(|i| *i != 0);
    let conn = db::conn();
    reports::void_generated_report(&conn, id)?;
    log_audit(&conn, user_id, "DOCUMENT_VOIDED", Some(&format!("Voided issued document #{id}")))?;
    Ok(json!({ "success": true }))
}

fn reports_list_docs(a: &Args) -> HResult {
    let conn = db::conn();
    reports::list_documents(&conn, &a.obj(0))
}

fn reports_list_by_case(a: &Args) -> HResult {
    let case_id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(reports::list_case_documents(&conn, case_id)?))
}

// Storage failsafe for generated documents
fn reports_storage_stats() -> HResult {
    let conn = db::conn();
    reports::get_report_storage_stats(&conn)
}

fn reports_cleanup(a: &Args) -> HResult {
    let user = require_admin()?;
    let days = a.f64(0).ok_or_else(|| anyhow!("Argument 0 must be a number"))?;
    let conn = db::conn();
    let deleted = reports::cleanup_generated_reports(&conn, days.floor() as i64)?;
    log_audit(
        &conn,
        Some(user.id).filter(|i| *i != 0),
        "REPORTS_CLEANED",
        Some(&format!("Deleted {deleted} generated documents older than {} days", js_disp(Some(a.raw(0))))),
    )?;
    Ok(json!({ "success": true, "deleted": deleted }))
}

// ─── Settings ───────────────────────────────────────────────────────────────

fn settings_get(a: &Args) -> HResult {
    let key = a.opt_str(0).unwrap_or_default();
    let conn = db::conn();
    Ok(json!(settings::get_setting(&conn, &key)?))
}

fn settings_set(a: &Args) -> HResult {
    let key = a.val(0);
    let value = a.val(1);
    let conn = db::conn();
    // Same statement as settings::set_setting, but binds the renderer value
    // as-is (better-sqlite3 accepted numbers / null here too).
    db::run(&conn, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", vec![key, value])?;
    Ok(json!({ "success": true }))
}

fn settings_get_all() -> HResult {
    let conn = db::conn();
    Ok(Value::Object(settings::get_all_settings(&conn)?))
}

// ─── Mobile API clients (per-device keys) — admin only ──────────────────────

fn apiclients_list() -> HResult {
    require_admin()?;
    let conn = db::conn();
    Ok(json!(api_clients::list_api_clients(&conn)?))
}

fn apiclients_create(a: &Args) -> HResult {
    let user = require_admin()?;
    let name = need_str(a.opt_str(0))?;
    let conn = db::conn();
    let created = api_clients::create_api_client(&conn, &name)?;
    log_audit(&conn, Some(user.id), "API_CLIENT_CREATED", Some(&format!("Issued mobile device key: {name}")))?;
    Ok(created) // { id, token } — token shown once
}

fn apiclients_set_active(a: &Args) -> HResult {
    require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    api_clients::set_api_client_active(&conn, id, a.truthy(1))?;
    Ok(json!({ "success": true }))
}

fn apiclients_delete(a: &Args) -> HResult {
    let user = require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    api_clients::delete_api_client(&conn, id)?;
    log_audit(&conn, Some(user.id), "API_CLIENT_DELETED", Some(&format!("Revoked mobile device key #{id}")))?;
    Ok(json!({ "success": true }))
}

// ─── Mobile App: dynamic roles (admin only) ─────────────────────────────────

fn approles_list() -> HResult {
    require_admin()?;
    let conn = db::conn();
    Ok(json!(app_auth::list_roles(&conn)?))
}

fn approles_create(a: &Args) -> HResult {
    let u = require_admin()?;
    let name = need_str(a.opt_str(0))?;
    let conn = db::conn();
    let id = app_auth::create_role(&conn, &name, &a.obj(1))?;
    log_audit(&conn, Some(u.id), "APP_ROLE_CREATED", Some(&format!("Created app role: {name}")))?;
    Ok(json!(id))
}

fn approles_update(a: &Args) -> HResult {
    require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    app_auth::update_role(&conn, id, &a.obj(1))?;
    Ok(json!({ "success": true }))
}

fn approles_delete(a: &Args) -> HResult {
    require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    app_auth::delete_role(&conn, id)
}

// ─── Mobile App: users (admin only; passwords are revealable) ───────────────

fn appusers_list() -> HResult {
    require_admin()?;
    let conn = db::conn();
    Ok(json!(app_auth::list_app_users(&conn)?))
}

fn appusers_create(a: &Args) -> HResult {
    let u = require_admin()?;
    let data = a.obj(0);
    let conn = db::conn();
    let id = app_auth::create_app_user(&conn, &data)?;
    log_audit(&conn, Some(u.id), "APP_USER_CREATED", Some(&format!("Created mobile user: {}", js_disp(data.get("username")))))?;
    Ok(json!(id))
}

fn appusers_update(a: &Args) -> HResult {
    require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    app_auth::update_app_user(&conn, id, &a.obj(1))?;
    Ok(json!({ "success": true }))
}

fn appusers_delete(a: &Args) -> HResult {
    let u = require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    app_auth::delete_app_user(&conn, id)?;
    log_audit(&conn, Some(u.id), "APP_USER_DELETED", Some(&format!("Deleted mobile user #{id}")))?;
    Ok(json!({ "success": true }))
}

fn appusers_reveal_password(a: &Args) -> HResult {
    let u = require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    log_audit(&conn, Some(u.id), "APP_USER_PASSWORD_VIEWED", Some(&format!("Viewed password for mobile user #{id}")))?;
    Ok(json!(app_auth::reveal_app_user_password(&conn, id)?))
}

// ─── Audit ──────────────────────────────────────────────────────────────────

fn audit_list(a: &Args) -> HResult {
    let limit = a.opt_i64(0).unwrap_or(-1);
    let conn = db::conn();
    Ok(json!(crate::db::queries::audit::get_audit_log(&conn, limit)?))
}

// ─── File operations ────────────────────────────────────────────────────────

fn dialog_options(a: &Args) -> Result<DialogOptions> {
    Ok(a.get::<Option<DialogOptions>>(0)?.unwrap_or_default())
}

fn dialog_open_file(a: &Args) -> HResult {
    Ok(dialogs::open_dialog_json(&dialog_options(a)?))
}

fn dialog_save_file(a: &Args) -> HResult {
    Ok(dialogs::save_dialog_json(&dialog_options(a)?))
}

fn file_save_avatar(a: &Args) -> HResult {
    let user_id = a.i64(0)?;
    let source_path = a.str(1)?;
    let avatars_dir = crate::utils::paths::user_data().join("avatars");
    if !avatars_dir.exists() {
        fs::create_dir_all(&avatars_dir)?;
    }
    let dest_path = avatars_dir.join(format!("user_{user_id}{}", extname(&source_path)));
    fs::copy(&source_path, &dest_path)?;
    let dest = dest_path.to_string_lossy().into_owned();
    let mut data = Map::new();
    data.insert("avatar_path".into(), Value::from(dest.clone()));
    let conn = db::conn();
    users::update_user(&conn, user_id, &data)?;
    Ok(Value::from(dest))
}

fn file_save_resident_photo(a: &Args) -> HResult {
    let resident_id = a.i64(0)?;
    let source_path = a.str(1)?;
    let photos_dir = crate::utils::paths::user_data().join("photos");
    if !photos_dir.exists() {
        fs::create_dir_all(&photos_dir)?;
    }
    let dest_path = photos_dir.join(format!("resident_{resident_id}{}", extname(&source_path)));
    fs::copy(&source_path, &dest_path)?;
    let dest = dest_path.to_string_lossy().into_owned();
    let mut data = Map::new();
    data.insert("photo_path".into(), Value::from(dest.clone()));
    let conn = db::conn();
    residents::update_resident(&conn, resident_id, &data, None)?;
    Ok(Value::from(dest))
}

// Read an image stored by the app and return it as a data URL for display.
// Restricted to the app's data folder so arbitrary files can't be read.
fn file_get_image_base64(a: &Args) -> HResult {
    let Some(image_path) = non_empty(a.opt_str(0)) else { return Ok(Value::Null) };
    let resolved = resolve_path(&image_path);
    let user_data = crate::utils::paths::user_data();
    let prefix = format!("{}{}", user_data.to_string_lossy(), std::path::MAIN_SEPARATOR);
    let resolved_str = resolved.to_string_lossy().into_owned();
    if !resolved_str.starts_with(&prefix) {
        return Ok(Value::Null);
    }
    if !resolved.exists() {
        return Ok(Value::Null);
    }
    data_url(&resolved_str)
}

// ─── Barangay Logo ──────────────────────────────────────────────────────────

fn file_save_logo(a: &Args) -> HResult {
    let source_path = a.str(0)?;
    let logo_dir = crate::utils::paths::user_data().join("assets");
    if !logo_dir.exists() {
        fs::create_dir_all(&logo_dir)?;
    }
    let dest_path = logo_dir.join(format!("barangay_logo{}", extname(&source_path)));
    fs::copy(&source_path, &dest_path)?;
    let dest = dest_path.to_string_lossy().into_owned();
    let conn = db::conn();
    settings::set_setting(&conn, "barangay_logo_path", &dest)?;
    Ok(Value::from(dest))
}

fn file_remove_logo() -> HResult {
    let conn = db::conn();
    if let Some(logo_path) = non_empty(settings::get_setting(&conn, "barangay_logo_path")?) {
        if Path::new(&logo_path).exists() {
            fs::remove_file(&logo_path)?;
        }
    }
    settings::set_setting(&conn, "barangay_logo_path", "")?;
    Ok(json!(true))
}

fn file_get_logo_base64() -> HResult {
    let logo_path = {
        let conn = db::conn();
        non_empty(settings::get_setting(&conn, "barangay_logo_path")?)
    };
    let Some(logo_path) = logo_path.filter(|p| Path::new(p).exists()) else { return Ok(Value::Null) };
    data_url(&logo_path)
}

// ═══ Error Log Export ═══════════════════════════════════════════════════════

fn logs_export() -> HResult {
    let run = || -> Result<Value> {
        let log_path = crate::utils::logger::log_file_path();
        if !log_path.exists() {
            return Ok(fail("No log file found"));
        }

        let opts = DialogOptions::new(
            "Export Log File",
            &format!("barangay-log-{}.log", today_iso()),
            &[("Log Files", &["log", "txt"])],
        );
        let Some(file_path) = dialogs::save_file(&opts) else {
            return Ok(json!({ "success": false }));
        };

        fs::copy(&log_path, &file_path)?;
        Ok(json!({ "success": true, "path": file_path.to_string_lossy() }))
    };
    Ok(run().unwrap_or_else(fail))
}

// ═══ Analytics ══════════════════════════════════════════════════════════════

fn analytics_track(a: &Args) -> HResult {
    let event_type = a.opt_str(0).unwrap_or_default();
    let event_data = a.opt_str(1);
    let conn = db::conn();
    analytics::track_event(&conn, &event_type, event_data.as_deref())?;
    Ok(json!({ "success": true }))
}

fn analytics_summary() -> HResult {
    let conn = db::conn();
    analytics::get_analytics_summary(&conn)
}

fn analytics_export() -> HResult {
    let run = || -> Result<Value> {
        require_admin()?;
        let csv = {
            let conn = db::conn();
            analytics::export_analytics(&conn)?
        };
        if csv.is_empty() {
            return Ok(fail("No analytics data"));
        }
        let opts = DialogOptions::new("Export Analytics", &format!("analytics-{}.csv", today_iso()), &[("CSV", &["csv"])]);
        let Some(file_path) = dialogs::save_file(&opts) else {
            return Ok(json!({ "success": false }));
        };
        fs::write(&file_path, format!("\u{feff}{csv}"))?;
        Ok(json!({ "success": true, "path": file_path.to_string_lossy() }))
    };
    Ok(run().unwrap_or_else(fail))
}

// ═══ Danger Zone (admin-only) ═══════════════════════════════════════════════

/// PIN check shared by wipe / reseed / fill: bcrypt hash when configured,
/// else the legacy plaintext PIN (or the factory default).
fn danger_pin_ok(conn: &Connection, pin: &str) -> Result<bool> {
    match non_empty(settings::get_setting(conn, "danger_zone_pin_hash")?) {
        Some(stored_hash) => Ok(verify_password(pin, &stored_hash)),
        None => {
            // Legacy fallback
            let configured = non_empty(settings::get_setting(conn, "danger_zone_pin")?).unwrap_or_else(|| "011994".into());
            Ok(pin == configured)
        }
    }
}

// Configure danger zone PIN (stored as bcrypt hash)
fn dangerzone_set_pin(a: &Args) -> HResult {
    require_admin()?;
    let current_pin = a.opt_str(0).unwrap_or_default();
    let new_pin = a.opt_str(1).unwrap_or_default();
    let conn = db::conn();
    // If no hash stored yet, verify against legacy plaintext or require first setup
    if let Some(stored_hash) = non_empty(settings::get_setting(&conn, "danger_zone_pin_hash")?) {
        if !verify_password(&current_pin, &stored_hash) {
            return Ok(fail("Current PIN is incorrect"));
        }
    } else {
        // Legacy: check old plaintext pin if it exists, or accept any current pin on first setup
        if let Some(legacy_pin) = non_empty(settings::get_setting(&conn, "danger_zone_pin")?) {
            if current_pin != legacy_pin {
                return Ok(fail("Current PIN is incorrect"));
            }
        }
    }
    if new_pin.is_empty() || new_pin.encode_utf16().count() < 4 {
        return Ok(fail("New PIN must be at least 4 characters"));
    }
    settings::set_setting(&conn, "danger_zone_pin_hash", &hash_password(&new_pin))?;
    // Remove legacy plaintext pin if it exists
    settings::set_setting(&conn, "danger_zone_pin", "")?;
    Ok(json!({ "success": true }))
}

// Wipe all data except users (admin-only)
fn dangerzone_wipe(a: &Args) -> HResult {
    let user = require_admin()?;
    let pin = a.opt_str(0).unwrap_or_default();
    let conn = db::conn();
    if !danger_pin_ok(&conn, &pin)? {
        return Ok(fail("Invalid PIN"));
    }

    let run = || -> Result<Value> {
        db::exec(
            &conn,
            "
        DELETE FROM generated_reports;
        DELETE FROM officials;
        DELETE FROM residents;
        DELETE FROM households;
        DELETE FROM cases;
        DELETE FROM summons;
        DELETE FROM audit_log;
      ",
        )?;
        // Note: report_templates is intentionally preserved during wipe
        log_audit(&conn, Some(user.id), "DATABASE_WIPED", Some("All data wiped via Danger Zone (users kept)"))?;
        Ok(json!({ "success": true }))
    };
    Ok(run().unwrap_or_else(fail))
}

// Re-seed default report templates (admin-only)
fn dangerzone_reseed_templates(a: &Args) -> HResult {
    let user = require_admin()?;
    let pin = a.opt_str(0).unwrap_or_default();
    let conn = db::conn();
    if !danger_pin_ok(&conn, &pin)? {
        return Ok(fail("Invalid PIN"));
    }

    let run = || -> Result<Value> {
        crate::db::migrations::reseed_templates(&conn)?;
        log_audit(&conn, Some(user.id), "TEMPLATES_RESEEDED", Some("Default report templates restored via Danger Zone"))?;
        Ok(json!({ "success": true }))
    };
    Ok(run().unwrap_or_else(fail))
}

// ─── Test data generator ────────────────────────────────────────────────────

const LAST_NAMES: &[&str] = &[
    "Santos", "Reyes", "Cruz", "Bautista", "Gonzales", "Lopez", "Garcia", "Mendoza",
    "Torres", "Ramos", "Aquino", "Castro", "Rivera", "Flores", "Villanueva", "Dela Cruz",
    "Morales", "Soriano", "Pascual", "Navarro", "Mercado", "Salvador", "Aguilar", "Fernandez",
    "De Leon", "Rosario", "Manalo", "Perez", "Dizon", "Santiago", "Valdez", "Enriquez",
    "Lim", "Tan", "Go", "Ong", "Sy", "Chua", "Co", "Yu",
];
const MALE_FIRST: &[&str] = &[
    "Juan", "Jose", "Pedro", "Carlos", "Miguel", "Rafael", "Antonio", "Francisco",
    "Luis", "Ramon", "Manuel", "Roberto", "Eduardo", "Alberto", "Fernando", "Ricardo",
    "Ernesto", "Alfredo", "Danilo", "Rodolfo", "Renato", "Reynaldo", "Ariel", "Mark",
    "John", "James", "Christian", "Angelo", "Vincent", "Bryan", "Kevin", "Justin",
    "Kyle", "Sean", "Patrick", "Daniel", "Gabriel", "Nathaniel", "Joshua", "Elijah",
];
const FEMALE_FIRST: &[&str] = &[
    "Maria", "Ana", "Rosa", "Carmen", "Luisa", "Elena", "Teresa", "Gloria",
    "Patricia", "Cristina", "Lourdes", "Rosario", "Victoria", "Isabel", "Josefina", "Remedios",
    "Grace", "Joy", "Faith", "Hope", "Michelle", "Nicole", "Angela", "Jasmine",
    "Samantha", "Angelica", "Stephanie", "Clarissa", "Katrina", "Bianca", "Andrea", "Sophia",
    "Princess", "Alyssa", "Hannah", "Trisha", "Mika", "Althea", "Keziah", "Chloe",
];
const MIDDLE_NAMES: &[&str] = &[
    "Reyes", "Santos", "Cruz", "Lopez", "Garcia", "Bautista", "Gonzales", "Mendoza",
    "Torres", "Rivera", "Flores", "Morales", "Soriano", "Ramos", "Aquino", "Castro",
];
const OCCUPATIONS: &[Option<&str>] = &[
    Some("Farmer"), Some("Fisher"), Some("Vendor"), Some("Tricycle Driver"), Some("Construction Worker"),
    Some("Teacher"), Some("Government Employee"), Some("OFW"), Some("Store Owner"), Some("Carpenter"),
    Some("Electrician"), Some("Mechanic"), Some("Nurse"), Some("Midwife"), Some("Barangay Health Worker"),
    Some("Student"), Some("Student"), Some("Student"), Some("Student"),
    None, None, None,
];
const SUFFIXES: &[Option<&str>] = &[None, None, None, None, None, None, None, None, Some("Jr."), Some("Sr."), Some("III"), Some("IV")];
const RELIGIONS: &[&str] = &[
    "Roman Catholic", "Roman Catholic", "Roman Catholic", "Roman Catholic",
    "Iglesia ni Cristo", "Born Again Christian", "Muslim", "Seventh Day Adventist", "Baptist",
];
const EDUCATIONS: &[Option<&str>] = &[
    Some("Elementary"), Some("High School"), Some("High School Graduate"), Some("College Level"),
    Some("College Graduate"), Some("Vocational"), Some("Post Graduate"), None,
];
const CASE_TYPES: &[&str] = &["mediation", "complaint", "dispute", "other"];
const CASE_DESCRIPTIONS: &[&str] = &[
    "Noise complaint from neighboring household during late hours.",
    "Boundary dispute between adjacent lots in the purok.",
    "Verbal altercation between residents over parking space.",
    "Unpaid debt / lending dispute.",
    "Property damage caused by stray animals.",
    "Physical altercation during community gathering.",
    "Harassment and verbal threats between neighbors.",
    "Dispute over water supply and irrigation rights.",
    "Damage to property from construction work on adjacent lot.",
    "Domestic dispute escalated to public disturbance.",
];

const INSERT_RESIDENT: &str = "
        INSERT INTO residents (
          first_name, middle_name, last_name, suffix, birth_date, gender,
          civil_status, address, purok, contact_number, occupation,
          is_indigent, voter_status, is_4ps, status, death_date,
          religion, citizenship, educational_attainment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ";
const LINK_PARTNER: &str = "UPDATE residents SET partner_id = ? WHERE id = ?";
const LINK_PARENT: &str = "UPDATE residents SET mother_id = ?, father_id = ? WHERE id = ?";

struct Family {
    father_id: i64,
    last_name: &'static str,
    purok: String,
    father_age: i64,
}

#[derive(Clone)]
struct Person {
    id: i64,
    age: i64,
    gender: &'static str,
    last_name: &'static str,
    purok: String,
}

/// Mutable state shared by the generator phases (the JS closures' captures).
struct Gen<'a> {
    c: &'a Connection,
    rng: rand::rngs::ThreadRng,
    num_puroks: i64,
    target: i64,
    total_created: i64,
    deceased_count: i64,
    senior_count: i64,
    youth_count: i64,
    indigent_count: i64,
    four_ps_count: i64,
    all_resident_ids: Vec<i64>,
}

impl<'a> Gen<'a> {
    fn random(&mut self) -> f64 {
        self.rng.gen::<f64>()
    }

    fn rand_int(&mut self, min: i64, max: i64) -> i64 {
        (self.random() * (max - min + 1) as f64).floor() as i64 + min
    }

    fn pick<T: Copy>(&mut self, arr: &[T]) -> T {
        let i = (self.random() * arr.len() as f64).floor() as usize;
        arr[i.min(arr.len() - 1)]
    }

    fn phone(&mut self) -> String {
        format!("09{}", self.rand_int(100_000_000, 999_999_999))
    }

    fn voter(&mut self, threshold: f64) -> &'static str {
        if self.random() > threshold {
            "Registered"
        } else {
            "Not Registered"
        }
    }

    fn chance_flag(&mut self, p: f64) -> i64 {
        if self.random() < p {
            1
        } else {
            0
        }
    }

    // Generate a birth date for a target age
    fn birth_date_for_age(&mut self, age: i64) -> String {
        let year = chrono::Datelike::year(&chrono::Local::now()) as i64 - age;
        let month = self.rand_int(1, 12);
        let day = self.rand_int(1, 28);
        format!("{year}-{month:02}-{day:02}")
    }

    // Generate a random date within last N months
    fn recent_date(&mut self, months_ago: i64) -> String {
        use chrono::{Datelike, TimeZone};
        let now = chrono::Local::now();
        let total = now.year() as i64 * 12 + now.month0() as i64 - months_ago;
        let (y, m) = (total.div_euclid(12) as i32, total.rem_euclid(12) as u32 + 1);
        let past = chrono::Local
            .with_ymd_and_hms(y, m, 1, 0, 0, 0)
            .earliest()
            .map(|d| d.with_timezone(&chrono::Utc))
            .unwrap_or_else(chrono::Utc::now);
        let now_utc = now.with_timezone(&chrono::Utc);
        let diff = (now_utc - past).num_milliseconds() as f64;
        let d = past + chrono::Duration::milliseconds((self.random() * diff) as i64);
        d.format("%Y-%m-%d").to_string()
    }

    fn insert(&mut self, vals: Vec<Value>) -> Result<i64> {
        let id = db::run(self.c, INSERT_RESIDENT, vals)?.last_insert_rowid;
        self.all_resident_ids.push(id);
        self.total_created += 1;
        Ok(id)
    }

    fn link_partners(&self, a: i64, b: i64) -> Result<()> {
        db::run(self.c, LINK_PARTNER, crate::p![a, b])?;
        db::run(self.c, LINK_PARTNER, crate::p![b, a])?;
        Ok(())
    }

    // ─── Phase 2a helper ───
    fn make_ancestor_pair(&mut self, child_id: i64, child_age: i64, last_name: &str, purok: &str) -> Result<Option<(i64, i64)>> {
        if self.total_created >= self.target {
            return Ok(None);
        }
        let gp_age = child_age + self.rand_int(20, 28);
        if gp_age > 110 {
            return Ok(None);
        }
        let father_deceased = gp_age > 88 || (gp_age > 75 && self.random() < 0.3);
        let mother_deceased = gp_age > 90 || (gp_age > 75 && self.random() < 0.25);

        let vals = vec![
            json!(self.pick(MALE_FIRST)), json!(self.pick(MIDDLE_NAMES)), json!(last_name), Value::Null,
            json!(self.birth_date_for_age(gp_age)), json!("Male"),
            json!(if mother_deceased { "Widowed" } else { "Married" }), json!(format!("Purok {purok}")), json!(purok),
            if father_deceased { Value::Null } else { json!(self.phone()) },
            if father_deceased { Value::Null } else if self.random() < 0.6 { json!("Retired") } else { json!(self.pick(OCCUPATIONS)) },
            json!(self.chance_flag(0.25)), json!(if father_deceased { "Not Registered" } else { "Registered" }),
            json!(0), json!(if father_deceased { "deceased" } else { "living" }),
            if father_deceased { let m = self.rand_int(6, 120); json!(self.recent_date(m)) } else { Value::Null },
            json!(self.pick(RELIGIONS)), json!("Filipino"), json!(self.pick(EDUCATIONS)),
        ];
        let gp_father_id = self.insert(vals)?;
        if !father_deceased && gp_age >= 60 {
            self.senior_count += 1;
        }
        if father_deceased {
            self.deceased_count += 1;
        }

        let gp_mother_age = gp_age - self.rand_int(-2, 3);
        let vals = vec![
            json!(self.pick(FEMALE_FIRST)), json!(self.pick(MIDDLE_NAMES)), json!(self.pick(LAST_NAMES)), Value::Null,
            json!(self.birth_date_for_age(gp_mother_age.max(40))), json!("Female"),
            json!(if father_deceased { "Widowed" } else { "Married" }), json!(format!("Purok {purok}")), json!(purok),
            if mother_deceased { Value::Null } else { json!(self.phone()) },
            if mother_deceased { Value::Null } else if self.random() < 0.6 { json!("Retired") } else { json!(self.pick(OCCUPATIONS)) },
            json!(self.chance_flag(0.25)), json!(if mother_deceased { "Not Registered" } else { "Registered" }),
            json!(0), json!(if mother_deceased { "deceased" } else { "living" }),
            if mother_deceased { let m = self.rand_int(6, 120); json!(self.recent_date(m)) } else { Value::Null },
            json!(self.pick(RELIGIONS)), json!("Filipino"), json!(self.pick(EDUCATIONS)),
        ];
        let gp_mother_id = self.insert(vals)?;
        if !mother_deceased && gp_mother_age >= 60 {
            self.senior_count += 1;
        }
        if mother_deceased {
            self.deceased_count += 1;
        }

        self.link_partners(gp_mother_id, gp_father_id)?;
        db::run(self.c, LINK_PARENT, crate::p![gp_mother_id, gp_father_id, child_id])?;
        Ok(Some((gp_father_id, gp_age)))
    }

    // ─── Phase 2b: Married children with families of their own (chains DOWN) ──
    fn make_descendants(&mut self, parent: &Person, depth_left: i64) -> Result<()> {
        if depth_left <= 0 || parent.age < 22 || self.total_created >= self.target {
            return Ok(());
        }

        let spouse_gender = if parent.gender == "Male" { "Female" } else { "Male" };
        let spouse_age = (parent.age + self.rand_int(-4, 4)).max(20);
        let spouse_last = if spouse_gender == "Female" && self.random() < 0.7 { parent.last_name } else { self.pick(LAST_NAMES) };
        let vals = vec![
            json!(self.pick(if spouse_gender == "Male" { MALE_FIRST } else { FEMALE_FIRST })), json!(self.pick(MIDDLE_NAMES)),
            json!(spouse_last), Value::Null,
            json!(self.birth_date_for_age(spouse_age)), json!(spouse_gender),
            json!("Married"), json!(format!("Purok {}", parent.purok)), json!(parent.purok),
            json!(self.phone()),
            json!(self.pick(OCCUPATIONS)),
            json!(self.chance_flag(0.15)), json!(self.voter(0.2)),
            json!(0), json!("living"), Value::Null,
            json!(self.pick(RELIGIONS)), json!("Filipino"), json!(self.pick(EDUCATIONS)),
        ];
        let spouse_id = self.insert(vals)?;
        if spouse_age >= 60 {
            self.senior_count += 1;
        }

        db::run(self.c, "UPDATE residents SET civil_status = 'Married' WHERE id = ?", crate::p![parent.id])?;
        self.link_partners(spouse_id, parent.id)?;

        let mother_id = if parent.gender == "Female" { parent.id } else { spouse_id };
        let father_id = if parent.gender == "Male" { parent.id } else { spouse_id };

        let num_kids = self.rand_int(1, 3);
        let mut k = 0;
        while k < num_kids && self.total_created < self.target {
            let kid_age = self.rand_int(0, parent.age - 20).max(0);
            let kid_gender = if self.random() < 0.5 { "Male" } else { "Female" };
            if (15..=30).contains(&kid_age) {
                self.youth_count += 1;
            }
            let vals = vec![
                json!(self.pick(if kid_gender == "Male" { MALE_FIRST } else { FEMALE_FIRST })), json!(self.pick(MIDDLE_NAMES)),
                json!(parent.last_name), Value::Null,
                json!(self.birth_date_for_age(kid_age)), json!(kid_gender),
                json!("Single"), json!(format!("Purok {}", parent.purok)), json!(parent.purok),
                if kid_age >= 15 { json!(self.phone()) } else { Value::Null },
                if (15..=22).contains(&kid_age) { json!("Student") } else if kid_age > 22 { json!(self.pick(OCCUPATIONS)) } else { Value::Null },
                json!(self.chance_flag(0.15)),
                json!(if kid_age >= 18 && self.random() > 0.3 { "Registered" } else { "Not Registered" }),
                json!(0), json!("living"), Value::Null,
                json!(self.pick(RELIGIONS)), json!("Filipino"), if kid_age >= 6 { json!(self.pick(EDUCATIONS)) } else { Value::Null },
            ];
            let kid_id = self.insert(vals)?;
            db::run(self.c, LINK_PARENT, crate::p![mother_id, father_id, kid_id])?;

            // Sometimes the chain continues another generation down
            if kid_age >= 22 && self.random() < 0.5 {
                let kid = Person { id: kid_id, age: kid_age, gender: kid_gender, last_name: parent.last_name, purok: parent.purok.clone() };
                self.make_descendants(&kid, depth_left - 1)?;
            }
            k += 1;
        }
        Ok(())
    }
}

/// JS `parseInt(s, 10)` — leading integer digits, `None` for NaN.
fn parse_int(s: &str) -> Option<i64> {
    let t = s.trim_start();
    let (sign, rest) = match t.strip_prefix('-') {
        Some(r) => (-1, r),
        None => (1, t.strip_prefix('+').unwrap_or(t)),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok().map(|n| sign * n)
}

fn fill_test_data(c: &Connection, count: Option<f64>) -> Result<()> {
    // Get number of puroks
    let num_puroks = parse_int(&non_empty(settings::get_setting(c, "number_of_puroks")?).unwrap_or_else(|| "7".into())).unwrap_or(7);

    db::transaction(c, |c| {
        let count = count.filter(|n| *n != 0.0 && !n.is_nan()).unwrap_or(1000.0);
        let target = (count.floor() as i64).clamp(100, 8000);
        let mut g = Gen {
            c,
            rng: rand::thread_rng(),
            num_puroks,
            target,
            total_created: 0,
            deceased_count: 0,
            senior_count: 0,
            youth_count: 0,
            indigent_count: 0,
            four_ps_count: 0,
            all_resident_ids: Vec::new(),
        };

        // ─── Phase 1: Generate ~170 family units → ~1000 residents ────
        // Phase 1 builds ~70% of the target as base families; ancestor and
        // descendant chains (Phases 2a/2b) fill the rest with deep generations.
        let phase1_target = (target as f64 * 0.7).floor() as i64;
        let mut families: Vec<Family> = Vec::new();
        let mut child_records: Vec<Person> = Vec::new();
        let num_families = (phase1_target as f64 / 5.5).ceil() as i64;

        let mut f = 0;
        while f < num_families && g.total_created < phase1_target {
            let family_name = g.pick(LAST_NAMES);
            let purok = g.rand_int(1, g.num_puroks).to_string();

            // Every 5th family is a "large family" (5-8 children)
            let is_large_family = f % 5 == 0;
            let parent_age = if is_large_family { g.rand_int(45, 70) } else { g.rand_int(30, 75) };

            // Flags: 15% indigent, 8% are 4Ps beneficiaries
            let is_indigent = g.chance_flag(0.15);
            let is_4ps = if is_indigent == 1 && g.random() < 0.55 { 1 } else { 0 };
            if is_indigent == 1 {
                g.indigent_count += 2;
            }
            if is_4ps == 1 {
                g.four_ps_count += 2;
            }

            // Father
            let father_age = parent_age;
            if father_age >= 60 {
                g.senior_count += 1;
            }
            let vals = vec![
                json!(g.pick(MALE_FIRST)), json!(g.pick(MIDDLE_NAMES)), json!(family_name), json!(g.pick(SUFFIXES)),
                json!(g.birth_date_for_age(father_age)), json!("Male"),
                json!("Married"), json!(format!("Purok {purok}")), json!(purok),
                json!(g.phone()),
                json!(g.pick(OCCUPATIONS)),
                json!(is_indigent), json!(g.voter(0.2)),
                json!(is_4ps), json!("living"), Value::Null,
                json!(g.pick(RELIGIONS)), json!("Filipino"), json!(g.pick(EDUCATIONS)),
            ];
            let father_id = g.insert(vals)?;

            // Mother (may have different maiden name)
            let mother_age = father_age - g.rand_int(-3, 5);
            if mother_age >= 60 {
                g.senior_count += 1;
            }
            let mother_last = if g.random() < 0.7 { family_name } else { g.pick(LAST_NAMES) };
            let vals = vec![
                json!(g.pick(FEMALE_FIRST)), json!(g.pick(MIDDLE_NAMES)),
                json!(mother_last), Value::Null,
                json!(g.birth_date_for_age(mother_age.max(25))), json!("Female"),
                json!("Married"), json!(format!("Purok {purok}")), json!(purok),
                json!(g.phone()),
                json!(g.pick(OCCUPATIONS)),
                json!(is_indigent), json!(g.voter(0.2)),
                json!(is_4ps), json!("living"), Value::Null,
                json!(g.pick(RELIGIONS)), json!("Filipino"), json!(g.pick(EDUCATIONS)),
            ];
            let mother_id = g.insert(vals)?;

            // Link partners
            g.link_partners(mother_id, father_id)?;

            families.push(Family { father_id, last_name: family_name, purok: purok.clone(), father_age: parent_age });

            // Children — large families get 5-8, normal get 2-4
            let num_children = if is_large_family { g.rand_int(5, 8) } else { g.rand_int(2, 4) };
            let mut ci = 0;
            while ci < num_children && g.total_created < phase1_target {
                let child_age = g.rand_int(1, (parent_age - 18).max(2));
                let child_gender = if g.random() < 0.5 { "Male" } else { "Female" };
                let child_first_names = if child_gender == "Male" { MALE_FIRST } else { FEMALE_FIRST };

                if (15..=30).contains(&child_age) {
                    g.youth_count += 1;
                }

                let mut child_civil = "Single";
                if child_age >= 25 && g.random() < 0.4 {
                    child_civil = "Married";
                }

                let child_occ: Option<&str> = if (15..=22).contains(&child_age) {
                    Some("Student")
                } else if child_age > 22 {
                    g.pick(OCCUPATIONS)
                } else {
                    None
                };

                let vals = vec![
                    json!(g.pick(child_first_names)), json!(g.pick(MIDDLE_NAMES)), json!(family_name), Value::Null,
                    json!(g.birth_date_for_age(child_age)), json!(child_gender),
                    json!(child_civil), json!(format!("Purok {purok}")), json!(purok),
                    if child_age >= 15 { json!(g.phone()) } else { Value::Null },
                    json!(child_occ),
                    json!(is_indigent),
                    json!(if child_age >= 18 && g.random() > 0.3 { "Registered" } else { "Not Registered" }),
                    json!(is_4ps), json!("living"), Value::Null,
                    json!(g.pick(RELIGIONS)), json!("Filipino"),
                    if child_age >= 6 { json!(g.pick(EDUCATIONS)) } else { Value::Null },
                ];
                let child_id = g.insert(vals)?;

                db::run(c, LINK_PARENT, crate::p![mother_id, father_id, child_id])?;
                child_records.push(Person { id: child_id, age: child_age, gender: child_gender, last_name: family_name, purok: purok.clone() });
                ci += 1;
            }
            f += 1;
        }

        // ─── Phase 2a: Multi-generation ancestor chains ────────────
        // Builds lineages 1-4 generations UP from family fathers so deep
        // family trees can be tested. Very old ancestors are recorded as
        // deceased with a death date.
        let ancestor_chain_families = 10.max(families.len() / 3);
        let mut gi = 0;
        while gi < ancestor_chain_families && g.total_created < g.target {
            let Some(fam) = families.get(gi) else {
                bail!("Cannot read properties of undefined (reading 'fatherId')");
            };
            let chain_levels = g.rand_int(1, 4);
            let mut current_id = fam.father_id;
            let mut current_age = fam.father_age;
            for _ in 0..chain_levels {
                let Some((next_id, next_age)) = g.make_ancestor_pair(current_id, current_age, fam.last_name, &fam.purok)? else {
                    break;
                };
                current_id = next_id;
                current_age = next_age;
            }
            gi += 1;
        }

        // ─── Phase 2b: descendants ──
        for child in &child_records {
            if g.total_created >= g.target {
                break;
            }
            if child.age >= 25 && g.random() < 0.35 {
                let depth = g.rand_int(1, 3);
                g.make_descendants(child, depth)?;
            }
        }

        // ─── Phase 3: Mark additional residents as deceased ──
        let mut deceased_candidates = g.all_resident_ids.clone();
        let extra_deceased = 10.max((target as f64 * 0.015).floor() as i64);
        let mut d = 0;
        while d < extra_deceased && !deceased_candidates.is_empty() {
            let idx = g.rand_int(0, deceased_candidates.len() as i64 - 1) as usize;
            let res_id = deceased_candidates.remove(idx.min(deceased_candidates.len() - 1));
            let death_date = g.recent_date(36); // died within last 3 years
            db::run(c, "UPDATE residents SET status = 'deceased', death_date = ? WHERE id = ?", crate::p![death_date, res_id])?;
            g.deceased_count += 1;
            d += 1;
        }

        // ─── Phase 4: Create officials from existing residents ────────
        let official_positions = [
            "Punong Barangay",
            "Barangay Kagawad",
            "Barangay Kagawad",
            "Barangay Kagawad",
            "Barangay Kagawad",
            "Barangay Kagawad",
            "Barangay Kagawad",
            "Barangay Kagawad",
            "Barangay Secretary",
            "Barangay Treasurer",
            "SK Chairperson",
        ];

        let official_sql = "
          INSERT INTO officials (resident_id, position, start_date, is_active, sort_order)
          VALUES (?, ?, ?, 1, ?)
        ";

        // Pick adults (30+) from allResidentIds for officials
        let cutoff = g.birth_date_for_age(30);
        let adult_rows = db::all(
            c,
            "SELECT id FROM residents WHERE status = 'living' AND birth_date <= ? ORDER BY RANDOM() LIMIT ?",
            crate::p![cutoff, official_positions.len()],
        )?;

        let officials_count = adult_rows.len().min(official_positions.len());
        let this_year = chrono::Datelike::year(&chrono::Local::now()) as i64;
        for o in 0..officials_count {
            let start = format!("{}-01-01", this_year - g.rand_int(0, 2));
            db::run(c, official_sql, crate::p![adult_rows[o]["id"], official_positions[o], start, o + 1])?;
        }

        // ─── Phase 5: Create cases with summons ────────────────────
        let case_sql = "
          INSERT INTO cases (case_number, case_type, complainant_id, respondent_id, description, filed_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        ";
        let summon_sql = "
          INSERT INTO summons (case_id, summon_number, summon_date, summon_time, status, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        ";

        let living_ids = db::all(c, "SELECT id FROM residents WHERE status = 'living' ORDER BY RANDOM() LIMIT 30", ())?;
        let year = this_year;
        let case_statuses = ["pending", "ongoing", "resolved", "dismissed"];
        let summon_statuses = ["scheduled", "served", "appeared", "no_show"];
        let summon_times = ["08:00", "09:00", "10:00", "13:00", "14:00", "15:00"];

        let mut cs = 0usize;
        while cs < 10 && living_ids.len() >= 2 {
            let complainant_idx = cs * 2;
            let respondent_idx = cs * 2 + 1;
            if complainant_idx >= living_ids.len() || respondent_idx >= living_ids.len() {
                break;
            }

            let case_num = format!("{}-{:03}", year, cs + 1);
            let case_status = g.pick(&case_statuses);
            let filed_date = g.recent_date(12);

            let case_type = g.pick(CASE_TYPES);
            let description = g.pick(CASE_DESCRIPTIONS);
            db::run(
                c,
                case_sql,
                crate::p![
                    case_num,
                    case_type,
                    living_ids[complainant_idx]["id"],
                    living_ids[respondent_idx]["id"],
                    description,
                    filed_date,
                    case_status
                ],
            )?;
            let case_id = db::count(c, "SELECT last_insert_rowid() as id", ())?;

            // Register parties — occasionally with multiple complainants/respondents
            let party_sql = "INSERT INTO case_parties (case_id, resident_id, role) VALUES (?, ?, ?)";
            db::run(c, party_sql, crate::p![case_id, living_ids[complainant_idx]["id"], "complainant"])?;
            db::run(c, party_sql, crate::p![case_id, living_ids[respondent_idx]["id"], "respondent"])?;
            if g.random() < 0.3 && living_ids.len() > respondent_idx + 1 {
                let extra = (respondent_idx + g.rand_int(1, 5) as usize) % living_ids.len();
                db::run(c, party_sql, crate::p![case_id, living_ids[extra]["id"], "respondent"])?;
            }

            // Each case gets 1-3 summons
            let num_summons = g.rand_int(1, 3);
            for s in 0..num_summons {
                let summon_date = g.recent_date(6);
                let time = g.pick(&summon_times);
                let status = g.pick(&summon_statuses);
                let notes = if s == 0 { "Initial summon issued".to_string() } else { format!("Follow-up summon #{}", s + 1) };
                db::run(c, summon_sql, crate::p![case_id, s + 1, summon_date, time, status, notes])?;
            }
            cs += 1;
        }

        // Ensure every generated resident has a permanent UID (QR codes)
        db::exec(
            c,
            "
          UPDATE residents SET resident_uid =
            lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
            substr(lower(hex(randomblob(2))), 2) || '-' ||
            substr('89ab', (abs(random()) % 4) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
            lower(hex(randomblob(6)))
          WHERE resident_uid IS NULL
        ",
        )?;

        // Log
        log_audit(
            c,
            None,
            "TEST_DATA_FILLED",
            Some(&format!(
                "Generated {} residents ({} seniors, {} youth, {} indigent, {} 4Ps, {} deceased), {} officials, 10 cases with summons",
                g.total_created, g.senior_count, g.youth_count, g.indigent_count, g.four_ps_count, g.deceased_count, officials_count
            )),
        )?;
        Ok(())
    })
}

// Fill test dummy data — 800 residents with family relationships (admin-only)
fn dangerzone_fill_test_data(a: &Args) -> HResult {
    require_admin()?;
    let pin = a.opt_str(0).unwrap_or_default();
    let count = a.f64(1);
    let conn = db::conn();
    if !danger_pin_ok(&conn, &pin)? {
        return Ok(fail("Invalid PIN"));
    }

    Ok(match fill_test_data(&conn, count) {
        Ok(()) => json!({ "success": true }),
        Err(e) => fail(e),
    })
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        // Users
        "db:users:list" => users_list(),
        "db:users:create" => users_create(a),
        "db:users:update" => users_update(a),
        "db:users:delete" => users_delete(a),
        "db:users:updatePassword" => users_update_password(a),
        "db:users:resetPassword" => users_reset_password(a),
        // Templates
        "db:templates:list" => templates_list(),
        "db:templates:get" => templates_get(a),
        "db:templates:create" => templates_create(a),
        "db:templates:update" => templates_update(a),
        "db:templates:delete" => templates_delete(a),
        // Generated reports
        "db:reports:list" => reports_list(a),
        "db:reports:saveDoc" => reports_save_doc(a),
        "db:reports:saveCaseDoc" => reports_save_case_doc(a),
        "db:reports:get" => reports_get(a),
        "db:reports:delete" => reports_delete(a),
        "db:reports:void" => reports_void(a),
        "db:reports:listDocs" => reports_list_docs(a),
        "db:reports:listByCase" => reports_list_by_case(a),
        "db:reports:storageStats" => reports_storage_stats(),
        "db:reports:cleanup" => reports_cleanup(a),
        // Settings
        "db:settings:get" => settings_get(a),
        "db:settings:set" => settings_set(a),
        "db:settings:getAll" => settings_get_all(),
        // Mobile API clients / app roles / app users
        "db:apiclients:list" => apiclients_list(),
        "db:apiclients:create" => apiclients_create(a),
        "db:apiclients:setActive" => apiclients_set_active(a),
        "db:apiclients:delete" => apiclients_delete(a),
        "db:approles:list" => approles_list(),
        "db:approles:create" => approles_create(a),
        "db:approles:update" => approles_update(a),
        "db:approles:delete" => approles_delete(a),
        "db:appusers:list" => appusers_list(),
        "db:appusers:create" => appusers_create(a),
        "db:appusers:update" => appusers_update(a),
        "db:appusers:delete" => appusers_delete(a),
        "db:appusers:revealPassword" => appusers_reveal_password(a),
        // Audit
        "db:audit:list" => audit_list(a),
        // File operations
        "dialog:openFile" => dialog_open_file(a),
        "dialog:saveFile" => dialog_save_file(a),
        "file:saveAvatar" => file_save_avatar(a),
        "file:saveResidentPhoto" => file_save_resident_photo(a),
        "file:getImageBase64" => file_get_image_base64(a),
        "file:saveLogo" => file_save_logo(a),
        "file:removeLogo" => file_remove_logo(),
        "file:getLogoBase64" => file_get_logo_base64(),
        // Logs / analytics
        "db:logs:export" => logs_export(),
        "db:analytics:track" => analytics_track(a),
        "db:analytics:summary" => analytics_summary(),
        "db:analytics:export" => analytics_export(),
        // Danger zone
        "db:dangerzone:setPin" => dangerzone_set_pin(a),
        "db:dangerzone:wipe" => dangerzone_wipe(a),
        "db:dangerzone:reseedTemplates" => dangerzone_reseed_templates(a),
        "db:dangerzone:fillTestData" => dangerzone_fill_test_data(a),
        _ => return None,
    })
}
