
CREATE TABLE IF NOT EXISTS blotter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blotter_uid TEXT,
  entry_no TEXT,
  category TEXT NOT NULL DEFAULT 'incident',
  incident_date TEXT,
  incident_time TEXT,
  location TEXT,
  reported_by TEXT,
  respondent TEXT,
  narrative TEXT,
  action_taken TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  is_vawc INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE cases ADD COLUMN nature TEXT;
ALTER TABLE cases ADD COLUMN kp_stage TEXT;
