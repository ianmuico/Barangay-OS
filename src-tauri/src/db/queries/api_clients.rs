// Per-device API clients for the mobile partner app. Each device/account gets
// its own high-entropy token; we store only a SHA-256 hash. Tokens are random
// enough that an unsalted hash with an indexed exact-match lookup is safe.

use crate::db;
use anyhow::Result;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub fn list_api_clients(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "SELECT id, name, is_active, created_at, last_seen FROM api_clients ORDER BY created_at DESC",
        (),
    )
}

// Returns the one-time plaintext token (shown once) plus the new client id.
/// → `{ id, token }`.
pub fn create_api_client(conn: &Connection, name: &str) -> Result<Value> {
    let mut bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = format!("bmc_{}", URL_SAFE_NO_PAD.encode(bytes)); // barangay mobile client
    let trimmed = name.trim();
    let name = if trimmed.is_empty() { "Mobile device" } else { trimmed };
    let r = db::run(
        conn,
        "INSERT INTO api_clients (name, token_hash) VALUES (?, ?)",
        crate::p![name, hash_token(&token)],
    )?;
    Ok(json!({ "id": r.last_insert_rowid, "token": token }))
}

pub fn set_api_client_active(conn: &Connection, id: i64, active: bool) -> Result<()> {
    db::run(conn, "UPDATE api_clients SET is_active = ? WHERE id = ?", crate::p![if active { 1 } else { 0 }, id])?;
    Ok(())
}

pub fn delete_api_client(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM api_clients WHERE id = ?", crate::p![id])?;
    Ok(())
}

// Resolve a presented token to an active client (or None). Touches last_seen.
/// → `{ id, name }`.
pub fn resolve_api_client(conn: &Connection, token: &str) -> Result<Option<Value>> {
    if token.is_empty() {
        return Ok(None);
    }
    let row = db::get(
        conn,
        "SELECT id, name FROM api_clients WHERE token_hash = ? AND is_active = 1",
        crate::p![hash_token(token)],
    )?;
    if let Some(r) = &row {
        db::run(conn, "UPDATE api_clients SET last_seen = datetime('now') WHERE id = ?", crate::p![r["id"]])?;
    }
    Ok(row)
}
