use crate::db::queries::{
    audit::log_audit,
    households::list_households,
    import::find_exact_duplicate,
    residents::{create_resident, delete_resident, get_resident_by_id, get_resident_by_uid, list_residents, update_resident},
};
use crate::ipc::truthy;
use crate::server::middleware::{get_app_user, get_requester, require_perm};
use crate::server::{body_obj, js_parse_int, js_string, json_error, json_ok, json_opt, json_status, parse_int_opt, query_map, with_db};
use axum::extract::{Path, Request};
use axum::http::StatusCode;
use axum::response::Response;
use serde_json::{json, Map, Value};

pub async fn list(req: Request) -> Response {
    let q = query_map(&req);
    let searching = q.get("search").is_some_and(|s| !s.is_empty());
    if let Some(res) = require_perm(get_app_user(&req).as_ref(), if searching { "search" } else { "read" }) {
        return res;
    }
    let mut params = Map::new();
    if let Some(s) = q.get("search") {
        params.insert("search".into(), json!(s));
    }
    params.insert("page".into(), json!(parse_int_opt(q.get("page")).filter(|n| *n != 0).unwrap_or(1)));
    params.insert(
        "limit".into(),
        json!(parse_int_opt(q.get("limit")).filter(|n| *n != 0).unwrap_or(50).min(200)),
    );
    if let Some(s) = q.get("sortBy") {
        params.insert("sortBy".into(), json!(s));
    }
    let desc = q.get("sortOrder").map(String::as_str) == Some("desc");
    params.insert("sortOrder".into(), json!(if desc { "desc" } else { "asc" }));
    if q.get("is_senior").map(String::as_str) == Some("true") {
        params.insert("is_senior".into(), json!(true));
    }
    if q.get("is_indigent").map(String::as_str) == Some("true") {
        params.insert("is_indigent".into(), json!(true));
    }

    with_db(move |conn| Ok(json_ok(&list_residents(conn, &params)?))).await
}

// QR code resolution: the QR encodes the resident's permanent UID
pub async fn by_uid(Path(uid): Path<String>, req: Request) -> Response {
    if let Some(res) = require_perm(get_app_user(&req).as_ref(), "read") {
        return res;
    }
    with_db(move |conn| {
        Ok(match get_resident_by_uid(conn, &uid)? {
            Some(r) => json_ok(&r),
            None => json_error(StatusCode::NOT_FOUND, "Resident not found"),
        })
    })
    .await
}

pub async fn get_one(Path(id): Path<String>, req: Request) -> Response {
    if let Some(res) = require_perm(get_app_user(&req).as_ref(), "read") {
        return res;
    }
    // parseInt → NaN matches no row
    let Some(id) = js_parse_int(&id) else {
        return json_error(StatusCode::NOT_FOUND, "Resident not found");
    };
    with_db(move |conn| {
        Ok(match get_resident_by_id(conn, id)? {
            Some(r) => json_ok(&r),
            None => json_error(StatusCode::NOT_FOUND, "Resident not found"),
        })
    })
    .await
}

// ─── Write endpoints for the mobile partner app ──────────────────────────────
// Gated by the API key like everything else. Deletion is intentionally NOT
// exposed over the network — that stays a desktop admin action.

const REQUIRED_FIELDS: [&str; 5] = ["first_name", "last_name", "birth_date", "gender", "civil_status"];
const WRITABLE_FIELDS: [&str; 22] = [
    "first_name", "middle_name", "last_name", "suffix", "birth_date", "gender",
    "civil_status", "address", "purok", "contact_number", "email", "occupation",
    "is_indigent", "voter_status", "blood_type", "religion", "citizenship",
    "philsys_card_no", "educational_attainment", "is_4ps", "status", "notes",
];

fn pick_writable(body: &Map<String, Value>) -> Map<String, Value> {
    let mut data = Map::new();
    for field in WRITABLE_FIELDS {
        if let Some(v) = body.get(field) {
            data.insert(field.to_string(), v.clone());
        }
    }
    data
}

fn field(body: &Map<String, Value>, key: &str) -> String {
    match body.get(key) {
        Some(v) => js_string(v),
        None => "undefined".to_string(),
    }
}

fn client_suffix(name: &Option<String>) -> String {
    match name.as_deref().filter(|n| !n.is_empty()) {
        Some(n) => format!(" ({n})"),
        None => String::new(),
    }
}

fn err_msg(e: &anyhow::Error, fallback: &str) -> String {
    let m = e.to_string();
    if m.is_empty() { fallback.to_string() } else { m }
}

pub async fn create(req: Request) -> Response {
    if let Some(res) = require_perm(get_app_user(&req).as_ref(), "create") {
        return res;
    }
    let body = body_obj(&req);
    let missing: Vec<&str> = REQUIRED_FIELDS
        .iter()
        .copied()
        .filter(|f| !body.get(*f).is_some_and(truthy))
        .collect();
    if !missing.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, &format!("Missing required fields: {}", missing.join(", ")));
    }
    let requester = get_requester(&req);

    with_db(move |conn| {
        // Duplicate guard — caller can resend with force:true to confirm a real twin.
        if !body.get("force").is_some_and(truthy) {
            let dup = find_exact_duplicate(
                conn,
                &field(&body, "first_name"),
                &field(&body, "last_name"),
                &field(&body, "birth_date"),
            )?;
            if let Some(dup) = dup {
                return Ok(json_status(
                    StatusCode::CONFLICT,
                    &json!({ "error": "A resident with this name and birth date already exists.", "existing": dup }),
                ));
            }
        }
        let attempt = || -> anyhow::Result<Response> {
            let mut data = pick_writable(&body);
            data.insert("created_via".into(), json!("mobile"));
            data.insert(
                "created_by_client".into(),
                if requester.admin { Value::Null } else { json!(requester.client_id) },
            );
            let id = create_resident(conn, &data)?;
            log_audit(
                conn,
                None,
                "RESIDENT_CREATED",
                Some(&format!(
                    "Created via mobile API{}: {} {}",
                    client_suffix(&requester.client_name),
                    field(&body, "first_name"),
                    field(&body, "last_name")
                )),
            )?;
            let resident = get_resident_by_id(conn, id)?;
            Ok(json_opt(StatusCode::CREATED, resident))
        };
        Ok(attempt().unwrap_or_else(|e| json_error(StatusCode::BAD_REQUEST, &err_msg(&e, "Failed to create resident"))))
    })
    .await
}

pub async fn update(Path(id): Path<String>, req: Request) -> Response {
    if let Some(res) = require_perm(get_app_user(&req).as_ref(), "create") {
        return res;
    }
    let Some(id) = js_parse_int(&id) else {
        return json_error(StatusCode::NOT_FOUND, "Resident not found");
    };
    let body = body_obj(&req);
    let requester = get_requester(&req);

    with_db(move |conn| {
        let Some(existing) = get_resident_by_id(conn, id)? else {
            return Ok(json_error(StatusCode::NOT_FOUND, "Resident not found"));
        };
        // Per-device clients may only edit records they themselves created.
        if !requester.admin {
            let owner = existing.get("created_by_client").and_then(Value::as_f64);
            let mine = matches!((owner, requester.client_id), (Some(o), Some(c)) if o == c as f64);
            if !mine {
                return Ok(json_error(
                    StatusCode::FORBIDDEN,
                    "You can only edit residents that were added from this device/account.",
                ));
            }
        }
        let data = pick_writable(&body);
        if data.is_empty() {
            return Ok(json_error(StatusCode::BAD_REQUEST, "No writable fields provided"));
        }
        // Optimistic concurrency: clients send the row_version they last read.
        let expected_version = match body.get("row_version") {
            Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
            _ => None,
        };
        let attempt = || -> anyhow::Result<Response> {
            let result = update_resident(conn, id, &data, expected_version)?;
            if result.get("conflict").is_some_and(truthy) {
                let mut out = Map::new();
                out.insert("error".into(), json!("This record was changed by someone else. Reload before editing."));
                if let Some(current) = result.get("current") {
                    out.insert("current".into(), current.clone());
                }
                return Ok(json_status(StatusCode::CONFLICT, &Value::Object(out)));
            }
            let row = existing.as_object().cloned().unwrap_or_default();
            log_audit(
                conn,
                None,
                "RESIDENT_UPDATED",
                Some(&format!(
                    "Updated via mobile API{}: {} {}",
                    client_suffix(&requester.client_name),
                    field(&row, "first_name"),
                    field(&row, "last_name")
                )),
            )?;
            Ok(json_opt(StatusCode::OK, get_resident_by_id(conn, id)?))
        };
        Ok(attempt().unwrap_or_else(|e| json_error(StatusCode::BAD_REQUEST, &err_msg(&e, "Failed to update resident"))))
    })
    .await
}

pub async fn remove(Path(id): Path<String>, req: Request) -> Response {
    if let Some(res) = require_perm(get_app_user(&req).as_ref(), "delete") {
        return res;
    }
    let Some(id) = js_parse_int(&id) else {
        return json_error(StatusCode::NOT_FOUND, "Resident not found");
    };
    with_db(move |conn| {
        let Some(existing) = get_resident_by_id(conn, id)? else {
            return Ok(json_error(StatusCode::NOT_FOUND, "Resident not found"));
        };
        let attempt = || -> anyhow::Result<Response> {
            delete_resident(conn, id)?;
            let row = existing.as_object().cloned().unwrap_or_default();
            log_audit(
                conn,
                None,
                "RESIDENT_DELETED",
                Some(&format!("Deleted via mobile API: {} {}", field(&row, "first_name"), field(&row, "last_name"))),
            )?;
            Ok(json_ok(&json!({ "success": true })))
        };
        Ok(attempt().unwrap_or_else(|e| json_error(StatusCode::BAD_REQUEST, &err_msg(&e, "Failed to delete resident"))))
    })
    .await
}

pub async fn households() -> Response {
    with_db(|conn| Ok(json_ok(&json!(list_households(conn, &Map::new())?)))).await
}
