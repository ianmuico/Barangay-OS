use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

fn field(data: &Map<String, Value>, key: &str) -> Value {
    data.get(key).cloned().unwrap_or(Value::Null)
}

pub fn list_templates(conn: &Connection) -> Result<Vec<Value>> {
    db::all(conn, "SELECT * FROM report_templates ORDER BY name ASC", ())
}

pub fn get_template_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(conn, "SELECT * FROM report_templates WHERE id = ?", crate::p![id])
}

pub fn get_template_by_name(conn: &Connection, name: &str) -> Result<Option<Value>> {
    db::get(
        conn,
        "SELECT * FROM report_templates WHERE name = ? ORDER BY id ASC LIMIT 1",
        crate::p![name],
    )
}

/// `data`: `{ name, content_html, variables_json, paper_json?, pages_json?, created_by }`.
pub fn create_template(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let r = db::run(
        conn,
        "INSERT INTO report_templates (name, content_html, variables_json, paper_json, pages_json, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        vec![
            field(data, "name"),
            field(data, "content_html"),
            field(data, "variables_json"),
            field(data, "paper_json"),
            field(data, "pages_json"),
            field(data, "created_by"),
        ],
    )?;
    Ok(r.last_insert_rowid)
}

/// Updates only the keys present in `data` (`!== undefined` semantics).
pub fn update_template(conn: &Connection, id: i64, data: &Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    for key in ["name", "content_html", "variables_json", "paper_json", "pages_json"] {
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

    db::run(conn, &format!("UPDATE report_templates SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn delete_template(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM report_templates WHERE id = ?", crate::p![id])?;
    Ok(())
}
