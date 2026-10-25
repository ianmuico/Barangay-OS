//! Residents, households, dashboard and CSV import/export handlers — port of
//! the matching sections of `main/ipc/database.ts`.

use super::{auth, fail, truthy, Args, HResult, ObjExt};
use crate::db::{
    self,
    queries::{audit::log_audit, cases, households, import as import_module, residents},
};
use crate::utils::dialogs::{self, DialogOptions};
use crate::utils::logger::log_error;
use anyhow::Result;
use serde_json::{json, Map, Value};
use std::path::Path;

/// JS template-literal interpolation of a field (`${x}`): missing → "undefined".
fn tpl(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => match n.as_i64() {
            Some(i) => i.to_string(),
            None => n.to_string(),
        },
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Array(_)) => String::new(),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// `path.basename(p)`.
fn basename(p: &str) -> String {
    Path::new(p).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
}

/// `fs.readFileSync(p, 'utf-8')`.
fn read_utf8(p: &str) -> Result<String> {
    let bytes = std::fs::read(p)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn ok() -> HResult {
    Ok(json!({ "success": true }))
}

// === Residents ===

fn residents_list(a: &Args) -> HResult {
    let conn = db::conn();
    residents::list_residents(&conn, &a.obj(0))
}

fn residents_get(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(residents::get_resident_by_id(&conn, id)?))
}

fn residents_search(a: &Args) -> HResult {
    let query = a.str(0)?;
    let limit = a.opt_i64(1).unwrap_or(20);
    let conn = db::conn();
    Ok(json!(residents::search_residents(&conn, &query, limit)?))
}

fn residents_create(a: &Args) -> HResult {
    let data = a.obj(0);
    let user_id = auth::current_user_id();
    let conn = db::conn();
    // Duplicate guard — unless the admin confirms (force) it's a different person.
    if !data.is_truthy("force")
        && data.is_truthy("first_name")
        && data.is_truthy("last_name")
        && data.is_truthy("birth_date")
    {
        let dup = import_module::find_exact_duplicate(
            &conn,
            &data.s("first_name").unwrap_or_default(),
            &data.s("last_name").unwrap_or_default(),
            &data.s("birth_date").unwrap_or_default(),
        )?;
        if let Some(dup) = dup {
            return Ok(json!({ "duplicate": dup }));
        }
    }
    let mut clean = data.clone();
    clean.remove("force");
    let id = residents::create_resident(&conn, &clean)?;
    log_audit(
        &conn,
        user_id,
        "RESIDENT_CREATED",
        Some(&format!("Created resident: {} {}", tpl(data.get("first_name")), tpl(data.get("last_name")))),
    )?;
    Ok(json!({ "id": id }))
}

fn residents_update(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let data = a.obj(1);
    let expected_version = a.opt_i64(2);
    let user_id = auth::current_user_id();
    let conn = db::conn();
    let result = residents::update_resident(&conn, id, &data, expected_version)?;
    if result.is_truthy("conflict") {
        return Ok(json!({
            "success": false,
            "conflict": true,
            "current": result.get("current").cloned().unwrap_or(Value::Null),
        }));
    }
    log_audit(&conn, user_id, "RESIDENT_UPDATED", Some(&format!("Updated resident ID: {id}")))?;
    ok()
}

fn residents_delete(a: &Args) -> HResult {
    let user = auth::require_admin()?;
    let id = a.i64(0)?;
    let conn = db::conn();
    let resident = residents::get_resident_by_id(&conn, id)?;
    residents::delete_resident(&conn, id)?;
    let (first, last) = match &resident {
        Some(r) => (tpl(r.get("first_name")), tpl(r.get("last_name"))),
        None => ("undefined".to_string(), "undefined".to_string()),
    };
    log_audit(&conn, Some(user.id), "RESIDENT_DELETED", Some(&format!("Deleted resident: {first} {last}")))?;
    ok()
}

fn residents_link_partner(a: &Args) -> HResult {
    let (resident_id, partner_id) = (a.i64(0)?, a.i64(1)?);
    let conn = db::conn();
    residents::link_partner(&conn, resident_id, partner_id)?;
    ok()
}

fn residents_unlink_partner(a: &Args) -> HResult {
    let resident_id = a.i64(0)?;
    let conn = db::conn();
    residents::unlink_partner(&conn, resident_id)?;
    ok()
}

fn residents_tree() -> HResult {
    let conn = db::conn();
    Ok(json!(residents::get_all_residents_for_tree(&conn)?))
}

fn residents_relationships() -> HResult {
    let conn = db::conn();
    Ok(json!(residents::get_partner_relationships(&conn)?))
}

fn residents_children(a: &Args) -> HResult {
    let resident_id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(residents::get_children_of(&conn, resident_id)?))
}

fn residents_add_child(a: &Args) -> HResult {
    let parent_id = a.i64(0)?;
    let parent_gender = a.opt_str(1).unwrap_or_default();
    let child_id = a.i64(2)?;
    let conn = db::conn();
    residents::add_child_link(&conn, parent_id, &parent_gender, child_id)?;
    ok()
}

fn residents_remove_child(a: &Args) -> HResult {
    let parent_id = a.i64(0)?;
    let parent_gender = a.opt_str(1).unwrap_or_default();
    let child_id = a.i64(2)?;
    let conn = db::conn();
    residents::remove_child_link(&conn, parent_id, &parent_gender, child_id)?;
    ok()
}

// === Households ===

fn households_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(households::list_households(&conn, &a.obj(0))?))
}

fn households_get(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(households::get_household_by_id(&conn, id)?))
}

fn households_members(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    Ok(json!(households::get_household_members(&conn, id)?))
}

fn households_create(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(households::create_household(&conn, &a.obj(0))?))
}

fn households_update(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    households::update_household(&conn, id, &a.obj(1))?;
    ok()
}

fn households_delete(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let conn = db::conn();
    households::delete_household(&conn, id)?;
    ok()
}

fn households_add_member(a: &Args) -> HResult {
    let (household_id, resident_id) = (a.i64(0)?, a.i64(1)?);
    let relationship = a.opt_str(2);
    let conn = db::conn();
    households::add_household_member(&conn, household_id, resident_id, relationship.as_deref())?;
    ok()
}

fn households_remove_member(a: &Args) -> HResult {
    let resident_id = a.i64(0)?;
    let conn = db::conn();
    households::remove_household_member(&conn, resident_id)?;
    ok()
}

fn households_set_head(a: &Args) -> HResult {
    let (household_id, resident_id) = (a.i64(0)?, a.i64(1)?);
    let conn = db::conn();
    households::set_household_head(&conn, household_id, resident_id)?;
    ok()
}

// === Dashboard ===

fn dashboard_stats() -> HResult {
    let conn = db::conn();
    Ok(json!({
        "totalResidents": residents::get_resident_count(&conn)?,
        "totalSeniors": residents::get_senior_count(&conn)?,
        "totalIndigents": residents::get_indigent_count(&conn)?,
        "totalYouth": residents::get_youth_count(&conn)?,
        "total4Ps": residents::get4_ps_count(&conn)?,
        "totalPWD": residents::get_pwd_count(&conn)?,
    }))
}

fn analytics_overview() -> HResult {
    let conn = db::conn();
    Ok(json!({
        "pyramid": residents::get_population_pyramid(&conn)?,
        "monthly": residents::get_monthly_registrations(&conn)?,
    }))
}

fn dashboard_detailed() -> HResult {
    let conn = db::conn();
    let count = |sql: &str| -> Result<i64> { db::count(&conn, sql, ()) };

    let active_cases: Vec<Value> = cases::list_cases(&conn, &Map::new())?
        .into_iter()
        .filter(|c| {
            let status = c.get("status").and_then(|s| s.as_str());
            status == Some("pending") || status == Some("ongoing")
        })
        .take(6)
        .map(|c| {
            let pick = |a: &str, b: &str| -> Option<Value> {
                [a, b].iter().find_map(|k| c.get(*k).filter(|v| truthy(v)).cloned())
            };
            let parties: Vec<String> = [
                pick("complainant_names", "complainant_name"),
                pick("respondent_names", "respondent_name"),
            ]
            .into_iter()
            .flatten()
            .map(|v| tpl(Some(&v)))
            .collect();
            let field = |k: &str| c.get(k).cloned().unwrap_or(Value::Null);
            json!({
                "id": field("id"),
                "case_number": field("case_number"),
                "case_type": field("case_type"),
                "status": field("status"),
                "filed_date": field("filed_date"),
                "parties": parties.join(" vs "),
            })
        })
        .collect();

    Ok(json!({
        "genderDistribution": residents::get_gender_distribution(&conn)?,
        "ageDistribution": residents::get_age_distribution(&conn)?,
        "seniorAgeBrackets": residents::get_senior_age_brackets(&conn)?,
        "indigentsByPurok": residents::get_indigents_by_purok(&conn)?,
        "youthByAge": residents::get_youth_breakdown(&conn)?,
        "youthByOccupation": residents::get_youth_by_occupation(&conn)?,
        "residentsByPurok": residents::get_residents_by_purok(&conn)?,
        "civilStatusDistribution": db::all(
            &conn,
            "SELECT COALESCE(civil_status, 'Unknown') as status, COUNT(*) as count FROM residents WHERE status != 'deceased' GROUP BY civil_status ORDER BY count DESC",
            (),
        )?,
        "voterStats": {
            "registered": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(COALESCE(voter_status,'')) = 'registered'")?,
            "notRegistered": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(COALESCE(voter_status,'')) != 'registered'")?,
        },
        "monthlyRegistrations": db::all(
            &conn,
            "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM residents WHERE created_at >= date('now', '-12 months') GROUP BY month ORDER BY month ASC",
            (),
        )?,
        "caseStats": {
            "total": count("SELECT COUNT(*) n FROM cases")?,
            "pending": count("SELECT COUNT(*) n FROM cases WHERE status = 'pending'")?,
            "ongoing": count("SELECT COUNT(*) n FROM cases WHERE status = 'ongoing'")?,
            "resolved": count("SELECT COUNT(*) n FROM cases WHERE status = 'resolved'")?,
            "dismissed": count("SELECT COUNT(*) n FROM cases WHERE status = 'dismissed'")?,
        },
        "householdCount": count("SELECT COUNT(*) n FROM households")?,
        "deceasedCount": count("SELECT COUNT(*) n FROM residents WHERE status = 'deceased'")?,
        "upcomingSummons": cases::get_upcoming_summons(&conn, 5)?,
        "activeCases": active_cases,
    }))
}

// ═══ CSV Import / Export ════════════════════════════════════════════════

fn import_get_csv_headers(a: &Args) -> HResult {
    let res = (|| -> Result<Vec<String>> {
        let file_path = a.str(0)?;
        let content = read_utf8(&file_path)?;
        Ok(import_module::parse_csv_headers(&content))
    })();
    match res {
        Ok(headers) => Ok(json!(headers)),
        Err(err) => {
            log_error("Failed to read CSV headers", &err);
            Ok(json!([]))
        }
    }
}

fn import_get_system_fields() -> HResult {
    Ok(json!(import_module::get_system_fields()))
}

fn import_run(a: &Args) -> HResult {
    let options = a.obj(0);
    let res = (|| -> Result<Value> {
        let file_path = options.s("filePath").ok_or_else(|| anyhow::anyhow!("The \"path\" argument must be of type string"))?;
        let content = read_utf8(&file_path)?;
        let rows = import_module::parse_csv_rows(&content);
        let user_id = auth::current_user_id();
        let conn = db::conn();
        let batch_id = import_module::create_import_batch(&conn, &basename(&file_path), user_id)?;
        let mapping = match options.get("mapping") {
            Some(Value::Object(m)) => m.clone(),
            _ => Map::new(),
        };
        let date_format = tpl(options.get("dateFormat"));
        let result = import_module::run_import(
            &conn,
            &rows,
            &mapping,
            &date_format,
            batch_id,
            options.is_truthy("skipDuplicates"),
        )?;
        log_audit(
            &conn,
            user_id,
            "CSV_IMPORTED",
            Some(&format!(
                "Imported {} residents from {} (batch {batch_id})",
                tpl(result.get("totalImported")),
                basename(&file_path)
            )),
        )?;
        Ok(result)
    })();
    match res {
        Ok(v) => Ok(v),
        Err(err) => {
            log_error("CSV import failed", &err);
            let msg = err.to_string();
            Ok(json!({
                "batchId": 0,
                "totalImported": 0,
                "totalSkipped": 0,
                "totalErrors": 1,
                "errors": [{ "row": 0, "field": "_system", "message": if msg.is_empty() { "Import failed".to_string() } else { msg } }],
                "duplicates": [],
            }))
        }
    }
}

fn import_rollback(a: &Args) -> HResult {
    let res = (|| -> Result<Value> {
        let batch_id = a.i64(0)?;
        let user_id = auth::current_user_id();
        let conn = db::conn();
        let result = import_module::rollback_import_batch(&conn, batch_id)?;
        let deleted = result.get("deletedCount").cloned().unwrap_or(json!(0));
        log_audit(
            &conn,
            user_id,
            "IMPORT_ROLLED_BACK",
            Some(&format!("Rolled back import batch {batch_id}: {} residents removed", tpl(Some(&deleted)))),
        )?;
        Ok(json!({ "success": true, "deletedCount": deleted }))
    })();
    match res {
        Ok(v) => Ok(v),
        Err(err) => {
            log_error("Import rollback failed", &err);
            Ok(fail(err))
        }
    }
}

fn import_download_template() -> HResult {
    let res = (|| -> Result<Value> {
        let picked = dialogs::save_file(&DialogOptions::new(
            "Save CSV Template",
            "resident-import-template.csv",
            &[("CSV", &["csv"])],
        ));
        let Some(file_path) = picked else {
            return Ok(json!({ "success": false }));
        };
        let template = import_module::get_csv_template_headers();
        std::fs::write(&file_path, format!("{template}\n"))?;
        Ok(json!({ "success": true, "path": file_path.to_string_lossy() }))
    })();
    match res {
        Ok(v) => Ok(v),
        Err(err) => {
            log_error("Download template failed", &err);
            Ok(fail(err))
        }
    }
}

fn export_residents(a: &Args) -> HResult {
    let params = a.obj(0);
    let res = (|| -> Result<Value> {
        auth::require_admin()?;
        let csv = {
            let conn = db::conn();
            import_module::export_residents_to_csv(&conn, &params)?
        };
        if csv.is_empty() {
            return Ok(fail("No data to export"));
        }

        let picked = dialogs::save_file(&DialogOptions::new(
            "Export Residents",
            "residents-export.csv",
            &[("CSV", &["csv"])],
        ));
        let Some(file_path) = picked else {
            return Ok(json!({ "success": false }));
        };

        // Add BOM for Excel compatibility
        std::fs::write(&file_path, format!("\u{feff}{csv}"))?;
        let user_id = auth::current_user_id();
        let conn = db::conn();
        log_audit(
            &conn,
            user_id,
            "RESIDENTS_EXPORTED",
            Some(&format!("Exported residents to {}", basename(&file_path.to_string_lossy()))),
        )?;
        Ok(json!({ "success": true, "path": file_path.to_string_lossy() }))
    })();
    match res {
        Ok(v) => Ok(v),
        Err(err) => {
            log_error("Export failed", &err);
            Ok(fail(err))
        }
    }
}

fn import_list_batches() -> HResult {
    let conn = db::conn();
    Ok(json!(import_module::list_import_batches(&conn)?))
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        // === Residents ===
        "db:residents:list" => residents_list(a),
        "db:residents:get" => residents_get(a),
        "db:residents:search" => residents_search(a),
        "db:residents:create" => residents_create(a),
        "db:residents:update" => residents_update(a),
        "db:residents:delete" => residents_delete(a),
        "db:residents:linkPartner" => residents_link_partner(a),
        "db:residents:unlinkPartner" => residents_unlink_partner(a),
        "db:residents:tree" => residents_tree(),
        "db:residents:relationships" => residents_relationships(),
        "db:residents:children" => residents_children(a),
        "db:residents:addChild" => residents_add_child(a),
        "db:residents:removeChild" => residents_remove_child(a),

        // === Households ===
        "db:households:list" => households_list(a),
        "db:households:get" => households_get(a),
        "db:households:members" => households_members(a),
        "db:households:create" => households_create(a),
        "db:households:update" => households_update(a),
        "db:households:delete" => households_delete(a),
        "db:households:addMember" => households_add_member(a),
        "db:households:removeMember" => households_remove_member(a),
        "db:households:setHead" => households_set_head(a),

        // === Dashboard ===
        "db:dashboard:stats" => dashboard_stats(),
        "db:analytics:overview" => analytics_overview(),
        "db:dashboard:detailed" => dashboard_detailed(),

        // ═══ CSV Import / Export ═══
        "db:import:getCSVHeaders" => import_get_csv_headers(a),
        "db:import:getSystemFields" => import_get_system_fields(),
        "db:import:run" => import_run(a),
        "db:import:rollback" => import_rollback(a),
        "db:import:downloadTemplate" => import_download_template(),
        "db:export:residents" => export_residents(a),
        "db:import:listBatches" => import_list_batches(),

        _ => return None,
    })
}
