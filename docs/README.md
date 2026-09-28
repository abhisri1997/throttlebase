# Documentation Index - ThrottleBase

This directory is organized by purpose so contributors and assistants can quickly find source-of-truth information.

## Start Here

1. Read `../README.md` for project setup and local run flow.
2. Read `architecture.md` for system boundaries and runtime flow.
3. Read `technical-overview.md` for the current feature modules and delivery shape.
4. Read `project-status.md` for current implementation state and backlog.

## Documents by Concern

- Product and scope
  - `product-overview.md` — what the product does
  - `project-status.md` — beta scope, environments, known gaps, backlog

- Architecture and technical operation
  - `architecture.md` — components, hosting, server structure, request/realtime/job flows, scaling limits
  - `technical-overview.md` — each feature, where its code lives, configuration, test commands
  - `technical-decisions.md` — decisions and their reasons
  - `live-session-rollout.md` — live session phases, per-rider progress, rollback controls
  - `live-navigation-phase1.md` — full-screen navigation files and realtime contract status

- Data and API contracts
  - `database-design.md` — schema generated from the migrations, RLS and roles
  - `api-endpoints.md` — every HTTP route and socket event

- Launch and compliance
  - `launch-readiness/LAUNCH_READINESS.md` — rules for launch and compliance work
  - `launch-readiness/compliance-report.md` — background research (India and global)
  - `legal/drafts/` — reserved for draft legal text (empty and untracked today)

- QA and validation
  - `uat-test-plan-feature-remaining-features.md` — UAT plan for security, support, mentions and live session; source for the PDF beside it

- Postmortems
  - `postmortems/android-ride-detail-flicker-crash.md`

## Maintenance Rules

- Keep each file focused on one concern.
- Avoid duplicating large sections across files.
- Prefer linking to the source document rather than copy/pasting details.
- Keep editable test plans in Markdown and generate PDFs from those source files.
- Update `ai-assistant.md` and the relevant docs file in the same change when architecture or status changes.
- When security, support, notifications, or realtime behavior changes, review `technical-overview.md`, `api-endpoints.md`, `database-design.md`, and `project-status.md` together so they do not drift.
- When a migration changes the schema, update `database-design.md` from the migrated schema, not from memory.