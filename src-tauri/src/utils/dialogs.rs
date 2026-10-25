//! Native file/message dialogs (Electron's `dialog.*`).
//!
//! Blocking calls — only use them from IPC handlers (they run on Tauri's async
//! worker threads, never the main thread).

use super::events::app_handle;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

/// Electron's dialog options object.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    #[serde(default)]
    pub filters: Vec<FileFilter>,
    #[serde(default)]
    pub properties: Vec<String>,
}

impl DialogOptions {
    pub fn new(title: &str, default_path: &str, filters: &[(&str, &[&str])]) -> Self {
        DialogOptions {
            title: Some(title.to_string()),
            default_path: if default_path.is_empty() { None } else { Some(default_path.to_string()) },
            filters: filters
                .iter()
                .map(|(n, exts)| FileFilter {
                    name: n.to_string(),
                    extensions: exts.iter().map(|e| e.to_string()).collect(),
                })
                .collect(),
            properties: vec![],
        }
    }
}

fn builder(opts: &DialogOptions) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let mut b = app_handle().dialog().file();
    if let Some(t) = &opts.title {
        b = b.set_title(t);
    }
    for f in &opts.filters {
        let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
        b = b.add_filter(&f.name, &exts);
    }
    if let Some(dp) = &opts.default_path {
        let p = PathBuf::from(dp);
        if p.is_dir() {
            b = b.set_directory(p);
        } else {
            if let Some(parent) = p.parent().filter(|d| !d.as_os_str().is_empty() && d.is_dir()) {
                b = b.set_directory(parent);
            } else if let Some(docs) = dirs::document_dir() {
                b = b.set_directory(docs);
            }
            if let Some(name) = p.file_name() {
                b = b.set_file_name(name.to_string_lossy());
            }
        }
    }
    b
}

/// `dialog.showSaveDialog` → chosen path, or `None` when cancelled.
pub fn save_file(opts: &DialogOptions) -> Option<PathBuf> {
    builder(opts).blocking_save_file().and_then(|p| p.into_path().ok())
}

/// `dialog.showOpenDialog` → chosen paths (empty when cancelled).
/// Honors `properties`: `openDirectory`, `multiSelections`.
pub fn open_files(opts: &DialogOptions) -> Vec<PathBuf> {
    let b = builder(opts);
    let has = |p: &str| opts.properties.iter().any(|x| x == p);
    let picked = if has("openDirectory") {
        if has("multiSelections") {
            b.blocking_pick_folders().unwrap_or_default()
        } else {
            b.blocking_pick_folder().into_iter().collect()
        }
    } else if has("multiSelections") {
        b.blocking_pick_files().unwrap_or_default()
    } else {
        b.blocking_pick_file().into_iter().collect()
    };
    picked.into_iter().filter_map(|p| p.into_path().ok()).collect()
}

/// Electron-shaped `{ canceled, filePath }` for the `dialog:saveFile` channel.
pub fn save_dialog_json(opts: &DialogOptions) -> Value {
    match save_file(opts) {
        Some(p) => json!({ "canceled": false, "filePath": p.to_string_lossy() }),
        None => json!({ "canceled": true, "filePath": null }),
    }
}

/// Electron-shaped `{ canceled, filePaths }` for the `dialog:openFile` channel.
pub fn open_dialog_json(opts: &DialogOptions) -> Value {
    let paths = open_files(opts);
    let list: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    json!({ "canceled": list.is_empty(), "filePaths": list })
}

/// Info box with a single OK button.
pub fn message(title: &str, msg: &str) {
    app_handle()
        .dialog()
        .message(msg)
        .title(title)
        .kind(MessageDialogKind::Info)
        .blocking_show();
}

/// Error box (Electron's `dialog.showErrorBox`).
pub fn error_box(title: &str, msg: &str) {
    app_handle()
        .dialog()
        .message(msg)
        .title(title)
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

/// Two-button confirm; `true` when the user picks `ok_label`.
pub fn confirm(title: &str, msg: &str, ok_label: &str, cancel_label: &str) -> bool {
    app_handle()
        .dialog()
        .message(msg)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(ok_label.to_string(), cancel_label.to_string()))
        .blocking_show()
}
