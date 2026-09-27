import test from "node:test";
import assert from "node:assert/strict";
import { isPathEnabled, parseFeatureFlags, type FeatureFlags } from "./features";

const ALL_OFF: FeatureFlags = { groups: false, rank: false, accountSecurity: false, support: false };
const ALL_ON: FeatureFlags = { groups: true, rank: true, accountSecurity: true, support: true };

test("every feature is off when no flag is set", () => {
  assert.deepEqual(parseFeatureFlags({}), ALL_OFF);
});

test("a flag set to true turns its feature on, and nothing else does", () => {
  const flags = parseFeatureFlags({ groups: "true", rank: "1", support: " True " });

  assert.equal(flags.groups, true);
  assert.equal(flags.rank, false);
  assert.equal(flags.support, true);
});

test("screens of disabled features are blocked, including deep links", () => {
  for (const path of [
    "/groups",
    "/group/5c1f",
    "/create-group",
    "/rewards",
    "/security",
    "/support",
    "/support-admin",
  ]) {
    assert.equal(isPathEnabled(path, ALL_OFF), false, path);
  }
});

test("screens of enabled features are allowed", () => {
  for (const path of ["/groups", "/group/5c1f", "/rewards", "/security", "/support-admin"]) {
    assert.equal(isPathEnabled(path, ALL_ON), true, path);
  }
});

test("the beta's own screens are always allowed", () => {
  for (const path of ["/", "/feed", "/rides", "/routes", "/profile", "/ride/9/navigation", "/settings", "/rider/3"]) {
    assert.equal(isPathEnabled(path, ALL_OFF), true, path);
  }
});

test("a screen whose name only starts like a feature's is not blocked", () => {
  assert.equal(isPathEnabled("/groupsettings", ALL_OFF), true);
  assert.equal(isPathEnabled("/supporter", ALL_OFF), true);
});
