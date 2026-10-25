
-- Add mother and father references to residents
ALTER TABLE residents ADD COLUMN mother_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;
ALTER TABLE residents ADD COLUMN father_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;
