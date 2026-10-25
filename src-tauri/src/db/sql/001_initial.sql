
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
