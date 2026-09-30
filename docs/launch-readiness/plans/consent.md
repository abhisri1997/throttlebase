# Plan — Purpose-based consent ledger and age gate (E6, D3)

**Decision (2026-09-29):**
- Build a **new** purpose-based consent ledger.
- Keep `rider_consents` (mig 023) as the record of **Terms and Privacy Policy acceptance**. Do not extend it.

**Status (2026-09-30):** the server ledger is built (migration 045). Differences from the model below:
- `emergency_contact_sharing` is left out until emergency contacts exist.
- `ip` is not stored on `consent_events` until counsel asks for it.
- `consent_notices` keeps the full `body` rather than a `body_url`.
- `rider_declarations` records an `answer` (yes or no), not only a declaration.

**Riders never asked (decided 2026-09-30, option B):** riders who signed up before consent was asked for keep today's behaviour for each purpose until the app asks them on next use (`ALLOWED_WHEN_NOT_ASKED`, `server/src/core/consent/state.ts`). An explicit no, a withdrawal, or a grant of an older notice switches the feature off at once. `marketing_notifications` is opt-in only.

**In the app (PR 3):**
- **The 18+ question** is asked at launch before anything else, onboarding included, of new riders and of riders who signed up before it existed. A "no" leads only to the under-18 screen: delete the account, contact the Grievance Officer if it was a mistake, or sign out. If the answer can't be fetched (no signal) the rider is let in and asked on a later launch.
- **Purpose consents are asked just in time, not as a block at onboarding.** Just before a ride's tracking starts, the rider is asked about `live_location_sharing`, `ride_recording` and `motion_activity` when never asked or when the notice changed. Sharing and recording start switched on, because that is the ride they are starting; motion starts off. ⚖️ A "Not now" records nothing and doesn't ask again for that ride, so no signal mid-ride never blocks the rider. A rider who said no isn't asked again on every ride.
- **Settings → Security & Privacy → Privacy choices:** every purpose with its notice and a switch. One tap withdraws.
- **Withdrawal:** tracking stops (`consent:withdrawn`), the motion sensors aren't read without `motion_activity`, and a rider who withdrew disappears from the others' maps (`locationWithdrawn`).
- `public_profile` and `marketing_notifications` are set only in Settings until they gate something.

**Gates built (PR 2):** `location:update` needs `live_location_sharing`, is recorded only with `ride_recording`, and uses `activity` only with `motion_activity`. **Planned change (Ride now, [ride-now-ux.md §7.3](../../ride-now-ux.md#73-consent-split)):** refuse only when both `live_location_sharing` and `ride_recording` are off; record with `ride_recording`, broadcast with `live_location_sharing`, so a rider alone can record without sharing. Withdrawing `live_location_sharing` clears the rider's position in live rides and takes them out of the live rooms. Samples already recorded are kept: withdrawal stops future processing and is not erasure (account deletion is). The `public_profile` gate waits for profile visibility to be enforced at all (E5, D11): today other riders see the same allowlisted fields whatever the setting.

## Why two records, not one

- **Terms acceptance is a contract.** DPDP consent must be "free, specific, informed, unconditional and unambiguous", for a specified purpose (DPDP Act s.6(1)). It cannot be bundled into accepting the Terms: a single "I agree" to the Terms is not valid consent for, say, live location sharing.
- Consent must be **per purpose**, preceded by an **itemised notice** (DPDP Rules, Rule 3), and **withdrawable as easily as given** (s.6(4)).
- The Data Fiduciary must be able to **prove** that notice was given and consent obtained (s.6(10)). That needs an append-only history with the exact notice version shown, not a mutable flag.
- **Consent Managers** (Rule 4, registration from 13 Nov 2026) will need to read and change consent state per purpose. A purpose-keyed ledger maps onto that directly.
- Mixing contract acceptance and purpose consents in one table blurs two different legal bases. ⚖️ Counsel should confirm the purpose list and which features can rest on "legitimate uses" (s.7) instead of consent.

## Data model (additive migrations)

```
consent_purposes          -- reference list
  code TEXT PK            -- 'ride_recording' | 'live_location_sharing' | 'motion_activity'
                          -- | 'public_profile' | 'marketing_notifications' | 'emergency_contact_sharing'
  description TEXT
  required_for TEXT[]     -- features gated by this purpose (documentation, not enforcement)

consent_notices           -- every notice version ever shown
  id UUID PK
  purpose_code TEXT FK
  version TEXT            -- e.g. '2026-10-01'
  locale TEXT             -- 'en-IN', later 'hi-IN', …
  body_sha256 TEXT        -- hash of the exact rendered text shown
  body_url TEXT           -- archived copy of that text
  published_at, retired_at TIMESTAMPTZ
  UNIQUE (purpose_code, version, locale)

consent_events            -- append-only; no UPDATE/DELETE grants for the app role
  id UUID PK
  rider_id UUID           -- FK riders (tombstone survives account deletion)
  purpose_code TEXT
  notice_id UUID FK
  action TEXT             -- 'granted' | 'withdrawn'
  source TEXT             -- 'onboarding' | 'contextual' | 'settings' | 'consent_manager' | 'system'
  app_version TEXT, platform TEXT
  ip INET NULL            -- only if counsel says it is needed as evidence ⚖️
  occurred_at TIMESTAMPTZ DEFAULT now()

consent_state             -- current answer per rider and purpose, derived (view or table maintained in the same transaction)
  rider_id, purpose_code, granted BOOLEAN, notice_id, updated_at
  PK (rider_id, purpose_code)

rider_declarations        -- attestations, not consents
  rider_id, kind ('age_18_plus'), declared_at, source, app_version
```

`rider_consents` stays as is: terms version, privacy version and IP at acceptance.

## Behaviour

- **Onboarding.** After sign-in and before the app opens:
  1. An **18+ declaration**: "I confirm I am 18 or older". Anyone who says no is blocked and the account is flagged for deletion. If the rider later tells support they are under 18, the account is deleted.
  2. Terms and Privacy acceptance, as today (`rider_consents`).
  3. Purpose consents, each with its own notice and toggle, all **off** by default except where the feature cannot work at all without it and the rider is starting that feature.
- **Contextual prompts.**
  - First ride start: `ride_recording` + `live_location_sharing` (together with the disclosure screen in [background-location.md](background-location.md)).
  - First motion prompt: `motion_activity`.
  - Making the profile public: `public_profile`.
- **Enforcement.**
  - Server: a `requireConsent(purpose)` check in `core/`, used by:
    - `location:update` (needs `live_location_sharing`, plus `ride_recording` to persist samples);
    - motion `activity` on samples (needs `motion_activity`; otherwise the server drops the field);
    - public profile reads (needs `public_profile`; otherwise the profile is treated as private);
    - marketing sends.
  - Client: the same gates hide or disable UI.
- **Withdrawal.** Settings → Privacy → per-purpose toggles, one tap each. Withdrawing has an immediate effect:
  - `live_location_sharing` → stop tracking, leave live rooms, clear `last_location`;
  - `ride_recording` → stop persisting samples;
  - `public_profile` → profile becomes private;
  - `marketing_notifications` → suppress;
  - every withdrawal is logged in `security_events`.
- **Notice version bump.** Publishing a new notice for a purpose marks affected riders "re-consent required". The feature stays off until they accept the new notice.
- **After account deletion.** Keep `consent_events` rows linked only to the tombstone ID for the proof period (proposed 3 years, the general limitation period; counsel to confirm), then purge. ⚖️
- **Consent Managers.** Put the ledger behind a service interface, so a future Consent Manager integration writes `source = 'consent_manager'` events through the same path.

## Test

- Unit: state derivation from events; re-consent after a version bump; each gate refuses without consent.
- Integration: a withdrawal stops `location:update` persistence within one request; there is no path that updates or deletes `consent_events` as the app role.
- Onboarding: a no-18+ answer blocks entry; a withdrawal takes one tap from Settings.

## Docs to update

- `data-inventory.md` §1.1 (new tables).
- Privacy Policy notice texts, one per purpose, in `docs/legal/drafts/`. ⚖️
