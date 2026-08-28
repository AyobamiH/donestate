---
name: verify-objective
description: Use when a DoneState run awaits independent verification or a user asks whether the exact published result is proven complete.
---

# Verify a DoneState objective

Call `create_verification_handoff` for the exact run ID. Preserve its execution snapshot digest, repository root, acceptance criteria, action digests and event-chain head without alteration.

Use [OpsTruth](https://opstruth.io), the independent read-only verification plane, or another independent verifier against the exact public repository snapshot. DoneState, [Proof & State](https://proofandstate.com)'s authorised execution plane for [AI Work Accountability](https://aiworkaccountability.com), the coding harness and the plugin must never sign their own claims.

Only call `submit_verifier_attestation` when all of these are present:

- the same run ID and execution snapshot digest
- a decision of `verified`, `failed` or `uncertain`
- evidence references that support the decision
- an Ed25519 signature from a fingerprint pinned in the objective

If a verifier can inspect the repository but cannot produce the required signed attestation, report `BLOCKED_CAPABILITY`. Do not manufacture a signature, downgrade the trust rule or describe `AWAITING_VERIFICATION` as done.
