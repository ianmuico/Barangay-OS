use crate::ipc::presence::{heartbeat as presence_heartbeat, list_all};
use crate::ipc::truthy;
use crate::server::middleware::get_requester;
use crate::server::{body_obj, js_string, json_error, json_ok};
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::Response;
use serde_json::{json, Map, Value};

// Mobile heartbeat: body { entity, id, action, sessionId } → returns other live actors
pub async fn heartbeat(req: Request) -> Response {
    let body = body_obj(&req);
    let get = |k: &str| body.get(k).cloned().unwrap_or(Value::Null);
    if !truthy(&get("entity")) || !body.contains_key("id") || !truthy(&get("sessionId")) {
        return json_error(StatusCode::BAD_REQUEST, "entity, id and sessionId are required");
    }
    let who = get_requester(&req)
        .client_name
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "Mobile user".to_string());

    let mut input = Map::new();
    input.insert("entity".into(), get("entity"));
    input.insert("id".into(), Value::String(js_string(&get("id"))));
    let action = get("action");
    input.insert("action".into(), if truthy(&action) { action } else { Value::String("editing".into()) });
    input.insert("who".into(), Value::String(who));
    input.insert("sessionId".into(), get("sessionId"));
    if let Some(label) = body.get("label") {
        input.insert("label".into(), label.clone());
    }
    let others = presence_heartbeat(&input);
    json_ok(&json!({ "others": others }))
}

pub async fn list() -> Response {
    json_ok(&json!({ "active": list_all() }))
}
