//! Excel resident template download / read / relationship-aware import —
//! port of `main/ipc/excel.ts` (ExcelJS → rust_xlsxwriter for writing,
//! calamine for reading).

use super::{auth, fail, truthy, Args, HResult};
use crate::db::{
    self,
    queries::{
        import::{create_import_batch, run_excel_import, EXCEL_COLUMNS},
        settings::get_setting,
    },
};
use crate::utils::dialogs::{self, DialogOptions};
use anyhow::{anyhow, Result};
use calamine::{open_workbook_auto, Data, Reader};
use rust_xlsxwriter::{
    Color, DataValidation, DocProperties, Format, FormatAlign, FormatBorder, FormatPattern, Note, Workbook, Worksheet,
};
use serde_json::{json, Map, Value};

const HEADER_FONT: u32 = 0x1E3A5F;
const HEADER_FILL: u32 = 0xDDEBF7;
const HEADER_BORDER: u32 = 0x9DC3E6;

// Light blue header, frozen first row, sensible widths, dropdowns on the
// option columns. Opens cleanly in both Microsoft Excel and Google Sheets.
fn build_residents_sheet(ws: &mut Worksheet) -> Result<()> {
    ws.set_name("Residents")?;
    ws.set_freeze_panes(1, 0)?;

    // Header styling
    let header = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(HEADER_FONT))
        .set_align(FormatAlign::VerticalCenter)
        .set_text_wrap()
        .set_pattern(FormatPattern::Solid)
        .set_background_color(Color::RGB(HEADER_FILL))
        .set_border_bottom(FormatBorder::Thin)
        .set_border_bottom_color(Color::RGB(HEADER_BORDER));
    ws.set_row_height(0, 28)?;

    for (idx, c) in EXCEL_COLUMNS.iter().enumerate() {
        let col = idx as u16;
        let width = (c.header.chars().count() + 4).clamp(14, 34);
        ws.set_column_width(col, width as f64)?;
        let text = format!("{}{}", c.header, if c.required { " *" } else { "" });
        ws.write_string_with_format(0, col, &text, &header)?;

        // Dropdowns + helper note per column, applied to a generous row range
        if !c.options.is_empty() {
            let dv = DataValidation::new().allow_list_strings(c.options)?.ignore_blank(true);
            ws.add_data_validation(1, col, 1999, col, &dv)?;
        }
        if let Some(help) = c.help {
            ws.insert_note(0, col, &Note::new(help).add_author_prefix(false))?;
        }
    }
    Ok(())
}

fn build_instructions_sheet(ws: &mut Worksheet, barangay: &str) -> Result<()> {
    ws.set_name("Instructions")?;
    ws.set_column_width(0, 110)?;
    let title = format!("{} — Resident Data Entry Sheet", if barangay.is_empty() { "Barangay" } else { barangay });
    // (text, bold, size)
    let lines: Vec<(&str, bool, Option<u32>)> = vec![
        (title.as_str(), true, Some(16)),
        ("", false, None),
        ("How to use this file", true, Some(13)),
        ("1. Go to the \"Residents\" sheet and fill in one row per person. Columns marked with * are required.", false, None),
        ("2. Birth Date must be in YYYY-MM-DD format (example: 1990-01-31).", false, None),
        ("3. For Gender, Civil Status, Indigent, 4Ps, PWD, Voter and Status — pick from the dropdown in each cell.", false, None),
        ("4. Save the file, send it back to the barangay office, and the admin imports it into the system.", false, None),
        ("", false, None),
        ("Connecting family members (spouse, mother, father)", true, Some(13)),
        ("You can link people together right in this sheet using the \"Ref Code\" column and the relationship columns.", false, None),
        ("", false, None),
        ("Way 1 — people who are BOTH in this sheet:", true, None),
        ("   • Give each person a short Ref Code (any label you like: A1, DAD, etc.).", false, None),
        ("   • In another person’s Spouse/Mother/Father column, type that Ref Code.", false, None),
        ("   Example:", false, None),
        ("      Ref Code = DAD   →   Juan Dela Cruz", false, None),
        ("      Ref Code = MOM   →   Maria Dela Cruz   (Spouse column = DAD)", false, None),
        ("      Pedro Dela Cruz   (Mother column = MOM, Father column = DAD)", false, None),
        ("", false, None),
        ("Way 2 — connecting to someone ALREADY in the system:", true, None),
        ("   • Open the \"Existing Residents\" sheet, find the person, and copy their Resident ID number.", false, None),
        ("   • Paste that Resident ID into the Spouse/Mother/Father column.", false, None),
        ("", false, None),
        ("Way 3 — by full name (least reliable):", true, None),
        ("   • You can also just type a person’s full name. It only links if exactly one resident has that name;", false, None),
        ("     otherwise the office will see a note and can link it by hand. Ref Code or Resident ID is safer.", false, None),
        ("", false, None),
        ("Notes", true, Some(13)),
        ("• You do not have to fill the relationship columns — leave them blank if unknown.", false, None),
        ("• Do not rename or reorder the columns on the Residents sheet.", false, None),
        ("• Duplicates (same name + birth date already in the system) are flagged during import.", false, None),
    ];
    for (i, (text, bold, size)) in lines.iter().enumerate() {
        let mut f = Format::new().set_font_size(size.unwrap_or(11)).set_text_wrap();
        if *bold {
            f = f.set_bold();
        }
        let row = i as u32;
        if text.is_empty() {
            ws.write_blank(row, 0, &f)?;
        } else {
            ws.write_string_with_format(row, 0, *text, &f)?;
        }
    }
    Ok(())
}

fn build_existing_residents_sheet(ws: &mut Worksheet, rows: &[Value]) -> Result<()> {
    ws.set_name("Existing Residents")?;
    ws.set_freeze_panes(1, 0)?;
    let header = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(HEADER_FONT))
        .set_pattern(FormatPattern::Solid)
        .set_background_color(Color::RGB(HEADER_FILL));
    let cols: [(&str, f64); 4] = [("Resident ID", 14.0), ("Full Name", 36.0), ("Birth Date", 16.0), ("Purok", 12.0)];
    for (i, (h, w)) in cols.iter().enumerate() {
        ws.set_column_width(i as u16, *w)?;
        ws.write_string_with_format(0, i as u16, *h, &header)?;
    }
    for (i, r) in rows.iter().enumerate() {
        let row = i as u32 + 1;
        match r.get("id") {
            Some(Value::Number(n)) => {
                ws.write_number(row, 0, n.as_f64().unwrap_or(0.0))?;
            }
            Some(Value::String(s)) => {
                ws.write_string(row, 0, s)?;
            }
            _ => {}
        }
        let name: Vec<String> = ["first_name", "middle_name", "last_name", "suffix"]
            .iter()
            .filter_map(|k| r.get(*k).filter(|v| truthy(v)).map(js_text))
            .collect();
        let name = name.join(" ");
        if !name.is_empty() {
            ws.write_string(row, 1, &name)?;
        }
        if let Some(bd) = r.get("birth_date").filter(|v| !v.is_null()) {
            let s = js_text(bd);
            if !s.is_empty() {
                ws.write_string(row, 2, &s)?;
            }
        }
        if let Some(p) = r.get("purok").filter(|v| truthy(v)) {
            ws.write_string(row, 3, js_text(p))?;
        }
    }
    // Reference only — make it obvious it isn't an entry sheet
    let note = Format::new().set_italic().set_font_color(Color::RGB(0x888888));
    ws.write_string_with_format(
        0,
        5,
        "Reference only — copy a Resident ID into the Residents sheet to link family members.",
        &note,
    )?;
    Ok(())
}

/// JS `String(v)` for a DB value.
fn js_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => match n.as_i64() {
            Some(i) => i.to_string(),
            None => js_float(n.as_f64().unwrap_or(0.0)),
        },
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".into(),
        other => other.to_string(),
    }
}

/// JS `String(number)` for floats read from a sheet.
fn js_float(f: f64) -> String {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < 1e21 {
        format!("{f:.0}")
    } else {
        f.to_string()
    }
}

/// Excel 1900-system serial → YYYY-MM-DD (same epoch handling as calamine's
/// `as_datetime`, which needs a crate feature we don't enable).
fn serial_to_ymd(serial: f64) -> Option<String> {
    let f = if serial >= 60.0 { serial } else { serial + 1.0 };
    let epoch = chrono::NaiveDate::from_ymd_opt(1899, 12, 30)?.and_hms_opt(0, 0, 0)?;
    let dt = epoch.checked_add_signed(chrono::Duration::milliseconds((f * 86_400_000.0).round() as i64))?;
    Some(dt.format("%Y-%m-%d").to_string())
}

// Read a cell to a trimmed string; dates → YYYY-MM-DD
fn cell_text(cell: Option<&Data>) -> String {
    let s = match cell {
        None | Some(Data::Empty) | Some(Data::Error(_)) => return String::new(),
        Some(Data::String(s)) => s.clone(),
        Some(Data::Int(i)) => i.to_string(),
        Some(Data::Float(f)) => js_float(*f),
        Some(Data::Bool(b)) => b.to_string(),
        Some(Data::DateTime(d)) => match serial_to_ymd(d.as_f64()) {
            Some(s) => s,
            None => return String::new(),
        },
        Some(Data::DateTimeIso(s)) => {
            // ISO date/time string — keep the date part like a JS Date would.
            if s.len() >= 10 && s.as_bytes().get(4) == Some(&b'-') { s[..10].to_string() } else { s.clone() }
        }
        Some(Data::DurationIso(s)) => s.clone(),
    };
    crate::db::queries::residents::js_trim(&s).to_string()
}

/// `barangay.replace(/[^a-zA-Z0-9]/g, '_')` (per UTF-16 unit, like JS).
fn safe_file_name(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else {
            for _ in 0..c.len_utf16() {
                out.push('_');
            }
        }
    }
    out
}

// ── Download the fillable template ──
fn download_template(a: &Args) -> HResult {
    // includeExisting = true (undefined/null from the bridge → default)
    let include_existing = match a.raw(0) {
        Value::Null => true,
        v => truthy(v),
    };
    let res = (|| -> Result<Value> {
        let (barangay, existing) = {
            let conn = db::conn();
            let barangay = get_setting(&conn, "barangay_name")?.filter(|s| !s.is_empty()).unwrap_or_else(|| "Barangay".into());
            let existing = if include_existing {
                Some(db::all(
                    &conn,
                    "
    SELECT id, first_name, middle_name, last_name, suffix, birth_date, purok
    FROM residents WHERE status != 'deceased'
    ORDER BY last_name ASC, first_name ASC
  ",
                    (),
                )?)
            } else {
                None
            };
            (barangay, existing)
        };

        let mut wb = Workbook::new();
        wb.set_properties(&DocProperties::new().set_author("Barangay Management System"));
        build_instructions_sheet(wb.add_worksheet(), &barangay)?;
        build_residents_sheet(wb.add_worksheet())?;
        if let Some(rows) = &existing {
            build_existing_residents_sheet(wb.add_worksheet(), rows)?;
        }

        let safe_name = safe_file_name(&barangay);
        let picked = dialogs::save_file(&DialogOptions::new(
            "Save Resident Data Template",
            &format!("{safe_name}_Resident_Template.xlsx"),
            &[("Excel Workbook", &["xlsx"])],
        ));
        let Some(file_path) = picked else {
            return Ok(fail("Save cancelled"));
        };

        let buffer = wb.save_to_buffer()?;
        std::fs::write(&file_path, buffer)?;
        Ok(json!({ "success": true, "path": file_path.to_string_lossy() }))
    })();
    Ok(res.unwrap_or_else(|err| {
        let msg = err.to_string();
        fail(if msg.is_empty() { "Failed to build template".to_string() } else { msg })
    }))
}

// ── Read an uploaded .xlsx → rows keyed by our column keys ──
fn read_file(a: &Args) -> HResult {
    let res = (|| -> Result<Value> {
        let file_path = a.str(0)?;
        let mut wb = open_workbook_auto(&file_path).map_err(|e| anyhow!("{e}"))?;
        let names = wb.sheet_names();
        let sheet = names
            .iter()
            .find(|n| n.as_str() == "Residents")
            .or_else(|| names.iter().find(|n| n.as_str() != "Instructions" && n.as_str() != "Existing Residents"))
            .or_else(|| names.first())
            .cloned();
        let Some(sheet) = sheet else {
            return Ok(fail("No data sheet found in the workbook."));
        };
        let range = wb.worksheet_range(&sheet).map_err(|e| anyhow!("{e}"))?;

        // Map header text → our column key (strip trailing * and whitespace)
        let header_to_key: std::collections::HashMap<String, &str> =
            EXCEL_COLUMNS.iter().map(|c| (c.header.to_lowercase(), c.key)).collect();
        let star = regex::Regex::new(r"\s*\*\s*$").map_err(|e| anyhow!("{e}"))?;

        let (Some(_), Some((end_row, end_col))) = (range.start(), range.end()) else {
            return Ok(fail(
                "This file does not match the barangay template. Use the downloaded template, or use CSV import for other files.",
            ));
        };

        // (column index, key) in column order — like Object.entries over numeric keys.
        let mut col_key_by_index: Vec<(u32, &str)> = Vec::new();
        for col in 0..=end_col {
            let text = cell_text(range.get_value((0, col)));
            if text.is_empty() {
                continue;
            }
            let text = star.replace(&text, "").to_lowercase();
            if let Some(key) = header_to_key.get(&text) {
                col_key_by_index.push((col, key));
            }
        }

        if col_key_by_index.is_empty() {
            return Ok(fail(
                "This file does not match the barangay template. Use the downloaded template, or use CSV import for other files.",
            ));
        }

        let mut rows: Vec<Value> = Vec::new();
        for r in 1..=end_row {
            let mut obj = Map::new();
            let mut has_value = false;
            for (col, key) in &col_key_by_index {
                let val = cell_text(range.get_value((r, *col)));
                if !val.is_empty() {
                    has_value = true;
                }
                obj.insert(key.to_string(), json!(val));
            }
            if has_value {
                rows.push(Value::Object(obj));
            }
        }

        let count = rows.len();
        Ok(json!({ "success": true, "rows": rows, "count": count }))
    })();
    Ok(res.unwrap_or_else(|err| {
        let msg = err.to_string();
        fail(if msg.is_empty() { "Could not read the Excel file.".to_string() } else { msg })
    }))
}

// ── Run the relationship-aware import ──
fn import(a: &Args) -> HResult {
    let res = (|| -> Result<Value> {
        let rows: Vec<Value> = match a.raw(0) {
            Value::Array(v) => v.clone(),
            _ => return Err(anyhow!("rows is not iterable")),
        };
        let skip_duplicates = a.truthy(1);
        let user_id = auth::current_user_id();
        let conn = db::conn();
        let batch_id = create_import_batch(&conn, "Excel template import", user_id)?;
        let result = run_excel_import(&conn, &rows, batch_id, skip_duplicates)?;
        let mut out = Map::new();
        out.insert("success".into(), json!(true));
        if let Value::Object(m) = result {
            out.extend(m);
        }
        Ok(Value::Object(out))
    })();
    Ok(res.unwrap_or_else(|err| {
        let msg = err.to_string();
        fail(if msg.is_empty() { "Import failed".to_string() } else { msg })
    }))
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "excel:downloadTemplate" => download_template(a),
        "excel:readFile" => read_file(a),
        "excel:import" => import(a),
        _ => return None,
    })
}
