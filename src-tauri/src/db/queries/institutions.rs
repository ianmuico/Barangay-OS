//! Institutions (BBI) — port of `main/database/queries/institutions.ts`.

use super::assets::{filter_param, insert_present, like, truthy_param, update_present, where_clause};
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

const FIELDS: &[&str] = &["name", "type", "head_name", "contact", "members_count", "description", "notes"];

pub fn list_institutions(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut cond: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        cond.push("(name LIKE ? OR head_name LIKE ? OR description LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        vals.extend([q.clone(), q.clone(), q]);
    }
    if let Some(t) = filter_param(params, "type") {
        cond.push("type = ?".into());
        vals.push(t.clone());
    }
    let where_ = where_clause(&cond);
    db::all(conn, &format!("SELECT * FROM institutions {where_} ORDER BY name ASC"), vals)
}

pub fn get_institution_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM institutions WHERE id = ?", crate::p![id])
}

pub fn create_institution(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    insert_present(conn, "institutions", &[], Vec::new(), FIELDS, data)
}

pub fn update_institution(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    update_present(conn, "institutions", FIELDS, data, id)
}

pub fn delete_institution(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM institutions WHERE id = ?", crate::p![id])?;
    Ok(())
}
