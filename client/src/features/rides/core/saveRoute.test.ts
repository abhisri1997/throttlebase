import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ROUTE_TITLE_LENGTH, defaultRouteTitle, saveRouteErrorMessage, validRouteTitle } from "./saveRoute";

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
