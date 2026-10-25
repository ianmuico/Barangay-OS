//! Port of `main/utils/updater.ts` — electron-updater → tauri-plugin-updater.

use super::{Args, HResult};
use crate::utils::events::{app_handle, emit};
use crate::utils::logger::{log_error, log_info};
use crate::utils::{dialogs, paths};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, Updater, UpdaterExt};

// macOS builds aren't Apple-code-signed (that needs a paid Developer ID). Unlike
// electron-updater, Tauri CAN self-update an unsigned macOS app (it swaps the
// .app from the signed .app.tar.gz updater bundle), so Mac now gets the same
// in-app update as Windows. If that fails on a Mac (e.g. the app sits somewhere
// the user can't write to), we fall back to the old behavior: tell the user and
// open the download page — they install the new .dmg over the old app. Their data
// is in Application Support (outside the .app), so it is preserved.
const IS_MAC: bool = cfg!(target_os = "macos");
const RELEASES_URL: &str = "https://github.com/mmmsss211/barangay-management/releases/latest";
const GH_OWNER: &str = "mmmsss211";
const GH_REPO: &str = "barangay-management";

// ─────────────────────────────────────────────────────────────────────────────
// Auto-updater — resilient on slow / unstable internet.
//
// Integrity (built in to tauri-plugin-updater): every release publishes a
// minisign signature of each updater bundle inside latest.json, made with the
// project's private signing key. After downloading, the updater verifies the
// bytes against that signature and the public key baked into the app
// (tauri.conf.json → plugins.updater.pubkey). A partial, corrupted or tampered
// download FAILS the check and is NEVER installed — the currently-installed app
// keeps running untouched. So "make sure all files for the update are there" is
// guaranteed: an incomplete download simply doesn't apply.
//
// Resilience (added here): barangay offices are online only now and then, so the
// app re-checks every 30 minutes and again the moment the connection comes back
// (the renderer reports `online` events). A found update downloads silently in
// the background; a failed download retries with backoff and otherwise waits for
// the next check — no error popups. The only prompt is "Restart now / Later"
// once a complete, verified update is ready; "Later" installs it on quit.
// Nothing is half-installed.
// ─────────────────────────────────────────────────────────────────────────────

static INITIALIZED: AtomicBool = AtomicBool::new(false);

static IS_DOWNLOADING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_RETRIES: AtomicU32 = AtomicU32::new(0);
const MAX_DOWNLOAD_RETRIES: u32 = 5;

static CHECK_RETRIES: AtomicU32 = AtomicU32::new(0);
const MAX_CHECK_RETRIES: u32 = 3;

/// How often a running app looks for a new release.
const CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// A check is in flight (periodic, reconnect and manual checks can overlap).
static CHECKING: AtomicBool = AtomicBool::new(false);

static TOKEN: OnceLock<Option<String>> = OnceLock::new();

/// A verified update the user postponed ("Later") — installed when the app
/// quits (electron-updater's `autoInstallOnAppQuit = true`).
static PENDING: Mutex<Option<(Update, Vec<u8>)>> = Mutex::new(None);

// The releases repo is private, so installed apps need a GitHub token to
// check/download updates. The token is read from `update-token.txt` placed
// either next to the installed app's resources or in the app data folder.
// See RELEASING.md for how to generate and deploy it.
fn load_update_token() -> Option<String> {
    let candidates = [paths::resources().join("update-token.txt"), paths::user_data().join("update-token.txt")];
    for file in candidates {
        // try next location on any error
        if let Ok(token) = std::fs::read_to_string(&file) {
            let token = token.trim();
            if !token.is_empty() {
                return Some(token.to_string());
            }
        }
    }
    std::env::var("GH_TOKEN").ok().filter(|t| !t.is_empty())
}

fn token() -> Option<&'static str> {
    TOKEN.get_or_init(load_update_token).as_deref()
}

/// For a private repo, `github.com/.../releases/download/...` URLs don't accept a
/// token, so electron-updater's `private: true` provider went through the GitHub
/// API instead. We do the same: look up the latest release via the API and map
/// each asset name to its API URL (which serves the raw file when requested
/// with `Accept: application/octet-stream`).
async fn private_release_assets(token: &str) -> Result<HashMap<String, url::Url>> {
    let res = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(60))
        .build()?
        .get(format!("https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/releases/latest"))
        .header("Authorization", format!("token {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "barangay-management-updater")
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(anyhow!("GitHub releases API returned {} (no published release, or the update token is invalid)", res.status()));
    }
    let release: Value = res.json().await?;
    let mut map = HashMap::new();
    for asset in release["assets"].as_array().into_iter().flatten() {
        if let (Some(name), Some(api)) = (asset["name"].as_str(), asset["url"].as_str()) {
            if let Ok(u) = url::Url::parse(api) {
                map.insert(name.to_string(), u);
            }
        }
    }
    Ok(map)
}

fn configure(b: tauri_plugin_updater::UpdaterBuilder) -> tauri_plugin_updater::UpdaterBuilder {
    // Connect/read timeouts (not a total timeout — a slow but alive download of a
    // large installer must be allowed to finish).
    b.configure_client(|c| c.connect_timeout(Duration::from_secs(20)).read_timeout(Duration::from_secs(60)))
}

/// Updater for the feed: the private GitHub feed when a token is available,
/// otherwise the public endpoint from tauri.conf.json.
async fn build_updater() -> Result<(Updater, HashMap<String, url::Url>)> {
    let app = app_handle();
    match token() {
        Some(t) => {
            let assets = private_release_assets(t).await?;
            let manifest = assets
                .get("latest.json")
                .cloned()
                .ok_or_else(|| anyhow!("The latest release has no latest.json updater manifest"))?;
            let updater = configure(app.updater_builder())
                .endpoints(vec![manifest])?
                .header("Authorization", format!("token {t}"))?
                .header("Accept", "application/octet-stream")?
                .build()?;
            Ok((updater, assets))
        }
        None => Ok((configure(app.updater_builder()).build()?, HashMap::new())),
    }
}

/// Check the feed. `Some(update)` when a newer version is published.
async fn check_for_updates() -> Result<Option<Update>> {
    log_info("Checking for updates...");
    let (updater, assets) = build_updater().await?;
    let Some(mut update) = updater.check().await? else {
        return Ok(None);
    };
    // latest.json points at browser download URLs; swap in the API asset URL of
    // the same file so the private download works with the token.
    if !assets.is_empty() {
        let name = update
            .download_url
            .path_segments()
            .and_then(|mut s| s.next_back())
            .map(|s| percent_encoding::percent_decode_str(s).decode_utf8_lossy().into_owned());
        if let Some(api) = name.and_then(|n| assets.get(&n)) {
            update.download_url = api.clone();
        }
    }
    Ok(Some(update))
}

/// Run a blocking native dialog off the async worker threads.
async fn ask(title: &'static str, msg: String, ok: &'static str, cancel: &'static str) -> bool {
    tauri::async_runtime::spawn_blocking(move || dialogs::confirm(title, &msg, ok, cancel))
        .await
        .unwrap_or(false)
}

fn open_releases_page() {
    if let Err(e) = app_handle().opener().open_url(RELEASES_URL, None::<&str>) {
        log_error("Could not open the releases page", &e);
    }
}

/// macOS fallback when the in-place update can't be applied: notify + open the
/// download page (the old electron-updater behavior on Mac).
async fn mac_manual_download(version: &str) {
    if ask(
        "Update Available",
        format!(
            "A new version ({version}) is available.\n\nClick Download to get the new version, then drag it into Applications, replacing the old one. Your barangay data stays exactly as it is — the update only replaces the software."
        ),
        "Download",
        "Later",
    )
    .await
    {
        open_releases_page();
    }
}

async fn on_update_available(update: Update) {
    log_info(&format!("Update available: {}", update.version));
    CHECK_RETRIES.store(0, Ordering::SeqCst);

    // Already fetching it, or already downloaded and waiting for a restart.
    if IS_DOWNLOADING.load(Ordering::SeqCst) || pending_version().is_some_and(|v| v == update.version) {
        return;
    }

    // Download silently in the background; the user is only asked once the
    // verified update is ready to install.
    DOWNLOAD_RETRIES.store(0, Ordering::SeqCst);
    start_download(update);
}

/// Version of a downloaded update waiting for restart/quit.
fn pending_version() -> Option<String> {
    PENDING.lock().ok().and_then(|p| p.as_ref().map(|(u, _)| u.version.clone()))
}

fn start_download(update: Update) {
    IS_DOWNLOADING.store(true, Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        let mut received: u64 = 0;
        let mut last_pct: i64 = -1;
        let result = update
            .download(
                |chunk, total| {
                    received += chunk as u64;
                    if let Some(total) = total.filter(|t| *t > 0) {
                        let pct = ((received as f64 / total as f64) * 100.0).round() as i64;
                        if pct != last_pct {
                            last_pct = pct;
                            emit("updater:progress", pct);
                        }
                    }
                },
                || {},
            )
            .await;
        match result {
            Ok(bytes) => on_update_downloaded(update, bytes).await,
            Err(e) => on_download_error(update, anyhow!(e)).await,
        }
    });
}

async fn on_update_downloaded(update: Update, bytes: Vec<u8>) {
    IS_DOWNLOADING.store(false, Ordering::SeqCst);
    DOWNLOAD_RETRIES.store(0, Ordering::SeqCst);
    log_info("Update downloaded and verified. Will install on quit.");
    emit("updater:progress", 100);

    if let Ok(mut p) = PENDING.lock() {
        *p = Some((update.clone(), bytes));
    }

    if ask(
        "Update Ready",
        "Update downloaded. The app will restart to apply the update.\n\nYour data is safe — updates never touch the barangay database.".to_string(),
        "Restart Now",
        "Later",
    )
    .await
    {
        let Some((update, bytes)) = PENDING.lock().ok().and_then(|mut p| p.take()) else { return };
        install_and_restart(update, bytes).await;
    }
}

/// `autoUpdater.quitAndInstall()`. On Windows the plugin launches the installer
/// (passive mode) and exits; the installer relaunches the app. On macOS/Linux the
/// bundle is replaced in place and we relaunch ourselves.
async fn install_and_restart(update: Update, bytes: Vec<u8>) {
    let version = update.version.clone();
    let res = tauri::async_runtime::spawn_blocking(move || update.install(&bytes)).await;
    match res {
        Ok(Ok(())) => {
            log_info("Update installed. Restarting...");
            app_handle().restart();
        }
        Ok(Err(e)) => {
            log_error("Auto-updater error", &e);
            if IS_MAC {
                mac_manual_download(&version).await;
            } else {
                emit("updater:error", json!({ "message": e.to_string() }));
            }
        }
        Err(e) => log_error("Auto-updater error", &e),
    }
}

async fn on_download_error(update: Update, err: anyhow::Error) {
    log_error("Auto-updater error", &err);

    // Only the download phase gets the retry/redo treatment. A failed download
    // (bad internet, failed signature check) is recoverable — re-fetch until complete.
    IS_DOWNLOADING.store(false, Ordering::SeqCst);

    let attempt = DOWNLOAD_RETRIES.load(Ordering::SeqCst);
    if attempt < MAX_DOWNLOAD_RETRIES {
        let attempt = attempt + 1;
        DOWNLOAD_RETRIES.store(attempt, Ordering::SeqCst);
        let delay = (5_000 * attempt as u64).min(30_000);
        log_info(&format!(
            "Update download failed; auto-retrying ({attempt}/{MAX_DOWNLOAD_RETRIES}) in {}s.",
            delay / 1000
        ));
        emit("updater:retrying", json!({ "attempt": attempt, "max": MAX_DOWNLOAD_RETRIES }));
        // Mark busy during the wait so a manual check doesn't start a second download.
        IS_DOWNLOADING.store(true, Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(delay)).await;
        start_download(update);
        return;
    }

    // Gave up for now. The app keeps running on the current version, and the
    // next periodic / reconnect check starts a fresh download — no popup.
    let message = err.to_string();
    log_info(&format!("Update download paused after {MAX_DOWNLOAD_RETRIES} tries; will retry on the next check."));
    emit("updater:error", json!({ "message": if message.is_empty() { "download failed".to_string() } else { message } }));
    DOWNLOAD_RETRIES.store(0, Ordering::SeqCst);
}

// Retry the initial check a few times — a laggy connection at startup shouldn't
// permanently skip updates for the session.
async fn check_for_updates_with_retry() {
    loop {
        match check_for_updates().await {
            Ok(Some(update)) => return on_update_available(update).await,
            Ok(None) => {
                log_info("App is up to date.");
                return;
            }
            Err(err) => {
                log_error("Auto-updater error", &err);
                let n = CHECK_RETRIES.load(Ordering::SeqCst);
                if n < MAX_CHECK_RETRIES {
                    let n = n + 1;
                    CHECK_RETRIES.store(n, Ordering::SeqCst);
                    let delay = (15_000 * n as u64).min(60_000);
                    log_info(&format!(
                        "Update check failed (attempt {n}/{MAX_CHECK_RETRIES}); retrying in {}s: {err}",
                        delay / 1000
                    ));
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                } else {
                    log_info(&format!("Update check skipped after {MAX_CHECK_RETRIES} attempts: {err}"));
                    return;
                }
            }
        }
    }
}

/// One check that never prompts on failure. Used by the 30-minute timer and the
/// reconnect trigger. Skips while another check runs or an update is already
/// downloading / waiting for restart.
async fn check_quietly() {
    if IS_DOWNLOADING.load(Ordering::SeqCst) || pending_version().is_some() {
        return;
    }
    if CHECKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let res = check_for_updates().await;
    CHECKING.store(false, Ordering::SeqCst);
    match res {
        Ok(Some(update)) => on_update_available(update).await,
        Ok(None) => log_info("App is up to date."),
        Err(err) => log_info(&format!("Update check skipped (offline?): {err}")),
    }
}

/// Install a postponed, verified update when the main window closes (= app quit).
fn install_pending_on_quit() {
    let Some((update, bytes)) = PENDING.lock().ok().and_then(|mut p| p.take()) else { return };
    log_info("Installing downloaded update on quit.");
    // Quitting, not restarting: don't relaunch after the Windows installer finishes.
    let update = update.restart_after_install(false);
    if let Err(e) = update.install(&bytes) {
        log_error("Auto-updater error", &e);
    }
}

/// Start background update checks (production only).
pub fn init_auto_updater() {
    INITIALIZED.store(true, Ordering::SeqCst);

    if token().is_some() {
        log_info("Updater: using private GitHub releases feed.");
    } else {
        log_info("Updater: no update token found — update checks will fail for a private repo. See RELEASING.md.");
    }

    // Still install on quit if a verified update was downloaded but the user chose "Later".
    if let Some(w) = app_handle().get_webview_window("main") {
        w.on_window_event(|e| {
            if let tauri::WindowEvent::Destroyed = e {
                install_pending_on_quit();
            }
        });
    }

    // Check for updates shortly after launch (don't block startup), with retries,
    // then keep checking every 30 minutes for offices that come online later.
    tauri::async_runtime::spawn(async {
        tokio::time::sleep(Duration::from_secs(10)).await;
        check_for_updates_with_retry().await;
        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;
            check_quietly().await;
        }
    });
}

// IPC `updater:check`. `{ quiet: true }` comes from the renderer when the
// network reconnects; otherwise it's the Settings "Check for updates" button and
// reports a status the UI can show.
async fn check(a: &Args) -> HResult {
    let current = app_handle().package_info().version.to_string();
    if !INITIALIZED.load(Ordering::SeqCst) {
        return Ok(json!({ "success": false, "current": current, "error": "Updates only work in the installed app (not in development builds)." }));
    }
    if super::truthy(a.obj(0).get("quiet").unwrap_or(&Value::Null)) {
        tauri::async_runtime::spawn(check_quietly());
        return Ok(json!({ "success": true, "current": current, "status": "checking" }));
    }

    if let Some(v) = pending_version() {
        // Already downloaded — offer the restart again.
        tauri::async_runtime::spawn(async {
            if ask(
                "Update Ready",
                "The update is downloaded. Restart now to apply it?\n\nYour data is safe — updates never touch the barangay database.".to_string(),
                "Restart Now",
                "Later",
            )
            .await
            {
                if let Some((update, bytes)) = PENDING.lock().ok().and_then(|mut p| p.take()) {
                    install_and_restart(update, bytes).await;
                }
            }
        });
        return Ok(json!({ "success": true, "current": current, "latest": v, "status": "ready" }));
    }
    if IS_DOWNLOADING.load(Ordering::SeqCst) {
        return Ok(json!({ "success": true, "current": current, "status": "downloading" }));
    }

    CHECK_RETRIES.store(0, Ordering::SeqCst);
    match check_for_updates().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            tauri::async_runtime::spawn(on_update_available(update));
            Ok(json!({ "success": true, "current": current, "latest": version, "status": "downloading" }))
        }
        Ok(None) => {
            log_info("App is up to date.");
            Ok(json!({ "success": true, "current": current, "latest": current, "status": "up-to-date" }))
        }
        Err(err) => {
            log_error("Auto-updater error", &err);
            Ok(json!({ "success": false, "current": current, "error": "Couldn't reach the update server. Check the internet connection and try again." }))
        }
    }
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "updater:check" => check(a).await,
        _ => return None,
    })
}
