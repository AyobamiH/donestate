import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digest } from "../src/canonical";
import type { DoneStateEnv } from "../src/environment";
import { createGitHubAppSetup, githubAppSettingsHandler } from "../src/github-app-settings";

const testEnv = env as unknown as DoneStateEnv;

function extractState(page: string): string {
  const formAction = page.match(/<form method="post" action="([^"]+)"/)?.[1];
  expect(formAction).toBeTruthy();

  const action = new URL(formAction!);
  expect(action.origin).toBe("https://github.com");
  expect(action.pathname).toBe("/settings/apps/new");

  const state = action.searchParams.get("state");
  expect(state).toBeTruthy();
  return state!;
}

describe("GitHub App manifest setup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps redirect_url queryless and sends state on the GitHub form action", async () => {
    const setup = await createGitHubAppSetup(testEnv, "AyobamiH", "https://done.example");
    const setupUrl = new URL(setup.setupUrl);
    const ticket = setupUrl.searchParams.get("ticket");
    expect(ticket).toBeTruthy();

    const response = await githubAppSettingsHandler.fetch(new Request(setup.setupUrl), testEnv);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action https://github.com");
    expect(page).toContain("&quot;redirect_url&quot;:&quot;https://done.example/settings/github-app/callback&quot;");
    expect(page).not.toContain("/settings/github-app/callback?");
    expect(page).toContain("&quot;default_events&quot;:[&quot;issues&quot;,&quot;pull_request&quot;,&quot;push&quot;,&quot;workflow_run&quot;]");
    expect(page).not.toContain("&quot;installation&quot;");
    expect(page).not.toContain("&quot;installation_repositories&quot;");

    const state = extractState(page);
    expect(await env.OAUTH_KV.get("github-app:state:" + await digest(state))).toContain("AyobamiH");
    expect(await env.OAUTH_KV.get("github-app:ticket:" + await digest(ticket!))).toBeNull();

    const replay = await githubAppSettingsHandler.fetch(new Request(setup.setupUrl), testEnv);
    expect(replay.status).toBe(400);
  });

  it("rejects an expired callback state before exchanging the manifest code", async () => {
    const setup = await createGitHubAppSetup(testEnv, "AyobamiH", "https://done.example");
    const begin = await githubAppSettingsHandler.fetch(new Request(setup.setupUrl), testEnv);
    const state = extractState(await begin.text());
    await env.OAUTH_KV.delete("github-app:state:" + await digest(state));

    const exchange = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", exchange);

    const callback = new URL("https://done.example/settings/github-app/callback");
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", "unused-manifest-code");
    const response = await githubAppSettingsHandler.fetch(new Request(callback), testEnv);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("GitHub App setup expired");
    expect(exchange).not.toHaveBeenCalled();
  });
});
