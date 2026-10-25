//! Desktop login session (single signed-in user per app instance), login rate
//! limiting, and one-time recovery codes.

use super::{fail, Args, HResult};
use crate::db::{
    self,
    queries::{
        audit::log_audit,
        settings::{get_setting, set_setting},
        users::{get_user_by_username, update_password, SafeUser},
    },
};
use crate::utils::hash::{hash_password, verify_password};
use anyhow::{bail, Result};
use rand::Rng;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const MAX_ATTEMPTS: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(15 * 60);
/// Session timeout: 30 minutes idle.
const SESSION_TIMEOUT: Duration = Duration::from_secs(30 * 60);

struct Session {
    user: Option<SafeUser>,
    last_activity: Option<Instant>,
}

impl Session {
    fn idle_expired(&self) -> bool {
        self.last_activity.is_some_and(|t| t.elapsed() > SESSION_TIMEOUT)
    }
}

static SESSION: Mutex<Session> = Mutex::new(Session { user: None, last_activity: None });

struct Attempts {
    count: u32,
    locked_until: Option<Instant>,
}

static LOGIN_ATTEMPTS: Mutex<Option<HashMap<String, Attempts>>> = Mutex::new(None);
static RECOVERY_ATTEMPTS: Mutex<(u32, Option<Instant>)> = Mutex::new((0, None));

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

/// `getCurrentSessionUser()` — the signed-in user, expiring idle sessions.
/// Bumps the idle timer. Locks the DB only to write the expiry audit row, so
/// call it BEFORE taking `db::conn()` in a handler.
pub fn current_user() -> Option<SafeUser> {
    let mut s = lock(&SESSION);
    let user = s.user.clone()?;
    if s.idle_expired() {
        s.user = None;
        drop(s);
        let conn = db::conn();
        let _ = log_audit(&conn, Some(user.id), "SESSION_EXPIRED", Some(&format!("Session expired for {}", user.username)));
        return None;
    }
    s.last_activity = Some(Instant::now());
    Some(user)
}

/// Signed-in user id, or `None` (`user?.id || null`).
pub fn current_user_id() -> Option<i64> {
    current_user().map(|u| u.id)
}

/// `requireAuth()`.
pub fn require_auth() -> Result<SafeUser> {
    match current_user() {
        Some(u) => Ok(u),
        None => bail!("Not authenticated"),
    }
}

/// `requireAdmin()`.
pub fn require_admin() -> Result<SafeUser> {
    let u = require_auth()?;
    if u.role != "admin" {
        bail!("Admin access required");
    }
    Ok(u)
}

fn record_failed_attempt(username: &str) {
    let mut guard = lock(&LOGIN_ATTEMPTS);
    let map = guard.get_or_insert_with(HashMap::new);
    let count = map.get(username).map(|a| a.count).unwrap_or(0) + 1;
    let locked_until = if count >= MAX_ATTEMPTS { Some(Instant::now() + LOCKOUT) } else { None };
    map.insert(username.to_string(), Attempts { count, locked_until });
}

fn login(a: &Args) -> HResult {
    let username = a.opt_str(0).unwrap_or_default();
    let password = a.opt_str(1).unwrap_or_default();

    // Rate limit check
    {
        let guard = lock(&LOGIN_ATTEMPTS);
        if let Some(until) = guard.as_ref().and_then(|m| m.get(&username)).and_then(|x| x.locked_until) {
            if until > Instant::now() {
                let remaining_min = ((until - Instant::now()).as_secs_f64() / 60.0).ceil() as u64;
                return Ok(fail(format!("Account locked. Try again in {} minute(s).", remaining_min.max(1))));
            }
        }
    }

    let conn = db::conn();
    let Some(user) = get_user_by_username(&conn, &username)? else {
        record_failed_attempt(&username);
        return Ok(fail("Invalid username or password"));
    };

    if !verify_password(&password, &user.password_hash) {
        log_audit(&conn, Some(user.id), "LOGIN_FAILED", Some(&format!("Failed login attempt for {username}")))?;
        record_failed_attempt(&username);
        return Ok(fail("Invalid username or password"));
    }

    // Successful login — clear attempts
    if let Some(m) = lock(&LOGIN_ATTEMPTS).as_mut() {
        m.remove(&username);
    }

    let safe = user.safe();
    {
        let mut s = lock(&SESSION);
        s.user = Some(safe.clone());
        s.last_activity = Some(Instant::now());
    }
    log_audit(&conn, Some(user.id), "LOGIN", Some(&format!("User {username} logged in")))?;

    // Check if using default password — force change
    let must_change = verify_password("admin123", &user.password_hash);
    Ok(json!({ "success": true, "user": safe, "mustChangePassword": must_change }))
}

// ─── Forgotten-password recovery via one-time codes ──────────────────────
// The admin generates codes while logged in, prints them, and keeps them in
// the barangay safe. Each code resets ONE account's password, once.

fn generate_recovery_codes() -> HResult {
    let Some(user) = current_user().filter(|u| u.role == "admin") else {
        return Ok(fail("Admin access required"));
    };

    // 6 codes, unambiguous charset (no 0/O/1/I), format XXXXX-XXXXX
    const CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let mut rng = rand::rngs::OsRng;
    let make_code = |rng: &mut rand::rngs::OsRng| {
        let raw: String = (0..10).map(|_| CHARSET[rng.gen::<u8>() as usize % CHARSET.len()] as char).collect();
        format!("{}-{}", &raw[..5], &raw[5..])
    };
    let codes: Vec<String> = (0..6).map(|_| make_code(&mut rng)).collect();
    let hashes: Vec<String> = codes.iter().map(|c| hash_password(c)).collect();

    let conn = db::conn();
    set_setting(&conn, "recovery_code_hashes", &serde_json::to_string(&hashes)?)?;
    log_audit(&conn, Some(user.id), "RECOVERY_CODES_GENERATED", Some("New recovery codes generated (old codes invalidated)"))?;
    Ok(json!({ "success": true, "codes": codes }))
}

fn stored_hashes(conn: &rusqlite::Connection) -> Vec<String> {
    get_setting(conn, "recovery_code_hashes")
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

fn recovery_status() -> HResult {
    let conn = db::conn();
    Ok(json!({ "remaining": stored_hashes(&conn).len() }))
}

fn recovery_reset(a: &Args) -> HResult {
    let username = a.opt_str(0).unwrap_or_default();
    let code = a.opt_str(1).unwrap_or_default();
    let new_password = a.opt_str(2).unwrap_or_default();

    // Rate limit: 5 attempts then 15-minute lockout (codes are high-entropy,
    // this just makes brute force pointless)
    if lock(&RECOVERY_ATTEMPTS).1.is_some_and(|until| until > Instant::now()) {
        return Ok(fail("Too many attempts. Try again in 15 minutes."));
    }

    let conn = db::conn();
    let fail_attempt = |message: &str| -> HResult {
        let mut ra = lock(&RECOVERY_ATTEMPTS);
        ra.0 += 1;
        if ra.0 >= 5 {
            ra.0 = 0;
            ra.1 = Some(Instant::now() + LOCKOUT);
        }
        log_audit(&conn, None, "RECOVERY_RESET_FAILED", Some(&format!("Failed recovery attempt for \"{username}\"")))?;
        Ok(fail(message))
    };

    if username.is_empty() || code.is_empty() || new_password.is_empty() {
        return fail_attempt("All fields are required");
    }
    if new_password.chars().count() < 6 {
        return Ok(fail("New password must be at least 6 characters"));
    }

    let Some(user) = get_user_by_username(&conn, username.trim())? else {
        return fail_attempt("Invalid username or recovery code");
    };

    let mut hashes = stored_hashes(&conn);
    let normalized = code.trim().to_uppercase();
    let Some(idx) = hashes.iter().position(|h| verify_password(&normalized, h)) else {
        return fail_attempt("Invalid username or recovery code");
    };

    // Consume the code (single-use) and set the new password
    hashes.remove(idx);
    set_setting(&conn, "recovery_code_hashes", &serde_json::to_string(&hashes)?)?;
    update_password(&conn, user.id, &hash_password(&new_password))?;
    lock(&RECOVERY_ATTEMPTS).0 = 0;
    log_audit(
        &conn,
        Some(user.id),
        "RECOVERY_RESET",
        Some(&format!(
            "Password reset for \"{}\" using a recovery code ({} codes remaining)",
            user.username,
            hashes.len()
        )),
    )?;
    Ok(json!({ "success": true, "remaining": hashes.len() }))
}

fn logout() -> HResult {
    let user = lock(&SESSION).user.take();
    if let Some(u) = user {
        let conn = db::conn();
        log_audit(&conn, Some(u.id), "LOGOUT", Some(&format!("User {} logged out", u.username)))?;
    }
    Ok(json!({ "success": true }))
}

fn get_current_user() -> HResult {
    // Check session timeout on every poll (does not bump the idle timer)
    let mut s = lock(&SESSION);
    let Some(user) = s.user.clone() else { return Ok(Value::Null) };
    if s.idle_expired() {
        s.user = None;
        drop(s);
        let conn = db::conn();
        log_audit(&conn, Some(user.id), "SESSION_EXPIRED", Some(&format!("Session expired for {}", user.username)))?;
        return Ok(Value::Null);
    }
    Ok(serde_json::to_value(user)?)
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "auth:login" => login(a),
        "auth:generateRecoveryCodes" => generate_recovery_codes(),
        "auth:recoveryStatus" => recovery_status(),
        "auth:recoveryReset" => recovery_reset(a),
        "auth:logout" => logout(),
        "auth:getCurrentUser" => get_current_user(),
        _ => return None,
    })
}
