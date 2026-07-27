# Codex workflow

## Objective

Turn Codex from a single implementing agent into a controlled delivery system:

```text
brief -> plan -> implement -> independent review -> human approval gate -> CI -> merge -> deploy verification
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
- ready PR with CI evidence
- explicit human merge approval after review results are available

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

Recommended model posture:

- main planning/implementation thread: current GPT-5.6 family, medium or high reasoning depending on ambiguity
- read-heavy exploration: faster model or lower effort is acceptable
- correctness/security review: high reasoning
- do not pin model names in repository configuration unless a reproducibility need outweighs staleness

## 5. Independent review

Use `$otsukai-review-change` after implementation and before merge.

The reviewer must:

- be a separate read-only agent or detached `/review` session
- compare the complete branch against `main`, not only the last turn
- read the task goal and applicable invariants
- prioritize correctness, compatibility, security/privacy, state transitions, malformed inputs, race/double-execution risks, and missing tests
- provide file/symbol evidence and reproduction logic where possible
- avoid style-only comments unless they conceal a defect
- return `no findings` explicitly when no actionable issue is found

For medium/high-risk changes, the implementing agent may address findings, but must not be the only final reviewer. Re-run the independent review after material fixes.

Finding severity:

- P0: release-blocking security, data loss, secret exposure, or fundamental corruption
- P1: likely user-visible regression, compatibility break, unsafe external behavior, or incorrect core flow
- P2: credible edge-case defect or material test gap
- P3: non-blocking maintainability/documentation concern

P0-P2 must be resolved or explicitly accepted by the user before merge.

## 6. Human approval gate

Approval means a specific authorization for the next risky action, not general enthusiasm for the project.

- Low risk: an explicit request such as “implement, merge, and deploy” can serve as advance approval after clean review and CI.
- Medium risk: present the PR, risk summary, independent-review result, tests, and remaining manual checks; obtain merge approval.
- High risk: obtain separate approval before production mutation, and identify exactly what will change, where, and how to roll it back.

The following are always user-owned unless explicitly delegated with the required access and approval:

- entering or rotating secrets
- accepting pricing, billing, terms, or paid plans
- creating production Cloudflare/Google resources
- changing GitHub Repository Variables, Actions Secrets, Pages settings, DNS, or permissions
- physical-device and LINE-app validation that cannot be reproduced in the available environment

## 7. CI and release

Use `$otsukai-ship` only after the relevant approval gate is satisfied.

Required PR workflow currently runs:

```bash
npm ci
npm test
npm run test:worker
npm run check:worker-bundle
npm run test:coverage
npm run build
```

Also run `git diff --check` locally when possible.

Release sequence:

1. verify PR base/head, scope, review findings, and approval
2. wait for required CI success
3. Squash merge with expected head SHA
4. verify latest `main` equals the merge result
5. verify the Pages build/deploy for that SHA when deployed code changed
6. check the public URL and the smallest relevant smoke path
7. delete the merged branch when safe
8. report evidence and unverified items

Queued, skipped, cancelled, stale, or infrastructure-failed checks are not success.

## 8. Default short prompts

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
Use $otsukai-review-change on this branch against main. Use independent read-only agents, wait for all results, and return prioritized findings with file evidence.
```

### Approved release

```text
Merge is approved for PR <number>. Use $otsukai-ship, confirm the expected head SHA and clean review, wait for CI, Squash merge, verify Pages and the public smoke path, then report evidence.
```

## 9. Metrics to observe

Track outcomes rather than generated activity:

- request-to-production lead time
- first-pass CI rate
- independent-review findings per PR
- post-review fix cycles
- human review time
- production regressions and rollback rate
- unplanned changes outside task scope

A higher number of agent threads or PRs is not itself evidence of higher productivity.
