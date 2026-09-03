# Trust model

Within [Proof & State](https://proofandstate.com)'s product architecture, [DoneState](https://proofandstate.com/donestate) is the authorised execution control plane and [OpsTruth](https://opstruth.io) is the independent read-only verification plane. DoneState cannot use its own execution record as independent proof. AgentProof remains a separate evidence and receipt layer for consequential actions.

## Roles

| Role | Trusted for | Not trusted for |
|---|---|---|
| Objective author | Desired outcome and acceptance criteria | Runtime facts |
| Authority issuer | Consequence grants and limits | Successful execution |
| DoneState controller | Deterministic admission, ordering and durable records | Independent completion proof |
| Coding harness | Candidate implementation | Authority, policy or terminal truth |
| Action executor | Performing a bounded effect | Verifying its own outcome |
| OpsTruth or another independent verifier | Read-only evidence observation and signing a decision | Executing work or changing the execution snapshot |

## Verification trust

Verifier public-key fingerprints are pinned in the immutable policy stored with the run. V2 attestations use Ed25519 and a domain-separated canonical payload. The payload binds the run ID, execution snapshot digest, stable verification nonce, complete handoff digest, verification report digest, decision, issuer, issuance time and public HTTPS evidence references.

DoneState rejects:

- self-issued attestations;
- unpinned public keys;
- key and fingerprint mismatches;
- invalid signatures;
- another run id or snapshot digest;
- another verification nonce or handoff digest;
- an attestation that predates the sealed handoff or is issued beyond the allowed clock skew;
- empty evidence references.

Key custody and issuer governance remain deployment responsibilities. Production deployments should use hardware-backed or managed signing keys and should rotate trust through a separately reviewed policy change.

## Authority trust

Authority is objective-scoped, time-bound when configured and default-deny for remote, production, secret and destructive consequences. A successful harness command cannot grant authority to a later action.

## Residual trust

The local operating system, Node.js runtime, SQLite implementation, configured executables and repository filesystem are within the local trust base. Use isolated workers for hostile code and external receipt anchoring where tamper resistance against the host is required.
