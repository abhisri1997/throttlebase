-- 011_live_group_sessions.sql
-- Foundation tables for live group ride sessions and participant presence.

CREATE TABLE IF NOT EXISTS ride_live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES rides(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('starting', 'active', 'paused', 'ended')),
  started_by UUID REFERENCES riders(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ended_by UUID REFERENCES riders(id) ON DELETE SET NULL,
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_live_presence (
  session_id UUID NOT NULL REFERENCES ride_live_sessions(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('captain', 'co_captain', 'member')),
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat_at TIMESTAMPTZ,
  last_location GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, rider_id)
);
