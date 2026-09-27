import test from "node:test";
import assert from "node:assert/strict";
import { rankRouteMatches, searchRadiusKm, type RouteCandidate, type RouteSearchQuery } from "./routeSearch.js";

/** ~1.11 km per 0.01° of latitude. */
const KM_PER_HUNDREDTH = 1.11;

const BENGALURU = { lat: 12.97, lng: 77.59, name: "Bengaluru, Karnataka, India" };
const WAYANAD = { lat: 11.68, lng: 76.13, name: "Wayanad, Kerala, India" };

const candidate = (id: string, overrides: Partial<RouteCandidate> = {}): RouteCandidate => ({
  id,
  distance_km: 280,
  start: { lat: BENGALURU.lat, lng: BENGALURU.lng },
  end: { lat: WAYANAD.lat, lng: WAYANAD.lng },
  start_name: "Kengeri, Bengaluru",
  end_name: "Sulthan Bathery",
  stop_names: ["Mysuru"],
  highlights: [],
  ...overrides,
});

const query = (overrides: Partial<RouteSearchQuery> = {}): RouteSearchQuery => ({
  from: null,
  to: null,
  minKm: null,
  maxKm: null,
  highlights: [],
  ...overrides,
});

const ids = (matches: { id: string }[]) => matches.map((match) => match.id);

test("the radius is 15% of the route's length, between 5 and 25 km", () => {
  assert.equal(searchRadiusKm(14), 5);
  assert.equal(searchRadiusKm(100), 15);
  assert.equal(searchRadiusKm(280), 25);
  assert.equal(searchRadiusKm(null), 5);
});

test("a route whose ends are near both searched places matches, with the gaps", () => {
  // Starts ~8.9 km north of the searched Bengaluru point.
  const route = candidate("r1", {
    start: { lat: BENGALURU.lat + 0.08, lng: BENGALURU.lng },
    start_name: "Yelahanka, Bengaluru North",
  });

  const [match] = rankRouteMatches([route], query({ from: { ...BENGALURU, name: null }, to: { ...WAYANAD, name: null } }));

  assert.ok(match);
  assert.equal(match.direction, "forward");
  assert.ok(Math.abs(match.startGapKm! - 8 * KM_PER_HUNDREDTH) < 0.3, `start gap ${match.startGapKm}`);
  assert.ok(match.endGapKm! < 0.1);
});

test("a short route must start within 5 km; further away it doesn't match", () => {
  const cityRoute = candidate("city", {
    distance_km: 14,
    start: { lat: BENGALURU.lat + 0.06, lng: BENGALURU.lng }, // ~6.7 km
    end: { lat: BENGALURU.lat + 0.15, lng: BENGALURU.lng },
    end_name: "Hebbal, Bengaluru",
  });

  assert.deepEqual(ids(rankRouteMatches([cityRoute], query({ from: { ...BENGALURU, name: null } }))), []);
});

test("a destination name matches even when the point is outside the radius", () => {
  const route = candidate("r1", { end: { lat: 11.5, lng: 76.9 }, end_name: "Kalpetta, Wayanad" });

  const [match] = rankRouteMatches([route], query({ to: { ...WAYANAD, lat: 0, lng: 0 } }));

  assert.equal(match?.id, "r1");
  assert.equal(match?.nameMatched, true);
});

test("a route that passes through the searched place as a stop is found by name", () => {
  const route = candidate("r1", { end_name: "Coorg", end: { lat: 12.42, lng: 75.74 }, stop_names: ["Wayanad"] });

  assert.deepEqual(ids(rankRouteMatches([route], query({ to: { ...WAYANAD, lat: 0, lng: 0 } }))), ["r1"]);
});

test("a route ridden the other way is found after same-direction ones, labelled", () => {
  const forward = candidate("forward");
  const reverse = candidate("reverse", {
    start: { lat: WAYANAD.lat, lng: WAYANAD.lng },
    end: { lat: BENGALURU.lat, lng: BENGALURU.lng },
    start_name: "Sulthan Bathery",
    end_name: "Kengeri, Bengaluru",
  });

  const matches = rankRouteMatches([reverse, forward], query({ from: BENGALURU, to: WAYANAD }));

  assert.deepEqual(
    matches.map((match) => [match.id, match.direction]),
    [
      ["forward", "forward"],
      ["reverse", "reverse"],
    ],
  );
});

test("name matches rank before routes that are only nearby", () => {
  const nearbyOnly = candidate("nearby", {
    start: { lat: BENGALURU.lat + 0.01, lng: BENGALURU.lng },
    start_name: "Hosakote",
  });
  const named = candidate("named", {
    start: { lat: BENGALURU.lat + 0.1, lng: BENGALURU.lng },
    start_name: "Yelahanka, Bengaluru",
  });

  assert.deepEqual(ids(rankRouteMatches([nearbyOnly, named], query({ from: BENGALURU }))), ["named", "nearby"]);
});

test("among equals, the route closest to the searched places comes first", () => {
  const far = candidate("far", { start: { lat: BENGALURU.lat + 0.15, lng: BENGALURU.lng }, start_name: "Doddaballapura" });
  const near = candidate("near", { start: { lat: BENGALURU.lat + 0.05, lng: BENGALURU.lng }, start_name: "Hebbal" });

  assert.deepEqual(ids(rankRouteMatches([far, near], query({ from: { ...BENGALURU, name: null } }))), ["near", "far"]);
});

test("length and highlight filters narrow the results", () => {
  const short = candidate("short", { distance_km: 60, highlights: ["scenic_road"] });
  const scenicLong = candidate("scenic-long", { distance_km: 280, highlights: ["scenic_road", "great_stops"] });
  const plainLong = candidate("plain-long", { distance_km: 290 });

  assert.deepEqual(ids(rankRouteMatches([short, scenicLong, plainLong], query({ minKm: 100 }))).sort(), [
    "plain-long",
    "scenic-long",
  ]);
  assert.deepEqual(ids(rankRouteMatches([short, scenicLong, plainLong], query({ highlights: ["scenic_road", "great_stops"] }))), [
    "scenic-long",
  ]);
  assert.deepEqual(ids(rankRouteMatches([short, scenicLong, plainLong], query({ maxKm: 100 }))), ["short"]);
});

test("with no places, every route passing the filters is listed", () => {
  assert.equal(rankRouteMatches([candidate("a"), candidate("b")], query()).length, 2);
});
