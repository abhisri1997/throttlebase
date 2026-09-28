import test from "node:test";
import assert from "node:assert/strict";
import {
  initialRideStops,
  isRouteStopKept,
  keepRouteStop,
  parseRideDirection,
  planDefaults,
  planRideOnRoute,
  type PlannableRoute,
} from "./planRide";
import type { PlannedStop } from "../../rides/types/stops";

const route: PlannableRoute = {
  id: "route-1",
  title: "Coffee run",
  start_name: "Bengaluru, Kengeri",
  end_name: "Sulthan Bathery, Wayanad",
  start_lat: 12.9,
  start_lng: 77.48,
  end_lat: 11.66,
  end_lng: 76.26,
  distance_km: "281.40",
  highlights: ["scenic_road"],
  stops: [
    { position: 1, name: "Mysuru", lat: 12.3, lng: 76.64, note: "Best dosa", distance_from_start_km: 146 },
    { position: 2, name: null, lat: 11.8, lng: 76.7, note: null, distance_from_start_km: "205.30" },
  ],
  road_via: [
    [77.2, 12.7],
    [76.9, 12.2],
  ],
};

test("a ride on a route starts and ends where the route does, with its stops in order", () => {
  const plan = planRideOnRoute(route, "forward")!;

  assert.equal(plan.title, "Bengaluru → Sulthan Bathery");
  assert.deepEqual(plan.start, { name: "Bengaluru, Kengeri", coords: [77.48, 12.9] });
  assert.deepEqual(plan.end, { name: "Sulthan Bathery, Wayanad", coords: [76.26, 11.66] });
  assert.deepEqual(
    plan.stops.map((stop) => [stop.name, stop.distanceKm, stop.note]),
    [
      ["Mysuru", 146, "Best dosa"],
      ["Stop 2", 205.3, null],
    ],
  );
  assert.deepEqual(plan.roadVia, route.road_via);
});

test("ridden the other way, the ends swap and the stops come in reverse, measured from the new start", () => {
  const plan = planRideOnRoute(route, "reverse")!;

  assert.equal(plan.title, "Sulthan Bathery → Bengaluru");
  assert.deepEqual(plan.start.coords, [76.26, 11.66]);
  assert.deepEqual(plan.end.coords, [77.48, 12.9]);
  assert.deepEqual(
    plan.stops.map((stop) => [stop.name, stop.distanceKm]),
    [
      ["Stop 2", 76.1],
      ["Mysuru", 135.4],
    ],
  );
});

test("ridden the other way, the road can't be followed, so Google picks it", () => {
  // The recorded points lie on the carriageway going the other way.
  const plan = planRideOnRoute({ ...route, highlights: ["scenic_road"] }, "reverse")!;

  assert.equal(plan.canFollowRoad, false);
  assert.deepEqual(plan.roadVia, []);
  assert.equal(plan.defaults.followRoad, false);
});

test("ridden the way it was recorded, the road can be followed", () => {
  const plan = planRideOnRoute(route, "forward")!;

  assert.equal(plan.canFollowRoad, true);
  assert.equal(plan.defaults.followRoad, true);
});

test("an older route without named points still plans from its line", () => {
  const plan = planRideOnRoute(
    {
      ...route,
      start_name: null,
      end_name: null,
      start_lat: null,
      start_lng: null,
      end_lat: null,
      end_lng: null,
      road_via: undefined,
      geojson: { coordinates: [[77.0, 12.9], [77.1, 12.95], [77.2, 13.0]] },
    },
    "forward",
  )!;

  assert.equal(plan.title, "Coffee run");
  assert.deepEqual(plan.start, { name: "Start", coords: [77.0, 12.9] });
  assert.deepEqual(plan.end, { name: "Destination", coords: [77.2, 13.0] });
  assert.deepEqual(plan.roadVia, []);
});

test("a route with no ends at all cannot be planned on", () => {
  assert.equal(
    planRideOnRoute({ ...route, start_lat: null, start_lng: null, geojson: null }, "forward"),
    null,
  );
});

test("a route praised for its road is followed by default; its stops are the captain's call", () => {
  assert.deepEqual(planDefaults(["scenic_road", "twisties"]), { followRoad: true, keepStops: false });
});

test("a route praised for its stops keeps them by default, on whatever road is quickest", () => {
  assert.deepEqual(planDefaults(["great_stops"]), { followRoad: false, keepStops: true });
});

test("a route praised for both, or for nothing, keeps both by default", () => {
  assert.deepEqual(planDefaults(["great_stops", "quiet"]), { followRoad: true, keepStops: true });
  assert.deepEqual(planDefaults([]), { followRoad: true, keepStops: true });
});

test("the ride starts with the route's stops only when they are kept by default", () => {
  const withStops = planRideOnRoute({ ...route, highlights: ["great_stops"] }, "forward")!;
  const roadOnly = planRideOnRoute(route, "forward")!;

  assert.deepEqual(
    initialRideStops(withStops).map((stop) => [stop.name, stop.type, stop.distance_along_route_m]),
    [
      ["Mysuru", "rest", 146000],
      ["Stop 2", "rest", 205300],
    ],
  );
  assert.deepEqual(initialRideStops(roadOnly), []);
});

test("keeping a route stop puts it in road order among the captain's own stops", () => {
  const plan = planRideOnRoute(route, "forward")!;
  const fuel: PlannedStop = { type: "fuel", location_coords: [76.9, 12.5], name: "Fuel", distance_along_route_m: 100000 };
  const lunch: PlannedStop = { type: "rest", location_coords: [76.5, 11.9], name: "Lunch", distance_along_route_m: 180000 };

  const stops = keepRouteStop([fuel, lunch], plan.stops[0]!, true);

  assert.deepEqual(stops.map((stop) => stop.name), ["Fuel", "Mysuru", "Lunch"]);
  assert.ok(isRouteStopKept(stops, plan.stops[0]!));
});

test("dropping a route stop leaves the captain's own stops alone", () => {
  const plan = planRideOnRoute(route, "forward")!;
  const fuel: PlannedStop = { type: "fuel", location_coords: [76.9, 12.5], name: "Fuel" };
  const kept = keepRouteStop([fuel], plan.stops[1]!, true);

  const stops = keepRouteStop(kept, plan.stops[1]!, false);

  assert.deepEqual(stops, [fuel]);
  assert.equal(isRouteStopKept(stops, plan.stops[1]!), false);
});

test("keeping a stop twice does not add it twice", () => {
  const plan = planRideOnRoute(route, "forward")!;
  const once = keepRouteStop([], plan.stops[0]!, true);

  assert.equal(keepRouteStop(once, plan.stops[0]!, true).length, 1);
});

test("only an explicit reverse rides a route the other way", () => {
  assert.equal(parseRideDirection("reverse"), "reverse");
  assert.equal(parseRideDirection("forward"), "forward");
  assert.equal(parseRideDirection(undefined), "forward");
  assert.equal(parseRideDirection(["reverse"]), "forward");
});
