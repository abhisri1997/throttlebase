-- 027_app_role_and_grants.sql
-- Description: Least-privilege database roles.
--
-- The API connects as throttlebase_app, which owns nothing and has no
-- BYPASSRLS. Both properties matter: a table owner bypasses its own row
-- policies unless FORCE is set, so connecting as the owner would make every
-- policy in 028 decorative. Migrations and background jobs use
-- throttlebase_migrator instead, which is why this file can create roles that
-- the app role itself could never create.
--
-- No password is set here. Credentials do not belong in version control, so
-- an operator runs this once, out of band:
--
--   ALTER ROLE throttlebase_app      WITH LOGIN PASSWORD '<generated>';
--   ALTER ROLE throttlebase_migrator WITH LOGIN PASSWORD '<generated>';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
        CREATE ROLE throttlebase_app NOLOGIN NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_migrator') THEN
        CREATE ROLE throttlebase_migrator NOLOGIN NOBYPASSRLS;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO throttlebase_app;
GRANT USAGE ON SCHEMA app TO throttlebase_app;
GRANT EXECUTE ON FUNCTION app.current_rider_id() TO throttlebase_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO throttlebase_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO throttlebase_app;

-- Tables added by later migrations should be reachable without revisiting
-- this file. Row policies, not table grants, are what constrain access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO throttlebase_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO throttlebase_app;

-- The ledger is the migrator's business alone.
REVOKE ALL ON TABLE schema_migrations FROM throttlebase_app;
