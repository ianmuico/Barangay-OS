use crate::db::queries::{
    app_auth::{app_login, end_app_session, resolve_app_session},
    audit::log_audit,
    settings::get_setting,
};
use crate::ipc::truthy;
use crate::server::{body_obj, header_str, js_string, json_error, json_ok, json_status, with_db};
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::Response;
use rusqlite::Connection;
use serde_json::{json, Value};

fn online_enabled(conn: &Connection) -> anyhow::Result<bool> {
    Ok(get_setting(conn, "online_enabled")?.as_deref() != Some("0"))
}

// User login for the mobile app. Device key (X-API-Key) is already verified by
// apiKeyAuth; this authenticates the human user and returns their permissions.
pub async fn login(req: Request) -> Response {
    let body = body_obj(&req);
    with_db(move |conn| {
        if !online_enabled(conn)? {
            return Ok(json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Online access is currently disabled by the barangay office.",
            ));
        }
        let username = body.get("username").cloned().unwrap_or(Value::Null);
        let password = body.get("password").cloned().unwrap_or(Value::Null);
        if !truthy(&username) || !truthy(&password) {
            return Ok(json_error(StatusCode::BAD_REQUEST, "Username and password are required"));
        }
        let username = js_string(&username);
        let result = app_login(conn, &username, &js_string(&password))?;
        if result.get("error").is_some() {
            log_audit(conn, None, "APP_LOGIN_FAILED", Some(&format!("Failed mobile login for \"{username}\"")))?;
            return Ok(json_status(StatusCode::UNAUTHORIZED, &result));
        }
        let user = result.get("user").cloned().unwrap_or(Value::Null);
        let role = user
            .get("role")
            .filter(|r| truthy(r))
            .map(js_string)
            .unwrap_or_else(|| "no role".to_string());
        let uname = user.get("username").map(js_string).unwrap_or_else(|| "undefined".to_string());
        log_audit(conn, None, "APP_LOGIN", Some(&format!("Mobile login: {uname} ({role})")))?;
        Ok(json_ok(&result))
    })
    .await
}

pub async fn logout(req: Request) -> Response {
    let token = header_str(&req, "x-user-token").filter(|t| !t.is_empty());
    with_db(move |conn| {
        if let Some(token) = token {
            end_app_session(conn, &token)?;
        }
        Ok(json_ok(&json!({ "success": true })))
    })
    .await
}

// Re-fetch the current user + (live) permissions — used on app resume.
pub async fn me(req: Request) -> Response {
    let token = header_str(&req, "x-user-token").filter(|t| !t.is_empty());
    with_db(move |conn| {
        let session = match token {
            Some(t) => resolve_app_session(conn, &t)?,
            None => None,
        };
        let Some(s) = session else {
            return Ok(json_error(StatusCode::UNAUTHORIZED, "Not logged in"));
        };
        let get = |k: &str| s.get(k).cloned().unwrap_or(Value::Null);
        Ok(json_ok(&json!({
            "user": {
                "id": get("userId"),
                "name": get("name"),
                "username": get("username"),
                "role": get("roleName"),
                "permissions": get("perms"),
            }
        })))
    })
    .await
}
