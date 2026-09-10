-- 021_stop_suggestions.sql
-- Supports search-along-route planned stops:
--   * ride_stops gains explicit ordering + Google place provenance
--   * a Postgres-backed cache for Places responses (no Redis in this deployment)
--   * a daily Google call counter used as a hard spend circuit breaker

ALTER TABLE ride_stops
  ADD COLUMN IF NOT EXISTS sequence         INT,
  ADD COLUMN IF NOT EXISTS google_place_id  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address          VARCHAR(512);

-- Backfill ordering from creation order so sequence is authoritative from day one.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY ride_id ORDER BY created_at) AS rn
  FROM ride_stops
)
UPDATE ride_stops rs
SET sequence = ordered.rn
FROM ordered
WHERE ordered.id = rs.id
  AND rs.sequence IS NULL;

CREATE INDEX IF NOT EXISTS idx_ride_stops_ride_id ON ride_stops(ride_id);

-- Cached Places "search along route" responses, keyed by route+category.
CREATE TABLE IF NOT EXISTS stop_suggestion_cache (
  cache_key  TEXT PRIMARY KEY,
  category   VARCHAR(20) NOT NULL,
  results    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stop_suggestion_cache_expires
  ON stop_suggestion_cache(expires_at);

-- Daily per-API call counter. Incremented before each outbound Google request;
-- when the count exceeds MAX_DAILY_PLACES_CALLS the request is not made at all.
CREATE TABLE IF NOT EXISTS google_api_usage (
  usage_date DATE        NOT NULL,
  api        VARCHAR(50) NOT NULL,
  call_count INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, api)
);
