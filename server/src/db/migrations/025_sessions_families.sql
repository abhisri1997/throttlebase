-- 025_sessions_families.sql
-- Description: Reworks sessions into rotating refresh-token families.
--
-- DESTRUCTIVE. Empties sessions (9 rows in production, all belonging to the
--    2 test accounts). The existing rows cannot be carried over: they hold
--    bcrypt digests of a throwaway UUID that was never a usable refresh
--    token, and they have no family. Everyone signs in again.

DELETE FROM sessions;

ALTER TABLE sessions
    -- Groups every rotation of one login. Presenting a token that has already
    -- been rotated away revokes the whole family, which is what makes a
    -- stolen refresh token detectable rather than merely long-lived.
    ADD COLUMN IF NOT EXISTS family_id    UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS replaced_by  UUID REFERENCES sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS user_agent   TEXT;

-- device_info held the user agent; user_agent says so.
ALTER TABLE sessions DROP COLUMN IF EXISTS device_info;

-- Was a bcrypt digest in a VARCHAR(255); now a 64-character SHA-256 hex.
ALTER TABLE sessions ALTER COLUMN refresh_token_hash TYPE TEXT;

-- Refresh is a lookup by digest, and a digest identifies exactly one row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_refresh_hash
    ON sessions(refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_sessions_family ON sessions(family_id);

CREATE INDEX IF NOT EXISTS idx_sessions_rider_active
    ON sessions(rider_id) WHERE revoked_at IS NULL;
