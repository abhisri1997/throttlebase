# Live Navigation Phase 1

## Summary

Phase 1 delivers an immersive full-screen navigation route for active rides in `client/app/ride/[id]/navigation.tsx`. The screen focuses on current-rider route following with a clean riding UI: dark full-screen map, route polyline, current-location camera follow, top instruction card, and a bottom sheet for crew presence and host controls.

Phase 1 now includes lightweight multi-rider awareness by rendering peer live-location markers and allowing the rider to tap a crew member in the bottom sheet to focus that rider on the map. It now also supports live reroute recovery when a rider deviates from the route, using the rider’s current location as the moving origin and preferring the fastest available driving path over the shortest distance.

## What Phase 1 Includes

- Full-screen navigation route mounted at `/ride/:id/navigation`
- Google Directions-backed route hydration with fallback polyline generation
- Traffic-aware route selection that prefers the fastest ETA when alternatives are available
- Forward-offset camera follow for the current rider
- Turn-by-turn instruction card with ETA and remaining distance
- Off-route detection with automatic reroute after a short grace window
- Detour fallback to the destination when the remaining waypoint chain is no longer routable
- Live-session integration for start/end flow, room join, heartbeat, and location emit
- Ride-detail realtime subscription for join and stop-request updates before entering navigation
- Peer rider markers sourced from live-session location broadcasts
- Bottom sheet for rider presence, tap-to-focus crew lookup, and captain-only end-ride control
- Waypoint stop markers and recenter action for map recovery

## Files Involved

- Screen: `client/app/ride/[id]/navigation.tsx`
- Components (`client/src/features/navigation/components/`): `ManeuverBanner`, `NavigationBottomSheet`, `NavigationRouteLayer`, `PeerMarkers`, `RiderPuck`, `WaypointMarker`, `CrewSelfCard`, `ArrivalPrompt`
- Hooks (`client/src/features/navigation/hooks/`): `useNavigationSession`, `useNavigationFix`, `useSimulatedNavigationFix`, `useNavigationCamera`, `usePlannedRoute`, `useLiveLeg`, `useTripProgress`, `useRideLiveSession`, `useRideParticipants`, `useRideTrack`, `useWaypointReports`, `useScreenAwake`, `useAppIsActive`, `useTracksViewChanges`, `useNavigationMapTheme`
- Pure logic with tests (`client/src/features/navigation/core/`): guidance, maneuver, instruction text, route progress, trip plan, trip summary, camera policy, crew list and roles, roll call, regroup, late join, peer appearance, GPS simulator, geometry
- Route fetching: `client/src/features/navigation/services/navigationRouteService.ts` (through `/api/maps/directions`)
- Types: `client/src/features/navigation/types/navigation.ts`
- Live state: `client/src/store/liveSessionStore.ts`, `client/src/services/liveSessionSocket.ts`

## Phase 1 UX and Stability Fixes

- Route loading now keys off stable primitive coordinate strings instead of transient object references, which prevents the earlier `Maximum update depth exceeded` loop when the route screen hydrates.
- The instruction card is positioned below measured top controls instead of fixed offsets, which removes overlap between the exit control and the maneuver card.
- The bottom sheet now stays bottom-anchored using animated height rather than translate motion, so it does not jump to the top of the screen on some runtimes.
- Expanded sheet height is content-measured and viewport-clamped, which removes the large empty area seen in earlier builds.
- Collapsed sheet UX is intentionally lighter: ride title, online count, and a clear expand hint are visible without repeating turn/ETA data already shown in the top instruction card.
- A dedicated recenter control was added above the sheet so the rider can quickly recover the camera without leaving navigation.
- Self-follow and recenter-to-self now use a tighter zoom, so riders land closer to their live position both on initial navigation load and when tapping recenter.
- Navigation heading-follow now uses GPS heading with compass fallback, improving map rotation toward rider travel direction during active guidance.
- Selecting a rider from the bottom sheet now pauses automatic self-follow until the rider explicitly recenters, so crew lookup does not snap back immediately.

## Out of Scope for Phase 1

- Captain/co-captain specific live coordination overlays
- Incident visualization on the navigation map
- Camera modes beyond current-rider follow plus temporary rider-focus lookup

## Phase 2 Requirement Map

Status of the Phase 2 socket-gateway contract, reviewed against the code on 2026-09-28.

| Phase 2 requirement | State | Evidence | Remaining work |
| --- | --- | --- | --- |
| Realtime gateway and server bootstrap | Done | `server/src/realtime/gateway.ts`, `auth.ts`, `session-room.ts`, `server/src/app.ts` | None |
| Authenticated `/live` namespace | Done | `createLiveGateway()` + `authenticateLiveSocket()`, same token verifier as HTTP | None |
| Room key `ride:<rideId>:session:<sessionId>` | Done | `buildLiveRoomKey()` in `session-room.ts` | None |
| `session:join` / `session:leave` | Done | Gateway handlers + `liveSessionStore.ts` | None |
| `presence:heartbeat` | Done | Gateway handler + client heartbeat timer | None |
| `location:update` | Done | Zod-validated in the gateway; sent by the background tracker about every 5 s with the motion reading | None |
| `incident:create` | Done | Gateway handler + store | None |
| `session:state`, `presence:update`, `location:broadcast`, `incident:created` | Done | Gateway emits | None |
| `session:ended` | Done | REST controller emits `{ rideId, sessionId, endedAt, endedBy, reason }` | None |
| Sampled persistence | Done | `realtime/sampleThrottle.ts`: keep a sample per 20 m, per 30 s, or on a motion-reading change | None |
| Drop stale or out-of-order updates | Done | `updateLivePresenceLocation()` drops fixes older than 2 min, more than 30 s ahead, or out of order | None |
| Reconnect with token refresh | Partial | Client reconnects and rejoins | Socket.IO auto-reconnect reuses the token from the last `connect()`; refresh the token on `connect_error` or before reconnecting |
| Presence online/offline | Done, needs field QA | Heartbeat, leave, disconnect, presence sweep job | Validate under background and network churn |
| No unauthorized room joins | Done | Socket auth + confirmed-participant check | None |

Added since the original contract: `rider:progress`, `ride:arrival`, `regroup:requested`, `regroup:decided`, `waypoint:reached` (see `api-endpoints.md`).

## Still Open for Navigation UX

- Reconnect that survives an access-token refresh.
- Field QA for background/resume, poor networks and multi-rider load. The first real-phone ride for per-rider progress is pending.
- Server-pushed updates for worker-side changes (auto-finish, idle end); today the client learns of them by polling.
