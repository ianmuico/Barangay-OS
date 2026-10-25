
-- Per-device API clients for the mobile partner app + record provenance.
-- A client can only EDIT residents it created; everyone can search and add.
CREATE TABLE IF NOT EXISTS api_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT
);
ALTER TABLE residents ADD COLUMN created_via TEXT;          -- 'desktop' | 'mobile'
ALTER TABLE residents ADD COLUMN created_by_client INTEGER; -- api_clients.id, NULL = desktop/admin key
CREATE INDEX IF NOT EXISTS idx_residents_created_by_client ON residents(created_by_client);
