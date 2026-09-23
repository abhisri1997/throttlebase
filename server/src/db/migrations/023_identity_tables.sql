-- 023_identity_tables.sql
-- Description: Federated identities, roles and consent records.
--              Non-destructive: adds tables and backfills roles.

-- One row per (provider, subject) the rider has proved control of.
-- The composite primary key is what makes concurrent first sign-in safe:
-- two devices racing to create the same account collide here, and the loser
-- rolls back and retries as a login.
CREATE TABLE IF NOT EXISTS rider_identities (
    provider   TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'email')),
    subject    TEXT NOT NULL,
    rider_id   UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_rider_identities_rider ON rider_identities(rider_id);

-- Roles replace the boolean is_admin flag, so a second role costs a row
-- rather than a column and a migration.
CREATE TABLE IF NOT EXISTS rider_roles (
    rider_id   UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('admin', 'support')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rider_id, role)
);

-- Which version of the legal documents a rider accepted, and when.
-- Append-only: a later acceptance adds a row rather than overwriting one.
CREATE TABLE IF NOT EXISTS rider_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id        UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    terms_version   TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip              INET
);

CREATE INDEX IF NOT EXISTS idx_rider_consents_rider
    ON rider_consents(rider_id, accepted_at DESC);

-- Carry existing admins across before 024 drops the column.
INSERT INTO rider_roles (rider_id, role)
SELECT id, 'admin' FROM riders WHERE is_admin = true
ON CONFLICT DO NOTHING;
