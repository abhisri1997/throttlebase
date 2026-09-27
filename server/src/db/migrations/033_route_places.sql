-- 033_route_places.sql
-- What a route knows about itself, so riders can find it and read it without
-- opening it, and search can find routes near a place.
--
--   * start_name / end_name   — the area each end is in ("HSR Layout,
--                               Bengaluru"), named from the route's own first
--                               and last points when it is saved.
--   * start_point / end_point — those points, indexed for "routes near a
--                               place" search.
--   * highlights              — why the rider who saved it says it is good.
--                               The rider's opinion, never the app's claim.
--   * ridden_duration_s       — how long the ride that recorded it took.
--   * route_stops             — the ride's stops, copied when the route is
--                               saved so later edits to the ride do not change
--                               the route, each with an optional note.
--
-- Existing routes get their points from their own line. Their names are taken
-- from the ride they were saved from, when there is one.

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS start_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS end_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS start_point       GEOGRAPHY(Point, 4326),
  ADD COLUMN IF NOT EXISTS end_point         GEOGRAPHY(Point, 4326),
  ADD COLUMN IF NOT EXISTS highlights        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ridden_duration_s INT;

ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_highlights_known;
ALTER TABLE routes
  ADD CONSTRAINT routes_highlights_known
  CHECK (highlights <@ ARRAY[
    'scenic_road', 'good_surface', 'quiet', 'well_lit',
    'great_stops', 'twisties', 'night_ride_friendly', 'beginner_friendly'
  ]::TEXT[]);

CREATE INDEX IF NOT EXISTS idx_routes_start_point ON routes USING GIST (start_point);
CREATE INDEX IF NOT EXISTS idx_routes_end_point ON routes USING GIST (end_point);
CREATE INDEX IF NOT EXISTS idx_routes_highlights ON routes USING GIN (highlights);

CREATE TABLE IF NOT EXISTS route_stops (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id               UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  position               INT NOT NULL,
  name                   VARCHAR(255),
  location               GEOGRAPHY(Point, 4326) NOT NULL,
  note                   VARCHAR(280),
  distance_from_start_km NUMERIC(10, 2),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, position)
);

-- Same transitional policy as every other table (028); access is scoped in
-- the service layer until per-rider policies land.
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
    DROP POLICY IF EXISTS app_transitional_all ON route_stops;
    CREATE POLICY app_transitional_all ON route_stops FOR ALL TO throttlebase_app
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Backfill: ends from each route's own line.
UPDATE routes
SET start_point = ST_SetSRID(ST_MakePoint(
      (geojson -> 'coordinates' -> 0 ->> 0)::float8,
      (geojson -> 'coordinates' -> 0 ->> 1)::float8), 4326)::geography,
    end_point = ST_SetSRID(ST_MakePoint(
      (geojson -> 'coordinates' -> -1 ->> 0)::float8,
      (geojson -> 'coordinates' -> -1 ->> 1)::float8), 4326)::geography
WHERE start_point IS NULL
  AND jsonb_typeof(geojson -> 'coordinates') = 'array'
  AND jsonb_array_length(geojson -> 'coordinates') >= 2;

-- Backfill: names and stops from the ride a route was saved from.
UPDATE routes r
SET start_name = rd.start_point_name,
    end_name = rd.end_point_name
FROM rides rd
WHERE rd.id = r.ride_id
  AND r.start_name IS NULL
  AND r.end_name IS NULL;

INSERT INTO route_stops (route_id, position, name, location)
SELECT r.id,
       ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY rs.sequence NULLS LAST, rs.created_at),
       rs.name,
       rs.location
FROM routes r
JOIN ride_stops rs ON rs.ride_id = r.ride_id
WHERE rs.status = 'approved'
  AND rs.location IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM route_stops existing WHERE existing.route_id = r.id);
