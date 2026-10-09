import { env } from "cloudflare:test";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { describe, expect, it } from "vitest";
import { ACCOUNT_MCP_PATH, ACCOUNT_READ_SCOPE } from "../src/account-authorization";
import { createAccountControlsServer } from "../src/account-controls";
import { MCP_BROWSER_ORIGIN_POLICY } from "../src/mcp-origin";
import { createServer } from "../src/server";

const origin = "https://donestate.proofandstate.com";
async function initialise(route: string, browserOrigin?: string, explicitPolicy = true) {
  const handler = createMcpHandler(route === "/mcp" ? createServer : () => createAccountControlsServer(() => env), {
    route, ...(explicitPolicy ? MCP_BROWSER_ORIGIN_POLICY : {}),
  });
  const authInfo: AuthInfo = {
    token: "fixture-token", clientId: "fixture-client", resource: new URL(`${origin}${route}`),
    scopes: [route === "/mcp" ? "donestate:execute" : ACCOUNT_READ_SCOPE],
    extra: { props: { login: "origin-fixture", origin } },
  };
  return handler.fetch(new Request(`${origin}${route}`, {
    method: "POST", headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25", ...(browserOrigin ? { Origin: browserOrigin } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "origin-fixture", version: "1" },
    } }),
  }), { authInfo });
}

describe("real SDK custom-domain browser origin validation", () => {
  it("reproduces the default policy rejection on the canonical custom domain", async () => {
    expect((await initialise("/mcp", origin, false)).status).toBe(403);
  });
  for (const route of ["/mcp", ACCOUNT_MCP_PATH]) {
    it(`accepts canonical browser initialize on ${route}`, async () => {
      const response = await initialise(route, origin);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"protocolVersion":"2025-11-25"');
    });
    it(`rejects foreign and lookalike origins on ${route}`, async () => {
      for (const foreign of ["https://attacker.example", "https://donestate.proofandstate.com.attacker.example", "null"]) {
        expect((await initialise(route, foreign)).status).toBe(403);
      }
    });
    it(`preserves server clients without Origin on ${route}`, async () => {
      expect((await initialise(route)).status).toBe(200);
    });
  }
});
