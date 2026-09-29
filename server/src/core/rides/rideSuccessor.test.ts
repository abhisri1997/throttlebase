import test from "node:test";
import assert from "node:assert/strict";
import { pickRideSuccessor, type SuccessorCandidate } from "./rideSuccessor.js";

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 29, 9, minute));

const candidate = (overrides: Partial<SuccessorCandidate> & { riderId: string }): SuccessorCandidate => ({
  role: "rider",
  promotedAt: null,
  joinedAt: at(0),
  completedRides: 0,
  ...overrides,
});

test("nobody left means no successor", () => {
  assert.equal(pickRideSuccessor([]), null);
});

test("a co-captain takes over before any rider, however experienced", () => {
  const successor = pickRideSuccessor([
    candidate({ riderId: "veteran", completedRides: 40 }),
    candidate({ riderId: "co", role: "co_captain", completedRides: 0 }),
  ]);
  assert.equal(successor, "co");
});

test("the co-captain appointed first takes over", () => {
  const successor = pickRideSuccessor([
    candidate({ riderId: "later", role: "co_captain", promotedAt: at(20), joinedAt: at(1) }),
    candidate({ riderId: "first", role: "co_captain", promotedAt: at(10), joinedAt: at(5) }),
  ]);
  assert.equal(successor, "first");
});

test("a co-captain from before appointments were dated counts from when they joined", () => {
  const successor = pickRideSuccessor([
    candidate({ riderId: "dated", role: "co_captain", promotedAt: at(10), joinedAt: at(1) }),
    candidate({ riderId: "undated", role: "co_captain", promotedAt: null, joinedAt: at(5) }),
  ]);
  assert.equal(successor, "undated");
});

test("without a co-captain, the rider with the most completed rides takes over", () => {
  const successor = pickRideSuccessor([
    candidate({ riderId: "early", completedRides: 2, joinedAt: at(1) }),
    candidate({ riderId: "veteran", completedRides: 9, joinedAt: at(30) }),
  ]);
  assert.equal(successor, "veteran");
});

test("riders with the same number of rides are separated by who joined first", () => {
  const successor = pickRideSuccessor([
    candidate({ riderId: "second", completedRides: 3, joinedAt: at(20) }),
    candidate({ riderId: "first", completedRides: 3, joinedAt: at(10) }),
  ]);
  assert.equal(successor, "first");
});

test("a rider with no join time goes after those who have one", () => {
  const successor = pickRideSuccessor([
    candidate({ riderId: "unknown", joinedAt: null }),
    candidate({ riderId: "known", joinedAt: at(50) }),
  ]);
  assert.equal(successor, "known");
});
