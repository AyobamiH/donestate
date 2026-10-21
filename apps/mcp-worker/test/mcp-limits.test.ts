import { env } from "cloudflare:test";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { ACCOUNT_MCP_PATH, ACCOUNT_READ_SCOPE } from "../src/account-authorization";
import { createAccountControlsServer } from "../src/account-controls";
import { MCP_BROWSER_ORIGIN_POLICY } from "../src/mcp-origin";
import { createBoundedMcpHandler, MCP_HTTP_LIMITS, MCP_MAX_TOOL_INPUT_ELEMENTS } from "../src/mcp-limits";
import { createServer } from "../src/server";

const origin = "https://donestate.proofandstate.com";
function endpoint(route: string, protocolVersion = "2025-11-25") {
  const handler = createBoundedMcpHandler(route === "/mcp" ? createServer : () => createAccountControlsServer(() => env), {
    ...MCP_BROWSER_ORIGIN_POLICY, route,
  });
  const authInfo: AuthInfo = {
    token: "fixture-token", clientId: "limits-fixture", resource: new URL(origin + route),
    scopes: [route === "/mcp" ? "donestate:execute" : ACCOUNT_READ_SCOPE],
    extra: { props: { login: "limits-fixture", origin } },
  };
  return (body: object) => handler.fetch(new Request(origin + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": protocolVersion, Origin: origin },
    body: JSON.stringify(body),
  }), { authInfo });
}

describe("real MCP SDK input limits", () => {
  it("cancels a streamed body at the byte bound before creating a server", async () => {
    let created = false;
    let cancelled = false;
    const handler = createBoundedMcpHandler(() => { created = true; return createServer(); });
    const chunk = new TextEncoder().encode("ö".repeat(300_000));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(chunk); },
      cancel() { cancelled = true; },
    });
    const response = await handler.fetch(new Request(`${origin}/mcp`, { method: "POST", body }));
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(created).toBe(false);
  });
  it("accepts a valid request exactly at the byte limit", async () => {
    const message = { jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "", version: "1" },
    } };
    message.params.clientInfo.name = "x".repeat(MCP_HTTP_LIMITS.maxRequestBodySize - new TextEncoder().encode(JSON.stringify(message)).byteLength);
    const response = await endpoint("/mcp")(message);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"serverInfo"');
  });
  for (const route of ["/mcp", ACCOUNT_MCP_PATH]) {
    for (const protocolVersion of ["2025-11-25", "2026-07-28"]) it(`rejects a body above one MiB on ${route} using ${protocolVersion}`, async () => {
      const response = await endpoint(route, protocolVersion)({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion, capabilities: {},
        clientInfo: { name: "x".repeat(MCP_HTTP_LIMITS.maxRequestBodySize), version: "1" },
      } });
      expect(response.status).toBe(413);
    });
    it(`rejects excessive tool-input elements before invoking a tool on ${route}`, async () => {
      const response = await endpoint(route)({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {
        name: route === "/mcp" ? "get_openai_credential_status" : "inspect_account",
        arguments: { padding: Array(MCP_MAX_TOOL_INPUT_ELEMENTS + 1).fill(null) },
      } });
      const body = await response.text();
      expect(body).toContain('"isError":true');
      expect(body).toContain(`maximum of ${MCP_MAX_TOOL_INPUT_ELEMENTS} elements`);
      expect(body).not.toContain("GitHub authentication context is incomplete");
    });
  }
});
