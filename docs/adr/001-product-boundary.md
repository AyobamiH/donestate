# ADR 001: DoneState is a separate execution plane

- Status: Accepted
- Date: 2026-08-27

## Context

[Proof & State](https://proofandstate.com) is the parent company, and [AI Work Accountability](https://aiworkaccountability.com) is the category. Its product architecture separates [DoneState](https://proofandstate.com/donestate), the authorised execution plane, from [OpsTruth](https://opstruth.io), the independent read-only verification plane. Turning OpsTruth into a write-capable autonomous agent would collapse the independence that gives its conclusions value.

## Decision

DoneState is a separate product and repository. It owns desired-state orchestration, explicitly granted authority, durable scheduling, harness execution, reconciliation and verification handoff.

OpsTruth remains independent and read-only. DoneState cannot issue its own terminal verification attestation or present execution evidence as proof of completion.

## Consequences

- Each product has a memorable, explainable job.
- Verification evidence remains independent of the actor that changed the repository.
- Integration requires explicit versioned documents rather than shared mutable state.
- Users authorise an objective boundary once and are interrupted only for exceptions outside it.
