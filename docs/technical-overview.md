# Technical Overview - ThrottleBase

What each feature does and where it lives. For structure and flows see `architecture.md`; for contracts see `api-endpoints.md` and `database-design.md`; for status see `project-status.md`.

## Stack

| Layer | Choice |
| --- | --- |
| Server | Node.js 22+, TypeScript (strict, ES modules), Express 5, run with `tsx` |
| Validation | Zod 4 |
| Auth | `jose` (ES256 JWTs), Google and Apple identity tokens, emailed one-time codes (`nodemailer` for SMTP) |
| Data | PostgreSQL 17 + PostGIS on Supabase, raw SQL through `pg` |
| Realtime | Socket.IO 4, namespaces `/live` and `/rides` |
| Background work | `jobs` table + worker process on `node-cron` |
| Maps | Google Maps Platform (Directions, Geocoding, Places) behind a server proxy |
| Client | Expo SDK 57, React Native 0.86, Expo Router, TanStack Query, Zustand, NativeWind, `react-native-maps` |
| Device | `expo-location` + `expo-task-manager` (background tracking), motion activity readings, `expo-secure-store` |

## Features

### Sign-in and account

- Passwordless: Google, Apple (off until `APPLE_CLIENT_IDS` is set), or a 6-digit email code. No passwords or two-factor.
- New riders accept the current terms and privacy versions; the server records consent.
- Onboarding picks a unique username (`^[a-z0-9_]{3,20}$`). The app keeps a rider in onboarding until they have one.
- Account deletion is soft for 30 days, then the cleanup job hard-deletes.
- Code: `server/src/core/auth/`, `server/src/core/riders/`, `server/src/adapters/http/`, `client/app/(auth)/`, `client/src/services/authService.ts`.

### Rides

- Lifecycle `draft → scheduled → active → completed | cancelled`. Captain, co-captains, riders.
- Plan from scratch or from a saved route (`rides.route_id`, optionally reversed; `road_via` keeps directions on the route's roads).
- Duration comes from Google Directions at creation.
- Stops: any participant requests; captain or co-captain approves. Place suggestions along the route by category (`POST /api/stop-suggestions`).
- Auto start point: each rider can set their own start (`start_location_override`).
- Private and active rides are visible to participants only.
- Code: `server/src/services/ride.service.ts`, `ride.controller.ts`, `client/app/(modals)/create-ride.tsx`, `client/app/ride/[id].tsx`, `client/src/features/rides/`.

### Live group ride

- Captain or co-captain starts a session; a roll call at the start point comes before roll-out.
- Each rider has their own ride inside the group ride: start early, arrive, finish, resume (see `architecture.md` → Per-rider ride lifecycle).
- Presence heartbeats, live positions, incidents (group alert, crash, medical, mechanical) with acknowledgement and escalation.
- Regroup: propose a waiting point for a rider left behind (`POST /api/rides/:id/regroup`, `regroup:*` events).
- Ending with riders still out needs explicit confirmation (`409 UNFINISHED_RIDERS`).
- Timeline and replay endpoints read `ride_live_events` and `ride_live_location_samples`.
- Code: `server/src/services/live-session.service.ts`, `ride-progress.service.ts`, `server/src/core/ride-progress/`, `server/src/realtime/`, `client/src/store/liveSessionStore.ts`.

### Tracking and ride stats

- The app tracks whenever the rider is riding a ride — any screen, foreground or background. The tracker polls `GET /api/rides/riding`.
- About one fix every 5 s, with the phone's motion reading when recent. Readings end when the app goes to background, so a stale "in vehicle" reading cannot hide a stop.
- The server keeps a sample per 20 m, per 30 s, or when the motion reading changes.
- Stats count riding only: stops and walking are neither distance nor time; one fast fix while walking is never top speed. A sparse track with no sustained riding counts as zero riding.
- Profile totals (`riders.total_*`) come from `ride_history_stats`.
- Operator scripts: `npm run rides:recompute-riding` (recompute stats), `npm run routes:name-ends` (name route ends).
- Code: `client/src/services/backgroundLocationService.ts`, `motionActivityService.ts`, `server/src/realtime/sampleThrottle.ts`, `server/src/core/ride-progress/segmentRide.ts`, `ridingStats.ts`, `server/src/services/stats.service.ts`.

### Full-screen navigation

`client/app/ride/[id]/navigation.tsx`, with components, hooks and pure logic under `client/src/features/navigation/`.

- Road-following route in order: rider's location → start → approved stops → destination. Falls back to the start point when location is unknown.
- Directions through `/api/maps/directions`; identical in-flight or recent requests are shared (`navigationRouteService.ts`).
- Turn-by-turn maneuver banner, ETA and remaining distance, trip progress.
- Off-route detection reroutes from the rider's position, prefers the fastest alternative, and falls back to a destination-only detour.
- Refetch cadence: on the first fix, then after ≥ 40 m and ≥ 12 s of movement, and every 25 s.
- Polylines use turn-aware thinning with a point cap, so lines never cut through buildings.
- Crew bottom sheet: tap a rider to focus them; recenter returns to self-follow. Peer markers keep stable keys.
- Camera follows GPS course with compass fallback, with movement and heading deadbands on Android.
- Keep-awake only while this screen is focused and the app is active.
- Arrival prompt with auto-finish countdown.
- Dev GPS simulator (`gpsSimulator.ts`, `useSimulatedNavigationFix.ts`) records a real ride from the desk.
- Location permission is checked passively on mount (no automatic prompt); prompting on mount caused an Android remount loop (see `postmortems/android-ride-detail-flicker-crash.md`).

### Routes

- Create, bookmark, share. Visibility `private`, `specific_riders`, `public`.
- Save a completed ride as a route from your own recorded track: ends named by reverse geocode, stops carried over with optional notes, highlights chosen from a fixed list.
- Search from one place to another, in either direction, by name or proximity, with distance and highlight filters.
- "Was the road as described?" feedback after a ride on a route; aggregated on the route.
- Code: `server/src/core/routes/`, `server/src/services/route.service.ts`, `route-from-ride.service.ts`, `road-feedback.service.ts`, `client/src/features/routes/`.

### Community

- Feed posts, comments, likes, follows, ride reviews.
- @mentions resolve by username after the write, create in-app notifications, and queue push/email jobs. Composers suggest usernames; rendered mentions link to profiles; notifications deep-link to the post or comment.
- Groups exist behind `FEATURE_GROUPS`.
- Code: `server/src/services/community.service.ts`, `mention.service.ts`, `client/app/(tabs)/feed.tsx`, `client/app/post/[id].tsx`.

### Notifications, settings, privacy

- In-app notifications with per-type preferences for in-app, push and email.
- **Push and email delivery are stubs**: jobs are queued and preference-checked, nothing is sent. The beta relies on in-app notifications.
- Settings (theme, units, language), privacy (profile and history visibility, leaderboard opt-in, invite permission), blocking.

### Held back from the beta

Code kept, off by default. Each needs both the server `FEATURE_*` and client `EXPO_PUBLIC_FEATURE_*` flag.

- Rank: badges, achievements, leaderboard. Badges keep being awarded.
- Support: tickets, threaded replies, admin triage.
- Account security: sign-in activity and device sessions with revocation.
- Groups.

## Security posture

- Passwordless auth with ES256 access tokens (15 min) and rotating, family-tracked refresh tokens (30 days).
- Strict CORS allowlist for HTTP and sockets; security headers on every response; generic error bodies.
- Swagger fails closed: off unless `ENABLE_SWAGGER_DOCS=true`, and then behind basic auth.
- Admin actions gated by token roles from `rider_roles`.
- Rate limits: auth (Postgres-backed counters), Maps proxy and stop suggestions (`express-rate-limit`, per rider).
- Google spend capped by daily ceilings.
- RLS is defined but not enforced (the API connects to Supabase as `postgres`). Authorization is in service SQL.

## Configuration

- Server: `server/.env.example` is the reference, including database URLs, JWT keys, identity providers, auth policy and rate limits, consent versions, email driver, CORS, Swagger, Google key and ceilings, feature flags. Configuration is validated at boot (`server/src/composition/env.ts`).
- Ride progress tunables: `RIDE_EARLY_START_WINDOW_MIN`, `RIDE_ARRIVAL_RADIUS_M`, `RIDE_ARRIVAL_EXIT_RADIUS_M`, `RIDE_ARRIVAL_MAX_ACCURACY_M`, `RIDE_AUTO_FINISH_DWELL_MIN`, `RIDE_IDLE_AUTO_END_MIN`.
- Live location freshness: `LIVE_LOCATION_MAX_AGE_MS`, `LIVE_LOCATION_MAX_FUTURE_SKEW_MS`.
- Client: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SHARE_BASE_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN`, `EXPO_PUBLIC_TERMS_VERSION`, `EXPO_PUBLIC_ENABLE_LIVE_SESSION`, `EXPO_PUBLIC_FEATURE_*`. `EXPO_PUBLIC_API_URL` picks the backend: EAS `development` and `preview` profiles use `https://api-dev.throttlebase.in`, `production` uses `https://api.throttlebase.in`. With no value, a dev build talks to the API on the Metro host (port 5001, `10.0.2.2` on the Android emulator) and a release build falls back to the development API, never production (`client/src/adapters/http/baseUrl.ts`).

## Testing

| Command | Scope |
| --- | --- |
| `cd server && npm test` | `test.ts`: end-to-end live-session script (sockets, processors) against the configured database |
| `cd server && npm run test:unit` | Node test runner over `src/**/*.test.ts` |
| `cd server && npm run test:integration` | Postgres integration tests; need `TEST_DATABASE_URL` pointing at a throwaway PostGIS database |
| `cd server && npm run lint:boundaries` | Architecture boundary rules only |
| `cd server && npm run typecheck` | `tsc --noEmit` |
| `cd client && npm test` | Node test runner over `src/**/*.test.ts` (pure modules in `src/core`, `src/features/*/core`, `src/services`) |
| `cd client && npx tsc --noEmit` | Client typecheck |
| `npm run lint` / `npm run lint:boundaries` | ESLint and architecture boundary rules, in either package |
