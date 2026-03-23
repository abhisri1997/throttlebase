-- Migration: 004_participant_start_override.sql
-- Description: Adds start_location_override to ride_participants for ride-specific auto-start overrides.

ALTER TABLE ride_participants 
ADD COLUMN IF NOT EXISTS start_location_override GEOGRAPHY(Point, 4326);
