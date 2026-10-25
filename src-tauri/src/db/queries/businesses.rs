//! Businesses and outside (non-resident) owners — port of
//! `main/database/queries/businesses.ts`.

use super::assets::{filter_param, like, opt, or_default, truthy_param, where_clause};
use crate::db;
use crate::ipc::truthy;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

const OWNER_NAME_SQL: &str = "
  COALESCE(
    (SELECT GROUP_CONCAT(COALESCE(
        res.first_name || ' ' || res.last_name || COALESCE(' ' || res.suffix, ''),
        oo.first_name || ' ' || oo.last_name || COALESCE(' ' || oo.suffix, '')
      ), ', ')
      FROM business_owners bo
      LEFT JOIN residents res ON bo.resident_id = res.id
      LEFT JOIN outside_owners oo ON bo.outside_owner_id = oo.id
      WHERE bo.business_id = b.id), ''
  ) as owner_names";

pub fn list_businesses(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(s) = truthy_param(params, "search") {
        conditions.push(
            "(b.name LIKE ? OR b.nature LIKE ? OR b.address LIKE ? OR EXISTS (
      SELECT 1 FROM business_owners bo
      LEFT JOIN residents res ON bo.resident_id = res.id
      LEFT JOIN outside_owners oo ON bo.outside_owner_id = oo.id
      WHERE bo.business_id = b.id AND (
        res.first_name || ' ' || res.last_name LIKE ? OR oo.first_name || ' ' || oo.last_name LIKE ?
      )))"
                .into(),
        );
        let q = Value::from(like(Some(s)));
        values.extend([q.clone(), q.clone(), q.clone(), q.clone(), q]);
    }
    if let Some(st) = filter_param(params, "status") {
        conditions.push("b.status = ?".into());
        values.push(st.clone());
    }
    let where_ = where_clause(&conditions);
    db::all(
        conn,
        &format!(
            "
    SELECT b.*, {OWNER_NAME_SQL},
      CASE
        WHEN b.permit_expiry_date IS NULL OR b.permit_expiry_date = '' THEN NULL
        WHEN b.permit_expiry_date < date('now') THEN 'expired'
        WHEN b.permit_expiry_date <= date('now', '+30 days') THEN 'expiring'
        ELSE 'valid'
      END as permit_state
    FROM businesses b
    {where_}
    ORDER BY b.name ASC
  "
        ),
        values,
    )
}

pub fn get_business_owners(conn: &Connection, business_id: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT bo.*,
      COALESCE(
        res.first_name || ' ' || res.last_name || COALESCE(' ' || res.suffix, ''),
        oo.first_name || ' ' || oo.last_name || COALESCE(' ' || oo.suffix, '')
      ) as name,
      CASE WHEN bo.outside_owner_id IS NOT NULL THEN 1 ELSE 0 END as is_outside
    FROM business_owners bo
    LEFT JOIN residents res ON bo.resident_id = res.id
    LEFT JOIN outside_owners oo ON bo.outside_owner_id = oo.id
    WHERE bo.business_id = ?
    ORDER BY bo.id ASC
  ",
        crate::p![business_id],
    )
}

/// `owners`: `[{ resident_id?, outside_owner_id? }]`.
pub fn create_business(conn: &Connection, data: &Map<String, Value>, owners: &[Value]) -> Result<i64> {
    db::transaction(conn, |c| {
        let result = db::run(
            c,
            "
      INSERT INTO businesses (name, nature, address, purok, status, date_registered, notes,
        permit_number, permit_issued_date, permit_expiry_date, permit_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ",
            vec![
                opt(data, "name"),
                opt(data, "nature"),
                opt(data, "address"),
                opt(data, "purok"),
                or_default(data, "status", Value::from("active")),
                opt(data, "date_registered"),
                opt(data, "notes"),
                opt(data, "permit_number"),
                opt(data, "permit_issued_date"),
                opt(data, "permit_expiry_date"),
                opt(data, "permit_fee"),
            ],
        )?;
        let id = result.last_insert_rowid;
        set_owners_inner(c, id, owners)?;
        Ok(id)
    })
}

pub fn update_business(conn: &Connection, id: i64, data: &Map<String, Value>, owners: Option<&[Value]>) -> Result<()> {
    db::transaction(conn, |c| {
        let mut fields: Vec<String> = Vec::new();
        let mut values: Vec<Value> = Vec::new();
        for key in [
            "name",
            "nature",
            "address",
            "purok",
            "status",
            "date_registered",
            "notes",
            "permit_number",
            "permit_issued_date",
            "permit_expiry_date",
            "permit_fee",
        ] {
            if let Some(v) = data.get(key) {
                fields.push(format!("{key} = ?"));
                values.push(v.clone());
            }
        }
        if !fields.is_empty() {
            fields.push("updated_at = datetime('now')".into());
            values.push(Value::from(id));
            db::run(c, &format!("UPDATE businesses SET {} WHERE id = ?", fields.join(", ")), values)?;
        }
        if let Some(o) = owners {
            set_owners_inner(c, id, o)?;
        }
        Ok(())
    })
}

fn set_owners_inner(conn: &Connection, business_id: i64, owners: &[Value]) -> Result<()> {
    db::run(conn, "DELETE FROM business_owners WHERE business_id = ?", crate::p![business_id])?;
    for o in owners {
        let rid = o.get("resident_id").cloned().unwrap_or(Value::Null);
        let oid = o.get("outside_owner_id").cloned().unwrap_or(Value::Null);
        if !truthy(&rid) && !truthy(&oid) {
            continue;
        }
        db::run(
            conn,
            "INSERT INTO business_owners (business_id, resident_id, outside_owner_id) VALUES (?, ?, ?)",
            vec![Value::from(business_id), rid, oid],
        )?;
    }
    Ok(())
}

pub fn delete_business(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM businesses WHERE id = ?", crate::p![id])?;
    Ok(())
}

// ─── Outside owners ──────────────────────────────────────────────────────────

pub fn list_outside_owners(conn: &Connection, search: Option<&str>) -> Result<Vec<Value>> {
    let search = search.filter(|s| !s.is_empty());
    let where_ = if search.is_some() {
        "WHERE o.first_name LIKE @q OR o.last_name LIKE @q OR o.address LIKE @q"
    } else {
        ""
    };
    let params = match search {
        Some(s) => json!({ "q": format!("%{s}%") }),
        None => json!({}),
    };
    db::all(
        conn,
        &format!(
            "
    SELECT o.*,
      COALESCE((SELECT GROUP_CONCAT(b.name, ', ') FROM business_owners bo JOIN businesses b ON bo.business_id = b.id WHERE bo.outside_owner_id = o.id), '') as business_names
    FROM outside_owners o
    {where_}
    ORDER BY o.last_name ASC, o.first_name ASC
  "
        ),
        params,
    )
}

pub fn create_outside_owner(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let result = db::run(
        conn,
        "
    INSERT INTO outside_owners (first_name, middle_name, last_name, suffix, gender, birth_date, address, contact_number, email, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ",
        vec![
            opt(data, "first_name"),
            opt(data, "middle_name"),
            opt(data, "last_name"),
            opt(data, "suffix"),
            opt(data, "gender"),
            opt(data, "birth_date"),
            opt(data, "address"),
            opt(data, "contact_number"),
            opt(data, "email"),
            opt(data, "notes"),
        ],
    )?;
    Ok(result.last_insert_rowid)
}

pub fn update_outside_owner(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    for key in [
        "first_name",
        "middle_name",
        "last_name",
        "suffix",
        "gender",
        "birth_date",
        "address",
        "contact_number",
        "email",
        "notes",
    ] {
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
    db::run(conn, &format!("UPDATE outside_owners SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_outside_owner(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM outside_owners WHERE id = ?", crate::p![id])?;
    Ok(())
}
