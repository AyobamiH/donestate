# DoneState privacy notice

Last updated: 27 August 2026

This notice describes the DoneState hosted plugin preview implemented in this repository. The public command-line package runs locally and does not operate a hosted account by itself.

## Data processed

When connected to the hosted plugin, DoneState may process:

- GitHub identity details returned by OAuth, including login and public profile fields
- the public repository, base ref, objective, acceptance criteria, authority envelope and execution budgets you submit
- encrypted GitHub access credentials required for an active run
- code, diffs, validation output, action results and published branch or pull-request references
- signed verifier attestations and evidence references

## Purpose and service providers

The data is used to authenticate the operator, execute the authorised repository objective, preserve durable recovery and audit state, publish the authorised result, and request independent verification. A deployment uses Cloudflare for hosted execution and storage, GitHub for repository access and OAuth, and OpenAI for the coding harness.

## Retention and deletion

Run data remains in the configured Durable Object until it is deleted or the deployment operator applies a shorter retention policy. The `delete_objective` tool deletes a terminal or cancelled run's encrypted credential, actions, events and objective record. GitHub OAuth grants and provider-side records must be revoked or deleted through the relevant provider or deployment operator.

## Security

Run credentials are encrypted at rest with an operator-managed AES-GCM key. Secrets are explicitly scoped into the isolated worker, removed from its credential file after execution, and redacted from bounded action output. The per-run sandbox is destroyed after execution. No system can guarantee absolute security.

## Contact

For the repository preview, open a privacy issue at <https://github.com/AyobamiH/donestate/issues>. A production deployment must publish the legal identity, contact address, retention period and regional terms of its actual operator before accepting users.
