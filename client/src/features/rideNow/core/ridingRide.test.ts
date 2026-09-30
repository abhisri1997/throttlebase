import test from "node:test";
import assert from "node:assert/strict";
import { parseRidingRides } from "./ridingRide";

const ride = {
  id: "7f1c2a4e-0000-4000-8000-000000000001",
  status: "active",
  captain_id: "7f1c2a4e-0000-4000-8000-000000000002",
  title: "Morning ride",
  kind: "unplanned",
  others_on_ride: false,
  elapsed_s: 4360,
  distance_km: 38.4,
};

test("the rides being ridden are read with what the bar shows", () => {
  assert.deepEqual(parseRidingRides({ rides: [ride] }), [ride]);
});

test("an older server's rides still count, with nothing ridden yet", () => {
  const [parsed] = parseRidingRides({
    rides: [{ id: ride.id, status: "active", captain_id: ride.captain_id }],
  });
  assert.deepEqual(parsed, {
    id: ride.id,
    status: "active",
    captain_id: ride.captain_id,
    title: "",
    kind: "planned",
    others_on_ride: true,
    elapsed_s: 0,
    distance_km: 0,
  });
});

test("a malformed ride is dropped rather than failing the others", () => {
  assert.deepEqual(parseRidingRides({ rides: [{ id: 5 }, ride] }), [ride]);
});

test("a response without rides reads as none", () => {
  assert.deepEqual(parseRidingRides(null), []);
  assert.deepEqual(parseRidingRides({ rides: "nope" }), []);
});
