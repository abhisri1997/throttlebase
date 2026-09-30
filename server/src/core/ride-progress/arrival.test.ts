import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_ARRIVAL_STATE, arrivalRadiusFor, nextArrivalState, type ArrivalFix } from "./arrival.js";

const CONFIG = { arriveRadiusM: 150, arriveMinRadiusM: 50, leaveRadiusM: 300, maxAccuracyM: 100, maxArriveSpeedKmh: 20 };
const T0 = 1_757_592_000_000;

const fix = (
  distanceToDestinationM: number,
  seconds = 0,
  accuracyM: number | null = 10,
  speedKmh: number | null = 5,
): ArrivalFix => ({
  distanceToDestinationM,
  accuracyM,
  speedKmh,
  capturedAtMs: T0 + seconds * 1000,
});

test("arms once the rider is well away from the destination", () => {
  const { state, transition } = nextArrivalState(INITIAL_ARRIVAL_STATE, fix(5_000), CONFIG);

  assert.equal(transition, "armed");
  assert.deepEqual(state, { isArmed: true, arrivedAtMs: null });
});

test("a rider starting at the destination (round trip) does not arrive before leaving it", () => {
  const { state, transition } = nextArrivalState(INITIAL_ARRIVAL_STATE, fix(20), CONFIG);

  assert.equal(transition, "none");
  assert.equal(state.arrivedAtMs, null);
});

test("arrives on the first fix inside the arrival radius once armed", () => {
  const armed = { isArmed: true, arrivedAtMs: null };

  const { state, transition } = nextArrivalState(armed, fix(40, 60), CONFIG);

  assert.equal(transition, "arrived");
  assert.equal(state.arrivedAtMs, T0 + 60_000);
});

test("moving around between the two radii keeps the original arrival time", () => {
  const arrived = { isArmed: true, arrivedAtMs: T0 };

  const { state, transition } = nextArrivalState(arrived, fix(260, 120), CONFIG);

  assert.equal(transition, "none");
  assert.equal(state.arrivedAtMs, T0);
});

test("re-entering the arrival radius while already arrived keeps the first arrival time", () => {
  const arrived = { isArmed: true, arrivedAtMs: T0 };

  const { state } = nextArrivalState(arrived, fix(10, 300), CONFIG);

  assert.equal(state.arrivedAtMs, T0);
});

test("leaving beyond the exit radius cancels the arrival", () => {
  const arrived = { isArmed: true, arrivedAtMs: T0 };

  const { state, transition } = nextArrivalState(arrived, fix(450, 90), CONFIG);

  assert.equal(transition, "left");
  assert.deepEqual(state, { isArmed: true, arrivedAtMs: null });
});

test("an inaccurate fix changes nothing, near or far", () => {
  const arrived = { isArmed: true, arrivedAtMs: T0 };
  const armed = { isArmed: true, arrivedAtMs: null };

  const far = nextArrivalState(arrived, fix(2_000, 10, 250), CONFIG);
  const near = nextArrivalState(armed, fix(10, 10, 250), CONFIG);

  assert.deepEqual(far, { state: arrived, transition: "none" });
  assert.deepEqual(near, { state: armed, transition: "none" });
});

test("a fix without an accuracy reading is trusted", () => {
  const armed = { isArmed: true, arrivedAtMs: null };

  const { transition } = nextArrivalState(armed, fix(50, 10, null), CONFIG);

  assert.equal(transition, "arrived");
});

const armed = { isArmed: true, arrivedAtMs: null };

test("with good GPS a rider 80 m away, a street or two off in a city, has not arrived", () => {
  assert.equal(nextArrivalState(armed, fix(80, 0, 5), CONFIG).transition, "none");
  assert.equal(nextArrivalState(armed, fix(45, 0, 5), CONFIG).transition, "arrived");
});

test("the arrival radius widens with a poorer fix, up to its cap", () => {
  assert.equal(arrivalRadiusFor(5, CONFIG), 50);
  assert.equal(arrivalRadiusFor(null, CONFIG), 50);
  assert.equal(arrivalRadiusFor(60, CONFIG), 90);
  assert.equal(arrivalRadiusFor(100, CONFIG), 150);
  assert.equal(nextArrivalState(armed, fix(80, 0, 60), CONFIG).transition, "arrived");
});

test("riding past the destination at speed is not arriving", () => {
  assert.equal(nextArrivalState(armed, fix(20, 0, 5, 45), CONFIG).transition, "none");
  assert.equal(nextArrivalState(armed, fix(20, 0, 5, 12), CONFIG).transition, "arrived");
});

test("a device that doesn't report speed arrives on distance alone", () => {
  assert.equal(nextArrivalState(armed, fix(20, 0, 5, null), CONFIG).transition, "arrived");
});
