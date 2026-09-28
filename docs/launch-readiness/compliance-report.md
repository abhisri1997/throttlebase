# ThrottleBase Pre-Launch Compliance Report: Legal Documents, India & Global Regulation, App Store Rules, Security

ThrottleBase is not a simple ride logger in legal terms: the repo shows a social, location-centric platform (GPS trace ingestion, live group ride rooms, posts/comments/groups/follows, leaderboards, a "safety flow", Google/Apple sign-in), which makes you a Data Fiduciary under India's DPDP Act, an intermediary under the IT Rules because you host user content, and a "background location + UGC" app under both store policies, so your launch-blocking work is (1) a code-accurate privacy policy and Terms, (2) working in-app and web account deletion, (3) UGC moderation tooling, and (4) a correct background-location/foreground-service setup, with full DPDP substantive obligations becoming enforceable on 13 May 2027.

*This is research, not legal advice. Items marked ⚖️ should be reviewed by an Indian technology/privacy lawyer before launch.*

*Hosting update (2026-09-28): the database moved from Neon to Supabase, project region `ap-south-1` (Mumbai). Hosting facts below are updated to match; the legal analysis is unchanged.*

*Code verification (2026-09-28): the Phase 0 audit checked every row of the §1 inventory against the code at `dev` `2eebfa0`. Rows previously marked Inferred or Unknown now say what the code does, and the full table-by-table inventory is in [`data-inventory.md`](data-inventory.md). Only facts changed; the legal analysis is unchanged.*

## TL;DR

- **Your real legal exposure comes from three features: continuous GPS/location traces, live location sharing in group rides, and user-generated content.** Each triggers specific obligations (DPDP notice/consent/security, IT Rules grievance officer and takedown clocks, Apple Guideline 1.2 and Google UGC policy, background-location declarations). Ride-risk liability (accidents, route guidance, "safety flow") is the other big exposure and is handled through Terms, disclaimers and product design, not a single waiver.
- **India first:** the DPDP Rules 2025 (notified 13 November 2025) phase in over 18 months — the Board is live now, Consent Manager registration opens 13 November 2026, and notice, consent, security safeguards, 72-hour breach reporting, children's consent and rights obligations apply from 13 May 2027. Build to that standard now, because you already need it for app store review, CERT-In's 6-hour incident reporting and IT Rules grievance handling, which are in force today.
- **Store blockers:** Google Play needs a Data Safety form, in-app plus web account deletion, a background-location declaration with video, foreground-service type declarations, target API 36 (required since 31 August 2026), and, if you use a personal account created after 13 November 2023, a 12-tester/14-day closed test. Apple needs privacy labels, a privacy manifest, in-app account deletion, UGC moderation (report/block/filter/contact), and an equivalent privacy-preserving login alongside Google Sign-In (practically, Sign in with Apple — which your repo currently strips from every build, pending the paid Apple Developer membership).

## Mental Model: How to Think About App Compliance

Treat compliance as four stacked layers, each of which can independently block or sink you:

1. **Data layer (privacy law):** What personal data do you touch, why, where does it go, how long do you keep it, and can the user see/fix/delete it? Law: DPDP Act/Rules (India), GDPR (EU/UK), US state laws. Everything flows from an accurate **data inventory**.
2. **Content layer (platform/intermediary law):** Because users post content visible to others, you are an intermediary. Law: IT Act s.79 safe harbour and IT Rules 2021 (as amended). Tools: Community Guidelines, report/block, grievance officer, takedown process.
3. **Activity-risk layer (tort/consumer law):** People ride motorcycles while your app runs. Tools: Terms of Service, safety disclaimers, limitation of liability, product design (no interaction while moving), honest marketing.
4. **Distribution layer (store contracts):** Apple and Google are private regulators with faster enforcement than any government. Their rules effectively force the privacy and content work anyway.

Rule of thumb: **the privacy policy must describe the code, not the other way round.** Every SDK, table, and API endpoint should map to a line in your data inventory, a line in your privacy policy, and a checkbox in the store privacy forms. Mismatches between these three are the most common cause of rejection and the most common source of regulatory liability.

## 1. Repo-Specific Data Inventory

**Source (updated 2026-09-28):** this section was first written from the README and PR commit messages only. It has since been verified against the migrations, `client/package.json`, `client/app.config.ts`, the generated Android manifest and iOS Info.plist, and the server code. Status values are now **Confirmed** (present in code) or **Absent** (verified not present). [`data-inventory.md`](data-inventory.md) is the source of truth for the privacy policy and store forms; if it and this table disagree, the inventory wins.

### What the app is

The README describes ThrottleBase as "a mobile-first rider platform where users can create and join rides, share routes, track ride history, and interact with a community." Stack: Node.js 22+/TypeScript/Express 5 server, PostgreSQL + PostGIS, Expo/React Native client (Expo Router, Zustand, TanStack Query), Socket.IO realtime on a `/live` namespace, and a DB-backed queue with a worker process. Production domains are `throttlebase.in` and `api.throttlebase.in`; hosting is Supabase (PostgreSQL, `ap-south-1` Mumbai; previously Neon) and Railway (Node.js), with Cloudflare DNS. PR #8 upgraded Expo SDK 54 → 57 and React Native 0.81.5 → 0.86.3.

### Data inventory table

| Data / feature | Status | Evidence (code) | Legal/store significance |
| --- | --- | --- | --- |
| **Account & authentication**: Google sign-in, email one-time code, Apple (built but off); server-issued ES256 access JWT + rotating refresh token | Confirmed | `server/src/adapters/http/authRoutes.ts` (`/auth/google`, `/auth/email/*`, `/auth/apple`); `rider_identities` (mig 023). The Apple entitlement is stripped in every build (`client/plugins/with-no-apple-signin.js`) | Name, email, provider IDs = personal data. Google login triggers the Apple Guideline 4.8 equivalent-login requirement, and **Apple sign-in is not yet available in any build**. Email codes add an email provider as a processor. |
| **2FA** | Removed | Mig 024 dropped password and TOTP columns | Don't advertise 2FA anywhere. |
| **Login activity, session management** | Confirmed | `login_activity` (IP, device fingerprint; never purged), `sessions` (IP, user agent; revoked rows purged hourly), `email_otps` (email, IP; never purged). The screens sit behind flag `FEATURE_ACCOUNT_SECURITY`, which is off in the beta | IP addresses, device/session identifiers, timestamps = personal data; also your security logs (CERT-In/DPDP log retention). Needs a retention window. |
| **Precise GPS location & ride traces** | Confirmed | `ride_live_location_samples` (lat/lng every ~5 s while riding) is the ride record, kept indefinitely. Planned points live in `rides`, `routes`, `route_stops`, `ride_stops` | Highest-risk data category. Reveals home/work, routines. Store "Precise location" disclosures; DPDP purpose limitation and security safeguards. |
| **Background location** | Confirmed requested; **not required** | Android `ACCESS_BACKGROUND_LOCATION` and iOS "Always" are requested each ride (`client/src/services/backgroundLocationService.ts:124`). Recording already runs as an expo-location foreground service (`foregroundServiceType=location`), which needs only foreground permission. See inventory §4 | If removed after device testing: no Play background-location declaration or video, and no "Always" prompt. The foreground-service declaration (type `location`) is still required. |
| **Speed/telemetry** | Confirmed | Per sample: speed, heading, accuracy, **motion activity** (walking/automotive…; mig 036). Per ride: avg/max speed (`ride_history_stats`). No altitude is sent | Speed data is legally sensitive: evidence of speeding, insurer interest, and Apple 1.4.4 ("excessive speed"). Motion activity needs its own disclosure (iOS Motion, Android Activity Recognition). |
| **Live group sessions / real-time location sharing** | Confirmed | Socket.IO `/live` `location:update`; visible to ride participants; last position kept in `ride_live_presence` | Location shared with other users in real time — needs explicit, separate consent, visibility controls, and an obvious "stop sharing". |
| **"Safety flow"** | Confirmed: an in-app **"SOS"** button | Creates a critical `ride_live_incidents` row (`kind='sos'`, optional location) and broadcasts it to the ride room. It escalates in-app to captain and co-captains after 120 s. There is no push, SMS, 112 hand-off or disclaimer (inventory §5) | Apple 5.1.5 says location APIs "shouldn't be used to provide emergency services". The label must change and the feature must be disclaimed as best-effort, never a substitute for emergency services. ⚖️ |
| **Community UGC** — posts, comments, likes, follows, groups, ride reviews, road feedback, mentions | Confirmed | Mig 005, 035. Groups sit behind flag `FEATURE_GROUPS`, off in the beta. Block exists but only filters notifications; there is no report, filter or moderation queue | Makes you an intermediary (IT Rules 2021), Apple 1.2 UGC requirements, Google UGC policy, Community Guidelines needed. |
| **Shared routes & bookmarks** | Confirmed | `routes` (default private), `route_shares`, `route_bookmarks`. Rides default **public** (mig 003) | Shared routes can reveal start/end points (home). Default privacy zones recommended. |
| **Badges, achievements, leaderboard** | Confirmed; behind flag `FEATURE_RANK` (off) | The leaderboard ranks by badges, rides or distance. **No speed ranking**, but `leaderboard_opt_in` is ignored | Leaderboards based on speed/time invite reckless riding claims; avoid speed-based rankings. |
| **Notifications** (preferences, fanout) | Confirmed: **in-app only** | Push and email delivery are stubs; there is no device-token storage and no push SDK (`notification-delivery.processor.ts`) | Nothing to disclose for push until a provider lands. Then: device push tokens = identifiers; disclose. Marketing pushes need opt-in (Apple 4.5.4). |
| **Support tickets / admin triage** | Confirmed; behind flag `FEATURE_SUPPORT` (off) | `support_tickets` (free text, external attachment URLs), `support_ticket_messages` | Support content often contains personal data; admin access must be role-restricted and logged. **No admin audit log exists.** |
| **Admin roles** | Confirmed | `rider_roles` (`admin`, `support`; mig 023), carried on the access token | Access-control evidence for "reasonable security practices". |
| **Maps** — Google Maps via `react-native-maps` 1.27, plus `react-native-map-link` | Confirmed | The Maps SDK key ships in the binary. All Directions, Places and Geocoding calls go through the server proxy, which sends rider coordinates to Google (`server/src/services/maps.service.ts`). A Google Maps key appears in git history | Google Maps Platform Terms (attribution, caching limits); Google is a recipient of location/usage data. **Rotate or restrict the key found in history.** |
| **Secure token storage** | Confirmed | Keychain/Keystore via `expo-secure-store` on mobile. The **web build stores the refresh token in localStorage** (`secureStorage.web.ts`) | Fine on mobile. If a web app ships, reconsider token storage and add a local-storage notice. |
| **Web build** | Confirmed possible (`react-native-web`); not deployed as a product | `client/package.json` | If you ship a web app on throttlebase.in, you need a cookie/local-storage notice. |
| **Photos/media uploads** | **Absent** | No upload path. Posts accept up to 10 **external image URLs** (API only; the composer is text-only) and render them. `expo-image-picker` is installed but unused, yet still adds camera and photo permissions | No EXIF stripping is needed today. External URLs leak viewers' IPs to third-party hosts and bypass moderation. Remove unused camera and photo permissions. |
| **Date of birth / age** | **Absent** | No DOB or age field; no 18+ confirmation | 18+ policy is not enforced anywhere. Determines children's-data exposure (DPDP: under 18 = child). |
| **Analytics / crash reporting** (Sentry, Firebase, etc.) | **Absent** | No analytics, crash or ad SDK in either `package.json` | Nothing to disclose today. Each SDK added later = processor to disclose, DPA to sign, privacy label entries. |
| **Unused device permissions** | Confirmed requested | Microphone (`RECORD_AUDIO`, set explicitly), media-playback foreground service, iOS `audio` and `fetch` background modes, camera, photos, storage | Store reviewers reject unused permissions. Remove with `android.blockedPermissions` / plugin config (E4, E9). |
| **Profile extras**: phone number, weight, home-like point (`riders.location_coords`) | Confirmed in schema; not set by the app | Writable via `PATCH /api/riders/me`. `location_coords` is returned on other riders' public profiles | Remove, or disclose and protect. A precise point on a public profile is a doxxing risk. |
| **Payments / subscriptions** | Absent | Not in code | If added: Apple/Google IAP rules, Consumer Protection e-commerce rules, GST. |
| **Hosting location** | Supabase `ap-south-1` (Mumbai); Railway region not recorded | `docs/project-status.md` | If servers are outside India, it's a cross-border transfer (disclose); CERT-In expects logs maintained within Indian jurisdiction. ⚖️ |

**Features that raise specific legal risk (flagged):** real-time location sharing; stored GPS traces that reveal home addresses; speed data and leaderboards; the "safety flow"; UGC (defamation, harassment, doxxing via ride meetups); group ride organisation (organiser liability if something goes wrong on a ride created through your app); and minors signing up for group rides with adult strangers.

## 2. Legal Documents You Need

### 2.1 Privacy Policy (mandatory — law and both stores)

Apple Guideline 5.1.1(i) requires a privacy policy link in App Store Connect and inside the app, and the policy must "Identify what data, if any, the app/service collects, how it collects that data, and all uses of that data", confirm third parties give equal protection, and "Explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion". The DPDP Rules additionally require a standalone, itemised notice of personal data and specific purposes, with links to withdraw consent, exercise rights and complain to the Board.

ThrottleBase-specific contents:

- Itemised data categories matching the table above (account, login/session, precise location, ride traces, speed/telemetry, live-sharing, UGC, support, device/push tokens, maps requests).
- Purpose for each category (ride recording, group coordination, social features, security, support) — no vague "improve our services" catch-alls.
- Who sees what: public profile vs followers vs group members vs private; how live location is visible only to the active ride room and for how long.
- Processors and recipients: Railway (hosting), Supabase (database), Cloudflare (DNS/network), Google (Maps Platform; Google Sign-In), Apple (Sign in with Apple, APNs), push provider, any crash/analytics SDK.
- Storage location and cross-border transfer statement.
- Retention schedule per category (see Section 6).
- Rights: access, correction, erasure, withdrawal of consent, nomination (DPDP), grievance redressal; response timelines.
- Children: minimum age and what you do if you learn a child signed up.
- Grievance Officer / contact person name and contact (required under DPDP Rule 9 and IT Rules).
- Breach notification commitment.
- Effective date and change-notification process.

### 2.2 Terms of Service / Terms of Use (mandatory in practice)

Must cover: eligibility (18+ recommended — see children below); account rules; licence to use the app; your licence to user content (non-exclusive, to host/display); acceptable use; prohibited conduct (illegal riding, street racing, harassment, sharing others' location); moderation and termination rights; ride/group event disclaimer (you are a platform, not an organiser; participants ride at own risk; organisers are responsible for their events); **safety disclaimers** (below); limitation of liability and indemnity; governing law (India) and jurisdiction (Bengaluru courts) or arbitration; grievance mechanism; changes to terms.

**Safety disclaimer and limitation of liability — motorcycle-specific:**

- Do not interact with the app while riding; set up before you ride; mount the phone securely; obey the Motor Vehicles Act. Section 184(c) of the Motor Vehicles Act penalises using handheld communication devices while driving, with a fine of ₹1,000 to ₹5,000 for a first offence.
- GPS, speed, distance and elevation are estimates; they can be inaccurate and must not be relied on for speed-limit compliance, navigation-critical decisions, or legal evidence.
- Routes shared by users and third-party map data may be wrong, outdated, closed, or dangerous; you do not verify roads.
- Leaderboards/achievements are not an encouragement to ride fast or compete on public roads.
- The "safety flow"/live-sharing is best-effort, depends on network, battery and permissions, and is **not an emergency service**; users must contact 112 in emergencies.
- Liability cap and exclusion of indirect damages, "to the maximum extent permitted by law". Under Indian law you cannot fully exclude liability for your own negligence or for death/personal injury in consumer contracts, and courts can strike down one-sided clauses as unfair contract terms under the Consumer Protection Act 2019. ⚖️ Have a lawyer calibrate this clause; the disclaimer reduces risk, product design reduces it more.

### 2.3 EULA

Apple's Standard EULA applies by default if you don't provide one; Google has no default. A separate EULA is optional — fold licence terms into your Terms of Service and reference Apple's EULA for iOS. Apple does require UGC apps to have users agree to terms that make clear there is no tolerance for objectionable content — put that in the ToS acceptance flow.

### 2.4 Community Guidelines / UGC Policy (required because you host UGC)

Plain-language rules: no harassment, hate, sexual content, doxxing (posting others' home locations/number plates without consent), promotion of illegal street racing/stunting, impersonation, spam, IP infringement. Explain reporting, blocking, enforcement tiers, and appeals. This also serves the IT Rules requirement that intermediaries publish rules users must not violate.

### 2.5 Account & Data Deletion Policy (store-required)

A short public page (on throttlebase.in) that explains how to delete in-app, how to request deletion via web without the app, what's deleted, what's retained and why (e.g., security logs for a limited period, content required by legal order), and the timeline. Google requires this URL in the Data Safety form; Apple requires in-app initiation.

### 2.6 Cookie / Tracking Notice (only if web)

If throttlebase.in serves the web app or analytics, add a cookie/local-storage notice. If you use no non-essential cookies, say so. For EU visitors, non-essential cookies need prior consent.

### 2.7 Open-Source Licence Notices

Most React Native/Expo dependencies are MIT/BSD/Apache-2.0, which require reproducing copyright and licence notices. Generate a licences screen (e.g., using a license-checker tool in CI) and scan for copyleft (GPL/AGPL) in server and client dependencies. Map data from OpenStreetMap, if ever used, is ODbL and requires "© OpenStreetMap contributors" attribution.

### 2.8 Drafting vs Generators vs Lawyers

- **Generators/templates** (Termly, iubenda, TermsFeed etc.) are fine for structure but generic; they won't know about live ride rooms, PostGIS traces or the DPDP Rules' itemised notice. Use one as a skeleton, then rewrite every data section against your inventory.
- **Draft yourself:** data inventory, retention schedule, Community Guidelines, deletion page, in-app consent copy and permission purpose strings.
- **Pay a lawyer for (⚖️):** limitation of liability/indemnity and ride-organiser clauses; the "safety flow" disclaimer; DPDP notice and consent flow review; minors policy; entity choice and trademark filing. A one-time fixed-fee review by an Indian tech-law boutique is the right-sized spend for a solo launch.

## 3. India Compliance (Primary Market)

### 3.1 DPDP Act 2023 + DPDP Rules 2025

**Status and timeline.** MeitY notified the DPDP Rules on 13 November 2025 (G.S.R. 846(E); published in the Gazette 14 November 2025) with an 18-month phased rollout:

- **13 Nov 2025:** Data Protection Board constituted; definitions and procedural provisions live.
- **13 Nov 2026:** Rule 4 — Consent Manager registration opens.
- **13 May 2027:** Rules 3 and 5–16 and the rest of the substantive obligations — notice, consent, security, breach reporting, retention, children, rights, cross-border — become enforceable.

You are a **Data Fiduciary** (you decide purposes and means). Railway, Supabase, Cloudflare and Google Maps Platform are your **Data Processors** for the relevant flows.

**Obligations mapped to ThrottleBase:**

| Obligation                                | What it means for you                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Notice (Rule 3)**                       | Standalone, clear notice before/at consent with an itemised list of personal data and specific purposes, and links to withdraw consent, exercise rights and complain to the Board. Show it at sign-up, and again contextually before enabling location tracking and live sharing.                                 |
| **Consent**                               | Free, specific, informed, unconditional, affirmative action. Separate toggles for: ride recording, background tracking, live location sharing, public profile/route visibility, marketing notifications. Withdrawal must be as easy as giving consent.                                                            |
| **Legitimate uses**                       | Limited non-consent grounds exist (e.g., legal compliance); do not rely on them for core features — use consent.                                                                                                                                                                                                  |
| **Consent Managers (Rule 4)**             | Registered intermediaries (Indian company, ₹2 crore minimum net worth) that let users manage consent across fiduciaries. **Not mandatory for you to integrate** at launch; be ready to accept consent via them if users use one.                                                                                  |
| **Purpose limitation & erasure (Rule 8)** | Delete data once the purpose is served or consent is withdrawn. The three-year inactivity erasure with 48-hour pre-deletion notice in the Third Schedule applies to large e-commerce, gaming and social media platforms (2 crore+ users) — not you at launch, but adopt a similar inactive-account policy anyway. |
| **Log retention**                         | Rules require retaining personal data, traffic data and processing logs for at least one year for specified purposes — reconcile this with deletion by keeping minimal security logs, not full ride traces.                                                                                                       |
| **Security safeguards (Rule 6)**          | "Reasonable security safeguards" including encryption, masking/obfuscation, access controls, logging and monitoring, backups, and contractual safeguards with processors.                                                                                                                                         |
| **Breach notification (Rule 7)**          | Notify affected users without delay, and the Board without delay followed by a detailed report within 72 hours (root cause, mitigation). This is in addition to CERT-In's 6-hour reporting.                                                                                                                       |
| **Children (Rule 10)**                    | Under-18s are children. Verifiable parental consent required; no tracking, behavioural monitoring or targeted advertising of children. A motorcycle app with live location sharing among strangers should be **18+ only** — enforce with an age gate and delete accounts discovered to be minors.                 |
| **Rights (Rules 13–14)**                  | Access, correction, completion, erasure, nomination, grievance redressal. Respond within a maximum of 90 days (build for much faster).                                                                                                                                                                            |
| **Contact / DPO publication (Rule 9)**    | Publish the contact of the person who answers data-protection queries in the app and on the website.                                                                                                                                                                                                              |
| **Cross-border transfers**                | Permitted except to countries the government restricts by notification; disclose storage location. Sector-specific localisation laws could override — none apply to a ride app today.                                                                                                                             |
| **Significant Data Fiduciary**            | Designated by government notification based on volume/sensitivity/risk — no fixed numeric threshold. Unlikely at launch; if designated: DPO in India, annual DPIA and audit.                                                                                                                                      |
| **Penalties**                             | Up to ₹250 crore for failing to take reasonable security safeguards, up to ₹200 crore for failing to notify breaches or for children's-data violations, per the Act's Schedule. Real enforcement will scale with harm and size, but these are statutory maximums per breach.                                      |

**Practical point:** Because the substantive obligations only bite in May 2027, some founders defer. Don't — app store privacy forms, CERT-In, IT Rules and the 2011 SPDI Rules (see below) apply now, and retrofitting consent and deletion into a live social graph is far harder than launching with it.

### 3.2 IT Act 2000 and SPDI Rules 2011

Section 43A and the SPDI Rules 2011 ("reasonable security practices", privacy policy, consent for sensitive personal data such as passwords and financial information) still apply until the DPDP Act's commencement repeals s.43A. The common benchmark for "reasonable security practices" is ISO/IEC 27001-style controls; you don't need certification, but you need a documented security policy you actually follow.

### 3.3 IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 — because you host UGC

Posts, comments, groups and ride reviews make you an intermediary. To keep s.79 safe harbour:

- Publish rules/privacy policy/user agreement and inform users at least annually.
- Appoint and publish a **Grievance Officer** (name, contact, mechanism).
- Acknowledge complaints within 24 hours. The IT (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules 2026, in force from 20 February 2026, cut the timeline for resolving user grievances from 15 days to 7 days, and cut the window for acting on a court order or government notice to take down unlawful content from 36 hours to 3 hours.
- Content involving non-consensual intimate imagery must be removed within 2 hours under the 2026 amendment.
- Preserve removed content and associated records for 180 days for investigations.

You won't be a "Significant Social Media Intermediary" (the threshold is 50 lakh registered Indian users), so the resident Chief Compliance Officer/nodal officer duties don't apply. ⚖️ Given how new the 2026 amendment is, have a lawyer confirm the current timelines when you draft the grievance SOP.

### 3.4 CERT-In Directions (28 April 2022)

Applies broadly to "body corporates" and intermediaries — including you:

- Report specified cyber incidents (data breaches, unauthorised access, compromised accounts, DDoS, etc.) to CERT-In **within 6 hours** of noticing them.
- Enable and retain logs of all ICT systems securely for a **rolling 180 days, within Indian jurisdiction** — a real problem if Railway/Supabase/Cloudflare logs live abroad (the Supabase database itself is in Mumbai). Options: pick India-region infrastructure where possible, or export logs to an Indian-region bucket. ⚖️
- Synchronise system clocks to NIC/NPL NTP servers (or sources traceable to them).
- Designate a point of contact for CERT-In.

### 3.5 Consumer Protection Act 2019, E-Commerce Rules, GST (only when you monetise)

No payments are visible in the repo. If you add premium features: the Consumer Protection (E-Commerce) Rules 2020 require seller/grievance details, clear pricing and refund terms, and prohibit dark patterns (CCPA's 2023 dark-pattern guidelines — no drip pricing, forced continuity, disguised ads). Digital subscriptions via Apple/Google in-app purchases have GST implications that depend on whether the store acts as the supplier; get a CA's view before enabling paid features. ⚖️ Unfair-contract-term provisions of the CPA apply even to free apps' Terms.

### 3.6 Maps and Geospatial Rules

The Department of Science & Technology's Geospatial Data Guidelines (15 February 2021) removed prior approval and licensing requirements for collecting, storing and publishing geospatial data and maps; compliance is by self-certification, subject to a negative list of sensitive attributes that cannot be shown on maps. Consumer GPS traces are well below the guidelines' accuracy thresholds (one meter horizontal), and as an Indian individual/entity you face no foreign-entity restrictions. Practical obligations: don't let users mark or publish defence/sensitive installations, and rely on your map provider (Google Maps) for correct depiction of India's external boundaries — never render your own boundary layers.

### 3.7 Motor Vehicles Act (for disclaimers and design)

Section 184 (dangerous driving), including handheld device use, was toughened by the 2019 amendment: a first offence now carries 6 months to 1 year in prison and/or a fine of ₹1,000–₹5,000, and a repeat offence within 3 years carries up to 2 years and/or ₹10,000, per Shriram General Insurance's summary of the section. Secondary sources disagree on some of these figures, so check them against the India Code text. Use this as the basis for your in-app warnings and a "no interaction while moving" UX: lock non-essential screens above a speed threshold, large tap targets, voice cues rather than taps.

### 3.8 Business Setup

| Structure               | Liability                    | Cost/compliance                                       | Verdict for ThrottleBase                                                                   |
| ----------------------- | ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sole proprietorship     | Unlimited personal liability | Cheapest, minimal filings                             | Bad fit — an accident lawsuit or DPDP penalty lands on your personal assets.               |
| LLP                     | Limited liability            | Moderate (annual Form 8/11, audit above thresholds)   | Good for a bootstrapped solo/duo project.                                                  |
| Private Limited Company | Limited liability            | Higher (board meetings, ROC filings, statutory audit) | Best if you plan to raise money, issue ESOPs, or qualify for DPIIT Startup India benefits. |

Recommendation: form an **LLP or Pvt Ltd before public launch**, publish the app under that entity, and make the entity the Data Fiduciary in your policies. It also unlocks:

- **Google Play organization account** — exempt from the 12-tester closed-testing rule (requires a D-U-N-S number).
- **Apple organization enrollment** — shows the company name as seller rather than your personal name (requires D-U-N-S).

**Trademark:** Search the IP India database for "ThrottleBase" and similar marks, then file in Class 9 (downloadable software/apps) and Class 42 (SaaS/platform services); consider Class 45 or 41 only if you run social/event services. Under the First Schedule of the Trade Marks Rules 2017, e-filing (TM-A) costs ₹4,500 per class for individuals, startups and small enterprises and ₹9,000 per class for everyone else, so Classes 9 + 42 come to ₹9,000 at the lower rate. An LLP/Pvt Ltd pays ₹9,000 per class unless it holds DPIIT startup or Udyam/MSME status. File before marketing spend; you can use ™ immediately and ® only after registration. ⚖️ A trademark agent filing costs little relative to rebranding risk.

## 4. International Compliance

**Default recommendation:** launch India-only on both stores first. That confines you to DPDP/IT Act/CERT-In and removes most GDPR/US obligations until you choose to expand. Geo-restricting store availability does not make foreign law disappear if you actively market to foreign users or accept them via web, but it removes "targeting" — the trigger for GDPR's extraterritorial reach.

| Regime                                         | Trigger                                                                                                                                                                                                                                    | What a small indie realistically needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GDPR / UK GDPR**                             | Offering the app to people in the EU/UK                                                                                                                                                                                                    | Lawful basis per purpose (contract for core ride recording; consent for live sharing, public profiles, marketing); a DPIA — systematic location tracking at scale is a textbook DPIA case; EU and UK representatives (Art. 27) since you have no EU establishment; data subject rights within one month; transfer mechanism (Standard Contractual Clauses — India has no adequacy decision); 72-hour breach notice to the supervisory authority. A DPO is likely not mandatory unless large-scale monitoring is your core activity — arguably it is for a tracking app, so get advice before EU launch. ⚖️ |
| **CCPA/CPRA + other US state laws**            | California: $26,625,000+ annual gross revenue (the California Privacy Protection Agency's inflation adjustment effective 1 January 2025, up from $25,000,000), or 100,000+ consumers/households, or 50%+ revenue from selling/sharing data | Likely below thresholds at launch. Several state laws (e.g., Washington's My Health My Data, and state laws treating precise geolocation as "sensitive data") have lower or no thresholds for specific data — precise geolocation is sensitive under most of them, requiring opt-in consent in some states.                                                                                                                                                                                                                                                                                               |
| **COPPA (US)**                                 | Directed to children under 13 or actual knowledge                                                                                                                                                                                          | Stay 18+ and don't target kids; delete accounts identified as under-13.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **EU Digital Services Act**                    | Hosting services offered in the EU                                                                                                                                                                                                         | Notice-and-action for illegal content, statement of reasons, point of contact. Under DSA Article 19, the online-platform section "shall not apply to providers of online platforms that qualify as micro or small enterprises as defined in Recommendation 2003/361/EC", except Article 24(3). Also Apple's DSA trader declaration (below).                                                                                                                                                                                                                                                               |
| **Others** (Brazil LGPD, Singapore PDPA, etc.) | Users in those countries                                                                                                                                                                                                                   | Broadly GDPR-like; a GDPR-grade program covers most of it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 5. App Store Requirements (as of September 2026)

### 5.1 Google Play

- **Privacy policy URL** in Play Console and in-app.
- **Data Safety form:** declare precise location (collected, shared with Google Maps if sent server-side/client-side), personal info, app activity, device IDs; encryption in transit; deletion availability.
- **Account deletion:** Play's User Data policy requires apps that allow account creation to "provide users with an in-app path to delete their app accounts and associated data; and provide a web link resource where users can request app account deletion and associated data deletion." Deactivation doesn't count.
- **Background location:** if you request `ACCESS_BACKGROUND_LOCATION`, submit the Location Permissions declaration with a video that shows "how a user would trigger the prominent disclosure and runtime permission (with user consent)". Ride tracking is a legitimate core-feature use case. Better alternative: record rides using a **foreground service with a persistent notification** started by the user, which often avoids needing background-location permission at all — test this first.
- **Foreground service types (Android 14+):** declare `foregroundServiceType="location"` and `FOREGROUND_SERVICE_LOCATION` in the manifest, and complete the Play Console foreground service declaration (description, user impact if interrupted, and a video link).
- **Target API level:** since 31 August 2026, new apps and updates must target Android 16 (API level 36); Expo SDK 57 should default to this — verify in the generated `android/app/build.gradle`.
- **Closed testing:** personal developer accounts created after 13 November 2023 "must run a closed test for their app with a minimum of 12 testers who have been opted in continuously for at least 14 days" before applying for production access. Organization accounts are exempt.
- **Developer verification:** Google's Android developer verification (identity tied to app package names) is enforced on certified devices in Brazil, Indonesia, Singapore and Thailand from 30 September 2026, with global expansion — including India — planned for 2027. Play-distributed apps are covered by your Play Console identity verification; complete it and register your package name now.
- **UGC policy:** in-app reporting, blocking, moderation, and ToS acceptance for users posting content.
- **Families policy:** doesn't apply if you target 18+ and don't select child audiences in the Target Audience section — select 18+ only.

### 5.2 Apple App Store

- **Privacy policy** in App Store Connect and in-app (5.1.1(i)).
- **App Privacy "nutrition labels":** Precise Location (linked to user, app functionality), Contact Info, User Content, Identifiers, Usage Data; "Tracking: No" unless you share with data brokers/ad networks.
- **Privacy manifest (`PrivacyInfo.xcprivacy`):** declare required-reason API use (UserDefaults, file timestamp, system boot time, disk space) and collected data types. In Expo, set `ios.privacyManifests` in `app.config.ts`; per Expo docs, check each library's own `PrivacyInfo.xcprivacy` in `node_modules` and merge its reasons, since Apple doesn't correctly parse all static CocoaPods manifests.
- **App Tracking Transparency:** not needed if you do no cross-app tracking. Don't add ad SDKs that force it.
- **Account deletion (5.1.1(v)):** "If your app supports account creation, you must also offer account deletion within the app." A link to a web page that completes deletion is acceptable; only offering deactivation is not. With Sign in with Apple, also revoke the user's Apple token via Apple's REST API on deletion.
- **Login services (4.8):** because you offer Google Sign-In as a primary login, you must also offer an equivalent login that limits data to name and email, allows email hiding, and doesn't collect interactions for advertising. Sign in with Apple satisfies this. **Your PR #8/#9 plugin that removes the Sign in with Apple entitlement for free Apple Developer accounts must not ship in the production build.**
- **Background location:** `UIBackgroundModes: ["location"]`, clear `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` strings stating exactly why (e.g., "ThrottleBase records your ride route while the screen is off during an active ride"); Guideline 2.5.4 says multitasking apps may only use background services for their intended purposes. Reviewers will test that tracking stops when the ride ends.
- **Location services (5.1.5):** "Location-based APIs shouldn't be used to provide emergency services" — frame the safety flow as a convenience notification to your group, not an emergency service.
- **UGC (1.2):** must include "A method for filtering objectionable material from being posted to the app", "A mechanism to report offensive content and timely responses to concerns", "The ability to block abusive users from the service", and "Published contact information so users can easily reach you".
- **Physical harm (1.4.4/1.4.5):** apps "should never encourage drunk driving or other reckless behavior such as excessive speed" — no top-speed leaderboards or "fastest segment" badges.
- **Age rating:** answer the questionnaire honestly (UGC and location sharing push it up); target 18+.
- **EU DSA trader status:** mandatory declaration if you distribute in the EU; traders' address/phone/email are shown publicly — another reason to launch India-only or use a company address.
- **Export compliance:** if you only use standard HTTPS/TLS, set `ios.config.usesNonExemptEncryption: false` (writes `ITSAppUsesNonExemptEncryption`) to skip the per-build questionnaire.
- **Demo account:** App Review needs working credentials — provide a reviewer account with a sample ride, because Google/Apple-only login can block review.

### 5.3 Expo/EAS Specifics

- Configure permissions via the `expo-location` config plugin (`isAndroidBackgroundLocationEnabled`, `isAndroidForegroundServiceEnabled`, `locationAlwaysAndWhenInUsePermission`) and remove any permissions you don't use (`android.blockedPermissions`) — Expo libraries can add permissions you never asked for.
- Keep purpose strings, privacy manifests, `usesNonExemptEncryption` and `UIBackgroundModes` in `app.config.ts` so prebuild regenerates them correctly.
- Keep Google Maps API keys out of the repo: load from EAS environment variables/secrets, and restrict keys by Android package + SHA-1 and iOS bundle ID in Google Cloud Console.
- Use EAS Submit and store metadata management to keep privacy URLs and descriptions consistent across builds.

## 6. Security & Operational Practices

- **Encryption in transit:** TLS everywhere (Railway custom domain, Socket.IO over WSS, TLS to Supabase); consider certificate pinning later.
- **Encryption at rest:** confirm Supabase's encryption-at-rest and key-management terms for the project's plan (not yet reviewed here; the quote previously in this line described Neon). Add application-level encryption or at least strict access controls for ride traces and live-location data.
- **Location minimisation:** default **privacy zones** that hide the first/last ~500 m of shared routes; round or truncate coordinates in public views; store live-session positions ephemerally (e.g., delete after the ride room closes) instead of persisting every broadcast.
- **Access control:** the schema defines row-level security policies (migrations 027–028), but they are not enforced: the API connects as Supabase's `postgres` role, which bypasses RLS, so authorisation is in Express. Even once enforced, the ride, route, live-session, social and support tables still carry allow-all transitional policies (migration 028). Enforcing RLS is tracked in `docs/project-status.md`. Write tests proving user A can't read user B's private rides, traces, or support tickets (IDOR is the #1 bug in this class of app). Enforcing the existing RLS policies is the defence-in-depth step.
- **Auth hygiene:** short-lived JWTs with refresh rotation, revocation on logout/"sign out all sessions", verification of Google/Apple ID tokens server-side (your new TokenVerifier), rate limiting on auth endpoints.
- **Secrets:** `AUTH_JWT_PRIVATE_KEY`, `DATABASE_URL`, Maps keys in Railway/EAS secrets only; scan git history (the repo is public) for leaked keys and rotate any that ever appeared. Keep Swagger disabled in production as your README recommends.
- **Admin access:** least privilege, admin actions audit-logged, 2FA for admin accounts even if removed for users.
- **Logging:** security logs retained 180 days (CERT-In) to 1 year (DPDP), never containing raw precise coordinates or tokens.
- **Breach response plan (one page):** who decides, CERT-In 6-hour report, user notification without delay, DPB detailed report within 72 hours, evidence preservation, key rotation.
- **Retention schedule (starting point):** account data — life of account; ride traces — until user deletes or account deletion; live-session positions — deleted at session end or within 24 hours; UGC — until deleted, but preserve removed content 180 days if subject to a complaint/order; support tickets — 1–2 years; security logs — 180 days to 1 year; backups — rolling 30 days with deletion propagating on restore.
- **Processor agreements (DPAs):** accept/sign Railway's, Supabase's and Cloudflare's DPAs; review Google Maps Platform and Google Cloud data processing terms; same for any push/crash SDK you add.

## 7. Other Launch Considerations

- **Google Maps Platform terms:** keep the Google logo and attribution visible (don't cover it with UI), don't cache Maps content beyond what the service terms allow, don't display Google map content on a non-Google map, and restrict API keys. Your maps proxy must comply with the same terms and should cache only what's permitted. Budget alerts in Google Cloud to avoid bill shocks.
- **OpenStreetMap (if you switch or use OSM-based tiles/routing):** "© OpenStreetMap contributors" attribution and ODbL share-alike on derived databases you distribute.
- **Open-source licences:** automate a licence inventory; ship a "Licences" screen; avoid AGPL on the server unless you're willing to publish source (your repo is already public — also decide what licence *your* repo has; currently none is listed, which means "all rights reserved").
- **Insurance:** once revenue or users grow, get cyber liability and professional/general liability (tech E&O) cover in the company's name. Group rides organised via your app are the scenario an insurer will care about.
- **Accessibility:** support screen readers and dynamic type; not yet mandated for private apps in India, but the European Accessibility Act applies to certain e-commerce services in the EU from June 2025, and IT Rules require "reasonable measures" for accessibility.
- **Marketing claims:** don't claim "safest", "crash detection", "SOS" or "accurate to X metres" unless tested and documented.

## Potential Pitfalls (Location-Tracking Motorcycle App)

1. **Home address leakage** — public ride routes that start and end at a rider's house. Default privacy zones fix this.
2. **Live location that never stops** — background tracking continuing after a ride ends, or live sharing persisting after a user leaves a group. Reviewers and users both catch this.
3. **Speed leaderboards or "top speed" badges** — Apple 1.4.4 rejection risk and evidence in accident litigation.
4. **Calling the safety feature "SOS" or "emergency"** — creates reliance you can't guarantee and conflicts with Apple 5.1.5.
5. **Privacy policy that doesn't match the Data Safety form or privacy label** — common rejection and a regulatory red flag.
6. **Deactivation instead of deletion**, or deletion that leaves ride traces, posts or backups intact.
7. **Shipping the dev plugin that strips Sign in with Apple** — Guideline 4.8 rejection.
8. **Requesting background location when a foreground service would do** — slows Play review and scares users.
9. **Allowing under-18 users** into group rides with adults — DPDP children's rules plus safeguarding risk.
10. **No moderation tooling at launch** — UGC apps without report/block get rejected by Apple.
11. **Personal-name developer accounts** — personal liability, public home address for EU trader status, and the 12-tester gate on Google Play.
12. **Unrestricted Google Maps keys in a public repo** — bill fraud and ToS breach.
13. **Logs containing precise coordinates or JWTs** — turns a minor log leak into a location breach.
14. **Ignoring CERT-In's 6-hour clock** because "DPDP only starts in 2027".
15. **Metadata that shows riding stunts or phone use while riding** in screenshots/videos.

## Recommendations: Prioritised Pre-Launch Checklist

### P0 — Launch blockers (do before any store submission)

- [x] Complete the data inventory from actual code (migrations, `package.json`, `app.config.ts`) and fill in unknowns: background location, photos, DOB, push provider, analytics. Done 2026-09-28: see [`data-inventory.md`](data-inventory.md).
- [ ] Decide India-only launch (recommended) on both stores.
- [ ] Publish Privacy Policy, Terms of Service (with safety disclaimers), Community Guidelines, and an Account Deletion page on throttlebase.in; link all of them in-app.
- [ ] Implement in-app account deletion that deletes rides, traces, posts, sessions; revoke Sign in with Apple tokens; web deletion request form.
- [ ] Add Sign in with Apple to production builds; remove the entitlement-stripping plugin from release profiles.
- [ ] Ship UGC tooling: report content, block user, basic word filter, admin takedown queue, published contact.
- [ ] Location: prominent disclosure screen before the OS prompt; foreground service with `location` type; background permission only if proven necessary; tracking stops at ride end.
- [ ] Age gate: 18+ in ToS and at sign-up; Play target audience 18+; honest Apple age rating.
- [ ] Complete Play Data Safety, foreground service and (if used) background-location declarations with videos; Apple privacy labels, privacy manifest, `usesNonExemptEncryption`, reviewer demo account.
- [ ] Verify target API 36 in the Android build.
- [ ] Appoint yourself (or a named person) as Grievance Officer/data-protection contact and publish contact details.

### P1 — Before or within weeks of launch

- [ ] Form an LLP/Pvt Ltd; get a D-U-N-S number; move developer accounts to organisation accounts.
- [ ] File trademark for "ThrottleBase" in Classes 9 and 42.
- [ ] Lawyer review ⚖️ of Terms (liability, ride organiser, safety flow), Privacy Policy, and minors approach.
- [ ] Security pass: IDOR tests, rate limiting, secrets rotation and git-history scan, admin audit logs, restricted Maps keys.
- [ ] Privacy zones for shared routes; ephemeral live-session positions.
- [ ] Breach response runbook including CERT-In 6-hour reporting; NTP sync to NIC/NPL; 180-day log retention with India-jurisdiction storage plan.
- [ ] Accept DPAs with Railway, Supabase, Cloudflare, Google; document Railway's region (Supabase is `ap-south-1`) and disclose any cross-border storage.
- [ ] Grievance SOP meeting 24-hour acknowledgement, 7-day resolution and 3-hour takedown-on-order timelines.
- [ ] Open-source licences screen; add a licence file to your own repo.

### P2 — Before 13 May 2027 (DPDP full enforcement) or before international expansion

- [ ] Granular consent records (who consented to what, when, which notice version); withdrawal flows per purpose.
- [ ] Rights-request workflow (access/correction/erasure/nomination) with tracking.
- [ ] Retention jobs that actually delete per the schedule; inactive-account policy with advance notice.
- [ ] Readiness to accept consent via registered Consent Managers.
- [ ] If expanding to EU/UK: DPIA, Art. 27 representatives, SCCs with processors, DSA contact point, cookie consent on web.
- [ ] Cyber/general liability insurance once you have meaningful users or revenue.

## Caveats

- Repo analysis is based on the README and PR commit messages only; I could not read source files, schemas or `package.json` directly. Anything marked "Inferred" or "Unknown" must be verified in code before you publish policies.
- Several regulatory items are very recent (IT Rules 2026 amendment; DPDP Rules timelines measured from 13/14 November 2025; Android developer verification rollout). Secondary sources differ by a day on some DPDP dates depending on whether they count from signing or Gazette publication — check the Gazette text when setting internal deadlines.
- Penalty figures are statutory maximums; actual enforcement practice under the DPDP Board is not yet established.
- GST treatment of in-app purchases, Motor Vehicles Act navigation carve-outs, and GDPR DPO/representative requirements are fact-specific — confirm with a CA or lawyer before relying on them.
- This report is not legal advice.
