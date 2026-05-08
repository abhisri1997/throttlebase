# Android Ride Detail Flicker + Crash Postmortem

## Summary

This defect caused the Android `ride/[id]` screen to:

- flicker heavily from the **Live Session** section downward,
- repeatedly show **"App is backgrounded. Heartbeat/location updates are paused."**,
- unmount/remount the ride-detail screen,
- and eventually crash or become unusable.

This one earned its place in the hall of pain.

## Symptoms

Observed behavior while opening a ride detail on Android:

- visible flicker starting near the Live Session card and lower screen content,
- repeated transitions between active/background UI state,
- map jank and frame spikes,
- eventual remounts and crash-like behavior,
- emulator logs showing repeated `RideDetail MOUNT` / `UNMOUNT` cycles.

## What made it confusing

Several clues pointed toward map rendering problems:

- `SurfaceFlinger` spikes,
- long frame times,
- marker churn on Android maps,
- route preview rerender pressure.

Those were real contributors to poor performance, but they were not the primary trigger for the remount loop.

## Root cause

The ride-detail screen automatically requested foreground location permission from effects that ran on mount:

- live-session location publishing,
- preview-location sampling for route preview origin.

On Android, that launched `GrantPermissionsActivity` on top of the app. Because the permission flow interrupted the screen lifecycle, the app briefly stopped being active, which caused:

1. the ride-detail screen to report `appState !== "active"`,
2. the Live Session section to show the backgrounded banner,
3. the screen to unmount/remount,
4. the location effects to run again,
5. the permission controller to reopen,
6. the loop to repeat.

So the core failure was:

$$
\text{auto permission request on mount} \rightarrow \text{permission activity opens} \rightarrow \text{app state flips} \rightarrow \text{screen remounts} \rightarrow \text{permission request repeats}
$$

That loop then amplified existing Android rendering pressure from the map and live-session updates.

## Secondary contributors

These were also present and made the experience worse:

- ride-detail header map prop churn from live marker updates,
- unstable stop-marker keys based on coordinates,
- repeated socket listener attachment behavior,
- full-screen map/render pressure from Android marker updates.

These were worth fixing, but they were not the main reason the screen kept tearing itself down.

## Evidence that confirmed it

The decisive clue came from Android logcat:

- repeated `RideDetail MOUNT` / `UNMOUNT` messages,
- repeated `GrantPermissionsActivity` entries from Android permission controller,
- the backgrounded banner appearing during flicker,
- remount timing that matched the permission activity interruptions.

In short: the app was not imagining things — it *was* being backgrounded repeatedly.

## Fixes made

### 1. Stopped automatic permission prompts on ride detail

In `client/app/ride/[id].tsx`:

- replaced automatic permission requests in mount-time effects with a passive permission check using `ExpoLocation.getForegroundPermissionsAsync()`.
- if permission is not already granted, the screen now skips location publishing/sampling instead of triggering Android permission UI on its own.

### 2. Hardened live-session socket listener attachment

In `client/src/store/liveSessionStore.ts`:

- made socket listener attachment idempotent,
- prevented repeated event binding churn across reconnect/reset cycles.

### 3. Earlier stabilization work that also helped

During debugging, the following mitigations were added and retained because they improved Android stability:

- skipped hidden live-marker comparisons in the ride-detail map header memo,
- passed a stable empty live-marker array on Android when markers are intentionally hidden,
- decoupled socket-enable logic from live-room join gating,
- moved room-join gating into the auto-join effect,
- stabilized stop-marker keys in ride detail and navigation.

## Why the final fix worked

The final fix removed the self-triggering lifecycle loop.

Before:

$$
\text{screen mount} \rightarrow \text{request permission} \rightarrow \text{permission activity} \rightarrow \text{backgrounded UI state} \rightarrow \text{remount} \rightarrow \text{repeat}
$$

After:

$$
\text{screen mount} \rightarrow \text{check permission only} \rightarrow \text{no forced permission activity} \rightarrow \text{stable app state} \rightarrow \text{screen stays mounted}
$$

Once that loop stopped, the flicker/crash issue was resolved.

## Lessons learned

- Do not auto-request location permission from screen-mount effects unless the UX is explicitly designed around a permission prompt.
- On Android, permission flows can behave like navigation/lifecycle interruptions, not just small modal events.
- If a screen flashes **"App is backgrounded"** during a rendering bug, believe it.
- A scary rendering symptom can be downstream of a lifecycle bug.
- Add debug mount/unmount logs earlier when a screen appears to flicker for no obvious reason.

## Recommended rule going forward

For ride detail and similar screens:

- **check** permission automatically,
- **request** permission only from an explicit user action or a clearly intentional permission flow.

## Verification

Verified by reopening Android ride details after the fix:

- no repeated remount loop,
- no repeated backgrounded banner flicker,
- no permission-controller churn on open,
- issue reported resolved by user.

## Files involved

Primary fix:

- `client/app/ride/[id].tsx`
- `client/src/store/liveSessionStore.ts`

Related stabilization work:

- `client/app/ride/[id]/navigation.tsx`
- `client/src/features/navigation/services/navigationRouteService.ts`

## Closing note

If this bug ever comes back, please escort it directly to this document and remind it that it already had its turn.
