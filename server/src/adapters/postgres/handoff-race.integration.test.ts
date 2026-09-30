import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";
import { createRegistrationSealer } from "../crypto/registrationSealer.js";
import { generateSealingKeyPair } from "../crypto/sealedBox.js";

/** Seals deleted accounts' registration records with a throwaway key. */
const testSealer = createRegistrationSealer(generateSealingKeyPair().publicKeyPem);

/**
 * A rider chosen to take over can be deleting their own account at the
 * same moment. The hand-over must wait for that deletion and then pass
 * over them, never hand a ride or group to an account that is gone.
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

const CAP = "5e5e5e5e-0000-0000-0000-0000000000f1"; // leads a ride, deletes their account
const OWNER = "5e5e5e5e-0000-0000-0000-0000000000f4"; // owns a group, deletes their account
const NEXT = "5e5e5e5e-0000-0000-0000-0000000000f2"; // first in line for both, deleting too
const THIRD = "5e5e5e5e-0000-0000-0000-0000000000f3";
const RIDERS = [CAP, OWNER, NEXT, THIRD];

/** How long the other deletions get to reach their hand-over before NEXT's commits. */
const OVERLAP_MS = 300;

test("a successor deleting their account at the same moment is passed over", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 6 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'race-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'race' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`DELETE FROM rides WHERE captain_id = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM groups WHERE created_by = ANY($1::uuid[])`, [RIDERS]);

  // CAP's ride, where NEXT is co-captain; OWNER's group, where NEXT is the other admin.
  const rideId = (
    await admin.query(
      `INSERT INTO rides (captain_id, title, status, visibility, scheduled_at)
       VALUES ($1, 'Race ride', 'scheduled', 'public', now() + interval '2 days') RETURNING id`,
      [CAP],
    )
  ).rows[0].id as string;
  await admin.query(
    `INSERT INTO ride_participants (ride_id, rider_id, role, status, joined_at) VALUES
       ($1, $2, 'captain', 'confirmed', now()),
       ($1, $3, 'co_captain', 'confirmed', now()),
       ($1, $4, 'rider', 'confirmed', now())`,
    [rideId, CAP, NEXT, THIRD],
  );
  const groupId = (
    await admin.query(`INSERT INTO groups (name, visibility, created_by) VALUES ('Race group', 'public', $1) RETURNING id`, [
      OWNER,
    ])
  ).rows[0].id as string;
  await admin.query(
    `INSERT INTO group_members (group_id, rider_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'admin'), ($1, $4, 'member')`,
    [groupId, OWNER, NEXT, THIRD],
  );

  const riders = repository!.createRiderRepository(admin, testSealer);

  // NEXT's deletion is under way: their rows are changed but not committed.
  const nextDeletion = await admin.connect();
  await nextDeletion.query("BEGIN");
  await nextDeletion.query(`UPDATE riders SET deleted_at = now() WHERE id = $1`, [NEXT]);
  await nextDeletion.query(
    `UPDATE ride_participants SET status = 'dropped_out', role = 'rider', left_at = now() WHERE rider_id = $1`,
    [NEXT],
  );

  // CAP and OWNER delete meanwhile, reaching their hand-overs while NEXT's is open.
  const deletions = Promise.all([
    riders.softDeleteAndUnlink(CAP, new Date()),
    riders.softDeleteAndUnlink(OWNER, new Date()),
  ]);
  await new Promise((resolve) => setTimeout(resolve, OVERLAP_MS));
  await nextDeletion.query("COMMIT");
  nextDeletion.release();
  assert.deepEqual(await deletions, [true, true]);

  await t.test("the ride passes to the next rider still here", async () => {
    const ride = await admin.query(`SELECT captain_id::text FROM rides WHERE id = $1`, [rideId]);
    assert.equal(ride.rows[0].captain_id, THIRD);
  });

  await t.test("the group passes to the next member still here", async () => {
    const group = await admin.query(`SELECT created_by::text FROM groups WHERE id = $1`, [groupId]);
    assert.equal(group.rows[0].created_by, THIRD);
  });
});
