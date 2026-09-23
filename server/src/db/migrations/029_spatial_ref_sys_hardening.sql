-- 029_spatial_ref_sys_hardening.sql
-- Description: Makes the PostGIS reference table read-only to application
--              roles.
--
-- spatial_ref_sys ships world-writable on several managed Postgres images.
-- On the production database every one of anon, authenticated, service_role
-- and postgres held INSERT, UPDATE, DELETE and TRUNCATE on it. Corrupting it
-- would silently break every geography computation in the product — route
-- distances, nearby search, ride tracks — and nothing in ThrottleBase has
-- ever needed to write to it.
--
-- TRUNCATE is revoked alongside the three the brief named, since it destroys
-- the table just as effectively.
--
-- Note for managed platforms: this table is often owned by a platform
-- superuser rather than the migration role, in which case these statements
-- must be run by that owner. The DO block skips roles that do not exist so
-- the file is portable across vendors.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM PUBLIC;

DO $$
DECLARE
    r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY[
        'anon',
        'authenticated',
        'service_role',
        'throttlebase_app',
        'throttlebase_migrator'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format(
                'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM %I', r);
        END IF;
    END LOOP;
END $$;

-- Reading it is required for every coordinate transform.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
        GRANT SELECT ON public.spatial_ref_sys TO throttlebase_app;
    END IF;
END $$;
