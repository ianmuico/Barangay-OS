//! Blotter / incident registry + VAW desk — port of
//! `main/database/queries/blotter.ts`.

use super::assets::{like, opt, or_default, truthy_param, where_clause};
use crate::db;
use crate::ipc::truthy;
use anyhow::Result;
use chrono::Datelike;
use rusqlite::Connection;
use serde_json::{Map, Value};

pub fn list_blotter(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        conditions.push(
            "(entry_no LIKE ? OR reported_by LIKE ? OR respondent LIKE ? OR narrative LIKE ? OR location LIKE ?)".into(),
        );
        let q = Value::from(like(Some(s)));
        values.extend([q.clone(), q.clone(), q.clone(), q.clone(), q]);
    }
    if let Some(cat) = super::assets::filter_param(params, "category") {
        if cat.as_str() == Some("vawc") {
            conditions.push("is_vawc = 1".into());
        } else {
            conditions.push("category = ?".into());
            values.push(cat.clone());
        }
    }
    let where_ = where_clause(&conditions);
    db::all(
        conn,
        &format!(
            "
    SELECT * FROM blotter
    {where_}
    ORDER BY COALESCE(incident_date, created_at) DESC, id DESC
  "
        ),
        values,
    )
}

pub fn get_blotter_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM blotter WHERE id = ?", crate::p![id])
}

pub fn create_blotter(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let year = chrono::Local::now().year();
    let max_row = db::get(
        conn,
        "SELECT MAX(CAST(substr(entry_no, 6) AS INTEGER)) as maxn FROM blotter WHERE entry_no LIKE ?",
        crate::p![format!("{year}-%")],
    )?;
    let maxn = max_row.as_ref().and_then(|r| r.get("maxn")).and_then(crate::ipc::as_i64).unwrap_or(0);
    let entry_no = format!("{year}-{:03}", maxn + 1);
    let is_vawc = data.get("category").and_then(|v| v.as_str()) == Some("vawc")
        || data.get("is_vawc").map(truthy).unwrap_or(false);
    let result = db::run(
        conn,
        "
    INSERT INTO blotter (blotter_uid, entry_no, category, incident_date, incident_time, location,
      reported_by, respondent, narrative, action_taken, status, is_vawc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ",
        vec![
            Value::from(uuid::Uuid::new_v4().to_string()),
            Value::from(entry_no),
            or_default(data, "category", Value::from("incident")),
            opt(data, "incident_date"),
            opt(data, "incident_time"),
            opt(data, "location"),
            opt(data, "reported_by"),
            opt(data, "respondent"),
            opt(data, "narrative"),
            opt(data, "action_taken"),
            or_default(data, "status", Value::from("open")),
            Value::from(if is_vawc { 1 } else { 0 }),
        ],
    )?;
    Ok(result.last_insert_rowid)
}

pub fn update_blotter(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    for key in [
        "category",
        "incident_date",
        "incident_time",
        "location",
        "reported_by",
        "respondent",
        "narrative",
        "action_taken",
        "status",
        "is_vawc",
    ] {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }
    // Keep is_vawc consistent with a VAWC category.
    if data.get("category").and_then(|v| v.as_str()) == Some("vawc") {
        fields.push("is_vawc = ?".into());
        values.push(Value::from(1));
    }
    if fields.is_empty() {
        return Ok(());
    }
    fields.push("updated_at = datetime('now')".into());
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE blotter SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_blotter(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM blotter WHERE id = ?", crate::p![id])?;
    Ok(())
}
