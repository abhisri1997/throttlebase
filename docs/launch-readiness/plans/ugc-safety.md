# Plan — UGC safety (E3)

Apple 1.2, Google Play's UGC policy and the IT Rules 2021 all expect the same four things from an app where riders post: a way to block someone, a way to report content, someone who acts on reports, and a named grievance contact with deadlines. ⚖️ items need a lawyer before launch.

## Today

- `blocked_riders` exists (migration 007) and Settings lists blocked riders, but until PR 1 a block hid nothing, not even notifications, and there was no Block button.
- Posts accept external image URLs (`media_urls`) that no one checks. D9 replaces them with first-party uploads ([media-uploads.md](media-uploads.md)); until then they are a moderation gap.
- There are no reports, no filter, no moderation queue and no grievance screen.

## Build, in four PRs

### 1. Blocking hides everything — ✅ built

A block works **both ways**. Once either rider blocks the other:

- neither sees the other's posts, comments, ride reviews, routes, discoverable rides or profile, and neither finds the other in search;
- neither can follow, like, comment on, mention (no notification), or join or ask to join a ride the other leads;
- blocking ends any follow between them; unblocking doesn't restore it;
- the blocked rider is not told; what is hidden reads as "not found".

**Deliberately not hidden:** a group ride both riders are already on. Hiding a rider's live position from the group on the road is less safe than showing it; the rider who blocked can leave the ride (#66). Groups are flagged off for the beta and are not covered yet.

Code: `server/src/services/blocks.ts` (one SQL helper used by every query), Block on the rider profile, Unblock in Settings. Test: `blocking.integration.test.ts`.

### 2. Reports and a word filter

- `reports` table: reporter, target type (`post`, `comment`, `rider`, `ride`, `route`, `group`), target id, reason (`spam`, `harassment`, `hate`, `sexual`, `violence`, `dangerous_riding`, `impersonation`, `other`), optional note, status (`open`, `actioned`, `dismissed`), timestamps. One open report per reporter per target.
- `POST /api/reports`, rate-limited. Report from the post and comment menu, the rider profile, ride detail and route detail. Reporting offers to block the rider too.
- Word filter on post and comment create and edit: a pluggable list (`core/moderation/wordFilter.ts`), starting small. A hit is refused with a clear message rather than silently hidden. ⚖️ list contents.

### 3. Moderation queue and takedown

- Admin screen (roles from #68): open reports, oldest first, grouped by target, with the content and the reporter's reason.
- Actions, each recorded with the moderator and a reason: **remove content** (soft delete: `removed_at`, `removed_by`, `removal_reason`, hidden everywhere like a deleted rider's content), **dismiss**, **suspend rider** (sign-out everywhere, sign-in refused, content hidden) and **lift suspension**.
- Removed content is kept for **180 days**, then purged by the worker (E11). The rider whose content was removed is told why, in the app.
- Every action goes to the admin audit log (E10, D10), which this PR starts as `security_events` if it doesn't exist yet.

### 4. Grievances (IT Rules 2021, Rule 3(2))

- Every report is also a grievance record: `acknowledged_at` (target 24 h) and `resolved_at` (target 7 days, 72 h for intimate imagery ⚖️).
- In-app "Grievance Officer" screen: name, email and address placeholders, how to complain, the deadlines, and the rider's own reports with their status.
- Linked from Settings → Legal and from the Terms (E8).

## Test

- Integration, per PR: what is hidden from whom, both ways, and what a third rider still sees; that nobody but an admin can act on reports; that removed content stays hidden and is purged after 180 days.
- Manual: block, report and remove on a real phone; the reporter sees the outcome.

## Docs to update

`data-inventory.md` (§6, §9 E3), `api-endpoints.md`, `database-design.md` for new tables, the Terms and Community Guidelines drafts ⚖️.
