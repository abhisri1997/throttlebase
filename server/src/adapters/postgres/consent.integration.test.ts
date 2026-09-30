import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";

/**
 * The consent ledger (launch readiness E6): answers are recorded against the
 * exact notice shown, the event history cannot be edited, withdrawals are
 * audited, a changed notice asks again, and the 18+ gate is one-way for the
 * app.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database (see
 * migrations.integration.test.ts for a container recipe).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
if (CONNECTION) {
  // The services read the app pool's URL at import time.
  process.env.DATABASE_URL = CONNECTION;
}

const db = CONNECTION ? await import("../../config/db.js") : null;
const consent = CONNECTION ? await import("../../services/consent.service.js") : null;
const notices = CONNECTION ? await import("../../core/consent/notices.js") : null;
const live = CONNECTION ? await import("../../services/live-session.service.js") : null;

const ASHA = "a1a1a1a1-0000-0000-0000-0000000000e1";
const BALA = "b2b2b2b2-0000-0000-0000-0000000000e2";
const CHITRA = "c3c3c3c3-0000-0000-0000-0000000000e3";
const DEV = "d4d4d4d4-0000-0000-0000-0000000000e4";
const RIDERS = [ASHA, BALA, CHITRA, DEV];

test("the consent ledger", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username) VALUES
       ($1, 'cns-asha@example.test', 'Asha', 'cnsasha'),
       ($2, 'cns-bala@example.test', 'Bala', 'cnsbala'),
       ($3, 'cns-chitra@example.test', 'Chitra', 'cnschitra'),
       ($4, 'cns-dev@example.test', 'Dev', 'cnsdev')
     ON CONFLICT (id) DO NOTHING`,
    RIDERS,
  );

  // Earlier runs' history. Deleting it is the retention purge's job, so the
  // test does it the way the purge will.
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL throttlebase.purging_consent_events = 'on'");
    await client.query(`DELETE FROM consent_state WHERE rider_id = ANY($1)`, [RIDERS]);
    await client.query(`DELETE FROM consent_events WHERE rider_id = ANY($1)`, [RIDERS]);
    await client.query(`DELETE FROM rider_declarations WHERE rider_id = ANY($1)`, [RIDERS]);
    await client.query(`DELETE FROM security_events WHERE subject_id = ANY($1) AND event LIKE 'consent.%'`, [RIDERS]);
    await client.query(`DELETE FROM rides WHERE captain_id = ANY($1)`, [RIDERS]);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  consent!.forgetConsentPermissions();

  const version = notices!.CURRENT_NOTICES.live_location_sharing.version;
  const events = async (riderId: string): Promise<{ action: string; source: string }[]> =>
    (
      await admin.query(
        `SELECT action, source FROM consent_events WHERE rider_id = $1 ORDER BY occurred_at, id`,
        [riderId],
      )
    ).rows;

  await t.test("nothing is granted until the rider says so", async () => {
    const overview = await consent!.getConsentOverview(ASHA);
    assert.ok(overview.consents.every((row) => row.status === "not_asked"));
    assert.equal(overview.declarations.age_18_plus, null);
    assert.equal(overview.notices.length, notices!.CONSENT_PURPOSES.length);
    assert.equal(await consent!.hasConsent(ASHA, "live_location_sharing"), false);
  });

  await t.test("a grant is recorded against the notice shown, with its exact text", async () => {
    const outcome = await consent!.recordConsent(ASHA, {
      purpose: "live_location_sharing",
      granted: true,
      noticeVersion: version,
      source: "onboarding",
      appVersion: "1.4.0",
      platform: "android",
    });
    assert.equal(outcome.changed, true);
    assert.equal(await consent!.hasConsent(ASHA, "live_location_sharing"), true);

    const stored = (
      await admin.query(
        `SELECT n.version, n.body, n.body_sha256, e.app_version, e.platform
           FROM consent_events e JOIN consent_notices n ON n.id = e.notice_id
          WHERE e.rider_id = $1`,
        [ASHA],
      )
    ).rows[0];
    assert.equal(stored.version, version);
    assert.equal(stored.body, notices!.CURRENT_NOTICES.live_location_sharing.body);
    assert.equal(stored.body_sha256, consent!.noticeHash(stored.body));
    assert.equal(stored.app_version, "1.4.0");
    assert.equal(stored.platform, "android");
  });

  await t.test("repeating the same answer adds nothing to the history", async () => {
    const outcome = await consent!.recordConsent(ASHA, {
      purpose: "live_location_sharing",
      granted: true,
      noticeVersion: version,
      source: "settings",
    });
    assert.equal(outcome.changed, false);
    assert.equal((await events(ASHA)).length, 1);
  });

  await t.test("a withdrawal takes effect at once and is audited", async () => {
    const outcome = await consent!.recordConsent(ASHA, {
      purpose: "live_location_sharing",
      granted: false,
      noticeVersion: version,
      source: "settings",
    });
    assert.equal(outcome.changed, true);
    assert.equal(await consent!.hasConsent(ASHA, "live_location_sharing"), false);
    assert.deepEqual(
      (await events(ASHA)).map((row) => row.action),
      ["granted", "withdrawn"],
    );

    const audit = (
      await admin.query(
        `SELECT actor_id, event, reason, metadata FROM security_events WHERE subject_id = $1 AND event LIKE 'consent.%'`,
        [ASHA],
      )
    ).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor_id, ASHA);
    assert.equal(audit[0].event, "consent.withdrawn");
    assert.equal(audit[0].reason, "live_location_sharing");
    assert.deepEqual(audit[0].metadata, { source: "settings" });
  });

  await t.test("saying no the first time is recorded but not audited as a withdrawal", async () => {
    await consent!.recordConsent(BALA, {
      purpose: "marketing_notifications",
      granted: false,
      noticeVersion: notices!.CURRENT_NOTICES.marketing_notifications.version,
      source: "onboarding",
    });
    assert.equal((await events(BALA)).length, 1);
    const audit = await admin.query(`SELECT 1 FROM security_events WHERE subject_id = $1 AND event LIKE 'consent.%'`, [
      BALA,
    ]);
    assert.equal(audit.rowCount, 0);
  });

  await t.test("an answer to a notice that is not the current one is refused and not recorded", async () => {
    await assert.rejects(
      consent!.recordConsent(BALA, {
        purpose: "ride_recording",
        granted: true,
        noticeVersion: "2020-01-01",
        source: "contextual",
      }),
      (error: unknown) => error instanceof consent!.ConsentError && error.kind === "stale_notice",
    );
    assert.equal(await consent!.hasConsent(BALA, "ride_recording"), false);
    assert.equal((await events(BALA)).length, 1);
  });

  await t.test("the history cannot be edited or deleted", async () => {
    await assert.rejects(
      admin.query(`UPDATE consent_events SET action = 'granted' WHERE rider_id = $1`, [ASHA]),
      /append-only/,
    );
    await assert.rejects(admin.query(`DELETE FROM consent_events WHERE rider_id = $1`, [ASHA]), /append-only/);
    assert.equal((await events(ASHA)).length, 2);
  });

  await t.test("a grant of an older notice asks again before the feature works", async () => {
    // Bala agreed to last year's text; the notice has since changed.
    const old = (
      await admin.query(
        `INSERT INTO consent_notices (purpose_code, version, body_sha256, body)
         VALUES ('ride_recording', '2025-01-01', 'old', 'Last year''s text.')
         ON CONFLICT (purpose_code, version, locale) DO UPDATE SET body = EXCLUDED.body
         RETURNING id`,
      )
    ).rows[0].id;
    await admin.query(
      `INSERT INTO consent_state (rider_id, purpose_code, granted, notice_id) VALUES ($1, 'ride_recording', true, $2)`,
      [BALA, old],
    );

    assert.equal(await consent!.hasConsent(BALA, "ride_recording"), false);
    const overview = await consent!.getConsentOverview(BALA);
    const row = overview.consents.find((entry) => entry.purpose === "ride_recording");
    assert.equal(row?.status, "reconsent_required");
    assert.equal(row?.answeredVersion, "2025-01-01");

    await consent!.recordConsent(BALA, {
      purpose: "ride_recording",
      granted: true,
      noticeVersion: notices!.CURRENT_NOTICES.ride_recording.version,
      source: "contextual",
    });
    assert.equal(await consent!.hasConsent(BALA, "ride_recording"), true);
  });

  await t.test("notice text changed without a new version is refused, not recorded", async () => {
    const current = notices!.CURRENT_NOTICES.public_profile;
    await admin.query(
      `INSERT INTO consent_notices (purpose_code, version, body_sha256, body)
       VALUES ('public_profile', $1, 'edited', 'Different words, same version.')
       ON CONFLICT (purpose_code, version, locale) DO NOTHING`,
      [current.version],
    );
    const stored = (
      await admin.query(`SELECT body_sha256 FROM consent_notices WHERE purpose_code = 'public_profile' AND version = $1`, [
        current.version,
      ])
    ).rows[0].body_sha256;

    // Only meaningful when this database had no real row for it yet.
    if (stored === "edited") {
      await assert.rejects(
        consent!.recordConsent(ASHA, {
          purpose: "public_profile",
          granted: true,
          noticeVersion: current.version,
          source: "settings",
        }),
        /changed without a new version/,
      );
      assert.equal(await consent!.hasConsent(ASHA, "public_profile"), false);
      await admin.query(
        `UPDATE consent_notices SET body_sha256 = $2, body = $3 WHERE purpose_code = 'public_profile' AND version = $1`,
        [current.version, consent!.noticeHash(current.body), current.body],
      );
    }
  });

  await t.test("after an under-18 answer the app cannot change it; support can", async () => {
    await consent!.recordDeclaration(BALA, { kind: "age_18_plus", answer: false, source: "onboarding" });
    assert.equal(await consent!.latestDeclaration(BALA, "age_18_plus"), false);

    await assert.rejects(
      consent!.recordDeclaration(BALA, { kind: "age_18_plus", answer: true, source: "settings" }),
      (error: unknown) => error instanceof consent!.ConsentError && error.kind === "age_declared_under_18",
    );
    assert.equal(await consent!.latestDeclaration(BALA, "age_18_plus"), false);

    await consent!.recordDeclaration(BALA, { kind: "age_18_plus", answer: true, source: "support" });
    assert.equal(await consent!.latestDeclaration(BALA, "age_18_plus"), true);
  });

  await t.test("an 18+ answer can later become a no, and both are kept", async () => {
    await consent!.recordDeclaration(ASHA, { kind: "age_18_plus", answer: true, source: "onboarding" });
    await consent!.recordDeclaration(ASHA, { kind: "age_18_plus", answer: false, source: "settings" });
    assert.equal(await consent!.latestDeclaration(ASHA, "age_18_plus"), false);
    const all = await admin.query(`SELECT answer FROM rider_declarations WHERE rider_id = $1 ORDER BY id`, [
      ASHA,
    ]);
    assert.deepEqual(
      all.rows.map((row) => row.answer),
      [true, false],
    );
  });

  await t.test("a rider never asked keeps sharing and recording, but gets no marketing", async () => {
    const permissions = await consent!.consentPermissions(DEV);
    assert.equal(permissions.live_location_sharing, true);
    assert.equal(permissions.ride_recording, true);
    assert.equal(permissions.marketing_notifications, false);
  });

  await t.test("a withdrawal closes the gate at once, despite the cache", async () => {
    const version = notices!.CURRENT_NOTICES.live_location_sharing.version;
    // Warm the cache with the open gate first.
    assert.equal((await consent!.consentPermissions(CHITRA)).live_location_sharing, true);

    await consent!.recordConsent(CHITRA, {
      purpose: "live_location_sharing",
      granted: false,
      noticeVersion: version,
      source: "settings",
    });
    assert.equal((await consent!.consentPermissions(CHITRA)).live_location_sharing, false);

    await consent!.recordConsent(CHITRA, {
      purpose: "live_location_sharing",
      granted: true,
      noticeVersion: version,
      source: "settings",
    });
    assert.equal((await consent!.consentPermissions(CHITRA)).live_location_sharing, true);
  });

  await t.test("stopping live sharing clears the rider's position in live rides only", async () => {
    const ride = async (status: string): Promise<string> =>
      (
        await admin.query(
          `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
           VALUES ($1, $2, $3, 'public', now()) RETURNING id`,
          [DEV, `Consent ${status}`, status],
        )
      ).rows[0].id as string;
    const session = async (rideId: string, status: string): Promise<string> =>
      (
        await admin.query(
          `INSERT INTO ride_live_sessions (ride_id, status, started_by, started_at) VALUES ($1, $2, $3, now()) RETURNING id`,
          [rideId, status, DEV],
        )
      ).rows[0].id as string;
    const present = async (sessionId: string, riderId: string, role: string): Promise<void> => {
      await admin.query(
        `INSERT INTO ride_live_presence (session_id, rider_id, role, is_online, last_location)
         VALUES ($1, $2, $3, true, ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326)::geography)`,
        [sessionId, riderId, role],
      );
    };

    const liveRide = await ride("active");
    const liveSession = await session(liveRide, "active");
    await present(liveSession, DEV, "captain");
    await present(liveSession, CHITRA, "member");

    const endedRide = await ride("completed");
    const endedSession = await session(endedRide, "ended");
    await present(endedSession, CHITRA, "member");

    const stopped = await live!.stopSharingLiveLocation(CHITRA);
    assert.deepEqual(stopped, [{ rideId: liveRide, sessionId: liveSession }]);

    const presence = async (sessionId: string, riderId: string) =>
      (
        await admin.query(
          `SELECT is_online, last_location IS NOT NULL AS has_location
             FROM ride_live_presence WHERE session_id = $1 AND rider_id = $2`,
          [sessionId, riderId],
        )
      ).rows[0];
    assert.deepEqual(await presence(liveSession, CHITRA), { is_online: false, has_location: false });
    // The others in the ride, and rides already over, are untouched.
    assert.deepEqual(await presence(liveSession, DEV), { is_online: true, has_location: true });
    assert.deepEqual(await presence(endedSession, CHITRA), { is_online: true, has_location: true });
  });
});
