
-- Mobile app users + dynamic roles (separate from desktop login accounts).
-- Passwords are stored reversibly encrypted so the admin can reveal them
-- (local-first design choice). Roles carry granular permissions.
CREATE TABLE IF NOT EXISTS app_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  perm_search INTEGER NOT NULL DEFAULT 0,
  perm_read INTEGER NOT NULL DEFAULT 0,
  perm_create INTEGER NOT NULL DEFAULT 0,
  perm_delete INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  password_enc TEXT NOT NULL,
  role_id INTEGER REFERENCES app_roles(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);
-- Starter roles (admin can rename / edit / add more)
INSERT OR IGNORE INTO app_roles (name, perm_search, perm_read, perm_create, perm_delete, is_system) VALUES
  ('Administrator', 1, 1, 1, 1, 1),
  ('Encoder',       1, 1, 1, 0, 0),
  ('Purok Leader',  1, 1, 0, 0, 0);
INSERT OR IGNORE INTO settings (key, value) VALUES ('online_enabled', '1');
