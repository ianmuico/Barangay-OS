//! BIMS export column mapping (RBI-aligned).
//!
//! DILG LGUSS-BIMS accepts external data ONLY via its own prescribed Excel template
//! (there is no public API). We do not have that template's exact columns — they are
//! login-gated and obtained per-barangay from a DILG Information System Analyst (ISA).
//! This profile is a best-guess mapping to the Records of Barangay Inhabitants (RBI)
//! fields. When the real template is available, adjust the `header` values here to
//! match it exactly — this is the ONLY file that should need to change.

use serde_json::Value;

pub struct BimsColumn {
    pub header: &'static str,
    pub required: bool,
    pub get: fn(&Value) -> String,
}

/// JS `r.key || ''` stringified.
fn s(r: &Value, key: &str) -> String {
    match r.get(key) {
        Some(v) if crate::ipc::truthy(v) => match v {
            Value::String(s) => s.clone(),
            Value::Number(n) => match n.as_i64() {
                Some(i) => i.to_string(),
                None => n.as_f64().map(|f| f.to_string()).unwrap_or_default(),
            },
            Value::Bool(b) => b.to_string(),
            other => other.to_string(),
        },
        _ => String::new(),
    }
}

/// `yn(v)` — JS truthiness → 'Yes' / 'No'.
fn yn(b: bool) -> String {
    if b { "Yes" } else { "No" }.to_string()
}

fn t(r: &Value, key: &str) -> bool {
    r.get(key).map(crate::ipc::truthy).unwrap_or(false)
}

macro_rules! col {
    ($header:expr, $required:expr, $get:expr) => {
        BimsColumn { header: $header, required: $required, get: $get }
    };
}

pub static BIMS_RBI_COLUMNS: &[BimsColumn] = &[
    col!("Last Name", true, |r| s(r, "last_name")),
    col!("First Name", true, |r| s(r, "first_name")),
    col!("Middle Name", false, |r| s(r, "middle_name")),
    col!("Suffix", false, |r| s(r, "suffix")),
    col!("Sex", true, |r| s(r, "gender")),
    col!("Date of Birth", true, |r| s(r, "birth_date")),
    col!("Place of Birth", false, |r| s(r, "birth_place")),
    col!("Civil Status", false, |r| s(r, "civil_status")),
    col!("Citizenship", false, |r| s(r, "citizenship")),
    col!("Religion", false, |r| s(r, "religion")),
    col!("Occupation", false, |r| s(r, "occupation")),
    col!("Educational Attainment", false, |r| s(r, "educational_attainment")),
    col!("PhilSys Card No", false, |r| s(r, "philsys_card_no")),
    col!("Contact Number", false, |r| s(r, "contact_number")),
    col!("Purok/Zone", false, |r| s(r, "purok")),
    col!("Address", false, |r| s(r, "address")),
    col!("Household No", false, |r| s(r, "household_number")),
    col!("Relationship to Head", false, |r| s(r, "relationship_to_head")),
    col!("Registered Voter", false, |r| yn(r.get("voter_status").and_then(|v| v.as_str()) == Some("Registered"))),
    col!("Labor Force Status", false, |r| s(r, "labor_force_status")),
    col!("Residency Status", false, |r| s(r, "residency_status")),
    // (r.age ?? 0) >= 60
    col!("Senior Citizen", false, |r| yn(r.get("age").and_then(|v| v.as_f64()).unwrap_or(0.0) >= 60.0)),
    col!("PWD", false, |r| yn(t(r, "is_pwd"))),
    col!("Disability Type", false, |r| s(r, "disability_type")),
    col!("PWD ID No", false, |r| s(r, "pwd_id_no")),
    col!("Solo Parent", false, |r| yn(t(r, "is_solo_parent"))),
    col!("Out-of-School Youth", false, |r| yn(t(r, "is_osy"))),
    col!("OFW", false, |r| yn(t(r, "is_ofw"))),
    col!("Indigenous Person", false, |r| yn(t(r, "is_ip"))),
    col!("Ethnicity", false, |r| s(r, "ethnicity")),
    col!("4Ps Beneficiary", false, |r| yn(t(r, "is_4ps"))),
    col!("Indigent", false, |r| yn(t(r, "is_indigent"))),
];
