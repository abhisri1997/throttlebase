# Live Group Ride Session Rollout

Goal: provide reliable participant-only live ride coordination with lifecycle controls, realtime location/presence, and safety event handling.

## Scope

### In Scope

- Session lifecycle from start to end
- Presence and heartbeat semantics
- Realtime location transport and sampled persistence
- Incident reporting and role-aware acknowledgment
- Notification fanout for lifecycle and incident events
- Ride-detail room updates for join and stop-request coordination

### Out of Scope (Initial)

- Voice chat
- Full offline navigation engine
- Public spectator mode

## Phase Plan

## Phase 0 - Data and Contracts

- Add live-session schema tables and indexes.
- Introduce service/controller/route layers for live-session domain.
- Ensure no regression to non-live ride APIs.

## Phase 1 - REST Lifecycle

- Start, end, read-session, incident create, and incident acknowledge endpoints.
- Enforce captain/co-captain and participant role boundaries.
- Add integration tests for success and rejection paths.

## Phase 2 - Realtime Transport

- Add authenticated Socket.IO namespace `/live`.
- Implement room join/leave, heartbeat, location update, and incident events.
- Broadcast session, presence, location, incident, and session-ended signals.
- Harden stale/out-of-order packet handling and reconnect behavior.

## Phase 3 - Client Live UX

- Integrate store-backed live controls and participant state into ride detail.
- Provide live map updates and safety actions with confirmation UX.
- Handle app background/foreground transitions with heartbeat recovery.

## Phase 4 - Ops and Notifications

- Add recurring sweeps and escalation jobs.
- Enforce preference-aware notifications for live events.
- Add event-level logs and reliability metrics.

## Current Implementation Status

Reviewed against the code on 2026-09-28.

- Phases 0–3 are done: schema (migrations 011–015, 032, 036), REST lifecycle, `/live` transport, and client live UX in ride detail and full-screen navigation.
- Beyond the original plan: start-point roll call and roll-out, per-rider progress (below), regroup proposals, and waypoint reports.
- A lighter `/rides` namespace handles ride-detail updates (joins, stop requests).
- Location handling is hardened: the server drops fixes older than 2 min, more than 30 s in the future, or out of order (`LIVE_LOCATION_MAX_AGE_MS`, `LIVE_LOCATION_MAX_FUTURE_SKEW_MS`), and keeps a sample only per 20 m, per 30 s, or on a motion-reading change.
- Tracking runs from the app-level background tracker on any screen, not only while a live screen is open.
- Phase 4 is partial: presence sweep, incident escalation, cleanup and the ride-progress sweep run in the worker. Push and email delivery are stubs.
- Still open:
  - Worker-side changes (auto-finish, idle end) are not pushed over sockets.
  - Only one API instance is supported (in-memory sampling state, no Socket.IO adapter).
- Phase 5 (progressive release) has not started; the closed beta is the first release.

## Per-Rider Progress

Each rider's ride is tracked on their `ride_live_presence` row (migration 032), separate from the group session:

- **Start** — at roll-out for everyone who has turned up, on a late rider's first position, or early via `live/me/start` (from 60 min before the scheduled time; opens the session as a roll call if nobody has). Track samples are only kept from a rider's start; roll-call positions are shared, not recorded.
- **Arrival** — every position runs an arrival state machine: arrived within 150 m of the destination, and only "left" again beyond 300 m, so moving around the venue does not reset it. It arms only after the rider has been beyond 300 m, so round trips do not arrive at the start. Fixes worse than 100 m accuracy are ignored.
- **Finish** — by hand (`arrived` if at the destination, else `left_early`, visible to the whole group), automatically after 10 min parked at the destination (worker `ride_progress.sweep`), or when the captain ends the ride (`arrived` or `group_ended`). An arrival is dated to reaching the destination, so time at the venue adds no distance. Finished riders stop sharing their position and can follow the group; they can resume while the ride is live.
- **Group end** — the captain is warned (409) about riders still out and can end anyway; the ride completes itself once everyone who rode has finished, and ends itself after 120 min with no riding rider reporting.

Thresholds are environment-tunable: `RIDE_EARLY_START_WINDOW_MIN`, `RIDE_ARRIVAL_RADIUS_M`, `RIDE_ARRIVAL_EXIT_RADIUS_M`, `RIDE_ARRIVAL_MAX_ACCURACY_M`, `RIDE_AUTO_FINISH_DWELL_MIN`, `RIDE_IDLE_AUTO_END_MIN`.

## Phase 5 - Progressive Release

1. Internal-only flag enablement
2. Staging dogfood with synthetic concurrency
3. Production canary rollout
4. Gradual percentage ramps with checkpoint reviews

## Rollback Controls

- Client kill switch: `EXPO_PUBLIC_ENABLE_LIVE_SESSION=false` hides live controls on ride detail. It defaults to on and is fixed at build time, so turning it off needs a new build.
- There is no server-side live switch today. Unlike groups, rank, support and account security, live session has no `FEATURE_*` flag. Adding one is the way to disable it without an app release.
- If disabling in an incident: stop room joins and broadcasts first, and keep durable records (`ride_live_*` tables) for diagnosis.

## Go/No-Go Criteria

1. Error rates remain below threshold.
2. Reconnect success rate remains healthy.
3. No authorization violations are observed.
4. Incident notifications meet response SLAs.
