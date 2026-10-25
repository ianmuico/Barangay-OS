//! IPC dispatcher — the Tauri replacement for Electron's `ipcMain.handle`.
//!
//! The renderer keeps its `window.electronAPI` surface; each call arrives here
//! as `ipc(channel, args)` with the same channel names (`db:residents:list`, …)
//! and the same positional arguments the old preload passed to
//! `ipcRenderer.invoke`. Every module exposes
//!
//! ```ignore
//! pub async fn handle(channel: &str, a: &Args) -> Option<HResult>
//! ```
//!
//! returning `None` for channels it does not own. A handler `Err` rejects the
//! renderer promise with Electron's message format, so existing
//! `catch (e) { e.message }` code keeps working.

pub mod ai;
pub mod auth;
pub mod backup;
pub mod bims_export;
pub mod db_admin;
pub mod db_records;
pub mod db_residents;
pub mod excel;
pub mod presence;
pub mod reports;
pub mod server;
pub mod updater;

use anyhow::{anyhow, Result};
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

pub type HResult = Result<Value>;

/// Positional arguments exactly as the renderer passed them.
#[derive(Debug, Clone, Default)]
pub struct Args(pub Vec<Value>);

impl Args {
    /// Raw argument (`Null` when missing — i.e. JS `undefined`).
    pub fn val(&self, i: usize) -> Value {
        self.0.get(i).cloned().unwrap_or(Value::Null)
    }

    pub fn raw(&self, i: usize) -> &Value {
        self.0.get(i).unwrap_or(&Value::Null)
    }

    /// Deserialize argument `i` into `T` (missing → deserialized from `null`,
    /// so `Option<T>` works for optional params).
    pub fn get<T: DeserializeOwned>(&self, i: usize) -> Result<T> {
        serde_json::from_value(self.val(i)).map_err(|e| anyhow!("Invalid argument {i}: {e}"))
    }

    pub fn i64(&self, i: usize) -> Result<i64> {
        self.opt_i64(i).ok_or_else(|| anyhow!("Argument {i} must be a number"))
    }

    /// Number argument; also accepts numeric strings (JS callers are loose).
    pub fn opt_i64(&self, i: usize) -> Option<i64> {
        as_i64(self.raw(i))
    }

    pub fn f64(&self, i: usize) -> Option<f64> {
        match self.raw(i) {
            Value::Number(n) => n.as_f64(),
            Value::String(s) => s.trim().parse().ok(),
            _ => None,
        }
    }

    pub fn str(&self, i: usize) -> Result<String> {
        self.opt_str(i).ok_or_else(|| anyhow!("Argument {i} must be a string"))
    }

    pub fn opt_str(&self, i: usize) -> Option<String> {
        match self.raw(i) {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        }
    }

    /// JS truthiness of argument `i`.
    pub fn truthy(&self, i: usize) -> bool {
        truthy(self.raw(i))
    }

    /// Object argument (`{}` when missing/null), like `params = {}` defaults.
    pub fn obj(&self, i: usize) -> Map<String, Value> {
        match self.raw(i) {
            Value::Object(m) => m.clone(),
            _ => Map::new(),
        }
    }
}

/// JS truthiness.
pub fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(false),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// Loose number read: numbers, numeric strings, booleans.
pub fn as_i64(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(s) => s.trim().parse::<f64>().ok().map(|f| f as i64),
        Value::Bool(b) => Some(*b as i64),
        _ => None,
    }
}

/// Field accessors for JSON objects (renderer payloads and DB rows).
pub trait ObjExt {
    fn s(&self, key: &str) -> Option<String>;
    fn i(&self, key: &str) -> Option<i64>;
    fn has(&self, key: &str) -> bool;
    fn is_truthy(&self, key: &str) -> bool;
}

impl ObjExt for Map<String, Value> {
    fn s(&self, key: &str) -> Option<String> {
        match self.get(key) {
            Some(Value::String(s)) => Some(s.clone()),
            Some(Value::Number(n)) => Some(n.to_string()),
            _ => None,
        }
    }
    fn i(&self, key: &str) -> Option<i64> {
        self.get(key).and_then(as_i64)
    }
    /// `obj.key !== undefined` (present, even if null).
    fn has(&self, key: &str) -> bool {
        self.contains_key(key)
    }
    fn is_truthy(&self, key: &str) -> bool {
        self.get(key).map(truthy).unwrap_or(false)
    }
}

impl ObjExt for Value {
    fn s(&self, key: &str) -> Option<String> {
        self.as_object().and_then(|m| m.s(key))
    }
    fn i(&self, key: &str) -> Option<i64> {
        self.as_object().and_then(|m| m.i(key))
    }
    fn has(&self, key: &str) -> bool {
        self.as_object().map(|m| m.has(key)).unwrap_or(false)
    }
    fn is_truthy(&self, key: &str) -> bool {
        self.as_object().map(|m| m.is_truthy(key)).unwrap_or(false)
    }
}

/// `{ success: false, error }` — the common failure shape handlers return.
pub fn fail(msg: impl std::fmt::Display) -> Value {
    serde_json::json!({ "success": false, "error": msg.to_string() })
}

/// Route a call to the module that owns the channel.
pub async fn dispatch(channel: &str, a: Args) -> std::result::Result<Value, String> {
    let a = &a;
    let res = if let Some(r) = auth::handle(channel, a).await {
        r
    } else if let Some(r) = db_residents::handle(channel, a).await {
        r
    } else if let Some(r) = db_records::handle(channel, a).await {
        r
    } else if let Some(r) = db_admin::handle(channel, a).await {
        r
    } else if let Some(r) = reports::handle(channel, a).await {
        r
    } else if let Some(r) = excel::handle(channel, a).await {
        r
    } else if let Some(r) = bims_export::handle(channel, a).await {
        r
    } else if let Some(r) = backup::handle(channel, a).await {
        r
    } else if let Some(r) = presence::handle(channel, a).await {
        r
    } else if let Some(r) = server::handle(channel, a).await {
        r
    } else if let Some(r) = ai::handle(channel, a).await {
        r
    } else if let Some(r) = updater::handle(channel, a).await {
        r
    } else {
        return Err(format!("No handler registered for '{channel}'"));
    };

    res.map_err(|e| {
        crate::utils::logger::log_error(&format!("IPC {channel}"), &e);
        format!("Error invoking remote method '{channel}': Error: {e}")
    })
}

/// The single Tauri command the renderer bridge calls.
#[tauri::command]
pub async fn ipc(channel: String, args: Option<Vec<Value>>) -> std::result::Result<Value, String> {
    dispatch(&channel, Args(args.unwrap_or_default())).await
}
