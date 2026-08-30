# Incident response

This runbook applies to the hosted DoneState service and its GitHub Marketplace integration. It defines an accountable response process; it does not create a 24/7 service-level agreement or a guaranteed recovery time.

## Report and ownership

- Report a suspected vulnerability privately through the [GitHub security advisory form](https://github.com/AyobamiH/donestate/security/advisories/new). Never place credentials, personal data, exploit details, or private repository content in a public issue.
- Use [GitHub issues](https://github.com/AyobamiH/donestate/issues) for non-confidential availability or support reports.
- The publisher owner is incident commander until a named replacement accepts the role. The technical maintainer owns containment and recovery evidence. The incident commander owns provider and customer communication.
- Create or update a bounded incident work item and Evidence Story Bank record in `governance/project-ledger.json`. Public records contain only redacted subjects and exact evidence references; confidential detail stays in the private advisory or provider case.

## Severity

| Severity | Examples | Initial action |
|---|---|---|
| Critical | Credential exposure, unauthorised repository mutation, cross-account data access, forged entitlement or verifier acceptance | Contain immediately, suspend the affected path, preserve evidence, rotate or revoke affected credentials, and begin provider notification |
| High | Marketplace lifecycle corruption, repeatable authority bypass, deletion failure, or material personal-data exposure | Stop the affected operation, preserve exact delivery/run subjects, and prepare notification |
| Medium | Bounded service outage, webhook backlog, incorrect non-terminal state, or rate-limit failure without unauthorised consequence | Stabilise, reconcile state, and communicate through the support issue when safe |
| Low | Documentation, usability, or isolated non-security defect | Track through the ordinary recovery ledger |

## Response clock

### First 15 minutes

1. Name the incident commander and record the discovery time in UTC.
2. Identify affected accounts, repositories, delivery IDs, run IDs, commits, deployments, credentials, and providers without copying secret values.
3. Classify severity and the authority boundary at risk.
4. Stop the narrowest affected path. Do not replay a mutation whose effect is ambiguous.
5. Preserve Worker logs, GitHub delivery metadata, durable state, CI subjects, deployment version, and verifier evidence.

### First hour

1. Revoke or rotate affected OAuth grants, App credentials, webhook secrets, encryption keys, or user credentials through their normal protected channels.
2. Reconcile every possibly affected external effect against its exact provider subject. Mark uncertainty as `AMBIGUOUS_EFFECT`; do not infer success from a request or log line.
3. Open the required private provider cases and prepare a customer-safe status statement.
4. Record the owner, current status, next action, wait condition, and stale date in the ledger.

### Within 24 hours of discovery

For a security incident that affects the GitHub Marketplace app or GitHub-supplied data, the incident commander must notify GitHub through the applicable Marketplace/security contact route within 24 hours of discovery and continue to provide material updates. Record only the case reference and timestamps publicly.

Assess and meet any shorter contractual or legal notification deadline that applies to affected users, providers, regulators, or data. The 24-hour GitHub step does not replace those duties.

## Recovery gate

Restore an affected path only after:

- the cause and affected boundary are understood;
- compromised credentials are revoked or rotated;
- stored and provider state are reconciled;
- regression and failure-path tests pass;
- the exact candidate commit, CI run, deployment version, and live probe subjects are recorded separately;
- an independent verifier evaluates any consequence that requires independent verification; and
- the incident commander accepts the residual risk and customer communication.

A repository fix or green CI run does not prove deployment, runtime recovery, data correction, entitlement reconciliation, or independent verification.

## Closure and learning

Within five working days of recovery, record a redacted post-incident evidence story containing timeline, root cause, affected authority, containment, exact proof, customer/provider notices, follow-up owners, stale dates, and useful measurements. Convert every follow-up into an active, planned, blocked, deferred, or complete ledger item; never leave it only in prose.
