-- 001_initial_riders.sql
-- Description: Core User Management Migration

-- 1. Ensure extensions are active (even though we handled this manually)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create Riders Table
CREATE TABLE IF NOT EXISTS riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    bio TEXT,
    profile_picture_url TEXT,
    experience_level VARCHAR(20) DEFAULT 'beginner',
    location_city VARCHAR(100),
    location_region VARCHAR(100),
    location_coords GEOGRAPHY(Point, 4326),  -- Spatial data for maps/find nearby
    phone_number VARCHAR(20),
    weight_kg DECIMAL(5,2),
    total_rides INT DEFAULT 0,
    total_distance_km DECIMAL(10,2) DEFAULT 0,
    total_ride_time_sec BIGINT DEFAULT 0,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- 3. Create Indexing
CREATE INDEX IF NOT EXISTS idx_riders_email ON riders(email);
CREATE INDEX IF NOT EXISTS idx_riders_coords ON riders USING GIST(location_coords);
CREATE INDEX IF NOT EXISTS idx_riders_deleted_at ON riders(deleted_at) WHERE deleted_at IS NOT NULL;

-- 4. Automatically update "updated_at" trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_riders_updated_at
    BEFORE UPDATE ON riders
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
