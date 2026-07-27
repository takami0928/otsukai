---
name: otsukai-ship
description: Validate, merge, and verify an approved otsukai pull request through CI, Squash merge, GitHub Pages, and public smoke evidence. Use only after implementation and independent review; do not use to bypass medium/high-risk human approval or to mutate secrets and external production settings.
---

# Ship an approved otsukai change

Deliver a pull request through the repository release path. Do not interpret a request to “finish” as permission to bypass the risk and approval rules in `AGENTS.md` and `docs/CODEX_WORKFLOW.md`.

This skill validates and delivers an already reviewed head. It does not implement fixes. If the head must change, stop and return to implementation and full independent review.

## Preconditions

Confirm all of the following before merge:

- the target PR and base branch are unambiguous
- the branch is based on an acceptable current `main`
- the PR scope matches the approved goal
- risk class is recorded
- the exact expected head SHA is recorded
- an independent review covers the complete branch diff at that exact head SHA
- no unresolved P0 finding remains; P0 findings cannot be accepted or waived
- no unresolved P1-P2 finding remains unless explicitly accepted by the user after seeing the current-head review result
- the applicable human approval gate is satisfied for the exact expected head SHA
- required PR CI succeeded for the exact expected head SHA
- no secret value appears in the diff, PR, logs, or instructions

For medium/high-risk changes, absence of explicit post-review merge approval for the exact current head is a blocker. Stop at a ready PR and report what approval is missing.

Never use this skill to create paid services, accept billing or terms, rotate/reveal secrets, change DNS or permissions, deploy a Worker, or edit GitHub/Cloudflare production settings without an explicit action-specific instruction.

## Procedure

1. Record starting `main` SHA, PR number, base, head branch, expected head SHA, reviewed head SHA, and approval head SHA.
2. Inspect changed files and confirm there are no unrelated or generated artifacts.
3. Verify the PR description contains goal, scope, risk, validation, independent review, manual checks, rollback, and user actions.
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

5. Confirm required PR CI is successful for the expected head SHA. Queued, in-progress, skipped, cancelled, stale, or infrastructure-failed states are not success.
6. If CI fails because of the change, do not edit within the shipping stage. Stop and return to implementation. Any fix creates a new head that requires full branch review, new CI, and fresh medium/high-risk merge approval.
7. Immediately before merge, re-check base, current head SHA, expected/reviewed/approved head SHA equality, mergeability, findings, approval, required CI, and current `main`.
8. Squash merge using the expected head SHA. Never force-push `main`.
9. Record Squash SHA and verify the latest `main` is the expected result.
10. For every merge to `main`, wait for the Pages workflow associated with the merged SHA. Require both build and deploy success even when the change affects only documentation or agent configuration.
11. Verify `https://takami0928.github.io/otsukai/` when tooling permits. Perform a behavior-specific smoke path only when the change affects deployed behavior. Distinguish HTTP availability from full physical-device or LINE validation.
12. Delete the merged branch when safe and no active worktree depends on it.

## Failure handling

- Do not repeatedly rerun a code-caused failure without changing anything.
- Retry a failed job once only when evidence indicates a transient infrastructure failure.
- Stop rather than guessing when main moved, the head SHA changed, review evidence is stale, approval is missing, required CI does not cover the current head, or production configuration is required.
- Report partial completion accurately; never convert an unverified deployment into success.

## Output

Report:

- starting and final `main` SHA
- branch, PR, expected/final head SHA
- reviewed head SHA and approval head SHA
- risk and approval evidence
- changed behavior and preserved invariants
- local validation commands/results
- independent-review result and fixes
- CI workflow run/result for the merged head
- Squash SHA
- Pages workflow run/result for the merge SHA
- public URL and smoke result
- branch cleanup
- user actions and unverified physical-device/external checks
