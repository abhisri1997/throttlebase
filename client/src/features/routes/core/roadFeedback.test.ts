import test from "node:test";
import assert from "node:assert/strict";
import { myAnswerLine, roadFeedbackHeadline, roadFeedbackReasonsLine, toggleReason } from "./roadFeedback";

test("a route nobody has answered for says nothing", () => {
  assert.equal(roadFeedbackHeadline({ described: 0, total: 0, reasons: [] }), null);
});

test("the route says how many of the riders who followed its road found it as described", () => {
  assert.equal(
    roadFeedbackHeadline({ described: 4, total: 5, reasons: [] }),
    "4 of 5 riders said the road was as described",
  );
});

test("a single answer reads as one rider's view, either way", () => {
  assert.equal(roadFeedbackHeadline({ described: 1, total: 1, reasons: [] }), "1 rider said the road was as described");
  assert.equal(
    roadFeedbackHeadline({ described: 0, total: 1, reasons: [] }),
    "1 rider said the road wasn't quite as described",
  );
});

test("what was different is listed most-said first, with counts only where more than one said it", () => {
  const line = roadFeedbackReasonsLine({
    described: 1,
    total: 4,
    reasons: [
      { reason: "heavy_traffic", count: 2 },
      { reason: "rough_surface", count: 1 },
      { reason: "offroad", count: 1 },
    ],
  });

  assert.equal(line, "More traffic (2) · Rougher surface");
});

test("with nothing different said, there is no reasons line", () => {
  assert.equal(roadFeedbackReasonsLine({ described: 2, total: 2, reasons: [] }), null);
});

test("the rider's own answer is played back to them", () => {
  assert.equal(myAnswerLine({ as_described: true, reasons: [], note: null }), "You said the road was as described.");
  assert.equal(
    myAnswerLine({ as_described: false, reasons: ["road_works", "poorly_lit"], note: null }),
    "You said it wasn't quite: road works or closures, poorly lit.",
  );
  assert.equal(myAnswerLine({ as_described: false, reasons: [], note: null }), "You said it wasn't quite as described.");
});

test("tapping a reason picks it, tapping again drops it", () => {
  const picked = toggleReason([], "heavy_traffic");

  assert.deepEqual(picked, ["heavy_traffic"]);
  assert.deepEqual(toggleReason(picked, "heavy_traffic"), []);
});
