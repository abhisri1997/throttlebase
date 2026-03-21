-- Migration: 003_rides_core.sql
-- Description: Creates the core tables for rides, participants, and stops.

CREATE TABLE IF NOT EXISTS rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captain_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    start_point GEOGRAPHY(Point, 4326),
    end_point GEOGRAPHY(Point, 4326),
    start_point_auto BOOLEAN DEFAULT false,
    route_geojson JSONB,
    scheduled_at TIMESTAMPTZ,
    estimated_duration_min INT,
    max_capacity INT,
    current_rider_count INT DEFAULT 0,
    requirements JSONB,
    average_rating DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger to automatically update updated_at on the rides table
DROP TRIGGER IF EXISTS update_rides_updated_at ON rides;
CREATE TRIGGER update_rides_updated_at
BEFORE UPDATE ON rides
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TABLE IF NOT EXISTS ride_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'rider' CHECK (role IN ('captain', 'co_captain', 'rider')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('invited', 'requested', 'confirmed', 'dropped_out', 'rejected')),
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    dropout_coords GEOGRAPHY(Point, 4326),
    invite_token VARCHAR(255),
    invite_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (ride_id, rider_id)
);

CREATE TABLE IF NOT EXISTS ride_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES riders(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES riders(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('fuel', 'rest', 'photo', 'unplanned')),
    location GEOGRAPHY(Point, 4326),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    stopped_at TIMESTAMPTZ,
    resumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Indexes for performance optimization

-- Active/upcoming ride queries
CREATE INDEX IF NOT EXISTS idx_rides_status_scheduled_at ON rides (status, scheduled_at);
-- Captain's ride list
CREATE INDEX IF NOT EXISTS idx_rides_captain_id ON rides (captain_id);
-- Spatial indexes for nearby ride discovery
CREATE INDEX IF NOT EXISTS idx_rides_start_point ON rides USING GIST (start_point);
CREATE INDEX IF NOT EXISTS idx_rides_end_point ON rides USING GIST (end_point);

-- Conflict detection and quick lookups for riders
CREATE INDEX IF NOT EXISTS idx_ride_participants_rider_status ON ride_participants (rider_id, status);
