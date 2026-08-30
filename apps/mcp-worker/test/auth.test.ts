import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authHandler, OAUTH_FORM_ACTION, type AuthEnv } from "../src/auth";

function authorizationEnv(
  githubClientId = "test-github-client-id",
  openaiAppsChallenge?: string,
): AuthEnv {
  return {
    OAUTH_PROVIDER: {
      parseAuthRequest: async () => Object.create({
        clientId: "https://chatgpt.com/oauth/client.json",
        redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
        responseType: "code",
        scope: ["donestate:execute"],
        state: "chatgpt-state",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        resource: "https://done.example/mcp",
        issuer: "https://done.example",
      }) as AuthRequest,
      lookupClient: async () => ({ clientName: "ChatGPT" }),
      completeAuthorization: async () => ({
        redirectTo: "https://chatgpt.com/connector_platform_oauth_redirect?code=review-code",
      }),
    },
    COOKIE_ENCRYPTION_KEY: "existing-cookie-secret-with-non-base64-format",
    GITHUB_CLIENT_ID: githubClientId,
    GITHUB_CLIENT_SECRET: "test-github-client-secret",
    OPENAI_APPS_CHALLENGE: openaiAppsChallenge,
    OPENAI_REVIEW_PASSWORD_SHA256: "f28c3bd6683a77da26a40e343452d03e1eee4839afefcc7f03bde9e42cf1067f",
    PLATFORM_OWNER_LOGIN: "AyobamiH",
  } as unknown as AuthEnv;
}

async function approveRequest(env: AuthEnv): Promise<Response> {
  const consent = await authHandler.fetch(
    new Request("https://done.example/authorize?response_type=code"),
    env,
  );
  const page = await consent.text();
  const stateId = page.match(/name="approval_state" value="([^"]+)"/)?.[1];
  const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];
  expect(stateId).toBeTruthy();
  expect(csrf).toBeTruthy();
  return authHandler.fetch(new Request("https://done.example/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ approval_state: stateId!, csrf: csrf! }),
  }), env);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuth authorisation security policy", () => {
  it("serves the configured OpenAI apps domain challenge as plain text", async () => {
    const response = await authHandler.fetch(
      new Request("https://done.example/.well-known/openai-apps-challenge"),
      authorizationEnv("test-github-client-id", "challenge-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("challenge-token");
  });

  it("does not expose an unconfigured OpenAI apps domain challenge", async () => {
    const response = await authHandler.fetch(
      new Request("https://done.example/.well-known/openai-apps-challenge"),
      authorizationEnv(),
    );

    expect(response.status).toBe(404);
  });

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
    expect(OAUTH_FORM_ACTION).toContain("https://platform.openai.com");
    expect(await response.text()).toContain('action="/authorize"');
  });

  it("keeps non-OAuth forms restricted to the same origin", async () => {
    const response = await authHandler.fetch(new Request("https://done.example/"), authorizationEnv());

    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'self';");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("https://github.com");
  });

  it("identifies the isolated Marketplace development surface without advertising MCP execution", async () => {
    const env = authorizationEnv();
    (env as unknown as { DEPLOYMENT_MODE: "marketplace-development" }).DEPLOYMENT_MODE = "marketplace-development";
    const response = await authHandler.fetch(new Request("https://development.example/"), env);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain("DoneState Marketplace development");
    expect(page).toContain("MCP execution");
    expect(page).not.toContain("Connect an MCP client");
  });

  it("keeps concurrent browser authorization attempts isolated", async () => {
    const env = authorizationEnv();
    const firstConsent = await authHandler.fetch(
      new Request("https://done.example/authorize?attempt=first"),
      env,
    );
    const secondConsent = await authHandler.fetch(
      new Request("https://done.example/authorize?attempt=second"),
      env,
    );
    const firstPage = await firstConsent.text();
    const secondPage = await secondConsent.text();
    const firstStateId = firstPage.match(/name="approval_state" value="([^"]+)"/)?.[1];
    const firstCsrf = firstPage.match(/name="csrf" value="([^"]+)"/)?.[1];
    const secondStateId = secondPage.match(/name="approval_state" value="([^"]+)"/)?.[1];
    const secondCsrf = secondPage.match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(firstStateId).toBeTruthy();
    expect(firstCsrf).toBeTruthy();
    expect(secondStateId).toBeTruthy();
    expect(secondCsrf).toBeTruthy();

    const approve = (stateId: string, csrf: string) => authHandler.fetch(
      new Request("https://done.example/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ approval_state: stateId, csrf }),
      }),
      env,
    );

    const [firstApproval, secondApproval] = await Promise.all([
      approve(firstStateId!, firstCsrf!),
      approve(secondStateId!, secondCsrf!),
    ]);
    expect(firstApproval.status).toBe(302);
    expect(secondApproval.status).toBe(302);
  });

  it("preserves valid authorization when a browser handoff does not retain cookies", async () => {
    const response = await approveRequest(authorizationEnv());

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("Location")!).origin).toBe("https://github.com");
  });

  it("explains supported GitHub confirmation methods and offers a dedicated reviewer login", async () => {
    const response = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      authorizationEnv(),
    );
    const page = await response.text();

    expect(page).toContain("use your password or authenticator app");
    expect(page).toContain("Passkeys are not supported in Cloud Browser");
    expect(page).toContain('action="/authorize/reviewer"');
    expect(page).toContain("OpenAI reviewer test account");
  });

  it("authorizes the dedicated reviewer account without GitHub or MFA", async () => {
    const env = authorizationEnv();
    const consent = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      env,
    );
    const page = await consent.text();
    const approvalState = page.match(/name="approval_state" value="([^"]+)"/)?.[1];
    const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];

    const response = await authHandler.fetch(
      new Request("https://done.example/authorize/reviewer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          approval_state: approvalState!,
          csrf: csrf!,
          username: "openai-reviewer",
          password: "openai-review-test-password",
        }),
      }),
      env,
    );

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("Location")!).origin).toBe("https://chatgpt.com");
  });

  it("rejects an incorrect reviewer password without revealing which credential failed", async () => {
    const env = authorizationEnv();
    const consent = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      env,
    );
    const page = await consent.text();
    const approvalState = page.match(/name="approval_state" value="([^"]+)"/)?.[1];
    const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];

    const response = await authHandler.fetch(
      new Request("https://done.example/authorize/reviewer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          approval_state: approvalState!,
          csrf: csrf!,
          username: "openai-reviewer",
          password: "wrong-password",
        }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Reviewer sign-in failed");
  });

  it("rejects authorization when the one-time CSRF proof is invalid", async () => {
    const env = authorizationEnv();
    const consent = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      env,
    );
    const page = await consent.text();
    const stateId = page.match(/name="approval_state" value="([^"]+)"/)?.[1];
    expect(stateId).toBeTruthy();

    const response = await authHandler.fetch(
      new Request("https://done.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ approval_state: stateId!, csrf: "invalid-proof" }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("CSRF validation failed");
  });

  it("rejects a tampered sealed approval", async () => {
    const env = authorizationEnv();
    const consent = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      env,
    );
    const page = await consent.text();
    const approvalState = page.match(/name="approval_state" value="([^"]+)"/)?.[1];
    const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(approvalState).toBeTruthy();
    expect(csrf).toBeTruthy();
    // Mutate the first base64url character so the decoded IV always changes.
    // Mutating the final character can alter only discarded padding bits.
    const first = approvalState!.at(0);
    const tampered = (first === "A" ? "B" : "A") + approvalState!.slice(1);

    const response = await authHandler.fetch(
      new Request("https://done.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ approval_state: tampered, csrf: csrf! }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Expired approval");
  });

  it("rejects a sealed approval after its ten-minute lifetime", async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const env = authorizationEnv();
    const consent = await authHandler.fetch(
      new Request("https://done.example/authorize?response_type=code"),
      env,
    );
    const page = await consent.text();
    const approvalState = page.match(/name="approval_state" value="([^"]+)"/)?.[1];
    const csrf = page.match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(approvalState).toBeTruthy();
    expect(csrf).toBeTruthy();
    vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1_000 + 1);

    const response = await authHandler.fetch(
      new Request("https://done.example/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ approval_state: approvalState!, csrf: csrf! }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Expired approval");
  });

  it("redirects with the configured GitHub OAuth client ID", async () => {
    const response = await approveRequest(authorizationEnv());

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("client_id")).toBe("test-github-client-id");
    expect(location.searchParams.get("client_id")).not.toBe("undefined");
  });

  it("uses the canonical callback while a legacy Worker hostname remains compatible", async () => {
    const env = authorizationEnv();
    env.CANONICAL_ORIGIN = "https://donestate.proofandstate.com";
    const response = await approveRequest(env);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://donestate.proofandstate.com/callback",
    );
  });

  it("fails closed when the GitHub OAuth client ID is absent", async () => {
    const response = await approveRequest(authorizationEnv(""));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Authorization failed");
  });
});
