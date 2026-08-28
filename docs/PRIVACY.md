# DoneState privacy notice

Last updated: 28 August 2026

This notice describes the hosted plugin preview for [DoneState](https://proofandstate.com/donestate), the authorised execution plane from [Proof & State](https://proofandstate.com) in the [AI Work Accountability](https://aiworkaccountability.com) category. The public command-line package runs locally and does not operate a hosted account by itself. [OpsTruth](https://opstruth.io) is a separate, independent read-only verification plane.

## Data processed

When connected to the hosted plugin, DoneState may process:

- GitHub identity details returned by OAuth, including login and public profile fields
- the public repository, base ref, objective, acceptance criteria, authority envelope and execution budgets you submit
- encrypted GitHub access credentials required for an active run
- an OpenAI API key supplied directly through the DoneState settings page, encrypted per user and never returned through ChatGPT tools
- code, diffs, validation output, action results and published branch or pull-request references
- signed verifier attestations and evidence references

## Purpose and service providers

The data is used to authenticate the operator, execute the repository objective only within explicitly granted authority, preserve durable recovery and audit state, publish an authorised result, and request independent verification. DoneState's execution records are evidence, not self-issued proof. A deployment uses Cloudflare for hosted execution and storage, GitHub for repository access and OAuth, and OpenAI for the coding harness. OpenAI API usage is billed to the account that issued the user's connected key, not to a shared DoneState account.

## Retention and deletion

Run data remains in the configured Durable Object until it is deleted or the deployment operator applies a shorter retention policy. The `delete_objective` tool deletes a terminal or cancelled run's encrypted GitHub credential, actions, events and objective record. The account-level OpenAI credential remains until it is replaced or deleted with `delete_openai_credential`; it is not copied into run storage. GitHub OAuth grants and provider-side records must be revoked or deleted through the relevant provider or deployment operator.

## Security

GitHub run credentials and user OpenAI credentials are encrypted at rest with separate operator-managed AES-GCM keys. Setup links are short-lived and single-use. Secrets are explicitly scoped into the isolated worker, removed from its credential file after execution, and redacted from bounded action output. One user may run only one objective at a time, daily execution is capped, and the per-run sandbox is destroyed after execution. No system can guarantee absolute security.

## Contact

For the repository preview, open a privacy issue at <https://github.com/AyobamiH/donestate/issues>. A production deployment must publish the legal identity, contact address, retention period and regional terms of its actual operator before accepting users.
