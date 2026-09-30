-- 044_report_grievances.sql
-- Every report is also a grievance under the IT Rules 2021, Rule 3(2):
-- acknowledged within 24 hours and resolved within the set time (launch
-- readiness E3, docs/launch-readiness/plans/ugc-safety.md).
--
--   * acknowledged_at: when the reporter was told we have it. The app
--     acknowledges at once, with a reference, so this is set on receipt.
--   * resolve_due_at: when it must be resolved by. 7 days, or 72 hours
--     for sexual content (core/moderation/grievance.ts). ⚖️
--
-- Changes data: existing reports get acknowledged_at = created_at (the app
-- confirmed each one when it was sent) and a resolve_due_at from their
-- reason. Both columns are new, so nothing that was there changes.
-- Rollback: drop the two columns.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolve_due_at  TIMESTAMPTZ;

UPDATE reports
   SET acknowledged_at = COALESCE(acknowledged_at, created_at),
       resolve_due_at  = COALESCE(
         resolve_due_at,
         created_at + CASE WHEN reason = 'sexual' THEN interval '72 hours' ELSE interval '7 days' END
       );

-- The queue is worked in order of what is due first.
CREATE INDEX IF NOT EXISTS reports_open_due
  ON reports (resolve_due_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS reports_by_reporter
  ON reports (reporter_id, created_at DESC);
