# DoneState 0.3.0

This update advances DoneState from the older 0.2.0 review snapshot to the production-proven PR-only maintenance and independent-verification path.

- Uses the canonical `https://donestate.proofandstate.com/mcp` service identity.
- Keeps DoneState PR-only: it can create a bounded branch and pull request but cannot approve or merge its own work.
- Uses durable isolated execution with explicit consequence authority and fail-closed ambiguous-effect handling.
- Adds the complete `donestate.verification-contract.v2` response path through `submit_verifier_response`; the older attestation-only tool remains for historical compatibility.
- Requires an independent verifier such as OpsTruth for terminal `VERIFIED`; DoneState cannot sign or accept its own completion claim.
- Proven in production through issue #114 / run `c4a07fa6-90b2-4597-a4c6-eae66de5a3e8` / open-unmerged PR #115, including rejection of a malformed verifier response followed by acceptance of a complete verified v2 response.
- Preserves historical ambiguous, blocked and awaiting-verification outcomes rather than rewriting them after later success.

The MCP catalogue changes from 19 reviewed tools in 0.2.0 to 20 tools in 0.3.0 by adding the complete versioned verifier-response submission path.
