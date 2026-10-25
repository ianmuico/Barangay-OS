//! Express middleware stack: CORS, JSON body parsing, rate limiting, request
//! logging, API-key auth (`apiKeyAuth.ts`) and app-user auth (`appUser.ts`).

use super::{db_call, header_str, html_error, internal_error, json_error};
use crate::db::queries::{api_clients::resolve_api_client, app_auth::resolve_app_session, settings::get_setting};
use crate::ipc::{as_i64, truthy};
use crate::utils::hash::time_safe_equal;
use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{header, HeaderName, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use regex::Regex;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tower_http::cors::{AllowOrigin, CorsLayer};

// ─── CORS ───────────────────────────────────────────────────────────────────

static PRIVATE_ORIGIN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"^https?://(localhost|127\.0\.0\.1|10(\.[0-9]{1,3}){3}|192\.168(\.[0-9]{1,3}){2}|172\.(1[6-9]|2[0-9]|3[01])(\.[0-9]{1,3}){2})(:[0-9]+)?$",
    )
    .expect("valid origin regex")
});

fn origin_allowed(origin: &HeaderValue) -> bool {
    origin.to_str().map(|o| PRIVATE_ORIGIN.is_match(o)).unwrap_or(false)
}

/// The `cors` package rejects a disallowed Origin with an error, which
/// Express turns into a 500 (before CORS headers or any route runs).
pub async fn origin_guard(req: Request, next: Next) -> Response {
    if let Some(origin) = req.headers().get(header::ORIGIN) {
        if !origin.is_empty() && !origin_allowed(origin) {
            crate::utils::logger::log_error("[api] CORS", &"Not allowed by CORS");
            return internal_error();
        }
    }
    next.run(req).await
}

pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _| origin_allowed(origin)))
        .allow_methods([Method::GET, Method::HEAD, Method::PUT, Method::PATCH, Method::POST, Method::DELETE])
        .allow_headers([
            header::CONTENT_TYPE,
            HeaderName::from_static("x-api-key"),
            HeaderName::from_static("x-user-token"),
        ])
}

// ─── express.json({ limit: '1mb' }) ─────────────────────────────────────────

const BODY_LIMIT: usize = 1024 * 1024;

/// The parsed JSON body (`req.body`; `{}` when there was none).
#[derive(Clone)]
pub struct JsonBody(pub Value);

pub async fn json_body(req: Request, next: Next) -> Response {
    let (parts, body) = req.into_parts();
    let is_json = parts
        .headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.split(';').next().unwrap_or("").trim().eq_ignore_ascii_case("application/json"))
        .unwrap_or(false);
    let declared_len = parts
        .headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok());
    let has_body = declared_len.is_some() || parts.headers.contains_key(header::TRANSFER_ENCODING);

    let mut parsed = Value::Object(Map::new());
    let body = if is_json && has_body {
        if declared_len.is_some_and(|n| n > BODY_LIMIT as u64) {
            return html_error(StatusCode::PAYLOAD_TOO_LARGE, "Payload Too Large");
        }
        let bytes = match axum::body::to_bytes(body, BODY_LIMIT).await {
            Ok(b) => b,
            Err(_) => return html_error(StatusCode::PAYLOAD_TOO_LARGE, "Payload Too Large"),
        };
        // strict mode: only objects and arrays; an empty body is `{}`
        let first = bytes.iter().find(|b| !matches!(b, b' ' | b'\t' | b'\n' | b'\r'));
        match first {
            None => {}
            Some(b'{') | Some(b'[') => match serde_json::from_slice::<Value>(&bytes) {
                Ok(v) => parsed = v,
                Err(_) => return html_error(StatusCode::BAD_REQUEST, "Bad Request"),
            },
            Some(_) => return html_error(StatusCode::BAD_REQUEST, "Bad Request"),
        }
        Body::empty()
    } else {
        body
    };

    let mut req = Request::from_parts(parts, body);
    req.extensions_mut().insert(JsonBody(parsed));
    next.run(req).await
}

// ─── Rate limiting: simple in-memory tracker ────────────────────────────────

struct Window {
    count: u64,
    reset_at: Instant,
}

#[derive(Clone, Default)]
pub struct RateLimiter(Arc<Mutex<HashMap<String, Window>>>);

pub async fn rate_limit(State(limiter): State<RateLimiter>, req: Request, next: Next) -> Response {
    // Behind the Cloudflare tunnel every request arrives from localhost, so
    // key the limiter on the real client IP that Cloudflare forwards.
    let ip = header_str(&req, "cf-connecting-ip")
        .filter(|s| !s.is_empty())
        .or_else(|| {
            req.extensions()
                .get::<ConnectInfo<SocketAddr>>()
                .map(|ConnectInfo(addr)| addr.ip().to_string())
        })
        .unwrap_or_else(|| "unknown".to_string());
    let now = Instant::now();

    let limited = {
        let mut counts = limiter.0.lock().unwrap_or_else(|p| p.into_inner());

        // Prune expired entries so the map can't grow unbounded
        if counts.len() > 500 {
            counts.retain(|_, w| now <= w.reset_at);
        }

        match counts.get_mut(&ip) {
            Some(w) if now <= w.reset_at => {
                w.count += 1;
                w.count > 100 // Max 100 requests per minute per IP
            }
            _ => {
                // 1 minute window
                counts.insert(ip, Window { count: 1, reset_at: now + Duration::from_secs(60) });
                false
            }
        }
    };
    if limited {
        return json_error(StatusCode::TOO_MANY_REQUESTS, "Too many requests");
    }
    next.run(req).await
}

// ─── Request logging ────────────────────────────────────────────────────────

pub async fn request_log(req: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let res = next.run(req).await;
    println!("[api] {} {} {} {}ms", method, path, res.status().as_u16(), start.elapsed().as_millis());
    res
}

// ─── apiKeyAuth ─────────────────────────────────────────────────────────────

// The requester identity attached to each authenticated request.
//  - admin:  the master API key (full access, can edit any record)
//  - client: a per-device token (can add anything, but only edit its own records)
#[derive(Clone)]
pub struct ApiRequester {
    pub admin: bool,
    pub client_id: Option<i64>,
    pub client_name: Option<String>,
}

pub fn get_requester(req: &Request) -> ApiRequester {
    req.extensions().get::<ApiRequester>().cloned().unwrap_or(ApiRequester {
        admin: true,
        client_id: None,
        client_name: None,
    })
}

enum KeyCheck {
    Ok(ApiRequester),
    NotConfigured,
    Invalid,
}

pub async fn api_key_auth(mut req: Request, next: Next) -> Response {
    // Health endpoint is public
    if req.uri().path() == "/api/health" {
        return next.run(req).await;
    }

    let provided = match header_str(&req, "x-api-key").filter(|s| !s.is_empty()) {
        Some(k) => k,
        None => return json_error(StatusCode::UNAUTHORIZED, "Missing API key"),
    };

    let check = db_call(move |conn| {
        // 1. Master key → admin (back-compatible with existing integrations)
        let master_key = get_setting(conn, "api_key")?.filter(|k| !k.is_empty());
        if let Some(master) = &master_key {
            if time_safe_equal(&provided, master) {
                return Ok(KeyCheck::Ok(ApiRequester { admin: true, client_id: None, client_name: None }));
            }
        }

        // 2. Per-device client token
        if let Some(client) = resolve_api_client(conn, &provided)? {
            return Ok(KeyCheck::Ok(ApiRequester {
                admin: false,
                client_id: client.get("id").and_then(as_i64),
                client_name: client.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()),
            }));
        }

        Ok(if master_key.is_none() { KeyCheck::NotConfigured } else { KeyCheck::Invalid })
    })
    .await;

    match check {
        Err(res) => res,
        Ok(KeyCheck::Ok(requester)) => {
            req.extensions_mut().insert(requester);
            next.run(req).await
        }
        Ok(KeyCheck::NotConfigured) => json_error(StatusCode::SERVICE_UNAVAILABLE, "API key not configured"),
        Ok(KeyCheck::Invalid) => json_error(StatusCode::UNAUTHORIZED, "Invalid API key"),
    }
}

// ─── appUserAuth ────────────────────────────────────────────────────────────

// Resolves an optional X-User-Token into the logged-in app user + permissions.
// Runs after apiKeyAuth (device/master key). If no token, requests proceed as
// before (master-key admin behaviour); if a token is present it must be valid.
#[derive(Clone)]
pub struct AppUserContext {
    pub perms: Value,
}

pub fn get_app_user(req: &Request) -> Option<AppUserContext> {
    req.extensions().get::<AppUserContext>().cloned()
}

pub async fn app_user_auth(mut req: Request, next: Next) -> Response {
    let token = match header_str(&req, "x-user-token").filter(|s| !s.is_empty()) {
        Some(t) => t,
        None => return next.run(req).await, // anonymous (master-key) access still allowed
    };
    let session = match db_call(move |conn| resolve_app_session(conn, &token)).await {
        Ok(s) => s,
        Err(res) => return res,
    };
    let Some(session) = session else {
        return json_error(StatusCode::UNAUTHORIZED, "Your session has expired. Please log in again.");
    };
    req.extensions_mut().insert(AppUserContext {
        perms: session.get("perms").cloned().unwrap_or(Value::Null),
    });
    next.run(req).await
}

// Enforce a permission for the logged-in app user. Master-key/anonymous callers
// (no user token) are treated as admin and pass through. Returns the 403
// response to send when the permission is missing.
pub fn require_perm(user: Option<&AppUserContext>, perm: &str) -> Option<Response> {
    let user = user?; // master key / no user session → full access
    if user.perms.get(perm).is_some_and(truthy) {
        return None;
    }
    Some(json_error(
        StatusCode::FORBIDDEN,
        &format!("Your role does not have permission to {perm} residents."),
    ))
}
