# Live Group Ride Session Rollout

Goal: provide reliable participant-only live ride coordination with lifecycle controls, realtime location/presence, and safety event handling.

## Scope

### In Scope

- Session lifecycle from start to end
- Presence and heartbeat semantics
- Realtime location transport and sampled persistence
- Incident reporting and role-aware acknowledgment
- Notification fanout for lifecycle and incident events

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
