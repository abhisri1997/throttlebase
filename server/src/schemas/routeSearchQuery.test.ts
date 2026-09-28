import test from "node:test";
import assert from "node:assert/strict";
import { RouteSearchQuerySchema } from "./route.schemas.js";

test("a full search reads its numbers and highlight list from the query string", () => {
  const parsed = RouteSearchQuerySchema.parse({
    from_lat: "12.97",
    from_lng: "77.59",
    from_name: "Bengaluru, Karnataka",
    max_km: "300",
    highlights: "scenic_road, great_stops",
  });

  assert.equal(parsed.from_lat, 12.97);
  assert.equal(parsed.max_km, 300);
  assert.deepEqual(parsed.highlights, ["scenic_road", "great_stops"]);
});

test("an empty search is allowed: it lists routes", () => {
  assert.deepEqual(RouteSearchQuerySchema.parse({}).highlights, []);
});

test("a latitude without its longitude is refused", () => {
  assert.equal(RouteSearchQuerySchema.safeParse({ from_lat: "12.97" }).success, false);
});

test("an unknown highlight and a backwards length range are refused", () => {
  assert.equal(RouteSearchQuerySchema.safeParse({ highlights: "offroad" }).success, false);
  assert.equal(RouteSearchQuerySchema.safeParse({ min_km: "300", max_km: "100" }).success, false);
});
