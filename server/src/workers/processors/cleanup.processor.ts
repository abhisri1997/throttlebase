/**
 * Cleanup Processor
 *
 * Handles `cleanup.expired_sessions` jobs:
 *   1. Purges expired or revoked auth sessions from the `sessions` table.
 *   2. Keeps the `jobs` table bounded. The worker writes a row for every
 *      routine sweep, several a minute with or without traffic, so finished
 *      jobs are removed after a retention window: completed and cancelled
 *      after JOB_RETENTION_DAYS, failed after FAILED_JOB_RETENTION_DAYS (kept
 *      longer for debugging). Pending and running jobs are never touched.
 *   3. Purges posts, comments and routes a moderator removed more than
 *      REMOVED_CONTENT_RETENTION_DAYS ago. They are kept that long for
 *      appeals and legal requests (docs/launch-readiness/plans/ugc-safety.md).
 *
 * It never deletes riders. Deleting an account anonymises the rider row and
 * keeps it (core/riders/deleteAccount.ts), because other riders' records
 * point at it (rides.captain_id and groups.created_by are ON DELETE
 * RESTRICT since migration 037). Removing a leaving rider's own data is a
 * separate, explicit purge (account-purge.processor.ts).
 *
 * Safe to run as a recurring job (idempotent DELETE).
 */

import { query } from "../../config/db.js";
import { REMOVED_CONTENT_RETENTION_DAYS } from "../../core/moderation/actions.js";

const purgeExpiredSessions = async (): Promise<number> => {
  const result = await query(
    `DELETE FROM sessions
     WHERE expires_at < now()
        OR revoked_at IS NOT NULL`,
  );
  return result.rowCount ?? 0;
};

/** Days a completed or cancelled job is kept. */
export const JOB_RETENTION_DAYS = 7;

/** Days a failed job is kept, longer so failures can be looked into. */
export const FAILED_JOB_RETENTION_DAYS = 30;

/** Rows removed per statement, so no single delete holds locks for long. */
const JOB_PURGE_BATCH_SIZE = 5000;

/** Upper bound on batches per run; the next hourly run continues. */
const JOB_PURGE_MAX_BATCHES = 40;

const purgeFinishedJobs = async (): Promise<number> => {
  let deleted = 0;

  for (let batch = 0; batch < JOB_PURGE_MAX_BATCHES; batch += 1) {
    const result = await query(
      `DELETE FROM jobs
       WHERE id IN (
         SELECT id
         FROM jobs
         WHERE (status IN ('completed', 'cancelled')
                AND COALESCE(completed_at, updated_at) < now() - ($1 || ' days')::interval)
            OR (status = 'failed'
                AND COALESCE(completed_at, updated_at) < now() - ($2 || ' days')::interval)
         LIMIT $3
       )`,
      [String(JOB_RETENTION_DAYS), String(FAILED_JOB_RETENTION_DAYS), JOB_PURGE_BATCH_SIZE],
    );
    const removed = result.rowCount ?? 0;
    deleted += removed;
    if (removed < JOB_PURGE_BATCH_SIZE) {
      break;
    }
  }

  return deleted;
};

/** Deleting a post takes its comments and likes with it (ON DELETE CASCADE). */
const purgeRemovedContent = async (): Promise<Record<string, number>> => {
  const purged: Record<string, number> = {};
  for (const table of ["comments", "posts", "routes"] as const) {
    const result = await query(
      `DELETE FROM ${table} WHERE removed_at < now() - ($1 || ' days')::interval`,
      [String(REMOVED_CONTENT_RETENTION_DAYS)],
    );
    purged[table] = result.rowCount ?? 0;
  }
  return purged;
};

export const processCleanupExpiredSessions = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const sessionsDeleted = await purgeExpiredSessions();
  const jobsDeleted = await purgeFinishedJobs();
  const removedContentPurged = await purgeRemovedContent();

  return {
    processor: "cleanup-expired-sessions",
    sessionsDeleted,
    jobsDeleted,
    removedContentPurged,
    handledAt: new Date().toISOString(),
  };
};
