#!/usr/bin/env bash
set -euo pipefail

context_file="$PWD/ai-assistant.md"
docs_index="$PWD/docs/README.md"

if [[ -f "$context_file" && -f "$docs_index" ]]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Workspace context rule is active."},"systemMessage":"Read ai-assistant.md and docs/README.md before substantial tool usage, then consult relevant docs/* files and reuse existing context."}'
elif [[ -f "$context_file" ]]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Workspace context rule is partially active."},"systemMessage":"Read ai-assistant.md before substantial tool usage and review docs/* files relevant to the task."}'
else
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Context file missing."},"systemMessage":"ai-assistant.md is missing; create and maintain it after meaningful progress, and keep docs/* in sync with implementation changes."}'
fi
