
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_uid TEXT,
  item_name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  acquisition_date TEXT,
  acquisition_cost REAL,
  quantity INTEGER,
  unit TEXT,
  location TEXT,
  condition TEXT,
  custodian TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS financial_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER,
  category TEXT NOT NULL DEFAULT 'disbursement',
  account TEXT,
  description TEXT,
  amount REAL,
  entry_date TEXT,
  reference_no TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS development_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  sector TEXT,
  description TEXT,
  budget REAL,
  funding_source TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  start_date TEXT,
  target_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gad_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER,
  program TEXT NOT NULL,
  activity TEXT,
  budget_amount REAL,
  gad_amount REAL,
  status TEXT NOT NULL DEFAULT 'planned',
  accomplishment TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS disaster_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type TEXT NOT NULL DEFAULT 'hazard',
  title TEXT NOT NULL,
  record_date TEXT,
  location TEXT,
  description TEXT,
  status TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS institutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT,
  head_name TEXT,
  contact TEXT,
  members_count INTEGER,
  description TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
