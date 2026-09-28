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
 *
 * It never deletes riders. Deleting an account anonymises the rider row and
 * keeps it (core/riders/deleteAccount.ts), because other riders' records
 * point at it: rides.captain_id is ON DELETE CASCADE, so removing the row
 * would take every ride the rider captained with it, along with the other
 * riders' participation, tracks and stats. Removing a leaving rider's own
 * data is a separate, explicit purge (docs/launch-readiness/plans/account-deletion.md).
 *
 * Safe to run as a recurring job (idempotent DELETE).
 */

import { query } from "../../config/db.js";

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

export const processCleanupExpiredSessions = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const sessionsDeleted = await purgeExpiredSessions();
  const jobsDeleted = await purgeFinishedJobs();

  return {
    processor: "cleanup-expired-sessions",
    sessionsDeleted,
    jobsDeleted,
    handledAt: new Date().toISOString(),
  };
};
