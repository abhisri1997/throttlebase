-- 046_security_log_retention_indexes.sql
-- The hourly cleanup now purges security logs by age (launch readiness E11,
-- core/retention/retentionPolicy.ts): login_activity after a year, email_otps
-- after 30 days. Neither table has an index on the column that dates a row,
-- so each purge would scan the whole table. security_events already has one
-- (security_events_occurred_at, migration 043).
--
-- Plain CREATE INDEX: migrations run in a transaction, which rules out
-- CONCURRENTLY, and both tables are small.
--
-- Changes no data. Rollback: drop the two indexes.

CREATE INDEX IF NOT EXISTS login_activity_logged_in_at
  ON login_activity (logged_in_at);

CREATE INDEX IF NOT EXISTS email_otps_created_at
  ON email_otps (created_at);
