-- 031_identity_lookup_function.sql
-- Description: The pre-authentication read of rider_identities.
--
-- Same chicken-and-egg as 030, one step earlier. Resolving a sign-in starts
-- by asking "which rider owns this (provider, subject)?" — and the answer is
-- what establishes app.rider_id in the first place. Under the row policy from
-- 028 that SELECT matches nothing, so every returning rider would fall
-- through to the create path and collide on the primary key.
--
-- The hole is again exactly one row wide: an exact match on (provider,
-- subject), which the caller has already proved they control by presenting a
-- signed ID token from that provider. Nothing here can enumerate identities.

CREATE OR REPLACE FUNCTION app.rider_id_by_identity(
    p_provider TEXT,
    p_subject  TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT ri.rider_id
      FROM rider_identities ri
     WHERE ri.provider = p_provider
       AND ri.subject = p_subject;
$$;

REVOKE ALL ON FUNCTION app.rider_id_by_identity(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'throttlebase_app') THEN
        GRANT EXECUTE ON FUNCTION app.rider_id_by_identity(TEXT, TEXT) TO throttlebase_app;
    END IF;
END $$;
