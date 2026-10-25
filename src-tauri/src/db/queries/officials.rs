//! Barangay officials — port of `main/database/queries/officials.ts`.

use super::assets::or_default;
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

pub fn list_officials(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT o.*, r.first_name, r.last_name, r.middle_name, r.suffix, r.photo_path
    FROM officials o
    LEFT JOIN residents r ON o.resident_id = r.id
    ORDER BY o.sort_order ASC, o.created_at ASC
  ",
        (),
    )
}

pub fn get_official_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(
        conn,
        "
    SELECT o.*, r.first_name, r.last_name, r.middle_name, r.suffix, r.photo_path
    FROM officials o
    LEFT JOIN residents r ON o.resident_id = r.id
    WHERE o.id = ?
  ",
        crate::p![id],
    )
}

/// `data`: `{ resident_id, position, start_date?, end_date?, sort_order? }`.
pub fn create_official(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let result = db::run(
        conn,
        "
    INSERT INTO officials (resident_id, position, start_date, end_date, sort_order)
    VALUES (?, ?, ?, ?, ?)
  ",
        vec![
            data.get("resident_id").cloned().unwrap_or(Value::Null),
            data.get("position").cloned().unwrap_or(Value::Null),
            or_default(data, "start_date", Value::Null),
            or_default(data, "end_date", Value::Null),
            or_default(data, "sort_order", Value::from(0)),
        ],
    )?;
    Ok(result.last_insert_rowid)
}

pub fn update_official(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    const ALLOWED_FIELDS: &[&str] = &["resident_id", "position", "start_date", "end_date", "is_active", "sort_order"];
    for (key, value) in data {
        if ALLOWED_FIELDS.contains(&key.as_str()) {
            fields.push(format!("{key} = ?"));
            values.push(value.clone());
        }
    }

    if fields.is_empty() {
        return Ok(());
    }
    fields.push("updated_at = datetime('now')".into());
    values.push(Value::from(id));

    db::run(conn, &format!("UPDATE officials SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_official(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM officials WHERE id = ?", crate::p![id])?;
    Ok(())
}
