//! GAD (BGADPBMS) — port of `main/database/queries/gad.ts`.

use super::assets::{filter_param, insert_present, like, truthy_param, update_present, where_clause};
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

const FIELDS: &[&str] = &["fiscal_year", "program", "activity", "budget_amount", "gad_amount", "status", "accomplishment", "notes"];

pub fn list_gad(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut cond: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        cond.push("(program LIKE ? OR activity LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        vals.extend([q.clone(), q]);
    }
    if let Some(st) = filter_param(params, "status") {
        cond.push("status = ?".into());
        vals.push(st.clone());
    }
    let where_ = where_clause(&cond);
    db::all(conn, &format!("SELECT * FROM gad_entries {where_} ORDER BY fiscal_year DESC, id DESC"), vals)
}

pub fn get_gad_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM gad_entries WHERE id = ?", crate::p![id])
}

pub fn create_gad(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    insert_present(conn, "gad_entries", &[], Vec::new(), FIELDS, data)
}

pub fn update_gad(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    update_present(conn, "gad_entries", FIELDS, data, id)
}

pub fn delete_gad(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM gad_entries WHERE id = ?", crate::p![id])?;
    Ok(())
}
