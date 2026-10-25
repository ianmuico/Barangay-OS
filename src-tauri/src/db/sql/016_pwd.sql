
-- PWD (Persons with Disability, RA 10754) flag with an optional note
ALTER TABLE residents ADD COLUMN is_pwd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE residents ADD COLUMN pwd_note TEXT;
CREATE INDEX IF NOT EXISTS idx_residents_is_pwd ON residents(is_pwd);
