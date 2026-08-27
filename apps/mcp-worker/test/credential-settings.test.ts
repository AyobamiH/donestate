import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digest } from "../src/canonical";
import { createCredentialSetup, credentialSettingsHandler } from "../src/credential-settings";

describe("execution credential setup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a short-lived one-time HTTPS setup flow without exposing a key", async () => {
    const setup = await createCredentialSetup(env, "setup-user", "https://done.example");
    expect(setup.status.connected).toBe(false);
    expect(setup.setupUrl).toMatch(/^https:\/\/done\.example\/settings\/openai\?ticket=/);

    const url = new URL(setup.setupUrl);
    const ticket = url.searchParams.get("ticket");
    expect(ticket).toBeTruthy();
    const stored = await env.OAUTH_KV.get(`credential:ticket:${await digest(ticket!)}`);
    expect(stored).toContain("setup-user");

    const response = await credentialSettingsHandler.fetch(new Request(setup.setupUrl), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toContain("__Host-DONESTATE_CREDENTIAL=");
    expect(await response.text()).toContain("never returned to ChatGPT");
    expect(await env.OAUTH_KV.get(`credential:ticket:${await digest(ticket!)}`)).toBeNull();

    const replay = await credentialSettingsHandler.fetch(new Request(setup.setupUrl), env);
    expect(replay.status).toBe(400);
  });

  it("rejects a non-HTTPS production origin", async () => {
    await expect(createCredentialSetup(env, "setup-user", "http://done.example")).rejects.toThrow(
      "production HTTPS origin",
    );
  });

  it("verifies, encrypts and connects a user key without returning it", async () => {
    const user = "connect-user";
    const userKey = "test-user-funded-credential-not-a-secret-1111111111";
    const setup = await createCredentialSetup(env, user, "https://done.example");
    const begin = await credentialSettingsHandler.fetch(new Request(setup.setupUrl), env);
    const setupPage = await begin.text();
    const csrf = setupPage.match(/name="csrf" value="([^"]+)"/)?.[1];
    const session = begin.headers.get("Set-Cookie")?.split(";", 1)[0];
    expect(csrf).toBeTruthy();
    expect(session).toContain("__Host-DONESTATE_CREDENTIAL=");

    const openAiFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.openai.com/v1/models");
      expect(init?.headers).toEqual({ Authorization: `Bearer ${userKey}` });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", openAiFetch);

    const body = new URLSearchParams({ csrf: csrf!, api_key: userKey }).toString();
    const finish = await credentialSettingsHandler.fetch(new Request(
      "https://done.example/settings/openai",
      {
        method: "POST",
        headers: {
          "Content-Length": String(new TextEncoder().encode(body).byteLength),
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: session!,
        },
        body,
      },
    ), env);
    const successPage = await finish.text();

    expect(finish.status).toBe(200);
    expect(successPage).toContain("OpenAI connected");
    expect(successPage).not.toContain(userKey);
    expect(openAiFetch).toHaveBeenCalledOnce();
    expect(await env.CREDENTIAL_VAULT.getByName(user).status(user)).toMatchObject({ connected: true });
  });
});
