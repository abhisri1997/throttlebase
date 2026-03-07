# AI Assistant — Bikers Community Platform

## Project Goal

A platform where riders can create rides, join rides, share routes, track ride history, and interact with a biking community. Includes a reward system (badges, achievements, leaderboard), notifications, settings, privacy/security controls, and community features (posts, comments, likes, follows, groups, ride reviews).

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
| **Other**            | cors, dotenv, pg (PostgreSQL driver)                                                |

## Project Structure

```
bikers-community-platform/
├── docs/
│   ├── product-overview.md      # Problem statement, core & additional features
│   ├── technical-overview.md    # Functional + technical specs for all features
│   ├── database-design.md       # Full DB schema (25+ tables, ER diagram, indexes, policies)
│   └── architecture.md
├── server/
│   ├── src/
│   │   ├── app.ts               # Express entry point (port 5001)
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── services/
│   ├── tsconfig.json
│   └── package.json
├── client/                      # (not yet started)
└── ai-assistant.md              # This file
```

## Technical Decisions

| Decision                               | Rationale                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Port 5001** (not 5000)               | macOS AirPlay Receiver occupies port 5000                                                       |
| **ES Modules**                         | `"type": "module"` + `"module": "NodeNext"` + `"verbatimModuleSyntax": true` for modern imports |
| **Express 5**                          | Latest major version; note: listen errors are passed to callback instead of crashing            |
| **`rootDir: ./src`, `outDir: ./dist`** | Clean separation of source and compiled output                                                  |
| **UUID primary keys**                  | All tables use `UUID` with `gen_random_uuid()`                                                  |
| **PostGIS**                            | Spatial queries for ride start/end points, regional leaderboards, GPS traces                    |
| **Soft delete**                        | `deleted_at` on riders table with 30-day grace period                                           |
| **Denormalized counters**              | `total_rides`, `like_count`, `current_rider_count`, etc. for fast reads                         |
| **Data-driven rewards**                | Badges/achievements defined in DB, not code — new ones added without deploys                    |
| **Canonical metric units**             | All data stored in km, km/h, kg, UTC; conversion is client-side                                 |

## Current Progress

- [x] Project scaffolding (server directory, package.json, tsconfig.json)
- [x] Product overview document (`docs/product-overview.md`)
- [x] Technical overview document (`docs/technical-overview.md`)
- [x] Database design document (`docs/database-design.md`) — 25+ tables with ER diagram, indexing strategy, data policies
- [x] Express server entry point (`server/src/app.ts`) with `/health` endpoint
- [x] TypeScript strict mode configured and compiling cleanly
- [ ] Database setup (PostgreSQL + PostGIS) and connection
- [ ] Drizzle ORM or raw SQL schema implementation
- [ ] Authentication module (register, login, JWT)
- [ ] Rider profiles CRUD
- [ ] Rides module (create, join, state machine)
- [ ] Routes module
- [ ] Community features (posts, comments, likes, follows)
- [ ] Rewards engine (badges, achievements, leaderboard)
- [ ] Notifications system
- [ ] Client application

## Next Steps

1. Set up PostgreSQL database connection using `pg` + `dotenv`
2. Implement the database schema (migrations or raw SQL)
3. Build the authentication module (register/login/JWT middleware)
4. Build rider profiles CRUD endpoints
