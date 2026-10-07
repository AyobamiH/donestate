# Current status

<!-- Current GitHub Marketplace evidence: E-013 -->

The canonical recovery order, owners, wait conditions, stale dates, and Evidence Story Bank are generated from `governance/project-ledger.json` into [Project state](PROJECT-STATE.md). Any consequential code, workflow, contract, deployment, distribution, or external-state change must update that ledger in the same change. Generated project state is never hand-edited.

As of 2026-09-04, the production DoneState-to-OpsTruth maintenance loop has one complete fresh end-to-end `VERIFIED` successor. This does not rewrite any historical `AWAITING_VERIFICATION`, `AMBIGUOUS_EFFECT`, `BLOCKED_CAPABILITY`, or failed-safe run.

## Fresh customer continuation, 7 October 2026

The disposable OneClickPostFactory execution credential is connected. The fresh attempt stopped before objective/model execution: admission rejected push access to `AyobamiH/donestate`, and independent GitHub readback confirms the customer identity has only `read` permission. The temporary customer maintenance selection was removed; the unused credential remains connected. E-067 and `evidence/clean-customer-20261007/acceptance.json` record each step.

Continuation needs the owner's exact temporary write-access decision and accepted customer grant, then the public-repository OAuth objective, unmerged PR, exact-head CI, independent OpsTruth result and post-result inspection/deletion. No App or verifier scope was expanded. CUST-001/CUST-002 remain complete; RELEASE-001 remains blocked on the fresh complete customer outcome and LEGAL-001. Historical E-066 retains its original absent-credential observation.

## Default branch governance

Current GitHub provider state is **PROTECTED**. Repository ruleset **22247029**, `DoneState main governance`, is active on `refs/heads/main`. It requires pull requests, exact checks `core (22)`, `core (24)`, and `hosted-plugin` pinned to GitHub Actions integration `15368`, strict target-branch freshness, resolved review conversations, deletion blocking, and non-fast-forward blocking, with zero required human approvals and one owner emergency bypass.

Provider enforcement was proven by governance-only PR #118. Exact head `15e326116cb8aa424647a10f92ad4f8364a71fa1` ran workflow `33838442614`; all three required jobs succeeded before normal merge `a802384ca6cf7fa7596b952a2e4654be71b6a292`. Activation issue #117 is closed completed. The second trusted human reviewer remains an additive Stage 2 strengthening step and does not weaken or gate the active mechanical baseline.

## Hosted service and production maintenance runtime

- public local npm/CLI version: `0.2.0`
- historical hosted baseline source: `179e02c1a99dab780cabe09c4f5882e7e492ad18`
- historical hosted baseline workflow: `33210941821`
- historical hosted run: `631d8a08-d337-4bae-bd18-b55c31f48a8b` (`VERIFIED`)
- canonical MCP endpoint: `https://donestate.proofandstate.com/mcp`
- historical successful-canary runtime source (not the later 0.3.0 release): `e75a78e45f73ce8eebd13284c5bd52097bc764cc`
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

## Published CLI 0.2.0 Cloudflare acceptance — 3 October 2026

The published npm CLI is now externally accepted as a first-class human-and-agent control surface, not merely code merged on `main`.

Acceptance workflow `37111801210` completed successfully using the existing Cloudflare Sandbox apparatus. It installed public `donestate@0.2.0`, executed the installed CLI, and published a real bounded branch `donestate/85c188b4-a985-4c1d-86d3-26ee033cc6de` at exact head `543dfac251911e840856893cc3ca17ba1d0a45d7` from base `392ec4ae2a1e97fe7dcad724b9094437c024c0ea`. The diff contained exactly one acceptance evidence file. PR #152 was opened for the subject.

Exact-head CI run `37111963403` passed `core (22)`, `core (24)`, and `hosted-plugin`. The CLI generated sealed v2 handoff digest `0a10843eed1e87eabe6261c06386a7daa9f9a233c03f0d2fb82191e785938c4a`. Production OpsTruth independently observed the same exact head and returned decision `verified`; DoneState accepted the strict v2 response into terminal `VERIFIED` with `eventChainValid=true`.

The ephemeral acceptance Sandbox, Worker and container application were then cleaned up successfully. This acceptance did not require owner shell authentication and did not grant DoneState merge authority.

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

## Launch channel policy — 2 October 2026

DoneState is proceeding with the owned Proof & State service as a first-class standalone launch channel. This does **not** abandon either OpenAI/ChatGPT distribution or GitHub Marketplace. Both remain active parallel distribution tracks with their existing integration code and provider-state evidence preserved.

The canonical owned endpoint is `https://donestate.proofandstate.com/mcp`. Controlled standalone access does not wait for OpenAI review or GitHub Marketplace publication. Those external provider states gate only their respective distribution channels. CUST-001 and CUST-002 are now satisfied prerequisites following PR #164 (E-064/E-065). Unrestricted self-serve GA still requires the unresolved publisher requirements tracked in `LEGAL-001` and one fresh complete clean-account end-to-end acceptance result.

## Standalone account controls — 2 October 2026

PR #125 merged to protected `main` as `dab4ef8873d22218b5d9dcc1df5f11c3ed8a79ce` after exact-head workflow `37006798507` passed `core (22)`, `core (24)`, `hosted-plugin`, and plugin validation. Post-merge CI `37006922766` also passed.

Production deployment `37006923054` succeeded. The owned service now runs Worker version `cab1ea01-5195-49ab-b921-a8fd0f810be7` with sandbox container digest `sha256:3fb5083c07f82dd6e51d6276c149ec025c9b1d44c4f5d34ed071fc8f2ada5d86`.

The deployed account-controls path reuses the existing credential-setup browser flow rather than adding MCP tools. The initial 2 October observation proved status and link issuance only. Subsequent E-064/E-065 evidence completed production account-layout, real disposable-account deletion and controlled stale-write-fencing acceptance; PR #164 records CUST-001/CUST-002 complete.

The fresh 3 October customer attempt E-066 independently observed the emptied OneClickPostFactory account through the existing authenticated connection, but its execution credential was absent. It stopped at credential connection with `BLOCKED_CAPABILITY`; no fresh customer objective, execution, PR, OpsTruth result or post-result deletion occurred. Fresh signup/OAuth was also not exercised. [The sanitised receipt](../evidence/clean-customer-20261003/acceptance.json) records each step. RELEASE-001 remains blocked on the fresh complete outcome and LEGAL-001, with controlled access continuing.

## Owned-service aggregate measurement — 2 October 2026

A candidate privacy-minimal funnel now records only UTC day, a fixed event name and aggregate count for successful owned-service stages. It introduces no third-party analytics SDK, public analytics endpoint or MCP tool, and internal maintenance runs are excluded from customer objective/PR/verification counters. The candidate retains aggregate rows for at most 90 days and emits the current UTC-day snapshot through the existing hourly maintenance sweep. See [Measurement boundary](MEASUREMENT.md).

The counters measure stage volume only. They do not identify unique or repeat users and do not establish per-user conversion, retention cohorts or channel attribution. Those remain bounded manual-cohort measurements until a separately reviewed privacy-preserving design exists.

## GitHub Marketplace review

The production Marketplace submission remains **Pending for publish** and has not been published. The owner-authenticated preview at `https://github.com/marketplace/donestate` displays provider `AyobamiH`, `Add`, `Install it for free`, a `$0` `Public repositories` plan, and `1 install`. The authenticated management page at `https://github.com/marketplace/manage` lists production and development inventory, which is owner inventory rather than public evidence. An **unauthenticated exact Marketplace search returned no result**.

The owner preview does not prove public availability, public discoverability, webhook delivery, entitlement state, OAuth completion, repository selection, execution, billing, retention, or user outcome. The edit page at `https://github.com/marketplace/donestate/edit` remains the provider state boundary and historically showed `Pending for publish`, `Withdraw request`, `This listing has not been published to Marketplace`, and `This listing is a draft and has not yet been published on GitHub Marketplace`.

The separate OpenAI channel remains distinct: DoneState version `0.3.0` is in `Review` as observed on 8 September 2026; historical `0.2.0` is absent from the inspected inventory and its current disposition is unknown. Neither Marketplace preview content nor OpenAI review status changes the production maintenance verifier evidence above.

## Not implemented

DoneState does not merge its automatic maintenance pull requests, deploy or publish releases or packages autonomously, approve its own pull requests, manage repository fleets, or use CrabBox or ClawPatch at runtime. Multi-repository and fleet authority remain later explicit gates.

## Distribution reconciliation — 8 September 2026

See [the current directory submission record](DIRECTORY-SUBMISSION.md): DoneState 0.3.0 is submitted / Review, OpsTruth 0.4.1 is Published, and the existing GitHub Marketplace listing is still Pending for publish and not published. Earlier dated 0.2.0 Review observations are historical, not a current provider read. The observed DoneState review app ID differs from the historical mapping; continuity and old-version disposition remain unresolved. No duplicate is established; neither identity should be deleted or silently replaced.

OpsTruth standalone public-repository inspection does not require DoneState. Its authenticated DoneState exact-head bridge is a separate lane currently scoped only to AyobamiH/donestate. Directory visibility, a signed repository map and the historical VERIFIED canary do not substitute for a fresh clean-account end-to-end production outcome.
