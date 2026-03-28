-- 016_add_username_to_riders.sql
-- Description: Add unique username column to riders table

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Allow fast lookup by username (e.g. profile search, handle validation)
CREATE INDEX IF NOT EXISTS idx_riders_username ON riders(username) WHERE username IS NOT NULL;
