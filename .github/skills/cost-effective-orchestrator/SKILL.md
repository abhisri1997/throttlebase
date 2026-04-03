---
name: cost-effective-orchestrator
description: "Plan engineering work with cost-aware agent routing. Use when asked to decide between a single main agent, subagents, hybrid execution, or layered delegation, and when token efficiency must be balanced against output quality."
argument-hint: "Task goal, constraints, quality bar, and cost sensitivity"
user-invocable: true
---

# Cost-Effective Orchestrator

## What This Skill Does

Creates a repeatable workflow for planning and executing tasks with the least coordination overhead that still preserves quality.

The skill helps the agent decide whether to:

1. Use a single main agent.
2. Split work across a small number of focused subagents.
3. Use a hybrid model where only isolated slices are delegated.
4. Use layered delegation when one delegated slice needs its own internal breakdown.

This skill is optimized for tasks where token cost matters and unnecessary decomposition should be avoided.

## When to Use

- User asks to break a task across subagents and merge the result.
- User asks whether a task should stay with the main agent or be delegated.
- User wants cost-effective execution without losing implementation quality.
- The task spans multiple domains and delegation might help, but only if the boundaries are clean.

## Inputs

- Task goal
- Constraints and acceptance criteria
- Cost sensitivity: low, medium, or high
- Quality bar or risk tolerance
- Any required output format

## Procedure

### 1. Analyze The Task First

Break the request into logical units of work.

For each unit, evaluate:

- Dependency check: does it require another unit's output first?
- Conflict check: does it touch shared files, shared state, or shared decisions?
- Isolation check: can it be executed with self-contained context?

Also determine:

- Task complexity: simple, moderate, or complex
- Estimated number of meaningful subtasks
- Whether the task fits in one context window without excessive churn

### 2. Choose One Strategy

Select exactly one routing mode.

#### Option A - Single Agent

Use when:

- The task is sequential or tightly coupled.
- The task fits within one context window.
- Shared files or decisions would create merge friction.
- There are fewer than three meaningful independent subtasks.
- Delegation overhead would outweigh the benefit.

#### Option B - Multi-Agent

Use only when:

- There are at least three independent workstreams.
- Boundaries are clear and overlap is minimal.
- Each delegated task can run with isolated context.
- Parallel work materially improves speed or quality.

#### Option C - Hybrid

Use when:

- The core logic is centralized and sequential.
- A few slices such as UI, API, tests, or docs can be delegated safely.
- Limited delegation gives measurable benefit without high coordination cost.

#### Option D - Layered Delegation

Use when:

- One delegated subtask is itself complex enough to need further breakdown.
- Ownership should remain with the delegated subagent instead of bouncing all details through the top-level agent.

### 3. Apply Cost Controls

- Reserve costlier/high-capability reasoning models for orchestration logic and architectural decisions.
- Default to single-agent execution.
- Escalate only when delegation is clearly justified.
- If coordination overhead is likely greater than 30 percent, prefer the single-agent path.
- Assign simple or mechanical work to the cheapest capable model.
- Give each subagent only the context it needs.
- Do not pass full conversation history unless it is required.
- Avoid overlapping investigations and redundant explanations.
- Prefer file-based coordination when multiple agents must exchange outputs.

### 4. Build The Plan

If using a single agent:

- Create a minimal plan with one to three steps.
- Execute directly.

If using multi-agent, hybrid, or layered delegation:

- Define non-overlapping subtasks.
- Give each subtask a strict scope.
- Avoid shared file conflicts whenever possible.
- Provide an explicit output contract for each subtask:
  - expected output
  - output format
  - dependencies, if any

### 5. Execute With Scoped Context

- Keep instructions concise.
- Reuse existing context instead of repeating large background summaries.
- Prefer modifying existing code over creating parallel implementations.
- Stop delegation from spreading unless the layered strategy was chosen deliberately.

### 6. Merge And Validate

After execution:

1. Merge outputs into one coherent result.
2. Resolve conflicts and inconsistencies.
3. Ensure interface alignment and logic consistency.
4. Remove duplicate reasoning and repeated content.
5. Perform one final quality pass.
6. Flag anything that still requires human review.

## Output Format

Return the result in this format:

Strategy Chosen: [Single Agent / Multi-Agent / Hybrid / Layered]

Reasoning:
- Why this strategy was selected
- Tradeoff between cost and quality

Estimated Scope:
- Brief description of task size and complexity

Plan:
Step 1:
Step 2:
Step 3:

If using Multi-Agent, Hybrid, or Layered:

Subtasks:
- Subagent 1: [scope + output contract]
- Subagent 2: [scope + output contract]

Final Output:
[Provide the completed result]

Final Notes:
- Assumptions
- Risks or edge cases
- Suggestions for improvement when relevant

## Completion Checklist

- [ ] Strategy was chosen before execution.
- [ ] Delegation was used only when justified.
- [ ] Subtasks do not overlap unnecessarily.
- [ ] Merge pass removed redundancy.
- [ ] Final answer explains cost versus quality tradeoff.

## Example Prompts

- Use the cost-effective orchestrator to decide whether this feature should stay with one agent or be split between frontend, backend, and tests.
- Plan this bugfix with the cheapest approach that still gives a reliable result, and only use subagents if the work is cleanly separable.
- Break down this task only if the parallel workstreams are truly independent, then merge everything into one final implementation.