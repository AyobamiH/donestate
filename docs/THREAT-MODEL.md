# Threat model

| Threat | Control | Residual risk |
|---|---|---|
| Harness widens its own permissions | Immutable deterministic authority checks per action | A granted executable still has the OS rights of the worker |
| Shell injection through arguments | `spawn` with `shell: false` and array arguments | The target executable may interpret its own arguments dangerously |
| Secret leakage through ambient environment | Minimal inherited environment plus explicit allowlist and output redaction | Repository code may read host-accessible files |
| Duplicate effect after crash | Intent-before-effect record, idempotency key and ambiguity stop | Generic external commands cannot provide exactly-once semantics |
| Stale concurrent worker writes | Expiring leases and monotonically increasing fencing tokens | External systems must also honour idempotency or preconditions |
| Agent falsely claims success | Terminal state requires pinned signed independent attestation | A trusted verifier can still be wrong or compromised |
| Attestation replay | Run id and exact snapshot digest are signed | Reuse against an identical trusted snapshot is intentionally valid |
| Audit log modification | SHA-256 event chain | A host attacker can rewrite the whole database and recompute an unsigned chain |
| Runaway execution | Action, attempt, duration, output and changed-file budgets | Child-process descendants may outlive a simple signal on some platforms |
| Path escape | Canonical repository-root and working-directory checks | Symlink changes after admission remain a local-host concern |
| Malicious repository hooks or tests | No shell, bounded process, default-deny secrets and remote authority | This release is not an OS sandbox; use an isolated runner |
| Unsafe publication | Separate `push`, `open_pr`, `merge`, `deploy` and `publish` grants | Provider-native exact-head and merge-queue adapters are future work |

## Non-goals for 0.1.0

This release does not claim hostile multi-tenant isolation, a secret broker, distributed consensus, remote event-log anchoring, provider-native exactly-once publication or correctness of an external verifier.
