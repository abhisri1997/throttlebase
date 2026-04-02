/**
 * Notification Delivery Processor
 *
 * Handles `notification.push` and `notification.email` jobs.
 *
 * Push delivery respects `notification_preferences.push_enabled`.
 * Email delivery respects `notification_preferences.email_enabled`.
 *
 * Current implementation is a stub that logs intent and marks delivery
 * as attempted. Integrate with FCM/APNs/SMTP by replacing the stub
 * sections below once credentials are available.
 */

import { query } from "../../config/db.js";

interface PushPayload {
  riderId?: string;
  notificationId?: string;
  type?: string;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

interface EmailPayload {
  riderId?: string;
  notificationId?: string;
  type?: string;
  subject?: string;
  body?: string;
}

const isPushEnabled = async (
  riderId: string,
  notificationType: string,
): Promise<boolean> => {
  const result = await query(
    `SELECT push_enabled
     FROM notification_preferences
     WHERE rider_id = $1 AND notification_type = $2`,
    [riderId, notificationType],
  );
  // Default true when no preference row exists
  if (result.rows.length === 0) return true;
  return result.rows[0].push_enabled as boolean;
};

const isEmailEnabled = async (
  riderId: string,
  notificationType: string,
): Promise<boolean> => {
  const result = await query(
    `SELECT email_enabled
     FROM notification_preferences
     WHERE rider_id = $1 AND notification_type = $2`,
    [riderId, notificationType],
  );
  // Default false for email (opt-in)
  if (result.rows.length === 0) return false;
  return result.rows[0].email_enabled as boolean;
};

const getRiderPushToken = async (
  riderId: string,
): Promise<string | null> => {
  // TODO: fetch FCM/APNs token from a rider_devices or rider_push_tokens table
  // when device registration is implemented.
  void riderId;
  return null;
};

const getRiderEmail = async (riderId: string): Promise<string | null> => {
  const result = await query(
    `SELECT email FROM riders WHERE id = $1 AND deleted_at IS NULL`,
    [riderId],
  );
  return (result.rows[0]?.email as string | undefined) ?? null;
};

// ── Push processor ────────────────────────────────────────────────────────────

export const processNotificationPush = async (
  rawPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const payload = rawPayload as PushPayload;

  const riderId = typeof payload.riderId === "string" ? payload.riderId : null;
  const notificationType = typeof payload.type === "string" ? payload.type : "general";

  if (!riderId) {
    throw new Error("notification.push job missing riderId");
  }

  const enabled = await isPushEnabled(riderId, notificationType);
  if (!enabled) {
    return {
      processor: "notification-push",
      riderId,
      notificationType,
      skipped: true,
      reason: "push_disabled_by_preference",
      handledAt: new Date().toISOString(),
    };
  }

  const pushToken = await getRiderPushToken(riderId);
  if (!pushToken) {
    // No registered device — silently skip (device not yet registered)
    return {
      processor: "notification-push",
      riderId,
      notificationType,
      skipped: true,
      reason: "no_device_token",
      handledAt: new Date().toISOString(),
    };
  }

  // TODO: Replace stub with actual FCM/APNs delivery:
  //
  //   await sendFcmPush({
  //     token: pushToken,
  //     notification: { title: payload.title, body: payload.body },
  //     data: payload.data,
  //   });
  //
  console.log(
    `[push-processor] STUB: Would send push to rider ${riderId} (token: ${pushToken}) — ${payload.title}`,
  );

  return {
    processor: "notification-push",
    riderId,
    notificationType,
    attempted: true,
    delivered: false,
    skipped: true,
    reason: "provider_not_configured",
    handledAt: new Date().toISOString(),
  };
};

// ── Email processor ───────────────────────────────────────────────────────────

export const processNotificationEmail = async (
  rawPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const payload = rawPayload as EmailPayload;

  const riderId = typeof payload.riderId === "string" ? payload.riderId : null;
  const notificationType = typeof payload.type === "string" ? payload.type : "general";

  if (!riderId) {
    throw new Error("notification.email job missing riderId");
  }

  const enabled = await isEmailEnabled(riderId, notificationType);
  if (!enabled) {
    return {
      processor: "notification-email",
      riderId,
      notificationType,
      skipped: true,
      reason: "email_disabled_by_preference",
      handledAt: new Date().toISOString(),
    };
  }

  const email = await getRiderEmail(riderId);
  if (!email) {
    return {
      processor: "notification-email",
      riderId,
      notificationType,
      skipped: true,
      reason: "rider_email_not_found",
      handledAt: new Date().toISOString(),
    };
  }

  // TODO: Replace stub with actual SMTP/SES/SendGrid delivery:
  //
  //   await sendEmail({
  //     to: email,
  //     subject: payload.subject,
  //     text: payload.body,
  //   });
  //
  console.log(
    `[email-processor] STUB: Would send email to ${email} — subject: "${payload.subject}"`,
  );

  return {
    processor: "notification-email",
    riderId,
    notificationType,
    attempted: true,
    delivered: false,
    skipped: true,
    reason: "provider_not_configured",
    email,
    handledAt: new Date().toISOString(),
  };
};
