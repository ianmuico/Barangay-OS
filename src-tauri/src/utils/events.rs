//! Push events to the renderer (Electron's `webContents.send`).

use serde::Serialize;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(app: AppHandle) {
    let _ = APP.set(app);
}

/// The running app. Panics before `setup` — never call at static-init time.
pub fn app_handle() -> &'static AppHandle {
    APP.get().expect("App handle not initialized")
}

/// `mainWindow.webContents.send(event, payload)`.
pub fn emit<S: Serialize + Clone>(event: &str, payload: S) {
    if let Some(app) = APP.get() {
        if let Err(e) = app.emit(event, payload) {
            log::warn!("emit {event} failed: {e}");
        }
    }
}
