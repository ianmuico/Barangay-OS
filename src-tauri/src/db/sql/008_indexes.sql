
-- Performance indexes for frequently filtered/searched columns
CREATE INDEX IF NOT EXISTS idx_residents_birth_date ON residents(birth_date);
CREATE INDEX IF NOT EXISTS idx_residents_purok ON residents(purok);
CREATE INDEX IF NOT EXISTS idx_residents_is_indigent ON residents(is_indigent);
CREATE INDEX IF NOT EXISTS idx_residents_is_4ps ON residents(is_4ps);
CREATE INDEX IF NOT EXISTS idx_residents_status ON residents(status);
CREATE INDEX IF NOT EXISTS idx_residents_gender ON residents(gender);
CREATE INDEX IF NOT EXISTS idx_residents_civil_status ON residents(civil_status);
CREATE INDEX IF NOT EXISTS idx_residents_last_name ON residents(last_name);
CREATE INDEX IF NOT EXISTS idx_residents_import_batch ON residents(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_summons_case_id ON summons(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_officials_is_active ON officials(is_active);
