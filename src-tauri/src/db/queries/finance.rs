//! Finance (BFMS) — port of `main/database/queries/finance.ts`.

use super::assets::{filter_param, insert_present, like, truthy_param, update_present, where_clause};
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

const FIELDS: &[&str] = &["fiscal_year", "category", "account", "description", "amount", "entry_date", "reference_no", "notes"];

pub fn list_financial_records(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut cond: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        cond.push("(account LIKE ? OR description LIKE ? OR reference_no LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        vals.extend([q.clone(), q.clone(), q]);
    }
    if let Some(c) = filter_param(params, "category") {
        cond.push("category = ?".into());
        vals.push(c.clone());
    }
    let where_ = where_clause(&cond);
    db::all(
        conn,
        &format!("SELECT * FROM financial_records {where_} ORDER BY COALESCE(entry_date, created_at) DESC, id DESC"),
        vals,
    )
}

pub fn get_financial_record_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM financial_records WHERE id = ?", crate::p![id])
}

pub fn create_financial_record(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    insert_present(conn, "financial_records", &[], Vec::new(), FIELDS, data)
}

pub fn update_financial_record(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    update_present(conn, "financial_records", FIELDS, data, id)
}

pub fn delete_financial_record(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM financial_records WHERE id = ?", crate::p![id])?;
    Ok(())
}

/// Totals by category for the current-year summary.
pub fn get_financial_summary(conn: &Connection, fiscal_year: Option<i64>) -> Result<Vec<Value>> {
    // `fiscalYear ? ... : ...` — 0 is falsy in JS.
    let fy = fiscal_year.filter(|y| *y != 0);
    let where_ = if fy.is_some() { "WHERE fiscal_year = ?" } else { "" };
    let args: Vec<Value> = fy.map(|y| vec![Value::from(y)]).unwrap_or_default();
    db::all(
        conn,
        &format!("SELECT category, COALESCE(SUM(amount), 0) as total FROM financial_records {where_} GROUP BY category"),
        args,
    )
}
