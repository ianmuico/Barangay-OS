//! Backend smoke test against a COPY of a real database.
//!
//! Calls every read-only IPC channel through the same dispatcher the renderer
//! uses and fails on any SQL / schema error. Ignored by default:
//!
//!   BMS_USER_DATA=/path/to/copy cargo test --test smoke -- --ignored --nocapture
//!
//! The admin password in the copy is reset to a throwaway test value.

use app_lib::db;
use app_lib::ipc::{dispatch, Args};
use serde_json::{json, Value};

const READ_CHANNELS: &[&str] = &[
    "auth:getCurrentUser", "auth:recoveryStatus",
    "db:residents:list", "db:residents:tree", "db:residents:relationships",
    "db:households:list", "db:issuances:list", "db:blotter:list", "db:assets:list",
    "db:finance:list", "db:finance:summary", "db:devplan:list", "db:gad:list",
    "db:disaster:list", "db:institutions:list", "db:templates:list",
    "reports:generateFormC", "db:analytics:overview", "bims:validate",
    "db:reports:list", "db:reports:listDocs", "db:reports:storageStats",
    "db:summons:upcoming", "db:issues:flagged",
    "db:businesses:list", "db:outsiders:list",
    "db:officials:list", "db:users:list", "db:settings:getAll",
    "db:dashboard:stats", "db:dashboard:detailed", "db:audit:list",
    "server:status", "tunnel:status", "db:apiclients:list", "presence:list",
    "db:approles:list", "db:appusers:list", "db:cases:list",
    "db:import:getSystemFields", "db:import:listBatches", "db:analytics:summary",
    "file:getLogoBase64",
];

/// Channels that take an id: (channel, list channel to borrow an id from).
const BY_ID: &[(&str, &str)] = &[
    ("db:residents:get", "db:residents:list"),
    ("db:residents:children", "db:residents:list"),
    ("db:households:get", "db:households:list"),
    ("db:households:members", "db:households:list"),
    ("db:templates:get", "db:templates:list"),
    ("reports:getInputFields", "db:templates:list"),
    ("db:officials:get", "db:officials:list"),
    ("db:cases:get", "db:cases:list"),
    ("db:cases:parties", "db:cases:list"),
    ("db:reports:get", "db:reports:list"),
    ("db:reports:listByCase", "db:cases:list"),
    ("db:summons:list", "db:cases:list"),
    ("db:issues:list", "db:residents:list"),
    ("db:businesses:owners", "db:businesses:list"),
];

fn first_id(v: &Value) -> Option<i64> {
    let rows = v.get("data").or_else(|| v.get("rows")).or_else(|| v.get("residents")).unwrap_or(v);
    rows.as_array()?.first()?.get("id")?.as_i64()
}

fn looks_like_sql_error(msg: &str) -> bool {
    ["no such column", "no such table", "syntax error", "SQL", "Invalid column", "constraint"]
        .iter()
        .any(|k| msg.contains(k))
}

#[tokio::test]
#[ignore]
async fn read_channels_work_on_real_db() {
    assert!(std::env::var_os("BMS_USER_DATA").is_some(), "set BMS_USER_DATA to a COPY of the data folder");
    db::init_database().expect("init/migrate");
    {
        let conn = db::conn();
        let admin = db::queries::users::get_user_by_username(&conn, "admin").unwrap().expect("admin user");
        db::queries::users::update_password(&conn, admin.id, &app_lib::utils::hash::hash_password("smoke-test-pw")).unwrap();
    }
    let login = dispatch("auth:login", Args(vec![json!("admin"), json!("smoke-test-pw")])).await.unwrap();
    assert_eq!(login["success"], json!(true), "login: {login}");

    let mut failures = Vec::new();
    let mut lists = std::collections::HashMap::new();
    for ch in READ_CHANNELS {
        match dispatch(ch, Args(vec![])).await {
            Ok(v) => {
                let size = v.as_array().map(|a| a.len()).or_else(|| v.as_object().map(|o| o.len())).unwrap_or(0);
                println!("ok   {ch:32} {size}");
                if v.get("success") == Some(&json!(false)) {
                    println!("     ↳ {}", v["error"]);
                }
                lists.insert(*ch, v);
            }
            Err(e) => {
                println!("FAIL {ch:32} {e}");
                failures.push(format!("{ch}: {e}"));
            }
        }
    }
    for (ch, src) in BY_ID {
        let Some(id) = lists.get(src).and_then(first_id) else {
            println!("skip {ch:32} (no rows in {src})");
            continue;
        };
        match dispatch(ch, Args(vec![json!(id)])).await {
            Ok(v) => println!("ok   {ch:32} id={id} {}", if v.is_null() { "null" } else { "row" }),
            Err(e) => {
                println!("FAIL {ch:32} {e}");
                failures.push(format!("{ch}: {e}"));
            }
        }
    }
    // Search + paging params the residents page sends.
    let res = dispatch(
        "db:residents:list",
        Args(vec![json!({"search": "a", "page": 2, "limit": 25, "sortBy": "last_name", "sortOrder": "desc", "is_senior": true})]),
    )
    .await;
    match res {
        Ok(v) => println!("ok   residents:list filtered → {}", v.get("total").cloned().unwrap_or_default()),
        Err(e) => failures.push(format!("residents:list filtered: {e}")),
    }

    let sql_failures: Vec<_> = failures.iter().filter(|f| looks_like_sql_error(f)).collect();
    println!("\n{} failures ({} SQL-looking)", failures.len(), sql_failures.len());
    assert!(failures.is_empty(), "{failures:#?}");
}
