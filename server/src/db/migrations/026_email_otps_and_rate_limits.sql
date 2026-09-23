-- 026_email_otps_and_rate_limits.sql
-- Description: Storage for email sign-in codes and the Postgres rate limiter.

-- Sign-in codes. Only the digest is stored: a database disclosure must not
-- hand out usable codes.
CREATE TABLE IF NOT EXISTS email_otps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip          INET
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email_created
    ON email_otps (email, created_at DESC);

-- Partial index: lookups only ever want codes still in play.
CREATE INDEX IF NOT EXISTS idx_email_otps_open
    ON email_otps (expires_at) WHERE consumed_at IS NULL;

-- Fixed-window counters. Keyed by (bucket, subject, window_start) so a
-- concurrent increment is an upsert rather than a read-modify-write.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    bucket       TEXT NOT NULL,
    subject      TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INT NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, subject, window_start)
);

-- Supports pruning expired windows.
CREATE INDEX IF NOT EXISTS idx_rate_limit_window
    ON rate_limit_counters (window_start);
