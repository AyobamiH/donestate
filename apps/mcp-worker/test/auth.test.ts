import { describe, expect, it } from "vitest";
import { authHandler, OAUTH_FORM_ACTION, type AuthEnv } from "../src/auth";

function authorizationEnv(): AuthEnv {
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
  } as unknown as AuthEnv;
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
});
