//! Record-keeping IPC handlers — port of these sections of
//! `main/ipc/database.ts`: Issuances, Blotter, P2 governance modules (assets,
//! finance, devplan, gad, disaster, institutions), Officials, Resident issues,
//! Businesses, Outside owners, Cases & Summons (incl. `db:summons:upcoming`).
//!
//! The TS handlers in these sections perform no RBAC checks; only the audit
//! rows below read the session user.

use super::{auth, Args, HResult};
use crate::db::{
    self,
    queries::{
        assets, audit::log_audit, blotter, businesses, cases, dev_plan, disaster, finance, gad, institutions,
        issuances, issues, officials,
    },
};
use serde_json::{json, Value};

fn ok() -> HResult {
    Ok(json!({ "success": true }))
}

/// `owners` array argument, or `None` when not an array.
fn arr(a: &Args, i: usize) -> Option<&[Value]> {
    match a.raw(i) {
        Value::Array(v) => Some(v.as_slice()),
        _ => None,
    }
}

// ─── Issuances (BORIS: ordinances / resolutions / executive orders) ─────────

fn issuances_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(issuances::list_issuances(&conn, &a.obj(0))?))
}
fn issuances_get(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(issuances::get_issuance_by_id(&conn, a.i64(0)?)?))
}
fn issuances_create(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(issuances::create_issuance(&conn, &a.obj(0))?))
}
fn issuances_update(a: &Args) -> HResult {
    let conn = db::conn();
    issuances::update_issuance(&conn, a.i64(0)?, &a.obj(1))?;
    ok()
}
fn issuances_delete(a: &Args) -> HResult {
    let conn = db::conn();
    issuances::delete_issuance(&conn, a.i64(0)?)?;
    ok()
}

// ─── Blotter / incident registry + VAW desk ─────────────────────────────────

fn blotter_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(blotter::list_blotter(&conn, &a.obj(0))?))
}
fn blotter_get(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(blotter::get_blotter_by_id(&conn, a.i64(0)?)?))
}
fn blotter_create(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(blotter::create_blotter(&conn, &a.obj(0))?))
}
fn blotter_update(a: &Args) -> HResult {
    let conn = db::conn();
    blotter::update_blotter(&conn, a.i64(0)?, &a.obj(1))?;
    ok()
}
fn blotter_delete(a: &Args) -> HResult {
    let conn = db::conn();
    blotter::delete_blotter(&conn, a.i64(0)?)?;
    ok()
}

// ─── P2 governance modules (BAMS / BFMS / BDP / GAD / BDRIS / BBI) ──────────

/// list / get / create / update / delete for the near-identical CRUD modules.
macro_rules! crud {
    ($a:expr, $op:expr, $list:path, $get:path, $create:path, $update:path, $delete:path) => {{
        let a: &Args = $a;
        let conn = db::conn();
        match $op {
            "list" => Ok(json!($list(&conn, &a.obj(0))?)),
            "get" => Ok(json!($get(&conn, a.i64(0)?)?)),
            "create" => Ok(json!($create(&conn, &a.obj(0))?)),
            "update" => {
                $update(&conn, a.i64(0)?, &a.obj(1))?;
                ok()
            }
            _ => {
                $delete(&conn, a.i64(0)?)?;
                ok()
            }
        }
    }};
}

// Assets (BAMS)
fn assets_op(op: &str, a: &Args) -> HResult {
    crud!(
        a,
        op,
        assets::list_assets,
        assets::get_asset_by_id,
        assets::create_asset,
        assets::update_asset,
        assets::delete_asset
    )
}
// Finance (BFMS)
fn finance_op(op: &str, a: &Args) -> HResult {
    crud!(
        a,
        op,
        finance::list_financial_records,
        finance::get_financial_record_by_id,
        finance::create_financial_record,
        finance::update_financial_record,
        finance::delete_financial_record
    )
}
fn finance_summary(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(finance::get_financial_summary(&conn, a.opt_i64(0))?))
}
// Development projects (BDP)
fn devplan_op(op: &str, a: &Args) -> HResult {
    crud!(
        a,
        op,
        dev_plan::list_projects,
        dev_plan::get_project_by_id,
        dev_plan::create_project,
        dev_plan::update_project,
        dev_plan::delete_project
    )
}
// GAD (BGADPBMS)
fn gad_op(op: &str, a: &Args) -> HResult {
    crud!(a, op, gad::list_gad, gad::get_gad_by_id, gad::create_gad, gad::update_gad, gad::delete_gad)
}
// Disaster (BDRIS)
fn disaster_op(op: &str, a: &Args) -> HResult {
    crud!(
        a,
        op,
        disaster::list_disaster,
        disaster::get_disaster_by_id,
        disaster::create_disaster,
        disaster::update_disaster,
        disaster::delete_disaster
    )
}
// Institutions (BBI)
fn institutions_op(op: &str, a: &Args) -> HResult {
    crud!(
        a,
        op,
        institutions::list_institutions,
        institutions::get_institution_by_id,
        institutions::create_institution,
        institutions::update_institution,
        institutions::delete_institution
    )
}

// ─── Officials ──────────────────────────────────────────────────────────────

fn officials_list() -> HResult {
    let conn = db::conn();
    Ok(json!(officials::list_officials(&conn)?))
}
fn officials_get(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(officials::get_official_by_id(&conn, a.i64(0)?)?))
}
fn officials_create(a: &Args) -> HResult {
    let data = a.obj(0);
    // Session user read before locking the DB (auth may lock it briefly).
    let user_id = auth::current_user_id();
    let conn = db::conn();
    let id = officials::create_official(&conn, &data)?;
    log_audit(
        &conn,
        user_id,
        "OFFICIAL_CREATED",
        Some(&format!("Created official: {}", assets::js_str(data.get("position")))),
    )?;
    Ok(json!(id))
}
fn officials_update(a: &Args) -> HResult {
    let conn = db::conn();
    officials::update_official(&conn, a.i64(0)?, &a.obj(1))?;
    ok()
}
fn officials_delete(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let user_id = auth::current_user_id();
    let conn = db::conn();
    officials::delete_official(&conn, id)?;
    log_audit(&conn, user_id, "OFFICIAL_DELETED", Some(&format!("Deleted official ID: {id}")))?;
    ok()
}

// ─── Resident issues (behavior flags) ───────────────────────────────────────

fn issues_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(issues::list_issues_for_resident(&conn, a.i64(0)?)?))
}
fn issues_create(a: &Args) -> HResult {
    let user_id = auth::current_user_id();
    let mut data = a.obj(0);
    data.insert("created_by".into(), json!(user_id.unwrap_or(0)));
    let conn = db::conn();
    let id = issues::create_issue(&conn, &data)?;
    log_audit(
        &conn,
        user_id,
        "ISSUE_CREATED",
        Some(&format!(
            "Flagged resident #{}: {}",
            assets::js_str(data.get("resident_id")),
            assets::js_str(data.get("title"))
        )),
    )?;
    Ok(json!(id))
}
fn issues_update(a: &Args) -> HResult {
    let conn = db::conn();
    issues::update_issue(&conn, a.i64(0)?, &a.obj(1))?;
    ok()
}
fn issues_delete(a: &Args) -> HResult {
    let conn = db::conn();
    issues::delete_issue(&conn, a.i64(0)?)?;
    ok()
}
fn issues_flagged(a: &Args) -> HResult {
    let search = a.opt_str(0);
    let conn = db::conn();
    Ok(json!(issues::list_flagged_residents(&conn, search.as_deref())?))
}

// ─── Businesses ─────────────────────────────────────────────────────────────

fn businesses_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(businesses::list_businesses(&conn, &a.obj(0))?))
}
fn businesses_owners(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(businesses::get_business_owners(&conn, a.i64(0)?)?))
}
fn businesses_create(a: &Args) -> HResult {
    let data = a.obj(0);
    let owners = arr(a, 1).unwrap_or(&[]);
    let user_id = auth::current_user_id();
    let conn = db::conn();
    let id = businesses::create_business(&conn, &data, owners)?;
    log_audit(
        &conn,
        user_id,
        "BUSINESS_CREATED",
        Some(&format!("Registered business \"{}\"", assets::js_str(data.get("name")))),
    )?;
    Ok(json!(id))
}
fn businesses_update(a: &Args) -> HResult {
    let conn = db::conn();
    businesses::update_business(&conn, a.i64(0)?, &a.obj(1), arr(a, 2))?;
    ok()
}
fn businesses_delete(a: &Args) -> HResult {
    let conn = db::conn();
    businesses::delete_business(&conn, a.i64(0)?)?;
    ok()
}

// ─── Outside owners ─────────────────────────────────────────────────────────

fn outsiders_list(a: &Args) -> HResult {
    let search = a.opt_str(0);
    let conn = db::conn();
    Ok(json!(businesses::list_outside_owners(&conn, search.as_deref())?))
}
fn outsiders_create(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(businesses::create_outside_owner(&conn, &a.obj(0))?))
}
fn outsiders_update(a: &Args) -> HResult {
    let conn = db::conn();
    businesses::update_outside_owner(&conn, a.i64(0)?, &a.obj(1))?;
    ok()
}
fn outsiders_delete(a: &Args) -> HResult {
    let conn = db::conn();
    businesses::delete_outside_owner(&conn, a.i64(0)?)?;
    ok()
}

// ─── Cases & Summons ────────────────────────────────────────────────────────

fn cases_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(cases::list_cases(&conn, &a.obj(0))?))
}
fn cases_get(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(cases::get_case_by_id(&conn, a.i64(0)?)?))
}
fn cases_create(a: &Args) -> HResult {
    // const { parties, ...caseData } = data;
    let mut case_data = a.obj(0);
    let parties = case_data.remove("parties");
    let user_id = auth::current_user_id();
    let conn = db::conn();
    let id = cases::create_case(&conn, &case_data)?;
    if let Some(Value::Array(p)) = &parties {
        cases::set_case_parties(&conn, id, p)?;
    }
    log_audit(&conn, user_id, "CASE_CREATED", Some("Created case"))?;
    Ok(json!(id))
}
fn cases_update(a: &Args) -> HResult {
    let id = a.i64(0)?;
    let mut case_data = a.obj(1);
    let parties = case_data.remove("parties");
    let conn = db::conn();
    cases::update_case(&conn, id, &case_data)?;
    if let Some(Value::Array(p)) = &parties {
        cases::set_case_parties(&conn, id, p)?;
    }
    ok()
}
fn cases_parties(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(cases::list_case_parties(&conn, a.i64(0)?)?))
}
fn cases_delete(a: &Args) -> HResult {
    let conn = db::conn();
    cases::delete_case(&conn, a.i64(0)?)?;
    ok()
}
fn summons_list(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(cases::list_summons(&conn, a.i64(0)?)?))
}
fn summons_create(a: &Args) -> HResult {
    let conn = db::conn();
    Ok(json!(cases::create_summon(&conn, &a.obj(0))?))
}
fn summons_update(a: &Args) -> HResult {
    let conn = db::conn();
    cases::update_summon(&conn, a.i64(0)?, &a.obj(1))?;
    ok()
}
fn summons_delete(a: &Args) -> HResult {
    let conn = db::conn();
    cases::delete_summon(&conn, a.i64(0)?)?;
    ok()
}
/// Upcoming summons (for reminders) — `limit || 50`.
fn summons_upcoming(a: &Args) -> HResult {
    let limit = a.opt_i64(0).filter(|n| *n != 0).unwrap_or(50);
    let conn = db::conn();
    Ok(json!(cases::get_upcoming_summons(&conn, limit)?))
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        // Issuances
        "db:issuances:list" => issuances_list(a),
        "db:issuances:get" => issuances_get(a),
        "db:issuances:create" => issuances_create(a),
        "db:issuances:update" => issuances_update(a),
        "db:issuances:delete" => issuances_delete(a),
        // Blotter
        "db:blotter:list" => blotter_list(a),
        "db:blotter:get" => blotter_get(a),
        "db:blotter:create" => blotter_create(a),
        "db:blotter:update" => blotter_update(a),
        "db:blotter:delete" => blotter_delete(a),
        // P2 governance
        "db:assets:list" | "db:assets:get" | "db:assets:create" | "db:assets:update" | "db:assets:delete" => {
            assets_op(&channel["db:assets:".len()..], a)
        }
        "db:finance:summary" => finance_summary(a),
        "db:finance:list" | "db:finance:get" | "db:finance:create" | "db:finance:update" | "db:finance:delete" => {
            finance_op(&channel["db:finance:".len()..], a)
        }
        "db:devplan:list" | "db:devplan:get" | "db:devplan:create" | "db:devplan:update" | "db:devplan:delete" => {
            devplan_op(&channel["db:devplan:".len()..], a)
        }
        "db:gad:list" | "db:gad:get" | "db:gad:create" | "db:gad:update" | "db:gad:delete" => {
            gad_op(&channel["db:gad:".len()..], a)
        }
        "db:disaster:list" | "db:disaster:get" | "db:disaster:create" | "db:disaster:update"
        | "db:disaster:delete" => disaster_op(&channel["db:disaster:".len()..], a),
        "db:institutions:list"
        | "db:institutions:get"
        | "db:institutions:create"
        | "db:institutions:update"
        | "db:institutions:delete" => institutions_op(&channel["db:institutions:".len()..], a),
        // Officials
        "db:officials:list" => officials_list(),
        "db:officials:get" => officials_get(a),
        "db:officials:create" => officials_create(a),
        "db:officials:update" => officials_update(a),
        "db:officials:delete" => officials_delete(a),
        // Resident issues
        "db:issues:list" => issues_list(a),
        "db:issues:create" => issues_create(a),
        "db:issues:update" => issues_update(a),
        "db:issues:delete" => issues_delete(a),
        "db:issues:flagged" => issues_flagged(a),
        // Businesses
        "db:businesses:list" => businesses_list(a),
        "db:businesses:owners" => businesses_owners(a),
        "db:businesses:create" => businesses_create(a),
        "db:businesses:update" => businesses_update(a),
        "db:businesses:delete" => businesses_delete(a),
        // Outside owners
        "db:outsiders:list" => outsiders_list(a),
        "db:outsiders:create" => outsiders_create(a),
        "db:outsiders:update" => outsiders_update(a),
        "db:outsiders:delete" => outsiders_delete(a),
        // Cases & summons
        "db:cases:list" => cases_list(a),
        "db:cases:get" => cases_get(a),
        "db:cases:create" => cases_create(a),
        "db:cases:update" => cases_update(a),
        "db:cases:parties" => cases_parties(a),
        "db:cases:delete" => cases_delete(a),
        "db:summons:list" => summons_list(a),
        "db:summons:create" => summons_create(a),
        "db:summons:update" => summons_update(a),
        "db:summons:delete" => summons_delete(a),
        "db:summons:upcoming" => summons_upcoming(a),
        _ => return None,
    })
}
