
-- Multiple complainants/respondents per case. The legacy single-party columns
-- on cases are kept in sync (first party of each role) for backward compatibility.
CREATE TABLE IF NOT EXISTS case_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('complainant', 'respondent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_parties_case ON case_parties(case_id);

-- Backfill from the existing single-party columns
INSERT INTO case_parties (case_id, resident_id, role)
  SELECT id, complainant_id, 'complainant' FROM cases WHERE complainant_id IS NOT NULL;
INSERT INTO case_parties (case_id, resident_id, role)
  SELECT id, respondent_id, 'respondent' FROM cases WHERE respondent_id IS NOT NULL;
