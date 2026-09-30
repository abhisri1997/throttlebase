import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { runMigrations } from "./migrate.js";
import { createRegistrationSealer } from "../crypto/registrationSealer.js";
import { generateSealingKeyPair } from "../crypto/sealedBox.js";

/** Seals deleted accounts' registration records with a throwaway key. */
const testSealer = createRegistrationSealer(generateSealingKeyPair().publicKeyPem);

/**
 * A group carries on when the rider who runs it leaves, as a WhatsApp group
 * does: another admin takes over, otherwise the member who joined first.
 * That happens when they delete their account (in the same transaction) and
 * when they simply leave. The last member leaving ends the group; a deleted
 * account's group with nobody left is removed by the purge.
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
// Never Google in tests: the local .env may hold a real key.
const lookups = CONNECTION ? await import("../../services/community-route.service.js") : null;
const repository = CONNECTION ? await import("./riderRepository.js") : null;
const community = CONNECTION ? await import("../../services/community.service.js") : null;
const leadership = CONNECTION ? await import("../../workers/processors/group-leadership.processor.js") : null;
const purge = CONNECTION ? await import("../../workers/processors/account-purge.processor.js") : null;

const OWN = "9a9a9a9a-0000-0000-0000-0000000000e1"; // deletes their account
const ADM2 = "9a9a9a9a-0000-0000-0000-0000000000e2";
const EARLY = "9a9a9a9a-0000-0000-0000-0000000000e3";
const LATE = "9a9a9a9a-0000-0000-0000-0000000000e4";
const LEAVER = "9a9a9a9a-0000-0000-0000-0000000000e5"; // leaves without deleting
const OUT = "9a9a9a9a-0000-0000-0000-0000000000e6"; // never a member of G1
const GONE = "9a9a9a9a-0000-0000-0000-0000000000e7"; // deleted before hand-over existed
const LONG_GONE = "9a9a9a9a-0000-0000-0000-0000000000e8"; // deleted 31 days ago
const RIDERS = [OWN, ADM2, EARLY, LATE, LEAVER, OUT, GONE, LONG_GONE];

const LEADER_CHANGED_JOB = "group.leader_changed";
const ADMIN_CHANGED_NOTIFICATION = "group_admin_changed";

test("a group carries on when the rider running it leaves", { skip: !CONNECTION }, async (t) => {
  const admin = new pg.Pool({ connectionString: CONNECTION, max: 2 });

  t.after(async () => {
    await admin.end();
    await db!.default.end();
  });

  await runMigrations(admin);

  // ── Riders and groups, reset on every run.
  await admin.query(
    `INSERT INTO riders (id, email, display_name, username)
     SELECT id, 'group-' || right(id::text, 2) || '@example.test', 'Rider ' || right(id::text, 2),
            'groupr' || right(id::text, 2)
     FROM unnest($1::uuid[]) AS id
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
           username = EXCLUDED.username, deleted_at = NULL, purged_at = NULL`,
    [RIDERS],
  );
  await admin.query(`UPDATE riders SET deleted_at = now() - interval '1 day' WHERE id = $1`, [GONE]);
  await admin.query(`UPDATE riders SET deleted_at = now() - interval '31 days' WHERE id = $1`, [LONG_GONE]);
  await admin.query(`DELETE FROM groups WHERE created_by = ANY($1::uuid[])`, [RIDERS]);
  await admin.query(`DELETE FROM jobs WHERE type = $1`, [LEADER_CHANGED_JOB]);
  await admin.query(`DELETE FROM notifications WHERE rider_id = ANY($1::uuid[])`, [RIDERS]);

  /** Creates a public group; members are [riderId, role, minutes after 09:00 they joined]. */
  const group = async (creator: string, name: string, members: Array<[string, string, number]>): Promise<string> => {
    const id = (
      await admin.query(`INSERT INTO groups (name, visibility, created_by) VALUES ($1, 'public', $2) RETURNING id`, [
        name,
        creator,
      ])
    ).rows[0].id as string;
    for (const [riderId, role, minute] of members) {
      await admin.query(
        `INSERT INTO group_members (group_id, rider_id, role, joined_at)
         VALUES ($1, $2, $3, timestamptz '2026-09-20 09:00Z' + make_interval(mins => $4))`,
        [id, riderId, role, minute],
      );
    }
    return id;
  };

  const g1 = await group(OWN, "G1: has another admin", [[OWN, "admin", 0], [EARLY, "member", 1], [ADM2, "admin", 5]]);
  const g2 = await group(OWN, "G2: members only", [[OWN, "admin", 0], [LATE, "member", 9], [EARLY, "member", 1]]);
  const g3 = await group(OWN, "G3: alone", [[OWN, "admin", 0]]);
  const g5 = await group(LEAVER, "G5: leaver with a member", [[LEAVER, "admin", 0], [OUT, "member", 1]]);
  const g6 = await group(LEAVER, "G6: leaver alone", [[LEAVER, "admin", 0]]);
  const g8 = await group(GONE, "G8: already deleted creator", [[GONE, "admin", 0], [LATE, "member", 2]]);
  const g9 = await group(LONG_GONE, "G9: purged creator, alone", [[LONG_GONE, "admin", 0]]);

  const ownerOf = async (groupId: string): Promise<string | null> =>
    ((await admin.query(`SELECT created_by::text FROM groups WHERE id = $1`, [groupId])).rows[0]?.created_by as
      | string
      | undefined) ?? null;
  const roleIn = async (groupId: string, riderId: string): Promise<string | null> =>
    ((await admin.query(`SELECT role FROM group_members WHERE group_id = $1 AND rider_id = $2`, [groupId, riderId]))
      .rows[0]?.role as string | undefined) ?? null;

  await t.test("before leaving, the group says who will take over", async () => {
    const withMember = await community!.getGroupById(g5, LEAVER);
    assert.equal(withMember.next_admin?.rider_id, OUT);
    const alone = await community!.getGroupById(g6, LEAVER);
    assert.equal(alone.next_admin, null);
    const asMember = await community!.getGroupById(g5, OUT);
    assert.equal(asMember.next_admin, undefined);
  });

  // ── Act 1: OWN deletes their account.
  assert.equal(await repository!.createRiderRepository(admin, testSealer).softDeleteAndUnlink(OWN, new Date()), true);

  await t.test("another admin takes over before any member", async () => {
    assert.equal(await ownerOf(g1), ADM2);
    assert.equal(await roleIn(g1, ADM2), "admin");
  });

  await t.test("without another admin, the member who joined first takes over", async () => {
    assert.equal(await ownerOf(g2), EARLY);
    assert.equal(await roleIn(g2, EARLY), "admin");
  });

  await t.test("a handed-over group is open to everyone again", async () => {
    const listed = (await community!.listGroups(OUT, "public")).map((row: { id: string }) => row.id);
    assert.ok(listed.includes(g1));
    assert.notEqual(await community!.getGroupById(g1, OUT), null);
  });

  await t.test("a deleted rider's group with nobody left stays hidden until the purge", async () => {
    assert.equal(await ownerOf(g3), OWN);
    assert.equal(await community!.getGroupById(g3, OUT), null);
  });

  await t.test("each hand-over queues a notification job", async () => {
    const jobs = await admin.query(`SELECT payload FROM jobs WHERE type = $1`, [LEADER_CHANGED_JOB]);
    const handed = jobs.rows.map((row) => `${row.payload.groupId}→${row.payload.newAdminId}`).sort();
    assert.deepEqual(handed, [`${g1}→${ADM2}`, `${g2}→${EARLY}`].sort());
  });

  await t.test("the new admin and the members are told, once", async () => {
    await leadership!.processGroupLeaderChanged({ groupId: g2, newAdminId: EARLY, reason: "account_deleted" });
    await leadership!.processGroupLeaderChanged({ groupId: g2, newAdminId: EARLY, reason: "account_deleted" });
    const notes = await admin.query(
      `SELECT rider_id::text, title FROM notifications WHERE type = $1 AND data->>'group_id' = $2`,
      [ADMIN_CHANGED_NOTIFICATION, g2],
    );
    const titles = new Map(notes.rows.map((row) => [row.rider_id as string, row.title as string]));
    assert.equal(notes.rows.length, 2);
    assert.match(titles.get(EARLY) ?? "", /You're now the admin/);
    assert.ok(titles.has(LATE));
    assert.equal(titles.has(OWN), false);
  });

  // ── Act 2: leaving without deleting the account.
  await t.test("a creator who leaves hands the group to the next member", async () => {
    assert.equal(await community!.leaveGroup(g5, LEAVER), "handed_over");
    assert.equal(await ownerOf(g5), OUT);
    assert.equal(await roleIn(g5, OUT), "admin");
    assert.equal(await roleIn(g5, LEAVER), null);
    // Listing their groups doesn't quietly make them admin again.
    const theirs = (await community!.listGroups(LEAVER, "joined")).map((row: { id: string }) => row.id);
    assert.equal(theirs.includes(g5), false);
    const jobs = await admin.query(`SELECT payload FROM jobs WHERE type = $1 AND payload->>'groupId' = $2`, [
      LEADER_CHANGED_JOB,
      g5,
    ]);
    assert.equal(jobs.rows[0]?.payload.reason, "left");
  });

  await t.test("the last member leaving ends the group", async () => {
    assert.equal(await community!.leaveGroup(g6, LEAVER), "group_deleted");
    assert.equal(await ownerOf(g6), null);
  });

  await t.test("a member simply leaves, and someone not in the group can't", async () => {
    assert.equal(await community!.leaveGroup(g1, EARLY), "left");
    assert.equal(await roleIn(g1, EARLY), null);
    assert.equal(await community!.leaveGroup(g1, OUT), "not_member");
  });

  // ── Act 3: the hourly purge.
  await t.test("the purge hands over groups of riders deleted before this existed, and ends empty ones", async () => {
    const result = await purge!.processAccountPurge({}, lookups!.NO_LOOKUPS);
    assert.ok(Number(result.groupsHandedOver) >= 1);
    assert.equal(await ownerOf(g8), LATE);
    // LONG_GONE is purged, and their group with nobody left goes with them.
    assert.equal(await ownerOf(g9), null);
  });

  await t.test("running the purge again finds nothing to hand over", async () => {
    const result = await purge!.processAccountPurge({}, lookups!.NO_LOOKUPS);
    assert.equal(result.groupsHandedOver, 0);
  });
});
