# API Endpoints - ThrottleBase

Every HTTP route and socket event the server exposes, grouped by domain. Built from `server/src/routes/`, `server/src/adapters/http/` and `server/src/realtime/gateway.ts`.

- Base URL: `https://api.throttlebase.in` in production; `http://localhost:5001` locally.
- Auth: `Authorization: Bearer <access token>` on every route unless marked **public**.
- Request bodies are validated with Zod. A validation failure answers `400 { error, details }`.
- Swagger UI at `/api-docs` (and `/openapi.json`, `/swagger.json`) exists only when `ENABLE_SWAGGER_DOCS=true`, behind basic auth (`SWAGGER_USERNAME` / `SWAGGER_PASSWORD`). Otherwise those paths answer 404.
- **Flagged** routes answer `404` unless the server flag is `true` (see [Feature flags](#feature-flags)).

## Platform

- `GET /health` — **public**. Liveness.
- `GET /db-test` — **public**. Database time and PostGIS version.
- `GET /` — **public**. Always `404` (no docs redirect).

## Auth

Passwordless: Google, Apple, or a one-time email code. Handlers in `server/src/adapters/http/authRoutes.ts`; logic in `server/src/core/auth/`.

- `POST /auth/google` — **public**. `{ idToken, acceptedTermsVersion? }`
- `POST /auth/apple` — **public**. `{ identityToken, rawNonce, fullName?, acceptedTermsVersion? }`. `501` until `APPLE_CLIENT_IDS` is set
- `POST /auth/email/start` — **public**. `{ email }`. Sends a code; rate-limited per email and per IP
- `POST /auth/email/verify` — **public**. `{ email, code, acceptedTermsVersion? }`
- `POST /auth/refresh` — **public**. `{ refreshToken }`. Rotates the refresh token; reusing an old one revokes its whole family
- `POST /auth/logout` — revokes the current refresh token
- `POST /auth/logout-all` — revokes every session for the rider
- `GET /.well-known/jwks.json` — **public**. Public signing keys (cached 5 min)

Sign-in responses: `{ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, riderId, isNewRider, needsOnboarding }`. A new account needs `acceptedTermsVersion` matching the server's `TERMS_VERSION`.

## Riders

Account routes (`server/src/adapters/http/riderAccountRoutes.ts`) are mounted before the profile routes.

- `GET /api/riders/username-available?u=`
- `PATCH /api/riders/me/onboarding` — set username (and profile basics) to finish onboarding
- `DELETE /api/riders/me` — soft-delete: unlinks identities, revokes sessions; hard-deleted after 30 days
- `GET /api/riders/me` — own full profile
- `PATCH /api/riders/me` — update own profile
- `GET /api/riders/search?query=&limit=` — username-prefix search for mention suggestions (limit 1–10, default 8)
- `GET /api/riders/:id` — public profile, privacy-aware

## Rides

- `GET /api/rides` — upcoming rides anyone can find, and your own open rides. A ride that needs approval (`visibility: "private"`) you aren't on comes as a preview (`is_preview: true`, see below)
- `GET /api/rides/history` — rides you took part in
- `GET /api/rides/riding` — rides you are riding right now (started, not finished). The background tracker follows these
- `POST /api/rides` — create a ride; you become captain
- `GET /api/rides/:id` — ride with captain, participants and stops. For a ride that needs approval you aren't on: a preview instead, with only `id`, `title`, `status`, `visibility`, `scheduled_at`, `estimated_duration_min`, `max_capacity`, `current_rider_count`, `requirements`, `stop_count`, `captain_id`, `captain_name`, `is_preview: true` and `my_request: { status: none | requested | declined, can_request }`. Never the meeting point, route, stops, description or riders
- `PATCH /api/rides/:id` — captain / co-captain; status transitions validated
- `DELETE /api/rides/:id` — captain; not for active or completed rides
- `POST /api/rides/:id/join` — `{ location_coords?: [lng, lat] }` (where you ride from). Scheduled or active rides only. A public ride is joined at once, enforcing capacity (`outcome: "joined"`, broadcasts `ride:joined`). A ride that needs approval records a request instead (`outcome: "requested"`, holds no seat, broadcasts `ride:roster_changed`; the captain and co-captains are notified). 409 while a request waits; 403 after two declines. A rider who left can join or ask again
- `DELETE /api/rides/:id/join` — withdraw your waiting request. Past declines still count. Broadcasts `ride:roster_changed`
- `POST /api/rides/:id/requests/:riderId` — `{ accept }`: the captain or a co-captain accepts (refused when the ride is full) or declines a waiting request. A declined rider may ask once more. The rider is notified. Broadcasts `ride:roster_changed`
- `POST /api/rides/:id/promote` — captain promotes a rider to co-captain
- `POST /api/rides/:id/leave` — leave before the ride starts (409 once live: finish your ride instead). The captain hands the ride to the next leader, or cancels it with nobody left. Returns `outcome`: `left`, `handed_over` or `ride_cancelled`. Broadcasts `ride:roster_changed`
- `POST /api/rides/:id/captain` — `{ rider_id }`: the captain hands the ride to a confirmed rider, before or during it, and stays on as co-captain. Broadcasts `ride:roster_changed`
- `GET /api/rides/:id` gives the captain `next_captain` — who would lead if they left, or `null` — and the captain and co-captains `join_requests`: `[{ rider_id, display_name, requested_at, decline_count }]`, oldest first
- `PATCH /api/rides/:id/start-location` — your own start point, for auto-start rides
- `GET /api/rides/:id/stops` — riders who may see the ride; 404 otherwise
- `POST /api/rides/:id/stops` — any participant requests a stop. Broadcasts `ride:stop_requested`
- `PATCH /api/rides/:id/stops/:stopId` — captain / co-captain approves or rejects. Broadcasts `ride:stop_updated`
- `POST /api/rides/:id/regroup` — propose somewhere for the group to wait for a rider left behind. Emits `regroup:requested`
- `GET /api/rides/:id/track` — your own recorded track for the ride
- `GET /api/rides/:id/road-feedback` — whether you should be asked "Was the road as described?"
- `PUT /api/rides/:id/road-feedback` — answer or change that answer

### Save a ride as a route

- `GET /api/rides/:id/route/preview` — what saving would produce: `{ saved_route_id, start_name, end_name, distance_km, duration_s, stops: [{ ride_stop_id, name, distance_from_start_km }] }`
- `POST /api/rides/:id/route` — `{ title, visibility, highlights?, stop_notes?: [{ ride_stop_id, note }] }`. `201` created, `200` already saved, `409` ride not completed, `422` too little recorded. Ends are named from the route's own first and last points

### Live session and per-rider progress

- `POST /api/rides/:id/live/start` — captain / co-captain starts or resumes the session
- `POST /api/rides/:id/live/roll-out` — set the group off after the start-point roll call
- `GET /api/rides/:id/live/session` — confirmed participants. Each participant carries `progress`, `finished_at`, `finish_reason`, `arrived_at`, `distance_to_destination_m`. `404` means no session
- `POST /api/rides/:id/live/end` — captain / co-captain. `409 UNFINISHED_RIDERS` lists riders still out unless `{ confirm_unfinished: true }`. Emits `session:ended`
- `POST /api/rides/:id/live/me/start` — start your own ride, up to 60 min before the scheduled time; opens the session if nobody has
- `POST /api/rides/:id/live/me/finish` — `arrived` near the destination, `left_early` elsewhere. Emits `rider:progress`
- `POST /api/rides/:id/live/me/resume` — take back your finish while the ride is live
- `POST /api/rides/:id/live/incident` — confirmed participants
- `POST /api/rides/:id/live/incident/:incidentId/ack` — captain / co-captain
- `GET /api/rides/:id/live/timeline` — ordered session events
- `GET /api/rides/:id/live/replay` — paginated location samples for playback
- `GET /api/live/health` — live module status

## Routes

- `GET /api/routes` — public routes plus your private ones. Each carries `start_name`, `end_name`, `start_lat/lng`, `end_lat/lng`, `via` (stop names in order), `highlights`, `ridden_duration_s`
- `GET /api/routes/search?from_lat&from_lng&from_name&to_lat&to_lng&to_name&min_km&max_km&highlights=a,b` — all optional. A place matches a route end named after it, a stop, or a point within the route's radius (15% of its length, 5–25 km). Same-direction matches first, then reversed. Each result has `match: { direction, start_gap_km, end_gap_km }`. Max 50
- `POST /api/routes`
- `GET /api/routes/:id` — route plus `stops` (position, name, lat/lng, `note`, `distance_from_start_km`), visibility-aware
- `POST /api/routes/:id/bookmark`, `DELETE /api/routes/:id/bookmark`
- `POST /api/routes/:id/share` — share with another rider
- `POST /api/routes/traces` — legacy batch GPS upload. No client uses it
- `GET /api/routes/traces/:rideId` — reads that legacy table

## Maps proxy

The only path to Google. The client never calls `googleapis.com`. Rate-limited to 30 requests/min per caller, with a daily ceiling (`MAX_DAILY_MAPS_CALLS`, default 900).

- `POST /api/maps/directions` — driving directions with optional stopovers
- `GET /api/maps/reverse-geocode?lat&lng`
- `POST /api/maps/places/autocomplete`
- `GET /api/maps/places/:placeId`
- `POST /api/stop-suggestions` — places along a route by stop category. 20/hour and 60/day per caller; cached in `stop_suggestion_cache`; daily ceiling `MAX_DAILY_PLACES_CALLS` (default 500)

## Community

- `GET /api/community/posts` — paginated feed
- `POST /api/community/posts` — mentions are parsed asynchronously
- `GET /api/community/posts/:id`, `PATCH /api/community/posts/:id`, `DELETE /api/community/posts/:id`
- `GET /api/community/posts/:id/comments`, `POST /api/community/posts/:id/comments`
- `GET /api/community/comments/:id`, `PATCH /api/community/comments/:id`, `DELETE /api/community/comments/:id`
- `POST /api/community/posts/:id/like`, `DELETE /api/community/posts/:id/like`
- `POST /api/community/riders/:id/follow`, `DELETE /api/community/riders/:id/follow`
- `GET /api/community/riders/:id/followers`, `GET /api/community/riders/:id/following`
- `GET /api/community/rides/:rideId/reviews`, `POST /api/community/rides/:rideId/reviews` — 1–5 stars

### Groups (flagged: `FEATURE_GROUPS`)

- `GET /api/community/groups`, `POST /api/community/groups`
- `GET /api/community/groups/:id`
- `POST /api/community/groups/:id/join`
- `DELETE /api/community/groups/:id/leave` — anyone can leave; the owner hands the group to the next admin, or ends it as the only member. Returns `outcome`: `left`, `handed_over` or `group_deleted`. `GET /api/community/groups/:id` gives the owner `next_admin`

## Notifications, settings, privacy

- `GET /api/notifications`
- `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`
- `GET /api/notifications/preferences`, `PUT /api/notifications/preferences`
- `GET /api/notifications/settings`, `PATCH /api/notifications/settings`
- `GET /api/notifications/privacy`, `PATCH /api/notifications/privacy`
- `GET /api/notifications/blocked`, `POST /api/notifications/blocked/:id`, `DELETE /api/notifications/blocked/:id`

## Rewards (flagged: `FEATURE_RANK`)

- `GET /api/rewards/badges`, `POST /api/rewards/badges` (admin)
- `GET /api/rewards/badges/me`, `GET /api/rewards/badges/rider/:id`
- `POST /api/rewards/badges/:id/award` (admin)
- `GET /api/rewards/achievements`, `POST /api/rewards/achievements` (admin)
- `GET /api/rewards/achievements/me`
- `GET /api/rewards/leaderboard`

## Support (flagged: `FEATURE_SUPPORT`)

- `GET /api/support`, `POST /api/support`
- `GET /api/support/:id`
- `PATCH /api/support/:id` — rider adds `rider_reply` and/or `close_ticket: true` on their own ticket
- `GET /api/support/admin/tickets` (admin)
- `PATCH /api/support/:id/status` (admin) — status plus optional reply

## Account security (flagged: `FEATURE_ACCOUNT_SECURITY`)

- `GET /api/security/login-activity`
- `GET /api/security/sessions`
- `DELETE /api/security/sessions` — revoke all
- `DELETE /api/security/sessions/:id` — revokes that session's whole refresh family

## Admin

"Admin" means the access token's `roles` include `admin`. Roles come from `rider_roles` and are refreshed on every token refresh. Enforced by `requireAdmin` (`server/src/middleware/admin.middleware.ts`).

## Feature flags

| Feature | Server flag | Client flag | Routes |
| --- | --- | --- | --- |
| Groups | `FEATURE_GROUPS` | `EXPO_PUBLIC_FEATURE_GROUPS` | `/api/community/groups/*` |
| Rank | `FEATURE_RANK` | `EXPO_PUBLIC_FEATURE_RANK` | `/api/rewards/*` |
| Support | `FEATURE_SUPPORT` | `EXPO_PUBLIC_FEATURE_SUPPORT` | `/api/support/*` |
| Account security | `FEATURE_ACCOUNT_SECURITY` | `EXPO_PUBLIC_FEATURE_ACCOUNT_SECURITY` | `/api/security/*` |

## Realtime (Socket.IO)

Same host as the API. The handshake sends the access token (`auth.token` or `Authorization` header); the socket is rejected without a valid one.

### `/live` namespace

Room per session: `ride:<rideId>:session:<sessionId>`. Only confirmed participants may join.

Client → server:

- `session:join`, `session:leave` — `{ rideId }`
- `presence:heartbeat`
- `location:update` — `{ rideId, lat, lon, speed_kmh?, heading_deg?, accuracy_m?, captured_at?, activity?, simulated? }`. `activity` is the phone's motion reading (`automotive`, `cycling`, `walking`, `running`, `stationary`), sent only when recent. Updates older than 2 min, more than 30 s in the future, or out of order are dropped
- `waypoint:reached`
- `incident:create`

Server → client:

- `session:state` — to the joining socket
- `presence:update`
- `location:broadcast`
- `incident:created`
- `rider:progress` — a rider started, finished or resumed
- `ride:arrival` — to the arriving rider only: `{ rideId, state: "arrived" | "left", autoFinishAfterMs }`
- `regroup:requested`, `regroup:decided`
- `session:ended` — `{ rideId, sessionId, endedAt, endedBy, reason }`
- `session:error` — `{ error, code }`

### `/rides` namespace

Lightweight ride-detail updates. Room `ride:<rideId>`; subscribing requires the ride to be public, or you to be captain or a confirmed participant.

- Client → server: `ride:subscribe`, `ride:unsubscribe` — `{ rideId }`
- Server → client: `ride:subscribed`, `ride:joined`, `ride:roster_changed` (someone left or asked to join, a request was answered, or the captain changed), `ride:stop_requested`, `ride:stop_updated`, `ride:error`

Events emitted by the worker process do not reach sockets: the worker has no Socket.IO server. For example, an auto-finish by `ride_progress.sweep` reaches clients on their next poll.
