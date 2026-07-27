# Execution plan: <title>

Use this template for medium/high-risk work, multi-module changes, or a program with more than one independently releasable phase. Delete instructional placeholders when creating an active plan.

## Status

- Owner:
- Created:
- Updated:
- Risk class: Low / Medium / High
- Current phase:
- Approval state:
- Branch / PR:

## Goal and user outcome

Describe the observable user or operator result. Avoid defining success as “code was added.”

## Current behavior and evidence

- Current behavior:
- Reproduction or evidence:
- Relevant files/tests/docs:
- Known uncertainty:

## Scope

### In scope

- <item>

### Out of scope

- <item>

## Invariants and constraints

List applicable compatibility, storage, URL, IME, privacy, free-tier, deployment, and workflow constraints. Link to `AGENTS.md`, `docs/PROJECT_MAP.md`, `README.md`, or `worker/README.md` rather than duplicating large sections.

## Options considered

| Option | Benefits | Costs/risks | Decision |
| --- | --- | --- | --- |
| A |  |  |  |
| B |  |  |  |

## Implementation phases

Each phase should be independently understandable, testable, reviewable, and releasable.

### Phase 1: <name>

- Objective:
- Affected paths:
- Changes:
- Tests:
- Manual checks:
- Approval gate:
- Rollback:
- Status:

### Phase 2: <name>

- Objective:
- Affected paths:
- Changes:
- Tests:
- Manual checks:
- Approval gate:
- Rollback:
- Status:

## Validation plan

### Focused tests

- <test or not-applicable rationale>

### Full gates

```bash
npm test
npm run test:worker
npm run check:worker-bundle
npm run test:coverage
npm run build
git fetch origin main
git diff --check origin/main...HEAD
git diff --check
```

Use the merge-base range command for committed branch changes and the argument-free command for uncommitted working-tree changes. Mark commands not applicable and explain why. Do not silently omit them.

### Independent review

- Reviewer agents/scope:
- Reviewed base SHA:
- Reviewed head SHA:
- Required evidence:
- Findings:
- Resolution:
- Re-review result:
- P0 resolution status:
- P1-P2 resolution or acceptance status:

### PR CI integration evidence

- CI run:
- CI-tested base SHA:
- CI-tested head SHA:
- CI-tested PR merge commit SHA:
- Branch-range diff check:
- Working-tree diff check:
- Base/head/merge equality recheck before merge:

### Manual/public checks

- <check or not-applicable rationale>

## External and user-owned actions

List secrets, dashboards, production settings, physical-device checks, terms, billing, or approvals that the agent cannot or must not perform autonomously.

## Release and rollback

- Merge condition:
- Reviewed base/head SHA:
- Approval base/head SHA:
- CI-tested base/head SHA:
- CI-tested PR merge commit SHA:
- Deployment condition: exact Squash SHA Pages success, or successful latest-main Pages deployment whose SHA contains the Squash SHA
- Smoke path:
- Rollback trigger:
- Rollback procedure:

## Decision log

| Date | Decision | Rationale | Approved by |
| --- | --- | --- | --- |
|  |  |  |  |

## Completion evidence

- Starting `main` SHA:
- Current PR base SHA:
- Current PR head SHA:
- Reviewed base/head SHA:
- Approval base/head SHA:
- CI-tested base/head SHA:
- CI-tested PR merge commit SHA:
- Independent-review result:
- Squash SHA:
- Pages run/result:
- Deployed main SHA:
- Proof deployed SHA contains Squash SHA:
- Public URL/smoke result:
- Remaining limitations:
