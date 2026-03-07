---
trigger: always_on
---

# Rule: AI Assistant Context Management

**Activation:** Always On

## Objective

Maintain a persistent memory of project state in `ai-assistant.md` to prevent context loss between sessions.

## Instructions

1. **Pre-Task Check:** Before performing ANY task requested by the user, you MUST read the content of `ai-assistant.md` in the root directory.
2. **Context Alignment:** Align your proposed plan with the 'Technical Decisions' and 'Current State' documented in that file.
3. **Post-Task Update:** Immediately after completing a task, updating code, or making a strategic decision, you MUST update `ai-assistant.md`.
4. **Consistency:** If `ai-assistant.md` does not exist, create it immediately using a standard template (Project Goal, Tech Stack, Progress, and Next Steps).

## Constraints

- Never delete historical 'Technical Decisions' unless explicitly told.
- Keep the 'Current State' section concise but accurate.
