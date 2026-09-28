import test from "node:test";
import assert from "node:assert/strict";
import { keptRouteStops, placeAtParking, stopChoices, type RideStopForRoute } from "./routeStops.js";
import type { RideStop } from "../ride-progress/segmentRide.js";

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

const rideStop = (overrides: Partial<RideStop> & Pick<RideStop, "parkedAt">): RideStop => ({
  startedAtMs: Date.UTC(2026, 8, 25, 14, 53),
  endedAtMs: Date.UTC(2026, 8, 25, 15, 6),
  durationS: 780,
  farthestM: 310,
  walkedAway: true,
  plannedStopId: null,
  ...overrides,
});

const choose = (plannedStops: RideStopForRoute[], rideStops: RideStop[] = [], routeDistanceKm = 22.24) =>
  stopChoices({ coordinates: LINE, routeDistanceKm, plannedStops, rideStops });

test("planned stops on the way are listed in road order, measured along the route, and ticked", () => {
  const choices = choose([stop("b", 13.05), stop("a", 12.95)]);

  assert.deepEqual(
    choices.map((c) => [c.key, c.kind, c.status, c.suggested]),
    [
      ["planned:a", "planned", "visited", true],
      ["planned:b", "planned", "visited", true],
    ],
  );
  assert.ok(Math.abs(choices[0]!.distanceFromStartKm! - 5.56) < 0.05, `${choices[0]!.distanceFromStartKm}`);
  assert.ok(Math.abs(choices[1]!.distanceFromStartKm! - 16.68) < 0.05, `${choices[1]!.distanceFromStartKm}`);
});

test("distances are scaled to the route's real length, not the simplified line", () => {
  // The simplified line is ~22.24 km; the road actually ridden was 30 km.
  const [only] = choose([stop("a", 13.0)], [], 30);

  assert.ok(Math.abs(only!.distanceFromStartKm! - 15) < 0.05, `${only!.distanceFromStartKm}`);
});

test("a planned stop the rider never went near is listed as skipped, last, and can't be kept", () => {
  // ~5.4 km east of the line.
  const choices = choose([stop("far", 13.0, 77.65), stop("a", 12.95)]);

  assert.deepEqual(
    choices.map((c) => [c.key, c.status, c.suggested, c.distanceFromStartKm]),
    [
      ["planned:a", "visited", true, choices[0]!.distanceFromStartKm],
      ["planned:far", "skipped", false, null],
    ],
  );
});

test("a planned stop the rider got off at sits where the bike was, with how long they stopped", () => {
  const gate = { lat: 12.95, lng: 77.6005 };

  const [infosys] = choose([stop("infosys", 12.95, 77.603)], [rideStop({ parkedAt: gate, plannedStopId: "infosys" })]);

  assert.equal(infosys!.lat, gate.lat);
  assert.equal(infosys!.lng, gate.lng);
  assert.equal(infosys!.stoppedS, 780);
  assert.equal(infosys!.walkedAway, true);
});

test("a stop the rider found is listed where it fell, ticked if they walked off", () => {
  const temple = rideStop({ parkedAt: { lat: 13.0, lng: 77.6 }, startedAtMs: 1_000 });
  const stretch = rideStop({ parkedAt: { lat: 13.08, lng: 77.6 }, startedAtMs: 2_000, walkedAway: false, farthestM: 10 });

  const choices = choose([stop("a", 12.95)], [stretch, temple]);

  assert.deepEqual(
    choices.map((c) => [c.key, c.kind, c.status, c.suggested, c.name]),
    [
      ["planned:a", "planned", "visited", true, "Stop a"],
      ["found:1000", "discovered", "found", true, null],
      ["found:2000", "discovered", "found", false, null],
    ],
    "the stop beside the bike (a stretch, a standstill) is the rider's call",
  );
});

test("the route keeps only the stops the rider kept, with their notes and names", () => {
  const choices = choose([stop("a", 12.95), stop("b", 13.05)], [rideStop({ parkedAt: { lat: 13.0, lng: 77.6 }, startedAtMs: 1_000 })]);

  const kept = keptRouteStops(
    choices,
    new Map([
      ["planned:a", { note: "  Last fuel for 60 km  " }],
      ["found:1000", { name: "  Hilltop temple  ", note: "   " }],
    ]),
  );

  assert.deepEqual(
    kept.map((s) => [s.position, s.key, s.name, s.note]),
    [
      [1, "planned:a", "Stop a", "Last fuel for 60 km"],
      [2, "found:1000", "Hilltop temple", null],
    ],
  );
});

test("a skipped stop is never kept, even if asked", () => {
  const choices = choose([stop("far", 13.0, 77.65)]);

  assert.deepEqual(keptRouteStops(choices, new Map([["planned:far", {}]])), []);
});

test("a planned stop the rider parked for sits where the bike was, not where they walked to", () => {
  // Infosys Building 37 is inside a campus bikes can't enter; the bike waited at the gate.
  const building = stop("infosys", 12.95, 77.603);
  const gate = { lat: 12.95, lng: 77.6005 };

  const placed = placeAtParking([building, stop("cafe", 13.05)], [
    { plannedStopId: "infosys", parkedAt: gate },
    { plannedStopId: null, parkedAt: { lat: 13.0, lng: 77.6 } },
  ]);

  assert.deepEqual(
    placed.map((s) => [s.id, s.name, s.lat, s.lng]),
    [
      ["infosys", "Stop infosys", 12.95, 77.6005],
      ["cafe", "Stop cafe", 13.05, 77.6],
    ],
  );
});
