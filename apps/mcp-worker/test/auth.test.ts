import { describe, expect, it } from "vitest";
import { authHandler, OAUTH_FORM_ACTION, type AuthEnv } from "../src/auth";

function authorizationEnv(githubClientId = "test-github-client-id"): AuthEnv {
  const values = new Map<string, string>();
  return {
    OAUTH_PROVIDER: {
      parseAuthRequest: async () => ({
        clientId: "https://chatgpt.com/oauth/client.json",
        redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
        responseType: "code",
        scope: ["donestate:execute"],
        state: "chatgpt-state",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
      }),
      lookupClient: async () => ({ clientName: "ChatGPT" }),
    },
    OAUTH_KV: {
      get: async (key: string) => values.get(key) ?? null,
      put: async (key: string, value: string) => {
        values.set(key, value);
      },
    },
    GITHUB_CLIENT_ID: githubClientId,
    GITHUB_CLIENT_SECRET: "test-github-client-secret",
  } as unknown as AuthEnv;
}

async function approveRequest(env: AuthEnv): Promise<Response> {
  const consent = await authHandler.fetch(
    new Request("https://done.example/authorize?response_type=code"),
    env,
  );
  const page = await consent.text();
  const stateId = page.match(/name="state_id" value="([^"]+)"/)?.[1];
  const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];
  const cookies = consent.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  expect(stateId).toBeTruthy();
  expect(csrf).toBeTruthy();
  return authHandler.fetch(new Request("https://done.example/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: new URLSearchParams({ state_id: stateId!, csrf: csrf! }),
  }), env);
}

describe("OAuth authorisation security policy", () => {
  it("allows only the origins in the browser OAuth redirect chain", async () => {
    const response = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      authorizationEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(
      `default-src 'none'; style-src 'unsafe-inline'; form-action ${OAUTH_FORM_ACTION}; frame-ancestors 'none'; base-uri 'none'`,
    );
    expect(OAUTH_FORM_ACTION).not.toContain("*");
    expect(await response.text()).toContain('action="/authorize"');
  });

  it("keeps non-OAuth forms restricted to the same origin", async () => {
    const response = await authHandler.fetch(new Request("https://done.example/"), authorizationEnv());

    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'self';");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("https://github.com");
  });

  it("redirects with the configured GitHub OAuth client ID", async () => {
    const response = await approveRequest(authorizationEnv());

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("client_id")).toBe("test-github-client-id");
    expect(location.searchParams.get("client_id")).not.toBe("undefined");
  });

  it("fails closed when the GitHub OAuth client ID is absent", async () => {
    const response = await approveRequest(authorizationEnv(""));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Authorization failed");
  });
});
