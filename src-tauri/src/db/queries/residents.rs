//! Residents — port of `main/database/queries/residents.ts`.

use crate::db;
use crate::ipc::{as_i64, truthy, ObjExt};
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{json, Map, Value};

// ─── JS-semantics helpers (shared with import.rs) ───────────────────────────

/// JS `\s` / `String.prototype.trim` whitespace (includes U+FEFF, excludes U+0085).
pub(crate) fn is_js_ws(c: char) -> bool {
    c == '\u{feff}' || (c.is_whitespace() && c != '\u{85}')
}

/// JS `str.trim()`.
pub(crate) fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_ws)
}

/// JS `str.trim().split(/\s+/).filter(Boolean)`.
pub(crate) fn js_words(s: &str) -> Vec<&str> {
    js_trim(s).split(is_js_ws).filter(|w| !w.is_empty()).collect()
}

/// JS `data.key || fallback`.
fn or(data: &Map<String, Value>, key: &str, fallback: Value) -> Value {
    match data.get(key) {
        Some(v) if truthy(v) => v.clone(),
        _ => fallback,
    }
}

/// JS `data.key` (undefined → null).
fn raw(data: &Map<String, Value>, key: &str) -> Value {
    data.get(key).cloned().unwrap_or(Value::Null)
}

pub fn list_residents(conn: &Connection, params: &Map<String, Value>) -> Result<Value> {
    let search = params.s("search").unwrap_or_default();
    let page = params.i("page").unwrap_or(1);
    let limit = params.i("limit").unwrap_or(50);
    let sort_by = params.s("sortBy").unwrap_or_else(|| "last_name".to_string());
    let sort_order = params.s("sortOrder").unwrap_or_else(|| "asc".to_string());
    let status = params.get("status").cloned().unwrap_or_else(|| json!("living"));

    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    // Filter by status (living by default)
    if status != json!("all") {
        conditions.push("status = ?".into());
        values.push(status);
    }

    if !search.is_empty() {
        // Split search into words so "Juan Santos" matches first_name=Juan + last_name=Santos
        let words = js_words(&search);
        if words.len() > 1 {
            // Each word must match at least one name/address field
            let word_conditions: Vec<&str> = words
                .iter()
                .map(|_| "(first_name LIKE ? OR last_name LIKE ? OR address LIKE ? OR purok LIKE ?)")
                .collect();
            conditions.push(format!("({})", word_conditions.join(" AND ")));
            for word in &words {
                let term = format!("%{word}%");
                for _ in 0..4 {
                    values.push(json!(term));
                }
            }
        } else {
            conditions.push("(first_name LIKE ? OR last_name LIKE ? OR address LIKE ? OR purok LIKE ?)".into());
            let search_term = format!("%{search}%");
            for _ in 0..4 {
                values.push(json!(search_term));
            }
        }
    }

    if params.has("is_indigent") {
        conditions.push("is_indigent = ?".into());
        values.push(json!(if params.is_truthy("is_indigent") { 1 } else { 0 }));
    }

    if params.is_truthy("is_4ps") {
        conditions.push("is_4ps = 1".into());
    }
    if params.is_truthy("is_pwd") {
        conditions.push("is_pwd = 1".into());
    }
    if params.is_truthy("is_solo_parent") {
        conditions.push("is_solo_parent = 1".into());
    }
    if params.is_truthy("is_osy") {
        conditions.push("is_osy = 1".into());
    }
    if params.is_truthy("is_ofw") {
        conditions.push("is_ofw = 1".into());
    }
    if params.is_truthy("is_ip") {
        conditions.push("is_ip = 1".into());
    }

    if params.is_truthy("household_id") {
        conditions.push("household_id = ?".into());
        values.push(raw(params, "household_id"));
    }

    if params.is_truthy("is_senior") {
        conditions.push("(CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER)) >= 60".into());
    }

    if params.is_truthy("is_youth") {
        conditions.push("(CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER)) BETWEEN 15 AND 30".into());
        conditions.push("(civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))".into());
    }

    if params.is_truthy("gender") {
        conditions.push("gender = ?".into());
        values.push(raw(params, "gender"));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let allowed_sort_columns = [
        "first_name", "last_name", "birth_date", "address", "purok", "created_at", "updated_at", "gender", "civil_status",
    ];
    let safe_sort_by = if allowed_sort_columns.contains(&sort_by.as_str()) { sort_by.as_str() } else { "last_name" };
    let safe_sort_order = if sort_order == "desc" { "DESC" } else { "ASC" };

    let total = db::count(
        conn,
        &format!("SELECT COUNT(*) as count FROM residents {where_clause}"),
        values.clone(),
    )?;

    let offset = (page - 1) * limit;
    let mut data_values = values;
    data_values.push(json!(limit));
    data_values.push(json!(offset));
    let data = db::all(
        conn,
        &format!(
            "
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age,
      (SELECT COUNT(*) FROM case_parties p WHERE p.resident_id = residents.id) +
        (SELECT COUNT(*) FROM cases c WHERE (c.complainant_id = residents.id OR c.respondent_id = residents.id)
          AND NOT EXISTS (SELECT 1 FROM case_parties p2 WHERE p2.case_id = c.id)) as case_count,
      (SELECT COUNT(*) FROM resident_issues i WHERE i.resident_id = residents.id AND i.status = 'open') as open_issues
    FROM residents
    {where_clause}
    ORDER BY {safe_sort_by} {safe_sort_order}
    LIMIT ? OFFSET ?
  "
        ),
        data_values,
    )?;

    // Math.ceil(total / limit) — Infinity/NaN (limit 0) serialize as null.
    let total_pages = if limit == 0 {
        Value::Null
    } else {
        json!((total as f64 / limit as f64).ceil() as i64)
    };

    Ok(json!({
        "data": data,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
    }))
}

pub fn get_resident_by_id(conn: &Connection, id: i64) -> Result<Option<Value>> {
    db::get(
        conn,
        "
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents WHERE id = ?
  ",
        crate::p![id],
    )
}

pub fn get_pwd_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as n FROM residents WHERE status != 'deceased' AND is_pwd = 1", ())
}

pub fn get_resident_by_uid(conn: &Connection, uid: &str) -> Result<Option<Value>> {
    db::get(
        conn,
        "
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents WHERE resident_uid = ?
  ",
        crate::p![uid],
    )
}

pub fn search_residents(conn: &Connection, query: &str, limit: i64) -> Result<Vec<Value>> {
    let words = js_words(query);

    if words.len() > 1 {
        // Multi-word: each word must match first_name or last_name
        let word_conditions: Vec<&str> = words.iter().map(|_| "(first_name LIKE ? OR last_name LIKE ?)").collect();
        let where_clause = word_conditions.join(" AND ");
        let mut values: Vec<Value> = Vec::new();
        for word in &words {
            let term = format!("%{word}%");
            values.push(json!(term));
            values.push(json!(term));
        }
        values.push(json!(limit));
        return db::all(
            conn,
            &format!(
                "
      SELECT *,
        CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
      FROM residents
      WHERE {where_clause}
      ORDER BY last_name, first_name
      LIMIT ?
    "
            ),
            values,
        );
    }

    let search_term = format!("%{query}%");
    db::all(
        conn,
        "
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    WHERE first_name LIKE ? OR last_name LIKE ?
    ORDER BY last_name, first_name
    LIMIT ?
  ",
        crate::p![search_term, search_term, limit],
    )
}

pub fn create_resident(conn: &Connection, data: &Map<String, Value>) -> Result<i64> {
    let n = Value::Null;
    let result = db::run(
        conn,
        "
    INSERT INTO residents (
      first_name, middle_name, last_name, suffix, birth_date, gender,
      civil_status, address, purok, birth_place, contact_number, email, occupation,
      is_indigent, voter_status, blood_type, photo_path, household_id,
      partner_id, mother_id, father_id, notes,
      religion, citizenship, philsys_card_no, educational_attainment,
      is_4ps, status, import_batch_id, resident_uid, is_pwd, pwd_note,
      is_solo_parent, is_osy, is_ofw, is_ip, ethnicity, labor_force_status,
      residency_status, residency_start_date, disability_type, pwd_id_no,
      created_via, created_by_client
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ",
        vec![
            raw(data, "first_name"),
            or(data, "middle_name", n.clone()),
            raw(data, "last_name"),
            or(data, "suffix", n.clone()),
            raw(data, "birth_date"),
            raw(data, "gender"),
            raw(data, "civil_status"),
            or(data, "address", json!("")),
            or(data, "purok", n.clone()),
            or(data, "birth_place", n.clone()),
            or(data, "contact_number", n.clone()),
            or(data, "email", n.clone()),
            or(data, "occupation", n.clone()),
            or(data, "is_indigent", json!(0)),
            or(data, "voter_status", json!("Not Registered")),
            or(data, "blood_type", n.clone()),
            or(data, "photo_path", n.clone()),
            or(data, "household_id", n.clone()),
            or(data, "partner_id", n.clone()),
            or(data, "mother_id", n.clone()),
            or(data, "father_id", n.clone()),
            or(data, "notes", n.clone()),
            or(data, "religion", n.clone()),
            or(data, "citizenship", json!("Filipino")),
            or(data, "philsys_card_no", n.clone()),
            or(data, "educational_attainment", n.clone()),
            or(data, "is_4ps", json!(0)),
            or(data, "status", json!("living")),
            or(data, "import_batch_id", n.clone()),
            json!(uuid::Uuid::new_v4().to_string()),
            or(data, "is_pwd", json!(0)),
            or(data, "pwd_note", n.clone()),
            or(data, "is_solo_parent", json!(0)),
            or(data, "is_osy", json!(0)),
            or(data, "is_ofw", json!(0)),
            or(data, "is_ip", json!(0)),
            or(data, "ethnicity", n.clone()),
            or(data, "labor_force_status", n.clone()),
            or(data, "residency_status", n.clone()),
            or(data, "residency_start_date", n.clone()),
            or(data, "disability_type", n.clone()),
            or(data, "pwd_id_no", n.clone()),
            or(data, "created_via", json!("desktop")),
            raw(data, "created_by_client"),
        ],
    )?;
    let new_id = result.last_insert_rowid;

    // If partner_id is set, update the partner to link back
    if data.is_truthy("partner_id") {
        if let Some(partner_id) = data.i("partner_id") {
            link_partner(conn, new_id, partner_id)?;
        }
    }

    Ok(new_id)
}

pub fn link_partner(conn: &Connection, resident_id: i64, partner_id: i64) -> Result<()> {
    db::run(
        conn,
        "UPDATE residents SET partner_id = ?, updated_at = datetime('now') WHERE id = ?",
        crate::p![partner_id, resident_id],
    )?;
    db::run(
        conn,
        "UPDATE residents SET partner_id = ?, updated_at = datetime('now') WHERE id = ?",
        crate::p![resident_id, partner_id],
    )?;
    Ok(())
}

pub fn unlink_partner(conn: &Connection, resident_id: i64) -> Result<()> {
    let resident = get_resident_by_id(conn, resident_id)?;
    if let Some(r) = &resident {
        if r.is_truthy("partner_id") {
            db::run(
                conn,
                "UPDATE residents SET partner_id = NULL, updated_at = datetime('now') WHERE id = ?",
                vec![r.get("partner_id").cloned().unwrap_or(Value::Null)],
            )?;
        }
    }
    db::run(
        conn,
        "UPDATE residents SET partner_id = NULL, updated_at = datetime('now') WHERE id = ?",
        crate::p![resident_id],
    )?;
    Ok(())
}

/// `UpdateResult` — `{ success, conflict?, notFound?, current? }`.
/// Pass expectedVersion to enforce optimistic concurrency: the update only
/// applies if the row hasn't changed since the caller read it.
pub fn update_resident(
    conn: &Connection,
    id: i64,
    data: &Map<String, Value>,
    expected_version: Option<i64>,
) -> Result<Value> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    let allowed_fields = [
        "first_name", "middle_name", "last_name", "suffix", "birth_date",
        "gender", "civil_status", "address", "purok", "birth_place", "contact_number", "email",
        "occupation", "is_indigent", "voter_status", "blood_type",
        "photo_path", "household_id", "relationship_to_head", "partner_id", "mother_id", "father_id", "notes",
        "religion", "citizenship", "philsys_card_no", "educational_attainment",
        "is_4ps", "status", "import_batch_id", "death_date", "is_pwd", "pwd_note",
        "is_solo_parent", "is_osy", "is_ofw", "is_ip", "ethnicity", "labor_force_status",
        "residency_status", "residency_start_date", "disability_type", "pwd_id_no",
    ];

    for (key, value) in data {
        if allowed_fields.contains(&key.as_str()) {
            fields.push(format!("{key} = ?"));
            values.push(value.clone());
        }
    }

    // Optimistic concurrency: if the caller read a specific version, only proceed
    // when the row still has that version (catches concurrent edits / edit-after-delete).
    if let Some(expected) = expected_version {
        let row = db::get(conn, "SELECT row_version FROM residents WHERE id = ?", crate::p![id])?;
        let Some(row) = row else {
            return Ok(json!({ "success": false, "notFound": true }));
        };
        if row.get("row_version").and_then(as_i64) != Some(expected) {
            return Ok(json!({ "success": false, "conflict": true, "current": get_resident_by_id(conn, id)? }));
        }
    }

    if fields.is_empty() {
        return Ok(json!({ "success": true }));
    }

    fields.push("updated_at = datetime('now')".into());
    fields.push("row_version = row_version + 1".into());
    values.push(json!(id));

    db::run(conn, &format!("UPDATE residents SET {} WHERE id = ?", fields.join(", ")), values)?;

    // Handle partner linking
    if data.has("partner_id") {
        if data.is_truthy("partner_id") {
            if let Some(partner_id) = data.i("partner_id") {
                link_partner(conn, id, partner_id)?;
            }
        } else {
            let current = get_resident_by_id(conn, id)?;
            if let Some(c) = &current {
                if c.is_truthy("partner_id") {
                    db::run(
                        conn,
                        "UPDATE residents SET partner_id = NULL, updated_at = datetime('now') WHERE id = ?",
                        vec![c.get("partner_id").cloned().unwrap_or(Value::Null)],
                    )?;
                }
            }
        }
    }
    Ok(json!({ "success": true }))
}

pub fn delete_resident(conn: &Connection, id: i64) -> Result<()> {
    unlink_partner(conn, id)?;
    db::run(conn, "DELETE FROM residents WHERE id = ?", crate::p![id])?;
    Ok(())
}

pub fn get_resident_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as count FROM residents WHERE status = 'living'", ())
}

pub fn get_senior_count(conn: &Connection) -> Result<i64> {
    db::count(
        conn,
        "SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) >= 60",
        (),
    )
}

pub fn get_indigent_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND is_indigent = 1", ())
}

pub fn get_youth_count(conn: &Connection) -> Result<i64> {
    db::count(
        conn,
        "SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30 AND (civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))",
        (),
    )
}

pub fn get4_ps_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as count FROM residents WHERE status = 'living' AND is_4ps = 1", ())
}

/// Alias with the more natural snake_case spelling of `get4PsCount`.
pub fn get_4ps_count(conn: &Connection) -> Result<i64> {
    get4_ps_count(conn)
}

pub fn get_solo_parent_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as n FROM residents WHERE status = 'living' AND is_solo_parent = 1", ())
}

pub fn get_osy_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as n FROM residents WHERE status = 'living' AND is_osy = 1", ())
}

pub fn get_ofw_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as n FROM residents WHERE status = 'living' AND is_ofw = 1", ())
}

pub fn get_ip_count(conn: &Connection) -> Result<i64> {
    db::count(conn, "SELECT COUNT(*) as n FROM residents WHERE status = 'living' AND is_ip = 1", ())
}

pub fn get_partner_relationships(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT r1.id, r1.first_name, r1.last_name, r1.partner_id,
           r2.first_name as partner_first_name, r2.last_name as partner_last_name
    FROM residents r1
    JOIN residents r2 ON r1.partner_id = r2.id
    WHERE r1.id < r1.partner_id
  ",
        (),
    )
}

// ─── Children queries ────────────────────────────────────────────────────────

pub fn get_children_of(conn: &Connection, resident_id: i64) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT *,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    WHERE mother_id = ? OR father_id = ?
    ORDER BY birth_date ASC
  ",
        crate::p![resident_id, resident_id],
    )
}

pub fn add_child_link(conn: &Connection, parent_id: i64, parent_gender: &str, child_id: i64) -> Result<()> {
    if parent_gender == "Female" {
        db::run(
            conn,
            "UPDATE residents SET mother_id = ?, updated_at = datetime('now') WHERE id = ?",
            crate::p![parent_id, child_id],
        )?;
    } else {
        db::run(
            conn,
            "UPDATE residents SET father_id = ?, updated_at = datetime('now') WHERE id = ?",
            crate::p![parent_id, child_id],
        )?;
    }
    Ok(())
}

pub fn remove_child_link(conn: &Connection, parent_id: i64, parent_gender: &str, child_id: i64) -> Result<()> {
    if parent_gender == "Female" {
        db::run(
            conn,
            "UPDATE residents SET mother_id = NULL, updated_at = datetime('now') WHERE id = ? AND mother_id = ?",
            crate::p![child_id, parent_id],
        )?;
    } else {
        db::run(
            conn,
            "UPDATE residents SET father_id = NULL, updated_at = datetime('now') WHERE id = ? AND father_id = ?",
            crate::p![child_id, parent_id],
        )?;
    }
    Ok(())
}

// ─── Detailed demographic breakdowns for dashboard charts ───────────────────

pub fn get_gender_distribution(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT gender, COUNT(*) as count FROM residents WHERE status = 'living' GROUP BY gender ORDER BY gender
  ",
        (),
    )
}

pub fn get_senior_age_brackets(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT
      CASE
        WHEN age BETWEEN 60 AND 64 THEN '60-64'
        WHEN age BETWEEN 65 AND 69 THEN '65-69'
        WHEN age BETWEEN 70 AND 74 THEN '70-74'
        WHEN age BETWEEN 75 AND 79 THEN '75-79'
        WHEN age >= 80 THEN '80+'
      END as bracket,
      COUNT(*) as count
    FROM (
      SELECT CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
      FROM residents
      WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) >= 60
    )
    GROUP BY bracket
    ORDER BY bracket
  ",
        (),
    )
}

pub fn get_indigents_by_purok(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT COALESCE(purok, 'Unassigned') as purok, COUNT(*) as count
    FROM residents
    WHERE status = 'living' AND is_indigent = 1
    GROUP BY purok
    ORDER BY purok
  ",
        (),
    )
}

pub fn get_youth_breakdown(conn: &Connection) -> Result<Vec<Value>> {
    // By age sub-brackets
    db::all(
        conn,
        "
    SELECT
      CASE
        WHEN age BETWEEN 15 AND 17 THEN '15-17'
        WHEN age BETWEEN 18 AND 21 THEN '18-21'
        WHEN age BETWEEN 22 AND 25 THEN '22-25'
        WHEN age BETWEEN 26 AND 30 THEN '26-30'
      END as category,
      COUNT(*) as count
    FROM (
      SELECT CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age,
             civil_status
      FROM residents
      WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30
        AND (civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))
    )
    GROUP BY category
    ORDER BY category
  ",
        (),
    )
}

pub fn get_youth_by_occupation(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT
      CASE
        WHEN LOWER(occupation) LIKE '%student%' OR LOWER(occupation) LIKE '%school%' OR LOWER(occupation) LIKE '%study%' OR LOWER(occupation) LIKE '%scholar%' OR LOWER(occupation) LIKE '%college student%' OR LOWER(occupation) LIKE '%vocational student%' THEN 'Studying'
        WHEN occupation IS NOT NULL AND TRIM(occupation) != '' AND LOWER(occupation) NOT LIKE '%none%' AND LOWER(occupation) NOT LIKE '%n/a%' THEN 'Working'
        ELSE 'Not Specified'
      END as category,
      COUNT(*) as count
    FROM residents
    WHERE status = 'living' AND CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) BETWEEN 15 AND 30
      AND (civil_status IS NULL OR LOWER(civil_status) NOT IN ('married', 'widowed'))
    GROUP BY category
    ORDER BY category
  ",
        (),
    )
}

pub fn get_residents_by_purok(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT COALESCE(purok, 'Unassigned') as purok, COUNT(*) as count
    FROM residents
    WHERE status = 'living'
    GROUP BY purok
    ORDER BY purok
  ",
        (),
    )
}

pub fn get_age_distribution(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT
      CASE
        WHEN age BETWEEN 0 AND 14 THEN '0-14 (Children)'
        WHEN age BETWEEN 15 AND 30 THEN '15-30 (Youth)'
        WHEN age BETWEEN 31 AND 59 THEN '31-59 (Adult)'
        WHEN age >= 60 THEN '60+ (Senior)'
      END as bracket,
      COUNT(*) as count
    FROM (
      SELECT CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
      FROM residents
      WHERE status = 'living'
    )
    GROUP BY bracket
    ORDER BY bracket
  ",
        (),
    )
}

// Population pyramid: age brackets split by sex (living residents).
pub fn get_population_pyramid(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT bracket,
      SUM(CASE WHEN gender = 'Male' THEN 1 ELSE 0 END) as male,
      SUM(CASE WHEN gender = 'Female' THEN 1 ELSE 0 END) as female
    FROM (
      SELECT gender,
        CASE
          WHEN age <= 14 THEN '0-14'
          WHEN age <= 24 THEN '15-24'
          WHEN age <= 34 THEN '25-34'
          WHEN age <= 44 THEN '35-44'
          WHEN age <= 54 THEN '45-54'
          WHEN age <= 64 THEN '55-64'
          ELSE '65+'
        END as bracket
      FROM (
        SELECT gender, CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
        FROM residents WHERE status = 'living'
      )
    )
    GROUP BY bracket
  ",
        (),
    )
}

// New-resident registrations per month for the last 12 months (trend line).
pub fn get_monthly_registrations(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM residents WHERE created_at >= date('now', '-12 months') GROUP BY month ORDER BY month ASC",
        (),
    )
}

pub fn get_all_residents_for_tree(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "
    SELECT id, first_name, middle_name, last_name, suffix, gender, partner_id, mother_id, father_id, purok,
      CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER) as age
    FROM residents
    ORDER BY last_name, first_name
  ",
        (),
    )
}
