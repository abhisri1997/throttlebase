import test from "node:test";
import assert from "node:assert/strict";
import { hasRole, isAdmin } from "./roles";

test("an admin is a rider whose roles include admin", () => {
  assert.equal(isAdmin(["admin"]), true);
  assert.equal(isAdmin(["admin", "support"]), true);
});

test("support staff and ordinary riders are not admins", () => {
  assert.equal(isAdmin(["support"]), false);
  assert.equal(isAdmin([]), false);
  assert.equal(hasRole(["support"], "support"), true);
});

test("a profile without roles, from an older API, is not an admin", () => {
  assert.equal(isAdmin(undefined), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin("admin"), false);
});
