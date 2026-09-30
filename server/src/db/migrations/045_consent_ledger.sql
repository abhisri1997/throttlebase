-- 045_consent_ledger.sql
-- Purpose-based consent and the 18+ declaration (launch readiness E6,
-- decision D3, docs/launch-readiness/plans/consent.md).
--
--   * consent_purposes: what a rider can be asked to consent to.
--   * consent_notices: every notice version shown, with a hash of its exact
--     text, so what a rider agreed to can be proved later (DPDP s.6(10)).
--   * consent_events: append-only history of grants and withdrawals. A
--     trigger refuses UPDATE, and refuses DELETE unless the retention purge
--     says so for its own transaction (SET LOCAL
--     throttlebase.purging_consent_events = 'on').
--   * consent_state: the current answer per rider and purpose, written in
--     the same transaction as the event that changes it.
--   * rider_declarations: attestations such as "I am 18 or older". Not
--     consents: they are answers, not permissions, and cannot be withdrawn.
--
-- rider_consents (023) is unchanged: it stays the record of Terms and
-- Privacy Policy acceptance.
--
-- Additive: new tables only. Rollback: drop the five tables and the function.

CREATE TABLE IF NOT EXISTS consent_purposes (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  -- Features that need this purpose. Documentation; enforced in code.
  required_for TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO consent_purposes (code, description, required_for) VALUES
  ('ride_recording', 'Keep the route of each ride the rider records.', ARRAY['ride history', 'ride stats', 'routes from rides']),
  ('live_location_sharing', 'Share the rider''s live position with the others on a ride while it is under way.', ARRAY['live rides', 'navigation with the group', 'Alert my group']),
  ('motion_activity', 'Use the phone''s motion sensors to tell riding from stopping.', ARRAY['stop detection', 'ride stats']),
  ('public_profile', 'Show the rider''s profile and ride summaries to people who are not their followers.', ARRAY['public profile', 'leaderboards']),
  ('marketing_notifications', 'Send news and offers about ThrottleBase.', ARRAY['marketing messages'])
ON CONFLICT (code) DO UPDATE
  SET description = EXCLUDED.description, required_for = EXCLUDED.required_for;

CREATE TABLE IF NOT EXISTS consent_notices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose_code TEXT NOT NULL REFERENCES consent_purposes(code),
  version      TEXT NOT NULL,
  locale       TEXT NOT NULL DEFAULT 'en-IN',
  body_sha256  TEXT NOT NULL,
  -- The exact text shown, kept so it can be produced as evidence.
  body         TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at   TIMESTAMPTZ,
  UNIQUE (purpose_code, version, locale)
);

CREATE TABLE IF NOT EXISTS consent_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No cascade: the tombstone riders row outlives account deletion (D1),
  -- and the proof must outlive the account.
  rider_id     UUID NOT NULL REFERENCES riders(id),
  purpose_code TEXT NOT NULL REFERENCES consent_purposes(code),
  notice_id    UUID NOT NULL REFERENCES consent_notices(id),
  action       TEXT NOT NULL CHECK (action IN ('granted', 'withdrawn')),
  source       TEXT NOT NULL CHECK (source IN ('onboarding', 'contextual', 'settings', 'consent_manager', 'system')),
  app_version  TEXT,
  platform     TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_events_rider
  ON consent_events (rider_id, purpose_code, occurred_at DESC);

CREATE OR REPLACE FUNCTION consent_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('throttlebase.purging_consent_events', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'consent_events is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS consent_events_append_only ON consent_events;
CREATE TRIGGER consent_events_append_only
  BEFORE UPDATE OR DELETE ON consent_events
  FOR EACH ROW EXECUTE FUNCTION consent_events_append_only();

CREATE TABLE IF NOT EXISTS consent_state (
  rider_id     UUID NOT NULL REFERENCES riders(id),
  purpose_code TEXT NOT NULL REFERENCES consent_purposes(code),
  granted      BOOLEAN NOT NULL,
  notice_id    UUID NOT NULL REFERENCES consent_notices(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rider_id, purpose_code)
);

CREATE TABLE IF NOT EXISTS rider_declarations (
  -- Sequential, so the latest answer is well defined even within one instant.
  id          BIGSERIAL PRIMARY KEY,
  rider_id    UUID NOT NULL REFERENCES riders(id),
  kind        TEXT NOT NULL CHECK (kind IN ('age_18_plus')),
  answer      BOOLEAN NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('onboarding', 'settings', 'support')),
  app_version TEXT,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_declarations_rider
  ON rider_declarations (rider_id, kind, declared_at DESC);

-- Same transitional policy as every other table (028); access is scoped in
-- the service layer until per-rider policies land (D5).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['consent_purposes', 'consent_notices', 'consent_events', 'consent_state', 'rider_declarations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
      EXECUTE format('DROP POLICY IF EXISTS app_transitional_all ON %I', t);
      EXECUTE format('CREATE POLICY app_transitional_all ON %I FOR ALL TO throttlebase_app USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
