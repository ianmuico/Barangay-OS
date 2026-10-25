use crate::db;
use crate::ipc::{truthy, ObjExt};
use anyhow::Result;
use chrono::Datelike;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

fn field(data: &Map<String, Value>, key: &str) -> Value {
    data.get(key).cloned().unwrap_or(Value::Null)
}

pub fn list_generated_reports(conn: &Connection, resident_id: Option<i64>) -> Result<Vec<Value>> {
    let resident_id = resident_id.filter(|id| *id != 0);
    let query = format!(
        "
    SELECT gr.*, rt.name as template_name,
      (r.first_name || ' ' || r.last_name) as resident_name
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    {}
    ORDER BY gr.generated_at DESC
  ",
        if resident_id.is_some() { "WHERE gr.resident_id = ?" } else { "" }
    );

    if let Some(id) = resident_id {
        return db::all(conn, &query, crate::p![id]);
    }
    db::all(conn, &query, ())
}

// Saved documents for a case (record, narrative, summons notice, custom docs)
pub fn list_case_documents(conn: &Connection, case_id: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT gr.*, rt.name as template_name,
      (r.first_name || ' ' || r.last_name) as resident_name
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    WHERE gr.case_id = ?
    ORDER BY gr.generated_at DESC
  ",
        crate::p![case_id],
    )
}

/// `data`: `{ template_id?, resident_id?, case_id?, business_id?, title?,
/// content_html, generated_by, control_number? }`.
pub fn create_generated_report(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let r = db::run(
        conn,
        "INSERT INTO generated_reports (template_id, resident_id, case_id, business_id, title, content_html, generated_by, control_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            field(data, "template_id"),
            field(data, "resident_id"),
            field(data, "case_id"),
            field(data, "business_id"),
            field(data, "title"),
            field(data, "content_html"),
            field(data, "generated_by"),
            field(data, "control_number"),
        ],
    )?;
    Ok(r.last_insert_rowid)
}

// Allocate the next per-year control number for a document type (e.g. "Barangay Clearance").
// Format: YYYY-NNNNN, reset each year. Atomic via a transaction + upsert.
pub fn next_control_number(conn: &Connection, doc_type: &str) -> Result<String> {
    let year = chrono::Local::now().year() as i64;
    let n = db::transaction(conn, |c| {
        db::run(
            c,
            "INSERT INTO cert_sequences (doc_type, year, last_no) VALUES (?, ?, 0) ON CONFLICT(doc_type, year) DO NOTHING",
            crate::p![doc_type, year],
        )?;
        db::run(
            c,
            "UPDATE cert_sequences SET last_no = last_no + 1 WHERE doc_type = ? AND year = ?",
            crate::p![doc_type, year],
        )?;
        db::count(c, "SELECT last_no FROM cert_sequences WHERE doc_type = ? AND year = ?", crate::p![doc_type, year])
    })?;
    Ok(format!("{year}-{n:05}"))
}

// Void (soft-cancel) an issued document — kept in the register, marked voided.
pub fn void_generated_report(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "UPDATE generated_reports SET voided = 1 WHERE id = ?", crate::p![id])?;
    Ok(())
}

pub fn get_generated_report_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(
        conn,
        "
    SELECT gr.*, rt.name as template_name,
      (r.first_name || ' ' || r.last_name) as resident_name
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    WHERE gr.id = ?
  ",
        crate::p![id],
    )
}

// Re-saving an edited document updates it in place (no duplicate copies)
pub fn update_generated_report(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    for key in ["title", "content_html"] {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }
    if fields.is_empty() {
        return Ok(());
    }
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE generated_reports SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_generated_report(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM generated_reports WHERE id = ?", crate::p![id])?;
    Ok(())
}

// Library listing — excludes content_html so thousands of rows stay light.
/// `params`: `{ search?, type?: 'all'|'resident'|'case'|'business', page?, limit? }`
/// → `{ data, total, page, totalPages }`.
pub fn list_documents(conn: &Connection, params: &Map<String, Value>) -> Result<Value> {
    let page = params.i("page").filter(|p| *p != 0).unwrap_or(1).max(1);
    let limit = params.i("limit").filter(|l| *l != 0).unwrap_or(25).clamp(1, 100);
    let mut conditions: Vec<&str> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if params.get("search").map(truthy).unwrap_or(false) {
        conditions.push("(gr.title LIKE ? OR rt.name LIKE ? OR (r.first_name || ' ' || r.last_name) LIKE ? OR c.case_number LIKE ? OR b.name LIKE ?)");
        let q = Value::from(format!("%{}%", params.s("search").unwrap_or_default()));
        for _ in 0..5 {
            values.push(q.clone());
        }
    }
    match params.s("type").as_deref() {
        Some("resident") => conditions.push("gr.resident_id IS NOT NULL"),
        Some("case") => conditions.push("gr.case_id IS NOT NULL"),
        Some("business") => conditions.push("gr.business_id IS NOT NULL"),
        _ => {}
    }

    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
    let base = format!(
        "
    FROM generated_reports gr
    LEFT JOIN report_templates rt ON gr.template_id = rt.id
    LEFT JOIN residents r ON gr.resident_id = r.id
    LEFT JOIN cases c ON gr.case_id = c.id
    LEFT JOIN businesses b ON gr.business_id = b.id
    {where_clause}
  "
    );
    let total = db::count(conn, &format!("SELECT COUNT(*) as n {base}"), values.clone())?;
    let mut data_values = values;
    data_values.push(Value::from(limit));
    data_values.push(Value::from((page - 1) * limit));
    let data = db::all(
        conn,
        &format!(
            "
    SELECT gr.id, gr.title, rt.name as template_name, gr.resident_id,
      (r.first_name || ' ' || r.last_name) as resident_name,
      gr.case_id, c.case_number,
      gr.business_id, b.name as business_name,
      gr.control_number, gr.voided,
      LENGTH(gr.content_html) as size_bytes, gr.generated_at
    {base}
    ORDER BY gr.generated_at DESC
    LIMIT ? OFFSET ?
  "
        ),
        data_values,
    )?;

    let total_pages = ((total + limit - 1) / limit).max(1);
    Ok(json!({ "data": data, "total": total, "page": page, "totalPages": total_pages }))
}

// ─── Storage failsafe ────────────────────────────────────────────────────────
// content_html is the bulky part (custom documents with embedded images can be
// megabytes). These power the Storage card in Settings → Backup.

/// → `{ count, totalBytes, oldest }`.
pub fn get_report_storage_stats(conn: &Connection) -> Result<Value> {
    Ok(db::get(
        conn,
        "SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(content_html)), 0) as totalBytes, MIN(generated_at) as oldest FROM generated_reports",
        (),
    )?
    .unwrap_or(Value::Null))
}

// Deletes only the stored DOCUMENTS — resident/case records stay untouched.
pub fn cleanup_generated_reports(conn: &Connection, older_than_days: i64) -> Result<i64> {
    let r = db::run(
        conn,
        "DELETE FROM generated_reports WHERE generated_at < datetime('now', ?)",
        crate::p![format!("-{} days", older_than_days.max(1))],
    )?;
    Ok(r.changes)
}
