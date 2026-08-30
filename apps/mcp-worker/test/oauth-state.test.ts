import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { OAuthStateStore, PendingAuthorization } from "../src/oauth-state";

function pending(clientState = "chatgpt-state"): PendingAuthorization {
  return {
    oauthRequest: {
      clientId: "https://chatgpt.com/oauth/client.json",
      redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
      responseType: "code",
      scope: ["donestate:execute"],
      state: clientState,
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
    } as AuthRequest,
    csrfDigest: "a".repeat(64),
    approved: false,
  };
}

describe("OAuthStateStore", () => {
  it("atomically validates, approves and consumes one authorization", async () => {
    const stub = env.OAUTH_STATE.getByName(crypto.randomUUID());
    await stub.create(pending());

    expect(await stub.read()).toMatchObject({ approved: false });
    expect(await stub.approve("b".repeat(64))).toEqual({ status: "invalid_csrf" });
    expect(await stub.read()).toMatchObject({ approved: false });

    const approved = await stub.approve("a".repeat(64));
    expect(approved).toMatchObject({
      status: "approved",
      pending: { approved: true },
    });
    expect(await stub.read()).toMatchObject({ approved: true });

    await stub.consume();
    expect(await stub.read()).toBeNull();
  });

  it("keeps simultaneous authorization transactions isolated", async () => {
    const first = env.OAUTH_STATE.getByName(crypto.randomUUID());
    const second = env.OAUTH_STATE.getByName(crypto.randomUUID());
    await Promise.all([
      first.create(pending("first-client-state")),
      second.create(pending("second-client-state")),
    ]);

    await first.approve("a".repeat(64));
    expect(await first.read()).toMatchObject({
      approved: true,
      oauthRequest: { state: "first-client-state" },
    });
    expect(await second.read()).toMatchObject({
      approved: false,
      oauthRequest: { state: "second-client-state" },
    });

    await Promise.all([first.consume(), second.consume()]);
  });

  it("fails closed after the ten-minute transaction record expires", async () => {
    const stub = env.OAUTH_STATE.getByName(crypto.randomUUID());
    await stub.create(pending());

    await runInDurableObject(stub, async (_instance: OAuthStateStore, state) => {
      const stored = await state.storage.get<PendingAuthorization & { expiresAt: number }>("pending");
      expect(stored).toBeTruthy();
      await state.storage.put("pending", { ...stored!, expiresAt: Date.now() - 1 });
    });

    expect(await stub.read()).toBeNull();
    expect(await stub.approve("a".repeat(64))).toEqual({ status: "missing" });
  });
});
