# ThrottleBase

ThrottleBase is a mobile-first rider platform where users can create and join rides, share routes, track ride history, and interact with a community.

## Core Capabilities

- Ride lifecycle: draft, schedule, join, active, complete
- Route and GPS: route creation, sharing, bookmarks, trace ingestion
- Community: posts, comments, likes, follows, groups, ride reviews
- Rewards and engagement: badges, achievements, leaderboard
- Notifications and account controls: preferences, privacy, support
- Live group sessions: realtime ride coordination and safety flow

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

## Local Setup

1. Install dependencies:

```bash
cd server && npm install
cd ../client && npm install
```

2. Ensure PostgreSQL + PostGIS are available and env is configured in `server/.env`.
3. Run migrations using your existing migration workflow.
4. Start backend and worker:

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

## Documentation

- Documentation index: `docs/README.md`
- Architecture: `docs/architecture.md`
- Technical overview: `docs/technical-overview.md`
- API inventory: `docs/api-endpoints.md`
- Status/backlog: `docs/project-status.md`
