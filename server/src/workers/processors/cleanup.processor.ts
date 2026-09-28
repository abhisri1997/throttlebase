/**
 * Cleanup Processor
 *
 * Handles `cleanup.expired_sessions` jobs: purges expired or revoked auth
 * sessions from the `sessions` table.
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

export const processCleanupExpiredSessions = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const sessionsDeleted = await purgeExpiredSessions();

  return {
    processor: "cleanup-expired-sessions",
    sessionsDeleted,
    handledAt: new Date().toISOString(),
  };
};
