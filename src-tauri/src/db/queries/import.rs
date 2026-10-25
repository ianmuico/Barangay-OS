//! CSV / Excel import + CSV export — port of `main/database/queries/import.ts`.
//!
//! The CSV parser is the hand-written one from the TS (line-based, trims every
//! field, no multi-line quoted fields) ported as-is — the `csv` crate would
//! parse some files differently.

use super::residents::{self, is_js_ws, js_trim};
use crate::db;
use crate::ipc::{truthy, ObjExt};
use anyhow::Result;
use regex::Regex;
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

// ─── JS-semantics helpers ───────────────────────────────────────────────────

/// JS `String(n)` for a JSON number.
fn js_number(n: &serde_json::Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    let f = n.as_f64().unwrap_or(0.0);
    if f.fract() == 0.0 && f.abs() < 1e21 {
        format!("{f:.0}")
    } else {
        f.to_string()
    }
}

/// JS `String(v)` (null → "null").
fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => js_number(n),
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(|x| if x.is_null() { String::new() } else { js_string(x) }).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

/// JS `(v || '').toString()`.
fn js_string_or_empty(v: Option<&Value>) -> String {
    match v {
        Some(x) if truthy(x) => js_string(x),
        _ => String::new(),
    }
}

/// JS `data.key || fallback`.
fn or(data: &Map<String, Value>, key: &str, fallback: Value) -> Value {
    match data.get(key) {
        Some(v) if truthy(v) => v.clone(),
        _ => fallback,
    }
}

fn raw(data: &Map<String, Value>, key: &str) -> Value {
    data.get(key).cloned().unwrap_or(Value::Null)
}

fn err_obj(row: i64, field: &str, message: String) -> Value {
    json!({ "row": row, "field": field, "message": message })
}

// ─── Batches ────────────────────────────────────────────────────────────────

// Create a new import batch record
pub fn create_import_batch(conn: &Connection, filename: &str, imported_by: Option<i64>) -> Result<i64> {
    let result = db::run(
        conn,
        "INSERT INTO import_batches (filename, imported_by) VALUES (?, ?)",
        crate::p![filename, imported_by],
    )?;
    Ok(result.last_insert_rowid)
}

// Update batch totals
pub fn update_import_batch(conn: &Connection, id: i64, totals: &Map<String, Value>) -> Result<()> {
    db::run(
        conn,
        "UPDATE import_batches SET total_imported = ?, total_skipped = ?, total_errors = ? WHERE id = ?",
        vec![raw(totals, "total_imported"), raw(totals, "total_skipped"), raw(totals, "total_errors"), json!(id)],
    )?;
    Ok(())
}

// Rollback an import batch — delete all residents with that batch ID
pub fn rollback_import_batch(conn: &Connection, batch_id: i64) -> Result<Value> {
    let count = db::count(conn, "SELECT COUNT(*) as count FROM residents WHERE import_batch_id = ?", crate::p![batch_id])?;
    db::run(conn, "DELETE FROM residents WHERE import_batch_id = ?", crate::p![batch_id])?;
    db::run(conn, "UPDATE import_batches SET status = 'rolled_back' WHERE id = ?", crate::p![batch_id])?;
    Ok(json!({ "deletedCount": count }))
}

// List import batches
pub fn list_import_batches(conn: &Connection) -> Result<Vec<Value>> {
    db::all(conn, "SELECT * FROM import_batches ORDER BY created_at DESC", ())
}

// Get the latest completed batch
pub fn get_latest_batch(conn: &Connection) -> Result<Option<Value>> {
    db::get(
        conn,
        "SELECT * FROM import_batches WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1",
        (),
    )
}

// ─── Duplicates ─────────────────────────────────────────────────────────────

// Check for exact duplicate: same first_name + last_name + birth_date
pub fn find_exact_duplicate(conn: &Connection, first_name: &str, last_name: &str, birth_date: &str) -> Result<Option<Value>> {
    db::get(
        conn,
        "SELECT id, first_name, last_name, birth_date, purok FROM residents WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) AND birth_date = ?",
        crate::p![first_name, last_name, birth_date],
    )
}

// Check for fuzzy duplicate: same last_name + same purok + birth_date within 365 days
pub fn find_fuzzy_duplicates(conn: &Connection, last_name: &str, purok: Option<&str>, birth_date: &str) -> Result<Vec<Value>> {
    let Some(purok) = purok.filter(|p| !p.is_empty()) else {
        return Ok(vec![]);
    };
    db::all(
        conn,
        "
    SELECT id, first_name, last_name, birth_date, purok FROM residents
    WHERE LOWER(last_name) = LOWER(?)
    AND purok = ?
    AND ABS(julianday(birth_date) - julianday(?)) <= 365
  ",
        crate::p![last_name, purok, birth_date],
    )
}

// ─── Validation ─────────────────────────────────────────────────────────────

fn re_ymd() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$").expect("valid regex"))
}

fn re_slash() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^([0-9]{1,2})[/\-]([0-9]{1,2})[/\-]([0-9]{4})$").expect("valid regex"))
}

fn pad2(s: &str) -> String {
    format!("{s:0>2}")
}

// Parse date string into YYYY-MM-DD format
pub fn parse_date(date_str: &str, format: &str) -> Option<String> {
    if date_str.is_empty() {
        return None;
    }
    let trimmed = js_trim(date_str);

    if format == "YYYY-MM-DD" {
        // Validate YYYY-MM-DD
        let m = re_ymd().captures(trimmed)?;
        return Some(format!("{}-{}-{}", &m[1], pad2(&m[2]), pad2(&m[3])));
    }

    if format == "MM/DD/YYYY" {
        let m = re_slash().captures(trimmed)?;
        let (mo, d, y) = (&m[1], &m[2], &m[3]);
        return Some(format!("{y}-{}-{}", pad2(mo), pad2(d)));
    }

    if format == "DD/MM/YYYY" {
        let m = re_slash().captures(trimmed)?;
        let (d, mo, y) = (&m[1], &m[2], &m[3]);
        return Some(format!("{y}-{}-{}", pad2(mo), pad2(d)));
    }

    None
}

/// JS `String(data.x)` on a validated value (string, or a number set earlier).
fn data_str(data: &Map<String, Value>, key: &str) -> String {
    data.get(key).map(js_string).unwrap_or_default()
}

fn validate_row_inner(
    row: &Map<String, Value>,
    mapping: &Map<String, Value>,
    date_format: &str,
    row_index: i64,
) -> (bool, Map<String, Value>, Vec<Value>) {
    let mut errors: Vec<Value> = Vec::new();
    let mut data: Map<String, Value> = Map::new();

    // Map columns
    for (system_field, csv_column) in mapping {
        let Some(csv_column) = csv_column.as_str().filter(|c| !c.is_empty()) else { continue };
        if let Some(v) = row.get(csv_column) {
            let mapped = match v {
                Value::Null => Value::Null,
                other => {
                    let s = js_string(other);
                    let t = js_trim(&s);
                    if t.is_empty() { Value::Null } else { json!(t) }
                }
            };
            data.insert(system_field.clone(), mapped);
        }
    }

    // Required fields
    let required = ["first_name", "last_name", "birth_date", "gender", "civil_status"];
    for field in required {
        if !data.is_truthy(field) {
            errors.push(err_obj(row_index, field, format!("Missing required field: {field}")));
        }
    }

    // Validate and parse date
    if data.is_truthy("birth_date") {
        let bd = data_str(&data, "birth_date");
        match parse_date(&bd, date_format) {
            None => errors.push(err_obj(
                row_index,
                "birth_date",
                format!("Invalid date format: {bd} (expected {date_format})"),
            )),
            Some(parsed) => {
                data.insert("birth_date".into(), json!(parsed));
            }
        }
    }

    // Validate gender
    if data.is_truthy("gender") {
        let g = js_trim(&data_str(&data, "gender")).to_string();
        if !["Male", "Female", "male", "female", "M", "F", "m", "f"].contains(&g.as_str()) {
            errors.push(err_obj(row_index, "gender", format!("Invalid gender: {g} (must be Male or Female)")));
        } else {
            let v = if g.to_lowercase().starts_with('m') { "Male" } else { "Female" };
            data.insert("gender".into(), json!(v));
        }
    }

    // Validate civil status
    if data.is_truthy("civil_status") {
        let raw_cs = data_str(&data, "civil_status");
        let cs = js_trim(&raw_cs).to_lowercase();
        let mapped = match cs.as_str() {
            "single" | "s" => Some("Single"),
            "married" | "m" => Some("Married"),
            "widowed" | "w" | "widow" => Some("Widowed"),
            "separated" | "sep" => Some("Separated"),
            "divorced" | "d" | "div" => Some("Divorced"),
            _ => None,
        };
        match mapped {
            Some(v) => {
                data.insert("civil_status".into(), json!(v));
            }
            None => errors.push(err_obj(row_index, "civil_status", format!("Invalid civil status: {raw_cs}"))),
        }
    }

    // Validate voter_status
    if data.is_truthy("voter_status") {
        let vs = js_trim(&data_str(&data, "voter_status")).to_lowercase();
        let v = if ["registered", "reg", "yes", "y", "1"].contains(&vs.as_str()) { "Registered" } else { "Not Registered" };
        data.insert("voter_status".into(), json!(v));
    }

    // Validate is_indigent / is_4ps / is_pwd
    for key in ["is_indigent", "is_4ps", "is_pwd"] {
        let flag = match data.get(key) {
            Some(v) if !v.is_null() => {
                let val = js_trim(&js_string(v)).to_lowercase();
                if ["yes", "y", "1", "true", "oo"].contains(&val.as_str()) { 1 } else { 0 }
            }
            _ => 0,
        };
        data.insert(key.into(), json!(flag));
    }

    // Default status
    if !data.is_truthy("status") {
        data.insert("status".into(), json!("living"));
    }

    // Default citizenship
    if !data.is_truthy("citizenship") {
        data.insert("citizenship".into(), json!("Filipino"));
    }

    (errors.is_empty(), data, errors)
}

// Validate a single row of import data → `{ valid, data, errors }`
pub fn validate_row(row: &Map<String, Value>, mapping: &Map<String, Value>, date_format: &str, row_index: i64) -> Value {
    let (valid, data, errors) = validate_row_inner(row, mapping, date_format, row_index);
    json!({ "valid": valid, "data": data, "errors": errors })
}

// ─── CSV parsing ────────────────────────────────────────────────────────────

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '"' {
            if in_quotes && chars.get(i + 1) == Some(&'"') {
                current.push('"');
                i += 1;
            } else {
                in_quotes = !in_quotes;
            }
        } else if ch == ',' && !in_quotes {
            result.push(js_trim(&current).to_string());
            current.clear();
        } else {
            current.push(ch);
        }
        i += 1;
    }
    result.push(js_trim(&current).to_string());
    result
}

fn parse_csv_inner(content: &str) -> (Vec<String>, Vec<Value>) {
    // content.split(/\r?\n/).filter(line => line.trim())
    let lines: Vec<&str> = content
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .filter(|l| !l.trim_matches(is_js_ws).is_empty())
        .collect();
    if lines.is_empty() {
        return (vec![], vec![]);
    }

    let headers = parse_csv_line(lines[0]);
    let mut rows: Vec<Value> = Vec::new();

    for line in &lines[1..] {
        let values = parse_csv_line(line);
        let mut row = Map::new();
        for (idx, h) in headers.iter().enumerate() {
            row.insert(h.clone(), json!(values.get(idx).cloned().unwrap_or_default()));
        }
        rows.push(Value::Object(row));
    }

    (headers, rows)
}

// Parse CSV content into rows → `{ headers, rows }`
pub fn parse_csv(content: &str) -> Value {
    let (headers, rows) = parse_csv_inner(content);
    json!({ "headers": headers, "rows": rows })
}

/// `parseCSV(content).headers`.
pub fn parse_csv_headers(content: &str) -> Vec<String> {
    parse_csv_inner(content).0
}

/// `parseCSV(content).rows`.
pub fn parse_csv_rows(content: &str) -> Vec<Value> {
    parse_csv_inner(content).1
}

/// The resident payload both importers hand to `createResident`.
fn import_payload(data: &Map<String, Value>, batch_id: i64, with_pwd: bool) -> Map<String, Value> {
    let n = Value::Null;
    let mut m = Map::new();
    m.insert("first_name".into(), raw(data, "first_name"));
    m.insert("last_name".into(), raw(data, "last_name"));
    m.insert("birth_date".into(), raw(data, "birth_date"));
    m.insert("gender".into(), raw(data, "gender"));
    m.insert("civil_status".into(), raw(data, "civil_status"));
    m.insert("middle_name".into(), or(data, "middle_name", n.clone()));
    m.insert("suffix".into(), or(data, "suffix", n.clone()));
    m.insert("address".into(), or(data, "address", json!("")));
    m.insert("purok".into(), or(data, "purok", n.clone()));
    m.insert("contact_number".into(), or(data, "contact_number", n.clone()));
    m.insert("email".into(), or(data, "email", n.clone()));
    m.insert("occupation".into(), or(data, "occupation", n.clone()));
    m.insert("is_indigent".into(), or(data, "is_indigent", json!(0)));
    m.insert("voter_status".into(), or(data, "voter_status", json!("Not Registered")));
    m.insert("blood_type".into(), or(data, "blood_type", n.clone()));
    m.insert("notes".into(), or(data, "notes", n.clone()));
    m.insert("religion".into(), or(data, "religion", n.clone()));
    m.insert("citizenship".into(), or(data, "citizenship", json!("Filipino")));
    m.insert("philsys_card_no".into(), or(data, "philsys_card_no", n.clone()));
    m.insert("educational_attainment".into(), or(data, "educational_attainment", n.clone()));
    m.insert("is_4ps".into(), or(data, "is_4ps", json!(0)));
    if with_pwd {
        m.insert("is_pwd".into(), or(data, "is_pwd", json!(0)));
        m.insert("pwd_note".into(), or(data, "pwd_note", n.clone()));
    }
    m.insert("status".into(), or(data, "status", json!("living")));
    m.insert("import_batch_id".into(), json!(batch_id));
    m
}

fn empty_map() -> Map<String, Value> {
    Map::new()
}

fn row_map(v: &Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap_or_else(empty_map)
}

// Run the full import process → `ImportResult`
pub fn run_import(
    conn: &Connection,
    rows: &[Value],
    mapping: &Map<String, Value>,
    date_format: &str,
    batch_id: i64,
    skip_duplicates: bool,
) -> Result<Value> {
    let mut errors: Vec<Value> = Vec::new();
    let mut duplicates: Vec<Value> = Vec::new();
    let mut total_imported: i64 = 0;
    let mut total_skipped: i64 = 0;

    db::transaction(conn, |c| {
        for (i, row_v) in rows.iter().enumerate() {
            let row_index = i as i64 + 2; // +2 for 1-indexed + header row
            let row = row_map(row_v);
            let (valid, data, row_errors) = validate_row_inner(&row, mapping, date_format, row_index);

            if !valid {
                errors.extend(row_errors);
                total_skipped += 1;
                continue;
            }

            // Check for exact duplicates
            if data.is_truthy("first_name") && data.is_truthy("last_name") && data.is_truthy("birth_date") {
                let first = data_str(&data, "first_name");
                let last = data_str(&data, "last_name");
                let birth = data_str(&data, "birth_date");
                let exact_match = find_exact_duplicate(c, &first, &last, &birth)?;
                if let Some(m) = &exact_match {
                    duplicates.push(json!({
                        "type": "exact",
                        "existingResident": m,
                        "newRow": row_v,
                        "rowIndex": row_index,
                    }));
                    if skip_duplicates {
                        total_skipped += 1;
                        continue;
                    }
                }

                // Fuzzy check
                let purok = if data.is_truthy("purok") { Some(data_str(&data, "purok")) } else { None };
                let fuzzy_matches = find_fuzzy_duplicates(c, &last, purok.as_deref(), &birth)?;
                for m in fuzzy_matches {
                    let same = exact_match.as_ref().map(|e| e.get("id") == m.get("id")).unwrap_or(false);
                    if !same {
                        duplicates.push(json!({
                            "type": "fuzzy",
                            "existingResident": m,
                            "newRow": row_v,
                            "rowIndex": row_index,
                        }));
                    }
                }
            }

            // Insert the resident
            match residents::create_resident(c, &import_payload(&data, batch_id, false)) {
                Ok(_) => total_imported += 1,
                Err(err) => {
                    let msg = err.to_string();
                    errors.push(err_obj(row_index, "_insert", if msg.is_empty() { "Insert failed".into() } else { msg }));
                    total_skipped += 1;
                }
            }
        }
        Ok(())
    })?;

    // Update batch totals
    let mut totals = Map::new();
    totals.insert("total_imported".into(), json!(total_imported));
    totals.insert("total_skipped".into(), json!(total_skipped));
    totals.insert("total_errors".into(), json!(errors.len()));
    update_import_batch(conn, batch_id, &totals)?;

    Ok(json!({
        "batchId": batch_id,
        "totalImported": total_imported,
        "totalSkipped": total_skipped,
        "totalErrors": errors.len(),
        "errors": errors,
        "duplicates": duplicates,
    }))
}

// Generate CSV template with all system field headers
pub fn get_csv_template_headers() -> String {
    let headers = [
        "first_name", "middle_name", "last_name", "suffix",
        "birth_date", "gender", "civil_status",
        "address", "purok", "contact_number", "email",
        "occupation", "is_indigent", "voter_status", "blood_type",
        "religion", "citizenship", "philsys_card_no", "educational_attainment",
        "is_4ps", "status", "notes",
    ];
    headers.join(",")
}

// System fields available for mapping
pub fn get_system_fields() -> Vec<Value> {
    [
        ("first_name", "First Name", true),
        ("middle_name", "Middle Name", false),
        ("last_name", "Last Name", true),
        ("suffix", "Suffix", false),
        ("birth_date", "Date of Birth", true),
        ("gender", "Gender", true),
        ("civil_status", "Civil Status", true),
        ("address", "Address", false),
        ("purok", "Purok", false),
        ("contact_number", "Contact Number", false),
        ("email", "Email", false),
        ("occupation", "Occupation", false),
        ("is_indigent", "Indigent (Yes/No)", false),
        ("voter_status", "Voter Status", false),
        ("blood_type", "Blood Type", false),
        ("religion", "Religion", false),
        ("citizenship", "Citizenship", false),
        ("philsys_card_no", "PhilSys Card No.", false),
        ("educational_attainment", "Educational Attainment", false),
        ("is_4ps", "4Ps Beneficiary (Yes/No)", false),
        ("status", "Status (living/deceased)", false),
        ("notes", "Notes", false),
    ]
    .iter()
    .map(|(key, label, required)| json!({ "key": key, "label": label, "required": required }))
    .collect()
}

// Export residents to CSV string
pub fn export_residents_to_csv(conn: &Connection, params: &Map<String, Value>) -> Result<String> {
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if params.is_truthy("is_senior") {
        conditions.push("CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) >= 60".into());
    }
    if params.is_truthy("is_youth") {
        conditions.push("CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30".into());
        conditions.push("(civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))".into());
    }
    if params.is_truthy("is_indigent") {
        conditions.push("is_indigent = 1".into());
    }
    if params.is_truthy("is_4ps") {
        conditions.push("is_4ps = 1".into());
    }
    if params.is_truthy("status") {
        conditions.push("status = ?".into());
        values.push(raw(params, "status"));
    } else {
        // Default: only living
        conditions.push("status = 'living'".into());
    }

    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };

    let rows = db::all(
        conn,
        &format!(
            "
    SELECT first_name, middle_name, last_name, suffix, birth_date, gender, civil_status,
      address, purok, contact_number, email, occupation,
      CASE WHEN is_indigent = 1 THEN 'Yes' ELSE 'No' END as is_indigent,
      voter_status, blood_type, religion, citizenship, philsys_card_no,
      educational_attainment,
      CASE WHEN is_4ps = 1 THEN 'Yes' ELSE 'No' END as is_4ps,
      status, notes,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    {where_clause}
    ORDER BY last_name, first_name
  "
        ),
        values,
    )?;

    let Some(first) = rows.first().and_then(|r| r.as_object()) else {
        return Ok(String::new());
    };

    let headers: Vec<String> = first.keys().cloned().collect();
    let mut csv_rows = vec![headers.join(",")];

    for row in &rows {
        let vals: Vec<String> = headers
            .iter()
            .map(|h| {
                let val = row.get(h).unwrap_or(&Value::Null);
                if val.is_null() {
                    return String::new();
                }
                let s = js_string(val);
                // Escape CSV values
                if s.contains(',') || s.contains('"') || s.contains('\n') {
                    format!("\"{}\"", s.replace('"', "\"\""))
                } else {
                    s
                }
            })
            .collect();
        csv_rows.push(vals.join(","));
    }

    Ok(csv_rows.join("\n"))
}

// ─── Excel template + relationship-aware import ──────────────────────────────
// The Excel template is OUR known schema (no column mapping needed). It adds a
// "Ref Code" column and three relationship columns so purok leaders can connect
// family members right in the spreadsheet — see resolve_relationship_ref below.

#[derive(Debug, Clone, Copy)]
pub struct ExcelColumn {
    pub key: &'static str,
    pub header: &'static str,
    pub required: bool,
    pub options: &'static [&'static str],
    pub help: Option<&'static str>,
    /// resolved after rows are created, not a DB column
    pub relationship: bool,
}

const fn col(key: &'static str, header: &'static str) -> ExcelColumn {
    ExcelColumn { key, header, required: false, options: &[], help: None, relationship: false }
}

const YES_NO: &[&str] = &["Yes", "No"];

pub const EXCEL_COLUMNS: &[ExcelColumn] = &[
    ExcelColumn { help: Some("Optional. Your own short label for this row (e.g. A1). Type it in a relationship column of another row to link them — e.g. put A1 in a child's \"Mother\" column to mark this person as the mother."), relationship: true, ..col("ref_code", "Ref Code") },
    ExcelColumn { required: true, ..col("first_name", "First Name") },
    col("middle_name", "Middle Name"),
    ExcelColumn { required: true, ..col("last_name", "Last Name") },
    ExcelColumn { help: Some("Jr., Sr., III"), ..col("suffix", "Suffix") },
    ExcelColumn { required: true, help: Some("Format: YYYY-MM-DD (e.g. 1990-01-31)"), ..col("birth_date", "Birth Date") },
    ExcelColumn { required: true, options: &["Male", "Female"], ..col("gender", "Gender") },
    ExcelColumn { required: true, options: &["Single", "Married", "Widowed", "Separated", "Divorced"], ..col("civil_status", "Civil Status") },
    col("purok", "Purok"),
    col("address", "Address"),
    col("contact_number", "Contact Number"),
    col("email", "Email"),
    col("occupation", "Occupation"),
    col("religion", "Religion"),
    col("citizenship", "Citizenship"),
    col("educational_attainment", "Educational Attainment"),
    ExcelColumn { options: &["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"], ..col("blood_type", "Blood Type") },
    ExcelColumn { options: &["Registered", "Not Registered"], ..col("voter_status", "Registered Voter") },
    ExcelColumn { options: YES_NO, ..col("is_indigent", "Indigent") },
    ExcelColumn { options: YES_NO, ..col("is_4ps", "4Ps Beneficiary") },
    ExcelColumn { options: YES_NO, ..col("is_pwd", "PWD") },
    col("pwd_note", "PWD Note"),
    ExcelColumn { options: &["living", "deceased"], ..col("status", "Status") },
    col("notes", "Notes"),
    ExcelColumn { relationship: true, help: Some("A Ref Code from this sheet, OR an existing Resident ID (from the \"Existing Residents\" sheet), OR a full name."), ..col("spouse_ref", "Spouse (Ref Code or Resident ID)") },
    ExcelColumn { relationship: true, help: Some("A Ref Code from this sheet, OR an existing Resident ID, OR a full name."), ..col("mother_ref", "Mother (Ref Code or Resident ID)") },
    ExcelColumn { relationship: true, help: Some("A Ref Code from this sheet, OR an existing Resident ID, OR a full name."), ..col("father_ref", "Father (Ref Code or Resident ID)") },
];

// Resolve a relationship cell to an existing/just-created resident id.
// Order: (1) Ref Code in this sheet, (2) numeric Resident ID, (3) full-name match.
fn resolve_relationship_ref(
    conn: &Connection,
    value: Option<&Value>,
    ref_map: &HashMap<String, i64>,
    row_index: i64,
    field: &str,
    warnings: &mut Vec<Value>,
) -> Result<Option<i64>> {
    let raw_s = js_string_or_empty(value);
    let raw = js_trim(&raw_s);
    if raw.is_empty() {
        return Ok(None);
    }

    if let Some(&hit) = ref_map.get(&raw.to_lowercase()) {
        if hit != 0 {
            return Ok(Some(hit));
        }
    }

    if raw.chars().all(|c| c.is_ascii_digit()) {
        let found = match raw.parse::<i64>() {
            Ok(n) => db::get(conn, "SELECT id FROM residents WHERE id = ?", crate::p![n])?,
            Err(_) => None,
        };
        if let Some(id) = found.as_ref().and_then(|f| f.i("id")) {
            return Ok(Some(id));
        }
        warnings.push(err_obj(
            row_index,
            field,
            format!("{field}: no resident found with Resident ID {raw} (and no matching Ref Code) — left unlinked"),
        ));
        return Ok(None);
    }

    // Name match against existing residents (case-insensitive "first last")
    let matches = db::all(
        conn,
        "SELECT id FROM residents WHERE LOWER(first_name || ' ' || last_name) = LOWER(?) LIMIT 2",
        crate::p![raw],
    )?;
    if matches.len() == 1 {
        return Ok(matches[0].i("id"));
    }
    if matches.len() > 1 {
        warnings.push(err_obj(
            row_index,
            field,
            format!("{field}: more than one resident is named \"{raw}\" — use the Resident ID instead. Left unlinked."),
        ));
        return Ok(None);
    }
    warnings.push(err_obj(
        row_index,
        field,
        format!("{field}: \"{raw}\" did not match a Ref Code, Resident ID, or existing resident — left unlinked"),
    ));
    Ok(None)
}

// Import rows that already use the template's column KEYS (no mapping needed).
pub fn run_excel_import(conn: &Connection, rows: &[Value], batch_id: i64, skip_duplicates: bool) -> Result<Value> {
    let mut errors: Vec<Value> = Vec::new();
    let mut duplicates: Vec<Value> = Vec::new();
    let mut total_imported: i64 = 0;
    let mut total_skipped: i64 = 0;

    // Identity mapping for the plain data fields (relationships handled separately)
    let mut data_mapping = Map::new();
    for c in EXCEL_COLUMNS {
        if !c.relationship {
            data_mapping.insert(c.key.into(), json!(c.key));
        }
    }

    let mut ref_map: HashMap<String, i64> = HashMap::new(); // ref_code → new resident id
    let mut created: Vec<(i64, i64, Map<String, Value>)> = Vec::new(); // (rowIndex, id, row)

    db::transaction(conn, |c| {
        // ── Pass 1: validate + create everyone ──
        for (i, raw_v) in rows.iter().enumerate() {
            let row_index = i as i64 + 2;
            let raw = row_map(raw_v);
            // Skip blank rows
            if !raw.values().any(|v| !js_trim(&js_string_or_empty(Some(v))).is_empty()) {
                continue;
            }

            let (valid, data, row_errors) = validate_row_inner(&raw, &data_mapping, "YYYY-MM-DD", row_index);
            if !valid {
                errors.extend(row_errors);
                total_skipped += 1;
                continue;
            }

            if data.is_truthy("first_name") && data.is_truthy("last_name") && data.is_truthy("birth_date") {
                let exact_match = find_exact_duplicate(
                    c,
                    &data_str(&data, "first_name"),
                    &data_str(&data, "last_name"),
                    &data_str(&data, "birth_date"),
                )?;
                if let Some(m) = exact_match {
                    duplicates.push(json!({ "type": "exact", "existingResident": m, "newRow": raw_v, "rowIndex": row_index }));
                    if skip_duplicates {
                        total_skipped += 1;
                        continue;
                    }
                }
            }

            match residents::create_resident(c, &import_payload(&data, batch_id, true)) {
                Ok(id) => {
                    let ref_code = js_trim(&js_string_or_empty(raw.get("ref_code"))).to_lowercase();
                    created.push((row_index, id, raw));
                    if !ref_code.is_empty() {
                        ref_map.insert(ref_code, id);
                    }
                    total_imported += 1;
                }
                Err(err) => {
                    let msg = err.to_string();
                    errors.push(err_obj(row_index, "_insert", if msg.is_empty() { "Insert failed".into() } else { msg }));
                    total_skipped += 1;
                }
            }
        }

        // ── Pass 2: resolve & apply relationships ──
        for (row_index, id, row) in &created {
            let spouse_id = resolve_relationship_ref(c, row.get("spouse_ref"), &ref_map, *row_index, "Spouse", &mut errors)?;
            if let Some(sid) = spouse_id.filter(|s| *s != 0 && s != id) {
                residents::link_partner(c, *id, sid)?;
            }

            let mother_id = resolve_relationship_ref(c, row.get("mother_ref"), &ref_map, *row_index, "Mother", &mut errors)?;
            let father_id = resolve_relationship_ref(c, row.get("father_ref"), &ref_map, *row_index, "Father", &mut errors)?;
            let mut parent_update = Map::new();
            if let Some(m) = mother_id.filter(|m| *m != 0 && m != id) {
                parent_update.insert("mother_id".into(), json!(m));
            }
            if let Some(f) = father_id.filter(|f| *f != 0 && f != id) {
                parent_update.insert("father_id".into(), json!(f));
            }
            if !parent_update.is_empty() {
                residents::update_resident(c, *id, &parent_update, None)?;
            }
        }
        Ok(())
    })?;

    let mut totals = Map::new();
    totals.insert("total_imported".into(), json!(total_imported));
    totals.insert("total_skipped".into(), json!(total_skipped));
    totals.insert("total_errors".into(), json!(errors.len()));
    update_import_batch(conn, batch_id, &totals)?;

    Ok(json!({
        "batchId": batch_id,
        "totalImported": total_imported,
        "totalSkipped": total_skipped,
        "totalErrors": errors.len(),
        "errors": errors,
        "duplicates": duplicates,
    }))
}
