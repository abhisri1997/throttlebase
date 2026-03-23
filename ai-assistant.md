# AI Assistant — ThrottleBase

## Project Goal

A platform where riders can create rides, join rides, share routes, track ride history, and interact with a biking community. Includes a reward system (badges, achievements, leaderboard), notifications, settings, privacy/security controls, and community features (posts, comments, likes, follows, groups, ride reviews).

This platform is purely for learning purpose but may be used for commercial purpose in future.

Hence AI should help user in following ways:

- Learn about all the features of the platform
- Learn about all the tech stack used in the platform in depth

## Tech Stack

| Layer                | Technology                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Runtime**          | Node.js (v22)                                                                       |
| **Language**         | TypeScript 5.9 (strict mode)                                                        |
| **Server Framework** | Express 5                                                                           |
| **Database**         | PostgreSQL with PostGIS                                                             |
| **Module System**    | ES Modules (`"type": "module"` in package.json, `"module": "NodeNext"` in tsconfig) |
| **Dev Tools**        | tsx (runner), nodemon (watch mode), ts-node                                         |
| **Auth**             | bcrypt (password hashing), jsonwebtoken (JWT)                                       |
| **Validation**       | Zod (schema-based request validation)                                               |
| **API Docs**         | swagger-jsdoc + swagger-ui-express (OpenAPI 3.0 at `/api-docs`)                     |
| **Other**            | cors, dotenv, pg (PostgreSQL driver)                                                |

## Project Structure

```
throttlebase/
├── docs/
│   ├── product-overview.md
│   ├── technical-overview.md
│   ├── database-design.md
│   └── architecture.md
├── server/
│   ├── src/
│   │   ├── app.ts                    # Express entry point (port 5001)
│   │   ├── config/
│   │   │   ├── db.ts                 # PostgreSQL pool + connection test
│   │   │   └── swagger.ts            # OpenAPI 3.0 config
│   │   ├── schemas/
│   │   │   ├── auth.schemas.ts       # Zod: register/login validation
│   │   │   ├── rider.schemas.ts      # Zod: profile update validation
│   │   │   └── ride.schemas.ts       # Zod: ride create/update validation
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts    # Register & Login handlers
│   │   │   ├── rider.controller.ts   # Profile CRUD handlers
│   │   │   └── ride.controller.ts    # Ride CRUD handlers
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts     # JWT verify middleware
│   │   ├── routes/
│   │   │   ├── auth.routes.ts        # POST /auth/register, /auth/login
│   │   │   ├── rider.routes.ts       # /api/riders/me, /api/riders/:id
│   │   │   └── ride.routes.ts        # /api/rides CRUD + join
│   │   ├── services/
│   │   │   ├── auth.service.ts       # bcrypt + JWT logic
│   │   │   ├── rider.service.ts      # Profile queries (dynamic SQL)
│   │   │   └── ride.service.ts       # Ride queries (transactions, PostGIS)
│   │   └── db/
│   │       └── migrations/
│   │           ├── 001_initial_riders.sql
│   │           ├── 002_vehicles_and_gear.sql
│   │           ├── 003_rides_core.sql
│   │           ├── 004_routes_and_gps.sql
│   │           ├── 005_community.sql
│   │           ├── 006_rewards.sql
│   │           ├── 007_notifications_and_settings.sql
│   │           └── 008_security_and_support.sql
│   ├── .env
│   ├── tsconfig.json
│   └── package.json
├── client/                           # (not yet started)
└── ai-assistant.md
```

## Technical Decisions

| Decision                                   | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Port 5001** (not 5000)                   | macOS AirPlay Receiver occupies port 5000                                                                                                                                                                                                                                                                                                                                                                                               |
| **ES Modules**                             | `"type": "module"` + `"module": "NodeNext"` + `"verbatimModuleSyntax": true` for modern imports                                                                                                                                                                                                                                                                                                                                         |
| **Express 5**                              | Latest major version; note: listen errors are passed to callback instead of crashing                                                                                                                                                                                                                                                                                                                                                    |
| **`rootDir: ./src`, `outDir: ./dist`**     | Clean separation of source and compiled output                                                                                                                                                                                                                                                                                                                                                                                          |
| **UUID primary keys**                      | All tables use `UUID` with `gen_random_uuid()`                                                                                                                                                                                                                                                                                                                                                                                          |
| **PostGIS**                                | Spatial queries for ride start/end points, regional leaderboards, GPS traces                                                                                                                                                                                                                                                                                                                                                            |
| **Soft delete**                            | `deleted_at` on riders table with 30-day grace period                                                                                                                                                                                                                                                                                                                                                                                   |
| **Denormalized counters**                  | `total_rides`, `like_count`, `current_rider_count`, etc. for fast reads                                                                                                                                                                                                                                                                                                                                                                 |
| **Data-driven rewards**                    | Badges/achievements defined in DB, not code — new ones added without deploys                                                                                                                                                                                                                                                                                                                                                            |
| **Canonical metric units**                 | All data stored in km, km/h, kg, UTC; conversion is client-side                                                                                                                                                                                                                                                                                                                                                                         |
| **Raw SQL migrations**                     | 8 migration files executed via `psql`; future refactor to Drizzle ORM or Prisma planned                                                                                                                                                                                                                                                                                                                                                 |
| **DB Transactions**                        | Ride creation atomically inserts into `rides` + `ride_participants` in one transaction                                                                                                                                                                                                                                                                                                                                                  |
| **EWKT for PostGIS**                       | Coordinates passed as `SRID=4326;POINT(lon lat)` parameterized values, not SQL interpolation                                                                                                                                                                                                                                                                                                                                            |
| **JWT payload key: `riderId`**             | `auth.service.ts` signs `{ riderId, email }` — controllers must access `riderId`, not `id`                                                                                                                                                                                                                                                                                                                                              |
| **Client TSConfig JSX**                    | Required explicit `"jsx": "react-native"` to resolve IDE issues with `@/src/components` imports                                                                                                                                                                                                                                                                                                                                         |
| **NativeWind TS Types**                    | Added `nativewind-env.d.ts` reference file to enable React Native components to accept `className`                                                                                                                                                                                                                                                                                                                                      |
| **Expo Router Types**                      | Added `expo-env.d.ts` reference file to fix missing `expo-router` type declarations error                                                                                                                                                                                                                                                                                                                                               |
| **VSCode Tailwind Linting**                | Added `.vscode/settings.json` with `"css.lint.unknownAtRules": "ignore"` to fix `@tailwind` unknown at-rule warnings                                                                                                                                                                                                                                                                                                                    |
| **Client UI Icons**                        | Using `lucide-react-native` and `react-native-svg` installed with `--legacy-peer-deps` due to React 19 conflict with Expo 55                                                                                                                                                                                                                                                                                                            |
| **Centralized ThemeContext**               | Replaced NativeWind `dark:` class prefix theming (broken on iOS native) with a React Context provider (`src/theme/ThemeContext.tsx`) that delivers resolved hex color values via inline `style={{}}` props. All screens/components use `useTheme()`. Color palette defined in `src/theme/colors.ts`.                                                                                                                                    |
| **LocationPicker + Google Places**         | Replaced blind map-tapping with `src/components/LocationPicker.tsx` — uses `react-native-google-places-autocomplete` for search, `expo-location` for current location, and a draggable `MapView` pin. Stores both coords and place names.                                                                                                                                                                                               |
| **Google Maps on iOS**                     | Switched all `react-native-maps` instances to use `provider={PROVIDER_GOOGLE}` instead of default Apple Maps.                                                                                                                                                                                                                                                                                                                           |
| **Equidistant Start Point**                | Server-side `src/utils/geo.ts` uses the Geometric Median (Weiszfeld's algorithm, solving the Weber problem) from riders' initial locations. The ride's end point is weighted x2 to pull the meeting point logically closer to the destination. It then snaps to the nearest accessible place (gas station, café) via Google Nearby Search.                                                                                              |
| **Auto-Start Overrides**                   | Riders use their global `location_coords` for equidistant start point calculations by default, but can set a `ride_participants.start_location_override` up to 12 hours before the ride begins. Server uses `COALESCE(override, home)`.                                                                                                                                                                                                 |
| **AI Context Memory (Workspace)**          | Added workspace-level Copilot instruction (`.github/copilot-instructions.md`) and hook draft (`.github/hooks/ai-context-memory.json`) with scripts to reinforce reading and updating `ai-assistant.md`.                                                                                                                                                                                                                                 |
| **Client Rider Sync Pattern**              | Added `syncRider` and `syncRiderFromResponse` in `client/src/store/authStore.ts`; profile edit now syncs `rider_data` (AsyncStorage) and Zustand state from `PATCH /api/riders/me` response before query invalidation, preventing stale rider data after save/restart.                                                                                                                                                                  |
| **Home Location Persistence Hardening**    | `edit-profile` now hydrates from latest `/api/riders/me` data (not auth payload alone), normalizes multiple `location_coords` shapes, and passes both `initialCoords` + `initialName` to `LocationPicker` so saved home location reliably displays after save/reopen. The exact selected place label is persisted via `home_location_name` in `rider_data` and merged during reopen to avoid fallback strings like `Bangalore, string`. |
| **Post Shareable Link Payload**            | `PostCard` share action now includes a clickable link (`throttlebase://post/:id`) and, when `EXPO_PUBLIC_SHARE_BASE_URL` is configured, also includes a web URL (`https://.../post/:id`) so recipients can open in app or website.                                                                                                                                                                                                      |
| **Shared Post Unauthorized UX**            | `app/post/[id].tsx` now distinguishes 401/403 from real 404s: unauthenticated visitors see a login-required message instead of `Post not found`, comment fetches are disabled until the post loads, and back navigation falls back to login/feed when there is no browser/app history entry.                                                                                                                                            |
| **Global Unauthorized Notice**             | `client/src/api/client.ts` now emits a generic auth notice for protected-resource 401/403 responses, and `client/app/_layout.tsx` renders a root-level dismissible banner from Zustand state. Auth endpoints are excluded so failed login attempts do not show the global `Login required to continue.` notice.                                                                                                                         |
| **Post-Login Return Redirect**             | `client/app/_layout.tsx` guards protected routes globally and forwards unauthenticated users to `/(auth)/login?redirectTo=<path>`. `client/app/(auth)/login.tsx` now redirects to `redirectTo` after successful login, enabling shared links (e.g. `/post/:id`) to return users to the original page.                                                                                                                                   |
| **Post-Register Return Redirect**          | `client/app/(auth)/register.tsx` now mirrors login behavior by honoring `redirectTo` after successful sign-up/login, and login/register cross-links preserve `redirectTo` so shared-link users return to the original post after creating an account.                                                                                                                                                                                   |
| **NativeWind Dark Mode Class Mode**        | Tailwind is configured with `darkMode: class` and app startup calls NativeWind dark-mode class flag in `client/app/_layout.tsx` to prevent web runtime error: `Cannot manually set color scheme, as dark mode is type 'media'.`                                                                                                                                                                                                         |
| **Deprecated Pointer Events Prop**         | Replaced `pointerEvents` prop usage with `style.pointerEvents` on the global auth-notice container in `client/app/_layout.tsx` to satisfy web deprecation guidance.                                                                                                                                                                                                                                                                     |
| **Web Share API Fallback**                 | `PostCard` now avoids calling `Share.share` on browsers without Web Share support; it tries `navigator.share`, then clipboard copy, then prompt copy, preventing `Share is not supported in this browser` runtime errors.                                                                                                                                                                                                               |
| **Support Center First Slice**             | Support tickets now follow the existing schema/controller/service/route pattern on the server (`/api/support`) and a basic client support center lives under `client/app/(modals)/support.tsx`, reachable from Settings. This delivers immediate rider-facing bug/account/dispute reporting without waiting for the future admin/backoffice workflow.                                                                                   |
| **Background Jobs Foundation (P0 Step 2)** | Added migration `010_background_jobs.sql` plus queue + worker runtime under `server/src/queue/*` and `server/src/workers/*`. Worker uses `node-cron` polling, PostgreSQL row leasing (`FOR UPDATE SKIP LOCKED`), retry backoff, and expired-lock recovery. Domain-specific processors (ride stats/rewards/notifications) are intentionally deferred to next steps.                                                                      |
| **Ride Analytics Pipeline (P0 Step 3)**    | Worker `ride_stats.recompute` now executes real computation via `server/src/services/stats.service.ts`: per-rider distance/time/speed/elevation/calories from `gps_traces`, upsert to `ride_history_stats`, and rider aggregate refresh. Enqueue hooks now fire on ride completion (`ride.service.ts`) and on late GPS ingest for completed rides (`route.service.ts`) through `server/src/services/jobs.service.ts`.                   |
| **Queue Lease SQL Disambiguation**         | In `server/src/queue/queue.ts`, leasing query `RETURNING` uses aliased columns (`JOB_COLUMNS_LEASE` with `j.`), while non-aliased queries keep standard `JOB_COLUMNS`. This avoids PostgreSQL `42702` ambiguity in lease paths without breaking enqueue/fail paths (`42P01` missing FROM-clause for `j`).                                                                                                                               |
| **Notifications Center UX (P0 Step 4)**    | Added dedicated modal `client/app/(modals)/notifications.tsx` with unread/all filtering, per-item mark read, mark-all read, pull-to-refresh, unread count badge, and settings/preferences entrypoint. Added feed header bell shortcut with unread badge and settings shortcut to open the notifications center.                                                                                                                         |

## API Endpoints (11 total)

| Method | Path                                   | Auth | Description                                     |
| ------ | -------------------------------------- | ---- | ----------------------------------------------- |
| POST   | `/auth/register`                       | No   | Register a new rider                            |
| POST   | `/auth/login`                          | No   | Login and receive JWT                           |
| GET    | `/api/riders/me`                       | Yes  | Get own full profile                            |
| PATCH  | `/api/riders/me`                       | Yes  | Update own profile                              |
| DELETE | `/api/riders/me`                       | Yes  | Soft-delete own account                         |
| GET    | `/api/riders/:id`                      | Yes  | View another rider's public profile             |
| GET    | `/api/rides`                           | Yes  | List upcoming public rides                      |
| POST   | `/api/rides`                           | Yes  | Create a ride (become captain)                  |
| GET    | `/api/rides/:id`                       | Yes  | Get ride details + stops                        |
| PATCH  | `/api/rides/:id`                       | Yes  | Update ride (captain/co-captain, state machine) |
| POST   | `/api/rides/:id/join`                  | Yes  | Join a ride (capacity enforced)                 |
| POST   | `/api/rides/:id/promote`               | Yes  | Promote rider to co-captain                     |
| GET    | `/api/rides/:id/stops`                 | Yes  | List ride stops                                 |
| POST   | `/api/rides/:id/stops`                 | Yes  | Request a stop (any participant)                |
| PATCH  | `/api/rides/:id/stops/:stopId`         | Yes  | Approve/reject a stop (captain)                 |
| GET    | `/api/routes`                          | Yes  | List public routes                              |
| POST   | `/api/routes`                          | Yes  | Create a route with GeoJSON                     |
| POST   | `/api/routes/traces`                   | Yes  | Upload batch GPS trace points                   |
| GET    | `/api/routes/traces/:rideId`           | Yes  | Get GPS traces for a ride                       |
| GET    | `/api/routes/:id`                      | Yes  | Get route (visibility-aware)                    |
| POST   | `/api/routes/:id/bookmark`             | Yes  | Bookmark a route                                |
| DELETE | `/api/routes/:id/bookmark`             | Yes  | Remove a bookmark                               |
| POST   | `/api/routes/:id/share`                | Yes  | Share route with another rider                  |
| GET    | `/api/community/posts`                 | Yes  | Community feed (paginated)                      |
| POST   | `/api/community/posts`                 | Yes  | Create a post                                   |
| GET    | `/api/community/posts/:id`             | Yes  | Get a single post                               |
| DELETE | `/api/community/posts/:id`             | Yes  | Delete your own post                            |
| GET    | `/api/community/posts/:id/comments`    | Yes  | Get comments on a post                          |
| POST   | `/api/community/posts/:id/comments`    | Yes  | Add a comment                                   |
| POST   | `/api/community/posts/:id/like`        | Yes  | Like a post                                     |
| DELETE | `/api/community/posts/:id/like`        | Yes  | Unlike a post                                   |
| POST   | `/api/community/riders/:id/follow`     | Yes  | Follow a rider                                  |
| DELETE | `/api/community/riders/:id/follow`     | Yes  | Unfollow a rider                                |
| GET    | `/api/community/riders/:id/followers`  | Yes  | Get followers                                   |
| GET    | `/api/community/riders/:id/following`  | Yes  | Get following                                   |
| GET    | `/api/community/groups`                | Yes  | List public groups                              |
| POST   | `/api/community/groups`                | Yes  | Create a group (become admin)                   |
| POST   | `/api/community/groups/:id/join`       | Yes  | Join a group                                    |
| DELETE | `/api/community/groups/:id/leave`      | Yes  | Leave a group                                   |
| GET    | `/api/community/rides/:rideId/reviews` | Yes  | Get ride reviews                                |
| POST   | `/api/community/rides/:rideId/reviews` | Yes  | Add a ride review                               |
| GET    | `/api/rewards/badges`                  | Yes  | List all badges                                 |
| POST   | `/api/rewards/badges`                  | Yes  | Create a badge (admin)                          |
| GET    | `/api/rewards/badges/me`               | Yes  | Get your earned badges                          |
| POST   | `/api/rewards/badges/:id/award`        | Yes  | Award badge to a rider                          |
| GET    | `/api/rewards/badges/rider/:id`        | Yes  | Get rider's badges                              |
| GET    | `/api/rewards/achievements`            | Yes  | List achievement definitions                    |
| POST   | `/api/rewards/achievements`            | Yes  | Create achievement (admin)                      |
| GET    | `/api/rewards/achievements/me`         | Yes  | Your achievement progress                       |
| GET    | `/api/rewards/leaderboard`             | Yes  | Leaderboard (distance/rides/badges)             |
| GET    | `/api/notifications`                   | Yes  | Get notifications (filterable)                  |
| PATCH  | `/api/notifications/read-all`          | Yes  | Mark all as read                                |
| PATCH  | `/api/notifications/:id/read`          | Yes  | Mark one as read                                |
| GET    | `/api/notifications/preferences`       | Yes  | Notification prefs                              |
| PUT    | `/api/notifications/preferences`       | Yes  | Set notification pref                           |
| GET    | `/api/notifications/settings`          | Yes  | Get app settings                                |
| PATCH  | `/api/notifications/settings`          | Yes  | Update settings                                 |
| GET    | `/api/notifications/privacy`           | Yes  | Get privacy settings                            |
| PATCH  | `/api/notifications/privacy`           | Yes  | Update privacy settings                         |
| GET    | `/api/notifications/blocked`           | Yes  | List blocked riders                             |
| POST   | `/api/notifications/blocked/:id`       | Yes  | Block a rider                                   |
| DELETE | `/api/notifications/blocked/:id`       | Yes  | Unblock a rider                                 |
| GET    | `/api/support`                         | Yes  | List own support tickets                        |
| POST   | `/api/support`                         | Yes  | Create a support ticket                         |
| GET    | `/api/support/:id`                     | Yes  | Get one own support ticket                      |

## Database Tables (31 application tables + 1 PostGIS system table)

All migration files through `010_background_jobs.sql` have been executed. Full schema covers: `riders`, `vehicles`, `gear`, `rides`, `ride_participants`, `ride_stops`, `routes`, `route_shares`, `route_bookmarks`, `gps_traces`, `ride_history_stats`, `posts`, `comments`, `likes`, `follows`, `groups`, `group_members`, `ride_reviews`, `badges`, `rider_badges`, `achievements`, `rider_achievements`, `notifications`, `notification_preferences`, `rider_settings`, `rider_privacy_settings`, `blocked_riders`, `login_activity`, `sessions`, `support_tickets`, `jobs`.

## Current Progress

- [x] Project scaffolding (server directory, package.json, tsconfig.json)
- [x] Product overview document (`docs/product-overview.md`)
- [x] Technical overview document (`docs/technical-overview.md`)
- [x] Database design document (`docs/database-design.md`)
- [x] Express server entry point (`server/src/app.ts`) with `/health` endpoint
- [x] TypeScript strict mode configured and compiling cleanly
- [x] Database setup (PostgreSQL + PostGIS) and connection
- [x] Raw SQL schema: all 8 migrations (30 tables) executed and verified
- [x] Authentication module (register, login, JWT middleware)
- [x] Rider profiles CRUD (get/update/soft-delete own, view public)
- [x] Rides module API (create with transactions, list, get, update, join)
- [x] Routes module API (create, list, bookmark, share, GPS traces)
- [x] Community features API (posts, comments, likes, follows, groups, ride reviews)
- [x] Notifications & Settings API (notifications, prefs, settings, privacy, blocked)
- [x] Swagger API documentation (OpenAPI 3.0 at `/api-docs`)
- [x] Client application (Expo, React Native, NativeWind)
- [x] Rewards UX implemented (leaderboard, badges, achievements)
- [x] Settings & privacy UX implemented (including blocked riders)
- [x] Support module first slice implemented (server API + settings-linked client support center)
- [x] Background jobs foundation implemented (jobs table + queue + worker runtime)
- [x] Ride analytics job implemented for `ride_history_stats` with enqueue triggers on ride completion and late GPS uploads
- [x] Notifications center UX implemented (modal list/filter, mark read/all, unread badge, settings entrypoints)
- [x] Client auth state sync fix for profile edits (`rider_data` + Zustand rider now refresh from API response)
- [x] Workspace-level Copilot context memory setup (`.github/copilot-instructions.md`)
- [x] Workspace hook config draft for context workflow (`.github/hooks/ai-context-memory.json`)

## Known Gaps vs Docs

### Backend: Partial / Missing

- [ ] 2FA/TOTP flow (schema fields exist; auth setup/verify flow not implemented)
- [ ] Remaining background job consumers (rewards/notification/cleanup) on top of the implemented queue + worker foundation
- [ ] Push notifications (FCM/APNs) and email notification delivery infrastructure
- [ ] WebSocket real-time transport for live ride/community events

### Frontend: Missing UX Surface

- [x] Dedicated notifications center screen/drawer (beyond settings/preferences)
- [ ] Community groups UX (browse/create/join/leave)
- [ ] Ride reviews UX on ride detail flows
- [ ] Followers/following list UX from profile/rider detail screens
- [ ] Support agent/admin workflow beyond rider submission and self-history

### Notes

- Database schema coverage is broader than current runtime feature coverage.
- Some features are API-ready but still missing end-user UI flows.

## Prioritized Backlog (P0/P1/P2)

### P0 — High Impact / Foundational

1. ~~Implement support tickets end-to-end (API + basic client UX)~~ (DONE - rider-facing first slice)
2. ~~Add background job infrastructure (queue + worker process)~~ (DONE)
3. ~~Implement ride analytics job to populate `ride_history_stats`~~ (DONE)
4. ~~Build notifications center UX (list + mark-read + preferences entrypoints)~~ (DONE)
5. Add groups and ride reviews UX to unlock existing community APIs

### P1 — Security & Reliability

1. Implement 2FA setup/verify flows and security settings surface
2. Add login activity and active session management APIs + UI
3. Integrate push/email delivery pipelines (respecting notification preferences)
4. Add mention parsing and mention-triggered notification dispatch

### P2 — Realtime & Scale Enhancements

1. Add WebSocket channels for ride joins, stop requests, and other live events
2. Add reliable retry/idempotency around async jobs and notification delivery
3. Refactor data layer from raw SQL to Drizzle ORM or Prisma after feature stabilization

## Next Steps

1. ~~Set up PostgreSQL database connection~~ (DONE)
2. ~~Implement database schema using Raw SQL migrations~~ (DONE — 8 files, 30 tables)
3. ~~Build authentication module~~ (DONE)
4. ~~Build rider profiles CRUD~~ (DONE)
5. ~~Implement remaining database tables~~ (DONE)
6. ~~Build the Rides module API~~ (DONE)
7. ~~Integrate Swagger API documentation~~ (DONE)
8. ~~Build the Routes module API (GeoJSON, bookmarks, sharing, GPS traces)~~ (DONE)
9. ~~Build the Community features API (posts, comments, likes, follows, groups, reviews)~~ (DONE)
10. ~~Build the Rewards engine API (badges, achievements, leaderboard)~~ (DONE)
11. ~~Build the Notifications & Settings API~~ (DONE)
12. **Core server API modules are complete (Auth, Riders, Rides, Routes, Community, Rewards, Notifications)** ✅
13. **Some documented modules remain partial/missing (2FA, push/email infra, background job consumers, websockets, support admin workflow)** ⚠️
14. ~~Initialize Expo React Native client application (`npx create-expo-app`)~~ (DONE)
15. ~~Configure Expo Router, NativeWind (Tailwind), Zustand, and TanStack Query~~ (DONE)
16. ~~Build Authentication Flow (Login/Register)~~ (DONE)
17. ~~Build Main App Shell (Tabs for Feed, Discovery, Routes, Profile)~~ (DONE)
18. ~~Start building detailed UI for core domains (Rides & Routes)~~ (DONE)
19. ~~Implement deep linking and detail screens (Ride Details, Route Preview, Rider Profiles)~~ (DONE)
20. ~~Build UX for Rewards Engine~~ (DONE)
21. ~~Build UX for App Settings & Privacy~~ (DONE)
22. ~~Build UX for Notifications Center~~: Modal rendering unified list, unread/all filter, mark-read actions, and settings/preferences entrypoint. (DONE)
23. Build **UX for Community Groups**: Tab or Modal structures to browse, view, and create `throttlebase` groups under `/api/community/groups`.
24. Build **UX for Followers lists and Ride Reviews**: Extend `/rider/[id]` and `/ride/[id]` with follower/review sub-views.
25. ~~Implement Support module end-to-end~~: API + basic client UX for support tickets. (DONE - rider-facing first slice)
26. Implement **Security module features**: 2FA setup/verify, login activity, active session management.
27. Implement **Notification delivery infra**: push/email workers and preference-aware dispatch.
28. ~~Add Background jobs + queue~~ foundation. Next: wire stats/reward/cleanup processors and enqueue triggers.
29. Add **Realtime transport** (WebSocket channels) for ride/live events where required.
30. **Future Refactor**: Migrate from Raw SQL to Drizzle ORM or Prisma.
31. Validate hook behavior in active tooling and tune script messages/strictness if needed (current config is a non-blocking draft).
