import test from "node:test";
import assert from "node:assert/strict";
import { planRouteEndNames, type RouteEnds } from "./routeEndNames.js";

const route = (id: string, overrides: Partial<RouteEnds> = {}): RouteEnds => ({
  id,
  startName: "48, Neeladri Rd, Electronic City Phase I, Karnataka 560100, India",
  endName: "429, 23rd Cross Road, HSR Layout, Bengaluru, Karnataka, India",
  start: { lat: 12.84, lng: 77.66 },
  end: { lat: 12.91, lng: 77.64 },
  ...overrides,
});

const areaByLat = (names: Record<number, string | null>) => async (point: { lat: number }) =>
  names[point.lat] ?? null;

test("both ends get their area names", async () => {
  const plan = await planRouteEndNames(
    [route("r1")],
    areaByLat({ 12.84: "Electronic City, Bengaluru", 12.91: "HSR Layout, Bengaluru" }),
  );

  assert.deepEqual(plan, [
    { id: "r1", startName: "Electronic City, Bengaluru", endName: "HSR Layout, Bengaluru" },
  ]);
});

test("an end the lookup cannot name keeps its current name", async () => {
  const plan = await planRouteEndNames([route("r1")], areaByLat({ 12.91: "HSR Layout, Bengaluru" }));

  assert.deepEqual(plan, [
    {
      id: "r1",
      startName: "48, Neeladri Rd, Electronic City Phase I, Karnataka 560100, India",
      endName: "HSR Layout, Bengaluru",
    },
  ]);
});

test("a route whose names would not change is left alone", async () => {
  const plan = await planRouteEndNames(
    [route("r1", { startName: "Electronic City, Bengaluru", endName: "HSR Layout, Bengaluru" })],
    areaByLat({ 12.84: "Electronic City, Bengaluru", 12.91: "HSR Layout, Bengaluru" }),
  );

  assert.deepEqual(plan, []);
});

test("a route without points is skipped", async () => {
  const plan = await planRouteEndNames(
    [route("r1", { start: null, end: null })],
    areaByLat({ 12.84: "Electronic City, Bengaluru" }),
  );

  assert.deepEqual(plan, []);
});

test("one failed lookup does not stop the others", async () => {
  const plan = await planRouteEndNames(
    [route("r1"), route("r2", { start: { lat: 13.1, lng: 77.6 }, end: { lat: 13.2, lng: 77.6 } })],
    async (point) => {
      if (point.lat === 12.84) throw new Error("quota");
      return point.lat === 13.1 ? "Yelahanka, Bengaluru" : point.lat === 13.2 ? "Doddaballapura" : null;
    },
  );

  assert.deepEqual(
    plan.map((entry) => entry.id),
    ["r2"],
  );
});
