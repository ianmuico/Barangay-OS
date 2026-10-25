use crate::db::{self, queries::settings::get_setting};
use crate::server::{json_ok, with_db};
use axum::response::Response;
use serde_json::json;

// Read-only demographic summary for dashboards and external apps.
pub async fn stats() -> Response {
    with_db(|conn| {
        let count = |sql: &str| db::count(conn, sql, ());
        let setting = |key: &str| -> anyhow::Result<Option<String>> {
            Ok(get_setting(conn, key)?.filter(|s| !s.is_empty()))
        };

        Ok(json_ok(&json!({
            "barangay": setting("barangay_name")?,
            "municipality": setting("municipality")?,
            "province": setting("province")?,
            "residents": {
                "total": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased'")?,
                "seniors": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND birth_date <= date('now', '-60 years')")?,
                "youth": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND birth_date <= date('now', '-15 years') AND birth_date > date('now', '-31 years')")?,
                "indigents": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND is_indigent = 1")?,
                "fourPs": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND is_4ps = 1")?,
                "pwd": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND is_pwd = 1")?,
                "deceased": count("SELECT COUNT(*) n FROM residents WHERE status = 'deceased'")?,
                "male": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(gender) = 'male'")?,
                "female": count("SELECT COUNT(*) n FROM residents WHERE status != 'deceased' AND LOWER(gender) = 'female'")?,
            },
            "households": count("SELECT COUNT(*) n FROM households")?,
            "cases": {
                "total": count("SELECT COUNT(*) n FROM cases")?,
                "pending": count("SELECT COUNT(*) n FROM cases WHERE status = 'pending'")?,
                "ongoing": count("SELECT COUNT(*) n FROM cases WHERE status = 'ongoing'")?,
                "resolved": count("SELECT COUNT(*) n FROM cases WHERE status = 'resolved'")?,
            },
            "generatedAt": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        })))
    })
    .await
}
