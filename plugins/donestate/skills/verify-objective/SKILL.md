---
name: verify-objective
description: Use when a DoneState run awaits independent verification or a user asks whether the exact published result is proven complete.
---

# Verify a DoneState objective

DoneState is Proof & State's authorised execution control plane. OpsTruth is the independent read-only verification plane. Keep that trust boundary intact: DoneState, its coding harness and its plugin never certify their own execution evidence.

First call `get_objective`. If the configured automatic OpsTruth request already produced a terminal state, report it without resubmitting. If the run remains `AWAITING_VERIFICATION`, call `request_opstruth_verification` for the exact run ID. Use the manual handoff sequence below only when the configured bridge is unavailable.

For a manual sequence, call `create_verification_handoff` for the exact run ID. Preserve its handoff digest, verification nonce, execution snapshot digest, exact base and head commits, acceptance criteria, verification requirements, action intent/result digests and event-chain head without alteration.

For a `donestate.verification-handoff.v2`, call `opstruth_attest_donestate_handoff` with the complete handoff. OpsTruth must return the report and signed attestation without submitting it. DoneState, the coding harness and the plugin must never sign their own claims.

Only call `submit_verifier_attestation` when all of these are present:

- the same run ID and execution snapshot digest
- the same verification nonce and handoff digest
- a verification report digest
- a decision of `verified`, `failed` or `uncertain`
- evidence references that support the decision
- an Ed25519 signature from a fingerprint pinned in the objective

Submit the returned attestation once. Then call `get_objective` and report the resulting durable state. `verified` is allowed only when every sealed machine-checkable requirement was independently satisfied. Missing or incomplete evidence must remain `uncertain`.

If a verifier can inspect the repository but cannot produce the required signed attestation, report `BLOCKED_CAPABILITY`. Do not manufacture a signature, downgrade the trust rule or describe `AWAITING_VERIFICATION` as done.
