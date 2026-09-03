# ADR 001: DoneState is a separate execution plane

- Status: Accepted
- Date: 2026-08-27

## Context

[Proof & State](https://proofandstate.com) governs a product family whose trust boundary separates execution, verification and receipts. [OpsTruth](https://opstruth.io) is a read-only evidence and verification product. Turning it into a write-capable autonomous agent would collapse the independence that gives its conclusions value. AgentProof separately records evidence and receipts for consequential actions and must not turn those receipts into completion proof.

## Decision

[DoneState](https://proofandstate.com/donestate) is a separate product and repository and the authorised execution control plane. It owns desired-state orchestration, explicitly granted authority, durable scheduling, harness execution, reconciliation and verification handoff.

OpsTruth remains independent and read-only. AgentProof remains the separate evidence and receipt layer. DoneState cannot issue its own terminal verification attestation, present its execution evidence as independent proof, or silently widen its authority.

## Consequences

- Each product has a memorable, explainable job.
- Verification evidence remains independent of the actor that changed the repository.
- Integration requires explicit versioned documents rather than shared mutable state.
- Users authorise an objective boundary once and are interrupted only for exceptions outside it.
