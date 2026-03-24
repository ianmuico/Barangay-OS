import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

// ─── Auto-backup before running new migrations ─────────────────────────────
// Keeps up to 5 pre-upgrade backups in userData/upgrade-backups/
function backupBeforeMigration(dbPath: string): void {
  try {
    const backupDir = path.join(app.getPath('userData'), 'upgrade-backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupDir, `barangay-pre-upgrade-${timestamp}.db`);
    fs.copyFileSync(dbPath, backupPath);

    // Prune: keep only the 5 most recent backups
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('barangay-pre-upgrade-') && f.endsWith('.db'))
      .sort()
      .reverse();
    for (const old of backups.slice(5)) {
      fs.unlinkSync(path.join(backupDir, old));
    }

    console.log(`[migrations] Pre-upgrade backup saved: ${backupPath}`);
  } catch (err) {
    console.error('[migrations] Could not create pre-upgrade backup:', err);
    // Non-fatal — continue with migration anyway
  }
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'barangay.db');

  // Ensure photos directories exist
  const photosDir = path.join(userDataPath, 'photos');
  const avatarsDir = path.join(userDataPath, 'avatars');
  fs.mkdirSync(photosDir, { recursive: true });
  fs.mkdirSync(avatarsDir, { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'barangay.db');
}

function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, '../database/migrations');
  // In production, migrations are in the dist folder structure
  const prodMigrationsDir = path.join(__dirname, 'migrations');

  let migrationPath = migrationsDir;
  if (!fs.existsSync(migrationsDir)) {
    if (fs.existsSync(prodMigrationsDir)) {
      migrationPath = prodMigrationsDir;
    } else {
      // Create the directory and run inline migrations
      runInlineMigrations(db);
      return;
    }
  }

  // Read and sort migration files
  const files = fs.readdirSync(migrationPath)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all()
      .map((row: any) => row.name)
  );

  const pending = files.filter(f => !applied.has(f));
  if (pending.length === 0) return; // Nothing new — skip backup

  // Auto-backup before applying any new migrations
  const dbPath = path.join(app.getPath('userData'), 'barangay.db');
  backupBeforeMigration(dbPath);
  console.log(`[migrations] Applying ${pending.length} new migration(s)...`);

  const insertMigration = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationPath, file), 'utf-8');
    try {
      const transaction = db.transaction(() => {
        db!.exec(sql);
        insertMigration.run(file);
      });
      transaction();
      console.log(`[migrations] ✓ Applied: ${file}`);
    } catch (err) {
      console.error(`[migrations] ✗ Failed on: ${file}`, err);
      // Throw so the app knows DB is in a bad state
      throw new Error(
        `Database upgrade failed at migration "${file}". ` +
        `A backup was saved to upgrade-backups/ in your app data folder. ` +
        `Please contact support. Error: ${err}`
      );
    }
  }

  console.log('[migrations] All migrations applied successfully.');
}

function runInlineMigrations(db: Database.Database): void {
  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all()
      .map((row: any) => row.name)
  );

  const allInline: Array<{ name: string; sql: string }> = [
    { name: '001_initial.sql',                     sql: MIGRATION_001 },
    { name: '002_seed_admin.sql',                  sql: MIGRATION_002 },
    { name: '003_partners_officials_purok.sql',    sql: MIGRATION_003 },
    { name: '004_parents.sql',                     sql: MIGRATION_004 },
    // ─── Add future migrations here ────────────────────────────────────
    // { name: '005_certificates.sql', sql: MIGRATION_005 },
    // { name: '006_new_feature.sql',  sql: MIGRATION_006 },
  ];

  const pending = allInline.filter(m => !applied.has(m.name));
  if (pending.length === 0) return;

  // Auto-backup before applying new migrations
  const dbPath = path.join(app.getPath('userData'), 'barangay.db');
  backupBeforeMigration(dbPath);
  console.log(`[migrations] Applying ${pending.length} new inline migration(s)...`);

  const insertMigration = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const { name, sql } of pending) {
    try {
      const transaction = db.transaction(() => {
        db!.exec(sql);
        insertMigration.run(name);
      });
      transaction();
      console.log(`[migrations] ✓ Applied: ${name}`);
    } catch (err) {
      console.error(`[migrations] ✗ Failed on: ${name}`, err);
      throw new Error(
        `Database upgrade failed at migration "${name}". ` +
        `A backup was saved to upgrade-backups/ in your app data folder. ` +
        `Please contact support. Error: ${err}`
      );
    }
  }

  console.log('[migrations] All inline migrations applied successfully.');
}

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
  full_name TEXT,
  avatar_path TEXT,
  preferences_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_number TEXT UNIQUE,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  birth_date TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('Male', 'Female')),
  civil_status TEXT NOT NULL DEFAULT 'Single' CHECK(civil_status IN ('Single', 'Married', 'Widowed', 'Separated', 'Divorced')),
  address TEXT NOT NULL,
  contact_number TEXT,
  email TEXT,
  occupation TEXT,
  is_indigent INTEGER NOT NULL DEFAULT 0,
  voter_status TEXT DEFAULT 'Not Registered' CHECK(voter_status IN ('Registered', 'Not Registered')),
  blood_type TEXT,
  photo_path TEXT,
  household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  variables_json TEXT DEFAULT '[]',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE SET NULL,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  content_html TEXT NOT NULL,
  generated_by INTEGER REFERENCES users(id),
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('barangay_name', 'Barangay');
INSERT OR IGNORE INTO settings (key, value) VALUES ('barangay_address', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('municipality', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('province', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
INSERT OR IGNORE INTO settings (key, value) VALUES ('api_port', '3001');
INSERT OR IGNORE INTO settings (key, value) VALUES ('api_key', '');
`;

// Default admin password: "admin123"
const MIGRATION_002 = `
INSERT OR IGNORE INTO users (username, password_hash, role, full_name)
VALUES ('admin', '$2a$10$St8I7aX6OpROa4FWIuZBFetxvqEbeP23sKNQjf3mC8Pkoqc8cjphm', 'admin', 'System Administrator');
`;

const MIGRATION_003 = `
-- Add partner_id to residents for spouse/partner linking
ALTER TABLE residents ADD COLUMN partner_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;

-- Add purok column (address stays for backward compat)
ALTER TABLE residents ADD COLUMN purok TEXT;

-- Officials table
CREATE TABLE IF NOT EXISTS officials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  position TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add report template watermark/logo support
ALTER TABLE report_templates ADD COLUMN watermark_path TEXT;

-- Add number_of_puroks setting
INSERT OR IGNORE INTO settings (key, value) VALUES ('number_of_puroks', '7');
`;

const MIGRATION_004 = `
-- Add mother and father references to residents
ALTER TABLE residents ADD COLUMN mother_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;
ALTER TABLE residents ADD COLUMN father_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;
`;
