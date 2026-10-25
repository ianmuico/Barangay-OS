
-- Resident issues (behavior flags noted by the admin, separate from KP cases)
CREATE TABLE IF NOT EXISTS resident_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_resident_issues_resident ON resident_issues(resident_id);
CREATE INDEX IF NOT EXISTS idx_resident_issues_status ON resident_issues(status);
CREATE INDEX IF NOT EXISTS idx_case_parties_resident ON case_parties(resident_id);
CREATE INDEX IF NOT EXISTS idx_cases_complainant ON cases(complainant_id);
CREATE INDEX IF NOT EXISTS idx_cases_respondent ON cases(respondent_id);

-- People from outside the barangay who own businesses/property here
CREATE TABLE IF NOT EXISTS outside_owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  suffix TEXT,
  gender TEXT,
  birth_date TEXT,
  address TEXT,
  contact_number TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Businesses operating in the barangay
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nature TEXT,
  address TEXT,
  purok TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  date_registered TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Owners: a resident OR an outside owner (multiple per business)
CREATE TABLE IF NOT EXISTS business_owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  resident_id INTEGER REFERENCES residents(id) ON DELETE CASCADE,
  outside_owner_id INTEGER REFERENCES outside_owners(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_business_owners_business ON business_owners(business_id);
CREATE INDEX IF NOT EXISTS idx_business_owners_resident ON business_owners(resident_id);
CREATE INDEX IF NOT EXISTS idx_business_owners_outside ON business_owners(outside_owner_id);

-- Template visibility: JSON array of page keys, NULL/empty = show everywhere
ALTER TABLE report_templates ADD COLUMN pages_json TEXT;
