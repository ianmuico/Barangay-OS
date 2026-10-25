//! Online Mode: start/stop the local HTTP API (`crate::server`) and the
//! Cloudflare quick tunnel that exposes it to the internet.

use super::{as_i64, auth, fail, truthy, Args, HResult};
use crate::db::{
    self,
    queries::{audit::log_audit, settings::get_setting},
};
use crate::utils::tunnel::{get_tunnel_state, start_tunnel, stop_tunnel};
use serde_json::{json, Value};
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

struct ServerHandle {
    gen: u64,
    port: u16,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

static SERVER: Mutex<Option<ServerHandle>> = Mutex::new(None);
static GEN: AtomicU64 = AtomicU64::new(0);

fn server() -> MutexGuard<'static, Option<ServerHandle>> {
    SERVER.lock().unwrap_or_else(|p| p.into_inner())
}

fn running_port() -> Option<u16> {
    server().as_ref().map(|h| h.port)
}

/// First external IPv4 address, in `os.networkInterfaces()` order (addresses
/// grouped by interface, interfaces in first-seen order).
fn get_local_ip() -> String {
    if let Ok(list) = local_ip_address::list_afinet_netifas() {
        let mut names: Vec<&str> = Vec::new();
        for (name, _) in &list {
            if !names.contains(&name.as_str()) {
                names.push(name);
            }
        }
        for name in names {
            for (n, ip) in &list {
                if n == name {
                    if let IpAddr::V4(v4) = ip {
                        if !v4.is_loopback() {
                            return v4.to_string();
                        }
                    }
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

fn audit(action: &str, details: &str) -> anyhow::Result<()> {
    let user_id = auth::current_user().map(|u| u.id);
    let conn = db::conn();
    log_audit(&conn, user_id, action, Some(details))
}

fn setting_port() -> anyhow::Result<Option<i64>> {
    let conn = db::conn();
    let raw = get_setting(&conn, "api_port")?.filter(|s| !s.is_empty());
    Ok(crate::server::js_parse_int(raw.as_deref().unwrap_or("3001")))
}

/// Node-style listen error message (`listen EADDRINUSE: address already in use 0.0.0.0:3001`).
fn listen_error(e: &std::io::Error, port: u16) -> String {
    match e.kind() {
        std::io::ErrorKind::AddrInUse => format!("listen EADDRINUSE: address already in use 0.0.0.0:{port}"),
        std::io::ErrorKind::PermissionDenied => format!("listen EACCES: permission denied 0.0.0.0:{port}"),
        _ => e.to_string(),
    }
}

async fn start(a: &Args) -> HResult {
    if server().is_some() {
        return Ok(fail("Server is already running"));
    }

    let requested = if truthy(a.raw(0)) { as_i64(a.raw(0)) } else { setting_port()? };
    let Some(requested) = requested else {
        return Ok(fail("options.port should be >= 0 and < 65536. Received type number (NaN)."));
    };
    let Ok(server_port) = u16::try_from(requested) else {
        return Ok(fail(format!("options.port should be >= 0 and < 65536. Received type number ({requested}).")));
    };

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", server_port)).await {
        Ok(l) => l,
        Err(e) => return Ok(fail(listen_error(&e, server_port))),
    };
    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(server_port);

    let app = crate::server::create_app();
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;

    {
        let mut guard = server();
        if guard.is_some() {
            return Ok(fail("Server is already running"));
        }
        let task = tauri::async_runtime::spawn(async move {
            let result = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
                .with_graceful_shutdown(async move {
                    let _ = rx.await;
                })
                .await;
            if let Err(e) = result {
                crate::utils::logger::log_error("API server error", &e);
            }
            // The server ended on its own → forget it (the TS 'error' handler)
            let mut guard = server();
            if guard.as_ref().is_some_and(|h| h.gen == gen) {
                *guard = None;
            }
        });
        *guard = Some(ServerHandle { gen, port: actual_port, shutdown: Some(tx), task });
    }

    let local_ip = get_local_ip();
    audit("SERVER_STARTED", &format!("API server started on {local_ip}:{server_port}"))?;
    Ok(json!({
        "success": true,
        "address": local_ip,
        "port": server_port,
        "url": format!("http://{local_ip}:{server_port}"),
    }))
}

async fn stop() -> HResult {
    let handle = server().take();
    let Some(mut handle) = handle else {
        return Ok(fail("Server is not running"));
    };

    stop_tunnel(); // no server → nothing for the tunnel to forward to

    if let Some(tx) = handle.shutdown.take() {
        let _ = tx.send(());
    }
    // Like server.close(): let in-flight requests finish, but never hang forever.
    if tokio::time::timeout(Duration::from_secs(10), &mut handle.task).await.is_err() {
        handle.task.abort();
    }

    audit("SERVER_STOPPED", "API server stopped")?;
    Ok(json!({ "success": true }))
}

/// Stop the API server immediately (app exit). No-op when it isn't running.
pub fn stop_server() {
    if let Some(mut handle) = server().take() {
        if let Some(tx) = handle.shutdown.take() {
            let _ = tx.send(());
        }
        handle.task.abort();
    }
}

// ─── Internet access (Cloudflare quick tunnel) ───

async fn tunnel_start() -> HResult {
    let Some(port) = running_port() else {
        return Ok(json!({ "status": "error", "url": null, "error": "Start the Online Mode server first." }));
    };
    let result = start_tunnel(port).await?;
    if result.get("status").and_then(Value::as_str) == Some("running") {
        let url = result.get("url").and_then(Value::as_str).unwrap_or("").to_string();
        audit("TUNNEL_STARTED", &format!("Internet access enabled: {url}"))?;
    }
    Ok(result)
}

fn tunnel_stop() -> HResult {
    let result = stop_tunnel();
    audit("TUNNEL_STOPPED", "Internet access disabled")?;
    Ok(result)
}

// Self-test: call our own API the way an external app would, so the admin
// can confirm the key and endpoints work without leaving the app.
async fn test() -> HResult {
    let Some(port) = running_port() else {
        return Ok(fail("Server is not running"));
    };
    let api_key = {
        let conn = db::conn();
        get_setting(&conn, "api_key")?.unwrap_or_default()
    };

    let client = match reqwest::Client::builder().timeout(Duration::from_secs(5)).no_proxy().build() {
        Ok(c) => c,
        Err(e) => return Ok(fail(e)),
    };
    let get = |path: &'static str| {
        let client = client.clone();
        let api_key = api_key.clone();
        async move {
            let res = client
                .get(format!("http://127.0.0.1:{port}{path}"))
                .header("X-API-Key", api_key)
                .send()
                .await
                .map_err(request_error)?;
            let status = res.status().as_u16();
            let body = res.text().await.map_err(request_error)?;
            Ok::<(u16, String), String>((status, body))
        }
    };

    let run = async {
        let health = get("/api/health").await?;
        let stats = get("/api/stats").await?;
        if health.0 != 200 {
            return Err(format!("Health check failed (HTTP {})", health.0));
        }
        if stats.0 != 200 {
            return Err(format!("Authenticated request failed (HTTP {}) — check the API key", stats.0));
        }
        let health: Value = serde_json::from_str(&health.1).map_err(|e| e.to_string())?;
        let stats: Value = serde_json::from_str(&stats.1).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true, "health": health, "stats": stats }))
    };
    Ok(run.await.unwrap_or_else(fail))
}

fn request_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "Request timed out".to_string()
    } else {
        e.to_string()
    }
}

fn status() -> Value {
    let Some(port) = running_port() else {
        return json!({ "running": false });
    };
    let ip = get_local_ip();
    json!({
        "running": true,
        "address": ip,
        "port": port,
        "url": format!("http://{ip}:{port}"),
    })
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "server:start" => start(a).await,
        "server:stop" => stop().await,
        "server:test" => test().await,
        "server:status" => Ok(status()),
        "tunnel:start" => tunnel_start().await,
        "tunnel:stop" => tunnel_stop(),
        "tunnel:status" => Ok(get_tunnel_state()),
        _ => return None,
    })
}
