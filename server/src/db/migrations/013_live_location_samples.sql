-- 013_live_location_samples.sql
-- Sampled participant locations for live-session playback and forensics.

CREATE TABLE IF NOT EXISTS ride_live_location_samples (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ride_live_sessions(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  speed_kmh NUMERIC(6, 2),
  heading_deg NUMERIC(6, 2),
  accuracy_m NUMERIC(8, 2),
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
