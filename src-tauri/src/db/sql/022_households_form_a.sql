
ALTER TABLE households ADD COLUMN head_resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL;
ALTER TABLE households ADD COLUMN purok TEXT;
ALTER TABLE households ADD COLUMN housing_type TEXT;
ALTER TABLE households ADD COLUMN household_uid TEXT;
ALTER TABLE residents ADD COLUMN relationship_to_head TEXT;
