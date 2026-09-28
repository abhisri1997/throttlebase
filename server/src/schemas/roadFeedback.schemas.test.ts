import test from "node:test";
import assert from "node:assert/strict";
import { RoadFeedbackSchema } from "./roadFeedback.schemas.js";

test("a plain yes needs nothing else", () => {
  assert.deepEqual(RoadFeedbackSchema.parse({ as_described: true }), { as_described: true, reasons: [], note: null });
});

test("not quite, with what was different and a note", () => {
  const parsed = RoadFeedbackSchema.parse({
    as_described: false,
    reasons: ["heavy_traffic", "road_works"],
    note: "  Flyover works near Silk Board  ",
  });

  assert.deepEqual(parsed, {
    as_described: false,
    reasons: ["heavy_traffic", "road_works"],
    note: "Flyover works near Silk Board",
  });
});

test("a blank note is no note", () => {
  assert.equal(RoadFeedbackSchema.parse({ as_described: false, note: "   " }).note, null);
});

test("reasons it was different are refused on a yes", () => {
  assert.equal(RoadFeedbackSchema.safeParse({ as_described: true, reasons: ["heavy_traffic"] }).success, false);
});

test("an unknown reason, a repeated one, or an overlong note is refused", () => {
  assert.equal(RoadFeedbackSchema.safeParse({ as_described: false, reasons: ["offroad"] }).success, false);
  assert.equal(
    RoadFeedbackSchema.safeParse({ as_described: false, reasons: ["road_works", "road_works"] }).success,
    false,
  );
  assert.equal(RoadFeedbackSchema.safeParse({ as_described: false, note: "x".repeat(281) }).success, false);
});
