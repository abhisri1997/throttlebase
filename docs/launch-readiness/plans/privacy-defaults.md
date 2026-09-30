# Plan — Privacy defaults and sensitive fields (E5)

**Decision (2026-09-29).** Sensitive fields are **never** visible to other riders, whatever the profile's visibility. "Public profile" controls who can see the social profile, not whether contact or location data is exposed.

## Today

| Issue | Evidence |
| --- | --- |
| The public profile returns `location_coords`, a precise point that is effectively the rider's home | `server/src/services/rider.service.ts:64`. The controller strips email, phone and weight but not coords (`server/src/controllers/rider.controller.ts:76`) |
| The public profile strips fields by **denylist**, so any new column leaks by default | `rider.controller.ts:76` |
| `profile_visibility` is never checked by `GET /api/riders/:id` | `rider.controller.ts:42-77` |
| `leaderboard_opt_in` is ignored | `docs/project-status.md` |
| Defaults are public for rides, profile, ride history and leaderboard | mig 003 line 10; mig 007 lines 45-47 |
| The automatic meeting point is the geometric median of confirmed riders' `start_location_override` or home `location_coords`. With one rider, that is their home | `server/src/services/ride.service.ts:941-960` |
| Rides and routes expose raw start and end points | `rides.start_point`/`end_point`, `routes.start_point`/`end_point` |

## Build

1. **Never-public fields.** `email`, `phone_number`, `weight_kg`, `location_coords`, `rider_identities`, `rider_roles`, sessions and login data are returned only to the rider themselves (and to admins where a support flow needs it, and that access is audit-logged).
2. **Allowlist DTO for other riders.**
   - `toPublicRider(row, viewer)` returns only: `id`, `username`, `display_name`, `profile_picture_url`, `bio`, `experience_level`, `location_city` (optional, coarse), follower and following counts, and ride stats permitted by `ride_history_visibility`, plus `is_following`.
   - Use it in every place a rider is embedded in another rider's response: profile, search, followers and following, post and comment authors, ride participants, leaderboard.
   - Add a test that fails if any response for another rider contains a key outside the allowlist.
3. **Honour visibility settings:**
   - `profile_visibility`: `public` → any signed-in rider sees the allowlisted fields; `riders_only` → same, and not in search for signed-out or web views; `private` → followers only see more than name and avatar.
   - `ride_history_visibility` gates ride stats and history lists.
   - `leaderboard_opt_in` removes the rider from leaderboards.
4. **New defaults** (additive migration changes the column defaults only; existing riders keep their current values unless they opt in):
   - profile: `public`, but only allowlisted fields;
   - ride history: `riders_only`;
   - leaderboard: opt-in `false` (Rank is behind a flag anyway);
   - rides: `public` for discovery;
   - routes: `private` (already).
5. **Meeting point without revealing homes:**
   - Compute an automatic meeting point only when **at least 3** confirmed riders contribute locations. Otherwise fall back to the captain's chosen start.
   - Snap the result to a public place (Places nearby: fuel station, café, landmark) that is at least 1 km from every contributor's point.
   - Never return contributors' points; the API already exposes only `has_start_override`.
6. **Privacy zones for shared views:**
   - Anything shown to riders other than the owner hides the first and last ~500 m of a recorded track.
     - ✅ **Routes** (2026-09-30): others see a public or shared route without its first and last ~500 m, in the route page, the Routes list, search, and rides planned on it; the owner sees it whole. An end within 50 m of a clearly public place (hotel, fuel station, café, viewpoint, station…; homestays, guest houses, PGs, hostels and apartments never count) stays, moved onto the place and named after it. What is at each end is looked up once, when the route is made public, and kept in `routes.public_ends` (migration 042); the view is worked out on read (`services/route-public-view.ts`), so a route made public earlier just has both ends trimmed. A route with under 5 km left once trimmed can't be made public (user's choice). Stops in hidden ends are hidden too.
     - Still open: ride tracks and live positions shown to other riders.
   - Rider-configurable home and work zones: a circle of 200 m to 1 km, stored privately.
   - Planned ride start and end points chosen by the captain are meeting places, not homes, so they are shown as entered.
7. **`location_coords` stays** because it feeds the meeting point. Settings must explain it ("Used only to suggest fair meeting points; never shown to anyone"), and it is cleared on deletion (already).

## Test

- The allowlist test, above.
- `GET /api/riders/:id` for a `private` profile as a non-follower returns only name and avatar.
- A meeting point with 1 or 2 contributors is never computed. With 3 or more, it is at least 1 km from each contributor.
- A track shown to another rider starts and ends at least 500 m from the true ends.

## Docs to update

- `data-inventory.md` §1.1, §1.5 and §9 E5.
- Privacy Policy "who sees what" section. ⚖️
