//! Assets (BAMS) — port of `main/database/queries/assets.ts`.
//!
//! Also hosts the small shared helpers used by the near-identical P2
//! governance CRUD modules (assets, finance, dev_plan, gad, disaster,
//! institutions) and the other record modules. They only reproduce the JS
//! idioms the TS used (`x ?? null`, `x || 'default'`, `!== undefined`
//! field filters, `${x}` string conversion) — SQL stays verbatim per module.

use crate::db;
use crate::ipc::truthy;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

// ─── Shared helpers (crate-internal) ────────────────────────────────────────

/// JS `String(v)` / template-literal conversion of a JSON value.
pub(crate) fn js_str(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => {
            if n.is_i64() || n.is_u64() {
                n.to_string()
            } else {
                match n.as_f64() {
                    Some(f) if f.fract() == 0.0 && f.abs() < 1e21 => format!("{}", f as i64),
                    Some(f) => f.to_string(),
                    None => n.to_string(),
                }
            }
        }
        Some(Value::Array(a)) => a
            .iter()
            .map(|x| match x {
                Value::Null => String::new(),
                other => js_str(Some(other)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}

/// `` `%${v}%` `` — LIKE pattern from a search value.
pub(crate) fn like(v: Option<&Value>) -> String {
    format!("%{}%", js_str(v))
}

/// `data.key ?? null`.
pub(crate) fn opt(data: &Map<String, Value>, key: &str) -> Value {
    data.get(key).cloned().unwrap_or(Value::Null)
}

/// `data.key || fallback` (JS truthiness).
pub(crate) fn or_default(data: &Map<String, Value>, key: &str, fallback: Value) -> Value {
    match data.get(key) {
        Some(v) if truthy(v) => v.clone(),
        _ => fallback,
    }
}

/// `params?.key` when truthy (e.g. `if (params?.search)`).
pub(crate) fn truthy_param<'a>(params: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    params.get(key).filter(|v| truthy(v))
}

/// `params?.key && params.key !== 'all'`.
pub(crate) fn filter_param<'a>(params: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    truthy_param(params, key).filter(|v| v.as_str() != Some("all"))
}

/// `FIELDS.filter((f) => data[f] !== undefined)` → INSERT of the present
/// columns, optionally preceded by fixed leading columns (e.g. a uid).
pub(crate) fn insert_present(
    conn: &Connection,
    table: &str,
    lead_cols: &[&str],
    lead_vals: Vec<Value>,
    fields: &[&str],
    data: &Map<String, Value>,
) -> Result<i64> {
    let cols: Vec<&str> = fields.iter().copied().filter(|f| data.contains_key(*f)).collect();
    let all_cols: Vec<&str> = lead_cols.iter().copied().chain(cols.iter().copied()).collect();
    let placeholders: Vec<&str> = all_cols.iter().map(|_| "?").collect();
    let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, all_cols.join(", "), placeholders.join(", "));
    let mut vals = lead_vals;
    vals.extend(cols.iter().map(|c| opt(data, c)));
    let res = db::run(conn, &sql, vals)?;
    Ok(res.last_insert_rowid)
}

/// `for (const f of FIELDS) if (data[f] !== undefined) ...` → UPDATE of the
/// present columns plus `updated_at = datetime('now')`; no-op when none.
pub(crate) fn update_present(
    conn: &Connection,
    table: &str,
    fields: &[&str],
    data: &Map<String, Value>,
    id: i64,
) -> Result<()> {
    let mut set: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    for f in fields {
        if let Some(v) = data.get(*f) {
            set.push(format!("{f} = ?"));
            vals.push(v.clone());
        }
    }
    if set.is_empty() {
        return Ok(());
    }
    set.push("updated_at = datetime('now')".to_string());
    vals.push(Value::from(id));
    db::run(conn, &format!("UPDATE {} SET {} WHERE id = ?", table, set.join(", ")), vals)?;
    Ok(())
}

/// `WHERE cond1 AND cond2` or empty.
pub(crate) fn where_clause(cond: &[String]) -> String {
    if cond.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", cond.join(" AND "))
    }
}

// ─── Assets ─────────────────────────────────────────────────────────────────

const FIELDS: &[&str] = &[
    "item_name",
    "category",
    "description",
    "acquisition_date",
    "acquisition_cost",
    "quantity",
    "unit",
    "location",
    "condition",
    "custodian",
    "notes",
];

pub fn list_assets(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut cond: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        cond.push("(item_name LIKE ? OR description LIKE ? OR location LIKE ? OR custodian LIKE ?)".into());
        let q = Value::from(like(Some(s)));
        vals.extend([q.clone(), q.clone(), q.clone(), q]);
    }
    if let Some(c) = filter_param(params, "category") {
        cond.push("category = ?".into());
        vals.push(c.clone());
    }
    let where_ = where_clause(&cond);
    db::all(conn, &format!("SELECT * FROM assets {where_} ORDER BY item_name ASC"), vals)
}

pub fn get_asset_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM assets WHERE id = ?", crate::p![id])
}

pub fn create_asset(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    insert_present(
        conn,
        "assets",
        &["asset_uid"],
        vec![Value::from(uuid::Uuid::new_v4().to_string())],
        FIELDS,
        data,
    )
}

pub fn update_asset(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    update_present(conn, "assets", FIELDS, data, id)
}

pub fn delete_asset(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM assets WHERE id = ?", crate::p![id])?;
    Ok(())
}
