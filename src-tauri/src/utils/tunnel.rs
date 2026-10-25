// Internet access via a Cloudflare "quick tunnel" (TryCloudflare).
// Free, no account, no port forwarding: we run the cloudflared helper which
// opens an outbound connection to Cloudflare and hands back a public
// https://<random>.trycloudflare.com URL that forwards to the local API.
// The URL changes every time the tunnel starts — the UI makes that clear.
//
// The cloudflared binary (~40 MB) is downloaded once into userData on first
// use, so it doesn't bloat the installer and survives app updates.

use anyhow::{anyhow, bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard};
use std::time::Duration;

/// `{ status: 'stopped' | 'downloading' | 'starting' | 'running' | 'error', url, error }`
#[derive(Clone)]
struct TunnelState {
    status: &'static str,
    url: Option<String>,
    error: Option<String>,
}

struct Running {
    gen: u64,
    child: Child,
}

static STATE: Mutex<TunnelState> = Mutex::new(TunnelState { status: "stopped", url: None, error: None });
static CHILD: Mutex<Option<Running>> = Mutex::new(None);
static GEN: AtomicU64 = AtomicU64::new(0);

static URL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://[a-z0-9-]+\.trycloudflare\.com").expect("valid tunnel URL regex"));

enum Event {
    Url(String),
    Exited,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

fn set_state(status: &'static str, url: Option<String>, error: Option<String>) {
    *lock(&STATE) = TunnelState { status, url, error };
}

fn state_value(s: &TunnelState) -> Value {
    json!({ "status": s.status, "url": s.url, "error": s.error })
}

pub fn get_tunnel_state() -> Value {
    state_value(&lock(&STATE))
}

fn bin_dir() -> PathBuf {
    super::paths::user_data().join("bin")
}

fn managed_bin_path() -> PathBuf {
    bin_dir().join(if cfg!(windows) { "cloudflared.exe" } else { "cloudflared" })
}

#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}

#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

// cloudflared already on PATH (e.g. brew install on dev machines)?
fn path_bin() -> Option<String> {
    let mut cmd = Command::new(if cfg!(windows) { "where" } else { "which" });
    cmd.arg("cloudflared").stdin(Stdio::null()).stderr(Stdio::null());
    hide_window(&mut cmd);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let found = stdout.split('\n').map(|l| l.trim_end_matches('\r')).find(|l| !l.is_empty())?;
    Some(found.trim().to_string())
}

fn download_url() -> (String, bool) {
    let base = "https://github.com/cloudflare/cloudflared/releases/latest/download";
    let arch = if std::env::consts::ARCH == "aarch64" { "arm64" } else { "amd64" };
    match std::env::consts::OS {
        "windows" => (format!("{base}/cloudflared-windows-amd64.exe"), false),
        "macos" => (format!("{base}/cloudflared-darwin-{arch}.tgz"), true),
        _ => (format!("{base}/cloudflared-linux-{arch}"), false),
    }
}

async fn ensure_binary() -> Result<PathBuf> {
    let managed = managed_bin_path();
    if managed.exists() {
        return Ok(managed);
    }
    if let Some(on_path) = path_bin() {
        return Ok(PathBuf::from(on_path));
    }

    set_state("downloading", None, None);
    let (url, tgz) = download_url();
    let res = reqwest::get(&url).await?;
    if !res.status().is_success() {
        bail!("Download failed (HTTP {}). Check the internet connection.", res.status().as_u16());
    }
    let buf = res.bytes().await?;
    let dir = bin_dir();

    tokio::task::spawn_blocking(move || -> Result<PathBuf> {
        std::fs::create_dir_all(&dir)?;
        if tgz {
            // macOS releases ship as .tgz — extract in-process (flate2 + tar)
            let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(&buf[..]));
            archive.unpack(&dir).map_err(|_| anyhow!("Could not extract cloudflared."))?;
        } else {
            std::fs::write(&managed, &buf)?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&managed, std::fs::Permissions::from_mode(0o755))?;
        }
        Ok(managed)
    })
    .await?
}

/// Read a cloudflared output pipe line by line, reporting the first
/// trycloudflare URL it prints. Keeps draining until EOF so the child never
/// blocks on a full pipe.
fn spawn_reader<R: Read + Send + 'static>(pipe: R, tx: tokio::sync::mpsc::UnboundedSender<Event>) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut line = Vec::new();
        loop {
            line.clear();
            match reader.read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&line);
                    if let Some(m) = URL_RE.find(&text) {
                        let _ = tx.send(Event::Url(m.as_str().to_string()));
                    }
                }
            }
        }
    });
}

/// Watch for the child exiting on its own (the TS `proc.on('exit')` handler).
fn spawn_monitor(gen: u64, tx: tokio::sync::mpsc::UnboundedSender<Event>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(200));
        let mut guard = lock(&CHILD);
        match guard.as_mut() {
            Some(r) if r.gen == gen => match r.child.try_wait() {
                Ok(None) => continue,
                _ => {
                    *guard = None;
                    drop(guard);
                    let mut s = lock(&STATE);
                    if s.status == "running" || s.status == "starting" {
                        let error = if s.status == "starting" {
                            Some("cloudflared exited unexpectedly.".to_string())
                        } else {
                            None
                        };
                        *s = TunnelState { status: "stopped", url: None, error };
                    }
                    drop(s);
                    let _ = tx.send(Event::Exited);
                    break;
                }
            },
            // Stopped (and killed) by stop_tunnel, or replaced by a newer tunnel
            _ => {
                drop(guard);
                let _ = tx.send(Event::Exited);
                break;
            }
        }
    });
}

fn child_is(gen: u64) -> bool {
    lock(&CHILD).as_ref().is_some_and(|r| r.gen == gen)
}

pub async fn start_tunnel(port: u16) -> Result<Value> {
    if lock(&CHILD).is_some() {
        return Ok(get_tunnel_state());
    }
    let bin = match ensure_binary().await {
        Ok(b) => b,
        Err(e) => {
            let msg = e.to_string();
            let msg = if msg.is_empty() { "Failed to start the tunnel.".to_string() } else { msg };
            set_state("error", None, Some(msg));
            return Ok(get_tunnel_state());
        }
    };
    set_state("starting", None, None);

    let mut cmd = Command::new(&bin);
    cmd.args(["tunnel", "--url", &format!("http://127.0.0.1:{port}"), "--no-autoupdate"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_window(&mut cmd);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            set_state("error", None, Some(e.to_string()));
            return Ok(get_tunnel_state());
        }
    };

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Event>();
    if let Some(out) = child.stdout.take() {
        spawn_reader(out, tx.clone());
    }
    if let Some(err) = child.stderr.take() {
        spawn_reader(err, tx.clone()); // cloudflared logs the URL to stderr
    }

    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    {
        let mut guard = lock(&CHILD);
        if guard.is_some() {
            // Another start won the race — keep that one.
            drop(guard);
            let _ = child.kill();
            let _ = child.wait();
            return Ok(get_tunnel_state());
        }
        *guard = Some(Running { gen, child });
    }
    spawn_monitor(gen, tx);

    let deadline = tokio::time::Instant::now() + Duration::from_secs(45);
    loop {
        match tokio::time::timeout_at(deadline, rx.recv()).await {
            Ok(Some(Event::Url(url))) => {
                let mut s = lock(&STATE);
                if s.status == "starting" && child_is(gen) {
                    *s = TunnelState { status: "running", url: Some(url), error: None };
                    return Ok(state_value(&s));
                }
            }
            Ok(Some(Event::Exited)) | Ok(None) => return Ok(get_tunnel_state()),
            Err(_) => {
                let still_starting = lock(&STATE).status == "starting";
                if still_starting {
                    set_state("error", None, Some("Timed out waiting for the tunnel URL.".to_string()));
                    let taken = {
                        let mut guard = lock(&CHILD);
                        if guard.as_ref().is_some_and(|r| r.gen == gen) { guard.take() } else { None }
                    };
                    if let Some(mut r) = taken {
                        let _ = r.child.kill();
                        let _ = r.child.wait();
                    }
                }
                return Ok(get_tunnel_state());
            }
        }
    }
}

/// Kill the cloudflared child if one is running.
pub fn stop_tunnel() -> Value {
    let taken = lock(&CHILD).take();
    if let Some(mut r) = taken {
        let _ = r.child.kill();
        let _ = r.child.wait();
    }
    set_state("stopped", None, None);
    get_tunnel_state()
}
