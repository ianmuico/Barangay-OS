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

#[cfg(test)]
mod tests {
    use super::*;

    /// The default admin seeded by migration 002 (bcryptjs `$2a$`) must verify.
    #[test]
    fn seeded_admin_hash_is_admin123() {
        assert!(verify_password("admin123", "$2a$10$St8I7aX6OpROa4FWIuZBFetxvqEbeP23sKNQjf3mC8Pkoqc8cjphm"));
        assert!(!verify_password("wrong", "$2a$10$St8I7aX6OpROa4FWIuZBFetxvqEbeP23sKNQjf3mC8Pkoqc8cjphm"));
    }
}
