---
name: run-objective
description: Use when a user wants DoneState to implement, repair, maintain or otherwise change a public GitHub repository autonomously from a prose outcome.
---

# Run a DoneState objective

Turn prose into one bounded, reviewable execution contract. DoneState, [Proof & State](https://proofandstate.com)'s authorised execution plane for [AI Work Accountability](https://aiworkaccountability.com), acts only within explicitly granted authority. It does not verify its own completion; [OpsTruth](https://opstruth.io) is the independent read-only verification plane.

## User-funded execution

Call `get_openai_credential_status` before creating an objective. If no credential is connected, call `create_openai_credential_setup`, give the user its single-use HTTPS link and wait for them to complete it. Then check status again.

Never ask the user to paste an API key into chat or place a key in tool arguments. DoneState encrypts the credential supplied on its settings page, and OpenAI charges model usage to that user's API account.

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

For a branch, request `local_read`, `local_write`, `test`, `commit`, `push` and `secret_access`. For a pull request, also request `open_pr`. `secret_access` means the isolated worker may receive the run's GitHub credential and the authenticated user's model credential. It does not permit unrelated secret access.

Call `create_objective` once only after the user approves the complete envelope. If the result is uncertain, retrieve the returned run ID. Never create a replacement objective merely because a response was delayed.

## Handoff

Return the run ID, pinned base SHA, granted authorities and current state. `AWAITING_VERIFICATION` is not `VERIFIED`.
