
-- Generated documents can be tied to a business (clearances, permits, custom docs)
ALTER TABLE generated_reports ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_generated_reports_business ON generated_reports(business_id);
