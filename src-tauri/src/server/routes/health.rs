use crate::db::queries::settings::get_setting;
use crate::server::{json_ok, with_db};
use axum::response::Response;
use serde_json::json;

pub async fn health() -> Response {
    with_db(|conn| {
        let barangay = get_setting(conn, "barangay_name")?.filter(|s| !s.is_empty());
        Ok(json_ok(&json!({
            "status": "ok",
            "version": "1.0.0",
            "barangay": barangay.unwrap_or_else(|| "Barangay".to_string()),
            "timestamp": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        })))
    })
    .await
}
