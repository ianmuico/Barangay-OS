//! One-way BIMS (DILG LGUSS-BIMS) export of living residents (port of `main/ipc/bimsExport.ts`).

use super::{fail, Args, HResult};
use crate::db::{self, queries::audit::log_audit, queries::settings::get_setting};
use crate::utils::bims_template::{BimsColumn, BIMS_RBI_COLUMNS};
use crate::utils::dialogs::{self, DialogOptions};
use anyhow::Result;
use rusqlite::Connection;
use rust_xlsxwriter::{Format, Workbook};
use serde_json::{json, Value};

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    let _ = a;
    Some(match channel {
        "bims:validate" => validate(),
        "bims:export" => export(),
        _ => return None,
    })
}

// Living residents joined to their household number, for a one-way BIMS export.
fn get_export_rows(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        r#"
    SELECT r.*, h.household_number as household_number,
      CAST((julianday('now') - julianday(r.birth_date)) / 365.25 AS INTEGER) as age
    FROM residents r
    LEFT JOIN households h ON r.household_id = h.id
    WHERE r.status = 'living'
    ORDER BY r.last_name, r.first_name
  "#,
        (),
    )
}

/// `r.key || ''` as a display string.
fn or_empty(r: &Value, key: &str) -> String {
    match r.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(v) if super::truthy(v) => v.to_string(),
        _ => String::new(),
    }
}

// Dry-run: report how many residents are missing BIMS-required fields.
fn validate() -> HResult {
    let rows = {
        let conn = db::conn();
        get_export_rows(&conn)?
    };
    let required: Vec<&BimsColumn> = BIMS_RBI_COLUMNS.iter().filter(|c| c.required).collect();
    let mut issues: Vec<Value> = Vec::new();
    for r in &rows {
        let missing: Vec<&str> =
            required.iter().filter(|c| (c.get)(r).trim().is_empty()).map(|c| c.header).collect();
        if !missing.is_empty() {
            let full = format!("{} {}", or_empty(r, "first_name"), or_empty(r, "last_name"));
            let name = match full.trim() {
                "" => format!("#{}", r.get("id").map(|v| v.to_string()).unwrap_or_else(|| "undefined".into())),
                t => t.to_string(),
            };
            issues.push(json!({ "name": name, "missing": missing }));
        }
    }
    let total = rows.len();
    let ok_count = total - issues.len();
    issues.truncate(200);
    Ok(json!({ "total": total, "okCount": ok_count, "issues": issues }))
}

// Write a BIMS-ready (.xlsx) workbook of living residents mapped to RBI columns.
fn export() -> HResult {
    match export_inner() {
        Ok(v) => Ok(v),
        Err(e) => Ok(fail(e)),
    }
}

fn export_inner() -> Result<Value> {
    let (rows, brgy) = {
        let conn = db::conn();
        let rows = get_export_rows(&conn)?;
        let brgy = get_setting(&conn, "barangay_name")?.unwrap_or_default();
        (rows, brgy)
    };

    let mut wb = Workbook::new();
    let bold = Format::new().set_bold();
    {
        let ws = wb.add_worksheet();
        ws.set_name("RBI")?;
        ws.set_freeze_panes(1, 0)?;
        ws.set_row_format(0, &bold)?;
        for (ci, c) in BIMS_RBI_COLUMNS.iter().enumerate() {
            ws.write_string_with_format(0, ci as u16, c.header, &bold)?;
        }
        for (ri, r) in rows.iter().enumerate() {
            for (ci, c) in BIMS_RBI_COLUMNS.iter().enumerate() {
                ws.write_string((ri + 1) as u32, ci as u16, (c.get)(r))?;
            }
        }
        for ci in 0..BIMS_RBI_COLUMNS.len() {
            ws.set_column_width(ci as u16, 18)?;
        }
    }

    {
        let about = wb.add_worksheet();
        about.set_name("About")?;
        about.set_column_width(0, 110)?;
        let lines: Vec<String> = vec![
            "BIMS-ready export (RBI-aligned)".to_string(),
            if brgy.is_empty() { String::new() } else { format!("Barangay: {brgy}") },
            format!("Residents exported: {}", rows.len()),
            String::new(),
            "This workbook contains living residents mapped to Records of Barangay Inhabitants (RBI) fields.".into(),
            "DILG LGUSS-BIMS accepts external data only through its own prescribed Excel template — there is".into(),
            "no public API, so this file is uploaded manually by an authorized barangay user.".into(),
            String::new(),
            "IMPORTANT: Before uploading, obtain your barangay's prescribed BIMS template from your DILG".into(),
            "Information System Analyst (ISA) and align these column headers to match it exactly. The header".into(),
            "names here are a best-guess mapping and may differ from the official template.".into(),
        ];
        for (i, t) in lines.into_iter().filter(|t| !t.is_empty()).enumerate() {
            about.write_string(i as u32, 0, t)?;
        }
    }

    let buffer = wb.save_to_buffer()?;
    let base = if brgy.is_empty() { "barangay" } else { brgy.as_str() };
    let re = regex::Regex::new(r"[^a-zA-Z0-9_]+")?;
    let default_path = format!("BIMS_export_{}.xlsx", re.replace_all(base, "_"));
    let save = dialogs::save_file(&DialogOptions::new(
        "Export BIMS-ready workbook",
        &default_path,
        &[("Excel Workbook", &["xlsx"])],
    ));
    let Some(path) = save else {
        return Ok(fail("Save cancelled"));
    };

    std::fs::write(&path, buffer)?;
    let user_id = super::auth::current_user_id();
    {
        let conn = db::conn();
        log_audit(
            &conn,
            user_id,
            "BIMS_EXPORT",
            Some(&format!("Exported {} residents to BIMS template", rows.len())),
        )?;
    }
    Ok(json!({ "success": true, "path": path.to_string_lossy(), "count": rows.len() }))
}
