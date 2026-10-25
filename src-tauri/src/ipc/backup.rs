//! Database backup / restore — port of `main/ipc/backup.ts`.

use super::{auth, fail, Args, HResult};
use crate::db;
use crate::db::queries::audit::log_audit;
use crate::utils::dialogs::{self, DialogOptions};
use anyhow::Result;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

pub async fn handle(channel: &str, _a: &Args) -> Option<HResult> {
    Some(match channel {
        "backup:create" => create(),
        "backup:restore" => restore(),
        _ => return None,
    })
}

fn create() -> HResult {
    match create_inner() {
        Ok(v) => Ok(v),
        Err(e) => Ok(fail(e)),
    }
}

fn create_inner() -> Result<Value> {
    let db_path = db::database_path();

    // Checkpoint WAL to ensure all data is in the main file
    {
        let conn = db::conn();
        db::all(&conn, "PRAGMA wal_checkpoint(TRUNCATE)", ())?;
    } // drop the guard before the (possibly long) dialog

    // `new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)`
    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S").to_string();
    let default_name = format!("barangay-backup-{timestamp}.db");

    let picked = dialogs::save_file(&DialogOptions::new(
        "Backup Database",
        &default_name,
        &[("SQLite Database", &["db"])],
    ));

    let Some(file_path) = picked else {
        return Ok(fail("Backup cancelled"));
    };

    std::fs::copy(&db_path, &file_path)?;
    let file_path_str = file_path.to_string_lossy().into_owned();

    let user_id = auth::current_user_id();
    {
        let conn = db::conn();
        log_audit(&conn, user_id, "BACKUP_CREATED", Some(&format!("Database backed up to: {file_path_str}")))?;
    }

    Ok(json!({ "success": true, "path": file_path_str }))
}

fn restore() -> HResult {
    match restore_inner() {
        Ok(v) => Ok(v),
        Err(e) => {
            // Try to reinitialize if something went wrong
            let _ = db::init_database();
            Ok(fail(e))
        }
    }
}

fn restore_inner() -> Result<Value> {
    let mut opts = DialogOptions::new("Restore Database", "", &[("SQLite Database", &["db"])]);
    opts.properties = vec!["openFile".to_string()];
    let picked = dialogs::open_files(&opts);

    let Some(source_path) = picked.into_iter().next() else {
        return Ok(fail("Restore cancelled"));
    };
    let db_path = db::database_path();

    // Validate the backup file by trying to open it
    let table_names: Vec<String> = {
        let test_db = Connection::open_with_flags(&source_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let names = {
            let mut stmt = test_db.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<String>>>()?
        };
        let _ = test_db.close();
        names
    };

    let required_tables = ["users", "residents", "settings"];
    let missing: Vec<&str> =
        required_tables.iter().copied().filter(|t| !table_names.iter().any(|n| n == t)).collect();

    if !missing.is_empty() {
        return Ok(fail(format!("Invalid backup file. Missing tables: {}", missing.join(", "))));
    }

    // Close current DB, replace, and reopen. No db::conn() guard is held here
    // (close/init lock the same mutex).
    db::close_database();
    std::fs::copy(&source_path, &db_path)?;
    db::init_database()?;

    let source_str = source_path.to_string_lossy().into_owned();
    let user_id = auth::current_user_id();
    {
        let conn = db::conn();
        log_audit(&conn, user_id, "BACKUP_RESTORED", Some(&format!("Database restored from: {source_str}")))?;
    }

    Ok(json!({ "success": true }))
}
