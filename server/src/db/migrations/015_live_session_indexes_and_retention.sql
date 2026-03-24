-- 015_live_session_indexes_and_retention.sql
-- Indexes and retention helpers for live-session throughput and query paths.

CREATE INDEX IF NOT EXISTS idx_live_sessions_status
  ON ride_live_sessions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_presence_online
  ON ride_live_presence(session_id, is_online, last_heartbeat_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_events_session_created
  ON ride_live_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_events_type_created
  ON ride_live_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_location_session_rider_time
  ON ride_live_location_samples(session_id, rider_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_location_session_time
  ON ride_live_location_samples(session_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_incidents_session_status
  ON ride_live_incidents(session_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_incidents_severity_status
  ON ride_live_incidents(severity, status, created_at DESC);

-- Retention policy is intentionally managed by a background job in later phases.
-- For now, data is kept indefinitely for debugging and validation.
