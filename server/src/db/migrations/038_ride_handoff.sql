-- 038_ride_handoff.sql
-- A ride passes to the next leader when its captain leaves ThrottleBase.
--
--   * ride_participants.promoted_at — when a rider was made co-captain. The
--     co-captain appointed first takes over a ride whose captain leaves;
--     co-captains appointed before this column existed count from when they
--     joined.
--
--   * rides.current_rider_count is recounted from confirmed participants.
--     It was only ever incremented, so it drifted above the real number;
--     from now on the code sets it from the participants every time they
--     change.
--
-- Changes data: the recount rewrites current_rider_count on rides where it
-- is wrong. It is a derived counter, recomputable at any time from
-- ride_participants, so nothing is lost.
-- Rollback: drop the column. The recount needs no rollback.

ALTER TABLE ride_participants
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

UPDATE rides r
   SET current_rider_count = counted.riders
  FROM (
    SELECT r2.id, count(p.id)::int AS riders
      FROM rides r2
      LEFT JOIN ride_participants p ON p.ride_id = r2.id AND p.status = 'confirmed'
     GROUP BY r2.id
  ) counted
 WHERE counted.id = r.id
   AND r.current_rider_count IS DISTINCT FROM counted.riders;
