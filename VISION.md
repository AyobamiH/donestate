---
schema: clawsweeper.project-vision.v1
project_id: donestate
repository: AyobamiH/donestate
---

# Project Vision

## Identity

DoneState is Proof & State's authorised execution control plane for bounded repository work.

## Purpose

Let a human authorise an outcome and consequence envelope once, then allow a coding harness to execute within that boundary while deterministic software owns admission, budgets, leases, idempotency, state transitions, reconciliation, audit evidence, and completion semantics.

## Owns

- Objective and policy admission for authorised work.
- Durable execution, effect intent/settlement, reconciliation, and bounded recovery.
- Harness adapters and hosted execution surfaces.
- Sealed handoff of exact execution evidence to an independent verifier.

## Does Not Own

- Independent verification of its own success.
- OpsTruth's verification policy or signing identity.
- AgentProof's separate receipt/evidence protocol.
- Portfolio-level Proof & State governance.

## Non-Negotiable Invariants

- DoneState never self-verifies.
- VERIFIED requires a pinned, signed, independent attestation matching the exact execution snapshot.
- Ambiguous external effects are not blindly replayed.
- Authority is consequence-specific and does not silently widen.
- Deterministic code, not model judgement, owns execution-state truth and safety boundaries.
- Automatic repository maintenance is PR-only; DoneState does not merge its own repairs.
- Push, PR creation, deployment, publication, secret access, and destructive authority remain explicit and separately bounded.

## Evidence of Done

A command succeeding is not completion. Work is complete only when admitted actions settle, deterministic validation/reconciliation passes, the exact state is sealed, and required independent verification is satisfied.

## Relationships

- proof-and-state: portfolio governance.
- OpsTruth: independent read-only verification.
- AgentProof: separate evidence/receipt layer.
- Codex, Pi, OpenClaw, or another process: replaceable execution harnesses.

## Canonical Sources

README.md, AGENTS.md, docs/ARCHITECTURE.md, docs/TRUST-MODEL.md, docs/THREAT-MODEL.md, and generated project state.

## Agent Rule

Preserve the separation between authorised execution and independent proof. Never convert executor evidence into verifier authority.
