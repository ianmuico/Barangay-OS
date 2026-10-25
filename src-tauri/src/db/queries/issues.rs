//! Resident issues (behavior flags) — port of `main/database/queries/issues.ts`.

use super::assets::opt;
use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

pub fn list_issues_for_resident(conn: &Connection, resident_id: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "SELECT * FROM resident_issues WHERE resident_id = ? ORDER BY status ASC, created_at DESC",
        crate::p![resident_id],
    )
}

/// `data`: `{ resident_id, title, details?, created_by }`.
pub fn create_issue(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let result = db::run(
        conn,
        "INSERT INTO resident_issues (resident_id, title, details, created_by) VALUES (?, ?, ?, ?)",
        vec![opt(data, "resident_id"), opt(data, "title"), opt(data, "details"), opt(data, "created_by")],
    )?;
    Ok(result.last_insert_rowid)
}

pub fn update_issue(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    if let Some(v) = data.get("title") {
        fields.push("title = ?".into());
        values.push(v.clone());
    }
    if let Some(v) = data.get("details") {
        fields.push("details = ?".into());
        values.push(v.clone());
    }
    if let Some(v) = data.get("status") {
        fields.push("status = ?".into());
        values.push(v.clone());
        fields.push(if v.as_str() == Some("resolved") {
            "resolved_at = datetime('now')".into()
        } else {
            "resolved_at = NULL".into()
        });
    }
    if fields.is_empty() {
        return Ok(());
    }
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE resident_issues SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_issue(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM resident_issues WHERE id = ?", crate::p![id])?;
    Ok(())
}

/// Watchlist: every resident with at least one open issue (plus their case count)
pub fn list_flagged_residents(conn: &Connection, search: Option<&str>) -> Result<Vec<Value>> {
    let search = search.filter(|s| !s.is_empty());
    let conditions = if search.is_some() { "AND (r.first_name LIKE @q OR r.last_name LIKE @q)" } else { "" };
    let params = match search {
        Some(s) => json!({ "q": format!("%{s}%") }),
        None => json!({}),
    };
    db::all(
        conn,
        &format!(
            "
    SELECT r.id, r.first_name, r.middle_name, r.last_name, r.suffix, r.gender, r.purok,
      SUM(CASE WHEN i.status = 'open' THEN 1 ELSE 0 END) as open_issues,
      COUNT(i.id) as total_issues,
      (SELECT COUNT(*) FROM case_parties p WHERE p.resident_id = r.id) +
        (SELECT COUNT(*) FROM cases c WHERE (c.complainant_id = r.id OR c.respondent_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM case_parties p2 WHERE p2.case_id = c.id)) as case_count,
      (SELECT title FROM resident_issues i2 WHERE i2.resident_id = r.id ORDER BY i2.created_at DESC LIMIT 1) as latest_issue,
      (SELECT created_at FROM resident_issues i3 WHERE i3.resident_id = r.id ORDER BY i3.created_at DESC LIMIT 1) as latest_issue_at
    FROM residents r
    JOIN resident_issues i ON i.resident_id = r.id
    WHERE 1=1 {conditions}
    GROUP BY r.id
    HAVING SUM(CASE WHEN i.status = 'open' THEN 1 ELSE 0 END) > 0
    ORDER BY latest_issue_at DESC
  "
        ),
        params,
    )
}
