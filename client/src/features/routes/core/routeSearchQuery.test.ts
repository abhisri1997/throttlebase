import test from "node:test";
import assert from "node:assert/strict";
import { LENGTH_FILTERS, buildRouteSearchParams, matchNote } from "./routeSearchQuery";

const BENGALURU = { lat: 12.97, lng: 77.59, name: "Bengaluru, Karnataka, India" };
const WAYANAD = { lat: 11.68, lng: 76.13, name: "Wayanad, Kerala, India" };

test("nothing to search means the plain list, not a search", () => {
  assert.equal(buildRouteSearchParams({ from: null, to: null, lengthId: "any", highlights: [] }), null);
});

test("a from/to search sends both places with their names", () => {
  const params = new URLSearchParams(
    buildRouteSearchParams({ from: BENGALURU, to: WAYANAD, lengthId: "any", highlights: [] })!,
  );

  assert.equal(params.get("from_lat"), "12.97");
  assert.equal(params.get("from_lng"), "77.59");
  assert.equal(params.get("from_name"), "Bengaluru, Karnataka, India");
  assert.equal(params.get("to_name"), "Wayanad, Kerala, India");
  assert.equal(params.has("min_km"), false);
});

test("length and highlight filters alone are a search", () => {
  const params = new URLSearchParams(
    buildRouteSearchParams({ from: null, to: null, lengthId: "day", highlights: ["scenic_road", "twisties"] })!,
  );

  assert.equal(params.get("min_km"), "100");
  assert.equal(params.get("max_km"), "300");
  assert.equal(params.get("highlights"), "scenic_road,twisties");
});

test("the length filters cover short, day and long rides", () => {
  assert.deepEqual(
    LENGTH_FILTERS.map((filter) => filter.label),
    ["Any length", "Under 100 km", "100–300 km", "300+ km"],
  );
});

test("a result says how far off it starts and ends", () => {
  assert.equal(
    matchNote({ direction: "forward", start_gap_km: 7.8, end_gap_km: 12.4 }, BENGALURU.name, WAYANAD.name),
    "Starts 7.8 km from Bengaluru · ends 12 km from Wayanad",
  );
});

test("an end within half a kilometre reads as in the place", () => {
  assert.equal(
    matchNote({ direction: "forward", start_gap_km: 0.3, end_gap_km: null }, BENGALURU.name, null),
    "Starts in Bengaluru",
  );
});

test("a result from a filter-only search has no note", () => {
  assert.equal(matchNote({ direction: "forward", start_gap_km: null, end_gap_km: null }, null, null), null);
});
