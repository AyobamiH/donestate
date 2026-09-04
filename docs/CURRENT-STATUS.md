# Current status

<!-- Current GitHub Marketplace evidence: E-013 -->

The canonical recovery order, owners, wait conditions, stale dates, and Evidence Story Bank are generated from `governance/project-ledger.json` into [Project state](PROJECT-STATE.md). Any consequential code, workflow, contract, deployment, distribution, or external-state change must update that ledger in the same change. Generated project state is never hand-edited.

As of 2026-09-04, the production DoneState-to-OpsTruth maintenance loop has one complete fresh end-to-end `VERIFIED` successor. This does not rewrite any historical `AWAITING_VERIFICATION`, `AMBIGUOUS_EFFECT`, `BLOCKED_CAPABILITY`, or failed-safe run.

## Default branch governance

Current GitHub provider state remains **UNPROTECTED**. The 4 September read-back reports `protected=false`, required status-check enforcement off, and zero active repository rulesets. Provider activation is therefore **BLOCKED_PROVIDER_ACTION**. Repository implementation is ready, but no source file can truthfully claim that a GitHub provider rule is active before an authenticated settings write and independent read-back occur.

The reviewed Stage 1 proposal in [Main governance](MAIN-GOVERNANCE.md) now requires pull requests, exact checks `core (22)`, `core (24)`, and `hosted-plugin`, strict target-branch freshness, resolved review conversations, deletion blocking, and non-fast-forward blocking, with zero required human approvals. A second trusted human reviewer is a Stage 2 strengthening step that adds one independent approval later; it no longer blocks mechanical protection.

## Hosted service and production maintenance runtime

- public local npm/CLI version: `0.1.2`
- historical hosted baseline source: `179e02c1a99dab780cabe09c4f5882e7e492ad18`
- historical hosted baseline workflow: `33210941821`
- historical hosted run: `631d8a08-d337-4bae-bd18-b55c31f48a8b` (`VERIFIED`)
- canonical MCP endpoint: `https://donestate.proofandstate.com/mcp`
- current maintenance source before this documentation closure: `e75a78e45f73ce8eebd13284c5bd52097bc764cc`
- post-receipt repair PR: #113
- repair exact review head: `6853e110f05a0fc97a16ecec6eda3175dccc3ec1`
- repair exact-head CI: `33802965309`
- post-merge CI: `33803045327`
- production deployment: `33803045585`
- production Worker: `97c8cca5-a554-42a7-82ab-a98337dc4a2a`
- deployed container: `sha256:8b710cb6911473cbba8fc1c5777bb496e1aaf93577c68aed6595cd707846d89a`
- Sandbox: `0.12.9`, RPC, `keepAlive: true`, `enableDefaultSession: false`
- Codex CLI: `0.150.1`
- implementation mode: one `startProcess` launch using the tracked waiter and terminal receipt, followed by a fixed 30-second post-receipt runtime-quiescence window before validation
- publication authority: PR-only; DoneState has no merge authority

## Production DoneState-to-OpsTruth v2 milestone

Fresh successor issue #114 ran only after the post-receipt quiescence repair was merged and deployed.

- run: `c4a07fa6-90b2-4597-a4c6-eae66de5a3e8`
- implementation launches: exactly one
- branch: `donestate/c4a07fa6-90b2-4597-a4c6-eae66de5a3e8`
- pull request: #115, still open and unmerged
- exact PR head: `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869`
- exact-head CI: `33806832575`; `core (22)`, `core (24)`, and `hosted-plugin` passed
- verification contract: `donestate.verification-contract.v2`

The first production OpsTruth response reached the v2 path but encoded `report.subject.providerRepositoryId` as a string. DoneState rejected that malformed response fail-closed; it did not manufacture success from partial evidence. OpsTruth PR #26 then merged the isolated numeric repository-identity correction as `eef00ca4f242cf99d6b39e8c37ae4b84970a86e4`. OpsTruth exact-main CI `33808853938` passed and production deployment `33808853917` succeeded.

A production retry for the same sealed exact head then returned the complete `{ contractVersion, report, attestation }` response. The report decision was `verified`, the exact subject remained `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869`, and DoneState accepted the independent result into terminal `VERIFIED`.

The successful successor does not rewrite predecessor evidence. In particular, issue #105/run `70310be5-5abe-413f-9643-f9e8e2425cc2` and issue #108/run `a0ae892d-1aeb-4f72-bd8b-f82bf94e6022` remain terminal `AMBIGUOUS_EFFECT`; issue #110/run `05aee1b9-9d24-47dd-af4c-701b9ad5c3fc` and issue #112/run `60ec7f6a-dfe9-47f8-aafc-0d8836b6e472` remain terminal `BLOCKED_CAPABILITY`. Historical PR #22/run `b4242932-0bc1-4876-a202-634d9c12d72a` remains `AWAITING_VERIFICATION`; its later owner merge is not retroactive verifier evidence.

## Verification contract anti-drift controls

DoneState now carries `governance/verification-contract-lock.json`, which pins the shared v2 response, report, attestation, and verified/failed/uncertain/negative vector artifacts by Git blob identity. `npm run verification:contract-lock` runs inside the normal repository `check` path and fails if a shared artifact changes without an explicit reviewed lock transition. The contract check also pins the complete-response requirement, `uncertain -> AWAITING_VERIFICATION`, and the rule that historical outcomes are never rewritten by this contract.

OpsTruth carries the complementary lock and an hourly read-only cross-repository sentinel. That sentinel compares the vendored contract identities against `AyobamiH/donestate@main` and checks the v2 contract version, response-schema path, and historical-outcome invariant. It has read-only repository permission and cannot create, retry, mutate, merge, deploy, or verify a DoneState run.

## Owner-side GitHub App authority

The private maintenance App remains restricted to only `AyobamiH/donestate` with `pr_only` policy. It may read Actions, issues, and metadata and may write code and pull requests. It does not receive administration, merge, deployment, release, environment, secret-management, or workflow-write authority. The owner remains the only merge executor.

The successful #114 canary leaves PR #115 open and unmerged specifically so the proof remains evidence of PR-only publication rather than evidence of autonomous merge authority.

## GitHub Marketplace review

The production Marketplace submission remains **Pending for publish** and has not been published. The owner-authenticated preview at `https://github.com/marketplace/donestate` displays provider `AyobamiH`, `Add`, `Install it for free`, a `$0` `Public repositories` plan, and `1 install`. The authenticated management page at `https://github.com/marketplace/manage` lists production and development inventory, which is owner inventory rather than public evidence. An **unauthenticated exact Marketplace search returned no result**.

The owner preview does not prove public availability, public discoverability, webhook delivery, entitlement state, OAuth completion, repository selection, execution, billing, retention, or user outcome. The edit page at `https://github.com/marketplace/donestate/edit` remains the provider state boundary and historically showed `Pending for publish`, `Withdraw request`, `This listing has not been published to Marketplace`, and `This listing is a draft and has not yet been published on GitHub Marketplace`.

The separate OpenAI channel remains distinct: DoneState version `0.2.0` remains in `Review`. Neither Marketplace preview content nor OpenAI review status changes the production maintenance verifier evidence above.

## Not implemented

DoneState does not merge its automatic maintenance pull requests, deploy or publish releases or packages autonomously, approve its own pull requests, manage repository fleets, or use CrabBox or ClawPatch at runtime. Multi-repository and fleet authority remain later explicit gates.
