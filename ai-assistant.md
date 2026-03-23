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

| Decision                               | Rationale                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Port 5001** (not 5000)               | macOS AirPlay Receiver occupies port 5000                                                                                                                                                                                                                                                                                                  |
| **ES Modules**                         | `"type": "module"` + `"module": "NodeNext"` + `"verbatimModuleSyntax": true` for modern imports                                                                                                                                                                                                                                            |
| **Express 5**                          | Latest major version; note: listen errors are passed to callback instead of crashing                                                                                                                                                                                                                                                       |
| **`rootDir: ./src`, `outDir: ./dist`** | Clean separation of source and compiled output                                                                                                                                                                                                                                                                                             |
| **UUID primary keys**                  | All tables use `UUID` with `gen_random_uuid()`                                                                                                                                                                                                                                                                                             |
| **PostGIS**                            | Spatial queries for ride start/end points, regional leaderboards, GPS traces                                                                                                                                                                                                                                                               |
| **Soft delete**                        | `deleted_at` on riders table with 30-day grace period                                                                                                                                                                                                                                                                                      |
| **Denormalized counters**              | `total_rides`, `like_count`, `current_rider_count`, etc. for fast reads                                                                                                                                                                                                                                                                    |
| **Data-driven rewards**                | Badges/achievements defined in DB, not code — new ones added without deploys                                                                                                                                                                                                                                                               |
| **Canonical metric units**             | All data stored in km, km/h, kg, UTC; conversion is client-side                                                                                                                                                                                                                                                                            |
| **Raw SQL migrations**                 | 8 migration files executed via `psql`; future refactor to Drizzle ORM or Prisma planned                                                                                                                                                                                                                                                    |
| **DB Transactions**                    | Ride creation atomically inserts into `rides` + `ride_participants` in one transaction                                                                                                                                                                                                                                                     |
| **EWKT for PostGIS**                   | Coordinates passed as `SRID=4326;POINT(lon lat)` parameterized values, not SQL interpolation                                                                                                                                                                                                                                               |
| **JWT payload key: `riderId`**         | `auth.service.ts` signs `{ riderId, email }` — controllers must access `riderId`, not `id`                                                                                                                                                                                                                                                 |
| **Client TSConfig JSX**                | Required explicit `"jsx": "react-native"` to resolve IDE issues with `@/src/components` imports                                                                                                                                                                                                                                            |
| **NativeWind TS Types**                | Added `nativewind-env.d.ts` reference file to enable React Native components to accept `className`                                                                                                                                                                                                                                         |
| **Expo Router Types**                  | Added `expo-env.d.ts` reference file to fix missing `expo-router` type declarations error                                                                                                                                                                                                                                                  |
| **VSCode Tailwind Linting**            | Added `.vscode/settings.json` with `"css.lint.unknownAtRules": "ignore"` to fix `@tailwind` unknown at-rule warnings                                                                                                                                                                                                                       |
| **Client UI Icons**                    | Using `lucide-react-native` and `react-native-svg` installed with `--legacy-peer-deps` due to React 19 conflict with Expo 55                                                                                                                                                                                                               |
| **Centralized ThemeContext**           | Replaced NativeWind `dark:` class prefix theming (broken on iOS native) with a React Context provider (`src/theme/ThemeContext.tsx`) that delivers resolved hex color values via inline `style={{}}` props. All screens/components use `useTheme()`. Color palette defined in `src/theme/colors.ts`.                                       |
| **LocationPicker + Google Places**     | Replaced blind map-tapping with `src/components/LocationPicker.tsx` — uses `react-native-google-places-autocomplete` for search, `expo-location` for current location, and a draggable `MapView` pin. Stores both coords and place names.                                                                                                  |
| **Google Maps on iOS**                 | Switched all `react-native-maps` instances to use `provider={PROVIDER_GOOGLE}` instead of default Apple Maps.                                                                                                                                                                                                                              |
| **Equidistant Start Point**            | Server-side `src/utils/geo.ts` uses the Geometric Median (Weiszfeld's algorithm, solving the Weber problem) from riders' initial locations. The ride's end point is weighted x2 to pull the meeting point logically closer to the destination. It then snaps to the nearest accessible place (gas station, café) via Google Nearby Search. |
| **Auto-Start Overrides**               | Riders use their global `location_coords` for equidistant start point calculations by default, but can set a `ride_participants.start_location_override` up to 12 hours before the ride begins. Server uses `COALESCE(override, home)`.                                                                                                    |
| **AI Context Memory (Workspace)**      | Added workspace-level Copilot instruction (`.github/copilot-instructions.md`) and hook draft (`.github/hooks/ai-context-memory.json`) with scripts to reinforce reading and updating `ai-assistant.md`.                                                                                                                                    |

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

## Database Tables (30 application tables + 1 PostGIS system table)

All 8 migration files have been executed. Full schema covers: `riders`, `vehicles`, `gear`, `rides`, `ride_participants`, `ride_stops`, `routes`, `route_shares`, `route_bookmarks`, `gps_traces`, `ride_history_stats`, `posts`, `comments`, `likes`, `follows`, `groups`, `group_members`, `ride_reviews`, `badges`, `rider_badges`, `achievements`, `rider_achievements`, `notifications`, `notification_preferences`, `rider_settings`, `rider_privacy_settings`, `blocked_riders`, `login_activity`, `sessions`, `support_tickets`.

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
- [x] Workspace-level Copilot context memory setup (`.github/copilot-instructions.md`)
- [x] Workspace hook config draft for context workflow (`.github/hooks/ai-context-memory.json`)

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
12. **All server-side API modules are complete** ✅
13. ~~Initialize Expo React Native client application (`npx create-expo-app`)~~ (DONE)
14. ~~Configure Expo Router, NativeWind (Tailwind), Zustand, and TanStack Query~~ (DONE)
15. ~~Build Authentication Flow (Login/Register)~~ (DONE)
16. ~~Build Main App Shell (Tabs for Feed, Discovery, Routes, Profile)~~ (DONE)
17. ~~Start building detailed UI for core domains (Rides & Routes)~~ (DONE)
18. ~~Implement deep linking and detail screens (Ride Details, Route Preview, Rider Profiles)~~ (DONE)
19. Build **UX for Rewards Engine**: Leaderboards, Badges, and Achievement screens mapped to `/api/rewards/*`.
20. Build **UX for App Settings & Privacy**: Edit privacy preferences, general settings, and blocklists mapped to `/api/notifications/privacy`.
21. Build **UX for Notifications Center**: Drawer or modal rendering unified lists of notifications and preference toggles.
22. Build **UX for Community Groups**: Tab or Modal structures to browse, view, and create `throttlebase` groups under `/api/community/groups`.
23. Build **UX for Followers lists and Ride Reviews**: Extending `/rider/[id]` and `/ride/[id]` with sub-views mapping follower clusters and review ratings.
24. **Future Refactor**: Migrate from Raw SQL to Drizzle ORM or Prisma
25. Validate hook behavior in active tooling and tune script messages/strictness if needed (current config is a non-blocking draft).
