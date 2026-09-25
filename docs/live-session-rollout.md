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

- Phase 1 is implemented for live session lifecycle, incident creation, and participant-only access checks.
- Phase 2 transport is implemented on `/live` with join/leave, heartbeat, location, incident, and session-ended events.
- A lighter `/rides` namespace is also implemented for ride-detail synchronization such as join broadcasts and stop-request updates.
- Phase 4 is partially implemented: presence sweep, incident escalation scheduling, cleanup scheduling, and notification delivery jobs are in place; external push/email providers are still pending.
- Token-refresh-aware reconnect hardening remains open.
- Per-rider progress is implemented: each rider has their own ride inside the group ride (see below).

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

- Client flag kill switch: `EXPO_PUBLIC_ENABLE_LIVE_SESSION`
- Server-side live feature disable switch
- Disable room joins/broadcast first, preserve durable records for diagnosis

## Go/No-Go Criteria

1. Error rates remain below threshold.
2. Reconnect success rate remains healthy.
3. No authorization violations are observed.
4. Incident notifications meet response SLAs.
