# Standalone hosted MCP setup

DoneState can be used through its owned Proof & State MCP service without waiting for an OpenAI directory listing or GitHub Marketplace publication.

## Endpoint

Use the canonical remote MCP endpoint:

`https://donestate.proofandstate.com/mcp`

The client must support remote HTTP MCP plus the OAuth flow exposed by the service. The protocol surface is client-neutral; a client that has not been accepted end to end should still be treated as a new integration until its authentication, tool calls and browser handoffs have been proven.

## Current customer path

1. Add the endpoint to a compatible MCP client.
2. Complete DoneState OAuth and sign in with GitHub.
3. Run `get_openai_credential_status`.
4. If no execution credential is connected, run `create_openai_credential_setup`, open the single-use HTTPS setup URL and save your own OpenAI API key there. Do not paste the key into the MCP conversation.
5. Start with a public GitHub repository where the authenticated GitHub identity has push access. The objective's `repository` argument selects its exact target; a maintenance-registry selection is a separate policy and does not grant the customer GitHub write access.
6. Create one bounded objective with `create_objective`. Grant only the consequence classes that objective needs.
7. Inspect progress with `get_objective`.
8. For an independently verified result, use `create_verification_handoff` or `request_opstruth_verification` as appropriate for the configured verifier contract.
9. Review the resulting branch and pull request in GitHub. DoneState does not merge its own pull requests.

## Authority classes

Hosted objectives accept these explicit authority classes:

- `local_read`
- `local_write`
- `test`
- `commit`
- `push`
- `open_pr`
- `secret_access`

Do not grant a class merely because it is available. A normal PR-producing objective commonly needs local read/write, tests, commit, push and open-PR authority. Whether `secret_access` is appropriate depends on the objective and execution path.

## Repository scope

The currently proven customer path is public-repository execution through the authenticated GitHub identity.

Private repositories require a selected DoneState GitHub App installation in `pr_only` mode. The existing production maintenance App is deliberately restricted; do not describe arbitrary private-repository self-service as generally available until a fresh external-account acceptance proves that path.

## Distribution channels

The owned-domain service, OpenAI/ChatGPT distribution and GitHub Marketplace are separate channels:

- The owned-domain service may operate while external listings are still under review.
- OpenAI review and publication continue independently.
- GitHub Marketplace review and lifecycle testing continue independently.
- Approval or failure in one channel does not prove the state of another channel.

No channel changes DoneState's core authority boundary: remote work is bounded, PR-oriented and independently verifiable, and final merge authority remains with the repository owner.

## Account settings and deletion

`create_openai_credential_setup` remains the existing MCP entry point for the secure browser settings flow. Its single-use HTTPS link now opens a consolidated DoneState account console showing the authenticated GitHub identity, OpenAI credential status and quota, selected maintenance repositories, and indexed objectives.

The same account console can delete indexed DoneState account data. Deletion requires typing the exact GitHub login and fails closed while an indexed objective is active. During deletion, new run indexing, repository selection, maintenance discovery/repair and credential replacement are blocked. The shared registry and per-user credential vault each carry a monotonic deletion generation, so work admitted before deletion cannot resume after the purge. Partial destructive failure keeps the locks engaged for a safe retry; an active-objective refusal before destructive work rolls them back. Successful deletion removes indexed deletable objectives, the encrypted OpenAI credential, selected-repository state, maintenance findings and user Marketplace entitlement records. Organization Marketplace entitlement state is preserved while the deleting user's authorizer identity is cleared. A minimal opaque generation fence remains only to reject stale in-flight writes; the shared fence does not store the plaintext GitHub login.

The owner-level run index is new. Historical maintenance runs are backfilled from maintenance findings, but a direct objective created before the account-controls release may not be discoverable automatically. Delete any such historical run with `delete_objective` using its known run ID or submit a privacy request.

## Current owned-channel release gates — 7 October 2026

CUST-001 and CUST-002 are complete following [PR #164](https://github.com/AyobamiH/donestate/pull/164), with account-layout, real disposable-account deletion and controlled production stale-write-fencing evidence in E-064/E-065. They remain satisfied prerequisites in the dependency graph, not open launch blockers.

Unrestricted self-serve GA still requires both the unresolved publisher requirements in LEGAL-001 and one fresh complete customer journey: sign up → connect → select repository → create objective → execute → unmerged PR → OpsTruth VERIFIED → inspect account → delete account. Each step needs fresh evidence; earlier maintenance, CLI and deletion canaries do not establish this outcome.

Historical attempt E-066 observed the emptied disposable OneClickPostFactory service account and stopped at **BLOCKED_CAPABILITY** during credential connection. Its [step-by-step receipt](../evidence/clean-customer-20261003/acceptance.json) retains that original scope.

Earlier continuation E-067 on 7 October confirms the user connected the execution credential securely. An explicit PR-only selection of `AyobamiH/donestate` used the existing App installation with scheduling and automatic repair disabled, but `create_objective` rejected push access before any run or model execution. Its dated independent GitHub permission readback confirmed `OneClickPostFactory` then had only `read` access to that repository. The temporary customer maintenance selection was removed; the new execution credential remains connected and unused. See [the earlier acceptance receipt](../evidence/clean-customer-20261007/acceptance.json).

The owner-approved dependency/evidence PR #166 is now merged at `5b18fefcaa4c186782a2c14e5e4d16c2f93e11e4`. Post-merge CI `37577391832` and production deployment `37577391829` succeeded; the runner built and rolled out container `sha256:89239658656b1fe3cef2db45058fb8c7fa02e01ee4d5ecc04c8fa7e6ada9a74e` and Worker `98d66425-8a2c-4caf-a2a4-dced459bdd40`. Historical E-068 remains the original candidate observation.

Historical continuation E-069 records the accepted temporary Write grant and the subsequent GitHub `401 Bad credentials` admission refusal. [Its receipt](../evidence/clean-customer-20261007/continuation-02.json) remains unchanged. The user then reconnected DoneState GitHub OAuth as `OneClickPostFactory`: fresh run `257bbf51-66d2-4cd0-838d-01bbe66e2608` was admitted and cloned the pinned repository successfully. Its single implementation launch returned a verified exit-code-1 receipt and terminal **FAILED_SAFE** before any branch, PR or verifier request. The connected OpenAI key records one lease, while provider success and funding remain unproven. E-070 and [the durable failed-run receipt](../evidence/clean-customer-20261007/attempt-03.json) preserve those separate states.

The deployed nonzero-receipt path omitted its log before sandbox teardown. E-071 adds an undeployed repair candidate for bounded, credential-redacted failure diagnostics; exact-head CI, owner merge and deployment must be evidenced before a fresh customer run. The account, key and exact temporary Write grant remain available for this authorised recovery, with post-result account inspection/deletion and grant removal pending. The customer maintenance registry is empty and App/verifier scope is unchanged. Fresh signup, customer PR, independent verification, the complete journey and unrestricted GA remain unproven.

Controlled owned-domain access continues. This reconciliation is not legal clearance, external-directory approval or unrestricted GA.
