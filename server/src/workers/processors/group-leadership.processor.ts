/**
 * Group Leadership Processor
 *
 * Handles `group.leader_changed` jobs, queued in the same transaction that
 * hands a group to a new admin (services/group-roster.service.ts). Tells the
 * new admin they run the group now, and every other member who does. Safe
 * to run twice: each member is told once per new admin.
 */

import { query } from "../../config/db.js";
import { createNotificationsForRiders } from "../../services/notifications.service.js";

const NOTIFICATION_TYPE = "group_admin_changed";

interface GroupForNotice {
  name: string;
  owner_id: string;
  owner_name: string | null;
}

const loadGroup = async (groupId: string): Promise<GroupForNotice | null> => {
  const result = await query(
    `SELECT g.name, g.created_by::text AS owner_id, o.display_name AS owner_name
       FROM groups g JOIN riders o ON o.id = g.created_by
      WHERE g.id = $1`,
    [groupId],
  );
  return (result.rows[0] as GroupForNotice | undefined) ?? null;
};

/** Members whose accounts still exist. */
const loadMembers = async (groupId: string): Promise<string[]> => {
  const result = await query(
    `SELECT gm.rider_id::text AS rider_id
       FROM group_members gm JOIN riders r ON r.id = gm.rider_id
      WHERE gm.group_id = $1 AND r.deleted_at IS NULL`,
    [groupId],
  );
  return result.rows.map((row) => row.rider_id as string);
};

const requireString = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required for group.leader_changed job`);
  }
  return value;
};

/** Why the previous admin is gone, in words for the notification. */
const departure = (reason: unknown): string =>
  reason === "left" ? "The previous admin left the group" : "The previous admin left ThrottleBase";

export const processGroupLeaderChanged = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const groupId = requireString(payload, "groupId");
  const newAdminId = requireString(payload, "newAdminId");

  const group = await loadGroup(groupId);
  // Deleted since, or passed on again: a later job speaks for the group.
  if (!group || group.owner_id !== newAdminId) {
    return { processor: "group-leadership", groupId, skipped: group ? "admin_changed_again" : "group_not_found" };
  }

  const adminName = group.owner_name || "Another rider";
  const why = departure(payload.reason);
  const shared = {
    type: NOTIFICATION_TYPE,
    data: { group_id: groupId, event: "group.admin_changed" },
    dedupeKey: `${NOTIFICATION_TYPE}:${groupId}:${newAdminId}`,
  };

  const toAdmin = await createNotificationsForRiders({
    ...shared,
    riderIds: [newAdminId],
    title: `You're now the admin of ${group.name}`,
    body: `${why}, so you run this group now.`,
  });

  const members = (await loadMembers(groupId)).filter((riderId) => riderId !== newAdminId);
  const toMembers = await createNotificationsForRiders({
    ...shared,
    riderIds: members,
    title: `${adminName} is now the admin of ${group.name}`,
    body: `${why}. ${adminName} runs the group now.`,
  });

  return {
    processor: "group-leadership",
    groupId,
    notified: (toAdmin.inserted ?? 0) + (toMembers.inserted ?? 0),
    handledAt: new Date().toISOString(),
  };
};
