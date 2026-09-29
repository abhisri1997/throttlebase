# Architecture - ThrottleBase

How the system is put together and how data moves through it. For feature detail see `technical-overview.md`; for contracts see `api-endpoints.md` and `database-design.md`.

## System at a glance

```text
 Phone (Expo / React Native)
   Expo Router screens ── TanStack Query (server data)
                          Zustand liveSessionStore (live data)
   HTTP client (fetch; axios on older screens)
   socket.io-client: /live, /rides
   Background location task (expo-task-manager) + motion readings
        │ HTTPS, Bearer JWT            │ WebSocket, JWT in handshake
        ▼                              ▼
 API process (Railway) — Express 5 + Socket.IO on one HTTP server
   /auth, /.well-known ── core/auth use cases (ports and adapters)
   /api/* ── routes → controllers → services (SQL)
   /live, /rides ── realtime gateway
   /api/maps ── the only caller of Google
        │ pg pool                      ▲ enqueue jobs
        ▼                              │
 PostgreSQL 17 + PostGIS (Supabase, ap-south-1)
   domain tables, jobs table, RLS policies
        ▲ lease with FOR UPDATE SKIP LOCKED
        │
 Worker process (npm run worker) — polls every 10 s, runs job processors
```

## Runtime components

| Component | Code | Runs as |
| --- | --- | --- |
| Mobile app | `client/` | Expo SDK 57, React Native 0.86. Built with EAS (`.eas/workflows/`) or `expo run:*` |
| API | `server/src/app.ts` | `npm start` (`tsx src/app.ts`). Default port 5001; reads `PORT` |
| Realtime gateway | `server/src/realtime/gateway.ts` | Inside the API process, same HTTP server |
| Worker | `server/src/workers/worker.ts` | Separate process, `npm run worker` |
| Database | `server/src/db/migrations/` | Supabase Postgres 17 + PostGIS. Migrations via `npm run migrate` |
| Google Maps Platform | `server/src/services/maps/` | Called only by the API |

The API and the worker share nothing but the database.

## Hosting

- Two API environments on Railway, both behind Cloudflare DNS: production `api.throttlebase.in` and development `api-dev.throttlebase.in`. EAS `production` builds use the first; `development` and `preview` builds (including beta APKs) use the second.
- Database: Supabase project `throttlebase`, region `ap-south-1` (Mumbai) — the only project on the account. Each environment's `DATABASE_URL` lives in Railway variables. Nothing in code is Supabase-specific beyond comments.
- Website: Railway service `throttlebase-client` builds the web app from `client/` (`npx expo export --platform web`) and serves `client/dist` with `npm run serve:web` (`client/scripts/serve-web.mjs`). Production `throttlebase.in` deploys from `main`, development `dev.throttlebase.in` from `dev`. Never run `npm run web` there: it is Metro's development server.
- Mobile builds: EAS (development and production workflows).
- Share links: `https://throttlebase.in`.

## Server structure

Two styles live side by side. New work goes into the first; the second is being migrated.

### Ports and adapters (auth, accounts, pure domain logic)

- `src/core/` — business rules with no npm packages and no `node:` imports.
  - `core/auth/` — sign-in with Google, Apple or email code, session issue, refresh and logout.
  - `core/riders/` — onboarding, account deletion.
  - `core/ride-progress/` — arrival state machine, per-rider progress rules, riding/stop segmentation, riding stats.
  - `core/routes/` — route search, route-from-track, road-following via points, stop placement, end naming.
- `src/ports/` — interfaces core needs: `Clock`, `EmailSender`, `Hasher`, `IdentityVerifier`, `OtpStore`, `RandomSource`, `RateLimiter`, `RiderRepository`, `SessionRepository`, `TokenIssuer`, `TokenVerifier`.
- `src/adapters/` — implementations: `postgres/`, `tokens/` (jose), `identity/` (Google, Apple), `email/` (console, SMTP), `system/`, `http/` (Express routes for auth and accounts).
- `src/composition/container.ts` — the composition root; the one place that picks an adapter for each port. `composition/env.ts` validates configuration at boot and stops the process with a named error.

The boundary is enforced by lint (`server/eslint.boundaries.js`, `npm run lint:boundaries`): `core/` and `ports/` may import only relative paths and never `adapters/`; vendor packages may be imported only from `adapters/`. Core tests use fakes from `core/testing/`.

### Layered legacy zone (everything else)

`routes/ → controllers/ → services/`, with Zod contracts in `schemas/`. Services run SQL directly through `query()` from `src/config/db.ts`. These folders — plus `app.ts`, `config/`, `middleware/`, `queue/`, `realtime/`, `workers/` — are listed as `LEGACY_VENDOR_ZONE` in the lint config. That list may only shrink.

## Request lifecycle (HTTP)

1. Helmet plus custom headers: HSTS on HTTPS, strict CSP, `X-Frame-Options: DENY`, COOP/COEP/CORP, `Permissions-Policy`. `X-Powered-By` is off.
2. Origin check: a request with a disallowed `Origin` gets `403 { error: "Origin not allowed" }`. CORS allowlist from `CORS_ALLOWED_ORIGINS`.
3. JSON body parsing.
4. Feature gates: `requireFeature()` answers 404 for groups, rank, support and account security unless their flags are on.
5. `authenticate` (`src/middleware/auth.middleware.ts`) verifies the access token's signature and sets `req.rider = { riderId, roles }`. No database lookup.
6. Zod validation in the route or controller, then the service or use case.
7. A final error handler returns `500 { error: "Internal server error" }` with no stack.

## Auth

- Sign-in: `POST /auth/google | /auth/apple | /auth/email/start + /auth/email/verify`. The use case verifies the credential, finds or creates the rider (`resolveOrCreateRider`), records consent and login activity, then issues a session.
- Access token: ES256 JWT signed with `jose`, 15 min by default. Claims: `sub` (rider id), `roles`. Verified by signature alone. Public keys at `/.well-known/jwks.json`; retired keys stay published so rotation is seamless.
- Refresh token: random, 30 days by default, stored only as a hash in `sessions`. Each refresh rotates it. All rotations share a `family_id`; presenting an already-rotated token revokes the family.
- Revocation takes effect at the next refresh. An issued access token stays valid until it expires.
- Roles come from `rider_roles` (`admin`, `support`) and are re-read at every refresh. `requireAdmin` checks the token.
- Email codes: hashed in `email_otps`, limited attempts, rate-limited per email and per IP through `rate_limit_counters`. In development `EMAIL_DRIVER=console` prints codes; production refuses it unless `ALLOW_CONSOLE_EMAIL=true`.
- Client: `client/src/core/auth/session.ts` refreshes 60 s before expiry; `singleFlight` stops parallel refreshes. Tokens live in `expo-secure-store`. The HTTP adapter retries a request once after a 401.

## Data access and security

- One `pg` pool (`src/adapters/postgres/pool.ts`), max 20 connections, TLS for any non-local host.
- RLS is defined for every table (migration 028), keyed on the transaction-local `app.rider_id`. `withRiderTransaction()` sets it.
- **Only the auth adapters use `withRiderTransaction`.** Legacy services query without setting a rider.
- **The hosted database is reached as `postgres` (BYPASSRLS)**, so policies are not enforced for the API. Authorization lives in application SQL: participant, captain/co-captain and visibility checks in services.
- Details and the migration path: `database-design.md` → Row-level security.

## Realtime

- One Socket.IO server with two namespaces. Handshake auth uses the same token verifier as HTTP (`src/realtime/auth.ts`).
- `/live` — a live group session. Room `ride:<rideId>:session:<sessionId>`; joins require confirmed participation.
- `/rides` — ride-detail updates (joins, stop requests). Room `ride:<rideId>`; subscribing requires a public ride or participation.
- REST controllers push into rooms through `emitToLiveRoom` / `emitToRideRoom`.

### Location pipeline

Each `location:update` goes through:

1. Zod validation, then a check that the session is live.
2. `locationGate` (`realtime/locationGate.ts`): a dev GPS simulation takes over a rider's position for 30 s.
3. `sampleThrottle` (`realtime/sampleThrottle.ts`): decides whether this fix becomes a stored sample — moved ≥ 20 m, 30 s elapsed, or motion reading changed.
4. `updateLivePresenceLocation()` (`services/live-session.service.ts`): drops fixes older than 2 min, more than 30 s in the future, or out of order; updates presence; stores the sample; runs the arrival state machine.
5. Broadcast `location:broadcast` to the room. Send `ride:arrival` to the rider when they arrive or leave.

## Per-rider ride lifecycle

The group session and each rider's own ride are separate (migration 032, `core/ride-progress/`).

1. Rider starts their own ride (`live/me/start`, up to 60 min early), or starts at captain roll-out, or on a late rider's first position.
2. Samples are kept only from that start.
3. Arrival: within 150 m of the destination counts as arrived; beyond 300 m counts as left. Arming needs one trip beyond 300 m, so round trips don't arrive at the start. Fixes worse than 100 m accuracy are ignored.
4. Finish: by hand (`arrived` or `left_early`), automatically after 10 min parked at the destination, or when the captain ends the ride (`arrived` or `group_ended`). An arrival is dated to reaching the destination.
5. Each finish enqueues `ride_stats.recompute` for that rider.
6. The ride completes once everyone who rode has finished, and ends itself after 120 min with no riding rider reporting.

Thresholds are environment-tunable (`RIDE_*` variables in `core/ride-progress/config.ts`).

### Ride stats

`services/stats.service.ts` reads `ride_live_location_samples` up to the rider's finish. `core/ride-progress/segmentRide.ts` splits the track into riding and stops. Riding means sustained speed of 12 km/h or more for 30 s or more. Motion readings separate a stop (walking) from a jam (still on the bike). `ridingStats.ts` computes distance, riding time, and average and max speed, then writes `ride_history_stats`, refreshes the rider's totals and enqueues `rewards.recompute`.

## Background jobs

- Queue: the `jobs` table (`src/queue/queue.ts`). `leaseJobs` claims up to 20 pending jobs with `FOR UPDATE SKIP LOCKED` and a 120 s lease. Expired leases are recovered.
- Worker: `node-cron` tick every 10 s. Each tick recovers locks, schedules recurring jobs if they are due, leases a batch and runs processors.
- Retries: 30 s, 2 min, 10 min, 30 min backoff until `max_attempts` (default 3), then `failed`.

| Job type | Processor | Trigger |
| --- | --- | --- |
| `ride_stats.recompute` | `ride-stats.processor.ts` | Rider finishes; ride completes |
| `rewards.recompute` | `rewards.processor.ts` | Enqueued by the stats recompute (deduplicated per rider) |
| `ride_progress.sweep` | `ride-progress.processor.ts` | Recurring: auto-finish parked riders, end idle rides |
| `live_session.started` / `.ended` | `live-session.processor.ts` | Session lifecycle; notification fanout |
| `live_session.incident_reported` | `live-notification.processor.ts` | Incident created |
| `live_session.presence_sweep` | `live-ops.processor.ts` | Recurring: mark silent riders offline |
| `live_session.incident_escalate` | `live-ops.processor.ts` | Recurring: escalate unacknowledged incidents |
| `cleanup.expired_sessions` | `cleanup.processor.ts` | Recurring: delete expired/revoked sessions; hard-delete riders 30 days after soft delete |
| `notification.push` / `notification.email` | `notification-delivery.processor.ts` | Queued after in-app notifications. **Stub**: checks preferences, logs, delivers nothing |

## Maps

- Client → `/api/maps/*` and `/api/stop-suggestions` → `services/maps/googleMapsProvider.ts` → Google. The client never calls Google directly (`client/src/api/maps.ts`).
- The API key is bound once in the adapter and never passed per request.
- Protection: per-rider rate limits (`middleware/rateLimit.middleware.ts`), daily ceilings counted in `google_api_usage`, and Places results cached in `stop_suggestion_cache`.

## Client structure

| Area | Location | Notes |
| --- | --- | --- |
| Screens | `client/app/` | Expo Router: `(auth)` sign-in and onboarding, `(tabs)` feed, rides, routes, profile (+ groups, rewards behind flags), `(modals)`, detail screens `ride/[id]`, `ride/[id]/navigation`, `route/[id]`, `rider/[id]`, `post/[id]`, `group/[id]` |
| Route guard | `client/app/_layout.tsx` | Signed out → sign-in (shared posts excepted); no username → onboarding; disabled feature → feed |
| Server state | TanStack Query | One `QueryClient` in the root layout |
| Live state | `client/src/store/liveSessionStore.ts` | Zustand. Owns the `/live` socket listeners, presence, locations, incidents, regroup and arrival state |
| Ports and adapters | `client/src/ports/`, `client/src/adapters/` | `ApiClient`, `AuthService`, `LiveRideChannel`, `SecureStorage`; fetch HTTP adapter, Google/Apple sign-in, secure storage |
| Legacy HTTP | `client/src/api/client.ts` | axios wrapper bridged to the auth service; to be replaced by the fetch adapter |
| Sockets | `client/src/services/liveSessionSocket.ts`, `rideSocket.ts` | `/live` and `/rides` |
| Background tracking | `client/src/hooks/useBackgroundLocationTracker.ts`, `services/backgroundLocationService.ts` | Mounted once in the root layout. Polls `GET /api/rides/riding`; while riding, sends `location:update` about every 5 s, foreground or background, with the latest motion reading |
| Motion | `client/src/services/motionActivityService.ts`, `motionReading.ts` | A reading stays current until it changes or the app goes to background |
| Feature logic | `client/src/features/{navigation,rides,routes}/core/` | Small pure modules with unit tests (guidance, maneuver, roll call, regroup, camera policy, trip summary, route search query, save route, …) |
| Feature flags | `client/src/core/features/features.ts` | `EXPO_PUBLIC_FEATURE_*`, inlined at build time |

Client boundaries are lint-enforced too (`client/eslint.boundaries.mjs`, `npm run lint:boundaries`):

- `src/core/` and `src/ports/` import only relative paths.
- Network and platform SDKs (Google sign-in, Apple auth, `expo-secure-store`, `expo-crypto`, AsyncStorage, axios, `socket.io-client`) may be imported only from `src/adapters/`.
- Screens (`app/`) and `src/components/` never import `adapters/` or `ports/`; they go through `src/services/`.
- Legacy exceptions, to be moved into adapters: `src/api/client.ts`, `src/api/maps.ts`, `src/services/liveSessionSocket.ts`, `src/services/rideSocket.ts`, `useNavigationSession.ts`.

## Scaling constraints

The current design assumes **one API instance**:

- `locationGate` and `sampleThrottle` keep per-rider state in process memory.
- Socket.IO has no shared adapter (no Redis), so an instance reaches only its own sockets.
- The worker cannot emit socket events. Changes it makes (auto-finish, idle end) reach clients through polling.

Running more than one API instance needs a Socket.IO adapter and shared sampling state first.
