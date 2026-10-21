# DoneState release.v1 consequence verification gate

<!-- Current release recovery evidence: E-141 -->

Release acceptance: **PENDING**.

Current status, 20 October 2026: **isolated publication observed; durable readback recovery locally validated; existing Cloudflare compute identified; trusted CI integration and live independent acceptance pending**. The hosted DoneState product and public SDK do not gain a general release action. The separate canary controller retains original run `12741172-631f-47b4-88c2-a63eeb1f9574`.

[The preserved 18 October checkpoint](evidence/agentproof-release-publication-checkpoint-20261018.json) establishes one publication of release `416342082` and failed separate receipt readback. It does not establish a signed release receipt, OpsTruth release decision or terminal DoneState VERIFIED. [ADR 002](adr/002-deterministic-release-recovery.md) records the accepted strategy; [E-137's hash-bound source checkpoint](evidence/agentproof-release-recovery-source-checkpoint-20261020.json) retains the passing source/runtime/interop evidence and the exact required-CI billing refusal from OpsTruth PR #44.

[E-138's CI routing checkpoint](evidence/agentproof-ci-delivery-checkpoint-20261021.json) corrects the continuation path to reuse the owner's existing Cloudflare estate. Historical Cloudflare execution is proven, while the inspected JIT runner and provisioning/cleanup workflow retain a GitHub Actions dependency. Independent Cloudflare orchestration and a trusted result reporter for these PRs remain unaccepted. Check current shared capacity and enforceable spending bounds before compute. Any change from the existing required-check producer must be reviewed in source guards and protected-branch policy, preserve every required validation, and retain genuine macOS coverage. Obtain successful results for each final PR head before merge or recovery deployment. No new compute, provider migration, protection bypass or live deployment is recorded here.

The original source-gate sections below retain their dated rationale. Later provisioning/publication evidence supersedes their previous deployment blockers. No historical failed run becomes VERIFIED merely because a new implementation passes source checks.

## Recording the next recovery outcome

`governance/project-ledger.json` remains the canonical status record. Append a new evidence story and dated checkpoint under `docs/evidence/`; keep the original publication checkpoint and earlier recovery checkpoints byte-identical. Link the new checkpoint as the story's `artifact: {path, sha256}` and make that story the last `AGENTPROOF-001.evidenceIds` entry. Update the current evidence marker, checkpoint link and explicit acceptance state in this document and `CURRENT-STATUS.md`, then run `npm run governance:render` and `npm run docs:check`.

The machine contract is `scripts/check-release-recovery-evidence.mjs`. Every referenced proof is a repository-local `{path, sha256}` artifact. The checkpoint preserves its original release, run, transaction, workflow, completion timestamps and archived trust policy throughout these stages:

| Recorded stage | Required evidence and limits |
| --- | --- |
| `implementation.state: LOCAL_VALIDATED` | One `implementation.verification` reference to a `donestate.agentproof.release-recovery-source-checks.v1` report. It records `engineeringOnly: true`, source file SHA-256 inventories, exact passing commands with retained output and output hashes, and the actual `fixtureOnly` cross-service result. The guard compares the DoneState inventory with the current checkout. This is local engineering evidence; acceptance remains `PENDING`. |
| `deployment.state: DEPLOYED` | An artifact with schema `donestate.agentproof.release-recovery-deployment.v1`, observation time, all three exact repository source commits and all four original Worker services. Each service records its source, preserved namespace bindings, fully deployed version ID and observed health. Public `enabled` remains false; `readbackRecoveryEnabled` is true. Health must bind the exact service source and original producing workflow. |
| Scheduled, running or blocked recovery | The current `acceptance.controllerSnapshot` artifact must match the declared `recovery.state` and preserve the original authorised record and audit prefix. `BLOCKED` retains its refusal code, stopped scheduling and audited preserved run status; it cannot substitute for an independently signed release outcome. |
| Terminal release acceptance | `acceptance.receipt`, `readbackAttestation`, `independentDecision` and `controllerSnapshot` each reference the actual retained JSON. The snapshot must contain the original execution evidence, fresh observation, receipt, handoff, signed independent decision and valid append-only audit. `acceptance.settledAt` must equal the recorded durable completion and terminal audit time. Production cryptographic validators recheck the exact original five trust roles and release/run/receipt bindings at that archived settlement time. |
| Fresh disabled-service closure | `closure.state: DISABLED` references a `donestate.agentproof.release-recovery-closure.v1` artifact through `closure.freshReadback`. It records the same four services, exact source/version/namespace bindings and fresh health with both activation flags false. `AGENTPROOF-001` can become `complete` only after independently `VERIFIED` acceptance and this closure evidence. |

Deployment and closure service entries have the shape `{name, source, namespaces, versions: [{version_id, percentage: 100}], health}`. Their top-level `sources` map must equal `checkpoint.implementation.sources` for `agentproof`, `donestate` and `opstruth`. A pending implementation uses `deployment: {state: "NOT_OBSERVED", artifact: null}` and retains the dated historical closure without claiming a fresh health observation.

The offline guard verifies integrity, consistency and signed acceptance contracts. A hash of an unsigned provider snapshot does not prove its remote origin, persistence, or health after the recorded observation. Retain the actual provider responses and reviewed deployment evidence; record later external changes in a successor checkpoint. A passing fixture, a Boolean completion claim, or a new timestamp alone cannot close the release acceptance gate.

## Three separate trust domains

AgentProof PR #15 merged the source-only GitHub draft-prerelease transaction and an exact-subject release-specific Receipt V2 verifier. It is neither published in npm RC6 nor authorised to perform live release effects. The existing repository-patch production canary remains a separate, more narrowly scoped service.

OpsTruth PR #41 merged a source-only **read-only** release verification kit. It binds separately downloaded exact package/provenance artifact bytes and an independently signed provenance manifest. It does not deploy an MCP tool, issue a live OpsTruth verification attestation or add GitHub write permission.

The DoneState module at `src/release-v1-evidence.ts` enforces the final contract boundary. It first cryptographically verifies an AgentProof release receipt under independently pinned, separate approval and signer keys and exact release-subject, transaction, idempotency, observation and time bindings. With only that receipt, it returns `AWAITING_INDEPENDENT_VERIFICATION`.

To classify an outcome as `VERIFIED` the caller must also present an **independently signed** `opstruth.release-v1-signed-outcome.v1` decision. Its signature must come from a different, independently pinned OpsTruth Ed25519 key. It binds the exact DoneState run and AgentProof transaction/receipt digest, the exact projected release subject, immutable numeric GitHub identities, tag commit, downloaded package/provenance byte SHA-256, distinct signed provenance issuer fingerprint and bounded observation time. An unsigned observation, an executor-authored “VERIFIED”, an untrusted key, a mismatched run, or changed digest fails closed. A signed failed/uncertain result remains `CONTRADICTED` or `UNPROVEN`; missing independent evidence cannot mark completion.

This is a *source-only acceptance function*, not a DoneState controller state-transition API. No deployment, GitHub release PATCH, npm publish, Worker authority change, private GitHub grant, credential setup, new public MCP tool, independent end-user installation, or accepted real customer outcome is performed by this module.

## Real-world acceptance requirements and preserved checklist

For this already published target, preserve completed steps as evidence and resume only missing readback/signing/verification. Never replay a publication or replace the original run.

1. Review the AgentProof release.v1 GitHub authority, provision separate release-specific signing keys/policy and durable global target fencing. Do not widen the existing patch-canary signing role.
2. Create precisely one isolated disposable GitHub draft prerelease and pin its repository/release IDs, exact tag, package and provenance assets. Obtain a proper scoped GitHub write grant for **that** candidate only and record independent authorisation.
3. Run exactly one real GitHub release publication, preserve effects and recover ambiguous responses by read-only GitHub observation, not retries.
4. Integrate the OpsTruth read-only release byte/provenance kit with a separate GitHub App broker and an independently provisioned release-verification signer. It must issue an exact signed decision binding the DoneState release run; do not extend the existing DoneState-only verifier GitHub App installation permission.
5. Record a full live run with AgentProof authority + signed receipt + OpsTruth independent re-observation and signed decision + DoneState verified/failed-safe outcome. Preserve code/CI/deployment IDs and failure/rollback evidence. Only then consider registering release.v1 as a runtime capability.
6. Independently obtain ten real external AgentProof first-install observations. Automated tests and owner dogfooding earn zero qualifying adoption credit.

This module's seven synthetic crypto/negative tests prove the contract gate mechanics, not a real external release or independent result. The existing hosted DoneState and OpsTruth runtimes remain unchanged.

## 17 October: separately signed release-verification handoff (source-only)

The unregistered source module `src/release-v1-handoff.ts` now constructs and verifies a **short-lived Ed25519-signed, domain-separated** `donestate.release-verification-handoff.v1` envelope. It binds the exact DoneState run UUID, AgentProof release transaction UUID, source release-subject digest, signed receipt payload digest and authenticated GitHub Actions run ID. The public key must match a **separately trusted DoneState handoff issuer** and be distinct from all AgentProof approval/receipt and OpsTruth verifier roles. Signer credentials are injected from an independent future custody service; no private key or live action permission exists in the module. An expired, unsigned, altered or wrong-run handoff is rejected rather than granting independent-verifier authority.

Local acceptance: seven isolated DoneState handoff tests; a separate cross-repository readback confirmed a real ephemeral DoneState-generated handoff validates in the OpsTruth candidate verifier and that a changed GitHub run ID is rejected. This establishes *contract interoperability only*; no live DoneState controller transition, GitHub release publication, OpsTruth deployment, new key provisioning or runtime signing authority is implied.

AgentProof PR #16 merged the isolated disabled release-authority and durable target-fence source at `b6724b1927e26aa7284371ec7fdd974aeefcbf42`. OpsTruth PR #42 has required checks green at head `5397391ad2cbcc3efda95eb1ec74a910127d2341`, including verification of the original approval and the new DoneState-signed handoff, but **the PR remains OPEN after a platform-refused merge**. The protected disposable GitHub canary repository exists but its draft release and credential-bearing workflow were refused by platform security; they are not complete. The previously operating AgentProof patch Workers remain at older source `2ed24b95ec90f36d52132cc3f98fc9d937ade4da`; new main is not yet re-pinned and has not passed its fresh 17/17 runtime canary. No external users were counted as independent adopters.

## 17 October — reviewed disabled service deployment readback (E-129)

AgentProof PR #16 merged release-only authority/fence source. OpsTruth PR #42 passed a revised security/role-independence review and merged as commit `08c53c4d78e6e280a78e4bb0e95de896108be401`, with green main CI and isolated verification tests. After exact-source dry-run, the separate `opstruth-release-verify` Worker was deployed at Cloudflare version `5e642434-56dc-4ccc-8e59-5a4ce7f88452`. Live health is `enabled:false`, zero source commit, `readOnly:true`, `independentSignerConfigured:false`; anonymous POST is denied with 401. The original 21-tool OpsTruth MCP service is unchanged.

The AgentProof release-only approval and signer Workers likewise remain disabled with no target or live signing keys. These are **three disabled infrastructure surfaces**, not an activated release consequence. The existing patch-only approval/receipt Workers remain enabled but pinned to earlier main `2ed24b95ec90f36d52132cc3f98fc9d937ade4da`; current main is `b6724b1927e26aa7284371ec7fdd974aeefcbf42`. [AgentProof #17](https://github.com/AyobamiH/agentproof/issues/17) separately tracks the permitted no-key-rotation repin and new 17/17 canary, rather than treating old acceptance as current. The genuine test-only GitHub draft and credential-bearing workflow were not created due to platform refusal. No production release, OpsTruth signed release decision, DoneState live VERIFIED outcome or external adoption credit exists yet.

### Native CI delivery checkpoint — 21 October 2026

The native runner and all eleven declared Linux jobs are preserved on the three recovery PR branches. Root checks and failure fixtures pass; exact local rehearsal results (including a retained toolchain-extraction failure) are in [E-141 delivery evidence](evidence/native-cloudflare-ci-delivery-20261021.json). GitHub verified the initial delivery signatures using the existing owner key. The source is not yet an accepted native CI deployment. A fresh read-only capacity-inspection invocation was refused by the tool safety check; no native build, provider-policy migration or production recovery was performed. Separate AgentProof macOS coverage remains unproven. Do not replace this concrete restart point with a requirement to pay GitHub or restart publication.
