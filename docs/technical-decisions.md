# Technical Decisions - ThrottleBase

This document captures key implementation decisions with rationale.

## Runtime and Platform

- Use `Node.js 22` and strict TypeScript for modern runtime support and stronger compile-time safety.
- Use ES modules (`type: module`, `module: NodeNext`) for consistent import/export semantics.
- Use server port `5001` by default to avoid local port conflicts.

## Server Architecture

- Use Express 5 for API routing and middleware composition.
- Keep feature boundaries consistent with schema -> controller -> service -> route layering.
- Keep Swagger/OpenAPI docs exposed through `/api-docs` and aligned with runtime contracts.

## Data and Storage

- Use PostgreSQL + PostGIS for transactional + spatial workloads in one system.
- Use UUID primary keys (`gen_random_uuid()`) across domain tables.
- Preserve soft-delete behavior for riders with grace-period recovery.
- Keep denormalized counters for high-read profile and feed surfaces.
- Use canonical metric units in persistence; convert for display at client edges.

## Query and Migration Strategy

- Continue raw SQL migrations for explicit control and transparent DB diffs.
- Use transactions around multi-step writes (for example ride and participant initialization).
- Use parameterized EWKT/PostGIS writes for spatial safety and correctness.

## Auth and Identity

- Keep JWT payload centered on `riderId` and email identity context.
- Include `sessionId` in JWT payload and validate session state on authenticated API/socket requests.
- Support email-or-username login with case-insensitive lookup.
- Keep register flow explicit: create account, then authenticate via login contract.
- Record login activity and create tracked session records at login so revocation semantics are enforced immediately.
- Gate support admin actions with a simple `riders.is_admin` boolean until a broader role/permission model is needed.
- Keep TOTP status/setup APIs near auth routes while session and login-activity APIs live under `/api/security`.
- Require TOTP verification during login for riders with `two_factor_enabled = true`.

## Mobile Architecture

- Use Expo Router for route-driven app structure.
- Use Zustand for local cross-screen state and TanStack Query for server-state synchronization.
- Use ThemeContext + tokenized palette for reliable light/dark behavior across platforms.
- Keep map/location surfaces in reusable components (for example `LocationPicker`, map wrappers).

## Realtime and Async

- Use Socket.IO `/live` namespace for live ride session transport.
- Use a separate Socket.IO `/rides` namespace for lightweight ride-detail broadcasts that do not require full live-session semantics.
- Persist sampled location updates server-side and broadcast participant state to room members.
- Use DB-backed jobs + worker polling with lease/retry semantics for asynchronous tasks.
- Keep notification fanout preference-aware and idempotency-conscious.
- Dispatch mention notifications asynchronously after post/comment writes so community APIs stay responsive.
- Leave push/email delivery providers behind queue processors until device registration and mail infrastructure are ready.

## UI/Contract Reliability

- Normalize API validation errors into field-aware client messages.
- Keep unauthorized UX consistent across protected screens and shared-link entry paths.
- Keep profile and rewards aggregates aligned to shared backend computation sources.
