#!/usr/bin/env bash
set -euo pipefail

context_file="$PWD/ai-assistant.md"

if [[ -f "$context_file" ]]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Workspace context rule is active."},"systemMessage":"Read ai-assistant.md before substantial tool usage and reuse existing context."}'
else
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Context file missing."},"systemMessage":"ai-assistant.md is missing; create and maintain it after meaningful progress."}'
fi
