# AGENTS.md

## Scope

These instructions apply to the entire repository.

## Project commands

Run commands from the repository root.

- Install: `npm ci`
- Test: `npm test`
- Build: `npm run build`
- Diff validation: `git diff --check`

There is no lint script. Do not invent one or add a dependency solely for linting during refactoring.

## Sources of truth

Before refactoring, read:

1. this file;
2. `docs/refactoring-plan.md`;
3. `docs/refactoring-runbook.md`;
4. the current implementation and tests on the latest `main`.

The current implementation and passing tests define existing behavior unless the plan explicitly says otherwise.

## Product invariants

Refactoring must preserve all user-visible behavior and compatibility unless a phase explicitly authorizes a change.

Do not change:

- published v1 or v2 request URL formats, decoding, compression, fixtures, or backward compatibility;
- `ShoppingRequestPayload.title` or its position in v1/v2 payloads; it remains an internal compatibility field even though the visible title is fixed;
- fixed product IDs, `requestKey`, `requestId`, item IDs, or the 2,200-character share URL limit;
- Web Share API payload semantics, clipboard fallback, `AbortError` handling, or the LINE external-browser hint;
- localStorage keys, stored shapes, normalization, save timing, or restore behavior;
- Japanese IME handling, grapheme-count limits, quantity limits, or URL-budget validation;
- shopping status meanings and transitions, two-step cart confirmation, consultation-list behavior, checkout verification, completion rules, or result sharing;
- the five-second latest-action Undo behavior, including reason, note, and cart-order restoration;
- user-facing text, CSS classes, DOM order, focus behavior, ARIA attributes, and responsive behavior, except when a phase explicitly requires a mechanical relocation with identical output;
- dependencies, lockfile, GitHub Actions workflows, Pages configuration, or the product/category master.

## Refactoring rules

- Refactor only. Do not add features or redesign the UI.
- Use one phase and one pull request at a time, even when a single user instruction authorizes the full plan.
- Complete, merge, deploy, and validate one phase before starting the next.
- Prefer small, domain-specific modules over generic abstractions.
- Do not introduce Context, an external state store, a state-machine library, or an app-wide reducer.
- Do not use broad formatting changes, unrelated renames, speculative memoization, or dependency upgrades.
- Do not weaken, delete, skip, or broadly rewrite tests merely to make a change pass.
- Add focused characterization or unit tests when extraction would otherwise leave behavior insufficiently protected.
- Preserve established component boundaries unless the active phase explicitly changes them.
- A phase may be completed with a documented decision not to introduce an abstraction when the evidence shows that the abstraction would increase coupling or alter semantics.

## GitHub operations

- Use the connected GitHub App, GitHub API, MCP, or connector when available.
- `gh` is an optional helper, not a prerequisite. Do not ask the user to run `gh auth login` when an API/connector path is available.
- Use HTTPS to clone this public repository when a local checkout is needed.
- Never force-push `main`.
- Use Squash merge for refactoring pull requests.

## Autonomous full-plan mode

Only enter autonomous full-plan mode when the user explicitly instructs Codex to execute the full refactoring plan through deployment.

In that mode:

- follow `docs/refactoring-runbook.md`;
- execute all remaining phases in numerical order;
- create a separate branch and PR for every phase;
- require successful local validation and CI before each merge;
- verify the Pages deployment and relevant public-site smoke tests after every merge;
- continue automatically to the next phase without requesting routine confirmation;
- stop only for a genuine blocker listed in the runbook;
- never treat queued, cancelled, or infrastructure-failed CI as success.

Outside autonomous full-plan mode, perform only the phase explicitly requested and leave its PR unmerged unless the user explicitly authorizes merge and deployment.

## Documentation updates

Each phase PR must update only the corresponding phase record in `docs/refactoring-plan.md` with:

- status;
- branch and PR number when known;
- implementation summary;
- tests and build results;
- deployment and smoke-test result;
- any intentionally retained debt or evidence-based decision not to abstract.

Do not change the overall objective, invariants, phase ordering, or phase scope without explicit user approval.

## Reporting

At the end of autonomous full-plan mode, report:

- each phase, PR, CI result, squash SHA, and Pages run/result;
- final `main` SHA;
- public URL and end-to-end smoke results;
- tests added and final test count;
- skipped or decision-only work with rationale;
- unverified physical-device or LINE-app checks;
- any remaining risk or blocker.
