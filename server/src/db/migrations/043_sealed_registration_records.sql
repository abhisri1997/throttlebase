-- 043_sealed_registration_records.sql
-- The sealed registration record (IT Rules 2021, Rule 3(1)(h);
-- plans/account-deletion.md, step 4): when a rider deletes their account,
-- the details they gave to register are kept for 180 days, sealed, and used
-- only for a lawful request.
--
--   * sealed.registration_records — one row per cancelled account. `sealed`
--     holds the record encrypted with the operator's public key
--     (adapters/crypto/sealedBox.ts); only a private key kept offline opens
--     it, so database access alone never reveals it. `key_id` names the key
--     that sealed it, so keys can be replaced. Only what the purge needs is
--     in the clear.
--   * sealed.access_log — every opening, and every legal hold set or
--     released, with who did it and why. Written before a record is opened.
--
-- Its own schema, with row security on and no policies: the app role can't
-- read either table. It seals and purges through two narrow functions, so
-- once the API connects as throttlebase_app (plans/rls-enforcement.md) it
-- can't even see the ciphertext. Until then the encryption is what protects
-- the record.
--
-- Additive only; changes no data.
-- Rollback: DROP SCHEMA sealed CASCADE (destroys any sealed records).

CREATE SCHEMA IF NOT EXISTS sealed;
REVOKE ALL ON SCHEMA sealed FROM PUBLIC;

CREATE TABLE IF NOT EXISTS sealed.registration_records (
  rider_id          UUID PRIMARY KEY,
  key_id            TEXT NOT NULL,
  sealed            JSONB NOT NULL,
  cancelled_at      TIMESTAMPTZ NOT NULL,
  purge_after       TIMESTAMPTZ NOT NULL,
  legal_hold_until  TIMESTAMPTZ,
  legal_hold_reason TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (legal_hold_until IS NULL OR legal_hold_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sealed_registration_purge_after
  ON sealed.registration_records (purge_after);

CREATE TABLE IF NOT EXISTS sealed.access_log (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL,
  action   TEXT NOT NULL CHECK (action IN ('opened', 'hold_set', 'hold_released')),
  reason   TEXT NOT NULL,
  actor    TEXT NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sealed.registration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sealed.access_log ENABLE ROW LEVEL SECURITY;

-- Sealing at deletion. Once per account: sealing again changes nothing.
CREATE OR REPLACE FUNCTION sealed.seal_registration(
  p_rider_id     UUID,
  p_key_id       TEXT,
  p_sealed       JSONB,
  p_cancelled_at TIMESTAMPTZ,
  p_purge_after  TIMESTAMPTZ
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = sealed, pg_temp
AS $$
  INSERT INTO sealed.registration_records (rider_id, key_id, sealed, cancelled_at, purge_after)
  VALUES (p_rider_id, p_key_id, p_sealed, p_cancelled_at, p_purge_after)
  ON CONFLICT (rider_id) DO NOTHING;
$$;

-- The daily purge: records past their 180 days, unless under a legal hold.
-- Returns how many went.
CREATE OR REPLACE FUNCTION sealed.purge_expired_registrations() RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = sealed, pg_temp
AS $$
  WITH purged AS (
    DELETE FROM sealed.registration_records
     WHERE purge_after < now()
       AND (legal_hold_until IS NULL OR legal_hold_until < now())
    RETURNING 1
  )
  SELECT count(*)::int FROM purged;
$$;

REVOKE ALL ON FUNCTION sealed.seal_registration(UUID, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION sealed.purge_expired_registrations() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
    GRANT USAGE ON SCHEMA sealed TO throttlebase_app;
    GRANT EXECUTE ON FUNCTION sealed.seal_registration(UUID, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) TO throttlebase_app;
    GRANT EXECUTE ON FUNCTION sealed.purge_expired_registrations() TO throttlebase_app;
  END IF;
END $$;
