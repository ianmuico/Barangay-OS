//! Plain-text app log at `<userData>/logs/app.log`, rotated to 7 days.

use std::fmt::Display;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

const MAX_LOG_AGE_DAYS: i64 = 7;

pub fn log_file_path() -> PathBuf {
    super::paths::logs_dir().join("app.log")
}

fn timestamp() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn write_log(level: &str, message: &str) {
    let line = format!("[{}] [{}] {}\n", timestamp(), level, message);
    if level == "ERROR" {
        eprint!("{line}");
    } else {
        print!("{line}");
    }
    let _ = fs::create_dir_all(super::paths::logs_dir());
    match OpenOptions::new().create(true).append(true).open(log_file_path()) {
        Ok(mut f) => {
            let _ = f.write_all(line.as_bytes());
        }
        Err(e) => eprintln!("[logger] Failed to write log: {e}"),
    }
}

pub fn log_info(message: &str) {
    write_log("INFO", message);
}

pub fn log_warn(message: &str) {
    write_log("WARN", message);
}

/// `logError(message, error)`.
pub fn log_error(message: &str, error: &dyn Display) {
    let err = error.to_string();
    if err.is_empty() {
        write_log("ERROR", message);
    } else {
        write_log("ERROR", &format!("{message}: {err}"));
    }
}

/// Drop entries older than MAX_LOG_AGE_DAYS.
pub fn rotate_logs() {
    let path = log_file_path();
    let Ok(content) = fs::read_to_string(&path) else { return };
    let cutoff = chrono::Utc::now().naive_utc() - chrono::Duration::days(MAX_LOG_AGE_DAYS);
    let kept: Vec<&str> = content
        .split('\n')
        .filter(|line| {
            // Lines look like "[2026-01-02T03:04:05.678Z] ..."
            let Some(ts) = line.get(1..20) else { return true };
            match chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S") {
                Ok(t) => t >= cutoff,
                Err(_) => true,
            }
        })
        .collect();
    let _ = fs::write(&path, kept.join("\n"));
}

/// Approximate disk-space probe: can we write to userData?
pub fn check_disk_space() -> (bool, PathBuf) {
    let db_path = super::paths::user_data().join("barangay.db");
    let test = super::paths::user_data().join(".space_check");
    let ok = fs::write(&test, "test").and_then(|_| fs::remove_file(&test)).is_ok();
    (ok, db_path)
}

pub fn init_logger() {
    let _ = fs::create_dir_all(super::paths::logs_dir());
    rotate_logs();
    log_info("Application started");
}
