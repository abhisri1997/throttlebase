-- 012_live_session_events.sql
-- Durable event stream for live ride session lifecycle and activity.

CREATE TABLE IF NOT EXISTS ride_live_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ride_live_sessions(id) ON DELETE CASCADE,
  actor_rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
