import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import type { VerifiedIdentity } from "../../ports/IdentityVerifier.js";
import { AuthError } from "../../core/auth/errors.js";
import { issueSession } from "../../core/auth/issueSession.js";
import { logout, logoutAll } from "../../core/auth/logout.js";
import { refreshSession } from "../../core/auth/refreshSession.js";
import { resolveOrCreateRider } from "../../core/auth/resolveOrCreateRider.js";
import { startEmailLogin } from "../../core/auth/startEmailLogin.js";
import { verifyEmailLogin } from "../../core/auth/verifyEmailLogin.js";
import type { AuthPolicy, RequestContext } from "../../core/auth/types.js";
import { createConsoleEmailSender } from "../email/consoleEmailSender.js";
import { nodeHasher } from "../system/nodeHasher.js";
import { nodeRandomSource } from "../system/nodeRandomSource.js";
import { systemClock } from "../system/systemClock.js";
import { runMigrations } from "./migrate.js";
import { createOtpStore } from "./otpStore.js";
import { createRateLimiter } from "./rateLimiter.js";
import { createRiderRepository } from "./riderRepository.js";
import { createSessionRepository } from "./sessionRepository.js";

/**
 * The whole auth stack against a real database, as the least-privilege role.
 *
 * The unit tests prove the use cases are correct against fakes. This proves
 * the adapters honour the same contracts through actual SQL, under the row
 * policies — which is where the interesting failures live, because a policy
 * that silently filters a row looks exactly like a logic bug from above.
 *
 *   docker run -d --name tb-test -e POSTGRES_PASSWORD=testpw \
 *     -e POSTGRES_DB=tb_test -p 55435:5432 imresamu/postgis:17-3.5
 *   TEST_DATABASE_URL=postgresql://postgres:testpw@127.0.0.1:55435/tb_test \
 *     npm run test:integration
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const APP_PASSWORD = "integration-test-pw";

const TERMS = "2026-01-01";

const policy: AuthPolicy = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  otpTtlSeconds: 600,
  otpMaxAttempts: 5,
  otpCodeLength: 6,
  refreshTokenBytes: 32,
  consent: { terms: TERMS, privacy: TERMS },
  otpRateLimits: {
    startPerEmailShort: { limit: 3, windowSeconds: 900 },
    startPerEmailDaily: { limit: 10, windowSeconds: 86_400 },
    startPerIp: { limit: 50, windowSeconds: 900 },
    verifyPerIp: { limit: 50, windowSeconds: 900 },
  },
};

const ctx: RequestContext = {
  ipAddress: "203.0.113.10",
  userAgent: "ThrottleBase/1.0 (integration)",
  acceptedTermsVersion: TERMS,
};

const identity = (
  overrides: Partial<VerifiedIdentity> = {},
): VerifiedIdentity => ({
  provider: "google",
  subject: `google-${Math.random().toString(36).slice(2)}`,
  email: null,
  emailVerified: false,
  displayName: "Integration Rider",
  avatarUrl: null,
  ...overrides,
});

/** An access-token issuer that needs no key material. */
const stubTokenIssuer = {
  issueAccessToken: (subject: { riderId: string }) =>
    Promise.resolve({
      token: `access-${subject.riderId}`,
      expiresAt: new Date(Date.now() + 900_000),
    }),
};

test(
  "the auth stack works through real adapters as throttlebase_app",
  { skip: CONNECTION ? false : "set TEST_DATABASE_URL to run" },
  async (t) => {
    const admin = new pg.Pool({ connectionString: CONNECTION });
    await runMigrations(admin);
    await admin.query(
      `ALTER ROLE throttlebase_app WITH LOGIN PASSWORD '${APP_PASSWORD}'`,
    );

    const url = new URL(CONNECTION as string);
    url.username = "throttlebase_app";
    url.password = APP_PASSWORD;
    const pool = new pg.Pool({ connectionString: url.toString() });

    const deps = {
      riders: createRiderRepository(pool),
      sessions: createSessionRepository(pool),
      otps: createOtpStore(pool),
      rateLimiter: createRateLimiter(pool),
      email: createConsoleEmailSender(),
      hasher: nodeHasher,
      random: nodeRandomSource,
      clock: systemClock,
      tokenIssuer: stubTokenIssuer,
      policy,
    };

    t.after(async () => {
      await pool.end();
      await admin.end();
    });

    await t.test(
      "first sign-in creates a rider with settings and consent",
      async () => {
        const id = identity();

        const result = await resolveOrCreateRider(deps, id, ctx);

        assert.equal(result.isNewRider, true);
        assert.equal(result.needsOnboarding, true);

        // Row policies must not have silently swallowed the dependent inserts.
        const settings = await admin.query(
          "SELECT 1 FROM rider_settings WHERE rider_id = $1",
          [result.riderId],
        );
        const privacy = await admin.query(
          "SELECT 1 FROM rider_privacy_settings WHERE rider_id = $1",
          [result.riderId],
        );
        const consent = await admin.query<{ terms_version: string }>(
          "SELECT terms_version FROM rider_consents WHERE rider_id = $1",
          [result.riderId],
        );
        const activity = await admin.query(
          "SELECT 1 FROM login_activity WHERE rider_id = $1",
          [result.riderId],
        );

        assert.equal(settings.rowCount, 1, "rider_settings row must exist");
        assert.equal(privacy.rowCount, 1, "rider_privacy_settings row must exist");
        assert.equal(consent.rows[0]?.terms_version, TERMS);
        assert.equal(activity.rowCount, 1);
      },
    );

    await t.test("signing in again is a login, not a second rider", async () => {
      const id = identity();

      const first = await resolveOrCreateRider(deps, id, ctx);
      const second = await resolveOrCreateRider(deps, id, ctx);

      assert.equal(second.riderId, first.riderId);
      assert.equal(second.isNewRider, false);
    });

    await t.test(
      "a verified email links a second provider to one rider",
      async () => {
        const email = `link-${Date.now()}@example.test`;

        const google = await resolveOrCreateRider(
          deps,
          identity({ email, emailVerified: true }),
          ctx,
        );
        const apple = await resolveOrCreateRider(
          deps,
          identity({
            provider: "apple",
            subject: `apple-${Date.now()}`,
            email,
            emailVerified: true,
          }),
          ctx,
        );

        assert.equal(apple.riderId, google.riderId);
        assert.equal(apple.isNewRider, false);

        const identities = await admin.query<{ provider: string }>(
          "SELECT provider FROM rider_identities WHERE rider_id = $1 ORDER BY provider",
          [google.riderId],
        );
        assert.deepEqual(
          identities.rows.map((r) => r.provider),
          ["apple", "google"],
        );
      },
    );

    await t.test("an Apple private-relay address never links", async () => {
      const email = `relay-${Date.now()}@privaterelay.appleid.com`;

      const first = await resolveOrCreateRider(
        deps,
        identity({ email, emailVerified: true }),
        ctx,
      );
      const second = await resolveOrCreateRider(
        deps,
        identity({
          provider: "apple",
          subject: `apple-relay-${Date.now()}`,
          email,
          emailVerified: true,
        }),
        ctx,
      );

      assert.notEqual(second.riderId, first.riderId);
    });

    await t.test("refresh rotates the token and keeps the family", async () => {
      const rider = await resolveOrCreateRider(deps, identity(), ctx);
      const first = await issueSession(deps, {
        riderId: rider.riderId,
        roles: [],
        ctx,
      });

      const second = await refreshSession(deps, {
        refreshToken: first.refreshToken,
        ctx,
      });

      assert.notEqual(second.refreshToken, first.refreshToken);
      assert.equal(second.riderId, rider.riderId);

      const rows = await admin.query<{
        family_id: string;
        replaced_by: string | null;
      }>(
        "SELECT family_id, replaced_by FROM sessions WHERE rider_id = $1 ORDER BY created_at",
        [rider.riderId],
      );
      assert.equal(rows.rowCount, 2);
      assert.equal(rows.rows[0]?.family_id, rows.rows[1]?.family_id);
      assert.ok(rows.rows[0]?.replaced_by, "the spent token records its successor");
    });

    await t.test(
      "replaying a spent refresh token revokes the whole family",
      async () => {
        const rider = await resolveOrCreateRider(deps, identity(), ctx);
        const first = await issueSession(deps, {
          riderId: rider.riderId,
          roles: [],
          ctx,
        });
        const second = await refreshSession(deps, {
          refreshToken: first.refreshToken,
          ctx,
        });

        await assert.rejects(
          () => refreshSession(deps, { refreshToken: first.refreshToken, ctx }),
          (error: unknown) =>
            error instanceof AuthError && error.code === "REFRESH_TOKEN_REUSED",
        );

        // The honest client's live token dies too — we cannot tell which side
        // of the replay was the thief.
        await assert.rejects(
          () => refreshSession(deps, { refreshToken: second.refreshToken, ctx }),
          (error: unknown) =>
            error instanceof AuthError && error.code === "REFRESH_TOKEN_INVALID",
        );

        const live = await admin.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM sessions WHERE rider_id = $1 AND revoked_at IS NULL",
          [rider.riderId],
        );
        assert.equal(live.rows[0]?.n, 0);
      },
    );

    await t.test(
      "logout kills one family, logoutAll kills every family",
      async () => {
        const rider = await resolveOrCreateRider(deps, identity(), ctx);
        const deviceA = await issueSession(deps, {
          riderId: rider.riderId,
          roles: [],
          ctx,
        });
        const deviceB = await issueSession(deps, {
          riderId: rider.riderId,
          roles: [],
          ctx,
        });

        await logout(deps, deviceA.refreshToken);

        await assert.rejects(() =>
          refreshSession(deps, { refreshToken: deviceA.refreshToken, ctx }),
        );
        const stillGood = await refreshSession(deps, {
          refreshToken: deviceB.refreshToken,
          ctx,
        });
        assert.equal(stillGood.riderId, rider.riderId);

        const revoked = await logoutAll(deps, rider.riderId);
        assert.ok(revoked.revoked >= 1);
        await assert.rejects(() =>
          refreshSession(deps, { refreshToken: stillGood.refreshToken, ctx }),
        );
      },
    );

    await t.test("the email code flow signs a rider in end to end", async () => {
      const email = `otp-${Date.now()}@example.test`;

      await startEmailLogin(deps, { email, ctx });

      // Read the digest back as admin and search the six-digit space for it —
      // the code itself is never stored, which is the point.
      const stored = await admin.query<{ code_hash: string }>(
        "SELECT code_hash FROM email_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1",
        [email],
      );
      const hash = stored.rows[0]?.code_hash;
      assert.ok(hash, "a code must have been issued");

      let code: string | null = null;
      for (let i = 0; i < 1_000_000; i += 1) {
        const candidate = String(i).padStart(6, "0");
        if (nodeHasher.sha256Hex(candidate) === hash) {
          code = candidate;
          break;
        }
      }
      assert.ok(code, "the stored digest must be a digest of a 6-digit code");

      const result = await verifyEmailLogin(deps, { email, code, ctx });

      assert.equal(result.isNewRider, true);
      assert.ok(result.refreshToken);

      const rider = await admin.query<{ email: string }>(
        "SELECT email FROM riders WHERE id = $1",
        [result.riderId],
      );
      assert.equal(rider.rows[0]?.email, email);
    });

    await t.test("a wrong code is refused and the attempt is counted", async () => {
      const email = `wrong-${Date.now()}@example.test`;
      await startEmailLogin(deps, { email, ctx });

      await assert.rejects(
        () => verifyEmailLogin(deps, { email, code: "000000", ctx }),
        (error: unknown) => error instanceof AuthError,
      );

      const row = await admin.query<{ attempts: number }>(
        "SELECT attempts FROM email_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1",
        [email],
      );
      assert.equal(row.rows[0]?.attempts, 1);
    });

    await t.test("the per-address rate limit actually bites", async () => {
      const email = `limit-${Date.now()}@example.test`;

      for (let i = 0; i < policy.otpRateLimits.startPerEmailShort.limit; i += 1) {
        await startEmailLogin(deps, { email, ctx });
      }

      await assert.rejects(
        () => startEmailLogin(deps, { email, ctx }),
        (error: unknown) =>
          error instanceof AuthError && error.code === "RATE_LIMITED",
      );
    });
  },
);
