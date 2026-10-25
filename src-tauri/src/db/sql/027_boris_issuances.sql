
CREATE TABLE IF NOT EXISTS issuances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issuance_uid TEXT,
  type TEXT NOT NULL DEFAULT 'ordinance',
  reference_no TEXT,
  title TEXT NOT NULL,
  date_enacted TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'enacted',
  full_text TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
