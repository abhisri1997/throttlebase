# Plan — Account deletion that removes only the leaving rider's data (E1, D1)

**Decision (2026-09-29).** Deleting an account removes that rider's personal data and content. It **never** removes or alters other riders' data: their tracks, stats, rides, posts, or participation in rides the leaving rider captained.

## Today (the problem)

- The mounted `DELETE /api/riders/me` (`server/src/adapters/http/riderAccountRoutes.ts:93`, `server/src/core/riders/deleteAccount.ts`):
  - deletes identities;
  - revokes sessions;
  - anonymises the `riders` row;
  - keeps everything else.
- Thirty days later the hourly cleanup job runs `DELETE FROM riders` (`server/src/workers/processors/cleanup.processor.ts:23-32`). Every `ON DELETE CASCADE` foreign key fires, including `rides.captain_id` (mig 003 line 6). Every ride the rider captained disappears, together with **other riders'** participation, location samples, presence and stats.
- A legacy handler (`server/src/controllers/rider.controller.ts:153-172`) promises "30 days to recover". It is shadowed and never runs.

## Target behaviour

| Data | What happens |
| --- | --- |
| Identities, sessions, refresh families, push tokens (when they exist) | Deleted immediately |
| Profile fields (email, name, username, bio, avatar, phone, weight, city, `location_coords`) | Cleared immediately (as today) |
| Posts, comments, likes, reviews, road feedback, bookmarks, follows (both directions), blocks, notifications, notification prefs, settings, vehicles, gear, badges and achievements | Hidden immediately; **deleted** at purge. Instagram-style: the rider's content goes, it is not re-attributed |
| Media (see [media-uploads.md](media-uploads.md)) | All variants and originals deleted at purge; CDN purged |
| The rider's own tracks (`ride_live_location_samples` for this rider), presence, `ride_history_stats`, `ride_participants` rows | Deleted at purge. Other riders' rows in the same rides are untouched |
| Upcoming rides the rider **captains** | At deletion time: transfer to a confirmed co-captain if one exists, otherwise cancel and notify participants |
| Completed or cancelled rides the rider captained | Kept for the other participants. The captain is shown as "Deleted rider" |
| Routes the rider created | Private and shared routes deleted. Rides planned on them keep their copied `road_via` (mig 034 already copies it) |
| Consent evidence ([consent.md](consent.md)) | Minimal pseudonymous evidence kept for the proof period. ⚖️ |
| `security_events` ([logging.md](logging.md)) | Kept until normal expiry (≤180 days or 1 year), with rider_id only |
| Content under a complaint or legal order | Preserved for up to 180 days (IT Rules) in a restricted table, then purged |

## Mechanism

1. **Keep a tombstone row.**
   - The `riders` row is never hard-deleted. After purge it holds only `id`, `deleted_at` and `purged_at` (new column), with every personal field NULL.
   - Rationale: many foreign keys reference `riders(id)`, and a tombstone keeps other riders' shared records valid without re-pointing them. The row carries no personal data.
2. **Stop the cascade.**
   - Remove `purgeGracePeriodExpiredRiders` from the cleanup processor.
   - Change `rides.captain_id` from `ON DELETE CASCADE` to `ON DELETE RESTRICT`. It is additive-safe: no rider rows are deleted any more. This way a future hard delete can never silently wipe other riders' rides.
3. **Explicit purge job** `account.purge`, scheduled for `deleted_at + 30 days`:
   - Delete the rider's own rows table by table, in one transaction per table group, with counts recorded in the job result.
   - Captained-ride handoff runs at **deletion** time, not at purge, so participants aren't left with an orphaned upcoming ride.
4. **Immediate effects at request time:**
   - sign out everywhere;
   - hide the profile and content from every query (`deleted_at IS NULL` filters);
   - remove the rider from live sessions and stop their tracking;
   - record `account.deleted` in `security_events`.
5. **Grace period.** Thirty days, during which the account is inaccessible and its content hidden. State the period in the in-app confirmation and on the deletion page.
   - Recovery during the grace period is optional. Identities are already unlinked, so recovery would need a support request. Decide before building it; the default is no self-service recovery.
6. **Re-authentication.** Require a sign-in within the last 5 minutes (`auth_time` claim) or a fresh email code before `DELETE /me` succeeds.
7. **Web deletion request** (`https://throttlebase.in/delete-account`). The rider enters an email, confirms via a one-time code, then the same `deleteAccount` runs. This works without the app installed. Play requires it.
8. **Sign in with Apple token revocation.** Add it when Apple sign-in ships (E2 is deferred to iOS launch).
9. **Remove the dead legacy handler** and its route.

## Test

- **Integration, two riders A and B.** A captains a completed ride with B, B captains a ride A joined, and both post and comment. After A's purge:
  - no row anywhere references A's personal data;
  - A's samples, posts, comments, likes and follows are gone;
  - B's samples, stats, posts and both rides still exist;
  - the completed ride shows captain "Deleted rider".
- An upcoming ride captained by A with a co-captain transfers to the co-captain; without one it is cancelled and B is notified.
- A request without recent authentication is refused.
- Running the purge job twice is harmless.

## Docs to update

- `data-inventory.md` §8 and §9 E1.
- Deletion page and Privacy Policy retention section. ⚖️
