import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { describe, expect, it } from "vitest";
import { authHandler, type AuthEnv } from "../src/auth";
import { OPENAI_REVIEW_LOGIN } from "../src/review-access";

describe("reviewer OAuth provider integration", () => {
  it("exchanges, refreshes and revokes real provider tokens for the isolated reviewer", async () => {
    let helpers: AuthEnv["OAUTH_PROVIDER"] | undefined;
    const provider = new OAuthProvider<AuthEnv>({
      authorizeEndpoint: "/authorize", tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      scopesSupported: ["donestate:execute"], apiRoute: "/mcp",
      apiHandler: { fetch: async () => Response.json({ authenticated: true }) },
      defaultHandler: { fetch: async (request, bindings) => {
        helpers = (bindings as AuthEnv).OAUTH_PROVIDER;
        return authHandler.fetch(request, bindings as AuthEnv);
      } },
    });
    const bindings = {
      ...env,
      OPENAI_REVIEW_PASSWORD_SHA256: "f28c3bd6683a77da26a40e343452d03e1eee4839afefcc7f03bde9e42cf1067f",
      CREDENTIAL_VAULT: { getByName: () => ({
        requireAccountWritable: async () => ({ writable: true, generation: 0 }),
        status: async () => ({ connected: true }),
      }) },
      MAINTENANCE_REGISTRY: { getByName: () => ({
        listRepositories: async () => [{
          repository: "AyobamiH/donestate-review-fixture", installationId: 123,
        }],
      }) },
    } as unknown as AuthEnv;
    const send = async (path: string, init?: RequestInit) => {
      const ctx = createExecutionContext();
      const response = await provider.fetch(new Request(new URL(path, "https://done.example"), init), bindings, ctx);
      await waitOnExecutionContext(ctx);
      return response;
    };
    const form = (path: string, values: Record<string, string>) => send(path, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
    });
    const redirectUri = "https://client.example/callback";
    const registration = await send("/oauth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Reviewer regression", redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    expect(registration.status).toBe(201);
    const client = await registration.json() as { client_id: string };
    const verifier = "reviewer-regression-pkce-verifier-with-sufficient-entropy";
    const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...hashed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const query = new URLSearchParams({
      client_id: client.client_id, redirect_uri: redirectUri, response_type: "code",
      scope: "donestate:execute", resource: "https://done.example/mcp",
      code_challenge: challenge, code_challenge_method: "S256", state: "reviewer-test-state",
    });
    const consent = await send("/authorize?" + query);
    expect(consent.status).toBe(200);
    const html = await consent.text();
    const approval = html.match(/name="approval_state" value="([^"]+)"/)![1]!;
    const csrf = html.match(/name="csrf" value="([^"]+)"/)![1]!;
    const login = await form("/authorize/reviewer", {
      approval_state: approval, csrf, username: "openai-reviewer", password: "openai-review-test-password",
    });
    expect(login.status).toBe(302);
    const callback = new URL(login.headers.get("Location")!);
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get("state")).toBe("reviewer-test-state");
    const code = callback.searchParams.get("code")!;
    const exchange = {
      grant_type: "authorization_code", client_id: client.client_id, code,
      code_verifier: verifier, redirect_uri: redirectUri, resource: "https://done.example/mcp",
    };
    const wrongPkce = await form("/oauth/token", { ...exchange, code_verifier: "wrong-verifier" });
    expect(wrongPkce.status).toBe(400);
    const exchanged = await form("/oauth/token", exchange);
    expect(exchanged.status).toBe(200);
    const token = await exchanged.json() as { access_token: string; refresh_token: string };
    const summary = await helpers!.unwrapToken(token.access_token);
    expect(summary?.userId).toBe(encodeURIComponent(OPENAI_REVIEW_LOGIN));
    expect(summary?.grant.props).toMatchObject({ login: OPENAI_REVIEW_LOGIN, reviewMode: true });
    expect((await send("/mcp", { headers: { Authorization: "Bearer " + token.access_token } })).status).toBe(200);
    const refresh = await form("/oauth/token", {
      grant_type: "refresh_token", client_id: client.client_id, refresh_token: token.refresh_token,
      resource: "https://done.example/mcp",
    });
    expect(refresh.status).toBe(200);
    const fresh = await refresh.json() as { access_token: string; refresh_token: string };
    expect((await helpers!.unwrapToken(fresh.access_token))?.grant.props).toMatchObject({ login: OPENAI_REVIEW_LOGIN });
    expect((await form("/oauth/token", {
      client_id: client.client_id, token: fresh.refresh_token, token_type_hint: "refresh_token",
    })).status).toBe(200);
    expect((await send("/mcp", { headers: { Authorization: "Bearer " + fresh.access_token } })).status).toBe(401);
  });
});
