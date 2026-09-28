# Project Status - ThrottleBase

Last reviewed against the code: 2026-09-28.

## Closed Beta Scope

The first release is a closed beta: a few riders and riding clubs, installed
from TestFlight and the Play internal track. Its hero features are routes and
rides; everything else ships only if it is already solid, to keep the surface
small and the bug count low.

### In the beta

- Routes: create, bookmark, share, search, save a ride as a route, road feedback.
- Rides: create, join, schedule, stops, live group session and full-screen
  navigation, per-rider start and finish, ride history.
- Feed (posts, comments, likes, mentions) and follows with rider profiles.
- Profile with ride stats only (distance, rides, history).
- Passwordless sign-in, onboarding, settings, in-app notifications.

### Held back behind feature flags (code kept, off by default)

| Feature | Server flag | Client flag |
| --- | --- | --- |
| Groups | `FEATURE_GROUPS` | `EXPO_PUBLIC_FEATURE_GROUPS` |
| Rank (leaderboard, badges, achievements) | `FEATURE_RANK` | `EXPO_PUBLIC_FEATURE_RANK` |
| Support tickets and admin triage | `FEATURE_SUPPORT` | `EXPO_PUBLIC_FEATURE_SUPPORT` |
| Devices and sign-in activity | `FEATURE_ACCOUNT_SECURITY` | `EXPO_PUBLIC_FEATURE_ACCOUNT_SECURITY` |

A feature comes back by setting both flags to `true` and shipping a new app
build. Badges keep being awarded meanwhile, so Rank launches with history.

### Removed

- Passwords and TOTP two-factor: sign-in is passwordless.

## Current state

### Environments

| Environment | API | Used by |
| --- | --- | --- |
| Production | `https://api.throttlebase.in` | EAS `production` builds |
| Development | `https://api-dev.throttlebase.in` | EAS `development` and `preview` builds, beta tester APKs |
| Local | `http://<metro host>:5001` | Dev builds with no `EXPO_PUBLIC_API_URL` |

Both hosted APIs run on Railway and answered `/health` on 2026-09-28. The database is the Supabase project `throttlebase` (`ap-south-1`), the only project on the account; it previously ran on Neon. All 37 migration files are applied there.

### Done

- Passwordless auth on ports and adapters: Google, Apple (ready, off until configured), email code; rotating refresh-token families; JWKS; consent capture; role table.
- Rides end to end: planning from a saved route, stop suggestions, roll call and roll-out, per-rider start/arrive/finish/resume, auto-finish and idle end, regroup, incidents.
- Tracking: background tracker on any screen, motion readings with each fix, server-side sample throttling, stale/future/out-of-order fix rejection.
- Ride stats from riding only: stop and jam detection, motion-aware; sparse tracks no longer count as riding (PR #43).
- Routes: search by place in either direction, save a ride as a route, highlights, road feedback.
- Full-screen navigation: guidance, reroute and detour, crew focus, Android stability fixes, dev GPS simulator.
- Maps proxy: all Google calls server-side with rate limits and daily ceilings.
- Security baseline: CORS allowlist, headers, Swagger fail-closed, admin-gated rewards writes.

### In progress

- First real-world ride on a physical phone to prove per-rider progress and motion-based stop detection end to end.
- Live-session reliability: reconnect after token refresh, background/resume.

## Known gaps

### Security and data

- **RLS is not enforced.** The API connects to Supabase as `postgres` (BYPASSRLS); `throttlebase_app` and `throttlebase_migrator` are `NOLOGIN`. Legacy services don't set `app.rider_id`, so switching roles today would break settings, preferences and other per-rider tables. Needed: move services onto `withRiderTransaction`, set role passwords, point `DATABASE_URL` at `throttlebase_app` and `MIGRATION_DATABASE_URL` at `throttlebase_migrator`.
- Transitional (allow-all) RLS policies remain on ride, route, live, social, support and rewards tables.
- Leaderboard ignores `rider_privacy_settings.leaderboard_opt_in`.

### Backend

- Push (FCM/APNs) and email notification processors are stubs; no device-token registration.
- Worker changes (auto-finish, idle end) are not pushed over sockets; clients see them on their next poll.
- Single API instance only: sampling state is in memory and Socket.IO has no shared adapter.
- `gps_traces` and `/api/routes/traces` are unused legacy paths.
- `ride_history_stats` elevation and calorie columns are never filled.
- Riders are not notified when an admin updates their support ticket.

### Client

- `GET /api/riders/me` still returns `is_admin` via a JSON fallback on a dropped column, so it is always `false`. The settings screen uses it to show "Admin - Manage Tickets", so admins never see that entry. It should read roles instead (support is flagged off for the beta).
- The `/live` socket reconnects with the token it was given at `connect()`. After the access token expires, Socket.IO's automatic reconnect uses the stale token until the app calls `connect()` again with a fresh one.
- Two HTTP clients coexist (fetch adapter and legacy axios).
- `app/ride/[id].tsx` (~2,560 lines) and `app/ride/[id]/navigation.tsx` (~980 lines) are due to be split.
- No feedback channel for testers while support is hidden.

## Prioritized backlog

### P0 — beta readiness

1. Real-phone ride validation of per-rider progress, motion readings and stop markers.
2. Live socket reconnect with a refreshed token.
3. Tester feedback channel.

### P1 — security and delivery

1. Enforce RLS: services on `withRiderTransaction`, API on `throttlebase_app`, then replace transitional policies.
2. Real push and email providers with device registration.
3. Fix admin detection on the client (roles instead of `is_admin`).
4. Honour `leaderboard_opt_in` before Rank launches.

### P2 — scale and cleanup

1. Socket.IO shared adapter and shared sampling state for more than one API instance; let the worker publish socket events.
2. Retire `gps_traces`, the axios client and the remaining legacy vendor zone.
3. Split the large ride-detail and navigation screens.

## Validation checklist (per milestone)

1. `npm run typecheck`, `npm run test:unit` and `npm run lint:boundaries` pass in `server/`; `npm test` and `npx tsc --noEmit` pass in `client/`.
2. Migration integration tests pass against a throwaway PostGIS database.
3. Permission boundaries have tests.
4. Both iOS and Android paths work on a device.
5. Queue flows are safe to retry and to run twice.
6. `docs/` and `ai-assistant.md` match the change.
