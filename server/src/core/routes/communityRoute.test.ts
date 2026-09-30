import test from "node:test";
import assert from "node:assert/strict";
import { haversineMeters } from "../../utils/polyline.js";
import {
  communityRouteTitle,
  END_TRIM_METERS,
  HOME_LIKE_PLACE_TYPES,
  keptStops,
  MIN_KEPT_METERS,
  planPublicRoute,
  PUBLIC_PLACE_TYPES,
  trimLineEnds,
  type LngLat,
} from "./communityRoute.js";

/** Due east along the equator: 0.01° of longitude is about 1.11 km. */
const eastward = (steps: number): LngLat[] => Array.from({ length: steps + 1 }, (_, i) => [i * 0.01, 0] as LngLat);
const at = ([lng, lat]: LngLat) => ({ lat, lng });

test("about 500 m comes off each end, and the rest of the road stays", () => {
  const line = eastward(9); // ~10 km
  const trimmed = trimLineEnds(line)!;

  assert.equal(END_TRIM_METERS, 500);
  assert.ok(Math.abs(haversineMeters(at(line[0]!), trimmed.start) - 500) < 1);
  assert.ok(Math.abs(haversineMeters(at(line[line.length - 1]!), trimmed.end) - 500) < 1);
  assert.deepEqual(trimmed.coordinates.slice(1, -1), line.slice(1, -1));
  assert.ok(Math.abs(trimmed.lengthMeters - (haversineMeters(at(line[0]!), at(line[9]!)) - 1000)) < 1);
});

test("a trimmed route with under 5 km left isn't kept", () => {
  assert.equal(MIN_KEPT_METERS, 5000);
  assert.equal(trimLineEnds(eastward(5)), null); // ~5.6 km, 4.6 km left
  assert.notEqual(trimLineEnds(eastward(6)), null); // ~6.7 km, 5.7 km left
  assert.equal(trimLineEnds([[0, 0]]), null);
});

test("stops in the trimmed ends go; the rest are renumbered along what's left", () => {
  const line = eastward(9);
  const trimmed = trimLineEnds(line)!;
  const stops = keptStops(line, [
    { lat: 0, lng: 0.07 },
    { lat: 0, lng: 0.002 }, // ~220 m from the start
    { lat: 0, lng: 0.05 },
    { lat: 0, lng: 0.0895 }, // ~60 m from the end
  ]);

  assert.deepEqual(
    stops.map((stop) => [stop.position, stop.lng]),
    [
      [1, 0.05],
      [2, 0.07],
    ],
  );
  const fromNewStart = haversineMeters(trimmed.start, { lat: 0, lng: 0.05 }) / 1000;
  assert.ok(Math.abs(stops[0]!.distanceFromStartKm - fromNewStart) < 0.01);
});

test("an end at a public place is kept there, named after it; the other end is trimmed", () => {
  const line = eastward(9);
  const hotel = { name: "Taj West End", lat: 0.0002, lng: -0.0003 };
  const plan = planPublicRoute({ line, stops: [{ lat: 0, lng: 0.002 }], startPlace: hotel, endPlace: null })!;

  assert.deepEqual(plan.start, { lat: hotel.lat, lng: hotel.lng });
  assert.equal(plan.startName, "Taj West End");
  assert.equal(plan.endName, null);
  assert.ok(Math.abs(haversineMeters(at(line[9]!), plan.end) - 500) < 1);
  // Near the kept start, a stop is on the kept road.
  assert.deepEqual(
    plan.stops.map((stop) => stop.lng),
    [0.002],
  );
});

test("a short route between two public places is kept whole", () => {
  const line = eastward(2); // ~2.2 km
  const cafe = { name: "Cafe Noir", lat: 0, lng: 0 };
  const viewpoint = { name: "Sunset Point", lat: 0, lng: 0.02 };

  const plan = planPublicRoute({ line, stops: [], startPlace: cafe, endPlace: viewpoint })!;
  assert.equal(plan.startName, "Cafe Noir");
  assert.equal(plan.endName, "Sunset Point");
  assert.equal(plan.coordinates.length, line.length);

  // With one end trimmed, the 5 km minimum applies again.
  assert.equal(planPublicRoute({ line, stops: [], startPlace: cafe, endPlace: null }), null);
});

test("home-like places are never on the public list", () => {
  for (const type of ["guest_house", "private_guest_room", "farmstay", "hostel", "apartment_complex"]) {
    assert.ok(HOME_LIKE_PLACE_TYPES.includes(type), type);
  }
  assert.equal(
    PUBLIC_PLACE_TYPES.some((type) => HOME_LIKE_PLACE_TYPES.includes(type)),
    false,
  );
  assert.ok(PUBLIC_PLACE_TYPES.includes("hotel"));
  assert.ok(PUBLIC_PLACE_TYPES.includes("gas_station"));
});

test("the title comes from the ends' names, never the rider's own words", () => {
  assert.equal(communityRouteTitle("Hebbal, Bengaluru", "Nandi Hills, Chikkaballapur"), "Hebbal to Nandi Hills");
  assert.equal(communityRouteTitle("Taj West End", "Nandi Hills, Chikkaballapur"), "Taj West End to Nandi Hills");
  assert.equal(communityRouteTitle("Hebbal, Bengaluru", "Hebbal, Bengaluru"), "Hebbal loop");
  assert.equal(communityRouteTitle(null, "Nandi Hills"), "Route to Nandi Hills");
  assert.equal(communityRouteTitle("Hebbal", null), "Route from Hebbal");
  assert.equal(communityRouteTitle(null, " "), "Community route");
});
