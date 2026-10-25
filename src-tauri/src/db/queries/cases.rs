//! Cases (Katarungang Pambarangay), case parties, and summons — port of
//! `main/database/queries/cases.ts`.

use super::assets::{like, opt, or_default, truthy_param, where_clause};
use crate::db;
use crate::ipc::truthy;
use anyhow::Result;
use chrono::Datelike;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

// ─── Cases ────────────────────────────────────────────────────────────────────

pub fn list_cases(conn: &Connection, params: &Map<String, Value>) -> Result<Vec<Value>> {
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(s) = truthy_param(params, "search") {
        conditions.push("(c.case_number LIKE ? OR c.description LIKE ? OR comp.first_name || ' ' || comp.last_name LIKE ? OR resp.first_name || ' ' || resp.last_name LIKE ?
      OR EXISTS (SELECT 1 FROM case_parties p JOIN residents pr ON p.resident_id = pr.id WHERE p.case_id = c.id AND pr.first_name || ' ' || pr.last_name LIKE ?))".into());
        let q = Value::from(like(Some(s)));
        values.extend([q.clone(), q.clone(), q.clone(), q.clone(), q]);
    }

    if let Some(st) = truthy_param(params, "status") {
        conditions.push("c.status = ?".into());
        values.push(st.clone());
    }

    let where_ = where_clause(&conditions);

    let sql = format!(
        "
    SELECT
      c.*,
      COALESCE(comp.first_name || ' ' || comp.last_name || COALESCE(' ' || comp.suffix, ''), '') AS complainant_name,
      COALESCE(resp.first_name || ' ' || resp.last_name || COALESCE(' ' || resp.suffix, ''), '') AS respondent_name,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'complainant'), '') AS complainant_names,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'respondent'), '') AS respondent_names
    FROM cases c
    LEFT JOIN residents comp ON c.complainant_id = comp.id
    LEFT JOIN residents resp ON c.respondent_id = resp.id
    {where_}
    ORDER BY c.filed_date DESC, c.id DESC
  "
    );

    db::all(conn, &sql, values)
}

pub fn get_case_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    let sql = "
    SELECT
      c.*,
      COALESCE(comp.first_name || ' ' || comp.last_name || COALESCE(' ' || comp.suffix, ''), '') AS complainant_name,
      COALESCE(resp.first_name || ' ' || resp.last_name || COALESCE(' ' || resp.suffix, ''), '') AS respondent_name,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'complainant'), '') AS complainant_names,
      COALESCE((SELECT GROUP_CONCAT(pr.first_name || ' ' || pr.last_name || COALESCE(' ' || pr.suffix, ''), ', ')
        FROM case_parties p JOIN residents pr ON p.resident_id = pr.id
        WHERE p.case_id = c.id AND p.role = 'respondent'), '') AS respondent_names
    FROM cases c
    LEFT JOIN residents comp ON c.complainant_id = comp.id
    LEFT JOIN residents resp ON c.respondent_id = resp.id
    WHERE c.id = ?
  ";
    db::get(conn, sql, crate::p![id])
}

/// `data`: `{ case_type, complainant_id?, respondent_id?, description?, filed_date? }`.
pub fn create_case(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    // Auto-generate case_number. Use MAX(existing suffix)+1 rather than COUNT(*)+1 so that
    // deleting a case cannot cause the next create to collide with a still-existing number.
    let year = chrono::Local::now().year();
    let max_row = db::get(
        conn,
        "SELECT MAX(CAST(substr(case_number, 6) AS INTEGER)) as maxn FROM cases WHERE case_number LIKE ?",
        crate::p![format!("{year}-%")],
    )?;
    let maxn = max_row.as_ref().and_then(|r| r.get("maxn")).and_then(crate::ipc::as_i64).unwrap_or(0);
    let num = maxn + 1;
    let case_number = format!("{year}-{num:03}");

    let sql = "
    INSERT INTO cases (case_number, case_type, complainant_id, respondent_id, description, filed_date)
    VALUES (?, ?, ?, ?, ?, ?)
  ";

    // `new Date().toISOString().split('T')[0]` — today's date in UTC.
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let result = db::run(
        conn,
        sql,
        vec![
            Value::from(case_number),
            opt(data, "case_type"),
            opt(data, "complainant_id"),
            opt(data, "respondent_id"),
            opt(data, "description"),
            or_default(data, "filed_date", Value::from(today)),
        ],
    )?;

    Ok(result.last_insert_rowid)
}

/// Returns `{ success: true }`.
pub fn update_case(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<Value> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    for key in [
        "case_type",
        "complainant_id",
        "respondent_id",
        "description",
        "status",
        "filed_date",
        "resolved_date",
        "resolution_notes",
        "nature",
        "kp_stage",
    ] {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }

    if fields.is_empty() {
        return Ok(json!({ "success": true }));
    }

    fields.push("updated_at = datetime('now')".into());
    values.push(Value::from(id));

    let sql = format!("UPDATE cases SET {} WHERE id = ?", fields.join(", "));
    db::run(conn, &sql, values)?;
    Ok(json!({ "success": true }))
}

/// Returns `{ success: true }`.
pub fn delete_case(conn: &Connection, id: i64) -> Result<Value> {
    db::run(conn, "DELETE FROM cases WHERE id = ?", crate::p![id])?;
    Ok(json!({ "success": true }))
}

pub fn get_case_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as count FROM cases WHERE status IN ('pending', 'ongoing')", ())
}

// ─── Case parties (multiple complainants/respondents) ───────────────────────

pub fn list_case_parties(conn: &Connection, case_id: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT p.*, COALESCE(r.first_name || ' ' || r.last_name || COALESCE(' ' || r.suffix, ''), '') AS name
    FROM case_parties p
    LEFT JOIN residents r ON p.resident_id = r.id
    WHERE p.case_id = ?
    ORDER BY p.role ASC, p.id ASC
  ",
        crate::p![case_id],
    )
}

/// Replace all parties for a case and keep the legacy single-party columns in
/// sync (first complainant/respondent) so older documents keep working.
/// `parties`: `[{ resident_id, role: 'complainant' | 'respondent' }]`.
pub fn set_case_parties(conn: &Connection, case_id: i64, parties: &[Value]) -> Result<()> {
    db::transaction(conn, |c| {
        db::run(c, "DELETE FROM case_parties WHERE case_id = ?", crate::p![case_id])?;
        for party in parties {
            let rid = party.get("resident_id").cloned().unwrap_or(Value::Null);
            if !truthy(&rid) {
                continue;
            }
            db::run(
                c,
                "INSERT INTO case_parties (case_id, resident_id, role) VALUES (?, ?, ?)",
                vec![Value::from(case_id), rid, party.get("role").cloned().unwrap_or(Value::Null)],
            )?;
        }
        let first_of = |role: &str| -> Value {
            parties
                .iter()
                .find(|p| p.get("role").and_then(|r| r.as_str()) == Some(role))
                .and_then(|p| p.get("resident_id").cloned())
                .unwrap_or(Value::Null)
        };
        let first_complainant = first_of("complainant");
        let first_respondent = first_of("respondent");
        db::run(
            c,
            "UPDATE cases SET complainant_id = ?, respondent_id = ? WHERE id = ?",
            vec![first_complainant, first_respondent, Value::from(case_id)],
        )?;
        Ok(())
    })
}

// ─── Summons ──────────────────────────────────────────────────────────────────

pub fn list_summons(conn: &Connection, case_id: i64) -> Result<Vec<Value>> {
    let sql = "
    SELECT
      s.*,
      COALESCE(r.first_name || ' ' || r.last_name || COALESCE(' ' || r.suffix, ''), '') AS summoned_name,
      COALESCE(
        (SELECT res.first_name || ' ' || res.last_name FROM officials o JOIN residents res ON o.resident_id = res.id WHERE o.id = s.served_by_official_id),
        ''
      ) AS official_name,
      c.case_number
    FROM summons s
    LEFT JOIN residents r ON s.summoned_resident_id = r.id
    LEFT JOIN cases c ON s.case_id = c.id
    WHERE s.case_id = ?
    ORDER BY s.summon_number ASC, s.summon_date ASC
  ";
    db::all(conn, sql, crate::p![case_id])
}

/// `data`: `{ case_id, summoned_resident_id?, summon_number?, summon_date, summon_time?, status?, served_by_official_id?, notes? }`.
pub fn create_summon(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    // Auto-determine summon_number if not provided
    let mut summon_number = opt(data, "summon_number");
    if !truthy(&summon_number) {
        let result = db::get(
            conn,
            "SELECT COALESCE(MAX(summon_number), 0) + 1 as next FROM summons WHERE case_id = ?",
            vec![opt(data, "case_id")],
        )?;
        summon_number = result.and_then(|r| r.get("next").cloned()).unwrap_or(Value::Null);
    }

    let sql = "
    INSERT INTO summons (case_id, summoned_resident_id, summon_number, summon_date, summon_time, status, served_by_official_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ";

    let result = db::run(
        conn,
        sql,
        vec![
            opt(data, "case_id"),
            opt(data, "summoned_resident_id"),
            summon_number,
            opt(data, "summon_date"),
            opt(data, "summon_time"),
            or_default(data, "status", Value::from("scheduled")),
            opt(data, "served_by_official_id"),
            opt(data, "notes"),
        ],
    )?;

    Ok(result.last_insert_rowid)
}

/// Returns `{ success: true }`.
pub fn update_summon(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<Value> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    for key in [
        "summoned_resident_id",
        "summon_number",
        "summon_date",
        "summon_time",
        "status",
        "served_by_official_id",
        "notes",
    ] {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }

    if fields.is_empty() {
        return Ok(json!({ "success": true }));
    }

    values.push(Value::from(id));
    let sql = format!("UPDATE summons SET {} WHERE id = ?", fields.join(", "));
    db::run(conn, &sql, values)?;
    Ok(json!({ "success": true }))
}

/// Returns `{ success: true }`.
pub fn delete_summon(conn: &Connection, id: i64) -> Result<Value> {
    db::run(conn, "DELETE FROM summons WHERE id = ?", crate::p![id])?;
    Ok(json!({ "success": true }))
}

/// TS default `limit = 10`; callers pass it explicitly.
pub fn get_upcoming_summons(conn: &Connection, limit: i64) -> Result<Vec<Value>> {
    let sql = "
    SELECT
      s.*,
      COALESCE(r.first_name || ' ' || r.last_name || COALESCE(' ' || r.suffix, ''), '') AS summoned_name,
      COALESCE(
        (SELECT res.first_name || ' ' || res.last_name FROM officials o JOIN residents res ON o.resident_id = res.id WHERE o.id = s.served_by_official_id),
        ''
      ) AS official_name,
      c.case_number
    FROM summons s
    LEFT JOIN residents r ON s.summoned_resident_id = r.id
    LEFT JOIN cases c ON s.case_id = c.id
    WHERE s.status = 'scheduled' AND s.summon_date >= date('now')
    ORDER BY s.summon_date ASC, s.summon_time ASC
    LIMIT ?
  ";
    db::all(conn, sql, crate::p![limit])
}
