# Technical Overview - ThrottleBase

## Purpose

This document summarizes how the current ThrottleBase system is built and operated at a practical implementation level.

For deeper detail:

- architecture and flows: `architecture.md`
- schema details: `database-design.md`
- endpoint inventory: `api-endpoints.md`
- active delivery status: `project-status.md`

## Runtime Stack

- Server: Node.js 22+, TypeScript, Express 5
- Client: Expo, React Native, Expo Router
- Data: PostgreSQL + PostGIS
- Realtime: Socket.IO namespace `/live`
- Async processing: DB-backed queue + worker poll/lease model

## Backend Module Boundaries

The server follows a layered feature structure:

- Schemas: Zod contracts and request validation
- Controllers: request/response orchestration
- Services: domain logic and SQL orchestration
- Routes: endpoint and middleware composition
- Realtime: socket auth, room semantics, event handling
- Worker processors: asynchronous domain workloads

This keeps permission checks and state transitions in service logic while controllers remain thin.

## Core Functional Domains

### Auth and Rider Identity

- Register/login flows with JWT identity context
- Email-or-username login with login-activity capture on successful auth
- JWTs are session-bound; API/socket auth validates active non-revoked session records
- Rider profile CRUD and privacy-aware public views
- Follow/follower context support in rider/community flows

### Security and Account Protection

- TOTP-based 2FA setup, verification, status lookup, and disable flow
- Login requires a valid TOTP token when `two_factor_enabled = true`
- Session inventory and rider-initiated session revocation endpoints
- Login activity audit trail with device fingerprint and IP capture
- Admin access gating via rider-level `is_admin` flag and middleware

### Rides and Routes

- Ride lifecycle with participant roles
- Route creation and sharing
- GPS trace ingestion for ride analytics and history
- Visibility controls for private/active ride access

### Community and Engagement

- Feed posts, comments, likes, follows, groups
- Async @mention detection on post/comment creation with in-app notification creation
- Post and comment composers provide username suggestions while typing @mentions
- Rendered @mentions in posts/comments navigate to rider profiles
- Ride reviews linked to completed participation
- Rewards and leaderboard views aligned to analytics aggregates

### Notifications and Support

- In-app notifications with per-type in-app/push/email preferences
- Mention notifications deep-link into the relevant post, including comment highlight context when available
- Push/email delivery jobs are queued and preference-aware, but provider integration is still stubbed
- Rider settings and privacy surfaces
- Support ticket submission, self-history, rider follow-up replies, and rider-side closure controls
- Admin support inbox with ticket filtering, status updates, and optional agent replies

### Live Session and Navigation

- Ride-scoped live session lifecycle APIs
- Realtime presence/location/incident events over `/live`
- Lightweight ride-room subscriptions over `/rides` for join and stop-request updates on ride detail
- Ride-room subscription authorization enforces ride visibility/participation checks
- Client store-driven live controls and participant map behavior
- Full-screen navigation crew list can focus a selected rider's live location on the map, with recenter restoring self-follow
- Ride detail screen automatically refreshes ride and live-session state while active so participants see session-start transitions without leaving the screen
- Ride detail and full-screen navigation maps now share canonical route composition as current rider location -> start point -> approved stops -> destination, with origin fallback to start when device location is unavailable
- Full-screen navigation reroute refresh now uses interval/ref-based checks with movement cooldown (40m plus minimum elapsed window) and periodic refresh, preventing rapid re-fetch loops during active tracking
- Navigation route geometry now applies adaptive, shape-preserving simplification with a point cap before map render, reducing route-draw latency on long directions responses
- Full-screen navigation exit now follows stack-aware back navigation to prevent duplicate ride-detail screen instances
- Ride detail live map auto-fit now performs a single initial fit per live-room session instead of repeated animated refits on every location update, improving interaction stability
- Ride detail preview map render path is hardened for interaction stability via stricter preview-polyline simplification/cap, non-dashed polyline rendering, and reduced camera-computation options (no rotate/pitch)
- Android ride-detail preview map additionally uses lightweight cached preview rendering plus memoized marker/polyline inputs to reduce repeated map-surface invalidation during live updates
- Ride-detail map header now uses stable callback props and deep memo-equality for preview route/marker props, while preview GPS sampling pauses after origin freeze to avoid unnecessary parent rerenders on Android
- Shared navigation route fetching now deduplicates identical in-flight requests and reuses very recent identical results, reducing redundant Directions work during screen rerenders and transient activity churn
- Full-screen navigation first-draw latency is reduced by early GPS seeding (last-known/current-position bootstrap), and route rendering fidelity is maintained with turn-aware road-safe polyline simplification
- Android full-screen navigation markers keep stable rider-based identity and disable `tracksViewChanges` for custom marker views, reducing marker flicker under live location churn
- Android full-screen navigation camera follow now applies movement/heading deadbands with a longer refresh cadence, and Android live markers render with native pin markers to reduce flicker/jank from rapid custom-marker re-renders
- Screen wake lock is scoped to full-screen navigation only: keep-awake activates while `ride/[id]/navigation` is focused and app state is active, and is released on blur/background/unmount with guarded calls
- Live socket disconnects when a session ends to prevent stale connected state on completed rides
- Worker-backed presence sweep, incident escalation scheduling, and lifecycle notification fanout
- Navigation Phase 1 full-screen route and map UX base

## Data and Persistence

- PostgreSQL is the transactional source of truth.
- PostGIS supports geospatial route and location workloads.
- Denormalized counters/aggregates are maintained for read-heavy screens.
- Queue jobs are persisted in DB and leased by workers with retry/backoff behavior.
- Security data includes login-activity records, tracked sessions, TOTP verification timestamps, and rider admin flags.

## Operational Guidance

- Treat service-layer role checks and state transitions as security-critical.
- Keep API docs (`/api-docs`) aligned whenever contracts change.
- Validate async paths (queue + processor) when changing lifecycle behavior.
- Distinguish what is fully shipped versus stubbed integration, especially for notification delivery providers.
- Keep docs synchronized with code for major module or flow changes.
