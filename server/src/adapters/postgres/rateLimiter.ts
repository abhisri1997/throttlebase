import type pg from "pg";
import type {
  RateLimitDecision,
  RateLimiter,
  RateLimitRequest,
} from "../../ports/RateLimiter.js";

/**
 * Fixed-window rate limiting in Postgres.
 *
 * Postgres rather than an in-memory counter because the API runs more than
 * one instance: a per-process counter would multiply every limit by the
 * instance count, and would reset on each deploy.
 *
 * Fixed windows rather than a sliding log: a window boundary allows a burst
 * of up to 2x the limit across two adjacent windows, which is an acceptable
 * trade for a single indexed upsert per check.
 */
export const createRateLimiter = (pool: pg.Pool): RateLimiter => ({
  consume: async (request: RateLimitRequest): Promise<RateLimitDecision> => {
    const windowMs = request.windowSeconds * 1000;
    const windowStart = new Date(
      Math.floor(request.now.getTime() / windowMs) * windowMs,
    );

    // One atomic upsert: concurrent callers serialise on the primary key, so
    // no two requests can both read a stale count and both be allowed.
    const result = await pool.query<{ count: number }>(
      `INSERT INTO rate_limit_counters (bucket, subject, window_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (bucket, subject, window_start)
       DO UPDATE SET count = rate_limit_counters.count + 1
       RETURNING count`,
      [request.bucket, request.subject, windowStart],
    );

    const count = result.rows[0]?.count ?? 1;
    const allowed = count <= request.limit;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(
          1,
          Math.ceil(
            (windowStart.getTime() + windowMs - request.now.getTime()) / 1000,
          ),
        );

    return { allowed, retryAfterSeconds };
  },
});

/** Housekeeping for the worker: windows older than a day are dead weight. */
export const pruneRateLimitCounters = async (
  pool: pg.Pool,
  olderThan: Date,
): Promise<number> => {
  const result = await pool.query(
    "DELETE FROM rate_limit_counters WHERE window_start < $1",
    [olderThan],
  );
  return result.rowCount ?? 0;
};
