---
trigger: always_on
---

# Rule: AI Assistant Context Management

**Activation:** Always On

## Objective

Maintain a persistent memory of project state in `ai-assistant.md` and keep the `docs/` documentation set in sync to prevent context loss and documentation drift between sessions.

## Instructions

1. **Pre-Task Check:** Before performing substantial exploration, analysis, or edits, read `ai-assistant.md` and `docs/README.md`.
2. **Context Alignment:** Align your proposed plan with `ai-assistant.md` and relevant files in `docs/` (architecture, technical overview, API endpoints, project status).
3. **Post-Task Update:** After meaningful progress (code edits, architecture decisions, completed steps), update `ai-assistant.md`.
4. **Docs Synchronization:** In the same pass, review and update all impacted files under `docs/` whenever behavior/contracts/flows/status change.
5. **Cross-Doc Consistency:** At minimum, review `docs/README.md`, `docs/architecture.md`, `docs/technical-overview.md`, `docs/api-endpoints.md`, and `docs/project-status.md` for consistency.
6. **No-Change Verification:** If no docs update is required, explicitly verify and state that existing docs remain accurate.
7. **Consistency:** If `ai-assistant.md` does not exist, create it immediately using a standard template (Project Goal, Tech Stack, Progress, and Next Steps).

## Constraints

- Never delete historical 'Technical Decisions' unless explicitly told.
- Keep the 'Current State' section concise but accurate.
- Avoid duplication across `ai-assistant.md` and `docs/`; keep assistant context concise and move detailed specs to `docs/`.
