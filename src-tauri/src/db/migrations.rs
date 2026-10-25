//! Schema migrations — port of `main/database/connection.ts` (everything except
//! getDb / initDatabase / closeDatabase, which live in `db/mod.rs`).
//!
//! The Electron build first looked for a `migrations/` directory of .sql files
//! and otherwise ran the inline migrations. The shipped app never had that
//! directory, so the inline path is what real installs ran — and that is what
//! is ported here. Migration names recorded in `_migrations` are identical to
//! the TS ones, so a database created by the Electron build is recognized and
//! nothing re-runs.
//!
//! Every SQL string lives byte-for-byte in `db/sql/<name>` (copied verbatim from
//! the `MIGRATION_0xx` template literals, which contain no escapes or
//! interpolations).

use anyhow::{anyhow, Result};
use rusqlite::Connection;
use std::fs;
use std::path::Path;

const MIGRATION_001: &str = include_str!("sql/001_initial.sql");
// Default admin password: "admin123"
const MIGRATION_002: &str = include_str!("sql/002_seed_admin.sql");
const MIGRATION_003: &str = include_str!("sql/003_partners_officials_purok.sql");
const MIGRATION_004: &str = include_str!("sql/004_parents.sql");
const MIGRATION_005: &str = include_str!("sql/005_new_tables_and_fields.sql");
const MIGRATION_006: &str = include_str!("sql/006_seed_templates.sql");
const MIGRATION_007: &str = include_str!("sql/007_bisaya_templates.sql");
const MIGRATION_008: &str = include_str!("sql/008_indexes.sql");
const MIGRATION_009: &str = include_str!("sql/009_death_date.sql");
const MIGRATION_010: &str = include_str!("sql/010_template_paper.sql");
const MIGRATION_011: &str = include_str!("sql/011_case_parties.sql");
const MIGRATION_012: &str = include_str!("sql/012_case_documents.sql");
const MIGRATION_013: &str = include_str!("sql/013_issues_businesses_template_pages.sql");
const MIGRATION_014: &str = include_str!("sql/014_business_documents.sql");
const MIGRATION_015: &str = include_str!("sql/015_resident_uid.sql");
const MIGRATION_016: &str = include_str!("sql/016_pwd.sql");
const MIGRATION_017: &str = include_str!("sql/017_api_clients_provenance.sql");
const MIGRATION_018: &str = include_str!("sql/018_row_version.sql");
const MIGRATION_019: &str = include_str!("sql/019_app_users_roles.sql");
// ─── BIMS-readiness (P0) ────────────────────────────────────────────────────
// DILG LGUSS-BIMS alignment. See BIMS-READINESS-PLAN.md.
// Batch A1: RBI Form B "place of birth".
const MIGRATION_020: &str = include_str!("sql/020_rbi_birth_place.sql");
// Batch A2: RBI sectoral / vulnerable-group tags + structured PWD.
const MIGRATION_021: &str = include_str!("sql/021_rbi_sectoral_fields.sql");
// Face B: Households (RBI Form A) — household head, roster, and member relationships.
const MIGRATION_022: &str = include_str!("sql/022_households_form_a.sql");
// Face C: Issuance — certificate control numbers + issuance-register fields.
const MIGRATION_023: &str = include_str!("sql/023_issuance_control_numbers.sql");
// Face C: seeded editable KP printables (Certificate to File Action, Amicable Settlement).
const MIGRATION_024: &str = include_str!("sql/024_seed_kp_templates.sql");
// Face D: seeded editable RBI Form C (semestral summary). Counts are injected as
// {{count:*}} variables so the wording/layout stays user-editable (Principle 4).
const MIGRATION_025: &str = include_str!("sql/025_seed_rbi_form_c.sql");
// Face H (P1): business permit / clearance validity + renewal tracking.
const MIGRATION_026: &str = include_str!("sql/026_business_permits.sql");
// Face F (P1): BORIS — repository of barangay ordinances, resolutions, executive orders.
const MIGRATION_027: &str = include_str!("sql/027_boris_issuances.sql");
// Face G (P1): Blotter / incident registry + VAW desk, and KP stage/nature on cases.
const MIGRATION_028: &str = include_str!("sql/028_blotter_vaw_kp.sql");
// Fix template page-scoping: templates seeded in migrations 006/007 predate the
// pages_json column, so they defaulted to NULL = visible on EVERY page (e.g. the
// "Business Clearance" template appearing on the Deceased page). Scope each seeded
// default to the pages where it belongs. Guarded by "pages_json IS NULL" so any
// template a user has already scoped in the Templates page is left untouched.
const MIGRATION_029: &str = include_str!("sql/029_fix_template_page_scoping.sql");
// Face J (P2): remaining BIMS subsystems as records modules.
// BAMS (assets), BFMS (finance), BDP (development plan), BGADPBMS (GAD),
// BDRIS (disaster), BBI (barangay-based institutions).
const MIGRATION_030: &str = include_str!("sql/030_p2_governance_modules.sql");

/// Inline migrations in apply order. Names must stay identical to the Electron
/// build's `_migrations` rows.
const ALL_INLINE: &[(&str, &str)] = &[
    ("001_initial.sql", MIGRATION_001),
    ("002_seed_admin.sql", MIGRATION_002),
    ("003_partners_officials_purok.sql", MIGRATION_003),
    ("004_parents.sql", MIGRATION_004),
    ("005_new_tables_and_fields.sql", MIGRATION_005),
    ("006_seed_templates.sql", MIGRATION_006),
    ("007_bisaya_templates.sql", MIGRATION_007),
    ("008_indexes.sql", MIGRATION_008),
    ("009_death_date.sql", MIGRATION_009),
    ("010_template_paper.sql", MIGRATION_010),
    ("011_case_parties.sql", MIGRATION_011),
    ("012_case_documents.sql", MIGRATION_012),
    ("013_issues_businesses_template_pages.sql", MIGRATION_013),
    ("014_business_documents.sql", MIGRATION_014),
    ("015_resident_uid.sql", MIGRATION_015),
    ("016_pwd.sql", MIGRATION_016),
    ("017_api_clients_provenance.sql", MIGRATION_017),
    ("018_row_version.sql", MIGRATION_018),
    ("019_app_users_roles.sql", MIGRATION_019),
    ("020_rbi_birth_place.sql", MIGRATION_020),
    ("021_rbi_sectoral_fields.sql", MIGRATION_021),
    ("022_households_form_a.sql", MIGRATION_022),
    ("023_issuance_control_numbers.sql", MIGRATION_023),
    ("024_seed_kp_templates.sql", MIGRATION_024),
    ("025_seed_rbi_form_c.sql", MIGRATION_025),
    ("026_business_permits.sql", MIGRATION_026),
    ("027_boris_issuances.sql", MIGRATION_027),
    ("028_blotter_vaw_kp.sql", MIGRATION_028),
    ("029_fix_template_page_scoping.sql", MIGRATION_029),
    ("030_p2_governance_modules.sql", MIGRATION_030),
    // ─── Add future migrations here ────────────────────────────────────
];

// ─── Auto-backup before running new migrations ─────────────────────────────
// Keeps up to 5 pre-upgrade backups in userData/upgrade-backups/
fn backup_before_migration(db_path: &Path) {
    let result = (|| -> Result<std::path::PathBuf> {
        let backup_dir = crate::utils::paths::user_data().join("upgrade-backups");
        fs::create_dir_all(&backup_dir)?;

        // `new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)`
        let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H-%M-%S").to_string();
        let backup_path = backup_dir.join(format!("barangay-pre-upgrade-{timestamp}.db"));
        fs::copy(db_path, &backup_path)?;

        // Prune: keep only the 5 most recent backups
        let mut backups: Vec<String> = fs::read_dir(&backup_dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|f| f.starts_with("barangay-pre-upgrade-") && f.ends_with(".db"))
            .collect();
        backups.sort();
        backups.reverse();
        for old in backups.iter().skip(5) {
            fs::remove_file(backup_dir.join(old))?;
        }
        Ok(backup_path)
    })();

    match result {
        Ok(backup_path) => println!("[migrations] Pre-upgrade backup saved: {}", backup_path.display()),
        Err(err) => {
            eprintln!("[migrations] Could not create pre-upgrade backup: {err}");
            // Non-fatal — continue with migration anyway
        }
    }
}

/// Pre-upgrade backup of the on-disk database. The TS always backed up
/// `<userData>/barangay.db`; an in-memory / temp connection (tests) has no
/// such file, so skip it there.
fn backup_if_file_backed(conn: &Connection) {
    match conn.path() {
        Some(p) if !p.is_empty() => backup_before_migration(&crate::db::database_path()),
        _ => {}
    }
}

/// `reseedTemplates()` — re-run the template seed migrations.
pub fn reseed_templates(conn: &Connection) -> Result<()> {
    conn.execute_batch(MIGRATION_006)?;
    conn.execute_batch(MIGRATION_007)?;
    Ok(())
}

/// `runMigrations(db)`. The Electron build only used a `migrations/` .sql
/// directory when one existed next to the compiled code; the shipped app never
/// had it, so this always takes the inline path (what real users ran).
pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Create migrations tracking table
    conn.execute_batch(
        "
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  ",
    )?;

    run_inline_migrations(conn)
}

fn run_inline_migrations(conn: &Connection) -> Result<()> {
    let applied: std::collections::HashSet<String> = {
        let mut stmt = conn.prepare("SELECT name FROM _migrations")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<_>>()?
    };

    let pending: Vec<&(&str, &str)> = ALL_INLINE.iter().filter(|(name, _)| !applied.contains(*name)).collect();
    if pending.is_empty() {
        return Ok(());
    }

    // Auto-backup before applying new migrations
    backup_if_file_backed(conn);
    println!("[migrations] Applying {} new inline migration(s)...", pending.len());

    for (name, sql) in pending {
        let res = crate::db::transaction(conn, |c| {
            c.execute_batch(sql)?;
            c.execute("INSERT INTO _migrations (name) VALUES (?)", [name])?;
            Ok(())
        });
        match res {
            Ok(()) => println!("[migrations] ✓ Applied: {name}"),
            Err(err) => {
                eprintln!("[migrations] ✗ Failed on: {name} {err}");
                return Err(anyhow!(
                    "Database upgrade failed at migration \"{name}\". \
                     A backup was saved to upgrade-backups/ in your app data folder. \
                     Please contact support. Error: {err}"
                ));
            }
        }
    }

    println!("[migrations] All inline migrations applied successfully.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?",
            [name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    }

    #[test]
    fn migrations_apply_once_and_are_idempotent() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.pragma_update(None, "foreign_keys", "ON").expect("pragma");

        run_migrations(&conn).expect("first run");
        let applied: i64 = conn.query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0)).expect("count");
        assert_eq!(applied as usize, ALL_INLINE.len());

        // Second run must be a no-op.
        run_migrations(&conn).expect("second run");
        let applied2: i64 = conn.query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0)).expect("count");
        assert_eq!(applied, applied2);

        for t in ["users", "residents", "settings", "report_templates", "households", "cases", "businesses", "issuances", "blotter", "assets", "app_roles"] {
            assert!(table_exists(&conn, t), "missing table {t}");
        }

        let templates: i64 = conn.query_row("SELECT COUNT(*) FROM report_templates", [], |r| r.get(0)).expect("count");
        assert!(templates >= 16, "expected seeded templates, got {templates}");
        let admin: i64 =
            conn.query_row("SELECT COUNT(*) FROM users WHERE username = 'admin'", [], |r| r.get(0)).expect("count");
        assert_eq!(admin, 1);

        // reseed_templates is INSERT OR IGNORE-based and must not fail on a migrated DB.
        reseed_templates(&conn).expect("reseed");
    }

    #[test]
    fn migration_names_are_unique_and_ordered() {
        let names: Vec<&str> = ALL_INLINE.iter().map(|(n, _)| *n).collect();
        let mut sorted = names.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(names, sorted);
    }
}
