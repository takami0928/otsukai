# Codex workflow

## Objective

Turn Codex from a single implementing agent into a controlled delivery system:

```text
brief -> plan -> implement -> independent review -> PR CI -> human approval gate -> integration-state recheck -> merge -> Pages verification
```

The purpose is not to maximize the number of simultaneous agents. It is to keep the main thread focused on requirements and decisions while assigning bounded exploration and review work to read-only agents.

## 1. Brief

A useful request needs only the change-specific information because repository rules live in `AGENTS.md` and this document.

Preferred structure:

```text
Goal: what user or operator outcome should change?
Context: where was the problem observed and what is the current behavior?
Constraints: what must not change?
Done when: what observable result proves completion?
Delivery: plan only, PR only, or approved end-to-end delivery?
```

For voice input, start with a short brief and ask Codex to restate the goal, assumptions, missing decisions, and likely risk class before implementation.

## 2. Risk classification

Classify based on consequence, not diff size.

### Low risk

Typical examples:

- documentation corrections
- tests that do not change production behavior
- narrow copy changes with no workflow or compatibility effect
- a clearly isolated defect with strong existing tests

Gate:

- plan can be brief
- one implementer plus independent review
- the original user request may authorize merge only when it explicitly requests full delivery

### Medium risk

Typical examples:

- request creation or shopping-flow behavior
- status transitions, consultation, checkout, completion, Undo, ordering, or sharing
- URL encoding/decoding, recovery payloads, `localStorage`, migration, or compatibility
- dependency, build, CI, Worker code, or external API contract changes
- significant refactoring or changes across several modules

Gate:

- written plan before implementation
- dedicated branch/worktree
- independent read-only review after implementation
- ready PR with successful CI evidence for the reviewed base/head integration state
- explicit human merge approval after the current review result and CI evidence are available

### High risk

Typical examples:

- Secrets, authentication, permissions, billing, DNS, data deletion, or destructive migration
- Cloudflare/GitHub production settings or Worker deployment
- privacy posture, logging of user content, retention, or third-party data use
- changing the fixed AI model or enabling a paid service

Gate:

- plan and rollback before any mutation
- independent security/operations review
- explicit user approval for each external or destructive action
- never treat a broad implementation request as approval to reveal, rotate, delete, purchase, or deploy

## 3. Plan

Use `$otsukai-plan-change` for non-trivial work.

The plan must include:

1. current behavior and evidence
2. intended behavior
3. affected paths and interfaces
4. invariants to preserve
5. alternatives considered and why rejected
6. risk class and approval gate
7. focused tests and full quality gates
8. manual verification and rollback
9. user-owned settings or credentials, if any

For a complex or multi-phase change, create a tracked plan from `docs/EXECUTION_PLAN_TEMPLATE.md`. Split it into separately reviewable and releasable phases. Do not make a large PR merely because one instruction authorized the whole program.

## 4. Implementation

- Work from the latest `main` in a dedicated branch or worktree.
- Keep one write-owning agent per worktree.
- Parallelize read-heavy exploration, documentation verification, or test analysis; avoid parallel agents editing the same code.
- Make the minimum coherent change.
- Run focused tests during iteration.
- Update product/operation documentation in the same PR when behavior or configuration changes.
- Record real blockers rather than weakening validation.
- Never pass validation by skipping, narrowing, deleting, or broadly snapshot-updating relevant tests.
- Preserve DOM order, CSS classes, focus behavior, ARIA attributes, roles, and keyboard behavior during refactoring unless the approved goal explicitly changes them.

Recommended model posture:

- main planning/implementation thread: current GPT-5.6 family, medium or high reasoning depending on ambiguity
- read-heavy exploration: faster model or lower effort is acceptable
- correctness/security review: high reasoning
- do not pin model names in repository configuration unless a reproducibility need outweighs staleness

## 5. Independent review

Use `$otsukai-review-change` after implementation and before merge.

The reviewer must:

- be a separate read-only agent or detached `/review` session
- compare the complete branch for an exact base SHA and head SHA
- identify and record the exact reviewed base SHA and head SHA
- read the task goal and applicable invariants
- prioritize correctness, compatibility, security/privacy, state transitions, malformed inputs, race/double-execution risks, CI integration behavior, and missing tests
- provide file/symbol evidence and reproduction logic where possible
- avoid style-only comments unless they conceal a defect
- return `no findings` explicitly when no actionable issue is found

Any change to either the base SHA or PR head SHA invalidates the prior final review. If `main` moves, update the PR branch with current `main`, then review the new complete branch diff and integration state. Do not classify a base/head-changing update as too small to review.

Finding severity:

- P0: release-blocking security, data loss, secret exposure, or fundamental corruption
- P1: likely user-visible regression, compatibility break, unsafe external behavior, or incorrect core flow
- P2: credible edge-case defect or material test gap
- P3: non-blocking maintainability/documentation concern

P0 must be resolved and independently re-reviewed before merge. P1-P2 must be resolved or explicitly accepted by the user after the current base/head review result is presented.

## 6. CI evidence and integration-state identity

The required PR workflow checks out GitHub's PR merge ref. Its evidence must identify:

- tested base SHA
- tested head SHA
- tested PR merge commit SHA
- branch-range `git diff --check` result
- working-tree `git diff --check` result
- test, Worker test, bundle, coverage, and build results

A green run is valid only for that exact tested integration state.

Before merge, compare:

```text
current base SHA == reviewed base SHA == CI-tested base SHA
current head SHA == reviewed head SHA == approved head SHA == CI-tested head SHA
current PR merge commit SHA == CI-tested PR merge commit SHA
```

For low-risk work with valid advance approval, the approval-head equality requirement may be represented by the original explicit end-to-end instruction. The reviewed and CI-tested base/head/merge identity requirements still apply.

If current `main` differs from the reviewed or CI-tested base:

1. stop release
2. update the PR branch with latest `main` using a non-force path
3. treat the resulting state as a new head/integration state
4. run complete independent review again
5. obtain new CI evidence
6. for medium/high risk, present the new result and obtain fresh merge approval

Do not rely on mergeability alone; semantic integration regressions can occur without conflicts.

## 7. Human approval gate

Approval means a specific authorization for the next risky action, not general enthusiasm for the project.

- Low risk: an explicit request such as “implement, merge, and deploy” can serve as advance approval after clean review and CI.
- Medium risk: present the PR, exact reviewed base/head SHA, risk summary, independent-review result, CI-tested integration evidence, and remaining manual checks; obtain merge approval for that state.
- High risk: obtain separate approval before production mutation, and identify exactly what will change, where, and how to roll it back.

For medium/high-risk work, any base or head change invalidates prior merge approval. After new complete-branch review and successful CI, present the new state and obtain fresh approval.

The following are always user-owned unless explicitly delegated with the required access and approval:

- entering or rotating secrets
- accepting pricing, billing, terms, or paid plans
- creating production Cloudflare/Google resources
- changing GitHub Repository Variables, Actions Secrets, Pages settings, DNS, or permissions
- physical-device and LINE-app validation that cannot be reproduced in the available environment

## 8. CI and release

Use `$otsukai-ship` only after the relevant approval gate is satisfied for the exact reviewed integration state.

Required PR workflow currently runs:

```bash
npm ci
git diff --check <base-sha>...<head-sha>
git diff --check
npm test
npm run test:worker
npm run check:worker-bundle
npm run test:coverage
npm run build
```

Also run local branch-range and working-tree checks when an execution environment is available:

```bash
git fetch origin main
git diff --check origin/main...HEAD
git diff --check
```

The release skill is a validation-and-delivery stage, not an implementation stage. If PR CI fails because of the change, stop and return to implementation. After any fix or base update changes the integration state, run full review again, obtain successful CI, and obtain fresh medium/high-risk merge approval before resuming release.

Release sequence:

1. verify PR scope, risk, exact reviewed base/head SHA, findings, and approval
2. record CI-tested base/head/PR-merge SHA from the successful run
3. fetch current base/head/PR-merge metadata immediately before merge
4. require exact equality with reviewed, approved, and CI-tested integration evidence
5. Squash merge using the expected head SHA
6. verify latest `main` contains the Squash result
7. verify Pages delivery as described below
8. check the public URL; perform the smallest relevant behavior smoke when deployed behavior changed
9. delete the merged branch when safe
10. report evidence and unverified items

Queued, skipped, cancelled, stale, or infrastructure-failed PR checks are not success.

## 9. Pages verification under latest-only concurrency

The Pages workflow intentionally uses one concurrency group with `cancel-in-progress: true`. This prevents an older `main` SHA from finishing after and overwriting a newer deployment.

After a merge:

- Prefer successful build and deploy for the exact Squash SHA.
- If the exact run is cancelled or superseded by a later `main` push, do not rerun or deploy the old SHA after a newer SHA.
- Require successful build and deploy for the latest current-main SHA.
- Verify the Squash SHA is an ancestor of that deployed latest-main SHA.
- A cancelled or superseded run alone is not successful delivery.
- A previously successful unrelated SHA or an HTTP 200 response alone is not sufficient evidence.

Thus every merged change must be proven present in a successful deployment, but the proof may be a successful newer deployment that contains it rather than a successful run for every intermediate SHA.

## 10. Default short prompts

### Plan only

```text
Use $otsukai-plan-change. Inspect the current repository and propose the smallest safe plan for <goal>. Do not edit files. Classify risk and identify decisions I must make.
```

### Implement to PR

```text
Implement the approved plan on a dedicated worktree. Run applicable tests, then use $otsukai-review-change. Resolve findings and open a ready PR. Do not merge.
```

### Review current branch

```text
Use $otsukai-review-change on this branch against main. Use independent read-only agents, wait for all results, record the reviewed base/head SHA, and return prioritized findings with file evidence.
```

### Approved release

```text
Merge is approved for PR <number> at reviewed base <BASE_SHA> and head <HEAD_SHA>. Use $otsukai-ship, confirm that review and CI cover that exact base/head and PR merge commit, Squash merge, verify a successful Pages deployment that contains the Squash SHA, then report evidence.
```

## 11. Metrics to observe

Track outcomes rather than generated activity:

- request-to-production lead time
- first-pass CI rate
- independent-review findings per PR
- post-review fix cycles
- human review time
- production regressions and rollback rate
- unplanned changes outside task scope

A higher number of agent threads or PRs is not itself evidence of higher productivity.
