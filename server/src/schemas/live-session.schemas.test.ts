import test from "node:test";
import assert from "node:assert/strict";
import { LiveLocationUpdateSchema } from "./live-session.schemas.js";

const FIX = { lon: 77.6, lat: 12.9 };

test("a location update may say what the phone's motion sensors read", () => {
  assert.equal(LiveLocationUpdateSchema.parse({ ...FIX, activity: "walking" }).activity, "walking");
});

test("a location update without a motion reading is still a location update", () => {
  assert.equal(LiveLocationUpdateSchema.parse(FIX).activity, undefined);
});

test("a motion reading the server does not know is refused", () => {
  assert.equal(LiveLocationUpdateSchema.safeParse({ ...FIX, activity: "unknown" }).success, false);
  assert.equal(LiveLocationUpdateSchema.safeParse({ ...FIX, activity: "flying" }).success, false);
});
