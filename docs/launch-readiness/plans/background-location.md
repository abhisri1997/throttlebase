# Plan — Background location only during an active ride (E4)

**Decision (2026-09-29):**
- Location is collected in the background only while the rider's own ride is under way, so a rider who minimises the app stays on the group's map.
- It uses a user-visible **foreground service** started while the app is open.
- The app does **not** ask for "Always" / `ACCESS_BACKGROUND_LOCATION`.

## Why riders disappear today

| Step | Code |
| --- | --- |
| If the rider refuses "Always", the background tracker never starts; only the foreground watcher runs, which the OS pauses when the app is minimised | `client/src/services/backgroundLocationService.ts:124-128` |
| Ride detail stops its heartbeat and location upserts whenever the app is not active | `client/app/ride/[id].tsx:981-1065` |
| The server marks the rider offline the instant the socket disconnects | `server/src/realtime/gateway.ts:404-411` |
| …or after 120 s without a heartbeat | `server/src/workers/processors/live-ops.processor.ts:15` |
| Other riders' maps drop anyone marked offline | `client/src/features/navigation/hooks/useRideParticipants.ts:53` |
| ✅ Fixed (step 5). Even with "Always", the socket reconnected with the token it got at `connect()`. Access tokens last 15 min, so a long background stint ended in a rejected reconnect, which Socket.IO never retries | `client/src/core/auth/socketAuth.ts` |

## What the platform allows

- **Android.** expo-location's foreground-service path "does NOT require the background location permission" when it is started while the app is in the foreground. Android 14+ keeps while-in-use location access for a `location`-type foreground service started from the foreground.
  - Source: `node_modules/expo-location/android/.../LocationModule.kt:314-330`.
- **iOS.** A location session started in the foreground keeps running in the background with only when-in-use permission, given `UIBackgroundModes: location` and the blue status-bar indicator.
  - Source: `LocationModule.swift:227-241`.

## Build

1. **Start and stop the tracker around the rider's ride only.**
   - Start in `startTracking` when `GET /api/rides/riding` returns a ride and the app is in the foreground.
   - Stop it when:
     - the ride leaves that list;
     - the rider leaves the live session (new: tie it to `session:leave`);
     - the rider signs out.
   - If the rider is already mid-ride when the app returns to the foreground, restart it.
2. **Remove the "Always" request.**
   - Delete `requestBackgroundPermissionsAsync` and its gate.
   - Delete `ACCESS_BACKGROUND_LOCATION` and set `isAndroidBackgroundLocationEnabled: false`.
   - Remove the `locationAlwaysPermission` / `locationAlwaysAndWhenInUsePermission` strings.
   - Keep `isAndroidForegroundServiceEnabled`, `FOREGROUND_SERVICE_LOCATION` and iOS `UIBackgroundModes: ["location"]`.
   - Remove the unused `fetch` mode.
3. **Make the notification honest and useful.** Title: "Ride in progress". Body: "Sharing your location with your ride group until you finish." Add a "Finish ride" action if expo-location allows it; otherwise tapping the notification opens the ride.
4. **Add a prominent disclosure screen.** Show it once, before the first location prompt. It says:
   - what is shared (live position, speed, and motion when allowed);
   - with whom (this ride's group);
   - when it starts (your ride starts);
   - when it stops (you finish or leave).

   Record the choice in the consent ledger as `live_location_sharing` (see [consent.md](consent.md)).
5. **Keep the socket authenticated in the background.**
   - ✅ Done (`fix: sockets reconnect with a fresh access token`): Socket.IO's `auth` callback fetches a current access token on every (re)connect, for `/live` and `/rides`, and the background tracker no longer holds a token.
   - ✅ Done in the same change: a handshake the server refuses (which Socket.IO never retries) is retried after 1 s, doubling to 30 s, with whatever token is current then. The server does not check token expiry per event, so no `session:error` handling is needed.
6. **Don't erase a rider for a short gap.**
   - Server: on disconnect, mark offline only if no reconnect arrives within a grace window (60 s). Treat every `location:update` as a heartbeat; the upsert already refreshes `last_heartbeat_at`.
   - Server: while the tracker runs, send a heartbeat from the location task even when stationary. Otherwise a rider stopped at a light for 2 min (distance filter 10 m) goes stale.
   - Client: keep an offline rider's last position on the map, greyed out with "last seen N min ago", instead of filtering it out. Hide it only after a longer cutoff (for example 10 min) or when their ride finishes.
7. **Play Console.** File the foreground-service declaration (type `location`, with a short video). The background-location declaration is not needed.

## Test

- **Unit:**
  - start/stop decisions: ride under way, finished, left the session, signed out, app backgrounded at start;
  - grace-window offline logic;
  - the greyed-marker selector.
- **Integration:** reconnect with an expired token gets a fresh one; disconnect followed by reconnect within 60 s never emits `presence:update` offline.
- **Device (release gate)**, on Android 14+ and an iPhone, with while-in-use permission only:
  - start a ride, lock the screen for 10 min, and switch to another app for 20 min; samples keep arriving and the rider stays on a second phone's map;
  - finish the ride; the notification and the indicator disappear within 30 s;
  - swipe the app away; tracking stops.

## Docs to update

- `data-inventory.md` §3 and §4.
- `store-forms.md` (foreground-service declaration text).
