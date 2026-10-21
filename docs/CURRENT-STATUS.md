# Current status

<!-- Current GitHub Marketplace evidence: E-013 -->

The canonical recovery order, owners, wait conditions, stale dates, and Evidence Story Bank are generated from `governance/project-ledger.json` into [Project state](PROJECT-STATE.md). Any consequential code, workflow, contract, deployment, distribution, or external-state change must update that ledger in the same change. Generated project state is never hand-edited.

## Release recovery checkpoint — 21 October 2026

<!-- Current release recovery evidence: E-142 -->

Release acceptance: **PENDING**.

**21 October reconciliation:** [E-142's current checkpoint](evidence/agentproof-ci-reconciliation-checkpoint-20261021.json) records a successful standard OAuth refresh and matching readbacks for all three disabled Pages projects. Their latest records are skipped entries, not executed builds. The administrator now reports that state correctly and permits only an explicit, capacity-checked retry; all 20 administration tests pass. The subscription GET returned HTTP 403, so fresh plan/entitlement evidence remains missing. No real build was requested. The required macOS job still has an account-billing refusal, and no native GitHub App check has been accepted. Release acceptance remains pending.

`AGENTPROOF-001` remains blocked on independent release acceptance. [E-134's immutable checkpoint](evidence/agentproof-release-publication-checkpoint-20261018.json) records one publication of release `416342082`, original DoneState run `12741172-631f-47b4-88c2-a63eeb1f9574`, three receipt readback failures and expired original completion freshness. It records disabled temporary services at closure; no new live readback is implied here.

[ADR 002](adr/002-deterministic-release-recovery.md) records the approved deterministic Cloudflare Durable Object recovery and deferral of Pi Durable / PiHarness. The implementation now persists alarms, stages, budgets and failures and recovers fresh, signed observations without another publication or changes to original authority. [E-137's source validation checkpoint](evidence/agentproof-release-recovery-source-checkpoint-20261020.json) records `LOCAL_VALIDATED`, exact source hashes and passing output: AgentProof 76 core, 20 script and 21 provider tests; DoneState 104 root and 29 provider tests; OpsTruth 146 root and 20 provider tests. Actual local Workers SQLite restart/native alarms and the three-service fixture also passed. These are engineering results; a signed original-release receipt, independently signed live OpsTruth outcome and original durable DoneState settlement remain unmet acceptance gates.

**Continue through the existing Cloudflare estate, with its CI integration and trust contract made explicit.** [E-138's routing correction](evidence/agentproof-release-recovery-ci-routing-20261020.json) records real historical Cloudflare execution in [ClawSweeper run 36323734781](https://github.com/AyobamiH/clawsweeper/actions/runs/36323734781). The inspected runner accepts GitHub JIT jobs; the [validation workflow](https://github.com/AyobamiH/clawsweeper/blob/16ac12c9b3d86aaa7ad876e566802838650ee5ef/.github/workflows/validate-workers-sdk-15940-cloudflare.yml) still provisions and cleans up through GitHub-hosted jobs. Reusable compute exists. Independently operated Cloudflare startup, scheduling, result reporting and cleanup for these recovery PRs have not yet been accepted.

E-137's exact [OpsTruth job refusal](https://github.com/AyobamiH/opstruth-chatgpt-plugin/actions/runs/39456417332/job/118744366283) remains historical evidence of the immediate failure: GitHub did not start the job because of an account billing issue. The earlier instruction to resolve billing was an incomplete continuation path because it did not reconcile the owner's existing Cloudflare infrastructure. This observation does not establish that every self-hosted Actions runner is unavailable. The three recovery PRs remain open with required checks unsatisfied; merge, recovery deployment and live acceptance remain pending.

Reuse requires current shared-capacity and spending evidence, bounded execution and cleanup, and genuine results for each final source commit. DoneState and OpsTruth source guards pin required checks to GitHub Actions App `15368`; an external reporter needs a reviewed provider-contract transition in source and protected-branch policy. AgentProof's required macOS job needs real macOS coverage. No provider migration, check bypass, unapproved overage, new compute run or recovery deployment is recorded by this documentation correction. The deterministic recovery architecture and PiHarness deferral remain unchanged.

The unrelated [reviewer sign-in repair PR #200](https://github.com/AyobamiH/donestate/pull/200) is active work. Its current repository evidence reports a 19 October OpenAI rejection and a reachable but not positively validated reviewer-login path. E-136 records that bounded review without merging, deploying or resubmitting the auth change.

## Current checkpoint, 9 October 2026

Owned-domain GA is recorded in E-118 after actual OneClickPostFactory fresh-client OAuth passed: code exchange, read-only MCP, token refresh and confirmed scoped revocation. Selected-App execution, pinned independent verification, indexed test-state cleanup, temporary Write removal, live policy text and current deployed-version natural health are separately complete. DoneState PR #185 and Proof & State PR #41 merged with all required candidate and exact-merge checks green. See [launch acceptance](GA-LAUNCH.md) for exact subjects and limits.

Market fit remains unproven. The next active work is [the customer learning loop](MARKET-FIT.md): external useful outcomes, eligible repeat use, paid conversion and support burden for one bounded public-repository job. Marketplace and directory review remain separate channel states. Historical checkpoints below describe their observation dates; they do not reopen completed current gates.

As of 2026-09-04, the production DoneState-to-OpsTruth maintenance loop had one complete fresh end-to-end `VERIFIED` successor. This does not rewrite any historical `AWAITING_VERIFICATION`, `AMBIGUOUS_EFFECT`, `BLOCKED_CAPABILITY`, or failed-safe run.

## Fresh customer continuation, 7 October 2026

The user reconnected DoneState GitHub OAuth as `OneClickPostFactory`; fresh admission and repository checkout now succeed with the independently confirmed temporary `write` grant. Run `257bbf51-66d2-4cd0-838d-01bbe66e2608` pinned deployed main `5b18fefcaa4c186782a2c14e5e4d16c2f93e11e4`, allowed three documentation/evidence files and was started exactly once. Its single implementation launch returned an identity-verified exit-code-1 receipt and ended `FAILED_SAFE` at `2026-10-07T06:43:52.736Z`, before a branch, PR or verifier request. Credential usage records one lease; a successful model response and provider funding remain unproven. E-070 and [the durable failed-run receipt](../evidence/clean-customer-20261007/attempt-03.json) preserve the result. Historical E-066 through E-068 retain their dated observations. The original unmerged OAuth story and the separate canonical AgentProof E-069 are preserved by E-072.

The deployed failure path omitted the implementation log before sandbox teardown, so this run's cause is unknown. E-071 tracks a bounded candidate repair that captures credential-redacted diagnostics before failure settlement and cleanup, without changing one-launch execution, terminal states or verification authority. Local checks, exact-head required CI, owner merge review and deployment remain separate gates. Do not retry the failed objective blindly.

After an owner-approved repair deployment, continue with a fresh bounded PR-only customer objective, exact-head required CI and pinned independent OpsTruth verification, then inspect/delete the disposable account and remove its exact temporary Write grant. The account, connected key and grant are retained for this authorised recovery. The customer maintenance registry remains empty; App/verifier scope is unchanged. CUST-001/CUST-002 remain complete; RELEASE-001 stays blocked on the fresh complete customer journey, separately evidenced fresh signup, and LEGAL-001.

## Worker dependency refresh, 7 October 2026

The permanent high-severity audit gate rejected the inherited Worker lock in PR #166 CI `37575211329` after both core jobs passed. E-068 tracks four fresh advisory families and a narrow patched override refresh: MCP client `2.2.0`, SDK `1.31.0`, proxy-addr `2.0.8`, sharp `0.35.5`, and source-map-js `1.2.2`. The gate remains active. Clean candidate installation and audit passed with zero vulnerabilities; 40 core tests, 142 Worker tests and plugin validation passed locally. Exact-head CI `37576065787` passed on `dce8772122b50186bbdbece53bd9a3bc21d42da4`. The owner-approved PR #166 merged as `5b18fefcaa4c186782a2c14e5e4d16c2f93e11e4`; post-merge CI `37577391832` and production deployment `37577391829` succeeded. The actual runner built and rolled out container `sha256:89239658656b1fe3cef2db45058fb8c7fa02e01ee4d5ecc04c8fa7e6ada9a74e` and Worker `98d66425-8a2c-4caf-a2a4-dced459bdd40`. This supersedes the local Docker capability limit for the deployment result, while historical E-068 retains its original candidate scope. The fresh customer failed implementation and undeployed diagnostic repair are independent of this dependency rollout.

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

## Native Cloudflare CI continuation — 21 October 2026

Three isolated Pages projects are provisioned and their identity/configuration readback passed: `proof-state-ci-agentproof`, `proof-state-ci-donestate`, and `proof-state-ci-opstruth`. The inspected projects have zero deployments and automatic production/preview builds disabled. The previous session's administrative scripts and provisioning receipts survived on the owner host, but its runner was not present on the recovery branches. The portable runner, explicit manifests and failure tests are now preserved alongside source rather than treated as an already-delivered result.

The selected route is native Pages build execution with a static, exact-source engineering receipt and the native Cloudflare GitHub check. No GitHub runner or owner-machine process is required to execute an accepted build. No Container, plan upgrade, production binding or secret is supplied to fixture execution. Node 22.23.3 and 24.22.0 archives are SHA-256 pinned. Real native execution, trusted check-provider policy migration and release recovery acceptance remain distinct pending gates. The separate AgentProof macOS requirement is preserved. Original release publication remains one; no release workflow is rerun.

See `ci/cloudflare/README.md` and `ci/cloudflare/manifest.json`. The owner authorised implementation and the Cloudflare CI integration on 20 October and continuation on 21 October. Provider-policy changes require genuine exact-head native results before replacing the old check source; no green status is copied or fabricated. PiHarness remains deferred.

### Native CI delivery checkpoint — 21 October 2026

The native runner and all eleven declared Linux jobs are preserved on the three recovery PR branches. Root checks and failure fixtures pass; exact local rehearsal results (including a retained toolchain-extraction failure) are in [E-141 delivery evidence](evidence/native-cloudflare-ci-delivery-20261021.json). GitHub verified the initial delivery signatures using the existing owner key. The source is not yet an accepted native CI deployment. A fresh read-only capacity-inspection invocation was refused by the tool safety check; no native build, provider-policy migration or production recovery was performed. Separate AgentProof macOS coverage remains unproven. Do not replace this concrete restart point with a requirement to pay GitHub or restart publication.
