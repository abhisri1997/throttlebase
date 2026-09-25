-- 032_rider_ride_progress.sql
-- Each rider's own ride, separate from the group's live session.
--
--   * ride_started_at  — when this rider's own ride began: an early start of
--                        their own, or the group rolling out. Track samples
--                        are only kept from here on.
--   * finished_at      — when this rider's ride ended. For an arrival it is the
--                        moment they reached the destination, not when they
--                        (or the auto-finish) confirmed it, so time spent at the
--                        venue adds no distance.
--   * finish_reason    — arrived | left_early | group_ended; shown to the group.
--   * arrival_armed    — the rider has been clear of the destination at least
--                        once, so a round trip does not "arrive" at the start.
--   * arrived_at       — entered the destination radius and has not left it.
--
-- Rows from before this migration keep NULLs, which read as "no cutoff": their
-- stats and history are unchanged.

ALTER TABLE ride_live_presence
  ADD COLUMN IF NOT EXISTS ride_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finish_reason   TEXT,
  ADD COLUMN IF NOT EXISTS finish_location GEOGRAPHY(Point, 4326),
  ADD COLUMN IF NOT EXISTS arrival_armed   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arrived_at      TIMESTAMPTZ;

ALTER TABLE ride_live_presence
  DROP CONSTRAINT IF EXISTS ride_live_presence_finish_reason_check;

ALTER TABLE ride_live_presence
  ADD CONSTRAINT ride_live_presence_finish_reason_check
  CHECK (
    (finished_at IS NULL AND finish_reason IS NULL)
    OR (finished_at IS NOT NULL AND finish_reason IN ('arrived', 'left_early', 'group_ended'))
  );

-- The auto-finish sweep: riders parked at the destination, not yet finished.
CREATE INDEX IF NOT EXISTS idx_ride_live_presence_awaiting_finish
  ON ride_live_presence (arrived_at)
  WHERE finished_at IS NULL AND arrived_at IS NOT NULL;

-- Ride history lookups: "rides this rider has finished".
CREATE INDEX IF NOT EXISTS idx_ride_live_presence_rider_finished
  ON ride_live_presence (rider_id)
  WHERE finished_at IS NOT NULL;
