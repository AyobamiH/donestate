# Private verification pilot

Status: source preparation; disabled by default. Existing public launch acceptance does not prove private acceptance.

An operator-reviewed private policy can route an exact v2 handoff to the separate authenticated OpsTruth private bridge. Protected Worker configuration consists of `OPSTRUTH_PRIVATE_VERIFICATION_POLICY`, `OPSTRUTH_PRIVATE_BRIDGE_TOKEN` and `OPSTRUTH_PRIVATE_VERIFICATION_URL`. The only accepted URL is `https://mcp.opstruth.io/internal/donestate-private-verification`.

Policy keys are exactly `accountSubjectSha256`, `repository`, `issuedAt`, `expiresAt`. It is limited to seven days. The account digest is SHA-256 of `donestate.private-verification.account.v1\0github:` followed by the authenticated GitHub login in lower case. It is pseudonymous, not anonymous. The caller identity is taken from durable run ownership; objective text cannot choose it. The corresponding verifier policy additionally pins immutable repository and installation IDs. Private identifiers and secret values belong in protected operator configuration, never public source or receipts.

This patch does not provision any secret or GitHub permission. Activation requires human architecture/security review, a distinct read-only verifier App, exact installation and immutable repository scope readback, and selected executor App access plus caller writer authority. Executor and verifier credentials must remain separate. Funding and a bounded PR-only objective are separately required. Do not reuse a prior temporary write grant automatically.

The public bridge remains the default for other repositories. Private policy failure blocks the selected private route; it cannot fall back to public verification. Redirects are prohibited, requests time out after 30 seconds, responses are bounded to 512 KiB, provider failures are redacted and retries are not automatic. Private responses still pass the exact existing v2 envelope, report binding, nonce and pinned signer checks before DoneState changes state.

Private reports are retained in the existing authenticated per-owner run and event chain. Existing indexed account inspection and deletion controls apply. No additional customer tracking or private graph store is introduced. Operator secrets survive account-data deletion and must be separately removed or rotated. Expiry blocks requests but does not erase configuration. Keep request bodies and credential-bearing HTTP traces out of public logs.

To revoke the pilot, remove or rotate the bridge token and policy on both services and remove the selected verifier App installation. Remove the executor selection/installation separately when requested. Record grant, exact deployment, verification and revocation evidence without publishing private metadata. A passing source test is not installation evidence, independent live verification or private GA acceptance.
