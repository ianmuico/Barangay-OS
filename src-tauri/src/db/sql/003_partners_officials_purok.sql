
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
