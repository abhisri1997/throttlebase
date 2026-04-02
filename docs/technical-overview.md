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
- Rider profile CRUD and privacy-aware public views
- Follow/follower context support in rider/community flows

### Rides and Routes

- Ride lifecycle with participant roles
- Route creation and sharing
- GPS trace ingestion for ride analytics and history
- Visibility controls for private/active ride access

### Community and Engagement

- Feed posts, comments, likes, follows, groups
- Ride reviews linked to completed participation
- Rewards and leaderboard views aligned to analytics aggregates

### Notifications and Support

- In-app notifications with preferences
- Rider settings and privacy surfaces
- Support ticket submission and self-history

### Live Session and Navigation

- Ride-scoped live session lifecycle APIs
- Realtime presence/location/incident events over `/live`
- Client store-driven live controls and participant map behavior
- Navigation Phase 1 full-screen route and map UX base

## Data and Persistence

- PostgreSQL is the transactional source of truth.
- PostGIS supports geospatial route and location workloads.
- Denormalized counters/aggregates are maintained for read-heavy screens.
- Queue jobs are persisted in DB and leased by workers with retry/backoff behavior.

## Operational Guidance

- Treat service-layer role checks and state transitions as security-critical.
- Keep API docs (`/api-docs`) aligned whenever contracts change.
- Validate async paths (queue + processor) when changing lifecycle behavior.
- Keep docs synchronized with code for major module or flow changes.
