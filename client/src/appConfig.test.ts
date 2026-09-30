import test from "node:test";
import assert from "node:assert/strict";

// app.config.ts refuses to load without these when CI=true, as a build must.
// This test reads only permissions, so placeholders are enough.
for (const name of ["GOOGLE_MAPS_IOS_API_KEY", "GOOGLE_MAPS_ANDROID_API_KEY", "GOOGLE_IOS_URL_SCHEME"]) {
  process.env[name] ??= "placeholder-for-tests";
}
const loadConfig = async () => (await import("../app.config")).default;

/**
 * Store-facing permissions (launch readiness E4, D7). Ride tracking runs as a
 * foreground service started in the foreground, so the app must never ask for
 * location "all the time": Play reviews that permission separately and Apple
 * shows riders a scarier prompt.
 */
const BACKGROUND_LOCATION = "android.permission.ACCESS_BACKGROUND_LOCATION";

const locationPlugin = async (): Promise<Record<string, unknown>> => {
  const config = await loadConfig();
  const entry = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-location",
  ) as [string, Record<string, unknown>] | undefined;
  assert.ok(entry, "expo-location plugin is configured");
  return entry[1];
};

test("Android never requests background location, and blocks it", async () => {
  const config = await loadConfig();
  assert.equal(config.android?.permissions?.includes(BACKGROUND_LOCATION), false);
  assert.ok(config.android?.blockedPermissions?.includes(BACKGROUND_LOCATION));
  assert.equal((await locationPlugin()).isAndroidBackgroundLocationEnabled, false);
});

test("the ride tracker's foreground service stays enabled", async () => {
  const config = await loadConfig();
  assert.ok(config.android?.permissions?.includes("android.permission.FOREGROUND_SERVICE_LOCATION"));
  assert.equal((await locationPlugin()).isAndroidForegroundServiceEnabled, true);
});

test("iOS keeps location as its only background mode and has no Always wording", async () => {
  const config = await loadConfig();
  assert.deepEqual(config.ios?.infoPlist?.UIBackgroundModes, ["location"]);
  const plugin = await locationPlugin();
  assert.equal(plugin.locationAlwaysPermission, undefined);
  assert.equal(plugin.locationAlwaysAndWhenInUsePermission, undefined);
  assert.match(String(plugin.locationWhenInUsePermission), /while your ride is under way/);
});
