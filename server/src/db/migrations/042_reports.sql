-- 042_reports.sql
-- Riders report posts, comments, riders, rides, routes and groups
-- (launch readiness E3, docs/launch-readiness/plans/ugc-safety.md).
--
--   * target_rider_id is who made the reported thing, resolved when the
--     report is made, so the moderation queue can group by rider and a
--     rider's reports survive their content being removed.
--   * One open report per reporter per target: reporting again while the
--     first is open changes nothing.
--   * reporter_id and target_rider_id point at riders rows, which are never
--     hard-deleted (a purged account leaves an empty placeholder), so a
--     report outlives the accounts as the grievance record it is.
--
-- Additive: a new table and its indexes. Rollback: DROP TABLE reports.

CREATE TABLE IF NOT EXISTS reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'rider', 'ride', 'route', 'group')),
  target_id       UUID NOT NULL,
  target_rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL CHECK (reason IN (
                    'spam', 'harassment', 'hate', 'sexual', 'violence',
                    'dangerous_riding', 'impersonation', 'other')),
  note            TEXT CHECK (char_length(note) <= 1000),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES riders(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reports_one_open_per_reporter
  ON reports (reporter_id, target_type, target_id)
  WHERE status = 'open';

-- The moderation queue: open reports, oldest first.
CREATE INDEX IF NOT EXISTS reports_open_queue
  ON reports (created_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS reports_by_target ON reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS reports_by_target_rider ON reports (target_rider_id);

-- Same transitional policy as every other table (028); access is scoped in
-- the service layer until per-rider policies land.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
    DROP POLICY IF EXISTS app_transitional_all ON reports;
    CREATE POLICY app_transitional_all ON reports FOR ALL TO throttlebase_app
      USING (true) WITH CHECK (true);
  END IF;
END $$;
