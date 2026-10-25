//! bcrypt password hashing — compatible with the bcryptjs `$2a$10$` hashes
//! already stored in existing databases.

use subtle::ConstantTimeEq;

pub fn hash_password(password: &str) -> String {
    bcrypt::hash(password, 10).expect("bcrypt hash failed")
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)
}

/// Constant-time comparison to prevent timing attacks on API keys.
pub fn time_safe_equal(a: &str, b: &str) -> bool {
    a.len() == b.len() && bool::from(a.as_bytes().ct_eq(b.as_bytes()))
}
