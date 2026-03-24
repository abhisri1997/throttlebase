-- 014_live_session_incidents.sql
-- Safety and incident records emitted during live sessions.

CREATE TABLE IF NOT EXISTS ride_live_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ride_live_sessions(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  kind TEXT NOT NULL CHECK (kind IN ('sos', 'crash', 'medical', 'mechanical', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  location GEOGRAPHY(POINT, 4326),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES riders(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES riders(id) ON DELETE SET NULL
);
