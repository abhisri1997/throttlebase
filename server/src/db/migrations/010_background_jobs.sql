-- Migration: 010_background_jobs.sql
-- Description: Generic background jobs table for scheduled async processing.

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    error_message TEXT,
    attempt INT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    locked_by VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_polling
    ON jobs (status, scheduled_at ASC, created_at ASC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jobs_locked_expiry
    ON jobs (locked_until)
    WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_jobs_type_created
    ON jobs (type, created_at DESC);

DROP TRIGGER IF EXISTS tr_jobs_updated_at ON jobs;
CREATE TRIGGER tr_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
