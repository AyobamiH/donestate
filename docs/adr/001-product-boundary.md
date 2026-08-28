# ADR 001: DoneState is a separate execution plane

- Status: Accepted
- Date: 2026-08-27

## Context

[Proof & State](https://proofandstate.com) is the parent company defining the [AI Work Accountability](https://aiworkaccountability.com) category. Its product architecture requires execution and verification to remain separate: [OpsTruth](https://opstruth.io) is a read-only evidence and verification product, and turning it into a write-capable autonomous agent would collapse the independence that gives its conclusions value.

## Decision

[DoneState](https://proofandstate.com/donestate) is the authorised execution plane and a separate product and repository. It owns desired-state orchestration, explicitly granted authority, durable scheduling, harness execution, reconciliation and verification handoff.

OpsTruth remains the independent read-only verification plane. DoneState cannot issue its own terminal verification attestation or claim that its execution proves completion.

## Consequences

- Each product has a memorable, explainable job.
- Verification evidence remains independent of the actor that changed the repository.
- Integration requires explicit versioned documents rather than shared mutable state.
- Users authorise an objective boundary once and are interrupted only for exceptions outside it.
