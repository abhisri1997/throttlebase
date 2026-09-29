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
| Open rides the rider **captains** (draft, scheduled, active) | At deletion time, in the same transaction: hand over to the next leader (see "Handing over leadership" below), or cancel when nobody is left. ✅ slice 3a |
| Open rides the rider **joined** | At deletion time: they drop out, freeing the seat. ✅ slice 3a. Requests to join rides that need approval are withdrawn too ✅ slice 3d |
| Groups the rider owns (`groups.created_by`) | At deletion time, in the same transaction: hand over to the next admin; with nobody else in it, the group stays hidden and is deleted at purge. ✅ slice 3b |
| Completed or cancelled rides the rider captained | Kept for the other participants. The captain is shown as "Deleted rider" |
| Routes the rider created | Hidden immediately. At purge, private and shared routes are deleted. **Public** routes are kept for the community in anonymised form, as disclosed at registration (decision B, 2026-09-29, below). Rides planned on them keep their copied `road_via` (mig 034 already copies it) |
| Consent evidence ([consent.md](consent.md)) | Minimal pseudonymous evidence kept for the proof period. ⚖️ |
| `security_events` ([logging.md](logging.md)) | Kept until normal expiry (≤180 days or 1 year), with rider_id only |
| Content under a complaint or legal order | Preserved for up to 180 days (IT Rules) in a restricted table, then purged |

## Keeping public routes for the community (decision B, 2026-09-29)

A route is location data: one that starts or ends at the rider's home still identifies them without a name. Public routes are kept after deletion **only in anonymised form**. Once anonymised, a route is no longer personal data under the DPDP Act, so keeping it needs no consent. It needs clear notice, and the rider must keep control while the account is active. ⚖️

1. **What is kept can't lead back to them.** At purge, each public route (✅ `services/community-route.service.ts`, `core/routes/communityRoute.ts`, migration 041):
   - loses its creator (`creator_id` NULL) and shows as "Community route": no stand-in account, never linked to the tombstone, and nobody can edit, share or delete it;
   - keeps an end that is within 50 m of a clearly public place (hotels, resorts, motels, fuel and EV stations, cafés, restaurants, tourist spots, viewpoints, parks, parking, rest stops, bus and train stations), moved onto that place and named after it. Homestays, guest houses, PGs, hostels, cottages, farmstays and apartments never count, and a failed lookup counts as nothing found (user's choice, 2026-09-29);
   - loses about 500 m off every other end, which moves to the trimmed line and is named by area. With an end trimmed, a route with under 5 km left is deleted instead;
   - gets a title made from its ends' names; its stops in trimmed ends go, the rest are renamed by area, and stop notes, `ridden_duration_s`, `ride_id` and shares are dropped;
   - keeps its highlights and other riders' bookmarks and road feedback.

   Private and shared routes are always deleted. The same public-place check is meant for E5's privacy zones.
2. **Notice, not an opt-in** (user's choice, 2026-09-29). The Privacy Policy and Terms, accepted at registration, say that public routes are kept without the rider's name after they delete their account, and the Terms carry a licence to keep contributed routes. The deletion screen and web page restate it as information, not a choice. Recommended as well: a one-line notice where a route is made public ("Public routes stay for the community, without your name, if you delete your account"). ⚖️
3. **Control while the account is active.** Riders can delete a route or make it private at any time. Without this, a rider who doesn't want a route kept has no way out. The DPDP right to erasure (s.12) needs it regardless of deletion. ⚖️ ✅ `DELETE /api/routes/:id` and `PATCH /api/routes/:id` (owner only), with "Delete route" and "Make private" / "Make public" on the rider's own route page. The notice line shows wherever a route is made public. Sharing a route is now owner-only too: before, any rider could share any route with themselves and open it.

Delivered as its own slices after the hiding slice: route delete and make-private (✅ PR #72), then trimming and re-attribution in `account.purge` (✅).

## Handing over leadership (agreed 2026-09-29)

Like a WhatsApp group whose admin leaves: the ride or group carries on under someone else. It is never hidden from, or closed to, the people in it.

- **When:** at deletion, in the same transaction, so a ride is never led by a deleted account. The hourly purge also hands off anything still led by a deleted account (accounts deleted before this existed).
- **Rides:**
  1. the co-captain appointed first (`ride_participants.promoted_at`; co-captains from before it existed count from when they joined);
  2. otherwise, the confirmed rider with the most completed ThrottleBase rides;
  3. if that ties, whoever joined the ride first.

  Self-described `experience_level` is not used: it is unverified.
- **Groups:** another admin first (by when they joined, since admins other than the owner only come from earlier hand-overs); otherwise the member who joined first. `groups.created_by` moves to them. ✅ slice 3b
- **Telling people:** a `ride.leader_changed` job is queued in the same transaction; the worker notifies the new captain (who now also receives the ride's group alerts) and everyone still on the ride.
- **Nobody left:** an open ride is cancelled; a group is deleted at purge.
- **Finished rides** keep their captain, shown as "Deleted rider".
- **Leaving without deleting** uses the same hand-over. Groups ✅ 3b: admins can leave; the owner sees who takes over before confirming, and the last member leaving deletes the group (user's choice, 2026-09-29). Rides ✅ 3c: riders can leave before the start; a leaving captain hands over or cancels; a captain can also pass the ride to a chosen rider at any time and stays on as co-captain.

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
- An open ride captained by A passes to the next leader by the rule below, and everyone on it is notified; with nobody left it is cancelled (`ride-handoff.integration.test.ts`).
- A request without recent authentication is refused.
- Running the purge job twice is harmless.
- Deleting an account writes exactly one sealed registration record holding only registration fields. `throttlebase_app` cannot select it. The purge job removes it after 180 days, and a record under legal hold survives the purge.

## Docs to update

- `data-inventory.md` §8 and §9 E1.
- Deletion page and Privacy Policy retention section, including the 180-day sealed registration record. ⚖️
- `data-inventory.md` §1.1: add `sealed_registration_records`.
