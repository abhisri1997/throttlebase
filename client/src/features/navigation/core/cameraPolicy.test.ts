import test from "node:test";
import assert from "node:assert/strict";
import { chooseHeading, followZoomForSpeed, isNavigationDaytime } from "./cameraPolicy";

const kmh = (value: number): number => value / 3.6;

test("zooms out as speed rises", () => {
  assert.equal(followZoomForSpeed(null), 18.5);
  assert.equal(followZoomForSpeed(kmh(15)), 18.5);
  assert.equal(followZoomForSpeed(kmh(35)), 17.5);
  assert.equal(followZoomForSpeed(kmh(80)), 16.5);
});

test("holds the current zoom while speed hovers around a band edge", () => {
  assert.equal(followZoomForSpeed(kmh(22), 18.5), 18.5);
  assert.equal(followZoomForSpeed(kmh(18), 17.5), 17.5);
  assert.equal(followZoomForSpeed(kmh(26), 18.5), 17.5);
  assert.equal(followZoomForSpeed(kmh(14), 17.5), 18.5);
});

test("uses the GPS course while moving and the compass when slow", () => {
  assert.equal(chooseHeading({ headingDegrees: 90, speedMps: 10 }, 200), 90);
  assert.equal(chooseHeading({ headingDegrees: 90, speedMps: 1 }, 200), 200);
  assert.equal(chooseHeading({ headingDegrees: 90, speedMps: 1 }, null), 90);
  assert.equal(chooseHeading(null, null), null);
});

test("daytime runs from 06:00 to 18:30", () => {
  const at = (hours: number, minutes: number): Date => new Date(2026, 8, 11, hours, minutes);

  assert.equal(isNavigationDaytime(at(5, 59)), false);
  assert.equal(isNavigationDaytime(at(6, 0)), true);
  assert.equal(isNavigationDaytime(at(18, 29)), true);
  assert.equal(isNavigationDaytime(at(18, 30)), false);
});
