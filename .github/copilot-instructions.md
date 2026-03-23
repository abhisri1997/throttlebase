# ThrottleBase Copilot Instructions

## Context First

- Before substantial exploration, analysis, or edits, read `ai-assistant.md` in the workspace root.
- Reuse existing project overview, architecture notes, technical decisions, and task progress to avoid broad scans.

## Precision and Token Efficiency

- Prefer targeted searches and file reads over full-repository scans.
- Use known entry points from `ai-assistant.md` before discovering new ones.

## Persistent Memory Updates

- After meaningful progress (new findings, code edits, architecture decisions, or completed steps), update `ai-assistant.md`.
- Keep updates concise, high-signal, and incremental.
- Remove stale or contradictory notes when discovered.
- Avoid copying large code blocks into `ai-assistant.md`.

## Update Content Expectations

- New learnings: key files, responsibilities, APIs, and data flows.
- Decisions: what was chosen and why (short trade-off note).
- Task progress: completed and pending steps.
- Suggested next actions and optimization hints for future runs.
