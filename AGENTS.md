# AGENTS.md

## Scope and purpose

These instructions apply to the entire repository. This repository contains the smartphone-first `おつかいメモ` web app. Preserve the household shopping flow, published URL compatibility, privacy constraints, and free-tier-first operating model.

## Read first

Before planning or editing, read only the sources relevant to the task:

- `README.md`: product behavior, compatibility rules, input limits, and local development
- `docs/PROJECT_MAP.md`: code ownership and high-risk invariants
- `docs/CODEX_WORKFLOW.md`: planning, independent review, approval, and release workflow
- `worker/README.md`: Gemini, Cloudflare Worker, Turnstile, secrets, deployment, and privacy
- `.github/workflows/verify-pr.yml`: pull-request quality gates
- `.github/workflows/deploy.yml`: GitHub Pages deployment

`docs/refactoring-plan.md` and `docs/refactoring-runbook.md` remain historical sources for the completed refactoring program. Use them only when a task explicitly concerns that program.

Do not paste whole documents into prompts. Cite the files and sections that control the change.

## Project commands

Run commands from the repository root.

```bash
npm ci
npm test
npm run test:worker
npm run check:worker-bundle
npm run test:coverage
npm run build
git fetch origin main
git diff --check origin/main...HEAD
git diff --check
```

Use the merge-base range command for committed branch or PR changes. The argument-free command checks only uncommitted working-tree changes and is not a substitute for the branch-range check.

There is no lint script. Do not invent one or add a dependency solely for linting.

## Working agreement

- Start from an up-to-date `main`; record its SHA and use a dedicated branch or worktree.
- Inspect the current implementation and tests before proposing a solution.
- For anything beyond a trivial edit, state the goal, affected paths, invariants, risk class, test plan, and approval gate before writing code.
- Make the smallest defensible change. Do not refactor unrelated code.
- Preserve existing public behavior unless the task explicitly changes it.
- Add or update focused tests for changed behavior and realistic regression risks.
- Never make validation pass by adding `skip` or `only`, deleting relevant tests, weakening assertions, or applying broad snapshot updates that conceal behavioral changes.
- During component extraction or refactoring, preserve DOM order, CSS classes, focus behavior, ARIA attributes, roles, and keyboard behavior unless the approved task explicitly changes them.
- Do not claim success from inspection alone. Run the applicable quality gates.
- Use an independent read-only reviewer after implementation. The implementing agent's self-review is not sufficient for medium- or high-risk changes.
- Resolve concrete review findings before release. P0 findings are never eligible for risk acceptance; report all unresolved findings explicitly.

## Product invariants

- Keep published v1, v2, and v3 shopping URLs readable.
- Never reorder, delete, or rewrite published entries in `src/data/shareProductIdsV2.ts`; append only when explicitly required.
- Keep request and catalog recovery payloads bounded, validated, and safe on malformed input.
- Preserve the 2,200-character final URL limits and current fallback behavior.
- Preserve Japanese IME and grapheme-aware input handling. Do not replace it with native `maxLength` or user-agent timing workarounds.
- Treat `localStorage` as device- and browser-context-local. Do not imply cross-device synchronization.
- Preserve shopping status semantics, cart confirmation, consultation behavior, completion rules, result sharing, and latest-action Undo unless explicitly changed.
- Keep handwriting import optional and safely disabled when public configuration is incomplete.
- Never expose `GEMINI_API_KEY`, `TURNSTILE_SECRET_KEY`, or raw external-service responses in client code, logs, GitHub variables, commits, or shared URLs.
- Do not persist or log handwriting images or model-derived content, and do not place them in shared URLs. The existing bounded, revalidated candidate result may be returned to the client for explicit user confirmation.
- Do not change the fixed Gemini model, external-service contract, billing posture, or privacy behavior without explicit user approval.

## Risk and approval

Classify every non-trivial change using `docs/CODEX_WORKFLOW.md`.

- Low risk: the user's original instruction may count as merge approval only when it explicitly requests end-to-end delivery.
- Medium risk: stop after current-head independent review and successful PR CI unless the user explicitly approves that reviewed head for merge.
- High risk: stop before any production mutation. Require explicit approval for each external or destructive action.
- P0 findings must be fixed and independently re-reviewed. They cannot be waived by user risk acceptance.

Never autonomously create paid services, rotate or reveal secrets, change DNS, enable billing, alter authentication or permissions, delete production data, deploy a Worker, or change GitHub/Cloudflare production settings.

## GitHub delivery

- Prefer available GitHub connectors/APIs; `gh` is a helper, not a prerequisite.
- Never force-push `main`.
- Keep one coherent change per branch and PR. Split large programs into independently releasable phases.
- Use the pull-request template and include goal, scope, risk, changed behavior, preserved invariants, validation, independent review, manual checks, rollback, and user actions.
- Wait for required CI to succeed; queued, cancelled, skipped, or infrastructure-failed runs are not success.
- Bind review evidence and medium/high-risk merge approval to the exact PR head SHA. Any head change invalidates the prior review; medium/high-risk changes also require fresh merge approval after the new review result is presented.
- Use Squash merge when merge is authorized.
- After every merge to `main`, verify the Pages workflow associated with that merge SHA reaches build and deploy success. Make the depth of public smoke testing proportional to the changed behavior.
- Delete merged feature branches when safe.

## Final report

Report verifiable evidence only:

- starting and final `main` SHA
- branch and PR
- changed files and behavior
- commands and test results
- independent-review head SHA, findings, and resolutions
- approval head SHA for medium/high-risk changes
- CI and Pages run results
- merge SHA and public URL when applicable
- actions still required from the user
- known limitations or unverified items
