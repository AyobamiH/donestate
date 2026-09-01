# DoneState to OpsTruth verification contract

Issue #59 is a false-evidence and interoperability repair. This document describes the review candidate only. It does not claim that the matching OpsTruth change is merged, that either side is deployed, or that a live round trip has passed.

## Authority boundary

DoneState remains the bounded execution plane. OpsTruth remains the independent read-only verifier. Proof & State may record the resulting evidence but cannot make either product independent merely by recording a claim.

New hosted objectives use `donestate.verification-contract.v2`. DoneState sends `donestate.verification-handoff.v2` and accepts only one complete response object containing:

- `contractVersion: donestate.verification-contract.v2`
- `report: opstruth.donestate-verification-report.v1`
- `attestation: donestate.verification-attestation.v2`

The machine-readable contract is `contracts/donestate-opstruth-verification.v2.json`. Strict JSON Schemas are in `schemas/verification-report-v1.schema.json` and `schemas/verification-response-v2.schema.json` alongside the existing handoff and attestation schemas.

## What DoneState verifies

DoneState does not trust a successful RPC or a signature by itself. The complete response must bind to the sealed run and satisfy all of these checks:

1. The contract, report, handoff, and attestation versions are supported.
2. Run ID, handoff digest, verification nonce, execution snapshot, repository, base SHA, expected head SHA, and exact observed head agree.
3. Every sealed verification requirement appears exactly once with the same ID, criterion index, and requirement kind.
4. The report decision is mechanically coherent with subject errors, requirement verdicts, and incomplete action states.
5. The SHA-256 digest of the canonical report matches the digest signed inside the attestation.
6. Report and attestation decisions agree and `issuedAt` equals `observedAt`.
7. Evidence is no older than 15 minutes, is not more than five minutes in the future, and does not predate the sealed handoff.
8. The Ed25519 public key fingerprint is pinned by the exact objective and is not present in the runtime revocation denylist.
9. The signature is valid for the domain-separated canonical attestation.
10. A run/nonce/handoff can be accepted only once.

An `uncertain` report stays at `AWAITING_VERIFICATION`. Recording that observation advances the event chain, so a later independent retry receives a fresh handoff and nonce. It is not a completed run and it is not `AMBIGUOUS_EFFECT`, because verifier uncertainty is not evidence that DoneState performed an unknown mutation.

## Replay and concurrency

Accepted versioned responses are claimed in the Durable Object `verification_replays` table. The replay claim, stored response, run state, and hash-chained event are committed inside one Durable Object storage transaction. Concurrent submissions may validate the same old response, but only one can consume its nonce against the unchanged event-chain head. The other fails closed.

## Trust rotation and compromise

Objectives pin verifier SPKI SHA-256 fingerprints. A new signer is introduced by explicitly pinning its fingerprint on new objectives after independent review. Existing historical evidence retains the signer identity it was issued under.

`OPSTRUTH_REVOKED_VERIFIER_FINGERPRINTS` is a comma- or whitespace-separated denylist of lowercase SHA-256 fingerprints. A revoked fingerprint is rejected even when it is still present in an old objective's allowlist. Revocation does not rewrite historical run outcomes. After suspected compromise, revoke the signer, stop accepting new responses from it, preserve the affected evidence, rotate to a separately reviewed key, and create a fresh verification run.

## Compatibility

Attestation-only version 1 and pre-contract version 2 inputs are historical adapters. They remain readable for objectives that were created before `verificationContractVersion` existed. Newly created hosted objectives record `donestate.verification-contract.v2` and reject attestation-only submission.

The local npm/CLI controller still exposes its original v1 handoff as a compatibility surface. Its state semantics are aligned with hosted DoneState: an independent `uncertain` decision remains `AWAITING_VERIFICATION`. The local v1 adapter is not a substitute for the new hosted response contract.

## Shared vectors

Reusable verified, failed, and uncertain vectors are under `schemas/vectors/verification-contract-v2-*.json`. Their signer has no production authority and its private key is not stored. `verification-contract-v2-negative.json` records unsupported-version, incomplete-report, decision, handoff, freshness, revocation, and replay mutations that both products should reject.

The older `schemas/vectors/donestate-v2.json` remains unchanged as historical compatibility evidence. It must not be mistaken for proof that the complete response envelope is deployed.

## Release gate

This contract becomes live only after all of the following are separately evidenced:

- DoneState review and exact-head CI pass;
- the matching OpsTruth read-only contract change passes an independent review that is not solely OpsTruth self-verification;
- both exact commits are deployed through their normal protected release paths;
- the authenticated GitHub read lane is available;
- a fresh consequence-disabled canary passes verified, failed, uncertain, replay, stale, altered, unknown/revoked signer, and unsupported-version cases;
- the exact source SHAs, deployed SHAs, signer, contract version, evidence scope, and final decision are recorded without modifying the historical PR #22 run.
