-- Migration: 017_totp_verified_at.sql
-- Description: Adds TOTP verified timestamp to riders for 2FA audit trail.

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
