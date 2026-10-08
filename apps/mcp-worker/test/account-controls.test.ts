import { env, runInDurableObject } from "cloudflare:test";
import type { AuthInfo, ServerContext } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { describe, expect, it } from "vitest";
import { ACCOUNT_MCP_PATH, ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE, doneStateGrantScopes } from "../src/account-authorization";
import { accountIdentity, createAccountControlsServer } from "../src/account-controls";
import { deleteIndexedAccountData, type AccountDataEnv } from "../src/account-data";
import { digest } from "../src/canonical";
import type { MaintenanceRegistry } from "../src/maintenance-registry";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { contractObjective } from "./verification-fixtures";
import { createServer } from "../src/server";

const origin = "https://done.example";
function auth(login: string, scopes = [ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE], resource = `${origin}${ACCOUNT_MCP_PATH}`): AuthInfo {
  return { token: "fixture-access-token", clientId: "fixture-client", scopes, resource: new URL(resource), extra: { props: { login, origin } } };
}
function context(info: AuthInfo) { return { http: { authInfo: info } } as ServerContext; }
async function rpc(info: AuthInfo, method: string, params: object = {}, workerEnv: AccountDataEnv = env, canonical = false) {
  const route = canonical ? "/mcp" : ACCOUNT_MCP_PATH;
  const handler = createMcpHandler(canonical ? createServer : () => createAccountControlsServer(() => workerEnv), { route });
  const response = await handler.fetch(new Request(`${origin}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), { authInfo: info });
  const text = await response.text();
  const wire = response.headers.get("Content-Type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)) : JSON.parse(text);
  if (wire.error) throw new Error(JSON.stringify(wire.error));
  return wire.result;
}
async function call(login: string, name: string, args: object = {}, workerEnv: AccountDataEnv = env, info = auth(login)) {
  return rpc(info, "tools/call", { name, arguments: args }, workerEnv);
}
async function fixture(login: string) {
  const registry = env.MAINTENANCE_REGISTRY.getByName("global");
  const runId = crypto.randomUUID();
  const run = env.RUN_COORDINATOR.getByName(runId);
  const objective = { ...contractObjective(runId, "a".repeat(64)), requestedBy: login };
  await run.create(objective, "fixture-github-token");
  const admission = await registry.recordRun(login, runId, objective.repository, "operator");
  return { registry, runId, run, admission };
}

describe("separate authenticated account controls", () => {
  it("preserves the canonical 20-tool inventory and keeps account tools separate", async () => {
    const result = await rpc(auth("execution-fixture", ["donestate:execute"], `${origin}/mcp`), "tools/list", {}, env, true);
    expect(result.tools).toHaveLength(20);
    expect(result.tools.map((tool: { name: string }) => tool.name)).not.toContain("inspect_account");
    expect(result.tools.map((tool: { name: string }) => tool.name)).not.toContain("delete_account_data");
  });
  it("exposes exactly two account tools with truthful consequence annotations", async () => {
    const result = await rpc(auth("inventory-fixture"), "tools/list");
    expect(result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(["delete_account_data", "inspect_account"]);
    expect(result.tools.find((tool: { name: string }) => tool.name === "delete_account_data").annotations.destructiveHint).toBe(true);
    expect(result.tools.find((tool: { name: string }) => tool.name === "inspect_account").annotations.readOnlyHint).toBe(true);
  });

  it("requires resource-bound effective scopes and never accepts execution tokens", () => {
    for (const info of [auth("owner", ["donestate:execute"], `${origin}/mcp`), auth("owner", [], `${origin}${ACCOUNT_MCP_PATH}`), auth("owner", [ACCOUNT_READ_SCOPE], "https://other.example/mcp/account/v1")]) {
      expect(() => accountIdentity(context(info))).toThrow("BLOCKED_AUTHORITY");
    }
    expect(accountIdentity(context(auth("owner", [ACCOUNT_READ_SCOPE])))).toBe("owner");
    expect(() => accountIdentity(context(auth("owner", [ACCOUNT_READ_SCOPE])), true)).toThrow("BLOCKED_AUTHORITY");
    const reviewer = auth("owner"); reviewer.extra!.props = { login: "owner", origin, reviewMode: true };
    expect(() => accountIdentity(context(reviewer), true)).toThrow("read-only");
  });

  it("grants account scopes only to the separate exact resource", () => {
    const request = (scope: string[], resource?: string | string[]) => ({ scope, resource }) as AuthRequest;
    expect(doneStateGrantScopes(request([ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE], `${origin}${ACCOUNT_MCP_PATH}`), origin, "donestate:execute"))
      .toEqual({ accountControls: true, scopes: [ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE] });
    for (const req of [request([], `${origin}${ACCOUNT_MCP_PATH}`), request([ACCOUNT_DELETE_SCOPE], `${origin}${ACCOUNT_MCP_PATH}`), request([ACCOUNT_READ_SCOPE, "donestate:execute"], `${origin}${ACCOUNT_MCP_PATH}`), request([ACCOUNT_READ_SCOPE], `${origin}/mcp`), request([ACCOUNT_READ_SCOPE], ["https://other.example/mcp", `${origin}${ACCOUNT_MCP_PATH}`])]) {
      expect(doneStateGrantScopes(req, origin, "donestate:execute")).toBeNull();
    }
    expect(doneStateGrantScopes(request([], undefined), origin, "donestate:execute")).toEqual({ accountControls: false, scopes: ["donestate:execute"] });
  });

  it("inspects only its owner and returns no credential or OAuth token", async () => {
    const f = await fixture("account-inspection-fixture");
    const inspected = await call("account-inspection-fixture", "inspect_account");
    const text = inspected.content[0].text;
    const state = JSON.parse(text);
    expect(state.summary).toMatchObject({ ownerLogin: "account-inspection-fixture", indexedRuns: 1 });
    expect(state.runs).toMatchObject([{ runId: f.runId, state: "RECEIVED" }]);
    expect(state.inventoryComplete).toBe(true);
    expect(text).not.toContain("fixture-github-token");
    expect(text).not.toContain("fixture-access-token");
    const other = JSON.parse((await call("different-account", "inspect_account")).content[0].text);
    expect(other.runs).toEqual([]);
  });

  it("rejects wrong account confirmation, missing confirmation and read-only scopes before changing data", async () => {
    const login = "account-confirmation-fixture";
    const f = await fixture(login);
    for (const [args, info] of [[{ confirm: true, confirmLogin: "different-owner" }, auth(login)], [{ confirm: false, confirmLogin: login }, auth(login)], [{ confirm: true, confirmLogin: login }, auth(login, [ACCOUNT_READ_SCOPE])]] as const) {
      const rejected = await call(login, "delete_account_data", args, env, info);
      expect(rejected.isError).toBe(true);
    }
    expect(await f.registry.listRuns(login)).toHaveLength(1);
    await expect(f.registry.requireAccountWritable(login, f.admission.accountGeneration)).resolves.toMatchObject({ writable: true });
  });

  it("refuses an active objective, then emits a digest-checked receipt after cancellation and empty readback", async () => {
    const login = "account-delete-fixture";
    const f = await fixture(login);
    const refused = await call(login, "delete_account_data", { confirm: true, confirmLogin: login });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("Cancel active objectives");
    expect((await f.run.accountDeletionState(login))?.state).toBe("RECEIVED");
    await f.run.cancel(login);
    const deleted = await call(login, "delete_account_data", { confirm: true, confirmLogin: login });
    expect(deleted.isError).not.toBe(true);
    const { receiptDigest, ...receipt } = JSON.parse(deleted.content[0].text);
    expect(await digest(receipt)).toBe(receiptDigest);
    expect(receipt).toMatchObject({ schema: "donestate.account-deletion-receipt.v1", ownerLogin: login, independentVerification: false, readback: { credentialConnected: false, summary: { indexedRuns: 0, findings: 0, selectedRepositories: 0 } } });
    expect(await f.run.accountDeletionState(login)).toBeNull();
    await runInDurableObject(f.registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.recordRun(login, crypto.randomUUID(), "owner/repository", "operator", f.admission.accountGeneration)).rejects.toThrow("state changed");
    });
  });

  it("does not turn a failed coordinator read into missing data or permit purge", async () => {
    const login = "account-read-failure-fixture";
    const f = await fixture(login); await f.run.cancel(login);
    const failure = { ...env, RUN_COORDINATOR: { getByName: () => ({ accountDeletionState: () => { throw new Error("fixture read failure"); }, purge: () => { throw new Error("purge must not run"); } }) } } as unknown as AccountDataEnv;
    expect((await call(login, "inspect_account", {}, failure)).isError).toBe(true);
    expect((await call(login, "delete_account_data", { confirm: true, confirmLogin: login }, failure)).isError).toBe(true);
    expect(await f.registry.listRuns(login)).toHaveLength(1);
    await runInDurableObject(f.registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.requireAccountWritable(login)).rejects.toThrow("deletion is in progress");
    });
    // The fixture knows the read failed before any purge; deliberate recovery is safe.
    expect((await call(login, "delete_account_data", { confirm: true, confirmLogin: login })).isError).not.toBe(true);
  });

  it("refuses the capped inventory rather than erasing its index and claiming complete deletion", async () => {
    const login = "account-cap-fixture";
    const registry = env.MAINTENANCE_REGISTRY.getByName("global");
    for (let i = 0; i < 201; i++) await registry.recordRun(login, crypto.randomUUID(), "owner/repository", "operator");
    const cappedEnv = { ...env, RUN_COORDINATOR: { getByName: () => ({ accountDeletionState: async () => null }) } } as unknown as AccountDataEnv;
    await expect(deleteIndexedAccountData(cappedEnv, login)).rejects.toThrow("200-run limit");
    expect(await registry.listRuns(login)).toHaveLength(200);
    await runInDurableObject(registry, async (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM account_runs WHERE owner_login = ?", login).one().count).toBe(201);
    });
  });

  it("reports ambiguous completion when deletion settles but final readback fails", async () => {
    const login = "account-final-readback-fixture";
    const vault = env.CREDENTIAL_VAULT.getByName(login);
    let reads = 0;
    const failure = { ...env, CREDENTIAL_VAULT: { getByName: () => ({
      status: async () => { if (++reads > 1) throw new Error("fixture final readback failure"); return vault.status(login); },
      beginAccountDeletion: () => vault.beginAccountDeletion(), endAccountDeletion: () => vault.endAccountDeletion(),
      purgeAccount: () => vault.purgeAccount(login),
    }) } } as unknown as AccountDataEnv;
    const response = await call(login, "delete_account_data", { confirm: true, confirmLogin: login }, failure);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("AMBIGUOUS_EFFECT");
    expect(response.content[0].text).not.toContain("receiptDigest");
  });
});
