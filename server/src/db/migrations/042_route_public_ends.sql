-- 042_route_public_ends.sql
-- Riders other than its owner see a public route without its first and last
-- ~500 m, unless an end is at a clearly public place such as a hotel or a
-- fuel station (plans/privacy-defaults.md, step 6). What is at each end is
-- looked up once, when the route is made public, and kept here:
--
--   { "startPlace": { "name", "lat", "lng" } | null,
--     "endPlace":   { "name", "lat", "lng" } | null,
--     "startName":  string | null,   -- what each end is called once shown
--     "endName":    string | null }
--
-- The public view itself is worked out from this and the route's line when
-- the route is read, so the owner's own route is never cut. NULL means the
-- ends were never looked at (a route made public before this migration, or
-- a private one): both ends are trimmed for everyone else.
--
-- Additive only; changes no data.
-- Rollback: drop the column.

ALTER TABLE routes ADD COLUMN IF NOT EXISTS public_ends JSONB;
