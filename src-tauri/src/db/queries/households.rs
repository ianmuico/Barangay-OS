//! Households — port of `main/database/queries/households.ts`.

use crate::db;
use crate::ipc::{truthy, ObjExt};
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

/// JS `data.key || null`.
fn or_null(data: &Map<String, Value>, key: &str) -> Value {
    match data.get(key) {
        Some(v) if truthy(v) => v.clone(),
        _ => Value::Null,
    }
}

pub fn list_households(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let search_raw = if params.is_truthy("search") { params.s("search").unwrap_or_default() } else { String::new() };
    let search = super::residents::js_trim(&search_raw).to_string();
    let where_clause = if !search.is_empty() {
        "WHERE h.household_number LIKE @q OR h.address LIKE @q OR h.purok LIKE @q
        OR (hr.first_name || ' ' || hr.last_name) LIKE @q"
    } else {
        ""
    };
    let sql = format!(
        "
    SELECT h.*,
      CASE WHEN hr.id IS NULL THEN NULL ELSE (hr.first_name || ' ' || hr.last_name) END AS head_name,
      (SELECT COUNT(*) FROM residents m WHERE m.household_id = h.id) AS member_count
    FROM households h
    LEFT JOIN residents hr ON hr.id = h.head_resident_id
    {where_clause}
    ORDER BY h.household_number ASC
  "
    );
    if !search.is_empty() {
        db::all(conn, &sql, json!({ "q": format!("%{search}%") }))
    } else {
        db::all(conn, &sql, ())
    }
}

pub fn get_household_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(
        conn,
        "
    SELECT h.*,
      CASE WHEN hr.id IS NULL THEN NULL ELSE (hr.first_name || ' ' || hr.last_name) END AS head_name,
      (SELECT COUNT(*) FROM residents m WHERE m.household_id = h.id) AS member_count
    FROM households h
    LEFT JOIN residents hr ON hr.id = h.head_resident_id
    WHERE h.id = ?
  ",
        crate::p![id],
    )
}

pub fn get_household_members(conn: &Connection, household_id: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    WHERE household_id = ?
    ORDER BY (id = (SELECT head_resident_id FROM households WHERE id = ?)) DESC, last_name, first_name
  ",
        crate::p![household_id, household_id],
    )
}

pub fn create_household(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let result = db::run(
        conn,
        "INSERT INTO households (household_number, address, purok, housing_type, head_resident_id, household_uid)
     VALUES (?, ?, ?, ?, ?, ?)",
        vec![
            or_null(data, "household_number"),
            data.get("address").cloned().unwrap_or(Value::Null),
            or_null(data, "purok"),
            or_null(data, "housing_type"),
            or_null(data, "head_resident_id"),
            json!(uuid::Uuid::new_v4().to_string()),
        ],
    )?;
    Ok(result.last_insert_rowid)
}

pub fn update_household(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    let allowed = ["household_number", "address", "purok", "housing_type", "head_resident_id"];
    for key in allowed {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }
    if fields.is_empty() {
        return Ok(());
    }
    values.push(json!(id));
    db::run(conn, &format!("UPDATE households SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_household(conn: &Connection, id: i64) -> Result<()> {
    // residents.household_id is ON DELETE SET NULL, so members are detached, not deleted.
    db::run(conn, "DELETE FROM households WHERE id = ?", crate::p![id])?;
    Ok(())
}

// Add or move a resident into a household, with their relationship to the head.
pub fn add_household_member(conn: &Connection, household_id: i64, resident_id: i64, relationship: Option<&str>) -> Result<()> {
    let relationship = relationship.filter(|r| !r.is_empty());
    db::run(
        conn,
        "UPDATE residents SET household_id = ?, relationship_to_head = ?, updated_at = datetime('now') WHERE id = ?",
        crate::p![household_id, relationship, resident_id],
    )?;
    Ok(())
}

pub fn remove_household_member(conn: &Connection, resident_id: i64) -> Result<()> {
    let row = db::get(conn, "SELECT household_id FROM residents WHERE id = ?", crate::p![resident_id])?;
    db::run(
        conn,
        "UPDATE residents SET household_id = NULL, relationship_to_head = NULL, updated_at = datetime('now') WHERE id = ?",
        crate::p![resident_id],
    )?;
    // If this resident was the head, clear the household head.
    if let Some(row) = row.filter(|r| r.is_truthy("household_id")) {
        db::run(
            conn,
            "UPDATE households SET head_resident_id = NULL WHERE id = ? AND head_resident_id = ?",
            vec![row.get("household_id").cloned().unwrap_or(Value::Null), json!(resident_id)],
        )?;
    }
    Ok(())
}

pub fn set_household_head(conn: &Connection, household_id: i64, resident_id: i64) -> Result<()> {
    // Ensure the head is a member of the household.
    db::run(conn, "UPDATE residents SET household_id = ? WHERE id = ?", crate::p![household_id, resident_id])?;
    db::run(conn, "UPDATE households SET head_resident_id = ? WHERE id = ?", crate::p![resident_id, household_id])?;
    db::run(conn, "UPDATE residents SET relationship_to_head = 'Head' WHERE id = ?", crate::p![resident_id])?;
    Ok(())
}
