# Documentation Index - ThrottleBase

This directory is organized by purpose so contributors and assistants can quickly find source-of-truth information.

## Start Here

1. Read `../README.md` for project setup and local run flow.
2. Read `architecture.md` for system boundaries and runtime flow.
3. Read `technical-overview.md` for the current feature modules and delivery shape.
4. Read `project-status.md` for current implementation state and backlog.

## Documents by Concern

- Product and scope
  - `product-overview.md`

- Architecture and technical operation
  - `architecture.md`
  - `technical-overview.md`
  - `technical-decisions.md`
  - `live-session-rollout.md`
  - `live-navigation-phase1.md`

- Data and API contracts
  - `database-design.md`
  - `api-endpoints.md`

- Delivery and rollout tracking
  - `project-status.md`
  - `live-session-rollout.md`
  - `live-navigation-phase1.md`

## Maintenance Rules

- Keep each file focused on one concern.
- Avoid duplicating large sections across files.
- Prefer linking to the source document rather than copy/pasting details.
- Update `ai-assistant.md` and the relevant docs file in the same change when architecture or status changes.
- When security, support, notifications, or realtime behavior changes, review `technical-overview.md`, `api-endpoints.md`, `database-design.md`, and `project-status.md` together so they do not drift.