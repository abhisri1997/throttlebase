/**
 * Cleanup Processor
 *
 * Handles `cleanup.expired_sessions` jobs:
 *   1. Purge expired or revoked auth sessions from the `sessions` table.
 *   2. Hard-delete riders whose `deleted_at` is more than 30 days ago
 *      (soft-deleted past the grace period).
 *
 * Safe to run as a recurring job (idempotent DELETEs).
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

const purgeGracePeriodExpiredRiders = async (): Promise<number> => {
  // Hard-delete riders whose soft-delete grace period (30 days) has elapsed.
  // Cascade constraints on child tables handle associated data cleanup.
  const result = await query(
    `DELETE FROM riders
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '30 days'`,
  );
  return result.rowCount ?? 0;
};

export const processCleanupExpiredSessions = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const [sessionsDeleted, ridersDeleted] = await Promise.all([
    purgeExpiredSessions(),
    purgeGracePeriodExpiredRiders(),
  ]);

  return {
    processor: "cleanup-expired-sessions",
    sessionsDeleted,
    ridersDeleted,
    handledAt: new Date().toISOString(),
  };
};
