# Project Status - ThrottleBase

## Implementation Progress

### Completed

- Core backend modules: Auth, Riders, Rides, Routes, Community, Rewards, Notifications, Support, Live Session.
- Core client experience: auth, tabs, ride/route/detail flows, groups, reviews, follower/following list, notifications center, security modal, and support entry points.
- Rider support center now includes per-ticket detail opening with support-reply visibility.
- Rider support tickets now allow follow-up replies and rider-initiated closure from ticket detail.
- Background jobs foundation with queue + worker runtime.
- Ride analytics pipeline writing to `ride_history_stats` with enqueue hooks.
- 2FA setup/verify/disable, login activity capture, and session management APIs are implemented.
- Login now enforces TOTP verification for riders with 2FA enabled.
- Session revocation now invalidates existing JWT access through session-bound token checks.
- Support admin workflow is implemented with admin-only ticket list, status updates, and agent reply support.
- Mention-triggered notification fanout is implemented for posts and comments.
- Mention UX now includes composer suggestions, clickable @mention profile links, and mention-notification deep links into post/comment context.
- Live session lifecycle APIs, realtime gateway, ride-room realtime updates, client room/session integration, and worker-backed notification fanout are implemented.
- Navigation Phase 1 full-screen experience and stabilization updates.
- Live navigation now shows peer rider markers and supports tapping a crew member to focus their live location on the map.
- Ride detail and full-screen navigation maps now render road-following routes in canonical order: current location -> start -> approved stops -> destination, with automatic origin fallback to start when device location is unavailable.

### In Progress

- Reliability hardening around live-session reconnect behavior and operational tuning.
- Push/email notification provider integration and device-token registration.

## Known Gaps

### Backend

- Push notification (FCM/APNs) and email delivery processors are still provider stubs.
- Rider notification on admin ticket updates is not yet automated.

### Client

- Some advanced live session operational UX is still pending broader QA hardening.
- Push-device registration UX and delivery verification are not yet present.

## Prioritized Backlog

## P0 (Now)

1. Keep live session reliability and contract consistency stable as usage expands.
2. Close high-value UX and API parity gaps that affect core ride/community flows.

## P1 (Security and Delivery)

1. Integrate real push/email providers and add rider device registration.
2. Add rider-facing updates when support tickets are changed by admins.
3. Expand test coverage for session revocation and 2FA challenge edge-cases.

## P2 (Scale and Evolution)

1. Improve async idempotency/retry behavior and observability coverage.
2. Expand realtime channels for additional ride events beyond live sessions.
3. Evaluate migration from raw SQL layer to Drizzle ORM or Prisma after feature stabilization.

## Validation Checklist (Per Milestone)

1. API contracts are represented in Swagger and match runtime behavior.
2. Permission boundaries are covered by integration tests.
3. Mobile screens remain functional on both iOS and Android paths.
4. Worker/queue flows are validated for retries and duplicate execution safety.
