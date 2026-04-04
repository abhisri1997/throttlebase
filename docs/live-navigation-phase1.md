# Live Navigation Phase 1

## Summary

Phase 1 delivers an immersive full-screen navigation route for active rides in `client/app/ride/[id]/navigation.tsx`. The screen focuses on current-rider route following with a clean riding UI: dark full-screen map, route polyline, current-location camera follow, top instruction card, and a bottom sheet for crew presence and host controls.

Phase 1 now includes lightweight multi-rider awareness by rendering peer live-location markers and allowing the rider to tap a crew member in the bottom sheet to focus that rider on the map. The goal is still to keep richer coordination overlays and captain-specific tools for later phases.

## What Phase 1 Includes

- Full-screen navigation route mounted at `/ride/:id/navigation`
- Google Directions-backed route hydration with fallback polyline generation
- Forward-offset camera follow for the current rider
- Turn-by-turn instruction card with ETA and remaining distance
- Live-session integration for start/end flow, room join, heartbeat, and location emit
- Ride-detail realtime subscription for join and stop-request updates before entering navigation
- Peer rider markers sourced from live-session location broadcasts
- Bottom sheet for rider presence, tap-to-focus crew lookup, and captain-only end-ride control
- Waypoint stop markers and recenter action for map recovery

## Files Involved

- `client/app/ride/[id]/navigation.tsx`
- `client/src/features/navigation/components/NavigationInstructionOverlay.tsx`
- `client/src/features/navigation/components/NavigationBottomSheet.tsx`
- `client/src/features/navigation/services/navigationRouteService.ts`
- `client/src/features/navigation/types/navigation.ts`
- `client/src/store/liveSessionStore.ts`
- `client/src/services/liveSessionSocket.ts`

## Phase 1 UX and Stability Fixes

- Route loading now keys off stable primitive coordinate strings instead of transient object references, which prevents the earlier `Maximum update depth exceeded` loop when the route screen hydrates.
- The instruction card is positioned below measured top controls instead of fixed offsets, which removes overlap between the exit control and the maneuver card.
- The bottom sheet now stays bottom-anchored using animated height rather than translate motion, so it does not jump to the top of the screen on some runtimes.
- Expanded sheet height is content-measured and viewport-clamped, which removes the large empty area seen in earlier builds.
- Collapsed sheet UX is intentionally lighter: ride title, online count, and a clear expand hint are visible without repeating turn/ETA data already shown in the top instruction card.
- A dedicated recenter control was added above the sheet so the rider can quickly recover the camera without leaving navigation.
- Selecting a rider from the bottom sheet now pauses automatic self-follow until the rider explicitly recenters, so crew lookup does not snap back immediately.

## Out of Scope for Phase 1

- Captain/co-captain specific live coordination overlays
- Deviation detection and reroute triggers
- Incident visualization on the navigation map
- Camera modes beyond current-rider follow plus temporary rider-focus lookup

## Phase 2 Requirement Map

This section maps the current codebase against the existing Phase 2 contract already captured in `ai-assistant.md` under `Phase 2 — Socket Gateway and Presence`.

| Phase 2 requirement | Current state | Evidence | Remaining work |
| --- | --- | --- | --- |
| Add realtime gateway modules and server bootstrap | Implemented | `server/src/realtime/gateway.ts`, `server/src/realtime/auth.ts`, `server/src/realtime/session-room.ts`, `server/src/app.ts` | None for baseline bootstrap |
| Authenticated `/live` namespace | Implemented | `createLiveGateway()` + `authenticateLiveSocket()` | None for baseline auth |
| Room key `ride:<rideId>:session:<sessionId>` | Implemented | `server/src/realtime/session-room.ts` | None |
| `session:join` and `session:leave` events | Implemented | Server gateway handlers + `client/src/store/liveSessionStore.ts` | None for baseline transport |
| `presence:heartbeat` event | Implemented | Gateway heartbeat handler + client heartbeat timer | None |
| `location:update` event | Implemented | Gateway schema validation + `upsertLocation()` in store | None |
| `incident:create` event | Implemented | Gateway incident handler + client socket service/store | None |
| `session:state` broadcast | Implemented | `socket.emit("session:state", ...)` on join | None |
| `presence:update` broadcast | Implemented | Gateway emits on join, heartbeat, leave, disconnect | None |
| `location:broadcast` broadcast | Implemented | Gateway emits updated location payloads | None |
| `incident:created` broadcast | Implemented | Gateway emits created incident to room | None |
| `session:ended` broadcast | Partially implemented | REST controller emits `session:ended` to room, client store handles it | Payload shape differs from the earlier Phase 2 note (`endedAt`, `endedBy` are not sent today) |
| Broadcast cadence at 2-5 seconds | Implemented for current client | Navigation and ride detail location tracking use a 4-second interval/watch cadence | Future tuning may be needed for battery and network tiers |
| Persist sampled points every N updates | Implemented | `nextShouldPersistSample()` persists every third update | None for baseline sampling |
| Drop stale or out-of-order location updates | Not implemented | No freshness guard in `updateLivePresenceLocation()` | Add server-side timestamp thresholding and ordering checks |
| Reconnect works with token refresh | Partially implemented | Client reconnects and auto-rejoins ride context | Explicit token refresh / socket auth rebind flow is still missing |
| Presence transitions online/offline reliably | Implemented with hardening | Heartbeat, leave, disconnect, and presence sweep support are present | Validate under mobile background/network churn |
| No unauthorized room joins | Implemented | JWT socket auth + participant check via `getLiveSession()` | None for baseline authorization |

## What Is Already Scaffolded for the Next Navigation Step

- The client already has a shared socket transport layer in `client/src/services/liveSessionSocket.ts`.
- The ride detail screen now has a separate lightweight socket transport in `client/src/services/rideSocket.ts` for non-navigation realtime updates.
- The Zustand store already tracks session state, presence, live locations, incidents, and ended-session reason in `client/src/store/liveSessionStore.ts`.
- The navigation screen already consumes live session status and presence summary, so it has the right entry point for richer map overlays.
- The backend already persists sampled live locations and incidents, so later map/history features do not need a new transport foundation.

## What Still Needs Implementation Before Phase 2 Is Truly Complete for Navigation UX

- Decide which riders should be emphasized in navigation mode: all riders, captain only, nearest riders, or incident-related riders.
- Add server-side stale/out-of-order location rejection so the map does not regress on delayed packets.
- Add reconnect behavior that survives token refresh instead of assuming the original socket auth payload remains valid.
- Normalize the `session:ended` payload if the client should show actor/time metadata in navigation mode.
- Add explicit QA around background/resume, poor network transitions, and multi-rider load.

## Recommended Phase 2 Start Point

1. Add stale-location rejection on the server.
2. Decide whether rider focus should auto-expire or show richer rider detail when a crew member is selected.
3. Normalize realtime payload contracts where the implementation has drifted from the earlier note.
4. Add mobile reconnection testing around token refresh and background resume.