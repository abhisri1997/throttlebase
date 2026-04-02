# API Endpoints - ThrottleBase

This inventory groups active API surfaces by domain for quick implementation and QA navigation.
For request/response schema details, use Swagger at `/api-docs`.

## Auth

- `POST /auth/register`
- `POST /auth/login` (accepts `identifier` + `password`, and optional `totp_token` when 2FA challenge is required)
- `GET /auth/check-username`
- `GET /auth/2fa/status`
- `POST /auth/2fa/setup`
- `POST /auth/2fa/verify`
- `POST /auth/2fa/disable`

## Security

- `GET /api/security/login-activity`
- `GET /api/security/sessions`
- `DELETE /api/security/sessions`
- `DELETE /api/security/sessions/:id`

## Riders

- `GET /api/riders/me`
- `PATCH /api/riders/me`
- `DELETE /api/riders/me`
- `GET /api/riders/:id`

## Rides

- `GET /api/rides`
- `POST /api/rides`
- `GET /api/rides/:id`
- `PATCH /api/rides/:id`
- `POST /api/rides/:id/join`
- `POST /api/rides/:id/promote`
- `GET /api/rides/:id/stops`
- `POST /api/rides/:id/stops`
- `PATCH /api/rides/:id/stops/:stopId`

## Routes

- `GET /api/routes`
- `POST /api/routes`
- `POST /api/routes/traces`
- `GET /api/routes/traces/:rideId`
- `GET /api/routes/:id`
- `POST /api/routes/:id/bookmark`
- `DELETE /api/routes/:id/bookmark`
- `POST /api/routes/:id/share`

## Community

- `GET /api/community/posts`
- `POST /api/community/posts`
- `GET /api/community/posts/:id`
- `DELETE /api/community/posts/:id`
- `GET /api/community/posts/:id/comments`
- `POST /api/community/posts/:id/comments`
- `POST /api/community/posts/:id/like`
- `DELETE /api/community/posts/:id/like`
- `POST /api/community/riders/:id/follow`
- `DELETE /api/community/riders/:id/follow`
- `GET /api/community/riders/:id/followers`
- `GET /api/community/riders/:id/following`
- `GET /api/community/groups`
- `POST /api/community/groups`
- `GET /api/community/groups/:id`
- `POST /api/community/groups/:id/join`
- `DELETE /api/community/groups/:id/leave`
- `GET /api/community/rides/:rideId/reviews`
- `POST /api/community/rides/:rideId/reviews`

## Rewards

- `GET /api/rewards/badges`
- `POST /api/rewards/badges`
- `GET /api/rewards/badges/me`
- `POST /api/rewards/badges/:id/award`
- `GET /api/rewards/badges/rider/:id`
- `GET /api/rewards/achievements`
- `POST /api/rewards/achievements`
- `GET /api/rewards/achievements/me`
- `GET /api/rewards/leaderboard`

## Notifications, Settings, Privacy

- `GET /api/notifications`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/:id/read`
- `GET /api/notifications/preferences`
- `PUT /api/notifications/preferences`
- `GET /api/notifications/settings`
- `PATCH /api/notifications/settings`
- `GET /api/notifications/privacy`
- `PATCH /api/notifications/privacy`
- `GET /api/notifications/blocked`
- `POST /api/notifications/blocked/:id`
- `DELETE /api/notifications/blocked/:id`

## Support

- `GET /api/support`
- `POST /api/support`
- `GET /api/support/:id`
- `GET /api/support/admin/tickets`
- `PATCH /api/support/:id/status`

## Live Session

- `GET /api/live/health`
- `POST /api/rides/:id/live/start`
- `POST /api/rides/:id/live/end`
- `GET /api/rides/:id/live/session`
- `POST /api/rides/:id/live/incident`
- `POST /api/rides/:id/live/incident/:incidentId/ack`

## Realtime Socket Events

### `/live` namespace

- Client -> server: `session:join`, `session:leave`, `presence:heartbeat`, `location:update`, `incident:create`
- Server -> client: `session:state`, `presence:update`, `location:broadcast`, `incident:created`, `session:ended`, `session:error`

### `/rides` namespace

- Client -> server: `ride:subscribe`, `ride:unsubscribe`
- Server -> client: `ride:subscribed`, `ride:joined`, `ride:stop_requested`, `ride:stop_updated`, `ride:error`
