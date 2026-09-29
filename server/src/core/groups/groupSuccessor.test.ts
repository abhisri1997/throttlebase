import test from "node:test";
import assert from "node:assert/strict";
import { pickGroupSuccessor, type GroupSuccessorCandidate } from "./groupSuccessor.js";

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 29, 9, minute));

const member = (riderId: string, minute: number | null, role: "admin" | "member" = "member"): GroupSuccessorCandidate => ({
  riderId,
  role,
  joinedAt: minute === null ? null : at(minute),
});

test("an empty group has no successor", () => {
  assert.equal(pickGroupSuccessor([]), null);
});

test("another admin takes over before any member, however long they have been in", () => {
  assert.equal(pickGroupSuccessor([member("old-member", 1), member("admin", 30, "admin")]), "admin");
});

test("among admins, the one who joined first takes over", () => {
  assert.equal(pickGroupSuccessor([member("later", 20, "admin"), member("first", 10, "admin")]), "first");
});

test("without another admin, the member who joined first takes over", () => {
  assert.equal(pickGroupSuccessor([member("second", 20), member("first", 10)]), "first");
});

test("a member with no join time goes after those who have one", () => {
  assert.equal(pickGroupSuccessor([member("unknown", null), member("known", 50)]), "known");
});
