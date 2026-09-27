import test from "node:test";
import assert from "node:assert/strict";
import { buildRouteStops, type RideStopForRoute } from "./routeStops.js";

/** A straight route due north, ~11.1 km per 0.1° of latitude. */
const LINE: [number, number][] = [
  [77.6, 12.9],
  [77.6, 13.0],
  [77.6, 13.1],
];

const stop = (id: string, lat: number, lng = 77.6, name: string | null = `Stop ${id}`): RideStopForRoute => ({
  id,
  name,
  lat,
  lng,
});

test("stops keep the ride's order and get their distance along the route", () => {
  const stops = buildRouteStops({
    coordinates: LINE,
    routeDistanceKm: 22.24,
    rideStops: [stop("a", 12.95), stop("b", 13.05)],
    notesByRideStopId: new Map(),
  });

  assert.deepEqual(
    stops.map((s) => [s.position, s.name]),
    [
      [1, "Stop a"],
      [2, "Stop b"],
    ],
  );
  assert.ok(Math.abs(stops[0]!.distanceFromStartKm - 5.56) < 0.05, `${stops[0]!.distanceFromStartKm}`);
  assert.ok(Math.abs(stops[1]!.distanceFromStartKm - 16.68) < 0.05, `${stops[1]!.distanceFromStartKm}`);
});

test("distances are scaled to the route's real length, not the simplified line", () => {
  // The simplified line is ~22.24 km; the road actually ridden was 30 km.
  const [only] = buildRouteStops({
    coordinates: LINE,
    routeDistanceKm: 30,
    rideStops: [stop("a", 13.0)],
    notesByRideStopId: new Map(),
  });

  assert.ok(Math.abs(only!.distanceFromStartKm - 15) < 0.05, `${only!.distanceFromStartKm}`);
});

test("a planned stop the rider never went near is left out", () => {
  const stops = buildRouteStops({
    coordinates: LINE,
    routeDistanceKm: 22.24,
    // ~5.4 km east of the line.
    rideStops: [stop("a", 12.95), stop("far", 13.0, 77.65)],
    notesByRideStopId: new Map(),
  });

  assert.deepEqual(stops.map((s) => s.name), ["Stop a"]);
});

test("notes attach to their stop, trimmed, and a blank note is no note", () => {
  const stops = buildRouteStops({
    coordinates: LINE,
    routeDistanceKm: 22.24,
    rideStops: [stop("a", 12.95), stop("b", 13.05)],
    notesByRideStopId: new Map([
      ["a", "  Last fuel for 60 km  "],
      ["b", "   "],
    ]),
  });

  assert.equal(stops[0]!.note, "Last fuel for 60 km");
  assert.equal(stops[1]!.note, null);
});
