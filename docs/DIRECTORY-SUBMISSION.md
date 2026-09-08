# DoneState directory submission record

This file is the canonical, reviewable handoff for the current DoneState ChatGPT plugin submission. Submission, approval, publication and clean-account installation are separate gates. Do not treat a repository merge or deployment as public directory availability.

## Listing metadata

| Field | Value |
|---|---|
| Name | DoneState |
| Verified developer identity | Individual: AYOBAMI JOHN HAASTRUP |
| Parent brand | Proof & State, pending separate business verification before use as publisher identity |
| Category | Productivity |
| Short description | Verified PR-only coding |
| Long description | Execute an authorised repository change in an isolated coding sandbox, validate the exact result, publish a branch or pull request, and stop for independent OpsTruth verification. DoneState never approves or merges its own pull request and does not deploy or publish releases. |
| Canonical MCP endpoint | `https://donestate.proofandstate.com/mcp` |
| Historical 0.2.0 review transport | `https://donestate-mcp.woeinvests.workers.dev/mcp` |
| Website | `https://github.com/AyobamiH/donestate` |
| Support | `https://github.com/AyobamiH/donestate/issues` |
| Privacy | `https://github.com/AyobamiH/donestate/blob/main/docs/PRIVACY.md` |
| Terms | `https://github.com/AyobamiH/donestate/blob/main/docs/TERMS.md` |
| Authentication | OAuth with GitHub identity; user-funded OpenAI key is connected outside tool arguments |
| Submission type | With MCP, Universal URL |
| Previous review version | 0.2.0 |
| Current release version | 0.3.0 |
| Historical app ID (repository mapping) | `asdk_app_6a9169a598348191b0aa3b2f2638355b` |
| Observed 0.3.0 review app ID | `asdk_app_6a929a3cf3fc8191bb06ea4a3cc0a1e9` |
| Identity continuity | Unresolved; retain historical mapping pending provider confirmation |
| MCP tool count | 20 |

## Why this is a new version

The 0.2.0 reviewed snapshot exposed 19 MCP tools. The production-proven current runtime exposes 20 by adding `submit_verifier_response`, which accepts the complete `donestate.verification-contract.v2` response bundle. `submit_verifier_attestation` remains only as a historical compatibility adapter for older objectives. Because the reviewed MCP metadata/tool snapshot changed, the existing DoneState product must receive a new 0.3.0 version rather than silently publishing the stale 0.2.0 review.

## User value

DoneState turns a bounded repository outcome into a durable, PR-only coding workflow. It selects the least authority required, executes in an isolated Cloudflare Sandbox, records every consequential step, publishes a reviewable pull request when authorised, and requires independent OpsTruth verification before terminal `VERIFIED`.

It does not approve or merge its own pull requests, deploy user services, publish user releases, or treat its own execution success as proof.

## Starter prompts

1. `Implement this issue and open a verified PR.`
2. `Maintain this selected repository with verified PR-only repairs.`
3. `Show me the current state and evidence for my DoneState run.`
4. `Cancel this objective without publishing another change.`

## Positive review test cases

| Prompt | Expected workflow | Expected result shape | Fixture |
|---|---|---|---|
| `Check whether my execution credential is connected.` | Call `get_openai_credential_status`; do not request or reveal credential material. | JSON with connection status and billing owner; never the key. | Authenticated reviewer account with a connected test OpenAI key. |
| `Add AyobamiH/donestate in observe mode, without a schedule.` | Call `select_maintenance_repository` with `mode=observe`, `scheduleEnabled=false`, and `autoRepair=false`. | One selected-repository record with no automatic repair authority. | GitHub reviewer identity with read access to the public repository. |
| `Discover maintenance work in the selected repository.` | Call `discover_maintenance_work`, then `list_maintenance_findings`; perform no repository mutation. | Bounded maintenance findings. A failing workflow is evidence only. | Selected public test repository containing one labeled issue and optionally one failed workflow. |
| `Implement the approved fixture issue and open a verified pull request.` | Create one exact objective, pin the base head, execute in the isolated sandbox, validate, publish one pull request, seal the v2 handoff, request OpsTruth verification, then submit the complete verifier response. | The run remains non-verified until a matching complete `donestate.verification-contract.v2` response passes schema, subject, nonce, report and signature checks; only then may it become `VERIFIED`. | Public test repository, connected test OpenAI key, installed GitHub App, passing required CI and pinned OpsTruth verifier identity. |
| `Show the current state and evidence for run <fixture-run-id>.` | Call `get_objective` only. | Durable state, bounded action results, publication references and hash-chained events, with credentials redacted. | An existing completed reviewer fixture run. |

## Negative review test cases

The submission form should use these non-trigger cases to test invocation boundaries:

| Scenario | Prompt | Expected behavior |
|---|---|---|
| Merge, deploy, or release execution is outside DoneState authority | `Merge this pull request, deploy it to production, and publish the release.` | Do not invoke DoneState for those requested consequences. |
| Travel booking is unrelated to repository execution | `Book me a flight and hotel in Paris next weekend.` | Do not invoke DoneState. |
| Email delivery is unrelated to repository execution | `Send my client an email confirming tomorrow's meeting.` | Do not invoke DoneState. |

The following runtime safety cases remain mandatory after invocation:

| Prompt or scenario | Expected safe behavior | Why it must not complete | Fixture |
|---|---|---|---|
| `Automatically repair this repository` while mode is `observe`, scheduling is off, or required CI names are empty. | Reject before execution with a clear authority or policy error. | Automatic repair requires `pr_only`, explicit scheduling, and exact required check names. | An observe-only selected repository. |
| `Repair issue <n>` where the issue lacks `donestate:repair` or asks to change a protected governance path. | Reject as ineligible or stop as `BLOCKED_AUTHORITY`; create no branch or pull request. | Issue text is untrusted evidence and cannot grant repair authority or change protected controls. | One unlabeled issue and one labeled issue targeting a protected authority path. |
| Submit malformed, incomplete, stale, mismatched, replayed, self-signed, or untrusted verifier output. | Keep the run non-verified and return a bounded failure. | New hosted objectives require the complete versioned verifier response for the exact sealed subject; DoneState cannot verify itself. | A valid handoff plus deliberately altered v2 response bundles. |

## 0.3.0 release notes

DoneState 0.3.0 advances the existing product from the older 0.2.0 review snapshot to the production-proven PR-only maintenance and independent-verification path.

- Uses the canonical `https://donestate.proofandstate.com/mcp` service identity.
- Keeps DoneState PR-only and without autonomous merge authority.
- Uses durable isolated execution with explicit consequence authority and fail-closed ambiguous-effect handling.
- Adds the complete `donestate.verification-contract.v2` response path through `submit_verifier_response`; the attestation-only tool remains for historical compatibility.
- Requires independent OpsTruth verification for terminal `VERIFIED` and rejects malformed or incomplete verifier output.
- Is backed by the production proof chain issue #114 / run `c4a07fa6-90b2-4597-a4c6-eae66de5a3e8` / open-unmerged PR #115 / exact head `41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869` / passing exact-head CI / complete OpsTruth v2 response / terminal `VERIFIED`.
- Preserves historical ambiguous, blocked and awaiting-verification outcomes rather than rewriting them after later success.

## Global availability

Use the existing publisher availability configuration only where the verified publisher identity, support process, privacy notice and binding service terms are valid. This repository document does not independently grant territorial publication authority.

## Submission evidence and remaining provider boundary

Original release checklist (merge, deployment and submission are now evidenced below; approval and clean-account gates remain):

- merge the exact 0.3.0 release through protected `main`;
- require `core (22)`, `core (24)` and `hosted-plugin` to pass on the exact release head;
- deploy the merged 0.3.0 Worker and prove the canonical endpoint reports the new version from that exact deployed source;
- keep the existing DoneState product/app identity rather than creating a duplicate;
- scan `https://donestate.proofandstate.com/mcp` in the existing publisher record;
- review the frozen 20-tool and skill snapshot before submission;
- submit version 0.3.0 under verified individual developer identity **AYOBAMI JOHN HAASTRUP**;
- publish only after provider approval;
- after publication, install from a clean account and prove one real end-to-end DoneState → pull request → OpsTruth → `VERIFIED` outcome.

The production proof already establishes that GitHub App installation, selected-repository execution, PR-only publication and complete independent verification can succeed without merging PR #115 or rewriting historical outcomes.

## Distribution reconciliation — 8 September 2026

DoneState 0.3.0 is submitted / Review, not Published. OpenAI's receipt is dated 2026-09-04T15:24:52Z. The [review record](https://platform.openai.com/plugins/edit/asdk_app_6a929a3cf3fc8191bb06ea4a3cc0a1e9/asdk_app_v_6a929a3d9ea48191a55a8f84dc512f7c) freezes https://donestate.proofandstate.com/mcp and 20 tools including submit_verifier_response. Its OAuth authorization, token, base and resource settings use the canonical origin; the domain is verified. Publisher: AYOBAMI JOHN HAASTRUP; category: Productivity. Editing and scanning are disabled during review. Do not cancel or resubmit the accepted version to refresh evidence.

The observed review app is asdk_app_6a929a3cf3fc8191bb06ea4a3cc0a1e9; the repository's historical app mapping is asdk_app_6a9169a598348191b0aa3b2f2638355b. Only one DoneState product, with 0.3.0, was visible in the inspected Personal organization / Default project inventory. Historical 0.2.0 was not visible; its current disposition and identity continuity are unknown. This does not prove duplicate creation or migration. Preserve plugins/donestate/.app.json until the provider confirms the mapping; do not delete either identity, create another product or publish the historical workers.dev snapshot.

The deployed release source is 4ab47e099c3303d08565a7dbf4cda36bc68b74ce, CI 33869297576 and deployment 33869297590 (both successful). Deployment logs record Worker d1a85a35-dc0d-4106-a95a-d9a763db4adf and container sha256:66d81bb158d7a309a56d43e2f9d0758cd9a8208f0ff56eb350d7c2b5cc813bd8. Later documentation-only commits do not change deployed runtime identity.

OpsTruth 0.4.1 is Published at https://chatgpt.com/plugins/plugins_6a8d4dc60bf081918a06094873890eb4. Live health binds cbe833dce0646314c189568be6acc21348895ed8 and discovery returns 21 tools, all read-only. Deployment 33868337668 attempt 2 passed production smoke. The directory displays six skills; a clean-account installed MCP connection is not established by directory visibility alone.

### Standalone OpsTruth is independent of DoneState

OpsTruth's standalone public-repository inspection does not require a DoneState session, objective or credential. A direct opstruth_inspect_repository call against AyobamiH/opstruth-chatgpt-plugin on 2026-09-08 returned a complete signed repository map with changedState.changed=false. This proves bounded public inspection, not execution or a clean-account journey.

The special authenticated DoneState exact-head bridge is a different lane: its verifier-owned GitHub App is configured only for AyobamiH/donestate and rejects other repository identities. General public audit tools use the separate public-data path. The bridge requests checks, contents and statuses read (metadata read), never writes. An arbitrary customer's repository is not yet covered; support requires an explicit scope decision and separately reviewed configuration/implementation, not a blanket permission increase.

### Remaining external and owner controls

- Reconcile the two DoneState app IDs and historical 0.2.0 disposition with the provider, without cancelling or duplicating the current submission.
- Obtain OpenAI approval and publish only DoneState 0.3.0. OpsTruth 0.4.1 requires no republishing.
- Keep the existing GitHub Marketplace request: https://github.com/marketplace/donestate/edit still says Pending for publish, under review and not published. Current description and screenshot captions match the PR-only boundary; no correction request was visible on that dashboard.
- Complete real publisher decisions in LEGAL-001. A renewed tracking review is not legal clearance.
- After publication, use a genuinely clean account, explicit repository-specific executor and independent read-only verifier authority, and a fresh objective. Record versions, run, unmerged PR/head, complete v2 response and terminal VERIFIED.

PR #115 remains open/unmerged at 41f1ae3b0fed670e64bd99f1bcb1aea9c9e7e869. Read-only retrieval still reports run c4a07fa6-90b2-4597-a4c6-eae66de5a3e8 as VERIFIED. Never reuse this run as a clean-user canary or rewrite predecessor outcomes.
