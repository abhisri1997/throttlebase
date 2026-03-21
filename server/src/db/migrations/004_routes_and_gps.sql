-- Migration: 004_routes_and_gps.sql
-- Description: Creates routes, sharing, bookmarks, and GPS trace telemetry tables.

CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
    parent_route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
    title VARCHAR(255),
    geojson JSONB NOT NULL,
    distance_km DECIMAL(10,2),
    elevation_gain_m DECIMAL(8,2),
    elevation_loss_m DECIMAL(8,2),
    difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'moderate', 'hard')),
    visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('private', 'specific_riders', 'public')),
    proposal_status VARCHAR(20) CHECK (proposal_status IN ('pending', 'accepted', 'rejected', 'merged')),
    share_token VARCHAR(255),
    share_token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    shared_with_rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (route_id, rider_id)
);

CREATE TABLE IF NOT EXISTS gps_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    altitude_m DECIMAL(7,2),
    speed_kmh DECIMAL(6,2),
    recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ride_history_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    total_distance_km DECIMAL(10,2),
    total_time_sec INT,
    moving_time_sec INT,
    avg_speed_kmh DECIMAL(6,2),
    max_speed_kmh DECIMAL(6,2),
    elevation_gain_m DECIMAL(8,2),
    elevation_loss_m DECIMAL(8,2),
    calories_burned INT,
    computed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (ride_id, rider_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gps_traces_ride_rider_time ON gps_traces (ride_id, rider_id, recorded_at);
