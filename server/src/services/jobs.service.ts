import { JOB_TYPES } from "../queue/job-types.js";
import { enqueueJob } from "../queue/queue.js";
import { query } from "../config/db.js";

const enqueueRecurringJobIfDue = async (
  type: string,
  payload: Record<string, unknown>,
  minIntervalSeconds: number,
  maxAttempts: number,
): Promise<boolean> => {
  const existing = await query(
    `SELECT id
     FROM jobs
     WHERE type = $1
       AND (
         status IN ('pending', 'processing')
         OR created_at > now() - ($2 || ' seconds')::interval
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [type, String(minIntervalSeconds)],
  );

  if (existing.rows.length > 0) {
    return false;
  }

  await enqueueJob({
    type,
    payload,
    maxAttempts,
  });

  return true;
};

export const enqueueRideStatsRecompute = async (
  rideId: string,
  source: "ride-completed" | "gps-ingest",
): Promise<void> => {
  const existing = await query(
    `SELECT id
     FROM jobs
     WHERE type = $1
       AND status IN ('pending', 'processing')
       AND payload->>'rideId' = $2
     LIMIT 1`,
    [JOB_TYPES.RIDE_STATS_RECOMPUTE, rideId],
  );

  if (existing.rows.length > 0) {
    return;
  }

  await enqueueJob({
    type: JOB_TYPES.RIDE_STATS_RECOMPUTE,
    payload: {
      rideId,
      source,
      requestedAt: new Date().toISOString(),
    },
    maxAttempts: 5,
  });
};

export const enqueueLiveSessionStarted = async (
  rideId: string,
  actorRiderId: string,
): Promise<void> => {
  const existing = await query(
    `SELECT id
     FROM jobs
     WHERE type = $1
       AND status IN ('pending', 'processing')
       AND payload->>'rideId' = $2
     LIMIT 1`,
    [JOB_TYPES.LIVE_SESSION_STARTED, rideId],
  );

  if (existing.rows.length > 0) {
    return;
  }

  await enqueueJob({
    type: JOB_TYPES.LIVE_SESSION_STARTED,
    payload: {
      rideId,
      actorRiderId,
      occurredAt: new Date().toISOString(),
    },
    maxAttempts: 3,
  });
};

export const enqueueLiveSessionEnded = async (
  rideId: string,
  actorRiderId: string,
  reason?: string,
): Promise<void> => {
  const existing = await query(
    `SELECT id
     FROM jobs
     WHERE type = $1
       AND status IN ('pending', 'processing')
       AND payload->>'rideId' = $2
     LIMIT 1`,
    [JOB_TYPES.LIVE_SESSION_ENDED, rideId],
  );

  if (existing.rows.length > 0) {
    return;
  }

  await enqueueJob({
    type: JOB_TYPES.LIVE_SESSION_ENDED,
    payload: {
      rideId,
      actorRiderId,
      reason: reason ?? null,
      occurredAt: new Date().toISOString(),
    },
    maxAttempts: 3,
  });
};

export const enqueueLiveIncidentReported = async (
  incidentId: string,
  rideId: string,
  severity: string,
  reporterRiderId: string,
): Promise<void> => {
  const existing = await query(
    `SELECT id
     FROM jobs
     WHERE type = $1
       AND status IN ('pending', 'processing')
       AND payload->>'incidentId' = $2
     LIMIT 1`,
    [JOB_TYPES.LIVE_INCIDENT_REPORTED, incidentId],
  );

  if (existing.rows.length > 0) {
    return;
  }

  await enqueueJob({
    type: JOB_TYPES.LIVE_INCIDENT_REPORTED,
    payload: {
      incidentId,
      rideId,
      severity,
      reporterRiderId,
      occurredAt: new Date().toISOString(),
    },
    maxAttempts: 5,
  });
};

export const enqueueRewardsRecompute = async (
  riderId: string,
  source: "stats-recompute" | "manual",
): Promise<void> => {
  const existing = await query(
    `SELECT id
     FROM jobs
     WHERE type = $1
       AND status IN ('pending', 'processing')
       AND payload->>'riderId' = $2
     LIMIT 1`,
    [JOB_TYPES.REWARDS_RECOMPUTE, riderId],
  );

  if (existing.rows.length > 0) {
    return;
  }

  await enqueueJob({
    type: JOB_TYPES.REWARDS_RECOMPUTE,
    payload: {
      riderId,
      source,
      requestedAt: new Date().toISOString(),
    },
    maxAttempts: 3,
  });
};

export const enqueueCleanupExpiredSessionsJob =
  async (): Promise<boolean> => {
    return enqueueRecurringJobIfDue(
      JOB_TYPES.CLEANUP_EXPIRED_SESSIONS,
      { enqueuedAt: new Date().toISOString() },
      3600, // once per hour
      1,
    );
  };

export const enqueueLivePresenceSweepJob = async (): Promise<boolean> => {
  return enqueueRecurringJobIfDue(
    JOB_TYPES.LIVE_PRESENCE_SWEEP,
    { enqueuedAt: new Date().toISOString() },
    30,
    1,
  );
};

export const enqueueLiveIncidentEscalationJob = async (): Promise<boolean> => {
  return enqueueRecurringJobIfDue(
    JOB_TYPES.LIVE_INCIDENT_ESCALATE,
    { enqueuedAt: new Date().toISOString() },
    45,
    1,
  );
};

// ── Notification delivery jobs ────────────────────────────────────────────────

export interface NotificationPushJobPayload {
  riderId: string;
  notificationId: string;
  type: string;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

export interface NotificationEmailJobPayload {
  riderId: string;
  notificationId: string;
  type: string;
  subject: string;
  body: string;
}

export const enqueueNotificationPush = async (
  input: NotificationPushJobPayload,
): Promise<void> => {
  await enqueueJob({
    type: JOB_TYPES.NOTIFICATION_PUSH,
    payload: { ...input, enqueuedAt: new Date().toISOString() },
    maxAttempts: 3,
  });
};

export const enqueueNotificationEmail = async (
  input: NotificationEmailJobPayload,
): Promise<void> => {
  await enqueueJob({
    type: JOB_TYPES.NOTIFICATION_EMAIL,
    payload: { ...input, enqueuedAt: new Date().toISOString() },
    maxAttempts: 3,
  });
};
