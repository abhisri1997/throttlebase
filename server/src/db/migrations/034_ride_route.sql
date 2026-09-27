-- 034_ride_route.sql
-- A ride planned on a saved route remembers it.
--
--   * route_id        — the route the captain planned this ride on. If the
--                       route is deleted the ride stays and the link goes.
--   * route_reversed  — ridden from the route's destination back to its start.
--   * road_via        — set when the ride follows the route's road: the
--                       route's pass-through points in riding order, as
--                       [[lng, lat], ...]. Copied, not referenced, so the ride
--                       keeps its road even if the route is deleted. NULL when
--                       the ride only borrowed the route's ends and stops.
--
-- Whether a finished ride "followed the road" (and so can be asked if the road
-- was as described) is road_via IS NOT NULL.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS route_id       UUID REFERENCES routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_reversed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS road_via       JSONB;

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_road_via_is_array;
ALTER TABLE rides
  ADD CONSTRAINT rides_road_via_is_array
  CHECK (road_via IS NULL OR jsonb_typeof(road_via) = 'array');

CREATE INDEX IF NOT EXISTS idx_rides_route_id ON rides (route_id) WHERE route_id IS NOT NULL;
