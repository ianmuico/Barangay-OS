//! Filesystem locations. `user_data()` deliberately matches Electron's
//! `app.getPath('userData')` so an upgraded install keeps its existing
//! database, photos, logs and backups.

use std::path::PathBuf;
use std::sync::OnceLock;

/// Folder names Electron may have used for userData, newest first.
const LEGACY_DIR_NAMES: [&str; 2] = ["barangay-management", "Barangay Management System"];

static USER_DATA: OnceLock<PathBuf> = OnceLock::new();
static RESOURCES: OnceLock<PathBuf> = OnceLock::new();

/// `%APPDATA%\barangay-management` on Windows,
/// `~/Library/Application Support/barangay-management` on macOS,
/// `~/.config/barangay-management` on Linux.
pub fn user_data() -> PathBuf {
    USER_DATA
        .get_or_init(|| {
            // Test/dev override so a run never touches the real office data.
            if let Some(dir) = std::env::var_os("BMS_USER_DATA").filter(|d| !d.is_empty()) {
                let dir = PathBuf::from(dir);
                let _ = std::fs::create_dir_all(&dir);
                return dir;
            }
            let base = dirs::config_dir().unwrap_or_else(std::env::temp_dir);
            // Prefer whichever folder already holds a database.
            for name in LEGACY_DIR_NAMES {
                let dir = base.join(name);
                if dir.join("barangay.db").exists() {
                    return dir;
                }
            }
            let dir = base.join(LEGACY_DIR_NAMES[0]);
            let _ = std::fs::create_dir_all(&dir);
            dir
        })
        .clone()
}

/// Bundled `resources/` folder (Electron's `process.resourcesPath`).
pub fn resources() -> PathBuf {
    RESOURCES.get().cloned().unwrap_or_else(|| PathBuf::from("resources"))
}

pub fn set_resources(dir: PathBuf) {
    let _ = RESOURCES.set(dir);
}

pub fn logs_dir() -> PathBuf {
    user_data().join("logs")
}
