import type { TokenSummary } from "@cloudflare/workers-oauth-provider";
import { describe, expect, it, vi } from "vitest";
import { mcpAuthInfo, type TokenInspector } from "../src/mcp-auth";
import type { GitHubAuthProps } from "../src/types";

const props: GitHubAuthProps = {
  userId: "octocat",
  login: "octocat",
  name: "Octo Cat",
  email: null,
  accessToken: "github-token",
  origin: "https://done.example",
};

function summary(scope: string[], grantScope = scope): TokenSummary<GitHubAuthProps> {
  return {
    id: "token-id",
    grantId: "grant-id",
    userId: props.userId,
    createdAt: 1_700_000_000,
    expiresAt: 1_800_000_000,
    audience: "https://done.example/mcp",
    scope,
    grant: {
      clientId: "https://chatgpt.com/oauth/client.json",
      scope: grantScope,
      props,
    },
  };
}

function request(authorization?: string): Request {
  return new Request("https://done.example/mcp", authorization ? { headers: { Authorization: authorization } } : undefined);
}

describe("MCP OAuth context bridge", () => {
  it("passes the effective token scope and identity into MCP auth info", async () => {
    const unwrapToken = vi.fn(async () => summary(["donestate:execute"]));

    const authInfo = await mcpAuthInfo(request("Bearer access-token"), { unwrapToken });

    expect(unwrapToken).toHaveBeenCalledWith("access-token");
    expect(authInfo).toMatchObject({
      token: "access-token",
      clientId: "https://chatgpt.com/oauth/client.json",
      scopes: ["donestate:execute"],
      expiresAt: 1_800_000_000,
      extra: { props },
    });
    expect(authInfo?.resource?.href).toBe("https://done.example/mcp");
  });

  it("does not restore a scope removed by token downscoping", async () => {
    const inspector: TokenInspector = {
      unwrapToken: async () => summary([], ["donestate:execute"]),
    };

    const authInfo = await mcpAuthInfo(request("Bearer downscoped-token"), inspector);

    expect(authInfo?.scopes).toEqual([]);
  });

  it("fails closed without a valid bearer token", async () => {
    const unwrapToken = vi.fn(async () => summary(["donestate:execute"]));

    await expect(mcpAuthInfo(request(), { unwrapToken })).resolves.toBeNull();
    await expect(mcpAuthInfo(request("Basic credential"), { unwrapToken })).resolves.toBeNull();
    expect(unwrapToken).not.toHaveBeenCalled();
  });

  it("fails closed when the provider cannot unwrap the token", async () => {
    await expect(mcpAuthInfo(request("Bearer unknown-token"), {
      unwrapToken: async () => null,
    })).resolves.toBeNull();
  });
});
