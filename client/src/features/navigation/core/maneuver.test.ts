import test from "node:test";
import assert from "node:assert/strict";
import { maneuverIconKind } from "./maneuver";

test("maps Directions maneuvers to arrows", () => {
  assert.equal(maneuverIconKind("turn-left"), "turn-left");
  assert.equal(maneuverIconKind("turn-sharp-right"), "turn-right");
  assert.equal(maneuverIconKind("keep-left"), "slight-left");
  assert.equal(maneuverIconKind("ramp-right"), "slight-right");
  assert.equal(maneuverIconKind("fork-left"), "fork");
  assert.equal(maneuverIconKind("uturn-right"), "uturn");
  assert.equal(maneuverIconKind("roundabout-left"), "roundabout-left");
});

test("falls back to straight on for missing or unknown maneuvers", () => {
  assert.equal(maneuverIconKind(undefined), "straight");
  assert.equal(maneuverIconKind(""), "straight");
  assert.equal(maneuverIconKind("ferry-train"), "straight");
  assert.equal(maneuverIconKind("constructor"), "straight");
});
