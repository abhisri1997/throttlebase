-- Migration: 046_add_vehicle_image.sql
-- Description: Adds an image_url column to the vehicles table

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_url TEXT;
