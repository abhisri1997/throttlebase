# Architecture - ThrottleBase

## Overview

ThrottleBase is a full-stack mobile-first system with a TypeScript API backend, PostgreSQL/PostGIS persistence, realtime live-session channels, and worker-driven asynchronous processing.

## High-Level Components

- Client app (`client`): Expo React Native app with route-driven screens, server-state caching, and realtime session integration.
- API server (`server`): Express 5 app exposing domain APIs and Swagger docs.
- Database (`PostgreSQL + PostGIS`): transactional domain storage + geospatial operations.
- Realtime gateway (`Socket.IO /live`): authenticated ride-session rooms for presence/location/incident flow.
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
2. Rewards and leaderboard services read aggregate and badge/achievement records.
3. Notifications are generated in-app and filtered by user preferences.

## Live Session Flow

1. Ride leaders start sessions through lifecycle REST endpoints.
2. Participants join authenticated socket rooms for live updates.
3. Presence heartbeats and location updates stream through `/live` events.
4. Incidents are persisted and broadcast with role-aware handling.
5. Workers fan out lifecycle and incident notifications asynchronously.

## Security and Access Boundaries

- JWT-based auth for API and socket handshake.
- Participant and role checks (captain/co-captain/member) enforced in service layer.
- Visibility guardrails on rides/routes/community resources to prevent unauthorized access.
- Preference/privacy models govern notifications and social interactions.

## Operational Notes

- Queue leasing uses lock-safe SQL patterns and retry/backoff semantics.
- Feature-flag gates are used for live session UX rollout.
- Documentation and code should evolve together when contracts or architecture change.
