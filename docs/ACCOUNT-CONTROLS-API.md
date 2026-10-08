# Authenticated account-controls API

Status: PR 173 merged as `20a249902a9646209ade5f874b50e19db8f87519`; exact-merge CI and production deployment succeeded on 2026-10-08. The separate customer connection and actual customer-account deletion remain unconfirmed. Deployment receipt: [merge-and-deployment.json](../evidence/account-api-20261008/merge-and-deployment.json).

Direct unauthenticated custom-domain metadata/resource probes returned Cloudflare 1010 access denials. Those probes stopped. A supported client must establish discovery and OAuth admission before any customer operation; if it also receives that denial, the site owner must diagnose the recorded error through Cloudflare support/settings. Do not change user-agent, substitute a hostname or circumvent browser policy. A successful deployment does not establish live client reachability.

The separate MCP resource is `https://donestate.proofandstate.com/mcp/account/v1`, served as **DoneState Account Controls 1.0.0**. It exposes only `inspect_account` and `delete_account_data`. The reviewed `/mcp` execution server remains version 0.3.0 with its existing 20-tool inventory. Existing execution tokens cannot call the account-controls operations.

This is an explicit account-management capability with its own OAuth consent. It does not scrape the account console, reuse a browser session, extract a token or use an administrator to impersonate a customer. A browser policy rejection must still stop the browser action; this API cannot grant permission to circumvent that restriction.

## Connect

Add the deployed separate account-controls endpoint to an OAuth-capable MCP client. An example client configuration is [account-controls.mcp.json](../examples/account-controls.mcp.json). Keep the existing DoneState execution connection separate. Sign in as the exact account whose indexed service data you intend to inspect and delete. For the current acceptance cleanup, that identity is **OneClickPostFactory**, not the publisher's AyobamiH account.

The protected resource metadata lives at `/.well-known/oauth-protected-resource/mcp/account/v1`. The existing authorization server provides registration, consent, PKCE and token exchange. Account grants require the exact account-controls resource and `donestate:account:read`; deletion additionally requires `donestate:account:delete`. The account consent describes those operations and requests only `read:user` from GitHub. Existing upstream GitHub grants may retain previously approved scopes; this API never uses them to modify a repository. The account connection does not request repository Write access, an execution key, an objective or model execution.

The signed-in identity comes from authenticated OAuth context. Neither operation accepts an owner/account selector. Deletion takes the exact login only as a confirmation and rejects a different value. Read-only reviewer identities cannot delete data. Effective token scopes are checked, so downscoping cannot be reversed using the original grant.

Account authorization does not automatically revoke an existing execution grant for the same OAuth client. Revocation remains a separate operation. The sealed authorization origin preserves legacy execution-resource admission when GitHub redirects to the canonical callback.

## Operations

| Tool | Arguments | Behaviour |
| --- | --- | --- |
| `inspect_account` | `{}` | Return credential metadata, selected repositories, indexed objective states, service-data counts, observation time and `inventoryComplete`. No API key, GitHub access token or setup ticket is returned. Coordinator state reads fail closed. |
| `delete_account_data` | `{"confirm":true,"confirmLogin":"OneClickPostFactory"}` | Acquire the shared registry and credential-vault deletion generations, inspect indexed state, refuse active work, purge eligible data and return a redacted receipt only after empty-state readback. |

Deletion uses the same deterministic implementation as the account console. It removes indexed deletable objectives, the stored execution credential, selected-repository state, maintenance findings and user Marketplace entitlement records. Organization entitlement records retain organization state while removing this login as authorizer. The operation does not cancel an objective or alter a GitHub pull request.

The current run inventory is capped at 200. An inventory at that boundary is explicitly incomplete, and deletion refuses before purging anything. It also refuses inconsistent repository/inventory counts. Use supported privacy support for a capped inventory or unindexed historical direct objectives; do not infer full coverage from a capped list.

## Receipt and limits

`donestate.account-deletion-receipt.v1` includes the authenticated login, deletion time, deleted service-data counts, both generation numbers, final credential-disconnected/zero-count readback, explicit exclusions and a canonical SHA-256 `receiptDigest`. It is returned to the client and is not separately stored as an additional account record.

The digest checks the receipt's content integrity. It is not an independent-verifier signature; `independentVerification` is explicitly false. Preserve the receipt and perform a fresh account inspection to corroborate the reported empty state. Keep repository/CI/deployment evidence separate from the actual customer deletion receipt.

Minimal opaque generation fences and global anonymous aggregate counters remain. Existing OAuth connections also remain. The receipt does not claim deletion of the GitHub account/repositories/App installation, revocation of an upstream provider key or OAuth grant, or discovery of unindexed legacy direct objectives. Published branches and PRs remain outside account-data erasure.

## Refusal, recovery and ambiguity

- Wrong login, absent confirmation, wrong resource, missing effective scope or read-only reviewer mutation: refuse before account mutation.
- Active objective or credential lease: refuse before purging and release deletion locks. Inspect and cancel the exact active objective separately if authorised.
- Unreadable or capped inventory: no absence/completion claim and no purge. Preserve deletion locks and diagnose the recorded state through supported inspection.
- Interrupted purge: generation locks preserve the existing resumable deletion boundary. Inspect state and establish exact completed effects before an explicitly authorised resume.
- Deletion settles but empty readback fails or finds new state: return `AMBIGUOUS_EFFECT`, with no success receipt. Inspect before any further mutation; do not automatically repeat deletion or assume that a lost response means no effect.
- Authentication or browser security rejection: stop the rejected action. Do not extract credentials, substitute a browser surface or add an administrator impersonation route.

For current customer acceptance, verified unmerged PR 172, deleted known run/key and removed temporary GitHub Write already have preserved evidence. They need no repetition. This API deployment alone does not establish customer account deletion, fresh signup, selected-repository App admission or unrestricted GA; LEGAL-001 remains separate.
