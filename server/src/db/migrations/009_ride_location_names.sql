-- Migration: 009_ride_location_names.sql
-- Description: Adds human-readable location names to rides and stops.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS start_point_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS end_point_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS start_point_auto BOOLEAN DEFAULT FALSE;

ALTER TABLE ride_stops
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);
