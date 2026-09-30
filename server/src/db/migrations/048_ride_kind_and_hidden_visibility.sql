-- 048_ride_kind_and_hidden_visibility.sql
-- Ride now (docs/ride-now-ux.md §7.1).
--
--   * rides.kind: 'planned' (made with the ride form, for later) or
--     'unplanned' (Ride now: under way the moment it is made).
--   * visibility gains two hidden values: 'invite_only' (only invited riders
--     can join) and 'solo' (nobody else can). Neither is listed in Discover,
--     previewed or joinable (services/ride.service.ts, ride-join.service.ts).
--
-- Changes no data: every existing ride becomes 'planned' and keeps its
-- visibility. Rollback: drop the column and restore the old check.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'planned';

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_kind_check;
ALTER TABLE rides
  ADD CONSTRAINT rides_kind_check CHECK (kind IN ('planned', 'unplanned'));

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_visibility_check;
ALTER TABLE rides
  ADD CONSTRAINT rides_visibility_check
  CHECK (visibility IN ('public', 'private', 'invite_only', 'solo'));
