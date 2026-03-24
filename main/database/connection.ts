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
    { name: '005_new_tables_and_fields.sql',       sql: MIGRATION_005 },
    { name: '006_seed_templates.sql',              sql: MIGRATION_006 },
    { name: '007_bisaya_templates.sql',            sql: MIGRATION_007 },
    // ─── Add future migrations here ────────────────────────────────────
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

const MIGRATION_005 = `
-- New resident fields from RBI Form 8
ALTER TABLE residents ADD COLUMN religion TEXT;
ALTER TABLE residents ADD COLUMN citizenship TEXT DEFAULT 'Filipino';
ALTER TABLE residents ADD COLUMN philsys_card_no TEXT;
ALTER TABLE residents ADD COLUMN educational_attainment TEXT;
ALTER TABLE residents ADD COLUMN is_4ps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE residents ADD COLUMN status TEXT NOT NULL DEFAULT 'living' CHECK(status IN ('living', 'deceased'));

-- Import batches for CSV import with rollback support
CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  total_imported INTEGER NOT NULL DEFAULT 0,
  total_skipped INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  imported_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'rolled_back')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link residents to import batches for rollback
ALTER TABLE residents ADD COLUMN import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL;

-- Local usage analytics events
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Barangay cases (mediation, complaints, disputes)
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number TEXT UNIQUE,
  case_type TEXT NOT NULL DEFAULT 'mediation' CHECK(case_type IN ('mediation', 'complaint', 'dispute', 'other')),
  complainant_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  respondent_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ongoing', 'resolved', 'dismissed')),
  filed_date TEXT NOT NULL DEFAULT (date('now')),
  resolved_date TEXT,
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Summons for cases
CREATE TABLE IF NOT EXISTS summons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  summoned_resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  summon_number INTEGER NOT NULL DEFAULT 1,
  summon_date TEXT NOT NULL,
  summon_time TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'served', 'appeared', 'no_show')),
  served_by_official_id INTEGER REFERENCES officials(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add language preference setting
INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'fil');
-- Add setup_completed flag
INSERT OR IGNORE INTO settings (key, value) VALUES ('setup_completed', '0');
`;

const MIGRATION_006 = `
-- Pre-built certificate templates
INSERT OR IGNORE INTO report_templates (name, content_html, variables_json) VALUES
('Barangay Clearance',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">BARANGAY CLEARANCE</h2></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, of legal age, {{civilStatus}}, Filipino citizen, and a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, is known to be of good moral character and has no derogatory record filed in this office.</p><p style="text-indent:40px;">This clearance is being issued upon the request of the above-named person for <strong>{{input:purpose}}</strong> purposes.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong> at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}',
'["fullName","civilStatus","purok","barangay","municipality","province","date"]'),

('Certificate of Residency',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">CERTIFICATE OF RESIDENCY</h2></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, {{age}} years old, {{civilStatus}}, Filipino citizen, is a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}} since <strong>{{input:since_when}}</strong>.</p><p style="text-indent:40px;">This certification is being issued upon the request of the above-named person for <strong>{{input:purpose}}</strong> purposes.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong> at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}',
'["fullName","age","civilStatus","purok","barangay","municipality","province","date"]'),

('Certificate of Indigency',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">CERTIFICATE OF INDIGENCY</h2></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, {{age}} years old, {{civilStatus}}, Filipino citizen, and a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, belongs to an indigent family in this barangay.</p><p style="text-indent:40px;">This certification is being issued upon the request of the above-named person for the medical assistance of <strong>{{input:patient_name}}</strong> for <strong>{{input:purpose}}</strong> purposes.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong> at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}',
'["fullName","age","civilStatus","purok","barangay","municipality","province","date"]'),

('Business Clearance',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">BUSINESS CLEARANCE</h2></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that the business known as <strong>{{input:business_name}}</strong> located at <strong>{{input:location}}</strong>, owned and operated by <strong>{{fullName}}</strong>, has been granted clearance to operate within the jurisdiction of this barangay.</p><p style="text-indent:40px;">The owner has complied with all barangay requirements and regulations.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong> at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}',
'["fullName","barangay","municipality","province","date"]'),

('Certification for Loan',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">CERTIFICATION</h2></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, of legal age, {{civilStatus}}, Filipino citizen, is a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}.</p><p style="text-indent:40px;">It is further certified that the above-named person is the owner/operator of <strong>{{input:business_name}}</strong> located at <strong>{{input:business_location}}</strong>.</p><p style="text-indent:40px;">This certification is being issued in connection with the loan application of the above-named person at <strong>{{input:lender}}</strong>.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong>.</p>{{signatory:punong_barangay}}',
'["fullName","civilStatus","purok","barangay","municipality","province","date"]'),

('First Time Job Seekers (RA 11261)',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">CERTIFICATION</h2><p style="font-size:10pt;">(First Time Jobseekers Assistance Act — RA 11261)</p></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, {{age}} years old, {{civilStatus}}, Filipino citizen, and a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, is a FIRST TIME JOBSEEKER and has not yet been employed.</p><p style="text-indent:40px;">This certification is valid for one (1) year from the date of issuance. Certification No.: <strong>{{input:certification_number}}</strong></p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong>.</p>{{signatory:punong_barangay}}',
'["fullName","age","civilStatus","purok","barangay","municipality","province","date"]'),

('Out of School Youth (OSY)',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">CERTIFICATION</h2><p style="font-size:10pt;">Out of School Youth</p></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, {{age}} years old, {{civilStatus}}, Filipino citizen, and a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, is an Out of School Youth (OSY) and is currently not enrolled in any educational institution.</p><p style="text-indent:40px;">This certification is being issued for whatever legal purpose it may serve.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong>.</p>{{signatory:punong_barangay}}',
'["fullName","age","civilStatus","purok","barangay","municipality","province","date"]'),

('Residence Certificate (4Ps)',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">RESIDENCE CERTIFICATE</h2><p style="font-size:10pt;">Pantawid Pamilyang Pilipino Program (4Ps)</p></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, of legal age, {{civilStatus}}, Filipino citizen, is a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, and is a beneficiary of the Pantawid Pamilyang Pilipino Program (4Ps).</p><p style="text-indent:40px;">It is further certified that <strong>{{input:minor_name}}</strong> is the child/dependent of the above-named person residing in the same address.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong>.</p>{{signatory:punong_barangay}}',
'["fullName","civilStatus","purok","barangay","municipality","province","date"]');
`;

const MIGRATION_007 = `
-- Bisaya templates for cases/summons (matching actual barangay report format)
INSERT OR IGNORE INTO report_templates (name, content_html, variables_json) VALUES
('Sumbong (Complaint)',
'{{header}}<div style="text-align:center;margin-bottom:4px;"><p style="font-size:10pt;font-weight:bold;text-decoration:underline;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p></div><div style="text-align:right;margin-bottom:12px;font-size:10pt;"><p style="margin:2px 0;">Petsa : {{input:petsa}}</p><p style="margin:2px 0;">Oras : {{input:oras}}</p><p style="margin:2px 0;">Brgy Case # : {{input:case_number}}</p><p style="margin:2px 0;">Mahistungod sa : {{input:subject}}</p></div><p><strong>{{fullName}}</strong><br/>Purok {{purok}}, Brgy. {{barangay}}<br/>{{municipality}}, {{province}}<br/><em>Nagsumbong</em></p><p style="text-align:center;margin:8px 0;">— batok —</p><p><strong>{{input:respondent_name}}</strong><br/>{{input:respondent_address}}<br/><em>Gisumbong</em></p><div style="text-align:center;margin:20px 0;"><h2 style="letter-spacing:2px;">SUMBONG</h2></div><p style="text-indent:40px;">Ako/kami nagasumbong batok sa gihisgutanang sinumbong / mga sinumbong sa ilista tungod sa paglapas sa akong/among kabtungan ug mga interes sa mga musunod nga paagi.</p><p style="text-indent:40px;">{{input:complaint_details}}</p><p style="text-indent:40px;">Ako nagatawag sa maong sinumbong may kabatasan sa akong mint van ghe gibanganan.</p><p style="text-indent:40px;">Tungod niini, ako siyang ipatawag.</p><p style="text-indent:40px;">Ako/kami nagahangyo, ang kabuhayaan ihatag kanakoamo sunata sa baluod ug / o kaangayan.</p><p style="text-indent:40px;">Gihimo ning ika-{{input:day}} bulan sa {{input:month}} {{year}}.</p><div style="text-align:right;margin-top:30px;"><p><strong>{{fullName}}</strong><br/><em>Nagsumbong</em></p></div><div style="margin-top:30px;border-top:1px solid #000;padding-top:8px;"><p style="font-weight:bold;">SHEDYUL SA HUSAY</p><p>Petsa : {{input:hearing_date}}</p><p>Oras : {{input:hearing_time}}</p></div>{{signatory:punong_barangay}}',
'["fullName","purok","barangay","municipality","province","year"]'),

('Pagtawag / Summons (Bisaya)',
'{{header}}<div style="text-align:center;margin-bottom:4px;"><p style="font-size:10pt;font-weight:bold;text-decoration:underline;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p></div><div style="text-align:right;margin-bottom:12px;font-size:10pt;"><p style="margin:2px 0;">Petsa : {{input:petsa}}</p><p style="margin:2px 0;">Oras : {{input:oras}}</p><p style="margin:2px 0;">Brgy Case # : {{input:case_number}}</p></div><div style="text-align:center;margin:20px 0;"><h2 style="letter-spacing:2px;">PAGTAWAG</h2><p style="font-size:10pt;">(Summons)</p></div><p>Ngadto kang:</p><p><strong>{{fullName}}</strong><br/>Purok {{purok}}, Brgy. {{barangay}}<br/>{{municipality}}, {{province}}</p><p style="text-indent:40px;">Ikaw gitawag sa pagpresentar sa imong kaugalingon dinhi niining buhatan sa <strong>{{input:hearing_date}}</strong> sa alas <strong>{{input:hearing_time}}</strong> aron sa paghatag og tubag sa usa ka reklamo nga gipasaka batok kanimo ni <strong>{{input:complainant_name}}</strong>.</p><p style="text-indent:40px;">Ang imong pagkapakyas sa pagpresentar mahimong hinungdan sa pagpadayon sa kaso bisan wala ikaw.</p><p style="text-indent:40px;">Gihimo ning ika-{{input:day}} bulan sa {{input:month}} {{year}}.</p>{{signatory:punong_barangay}}',
'["fullName","purok","barangay","municipality","province","year"]'),

('Minutas sa Husay (Mediation)',
'{{header}}<div style="text-align:center;margin-bottom:4px;"><p style="font-size:10pt;font-weight:bold;text-decoration:underline;">OFFICE OF THE LUPONG TAGAPAMAYAPA</p></div><div style="text-align:center;margin:20px 0;"><h2 style="letter-spacing:2px;">MINUTAS SA HUSAY</h2><p style="font-size:10pt;">(Minutes of Mediation)</p></div><div style="margin-bottom:12px;font-size:10pt;"><p>Brgy Case # : {{input:case_number}}</p><p>Petsa : {{input:petsa}}</p><p>Oras : {{input:oras}}</p></div><p><strong>Nagsumbong:</strong> {{input:complainant_name}}</p><p><strong>Gisumbong:</strong> {{input:respondent_name}}</p><p style="margin-top:16px;"><strong>Mga Saksi:</strong></p><p>{{input:witnesses}}</p><p style="margin-top:16px;"><strong>Pahayag / Testimony:</strong></p><p style="text-indent:40px;">{{input:testimony}}</p><p style="margin-top:16px;"><strong>Resolusyon / Kasabutan:</strong></p><p style="text-indent:40px;">{{input:resolution}}</p><p style="margin-top:20px;text-indent:40px;">Gihimo ning ika-{{input:day}} bulan sa {{input:month}} {{year}} sa {{barangay}}, {{municipality}}, {{province}}.</p><div style="display:flex;justify-content:space-between;margin-top:40px;"><div style="text-align:center;"><p>_________________________</p><p><em>Nagsumbong</em></p></div><div style="text-align:center;"><p>_________________________</p><p><em>Gisumbong</em></p></div></div>{{signatory:punong_barangay}}',
'["barangay","municipality","province","year"]'),

('Living Separately Certification',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">CERTIFICATION</h2><p style="font-size:10pt;">Living Separately</p></div><p>TO WHOM IT MAY CONCERN:</p><p style="text-indent:40px;">This is to certify that <strong>{{fullName}}</strong>, {{age}} years old, {{civilStatus}}, Filipino citizen, and a bonafide resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, is living separately from the following household members:</p><p style="margin-left:40px;">{{input:household_members}}</p><p style="text-indent:40px;">This certification is being issued upon the request of the above-named person for <strong>{{input:dswd_purpose}}</strong> purposes at the DSWD.</p><p style="text-indent:40px;">Issued this <strong>{{date}}</strong> at {{barangay}}, {{municipality}}, {{province}}.</p>{{signatory:punong_barangay}}',
'["fullName","age","civilStatus","purok","barangay","municipality","province","date"]'),

('Oath of Undertaking (Job Seekers)',
'{{header}}<div style="text-align:center;margin-bottom:10px;"><p style="font-size:10pt;">OFFICE OF THE SANGGUNIANG BARANGAY</p><h2 style="margin:10px 0;letter-spacing:2px;">OATH OF UNDERTAKING</h2><p style="font-size:10pt;">(First Time Jobseekers Act — RA 11261)</p></div><p>I, <strong>{{fullName}}</strong>, Filipino, of legal age, {{civilStatus}}, and a resident of Purok {{purok}}, {{barangay}}, {{municipality}}, {{province}}, after having been duly sworn in accordance with law, do hereby depose and state:</p><p style="margin-left:40px;">1. That I am a first time jobseeker and have not been previously employed.</p><p style="margin-left:40px;">2. That I am aware that under R.A. 11261, first time jobseekers are entitled to free government services related to employment applications.</p><p style="margin-left:40px;">3. That I am availing of the said benefits for the first time.</p><p style="margin-left:40px;">4. That I understand that if found guilty of any misrepresentation, I shall be subject to penalties under the said Act.</p><p style="text-indent:40px;">IN WITNESS WHEREOF, I have hereunto set my hand this <strong>{{date}}</strong> at {{barangay}}, {{municipality}}, {{province}}.</p><div style="text-align:center;margin-top:40px;"><p>_________________________</p><p><strong>{{fullName}}</strong></p><p><em>Affiant</em></p></div>{{signatory:punong_barangay}}',
'["fullName","civilStatus","purok","barangay","municipality","province","date"]');
`;
