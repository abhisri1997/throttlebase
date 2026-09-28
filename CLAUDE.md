# ThrottleBase

Two-package repo, no root `package.json`/workspace — `client/` and `server/` each have their own.

For product scope, architecture, and current status, see `ai-assistant.md` and `docs/` (source of truth — don't duplicate here).

## Stack

- Server: Express 5 + TypeScript, PostgreSQL/PostGIS, run via `tsx`
- Client: Expo + React Native + Expo Router, TypeScript

## Commands

Server (`cd server`):

- Dev: `npm run dev` (nodemon + tsx, API only) or `npm run dev:all` (API + worker)
- Unit tests: `npm run test:unit`
- End-to-end live-session script (needs a database): `npm test`
- Integration tests (throwaway PostGIS via `TEST_DATABASE_URL`): `npm run test:integration`
- Typecheck: `npm run typecheck`
- Migrations: `npm run migrate` (`migrate:dry-run` to preview)

Client (`cd client`):

- Dev: `npx expo start --dev-client`
- Unit tests: `npm test`
- Typecheck: `npx tsc --noEmit`

Both packages: `npm run lint` (ESLint) and `npm run lint:boundaries` (architecture rules: `core/` and `ports/` import nothing external; vendor SDKs only in `adapters/`; legacy exceptions listed in `eslint.boundaries.*` may only shrink). No formatter is configured.

## Launch readiness

- Follow docs/launch-readiness/LAUNCH_READINESS.md for compliance/launch work.
- Background research: docs/launch-readiness/compliance-report.md.
- Legal text is draft-only. Never modify infra or secrets.
