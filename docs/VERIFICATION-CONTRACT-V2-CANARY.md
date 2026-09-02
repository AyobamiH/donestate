# Fresh verifier-contract canary

This document is the bounded input for GitHub issue #64, **Fresh verifier-contract canary: prove authenticated OpsTruth v2 end to end**.

- Verifier product: `OpsTruth`
- Verifier production endpoint: `https://mcp.opstruth.io/mcp`
- Verifier deployed commit: `b25734e9919832854027e8c22b6212b822563f9f`
- Verifier Worker version: `084fa621-7bbd-4360-b210-a4caeebc8ee0`
- Verifier deployment workflow: `33600274035`
- Verification contract: `donestate.verification-contract.v2`
- Publication mode: `PR-only`
- Authority boundary: documentation-only canary; no merge, deployment, release, workflow, permission, or secret changes are authorised.

Historical DoneState run `b4242932-0bc1-4876-a202-634d9c12d72a` and PR #22 remain historical. They must not be changed or re-attested.

This document does not establish successful verification. `AWAITING_VERIFICATION` is non-terminal evidence, not success. Only an independent OpsTruth observation of the exact pull-request head after its required CI checks settle, followed by DoneState's acceptance of the complete `{ contractVersion, report, attestation }` response, can determine the run's terminal state.
