import { env } from "cloudflare:test";
import { createMcpHandler } from "agents/mcp/server";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";
import { credentialSettingsHandler } from "../src/credential-settings";
import { OPENAI_REVIEW_LOGIN } from "../src/review-access";

async function rpc(method: string, params: unknown, login = OPENAI_REVIEW_LOGIN, scopes = ["donestate:execute"]) {
  const handler = createMcpHandler(createServer);
  const response = await handler.fetch(new Request("https://done.example/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), { authInfo: {
    token: "test-only-oauth-token", clientId: "test-client", scopes,
    resource: new URL("https://done.example/mcp"),
    extra: { props: { login, accessToken: "github-app-isolated-reviewer", origin: "https://done.example", reviewMode: true } },
  } });
  expect(response.status).toBe(200);
  const text = await response.text();
  return JSON.parse(text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))!.slice(6));
}

describe("reviewer MCP regression", () => {
  it("publishes an explicit settings-link schema without accepting credentials", async () => {
    const wire = await rpc("tools/list", {});
    const tool = wire.result.tools.find((item: { name: string }) => item.name === "create_openai_credential_setup");
    expect(tool.title).toBe("Open DoneState account settings");
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(Object.keys(tool.outputSchema.properties).sort()).toEqual(["expiresAt", "setupUrl"]);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
  });

  it("allows the formerly blocked reviewer tool and opens its own real account console", async () => {
    const wire = await rpc("tools/call", { name: "create_openai_credential_setup", arguments: {} });
    expect(wire.result.isError).not.toBe(true);
    expect(Object.keys(wire.result.structuredContent).sort()).toEqual(["expiresAt", "setupUrl"]);
    const page = await credentialSettingsHandler.fetch(new Request(wire.result.structuredContent.setupUrl), env);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(OPENAI_REVIEW_LOGIN);
    expect(html).toContain("separate review demo is funded by the publisher");
    expect(html).not.toContain("Signed in as <strong>AyobamiH");
  });

  it("revokes the previous unused settings link while preserving the account credential", async () => {
    const vault = env.CREDENTIAL_VAULT.getByName(OPENAI_REVIEW_LOGIN);
    const before = await vault.status(OPENAI_REVIEW_LOGIN);
    const first = await rpc("tools/call", { name: "create_openai_credential_setup", arguments: {} });
    const second = await rpc("tools/call", { name: "create_openai_credential_setup", arguments: {} });
    const oldUrl = first.result.structuredContent.setupUrl;
    const currentUrl = second.result.structuredContent.setupUrl;
    expect(currentUrl).not.toBe(oldUrl);
    expect((await credentialSettingsHandler.fetch(new Request(oldUrl), env)).status).toBe(400);
    expect((await credentialSettingsHandler.fetch(new Request(currentUrl), env)).status).toBe(200);
    expect((await credentialSettingsHandler.fetch(new Request(currentUrl), env)).status).toBe(400);
    expect(await vault.status(OPENAI_REVIEW_LOGIN)).toEqual(before);
  });

  it("rejects old owner-mapped reviewer tokens even for read tools", async () => {
    const wire = await rpc("tools/call", { name: "get_openai_credential_status", arguments: {} }, "AyobamiH");
    expect(wire.result.isError).toBe(true);
    expect(JSON.stringify(wire.result)).toContain("reconnect DoneState");
  });

  it("rejects credential input and missing execution scope", async () => {
    const credential = await rpc("tools/call", { name: "create_openai_credential_setup", arguments: { api_key: "must-not-be-accepted" } });
    expect(credential.result?.isError === true || Boolean(credential.error)).toBe(true);
    const scope = await rpc("tools/call", { name: "create_openai_credential_setup", arguments: {} }, OPENAI_REVIEW_LOGIN, []);
    expect(scope.result.isError).toBe(true);
    expect(JSON.stringify(scope.result)).toContain("scope");
  });
});
