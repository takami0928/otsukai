---
name: otsukai-ship
description: Validate, merge, and verify an approved otsukai pull request through CI, Squash merge, GitHub Pages, and public smoke evidence. Use only after implementation and independent review; do not use to bypass medium/high-risk human approval or to mutate secrets and external production settings.
---

# Ship an approved otsukai change

Deliver a pull request through the repository release path. Do not interpret a request to “finish” as permission to bypass the risk and approval rules in `AGENTS.md` and `docs/CODEX_WORKFLOW.md`.

This skill validates and delivers an already reviewed integration state. It does not implement fixes. If the base, head, or tested PR merge commit must change, stop and return to implementation and full independent review.

## Preconditions

Confirm all of the following before merge:

- the target PR and base branch are unambiguous
- risk class is recorded
- the exact reviewed base SHA and reviewed head SHA are recorded
- an independent review covers the complete branch diff for that base/head pair
- no unresolved P0 finding remains; P0 findings cannot be accepted or waived
- no unresolved P1-P2 finding remains unless explicitly accepted by the user after seeing the current review result
- the applicable human approval gate is satisfied for the exact reviewed base/head pair
- required PR CI succeeded for the exact CI-tested base SHA, head SHA, and PR merge commit SHA
- current base SHA equals the reviewed and CI-tested base SHA
- current head SHA equals the reviewed, approved, and CI-tested head SHA
- the current PR merge commit SHA equals the CI-tested PR merge commit SHA
- no secret value appears in the diff, PR, logs, or instructions

For medium/high-risk changes, absence of explicit post-review merge approval for the exact reviewed base/head pair is a blocker. Stop at a ready PR and report what approval is missing.

Never use this skill to create paid services, accept billing or terms, rotate/reveal secrets, change DNS or permissions, deploy a Worker, or edit GitHub/Cloudflare production settings without an explicit action-specific instruction.

## Procedure

1. Record PR number, base branch, current base SHA, head branch, current head SHA, reviewed base/head SHA, approval base/head SHA, CI-tested base/head SHA, and CI-tested PR merge commit SHA.
2. Inspect changed files and confirm there are no unrelated or generated artifacts.
3. Verify the PR description contains goal, scope, risk, validation, integration-state evidence, independent review, manual checks, rollback, and user actions.
4. Confirm local validation evidence. Run applicable commands when an execution environment is available:

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

The merge-base range command validates committed PR changes. The argument-free command checks only the uncommitted working tree. Do not substitute one for the other.

Do not mark an unavailable command as passed.

5. Read the successful PR CI context and record its tested base SHA, tested head SHA, and tested PR merge commit SHA. Queued, in-progress, skipped, cancelled, stale, or infrastructure-failed states are not success.
6. Immediately before merge, fetch current PR/base metadata and compare all reviewed, approved, CI-tested, and current SHAs.
7. If current `main` differs from the reviewed or CI-tested base SHA, do not merge. Update the PR branch with the latest `main` using a non-force path, then return to complete-branch independent review, new CI, and fresh medium/high-risk approval.
8. If CI fails because of the change, do not edit within the shipping stage. Stop and return to implementation. Any fix creates a new head/integration state that requires full review, new CI, and fresh medium/high-risk approval.
9. Squash merge using the expected head SHA only after the current PR merge commit still equals the CI-tested merge commit. Never force-push `main`.
10. Record the Squash SHA and verify the latest `main` contains the merge result.
11. Verify Pages delivery:
    - Prefer build and deploy success for the exact Squash SHA.
    - If that run was cancelled or superseded because a newer `main` push started, do not deploy the older SHA.
    - Instead require build and deploy success for the latest current-main SHA and verify the Squash SHA is an ancestor of that deployed SHA.
    - A cancelled, skipped, failed, or merely superseded run is not success without the successful containing deployment.
12. Verify `https://takami0928.github.io/otsukai/` when tooling permits. Perform a behavior-specific smoke path only when the change affects deployed behavior. Distinguish HTTP availability from full physical-device or LINE validation.
13. Delete the merged branch when safe and no active worktree depends on it.

## Failure handling

- Do not repeatedly rerun a code-caused failure without changing anything.
- Retry a failed job once only when evidence indicates a transient infrastructure failure.
- Stop rather than guessing when the base or head moved, the current PR merge commit differs from the CI-tested merge commit, review evidence is stale, approval is missing, required CI does not cover the current integration state, or production configuration is required.
- Keep the Pages workflow latest-only; do not redeploy an older SHA after a newer `main` SHA may already be in production.
- Report partial completion accurately; never convert an unverified deployment into success.

## Output

Report:

- starting and final `main` SHA
- branch and PR
- reviewed base/head SHA
- approval base/head SHA
- CI-tested base/head/PR-merge SHA
- final head SHA and current PR merge commit before merge
- risk and approval evidence
- changed behavior and preserved invariants
- local validation commands/results
- independent-review result and fixes
- CI workflow run/result for the tested integration state
- Squash SHA
- Pages workflow run/result and deployed main SHA
- proof that the deployed SHA equals or contains the Squash SHA
- public URL and smoke result
- branch cleanup
- user actions and unverified physical-device/external checks
