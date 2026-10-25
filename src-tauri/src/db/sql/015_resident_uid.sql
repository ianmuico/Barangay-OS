
-- Permanent unique ID per resident (UUID v4) — used for QR codes and the
-- mobile partner app. Never changes, survives renames and edits.
ALTER TABLE residents ADD COLUMN resident_uid TEXT;
UPDATE residents SET resident_uid =
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', (abs(random()) % 4) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6)))
WHERE resident_uid IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_uid ON residents(resident_uid);
