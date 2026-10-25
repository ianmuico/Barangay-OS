use crate::db;
use crate::ipc::{as_i64, truthy, ObjExt};
use crate::utils::secret::{decrypt_secret, encrypt_secret};
use anyhow::{bail, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

fn flag(v: Option<&Value>) -> i64 {
    if v.map(truthy).unwrap_or(false) {
        1
    } else {
        0
    }
}

/// `data.key.trim()` — throws like JS when the key is missing / not a string.
fn trimmed(data: &Map<String, Value>, key: &str) -> Result<String> {
    match data.get(key) {
        Some(Value::String(s)) => Ok(s.trim().to_string()),
        Some(Value::Null) => bail!("Cannot read properties of null (reading 'trim')"),
        Some(_) => bail!("{key}.trim is not a function"),
        None => bail!("Cannot read properties of undefined (reading 'trim')"),
    }
}

/// `data.key?.trim() || null`.
fn trimmed_or_null(data: &Map<String, Value>, key: &str) -> Value {
    match data.get(key) {
        Some(Value::String(s)) if !s.trim().is_empty() => Value::from(s.trim()),
        _ => Value::Null,
    }
}

// ─── Dynamic roles ───────────────────────────────────────────────────────────
// AppPermissions: { search, read, create (also governs edit/update), delete }

pub fn list_roles(conn: &Connection) -> Result<Vec<Value>> {
    db::all(conn, "SELECT * FROM app_roles ORDER BY is_system DESC, name ASC", ())
}

/// `perms`: `{ search, read, create, delete }` (AppPermissions).
pub fn create_role(conn: &Connection, name: &str, perms: &Map<String, Value>) -> Result<i64> {
    let r = db::run(
        conn,
        "INSERT INTO app_roles (name, perm_search, perm_read, perm_create, perm_delete) VALUES (?, ?, ?, ?, ?)",
        crate::p![
            name.trim(),
            flag(perms.get("search")),
            flag(perms.get("read")),
            flag(perms.get("create")),
            flag(perms.get("delete"))
        ],
    )?;
    Ok(r.last_insert_rowid)
}

/// `data`: `{ name?, perms?: AppPermissions }`.
pub fn update_role(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<&str> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if data.has("name") {
        fields.push("name = ?");
        values.push(Value::from(trimmed(data, "name")?));
    }
    if let Some(perms) = data.get("perms").filter(|p| truthy(p)) {
        fields.extend(["perm_search = ?", "perm_read = ?", "perm_create = ?", "perm_delete = ?"]);
        values.push(Value::from(flag(perms.get("search"))));
        values.push(Value::from(flag(perms.get("read"))));
        values.push(Value::from(flag(perms.get("create"))));
        values.push(Value::from(flag(perms.get("delete"))));
    }
    if fields.is_empty() {
        return Ok(());
    }
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE app_roles SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

/// → `{ success, error? }`.
pub fn delete_role(conn: &Connection, id: i64) -> Result<Value> {
    let Some(role) = db::get(conn, "SELECT is_system FROM app_roles WHERE id = ?", crate::p![id])? else {
        return Ok(json!({ "success": false, "error": "Role not found" }));
    };
    if truthy(&role["is_system"]) {
        return Ok(json!({ "success": false, "error": "The Administrator role cannot be deleted." }));
    }
    let in_use = db::count(conn, "SELECT COUNT(*) n FROM app_users WHERE role_id = ?", crate::p![id])?;
    if in_use > 0 {
        return Ok(json!({ "success": false, "error": format!("{in_use} user(s) still use this role. Reassign them first.") }));
    }
    db::run(conn, "DELETE FROM app_roles WHERE id = ?", crate::p![id])?;
    Ok(json!({ "success": true }))
}

// ─── App users (reversibly-encrypted passwords) ──────────────────────────────

pub fn list_app_users(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT u.id, u.username, u.full_name, u.role_id, r.name as role_name,
           u.is_active, u.created_at, u.last_login
    FROM app_users u LEFT JOIN app_roles r ON u.role_id = r.id
    ORDER BY u.username ASC
  ",
        (),
    )
}

/// `data`: `{ username, full_name?, password, role_id }`.
pub fn create_app_user(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let username = trimmed(data, "username")?;
    let full_name = trimmed_or_null(data, "full_name");
    let Some(password) = data.get("password").and_then(|v| v.as_str()) else {
        bail!("The \"data\" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined");
    };
    let enc = encrypt_secret(conn, password)?;
    let role_id = data.get("role_id").cloned().unwrap_or(Value::Null);
    let r = db::run(
        conn,
        "INSERT INTO app_users (username, full_name, password_enc, role_id) VALUES (?, ?, ?, ?)",
        vec![Value::from(username), full_name, Value::from(enc), role_id],
    )?;
    Ok(r.last_insert_rowid)
}

/// `data`: `{ username?, full_name?, password?, role_id?, is_active? }`.
pub fn update_app_user(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<&str> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if data.has("username") {
        fields.push("username = ?");
        values.push(Value::from(trimmed(data, "username")?));
    }
    if data.has("full_name") {
        fields.push("full_name = ?");
        values.push(trimmed_or_null(data, "full_name"));
    }
    if let Some(password) = data.get("password").and_then(|v| v.as_str()).filter(|p| !p.is_empty()) {
        fields.push("password_enc = ?");
        values.push(Value::from(encrypt_secret(conn, password)?));
    }
    if let Some(role_id) = data.get("role_id") {
        fields.push("role_id = ?");
        values.push(role_id.clone());
    }
    if data.has("is_active") {
        fields.push("is_active = ?");
        values.push(Value::from(flag(data.get("is_active"))));
    }
    if fields.is_empty() {
        return Ok(());
    }
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE app_users SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_app_user(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM app_users WHERE id = ?", crate::p![id])?;
    Ok(())
}

// Admin-only password reveal (local-first)
pub fn reveal_app_user_password(conn: &Connection, id: i64) -> Result<Option<String>> {
    let row = db::get(conn, "SELECT password_enc FROM app_users WHERE id = ?", crate::p![id])?;
    Ok(row.map(|r| decrypt_secret(conn, r["password_enc"].as_str().unwrap_or_default())))
}

// ─── Login + sessions (for the API) ──────────────────────────────────────────

#[derive(Clone)]
struct Session {
    user_id: i64,
    username: String,
    name: String,
    role_name: String,
    perms: Value,
    expires: i64,
}

impl Session {
    /// Same shape as the TS `Session` object.
    fn to_json(&self) -> Value {
        json!({
            "userId": self.user_id,
            "username": self.username,
            "name": self.name,
            "roleName": self.role_name,
            "perms": self.perms,
            "expires": self.expires,
        })
    }
}

static SESSIONS: LazyLock<Mutex<HashMap<String, Session>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
const SESSION_TTL_MS: i64 = 12 * 60 * 60 * 1000; // 12 hours

fn sessions() -> std::sync::MutexGuard<'static, HashMap<String, Session>> {
    SESSIONS.lock().unwrap_or_else(|p| p.into_inner())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn perms_from_row(r: &Value) -> Value {
    json!({
        "search": truthy(&r["perm_search"]),
        "read": truthy(&r["perm_read"]),
        "create": truthy(&r["perm_create"]),
        "delete": truthy(&r["perm_delete"]),
    })
}

fn no_perms() -> Value {
    json!({ "search": false, "read": false, "create": false, "delete": false })
}

fn role_perms(conn: &Connection, role_id: Option<i64>) -> Result<Value> {
    let Some(role_id) = role_id.filter(|id| *id != 0) else { return Ok(no_perms()) };
    let r = db::get(
        conn,
        "SELECT perm_search, perm_read, perm_create, perm_delete FROM app_roles WHERE id = ?",
        crate::p![role_id],
    )?;
    Ok(match r {
        Some(r) => perms_from_row(&r),
        None => no_perms(),
    })
}

/// → `{ token, user: { id, name, username, role, permissions } }` or `{ error }`.
pub fn app_login(conn: &Connection, username: &str, password: &str) -> Result<Value> {
    let u = db::get(
        conn,
        "
    SELECT u.*, r.name as role_name FROM app_users u
    LEFT JOIN app_roles r ON u.role_id = r.id WHERE u.username = ?
  ",
        crate::p![username.trim()],
    )?;
    let Some(u) = u else { return Ok(json!({ "error": "Invalid username or password" })) };
    if !truthy(&u["is_active"]) {
        return Ok(json!({ "error": "This account is disabled. Contact the barangay admin." }));
    }
    if decrypt_secret(conn, u["password_enc"].as_str().unwrap_or_default()) != password {
        return Ok(json!({ "error": "Invalid username or password" }));
    }

    let perms = role_perms(conn, as_i64(&u["role_id"]))?;
    let mut bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = URL_SAFE_NO_PAD.encode(bytes);

    let id = u.i("id").unwrap_or_default();
    let uname = u.s("username").unwrap_or_default();
    let full_name = u.s("full_name").filter(|s| !s.is_empty());
    let display_name = full_name.unwrap_or_else(|| uname.clone());
    let role_name = u.s("role_name").filter(|s| !s.is_empty());

    sessions().insert(
        token.clone(),
        Session {
            user_id: id,
            username: uname.clone(),
            name: display_name.clone(),
            role_name: role_name.clone().unwrap_or_else(|| "No role".into()),
            perms: perms.clone(),
            expires: now_ms() + SESSION_TTL_MS,
        },
    );
    db::run(conn, "UPDATE app_users SET last_login = datetime('now') WHERE id = ?", crate::p![id])?;
    Ok(json!({
        "token": token,
        "user": { "id": id, "name": display_name, "username": uname, "role": role_name, "permissions": perms },
    }))
}

/// → TS `Session`: `{ userId, username, name, roleName, perms, expires }`.
pub fn resolve_app_session(conn: &Connection, token: &str) -> Result<Option<Value>> {
    let Some(s) = sessions().get(token).cloned() else { return Ok(None) };
    if now_ms() > s.expires {
        sessions().remove(token);
        return Ok(None);
    }
    // Refresh perms live so role changes take effect without re-login
    let fresh = db::get(
        conn,
        "
    SELECT r.name as role_name, r.perm_search, r.perm_read, r.perm_create, r.perm_delete, u.is_active, u.role_id
    FROM app_users u LEFT JOIN app_roles r ON u.role_id = r.id WHERE u.id = ?
  ",
        crate::p![s.user_id],
    )?;
    let Some(fresh) = fresh.filter(|f| truthy(&f["is_active"])) else {
        sessions().remove(token);
        return Ok(None);
    };
    let mut map = sessions();
    let Some(entry) = map.get_mut(token) else { return Ok(None) };
    entry.perms = perms_from_row(&fresh);
    entry.role_name = fresh.s("role_name").filter(|s| !s.is_empty()).unwrap_or_else(|| "No role".into());
    Ok(Some(entry.to_json()))
}

pub fn end_app_session(_conn: &Connection, token: &str) -> Result<()> {
    sessions().remove(token);
    Ok(())
}
