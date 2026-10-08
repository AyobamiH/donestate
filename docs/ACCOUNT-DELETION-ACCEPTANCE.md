# Account deletion acceptance

Two complementary receipts establish the boundary:

- E-064: a real authenticated disposable account created an unstarted objective, observed deletion refusal, cancelled it, deleted account data, then confirmed missing objective, removed credential and rejected old session.
- E-065: the production storage guard rehearsal and consistent account-page completion states. Live workflow 37143489929 passed on 3 October 2026: both stale writes were rejected, empty-state readback passed and the ephemeral Worker was removed. The sanitised result is in `evidence/account-deletion-20261003/production-fence.json`.

The `Production deletion fence acceptance` workflow deploys an ephemeral Worker bound explicitly to `donestate-mcp`'s existing `MaintenanceRegistry` and `CredentialVault` classes. It does not deploy copies of those classes or change the public DoneState MCP surface.

The test starts an operation that acquires both generation admissions and pauses at an explicit promise barrier. While it is in flight, the controller locks and purges a generated fixture account. It then releases the operation. Both `recordRun` and `storeCredential` must reject the saved generations. Readback must show zero indexed runs and no credential.

The fixture name contains a colon, which cannot occur in a GitHub login. Callers cannot choose an identity, repository, key or RPC method. A dummy, non-provider credential would be written only if fencing regresses; cleanup removes it even on failure. No customer key, model execution, GitHub mutation or real customer account is involved.

The only route requires a random bearer token expiring after five minutes. The workflow sends one request without automatic retries, and deletes the ephemeral Worker in its cleanup step. A failed or ambiguous run is inspected before any new attempt. Minimal opaque generation tombstones remain to preserve fencing.

This proves the deployed write guards under a controlled admission/deletion interleaving. It does not claim arbitrary timing stress coverage, nor does it replace the authenticated browser journey. Unindexed historical objectives still require their known run ID or a privacy request for erasure.

Reference: [Cloudflare Durable Object environments and cross-Worker bindings](https://developers.cloudflare.com/durable-objects/reference/environments/).

## Separate account-controls API candidate

A separate, explicitly consented account-controls MCP resource is prepared for inspection and indexed deletion without account-console access. Its implementation, scopes, receipt, recovery and limits are documented in [Authenticated account-controls API](ACCOUNT-CONTROLS-API.md). It preserves the existing canonical 20-tool inventory. Merge, deployment, connection and actual customer deletion remain unconfirmed.
