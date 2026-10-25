
CREATE TABLE IF NOT EXISTS cert_sequences (
  doc_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);
ALTER TABLE generated_reports ADD COLUMN control_number TEXT;
ALTER TABLE generated_reports ADD COLUMN purpose TEXT;
ALTER TABLE generated_reports ADD COLUMN fee REAL;
ALTER TABLE generated_reports ADD COLUMN or_number TEXT;
ALTER TABLE generated_reports ADD COLUMN released_to TEXT;
ALTER TABLE generated_reports ADD COLUMN voided INTEGER NOT NULL DEFAULT 0;
