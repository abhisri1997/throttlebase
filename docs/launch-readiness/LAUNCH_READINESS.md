# ThrottleBase — Launch Readiness Spec (for Claude Code)

> Source: compliance research (India DPDP Act/Rules 2025, IT Rules 2021 + 2026 amendment, CERT-In 2022,
> Google Play + Apple App Store policies) and monetization planning. Full report: `docs/launch-readiness/compliance-report.md`.
> Not legal advice. Anything marked **\[LAWYER\]** must not be finalized by the agent.

## Context

- Monorepo: `server/` (Node 22, TypeScript, Express 5, PostgreSQL + PostGIS, Socket.IO `/live`, DB-backed queue + worker)
  and `client/` (Expo SDK 57, React Native, Expo Router, Zustand, TanStack Query).
- Hosting: Railway (API/worker), Neon (Postgres), Cloudflare DNS. Domains: `throttlebase.in`, `api.throttlebase.in`.
- Auth: Google + Apple sign-in → server-issued JWT. Roles on token (admin).
- Launch target: **India-only**, both stores, **18+ only**.

## Rules for the agent

1. Start with **Phase 0** and stop for review before changing code.
2. One branch + PR per epic. Small, reviewable commits. Tests for every behavior change.
3. Migrations must be additive/reversible. Ask before any migration that drops or rewrites data.
4. Never commit secrets. Never modify Railway/Neon/Cloudflare/EAS settings — list required changes instead.
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

### E2. Sign in with Apple in production (Apple 4.8)

- The config plugin that strips the Apple sign-in entitlement must apply **only** to dev/free-account EAS profiles.
- Production and preview iOS builds must include Sign in with Apple. Add a check (script or CI) that fails if it's missing.

### E3. UGC safety (Apple 1.2, Google UGC policy, IT Rules 2021)

- `reports` table + `POST /reports` for posts, comments, users, groups, rides.
- Block user: hide their content everywhere (feed, comments, mentions, groups, ride rooms, notifications); prevent interaction.
- Basic objectionable-content filter on post/comment create (word list, pluggable).
- Admin moderation queue: list reports, take down content, suspend users, record reason.
- Removed content: soft-delete + preserve 180 days, then purge (worker job).
- Grievance tracking: acknowledgement timestamp, resolution timestamp (targets: ack 24h, resolve 7 days).
- In-app "Contact / Grievance Officer" screen with name, email, address placeholders.

### E4. Location & ride recording

- Prefer **foreground service** (Android `foregroundServiceType="location"`, persistent notification) started by the user
  over `ACCESS_BACKGROUND_LOCATION`. Only request background location if Phase 0 proves it's required.
- Prominent disclosure screen **before** the OS permission prompt (what, why, when it stops).
- Tracking must stop when a ride ends, the app is killed by the user, or the user leaves a live session.
- iOS: accurate `NSLocationWhenInUseUsageDescription` / `NSLocationAlwaysAndWhenInUseUsageDescription`;
  `UIBackgroundModes: ["location"]` only if needed.
- Use `android.blockedPermissions` to remove anything unused.

### E5. Location privacy defaults

- Privacy zones: hide first/last ~500 m of any shared/public route by default; user-configurable home/work zones.
- Visibility setting per ride/route: private (default) / followers / public.
- Live-session positions are ephemeral: not persisted beyond session end (or TTL ≤ 24h). Only the user's own recorded ride is kept.
- Public views never expose raw precise coordinates of start/end points.

### E6. Consent & age gate (DPDP)

- `consents` table: `user_id, purpose, notice_version, granted_at, withdrawn_at, source`.
- Purposes: `ride_recording`, `live_location_sharing`, `public_profile`, `marketing_notifications`.
- Consent screens at onboarding and contextually (first ride, first live session). Withdrawal in Settings, as easy as granting.
- 18+ confirmation at signup (DOB or explicit confirmation). Block and flag under-18 accounts.
- `notice_version` bump forces re-consent.

### E7. Rider safety UX

- First-ride safety disclaimer (don't use the phone while riding; data is approximate; not an emergency service; call 112).
- While a ride is active and moving above a threshold: no modals/interstitials; non-essential interactions disabled.
- Remove or avoid any speed-based leaderboard, badge, or challenge. Rank by distance, streaks, attendance, exploration.
- Rename/label the safety flow so it is never described as SOS or an emergency service.

### E8. Legal pages & links

- In-app links (Settings + signup): Privacy Policy, Terms, Community Guidelines, Account Deletion, Grievance contact, Licenses.
- Drafts in `docs/legal/drafts/` generated from `data-inventory.md` **\[LAWYER\]** — placeholders for entity name, address, grievance officer.
- Open-source licenses screen generated in CI from dependency metadata; flag any GPL/AGPL dependency.

### E9. Store configuration

- `app.config.ts`: `ios.privacyManifests` (required-reason APIs + collected data types, merged with library manifests),
  `ios.config.usesNonExemptEncryption: false` (if only standard TLS), permission strings, blocked permissions.
- Verify generated Android `targetSdkVersion` is 36.
- Produce `docs/launch-readiness/store-forms.md`: prefilled answers for Play Data Safety, Apple App Privacy labels,
  foreground-service declaration text, background-location declaration text (if needed), reviewer demo account steps.

### E10. Security hardening

- Authorization tests for every resource route (user A cannot read/modify user B's private rides, traces, tickets, sessions).
- Rate limiting on auth, report, post/comment, and deletion endpoints.
- JWT: short-lived access token + rotating refresh token; "sign out all sessions".
- Log redaction: no coordinates, tokens, or emails in logs.
- Admin actions audit log table.
- Add a secret scanner (e.g. gitleaks) to CI; list any secrets found in git history for manual rotation.
- Swagger disabled in production.
- `docs/launch-readiness/incident-response.md`: CERT-In 6-hour report, user notification, DPDP Board 72-hour report, key rotation.

### E11. Retention jobs (worker)

- Scheduled jobs: purge expired live-session data, purge soft-deleted content after 180 days,
  purge security logs after retention window, expire stale sessions.
- Retention values in one config file, documented in `data-inventory.md`.

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
