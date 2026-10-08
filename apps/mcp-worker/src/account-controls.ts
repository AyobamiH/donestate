import { McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { deleteIndexedAccountData, readAccountData, type AccountDataEnv } from "./account-data";
import { digest } from "./canonical";
import { ACCOUNT_MCP_PATH, ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE } from "./account-authorization";

export function accountIdentity(context: ServerContext, deleting = false): string {
  const auth = context.http?.authInfo;
  const props = auth?.extra?.props;
  if (!props || typeof props !== "object") throw new Error("GitHub authentication is required");
  const login = Reflect.get(props, "login");
  const origin = Reflect.get(props, "origin");
  if (typeof login !== "string" || !login || typeof origin !== "string" || !origin) {
    throw new Error("Account authentication context is incomplete");
  }
  if (auth?.resource?.href !== new URL(ACCOUNT_MCP_PATH, origin).href) {
    throw new Error("BLOCKED_AUTHORITY: a token issued for the account-controls resource is required");
  }
  if (!auth.scopes.includes(ACCOUNT_READ_SCOPE) || (deleting && !auth.scopes.includes(ACCOUNT_DELETE_SCOPE))) {
    throw new Error("BLOCKED_AUTHORITY: explicit account-controls OAuth scopes are required");
  }
  if (deleting && Reflect.get(props, "reviewMode") === true) {
    throw new Error("BLOCKED_AUTHORITY: the OpenAI reviewer account is read-only");
  }
  return login;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function createAccountControlsServer(accountEnv: () => AccountDataEnv): McpServer {
  const server = new McpServer({ name: "DoneState Account Controls", version: "1.0.0" });
  server.registerTool("inspect_account", {
    description: "Inspect only the authenticated DoneState account: credential status, selected repositories, indexed objectives and service-data counts. Returns no stored keys or OAuth tokens. An inventory at the 200-run limit is explicitly incomplete.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (_input, context) => result({
    schema: "donestate.account-inspection.v1", observedAt: new Date().toISOString(),
    ...await readAccountData(accountEnv(), accountIdentity(context)),
  }));
  server.registerTool("delete_account_data", {
    description: "Permanently delete the authenticated account's indexed DoneState service data after exact login confirmation. Refuses active objectives and incomplete or unreadable inventories. Returns a redacted service deletion receipt; GitHub resources and provider credentials are outside this operation.",
    inputSchema: {
      confirm: z.literal(true).describe("Confirm permanent deletion of indexed DoneState service data"),
      confirmLogin: z.string().min(1).max(100).describe("The exact authenticated GitHub login; cannot select another account"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ confirmLogin }, context) => {
    const login = accountIdentity(context, true);
    if (confirmLogin !== login) throw new Error("Type the exact authenticated GitHub login to confirm account-data deletion");
    const workerEnv = accountEnv();
    const deletion = await deleteIndexedAccountData(workerEnv, login);
    let after;
    try { after = await readAccountData(workerEnv, login); }
    catch { throw new Error("AMBIGUOUS_EFFECT: deletion settled but empty-state readback failed; inspect the account before any further mutation"); }
    if (after.credential.connected || after.credential.activeRunId || !after.inventoryComplete
      || after.repositories.length || after.runs.length || after.summary.findings
      || after.summary.indexedRuns || after.summary.selectedRepositories
      || after.summary.marketplaceUserEntitlements || after.summary.marketplaceOrganizationAuthorizations) {
      throw new Error("AMBIGUOUS_EFFECT: deletion settled but empty-state readback is unconfirmed; inspect the account before any further mutation");
    }
    const receipt = {
      schema: "donestate.account-deletion-receipt.v1", ownerLogin: login,
      deletedAt: new Date().toISOString(), ...deletion,
      readback: { credentialConnected: false, summary: after.summary, inventoryComplete: true },
      scope: "indexed_donestate_service_data",
      retained: ["opaque_deletion_generation_fences", "existing_oauth_connections", "global_anonymous_aggregate_counters"],
      exclusions: ["unindexed_legacy_direct_objectives", "github_account_and_repositories", "github_app_installations", "provider_key_revocation", "oauth_revocation"],
      independentVerification: false,
    };
    try {
      await workerEnv.MAINTENANCE_REGISTRY.getByName("global").recordFunnelEvent("account_deletion_completed");
    } catch { /* Metrics cannot change a settled deletion result. */ }
    return result({ ...receipt, receiptDigest: await digest(receipt) });
  });
  return server;
}
