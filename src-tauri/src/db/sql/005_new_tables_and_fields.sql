
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
