-- 028_rls_policies.sql
-- Description: Row-level security as defence in depth.
--
-- Authorisation is enforced in application SQL today. These policies are a
-- second, independent layer: if a WHERE clause is ever forgotten or a query
-- is built wrongly, the database still refuses to return another rider's
-- private rows.
--
-- Every policy is expressed against app.current_rider_id(), which reads a
-- transaction-local setting. Nothing here references a vendor auth schema.
--
-- Scope, agreed explicitly: the auth and identity surface gets real
-- restrictive policies now. The remaining tables get a transitional
-- permissive policy so existing features keep working, and are listed at the
-- bottom for follow-up. They are permissive by intent, not by oversight.

-- ── Private, strictly per-rider ────────────────────────────────────────────
-- One row set per rider, never readable by another rider under any feature.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sessions',
        'rider_identities',
        'rider_consents',
        'rider_settings',
        'rider_privacy_settings',
        'login_activity',
        'vehicles',
        'gear',
        'notification_preferences'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS app_owner_all ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY app_owner_all ON public.%I FOR ALL TO throttlebase_app '
            'USING (rider_id = app.current_rider_id()) '
            'WITH CHECK (rider_id = app.current_rider_id())', t);
    END LOOP;
END $$;

-- Roles are readable by their owner but only ever granted out of band, so the
-- app role gets no write path to its own privileges.
ALTER TABLE public.rider_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_owner_select ON public.rider_roles;
CREATE POLICY app_owner_select ON public.rider_roles
    FOR SELECT TO throttlebase_app
    USING (rider_id = app.current_rider_id());

-- ── riders ────────────────────────────────────────────────────────────────
-- Profiles are a product feature: riders look each other up, so SELECT stays
-- broad over non-deleted rows and privacy is enforced in application logic.
-- Writes are the part that must never be broad — a rider may only ever
-- modify their own row. Narrowing SELECT further needs column-level controls
-- on email, which is tracked as follow-up rather than faked here.
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_riders_select ON public.riders;
CREATE POLICY app_riders_select ON public.riders
    FOR SELECT TO throttlebase_app
    USING (deleted_at IS NULL OR id = app.current_rider_id());

DROP POLICY IF EXISTS app_riders_insert ON public.riders;
CREATE POLICY app_riders_insert ON public.riders
    FOR INSERT TO throttlebase_app
    WITH CHECK (true);  -- sign-up happens before a rider id exists

DROP POLICY IF EXISTS app_riders_update ON public.riders;
CREATE POLICY app_riders_update ON public.riders
    FOR UPDATE TO throttlebase_app
    USING (id = app.current_rider_id())
    WITH CHECK (id = app.current_rider_id());

-- ── Pre-authentication tables ─────────────────────────────────────────────
-- Consulted before any rider identity exists, so there is no app.rider_id to
-- scope by. Keyed by email address and IP, never by rider. Permissive to the
-- app role is the only workable rule; these rows hold digests, not secrets.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['email_otps', 'rate_limit_counters']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS app_preauth_all ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY app_preauth_all ON public.%I FOR ALL TO throttlebase_app '
            'USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- ── Transitional ──────────────────────────────────────────────────────────
-- Permissive by intent. These tables carry ride, social and support data
-- whose sharing rules are genuinely complex (public rides, group membership,
-- follower visibility), and writing those rules as policies is a separate
-- piece of work. They are listed explicitly rather than left un-enabled, so
-- the follow-up is visible in the schema itself.
--
-- FOLLOW-UP: replace each of these with a real policy.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'achievements', 'badges', 'blocked_riders', 'comments', 'follows',
        'google_api_usage', 'gps_traces', 'group_members', 'groups', 'jobs',
        'likes', 'notifications', 'posts', 'ride_history_stats',
        'ride_live_events', 'ride_live_incidents', 'ride_live_location_samples',
        'ride_live_presence', 'ride_live_sessions', 'ride_participants',
        'ride_reviews', 'ride_stops', 'rider_achievements', 'rider_badges',
        'rides', 'route_bookmarks', 'route_shares', 'routes',
        'stop_suggestion_cache', 'support_ticket_messages', 'support_tickets'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS app_transitional_all ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY app_transitional_all ON public.%I FOR ALL TO throttlebase_app '
            'USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;
