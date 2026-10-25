use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A user row without `password_hash` (what the renderer sees).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafeUser {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub full_name: Option<String>,
    pub avatar_path: Option<String>,
    pub preferences_json: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub role: String,
    pub full_name: Option<String>,
    pub avatar_path: Option<String>,
    pub preferences_json: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl User {
    pub fn safe(&self) -> SafeUser {
        SafeUser {
            id: self.id,
            username: self.username.clone(),
            role: self.role.clone(),
            full_name: self.full_name.clone(),
            avatar_path: self.avatar_path.clone(),
            preferences_json: self.preferences_json.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}

fn to_user(row: Option<Value>) -> Result<Option<User>> {
    Ok(match row {
        Some(v) => Some(serde_json::from_value(v)?),
        None => None,
    })
}

pub fn list_users(conn: &Connection) -> Result<Vec<Value>> {
    db::all(
        conn,
        "SELECT id, username, role, full_name, avatar_path, preferences_json, created_at, updated_at FROM users ORDER BY created_at DESC",
        (),
    )
}

pub fn get_user_by_id(conn: &Connection, id: i64) -> Result<Option<User>> {
    to_user(db::get(conn, "SELECT * FROM users WHERE id = ?", crate::p![id])?)
}

pub fn get_user_by_username(conn: &Connection, username: &str) -> Result<Option<User>> {
    to_user(db::get(conn, "SELECT * FROM users WHERE username = ?", crate::p![username])?)
}

pub fn create_user(conn: &Connection, username: &str, password_hash: &str, role: &str, full_name: Option<&str>) -> Result<i64> {
    let full_name = full_name.filter(|s| !s.is_empty());
    let r = db::run(
        conn,
        "INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)",
        crate::p![username, password_hash, role, full_name],
    )?;
    Ok(r.last_insert_rowid)
}

/// Updates only the keys present in `data` (`!== undefined` semantics).
pub fn update_user(conn: &Connection, id: i64, data: &serde_json::Map<String, Value>) -> Result<()> {
    let mut fields: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();
    for key in ["username", "role", "full_name", "avatar_path", "preferences_json"] {
        if let Some(v) = data.get(key) {
            fields.push(format!("{key} = ?"));
            values.push(v.clone());
        }
    }
    if fields.is_empty() {
        return Ok(());
    }
    fields.push("updated_at = datetime('now')".into());
    values.push(Value::from(id));
    db::run(conn, &format!("UPDATE users SET {} WHERE id = ?", fields.join(", ")), values)?;
    Ok(())
}

pub fn update_password(conn: &Connection, id: i64, password_hash: &str) -> Result<()> {
    db::run(
        conn,
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        crate::p![password_hash, id],
    )?;
    Ok(())
}

pub fn delete_user(conn: &Connection, id: i64) -> Result<()> {
    db::run(conn, "DELETE FROM users WHERE id = ?", crate::p![id])?;
    Ok(())
}
