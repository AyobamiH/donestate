import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authHandler, type AuthEnv } from "../src/auth";

const testEnv = env as unknown as AuthEnv;

function marketplaceEnv(webhookSecret = "marketplace-webhook-secret-with-32-bytes"): AuthEnv {
  return Object.assign(Object.create(testEnv), {
    OAUTH_PROVIDER: {},
    CANONICAL_ORIGIN: "https://donestate.proofandstate.com",
    COOKIE_ENCRYPTION_KEY: "test-cookie-encryption-key",
    GITHUB_CLIENT_ID: "test-github-client-id",
    GITHUB_CLIENT_SECRET: "test-github-client-secret",
    GITHUB_MARKETPLACE_WEBHOOK_SECRET: webhookSecret,
  }) as AuthEnv;
}

async function signature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GitHub Marketplace OAuth App onboarding", () => {
  it("starts a one-time least-privilege OAuth flow for the purchased plan", async () => {
    const response = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/github/marketplace/install?marketplace_listing_plan_id=101",
    ), marketplaceEnv());

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://github.com");
    expect(location.pathname).toBe("/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-github-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("https://donestate.proofandstate.com/callback");
    expect(location.searchParams.get("scope")).toBe("read:user");
    expect(location.searchParams.get("state")).toMatch(/^marketplace\.[A-Za-z0-9_-]+$/);
  });

  it("rejects a missing or malformed Marketplace plan before GitHub OAuth", async () => {
    const missing = await authHandler.fetch(
      new Request("https://donestate.proofandstate.com/github/marketplace/install"),
      marketplaceEnv(),
    );
    const malformed = await authHandler.fetch(
      new Request("https://donestate.proofandstate.com/github/marketplace/install?marketplace_listing_plan_id=free"),
      marketplaceEnv(),
    );

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it("verifies the active purchase, provisions only an entitlement, and rejects callback replay", async () => {
    const workerEnv = marketplaceEnv();
    const begin = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/github/marketplace/install?marketplace_listing_plan_id=102",
    ), workerEnv);
    const state = new URL(begin.headers.get("Location")!).searchParams.get("state")!;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json({ access_token: "marketplace-user-token" });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({ login: "marketplace-owner", name: "Marketplace Owner", email: null });
      }
      if (url === "https://api.github.com/user/marketplace_purchases?per_page=100") {
        return Response.json([{
          account: { id: 9102, login: "marketplace-owner", type: "User" },
          plan: { id: 102, name: "Public repositories" },
        }]);
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const callback = new URL("https://donestate.proofandstate.com/callback");
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", "marketplace-code");
    const response = await authHandler.fetch(new Request(callback), workerEnv);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("DoneState is linked");
    const entitlement = await workerEnv.MAINTENANCE_REGISTRY.getByName("global").marketplaceEntitlement(9102);
    expect(entitlement).toMatchObject({
      accountLogin: "marketplace-owner",
      authorizedByLogin: "marketplace-owner",
      planId: 102,
      state: "ACTIVE",
    });
    expect(await workerEnv.MAINTENANCE_REGISTRY.getByName("global").listRepositories("marketplace-owner")).toEqual([]);

    const replay = await authHandler.fetch(new Request(callback), workerEnv);
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain("setup expired");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("GitHub Marketplace purchase webhook", () => {
  it("accepts a signed GitHub ping without creating an entitlement", async () => {
    const secret = "marketplace-webhook-secret-with-32-bytes";
    const workerEnv = marketplaceEnv(secret);
    const body = JSON.stringify({ zen: "Keep it logically awesome.", hook_id: 672387368 });
    const response = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/webhooks/github-marketplace",
      { method: "POST", headers: {
        "Content-Type": "application/json",
        "x-github-delivery": "marketplace-ping-1",
        "x-github-event": "ping",
        "x-hub-signature-256": await signature(body, secret),
      }, body },
    ), workerEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, event: "ping" });
    expect(await workerEnv.MAINTENANCE_REGISTRY.getByName("global").marketplaceEntitlement(672387368)).toBeNull();
  });

  it("verifies signatures, records lifecycle changes idempotently, and grants no repository authority", async () => {
    const secret = "marketplace-webhook-secret-with-32-bytes";
    const workerEnv = marketplaceEnv(secret);
    const payload = {
      action: "purchased",
      effective_date: "2026-08-30T12:00:00Z",
      marketplace_purchase: {
        account: { id: 9201, login: "marketplace-org", type: "Organization" },
        plan: { id: 201, name: "Public repositories" },
      },
    };
    const body = JSON.stringify(payload);
    const headers = {
      "Content-Type": "application/json",
      "x-github-delivery": "marketplace-delivery-1",
      "x-github-event": "marketplace_purchase",
      "x-hub-signature-256": await signature(body, secret),
    };
    const first = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/webhooks/github-marketplace",
      { method: "POST", headers, body },
    ), workerEnv);
    const duplicate = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/webhooks/github-marketplace",
      { method: "POST", headers, body },
    ), workerEnv);

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(await workerEnv.MAINTENANCE_REGISTRY.getByName("global").marketplaceEntitlement(9201)).toMatchObject({
      accountLogin: "marketplace-org",
      state: "ACTIVE",
    });
    expect(await workerEnv.MAINTENANCE_REGISTRY.getByName("global").listRepositories("marketplace-org")).toEqual([]);

    const cancellationBody = JSON.stringify({ ...payload, action: "cancelled", effective_date: "2026-09-30T00:00:00Z" });
    const cancellation = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/webhooks/github-marketplace",
      { method: "POST", headers: {
        ...headers,
        "x-github-delivery": "marketplace-delivery-2",
        "x-hub-signature-256": await signature(cancellationBody, secret),
      }, body: cancellationBody },
    ), workerEnv);

    expect(cancellation.status).toBe(202);
    expect(await workerEnv.MAINTENANCE_REGISTRY.getByName("global").marketplaceEntitlement(9201)).toMatchObject({
      state: "CANCELLED",
      effectiveAt: "2026-09-30T00:00:00.000Z",
    });
  });

  it("rejects an invalid signature without recording a purchase", async () => {
    const workerEnv = marketplaceEnv();
    const body = JSON.stringify({
      action: "purchased",
      effective_date: "2026-08-30T12:00:00Z",
      marketplace_purchase: {
        account: { id: 9299, login: "not-recorded", type: "User" },
        plan: { id: 299, name: "Public repositories" },
      },
    });
    const response = await authHandler.fetch(new Request(
      "https://donestate.proofandstate.com/webhooks/github-marketplace",
      { method: "POST", headers: {
        "Content-Type": "application/json",
        "x-github-delivery": "marketplace-invalid-signature",
        "x-github-event": "marketplace_purchase",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      }, body },
    ), workerEnv);

    expect(response.status).toBe(401);
    expect(await workerEnv.MAINTENANCE_REGISTRY.getByName("global").marketplaceEntitlement(9299)).toBeNull();
  });
});
