# Security Policy

## Supported state

This project is under active development. The primary user-facing supported state is the specific release or commit currently deployed to the public Stable Free Core environment.

The latest `main` branch is a development and investigation target. It is not automatically a deployed or user-facing supported release. It may contain changes that are not yet deployed, remain disabled, or are available only in staging.

Experimental photo, live-request, handwriting, Family Lab, Closed Alpha, and Paid Beta paths may remain disabled, invitation-only, or restricted to a separately identified deployed release. Public Release / General Availability is a separate deployed environment or release state for generally available paid or optional features and must be identified independently from the Stable Free Core.

## Reporting a vulnerability

Do not report security or privacy vulnerabilities in a public GitHub Issue, Pull Request, Discussion, commit message, or CI log.

Do not include any of the following in public content:

- API keys, Secrets, tokens, cookies, or authorization headers
- photo tokens, request tokens, edit secrets, or complete capability URLs
- real product photos or images
- user names, email addresses, phone numbers, or addresses
- real shopping-request content, product names, conditions, or free-text notes
- payment, refund, participant, or support records
- raw request or response bodies

Until a dedicated private reporting channel is published, contact the repository owner through a private channel available from the owner's GitHub profile. Provide only the minimum information needed to establish contact. Do not send live Secrets or user data in the first message.

If no suitable private channel is available, create a public Issue containing only the title `Security contact requested` and no technical details. The repository owner will arrange a private follow-up channel. The existence of a private operations repository does not make it a public vulnerability-reporting endpoint.

## Useful report contents

After a private channel is established, include:

- affected deployed release or commit, route, or component
- whether the affected code also exists on `main`
- prerequisites and impact
- minimal reproduction steps using synthetic data
- whether the issue affects the Stable Free Core, Family Lab, Closed Alpha, Paid Beta, Public Release / General Availability, or a disabled path
- evidence that does not contain Secrets or user content
- suggested mitigation, when available

Do not test with another person's data. Do not access, retain, modify, or distribute data beyond what is strictly necessary to demonstrate the issue.

## Response process

The repository owner will:

1. acknowledge the report when reasonably possible;
2. assess severity and affected deployed environments;
3. disable or restrict an optional feature when necessary to limit impact;
4. preserve the Stable Free Core where safe;
5. prepare and test a fix;
6. coordinate disclosure after remediation when appropriate.

This is an individually operated project. Immediate or 24-hour response is not guaranteed. Reports involving active Secret exposure, unauthorized data access, destructive behavior, or payment risk receive priority.

## Security boundaries

- The source repository is public. Security must not depend on hiding source code, routes, token formats, or input limits.
- Secrets belong in GitHub or Cloudflare secret stores and must never be committed.
- Capability URLs grant access to anyone who possesses the complete URL. They are not equivalent to account-authenticated confidential storage.
- Product photos and live requests use bounded retention and must not be treated as permanent storage.
- The service is not intended to make medical, allergy, or other safety-critical purchasing decisions on behalf of users.
- AI maintenance tools must not receive user photos, shopping content, capability URLs, Secrets, raw support messages, private operations Issues, or unrestricted private repository search results.
- AI maintenance tools may receive only information explicitly exported into a validated AI-safe allowlist schema.

## Operational safety

When a vulnerability affects an optional feature, the preferred first response is to stop new operations for that feature and fall back to the fixed text request path.

AI may prepare investigation notes, a Draft PR, a rollback checklist, and communication drafts. AI does not merge, deploy, modify external settings, rotate Secrets, refund, delete data, or send notifications, even after human approval.

Data migrations, Secret rotation, Production deployment, refund, deletion, and external notification are separately approved and executed by a human operator.
