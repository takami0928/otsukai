---
name: otsukai-ship
description: Validate, merge, and verify an approved otsukai pull request through CI, Squash merge, GitHub Pages, and public smoke evidence. Use only after implementation and independent review; do not use to bypass medium/high-risk human approval or to mutate secrets and external production settings.
---

# Ship an approved otsukai change

Deliver a pull request through the repository release path. Do not interpret a request to “finish” as permission to bypass the risk and approval rules in `AGENTS.md` and `docs/CODEX_WORKFLOW.md`.

## Preconditions

Confirm all of the following before merge:

- the target PR and base branch are unambiguous
- the branch is based on an acceptable current `main`
- the PR scope matches the approved goal
- risk class is recorded
- an independent review covers the complete branch diff
- no unresolved P0-P2 finding remains unless explicitly accepted by the user
- the applicable human approval gate is satisfied
- no secret value appears in the diff, PR, logs, or instructions

For medium/high-risk changes, absence of explicit post-review merge approval is a blocker. Stop at a ready PR and report what approval is missing.

Never use this skill to create paid services, accept billing or terms, rotate/reveal secrets, change DNS or permissions, deploy a Worker, or edit GitHub/Cloudflare production settings without an explicit action-specific instruction.

## Procedure

1. Record starting `main` SHA, PR number, base, head branch, and expected head SHA.
2. Inspect changed files and confirm there are no unrelated or generated artifacts.
3. Verify the PR description contains goal, scope, risk, validation, independent review, manual checks, rollback, and user actions.
4. Confirm local validation evidence. Run applicable commands when an execution environment is available:

```bash
npm test
npm run test:worker
npm run check:worker-bundle
npm run test:coverage
npm run build
git diff --check
```

Do not mark an unavailable command as passed.
5. Wait for the required PR workflow. Queued, in-progress, skipped, cancelled, stale, or infrastructure-failed states are not success.
6. If CI fails because of the change, inspect logs and make only the smallest in-scope fix. Re-run local validation, independent review for material fixes, and CI.
7. Re-check base, head, expected head SHA, mergeability, review state, approval, and current `main` immediately before merge.
8. Squash merge. Never force-push `main`.
9. Record Squash SHA and verify the latest `main` is the expected result.
10. When deployed application code, build configuration, or public documentation changed, wait for the Pages workflow associated with the merged SHA. Require both build and deploy success.
11. Verify `https://takami0928.github.io/otsukai/` and the smallest relevant public smoke path when tooling permits. Distinguish HTTP availability from full physical-device or LINE validation.
12. Delete the merged branch when safe and no active worktree depends on it.

## Failure handling

- Do not repeatedly rerun a code-caused failure without changing anything.
- Retry a failed job once only when evidence indicates a transient infrastructure failure.
- Stop rather than guessing when main moved, the head SHA changed unexpectedly, review evidence is stale, approval is missing, or production configuration is required.
- Report partial completion accurately; never convert an unverified deployment into success.

## Output

Report:

- starting and final `main` SHA
- branch, PR, and expected/final head SHA
- risk and approval evidence
- changed behavior and preserved invariants
- local validation commands/results
- independent-review result and fixes
- CI workflow run/result
- Squash SHA
- Pages workflow run/result
- public URL and smoke result
- branch cleanup
- user actions and unverified physical-device/external checks
