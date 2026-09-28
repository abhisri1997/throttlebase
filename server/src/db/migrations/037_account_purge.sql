-- 037_account_purge.sql
-- A deleted account is purged, not hard-deleted.
--
--   * purged_at — set when the account purge has removed the rider's own
--                 data. The riders row itself stays as an empty tombstone:
--                 rides they captained, incidents, stops they requested and
--                 other shared records still reference it.
--
--   * rides.captain_id and groups.created_by become ON DELETE RESTRICT.
--     With CASCADE, deleting a rider row silently removed every ride they
--     captained (and every group they created) together with the other
--     riders' participation, tracks and stats. RESTRICT makes that
--     impossible: a rider row that still captains a ride cannot be deleted.
--
-- Non-destructive: adds a nullable column and an index, and swaps the two
-- constraints' delete action. No row is changed.
-- Rollback: drop the index and column, and re-add both constraints with
-- ON DELETE CASCADE.

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

-- The purge sweep: deleted accounts not yet purged.
CREATE INDEX IF NOT EXISTS idx_riders_purge_due
  ON riders (deleted_at)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_captain_id_fkey;
ALTER TABLE rides
  ADD CONSTRAINT rides_captain_id_fkey
  FOREIGN KEY (captain_id) REFERENCES riders(id) ON DELETE RESTRICT;

ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_created_by_fkey;
ALTER TABLE groups
  ADD CONSTRAINT groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES riders(id) ON DELETE RESTRICT;
