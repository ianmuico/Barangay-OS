// ─────────────────────────────────────────────────────────────────────────────
// Live presence ("who's working on what") — advisory, not a hard lock.
//
// Everything (desktop UI + mobile API) funnels through this one process, so a
// single in-memory registry can show the whole barangay who is currently
// adding/editing a given record. Entries expire if their heartbeat stops, so a
// crashed phone or closed window clears itself within ~TTL.
// ─────────────────────────────────────────────────────────────────────────────

use super::{truthy, Args, HResult};
use crate::server::js_string;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::sync::{Mutex, MutexGuard};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresenceEntry {
    key: String,    // `${entity}:${id}`  (id 'new' for a creation in progress)
    entity: Value,  // 'resident' | 'case' | ...
    id: String,
    action: Value,  // 'editing' | 'adding' | 'viewing'
    who: Value,     // display name (staff name or device name)
    label: String,  // what they're working on, e.g. the resident's name
    session_id: Value, // unique per editing session, so one actor can be deduped
    since: i64,
    last_beat: i64,
    #[serde(skip)]
    sid: String, // registry key (String(sessionId))
}

const TTL_MS: i64 = 30_000; // an entry is "live" for 30s after its last heartbeat

// Keyed by sessionId; a Vec keeps JS Map insertion order (re-setting an
// existing key keeps its original position).
static REGISTRY: Mutex<Vec<PresenceEntry>> = Mutex::new(Vec::new());

fn registry() -> MutexGuard<'static, Vec<PresenceEntry>> {
    REGISTRY.lock().unwrap_or_else(|p| p.into_inner())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn prune(reg: &mut Vec<PresenceEntry>) {
    let now = now_ms();
    reg.retain(|e| now - e.last_beat <= TTL_MS);
}

fn to_values(entries: Vec<PresenceEntry>) -> Vec<Value> {
    entries
        .into_iter()
        .map(|e| serde_json::to_value(e).unwrap_or(Value::Null))
        .collect()
}

/// Record/refresh a presence heartbeat. Returns OTHER live actors on the same key.
/// `input`: `{ entity, id, action, who, sessionId, label? }`.
pub fn heartbeat(input: &Map<String, Value>) -> Vec<Value> {
    let raw = |k: &str| input.get(k).cloned().unwrap_or(Value::Null);
    let id_str = match input.get("id") {
        Some(v) => js_string(v),
        None => "undefined".to_string(),
    };
    let entity_str = match input.get("entity") {
        Some(v) => js_string(v),
        None => "undefined".to_string(),
    };
    let key = format!("{entity_str}:{id_str}");
    let sid = match input.get("sessionId") {
        Some(v) => js_string(v),
        None => "undefined".to_string(),
    };
    let now = now_ms();

    let mut reg = registry();
    prune(&mut reg);
    let pos = reg.iter().position(|e| e.sid == sid);
    let existing = pos.map(|i| reg[i].clone());
    let label = match input.get("label") {
        Some(l) if truthy(l) => js_string(l),
        _ => existing.as_ref().map(|e| e.label.clone()).unwrap_or_default(),
    };
    let entry = PresenceEntry {
        key: key.clone(),
        entity: raw("entity"),
        id: id_str,
        action: raw("action"),
        who: raw("who"),
        label,
        session_id: raw("sessionId"),
        since: existing.as_ref().map(|e| e.since).filter(|s| *s != 0).unwrap_or(now),
        last_beat: now,
        sid: sid.clone(),
    };
    match pos {
        Some(i) => reg[i] = entry,
        None => reg.push(entry),
    }
    others_on_key(&mut reg, &key, &sid)
}

pub fn release(session_id: &str) {
    registry().retain(|e| e.sid != session_id);
}

fn others_on_key(reg: &mut Vec<PresenceEntry>, key: &str, except_session: &str) -> Vec<Value> {
    prune(reg);
    to_values(
        reg.iter()
            .filter(|e| e.key == key && e.sid != except_session)
            .cloned()
            .collect(),
    )
}

pub fn list_all() -> Vec<Value> {
    let mut reg = registry();
    prune(&mut reg);
    let mut all: Vec<PresenceEntry> = reg.clone();
    drop(reg);
    all.sort_by(|a, b| b.last_beat.cmp(&a.last_beat));
    to_values(all)
}

pub fn get_for_key(entity: &str, id: &str) -> Vec<Value> {
    let mut reg = registry();
    prune(&mut reg);
    let key = format!("{entity}:{id}");
    to_values(reg.iter().filter(|e| e.key == key).cloned().collect())
}

pub async fn handle(channel: &str, a: &Args) -> Option<HResult> {
    Some(match channel {
        "presence:heartbeat" => presence_heartbeat(a),
        "presence:release" => {
            release(&js_string(a.raw(0)));
            Ok(json!({ "success": true }))
        }
        "presence:list" => Ok(json!(list_all())),
        _ => return None,
    })
}

fn presence_heartbeat(a: &Args) -> HResult {
    let user = super::auth::current_user();
    let who = user
        .as_ref()
        .and_then(|u| u.full_name.clone().filter(|n| !n.is_empty()))
        .or_else(|| user.as_ref().map(|u| u.username.clone()).filter(|n| !n.is_empty()))
        .unwrap_or_else(|| "Office staff".to_string());
    let mut input = a.obj(0);
    input.insert("who".into(), Value::String(who));
    Ok(json!(heartbeat(&input)))
}
