//! Development projects (BDP) — port of `main/database/queries/devPlan.ts`.

use super::assets::{filter_param, insert_present, like, truthy_param, update_present, where_clause};
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

const FIELDS: &[&str] = &[
    "project_name",
    "sector",
    "description",
    "budget",
    "funding_source",
    "status",
    "start_date",
    "target_date",
    "notes",
];

pub fn list_projects(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut cond: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        cond.push("(project_name LIKE ? OR sector LIKE ? OR description LIKE ? OR funding_source LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        vals.extend([q.clone(), q.clone(), q.clone(), q]);
    }
    if let Some(st) = filter_param(params, "status") {
        cond.push("status = ?".into());
        vals.push(st.clone());
    }
    let where_ = where_clause(&cond);
    db::all(
        conn,
        &format!("SELECT * FROM development_projects {where_} ORDER BY COALESCE(start_date, created_at) DESC, id DESC"),
        vals,
    )
}

pub fn get_project_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM development_projects WHERE id = ?", crate::p![id])
}

pub fn create_project(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    insert_present(conn, "development_projects", &[], Vec::new(), FIELDS, data)
}

pub fn update_project(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    update_present(conn, "development_projects", FIELDS, data, id)
}

pub fn delete_project(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM development_projects WHERE id = ?", crate::p![id])?;
    Ok(())
}
