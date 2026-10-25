use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Map, Value};

/// RBI Form C — semestral demographic/sectoral summary counts.
/// Returns a flat map so the report template can use {{count:key}} variables.
pub fn get_rbi_form_c_counts(conn: &Connection) -> Result<Value> {
    let n = |sql: &str| db::count(conn, sql, ());
    let living = "status = 'living'";
    let age = "CAST((julianday('now') - julianday(birth_date)) / 365.25 AS INTEGER)";
    let pairs: Vec<(&str, String)> = vec![
        ("total", format!("SELECT COUNT(*) n FROM residents WHERE {living}")),
        ("male", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND gender='Male'")),
        ("female", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND gender='Female'")),
        ("households", "SELECT COUNT(*) n FROM households".to_string()),
        ("children", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND {age} BETWEEN 0 AND 14")),
        ("youth", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND {age} BETWEEN 15 AND 30")),
        ("adults", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND {age} BETWEEN 31 AND 59")),
        ("seniors", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND {age} >= 60")),
        ("seniorsMale", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND gender='Male' AND {age} >= 60")),
        ("seniorsFemale", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND gender='Female' AND {age} >= 60")),
        ("pwd", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_pwd=1")),
        ("soloParents", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_solo_parent=1")),
        ("osy", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_osy=1")),
        ("ofw", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_ofw=1")),
        ("ip", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_ip=1")),
        ("indigent", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_indigent=1")),
        ("fourps", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND is_4ps=1")),
        ("voters", format!("SELECT COUNT(*) n FROM residents WHERE {living} AND voter_status='Registered'")),
    ];
    let mut out = Map::new();
    for (key, sql) in pairs {
        out.insert(key.to_string(), Value::from(n(&sql)?));
    }
    Ok(Value::Object(out))
}
