/**
 * Registration Records Purge Processor
 *
 * Handles the daily `registration_records.purge` job: deletes sealed
 * registration records more than 180 days past the account's cancellation,
 * unless one is under a legal hold (migration 043; plans/account-deletion.md,
 * step 4). The deleting is done by sealed.purge_expired_registrations(), so
 * the worker needs no access to the sealed tables. Counts only in the result.
 */
import { query } from "../../config/db.js";

export const processRegistrationRecordsPurge = async (
  _payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const result = await query(`SELECT sealed.purge_expired_registrations() AS purged`);
  return {
    processor: "registration-records-purge",
    purged: Number(result.rows[0]?.purged ?? 0),
    handledAt: new Date().toISOString(),
  };
};
