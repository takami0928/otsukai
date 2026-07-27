---
name: otsukai-plan-change
description: Plan a non-trivial change to the otsukai repository before implementation. Use for features, bugs, refactors, compatibility, storage, sharing, Worker, CI, or deployment changes; do not use for a tiny obvious text correction.
---

# Plan an otsukai change

Produce an evidence-based implementation plan. Do not edit application code, create a branch, open a PR, merge, deploy, or change external settings while this skill is active. You may create an execution-plan document only when the user explicitly asks to persist the plan.

## Inputs

Obtain or infer:

- requested user or operator outcome
- observed current behavior
- constraints and non-goals
- desired delivery boundary: plan only, PR only, or end-to-end after approval gates

Do not ask for information already present in the repository or current conversation.

## Procedure

1. Read `AGENTS.md`, `docs/PROJECT_MAP.md`, and `docs/CODEX_WORKFLOW.md`.
2. Read only the product, Worker, workflow, implementation, and test files relevant to the request.
3. Record the current `main` SHA and identify active overlapping PRs or branches when tools permit.
4. Delegate read-heavy mapping to the `change_planner` custom agent when the change crosses modules, affects compatibility/state/external services, or has unclear ownership. Wait for its result.
5. Restate the goal as an observable outcome.
6. Explain current behavior with file/test evidence. Separate verified facts from assumptions.
7. Classify the change as Low, Medium, or High risk using `docs/CODEX_WORKFLOW.md`.
8. Identify invariants, interfaces, stored formats, public URLs, and external settings that could be affected.
9. Consider at least two approaches when the design is not mechanically determined. Prefer the smallest approach that preserves invariants.
10. Define focused tests, full quality gates, manual checks, independent-review scope, approval gate, rollback, and user-owned actions.
11. Split multi-phase work into independently testable and releasable phases. Do not propose one large PR merely for convenience.

## Output

Return these sections:

1. Goal
2. Verified current behavior
3. Assumptions and unresolved decisions
4. Risk class and rationale
5. Affected paths and interfaces
6. Invariants to preserve
7. Options considered
8. Recommended implementation plan
9. Test and review plan
10. Approval, rollout, and rollback
11. Actions required from the user

End with a clear implementation boundary: what Codex may do next and exactly where it must stop.
