# AI Assistant Context - ThrottleBase

## Purpose

This file is the operational context brief for AI-assisted development in this repository.
It should stay concise, current, and action-oriented.

Use this file to understand:

- What the project is and where major systems live
- Which docs are the source of truth for deeper details
- Current implementation status and active priorities
- Recent verified changes that affect ongoing work

## Project Snapshot

ThrottleBase is a full-stack rider platform with:

- Ride lifecycle management (create, join, schedule, active, complete)
- Route creation/bookmark/share and GPS trace ingestion
- Community features (posts, comments, likes, follows, groups, reviews)
- Rewards and leaderboard systems
- Notifications, privacy/settings, and support ticketing
- Live group ride sessions (REST + realtime + worker-backed notifications)

Primary code locations:

- Server: `server/src`
- Client: `client/app`, `client/src`
- Database migrations: `server/src/db/migrations`

## Stack and Runtime

- Runtime: Node.js 22+
- Language: TypeScript (strict)
- Server: Express 5 + PostgreSQL/PostGIS
- Client: Expo + React Native + Expo Router + Zustand + TanStack Query
- Realtime: Socket.IO namespace `/live`
- Background processing: DB-backed jobs queue + worker processors

## Documentation Map (Source of Truth)

- Product scope: `docs/product-overview.md`
- Functional + technical feature detail: `docs/technical-overview.md`
- Architecture and system flows: `docs/architecture.md`
- Database schema/design: `docs/database-design.md`
- API inventory (grouped endpoints): `docs/api-endpoints.md`
- Technical decisions and implementation notes: `docs/technical-decisions.md`
- Delivery status, gaps, and backlog: `docs/project-status.md`
- Live session rollout details: `docs/live-session-rollout.md`
- Live navigation implementation notes: `docs/live-navigation-phase1.md`

## Current Status (High Signal)

- Core backend domains are implemented: auth, riders, rides, routes, community, rewards, notifications, support, live session.
- Queue and worker foundations are in place and active for ride analytics and live-session notification pipelines.
- Core client domains are implemented with tabs + detail flows, including groups, reviews, followers/following, notifications center, and live session controls.
- Live navigation Phase 1 is shipped with full-screen navigation and map UX foundations.

## Active Priorities

1. Complete security module features: 2FA setup/verify, login activity, active session management.
2. Complete notification delivery infrastructure for push/email channels.
3. Continue live session reliability hardening (token refresh reconnect, broader soak testing, ops observability tuning).
4. Maintain API/UI contract consistency as features mature.

## Recent Verified Updates

- Local DB/bootstrap hardening completed for fresh-machine setup and migration reliability.
- Swagger generation moved to lazy init to avoid startup deprecation warnings.
- Register flow now logs in post-signup before auth-store persistence; login supports email-or-username identifier.
- Validation error handling on client is normalized via shared parser utility.
- Groups UX and membership-context reliability are hardened across list/detail/join behavior.
- Ride visibility controls now enforce participant-only access for active/private ride details.
- Live session lifecycle, presence, incidents, worker fanout, and client map/presence states are integrated.
- Navigation screen stability and UX polish completed for overlays, bottom sheet behavior, recenter flow, and waypoint rendering.

## Assistant Operating Notes

- Keep this file concise and avoid embedding large specs.
- Put detailed design or planning content in `/docs` and link from here.
- When major architecture or delivery status changes, update this file and the corresponding source doc in the same change.
- Do not add historical noise; keep only currently useful context.
