//! Reversible AES-256-GCM encryption for mobile-app user passwords. Same
//! `iv:tag:data` base64 format as the Electron build, so existing rows decrypt.
//!
//! Intentional local-first design: the barangay admin can reveal mobile-app
//! user passwords. Anyone with BOTH the database file and the app key could
//! decrypt them — acceptable for an offline single-office app.

use crate::db::queries::settings::{get_setting, set_setting};
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use rusqlite::Connection;

fn key(conn: &Connection) -> Result<Vec<u8>> {
    let hex_key = match get_setting(conn, "app_user_secret")? {
        Some(h) if !h.is_empty() => h,
        _ => {
            let mut bytes = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut bytes);
            let h = hex::encode(bytes);
            set_setting(conn, "app_user_secret", &h)?;
            h
        }
    };
    Ok(hex::decode(hex_key)?)
}

pub fn encrypt_secret(conn: &Connection, plain: &str) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(&key(conn)?)?;
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    // aes-gcm appends the 16-byte tag; Node keeps it separate.
    let mut sealed = cipher
        .encrypt(Nonce::from_slice(&iv), Payload { msg: plain.as_bytes(), aad: b"" })
        .map_err(|e| anyhow::anyhow!("encrypt failed: {e}"))?;
    let tag = sealed.split_off(sealed.len() - 16);
    Ok(format!("{}:{}:{}", B64.encode(iv), B64.encode(tag), B64.encode(sealed)))
}

pub fn decrypt_secret(conn: &Connection, blob: &str) -> String {
    let attempt = || -> Result<String> {
        let mut parts = blob.split(':');
        let iv = B64.decode(parts.next().unwrap_or_default())?;
        let tag = B64.decode(parts.next().unwrap_or_default())?;
        let mut data = B64.decode(parts.next().unwrap_or_default())?;
        anyhow::ensure!(iv.len() == 12 && tag.len() == 16, "malformed secret");
        data.extend_from_slice(&tag);
        let cipher = Aes256Gcm::new_from_slice(&key(conn)?)?;
        let plain = cipher
            .decrypt(Nonce::from_slice(&iv), Payload { msg: &data, aad: b"" })
            .map_err(|e| anyhow::anyhow!("decrypt failed: {e}"))?;
        Ok(String::from_utf8(plain)?)
    };
    attempt().unwrap_or_default()
}
