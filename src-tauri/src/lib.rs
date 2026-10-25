//! Barangay Management System — Tauri backend.
//!
//! Port of the Electron main process: SQLite database (`db`), IPC handlers
//! (`ipc`, same channel names the renderer already uses), the LAN/mobile HTTP
//! API (`server`), and helpers (`utils`).

pub mod db;
pub mod ipc;
pub mod server;
pub mod utils;

use tauri::Manager;
use utils::logger::{log_error, log_info};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            utils::events::set_app_handle(app.handle().clone());
            if let Ok(dir) = app.path().resource_dir() {
                utils::paths::set_resources(dir.join("resources"));
            }

            utils::logger::init_logger();

            // Initialize database — if migration fails, show a clear error and quit safely
            if let Err(err) = db::init_database() {
                log_error("Database init failed", &err);
                let backups = utils::paths::user_data().join("upgrade-backups");
                utils::dialogs::error_box(
                    "Database Upgrade Failed",
                    &format!(
                        "The app could not upgrade your database to the new version.\n\n\
                         Your data has NOT been lost — a backup was automatically saved to:\n  {}\n\n\
                         Please contact your system administrator.\n\nDetails:\n{err}",
                        backups.display()
                    ),
                );
                app.handle().exit(1);
                return Ok(());
            }

            // Track app open — analytics should never crash the app
            {
                let conn = db::conn();
                let _ = db::queries::analytics::track_event(&conn, "app_open", None);
            }

            if !cfg!(debug_assertions) {
                ipc::updater::init_auto_updater();
            }
            log_info("Window ready");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ipc::ipc])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                // Don't leave a cloudflared child running after the app closes
                utils::tunnel::stop_tunnel();
                ipc::server::stop_server();
                db::close_database();
            }
        });
}
