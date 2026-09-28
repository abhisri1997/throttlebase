import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_RIDER_FIELDS, toPublicRider } from "./publicRider.js";
import type { RiderProfile } from "./rider.service.js";

const fullProfile: RiderProfile = {
  id: "11111111-0000-0000-0000-000000000001",
  email: "rider@example.test",
  is_admin: true,
  display_name: "Asha",
  username: "asha",
  bio: "Weekend tourer",
  profile_picture_url: "https://media.example.test/a.jpg",
  experience_level: "intermediate",
  location_city: "Bengaluru",
  location_region: "Karnataka",
  phone_number: "+919999999999",
  weight_kg: 72,
  total_rides: 12,
  total_distance_km: 840.5,
  total_ride_time_sec: 64000,
  follower_count: 3,
  following_count: 5,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-28T00:00:00.000Z",
  location_coords: { type: "Point", coordinates: [77.59, 12.97] },
};

test("another rider sees only the allowlisted fields", () => {
  const view = toPublicRider(fullProfile, false);

  assert.deepEqual(Object.keys(view).sort(), [...PUBLIC_RIDER_FIELDS, "is_following"].sort());
});

test("contact, body, admin and location details never leave the server", () => {
  const view = toPublicRider(fullProfile, true) as Record<string, unknown>;

  for (const field of [
    "email",
    "phone_number",
    "weight_kg",
    "location_coords",
    "location_region",
    "is_admin",
    "updated_at",
  ]) {
    assert.equal(field in view, false, `${field} must not be in a public profile`);
  }
});

test("a column added to the profile later stays private until allowlisted", () => {
  const withNewColumn = { ...fullProfile, emergency_contact: "+918888888888" } as RiderProfile;

  const view = toPublicRider(withNewColumn, false) as Record<string, unknown>;

  assert.equal("emergency_contact" in view, false);
});

test("the public fields and the follow state come through unchanged", () => {
  const view = toPublicRider(fullProfile, true);

  assert.equal(view.display_name, "Asha");
  assert.equal(view.username, "asha");
  assert.equal(view.location_city, "Bengaluru");
  assert.equal(view.total_distance_km, 840.5);
  assert.equal(view.is_following, true);
});
