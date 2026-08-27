---
name: run-objective
description: Use when a user wants DoneState to implement, repair, maintain or otherwise change a public GitHub repository autonomously from a prose outcome.
---

# Run a DoneState objective

Turn prose into one bounded, reviewable execution contract. DoneState performs authorised work. It does not verify its own completion.

## Admission

Collect only information that materially changes the run:

- GitHub repository in `owner/name` form
- base ref, defaulting to `main` only when that is clearly intended
- one outcome and at least one observable acceptance criterion
- publication as a branch or pull request
- validation profile and budgets when the defaults are unsuitable
- trusted verifier fingerprints when terminal `VERIFIED` is required

Private repositories are not supported by the current hosted adapter. Report `BLOCKED_CAPABILITY` instead of requesting broader OAuth access.

## Authority envelope

Explain the consequence classes as one grouped approval. Never infer remote mutation authority from a request to inspect, plan or advise.

For a branch, request `local_read`, `local_write`, `test`, `commit`, `push` and `secret_access`. For a pull request, also request `open_pr`. `secret_access` means the isolated worker may receive the configured GitHub and model credentials. It does not permit unrelated secret access.

Call `create_objective` once only after the user approves the complete envelope. If the result is uncertain, retrieve the returned run ID. Never create a replacement objective merely because a response was delayed.

## Handoff

Return the run ID, pinned base SHA, granted authorities and current state. `AWAITING_VERIFICATION` is not `VERIFIED`.
