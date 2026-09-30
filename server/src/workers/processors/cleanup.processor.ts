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
 *   4. Purges security logs past their retention: sign-in history and the
 *      audit trail after SECURITY_LOG_RETENTION_DAYS, email codes after
 *      EMAIL_CODE_RETENTION_DAYS (launch readiness E11).
 *
 * Every period comes from core/retention/retentionPolicy.ts.
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
import {
  EMAIL_CODE_RETENTION_DAYS,
  FAILED_JOB_RETENTION_DAYS,
  JOB_RETENTION_DAYS,
  REMOVED_CONTENT_RETENTION_DAYS,
  SECURITY_LOG_RETENTION_DAYS,
} from "../../core/retention/retentionPolicy.js";

/** Rows removed per statement, so no single delete holds locks for long. */
const PURGE_BATCH_SIZE = 5000;

/** Upper bound on batches per table per run; the next hourly run continues. */
const PURGE_MAX_BATCHES = 40;

/**
 * Deletes the rows of `table` matching `where`, in batches. `where` may use
 * `$1`..`$n` for `params`; the batch size is appended after them.
 */
const deleteInBatches = async (
  table: string,
  where: string,
  params: unknown[],
): Promise<number> => {
  let deleted = 0;

  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
    const result = await query(
      `DELETE FROM ${table}
       WHERE id IN (
         SELECT id FROM ${table}
         WHERE ${where}
         LIMIT $${params.length + 1}
       )`,
      [...params, PURGE_BATCH_SIZE],
    );
    const removed = result.rowCount ?? 0;
    deleted += removed;
    if (removed < PURGE_BATCH_SIZE) {
      break;
    }
  }

  return deleted;
};

const purgeExpiredSessions = async (): Promise<number> => {
  const result = await query(
    `DELETE FROM sessions
     WHERE expires_at < now()
        OR revoked_at IS NOT NULL`,
  );
  return result.rowCount ?? 0;
};

const purgeFinishedJobs = (): Promise<number> =>
  deleteInBatches(
    "jobs",
    `(status IN ('completed', 'cancelled')
       AND COALESCE(completed_at, updated_at) < now() - ($1 || ' days')::interval)
     OR (status = 'failed'
       AND COALESCE(completed_at, updated_at) < now() - ($2 || ' days')::interval)`,
    [String(JOB_RETENTION_DAYS), String(FAILED_JOB_RETENTION_DAYS)],
  );

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

/** Each security log, the column that dates a row, and how long rows are kept. */
const SECURITY_LOGS = [
  { table: "login_activity", column: "logged_in_at", days: SECURITY_LOG_RETENTION_DAYS },
  { table: "security_events", column: "occurred_at", days: SECURITY_LOG_RETENTION_DAYS },
  { table: "email_otps", column: "created_at", days: EMAIL_CODE_RETENTION_DAYS },
] as const;

const purgeSecurityLogs = async (): Promise<Record<string, number>> => {
  const purged: Record<string, number> = {};
  for (const { table, column, days } of SECURITY_LOGS) {
    purged[table] = await deleteInBatches(
      table,
      `${column} < now() - ($1 || ' days')::interval`,
      [String(days)],
    );
  }
  return purged;
};

export const processCleanupExpiredSessions = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const sessionsDeleted = await purgeExpiredSessions();
  const jobsDeleted = await purgeFinishedJobs();
  const removedContentPurged = await purgeRemovedContent();
  const securityLogsPurged = await purgeSecurityLogs();

  return {
    processor: "cleanup-expired-sessions",
    sessionsDeleted,
    jobsDeleted,
    removedContentPurged,
    securityLogsPurged,
    handledAt: new Date().toISOString(),
  };
};
