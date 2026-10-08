import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/server";
import { ACCOUNT_MCP_PATH, ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE } from "../src/account-authorization";
import type { DoneStateEnv } from "../src/environment";

const origin = "https://done.example";
const testEnv = {
  ...env, COOKIE_ENCRYPTION_KEY: "fixture-cookie-encryption", GITHUB_CLIENT_ID: "fixture-client-id",
  GITHUB_CLIENT_SECRET: "fixture-client-secret", CANONICAL_ORIGIN: origin,
} as unknown as DoneStateEnv;

async function request(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const result = await worker.fetch(new Request(`${origin}${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return result;
}
function form(fields: Record<string, string>): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) };
}
async function rpc(token: string, name: string, args: object = {}) {
  const response = await request(ACCOUNT_MCP_PATH, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  expect(response.status).toBe(200);
  const text = await response.text();
  const wire = response.headers.get("Content-Type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)) : JSON.parse(text);
  expect(wire.error).toBeUndefined();
  return wire.result;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("account-controls OAuth HTTP boundary", () => {
  it("publishes the separate scopes and returns the correct unauthenticated challenge", async () => {
    const response = await request(`/.well-known/oauth-protected-resource${ACCOUNT_MCP_PATH}`);
    expect(await response.json()).toMatchObject({ resource: `${origin}${ACCOUNT_MCP_PATH}`, scopes_supported: [ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE] });
    const refused = await request(ACCOUNT_MCP_PATH, { method: "POST" });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("WWW-Authenticate")).toContain(`oauth-protected-resource${ACCOUNT_MCP_PATH}`);
    expect(refused.headers.get("WWW-Authenticate")).toContain(ACCOUNT_DELETE_SCOPE);
  });

  it("uses real registration, PKCE, OAuth token admission and owner-bound MCP deletion without repository authority", async () => {
    const registered = await request("/oauth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Account fixture", redirect_uris: ["https://client.example/callback"], token_endpoint_auth_method: "none" }),
    });
    expect(registered.status).toBe(201);
    const client = await registered.json() as { client_id: string };
    const verifier = "fixture-pkce-verifier-that-is-at-least-forty-three-characters-long";
    const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...hashed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: "https://client.example/callback", response_type: "code", scope: `${ACCOUNT_READ_SCOPE} ${ACCOUNT_DELETE_SCOPE}`, resource: `${origin}${ACCOUNT_MCP_PATH}`, state: "fixture-client-state", code_challenge: challenge, code_challenge_method: "S256" });
    const page = await (await request(`/authorize?${params}`)).text();
    const approval = page.match(/name="approval_state" value="([^"]+)"/)![1]!;
    const csrf = page.match(/name="csrf" value="([^"]+)"/)![1]!;
    const approved = await request("/authorize", form({ approval_state: approval, csrf }));
    expect(approved.status).toBe(302);
    const github = new URL(approved.headers.get("Location")!);
    expect(github.searchParams.get("scope")).toBe("read:user");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("access_token")
      ? Response.json({ access_token: "fixture-identity-only-github-token" })
      : Response.json({ login: "account-oauth-fixture", name: null, email: null })));
    const callback = await request(`/callback?${new URLSearchParams({ state: github.searchParams.get("state")!, code: "fixture-github-code" })}`);
    expect(callback.status).toBe(302);
    const code = new URL(callback.headers.get("Location")!).searchParams.get("code")!;
    const tokenResponse = await request("/oauth/token", form({ grant_type: "authorization_code", client_id: client.client_id, code, redirect_uri: "https://client.example/callback", code_verifier: verifier, resource: `${origin}${ACCOUNT_MCP_PATH}` }));
    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json() as { access_token: string; scope: string };
    expect(tokens.scope.split(" ").sort()).toEqual([ACCOUNT_DELETE_SCOPE, ACCOUNT_READ_SCOPE].sort());
    const inspection = await rpc(tokens.access_token, "inspect_account");
    expect(inspection.isError).not.toBe(true);
    expect(JSON.parse(inspection.content[0].text).summary.ownerLogin).toBe("account-oauth-fixture");
    const deleted = await rpc(tokens.access_token, "delete_account_data", { confirm: true, confirmLogin: "account-oauth-fixture" });
    expect(deleted.isError).not.toBe(true);
    expect(JSON.parse(deleted.content[0].text)).toMatchObject({ schema: "donestate.account-deletion-receipt.v1", ownerLogin: "account-oauth-fixture", readback: { credentialConnected: false, summary: { indexedRuns: 0 } } });
    const otherResource = await request("/mcp", { method: "POST", headers: { Authorization: `Bearer ${tokens.access_token}` } });
    expect(otherResource.status).toBe(401);
  });
});
