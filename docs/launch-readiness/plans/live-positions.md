# Plan — Live positions vs. the rider's own track (E5, D2)

## The situation in plain terms

While a rider rides, the phone sends a position every few seconds. Those positions do two jobs:

1. **Live sharing:** the group sees the rider moving on the map during the ride.
2. **Ride history:** afterwards, the rider's route, distance and stats are computed from the same positions.

The spec says "live positions are ephemeral, only the user's own recorded ride is kept". It assumed two stores. The code has one: `ride_live_location_samples` (mig 013) is both, and ride stats read it (`server/src/services/stats.service.ts:175-195`). Deleting live positions after the ride would delete ride history too.

## Decision (2026-09-29): access to live positions expires; the rider's own track stays

What must be ephemeral is **other people's ability to see where you were**, not your own record of your ride.

| Data | During the ride | After the ride ends |
| --- | --- | --- |
| Rider's current position (`ride_live_presence.last_location`) | Visible to the ride's confirmed participants | **Cleared** when the rider finishes or the session ends |
| Rider's full track (`ride_live_location_samples`) | Visible to participants as the live trail | Visible **only to the rider**. Others see only what the ride's visibility allows: the planned route and ride-level stats, never the rider's exact line, start or end |
| Finish location (`ride_live_presence.finish_location`) | Used for arrival logic | Cleared after the ride-progress sweep has used it |
| Incident locations | Visible to participants | Kept with the incident for its retention period (see [safety-flow.md](safety-flow.md)) |
| Raw samples older than N days | — | **Optional thinning:** keep a simplified line (for example Douglas–Peucker at 5 m) plus stats, and drop per-fix speed, heading, accuracy and activity. N is proposed at 90 days and recorded in the retention config (E11) |

## Build

1. **Clear at the end.** When a session ends, and when a rider finishes, set `last_location = NULL` and `finish_location = NULL` for that rider. Do it in `live-session.service.ts`, when the session ends and when a rider finishes.
2. **Scope the track endpoints.**
   - Session timeline and track reads (`server/src/services/ride-track.service.ts`, `live-session.service.ts:1491`) return another rider's samples only while the session is live.
   - After it ends, they return only the requester's own samples.
   - Add authorization tests (E10).
3. **Thinning job** (E11). `track.compact` runs daily for samples older than N days: it writes the simplified line to a per-rider track table (`rider_ride_tracks`, additive) and deletes the raw samples. Stats already live in `ride_history_stats`, so they are unaffected. Compacted rides can no longer be re-analysed (stop detection needs raw fixes), so freeze their stats at compaction and skip them in recompute scripts.
4. **Retention config.** Add `LIVE_TRACK_RAW_RETENTION_DAYS` in the single retention config file (E11), and document it in `data-inventory.md` §8.
5. **Privacy zones** ([privacy-defaults.md](privacy-defaults.md)) apply to anything shown to others after the ride.

## Test

- After a session ends, rider B cannot fetch rider A's samples; A can fetch A's.
- `last_location` is NULL after finish.
- Compaction keeps distance within 1% of the original and removes raw rows older than N days.
