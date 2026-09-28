# Plan — Enforce row-level security (E10, D5)

**Decision (2026-09-29):** make the RLS policies from migrations 027–028 actually apply. Close the Supabase Data API surface first.

## Today

- **RLS is bypassed.** The API connects as Supabase's `postgres` role, which has BYPASSRLS. `throttlebase_app` and `throttlebase_migrator` exist but are `NOLOGIN` (mig 027; `docs/project-status.md`).
- **Legacy services don't set `app.rider_id`.** They use the plain `query()` helper, so switching roles today would break every per-rider table. Only the ports-and-adapters code uses `withRiderTransaction` (`server/src/adapters/postgres/requestContext.ts`).
- **Allow-all transitional policies** cover the ride, route, live, social, support and rewards tables (mig 028, plus 033 and 035).
- **Supabase security advisors** on the production project `throttlebase` (ap-south-1), read 2026-09-28:
  - ERROR: `public.spatial_ref_sys` has RLS disabled. It is PostGIS reference data and writes are already revoked (mig 029).
  - WARN: SECURITY DEFINER functions are executable by `anon` and `authenticated` through `/rest/v1/rpc/…`: `public.rls_auto_enable()` and three overloads of `public.st_estimatedextent`.
  - WARN: mutable `search_path` on `public.update_timestamp` and `app.current_rider_id`.
  - WARN: the `postgis` extension is installed in `public`.
  - INFO: `public.schema_migrations` has RLS enabled but no policies. That is fine: it denies all.
  - Every app table has RLS enabled and no `anon` policy, so the anonymous Data API role cannot read rows today.

## Phase 1 — Shrink the exposed surface (small, do first)

1. **Supabase dashboard.** The app never uses the Data API (PostgREST) or Supabase Auth, so **disable the Data API**, or remove `public` from its exposed schemas. This one change removes the whole `/rest/v1` surface, including the RPC findings.
   - This is a manual infra step; per spec rule 4 the agent lists it and does not perform it.
2. **Migration** (additive):
   - `ALTER FUNCTION public.update_timestamp() SET search_path = public, pg_temp;`
   - the same for `app.current_rider_id()` (`SET search_path = pg_catalog, pg_temp`);
   - `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, PUBLIC;` (guarded by role existence, like mig 029).
3. Leave `postgis` in `public` for now. Moving extensions is invasive, and the Data API closure removes the exposure. Revisit with a PostGIS upgrade.
4. Re-run the advisors and record the results.

## Phase 2 — Every request carries the rider

1. Route every service query through `withRiderTransaction(pool, riderId, fn)`, which calls `set_config('app.rider_id', …, true)`:
   - Work through `server/src/services/*` module by module: rider, settings and notification preferences first (they already have strict policies), then rides, routes, live session, community, support, rewards.
   - Unauthenticated reads (for example public ride discovery, if kept) run with no rider set, and policies must allow exactly what is public.
2. **Worker.** Background jobs are cross-rider by nature: sweeps, stats, rewards, purges. Create a `throttlebase_worker` role with `NOBYPASSRLS`, and give it explicit policies such as `FOR ALL TO throttlebase_worker USING (true)` on the tables it maintains, or use narrow SECURITY DEFINER functions with a pinned `search_path` for the specific operations.
   - Never run the worker as `postgres`.
3. **Lint guard.** Forbid importing the raw `query()` helper in `server/src/services` once migrated (`lint:boundaries`).

## Phase 3 — Switch the connection

1. Set passwords out of band for `throttlebase_app`, `throttlebase_worker` and `throttlebase_migrator` (mig 027 comment).
2. Environment:
   - `DATABASE_URL` → `throttlebase_app` (API);
   - `WORKER_DATABASE_URL` → `throttlebase_worker`;
   - `MIGRATION_DATABASE_URL` → `throttlebase_migrator`.

   Use Supabase's pooler in transaction mode. `set_config(..., true)` is transaction-local, so it is safe there.
3. Roll out in `api-dev` first: run the full unit, integration and live-session suites, then manual passes of the main flows. Then production.
4. Keep `postgres` credentials out of Railway entirely after the switch.

## Phase 4 — Replace transitional policies

For each table group, replace `app_transitional_all` with real policies that mirror the service rules, and add authorization tests:

| Group | Policy intent |
| --- | --- |
| rides, ride_participants, ride_stops | Public rides readable by all signed-in riders; private rides by participants; writes by captain or co-captain (or self for own participation) |
| live tables (sessions, presence, samples, events, incidents) | Participants during a live session. After it ends, samples readable only by their own rider ([live-positions.md](live-positions.md)) |
| routes, route_shares, route_bookmarks, route_stops, route_road_feedback | By visibility (private / specific_riders / public); writes by creator |
| posts, comments, likes, follows, groups, group_members, ride_reviews, blocked_riders | Readable per visibility and not blocked; writes by the owner |
| notifications | Recipient only |
| support_tickets, support_ticket_messages | Owner, plus the `support`/`admin` role via `rider_roles` |
| jobs, google_api_usage, stop_suggestion_cache | Worker only; no app access |

## Test

- The **authorization suite** (the E10 deliverable) runs against a real database connected as `throttlebase_app`. For every resource route: rider A cannot read or modify rider B's private rides, traces, tickets, sessions, notifications or settings.
- The migration integration test asserts no table in `public` lacks RLS, except `spatial_ref_sys`, which has an explicit comment.
- CI step (once CI exists): run the Supabase advisors or an equivalent SQL check, and fail on ERROR.

## Docs to update

- `data-inventory.md` §1.5.
- `docs/project-status.md` Known gaps.
- `docs/database-design.md` roles section.
