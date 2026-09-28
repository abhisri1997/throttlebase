-- 035_route_road_feedback.sql
-- "Was the road as described?" — asked of riders once a ride that followed a
-- saved route's road is over, so the next rider can trust (or doubt) what
-- the route's highlights say.
--
--   * as_described — the rider's yes or "not quite".
--   * reasons      — what was different, only when it was not as described.
--   * note         — optional, a line or two.
--
-- One answer per rider per ride; a rider can change theirs. The answer stays
-- with the route: deleting the ride leaves it, deleting the route removes it.

CREATE TABLE IF NOT EXISTS route_road_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id     UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  ride_id      UUID REFERENCES rides(id) ON DELETE SET NULL,
  rider_id     UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  as_described BOOLEAN NOT NULL,
  reasons      TEXT[] NOT NULL DEFAULT '{}',
  note         VARCHAR(280),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ride_id, rider_id)
);

ALTER TABLE route_road_feedback DROP CONSTRAINT IF EXISTS route_road_feedback_reasons_known;
ALTER TABLE route_road_feedback
  ADD CONSTRAINT route_road_feedback_reasons_known
  CHECK (reasons <@ ARRAY[
    'rough_surface', 'heavy_traffic', 'road_works',
    'not_scenic', 'poorly_lit', 'harder_than_described'
  ]::TEXT[]);

-- "As described" with reasons it wasn't would read as a contradiction.
ALTER TABLE route_road_feedback DROP CONSTRAINT IF EXISTS route_road_feedback_reasons_only_when_not;
ALTER TABLE route_road_feedback
  ADD CONSTRAINT route_road_feedback_reasons_only_when_not
  CHECK (NOT as_described OR cardinality(reasons) = 0);

CREATE INDEX IF NOT EXISTS idx_route_road_feedback_route ON route_road_feedback (route_id);

-- Same transitional policy as every other table (028); access is scoped in
-- the service layer until per-rider policies land.
ALTER TABLE route_road_feedback ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
    DROP POLICY IF EXISTS app_transitional_all ON route_road_feedback;
    CREATE POLICY app_transitional_all ON route_road_feedback FOR ALL TO throttlebase_app
      USING (true) WITH CHECK (true);
  END IF;
END $$;
