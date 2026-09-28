-- 036_sample_motion_activity.sql
-- What the phone's motion sensors said the rider was doing at each recorded
-- fix, so stop detection can tell a rider who got off (walking) from one
-- sitting on the bike in a standstill jam (automotive, cycling) — which GPS
-- alone cannot.
--
--   * activity — the dominant reading when the fix was sent, or NULL when the
--                phone had no recent one (the sensors only report while the
--                app is open, and a rider may not grant motion access).
--                "unknown" readings are never sent.

ALTER TABLE ride_live_location_samples
  ADD COLUMN IF NOT EXISTS activity TEXT;

ALTER TABLE ride_live_location_samples DROP CONSTRAINT IF EXISTS ride_live_location_samples_activity_known;
ALTER TABLE ride_live_location_samples
  ADD CONSTRAINT ride_live_location_samples_activity_known
  CHECK (activity IS NULL OR activity IN ('automotive', 'cycling', 'walking', 'running', 'stationary'));
