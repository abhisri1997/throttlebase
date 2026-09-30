import test from "node:test";
import assert from "node:assert/strict";
import { isOverLimit, speedometerLabel } from "./speedometer";

test("speed reads in whole km/h", () => {
  assert.equal(speedometerLabel(10), "36");
  assert.equal(speedometerLabel(16.7), "60");
});

test("standing still reads 0, not GPS drift", () => {
  assert.equal(speedometerLabel(0.5), "0");
  assert.equal(speedometerLabel(0), "0");
});

test("no fix or no speed reads --", () => {
  assert.equal(speedometerLabel(null), "--");
  assert.equal(speedometerLabel(undefined), "--");
  assert.equal(speedometerLabel(Number.NaN), "--");
  assert.equal(speedometerLabel(-1), "--");
});

test("over the limit only when a limit is known and the shown speed exceeds it", () => {
  assert.equal(isOverLimit(16.7, 50), true);
  assert.equal(isOverLimit(13.9, 50), false); // 50 shown: at the limit, not over
  assert.equal(isOverLimit(16.7, null), false);
  assert.equal(isOverLimit(null, 50), false);
});
