# Isolated release consequence canary

This is a disabled-by-default DoneState runtime for one exact disposable release in AyobamiH/agentproof-release-canary. It does not modify the hosted MCP Worker, customer runs, CLI publication, Post-Once or the existing repository-patch authority. Source and synthetic tests are not live release acceptance.

The source-pinned, immutable GitHub OIDC identity must come from the protected main workflow and environment, owner ID 47716486 and repository ID 1423718326. Only first workflow attempts are admitted. All five signing identities must differ. No GitHub publication credential is accepted by this service, and no inspected target is mutated here.

A SQLite Durable Object named by numeric repository and release IDs records one AUTHORIZED intent before AgentProof execution (the API spelling is AUTHORISED). The run ID, transaction ID, GitHub run and subject cannot be rebound. A separately approved and signed AgentProof receipt moves the run only to AWAITING_INDEPENDENT_VERIFICATION and triggers a short-lived handoff signed by the separately held DoneState Worker key. Only the trusted, exact-run, exact-receipt OpsTruth signature after independent byte verification can produce durable VERIFIED. Signed receipt, handoff, verdict and hash-linked transition history remain immutable. Duplicate requests return the same stored result; foreign workflow runs, retries and changed evidence are refused. Missing or stale evidence leaves the run pending.

Endpoints (POST with service-audience OIDC): /v1/start accepts {}; /v1/receipt accepts {runId, receipt}; /v1/settle accepts {runId, decision}; /v1/status accepts {}. /health is public. Bodies are limited to 64 KiB. Secret-bearing publisher-token headers are rejected. Internal durable-object forwarding is reachable only through the service binding.

Build the root first, then run npm ci --ignore-scripts and npm run check in this directory. CI does not deploy or request credentials. Deployment must use exact reviewed DoneState source, a separately recorded immutable canary workflow SHA, exact target and five verified public trust pins. Provision HANDOFF_PRIVATE_KEY_PEM through Wrangler stdin only; never put private keys into source, workflow arguments, files, logs or reports. Public configuration names are in controller.mjs. SERVICE_SOURCE_SHA identifies the deployed DoneState source; TRUSTED_SOURCE_SHA identifies the permitted canary workflow. They are intentionally distinct.

Recovery: inspect /v1/status and AgentProof's permanent target fence read-only. Never reset/delete a run or its ledger to retry publication. Preserve an uncertain result and its evidence. Disable by deploying ENABLED=false with the same namespace/key; disabled OIDC requests fail closed. Do not overwrite a key. A new run after a consumed claim requires a new explicitly reviewed disposable target and its own evidence.

Design references: Cloudflare SQLite storage transactions and output gates (https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/); GitHub repository-scoped GITHUB_TOKEN (https://docs.github.com/en/actions/concepts/security/github_token); exact OIDC claims (https://docs.github.com/en/actions/reference/security/oidc). The canary executor uses a short-lived repository-only token; neither verifier nor DoneState receives that token.

## Reviewed OIDC recovery boundaries

The durable authorisation freezes all five trust pins plus the permitted workflow commit. Any drift rejects continuation. Valid independently signed VERIFIED, CONTRADICTED and UNPROVEN decisions are terminal and immutable; unsigned verifier failures never imply acceptance.

An authenticated rerun of the same GitHub run may read status, submit existing evidence and settle; only attempt 1 can create a new authorisation. Recovery orchestration must use the AgentProof read-only reconcile route and must never repeat publication. POST /v1/refresh takes runId and receiptPayloadDigest and renews an expired handoff for the same receipt, preserving every prior handoff and an audit event. It never changes release authority and cannot extend the existing 20-minute receipt freshness window. Beyond upstream freshness limits, stop, preserve pending state and request a separately reviewed recovery decision; do not repeat the release mutation.


## Recovery before execution

A failed preparation can leave a DoneState authorisation without any AgentProof reservation.
`/v1/recover` is disabled unless deployment explicitly pins `RECOVERY_FROM_GITHUB_RUN_ID`
and `RECOVERY_FROM_WORKFLOW_SHA` to that predecessor. A new protected first-attempt workflow
must first obtain a fresh signed AgentProof reservation for the same target and transaction.
The permanent AgentProof fence refuses any changed seed already reserved or attempted.
DoneState verifies the reservation signature, exact new workflow and run, all unchanged trust keys,
and its original AUTHORISED state without any accepted receipt, handoff or decision.
It retains the complete old record in `authorisationHistory`, appends a linked audit event,
and rejects receipts whose execution predates recovery. Identical recovery is read-only/idempotent.
No endpoint clears the target fence or changes a terminal outcome. This recovery cannot repair
an ambiguous execution: preserve evidence and reconcile such executions under their original run.

Recovery now uses a causal signature gate: DoneState commits the preserved-authority transition before signing a domain-separated grant with its existing handoff key. AgentProof requires that exact grant to activate the same permanent reserved fence before execution. The signed completion records its digest. Timestamp checks remain additional freshness bounds, never the sole ordering proof. Withheld, forged, stale or wrong-attempt grants cannot execute; disabling recovery configuration cannot clear the stored gate.

## Durable readback recovery after publication

[ADR 002](../../docs/adr/002-deterministic-release-recovery.md) authorises a separate recovery of the already published effect. The original run, transaction, subject, producing workflow, five trust roles, committed recovery grant, completion bytes and audit prefix remain pinned. No new OIDC token or GitHub workflow rerun is needed. `READBACK_RECOVERY_ENABLED=true` activates only this private readback lane; public `ENABLED` stays false. This path has no publisher credential or publication operation.

The existing cron handler can arm only the configured, already authorised durable run. It cannot create an authorisation, rebind the target or clear a fence. Durable Object alarms advance `OBSERVE` → `SIGN` → `VERIFY`: obtain a fresh authority-signed observation of the original completion, recover the immutable receipt, then request the independently signed OpsTruth decision after fresh byte/provenance reads and a DoneState handoff. Expired observations or handoffs return to `OBSERVE` while preserving an existing receipt.

Before each RPC, the controller persists a 90-second lease and next alarm; RPC waiting is capped at 75 seconds. Retry state, stage, errors, attempt count and deadline survive an isolate or process restart. The default budget is 96 total stage attempts over 72 hours, with transport backoff from one minute to one hour. Exhaustion or a permanent refusal stops scheduling as recovery `BLOCKED`, retains its diagnostic and audit event, and preserves the existing run status. Only a valid independent signature can settle the run as `VERIFIED`, `CONTRADICTED` or `UNPROVEN`.

The named `ReleaseRecovery` Worker entrypoint exposes only `status()` through an explicitly configured service binding. It accepts no run selector and has no public HTTP forwarding route. Recovery calls use the named AgentProof `observe`/`sign` and OpsTruth `verify` bindings. Inspect the full stored recovery record and signed artifacts through the private status binding, then follow the [evidence and closure gate](../../docs/RELEASE-V1-CANDIDATE-GATE.md). Fresh closure disables both activation flags with the same source, namespaces and keys. The checkpoint must record actual independent acceptance and disabled-service health before this milestone is complete.

Local validation includes 29 service cases and actual Workers SQLite persistence, process restart, native alarm execution and private bindings. A synthetic runtime `VERIFIED` result is engineering evidence; current protected CI, deployment and live acceptance state are recorded in the [canonical project state](../../docs/PROJECT-STATE.md).
