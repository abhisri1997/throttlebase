# ThrottleBase Copilot Instructions

## Context First

- Before substantial exploration, analysis, or edits, read `ai-assistant.md` in the workspace root.
- Before substantial exploration, analysis, or edits, also read `docs/README.md` and relevant files under `docs/`.
- Reuse existing project overview, architecture notes, technical decisions, and task progress to avoid broad scans.

## Precision and Token Efficiency

- Prefer targeted searches and file reads over full-repository scans.
- Use known entry points from `ai-assistant.md` before discovering new ones.

## Persistent Memory Updates

- After meaningful progress (new findings, code edits, architecture decisions, or completed steps), update `ai-assistant.md`.
- In the same pass, review `docs/` for impact and update all required documentation files for consistency.
- Keep updates concise, high-signal, and incremental.
- Remove stale or contradictory notes when discovered.
- Avoid copying large code blocks into `ai-assistant.md`.

## Documentation Consistency Rules

- Treat `docs/` as a maintained documentation set, not isolated files.
- Whenever implementation changes affect behavior/contracts/flows, update relevant files in `docs/` and keep cross-references aligned.
- At minimum, review: `docs/README.md`, `docs/architecture.md`, `docs/technical-overview.md`, `docs/api-endpoints.md`, and `docs/project-status.md`.
- If a change affects only one area, still ensure related docs do not contradict the updated behavior.
- If no docs update is needed, explicitly verify and state that existing docs remain accurate.

## Update Content Expectations

- New learnings: key files, responsibilities, APIs, and data flows.
- Decisions: what was chosen and why (short trade-off note).
- Task progress: completed and pending steps.
- Suggested next actions and optimization hints for future runs.
- Documentation updates: which `docs/` files were reviewed/updated and why.
