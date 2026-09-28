# ThrottleBase

ThrottleBase is a mobile-first platform for motorcycle riders: plan and join group rides, ride them together with live navigation, find and share routes, and keep a ride history.

## What it does

- **Rides:** create a ride from scratch or from a saved route, add stops, join, and ride as a group. There's a roll call, live positions, per-rider start and finish, regroup, and incident/SOS reporting.
- **Navigation:** full-screen turn-by-turn with the crew on the map, rerouting when off course.
- **Routes:** search from one place to another, save the road you rode as a route, bookmark, share, and rate the road.
- **History:** tracked automatically from the phone, counting riding time and distance only.
- **Community:** posts, comments, likes, follows, @mentions, ride reviews.
- **Account:** passwordless sign-in (Google, Apple, email code), settings, privacy, in-app notifications.

Groups, rewards, support tickets and account-security screens exist but are held back from the closed beta behind feature flags (see `docs/project-status.md`).

## Tech stack

- **Server:** Node.js 22+, TypeScript, Express 5, Zod, `jose`, run with `tsx`
- **Data:** PostgreSQL 17 + PostGIS on Supabase, raw SQL migrations
- **Realtime:** Socket.IO (`/live` for live sessions, `/rides` for ride-detail updates)
- **Background work:** job queue in Postgres, run by a separate worker process
- **Client:** Expo SDK 57, React Native 0.86, Expo Router, TanStack Query, Zustand
- **Maps:** Google Maps Platform, called only through the server

## Repository layout

- `server/`: API, realtime gateway, worker, migrations
- `client/`: Expo app
- `docs/`: project documentation (start at `docs/README.md`)
- `ai-assistant.md`: short context brief for AI-assisted development

There is no root `package.json`; `client/` and `server/` each install separately.

## Environments

| Environment | API | Built into |
| --- | --- | --- |
| Production | `https://api.throttlebase.in` | EAS `production` builds |
| Development | `https://api-dev.throttlebase.in` | EAS `development` and `preview` builds, beta APKs |
| Local | `http://localhost:5001` | Dev builds with no `EXPO_PUBLIC_API_URL` |

The API and worker run on Railway, with DNS on Cloudflare. The hosted database is the Supabase project `throttlebase` in `ap-south-1` (Mumbai), the only project on the account. Each environment's `DATABASE_URL` is set in Railway. The app and share links live at `https://throttlebase.in`.

## Local setup

### Server

1. Install dependencies:

   ```bash
   cd server
   npm install
   ```

2. Create a Postgres database with PostGIS (Postgres 17 is what Supabase runs):

   ```bash
   createdb throttle_base
   psql -d throttle_base -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   ```

3. Copy `server/.env.example` to `server/.env` and fill it in. The example documents every variable. For local work you need at least:
   - `DATABASE_URL`, pointing at the local database. Discrete `DB_HOST` / `DB_USER` / … variables also work.
   - `AUTH_JWT_PRIVATE_KEY` and `AUTH_JWT_KID`: generate an ES256 key with the `openssl` commands in the example.
   - `GOOGLE_CLIENT_IDS` for Google sign-in, and `GOOGLE_MAPS_API_KEY` for maps.
   - `EMAIL_DRIVER=console`, which prints email sign-in codes to the log.

4. Apply the migrations:

   ```bash
   npm run migrate            # or: npm run migrate:dry-run
   ```

5. Run the API and the worker:

   ```bash
   npm run dev:all            # API and worker together
   # or separately:
   npm run dev                # API on http://localhost:5001
   npm run worker             # background jobs
   ```

The server checks its configuration at boot and stops with the variable's name if something is missing.

### Client

```bash
cd client
npm install
npx expo start --dev-client
```

`EXPO_PUBLIC_API_URL` picks the backend. With no value, a development build talks to the API on the machine running Metro (port 5001; `10.0.2.2` on the Android emulator), and a release build falls back to the development API, never production. The EAS profiles in `client/eas.json` set it per build.

Installed debug builds have no embedded JavaScript bundle. Start Metro first (`npx expo start --dev-client`, adding `--tunnel` for a phone on another network), or the app opens with "No script URL provided".

## Checks

```bash
cd server
npm run typecheck          # tsc --noEmit
npm run test:unit          # unit tests
npm run lint:boundaries    # architecture boundary rules
npm test                   # end-to-end live-session script against the configured database

cd ../client
npm test                   # unit tests
npx tsc --noEmit           # typecheck
npm run lint:boundaries    # architecture boundary rules
```

`npm run test:integration` in `server/` runs Postgres integration tests against a throwaway database; see `server/src/adapters/postgres/migrations.integration.test.ts` for the one-line Docker setup.

## Hosting: Railway + Supabase

The database moved from Neon to Supabase. The code uses Supabase as plain Postgres, with no Supabase SDK, auth or storage, so any Postgres 17 + PostGIS host works.

1. **Database (Supabase):** create a project and enable the `postgis` extension. Then apply migrations from a trusted machine:

   ```bash
   MIGRATION_DATABASE_URL="<supabase connection string>" npm run migrate
   ```

   The runner handles Supabase's certificate chain itself.

2. **API (Railway):** a service rooted at `server/` with start command `npm start`. It reads `PORT` from the platform. Set these variables:
   - everything in `server/.env.example` that applies;
   - `DATABASE_URL`;
   - `DATABASE_SSL_REJECT_UNAUTHORIZED=false`, which Supabase's chain needs;
   - `NODE_ENV=production`;
   - `CORS_ALLOWED_ORIGINS`;
   - `EMAIL_DRIVER=smtp` with the `SMTP_*` settings;
   - `ENABLE_SWAGGER_DOCS=false`;
   - the `FEATURE_*` flags.

3. **Worker (Railway):** a second service from the same code with start command `npm run worker` and the same variables as the API.

4. **Domain:** add `api.throttlebase.in` (or `api-dev.throttlebase.in`) as a Railway custom domain, and point a Cloudflare `CNAME` at it.

The migrations define a least-privilege role (`throttlebase_app`) and row-level security policies. The API does not use that role yet: it still connects as `postgres`. Switching needs code changes first; see `docs/database-design.md` → Row-level security.

## Documentation

- Index: `docs/README.md`
- Architecture: `docs/architecture.md`
- Features and configuration: `docs/technical-overview.md`
- API and socket events: `docs/api-endpoints.md`
- Database: `docs/database-design.md`
- Decisions: `docs/technical-decisions.md`
- Status and backlog: `docs/project-status.md`
