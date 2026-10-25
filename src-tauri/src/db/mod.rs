//! SQLite access layer — a thin, JSON-shaped wrapper over rusqlite that mirrors
//! the better-sqlite3 API the Electron build used (`.all()`, `.get()`, `.run()`),
//! so query modules port one-to-one with their SQL strings unchanged.
//!
//! Rows come back as `serde_json::Value` objects keyed by column name, exactly
//! like better-sqlite3 rows, and go straight back to the renderer.
//!
//! Locking rule: only the IPC handler / HTTP route layer calls [`conn()`]. Query
//! functions take `&Connection` and must never lock again (the mutex is not
//! re-entrant — a nested `conn()` on the same thread deadlocks).

pub mod migrations;
pub mod queries;

use anyhow::{anyhow, Result};
use rusqlite::types::{ToSqlOutput, Value as SqlValue, ValueRef};
use rusqlite::{Connection, Statement};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

static DB: Mutex<Option<Connection>> = Mutex::new(None);

/// Guard that derefs to the open connection.
pub struct DbGuard(MutexGuard<'static, Option<Connection>>);

impl std::ops::Deref for DbGuard {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.0.as_ref().expect("Database not initialized")
    }
}

impl std::ops::DerefMut for DbGuard {
    fn deref_mut(&mut self) -> &mut Connection {
        self.0.as_mut().expect("Database not initialized")
    }
}

/// Lock the shared connection. Handler/route layer only — see module docs.
pub fn conn() -> DbGuard {
    let guard = DB.lock().unwrap_or_else(|p| p.into_inner());
    if guard.is_none() {
        panic!("Database not initialized");
    }
    DbGuard(guard)
}

pub fn database_path() -> PathBuf {
    crate::utils::paths::user_data().join("barangay.db")
}

/// Open the database, set pragmas, and run migrations.
pub fn init_database() -> Result<()> {
    let user_data = crate::utils::paths::user_data();
    std::fs::create_dir_all(user_data.join("photos"))?;
    std::fs::create_dir_all(user_data.join("avatars"))?;

    let c = Connection::open(database_path())?;
    c.pragma_update(None, "journal_mode", "WAL")?;
    c.pragma_update(None, "foreign_keys", "ON")?;
    c.busy_timeout(std::time::Duration::from_secs(5))?;
    migrations::run_migrations(&c)?;

    *DB.lock().unwrap_or_else(|p| p.into_inner()) = Some(c);
    Ok(())
}

pub fn close_database() {
    let mut guard = DB.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(c) = guard.take() {
        let _ = c.close();
    }
}

// ─── Parameters ─────────────────────────────────────────────────────────────

/// Statement parameters: positional (`?`) or named (`@name`, `:name`, `$name`).
pub enum Params {
    None,
    Positional(Vec<Value>),
    Named(Map<String, Value>),
}

impl From<()> for Params {
    fn from(_: ()) -> Self {
        Params::None
    }
}

impl From<Vec<Value>> for Params {
    fn from(v: Vec<Value>) -> Self {
        Params::Positional(v)
    }
}

impl From<&[Value]> for Params {
    fn from(v: &[Value]) -> Self {
        Params::Positional(v.to_vec())
    }
}

impl From<Map<String, Value>> for Params {
    fn from(m: Map<String, Value>) -> Self {
        Params::Named(m)
    }
}

/// A JSON object binds by name (like passing an object to better-sqlite3),
/// an array binds positionally, anything else is a single positional value.
impl From<Value> for Params {
    fn from(v: Value) -> Self {
        match v {
            Value::Object(m) => Params::Named(m),
            Value::Array(a) => Params::Positional(a),
            Value::Null => Params::Positional(vec![Value::Null]),
            other => Params::Positional(vec![other]),
        }
    }
}

impl From<&Value> for Params {
    fn from(v: &Value) -> Self {
        v.clone().into()
    }
}

/// Positional params from any serializable values: `p![id, name, flag]`.
#[macro_export]
macro_rules! p {
    () => { $crate::db::Params::None };
    ($($x:expr),+ $(,)?) => {
        $crate::db::Params::Positional(vec![$(serde_json::to_value(&$x).unwrap_or(serde_json::Value::Null)),+])
    };
}

fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15 {
                    SqlValue::Integer(f as i64)
                } else {
                    SqlValue::Real(f)
                }
            } else {
                SqlValue::Null
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

struct Bound(SqlValue);

impl rusqlite::ToSql for Bound {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::Borrowed(ValueRef::from(&self.0)))
    }
}

fn bind(stmt: &mut Statement<'_>, params: &Params) -> Result<()> {
    match params {
        Params::None => {}
        Params::Positional(values) => {
            let count = stmt.parameter_count();
            for i in 1..=count {
                let v = values.get(i - 1).unwrap_or(&Value::Null);
                stmt.raw_bind_parameter(i, Bound(json_to_sql(v)))?;
            }
        }
        Params::Named(map) => {
            let count = stmt.parameter_count();
            for i in 1..=count {
                let name = stmt
                    .parameter_name(i)
                    .ok_or_else(|| anyhow!("Statement mixes named and positional parameters"))?;
                let key = &name[1..]; // strip @ / : / $
                let v = map.get(key).unwrap_or(&Value::Null);
                stmt.raw_bind_parameter(i, Bound(json_to_sql(v)))?;
            }
        }
    }
    Ok(())
}

fn row_to_json(row: &rusqlite::Row<'_>, names: &[String]) -> Result<Value> {
    let mut obj = Map::with_capacity(names.len());
    for (i, name) in names.iter().enumerate() {
        let v = match row.get_ref(i)? {
            ValueRef::Null => Value::Null,
            ValueRef::Integer(n) => Value::from(n),
            ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
            ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
            ValueRef::Blob(b) => Value::Array(b.iter().map(|x| Value::from(*x)).collect()),
        };
        obj.insert(name.clone(), v);
    }
    Ok(Value::Object(obj))
}

// ─── better-sqlite3 style helpers ───────────────────────────────────────────

/// `db.prepare(sql).all(params)` — every row as a JSON object.
pub fn all(conn: &Connection, sql: &str, params: impl Into<Params>) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare_cached(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    bind(&mut stmt, &params.into())?;
    let mut rows = stmt.raw_query();
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        out.push(row_to_json(row, &names)?);
    }
    Ok(out)
}

/// `db.prepare(sql).get(params)` — first row, or `None`.
pub fn get(conn: &Connection, sql: &str, params: impl Into<Params>) -> Result<Option<Value>> {
    let mut stmt = conn.prepare_cached(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    bind(&mut stmt, &params.into())?;
    let mut rows = stmt.raw_query();
    match rows.next()? {
        Some(row) => Ok(Some(row_to_json(row, &names)?)),
        None => Ok(None),
    }
}

/// `db.prepare(sql).pluck().get(params)` — first column of the first row.
pub fn scalar(conn: &Connection, sql: &str, params: impl Into<Params>) -> Result<Value> {
    let mut stmt = conn.prepare_cached(sql)?;
    bind(&mut stmt, &params.into())?;
    let mut rows = stmt.raw_query();
    match rows.next()? {
        Some(row) => {
            let names = vec![String::new()];
            let v = row_to_json(row, &names)?;
            Ok(v.get("").cloned().unwrap_or(Value::Null))
        }
        None => Ok(Value::Null),
    }
}

/// `scalar` read as i64 (0 when NULL / no row) — handy for COUNT(*).
pub fn count(conn: &Connection, sql: &str, params: impl Into<Params>) -> Result<i64> {
    Ok(scalar(conn, sql, params)?.as_i64().unwrap_or(0))
}

/// Result of `.run()`, serialized with better-sqlite3's field names.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    pub changes: i64,
    pub last_insert_rowid: i64,
}

/// `db.prepare(sql).run(params)`.
pub fn run(conn: &Connection, sql: &str, params: impl Into<Params>) -> Result<RunResult> {
    let mut stmt = conn.prepare_cached(sql)?;
    bind(&mut stmt, &params.into())?;
    let changes = stmt.raw_execute()? as i64;
    Ok(RunResult { changes, last_insert_rowid: conn.last_insert_rowid() })
}

/// `db.exec(sql)` — one or more statements, no parameters.
pub fn exec(conn: &Connection, sql: &str) -> Result<()> {
    conn.execute_batch(sql)?;
    Ok(())
}

/// `db.transaction(fn)()` — BEGIN/COMMIT at the top level, a SAVEPOINT when
/// nested (same semantics as better-sqlite3). Rolls back if `f` errors.
pub fn transaction<T>(conn: &Connection, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
    let nested = !conn.is_autocommit();
    if nested {
        conn.execute_batch("SAVEPOINT bms_tx")?;
    } else {
        conn.execute_batch("BEGIN")?;
    }
    match f(conn) {
        Ok(v) => {
            conn.execute_batch(if nested { "RELEASE bms_tx" } else { "COMMIT" })?;
            Ok(v)
        }
        Err(e) => {
            let _ = conn.execute_batch(if nested {
                "ROLLBACK TO bms_tx; RELEASE bms_tx"
            } else {
                "ROLLBACK"
            });
            Err(e)
        }
    }
}
