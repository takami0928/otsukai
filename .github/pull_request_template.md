## Goal

<!-- State the observable user or operator outcome. -->

## Scope

- In scope:
- Out of scope:

## Risk class and approval

- Risk: Low / Medium / High
- Merge approval state:
- Approval base SHA:
- Approval head SHA:
- Production/external actions authorized:

## Changed behavior

<!-- Describe what changes and what intentionally stays the same. -->

## Preserved invariants

- [ ] Published v1/v2/v3 URL compatibility is preserved or intentionally migrated with an approved plan.
- [ ] `SHARE_PRODUCT_IDS_V2` compatibility rules are preserved.
- [ ] URL, quantity, text, IME, and grapheme limits are preserved.
- [ ] Existing storage and restore semantics are preserved.
- [ ] Shopping-state and sharing semantics are preserved.
- [ ] Handwriting-import privacy, confirmation, feature-flag, and secret boundaries are preserved.
- [ ] Not applicable items are explained below.

## Validation

- [ ] Focused tests added or updated.
- [ ] `npm test`
- [ ] `npm run test:worker`
- [ ] `npm run check:worker-bundle`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `git fetch origin main`
- [ ] `git diff --check origin/main...HEAD`
- [ ] `git diff --check` for uncommitted changes

Evidence / not-applicable rationale:

## Independent review

- Reviewer/session:
- Reviewed base SHA:
- Reviewed head SHA:
- Scope:
- Findings by severity:
- Fixes and re-review result:
- [ ] No unresolved P0 finding remains; P0 was not waived or accepted.
- [ ] No unresolved P1-P2 finding remains, or the user explicitly accepted it after seeing the current review result.
- [ ] Current PR base/head still equal the reviewed base/head.

## PR CI integration evidence

- CI run:
- CI-tested base SHA:
- CI-tested head SHA:
- CI-tested PR merge commit SHA:
- [ ] Current PR base/head still equal the CI-tested base/head.
- [ ] Current PR merge commit SHA still equals the CI-tested PR merge commit SHA.
- [ ] Branch-range and working-tree diff checks passed in CI.

## Manual and public checks

- Checks performed:
- Physical-device/LINE checks not performed:
- Pages evidence required after merge: exact Squash SHA success or successful latest-main deployment containing the Squash SHA
- Behavior-specific public smoke required after merge:

## External configuration and user actions

<!-- List any GitHub Variables, Worker Secrets, Cloudflare/Google settings, billing/terms, or manual actions. Do not include secret values. -->

## Rollback

- Trigger:
- Procedure:

## Delivery evidence

- Starting `main` SHA:
- Current PR base SHA:
- Current PR head SHA:
- Reviewed base/head SHA:
- Approval base/head SHA:
- CI-tested base/head SHA:
- CI-tested PR merge commit SHA:
- Expected merge method: Squash
- Squash SHA:
- Pages run/result:
- Deployed main SHA:
- Proof deployed SHA contains Squash SHA:
- Public URL/smoke result:
