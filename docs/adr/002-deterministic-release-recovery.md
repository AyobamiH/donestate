# ADR 002: Deterministic durable release recovery before PiHarness

- Status: Accepted decision; implementation and live acceptance pending.
- Date: 2026-10-20
- Canonical work item: `AGENTPROOF-001` in `governance/project-ledger.json`.
- Decision authority: the user approved durable recovery on the existing Cloudflare runtime and asked that decisions and intentions remain recorded with the project.

## Context

[The preserved publication checkpoint](../evidence/agentproof-release-publication-checkpoint-20261018.json) records release `416342082` published once by GitHub run `39124373253`. Receipt readback failed three times; the original signed completion expired at `2026-10-18T11:53:38.649Z`. Repeating a chat turn or GitHub job cannot supply a fresh, independently verified outcome after that evidence window. E-133 and E-134 remain historical receipts.

[ADR 001](001-product-boundary.md) assigns deterministic orchestration to DoneState, execution receipts to AgentProof and independent observation to OpsTruth. The existing Durable Objects already hold the target fence and DoneState audit history. The missing capability is durable continuation of proof collection after publication.

## Decision and intended behaviour

Keep recovery in deterministic Cloudflare Durable Objects. Persist the recovery stage, attempt count, deadline, bounded failure code and next alarm before yielding. Alarms resume after request or process loss; retries apply only to readback and signing. Exhausted budgets remain visibly blocked or unproven. They never imply completion.

Use a private named `ReleaseRecovery` service entrypoint and explicit service bindings for the fixed controller, AgentProof authority/signer and OpsTruth verifier. `READBACK_RECOVERY_ENABLED` controls this lane separately from public activation. It conveys no GitHub publishing credential or new release authority. Keep the original target, workflow commit/run, transaction, DoneState run, five signing roles, durable namespaces and permanent fence.

A fresh authority-signed readback sidecar must bind the original immutable completion and a new bounded observation window. Preserve original execution timestamps, completion signature and the Receipt V2 contract. A sidecar neither renews execution permission nor asserts an independent outcome. The receipt signer independently observes GitHub. OpsTruth independently downloads the exact package/provenance bytes, verifies the original approval, receipt, fresh sidecar and DoneState handoff, then signs its own exact-subject decision. DoneState alone stores the resulting terminal state; it cannot manufacture its verifier's decision.

## Alternatives and reconsideration

Pi Durable / PiHarness integration is **deferred**. Introducing a persistent agent harness during this bounded recovery would add orchestration and migration decisions without removing the existing proof obligation. Reconsider when an accepted work item needs persistent multi-step agent sessions beyond this controller. Any harness must continue to supply evidence to deterministic admission, fencing and settlement; it gains no independent authority.

Keep manual read-only recovery as an operator diagnostic path. It is insufficient as the primary completion mechanism because the browser or active conversation must not own the retry clock.

## Acceptance and documentation contract

The current [recovery checkpoint](../evidence/agentproof-release-recovery-checkpoint-20261020.json) is evidence of the accepted decision and pending implementation, not a live acceptance result. The latest `AGENTPROOF-001` evidence story identifies its checkpoint by path and SHA-256. Add successor evidence for material results; preserve predecessor bytes and failed observations.

Before claiming this consequence accepted, retain the exact source and deployment identities, recovery after interruption, zero additional publication requests, the signed readback sidecar, signed release receipt, independently signed OpsTruth decision and readback of the original durable DoneState run with its intact audit chain. A receipt alone remains awaiting independent verification. Record disabled-service closure separately from terminal verification.

`npm run docs:check` verifies checkpoint hashes, original identities, evidence references and terminal proof requirements. `npm run governance:impact -- <base-sha>` requires service changes to update the ledger; `npm run governance:render` generates project state. These checks validate recorded evidence and consistency. They do not continuously observe a provider or turn a historical observation into current health. Hash-bound controller/deployment/health snapshots retain the recorded bytes; an offline check cannot independently establish the remote origin or persistence of an unsigned snapshot.

Keep npm RC6's immutable distribution record, release acceptance, directory/authentication work and independent adoption as separate states. No harness migration, npm republish, new target, key rotation or widening of the existing hosted MCP service follows from this decision.
