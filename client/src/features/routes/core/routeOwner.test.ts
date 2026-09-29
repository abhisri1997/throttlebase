import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNITY_ROUTE_LABEL,
  deleteRoutePrompt,
  routeAuthor,
  isRouteOwner,
  PUBLIC_ROUTE_NOTICE,
  visibilityLabel,
  visibilityPrompt,
  visibilityTarget,
} from "./routeOwner";

test("the notice where a route is made public says exactly what the policy says", () => {
  assert.equal(
    PUBLIC_ROUTE_NOTICE,
    "Public routes stay for the community, without your name, if you delete your account.",
  );
});

test("only the rider who saved a route owns it", () => {
  assert.equal(isRouteOwner({ creator_id: "r1" }, "r1"), true);
  assert.equal(isRouteOwner({ creator_id: "r1" }, "r2"), false);
  assert.equal(isRouteOwner({ creator_id: "r1" }, undefined), false);
});

test("a community route belongs to nobody", () => {
  assert.equal(isRouteOwner({ creator_id: null }, "r1"), false);
  assert.equal(routeAuthor({ creator_id: null, creator_name: null }, "r1"), COMMUNITY_ROUTE_LABEL);
});

test("a route's author reads as you, the rider, or a rider", () => {
  assert.equal(routeAuthor({ creator_id: "r1", creator_name: "Asha" }, "r1"), "You");
  assert.equal(routeAuthor({ creator_id: "r1", creator_name: "Asha" }, "r2"), "Asha");
  assert.equal(routeAuthor({ creator_id: "r1" }, null), "A rider");
});

test("a public route can be made private; anything else can be made public", () => {
  assert.equal(visibilityTarget("public"), "private");
  assert.equal(visibilityTarget("private"), "public");
  assert.equal(visibilityTarget("specific_riders"), "public");
});

test("the owner sees who can see their route now", () => {
  assert.match(visibilityLabel("public"), /Public/);
  assert.match(visibilityLabel("private"), /Only you/);
  assert.match(visibilityLabel("specific_riders"), /specific riders/);
});

test("making a route public carries the community notice", () => {
  const prompt = visibilityPrompt("public", "Coffee loop");
  assert.equal(prompt.title, "Make Coffee loop public?");
  assert.ok(prompt.message.includes(PUBLIC_ROUTE_NOTICE));
  assert.equal(prompt.confirmLabel, "Make public");
});

test("making a route private says who loses it", () => {
  const prompt = visibilityPrompt("private", "Coffee loop");
  assert.equal(prompt.title, "Make Coffee loop private?");
  assert.match(prompt.message, /bookmarked/);
  assert.equal(prompt.confirmLabel, "Make private");
});

test("deleting a route warns it's for good, and that planned rides keep their road", () => {
  const prompt = deleteRoutePrompt("Coffee loop");
  assert.equal(prompt.title, "Delete Coffee loop?");
  assert.match(prompt.message, /can't be undone/);
  assert.match(prompt.message, /keep their road/);
  assert.equal(prompt.confirmLabel, "Delete");
});
