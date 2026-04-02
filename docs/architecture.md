# Architecture - ThrottleBase

## Overview

ThrottleBase is a full-stack mobile-first system with a TypeScript API backend, PostgreSQL/PostGIS persistence, authenticated realtime namespaces for live-session and ride-detail updates, and worker-driven asynchronous processing.

## High-Level Components

- Client app (`client`): Expo React Native app with route-driven screens, server-state caching, and realtime session integration.
- API server (`server`): Express 5 app exposing domain APIs and Swagger docs.
- Database (`PostgreSQL + PostGIS`): transactional domain storage + geospatial operations.
- Realtime gateway (`Socket.IO /live` and `/rides`): authenticated rooms for live-session transport plus lighter ride-detail broadcasts.
- Queue + worker: DB-backed background job leasing, retries, and domain processors.

## Backend Structure

Main backend organization follows a consistent boundary pattern:

- Schemas: Zod validation and request contracts
- Controllers: HTTP handlers and response shaping
- Services: business logic + SQL orchestration
- Routes: endpoint mapping and middleware composition
- Realtime modules: socket auth, room management, gateway events
- Worker modules: queue polling and processor execution

## Core Data and Flow

## Ride and Route Flow

1. Riders create or join rides through REST APIs.
2. Spatial fields and route data are persisted with PostGIS/GeoJSON support.
3. GPS trace ingestion writes location samples for analytics and history.
4. Async jobs recompute ride-history stats and update rider aggregates.

## Community and Rewards Flow

1. Posts/comments/likes/follows/groups/reviews are handled by community APIs.
2. Mention parsing runs asynchronously after post/comment creation and resolves eligible riders by username.
3. In-app notifications are created first, then push/email jobs are enqueued for downstream delivery.
4. Rewards and leaderboard services read aggregate and badge/achievement records.

## Security and Support Flow

1. Successful login records login-activity metadata and creates a tracked session record.
2. Authenticated riders manage TOTP setup/verification/disable through auth-adjacent endpoints.
3. Session inventory and revocation flow through `/api/security` endpoints.
4. Support tickets are rider-owned by default, while admin ticket operations are gated by `requireAdmin` and `riders.is_admin`.

## Live Session Flow

1. Ride leaders start sessions through lifecycle REST endpoints.
2. Participants join authenticated socket rooms for live updates.
3. Presence heartbeats and location updates stream through `/live` events.
4. Incidents are persisted and broadcast with role-aware handling.
5. Workers fan out lifecycle and incident notifications asynchronously.

## Ride Detail Realtime Flow

1. Ride detail clients subscribe to `ride:<rideId>` over the `/rides` namespace.
2. Join events and stop-request state changes are broadcast without requiring the full live-session room.
3. This keeps ride detail views synchronized before or outside full live navigation mode.

## Security and Access Boundaries

- JWT-based auth for API and socket handshake.
- Admin-only support operations are enforced with DB-backed `is_admin` checks.
- Participant and role checks (captain/co-captain/member) enforced in service layer.
- Visibility guardrails on rides/routes/community resources to prevent unauthorized access.
- Preference/privacy models govern notifications and social interactions.

## Operational Notes

- Queue leasing uses lock-safe SQL patterns and retry/backoff semantics.
- Operational jobs schedule presence sweeps, live-incident escalation, cleanup of expired sessions, and notification delivery handling.
- Feature-flag gates are used for live session UX rollout.
- Documentation and code should evolve together when contracts or architecture change.
