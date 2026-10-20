# DoneState OpenAI reviewer workflow

Updated: 20 October 2026. Work item: OPENAI-001; evidence: E-133.

## Release gate

This is a code repair candidate, not a completed production acceptance. The
previous owner-mapped read-only reviewer could authenticate but could not invoke
`create_openai_credential_setup` or execute the advertised workflow. The current
submission has one generic tool-definition finding. Do not call the repair done
until fresh production acceptance and a portal rescan have been recorded.

Keep the existing app `asdk_app_6abf3b8d3cb08191b1b4e670a707e652`.
Do not remove or rename a tool to evade its review finding.

## Prepare the isolated demo before deployment

1. Create the public `AyobamiH/donestate-review-fixture` repository with a small,
   reproducible Node fixture and sample repair issue. Install the existing
   DoneState GitHub App on this exact repository. Confirm the independent
   OpsTruth verifier can inspect the exact public repository and PR snapshot.
2. Provision a dedicated publisher-funded demo execution key through the normal
   private credential workflow. Set Worker secret `OPENAI_REVIEW_EXECUTION_KEY`.
   Do not copy, export or reuse the platform owner's stored credential.
3. Set `OPENAI_REVIEW_REPOSITORY` to the exact fixture. Keep the existing verifier
   endpoint and fingerprint. No new signing key may be substituted for acceptance.
4. Run the Worker build and full tests, the root release checks, and the package
   secret audit. Deploy only after the demo dependencies are prepared.
5. Use the existing private reviewer password from Review details. Never place
   passwords, keys, bearer tokens, callback codes or settings tickets in evidence.

The account identity is `review:openai:v1`, which cannot collide with a GitHub
login. Only the OAuth provider subject is URL-encoded as `review%3Aopenai%3Av1`,
because that library uses colons as code and token delimiters. The real-provider
regression exercises code exchange, refresh and revocation, as well as invalid
PKCE and revoked-token rejection. Legacy owner-mapped reviewer tokens must reconnect and cannot read owner
state. GitHub installation tokens are restricted to the exact selected repository
and their returned scope is checked. Reviewer objectives require PR publication,
5 files or fewer, 5 minutes or less, and the existing independent verifier.
The demo allows 3 execution starts per UTC day. This counter survives demo account
deletion; deletion cannot reset the funded limit. Normal customers retain their
existing credential and quota behavior. The reviewer cannot replace the global
publisher GitHub App, merge, deploy or release.

## Private reviewer instructions

1. Connect DoneState at `https://donestate.proofandstate.com/mcp`.
2. Use the visible **OpenAI reviewer test account** form, username
   `openai-reviewer`, and the password supplied separately in Review details.
3. No GitHub account, MFA, email verification, API key or installation is required
   from the reviewer. The publisher prepares these dependencies.
4. The sample account supports the real settings, selection, task, PR and
   independent-verification flow within its demo repository.
5. After deleting the demo credential or selection, reconnect to restore the
   prepared sample setup. After account deletion, reconnect creates fresh sample
   state; it does not restore deleted objectives or evidence.

## Five positive cases

| Case | User prompt / action | Tools and expected result |
| --- | --- | --- |
| 1. Connect and inspect setup | Connect with the supplied reviewer credentials, then ask “Is my DoneState execution account ready?” | Fresh OAuth code exchange succeeds. `get_openai_credential_status` reports connected and publisher-funded demo billing; `list_maintenance_repositories` returns only the fixture. |
| 2. Open account settings | “Open my DoneState account settings.” Open the returned link. | `create_openai_credential_setup` succeeds, returning only `setupUrl` and `expiresAt`. HTTPS console shows the isolated demo identity and prepared credential, never the owner's account. |
| 3. Inspect sample maintenance | “Find repair work in AyobamiH/donestate-review-fixture.” | `discover_maintenance_work` records the labeled sample issue; `list_maintenance_findings` returns only this account's fixture findings. No repository change occurs. |
| 4. Execute a bounded task | “Fix the sample fixture in AyobamiH/donestate-review-fixture, run its tests, commit and open a PR. I authorize local_read, local_write, test, commit, push, open_pr and secret_access. Limit this to 5 files and 300000 ms; use the configured OpsTruth fingerprint and the fixture's exact machine-checkable acceptance requirements.” | `create_objective`, then `get_objective`: real sandbox execution, local tests, real PR and exact head evidence. Record the returned run ID. No fabricated or historical owner run may substitute. |
| 5. Independently verify | “Independently verify the PR from that run.” | `create_verification_handoff` and `request_opstruth_verification` bind the exact executed snapshot. `get_objective` reaches VERIFIED only after a valid response signed by the already-pinned independent verifier. |

The final acceptance record must add the exact fixture criterion, run ID, PR,
head SHA, verification receipt and observed results. These case definitions alone
are not execution evidence. A separate queued, unstarted objective can exercise
cancel/delete without consuming an execution start. Credential deletion and
reconnection exercise restore without touching the owner's vault.

## Three negative cases

| Case | Action | Expected result |
| --- | --- | --- |
| 1. Owner or foreign repository | With reviewer credentials, select or create work in `AyobamiH/donestate`, inspect an owner run, or reuse a legacy owner-mapped reviewer token. | Authority/ownership refusal. No owner reads, objective, branch or PR. |
| 2. Expanded authority | Ask to merge/deploy/release, enable scheduling, exceed 5 files or 5 minutes, or replace/omit the pinned verifier. | Refusal before execution. No authority expansion or unverified success. |
| 3. Authentication and settings misuse | Wrong reviewer password, missing execution scope, a credential passed as tool input, or a replayed/expired settings ticket. | Password 401; scope/schema refusal; ticket 400. No account mutation or secret disclosure. |

Also preserve the published negative non-trigger prompts for travel booking and
email sending. Tool-server tests cannot establish model routing behavior; record
that separately when exercised through the submitted ChatGPT plugin.

## Evidence and rescan

Record OAuth success, tool outcomes, URL-origin checks, ticket expiry/replay,
owner isolation, real execution and independent verification, cancellation,
deletions, token revocation and denial after revocation. Redact every secret.
Update the existing app's reviewer information and real walkthrough, then rescan.
Record the exact remaining findings. Submission or a “non-blocking” label does not
clear a finding. If OpenAI retains a provider-review hold, keep that gate open and
retain the exact message; do not claim code can override the provider's decision.
