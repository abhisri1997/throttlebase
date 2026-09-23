-- 024_riders_passwordless.sql
-- Description: Removes every password and TOTP code path from riders, and
--              makes email optional so Apple private-relay sign-ups are
--              representable.
--
-- DESTRUCTIVE. Drops five columns. Verified against production before this
--    was written: 2 rider rows, both with a password_hash; 0 rows with
--    two_factor_enabled, a two_factor_secret, a totp_verified_at, or
--    is_admin = true. Migration 023 carries any admins into rider_roles
--    first, so this drops no authorisation state.

ALTER TABLE riders DROP COLUMN IF EXISTS password_hash;
ALTER TABLE riders DROP COLUMN IF EXISTS two_factor_enabled;
ALTER TABLE riders DROP COLUMN IF EXISTS two_factor_secret;
ALTER TABLE riders DROP COLUMN IF EXISTS totp_verified_at;
ALTER TABLE riders DROP COLUMN IF EXISTS is_admin;

-- A rider who signs in with an Apple private-relay address has no address we
-- can meaningfully store, so email must be nullable.
ALTER TABLE riders ALTER COLUMN email DROP NOT NULL;

-- Replace the plain unique constraint with a case-insensitive partial index:
-- addresses are compared lowercased, and NULL must not collide with NULL.
ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_riders_email_lower
    ON riders (lower(email)) WHERE email IS NOT NULL;

-- Same treatment for usernames, plus the format rule the API enforces.
-- Verified: both existing usernames already match this pattern.
ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_riders_username_lower
    ON riders (lower(username)) WHERE username IS NOT NULL;

ALTER TABLE riders DROP CONSTRAINT IF EXISTS riders_username_format;
ALTER TABLE riders ADD CONSTRAINT riders_username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
