---
name: otsukai-review-change
description: Independently review an otsukai branch or pull request against main for correctness, compatibility, privacy, security, state-flow regressions, and missing tests. Use after implementation and before merge; never use it to implement the fix in the same review pass.
---

# Independently review an otsukai change

Review the complete change set without editing files, committing, pushing, merging, deploying, or changing external settings. The implementing agent's self-review is supporting evidence, not a substitute for this review.

## Inputs

Identify:

- branch, commit, or pull request to review
- base branch, normally `main`
- exact base SHA and exact head SHA to review
- original goal and done criteria
- risk class and applicable approval gate
- test and CI evidence already available

Review the entire branch diff for the recorded base/head pair, not only the latest turn or commit.

## Procedure

1. Read `AGENTS.md`, `docs/PROJECT_MAP.md`, and the relevant sections of `README.md`, `worker/README.md`, and `docs/CODEX_WORKFLOW.md`.
2. Record the exact base SHA and head SHA, inspect the full changed-file list and diff, and confirm neither changed before finalizing the review.
3. Delegate the primary review to the read-only `independent_reviewer` custom agent. For Worker, CI, deployment, variables, secrets, or external-service changes, also delegate to `release_auditor`. Wait for all requested agents.
4. Verify the change against the original goal; flag both missing requirements and unrequested behavior.
5. Trace affected execution paths, state transitions, error paths, malformed inputs, and compatibility boundaries.
6. Check published v1/v2/v3 URL behavior, append-only compatibility data, storage/restore semantics, URL budgets, IME/grapheme handling, shopping status behavior, and handwriting-import privacy only when relevant.
7. Check security and operations boundaries: secrets, logs, raw external responses, CORS/Turnstile, feature flags, production variables, billing, CI integration context, and deploy scope.
8. Evaluate tests for behavioral coverage, realistic regression cases, false positives, and gaps. Do not approve merely because CI is green.
9. Validate committed branch whitespace with `git fetch origin main` followed by `git diff --check origin/main...HEAD`; use argument-free `git diff --check` only as the additional working-tree check.
10. For CI evidence, record the tested base SHA, tested head SHA, and tested PR merge commit SHA. Confirm the CI workflow tested the integration result rather than only an isolated head.
11. Reconcile subagent results. Remove duplicates, verify evidence, and reject speculative findings that cannot be tied to a plausible failure.
12. If either base or head changed after any prior review, review the new complete branch diff and integration state again. Every base/head change invalidates the prior final review.

## Severity

- P0: release-blocking secret exposure, data loss, destructive behavior, or fundamental corruption
- P1: likely user-visible regression, compatibility break, unsafe external behavior, or incorrect core flow
- P2: credible edge-case defect or material test gap
- P3: non-blocking maintainability or documentation concern

P0 findings must be fixed and independently re-reviewed; they cannot be accepted or waived. P1-P2 may be explicitly accepted by the user only after the current base/head review result is presented.

Do not dilute P0-P2 findings with style comments.

## Output

Start with findings, ordered P0 to P3. For each finding include:

- severity and concise title
- affected file and symbol/line when available
- failure mechanism or reproduction path
- why existing tests or guards do not prevent it
- smallest reasonable remediation direction

Then provide:

- exact reviewed base SHA and head SHA
- goal coverage
- preserved invariants checked
- branch-range and working-tree `git diff --check` results
- CI-tested base/head/PR-merge SHA
- test/CI evidence assessed
- custom agents actually executed
- unresolved assumptions or manual checks
- release recommendation: Block / Ready after fixes / Ready for approval

If there are no actionable findings, state `No actionable findings` and list the review scope and residual unverified risks. Do not manufacture a finding to appear thorough.
