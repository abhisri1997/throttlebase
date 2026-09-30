import test from "node:test";
import assert from "node:assert/strict";
import { FakeClock, FakeRiderRepository, FakeSessionRepository } from "../testing/fakes.js";
import { AuthError } from "../auth/errors.js";
import { completeOnboarding, isUsernameAvailable } from "./completeOnboarding.js";

const buildDeps = () => {
  const riders = new FakeRiderRepository();
  const sessions = new FakeSessionRepository();
  const clock = new FakeClock();
  return { riders, sessions, clock };
};

test("sets username, profile and an optional first vehicle", async () => {
  // Arrange
  const deps = buildDeps();
  deps.riders.seedRider({ id: "rider-1" });

  // Act
  const rider = await completeOnboarding(deps, {
    riderId: "rider-1",
    username: "AdaRider",
    displayName: "Ada Rider",
    experienceLevel: "intermediate",
    locationCity: "Bengaluru",
    firstVehicle: {
      make: "Royal Enfield",
      model: "Himalayan",
      year: 2024,
      engineCapacityCc: 452,
    },
  });

  // Assert
  assert.equal(rider.username, "adarider");
  assert.equal(rider.displayName, "Ada Rider");
  assert.equal(deps.riders.state.vehicles.length, 1);
});

test("onboarding without a vehicle is allowed", async () => {
  const deps = buildDeps();
  deps.riders.seedRider({ id: "rider-1" });

  await completeOnboarding(deps, {
    riderId: "rider-1",
    username: "ada",
    displayName: "Ada",
    experienceLevel: "beginner",
    locationCity: null,
    firstVehicle: null,
  });

  assert.equal(deps.riders.state.vehicles.length, 0);
});

test("refuses a username another rider already holds", async () => {
  // Arrange
  const deps = buildDeps();
  deps.riders.seedRider({ id: "rider-1" });
  deps.riders.seedRider({ id: "rider-2", username: "ada" });

  // Assert
  await assert.rejects(
    () =>
      completeOnboarding(deps, {
        riderId: "rider-1",
        username: "ada",
        displayName: "Ada",
        experienceLevel: "beginner",
        locationCity: null,
        firstVehicle: null,
      }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "USERNAME_TAKEN",
  );
});

test("lets a rider keep their own username", async () => {
  const deps = buildDeps();
  deps.riders.seedRider({ id: "rider-1", username: "ada" });

  const rider = await completeOnboarding(deps, {
    riderId: "rider-1",
    username: "ada",
    displayName: "Ada",
    experienceLevel: "beginner",
    locationCity: null,
    firstVehicle: null,
  });

  assert.equal(rider.username, "ada");
});

test("rejects an empty display name", async () => {
  const deps = buildDeps();
  deps.riders.seedRider({ id: "rider-1" });

  await assert.rejects(() =>
    completeOnboarding(deps, {
      riderId: "rider-1",
      username: "ada",
      displayName: "   ",
      experienceLevel: "beginner",
      locationCity: null,
      firstVehicle: null,
    }),
  );
});

test("username availability reflects existing riders", async () => {
  const deps = buildDeps();
  deps.riders.seedRider({ id: "rider-1", username: "ada" });

  assert.equal((await isUsernameAvailable(deps, "ada")).available, false);
  assert.equal((await isUsernameAvailable(deps, "bob")).available, true);
  assert.equal((await isUsernameAvailable(deps, "admin")).reason, "reserved");
});
