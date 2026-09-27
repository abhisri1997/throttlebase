import test from "node:test";
import assert from "node:assert/strict";
import type { RideParticipantView } from "../types/navigation";
import { splitCrew } from "./crewList";

const rider = (
  riderId: string,
  displayName: string,
  progress: RideParticipantView["progress"],
): RideParticipantView => ({
  riderId,
  displayName,
  role: "member",
  isOnline: true,
  progress,
  finishedAt: null,
});

test("pulls the current rider out of the crew", () => {
  const me = rider("me", "Abhinav", "riding");
  const ravi = rider("ravi", "Ravi", "riding");

  const { self, others } = splitCrew([ravi, me], "me");

  assert.equal(self, me);
  assert.deepEqual(others, [ravi]);
});

test("lists riders still out first, then finished riders, then those not started", () => {
  const crew = [
    rider("a", "Asha", "not_started"),
    rider("b", "Bala", "arrived"),
    rider("c", "Chitra", "riding"),
    rider("d", "Dev", "left_early"),
    rider("e", "Esha", "group_ended"),
  ];

  const { others } = splitCrew(crew, undefined);

  assert.deepEqual(
    others.map((p) => p.displayName),
    ["Chitra", "Bala", "Dev", "Esha", "Asha"],
  );
});

test("keeps riders in the same state in alphabetical order", () => {
  const crew = [rider("z", "Zoya", "riding"), rider("a", "arun", "riding"), rider("m", "Meera", "riding")];

  const { others } = splitCrew(crew, undefined);

  assert.deepEqual(others.map((p) => p.displayName), ["arun", "Meera", "Zoya"]);
});

test("has no self when the current rider is not in the crew", () => {
  const { self, others } = splitCrew([rider("ravi", "Ravi", "riding")], "me");

  assert.equal(self, null);
  assert.equal(others.length, 1);
});
