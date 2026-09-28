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
| Identities, sessions, refresh families, push tokens (when they exist) | Deleted immediately, after the registration details are sealed (next row) |
| **Registration information** (IT Rules 2021, Rule 3(1)(h)) | Copied into a **sealed registration record** at deletion, then purged **180 days after the account was cancelled**. See mechanism step 4. ⚖️ |
| Profile fields (email, name, username, bio, avatar, phone, weight, city, `location_coords`) | Cleared from `riders` immediately (as today); the sealed record is the only copy for 180 days |
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
   - ✅ Done in the security hotfix (`fix: account cleanup no longer deletes other riders' rides`): the cleanup processor no longer hard-deletes riders, and `account-cleanup.integration.test.ts` proves other riders' data survives.
   - Change `rides.captain_id` from `ON DELETE CASCADE` to `ON DELETE RESTRICT`. It is additive-safe: no rider rows are deleted any more. This way a future hard delete can never silently wipe other riders' rides.
3. **Explicit purge job** `account.purge`, scheduled for `deleted_at + 30 days`:
   - Delete the rider's own rows table by table, in one transaction per table group, with counts recorded in the job result.
   - Captained-ride handoff runs at **deletion** time, not at purge, so participants aren't left with an orphaned upcoming ride.
4. **Sealed registration record** (IT Rules 2021, Rule 3(1)(h)). ⚖️
   - **Why.** An intermediary that collects information from a user for registration must keep it for 180 days after the registration is cancelled or withdrawn. This conflicts with erasing everything at once, so the registration details move out of the live product into a sealed store, rather than being deleted immediately.
   - **What.** A new `sealed_registration_records` table: `rider_id` (tombstone), `email`, `display_name`, `username`, `phone_number`, sign-in providers and subjects (from `rider_identities`), `registered_at`, sign-up IP (from `rider_consents`), `cancelled_at`, `purge_after` (= `cancelled_at + 180 days`). Only registration information goes in: no rides, tracks, posts or other content. Counsel to confirm the exact field list.
   - **Access.** The app role `throttlebase_app` and the worker's normal queries have no grants on it. It is written by a narrow SECURITY DEFINER function called from `deleteAccount`. It is read only through a documented lawful-request procedure (a court order or a government request under the IT Act), and every read is recorded in `security_events`.
   - **Isolation.** It is never used to sign in, contact, re-identify or market to the person, and never restored into `riders` except through an explicit, logged recovery request inside the grace period.
   - **Purge.** A daily `registration_records.purge` job deletes rows past `purge_after` (E11). A row under an active legal hold is kept until the hold is released, and the hold is recorded.
   - **Disclosure.** The deletion page and the Privacy Policy say what is kept, why, for how long, and that it is not used for anything else.
5. **Immediate effects at request time:**
   - seal the registration record (step 4) in the same transaction that unlinks identities and clears the profile;
   - sign out everywhere;
   - hide the profile and content from every query (`deleted_at IS NULL` filters);
   - remove the rider from live sessions and stop their tracking;
   - record `account.deleted` in `security_events`.
6. **Grace period.** Thirty days, during which the account is inaccessible and its content hidden. State the period in the in-app confirmation and on the deletion page.
   - Recovery during the grace period is optional. Identities are already unlinked, so recovery would need a support request. Decide before building it; the default is no self-service recovery.
7. **Re-authentication.** Require a sign-in within the last 5 minutes (`auth_time` claim) or a fresh email code before `DELETE /me` succeeds.
8. **Web deletion request** (`https://throttlebase.in/delete-account`). The rider enters an email, confirms via a one-time code, then the same `deleteAccount` runs. This works without the app installed. Play requires it.
9. **Sign in with Apple token revocation.** Add it when Apple sign-in ships (E2 is deferred to iOS launch).
10. **Remove the dead legacy handler** and its route.

## Test

- **Integration, two riders A and B.** A captains a completed ride with B, B captains a ride A joined, and both post and comment. After A's purge:
  - no row anywhere references A's personal data;
  - A's samples, posts, comments, likes and follows are gone;
  - B's samples, stats, posts and both rides still exist;
  - the completed ride shows captain "Deleted rider".
- An upcoming ride captained by A with a co-captain transfers to the co-captain; without one it is cancelled and B is notified.
- A request without recent authentication is refused.
- Running the purge job twice is harmless.
- Deleting an account writes exactly one sealed registration record holding only registration fields. `throttlebase_app` cannot select it. The purge job removes it after 180 days, and a record under legal hold survives the purge.

## Docs to update

- `data-inventory.md` §8 and §9 E1.
- Deletion page and Privacy Policy retention section, including the 180-day sealed registration record. ⚖️
- `data-inventory.md` §1.1: add `sealed_registration_records`.
