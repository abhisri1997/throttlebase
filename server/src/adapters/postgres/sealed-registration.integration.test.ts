import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";
import { createRegistrationSealer } from "../crypto/registrationSealer.js";
import { generateSealingKeyPair, keyIdOf } from "../crypto/sealedBox.js";

/**
 * Deleting an account seals what the rider gave to register, for 180 days
 * (IT Rules 2021, Rule 3(1)(h); plans/account-deletion.md, step 4). Only the
 * holder of the offline private key can open it, every opening is logged
 * first, a legal hold keeps it past its time, and the app's role can't read it.
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
const repository = CONNECTION ? await import("./riderRepository.js") : null;
const store = CONNECTION ? await import("./sealedRecordStore.js") : null;
const purge = CONNECTION ? await import("../../workers/processors/registration-records-purge.processor.js") : null;

const LEAVER = "8a8a8a8a-0000-0000-0000-0000000000f1";

const keys = generateSealingKeyPair();
const otherKeys = generateSealingKeyPair();
const who = { actor: "Operator", reason: "Test order 1/2026" };

test("deleting an account seals its registration record", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  const clearSealed = async () => {
    await admin.query(`DELETE FROM sealed.registration_records WHERE rider_id = $1`, [LEAVER]);
    await admin.query(`DELETE FROM sealed.access_log WHERE rider_id = $1`, [LEAVER]);
  };
  t.after(async () => {
    await clearSealed();
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await clearSealed();
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username, phone_number, created_at)
     VALUES ($1, 'leaver@example.test', 'Leaver', 'leaver', '+910000000001', timestamptz '2026-02-01 10:00Z')
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, username = EXCLUDED.username,
           phone_number = EXCLUDED.phone_number, created_at = EXCLUDED.created_at,
           deleted_at = NULL, purged_at = NULL`,
    [LEAVER],
  );
  await admin.query(`DELETE FROM rider_identities WHERE rider_id = $1`, [LEAVER]);
  await admin.query(`DELETE FROM rider_consents WHERE rider_id = $1`, [LEAVER]);
  await admin.query(
    `INSERT INTO rider_identities (provider, subject, rider_id, email)
     VALUES ('google', 'g-leaver-1', $1, 'leaver@example.test'), ('email', 'leaver@example.test', $1, 'leaver@example.test')`,
    [LEAVER],
  );
  // Sign-up, then a later re-consent from elsewhere: the first is what's sealed.
  await admin.query(
    `INSERT INTO rider_consents (rider_id, terms_version, privacy_version, accepted_at, ip)
     VALUES ($1, '2026-01-01', '2026-01-01', timestamptz '2026-02-01 10:00:05Z', '203.0.113.7'),
            ($1, '2026-09-29', '2026-09-29', timestamptz '2026-09-29 12:00Z', '203.0.113.99')`,
    [LEAVER],
  );

  const riders = repository!.createRiderRepository(admin, createRegistrationSealer(keys.publicKeyPem));
  const deletedAt = new Date("2026-10-01T09:00:00.000Z");
  assert.equal(await riders.softDeleteAndUnlink(LEAVER, deletedAt), true);

  const sealedRow = async () =>
    (await admin.query(`SELECT * FROM sealed.registration_records WHERE rider_id = $1`, [LEAVER])).rows[0];
  const accessLog = async () =>
    (await admin.query(`SELECT action, reason, actor FROM sealed.access_log WHERE rider_id = $1 ORDER BY at`, [LEAVER]))
      .rows;

  await t.test("one sealed record, kept 180 days, naming the key that sealed it", async () => {
    const row = await sealedRow();
    assert.equal(row.key_id, keyIdOf(keys.publicKeyPem));
    assert.equal(new Date(row.cancelled_at).toISOString(), deletedAt.toISOString());
    assert.equal(new Date(row.purge_after).toISOString(), "2027-03-30T09:00:00.000Z");
    // Only ciphertext: none of the details are readable in the database.
    const stored = JSON.stringify(row.sealed);
    for (const detail of ["leaver@example.test", "Leaver", "+910000000001", "203.0.113.7", "g-leaver-1"]) {
      assert.equal(stored.includes(detail), false, detail);
    }
  });

  await t.test("the account itself is cleared, as before", async () => {
    const rider = (await admin.query(`SELECT email, display_name, phone_number FROM riders WHERE id = $1`, [LEAVER])).rows[0];
    assert.deepEqual(rider, { email: null, display_name: "Deleted rider", phone_number: null });
    const identities = await admin.query(`SELECT 1 FROM rider_identities WHERE rider_id = $1`, [LEAVER]);
    assert.equal(identities.rows.length, 0);
  });

  await t.test("the private key opens it, and the opening is logged first", async () => {
    const { sign_in_methods: methods, ...record } = await store!.openSealedRecord(admin, LEAVER, keys.privateKeyPem, who);
    assert.deepEqual(record, {
      rider_id: LEAVER,
      email: "leaver@example.test",
      display_name: "Leaver",
      username: "leaver",
      phone_number: "+910000000001",
      registered_at: "2026-02-01T10:00:00.000Z",
      sign_up_ip: "203.0.113.7",
      sign_up_at: "2026-02-01T10:00:05.000Z",
      cancelled_at: deletedAt.toISOString(),
    });
    assert.deepEqual(
      methods.map((method) => `${method.provider}:${method.subject}`).sort(),
      ["email:leaver@example.test", "google:g-leaver-1"],
    );
    assert.deepEqual(await accessLog(), [{ action: "opened", reason: "Test order 1/2026", actor: "Operator" }]);
  });

  await t.test("another key, or no reason given, opens nothing and logs nothing", async () => {
    await assert.rejects(store!.openSealedRecord(admin, LEAVER, otherKeys.privateKeyPem, who), /sealed with key/);
    await assert.rejects(store!.openSealedRecord(admin, LEAVER, keys.privateKeyPem, { actor: "Operator", reason: " " }), /reason/);
    assert.equal((await accessLog()).length, 1);
  });

  await t.test("deleting again seals nothing more", async () => {
    assert.equal(await riders.softDeleteAndUnlink(LEAVER, new Date()), false);
    const count = await admin.query(`SELECT count(*)::int AS n FROM sealed.registration_records WHERE rider_id = $1`, [LEAVER]);
    assert.equal(count.rows[0].n, 1);
  });

  await t.test("a held record outlives its 180 days; released, the daily purge takes it", async () => {
    await admin.query(`UPDATE sealed.registration_records SET purge_after = now() - interval '1 day' WHERE rider_id = $1`, [
      LEAVER,
    ]);
    await store!.setLegalHold(admin, LEAVER, new Date(Date.now() + 30 * 24 * 3600 * 1000), who);
    await purge!.processRegistrationRecordsPurge({});
    assert.ok(await sealedRow(), "held: kept");

    await store!.releaseLegalHold(admin, LEAVER, { actor: "Operator", reason: "Order closed" });
    const result = await purge!.processRegistrationRecordsPurge({});
    assert.ok(Number(result.purged) >= 1);
    assert.equal(await sealedRow(), undefined);
    assert.deepEqual(
      (await accessLog()).map((entry) => entry.action),
      ["opened", "hold_set", "hold_released"],
    );
  });

  await t.test("the app's own role can't read sealed records", async () => {
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE throttlebase_app");
      await assert.rejects(client.query(`SELECT * FROM sealed.registration_records`), /permission denied/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
