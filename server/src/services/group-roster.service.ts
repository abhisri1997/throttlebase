/**
 * Who runs a group when the rider running it leaves — by deleting their
 * account or by leaving the group. Like a WhatsApp group, it carries on
 * under someone else (core/groups/groupSuccessor.ts); the last member
 * leaving ends it.
 *
 * The group's owner is `groups.created_by`: it is always an admin, and the
 * app treats it as the one who runs the group. Handing over moves it.
 */
import pool from "../config/db.js";
import { pickGroupSuccessor, type GroupSuccessorCandidate } from "../core/groups/groupSuccessor.js";
import { JOB_TYPES } from "../queue/job-types.js";
import type { SqlClient } from "./ride-progress.repository.js";

export type GroupHandoverReason = "account_deleted" | "left";

export type LeaveGroupOutcome = "left" | "handed_over" | "group_deleted" | "not_member";

/** Members other than the leaving rider whose accounts still exist. */
export const loadGroupSuccessorCandidates = async (
  client: SqlClient,
  groupId: string,
  leavingRiderId: string,
): Promise<GroupSuccessorCandidate[]> => {
  const result = await client.query(
    `SELECT gm.rider_id::text AS rider_id, gm.role, gm.joined_at
       FROM group_members gm
       JOIN riders r ON r.id = gm.rider_id
      WHERE gm.group_id = $1 AND gm.rider_id <> $2 AND r.deleted_at IS NULL
      -- A candidate deleting their own account right now holds their rider
      -- row: wait for it, then look again, so the group never goes to them.
      FOR SHARE OF gm, r`,
    [groupId, leavingRiderId],
  );
  return result.rows.map((row) => ({
    riderId: row.rider_id as string,
    role: row.role === "admin" ? "admin" : "member",
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
  }));
};

const passGroup = async (
  client: SqlClient,
  groupId: string,
  fromRiderId: string,
  toRiderId: string,
  reason: GroupHandoverReason,
): Promise<void> => {
  await client.query(`UPDATE groups SET created_by = $2 WHERE id = $1`, [groupId, toRiderId]);
  await client.query(`UPDATE group_members SET role = 'admin' WHERE group_id = $1 AND rider_id = $2`, [
    groupId,
    toRiderId,
  ]);
  // Queued in this transaction, so members are told only if it commits.
  await client.query(`INSERT INTO jobs (type, payload) VALUES ($1, $2::jsonb)`, [
    JOB_TYPES.GROUP_LEADER_CHANGED,
    JSON.stringify({ groupId, newAdminId: toRiderId, previousAdminId: fromRiderId, reason }),
  ]);
};

/**
 * Hands each group a deleted account owns to its next admin. A group with
 * nobody left keeps its deleted owner — hidden from everyone — until the
 * purge removes it. Returns how many groups were handed over.
 */
export const handOverGroupsOf = async (client: SqlClient, riderId: string): Promise<number> => {
  const owned = await client.query(`SELECT id::text AS id FROM groups WHERE created_by = $1 ORDER BY id FOR UPDATE`, [
    riderId,
  ]);

  let handedOver = 0;
  for (const { id: groupId } of owned.rows as Array<{ id: string }>) {
    const successor = pickGroupSuccessor(await loadGroupSuccessorCandidates(client, groupId, riderId));
    if (successor) {
      await passGroup(client, groupId, riderId, successor, "account_deleted");
      handedOver += 1;
    }
  }
  return handedOver;
};

const decideLeave = async (client: SqlClient, groupId: string, riderId: string): Promise<LeaveGroupOutcome> => {
  const group = await client.query(`SELECT created_by::text AS owner FROM groups WHERE id = $1 FOR UPDATE`, [groupId]);
  if (group.rows[0]?.owner !== riderId) {
    const membership = await client.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND rider_id = $2`, [
      groupId,
      riderId,
    ]);
    return membership.rows.length > 0 ? "left" : "not_member";
  }

  const successor = pickGroupSuccessor(await loadGroupSuccessorCandidates(client, groupId, riderId));
  if (!successor) return "group_deleted";
  await passGroup(client, groupId, riderId, successor, "left");
  return "handed_over";
};

/**
 * The rider leaves the group. If they own it, it passes to the next admin
 * first, or ends when nobody else is in it.
 */
export const leaveGroup = async (groupId: string, riderId: string): Promise<LeaveGroupOutcome> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const outcome = await decideLeave(client, groupId, riderId);
    if (outcome === "group_deleted") {
      await client.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
    } else if (outcome !== "not_member") {
      await client.query(`DELETE FROM group_members WHERE group_id = $1 AND rider_id = $2`, [groupId, riderId]);
    }
    await client.query("COMMIT");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * For groups still owned by a deleted account that someone else is in —
 * accounts deleted before hand-over existed. Run by the hourly account
 * purge; one transaction per rider. Returns how many groups were handed over.
 */
export const handOverGroupsOfDeletedRiders = async (): Promise<number> => {
  const owners = await pool.query(
    `SELECT DISTINCT d.id::text AS id
       FROM riders d
       JOIN groups g ON g.created_by = d.id
      WHERE d.deleted_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM group_members gm JOIN riders m ON m.id = gm.rider_id
           WHERE gm.group_id = g.id AND gm.rider_id <> d.id AND m.deleted_at IS NULL
        )`,
  );

  let handedOver = 0;
  for (const { id: riderId } of owners.rows as Array<{ id: string }>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      handedOver += await handOverGroupsOf(client, riderId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return handedOver;
};
