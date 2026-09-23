import test from "node:test";
import assert from "node:assert/strict";
import type { VerifiedIdentity } from "../../ports/IdentityVerifier.js";
import { buildHarness, testContext } from "../testing/harness.js";
import { AuthError } from "./errors.js";
import { resolveOrCreateRider } from "./resolveOrCreateRider.js";

const googleIdentity = (
  overrides: Partial<VerifiedIdentity> = {},
): VerifiedIdentity => ({
  provider: "google",
  subject: "google-sub-1",
  email: "rider@example.com",
  emailVerified: true,
  displayName: "Ada Rider",
  avatarUrl: "https://example.com/a.png",
  ...overrides,
});

test("creates a rider, settings, consent and login activity on first sign-in", async () => {
  // Arrange
  const h = buildHarness();

  // Act
  const result = await resolveOrCreateRider(h, googleIdentity(), testContext());

  // Assert
  assert.equal(result.isNewRider, true);
  assert.equal(result.needsOnboarding, true);
  assert.equal(h.riders.state.riders.length, 1);
  assert.equal(h.riders.state.riders[0]?.displayName, "Ada Rider");
  assert.equal(h.riders.state.riders[0]?.email, "rider@example.com");
  assert.deepEqual(h.riders.state.settings, [result.riderId]);
  assert.equal(h.riders.state.consents.length, 1);
  assert.equal(h.riders.state.loginActivity.length, 1);
});

test("falls back to 'Rider' when the provider supplies no display name", async () => {
  const h = buildHarness();

  const result = await resolveOrCreateRider(
    h,
    googleIdentity({ displayName: null }),
    testContext(),
  );

  const rider = h.riders.state.riders.find((r) => r.id === result.riderId);
  assert.equal(rider?.displayName, "Rider");
});

test("returns an existing rider as a login, without a second consent row", async () => {
  // Arrange
  const h = buildHarness();
  const first = await resolveOrCreateRider(h, googleIdentity(), testContext());

  // Act
  const second = await resolveOrCreateRider(h, googleIdentity(), testContext());

  // Assert
  assert.equal(second.riderId, first.riderId);
  assert.equal(second.isNewRider, false);
  assert.equal(h.riders.state.riders.length, 1);
  assert.equal(h.riders.state.consents.length, 1);
  assert.equal(h.riders.state.loginActivity.length, 2);
});

test("reports needsOnboarding false once a username exists", async () => {
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-existing", username: "ada" });
  h.riders.seedIdentity("google", "google-sub-1", "rider-existing");

  const result = await resolveOrCreateRider(h, googleIdentity(), testContext());

  assert.equal(result.needsOnboarding, false);
});

test("links a new identity to an existing rider with the same verified email", async () => {
  // Arrange
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-1", email: "rider@example.com", username: "ada" });

  // Act
  const result = await resolveOrCreateRider(
    h,
    googleIdentity({ provider: "apple", subject: "apple-sub-1" }),
    testContext(),
  );

  // Assert
  assert.equal(result.riderId, "rider-1");
  assert.equal(result.isNewRider, false);
  assert.equal(h.riders.state.riders.length, 1);
});

test("does NOT link on an unverified email — it creates a separate rider", async () => {
  // Arrange
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-1", email: "rider@example.com", username: "ada" });

  // Act
  const result = await resolveOrCreateRider(
    h,
    googleIdentity({ emailVerified: false }),
    testContext(),
  );

  // Assert: an unverified address proves nothing, so it must not grant access
  assert.notEqual(result.riderId, "rider-1");
  assert.equal(result.isNewRider, true);
  assert.equal(h.riders.state.riders.length, 2);
  const created = h.riders.state.riders.find((r) => r.id === result.riderId);
  assert.equal(created?.email, null, "unverified address must not be stored");
});

test("never links on an Apple private-relay address", async () => {
  // Arrange
  const h = buildHarness();
  h.riders.seedRider({
    id: "rider-1",
    email: "abc123@privaterelay.appleid.com",
    username: "ada",
  });

  // Act
  const result = await resolveOrCreateRider(
    h,
    googleIdentity({
      provider: "apple",
      subject: "apple-sub-2",
      email: "abc123@privaterelay.appleid.com",
      emailVerified: true,
    }),
    testContext(),
  );

  // Assert
  assert.notEqual(result.riderId, "rider-1");
  assert.equal(h.riders.state.riders.length, 2);
});

test("a concurrent first sign-in resolves to one rider, not two", async () => {
  // Arrange: a peer transaction inserts the same identity mid-flight
  const h = buildHarness();
  h.riders.onBeforeLinkIdentity = () => {
    h.riders.commitExternally((state) => {
      state.riders.push({
        id: "rider-winner",
        email: null,
        displayName: "Winner",
        username: "winner",
        avatarUrl: null,
        createdAt: new Date(),
        experienceLevel: null,
        locationCity: null,
        deletedAt: null,
      });
      state.identities.push({
        key: "google:google-sub-1",
        riderId: "rider-winner",
        email: null,
      });
    });
  };

  // Act
  const result = await resolveOrCreateRider(h, googleIdentity(), testContext());

  // Assert: the loser rolls back and retries as a login
  assert.equal(result.riderId, "rider-winner");
  assert.equal(result.isNewRider, false);
  assert.equal(
    h.riders.state.riders.length,
    1,
    "the rolled-back rider must not survive",
  );
});

test("refuses to create an account without the current terms version", async () => {
  const h = buildHarness();

  await assert.rejects(
    () =>
      resolveOrCreateRider(
        h,
        googleIdentity(),
        testContext({ acceptedTermsVersion: "1999-01-01" }),
      ),
    (error: unknown) =>
      error instanceof AuthError && error.code === "CONSENT_REQUIRED",
  );

  assert.equal(h.riders.state.riders.length, 0);
});

test("an existing rider signing in does not need to re-accept terms", async () => {
  const h = buildHarness();
  h.riders.seedRider({ id: "rider-1", username: "ada" });
  h.riders.seedIdentity("google", "google-sub-1", "rider-1");

  const result = await resolveOrCreateRider(
    h,
    googleIdentity(),
    testContext({ acceptedTermsVersion: null }),
  );

  assert.equal(result.riderId, "rider-1");
});
