# Launch-readiness plans

These are implementation plans for the Phase 1 epics. They are written after the Phase 0 audit ([`../data-inventory.md`](../data-inventory.md)) and the decisions recorded in [`../LAUNCH_READINESS.md`](../LAUNCH_READINESS.md#decisions-from-phase-0) on 2026-09-29.

Each plan says what exists today, what to build, in what order, and how to test it. Items marked ⚖️ need a lawyer's review before they ship. Plans are not legal text.

| Plan | Epics | Decision |
| --- | --- | --- |
| [background-location.md](background-location.md) | E4 | Location in the background only during an active ride, via a foreground service; no "Always" permission |
| [safety-flow.md](safety-flow.md) | E7 | "Alert my group" plus a Call 112 hand-off and a disclaimer; never called SOS |
| [media-uploads.md](media-uploads.md) | E3, E4, E9 | First-party uploads with metadata stripped and served from our own domain; no external image URLs |
| [logging.md](logging.md) | E10, E11 | Structured, redacted logs, a security-event table, and 180-day retention in India |
| [account-deletion.md](account-deletion.md) | E1, E11 | Delete only the leaving rider's data, never other riders' |
| [live-positions.md](live-positions.md) | E5 | Access to live positions expires; the rider's own track is kept (D2) |
| [consent.md](consent.md) | E6 | New purpose-based consent ledger; `rider_consents` stays for Terms acceptance |
| [rls-enforcement.md](rls-enforcement.md) | E10 | Close the Supabase Data API surface, then move the API off `postgres` onto `throttlebase_app` |
| [privacy-defaults.md](privacy-defaults.md) | E5 | Sensitive fields are never public; profile fields go through an allowlist |
| [ugc-safety.md](ugc-safety.md) | E3 | Two-way blocking, reports and a word filter, a moderation queue with 180-day retention, and grievance tracking |

When a plan ships, update `data-inventory.md` in the same PR.
