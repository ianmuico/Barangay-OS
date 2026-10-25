//! Local HTTP API for the mobile partner app and external integrations
//! (the Express app from `main/server`, ported to axum).

mod middleware;
mod routes;

use axum::body::Body;
use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{from_fn, from_fn_with_state};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use rusqlite::Connection;
use serde_json::{Map, Value};
use std::collections::HashMap;

// The server listens on 0.0.0.0 so other devices on the LAN can reach it.
// Allow browser requests from localhost and private-network origins; everything
// is still gated by the API key. Non-browser clients (curl, scripts, mobile
// apps) send no Origin header and are unaffected by CORS.
pub fn create_app() -> Router {
    Router::new()
        .route("/api/health", get(routes::health::health))
        .route("/api/residents", get(routes::residents::list).post(routes::residents::create))
        .route("/api/residents/by-uid/{uid}", get(routes::residents::by_uid))
        .route(
            "/api/residents/{id}",
            get(routes::residents::get_one)
                .put(routes::residents::update)
                .delete(routes::residents::remove),
        )
        .route("/api/households", get(routes::residents::households))
        .route("/api/officials", get(routes::officials::list))
        .route("/api/stats", get(routes::stats::stats))
        .route("/api/presence", get(routes::presence::list).post(routes::presence::heartbeat))
        .route("/api/app/login", post(routes::app::login))
        .route("/api/app/logout", post(routes::app::logout))
        .route("/api/app/me", get(routes::app::me))
        // Express answers unknown routes / methods with 404 "Cannot GET /x"
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        // Layers run outermost-last: origin check → CORS → JSON body (1mb) →
        // rate limit → request log → API key → app user (same order as Express).
        .layer(from_fn(middleware::app_user_auth))
        .layer(from_fn(middleware::api_key_auth))
        .layer(from_fn(middleware::request_log))
        .layer(from_fn_with_state(middleware::RateLimiter::default(), middleware::rate_limit))
        .layer(from_fn(middleware::json_body))
        .layer(middleware::cors_layer())
        .layer(from_fn(middleware::origin_guard))
}

async fn not_found(req: Request) -> Response {
    let target = req.uri().path_and_query().map(|p| p.as_str().to_string()).unwrap_or_else(|| "/".into());
    html_error(
        StatusCode::NOT_FOUND,
        &format!("Cannot {} {}", req.method(), html_escape::encode_text(&target)),
    )
}

// ─── Response helpers (Express `res.json` / default error handler) ──────────

fn with_content_type(mut res: Response, ct: &'static str) -> Response {
    res.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(ct));
    res
}

/// `res.status(status).json(body)`.
pub(crate) fn json_status(status: StatusCode, body: &Value) -> Response {
    let bytes = serde_json::to_vec(body).unwrap_or_default();
    let mut res = Response::new(Body::from(bytes));
    *res.status_mut() = status;
    with_content_type(res, "application/json; charset=utf-8")
}

/// `res.json(body)`.
pub(crate) fn json_ok(body: &Value) -> Response {
    json_status(StatusCode::OK, body)
}

/// `res.status(status).json(maybeRow)` — `res.json(undefined)` sends an empty body.
pub(crate) fn json_opt(status: StatusCode, body: Option<Value>) -> Response {
    match body {
        Some(v) => json_status(status, &v),
        None => {
            let mut res = Response::new(Body::empty());
            *res.status_mut() = status;
            with_content_type(res, "application/json; charset=utf-8")
        }
    }
}

/// `res.status(status).json({ error })`.
pub(crate) fn json_error(status: StatusCode, msg: &str) -> Response {
    json_status(status, &serde_json::json!({ "error": msg }))
}

/// Express's default (finalhandler) HTML error page.
pub(crate) fn html_error(status: StatusCode, msg: &str) -> Response {
    let html = format!(
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>{msg}</pre>\n</body>\n</html>\n"
    );
    let mut res = Response::new(Body::from(html));
    *res.status_mut() = status;
    let h = res.headers_mut();
    h.insert("content-security-policy", HeaderValue::from_static("default-src 'none'"));
    h.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    with_content_type(res, "text/html; charset=utf-8")
}

pub(crate) fn internal_error() -> Response {
    html_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error")
}

// ─── DB access from async handlers ──────────────────────────────────────────

/// Run DB work on the blocking pool with the shared connection locked once.
/// An `Err` (an uncaught throw in Express) becomes a 500 error page.
pub(crate) async fn db_call<T, F>(f: F) -> Result<T, Response>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> anyhow::Result<T> + Send + 'static,
{
    match tokio::task::spawn_blocking(move || {
        let conn = crate::db::conn();
        f(&conn)
    })
    .await
    {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => {
            crate::utils::logger::log_error("[api] Request failed", &e);
            Err(internal_error())
        }
        Err(e) => {
            crate::utils::logger::log_error("[api] Request failed", &e);
            Err(internal_error())
        }
    }
}

/// `db_call` for handlers whose closure builds the whole response.
pub(crate) async fn with_db<F>(f: F) -> Response
where
    F: FnOnce(&Connection) -> anyhow::Result<Response> + Send + 'static,
{
    match db_call(f).await {
        Ok(r) | Err(r) => r,
    }
}

// ─── Request helpers ────────────────────────────────────────────────────────

/// `req.query` — first value of each key.
pub(crate) fn query_map(req: &Request) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Some(q) = req.uri().query() {
        for (k, v) in url::form_urlencoded::parse(q.as_bytes()) {
            out.entry(k.into_owned()).or_insert_with(|| v.into_owned());
        }
    }
    out
}

/// A request header as a string (`undefined` when absent or not UTF-8).
pub(crate) fn header_str(req: &Request, name: &str) -> Option<String> {
    req.headers().get(name).and_then(|v| v.to_str().ok()).map(|s| s.to_string())
}

/// `req.body || {}` as an object (non-object JSON bodies behave like `{}`).
pub(crate) fn body_obj(req: &Request) -> Map<String, Value> {
    match req.extensions().get::<middleware::JsonBody>() {
        Some(middleware::JsonBody(Value::Object(m))) => m.clone(),
        _ => Map::new(),
    }
}

// ─── JS semantics helpers ───────────────────────────────────────────────────

/// JS `String(value)`.
pub(crate) fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::String(s) => s.clone(),
        Value::Number(n) => {
            if n.is_i64() || n.is_u64() {
                n.to_string()
            } else {
                let f = n.as_f64().unwrap_or(0.0);
                if f.is_finite() && f.fract() == 0.0 && f.abs() < 1e21 {
                    format!("{f:.0}")
                } else {
                    f.to_string()
                }
            }
        }
        Value::Array(a) => a
            .iter()
            .map(|x| if x.is_null() { String::new() } else { js_string(x) })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

/// JS `parseInt(s)` (radix 10, or 16 with a 0x prefix) — `None` for NaN.
pub(crate) fn js_parse_int(s: &str) -> Option<i64> {
    let t = s.trim_start();
    let (neg, rest) = match t.as_bytes().first() {
        Some(b'-') => (true, &t[1..]),
        Some(b'+') => (false, &t[1..]),
        _ => (false, t),
    };
    let (radix, digits) = if rest.len() >= 2 && (rest.starts_with("0x") || rest.starts_with("0X")) {
        (16, &rest[2..])
    } else {
        (10, rest)
    };
    let mut acc: f64 = 0.0;
    let mut any = false;
    for c in digits.chars() {
        match c.to_digit(radix) {
            Some(d) => {
                acc = acc * radix as f64 + d as f64;
                any = true;
            }
            None => break,
        }
    }
    if !any {
        return None;
    }
    let v = if neg { -acc } else { acc };
    Some(v.clamp(i64::MIN as f64, i64::MAX as f64) as i64)
}

/// `parseInt(x)` on an optional query value.
pub(crate) fn parse_int_opt(s: Option<&String>) -> Option<i64> {
    s.and_then(|x| js_parse_int(x))
}
