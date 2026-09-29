# ThrottleBase — Data Inventory (Phase 0 audit)

Audited against the code on `dev` at `2eebfa0` on 2026-09-28.
This is the source of truth for the privacy policy, the store forms (`store-forms.md`, E9) and the legal drafts (E8).
Every row points at the code it was read from. When the code changes what is collected, who sees it, or how long it is kept, update this file in the same PR.

Paths are relative to the repo root. `mig NNN` means `server/src/db/migrations/NNN_*.sql`.

**Not legal advice.** Categories and purposes are descriptive, not a legal basis analysis.

---

## 0. Summary

- **Highest-risk data is the per-fix location track.** It sits in `ride_live_location_samples`: coordinates, speed, heading, accuracy and motion activity every few seconds while a rider is riding. The same table serves both live sharing and the rider's permanent ride history, and it is kept forever.
- **Nobody outside the app receives personal data except Google.** Google receives map, directions, places and geocoding requests carrying coordinates, plus Google sign-in. The app has no analytics, crash, push or media-storage SDK.
- **Access control is application SQL only.** RLS policies exist (mig 027–028) but are not enforced, because the API connects as Supabase's `postgres` role (`docs/project-status.md`, "Known gaps").
- **Account deletion anonymises the rider now and hard-deletes 30 days later.** The hard delete cascades into rides the rider led, which removes other riders' participation. See §9, decision D1.
- **Background location is requested but is not required.** The code already records through a foreground service (§4).
- **The safety flow is "Alert my group"** (renamed from "SOS" on 2026-09-29). It alerts everyone on the ride in-app, with a Call 112 hand-off (§5).
- **Unused permissions are requested:** microphone, camera, photo library, external storage, and background `audio` and `fetch` modes (§3).

---

## 1. Personal data by table

Retention abbreviations:

- **forever**: nothing deletes it.
- **account**: removed when the rider row is hard-deleted, 30 days after account deletion. See §8 for how that cascade works.

### 1.1 Account and identity

| Table.column                                                                                             | Category                               | Purpose                                                                                                       | Who can read (API)                                                                                                                            | Retention today                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `riders.email` (mig 001; nullable since mig 024)                                                         | Contact / identifier                   | Sign-in, notifications                                                                                        | Own profile only. Stripped from public profile (`server/src/controllers/rider.controller.ts:76`)                                              | Nulled at deletion (`server/src/adapters/postgres/riderRepository.ts:231`)                                                        |
| `riders.display_name`, `username`, `bio`, `profile_picture_url`, `experience_level`                      | Profile                                | Social identity                                                                                               | Any signed-in rider. `profile_visibility` is **not** checked by `GET /api/riders/:id` (`rider.controller.ts:42-77`)                           | Cleared or replaced with "Deleted rider" at deletion (`riderRepository.ts:228-242`)                                               |
| `riders.phone_number`, `weight_kg` (mig 001)                                                             | Contact; physical attribute            | Writable via `PATCH /api/riders/me` (`server/src/schemas/rider.schemas.ts:32-40`). The client never sets them | Own profile only (stripped at `rider.controller.ts:76`)                                                                                       | Nulled at deletion                                                                                                                |
| `riders.location_city`, `location_region`                                                                | Coarse location                        | Profile                                                                                                       | Any signed-in rider                                                                                                                           | Nulled at deletion                                                                                                                |
| `riders.location_coords` (mig 001)                                                                       | **Precise location** (home-like point) | Writable via `PATCH /me` (`rider.schemas.ts:41`). The client never sets it                                    | **Any signed-in rider.** Returned by the public profile (`server/src/services/rider.service.ts:64`, not stripped at `rider.controller.ts:76`) | Nulled at deletion                                                                                                                |
| `riders.total_rides`, `total_distance_km`, `total_ride_time_sec`                                         | Activity stats                         | Profile, leaderboard                                                                                          | Any signed-in rider                                                                                                                           | account                                                                                                                           |
| `riders.deleted_at`                                                                                      | Account state                          | Soft delete                                                                                                   | Server                                                                                                                                        | Row hard-deleted 30 days after it is set (`server/src/workers/processors/cleanup.processor.ts:23-32`)                             |
| `rider_identities` (mig 023): `provider` (google / apple / email), `subject`, `email`                    | Identifier                             | Federated sign-in                                                                                             | Server                                                                                                                                        | Deleted immediately at account deletion (`riderRepository.ts:221`)                                                                |
| `rider_roles` (mig 023): `role` (admin / support)                                                        | Authorisation                          | Admin and support access                                                                                      | Owner and server                                                                                                                              | account                                                                                                                           |
| `rider_consents` (mig 023): `terms_version`, `privacy_version`, `accepted_at`, `ip`                      | Consent record; IP address             | Proof of acceptance at sign-up (`riderRepository.ts:127`)                                                     | Server                                                                                                                                        | account. Append-only                                                                                                              |
| `sessions` (mig 008, 025): `refresh_token_hash`, `family_id`, `ip_address`, `user_agent`, `last_used_at` | Device / network identifiers           | Rotating refresh tokens                                                                                       | Owner (`/api/security/sessions`, flag `FEATURE_ACCOUNT_SECURITY`, off in beta)                                                                | Revoked or expired rows are deleted hourly (`cleanup.processor.ts:14-21`, scheduled at `server/src/services/jobs.service.ts:202`) |
| `login_activity` (mig 008): `ip_address`, `device_fingerprint`, `geo_location`, `logged_in_at`           | Network identifiers; security log      | Sign-in history (`server/src/core/auth/resolveOrCreateRider.ts:145`)                                          | Owner (`/api/security/login-activity`, flagged off)                                                                                           | **forever** (account)                                                                                                             |
| `email_otps` (mig 026): `email`, `code_hash`, `ip`, `attempts`                                           | Contact; IP                            | Email-code sign-in                                                                                            | Server                                                                                                                                        | **forever**. Nothing purges it, not even for accounts that never finish sign-up                                                   |
| `rate_limit_counters` (mig 026): `subject` (email or IP)                                                 | Identifier                             | Throttling OTP requests                                                                                       | Server                                                                                                                                        | Expired windows pruned (`server/src/adapters/postgres/rateLimiter.ts:58`)                                                         |
| `rider_settings`, `rider_privacy_settings`, `notification_preferences` (mig 007)                         | Preferences                            | Settings                                                                                                      | Owner                                                                                                                                         | account                                                                                                                           |
| `vehicles`, `gear` (mig 002)                                                                             | Possessions                            | Garage                                                                                                        | Owner                                                                                                                                         | account                                                                                                                           |

### 1.2 Location and ride telemetry

| Table.column                                                                                                                                                                             | Category                                           | Purpose                                                                                                                                                                                                                                            | Who can read (API)                                                                        | Retention today                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **`ride_live_location_samples`** (mig 013, 036): `location`, `speed_kmh`, `heading_deg`, `accuracy_m`, `activity` (automotive / cycling / walking / running / stationary), `captured_at` | **Precise location track; speed; motion activity** | Live sharing to the ride room **and** the rider's recorded ride. Ride stats and history read it (`server/src/services/stats.service.ts:175-195`). Written only while the rider is riding (`server/src/services/live-session.service.ts:1242-1270`) | Ride participants (live and timeline); the rider (history)                                | **forever**. Mig 015 line 29: "data is kept indefinitely for debugging and validation"                      |
| `ride_live_presence` (mig 011, 032): `last_location`, `finish_location`, `ride_started_at`, `finished_at`, `arrived_at`                                                                  | Precise location; timestamps                       | Live presence, per-rider progress                                                                                                                                                                                                                  | Ride participants                                                                         | forever (cascades with the ride)                                                                            |
| `ride_live_events` (mig 012): `payload`                                                                                                                                                  | Activity log                                       | Session timeline                                                                                                                                                                                                                                   | Ride participants                                                                         | forever                                                                                                     |
| `ride_live_incidents` (mig 014): `kind`, `severity`, `location`, `metadata`                                                                                                              | Precise location; safety event                     | Group alert (§5)                                                                                                                                                                                                                                   | Ride participants                                                                         | forever                                                                                                     |
| `ride_live_sessions` (mig 011)                                                                                                                                                           | Activity                                           | Session lifecycle                                                                                                                                                                                                                                  | Participants                                                                              | forever                                                                                                     |
| `rides` (mig 003, 009, 034): `start_point`, `end_point`, `start_point_name`, `end_point_name`, `route_geojson`, `road_via`, `scheduled_at`                                               | Location (planned)                                 | Ride planning                                                                                                                                                                                                                                      | `visibility` defaults to **public** (mig 003 line 10). Private rides are participant-only | forever. Hard-deleted if the captain's account is purged (`captain_id … ON DELETE CASCADE`, mig 003 line 6) |
| `ride_participants` (mig 003, 004, 038): `dropout_coords`, `start_location_override`, `joined_at`, `left_at`, `promoted_at`                                                                                  | Precise location; membership                       | Participation                                                                                                                                                                                                                                      | Ride participants                                                                         | account                                                                                                     |
| `ride_stops` (mig 003, 009, 021): `location`, `name`, `address`                                                                                                                          | Location                                           | Stops                                                                                                                                                                                                                                              | Ride participants                                                                         | with ride                                                                                                   |
| `routes` (mig 004, 033): `geojson`, `start_point`, `end_point`, `start_name`, `end_name`, `ridden_duration_s`                                                                            | **Precise location** (can include home)            | Saved and shared routes                                                                                                                                                                                                                            | `visibility` default **private**; `specific_riders` / `public`                            | account                                                                                                     |
| `route_stops` (mig 033): `location`, `note`                                                                                                                                              | Location; free text                                | Route stops                                                                                                                                                                                                                                        | As route                                                                                  | with route                                                                                                  |
| `route_shares`, `route_bookmarks` (mig 004)                                                                                                                                              | Relationship                                       | Sharing                                                                                                                                                                                                                                            | Parties                                                                                   | account                                                                                                     |
| `gps_traces` (mig 004): `latitude`, `longitude`, `altitude_m`, `speed_kmh`                                                                                                               | Precise location; speed                            | **Legacy.** No client writes it; the endpoint is still live (`server/src/routes/route.routes.ts:120`)                                                                                                                                              | Participants                                                                              | forever                                                                                                     |
| `ride_history_stats` (mig 004): `avg_speed_kmh`, `max_speed_kmh`, `moving_time_sec`, `calories_burned`                                                                                   | Speed; activity                                    | Ride history                                                                                                                                                                                                                                       | The rider; profile per `ride_history_visibility` (default **public**, mig 007 line 46)    | account                                                                                                     |
| `stop_suggestion_cache` (mig 021)                                                                                                                                                        | Places responses keyed by route                    | Cost control                                                                                                                                                                                                                                       | Server                                                                                    | `expires_at` (not personal)                                                                                 |

### 1.3 Community and user-generated content

| Table.column                                                       | Category                 | Purpose                                     | Who can read (API)  | Retention today                                       |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------- | ------------------- | ----------------------------------------------------- |
| `posts` (mig 005): `content`, `media_urls[]`, `shared_route_id`    | UGC; external image URLs | Feed                                        | Any signed-in rider | account (stays under "Deleted rider" for the 30 days) |
| `comments` (mig 005): `content`, `mentions[]`                      | UGC                      | Feed                                        | Any signed-in rider | account                                               |
| `likes`, `follows` (mig 005)                                       | Social graph             | Feed                                        | Any signed-in rider | account                                               |
| `groups`, `group_members` (mig 005)                                | UGC; membership          | Groups (flag `FEATURE_GROUPS`, off in beta) | Members / public    | account                                               |
| `ride_reviews` (mig 005): `rating`, `review_text`                  | UGC                      | Ride feedback                               | Signed-in riders    | account                                               |
| `route_road_feedback` (mig 035): `as_described`, `reasons`, `note` | UGC                      | Route quality                               | Signed-in riders    | account                                               |
| `blocked_riders` (mig 007)                                         | Social graph             | Block (§9 E3)                               | Blocker             | account                                               |
| `notifications` (mig 007): `title`, `body`, `data`                 | Derived content          | In-app notifications                        | Recipient           | **forever**                                           |
| `rider_badges`, `rider_achievements` (mig 006)                     | Gamification             | Rank (flag `FEATURE_RANK`, off)             | Signed-in riders    | account                                               |

### 1.4 Support and system

| Table.column                                                                                                       | Category                                 | Purpose                               | Who can read (API) | Retention today                            |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------- | ------------------ | ------------------------------------------ |
| `support_tickets` (mig 008, 018, 019): `subject`, `description`, `attachment_urls[]`, `agent_reply`, `rider_reply` | Free text; external URLs                 | Support (flag `FEATURE_SUPPORT`, off) | Owner; admins      | account                                    |
| `support_ticket_messages` (mig 020): `message`                                                                     | Free text                                | Support thread                        | Owner; admins      | with ticket                                |
| `jobs` (mig 010): `payload`, `result`, `error_message`                                                             | Can contain notification text, rider IDs | Queue                                 | Server             | **forever**. Nothing purges completed jobs |
| `google_api_usage` (mig 021)                                                                                       | Counters                                 | Spend cap                             | Server             | not personal                               |

### 1.5 Who can read: the enforcement layer

- **RLS is defined but not enforced.** Mig 028 creates owner-only policies on the auth and settings tables and `app_transitional_all` allow-all policies on every other table. The API connects as `postgres` (BYPASSRLS), so none of them apply today (`docs/project-status.md`, "Known gaps").
- Every access rule is therefore a `WHERE` clause in `server/src/services/*` or `server/src/adapters/postgres/*`. E10's authorisation tests are the only defence.
- Privacy settings exist but are only partly honoured:
  - `profile_visibility` is not checked on `GET /api/riders/:id`.
  - `leaderboard_opt_in` is ignored by the leaderboard (`docs/project-status.md`).
  - Defaults are **public** for profile, ride history, leaderboard and rides (mig 003 line 10; mig 007 lines 45-47).
- `riders.location_coords` also feeds the automatic meeting point. The geometric median of confirmed riders' override or home points (`server/src/services/ride.service.ts:941-960`) is never returned directly. But with a single contributor, the computed start **is** that rider's home point, and it is visible to everyone who can see the ride.
- **Supabase security advisors** (production project `throttlebase`, read 2026-09-28):
  - Every app table has RLS enabled with no `anon` policy, so the Data API's anonymous role cannot read rows.
  - The Data API is still enabled. `anon` and `authenticated` can execute the SECURITY DEFINER functions `public.rls_auto_enable()` and `public.st_estimatedextent(…)` via `/rest/v1/rpc`.
  - `spatial_ref_sys` has RLS off.
  - `update_timestamp` and `app.current_rider_id` have a mutable `search_path`.
  - `postgis` is installed in `public`.
  - Plan: [plans/rls-enforcement.md](plans/rls-enforcement.md).

---

## 2. Third parties and SDKs

### 2.1 Client (`client/package.json`)

| Dependency                                  | Talks to                                     | Data sent                                                           | Notes                                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-maps` 1.27.2                  | Google Maps SDK (Android and iOS)            | Map tiles for the viewport the rider looks at; Google SDK telemetry | API key compiled into the binary (`client/app.config.ts:85-97`). Must be restricted by package, SHA-1 and bundle ID                                                                                  |
| `@react-native-google-signin/google-signin` | Google                                       | OAuth sign-in                                                       | ID token verified server-side (`server/src/adapters/identity/googleIdentityVerifier.ts`)                                                                                                             |
| `expo-apple-authentication`                 | Apple                                        | —                                                                   | Installed, **not used**. Entitlement stripped in every build (`client/plugins/with-no-apple-signin.js`); gated by `EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN` (`client/src/services/platformCapabilities.ts`) |
| `react-native-map-link`                     | External navigation apps (Google Maps, Waze) | Destination coordinates, when the rider taps it                     | Rider-initiated                                                                                                                                                                                      |
| `expo-location`, `expo-task-manager`        | OS location services                         | —                                                                   | §3, §4                                                                                                                                                                                               |
| `socket.io-client`, `axios`                 | ThrottleBase API only                        | Location fixes, app data                                            | First party                                                                                                                                                                                          |
| `expo-secure-store`                         | Keychain / Keystore                          | Tokens                                                              | Web build falls back to **localStorage** (`client/src/adapters/storage/secureStorage.web.ts:24`)                                                                                                     |
| `expo-image-picker`                         | —                                            | —                                                                   | Installed, **never imported**. Still adds camera and photo permissions (§3)                                                                                                                          |
| `expo-audio`                                | —                                            | —                                                                   | Plays one pull-to-refresh sound (`client/src/hooks/usePullToRefresh.ts:9`). Adds microphone and media-playback declarations (§3)                                                                     |
| `expo-dev-client`                           | Metro (dev only)                             | —                                                                   | Adds `SYSTEM_ALERT_WINDOW` (debug manifest) and `NSLocalNetworkUsageDescription`                                                                                                                     |
| `@react-native-async-storage/async-storage` | Device storage                               | Navigation session cache                                            | Local only                                                                                                                                                                                           |

**Absent:** analytics, crash reporting, advertising, push SDKs (no `expo-notifications`, FCM or APNs), and media upload or storage.

### 2.2 Server (`server/package.json`)

| Dependency / service                                                                               | Recipient                | Data sent                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Google Maps Platform (Directions, Places, Geocoding) via `server/src/services/maps.service.ts`     | Google                   | **Rider coordinates** (origin and destination at `maps.service.ts:134-137`), reverse-geocode points, route polylines |
| `nodemailer` (SMTP; provider set by `EMAIL_DRIVER` / `SMTP_*`)                                     | Configured SMTP provider | Email address, sign-in code                                                                                          |
| Supabase (Postgres + PostGIS, `ap-south-1` Mumbai)                                                 | Processor                | All stored data                                                                                                      |
| Railway (API and worker; region not recorded)                                                      | Processor                | All traffic; stdout logs (§7)                                                                                        |
| Cloudflare                                                                                         | DNS                      | Hostnames only (confirm whether traffic is proxied)                                                                  |
| `jose` (ES256), `helmet`, `express-rate-limit`, `socket.io`, `swagger-*`, `node-cron`, `pg`, `zod` | —                        | Local libraries; no outbound data                                                                                    |

Push and email **notification** delivery are stubs (`server/src/workers/processors/notification-delivery.processor.ts:63-70`, `:128`, `:190`). No provider is called and no device tokens are stored.

---

## 3. OS permissions

Sources: `client/app.config.ts`, config-plugin output, and the generated `client/android/app/src/main/AndroidManifest.xml` and `client/ios/ThrottleBase/Info.plist`. The generated files are not tracked in git; regenerate with `npx expo prebuild --clean` and re-check before submission.

### 3.1 Android

| Permission                                                                           | Declared by                                                   | Used?                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`                                     | app.config (`:49-50`), expo-location                          | Yes                                                                                                                                                                  |
| **`ACCESS_BACKGROUND_LOCATION`**                                                     | app.config `:51`, `isAndroidBackgroundLocationEnabled` `:111` | Requested at runtime (`client/src/services/backgroundLocationService.ts:124`). **Not needed** (§4)                                                                   |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`                                  | app.config                                                    | Yes. expo-location `LocationTaskService` declares `foregroundServiceType="location"` (merged from `node_modules/expo-location/android/src/main/AndroidManifest.xml`) |
| `ACTIVITY_RECOGNITION` (plus the GMS variant)                                        | `isAndroidMotionActivityEnabled` (`app.config.ts:110`)        | Yes (motion activity, mig 036)                                                                                                                                       |
| **`RECORD_AUDIO`**, `MODIFY_AUDIO_SETTINGS`                                          | app.config `:47-48` (explicit)                                | **No.** Nothing records audio                                                                                                                                        |
| **`FOREGROUND_SERVICE_MEDIA_PLAYBACK`** and `AudioControlsService` (`mediaPlayback`) | expo-audio plugin                                             | **No.** Would need a Play foreground-service declaration for a feature that does not exist                                                                           |
| **`READ_EXTERNAL_STORAGE`**, `WRITE_EXTERNAL_STORAGE` (maxSdk 32)                    | expo-image-picker / other libraries                           | **No**                                                                                                                                                               |
| `VIBRATE`, `INTERNET`                                                                | libraries                                                     | Yes (haptics, network)                                                                                                                                               |
| `SYSTEM_ALERT_WINDOW`                                                                | dev client (debug manifest only)                              | Dev only                                                                                                                                                             |
| Notifications (`POST_NOTIFICATIONS`)                                                 | —                                                             | Not requested (no push)                                                                                                                                              |

- `targetSdk = 36`, `compileSdk = 36` (React Native `libs.versions.toml`). This meets the Play requirement in effect since 31 August 2026.
- `android:allowBackup="true"` with secure-store backup rules.

### 3.2 iOS

| Key                                                                                | Value / source                                                                                                          | Used?                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NSLocationWhenInUseUsageDescription`                                              | "…show you on the ride map." (expo-location plugin)                                                                     | Yes                                                                    |
| `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription` | "…even when the app is in the background."                                                                              | Requested via `requestBackgroundPermissionsAsync`. **Not needed** (§4) |
| `NSMotionUsageDescription`                                                         | "…tell when you stop and get off the bike…"                                                                             | Yes                                                                    |
| `UIBackgroundModes`                                                                | `location`, `fetch` (app.config `:34`) + `audio` (expo-audio)                                                           | `location` yes. **`fetch` and `audio`: no**                            |
| **`NSMicrophoneUsageDescription`**                                                 | generic "Allow $(PRODUCT_NAME) to access your microphone"                                                               | **No**                                                                 |
| **`NSCameraUsageDescription`**, **`NSPhotoLibraryUsageDescription`**               | generic (expo-image-picker plugin)                                                                                      | **No**                                                                 |
| `NSFaceIDUsageDescription`                                                         | generic (expo-secure-store)                                                                                             | No biometric prompt is used                                            |
| `NSLocalNetworkUsageDescription`                                                   | dev client                                                                                                              | Dev only                                                               |
| Sign in with Apple entitlement                                                     | **Stripped in every profile** (`client/plugins/with-no-apple-signin.js`, applied unconditionally at `app.config.ts:75`) | —                                                                      |
| `ios.privacyManifests`                                                             | not set in app.config. The generated `PrivacyInfo.xcprivacy` holds library defaults only                                | —                                                                      |
| `ios.config.usesNonExemptEncryption`                                               | not set                                                                                                                 | —                                                                      |

---

## 4. Ride recording: background permission or foreground service?

**How it works today:**

- `useBackgroundLocationTracker` polls `GET /api/rides/riding` every 30 s while the app is active (`client/src/hooks/useBackgroundLocationTracker.ts:59`). When the rider has a ride under way, it calls `startTracking` (`backgroundLocationService.ts:207-235`), which does three things:
  1. `watchPositionAsync`: foreground updates, Balanced accuracy, 5 s / 10 m.
  2. `requestBackgroundPermissionsAsync()`. **If the rider declines, background tracking is skipped entirely** (`:124-128`).
  3. `startLocationUpdatesAsync` with a `foregroundService` notification ("ThrottleBase Ride Active — Sharing your live location with the group") and `showsBackgroundLocationIndicator: true` (`:138-149`).
- Fixes go to the server over the `/live` socket (`location:update`). The server keeps them as track samples only once the rider's own ride has started (`live-session.service.ts:1224-1270`).
- Tracking stops when the ride disappears from the poll (the rider finished, or the ride ended), or when the rider signs out (`useBackgroundLocationTracker.ts`; `stopTracking` at `backgroundLocationService.ts:240`).

**What the library requires** (expo-location 57, read from `node_modules`):

- **Android.** `LocationModule.kt:314-330` says a foreground-service start "does NOT require the background location permission". It only needs foreground permission, and the app must be in the foreground when the service starts.
- **iOS.** `LocationModule.swift:227-241` checks only foreground permission plus `UIBackgroundModes: location`. An update session started in the foreground keeps running in the background with the blue indicator.

**Conclusion.** Background location permission is **not required** for ride recording. The code already has the foreground-service path and uses it as a gate, not as the mechanism.

**Still to verify on a real device before E4 removes the permission:**

1. With screen off, background permission denied, and the ride started in the foreground, samples keep arriving on Android 14+ and iOS.
2. The service stops when the ride ends and after the app is swiped away.

**Stop conditions, measured against E4:**

- Ride end: ✅ via the poll, up to 30 s late.
- App killed by the user: ⚠️ Android removes the service; not verified on iOS.
- Leaving a live session without finishing: ❌. Tracking follows "rides I'm riding", not session membership.

---

## 5. What the "safety flow" actually does

Renamed from "SOS" on 2026-09-29 (decision D8, [plans/safety-flow.md](plans/safety-flow.md)).

1. During a live session the rider taps **"Alert my group"**: a button on ride detail, or a 64 dp button above the sheet in full-screen navigation. A sheet asks "Send an alert with your location to everyone on this ride?" and shows the disclaimer (`client/src/features/rides/components/GroupAlertSheet.tsx`).
2. The sheet has an equally large **"Call 112 (emergency)"** button. It opens the dialer with 112 (`tel:112`); the rider places the call. The app never dials.
3. Sending asks for foreground location at that moment, then emits `incident:create` (in the room) or `POST /api/rides/:id/live/incident` with `kind: "group_alert"`, severity critical, and the location if available (`client/src/features/rides/hooks/useGroupAlert.ts`).
4. The server inserts `ride_live_incidents`, appends a `ride_live_events` row, and broadcasts `incident:created` with the location to the ride room on both paths. A job creates an **in-app notification for every confirmed participant and the captain** except the sender ("Group alert").
5. Everyone else on the ride sees a banner: who sent it, how long ago, **Navigate to** them (Google Maps directions to their live position, else where they sent it), Call 112, and Dismiss (`GroupAlertBanner.tsx`).
6. Unacknowledged after 120 s, the captain and co-captains get a second in-app notification (`live-ops.processor.ts`). Leaders can acknowledge over the API; there is no acknowledge button in the app yet.
7. Builds from before the rename still send `kind: "sos"`; the server stores it as `group_alert` (migration 039 also relabelled old rows). `'sos'` stays in the CHECK until those builds are gone.

**What it does not do:**

- It does not contact emergency services, send SMS or push, or share location outside the ride.
- It does not detect crashes. `crash`, `medical`, `mechanical` and `other` exist in the schema but the app sends only `group_alert`.
- No first-ride safety screen yet, and no push: alerts reach riders only while the app is open (E7, D4).

---

## 6. Posts, media and EXIF

- **No uploads anywhere.** No upload endpoint, storage bucket or image-processing library exists. EXIF stripping therefore does not apply today.
- **External image URLs are accepted:**
  - `POST /api/community/posts` accepts up to 10 arbitrary `media_urls` (`server/src/schemas/community.schemas.ts:6`; stored at `server/src/services/community.service.ts:16`).
  - `PostCard` renders the first URL (`client/src/components/PostCard.tsx:210`).
  - The in-app composer is text-only (`client/app/(modals)/create-post.tsx`), so only direct API callers can set URLs.
  - Consequences: every viewer's device fetches a third-party URL, leaking their IP to that host, and the image bypasses any moderation.
- Support tickets accept up to 5 `attachment_urls` the same way (`server/src/schemas/support.schemas.ts:22`).
- Profile picture: `profile_picture_url` is set from the Google profile at sign-up (`riderRepository.ts:82`); there is no upload.

---

## 7. Logs

**Server:**

- All logging is `console.*` to stdout (163 calls outside tests), collected by Railway. There is no logger, no levels, no redaction, and no log shipping or retention setting in the repo.
- HTTP access logging: none (no morgan or pino-http).
- Specific leaks:

| Where                                                | Logs                                           | Risk                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `notification-delivery.processor.ts:128`             | rider id **and push token**                    | Dormant (token lookup returns null today), but will leak once push lands                                |
| `notification-delivery.processor.ts:190`             | **recipient email** and subject                | Runs whenever an email notification job fires, **in every environment including production**. This is not the dev-only console email driver |
| `server/src/adapters/email/consoleEmailSender.ts:14` | **email address and sign-in code**             | Refused in production unless `ALLOW_CONSOLE_EMAIL=true` (`server/src/composition/createEmailSender.ts`) |
| `server/src/realtime/gateway.ts:333`                 | full error object on `location:update` failure | May include input values                                                                                |
| `server/src/controllers/*`                           | `error.message` on failures                    | Generally no personal data                                                                              |

- Coordinates: no deliberate coordinate logging found on the server.

**Client:**

- `client/src/utils/reverseGeocode.ts:45` logs lat/lng on invalid input.
- Background-tracking warnings log ride IDs.
- Release builds keep `console.*` (nothing strips them).

**Clocks:** no NTP configuration in the repo. This depends on Railway (CERT-In clock sync).

---

## 8. Retention today

No retention config file exists. Only three purges run:

| Purge                             | Where                                                          | What                                                                                    |
| --------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Hourly `cleanup.expired_sessions` | `cleanup.processor.ts`, scheduled at `jobs.service.ts:197-204` | Deletes expired or revoked `sessions`. Hard-deletes `riders` 30 days after `deleted_at` |
| Rate-limit pruning                | `rateLimiter.ts:58`                                            | Expired `rate_limit_counters` windows                                                   |
| Places cache                      | `stop_suggestion_cache.expires_at`                             | Not personal                                                                            |

What the 30-day rider hard delete removes through `ON DELETE CASCADE`:

- The rider's identities, sessions, login activity, settings, vehicles and gear.
- Their posts, comments, likes and follows.
- Their participation rows, location samples and presence.
- Their routes, bookmarks, badges, reviews and support tickets.
- **Every ride they captained** (`rides.captain_id … ON DELETE CASCADE`, mig 003 line 6), and with those rides **all other riders'** participation, samples and stats for them.

Rows with `ON DELETE SET NULL` (stops approved or requested, incidents, live events, session starters) lose the link but keep the data.

Everything else is kept **forever**:

- `ride_live_location_samples`, `ride_live_events`, `ride_live_incidents`, `notifications`.
- `login_activity`, `email_otps`, `jobs`, `gps_traces`.
- All UGC of active accounts.

---

## 9. Gap checklist against E1–E11

Legend:

- ✅ in place.
- 🟡 partly in place.
- ❌ missing.
- ⚠️ contradicted the spec; resolved in "Decisions from Phase 0" (D1–D11) in `LAUNCH_READINESS.md`, with plans in [`plans/`](plans/README.md).

### E1. Account deletion

- 🟡 `DELETE /api/riders/me` exists (`server/src/adapters/http/riderAccountRoutes.ts:93`; `server/src/core/riders/deleteAccount.ts`). It deletes identities, revokes all sessions, and anonymises the profile.
- ✅ The 30-day hard delete that cascaded into other riders' data is removed (security hotfix; `server/src/adapters/postgres/account-cleanup.integration.test.ts`). Production had 469 cleanup runs and 0 riders deleted, so no past damage.
- ❌ Until the E1 purge lands, a deleted rider's posts, comments, likes, follows and tracks are kept indefinitely and still shown in the feed as "Deleted rider" (community queries have no `deleted_at` filter). See D1 and [plans/account-deletion.md](plans/account-deletion.md).
- ⚠️ IT Rules 2021 Rule 3(1)(h) requires keeping registration information for 180 days after an account is cancelled. `deleteAccount` erases the email and identities immediately; the plan adds a sealed 180-day registration record. ⚖️
- ⚠️ A second, shadowed `DELETE /me` (`server/src/controllers/rider.controller.ts:153-172`) returns "You have 30 days to recover it". It is unreachable because the auth router is mounted first (`server/src/app.ts:196-200`), but the two contradict each other.
- ❌ No re-auth or recent-token requirement.
- ❌ No Sign in with Apple token revocation.
- ❌ No web deletion page (`throttlebase.in/delete-account`).
- 🟡 In-app: Settings → "Delete account" with a two-step confirm (`client/app/(modals)/settings.tsx:174`). The explanation text describes the anonymise behaviour, not the 30-day purge.
- ❌ No documented security-log or legal-hold retention.
- ❌ No tests proving "other users' data intact".
- ⚠️ "Push tokens" and "live-session data TTL" in the E1 list don't exist yet (D4).

### E2. Sign in with Apple in production

- ⏸ **Deferred until the iOS release (D6).** Launch is Android-first.
- ❌ The entitlement-strip plugin applies to **every** build, not only dev or free-account profiles (`client/app.config.ts:75`).
- ❌ The `expo-apple-authentication` plugin and `ios.usesAppleSignIn` are off. The client hides the button unless `EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN=true`.
- ✅ The server side is ready (`server/src/adapters/identity/appleIdentityVerifier.ts`, `POST /auth/apple`).
- ❌ No build check.
- Needs the paid Apple Developer membership first (D6).

### E3. UGC safety

- 🟡 Block exists (`blocked_riders`; `server/src/services/notifications.service.ts:320-345`). It only filters notifications. Feed, comments, mentions, groups and ride rooms still show the blocked rider.
- ❌ No `reports` table or endpoint.
- ❌ No word filter.
- ❌ No admin moderation queue. Admin UI covers support tickets only.
- ❌ No soft-delete or 180-day preservation of removed content.
- ❌ No grievance tracking.
- ❌ No grievance-officer screen.
- ⚠️ Posts accept external image URLs that bypass any future filter (§6).

### E4. Location and ride recording

- ✅ Foreground service with `foregroundServiceType=location` and a persistent notification (§4).
- ⚠️ `ACCESS_BACKGROUND_LOCATION` and "Always" are requested every ride even though they are not required (§4).
- ❌ No prominent-disclosure screen before the OS prompt.
- 🟡 Stops at ride end (≤30 s). Not tied to leaving a live session. Kill behaviour unverified on iOS.
- 🟡 iOS strings are specific. `UIBackgroundModes` also carries unused `fetch` and `audio`.
- ❌ `android.blockedPermissions` not used. Microphone, media-playback FGS, camera, photos and storage are all requested without use today (§3).
  - Per D9, feed uploads will use the system photo picker, which needs no library permission. Camera and microphone are needed only for in-app capture. Background `audio`/`fetch` and the media-playback service stay unneeded.

### E5. Location privacy defaults

- ❌ No privacy zones.
- ❌ Defaults are **public** for rides (mig 003 line 10), profile, ride history and leaderboard (mig 007 lines 45-47). Routes default private ✅.
- ⚠️ Live positions and the recorded ride are the same rows in `ride_live_location_samples`, so "ephemeral live positions, keep only own ride" cannot be done as a TTL (D2). `ride_live_presence.last_location` could be cleared at session end today.
- ❌ Public views expose raw start and end points (`rides.start_point`/`end_point`, `routes.start_point`/`end_point`). The public profile exposes `riders.location_coords`.

### E6. Consent and age gate

- 🟡 `rider_consents` (mig 023) records terms and privacy **document versions** plus IP at sign-up. Versions come from `TERMS_VERSION` / `PRIVACY_VERSION` (`server/src/composition/env.ts:140-143`).
- ⚠️ There are no per-purpose consents and no `withdrawn_at` (D3).
- ❌ No contextual consent (first ride, first live session).
- ❌ No withdrawal UI.
- ❌ No re-consent on version bump.
- ❌ No DOB or 18+ confirmation anywhere. Nothing blocks or flags under-18 accounts.

### E7. Rider safety UX

- ❌ No first-ride disclaimer.
- ❌ No motion lock. Ride detail and navigation show modals and alerts while moving.
- ✅ No speed ranking. The leaderboard ranks by badges earned, total rides or total distance (`server/src/services/rewards.service.ts:107-150`).
- 🟡 Badge `criteria_type` is a free string (`server/src/schemas/rewards.schemas.ts:7`). An admin could create a speed badge. `ride_history_stats.max_speed_kmh` is stored.
- ✅ The safety flow is "Alert my group" in UI copy, notifications and data (`kind='group_alert'`), with a Call 112 hand-off and the disclaimer in the sheet (§5).

### E8. Legal pages and links

- 🟡 Privacy Policy and Terms pages at `/privacy` and `/terms` (`client/app/(legal)/`), open to everyone and served on throttlebase.in by the web build. Draft text with placeholders, in `client/src/core/legal/` (2026-09-29). Before that, both URLs returned the web app's 404 while sign-in linked to them.
- ✅ Linked from sign-in (in-app) and from Settings → Legal.
- ❌ No Community Guidelines, Account Deletion, Grievance or Licenses links.
- 🟡 `docs/legal/drafts/privacy-policy.md` and `terms.md`, generated by `npm run legal:drafts` in `client/`; awaiting legal review.
- ❌ No licences screen.
- ❌ No licence CI (there is no CI; see E10).

### E9. Store configuration

- ✅ Android `targetSdk` 36.
- ❌ `ios.privacyManifests` not set.
- ❌ `usesNonExemptEncryption` not set.
- 🟡 Location and motion purpose strings are specific; microphone, camera and photo strings are generic.
- ❌ No `blockedPermissions`.
- ❌ No `docs/launch-readiness/store-forms.md`.
- ❌ No reviewer demo-account path. Sign-in is Google or email code; email code could serve reviewers if a mailbox is provided.

### E10. Security hardening

- ✅ Short-lived access JWT (ES256, 900 s default, `env.ts:130`).
- ✅ Rotating refresh-token families (30 days, reuse revokes the family; mig 025).
- ✅ `POST /auth/logout-all` (`server/src/adapters/http/authRoutes.ts:220`). Access tokens stay valid until expiry (≤15 min).
- ✅ Swagger fail-closed unless `ENABLE_SWAGGER_DOCS=true`, basic-auth gated (`server/src/config/security.ts:58`).
- ✅ CORS allowlist and security headers.
- 🟡 Rate limiting:
  - In place on email-code start and verify (Postgres counters; `server/src/core/auth/startEmailLogin.ts:48`) and on the maps proxy and stop suggestions (in-memory; `server/src/middleware/rateLimit.middleware.ts`).
  - ❌ Missing on Google and Apple sign-in, refresh, posts, comments, deletion and (future) reports.
- ❌ RLS not enforced (§1.5). No authorisation (IDOR) test suite across resource routes.
- ❌ No log redaction (§7).
- ❌ No admin audit-log table. Admin gate: `server/src/middleware/admin.middleware.ts:11`.
- ❌ No CI of any kind. `.eas/workflows/*.yml` only run EAS builds, so there is no gitleaks.
- ✅ **Secret in git history is dead:** a Google Maps API key (`AIzaSyCd…`, truncated here) in the old `client/app.json`, commits `b5cfb62`, `c563109`, `891fcab`. The owner deleted it, and on 2026-09-29 Geocoding and Directions calls with it returned `REQUEST_DENIED — This API project was not found`. The current keys come from EAS env (`app.config.ts:85-97`); still confirm the shipped Android key is restricted to the package and signing fingerprint.
- ❌ No `docs/launch-readiness/incident-response.md`.

### E11. Retention jobs

- 🟡 Worker and recurring-job machinery exist (`jobs.service.ts` `enqueueRecurringJobIfDue`). Only the session purge and the 30-day rider purge run (§8).
- ❌ No live-session data purge.
- ❌ No soft-deleted content purge (content is not soft-deleted at all).
- ❌ No security-log purge (`login_activity`, `email_otps`, `jobs`, `notifications` grow forever).
- ❌ No single retention config file.

---

## 10. Items for humans (not code)

- ~~Rotate the Google Maps key found in git history~~ Done: verified dead on 2026-09-29. Still confirm the current iOS and Android keys are restricted by bundle ID, package and SHA-1.
- Disable the Supabase Data API (PostgREST), which the app does not use ([plans/rls-enforcement.md](plans/rls-enforcement.md) Phase 1).
- Record Railway's region, and whether Railway and Cloudflare logs stay in India (CERT-In 180-day, India jurisdiction).
- Fill in the placeholders in the Privacy Policy and Terms (operator name — an individual developer until a company is registered, contact address, grievance officer, email provider, security-log retention, liability cap, jurisdiction), get them reviewed, then mark them `final`.
- Sign or accept DPAs with Supabase, Railway, Cloudflare and Google.
