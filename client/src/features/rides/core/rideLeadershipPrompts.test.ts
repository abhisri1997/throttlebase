import test from "node:test";
import assert from "node:assert/strict";
import { leaveRidePrompt, makeCaptainPrompt } from "./rideLeadershipPrompts";

test("a rider is simply asked to confirm leaving", () => {
  const prompt = leaveRidePrompt({ title: "Nandi sunrise" });
  assert.equal(prompt.title, "Leave Nandi sunrise?");
  assert.equal(prompt.confirmLabel, "Leave");
  assert.doesNotMatch(prompt.message, /captain|cancelled/);
});

test("the captain is told who takes over", () => {
  const prompt = leaveRidePrompt({ title: "Nandi sunrise", next_captain: { display_name: "Asha" } });
  assert.match(prompt.message, /Asha will become the captain/);
  assert.equal(prompt.confirmLabel, "Leave");
});

test("a captain alone on the ride is warned that leaving cancels it", () => {
  const prompt = leaveRidePrompt({ title: "Nandi sunrise", next_captain: null });
  assert.match(prompt.message, /nobody else/i);
  assert.match(prompt.message, /cancelled/);
  assert.equal(prompt.confirmLabel, "Leave and cancel");
});

test("making someone captain says the captain stays on as co-captain", () => {
  const prompt = makeCaptainPrompt("Asha");
  assert.equal(prompt.title, "Make Asha the captain?");
  assert.match(prompt.message, /co-captain/);
  assert.equal(prompt.confirmLabel, "Make captain");
});
