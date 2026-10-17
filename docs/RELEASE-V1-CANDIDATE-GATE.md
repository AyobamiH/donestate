# Source-only DoneState release.v1 consequence verification gate

Status: **unreleased, unregistered and inactive**. The existing DoneState product/service does not execute release.v1 and no historical run is changed to VERIFIED. This module is not exported from the public SDK index or wired into the hosted Worker.

## Three separate trust domains

AgentProof PR #15 merged the source-only GitHub draft-prerelease transaction and an exact-subject release-specific Receipt V2 verifier. It is neither published in npm RC6 nor authorised to perform live release effects. The existing repository-patch production canary remains a separate, more narrowly scoped service.

OpsTruth PR #41 merged a source-only **read-only** release verification kit. It binds separately downloaded exact package/provenance artifact bytes and an independently signed provenance manifest. It does not deploy an MCP tool, issue a live OpsTruth verification attestation or add GitHub write permission.

The DoneState module at `src/release-v1-evidence.ts` enforces the final contract boundary. It first cryptographically verifies an AgentProof release receipt under independently pinned, separate approval and signer keys and exact release-subject, transaction, idempotency, observation and time bindings. With only that receipt, it returns `AWAITING_INDEPENDENT_VERIFICATION`.

To classify an outcome as `VERIFIED` the caller must also present an **independently signed** `opstruth.release-v1-signed-outcome.v1` decision. Its signature must come from a different, independently pinned OpsTruth Ed25519 key. It binds the exact DoneState run and AgentProof transaction/receipt digest, the exact projected release subject, immutable numeric GitHub identities, tag commit, downloaded package/provenance byte SHA-256, distinct signed provenance issuer fingerprint and bounded observation time. An unsigned observation, an executor-authored “VERIFIED”, an untrusted key, a mismatched run, or changed digest fails closed. A signed failed/uncertain result remains `CONTRADICTED` or `UNPROVEN`; missing independent evidence cannot mark completion.

This is a *source-only acceptance function*, not a DoneState controller state-transition API. No deployment, GitHub release PATCH, npm publish, Worker authority change, private GitHub grant, credential setup, new public MCP tool, independent end-user installation, or accepted real customer outcome is performed by this module.

## Further real-world acceptance requirements

1. Review the AgentProof release.v1 GitHub authority, provision separate release-specific signing keys/policy and durable global target fencing. Do not widen the existing patch-canary signing role.
2. Create precisely one isolated disposable GitHub draft prerelease and pin its repository/release IDs, exact tag, package and provenance assets. Obtain a proper scoped GitHub write grant for **that** candidate only and record independent authorisation.
3. Run exactly one real GitHub release publication, preserve effects and recover ambiguous responses by read-only GitHub observation, not retries.
4. Integrate the OpsTruth read-only release byte/provenance kit with a separate GitHub App broker and an independently provisioned release-verification signer. It must issue an exact signed decision binding the DoneState release run; do not extend the existing DoneState-only verifier GitHub App installation permission.
5. Record a full live run with AgentProof authority + signed receipt + OpsTruth independent re-observation and signed decision + DoneState verified/failed-safe outcome. Preserve code/CI/deployment IDs and failure/rollback evidence. Only then consider registering release.v1 as a runtime capability.
6. Independently obtain ten real external AgentProof first-install observations. Automated tests and owner dogfooding earn zero qualifying adoption credit.

This module's seven synthetic crypto/negative tests prove the contract gate mechanics, not a real external release or independent result. The existing hosted DoneState and OpsTruth runtimes remain unchanged.
