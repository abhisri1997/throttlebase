# Ride now: unplanned rides, solo or with invited riders

Status: design agreed 2026-10-01, not built. Build order: [§9](#9-build-order).
Mockups (private canvas, share it before sending the link on): https://claude.ai/artifact/Hp52XKw1h3kwXYtQ4GVrHJ

## 1. Why

Today every ride is a planned ride:
- A rider fills in a title, start, destination and date, publishes it, finds it in Discover and starts it.
- There is no way to just get on the bike and ride.

A ride that only the captain is on already works (`isSoloRide`, `client/src/features/rides/core/rideParty.ts`), but only as a group ride with one member:
- The navigation screen shows "Alert my group" with nobody to alert, and a crew list of "You".
- A start that skips roll-out leaves the session in `starting`. After the rider finishes, the ride stays `scheduled` until the 120-minute idle sweep.
- With no destination, nothing finishes the ride except that sweep (`advanceArrival` returns `"none"` without an `end_point`).
- A point is recorded only while *live location sharing* is on (`locationUpdateUse`, used at `server/src/realtime/gateway.ts:339`). That means nothing to a rider who is alone.

## 2. Decisions

Agreed with the project owner on 2026-10-01, from review of the mockups.

| # | Decision |
| --- | --- |
| R1 | A ride is **planned** (today's form, for later) or **unplanned** ("Ride now": ride from here, now). Solo isn't a kind of ride: it is who is on it. |
| R2 | Entry point is **Discover's "+"**, which opens a chooser: **Ride now** / **Plan a ride**. Every tab keeps its own "+", and the tab bar doesn't change. |
| R3 | Ride now is **one screen** with an optional "Where to?". Empty means just ride and record. A place gives turn-by-turn directions. A destination can be added mid-ride. |
| R4 | Others join an unplanned ride **only by invitation** from riders you follow. It is never listed in Discover. |
| R5 | Solo safety: **Call 112** is the main action. A prefilled SMS to one emergency contact, and the system share sheet, both send a maps link, and **the rider presses Send**. The contact is kept **on the phone only**. |
| R6 | A **ride bar** above the tabs shows a ride under way. With none, it shows the next ride within **7 days**. The "+" stays bottom right and rises 14 px above the bar. |
| R7 | The upcoming bar **gets louder as the ride nears**: quiet until the day before, the meet-up on the day, and a **Start** button inside the 60-minute early-start window. |
| R8 | The **"+" is never disabled.** During a ride, the chooser shows "Back to <ride>" instead of Ride now, and "Plan a ride" still works. Within 60 min of a planned ride, the top row is "Start <ride>". |
| R9 | **Riding solo to a meet-up:** when your planned ride starts during a Ride now, one prompt (only while stopped) offers **Finish and Join**. The solo ride is saved on its own, and the group ride starts from the meet-up. |
| R10 | No manual pause. Stats already count only moving time, so a **Stopped** indicator replaces a pause button. |
| R11 | Recording no longer depends on live sharing: **`ride_recording` alone records**, and **`live_location_sharing` alone broadcasts** ([§7.3](#73-consent-split)). |

Constraints carried over:
- **D2** (after the ride only the rider sees their exact track).
- **D7** (background location only while riding, through a foreground service).
- **D8** (no SOS wording, no auto-dialling, a Call 112 hand-off).
- **E7** (no modals while moving).
- **E5** (privacy zones on anything shown to others).
- Android crash postmortem: passive permission checks only on mount.

## 3. Terms

- **Unplanned ride:** `rides.kind = 'unplanned'`, created by Ride now. Its start time is when it was created, and it is active at once.
- **Visibility:**
  - `public` (open to all) and `private` (approval needed) exist today;
  - **`invite_only`** (hidden; only invited riders can join) is new;
  - **`solo`** (hidden and not joinable) is new.
- **Ride bar:** the 56 px row above the tab bar, on every tab.
- **Moving / stopped:** moving means speed above 10 km/h for 5 s. Stopped means under 3 km/h for 30 s. The gap between the two stops the state flickering.

## 4. Screens

Each screen gives its features, states and copy. Copy follows the ThrottleBase design system: Title Case buttons, sentence-case helper text, no emoji except stop glyphs.

### 4.1 Discover "+" chooser

A bottom sheet over Discover, titled "Start a Ride". Its rows depend on the rider's situation:

| Situation | Rows |
| --- | --- |
| Nothing under way or near | **Ride Now**: "Start riding now, alone or with riders you invite." / **Plan a Ride**: "Set a date, a route and who can join." |
| A ride under way (yours or joined) | **Back to <ride>**: "Riding · 1 hr 12 min · 38.4 km", with Open (green row) / **Plan a Ride** |
| A planned ride you're on starts within 60 min | **Start <ride>**: "In 20 min · meet at <place>" (green row) / **Ride Now**: "Ride on your own now. You can join the group when it starts." / **Plan a Ride** |

Cancel closes the sheet.

### 4.2 Ride now: start screen (`app/(modals)/ride-now.tsx`, new)

- **Map:** centred on the rider, with a Centre on me button.
- **Where to? (optional):** place search (`PlaceSearchInput`). The helper reads: "Leave it empty to just ride. Your ride is recorded either way."
  - With a place: a destination row with Clear, stop rows (`PlannedStops`), "Add Stop", and "61 km · 1 hr 25 min · via NH 44".
- **Ride a Saved Route:** your saved and bookmarked routes, then forward or reverse. This fills in Where to? and the stops.
- **Invite Riders (optional):** opens the picker (§4.9). Once riders are chosen, the row reads "Asha and Rohan invited. They can join until you finish."
- **Readiness chips:** passive checks only, nothing prompts on mount.

  | Check | Good | Needs attention |
  | --- | --- | --- |
  | Location permission | "Location on" | "Turn on location": tap asks for permission |
  | GPS | "GPS good" (accuracy under 30 m) | "Weak GPS". You can still start |
  | Battery | "Battery 64%" | Amber below 20%: "Battery 14%. Plug in if you can." |
  | Recording consent | (hidden when on) | "Recording is off. Your ride won't be saved." Tap opens consent settings |

- **First-ride note:** shown once; "Got It" dismisses it for good. "Mount your phone and set up before you ride. Don't use it while moving."
- **Start Riding:** a 56 px primary button. It creates the ride (§7.2) and opens the live screen straight away. There's no form and no roll call.
- **Name:** automatic, shown under the button:
  - "Ride to <destination>" when there is one;
  - otherwise "Morning ride", "Afternoon ride", "Evening ride" or "Night ride", by local time.

  The rider renames it at the end.
- **States:**
  - Starting: the button shows "Starting..." and is disabled.
  - Failed: "Couldn't start your ride. Check your connection and try again." with Try Again.
  - Offline: disabled, with "You're offline".

### 4.3 Live ride (`app/ride/[id]/navigation.tsx`, extended)

This keeps today's layout, as checked against the emulator:
- the maneuver banner with its "Then" tab;
- the 60 px speed circle at the bottom left and the 60 px red alert button at the bottom right;
- the Re-center pill;
- the bottom sheet: exit | a big green figure over a meta line | a round action, with a pill row under it;
- the white-disc rider puck.

**Just riding** (no destination):
- no banner;
- a top pill, "Just riding · recording";
- in the sheet, the green figure is **riding time** (1:12:40), with "38.4 km ridden · 32 km/h avg" under it;
- the round action is **Add destination**, disabled while moving;
- the recorded track is drawn behind the puck in green.

**Navigating** (destination or route):
- today's banner, rerouting and arrival prompt;
- the sheet shows time to arrival and "4.8 km · to <place>";
- the round action is Route overview;
- the pill row reads "Ridden 12.6 km · 22 min".

**Crew:** the "Crew · N online" pill and the peer markers appear only once another rider is on the ride. With others there, it behaves as today.

**While moving (E7 motion lock):**
- A "Controls locked while moving" pill replaces the "SIMULATED GPS" pill's spot.
- Only these stay live: **Safety**, **Re-center**, **Voice** (mute) and the **Exit** button.
- Everything else is visibly disabled: add destination, invite, finish, the sheet expanding, and stop edits.
- No modals or alerts are shown while moving. Anything that would open one waits until stopped, except the Safety sheet, which the rider opens themselves.
- Targets are at least 60 dp.

**Stopped** (the sheet expands):
- The top pill reads "Stopped · controls unlocked", and the speed circle shows 0.
- The expanded sheet shows the ride name and "Just you", then:
  - **Stopped prompt:** after 15 min stopped with no destination, "Stopped for 16 min. Finish your ride, or keep going when you're ready."
  - **Add Destination** / **Invite Riders**;
  - the **You** card (green border, "Just you · Stopped 16 min") with **Hold to finish**: 1.5 s, with a fill that shows progress, a haptic on completion and no confirm dialog.
- With others on the ride, today's "Finish my ride" and the captain's red "End Ride" come back.

**Voice guidance:** spoken turns (expo-speech) with a mute button on the left of the map. Mute is remembered on the device. This is its own later PR ([§9](#9-build-order)).

**Background notification:**
- Alone: "Recording your ride".
- With others: "Sharing your location with your ride group".
- Both have a **Finish ride** action, which opens the app to the stopped sheet. This was an open item in D7.

**Other states:**
- **"Finding your position / Waiting for GPS":** today's banner state, unchanged.
- **Consent off:** "Recording is off" pill, and nothing is saved.
- **Offline:** points queue as today, with an "Offline · saving on the phone" pill.

### 4.4 Safety sheet

This is today's "Alert my group" sheet: full-width 60 px buttons, centred icon and label, the disclaimer and a plain Cancel.

**Alone** (title "Get help", subtitle "You're riding alone. These open your phone's own apps."):
1. **Call 112 (emergency):** filled red; opens the dialler.
2. **Text <contact> my location:** outlined. It opens SMS prefilled with "I'm using ThrottleBase. My location: <maps link>". With no contact set, the button reads **Add an Emergency Contact** and opens §4.13.
3. **Share my location:** outlined; the system share sheet with the maps link.
4. Disclaimer: "ThrottleBase is not an emergency service and does not contact police, ambulance or fire services. Messages go from your phone with a maps link to where you are; you press Send."
5. **Change emergency contact** link, then Cancel.

**With others:** today's sheet unchanged ("Alert my group", the outlined Call 112, today's disclaimer), with rows 2 and 3 added under the two buttons.

### 4.5 Finish and join (riding solo to a meet-up)

When a planned ride you're confirmed on starts (roll-out, or you tap Start) while you have a Ride now under way:
- **Title and question:** "<ride> is starting" / "Finish your ride here and join the group?"
- **Two facts:**
  - "Your ride here is saved on its own · 6.2 km · 18 min";
  - "The group ride starts from the meet-up · 5 riders here".
- **Buttons:**
  - **Finish and Join:** finishes the unplanned ride, then starts your ride on the planned one.
  - **Keep Riding Alone:** dismisses. The group ride card on Discover still offers Start.
- It shows only while stopped. If you're moving it waits, and the ride bar reads "<ride> has started · stop to join".

### 4.6 Ride bar (every tab, above the tab bar)

A ride under way always takes the bar.

| Stage | Look | Content |
| --- | --- | --- |
| Riding | Green fill, live dot | "Riding · 1 hr 12 min · 38.4 km" / "<name> · recording" (+ " · +1 upcoming") · Open → live screen |
| Upcoming, 2–7 days | Surface fill, top hairline, muted calendar | "Next ride · Sun 5 Oct, 6:00 AM" / "<name> · in 2 days" · View → ride page |
| Upcoming, today | Surface fill, green top edge, green calendar | "Today · 6:00 AM · Meet at <place>" / "<name> · 12 riders" · View |
| Upcoming, within 60 min | Green tint, green top edge | "Starts in 20 min · <place>" / "<name> · 5 riders there" · **Start** (44 px) |

The rules:
- Only rides you are confirmed on count: captain, co-captain or rider.
- It shows the earliest ride within 7 days.
- While the bar shows, each tab's "+" sits 14 px above it (60 + 56 + 14 = 130 px from the bottom) and slides back down when it clears.
- The data comes from `GET /api/rides/riding` (extended, [§7.5](#75-get-apiridesriding)), which `useBackgroundLocationTracker` already polls.

### 4.7 Ride summary (`app/ride/[id]/summary.tsx`, extended)

- The map shows the recorded track with start and end markers.
- **Name your ride:** the automatic name, prefilled and editable.
- "Only you can see this track." (D2)
- **Stats:** distance, riding time, average speed, stopped time, total time and stops. There's no top speed, following the compliance report on speed.
- **Badge earned** card, when the rewards job awarded one on this ride.
- **Save as a Route:** today's `SaveRouteCard`. A solo finish completes the ride, so it is allowed.
- **Was the road as described?** only when the ride followed a saved route.
- "Follow the group" is hidden when you were alone.
- **Done** opens Ride History.

### 4.8 Completed ride page and history

The ride page (`app/ride/[id].tsx`) for a finished ride that was only you uses a new `CompletedRideView`, in today's ride-page style:
- a full-width map with a round back button, a "Completed" pill and "You rode 38.4 km in 1 hr 12 min";
- the title (28 px) with Rename;
- "Just you · Ride now" and "Started <date> at <time>";
- stats;
- the "Save this ride as a route" card;
- "Along the way" (set off, stops over 5 min, finished);
- "Only you can see this track."

It hides participants, reviews, join requests, roll call, the live session card and requirements.

**History** (`app/ride-history.tsx`):
- Each card gets a **Ride now** or **Planned** label next to its status.
- Filter chips: **All · Ride now · Planned**.
- Unplanned cards show "Just you", or "N riders" in place of "N / M Joined".

### 4.9 Invite riders (picker)

- **Search:** "Search riders you follow".
- **List:** riders you follow, most-ridden-with first (initials avatar, name, @handle, "rode with you 6 times"), with a checkbox.
- **Footer:** "Only riders you invite can see or join this ride." and **Invite N Riders**.
- **Opened from:** Ride now, the stopped live sheet, and the planned form when it is Invite only.
- **Empty:** "You're not following anyone yet. Follow riders to invite them."

### 4.10 Invitation received

An in-app notification card:
- "Asha invited you to ride now" / "Riding to Nandi Hills · set off 6 min ago";
- **Decline** / **Join Ride**. Join confirms you on the ride and opens its live screen, where your own ride starts as usual;
- "You'll see the group's live positions once you join. The invite ends when the ride does."

Once the ride has ended, the card reads "This ride has ended" and the buttons go.

### 4.11 Plan a ride: Who's riding

A new section in `create-ride.tsx`. It replaces today's public/private toggle.

| Option | Maps to | Copy |
| --- | --- | --- |
| Open to All | `public` | "Anyone can find and join it." |
| Approval Needed | `private` | "Anyone can find it; you accept each rider." |
| Invite Only | `invite_only` | "Hidden. Only riders you invite can join." Shows the picker row |
| Just Me | `solo` | "Hidden and not joinable. Start it from the ride page when it's time." |

Capacity shows only for Open and Approval.

### 4.12 Route page: Ride This Now

`app/route/[id].tsx` gets a primary **Ride This Now** above today's **Plan a Ride**. It opens Ride now prefilled with the route and the chosen direction.

### 4.13 Settings: Safety

- **Emergency contact:** name, phone and "Pick from Contacts".
  - Stored with `expo-secure-store`, never sent to the server.
  - Disclosure: "Kept on this phone only. ThrottleBase never contacts them; you send the message yourself."
- **During a ride:**
  - Voice guidance (on);
  - Remind me to finish, after 15 min stopped with no destination (on);
  - Lock controls while moving (always on, shown disabled).
- "ThrottleBase is not an emergency service. In an emergency, call 112."

## 5. Numbers in one place

| Value | Setting | Where it lives |
| --- | --- | --- |
| Moving | above 10 km/h for 5 s | client, `rideMotion.ts` (new, pure) |
| Stopped | under 3 km/h for 30 s | client, same file |
| Stopped prompt | 15 min, no destination only | client |
| Hold to finish | 1.5 s | client |
| Upcoming bar window | 7 days | server, `riding` query |
| Start window | 60 min before `scheduled_at` | server, existing `canStartOwnRide` |
| Idle auto-end | 120 min | server, existing `RIDE_IDLE_AUTO_END_MIN` |
| Arrival radius / dwell | 150 m / 10 min | server, existing `ride-progress/config.ts` |

## 6. Privacy and safety notes

- **Unplanned rides stay out of sight.** They are never in Discover or on public profiles.
- **Live positions are shared only with confirmed riders.** An invited rider sees them only after accepting.
- **After the ride, the track is visible only to the rider** (D2), and the summary says so. Privacy zones (E5) still apply to anything shown to others later, such as a route saved from the ride.
- **Nothing leaves the phone without the rider pressing Send.** The emergency contact is device-only and sending is always the rider's own SMS or share. There is no new processing by ThrottleBase, so no new consent purpose (the `emergency_contact_sharing` purpose in `plans/consent.md` stays unused).
- **Notification copy doesn't say "your ride group" when alone** (the D7 disclosure wording).

## 7. Server changes

### 7.1 Migration 048 (next free number; check `origin/dev` first)

```sql
ALTER TABLE rides ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'planned'
  CHECK (kind IN ('planned', 'unplanned'));
-- visibility gains 'invite_only' and 'solo' (drop and re-add the CHECK).
```

Existing rides become `planned` and keep their visibility. Discover (`listDiscoverableRides`, `server/src/services/ride.service.ts`) excludes `invite_only` and `solo`, and joining those without an invite is refused.

### 7.2 `POST /api/rides/ride-now`

- **Body:** `{ end?: {lat, lng, name}, stops?: [...], route?: {route_id, direction}, visibility?: 'solo' | 'invite_only' }`.
- **One transaction:**
  - creates the ride (`kind: 'unplanned'`, `status: 'scheduled'`, `scheduled_at: now()`, `solo` unless inviting, the automatic title from the client);
  - then `startLiveSession` and `rollOutLiveSession`, so the session is `active` and a solo finish completes the ride through `closeLiveSessionBySystem`.
- **Returns** the ride.
- **Refuses (409)** when the rider already has a ride under way (`GET /riding`), so there are never two.

### 7.3 Consent split

`locationUpdateUse`:
- refuses only when **both** `live_location_sharing` and `ride_recording` are off;
- records a point with `ride_recording`;
- broadcasts it to the room with `live_location_sharing`.

Riders never asked keep today's behaviour. Without sharing, the position is also not kept as the rider's last one, so nobody sees their distance to the destination; and the replay returns only the caller's own samples (D2). **Built 2026-10-01.** The app's consent sheet copy and its reaction to a withdrawal (today it stops tracking) change with the client steps.

### 7.4 Mid-ride destination

The captain `PATCH`es `end_point` and stops on an active unplanned ride. Arrival then works through `advanceArrival` as for planned rides.

### 7.5 `GET /api/rides/riding`

It adds:
- `kind`;
- `others_on_ride` (bool), for the notification copy;
- `elapsed_s` and `distance_km` so far, for the bar;
- `upcoming`: the earliest confirmed ride within 7 days, with `title`, `scheduled_at`, `start_point_name` and `confirmed_count`.

### 7.6 Invites (later PR)

- `POST /api/rides/:id/invites {rider_ids}`: the captain invites riders they follow. It sets participant status `invited`, which exists but is unused.
- `POST /api/rides/:id/invites/respond {accept}`.
- Notification type `ride_invite`, de-duplicated per ride and rider.
- Invitations lapse when the ride ends.

### 7.7 Finish and join

No new endpoint. The client calls `/live/me/finish` on the unplanned ride, then `/live/me/start` on the planned one. Both exist.

## 8. What stays as it is

Planned group rides, roll call, co-captains, "Alert my group", regroup, stop requests and hand-off all work as today. The changes above only branch on `kind`, on visibility, or on whether someone else is on the ride.

## 9. Build order

One PR each, reviewed before the next.

1. **This doc.**
2. **Server core:** migration 048, `POST /ride-now`, Discover exclusion, mid-ride destination, the consent split and the `riding` fields. Integration tests.
3. **Client, Ride now solo:** the "+" chooser, the Ride now screen, the navigation "just riding" mode and the ride bar (riding stage).
4. **Client, finish and after:** motion lock, stopped sheet, hold to finish, the stopped prompt, summary additions, `CompletedRideView` and history labels.
5. **Solo safety:** the Safety sheet, emergency contact settings and the notification copy with its Finish action.
6. **Upcoming bar and chooser states:** the three bar stages, the chooser's "Back to" and "Start" rows, and Finish and join.
7. **Invitations:** server invites and notification, the picker, the invitation card, and "Who's riding" on the planned form.
8. **Route page "Ride This Now"** and **voice guidance**.

## 10. Testing

- **Server integration:**
  - Ride now creates an active ride that isn't in Discover, and a solo finish completes it.
  - A second Ride now while riding is refused.
  - A mid-ride destination arms arrival.
  - The consent split records without sharing, and shares without recording.
  - The `riding` fields and the 7-day upcoming window are returned.
  - Invites work only for followed riders and lapse at the end.
- **Client unit:**
  - moving/stopped detection with its thresholds and hysteresis;
  - the automatic name by time of day;
  - chooser rows per situation;
  - ride bar stage selection;
  - the hold-to-finish timing.
- **On an Android dev build with the GPS simulator (`?simulate=1`):**
  - solo with no destination, solo to a destination, a saved route;
  - adding a destination mid-ride;
  - an invite accepted mid-ride;
  - finish and join at a meet-up;
  - killing the app mid-ride (the notification and the ride bar bring it back).
