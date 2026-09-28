# Technical Decisions - ThrottleBase

Decisions that shape the codebase, with the reason for each. Add an entry when you make a choice a future contributor might otherwise undo.

## Platform and hosting

- **Node.js 22, strict TypeScript, ES modules** (`type: module`, `NodeNext`). Run with `tsx` in every environment; there is no build step.
- **Postgres on Supabase, used as plain Postgres.** Supabase replaced Neon. The app uses only a connection string, PostGIS and standard roles — no Supabase Auth, storage, realtime or client SDK — so moving host is a `DATABASE_URL` change. The migration integration test enforces this: every migration must apply to stock Postgres 17 + PostGIS with no vendor schemas.
- **Mumbai region** (`ap-south-1`) keeps the database in India. The Railway region for the API and worker is not recorded here.
- **API and worker on Railway**, as separate processes sharing only the database.
- **Port 5001** by default to avoid local conflicts.

## Server architecture

- **Ports and adapters for new work.** Business rules live in `src/core/` and depend only on interfaces in `src/ports/`. Vendors (pg, jose, nodemailer, Express, Socket.IO, …) are reachable only through `src/adapters/`. One composition root wires them. Why: use cases test with fakes and no server, and replacing a vendor means writing one adapter.
- **The boundary is lint-enforced**, not a convention (`eslint.boundaries.js`). The legacy layered folders are listed explicitly, and that list may only shrink.
- **Legacy layering stays until touched.** `routes → controllers → services` with Zod schemas still serves most domains. Code moves into core when it is changed substantially, not in a big-bang rewrite.
- **Pure domain modules for ride logic.** Arrival, progress, segmentation, stats, route search and route-from-track are pure functions in `core/`, tested against recorded tracks (`core/ride-progress/testTracks.ts`).
- **Configuration validated at boot.** `composition/env.ts` reads every auth and email variable once; a missing or malformed value stops the process with the variable's name. An unconfigured optional provider (Apple) is a supported state, not an error.

## Data

- **Raw SQL migrations**, applied by an in-repo runner with a checksum ledger (`schema_migrations`). Explicit, reviewable diffs; no ORM.
- **UUID keys** everywhere except high-volume append tables (`BIGSERIAL`).
- **PostGIS `geography(Point, 4326)`** for points; GeoJSON in `jsonb` for lines.
- **Canonical units in storage** (km, km/h, m, UTC); convert at the client.
- **Denormalized counters** for read-heavy screens (profile totals, post counts), maintained in application code.
- **Soft delete for riders** with a 30-day grace period, then a hard delete that cascades.

## Security

- **Least-privilege roles and RLS as defence in depth.** Migration 027 defines `throttlebase_app` (no ownership, no BYPASSRLS) and migration 028 defines policies on `app.current_rider_id()`, set transaction-locally so a transaction-mode pooler cannot leak one rider's identity to another.
  - Status: the policies exist but the API still connects as `postgres`, and legacy services don't set the rider. Enforcing RLS is a tracked follow-up (see `project-status.md`).
- **Authorization is enforced in service SQL** (participant, role and visibility checks). RLS is a second layer, not the first.
- **Strict CORS allowlist and security headers**; Swagger fails closed.
- **Google calls only from the server**, with per-rider rate limits and daily ceilings, so a client bug cannot run up a bill or leak the key.

## Auth

- **Passwordless only** (Google, Apple, email code). Every sign-in proves control of an identity provider or an inbox, so passwords and TOTP add risk without adding proof. Both were removed in migration 024.
- **Stateless ES256 access tokens, 15 minutes.** Verified by signature with no database round trip. ES256 over RS256 for smaller keys and tokens. The algorithm is pinned in the verifier.
- **Rotating refresh tokens with families, 30 days.** Stored hashed. Reuse of a rotated token revokes the family (theft detection). Revocation takes effect at the next refresh; the short access TTL bounds the gap.
- **JWKS published** at `/.well-known/jwks.json`, with retired keys kept, so keys rotate without logging anyone out.
- **Roles in a table, not a flag.** `rider_roles` replaced `riders.is_admin`, so adding a role costs a row. Roles are re-read at every refresh.
- **Consent recorded at account creation**, versioned against `TERMS_VERSION` / `PRIVACY_VERSION`.
- **Console email refused in production** unless explicitly allowed, because it fails silently.

## Realtime and background work

- **Two Socket.IO namespaces.** `/live` carries the full live session; `/rides` carries lightweight ride-detail broadcasts that don't need session semantics.
- **Each rider's ride is separate from the group session.** Riders start early, finish while others ride on, and have their own stats cutoff. An arrival is dated to reaching the destination, so time at the venue adds no distance.
- **Store samples, not every fix.** Fixes arrive every few seconds; a sample is kept per 20 m, per 30 s, or on a motion-reading change. Enough for history and stop detection, a fraction of the rows.
- **Riding is sustained speed, helped by motion readings.** One fast fix is never riding. Walking during a pause makes it a stop; staying "in vehicle" makes it traffic. Readings end when the app is backgrounded so stale ones can't mislead.
- **DB-backed job queue** (`jobs` + `FOR UPDATE SKIP LOCKED`) instead of Redis: one fewer service, transactional enqueue, good enough for current volume.
- **Asynchronous side effects.** Mentions, notifications, stats and rewards run in jobs so API responses stay fast.
- **Push and email stay behind queue processors** until device registration and a mail provider exist.

## Client

- **Expo Router** for file-based screens; route guards live in the root layout.
- **TanStack Query for server state, Zustand for live state**, and a small store per concern.
- **Ports and adapters on the client too** (`src/ports`, `src/adapters`), so auth, HTTP and storage are swappable and testable. The axios client is legacy and is being replaced by the fetch adapter.
- **Pure feature cores** (`src/features/*/core`) hold navigation, ride and route logic with unit tests; screens stay thin.
- **Passive permission checks on mount.** Requesting location permission from a mount effect relaunched Android's permission activity in a loop. Prompts happen on explicit user action.
- **Feature flags on both sides.** A held-back feature needs its server and client flag; a deploy that forgets them ships the smaller app.
- **Android JDK pinned to 17** by the config plugin `client/plugins/with-android-jdk17.js`, re-applied on every `expo prebuild --clean`.

## Deferred

- ORM adoption (Drizzle or Prisma): revisit after the beta, if at all; the ports/adapters split already isolates SQL.
- Horizontal API scaling: needs a Socket.IO adapter and shared sampling state first (see `architecture.md` → Scaling constraints).
