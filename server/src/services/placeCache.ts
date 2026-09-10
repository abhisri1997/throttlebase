import { query } from "../config/db.js";

/**
 * Shared TTL cache and spend counter for outbound Google Places calls.
 *
 * There is no Redis in this deployment, so Postgres is the cache substrate.
 * Every cache miss costs money, which makes this table — together with the
 * daily budget counter below — the primary cost control for anything that
 * talks to Places.
 */

const DEFAULT_MAX_DAILY_CALLS = 500;

export const readPlaceCache = async <T>(
  cacheKey: string,
  { allowStale }: { allowStale: boolean },
): Promise<T | null> => {
  const result = await query(
    `SELECT results FROM stop_suggestion_cache
     WHERE cache_key = $1 ${allowStale ? "" : "AND expires_at > now()"}`,
    [cacheKey],
  );
  return result.rows.length ? (result.rows[0].results as T) : null;
};

export const writePlaceCache = async (
  cacheKey: string,
  category: string,
  value: unknown,
  ttlMs: number,
): Promise<void> => {
  await query(
    `INSERT INTO stop_suggestion_cache (cache_key, category, results, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)
     ON CONFLICT (cache_key)
     DO UPDATE SET results = EXCLUDED.results,
                   expires_at = EXCLUDED.expires_at,
                   created_at = now()`,
    [cacheKey, category, JSON.stringify(value), String(ttlMs)],
  );
};

/**
 * Atomically reserves one outbound call against today's budget for `api`.
 *
 * The conditional DO UPDATE means that once the cap is reached no further
 * increment happens and no row comes back, so the counter cannot run away and
 * the check cannot race between concurrent requests. Counters are per-API
 * because different Places methods bill under different SKUs.
 */
export const reserveGoogleCall = async (
  api: string,
  limit: number,
): Promise<boolean> => {
  const result = await query(
    `INSERT INTO google_api_usage (usage_date, api, call_count)
     VALUES (CURRENT_DATE, $1, 1)
     ON CONFLICT (usage_date, api)
     DO UPDATE SET call_count = google_api_usage.call_count + 1
     WHERE google_api_usage.call_count < $2
     RETURNING call_count`,
    [api, limit],
  );
  return result.rows.length > 0;
};

/**
 * Resolves the daily cap. Guards against a non-numeric env value explicitly:
 * `Number(undefined)` is NaN, and `NaN ?? fallback` yields NaN, which would
 * make every budget comparison false and silently degrade every request.
 */
export const resolveMaxDailyCalls = (override?: number): number => {
  if (override !== undefined) return override;

  const fromEnv = Number(process.env.MAX_DAILY_PLACES_CALLS);
  return Number.isFinite(fromEnv) && fromEnv >= 0
    ? fromEnv
    : DEFAULT_MAX_DAILY_CALLS;
};
