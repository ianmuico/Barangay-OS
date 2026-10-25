//! Issuances (BORIS: ordinances / resolutions / executive orders) — port of
//! `main/database/queries/issuances.ts`.

use super::assets::{filter_param, like, opt, or_default, truthy_param, where_clause};
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

pub fn list_issuances(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        conditions.push("(title LIKE ? OR reference_no LIKE ? OR author LIKE ? OR full_text LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        values.extend([q.clone(), q.clone(), q.clone(), q]);
    }
    if let Some(t) = filter_param(params, "type") {
        conditions.push("type = ?".into());
        values.push(t.clone());
    }
    let where_ = where_clause(&conditions);
    db::all(
        conn,
        &format!(
            "
    SELECT * FROM issuances
    {where_}
    ORDER BY COALESCE(date_enacted, created_at) DESC, id DESC
  "
        ),
        values,
    )
}

pub fn get_issuance_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM issuances WHERE id = ?", crate::p![id])
}

pub fn create_issuance(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let result = db::run(
        conn,
        "
    INSERT INTO issuances (issuance_uid, type, reference_no, title, date_enacted, author, status, full_text, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ",
        vec![
            Value::from(uuid::Uuid::new_v4().to_string()),
            or_default(data, "type", Value::from("ordinance")),
            opt(data, "reference_no"),
            opt(data, "title"),
            opt(data, "date_enacted"),
            opt(data, "author"),
            or_default(data, "status", Value::from("enacted")),
            opt(data, "full_text"),
            opt(data, "notes"),
        ],
    )?;
    Ok(result.last_insert_rowid)
}

pub fn update_issuance(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    for key in ["type", "reference_no", "title", "date_enacted", "author", "status", "full_text", "notes"] {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }
    if fields.is_empty() {
        return Ok(());
    }
    fields.push("updated_at = datetime('now')".into());
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE issuances SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_issuance(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM issuances WHERE id = ?", crate::p![id])?;
    Ok(())
}
