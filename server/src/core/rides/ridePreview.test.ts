import test from "node:test";
import assert from "node:assert/strict";
import { toRidePreview } from "./ridePreview.js";

const fullRide = {
  id: "ride-1",
  captain_id: "cap-1",
  captain_name: "Asha",
  title: "Sunrise run",
  description: "Meet at my place, 12 Lake Road",
  status: "scheduled",
  visibility: "private",
  scheduled_at: "2026-10-04T01:00:00Z",
  estimated_duration_min: 180,
  max_capacity: 8,
  current_rider_count: 3,
  requirements: { min_experience: "intermediate" },
  stop_count: 2,
  start_point: "0101000020E6100000",
  start_point_name: "12 Lake Road",
  end_point_name: "Nandi Hills",
  route_geojson: { type: "LineString", coordinates: [] },
  road_via: [],
  route_id: "route-1",
  participants: [{ rider_id: "cap-1" }],
  stops: [{ id: "stop-1" }],
};

test("a preview keeps only what helps a rider decide to ask", () => {
  const preview = toRidePreview(fullRide, { status: "none", can_request: true });

  assert.deepEqual(preview, {
    id: "ride-1",
    captain_id: "cap-1",
    captain_name: "Asha",
    title: "Sunrise run",
    status: "scheduled",
    visibility: "private",
    scheduled_at: "2026-10-04T01:00:00Z",
    estimated_duration_min: 180,
    max_capacity: 8,
    current_rider_count: 3,
    requirements: { min_experience: "intermediate" },
    stop_count: 2,
    is_preview: true,
    my_request: { status: "none", can_request: true },
  });
});

test("nothing that places the ride, or its riders, reaches a preview", () => {
  const preview = toRidePreview(fullRide, { status: "none", can_request: true }) as Record<string, unknown>;
  for (const hidden of [
    "description",
    "start_point",
    "start_point_name",
    "end_point_name",
    "route_geojson",
    "road_via",
    "route_id",
    "participants",
    "stops",
  ]) {
    assert.equal(hidden in preview, false, `${hidden} must not be in a preview`);
  }
});
