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
- Navigation reroute cadence hardened: road-following route refresh now uses interval+ref checks with movement cooldown (40m + >=12s) and 25s periodic refresh to prevent rapid re-fetch loops while riding.
- Navigation polyline simplification upgraded to adaptive shape-preserving reduction with point cap, preventing multi-thousand-point renders from delaying route draw.
- Ride detail route preview fetch is now focus-gated so hidden screens do not continue Directions API calls while full-screen navigation is active.
- Navigation screen now forces an immediate route refetch on first GPS fix so the map does not wait for movement cooldown before drawing the live-origin route.
- Full-screen navigation Exit now prefers `router.back()` when possible to avoid stacking duplicate ride-detail screens.
- Ride detail live map auto-fit is now limited to one initial fit per live-room session, avoiding repeated camera animations during pinch/pan interactions.
- Navigation floating recenter control now uses numeric bottom-offset state (no `Animated.Value` listener churn), removing repeated `onAnimatedValueUpdate` warnings.
- Ride detail route-preview map now uses solid (non-dashed) simplified polyline with stricter preview cap and disabled rotate/pitch to reduce zoom/pan crash risk.
- Full-screen navigation now seeds current location immediately via last-known/current-position fetch (before watch callbacks), and startup route fetch waits briefly for GPS to reduce delayed live-origin route drawing.
- Polyline simplification now uses turn-aware distance thinning (road-safe point reduction) instead of chord-cutting geometric approximation, preventing routes from visibly crossing buildings.
- Ride-detail map now preserves last fetched road-following polyline when screen blurs (e.g., opening full-screen navigation), preventing temporary fallback to straight canonical route lines on return.
- Ride-detail header map now freezes preview origin on first resolved rider location and does not auto-fit camera to live-marker updates, preventing 2-3s post-load map jump/glitch.
- Android ride-detail stability hardened: preview header map now uses lightweight Android rendering (`liteMode`/cached non-interactive preview), live/stop markers are memoized, low-movement GPS sampling no longer forces rerenders, and preview-route refresh no longer re-triggers off local polyline state changes.
- Ride-detail header map render stability further hardened: `RideDetailMapHeader` now uses stronger prop-equality memoization plus a stable back callback, and preview-location sampling pauses once preview origin is frozen to prevent unnecessary Android map remount/repaint churn.
- Shared navigation route service now coalesces identical in-flight Directions requests and briefly caches identical recent route results, preventing duplicate preview/navigation fetch bursts during rerender churn.
- Android full-screen navigation stability hardened: peer markers now keep stable `riderId` keys and disable `tracksViewChanges`, reducing marker flicker/remount churn during live location updates.
- Android full-screen navigation camera follow now uses movement/heading deadbands and slower camera-refresh cadence; Android live markers use native pin markers (instead of custom marker views) to reduce flicker and frame-jank during continuous location streaming.
- Full-screen navigation now owns wake-lock behavior: screen keep-awake is activated only while `ride/[id]/navigation` is focused and app state is active, with guarded activate/deactivate calls to avoid unhandled `Unable to activate keep awake` promise noise.
- Full-screen navigation self-follow camera and recenter-to-self action now use a tighter zoom level for improved first-load rider focus and faster location recovery.
- Full-screen navigation heading-follow now combines GPS course with compass heading fallback and best-for-navigation location accuracy, improving map rotation consistency in driving mode.
- Caveman compression NLP tool installed: `tools/caveman-compression/`. Wrapper: `./tools/caveman-compress.sh`. Free, offline, ~15-30% token reduction.
- AI context files (`ai-assistant.md`, skills, docs/) now use caveman compression format. Rule: `.gemini/rules/caveman-context.md`.
- Background location tracking: `expo-task-manager` + `expo-location` background task tracks rider location globally when participating in active ride — even off ride screens or app backgrounded. Wired in root `_layout.tsx`.
- Client dev-build runtime: installed device builds require `expo-dev-client` plus Metro launched via `npx expo start --dev-client --tunnel`; otherwise debug iOS builds can open with `No script URL provided` because no JS bundle is embedded.
- Production domain config: client sharing and API defaults now target `https://throttlebase.in` and `https://api.throttlebase.in` when explicit env overrides are not provided.
- Android local build stability: Gradle runtime is pinned to Temurin JDK 17 via Expo config plugin `client/plugins/with-android-jdk17.js`, which re-injects `org.gradle.java.home` into generated `client/android/gradle.properties` on every `expo prebuild --clean` to avoid React Native/Gradle plugin failures under unsupported bleeding-edge JDKs (e.g., Java 26).
- Navigation keep-awake errors fully suppressed: full-screen navigation uses state tracking (`keepAwakeActiveRef`) to prevent duplicate activation/deactivation attempts, Promise chaining with explicit error handlers, and recoverable error handling that resets state on failure — preventing unhandled promise rejections from leaking to ride details or other screens.
- Android ride-detail flicker/crash fix verified: the main root cause was mount-time `requestForegroundPermissionsAsync()` calls on `client/app/ride/[id].tsx`, which repeatedly launched Android `GrantPermissionsActivity`, flipped app state to background, and remounted the screen; fixed by switching ride-detail auto effects to passive permission checks and making live-session socket listener attachment idempotent in `client/src/store/liveSessionStore.ts`.
- Full-screen navigation now follows the same safe permission pattern as ride detail: `client/app/ride/[id]/navigation.tsx` uses passive `getForegroundPermissionsAsync()` checks in mount-time tracking effects (no automatic permission prompt), preventing Android permission-activity app-state interruptions from triggering screen remount loops.
- Auth screens branding reverted: `client/app/(auth)/login.tsx` and `client/app/(auth)/register.tsx` now use Lucide icons (`MapPin`, `UserPlus`) instead of rendering `assets/icon.png` in the header badge.
- API security hardening shipped server-side: Express `X-Powered-By` disabled, strict CORS origin allowlist for HTTP + Socket.IO, and security headers enforced (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- Production Swagger exposure is now safer by default: `/api-docs` disabled unless explicitly enabled, and production access requires configured basic-auth credentials.
- Rewards authorization tightened: `POST /api/rewards/badges`, `POST /api/rewards/badges/:id/award`, and `POST /api/rewards/achievements` now enforce `requireAdmin` middleware.
- Express 5 startup compatibility fix: global CORS preflight route changed from `app.options("*")` to regex matcher `app.options(/.*/)` to avoid `path-to-regexp` wildcard parsing crash (`Missing parameter name at index 1: *`).

## Assistant Operating Notes

- Keep file concise. No large specs.
- Detailed design/planning → `/docs`, link from here.
- Architecture/status changes → update this file + corresponding source doc together.
- Skill `cost-effective-orchestrator` available: `.agent/skills` for cost-aware routing.
- No historical noise. Only currently useful context.
- Use caveman compression for all AI-consumed context files. See `.gemini/rules/caveman-context.md`.
