-- 030_session_lookup_function.sql
-- Description: The one pre-authentication read of the sessions table.
--
-- Refreshing a token is a chicken-and-egg problem for row-level security: the
-- refresh token is what proves who the caller is, so at lookup time there is
-- no app.rider_id to scope by. Under the policy from 028 a plain
-- SELECT ... WHERE refresh_token_hash = $1 matches nothing, and every refresh
-- fails.
--
-- Rather than relax the policy on the whole table — which would let any
-- authenticated request enumerate every session in the system — this function
-- opens a hole exactly one row wide. It returns only the row whose digest the
-- caller already presented, and holding that digest is equivalent to holding
-- the token itself.
--
-- SECURITY DEFINER means it runs as its owner (the migration role), so it is
-- not subject to the caller's policies. search_path is pinned: without it, a
-- caller could create a `sessions` table in a schema earlier on their own
-- search_path and have this function read that instead.

CREATE OR REPLACE FUNCTION app.session_by_refresh_hash(p_hash TEXT)
RETURNS TABLE (
    id                 UUID,
    rider_id           UUID,
    family_id          UUID,
    refresh_token_hash TEXT,
    expires_at         TIMESTAMPTZ,
    revoked_at         TIMESTAMPTZ,
    replaced_by        UUID,
    last_used_at       TIMESTAMPTZ,
    user_agent         TEXT,
    ip_address         TEXT,
    created_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT s.id,
           s.rider_id,
           s.family_id,
           s.refresh_token_hash,
           s.expires_at,
           s.revoked_at,
           s.replaced_by,
           s.last_used_at,
           s.user_agent,
           s.ip_address::text,
           s.created_at
      FROM sessions s
     WHERE s.refresh_token_hash = p_hash;
$$;

-- Only the application role may call it, and only with a digest in hand.
REVOKE ALL ON FUNCTION app.session_by_refresh_hash(TEXT) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
        GRANT EXECUTE ON FUNCTION app.session_by_refresh_hash(TEXT) TO throttlebase_app;
    END IF;
END $$;
