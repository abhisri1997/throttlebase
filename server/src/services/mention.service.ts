/**
 * Mention Service
 *
 * Parses @username handles from content strings, resolves them to rider UUIDs,
 * and fans out in-app mention notifications + delivery jobs to eligible riders.
 *
 * Rules:
 *   - Usernames must follow the pattern @[a-zA-Z0-9_]{1,50}
 *   - Self-mentions are silently ignored
 *   - Riders without a username set cannot be mentioned
 *   - Respects notification_preferences (in_app_enabled) via
 *     createNotificationsForRiders
 */

import { query } from "../config/db.js";
import {
  createNotificationsForRiders,
  getEligibleInAppRecipients,
} from "./notifications.service.js";
import {
  enqueueNotificationPush,
  enqueueNotificationEmail,
} from "./jobs.service.js";

const MENTION_REGEX = /@([a-zA-Z0-9_]{1,50})/g;
const MENTION_NOTIFICATION_TYPE = "mention";

export const parseMentionHandles = (content: string): string[] => {
  const handles: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const handle = match[1];
    if (handle) handles.push(handle.toLowerCase());
  }
  // Return unique handles
  return Array.from(new Set(handles));
};

export const resolveMentionedRiders = async (
  handles: string[],
  actorRiderId: string,
): Promise<Array<{ riderId: string; username: string }>> => {
  if (handles.length === 0) return [];

  const result = await query(
    `SELECT id AS rider_id, LOWER(username) AS username
     FROM riders
     WHERE LOWER(username) = ANY($1::text[])
       AND id != $2
       AND deleted_at IS NULL`,
    [handles, actorRiderId],
  );

  return result.rows.map((row) => ({
    riderId: row.rider_id as string,
    username: row.username as string,
  }));
};

export interface MentionContext {
  actorRiderId: string;
  actorDisplayName: string;
  contentType: "post" | "comment";
  contentId: string;
  contentSnippet: string;
}

export const dispatchMentionNotifications = async (
  content: string,
  ctx: MentionContext,
): Promise<{ mentionedRiders: number; notificationsInserted: number }> => {
  const handles = parseMentionHandles(content);
  if (handles.length === 0) return { mentionedRiders: 0, notificationsInserted: 0 };

  const resolved = await resolveMentionedRiders(handles, ctx.actorRiderId);
  if (resolved.length === 0) return { mentionedRiders: 0, notificationsInserted: 0 };

  const riderIds = resolved.map((r) => r.riderId);
  const title = `${ctx.actorDisplayName} mentioned you`;
  const body =
    ctx.contentSnippet.length > 120
      ? `${ctx.contentSnippet.slice(0, 117)}…`
      : ctx.contentSnippet;

  const dedupeKey = `mention:${ctx.contentType}:${ctx.contentId}:${ctx.actorRiderId}`;

  const outcome = await createNotificationsForRiders({
    riderIds,
    type: MENTION_NOTIFICATION_TYPE,
    title,
    body,
    data: {
      actorRiderId: ctx.actorRiderId,
      contentType: ctx.contentType,
      contentId: ctx.contentId,
    },
    dedupeKey,
  });

  // Enqueue push/email delivery for eligible in-app recipients
  const eligibleForPush = await getEligibleInAppRecipients(
    riderIds,
    MENTION_NOTIFICATION_TYPE,
  );

  for (const riderId of eligibleForPush) {
    await enqueueNotificationPush({
      riderId,
      notificationId: dedupeKey,
      type: MENTION_NOTIFICATION_TYPE,
      title,
      body,
      data: {
        actorRiderId: ctx.actorRiderId,
        contentType: ctx.contentType,
        contentId: ctx.contentId,
      },
    });
  }

  // Email delivery — only for email-opted-in riders (handled inside processor)
  for (const riderId of riderIds) {
    await enqueueNotificationEmail({
      riderId,
      notificationId: dedupeKey,
      type: MENTION_NOTIFICATION_TYPE,
      subject: title,
      body,
    });
  }

  return {
    mentionedRiders: resolved.length,
    notificationsInserted: outcome.inserted,
  };
};
