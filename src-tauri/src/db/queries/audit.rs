use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::Value;

pub fn log_audit(conn: &Connection, user_id: Option<i64>, action: &str, details: Option<&str>) -> Result<()> {
    let details = details.filter(|d| !d.is_empty());
    db::run(
        conn,
        "INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)",
        crate::p![user_id, action, details],
    )?;
    Ok(())
}

pub fn get_audit_log(conn: &Connection, limit: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "SELECT a.*, u.username
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?",
        crate::p![limit],
    )
}
