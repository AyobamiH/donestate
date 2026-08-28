# DoneState directory submission record

This file is the canonical, reviewable handoff for the DoneState ChatGPT plugin listing. Submission is a release gate, not a repository claim: the listing is not public until OpenAI accepts and publishes it.

## Listing metadata

| Field | Value |
|---|---|
| Name | DoneState |
| Intended publisher | Proof & State |
| Category | Productivity |
| Short description | Governed autonomous coding with proof handoff. |
| MCP endpoint | `https://donestate-mcp.woeinvests.workers.dev/mcp` |
| Website | `https://github.com/AyobamiH/donestate` |
| Privacy | `https://github.com/AyobamiH/donestate/blob/main/docs/PRIVACY.md` |
| Terms | `https://github.com/AyobamiH/donestate/blob/main/docs/TERMS.md` |
| Authentication | OAuth with GitHub identity; user-funded OpenAI key is connected outside tool arguments |

## User value

DoneState turns a bounded repository outcome into a durable, PR-only coding workflow. It selects the least authority required, executes in an isolated Cloudflare Sandbox, records every consequential step, and stops until OpsTruth independently verifies the exact published head.

It does not merge pull requests, deploy services, publish packages, or claim that its own execution is proof.

## Starter prompts

1. `Implement this issue and open a verified PR.`
2. `Maintain this selected repository with verified PR-only repairs.`
3. `Show me the current state and evidence for my DoneState run.`
4. `Cancel this objective without publishing another change.`

## Review test cases

| Case | Expected result |
|---|---|
| Connect GitHub, inspect credential status | Identity is authenticated; no credential material is returned |
| Register a selected repository in observe mode | Repository is stored for that tenant without write or schedule authority |
| Discover repository maintenance work | Only bounded, read-only findings are recorded |
| Try automatic repair without `pr_only`, schedule opt-in, or exact CI names | Request is rejected before execution |
| Repair an issue without the `donestate:repair` label | Request is rejected as ineligible |
| Repair a labeled issue that touches protected governance paths | Execution stops as `BLOCKED_AUTHORITY` |
| Execute an eligible bounded repair | A branch and pull request may be created; no merge occurs |
| Receive malformed, stale, or untrusted verifier output | Run remains unverified and fails closed |
| Receive a fresh signed OpsTruth v2 attestation for the exact head | Run may transition to `VERIFIED` |
| Cancel and delete a terminal run | Durable run state and encrypted run credential are deleted |

## Evidence required before submission

- CI is green for the exact production merge commit.
- The Worker is deployed from that exact commit.
- GitHub App creation and selected-repository installation complete successfully.
- A read-only scheduled discovery canary completes.
- An eligible maintenance repair creates a pull request and never merges it.
- OpsTruth independently attests the exact pull-request head.
- The final status and evidence subjects are recorded in `docs/CURRENT-STATUS.md`.
- Proof & State completes OpenAI organization or business verification and confirms the publisher metadata.
- The production operator replaces preview-only legal language with binding contact, retention, and service terms.

## Publication state

`NOT SUBMITTED` — maintenance code is under review and the deployed canary, publisher verification, and production legal-policy gates remain open.
