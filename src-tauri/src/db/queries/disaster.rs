//! Disaster records (BDRIS) — port of `main/database/queries/disaster.ts`.

use super::assets::{filter_param, insert_present, like, truthy_param, update_present, where_clause};
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

const FIELDS: &[&str] = &["record_type", "title", "record_date", "location", "description", "status", "notes"];

pub fn list_disaster(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut cond: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        cond.push("(title LIKE ? OR description LIKE ? OR location LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        vals.extend([q.clone(), q.clone(), q]);
    }
    if let Some(t) = filter_param(params, "record_type") {
        cond.push("record_type = ?".into());
        vals.push(t.clone());
    }
    let where_ = where_clause(&cond);
    db::all(
        conn,
        &format!("SELECT * FROM disaster_records {where_} ORDER BY COALESCE(record_date, created_at) DESC, id DESC"),
        vals,
    )
}

pub fn get_disaster_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM disaster_records WHERE id = ?", crate::p![id])
}

pub fn create_disaster(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    insert_present(conn, "disaster_records", &[], Vec::new(), FIELDS, data)
}

pub fn update_disaster(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    update_present(conn, "disaster_records", FIELDS, data, id)
}

pub fn delete_disaster(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM disaster_records WHERE id = ?", crate::p![id])?;
    Ok(())
}
