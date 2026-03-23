import { JOB_TYPES } from "../queue/job-types.js";
import { enqueueJob } from "../queue/queue.js";
import { query } from "../config/db.js";

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
