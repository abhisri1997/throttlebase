-- 022_auth_app_context.sql
-- Description: Request-scoped rider identity for RLS, using only standard
--              Postgres. No vendor auth schema is referenced anywhere.

CREATE SCHEMA IF NOT EXISTS app;

-- The rider the current transaction is acting as.
--
-- The backend calls `select set_config('app.rider_id', $1, true)` as the first
-- statement of each authenticated request. The `true` makes the setting
-- transaction-local, which matters because a connection pooler in transaction
-- mode may hand the same physical connection to a different rider immediately
-- afterwards. A session-level setting would leak across requests.
--
-- Returns NULL when unset, so a policy comparing against it matches nothing
-- rather than everything.
CREATE OR REPLACE FUNCTION app.current_rider_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.rider_id', true), '')::uuid;
$$;

REVOKE ALL ON FUNCTION app.current_rider_id() FROM PUBLIC;
