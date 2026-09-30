import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROUTE_TITLE_LENGTH,
  ROUTE_HIGHLIGHTS,
  defaultRouteTitle,
  saveRouteErrorMessage,
  suggestedRouteTitle,
  toggleHighlight,
  validRouteTitle,
} from "./saveRoute";

const httpError = (status: number) => ({ response: { status } });

test("a route is named after its ride by default", () => {
  assert.equal(defaultRouteTitle("  Sunday Nandi Hills run "), "Sunday Nandi Hills run");
});

test("a ride without a usable title still gives a name", () => {
  assert.equal(defaultRouteTitle(""), "My ride");
  assert.equal(defaultRouteTitle(undefined), "My ride");
});

test("an over-long ride title is cut to what the server accepts", () => {
  assert.equal(defaultRouteTitle("x".repeat(400)).length, MAX_ROUTE_TITLE_LENGTH);
});

test("a blank title cannot be saved", () => {
  assert.equal(validRouteTitle("   "), null);
  assert.equal(validRouteTitle(" Coffee loop "), "Coffee loop");
});

test("a ride with too little recorded says so", () => {
  assert.match(saveRouteErrorMessage(httpError(422)), /not enough of this ride was recorded/i);
});

test("a route too short to share publicly suggests keeping it to yourself", () => {
  const error = { response: { status: 422, data: { code: "ROUTE_TOO_SHORT" } } };
  assert.match(saveRouteErrorMessage(error), /too short to share publicly/i);
  assert.match(saveRouteErrorMessage(error), /Only me/);
});

test("a ride that is not completed yet says when it can be saved", () => {
  assert.match(saveRouteErrorMessage(httpError(409)), /once the ride is completed/i);
});

test("someone who was not on the ride is told why", () => {
  assert.match(saveRouteErrorMessage(httpError(403)), /only riders who were on this ride/i);
});

test("anything else suggests trying again", () => {
  assert.match(saveRouteErrorMessage(new Error("Network Error")), /try again/i);
  assert.match(saveRouteErrorMessage(httpError(500)), /try again/i);
});

test("a route is suggested a name from where it starts and ends", () => {
  assert.equal(
    suggestedRouteTitle("Electronic City, Doddathoguru", "HSR Layout, Bengaluru", "Ride to home…"),
    "Electronic City → HSR Layout",
  );
});

test("a ride that ends where it started is named as a loop", () => {
  assert.equal(
    suggestedRouteTitle("Indiranagar, Bengaluru", "Indiranagar, Bengaluru", "Sunday spin"),
    "Loop from Indiranagar",
  );
});

test("without both ends named, the ride's own name is suggested", () => {
  assert.equal(suggestedRouteTitle(null, "HSR Layout, Bengaluru", "Ride to home…"), "Ride to home…");
  assert.equal(suggestedRouteTitle(null, null, undefined), "My ride");
});

test("the eight highlights have labels riders recognise", () => {
  assert.equal(ROUTE_HIGHLIGHTS.length, 8);
  assert.deepEqual(
    ROUTE_HIGHLIGHTS.map((highlight) => highlight.label),
    [
      "Scenic road",
      "Good surface",
      "Quiet, little traffic",
      "Well-lit",
      "Great stops",
      "Twisties",
      "Night-ride friendly",
      "Beginner friendly",
    ],
  );
});

test("tapping a highlight picks it, and tapping again unpicks it", () => {
  const picked = toggleHighlight([], "scenic_road");
  assert.deepEqual(picked, ["scenic_road"]);
  assert.deepEqual(toggleHighlight(picked, "scenic_road"), []);
});
