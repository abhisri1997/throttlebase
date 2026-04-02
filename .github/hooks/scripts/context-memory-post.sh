#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Detect whether there are tracked code changes (staged or unstaged).
changed_files="$(
	git -C "$repo_root" diff --name-only --cached
	git -C "$repo_root" diff --name-only
)"

has_code_changes="false"
while IFS= read -r file; do
	[ -z "$file" ] && continue

	case "$file" in
		*.md|*.txt|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.svg|*.ico)
			;;
		*)
			has_code_changes="true"
			break
			;;
	esac
done <<< "$changed_files"

if [ "$has_code_changes" = "true" ]; then
	printf '%s\n' '{"decision":"continue","systemMessage":"After meaningful progress, update ai-assistant.md with concise learnings, decisions, and task status. In the same pass, review docs/README.md and all relevant docs/*.md files, update impacted docs for behavior/API/architecture/status changes, and ensure cross-doc consistency. If any code files changed, also provide a concise walkthrough of what changed (by area/file) and include exact verification steps plus expected outcomes so the user can confirm it is working."}'
else
	printf '%s\n' '{"decision":"continue","systemMessage":"After meaningful progress, update ai-assistant.md with concise learnings, decisions, and task status, and review docs/*.md for consistency updates where required."}'
fi
