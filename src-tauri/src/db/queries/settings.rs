use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let v = db::scalar(conn, "SELECT value FROM settings WHERE key = ?", crate::p![key])?;
    Ok(v.as_str().map(|s| s.to_string()))
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    db::run(conn, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", crate::p![key, value])?;
    Ok(())
}

pub fn get_all_settings(conn: &Connection) -> Result<Map<String, Value>> {
    let mut out = Map::new();
    for row in db::all(conn, "SELECT key, value FROM settings", ())? {
        if let (Some(k), Some(v)) = (row["key"].as_str(), row.get("value")) {
            out.insert(k.to_string(), v.clone());
        }
    }
    Ok(out)
}
