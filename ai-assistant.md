# AI Assistant Context - ThrottleBase

## Purpose

Operational brief for AI-assisted development. Concise, current, action-oriented.
Last reviewed against code: 2026-09-28.

## Project Snapshot

ThrottleBase: mobile-first platform for motorcycle group rides.

- Rides: plan (scratch or saved route), stops, join, live group session, full-screen navigation.
- Per-rider progress inside group ride: start early, arrive, finish, resume.
- Routes: search place-to-place, save ridden track as route, bookmark, share, road feedback.
- Tracking: background GPS + phone motion readings. Stats count riding only.
- Community: posts, comments, likes, follows, mentions, reviews.
- Closed beta. Groups, rank, support, account security hidden behind flags.

## Code Map

- Server: `server/src`
  - `app.ts` — Express bootstrap, headers, CORS, route mounting, feature gates.
  - `core/` — pure domain logic. No packages, no `node:` imports. Lint-enforced.
  - `ports/` — interfaces core needs. `adapters/` — implementations (postgres, tokens, identity, email, http).
  - `composition/` — composition root (`container.ts`), boot-time config validation (`env.ts`).
  - Legacy zone: `routes/`, `controllers/`, `services/`, `schemas/`, `middleware/`, `config/`, `queue/`, `realtime/`, `workers/`. List in `eslint.boundaries.js` must only shrink.
  - Migrations: `server/src/db/migrations` (001–036, runner `npm run migrate`).
- Client: `client/app` (Expo Router screens), `client/src`
  - `ports/`, `adapters/` — HTTP (fetch), auth providers, secure storage.
  - `features/{navigation,rides,routes}/` — components, hooks, pure `core/` modules with tests.
  - `store/liveSessionStore.ts` — Zustand live state, `/live` listeners.
  - `services/backgroundLocationService.ts`, `hooks/useBackgroundLocationTracker.ts` — global tracking.
  - `api/client.ts` — legacy axios. Being replaced by `adapters/http/apiClient.ts`.

## Stack and Runtime

- Node.js 22+, strict TypeScript, ES modules, `tsx`. Express 5, Zod 4, `jose`.
- PostgreSQL 17 + PostGIS on Supabase (`ap-south-1`). Neon no longer used.
- Socket.IO: `/live` (session), `/rides` (ride detail).
- Worker: separate process. `jobs` table, `FOR UPDATE SKIP LOCKED`, 10 s poll.
- Client: Expo SDK 57, React Native 0.86, Expo Router, TanStack Query, Zustand.
- Hosting: API + worker on Railway. Prod API `api.throttlebase.in`. Dev API `api-dev.throttlebase.in`.

## Documentation Map (Source of Truth)

- Product scope: `docs/product-overview.md`
- Features, config, tests: `docs/technical-overview.md`
- Architecture, flows, scaling limits: `docs/architecture.md`
- Schema, RLS, roles: `docs/database-design.md`
- HTTP + socket inventory: `docs/api-endpoints.md`
- Decisions: `docs/technical-decisions.md`
- Status, environments, gaps, backlog: `docs/project-status.md`
- Live session: `docs/live-session-rollout.md`
- Navigation: `docs/live-navigation-phase1.md`
- Launch/compliance rules: `docs/launch-readiness/LAUNCH_READINESS.md`

## Key Facts (Easy to Get Wrong)

- Auth passwordless: Google, Apple, email code. No passwords. No TOTP.
- Access token: ES256 JWT, 15 min. Verified by signature only. No session lookup per request.
- Refresh token: 30 days. Hashed in `sessions`. Rotates each refresh. Reuse revokes family.
- Client signs out only when `/auth/refresh` answers 400/401. Offline, timeout, 5xx keep the session.
- Admin: `rider_roles` table, roles in token. `riders.is_admin` dropped (migration 024).
- JWKS path: `/.well-known/jwks.json`. Not under `/auth`.
- DB connection: API uses Supabase `postgres` role (BYPASSRLS). RLS policies exist but unenforced.
- Only auth adapters use `withRiderTransaction`. Legacy services use plain `query()`.
- Client base URL: `EXPO_PUBLIC_API_URL`. Unset release build → dev API, never prod.
- Track source: `ride_live_location_samples`. `gps_traces` unused.
- Sample kept per 20 m, per 30 s, or on motion change. Stale/future/out-of-order fixes dropped.
- Worker cannot emit socket events. Worker-side changes reach clients via polling.
- One API instance only. Sampling state in memory. No Socket.IO adapter.
- Push/email delivery: stubs. In-app notifications only.
- Feature flags need server `FEATURE_*` and client `EXPO_PUBLIC_FEATURE_*`.
- Mount-time permission prompts crash Android ride screens. Use passive checks.

## Commands

- Server (`cd server`): `npm run dev`, `npm run dev:all` (API + worker), `npm run worker`, `npm run migrate`, `npm run typecheck`, `npm run test:unit`, `npm run lint:boundaries`, `npm test` (e2e live script, needs DB).
- Client (`cd client`): `npx expo start --dev-client`, `npm test`, `npx tsc --noEmit`, `npm run lint:boundaries`.
- Client boundaries: vendor SDKs only in `src/adapters/`. Screens/components import `src/services/`, never ports/adapters.

## Active Priorities

1. Real-phone ride validating per-rider progress, motion readings, stop markers.
2. Live socket reconnect after token refresh.
3. Enforce RLS: services onto `withRiderTransaction`, API onto `throttlebase_app`.
4. Push/email providers + device registration.
5. Client admin check: read roles, not `is_admin` (always false today).

## Assistant Operating Notes

- Keep file concise. No history log. Details → `docs/`.
- Architecture/status change → update this file + matching doc in same change.
- Schema change → regenerate matching table in `docs/database-design.md`.
- Legal text draft-only. Never change infra or secrets.
- Caveman compression for AI-consumed context files. See `.gemini/rules/caveman-context.md`.
