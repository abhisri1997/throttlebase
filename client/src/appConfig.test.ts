import test from "node:test";
import assert from "node:assert/strict";
import config from "../app.config";

/**
 * Store-facing permissions (launch readiness E4, D7). Ride tracking runs as a
 * foreground service started in the foreground, so the app must never ask for
 * location "all the time": Play reviews that permission separately and Apple
 * shows riders a scarier prompt.
 */
const BACKGROUND_LOCATION = "android.permission.ACCESS_BACKGROUND_LOCATION";

const locationPlugin = (): Record<string, unknown> => {
  const entry = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-location",
  ) as [string, Record<string, unknown>] | undefined;
  assert.ok(entry, "expo-location plugin is configured");
  return entry[1];
};

test("Android never requests background location, and blocks it", () => {
  assert.equal(config.android?.permissions?.includes(BACKGROUND_LOCATION), false);
  assert.ok(config.android?.blockedPermissions?.includes(BACKGROUND_LOCATION));
  assert.equal(locationPlugin().isAndroidBackgroundLocationEnabled, false);
});

test("the ride tracker's foreground service stays enabled", () => {
  assert.ok(config.android?.permissions?.includes("android.permission.FOREGROUND_SERVICE_LOCATION"));
  assert.equal(locationPlugin().isAndroidForegroundServiceEnabled, true);
});

test("iOS keeps location as its only background mode and has no Always wording", () => {
  assert.deepEqual(config.ios?.infoPlist?.UIBackgroundModes, ["location"]);
  const plugin = locationPlugin();
  assert.equal(plugin.locationAlwaysPermission, undefined);
  assert.equal(plugin.locationAlwaysAndWhenInUsePermission, undefined);
  assert.match(String(plugin.locationWhenInUsePermission), /while your ride is under way/);
});
