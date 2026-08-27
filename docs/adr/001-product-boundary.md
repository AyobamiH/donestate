# ADR 001: DoneState is a separate execution plane

- Status: Accepted
- Date: 2026-08-27

## Context

OpsTruth is a read-only evidence and verification product. Turning it into a write-capable autonomous agent would collapse the independence that gives its conclusions value. AgentProof separately defines authorisation, execution and signed-receipt transactions for consequential actions.

## Decision

DoneState is a separate product and repository. It owns desired-state orchestration, standing authority, durable scheduling, harness execution, reconciliation and verification handoff.

OpsTruth remains independent and read-only. AgentProof remains the transaction and receipt layer. DoneState cannot issue its own terminal verification attestation.

## Consequences

- Each product has a memorable, explainable job.
- Verification evidence remains independent of the actor that changed the repository.
- Integration requires explicit versioned documents rather than shared mutable state.
- Users authorise an objective boundary once and are interrupted only for exceptions outside it.
