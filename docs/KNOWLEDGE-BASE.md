# DoneState Product Knowledge Base

This is the canonical entry point for understanding DoneState as a product. It is an index over authoritative repository sources, not a second store of mutable project state.

## Product contract

DoneState is a durable autonomous coding control plane that completes explicitly authorised engineering work, records consequential effects, publishes bounded changes only through permitted delivery paths, and requires independent verification before declaring completion.

The governing invariant is: **DoneState completes authorised work. It never proves its own completion.**

The proven PR-only maintenance path is:

`issue -> durable run -> one bounded implementation -> authoritative implementation receipt -> validation -> donestate/<run-id> branch -> pull request -> exact-head required CI -> independent OpsTruth v2 verification -> DoneState VERIFIED`

A canary pull request is proof material and is not merged merely to prove the loop.

## Non-goals and hard boundaries

DoneState is not:

- a generic coding chatbot;
- its own independent verifier;
- an automatic merger;
- a replacement for repository CI;
- authorised to replay an ambiguous mutating effect;
- authorised to widen repository, credential, publication, deployment or merge authority silently;
- a multi-repository fleet controller until the separately governed fleet gate is opened.

`AMBIGUOUS_EFFECT`, `BLOCKED_CAPABILITY`, `BLOCKED_SAFETY`, `AWAITING_VERIFICATION`, and `VERIFIED` are materially different states. None may be rewritten into another merely to make a workflow appear successful.

## Canonical sources

| Question | Canonical source |
|---|---|
| Current work, recovery order, evidence and re-entry conditions | `governance/project-ledger.json` |
| Human-readable current project state | `docs/PROJECT-STATE.md` (generated, never hand-edited) |
| Agent authority and change discipline | `AGENTS.md` |
| System architecture | `docs/ARCHITECTURE.md` |
| Production/current channel truth | `docs/CURRENT-STATUS.md` |
| Maintenance canary rules | `docs/MAINTENANCE-CANARY.md` |
| Main-branch governance | `docs/MAIN-GOVERNANCE.md` |
| Incident and recovery procedure | `docs/INCIDENT-RESPONSE.md` |
| Hosted plugin/product surface | `docs/HOSTED-PLUGIN.md` |
| Public package/product entry point | `README.md` |
| Verification contracts | `contracts/` and implementation schemas |

If two documents appear to conflict, mutable status comes from the ledger/generated state and behavioural truth comes from executable contracts/tests. The conflict itself is a documentation defect and must not be resolved by guessing.

## Proven production milestone: canary #114

On 3 September 2026, successor issue #114 produced run `c4a07fa6-90b2-4597-a4c6-eae66de5a3e8` and branch `donestate/c4a07fa6-90b2-4597-a4c6-eae66de5a3e8`. Pull request #115 was sealed at exact head `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869` and remained open and unmerged.

The run proved the complete bounded chain: one implementation launch, authoritative terminal receipt, post-receipt runtime quiescence, validation, branch publication, PR publication, exact-head `core (22)`, `core (24)`, and `hosted-plugin` success, full independent OpsTruth v2 verification, and terminal DoneState `VERIFIED`.

Historical predecessor runs remain evidence and are not rewritten or relaunched.

## Anti-drift rules

1. Do not duplicate mutable status into this KB. Link to its canonical owner.
2. Consequential product, runtime, workflow, contract, deployment, distribution or external-state changes must update `governance/project-ledger.json` and its Evidence Story Bank in the same reviewed change.
3. Regenerate `docs/PROJECT-STATE.md`; never edit it by hand.
4. Product-contract changes require an explicit governance work item/evidence story and review.
5. Documentation must distinguish repository state, CI state, deployment state, runtime state and independent-verification state.
6. No document may claim `VERIFIED` without independent verifier evidence bound to the exact sealed subject.
7. README, marketplace/plugin descriptions and external product copy must not claim capabilities outside this contract.

## Development order

Future capability work enters through:

`product contract -> governed work item -> implementation -> tests/evidence -> canonical ledger -> generated state/KB impact -> independent verification where required`

If a proposed feature cannot be placed in that chain, it is not ready to become DoneState product behaviour.

<!-- agent-foundations:begin -->
## Repository-owned agent development

Read [the local secure delivery skill](../.agents/skills/secure-api-delivery/SKILL.md) during the initial applicability review, even for documentation tasks. It complements [agent instructions](../AGENTS.md) and never expands consequence authority.

Source entry points: [controller.ts](../src/controller.ts) coordinates run transitions; [policy.ts](../src/policy.ts) admits bounded objectives; [store.ts](../src/store.ts) persists SQLite state, effect records and leases. The [adapters](../src/adapters/) own external execution boundaries. Preserve explicit environment allowlists, intent-before-effect ordering and the independent verifier contract.

[CONTRIBUTING.md](../CONTRIBUTING.md) defines `npm install` and `npm run check`; [package.json](../package.json) requires Node.js 22.5+ and defines `npm run docs:check`, `npm run kb:check`, and the governance checks. Foundation-only validation is `python3 .agents/validate_foundations.py` (Python 3 standard library). It does not replace application tests or release-package audits.

Update the relevant knowledge and its authoritative source in the same change when architecture, behaviour, commands or boundaries change. Preserve verified lessons and decision rationale, not raw chat transcripts, secrets or unverified live status. Link to authoritative records rather than maintaining competing copies.
<!-- agent-foundations:end -->
