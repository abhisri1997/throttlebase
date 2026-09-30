-- 043_moderation.sql
-- Acting on reports (launch readiness E3, docs/launch-readiness/plans/
-- ugc-safety.md), and the admin audit log (E10, D10).
--
--   * posts, comments and routes can be removed by a moderator: removed_at,
--     removed_by and removal_reason. Removed content is hidden from
--     everyone, kept 180 days for appeals and legal requests, then purged.
--   * riders can be suspended: suspended_at, suspended_by and
--     suspension_reason. A suspended rider can't sign in and their content
--     is hidden while the suspension lasts.
--   * security_events is the append-only audit log. This migration starts
--     it with moderation.* and admin.* events; auth events follow with the
--     logging work (plans/logging.md). metadata never holds personal data.
--
-- Additive: new nullable columns, a new table and indexes.
-- Rollback: drop the columns and the table.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS removed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by     UUID REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason TEXT;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS removed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by     UUID REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason TEXT;

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS removed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by     UUID REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason TEXT;

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by      UUID REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- The purge job looks for removed content past its 180 days.
CREATE INDEX IF NOT EXISTS posts_removed_at ON posts (removed_at) WHERE removed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_removed_at ON comments (removed_at) WHERE removed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS routes_removed_at ON routes (removed_at) WHERE removed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS riders_suspended ON riders (suspended_at) WHERE suspended_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS security_events (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who did it: the moderator or admin, or the rider themselves.
  actor_id    UUID REFERENCES riders(id) ON DELETE SET NULL,
  -- Who it was about, when that is a rider.
  subject_id  UUID REFERENCES riders(id) ON DELETE SET NULL,
  event       TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  reason      TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS security_events_occurred_at ON security_events (occurred_at);
CREATE INDEX IF NOT EXISTS security_events_subject ON security_events (subject_id, occurred_at DESC);

-- Same transitional policy as every other table (028); access is scoped in
-- the service layer until per-rider policies land.
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
    DROP POLICY IF EXISTS app_transitional_all ON security_events;
    CREATE POLICY app_transitional_all ON security_events FOR ALL TO throttlebase_app
      USING (true) WITH CHECK (true);
  END IF;
END $$;
