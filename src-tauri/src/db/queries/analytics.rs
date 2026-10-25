use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn track_event(conn: &Connection, event_type: &str, event_data: Option<&str>) -> Result<()> {
    let event_data = event_data.filter(|d| !d.is_empty());
    db::run(
        conn,
        "INSERT INTO analytics_events (event_type, event_data) VALUES (?, ?)",
        crate::p![event_type, event_data],
    )?;
    Ok(())
}

/// → `{ totalAppOpens, totalCertificatesGenerated, totalResidentsAdded,
/// totalImports, eventsByType, recentEvents }`.
pub fn get_analytics_summary(conn: &Connection) -> Result<Value> {
    let total_app_opens = db::count(
        conn,
        "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'app_open'",
        (),
    )?;

    let total_certificates_generated = db::count(
        conn,
        "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'certificate_generated'",
        (),
    )?;

    let total_residents_added = db::count(
        conn,
        "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'resident_added'",
        (),
    )?;

    let total_imports = db::count(
        conn,
        "SELECT COUNT(*) as count FROM analytics_events WHERE event_type = 'csv_imported'",
        (),
    )?;

    let events_by_type = db::all(
        conn,
        "SELECT event_type, COUNT(*) as count FROM analytics_events GROUP BY event_type ORDER BY count DESC",
        (),
    )?;

    let recent_events = db::all(conn, "SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT 50", ())?;

    Ok(json!({
        "totalAppOpens": total_app_opens,
        "totalCertificatesGenerated": total_certificates_generated,
        "totalResidentsAdded": total_residents_added,
        "totalImports": total_imports,
        "eventsByType": events_by_type,
        "recentEvents": recent_events,
    }))
}

fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

pub fn export_analytics(conn: &Connection) -> Result<String> {
    let events = db::all(conn, "SELECT * FROM analytics_events ORDER BY created_at DESC", ())?;

    if events.is_empty() {
        return Ok(String::new());
    }

    let headers = "id,event_type,event_data,created_at".to_string();
    let mut lines = vec![headers];
    for e in &events {
        let data = match e.get("event_data").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            Some(d) => format!("\"{}\"", d.replace('"', "\"\"")),
            None => String::new(),
        };
        lines.push(format!(
            "{},{},{},{}",
            js_string(&e["id"]),
            js_string(&e["event_type"]),
            data,
            js_string(&e["created_at"])
        ));
    }

    Ok(lines.join("\n"))
}
