
-- Generated case documents (case record, narrative, summons notice, custom
-- documents) are saved alongside resident certificates. title labels the doc.
ALTER TABLE generated_reports ADD COLUMN case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL;
ALTER TABLE generated_reports ADD COLUMN title TEXT;
CREATE INDEX IF NOT EXISTS idx_generated_reports_case ON generated_reports(case_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_date ON generated_reports(generated_at);
