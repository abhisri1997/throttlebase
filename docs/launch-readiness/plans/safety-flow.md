# Plan — Rider safety flow (E7)

**Decision (2026-09-29).**
- The safety flow is a **group alert with a hand-off to 112**. It is never described as SOS or as an emergency service.
- No Indian law requires an app to provide an emergency feature. The exposure is implying help we cannot guarantee:
  - misleading claims under the Consumer Protection Act 2019;
  - negligence;
  - Apple 5.1.5 ("location-based APIs shouldn't be used to provide emergency services");
  - Play's review of misleading functionality.

  So the must-haves are honesty, a real hand-off, and making sure the alert actually reaches the group. ⚖️

## Today

- **Button.** A button labelled **"SOS"** on ride detail (`client/app/ride/[id].tsx:860-884`, `:1976-1984`).
- **Data.** It creates a critical `ride_live_incidents` row with `kind='sos'` and the location if available, and broadcasts it to the ride room (`server/src/services/live-session.service.ts:803-843`).
- **Escalation.** After 120 s unacknowledged, the captain and co-captains get an in-app notification (`server/src/workers/processors/live-ops.processor.ts:16-40`).
- **Missing.** There is no push, no 112 hand-off, and no disclaimer.

## Build — required for launch

1. **Rename everywhere.**
   - UI copy: "Alert my group". The confirmation reads "Send an alert with your location to everyone on this ride?".
   - Data: add `kind = 'group_alert'` and migrate the existing `'sos'` rows. The migration is additive: widen the CHECK, backfill, then narrow in a later release.
   - Client types in `liveSessionSocket.ts` / `liveSessionStore.ts`.
2. **Call 112.**
   - The alert sheet has a second, equally large button, "Call 112 (emergency)". It opens the dialer with `tel:112` via `Linking.openURL`.
   - The rider places the call. The app never dials automatically and never claims to contact services.
3. **Send the alert to the whole group, not just the leaders.**
   - Broadcast immediately to all confirmed participants, with a live location that keeps updating while the alert is open.
   - Keep "acknowledged by X" and "resolved".
   - Every participant sees a full-screen banner with **Navigate to rider** (in-app navigation or `react-native-map-link`).
4. **Push delivery once push exists.** Alerts go out as high-priority pushes that ignore per-type notification preferences. This is a safety message, not marketing. Until push lands, the in-app escalation stays.
5. **Disclaimer, in three places:**
   - the first-ride safety screen (E7);
   - the alert sheet;
   - the Terms. ⚖️

   Draft: "ThrottleBase alerts the riders in your group. It is not an emergency service and does not contact police, ambulance or fire services. In an emergency, call 112. Alerts need network coverage and may be delayed."
6. **Operable while moving.**
   - Reachable in one tap from ride detail and full-screen navigation.
   - A target of at least 64 dp.
   - No typing.
   - The same component is exempt from the "no modals while moving" rule (E7).

## Build — soon after launch

7. **Emergency contact (opt-in).**
   - The rider saves one contact.
   - When the rider sends an alert, the app opens a **prefilled SMS / share sheet**: "I've sent an alert on ThrottleBase. My location: <maps link>". The rider presses Send.
   - Consent: record `emergency_contact_sharing` consent ([consent.md](consent.md)).
   - Legal basis: DPDP s.7(f) (medical emergency) may also apply. ⚖️
   - Data: store the contact's name and number encrypted at rest, visible only to the rider, and deleted with the account.

## Do not build now

- Automatic crash or fall detection. False positives and false negatives both create reliance and liability.
- Any copy promising help, rescue, or response times.
- Automatic SMS or calls without the rider's tap.

## Test

- Unit: renamed kinds, the recipient list covering all confirmed participants, and escalation that skips the reporter.
- Integration: alert → broadcast → acknowledge → resolve; migrated rows readable by old and new clients during rollout.
- Manual: the `tel:112` intent opens the dialer with 112 on Android and iOS; the disclaimer appears on first ride and in the sheet.

## Docs to update

- `data-inventory.md` §5.
- Terms draft ([LAWYER]).
- `store-forms.md` (describe the feature as a group alert).
