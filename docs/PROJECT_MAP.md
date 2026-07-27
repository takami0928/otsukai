# Project map

This document is a navigation aid for agents and maintainers. It does not replace the implementation, tests, `README.md`, or `worker/README.md` as sources of truth.

## Product boundary

`おつかいメモ` is a React/Vite/TypeScript application hosted on GitHub Pages. Shopping requests are encoded into share URLs. The application has no account system, application database, or server-side storage for request and shopping state. The optional handwriting-import path sends a preprocessed image and bounded product candidates through a Cloudflare Worker to Gemini, then requires user confirmation before applying candidates.

## Main areas

| Area | Primary paths | Responsibilities |
| --- | --- | --- |
| App entry and routing | `src/`, page components under `src/pages/` | Route parsing, request creation, shopping flow, error boundaries |
| Product and category data | `src/data/` | Base product catalog, ordering, compatibility identifiers |
| Request sharing | sharing/serialization modules under `src/` | v1/v2/v3 encode/decode, URL construction, malformed-input handling |
| Household catalog | product editing and catalog-recovery modules under `src/` | Local overrides, added products, backup fingerprint, restore link/JSON |
| Shopping state | shopping pages, state modules, and tests under `src/` | Status transitions, consultation, checkout verification, completion, Undo |
| Input constraints | `src/constants/requestLimits.ts` and shared input utilities | Quantity, text, URL, IME, and grapheme limits |
| Handwriting import UI | `src/features/handwriting/` | Image preprocessing, Turnstile, request/response validation, confirmation, atomic apply |
| Handwriting Worker | `worker/src/`, `worker/test/`, `worker/README.md` | Origin/input/Turnstile validation, Gemini call, output revalidation, safe errors |
| PR verification | `.github/workflows/verify-pr.yml` | Tests, Worker tests, bundle check, coverage, build |
| Pages deployment | `.github/workflows/deploy.yml` | Build with public variables and deploy `dist` to GitHub Pages |
| Agent workflow | `AGENTS.md`, `docs/CODEX_WORKFLOW.md`, `.agents/skills/`, `.codex/agents/` | Planning, risk gates, independent review, release evidence |

## High-risk invariants

### Published URL compatibility

- Published v1, v2, and v3 URLs must remain readable.
- `src/data/shareProductIdsV2.ts` is an append-only compatibility table for published v2 references.
- Internal compatibility fields may remain even when no longer displayed.
- Unknown, empty, oversized, or malformed payloads must fail safely rather than produce a blank screen or partial unsafe state.

### URL and input budgets

- The final shopping-list URL and catalog-recovery URL are limited to 2,200 characters.
- Do not truncate payloads to fit. Preserve the established fallback behavior.
- Text limits use grapheme-aware counting where available.
- Japanese IME composition must not be broken by native UTF-16 `maxLength`, arbitrary timeouts, or platform-specific user-agent branches.

### Local persistence

- Household catalog and shopping state live in browser storage and are local to the browser context.
- LINE in-app browser and the external browser can have different storage.
- Restore operations require validation, preview, and explicit replacement.
- Do not silently migrate, merge, overwrite, or synchronize stored data without an explicit product decision and compatibility plan.

### Shopping semantics

Changes around status transitions, cart confirmation, consultation, checkout verification, completion counts, result sharing, ordering, or Undo are medium risk even when the code diff is small. Protect them with focused behavior tests.

### Handwriting import and secrets

- The feature remains hidden unless all public settings are present and enabled.
- Images and model-derived content are not stored in the app or Worker and are not placed in shared URLs.
- The user confirms candidates before the draft changes.
- Applying selected candidates must pass the normal quantity, condition, item-count, and URL-budget checks as one transaction.
- `GEMINI_API_KEY` and `TURNSTILE_SECRET_KEY` belong only in Worker Secrets.
- Public `VITE_` settings are not secrets.
- Worker deployment, secret mutation, billing, model changes, privacy changes, and production-variable changes require explicit user approval.

## Change-to-document routing

| Change | Read and update when applicable |
| --- | --- |
| Product behavior or public flow | `README.md`, affected tests |
| URL schema or compatibility | `README.md`, compatibility fixtures/tests, this document |
| Worker/API/privacy/configuration | `worker/README.md`, `.env.example`, Worker tests |
| CI or deployment | workflow file, `docs/CODEX_WORKFLOW.md` |
| New recurring agent workflow | `.agents/skills/`, `AGENTS.md`, `docs/CODEX_WORKFLOW.md` |
| Complex multi-phase work | create an execution plan from `docs/EXECUTION_PLAN_TEMPLATE.md` |

## Evidence hierarchy

When sources conflict, use this order and report the conflict:

1. Executed tests and observable current behavior
2. Current implementation on the latest `main`
3. Active public contracts and compatibility fixtures
4. `README.md` and `worker/README.md`
5. This navigation document
6. Historical plans and completed-phase records
