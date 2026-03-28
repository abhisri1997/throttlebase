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

| Decision                                   | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Port 5001** (not 5000)                   | macOS AirPlay Receiver occupies port 5000                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **ES Modules**                             | `"type": "module"` + `"module": "NodeNext"` + `"verbatimModuleSyntax": true` for modern imports                                                                                                                                                                                                                                                                                                                                                              |
| **Express 5**                              | Latest major version; note: listen errors are passed to callback instead of crashing                                                                                                                                                                                                                                                                                                                                                                         |
| **`rootDir: ./src`, `outDir: ./dist`**     | Clean separation of source and compiled output                                                                                                                                                                                                                                                                                                                                                                                                               |
| **UUID primary keys**                      | All tables use `UUID` with `gen_random_uuid()`                                                                                                                                                                                                                                                                                                                                                                                                               |
| **PostGIS**                                | Spatial queries for ride start/end points, regional leaderboards, GPS traces                                                                                                                                                                                                                                                                                                                                                                                 |
| **Soft delete**                            | `deleted_at` on riders table with 30-day grace period                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Denormalized counters**                  | `total_rides`, `like_count`, `current_rider_count`, etc. for fast reads                                                                                                                                                                                                                                                                                                                                                                                      |
| **Data-driven rewards**                    | Badges/achievements defined in DB, not code — new ones added without deploys                                                                                                                                                                                                                                                                                                                                                                                 |
| **Canonical metric units**                 | All data stored in km, km/h, kg, UTC; conversion is client-side                                                                                                                                                                                                                                                                                                                                                                                              |
| **Raw SQL migrations**                     | 8 migration files executed via `psql`; future refactor to Drizzle ORM or Prisma planned                                                                                                                                                                                                                                                                                                                                                                      |
| **DB Transactions**                        | Ride creation atomically inserts into `rides` + `ride_participants` in one transaction                                                                                                                                                                                                                                                                                                                                                                       |
| **EWKT for PostGIS**                       | Coordinates passed as `SRID=4326;POINT(lon lat)` parameterized values, not SQL interpolation                                                                                                                                                                                                                                                                                                                                                                 |
| **JWT payload key: `riderId`**             | `auth.service.ts` signs `{ riderId, email }` — controllers must access `riderId`, not `id`                                                                                                                                                                                                                                                                                                                                                                   |
| **Client TSConfig JSX**                    | Required explicit `"jsx": "react-native"` to resolve IDE issues with `@/src/components` imports                                                                                                                                                                                                                                                                                                                                                              |
| **NativeWind TS Types**                    | Added `nativewind-env.d.ts` reference file to enable React Native components to accept `className`                                                                                                                                                                                                                                                                                                                                                           |
| **Expo Router Types**                      | Added `expo-env.d.ts` reference file to fix missing `expo-router` type declarations error                                                                                                                                                                                                                                                                                                                                                                    |
| **VSCode Tailwind Linting**                | Added `.vscode/settings.json` with `"css.lint.unknownAtRules": "ignore"` to fix `@tailwind` unknown at-rule warnings                                                                                                                                                                                                                                                                                                                                         |
| **Client UI Icons**                        | Using `lucide-react-native` and `react-native-svg` installed with `--legacy-peer-deps` due to React 19 conflict with Expo 55                                                                                                                                                                                                                                                                                                                                 |
| **Centralized ThemeContext**               | Replaced NativeWind `dark:` class prefix theming (broken on iOS native) with a React Context provider (`src/theme/ThemeContext.tsx`) that delivers resolved hex color values via inline `style={{}}` props. All screens/components use `useTheme()`. Color palette defined in `src/theme/colors.ts`.                                                                                                                                                         |
| **LocationPicker + Google Places**         | Replaced blind map-tapping with `src/components/LocationPicker.tsx` — uses `react-native-google-places-autocomplete` for search, `expo-location` for current location, and a draggable `MapView` pin. Stores both coords and place names.                                                                                                                                                                                                                    |
| **Google Maps on iOS**                     | Switched all `react-native-maps` instances to use `provider={PROVIDER_GOOGLE}` instead of default Apple Maps.                                                                                                                                                                                                                                                                                                                                                |
| **Equidistant Start Point**                | Server-side `src/utils/geo.ts` uses the Geometric Median (Weiszfeld's algorithm, solving the Weber problem) from riders' initial locations. The ride's end point is weighted x2 to pull the meeting point logically closer to the destination. It then snaps to the nearest accessible place (gas station, café) via Google Nearby Search.                                                                                                                   |
| **Auto-Start Overrides**                   | Riders use their global `location_coords` for equidistant start point calculations by default, but can set a `ride_participants.start_location_override` up to 12 hours before the ride begins. Server uses `COALESCE(override, home)`.                                                                                                                                                                                                                      |
| **AI Context Memory (Workspace)**          | Added workspace-level Copilot instruction (`.github/copilot-instructions.md`) and hook draft (`.github/hooks/ai-context-memory.json`) with scripts to reinforce reading and updating `ai-assistant.md`.                                                                                                                                                                                                                                                      |
| **Client Rider Sync Pattern**              | Added `syncRider` and `syncRiderFromResponse` in `client/src/store/authStore.ts`; profile edit now syncs `rider_data` (AsyncStorage) and Zustand state from `PATCH /api/riders/me` response before query invalidation, preventing stale rider data after save/restart.                                                                                                                                                                                       |
| **Home Location Persistence Hardening**    | `edit-profile` now hydrates from latest `/api/riders/me` data (not auth payload alone), normalizes multiple `location_coords` shapes, and passes both `initialCoords` + `initialName` to `LocationPicker` so saved home location reliably displays after save/reopen. The exact selected place label is persisted via `home_location_name` in `rider_data` and merged during reopen to avoid fallback strings like `Bangalore, string`.                      |
| **Post Shareable Link Payload**            | `PostCard` share action now includes a clickable link (`throttlebase://post/:id`) and, when `EXPO_PUBLIC_SHARE_BASE_URL` is configured, also includes a web URL (`https://.../post/:id`) so recipients can open in app or website.                                                                                                                                                                                                                           |
| **Shared Post Unauthorized UX**            | `app/post/[id].tsx` now distinguishes 401/403 from real 404s: unauthenticated visitors see a login-required message instead of `Post not found`, comment fetches are disabled until the post loads, and back navigation falls back to login/feed when there is no browser/app history entry.                                                                                                                                                                 |
| **Global Unauthorized Notice**             | `client/src/api/client.ts` now emits a generic auth notice for protected-resource 401/403 responses, and `client/app/_layout.tsx` renders a root-level dismissible banner from Zustand state. Auth endpoints are excluded so failed login attempts do not show the global `Login required to continue.` notice.                                                                                                                                              |
| **Post-Login Return Redirect**             | `client/app/_layout.tsx` guards protected routes globally and forwards unauthenticated users to `/(auth)/login?redirectTo=<path>`. `client/app/(auth)/login.tsx` now redirects to `redirectTo` after successful login, enabling shared links (e.g. `/post/:id`) to return users to the original page.                                                                                                                                                        |
| **Post-Register Return Redirect**          | `client/app/(auth)/register.tsx` now mirrors login behavior by honoring `redirectTo` after successful sign-up/login, and login/register cross-links preserve `redirectTo` so shared-link users return to the original post after creating an account.                                                                                                                                                                                                        |
| **NativeWind Dark Mode Class Mode**        | Tailwind is configured with `darkMode: class` and app startup calls NativeWind dark-mode class flag in `client/app/_layout.tsx` to prevent web runtime error: `Cannot manually set color scheme, as dark mode is type 'media'.`                                                                                                                                                                                                                              |
| **Deprecated Pointer Events Prop**         | Replaced `pointerEvents` prop usage with `style.pointerEvents` on the global auth-notice container in `client/app/_layout.tsx` to satisfy web deprecation guidance.                                                                                                                                                                                                                                                                                          |
| **Auth Palette Consistency**               | `client/app/(auth)/register.tsx` now uses `ThemeContext` color tokens (`bg`, `surface`, `border`, `text`, `textMuted`, `primary`) and adaptive status bar style to match the login screen and the rest of the app palette in both dark and light themes.                                                                                                                                                                                                     |
| **Validation Error UX Normalization**      | Added `client/src/utils/apiError.ts` and switched client mutation error alerts (auth, rides, groups, profile, support, route bookmarking) to parse server `details/errors` arrays into field-aware messages (e.g., `Password: Password must be at least 8 characters`) instead of showing generic `Validation failed`.                                                                                                                                       |
| **Register Token Contract Fix**            | `POST /auth/register` returns only `{ message, rider }`; `client/app/(auth)/register.tsx` now performs `/auth/login` after successful registration before persisting auth state, preventing undefined `jwt_token` writes in AsyncStorage.                                                                                                                                                                                                                    |
| **Session:ended Socket Fanout**            | `endLiveSession` (REST) now fans out `session:ended` to the socket room via a module-level `emitToLiveRoom` helper exported from `server/src/realtime/gateway.ts`. The gateway stores its namespace in a module-scoped variable set during `createLiveGateway`. Controller imports `emitToLiveRoom` + `buildLiveRoomKey` and calls them after a confirmed DB end. Client `liveSessionStore` handles the event to zero-out presence and show a reason banner. |
| **Followers/Following UX**                 | `GET /api/riders/:id` now returns `follower_count`, `following_count` (subqueries on `follows` table) and `is_following` (viewer context in controller). `client/app/follow-list.tsx` added as a push screen with `riderId`+`mode` params and inline follow/unfollow. Profile and rider detail stats bars are now tappable and navigate to the list.                                                                                                         |
| **Followers/Following Reliability**        | Hardened follow list behavior across backend and client: `GET /api/community/riders/:id/followers                                                                                                                                                                                                                                                                                                                                                            | following`now returns`is_following`in viewer context, follow-action taps no longer conflict with row navigation in`client/app/follow-list.tsx`, and pull-to-refresh was added to both `client/app/follow-list.tsx`and`client/app/(tabs)/profile.tsx` for fast state reconciliation. |
| **Web Share API Fallback**                 | `PostCard` now avoids calling `Share.share` on browsers without Web Share support; it tries `navigator.share`, then clipboard copy, then prompt copy, preventing `Share is not supported in this browser` runtime errors.                                                                                                                                                                                                                                    |
| **Support Center First Slice**             | Support tickets now follow the existing schema/controller/service/route pattern on the server (`/api/support`) and a basic client support center lives under `client/app/(modals)/support.tsx`, reachable from Settings. This delivers immediate rider-facing bug/account/dispute reporting without waiting for the future admin/backoffice workflow.                                                                                                        |
| **Background Jobs Foundation (P0 Step 2)** | Added migration `010_background_jobs.sql` plus queue + worker runtime under `server/src/queue/*` and `server/src/workers/*`. Worker uses `node-cron` polling, PostgreSQL row leasing (`FOR UPDATE SKIP LOCKED`), retry backoff, and expired-lock recovery. Domain-specific processors (ride stats/rewards/notifications) are intentionally deferred to next steps.                                                                                           |
| **Ride Analytics Pipeline (P0 Step 3)**    | Worker `ride_stats.recompute` now executes real computation via `server/src/services/stats.service.ts`: per-rider distance/time/speed/elevation/calories from `gps_traces`, upsert to `ride_history_stats`, and rider aggregate refresh. Enqueue hooks now fire on ride completion (`ride.service.ts`) and on late GPS ingest for completed rides (`route.service.ts`) through `server/src/services/jobs.service.ts`.                                        |
| **Queue Lease SQL Disambiguation**         | In `server/src/queue/queue.ts`, leasing query `RETURNING` uses aliased columns (`JOB_COLUMNS_LEASE` with `j.`), while non-aliased queries keep standard `JOB_COLUMNS`. This avoids PostgreSQL `42702` ambiguity in lease paths without breaking enqueue/fail paths (`42P01` missing FROM-clause for `j`).                                                                                                                                                    |
| **Notifications Center UX (P0 Step 4)**    | Added dedicated modal `client/app/(modals)/notifications.tsx` with unread/all filtering, per-item mark read, mark-all read, pull-to-refresh, unread count badge, and settings/preferences entrypoint. Added feed header bell shortcut with unread badge and settings shortcut to open the notifications center.                                                                                                                                              |
| **Rewards Contract Alignment**             | Fixed rewards/ranking UI contract drift in `client/app/(tabs)/rewards.tsx`: leaderboard now sends `metric` (`total_distance_km                                                                                                                                                                                                                                                                                                                               | total_rides                                                                                                                                                                                                                                                                         | badges_earned`) and reads matching response keys (`total_distance_km`, `total_rides`, `badges_earned`). Achievements now render `reward_description`instead of a non-existent`description` field. |
| **Rewards Distance Display + Refresh**     | Updated `client/app/(tabs)/rewards.tsx` to preserve decimal distance precision on leaderboard (avoid whole-km rounding that displayed `0 km` for sub-1km totals) and added pull-to-refresh for rewards/ranking to refetch leaderboard, badges, and achievements in one gesture.                                                                                                                                                                              |
| **Rewards/Profile Rides Parity**           | Updated server leaderboard rides metric in `server/src/services/rewards.service.ts` to aggregate from `ride_history_stats` (same source used to refresh rider profile totals) instead of counting raw `ride_participants`, reducing profile vs rank drift.                                                                                                                                                                                                   |
| **Groups UX First Slice (P0 Step 5)**      | Added Groups tab and flows: `client/app/(tabs)/groups.tsx` (list + join + pull-to-refresh), `client/app/group/[id].tsx` (detail + members + join/leave state), and `client/app/(modals)/create-group.tsx` (create form). Added backend `GET /api/community/groups/:id` with membership context and member list.                                                                                                                                              |
| **Ride Reviews Policy + UX (P0 Step 5)**   | Enforced server-side review policy in `server/src/services/community.service.ts`: only participants can review, and only after ride status is `completed`. Client `client/app/ride/[id].tsx` now renders ratings, review list, pull-to-refresh, and conditional review submission UI with clear gating states.                                                                                                                                               |
| **Ride Detail Visibility Guard**           | `GET /api/rides/:id` now resolves with caller context; `active` rides are accessible only by captain/confirmed participants, and private/non-active rides remain participant-only. Prevents direct-link exposure beyond discover-list filtering.                                                                                                                                                                                                             |
| **Group ID Validation Hardening**          | `client/app/group/[id].tsx` now decodes and validates UUID route params before querying, so malformed IDs show an explicit invalid-link state instead of triggering generic failed-fetch errors.                                                                                                                                                                                                                                                             |

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
| GET    | `/api/community/groups/:id`            | Yes  | Get group details + membership context          |
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
- [x] Rewards/ranking data binding fix implemented (leaderboard metric param + response key alignment)
- [x] Rewards/profile parity improvement implemented for leaderboard rides metric (`ride_history_stats` aligned)
- [x] Community groups UX first slice implemented (groups tab, detail, create, join/leave)
- [x] Groups API hardening completed (`/api/community/groups` supports `scope=all|public|joined`, returns `is_member` + `current_user_role`, and `join` now blocks unauthorized private-group joins with explicit error/status payloads)
- [x] Groups UX polish completed (top-right filter control, join-button hidden for existing members/admins, create-group redirect stabilized, and create FAB moved to bottom-right above tab bar)
- [x] Private-group visibility recovery fix completed: groups listing/detail now self-heals missing creator admin memberships (backfills `group_members` rows) and includes creator-owned groups in `joined`/`all` scopes so legacy private groups remain visible/openable.
- [x] Discover rides filtering and visibility hardening completed: `/api/rides` now supports `status=all|draft|scheduled|active`; public discover feed only exposes `scheduled` rides to non-participants, while `active` rides are visible only to captain/participants.
- [x] Notifications bell parity completed across all tabs via shared `NotificationBell` component (Feed, Rides, Routes, Groups, Rewards, Profile).
- [x] Group detail navigation hardening completed in `client/app/group/[id].tsx` by normalizing dynamic `id` route params before API calls, preventing invalid-path fetch attempts that surfaced as `Failed to load group.`
- [x] Group route opening fix completed: switched groups list/create navigation to explicit path form (`/group/<id>`) from object-based dynamic navigation, and added an explicit invalid-id guard in `client/app/group/[id].tsx` to prevent silent empty-param failures.
- [x] Group membership context hardening completed: group creators are consistently represented as members/admins in list/detail payloads even when legacy `group_members` rows were missing.
- [x] Ride detail visibility hardening completed: `/api/rides/:id` now enforces participant-only access for `active` rides and participant-only access for private rides.
- [x] Live Group Ride Session Phase 0 scaffold completed: migrations `011`-`015` added (`ride_live_sessions`, `ride_live_presence`, `ride_live_events`, `ride_live_location_samples`, `ride_live_incidents` + indexes), and backend module scaffolding added via `live-session` schema/service/controller/route with `/api/live/health` protected status endpoint.
- [x] Live Group Ride Session Phase 0 local verification completed: migrations `011`-`015` applied on local PostgreSQL, `/api/live/health` returned all table flags as `true`, and integration test script (`server/test.ts`, runnable via `npm run test:live-health`) passed.
- [x] Live Group Ride Session Phase 1 REST lifecycle completed: `POST /api/rides/:id/live/start`, `POST /api/rides/:id/live/end`, `GET /api/rides/:id/live/session`, `POST /api/rides/:id/live/incident`, and `POST /api/rides/:id/live/incident/:incidentId/ack` are implemented with role checks and integration-tested in `server/test.ts`.
- [x] Live Group Ride Session Phase 1 runtime hardening completed: fixed nullable SQL parameter typing in `endLiveSession` (`COALESCE($3::text, ended_reason)` + event payload cast) to prevent PostgreSQL `42P18` during end-session when `reason` is absent.
- [x] Live Group Ride Session Phase 2 backend foundation started: added Socket.IO dependencies, gateway bootstrap in `server/src/app.ts`, and new realtime modules (`server/src/realtime/auth.ts`, `server/src/realtime/session-room.ts`, `server/src/realtime/gateway.ts`) with `/live` namespace handlers for `session:join|leave`, `presence:heartbeat`, `location:update`, and `incident:create`.
- [x] Live Group Ride Session Phase 2 reliability hardening (backend) started: socket `session:leave` and disconnect paths now persist offline presence state via `markLivePresenceOffline` in `server/src/services/live-session.service.ts` and `server/src/realtime/gateway.ts`, keeping DB presence consistent with socket broadcasts.
- [x] Live Group Ride Session async pipeline scaffolding started: added queue job types (`live_session.started`, `live_session.ended`, `live_session.incident_reported`), producer helpers in `server/src/services/jobs.service.ts`, lifecycle enqueue hooks in `server/src/services/live-session.service.ts`, and worker processor stubs registered in `server/src/workers/worker.ts`.
- [x] Live Group Ride Session async notifications processing completed: `server/src/workers/processors/live-session.processor.ts` and `server/src/workers/processors/live-notification.processor.ts` now create in-app notifications for lifecycle/incident jobs, filter recipients via `notification_preferences.in_app_enabled`, and apply retry-safe dedupe keys in notification `data`.
- [x] Live Group Ride Session async notifications verification completed: `server/test.ts` now asserts notification side effects for live session start/incident/end flows, including recipient inclusion/exclusion, preference filtering, metadata payload checks, and dedupe behavior under repeated processor execution.
- [x] Live Group Ride Session Phase 3 client MVP started: added `client/src/services/liveSessionSocket.ts` (Socket.IO auth + event transport), `client/src/store/liveSessionStore.ts` (session/presence/location/incident state + actions), and integrated initial live controls in `client/app/ride/[id].tsx` (start/end/join/leave/SOS, heartbeat loop, session status panel behind `EXPO_PUBLIC_ENABLE_LIVE_SESSION` flag).
- [x] Live Group Ride Session Phase 3 continuation completed (lifecycle + map slice): `client/src/store/liveSessionStore.ts` now uses server-confirmed room joins (`session:state`) with `isJoining` state and ride-context helpers; `client/app/ride/[id].tsx` now handles app foreground/background behavior for heartbeat/location loops, auto-rejoin on active state, and renders live participant map markers from socket `location:broadcast` updates.
- [x] Live Group Ride Session Phase 3 safety UX hardening completed: `client/app/ride/[id].tsx` SOS action now requires explicit confirmation and attaches best-effort current/last-known coordinates before dispatching via socket/REST.
- [x] Live Group Ride Session Phase 4 ops hardening started: recurring worker jobs `live_session.presence_sweep` and `live_session.incident_escalate` are now scheduled from `server/src/workers/worker.ts` with processors in `server/src/workers/processors/live-ops.processor.ts` for heartbeat timeout offline reconciliation and unacknowledged high/critical incident escalation notifications.
- [x] Live Group Ride Session map/presence UX polish and session-ended fanout completed: `session:ended` socket event emitted from REST controller after DB end (via `emitToLiveRoom` helper in `gateway.ts`); client store handles the event by marking session ended + all presence offline + storing `sessionEndedReason`; ride detail shows ended banner with reason, live participant presence chips (online dot + speed), and auto-fits MapView to all online riders on location change. Markers now show speed (km/h) and heading (degrees) in callout description.
- [x] Leader start-flow simplification completed: in `client/app/ride/[id].tsx`, the primary `Start Ride` CTA now starts live session for leaders (live-enabled path) instead of running a separate status-only mutation, while preserving status-only fallback when live is disabled. Duplicate `Start Live` CTA is hidden for `scheduled` rides so leaders see one primary start action.
- [x] Live location payload validation fix completed: `client/app/ride/[id].tsx` now sanitizes `heading_deg` and `accuracy_m` before socket emit (`location:update`) so invalid Expo values (for example iOS heading `-1` when direction is unavailable) are omitted instead of triggering server-side Zod rejection (`Invalid location:update payload`).
- [x] Ride lifecycle now owns live-session lifecycle in ride detail UX: manual `Leave Room` and `End Live` actions were removed from `client/app/ride/[id].tsx`; leaders complete rides through the primary `Complete Ride` CTA, which calls `/live/end` with `mark_ride_completed: true` when a live session is active. Participant rows now expose profile navigation by making the identity block pressable and routing to `/rider/:id` without interfering with captain-only promote actions.
- [x] Profile handle display fallback updated: both `client/app/(tabs)/profile.tsx` and `client/app/rider/[id].tsx` now prefer `username`, then a normalized `display_name`, then email local-part (own profile only) before falling back to `rider`, eliminating persistent `@rider` labels when username is unavailable in payloads.
- [x] Client-side API validation messaging hardening completed: shared parser in `client/src/utils/apiError.ts` now surfaces server `details/errors` messages across auth and major mutation flows instead of generic top-level errors.
- [x] Register flow contract and resilience fix completed: register now logs in via `/auth/login` before auth-store persistence, and `authStore.login` guards against invalid token/rider payloads to avoid AsyncStorage undefined-value crashes.
- [x] Username identity flow hardening completed: migration `016_add_username_to_riders.sql` has been applied on local DB (verified `username` column plus `riders_username_key` and `idx_riders_username` indexes), and `client/app/(auth)/register.tsx` now shows explicit username status feedback (`checking`, `available`, `taken`, `invalid`, and `verification error`) with submit gating when availability cannot be confirmed.
- [x] Email-or-username login completed across backend + UI: `POST /auth/login` now accepts `identifier` (email or username), auth service resolves case-insensitively against either field, login payload/docs were updated, `client/app/(auth)/login.tsx` now uses a single "Email or Username" field, and register's post-signup auto-login sends `identifier` for contract consistency.
- [x] Ride reviews UX first slice implemented in ride detail (list, submit, policy-aware gating)
- [x] Client auth state sync fix for profile edits (`rider_data` + Zustand rider now refresh from API response)
- [x] Workspace-level Copilot context memory setup (`.github/copilot-instructions.md`)
- [x] Workspace hook config draft for context workflow (`.github/hooks/ai-context-memory.json`)

## Known Gaps vs Docs

### Backend: Partial / Missing

- [ ] 2FA/TOTP flow (schema fields exist; auth setup/verify flow not implemented)
- [ ] Remaining background job consumers (rewards/notification/cleanup) on top of the implemented queue + worker foundation
- [ ] Push notifications (FCM/APNs) and email notification delivery infrastructure
- [ ] Live session timeline/replay APIs and session-ended socket event fanout are not implemented yet

### Frontend: Missing UX Surface

- [x] Dedicated notifications center screen/drawer (beyond settings/preferences)
- [x] Community groups UX (browse/create/join/leave)
- [x] Live session map/presence UX polish (real-time rider markers/timeline, reconnect/background behavior hardening)
- [x] Ride reviews UX on ride detail flows
- [x] Followers/following list UX implemented and hardened: viewer-context `is_following` now comes from both `/api/riders/:id` and follower-list endpoints, `client/app/follow-list.tsx` avoids nested-tap conflicts for follow/unfollow actions, and pull-to-refresh is enabled on both follow-list and profile screens.
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
5. ~~Add groups and ride reviews UX to unlock existing community APIs~~ (DONE - first slice, follower lists still pending)

### P1 — Security & Reliability

1. Implement 2FA setup/verify flows and security settings surface
2. Add login activity and active session management APIs + UI
3. Integrate push/email delivery pipelines (respecting notification preferences)
4. Add mention parsing and mention-triggered notification dispatch

### P2 — Realtime & Scale Enhancements

1. Add WebSocket channels for ride joins, stop requests, and other live events
2. Add reliable retry/idempotency around async jobs and notification delivery
3. Refactor data layer from raw SQL to Drizzle ORM or Prisma after feature stabilization

## Live Group Ride Session Rollout Plan (Phased Implementation)

Goal: Enable coordinated real-time group riding after `Start Ride` with participant-only live tracking, captain/co-captain controls, safety workflows, and resilient realtime transport.

### Scope Boundaries

In scope for this rollout:

- Session lifecycle (`scheduled` -> `active` -> `completed`) tied to ride state
- Real-time participant location streaming and map playback for active sessions
- Role-aware controls (captain/co-captain/member)
- Safety events (SOS/manual incident/reporting) with notification fanout
- Presence, heartbeat, and reconnect semantics

Out of scope for first production slice:

- Voice chat
- Offline turn-by-turn navigation engine
- Public spectator mode

### Phase 0 — Foundation and Contracts (1 sprint)

Objective: Introduce schema + typed contracts without changing user-visible behavior.

Database migrations:

1. `011_live_group_sessions.sql`
2. `012_live_session_events.sql`
3. `013_live_location_samples.sql`
4. `014_live_session_incidents.sql`
5. `015_live_session_indexes_and_retention.sql`

Proposed tables:

- `ride_live_sessions`
  - `id UUID PK`
  - `ride_id UUID UNIQUE NOT NULL` (one active session per ride)
  - `status TEXT CHECK (status IN ('starting','active','paused','ended'))`
  - `started_by UUID`, `started_at TIMESTAMPTZ`
  - `ended_by UUID`, `ended_at TIMESTAMPTZ`
  - `ended_reason TEXT`
  - `created_at`, `updated_at`
- `ride_live_presence`
  - `session_id UUID`, `rider_id UUID`, `role TEXT`
  - `is_online BOOLEAN`, `last_heartbeat_at TIMESTAMPTZ`
  - `last_location GEOGRAPHY(POINT,4326)`
  - PK `(session_id, rider_id)`
- `ride_live_location_samples`
  - `id BIGSERIAL PK`
  - `session_id UUID`, `rider_id UUID`
  - `location GEOGRAPHY(POINT,4326)`
  - `speed_kmh NUMERIC`, `heading_deg NUMERIC`, `accuracy_m NUMERIC`
  - `captured_at TIMESTAMPTZ`
- `ride_live_events`
  - `id BIGSERIAL PK`
  - `session_id UUID`, `actor_rider_id UUID`
  - `event_type TEXT` (`session_started`, `rider_joined`, `incident_reported`, etc.)
  - `payload JSONB`
  - `created_at TIMESTAMPTZ`
- `ride_live_incidents`
  - `id UUID PK`
  - `session_id UUID`, `rider_id UUID`
  - `severity TEXT` (`low|medium|high|critical`)
  - `kind TEXT` (`sos|crash|medical|mechanical|other`)
  - `status TEXT` (`open|acknowledged|resolved`)
  - `location GEOGRAPHY(POINT,4326)`
  - `metadata JSONB`
  - `created_at`, `resolved_at`, `resolved_by`

Server files to add/update:

- Add schemas: `server/src/schemas/live-session.schemas.ts`
- Add service: `server/src/services/live-session.service.ts`
- Add controller: `server/src/controllers/live-session.controller.ts`
- Add routes: `server/src/routes/live-session.routes.ts`
- Register route in `server/src/app.ts`

Exit criteria:

- Migrations apply cleanly on local and staging
- TS compile clean on server and client
- No endpoint behavior changes for existing rides/groups paths

### Phase 1 — REST Session Lifecycle APIs (1 sprint)

Objective: Add explicit lifecycle APIs and role checks before socket transport.

New endpoints:

1. `POST /api/rides/:id/live/start`
   - Auth: captain/co-captain only
   - Preconditions: ride status = `scheduled` or `active`; caller is participant
   - Action: set ride status to `active` if needed, create `ride_live_sessions`
2. `POST /api/rides/:id/live/end`
   - Auth: captain/co-captain only
   - Action: end live session + optionally mark ride `completed`
3. `GET /api/rides/:id/live/session`
   - Auth: confirmed participants only
   - Returns session metadata + participant presence summary
4. `POST /api/rides/:id/live/incident`
   - Auth: confirmed participants only
   - Creates incident and event record
5. `POST /api/rides/:id/live/incident/:incidentId/ack`
   - Auth: captain/co-captain only

Server implementation notes:

- Keep role checks centralized in `live-session.service.ts`
- Reuse participant checks from `ride.service.ts` semantics (`status='confirmed'`)
- Emit durable domain events into `ride_live_events`
- Create notification jobs via existing queue (`server/src/services/jobs.service.ts`)

Testing:

- Add integration tests in `server/test.ts` style for start/end/incident flows
- Validate 401/403/404 boundaries for non-participants and private rides

Exit criteria:

- Lifecycle APIs stable and documented in Swagger
- Existing ride detail/list behavior remains unchanged

### Phase 2 — Socket Gateway and Presence (1 sprint)

Objective: Real-time channel with authenticated rooms and heartbeat-based presence.

Dependencies:

- Add package: `socket.io` (server), `socket.io-client` (client)

Server architecture:

- Add `server/src/realtime/gateway.ts`
- Add `server/src/realtime/auth.ts` for JWT handshake validation
- Add `server/src/realtime/session-room.ts` room manager
- Hook server bootstrap in `server/src/app.ts` (HTTP server + socket server)

Socket namespace and rooms:

- Namespace: `/live`
- Room key: `ride:<rideId>:session:<sessionId>`

Core socket events:

1. Client -> Server
   - `session:join` `{ rideId }`
   - `session:leave` `{ rideId }`
   - `presence:heartbeat` `{ rideId, ts }`
   - `location:update` `{ rideId, lon, lat, speedKmh?, headingDeg?, accuracyM?, capturedAt }`
   - `incident:create` `{ rideId, kind, severity, lon, lat, metadata? }`
2. Server -> Client
   - `session:state` `{ status, startedAt, participants[] }`
   - `presence:update` `{ riderId, isOnline, lastHeartbeatAt }`
   - `location:broadcast` `{ riderId, lon, lat, speedKmh, headingDeg, capturedAt }`
   - `incident:created` `{ incidentId, riderId, severity, kind, createdAt }`
   - `session:ended` `{ endedAt, endedBy, reason }`

Data policy:

- Broadcast location at 2-5 second cadence
- Persist sampled points every N updates (for example, every 3rd) to reduce write pressure
- Drop stale out-of-order location updates older than configured threshold

Exit criteria:

- Reconnect works with token refresh
- Presence transitions online/offline reliably
- No unauthorized room joins

### Phase 3 — Client Live Session UX (1-2 sprints)

Objective: Add in-app live ride controls and participant map experience.

Client files to add:

- `client/src/services/liveSessionSocket.ts`
- `client/src/store/liveSessionStore.ts` (Zustand)
- `client/src/hooks/useLiveSession.ts`
- `client/app/ride/[id]/live.tsx` (or section in existing `client/app/ride/[id].tsx`)
- `client/src/components/LiveRiderMarker.tsx`
- `client/src/components/LiveSessionControls.tsx`

Client behaviors:

- Captain/co-captain sees `Start Live Session` and `End Session`
- Participants can join room when session active
- Map renders participant markers, own location trail, and safety banner
- SOS button confirms intent, then sends incident event
- Background/resume rejoin logic with heartbeat recovery

Feature flags:

- `EXPO_PUBLIC_ENABLE_LIVE_SESSION`
- Hide controls and socket startup when flag is false

Exit criteria:

- Live map updates in under target latency budget
- Session state survives app background/foreground cycles

### Phase 4 — Notifications, Safety, and Ops Hardening (1 sprint)

Objective: Connect incidents and session transitions to durable notification pipelines.

Backend work:

- Add job producers for:
  - `live_session.started`
  - `live_session.ended`
  - `live_session.incident_reported`
- Add worker consumers in `server/src/workers/processors/*`
- Respect user notification preferences and privacy settings

Safety policies:

- Critical incident auto-notifies captain/co-captains and configured emergency contacts (when available)
- Add escalation timer job for unacknowledged high/critical incidents

Observability:

- Structured logs for each socket event type
- Metrics:
  - active sessions count
  - join success/failure rate
  - heartbeat timeout rate
  - p50/p95 location broadcast delay
  - incident ack latency

Exit criteria:

- Alerts configured for gateway disconnect spikes and incident ack SLA misses
- Notification fanout validated end-to-end

### Phase 5 — Gradual Rollout Strategy (staged)

Rollout order:

1. Internal dev accounts only (feature flag on)
2. Staging dogfood with synthetic load (20-50 concurrent riders)
3. Production canary at 5% eligible rides
4. Ramp to 25%, then 50%, then 100% over monitored windows

Rollback plan:

- Kill switch using `EXPO_PUBLIC_ENABLE_LIVE_SESSION` + server env `LIVE_SESSION_ENABLED=false`
- Keep REST lifecycle endpoints but disable socket room joins when killed
- Preserve DB writes for forensic debugging; stop broadcasts first

Go/no-go checklist before each ramp:

1. Error rate below threshold
2. Socket reconnect success above threshold
3. No unauthorized access incidents
4. Incident notifications delivered within SLA

## Detailed Implementation Checklist (Codebase-Specific)

### Server

1. Add migrations `011`-`015` under `server/src/db/migrations/`
2. Add Zod schema file `server/src/schemas/live-session.schemas.ts`
3. Add service `server/src/services/live-session.service.ts`
4. Add controller `server/src/controllers/live-session.controller.ts`
5. Add routes `server/src/routes/live-session.routes.ts`
6. Mount route in `server/src/app.ts`
7. Add socket gateway under `server/src/realtime/*`
8. Wire queue producers/consumers for live events
9. Extend swagger docs in `server/src/config/swagger.ts`

### Client

1. Add socket service/store/hooks in `client/src/services/`, `client/src/store/`, `client/src/hooks/`
2. Add live ride UI in `client/app/ride/[id].tsx` or nested route
3. Add participant marker and control components in `client/src/components/`
4. Add feature-flag guards in app bootstrap/layout
5. Add pull-to-refresh fallback when socket unavailable

### QA and Validation

1. API contract tests for lifecycle and incidents
2. Permission matrix tests for captain/co-captain/member/non-member
3. Socket soak tests with concurrent simulated riders
4. Battery/network resilience tests on mobile (background/resume)
5. Security checks for JWT handshake and room authorization

### Suggested Phase Ownership

1. Phase 0-1: backend/API team
2. Phase 2: backend realtime + platform
3. Phase 3: mobile team + map UX
4. Phase 4: backend jobs + notifications
5. Phase 5: release engineering + QA

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
23. ~~Build **UX for Community Groups**: Tab or Modal structures to browse, view, and create `throttlebase` groups under `/api/community/groups`.~~ (DONE - tab + detail + create)
24. Build **UX for Followers lists and Ride Reviews**: Extend `/rider/[id]` and `/ride/[id]` with follower/review sub-views. (DONE - ride reviews done; followers/following list UX done via `client/app/follow-list.tsx`)
25. ~~Implement Support module end-to-end~~: API + basic client UX for support tickets. (DONE - rider-facing first slice)
26. Implement **Security module features**: 2FA setup/verify, login activity, active session management.
27. Implement **Notification delivery infra**: push/email workers and preference-aware dispatch.
28. ~~Add Background jobs + queue~~ foundation. Next: wire stats/reward/cleanup processors and enqueue triggers.
29. Add **Realtime transport** (WebSocket channels) for ride/live events where required.
30. **Future Refactor**: Migrate from Raw SQL to Drizzle ORM or Prisma.
31. Validate hook behavior in active tooling and tune script messages/strictness if needed (current config is a non-blocking draft).

## Recent AI Assistant Updates

- Added workspace skill [`.github/skills/git-commit-organizer/SKILL.md`](.github/skills/git-commit-organizer/SKILL.md) to standardize "check status -> group relevant commits -> commit -> push" workflow.
- Skill includes commit-boundary decision logic, staged-diff validation checks, push/rebase handling, and quoted-path safety for files like `[id].tsx`.
