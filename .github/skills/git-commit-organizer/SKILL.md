---
name: git-commit-organizer
description: "Group changed files into relevant git commits, commit safely with verification, and push to remote. Use when asked to check git status, organize commits by feature/fix/chore, and push code. Defaults: conventional commits and ask-before-push."
argument-hint: "Branch (optional), commit-style (default conventional), push policy (default ask-before-push)"
user-invocable: true
---

# Git Commit Organizer

## What This Skill Does

Creates a safe, repeatable workflow to:

1. Inspect all working tree changes.
2. Group files into logically relevant commits.
3. Create validated commits in sequence.
4. Push to the correct remote branch.

This skill is optimized for mixed change sets that include frontend, backend, docs, config, and generated lockfiles.

## Defaults

- Commit style: `conventional`
- Push behavior: `ask-before-push`
- Target branch: current checked-out branch

## When to Use

- User asks: "check git status and commit/push"
- User asks to "group files into relevant commits"
- There are many changed files and commit intent is unclear
- You need consistent, low-risk commit hygiene

## Inputs

- Target branch (default: current branch)
- Commit style: `conventional` or `plain`
- Push behavior: `auto-push` or `ask-before-push`

## Procedure

### 1. Inspect Repository State

Run:

- `git status --short --branch`
- `git --no-pager diff --name-only`
- `git ls-files --others --exclude-standard | sort`
- `git --no-pager diff --stat`

Goal:

- Capture modified, staged, and untracked files.
- Detect whether there is anything to commit.

If there are no changes:

- Report clean state and stop.

### 2. Build Commit Groups

Create groups by behavior and ownership, not just by folder.

Primary grouping rules:

1. Keep vertical slices together when one feature spans client + server + migration.
2. Separate independent concerns (feature vs auth fix vs docs/chore).
3. Keep generated lockfiles with the commit that required dependency changes.
4. Keep formatting-only edits with their feature unless explicitly asked to isolate formatting.
5. Never mix unrelated hotfixes into a large feature commit.

Suggested group labels:

- `feat(<scope>): ...`
- `fix(<scope>): ...`
- `chore(<scope>): ...`
- `docs(<scope>): ...`
- `refactor(<scope>): ...`

### 3. Validate Group Boundaries Before Commit

For each planned group:

1. Stage only that group with quoted paths.
2. Verify staged files with:
   - `git diff --staged --name-only`
   - `git --no-pager diff --staged --stat`
3. Confirm staged content matches the intended message.

If a file appears in the wrong group:

- Unstage and regroup before committing.

### 4. Commit Safely

For each group:

1. `git add '<file1>' '<file2>' ...`
2. `git commit -m "<message>"`
3. Verify with `git show --name-only --oneline -1`

Message guidance:

- Prefer concise, action-oriented messages.
- For conventional style, use: `type(scope): summary`.
- Keep summary tied to user-visible impact.

### 5. Push and Verify

Default behavior: ask for confirmation before push.

After all commits are created:

1. `git status --short --branch`
2. `git log --oneline -n 5`
3. `git push origin <branch>`

If push fails (non-fast-forward):

1. `git pull --rebase origin <branch>`
2. Resolve conflicts by preserving commit intent.
3. `git push origin <branch>` again.

## Decision Points

### A. One Large Feature vs Multiple Commits

- Use one commit only when all files support one cohesive behavior.
- Split when there are at least two independently understandable outcomes.

### B. Docs and Hook Updates

- If docs/hooks are tightly coupled to feature behavior, include with that feature commit.
- Otherwise, place in separate `chore`/`docs` commit.

### C. Untracked Infrastructure Files

- New scripts/config in `.github/`, CI, hooks, workers, migrations should usually be separate from UI-only changes unless part of the same delivery slice.

## Safety Rules

- Do not use destructive git commands.
- Do not amend commits unless user asks.
- If unexpected external changes appear mid-work, stop and ask before proceeding.
- Always quote paths containing special characters (for example, `[id].tsx`).

## Completion Checklist

- [ ] All modified/untracked files are accounted for.
- [ ] Each commit has a coherent intent.
- [ ] Staged diff was verified before each commit.
- [ ] Push succeeded to target branch.
- [ ] Final report includes commit SHAs, messages, and pushed branch.

## Output Format

Return:

1. Current status summary.
2. Commit groups and rationale.
3. Created commits (SHA + message + files).
4. Push result.
5. Any remaining untracked or uncommitted files.
