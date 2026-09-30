# ThrottleBase — Launch Readiness Spec (for Claude Code)

> Source: compliance research (India DPDP Act/Rules 2025, IT Rules 2021 + 2026 amendment, CERT-In 2022,
> Google Play + Apple App Store policies) and monetization planning. Full report: `docs/launch-readiness/compliance-report.md`.
> Not legal advice. Anything marked **\[LAWYER\]** must not be finalized by the agent.

## Context

- Monorepo: `server/` (Node 22, TypeScript, Express 5, PostgreSQL + PostGIS, Socket.IO `/live`, DB-backed queue + worker)
  and `client/` (Expo SDK 57, React Native, Expo Router, Zustand, TanStack Query).
- Hosting: Railway (API/worker), Supabase (Postgres + PostGIS, `ap-south-1` Mumbai; moved from Neon), Cloudflare DNS. Domains: `throttlebase.in`, `api.throttlebase.in`, `api-dev.throttlebase.in`.
- Auth: passwordless — Google, Apple, email code → server-issued ES256 access JWT + rotating refresh token. Roles on token (`admin`, `support`) from `rider_roles`.
- Launch target: **India-only**, both stores, **18+ only**.

## Rules for the agent

1. Start with **Phase 0** and stop for review before changing code.
2. One branch + PR per epic. Small, reviewable commits. Tests for every behavior change.
3. Migrations must be additive/reversible. Ask before any migration that drops or rewrites data.
4. Never commit secrets. Never modify Railway/Supabase/Cloudflare/EAS settings — list required changes instead.
5. Legal text: generate **drafts only**, clearly marked `DRAFT — NOT LEGAL ADVICE`, in `docs/legal/drafts/`.
6. Safety features must never be paywalled. Privacy/deletion controls must never be paywalled.
7. When the code contradicts this spec, stop and report the contradiction instead of guessing.

---

## Phase 0 — Audit (no code changes)

Produce `docs/launch-readiness/data-inventory.md` from the actual code:

- Every table/column holding personal data (from migrations), with: category, purpose, who can read it, retention today.
- Every client dependency that collects data or talks to a third party (maps, push, analytics, crash, auth), from `client/package.json`.
- Every OS permission requested (from `app.config.ts` + plugins + generated manifests): location (fine/coarse/background),
  camera/photos, notifications, foreground service types.
- Whether ride recording currently needs **background** location or works with a **foreground service**.
- What the "safety flow" actually does.
- Whether posts accept images/media; whether EXIF is stripped.
- Where logs go and whether they contain coordinates, tokens, or emails.
- Gaps vs. the epics below, as a checklist.

**Status: done 2026-09-28** (code at `dev` `2eebfa0`). Output: [`data-inventory.md`](data-inventory.md).
Contradictions it found were decided on 2026-09-29. See [Decisions from Phase 0](#decisions-from-phase-0); implementation plans are in [`plans/`](plans/README.md).
Each epic below carries a short *Current state* note; the evidence is in `data-inventory.md` §9.

---

## Phase 1 — Launch blockers (P0)

### E1. Account deletion (Apple 5.1.1(v), Google Play User Data policy, DPDP erasure)

- `DELETE /me` (re-auth or recent-token required): hard-delete or irreversibly anonymize rides, track samples, routes,
  bookmarks, posts, comments, likes, follows, group memberships, live-session data, notification prefs, push tokens, sessions.
- Content others depend on (group rides the user organized, comment threads): define and document behavior
  (transfer ownership or anonymize author as "Deleted rider").
- Revoke Sign in with Apple token via Apple REST API on deletion.
- Retain only: minimal security logs (≤180 days) and records under active legal hold. Document this.
- In-app: Settings → Account → Delete account (confirmation + explanation of what is deleted).
- Web: `https://throttlebase.in/delete-account` request flow that works **without** the app installed.
- Tests: user data absent after deletion; other users' data intact.

> **Current state (Phase 0):** `DELETE /api/riders/me` exists: it unlinks identities, revokes sessions and anonymises the profile.
> Rides, tracks and UGC are kept, then the hourly cleanup hard-deletes the rider after 30 days and cascades into rides they captained.
> No re-auth, web flow or Apple revocation. There are no push tokens to delete. See **D1**, **D4**; inventory §8, §9 E1.

> **Current state (2026-09-30): built for the Android launch** (PRs #49–#83; [plans/account-deletion.md](plans/account-deletion.md)).
> Deletion needs a code emailed to the account's address, in the app or at `throttlebase.in/delete-account` without the app.
> It signs out everywhere, hides the rider at once and hands their rides and groups to the next leader; 30 days later `account.purge`
> removes only their own data and leaves an empty tombstone. Public routes stay as anonymised Community routes, and registration
> details are sealed for 180 days (IT Rules 3(1)(h)). Still open: a security-log retention period and purge (E11), Apple token
> revocation (with Apple sign-in, D6), the Play Console Delete account URL, and legal review of the texts. Inventory §8.1, §9 E1.

### E2. Sign in with Apple in production (Apple 4.8)

- The config plugin that strips the Apple sign-in entitlement must apply **only** to dev/free-account EAS profiles.
- Production and preview iOS builds must include Sign in with Apple. Add a check (script or CI) that fails if it's missing.

> **Current state (Phase 0):** the entitlement is stripped in **every** build (`client/plugins/with-no-apple-signin.js`), and the Apple
> button is hidden unless `EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN=true`. The server endpoint is ready. **Deferred until the iOS release (D6).**

### E3. UGC safety (Apple 1.2, Google UGC policy, IT Rules 2021)

- `reports` table + `POST /reports` for posts, comments, users, groups, rides.
- Block user: hide their content everywhere (feed, comments, mentions, groups, ride rooms, notifications); prevent interaction.
- Basic objectionable-content filter on post/comment create (word list, pluggable).
- Admin moderation queue: list reports, take down content, suspend users, record reason.
- Removed content: soft-delete + preserve 180 days, then purge (worker job).
- Grievance tracking: acknowledgement timestamp, resolution timestamp (targets: ack 24h, resolve 7 days).
- In-app "Contact / Grievance Officer" screen with name, email, address placeholders.

> **Current state (Phase 0):** `blocked_riders` exists, but a block only filters notifications. There are no reports, filter,
> moderation queue or grievance screen. Posts accept external image URLs (`media_urls`) that bypass moderation. Inventory §6, §9 E3.
>
> **Update (2026-09-29):** plan in [plans/ugc-safety.md](plans/ugc-safety.md). Blocking now works both ways and hides the other rider everywhere (PR 1 of 4). Reports and the word filter are in (PR 2). The admin moderation queue, removals, suspensions and the 180-day purge of removed content are in (PR 3). Grievances are in (PR 4): acknowledgement with a reference on receipt, 7-day and 72-hour deadlines, outcomes to reporters, the public Grievance Officer page and "Your reports". **E3's build is complete**; left for humans: the Grievance Officer's details, a lawyer's review of the deadlines, word list and Community Guidelines (E8).

### E4. Location & ride recording

- Prefer **foreground service** (Android `foregroundServiceType="location"`, persistent notification) started by the user
  over `ACCESS_BACKGROUND_LOCATION`. Only request background location if Phase 0 proves it's required.
- Prominent disclosure screen **before** the OS permission prompt (what, why, when it stops).
- Tracking must stop when a ride ends, the app is killed by the user, or the user leaves a live session.
- iOS: accurate `NSLocationWhenInUseUsageDescription` / `NSLocationAlwaysAndWhenInUseUsageDescription`;
  `UIBackgroundModes: ["location"]` only if needed.
- Use `android.blockedPermissions` to remove anything unused.

> **Current state (Phase 0):** background location is **not required**. Recording already runs as an expo-location foreground
> service (`foregroundServiceType=location`), which needs only foreground permission. Today's code still requests "Always"
> and stops tracking if the rider refuses. Still to do: confirm on a real device with the screen off.
> Media permissions follow D9: the photo picker needs no library permission; camera and microphone only for in-app capture.
> Background `audio`/`fetch` and the media-playback service are not needed. See **D7**, **D9**; inventory §3, §4.
>
> **Update (2026-09-29):** the app no longer asks for "Always". `ACCESS_BACKGROUND_LOCATION` is removed and blocked, iOS keeps only the `location` background mode, and the tracker restarts when the app returns to the foreground. Still to do: the disclosure screen, stopping on leaving the session, and a real-device check with the screen off.

### E5. Location privacy defaults

- Privacy zones: hide first/last ~500 m of any shared/public route by default; user-configurable home/work zones.
- Visibility setting per ride/route: private (default) / followers / public.
- Live-session positions are ephemeral: not persisted beyond session end (or TTL ≤ 24h). Only the user's own recorded ride is kept.
- Public views never expose raw precise coordinates of start/end points.

> **Current state (Phase 0):** defaults are **public** for rides, profile, ride history and leaderboard. There are no privacy zones.
> The public profile returns `riders.location_coords`. Live positions and the recorded ride are the **same table**
> (`ride_live_location_samples`), kept forever. See **D2**; inventory §1.2, §9 E5.

### E6. Consent & age gate (DPDP)

- `consents` table: `user_id, purpose, notice_version, granted_at, withdrawn_at, source`.
- Purposes: `ride_recording`, `live_location_sharing`, `public_profile`, `marketing_notifications`.
- Consent screens at onboarding and contextually (first ride, first live session). Withdrawal in Settings, as easy as granting.
- 18+ confirmation at signup (DOB or explicit confirmation). Block and flag under-18 accounts.
- `notice_version` bump forces re-consent.

> **Current state (Phase 0):** `rider_consents` already records terms/privacy **document versions** and IP at sign-up.
> It has no purposes, no withdrawal and no re-consent. No age or DOB is collected anywhere. See **D3**.
>
> **Update (2026-09-30):** PR 1 of 3 (server ledger) is in: migration 045, `server/src/core/consent/`, `GET /api/consents`, `PUT /api/consents/:purpose`, `POST /api/consents/declarations`. PR 2 (gates) is in: live location, recording and motion data follow consent, a withdrawal of live location sharing takes effect at once, and riders never asked keep today's behaviour until asked (option B). The `public_profile` gate waits for profile visibility enforcement (E5). Next: the app's 18+ screen, onboarding and contextual prompts, and Settings → Privacy (PR 3). ⚖️ Counsel to confirm the purposes, notice texts and the proof period.

### E7. Rider safety UX

- First-ride safety disclaimer (don't use the phone while riding; data is approximate; not an emergency service; call 112).
- While a ride is active and moving above a threshold: no modals/interstitials; non-essential interactions disabled.
- Remove or avoid any speed-based leaderboard, badge, or challenge. Rank by distance, streaks, attendance, exploration.
- Rename/label the safety flow so it is never described as SOS or an emergency service.

> **Current state (Phase 0):** the leaderboard ranks by badges, rides or distance only (no speed). The safety flow is a button labelled
> **"SOS"** (`kind='sos'`). It alerts ride leaders in-app and escalates to captain and co-captains after 120 s. There is no disclaimer
> and no motion lock. Inventory §5.
>
> **Update (2026-09-29):** the safety flow is now **"Alert my group"** (`kind='group_alert'`, migration 039) on ride detail and in navigation. It alerts everyone on the ride, shows them a banner with Navigate to rider and Call 112, has a Call 112 dialer hand-off, and carries the disclaimer in the sheet and in the Terms draft. Still open: the first-ride safety screen, the motion lock, and push delivery.

### E8. Legal pages & links

- In-app links (Settings + signup): Privacy Policy, Terms, Community Guidelines, Account Deletion, Grievance contact, Licenses.
- Drafts in `docs/legal/drafts/` generated from `data-inventory.md` **\[LAWYER\]** — placeholders for entity name, address, grievance officer.
- Open-source licenses screen generated in CI from dependency metadata; flag any GPL/AGPL dependency.

> **Current state (Phase 0):** Terms and Privacy links appear on sign-in only. There are no Settings links and no licences screen.
> There was no CI: `.eas/workflows/` only runs EAS builds. **Update (2026-09-30):** CI exists (`.github/workflows/ci.yml`); the licences screen still needs its step.
>
> **Update (2026-09-29):** draft Privacy Policy and Terms are live in the app at `/privacy` and `/terms` (also throttlebase.in once `main` deploys), linked from sign-in and Settings. The text lives in `client/src/core/legal/`, and `docs/legal/drafts/` is generated from it. Still open: placeholders and legal review, Community Guidelines, deletion page, grievance screen, licences.

### E9. Store configuration

- `app.config.ts`: `ios.privacyManifests` (required-reason APIs + collected data types, merged with library manifests),
  `ios.config.usesNonExemptEncryption: false` (if only standard TLS), permission strings, blocked permissions.
- Verify generated Android `targetSdkVersion` is 36.
- Produce `docs/launch-readiness/store-forms.md`: prefilled answers for Play Data Safety, Apple App Privacy labels,
  foreground-service declaration text, background-location declaration text (if needed), reviewer demo account steps.

> **Current state (Phase 0):** Android targetSdk is 36 ✅. `ios.privacyManifests`, `usesNonExemptEncryption` and `blockedPermissions` are unset.
> Microphone, camera and photos strings are generic defaults. Inventory §3.

### E10. Security hardening

- Authorization tests for every resource route (user A cannot read/modify user B's private rides, traces, tickets, sessions).
- Rate limiting on auth, report, post/comment, and deletion endpoints.
- JWT: short-lived access token + rotating refresh token; "sign out all sessions".
- Log redaction: no coordinates, tokens, or emails in logs.
- Admin actions audit log table.
- Add a secret scanner (e.g. gitleaks) to CI; list any secrets found in git history for manual rotation.
- Swagger disabled in production.
- `docs/launch-readiness/incident-response.md`: CERT-In 6-hour report, user notification, DPDP Board 72-hour report, key rotation.

> **Current state (Phase 0):**
>
> - **Already done:** 15-minute ES256 access token, 30-day rotating refresh families, `POST /auth/logout-all`, Swagger fail-closed.
> - **Not in the list above, still missing:** RLS enforcement. The API connects as `postgres`, so the policies in migrations 027–028 are bypassed.
> - **Rate limits** cover only email-code sign-in and the maps proxy.
> - **Logs:** the email and push stubs log email addresses and tokens.
> - **Secret in git history:** a Google Maps API key in commits `b5cfb62`, `c563109`, `891fcab`; rotate it or confirm it is restricted.
> - **Gaps:** no audit log and no CI.
>
> **Update (2026-09-30):** `security_events` exists (migration 043) and records every moderation action with the moderator, the rider, the target and the reason. Auth events follow with the logging work (D10).
>
> **Update (2026-09-30):** CI runs typecheck, lint, boundaries, unit and PostGIS integration tests for both packages, a migration check, and gitleaks over the full history on every PR and push to `dev`/`main`. The full-history scan found only the three already-known items (the dead Maps key in two commits, and a PEM header string), listed with reasons in `.gitleaksignore`. Rulesets on `dev` and `main` now require a PR, a green `Server`, `Client` and `Secret scan` run on a branch that is up to date with its base, and block force-pushes and deletion.
>
> See **D5**; inventory §7, §9 E10.

### E11. Retention jobs (worker)

- Scheduled jobs: purge expired live-session data, purge soft-deleted content after 180 days,
  purge security logs after retention window, expire stale sessions.
- Retention values in one config file, documented in `data-inventory.md`.

> **Current state (Phase 0):** the only purges are expired or revoked sessions (hourly) and riders 30 days after deletion.
> Live samples, events, incidents, notifications, `login_activity`, `email_otps` and `jobs` are kept forever. Inventory §8.
>
> **Update (2026-09-30):** the hourly cleanup also purges finished jobs (#51) and posts, comments and routes a moderator removed more than 180 days ago (`REMOVED_CONTENT_RETENTION_DAYS`, `server/src/core/moderation/actions.ts`).

---

## Decisions from Phase 0

Decided 2026-09-29 by the project owner. Each decision has an implementation plan in [`plans/`](plans/README.md). Where a decision changes an epic's scope, the change is noted here and the requirement bullets above are read together with it.

| # | Topic | Decision | Plan |
| --- | --- | --- | --- |
| D1 | Deletion semantics (E1) | Delete **only the leaving rider's** data. Keep a tombstone `riders` row with no personal data, stop the 30-day hard delete and its cascade, and purge the rider's own rows explicitly. Upcoming captained rides transfer to a co-captain or are cancelled; completed ones stay with captain "Deleted rider". Content is deleted, not re-attributed | [account-deletion.md](plans/account-deletion.md) |
| D2 | "Ephemeral" live positions (E5) | **Access** expires, not the rider's own data. `last_location` is cleared at finish; after the ride only the rider can see their exact track; old raw samples are optionally thinned | [live-positions.md](plans/live-positions.md) |
| D3 | Consent model (E6) | New purpose-based, append-only consent ledger (`consent_notices`, `consent_events`, `consent_state`) plus `rider_declarations` for 18+. `rider_consents` stays as Terms/Privacy acceptance | [consent.md](plans/consent.md) |
| D4 | Push tokens (E1, E7) | None exist until push ships. When push is built, tokens live in a per-device table and are deleted on logout, account deletion, and provider "unregistered" responses | [account-deletion.md](plans/account-deletion.md) |
| D5 | E10 scope | **RLS enforcement is added to E10.** Close the Supabase Data API surface, route all queries through `withRiderTransaction`, give the worker its own role, connect as `throttlebase_app`, then replace the transitional policies. JWT rotation and sign-out-all are already done | [rls-enforcement.md](plans/rls-enforcement.md) |
| D6 | Sign in with Apple (E2) | **Deferred until the iOS release.** Launch is Android-first, and Apple 4.8 applies only to App Store builds. The strip plugin stays until then | — |
| D7 | Background location (E4) | Location in the background **only while the rider's ride is under way**, via a foreground service started in the foreground. No "Always" / `ACCESS_BACKGROUND_LOCATION`. Fix the socket's stale-token reconnect, and show riders who go quiet as greyed-out markers instead of removing them | [background-location.md](plans/background-location.md) |
| D8 | Safety flow (E7) | "Alert my group" to all participants with live location, a **Call 112** hand-off (dialer, rider-initiated), and a not-an-emergency-service disclaimer. No SOS wording and no auto-dialling or crash detection | [safety-flow.md](plans/safety-flow.md) |
| D9 | Feed media (E3, E4, E9) | First-party photo and video uploads: re-encoded with all metadata stripped (incl. GPS), served only from our own domain, with CSAM hash checks and takedown. External image URLs are removed from the API. Library access via the **system photo picker**, which needs no storage or photo permission; camera and microphone only if in-app capture ships; no background audio, fetch or media-playback service | [media-uploads.md](plans/media-uploads.md) |
| D10 | Logging (E10, E11) | Structured, redacted logging (pino), request IDs, a `security_events` table (which is also the admin audit log), and 180-day retention in India. The production notification stub's email and token log lines are removed | [logging.md](plans/logging.md) |
| D11 | Sensitive profile fields (E5) | Email, phone, weight, home point and identities are **never** shown to other riders, whatever the profile visibility. Other riders get an allowlist DTO; visibility settings are enforced; the meeting point never reveals a home | [privacy-defaults.md](plans/privacy-defaults.md) |
| — | Leaked Maps key | Verified dead on 2026-09-29: the key from commits `b5cfb62`, `c563109` and `891fcab` returns `REQUEST_DENIED — API project not found`. No history rewrite needed. Still confirm the shipped Android key is restricted to the package and signing fingerprint | — |

---

## Phase 2 — Monetization scaffolding (P2, no payments yet)

- `users.plan` (`free | pro`) + `entitlements` service + `requireEntitlement('feature')` middleware; client hook `useEntitlement`.
- `organizer` role and organization/club model (owner, admins, members).
- Ride fields for paid rides (disabled behind feature flag): `price_minor`, `currency`, `capacity`, `waitlist`,
  `refund_policy`, `organizer_id`. No payment integration yet.
- Analytics events for retention/funnel (ride started/completed, group joined, ride created) — privacy-safe, no raw coordinates.
- Note in docs: digital features → store billing; real-world tickets/tours → external gateway (Razorpay/Cashfree split settlement).

---

## Out of scope for the agent (human decisions)

- Final legal text, liability caps, organizer terms **\[LAWYER\]**
- Company formation, trademark filing, D-U-N-S, developer account migration
- Hosting region changes, log storage location in India, DPAs with vendors
- Pricing, payment gateway onboarding, GST/TCS setup **\[CA\]**

## Definition of done (per epic)

- Tests pass; new tests cover the behavior.
- `data-inventory.md` and `store-forms.md` updated if data/permissions changed.
- PR description lists user-visible changes and any manual steps (env vars, store console, infra).
