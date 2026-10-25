
ALTER TABLE residents ADD COLUMN is_solo_parent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE residents ADD COLUMN is_osy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE residents ADD COLUMN is_ofw INTEGER NOT NULL DEFAULT 0;
ALTER TABLE residents ADD COLUMN is_ip INTEGER NOT NULL DEFAULT 0;
ALTER TABLE residents ADD COLUMN ethnicity TEXT;
ALTER TABLE residents ADD COLUMN labor_force_status TEXT;
ALTER TABLE residents ADD COLUMN residency_status TEXT;
ALTER TABLE residents ADD COLUMN residency_start_date TEXT;
ALTER TABLE residents ADD COLUMN disability_type TEXT;
ALTER TABLE residents ADD COLUMN pwd_id_no TEXT;
