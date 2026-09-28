import test from "node:test";
import assert from "node:assert/strict";
import { initialStopEdits, keptStopsForSave, stopChoiceDetail, type StopChoice } from "./stopChoices";

const choice = (overrides: Partial<StopChoice> & Pick<StopChoice, "key">): StopChoice => ({
  kind: "planned",
  status: "visited",
  ride_stop_id: null,
  name: "Infosys Campus Building 37",
  distance_from_start_km: 3.29,
  stopped_s: 780,
  walked_away: true,
  suggested: true,
  ...overrides,
});

const infosys = choice({ key: "planned:infosys", ride_stop_id: "infosys" });
const temple = choice({ key: "found:1", kind: "discovered", status: "found", name: "Hanumanthnagar, Bengaluru", stopped_s: 8160 });
const stretch = choice({
  key: "found:2",
  kind: "discovered",
  status: "found",
  name: "Silk Board, Bengaluru",
  stopped_s: 360,
  walked_away: false,
  suggested: false,
});
const cafe = choice({ key: "planned:cafe", name: "Cafe Wavy Cap", status: "skipped", distance_from_start_km: null, stopped_s: null, walked_away: false, suggested: false });

test("each stop says where it is on the route and what happened there", () => {
  assert.equal(stopChoiceDetail(infosys), "3.3 km in · stopped 13 min, walked off");
  assert.equal(stopChoiceDetail(temple), "3.3 km in · stopped 2 hr 16 min, walked off");
  assert.equal(stopChoiceDetail(stretch), "3.3 km in · stopped 6 min beside the bike");
  assert.equal(stopChoiceDetail(choice({ key: "planned:fuel", stopped_s: null, walked_away: false })), "3.3 km in · rode past");
  assert.equal(stopChoiceDetail(cafe), "Skipped: the ride didn't go near it");
});

test("the sheet starts with the suggested stops ticked", () => {
  const edits = initialStopEdits([infosys, temple, stretch, cafe]);

  assert.deepEqual(
    Object.entries(edits).map(([key, edit]) => [key, edit.kept]),
    [
      ["planned:infosys", true],
      ["found:1", true],
      ["found:2", false],
      ["planned:cafe", false],
    ],
  );
});

test("saving sends the ticked stops, with a note and a name only where the rider wrote one", () => {
  const edits = {
    ...initialStopEdits([infosys, temple, stretch, cafe]),
    "planned:infosys": { kept: true, note: "  Park at the gate  ", name: "" },
    "found:1": { kept: true, note: "", name: " Hilltop temple " },
  };

  assert.deepEqual(keptStopsForSave([infosys, temple, stretch, cafe], edits), [
    { key: "planned:infosys", note: "Park at the gate" },
    { key: "found:1", name: "Hilltop temple" },
  ]);
});

test("a skipped stop is never sent, even if ticked", () => {
  const edits = { ...initialStopEdits([cafe]), "planned:cafe": { kept: true, note: "", name: "" } };

  assert.deepEqual(keptStopsForSave([cafe], edits), []);
});
