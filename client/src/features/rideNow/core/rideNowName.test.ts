import test from "node:test";
import assert from "node:assert/strict";
import { automaticRideName } from "./rideNowName";

const at = (hour: number, minute = 0): Date => new Date(2026, 9, 1, hour, minute);

test("with a destination, the ride is named after it", () => {
  assert.equal(automaticRideName(at(7), "Nandi Hills"), "Ride to Nandi Hills");
  assert.equal(automaticRideName(at(7), "  Nandi Hills  "), "Ride to Nandi Hills");
});

test("without one, the ride is named after the time of day", () => {
  assert.equal(automaticRideName(at(5)), "Morning ride");
  assert.equal(automaticRideName(at(11, 59)), "Morning ride");
  assert.equal(automaticRideName(at(12)), "Afternoon ride");
  assert.equal(automaticRideName(at(16, 59)), "Afternoon ride");
  assert.equal(automaticRideName(at(17)), "Evening ride");
  assert.equal(automaticRideName(at(20, 59)), "Evening ride");
  assert.equal(automaticRideName(at(21)), "Night ride");
  assert.equal(automaticRideName(at(0)), "Night ride");
  assert.equal(automaticRideName(at(4, 59)), "Night ride");
});

test("a blank destination counts as none", () => {
  assert.equal(automaticRideName(at(9), "   "), "Morning ride");
  assert.equal(automaticRideName(at(9), null), "Morning ride");
});

test("a long place name is cut to fit the server's limit", () => {
  const name = automaticRideName(at(9), "x".repeat(400));
  assert.ok(name.length <= 255);
  assert.ok(name.startsWith("Ride to x"));
});
