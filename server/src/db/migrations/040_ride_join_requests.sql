-- 040_ride_join_requests.sql
-- Rides that need approval (visibility 'private') show on Discover, and
-- riders ask to join them; the captain or a co-captain accepts or declines.
--
--   * ride_participants.requested_at — when the rider last asked. Leaders
--     see the oldest request first.
--
--   * ride_participants.decline_count — how often a leader has declined
--     this rider for this ride. A declined rider may ask once more, in case
--     the leader declined by mistake; after the second decline they can't.
--     Kept when a rider cancels a request, so cancelling doesn't reset it.
--
--   * An index over pending requests, which the ride page reads for its
--     leaders.
--
-- Additive only; changes no data.
-- Rollback: drop the index and both columns.

ALTER TABLE ride_participants
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decline_count SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ride_participants_pending_requests
  ON ride_participants (ride_id, requested_at)
  WHERE status = 'requested';
