import test from "node:test";
import assert from "node:assert/strict";
import { crewRoleLabel } from "./crewRole";

test("labels the ride's leaders", () => {
  assert.equal(crewRoleLabel("captain"), "Captain");
  assert.equal(crewRoleLabel("co_captain"), "Co-Captain");
});

test("labels ordinary riders whether the ride says rider or the live session says member", () => {
  assert.equal(crewRoleLabel("rider"), "Rider");
  assert.equal(crewRoleLabel("member"), "Rider");
});

test("never shows undefined for a role it does not know", () => {
  assert.equal(crewRoleLabel(undefined), "Rider");
  assert.equal(crewRoleLabel("sweeper"), "Rider");
});
