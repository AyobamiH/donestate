# Threat model

| Threat | Control | Residual risk |
|---|---|---|
| Harness widens its own permissions | Immutable deterministic authority checks per action | A granted executable still has the OS rights of the worker |
| Shell injection through arguments | `spawn` with `shell: false` and array arguments | The target executable may interpret its own arguments dangerously |
| User model credential leakage | Key entry occurs only on a single-use HTTPS setup page; separate AES-GCM envelope, per-user vault, minimal sandbox environment and output redaction | Authorised repository code and the Codex process receive the user's model credential during execution; the deployment operator controls the wrapping key |
| Repository bypasses GitHub mutation policy | GitHub credentials are injected only after harness execution and validation, immediately before the exact push, then removed | The Worker-side GitHub API client and credential-injection action remain trusted |
| Duplicate effect after crash | Intent-before-effect record, idempotency key and ambiguity stop | Generic external commands cannot provide exactly-once semantics |
| Stale concurrent worker writes | Expiring leases and monotonically increasing fencing tokens | External systems must also honour idempotency or preconditions |
| Agent falsely claims success | Terminal state requires pinned signed independent attestation | A trusted verifier can still be wrong or compromised |
| Attestation replay | Run id and exact snapshot digest are signed | Reuse against an identical trusted snapshot is intentionally valid |
| Audit log modification | SHA-256 event chain | A host attacker can rewrite the whole database and recompute an unsigned chain |
| Runaway execution | Action, attempt, duration, output and changed-file budgets | Child-process descendants may outlive a simple signal on some platforms |
| Path escape | Canonical repository-root and working-directory checks | Symlink changes after admission remain a local-host concern |
| Malicious repository hooks or tests | No-shell local core plus isolated Cloudflare Sandbox for the hosted adapter | The Sandbox platform and pinned container image remain trusted computing dependencies |
| OAuth request forgery | Short-lived state and CSRF records, secure host cookies and explicit consent | A compromised browser session or deployment origin remains in scope |
| Cross-user run access | Run ownership is bound to the authenticated GitHub login and checked on every tool call | Shared or compromised GitHub identities share that authority |
| Cost abuse | User-owned OpenAI billing, one active run per user, a daily per-user run budget, bounded duration and a five-container global cap | Cloudflare compute remains operator-funded and attackers may distribute abuse across identities |
| Unsafe publication | Separate `push` and `open_pr` grants, exact base and head checks, intent records and provider probes | The public OAuth path uses user tokens; the private maintenance App is scoped to one selected repository; a public customer GitHub App and merge queue remain gated work |
| False public evidence | Hosted objectives require a public branch or pull request before handoff | Repository deletion or later force updates can make evidence unavailable |

## Non-goals for 0.1.0

This release does not claim hostile multi-tenant isolation, a secret broker, distributed consensus, remote event-log anchoring, provider-native exactly-once publication or correctness of an external verifier.

## Additional non-goals for the 0.2 hosted service

The hosted service does not claim private-repository support, a public customer GitHub App, merge-queue correctness, managed verifier keys, provider-independent event anchoring, penetration testing, formal verification, regional data residency, 24/7 operations or fleet SLOs. The private owner-side maintenance App is separately scoped to one selected repository, and the [incident-response runbook](INCIDENT-RESPONSE.md) defines process without promising continuous staffing or recovery time.
