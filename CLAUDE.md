# ThrottleBase

Two-package repo, no root `package.json`/workspace — `client/` and `server/` each have their own.

For product scope, architecture, and current status, see `ai-assistant.md` and `docs/` (source of truth — don't duplicate here).

## Stack

- Server: Express 5 + TypeScript, PostgreSQL/PostGIS, run via `tsx`
- Client: Expo + React Native + Expo Router, TypeScript

## Commands

Server (`cd server`):
- Dev: `npm run dev` (nodemon + tsx, API only) or `npm run dev:all` (API + worker)
- Test: `npm test`
- Build/typecheck: `npx tsc --noEmit`

Client (`cd client`):
- Dev: `npx expo start`
- Typecheck: `npx tsc --noEmit`

No lint/format tooling is configured in either package yet.
