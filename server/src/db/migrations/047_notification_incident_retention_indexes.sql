-- 047_notification_incident_retention_indexes.sql
-- The hourly cleanup now purges by age (launch readiness E11,
-- core/retention/retentionPolicy.ts): notifications after 90 days, ride
-- incidents after 180. Their existing indexes lead with rider_id,
-- session_id or severity, so each purge would scan the whole table.
--
-- Plain CREATE INDEX: migrations run in a transaction, which rules out
-- CONCURRENTLY, and both tables are small.
--
-- Changes no data. Rollback: drop the two indexes.

CREATE INDEX IF NOT EXISTS notifications_created_at
  ON notifications (created_at);

CREATE INDEX IF NOT EXISTS ride_live_incidents_created_at
  ON ride_live_incidents (created_at);
