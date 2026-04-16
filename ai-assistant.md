# AI Assistant Context - ThrottleBase

## Purpose

Operational context brief for AI-assisted development.
Keep concise, current, action-oriented.

Use to understand:

- Project structure, major system locations
- Source-of-truth docs for deeper details
- Implementation status, active priorities
- Recent verified changes affecting ongoing work

## Project Snapshot

ThrottleBase: full-stack rider platform.

- Ride lifecycle: create, join, schedule, active, complete
- Route creation/bookmark/share, GPS trace ingestion
- Community: posts, comments, likes, follows, groups, reviews
- Rewards, leaderboard systems
- Notifications, privacy/settings, support ticketing
- Live group ride sessions: REST + realtime + worker-backed notifications

Code locations:

- Server: `server/src`
- Client: `client/app`, `client/src`
- DB migrations: `server/src/db/migrations`

## Stack and Runtime

- Runtime: Node.js 22+
- Language: TypeScript (strict)
- Server: Express 5 + PostgreSQL/PostGIS
- Client: Expo + React Native + Expo Router + Zustand + TanStack Query
- Realtime: Socket.IO namespace `/live`
- Background: DB-backed jobs queue + worker processors

## Documentation Map (Source of Truth)

- Product scope: `docs/product-overview.md`
- Feature detail: `docs/technical-overview.md`
- Architecture, system flows: `docs/architecture.md`
- DB schema/design: `docs/database-design.md`
- API inventory: `docs/api-endpoints.md`
- Technical decisions: `docs/technical-decisions.md`
- Delivery status, gaps, backlog: `docs/project-status.md`
- UAT validation guide: `docs/uat-test-plan-feature-remaining-features.md`
- Live session rollout: `docs/live-session-rollout.md`
- Live navigation notes: `docs/live-navigation-phase1.md`

## Current Status (High Signal)

- Core backend domains implemented: auth, riders, rides, routes, community, rewards, notifications, support, live session.
- Security module: TOTP setup/verify/disable, login activity, session management.
- Support: admin-only ticket triage, agent replies.
- Mention notifications: in-app creation + queued push/email delivery stubs.
- Queue/worker active: ride analytics, live-session ops, notification delivery.
- Core client domains: tabs + detail flows, groups, reviews, followers/following, notifications center, security controls, support admin, live session controls.
- Live navigation Phase 1 shipped: full-screen nav, map UX foundations.

## Active Priorities

1. Complete notification delivery: push/email channels, device registration.
2. Live session reliability: token refresh reconnect, soak testing, ops observability.
3. Maintain API/UI contract consistency.
4. Expand integration coverage: security, realtime edge-cases.

## Recent Verified Updates

- Local DB/bootstrap hardened: fresh-machine setup, migration reliability.
- Swagger generation: lazy init, avoids startup deprecation warnings.
- Register flow: logs in post-signup before auth-store persist. Login supports email-or-username.
- Client validation errors: normalized via shared parser utility.
- Groups UX: membership-context reliability hardened across list/detail/join.
- Ride visibility: participant-only access enforced for active/private rides.
- Account security modal: 2FA setup, login activity, session revocation.
- Admin support inbox: status update flow behind `is_admin` checks.
- Mention parsing: creates notifications, queues push/email delivery jobs.
- Live session: lifecycle, presence, incidents, worker fanout, client map/presence integrated.
- Ride detail: subscribes realtime ride-room updates for joins, stop-request changes.
- Navigation screen: stability polish — overlays, bottom sheet, recenter, waypoint rendering.
- Login: enforces TOTP when 2FA enabled. Requires valid session for API/socket auth.
- Ride-room subscriptions: enforce visibility/participation checks before join `ride:<rideId>`.
- Mention fanout: recipient-scoped notification identifiers prevent dedupe collapse.
- Security/profile flows: tolerate older schemas missing `riders.is_admin`, `riders.totp_verified_at`.
- UAT guide: stakeholder-facing, local PDF generation workflow.
- Support center: individual ticket detail view, agent replies.
- Ticket detail: rider follow-up replies, rider-initiated close.
- Ticket thread: chronological conversation from persisted messages, legacy fallback.
- Mention UX: username suggestions in composers, clickable @mentions, notification deep links.
- Ride detail: auto-refresh ride/live-session state. Session start transitions visible without back-out.
- Ride detail: hides Start Live after completion. Update Starting Location limited to scheduled rides.
- Live session socket: auto-disconnect on session end. Reconnect on next Start Live.
- Maps routing order: rider location → start → approved stops → destination. Fallback origin: start point.
- Navigation bottom sheet: participant tap focuses rider live location. Recenter returns camera follow.
- Create Ride: dynamic route duration via Google Directions API. No manual input.
- Ride detail: live-session socket offline for completed/cancelled/ended. Prevents stale state.
- Ride detail: `GET /live/session` 404 treated as no active session. Polls only non-ended sessions.
- Caveman compression NLP tool installed: `tools/caveman-compression/`. Wrapper: `./tools/caveman-compress.sh`. Free, offline, ~15-30% token reduction.
- AI context files (`ai-assistant.md`, skills, docs/) now use caveman compression format. Rule: `.gemini/rules/caveman-context.md`.

## Assistant Operating Notes

- Keep file concise. No large specs.
- Detailed design/planning → `/docs`, link from here.
- Architecture/status changes → update this file + corresponding source doc together.
- Skill `cost-effective-orchestrator` available: `.agent/skills` for cost-aware routing.
- No historical noise. Only currently useful context.
- Use caveman compression for all AI-consumed context files. See `.gemini/rules/caveman-context.md`.
