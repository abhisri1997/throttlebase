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
- Navigation reroute cadence is now throttled to avoid rapid route refetch loops while riding, while preserving movement- and time-based refresh behavior.
- Navigation polyline rendering is now optimized with adaptive simplification and point-capping to reduce delayed route draw on long rides.
- Android ride maps are hardened against flicker/crash regressions: ride-detail preview uses lightweight cached rendering, memoized marker data, and reduced rerender pressure, while full-screen navigation keeps stable peer-marker identity with `tracksViewChanges` disabled.
- Ride-detail Android flicker mitigation now also includes stronger header-map memoization (stable callback + deep prop equality) and paused preview-location sampling after initial origin lock, reducing repeated map repaints on realtime screen updates.
- Android full-screen navigation now further reduces flicker by throttling camera follow updates with movement/heading thresholds and preferring native pin markers over custom marker views during live location streaming.
- Keep-awake behavior is now scoped to full-screen navigation only, with guarded activation/deactivation tied to screen focus and active app state to avoid startup keep-awake promise errors.
- Navigation route fetching is now deduplicated for identical in-flight/recent requests, reducing repeated Directions API work and preview-map rerender churn on Android.
- Full-screen navigation now avoids mount-time foreground permission prompts and performs passive permission checks only, eliminating ride-detail-style permission-activity remount-loop risk on Android.
- Client production domain wiring is aligned to `https://throttlebase.in` (share links) and `https://api.throttlebase.in` (API/socket base URL), with local-development fallbacks preserved.
- Android ride-detail flicker/crash root cause is resolved: mount-time foreground location permission requests no longer reopen `GrantPermissionsActivity` in a remount loop; ride detail now checks permission passively and keeps socket listener attachment idempotent.
- Android release/prebuild stability is now persistent: Expo config plugin `client/plugins/with-android-jdk17.js` restores `org.gradle.java.home` to Temurin JDK 17 during every Android prebuild, preventing `com.facebook.react.settings` plugin resolution failures when the machine default JDK is Java 26.
- API security baseline hardened: Express fingerprint header removed, strict CORS allowlist added for HTTP + Socket.IO, and browser-facing security headers are now enforced.
- Production API docs exposure hardened: `/api-docs` is disabled by default in production and can be enabled intentionally with basic-auth protection.
- Rewards mutation authorization tightened: badge creation, badge awarding, and achievement creation are now admin-only at route middleware level.

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
