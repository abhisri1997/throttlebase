import test from "node:test";
import assert from "node:assert/strict";
import { suggestRegroupPoint, type RegroupCandidate } from "./regroup";

const somewhere = { latitude: 0, longitude: 0 };

const candidate = (
  id: string,
  alongMeters: number,
  isExistingStop = false,
): RegroupCandidate => ({
  id,
  name: id,
  coordinate: somewhere,
  alongMeters,
  isExistingStop,
});

test("ignores anywhere the group has already ridden past", () => {
  const suggestion = suggestRegroupPoint({
    candidates: [candidate("behind", 1000), candidate("ahead", 9000)],
    groupAlongMeters: 5000,
    riderAlongMeters: 2000,
  });

  assert.equal(suggestion?.candidate.id, "ahead");
});

test("a stop already on the plan beats a new place", () => {
  const suggestion = suggestRegroupPoint({
    candidates: [candidate("new-place", 6000), candidate("planned-stop", 9000, true)],
    groupAlongMeters: 5000,
    riderAlongMeters: 2000,
  });

  assert.equal(suggestion?.candidate.id, "planned-stop");
});

test("reports how long the group waits and when each arrives", () => {
  const suggestion = suggestRegroupPoint({
    candidates: [candidate("stop", 6200)],
    groupAlongMeters: 5000,
    riderAlongMeters: 2000,
    groupSpeedMps: 10,
    riderSpeedMps: 10,
  });

  assert.equal(suggestion?.groupEtaSeconds, 120);
  assert.equal(suggestion?.riderEtaSeconds, 420);
  assert.equal(suggestion?.waitSeconds, 300);
});

test("a rider already past the point leaves the group waiting for nobody", () => {
  const suggestion = suggestRegroupPoint({
    candidates: [candidate("stop", 6000)],
    groupAlongMeters: 5000,
    riderAlongMeters: 5800,
  });

  assert.equal(suggestion?.waitSeconds, 0);
});

test("suggests nothing when the group would be left standing too long", () => {
  const suggestion = suggestRegroupPoint({
    candidates: [candidate("stop", 5500)],
    groupAlongMeters: 5000,
    riderAlongMeters: -40_000, // 40 km behind the start
    maxWaitSeconds: 600,
  });

  assert.equal(suggestion, null);
});

test("a faster rider catches up further along, so the wait shrinks with distance", () => {
  const suggestion = suggestRegroupPoint({
    candidates: [candidate("near", 6000), candidate("far", 20000)],
    groupAlongMeters: 5000,
    riderAlongMeters: 0,
    groupSpeedMps: 10,
    riderSpeedMps: 20,
  });

  assert.equal(suggestion?.candidate.id, "far");
  assert.equal(suggestion?.waitSeconds, 0);
});

test("nothing ahead means nothing to suggest", () => {
  assert.equal(
    suggestRegroupPoint({
      candidates: [],
      groupAlongMeters: 5000,
      riderAlongMeters: 1000,
    }),
    null,
  );
});
