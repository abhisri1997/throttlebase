# ThrottleBase

ThrottleBase is a mobile-first rider platform where users can create and join rides, share routes, track ride history, and interact with a community.

## Core Capabilities

- Ride lifecycle: draft, schedule, join, active, complete
- Route and GPS: route creation, sharing, bookmarks, trace ingestion
- Community: posts, comments, likes, follows, groups, ride reviews
- Rewards and engagement: badges, achievements, leaderboard
- Notifications and account controls: preferences, privacy, 2FA, login activity, session management, support
- Operations and moderation: admin support ticket triage plus mention-triggered notification fanout
- Live group sessions: realtime ride coordination, ride-room updates, and safety flow

## Tech Stack

- Server: Node.js 22+, TypeScript, Express 5
- Data: PostgreSQL + PostGIS
- Client: Expo, React Native, Expo Router, Zustand, TanStack Query
- Realtime: Socket.IO (`/live` namespace)
- Background processing: DB-backed queue + worker processors

## Repository Layout

- `server/` backend API, queue worker, migrations
- `client/` Expo application and UI flows
- `docs/` project documentation
- `ai-assistant.md` concise operational context for AI-assisted development

## Production Endpoints

- App/web domain: `https://throttlebase.in`
- API domain: `https://api.throttlebase.in`

## Local Setup

1. Install dependencies:

```bash
cd server && npm install
cd ../client && npm install
```

2. Ensure PostgreSQL + PostGIS are available and env is configured in `server/.env`.

	Security-related server env options:

	- `CORS_ALLOWED_ORIGINS` (comma-separated allowlist, e.g. `https://throttlebase.in,https://www.throttlebase.in`)
	- `ENABLE_SWAGGER_DOCS` (`true`/`false`; defaults to enabled in non-production, disabled in production)
	- `SWAGGER_USERNAME` and `SWAGGER_PASSWORD` (required to access `/api-docs` in production when docs are enabled)

3. Run migrations using your existing migration workflow.
4. Start backend and worker:
```bash
cd server
npm run dev
# separate terminal
npm run worker
```

## Cloud hosting with Railway + Neon

To host the backend in the cloud, use Neon for PostgreSQL and Railway for the Node.js service.

1. Create a Neon PostgreSQL database, then enable the PostGIS extension.
2. Run the SQL migration scripts from `server/src/db/migrations` against the Neon database.
3. In Railway, create a new project or service for the backend and set the `start` command to `npm run start`.
4. Add the Neon `DATABASE_URL` to Railway environment variables along with `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, `ENABLE_SWAGGER_DOCS=false`, and any API keys.
5. Add `api.throttlebase.in` as a custom domain in Railway, then point your Cloudflare DNS `CNAME` record to the Railway-hosted app domain.

The backend already reads `PORT` from `process.env.PORT`, so Railway can bind to the platform-assigned port automatically.
```bash
cd server
npm run dev
# separate terminal
npm run worker
```

5. Start client:

```bash
cd client
npm start
```

For an installed iOS/Android development build on a physical device, use the Expo dev client flow instead of opening the native app without Metro:

```bash
cd client
npx expo start --dev-client --tunnel
```

If the native app is rebuilt with `npx expo run:ios --device` or `npx expo run:android`, keep the dev server running before launching the app. Otherwise the app can fail with "No script URL provided" because the JavaScript bundle is not embedded in debug builds.

## Documentation

- Documentation index: `docs/README.md`
- Architecture: `docs/architecture.md`
- Technical overview: `docs/technical-overview.md`
- API inventory: `docs/api-endpoints.md`
- Database design: `docs/database-design.md`
- Technical decisions: `docs/technical-decisions.md`
- Status/backlog: `docs/project-status.md`
