use crate::db::queries::officials::list_officials;
use crate::ipc::truthy;
use crate::server::{js_string, json_ok, query_map, with_db};
use axum::extract::Request;
use axum::response::Response;
use serde_json::{json, Map, Value};

// Read-only list of barangay officials. ?active=true returns current officials only.
pub async fn list(req: Request) -> Response {
    let active_only = query_map(&req).get("active").map(String::as_str) == Some("true");
    with_db(move |conn| {
        let officials: Vec<Value> = list_officials(conn)?
            .into_iter()
            .filter(|o| !active_only || o.get("is_active").is_some_and(truthy))
            .map(|o| {
                let name = ["first_name", "middle_name", "last_name", "suffix"]
                    .iter()
                    .filter_map(|k| o.get(*k).filter(|v| truthy(v)).map(js_string))
                    .collect::<Vec<_>>()
                    .join(" ");
                let mut m = Map::new();
                let copy = |m: &mut Map<String, Value>, k: &str| {
                    if let Some(v) = o.get(k) {
                        m.insert(k.to_string(), v.clone());
                    }
                };
                copy(&mut m, "id");
                copy(&mut m, "position");
                m.insert("name".into(), if name.is_empty() { Value::Null } else { Value::String(name) });
                m.insert("is_active".into(), Value::Bool(o.get("is_active").is_some_and(truthy)));
                copy(&mut m, "start_date");
                copy(&mut m, "end_date");
                copy(&mut m, "sort_order");
                Value::Object(m)
            })
            .collect();
        let total = officials.len();
        Ok(json_ok(&json!({ "data": officials, "total": total })))
    })
    .await
}
