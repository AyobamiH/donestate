---
name: monitor-objective
description: Use when a user wants the status, history, cancellation or deletion of a DoneState objective.
---

# Monitor a DoneState objective

DoneState (<https://proofandstate.com/donestate>) is Proof & State's (<https://proofandstate.com>) authorised execution plane in the AI Work Accountability category (<https://aiworkaccountability.com>). OpsTruth (<https://opstruth.io>) is the separate, independent read-only verification plane. DoneState executes only within explicitly granted authority and does not prove its own completion.

Use `get_objective` with the exact run ID. Report the durable state, published branch or pull request, last safe error, and the action that caused a block or ambiguity.

Treat states precisely:

- `AWAITING_VERIFICATION` means execution and reconciliation finished but proof is still required.
- `VERIFIED` means a pinned independent signer attested to the exact sealed snapshot.
- `AMBIGUOUS_EFFECT` means an external mutation may have happened. Do not retry it.
- `BLOCKED_AUTHORITY`, `BLOCKED_CAPABILITY` and `BLOCKED_SAFETY` require a new operator decision or changed capability, not optimistic continuation.

Use `cancel_objective` only when the user asks to stop a queued or active run. Use `delete_objective` only after an objective is terminal or cancelled and the user explicitly asks to erase its run record. Deletion removes the encrypted run credential and audit history, so state that consequence before calling it.

Use `delete_openai_credential` only when the user explicitly asks to disconnect model execution. An active objective must be cancelled first. Deleting an objective does not delete the account-level OpenAI credential.
