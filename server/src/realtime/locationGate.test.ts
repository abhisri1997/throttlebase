import test from "node:test";
import assert from "node:assert/strict";
import { createLocationGate, SIMULATION_TAKEOVER_MS } from "./locationGate.js";
import { createSampleThrottle, type TrackPoint } from "./sampleThrottle.js";

const T0 = 1_757_592_000_000;
const RIDER = "rider-1";
const KEY = "ride-1:rider-1";

/** Along the equator, where 1° of longitude is about 111,320 m. */
const at = (meters: number, seconds: number): TrackPoint => ({
  lat: 0,
  lng: meters / 111_320,
  capturedAtMs: T0 + seconds * 1000,
});

const admit = (
  gate: ReturnType<typeof createLocationGate>,
  point: TrackPoint,
  isSimulated: boolean,
  nowMs = point.capturedAtMs,
) => gate.admit({ riderId: RIDER, sampleKey: KEY, point, isSimulated, nowMs });

test("stores a simulated fix as a track sample so a simulated ride is recorded", () => {
  const gate = createLocationGate(createSampleThrottle());

  const admission = admit(gate, at(0, 0), true);

  assert.equal(admission.isAccepted, true);
  assert.notEqual(admission.isAccepted && admission.reservation, null);
});

test("throttles simulated fixes like real ones", () => {
  const gate = createLocationGate(createSampleThrottle());
  admit(gate, at(0, 0), true);

  const tooClose = admit(gate, at(10, 1), true);
  const farEnough = admit(gate, at(30, 2), true);

  assert.equal(tooClose.isAccepted && tooClose.reservation, null);
  assert.notEqual(farEnough.isAccepted && farEnough.reservation, null);
});

test("drops real GPS while a simulation has taken over the rider", () => {
  const gate = createLocationGate(createSampleThrottle());
  admit(gate, at(0, 0), true);

  const real = admit(gate, at(5_000, 5), false);

  assert.equal(real.isAccepted, false);
});

test("hands the rider back to real GPS once the simulation goes quiet", () => {
  const gate = createLocationGate(createSampleThrottle());
  admit(gate, at(0, 0), true);

  const real = admit(gate, at(5_000, 60), false, T0 + SIMULATION_TAKEOVER_MS);

  assert.equal(real.isAccepted, true);
});

test("clearRider ends a simulation takeover immediately", () => {
  const gate = createLocationGate(createSampleThrottle());
  admit(gate, at(0, 0), true);

  gate.clearRider(RIDER);
  const real = admit(gate, at(5_000, 5), false);

  assert.equal(real.isAccepted, true);
});
