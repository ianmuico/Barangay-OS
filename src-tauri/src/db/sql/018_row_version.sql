
-- Optimistic-concurrency version counter. Bumped on every resident update so
-- two people editing the same record can't silently overwrite each other.
ALTER TABLE residents ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
