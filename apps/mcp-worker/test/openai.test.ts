import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOpenAIApiKeyFormat, verifyOpenAIApiKey } from "../src/openai";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAI API key admission", () => {
  it("accepts an opaque printable key without depending on one prefix", () => {
    expect(validateOpenAIApiKeyFormat("future-format_1234567890_abcdef")).toBe(
      "future-format_1234567890_abcdef",
    );
  });

  it("rejects short, multiline and oversized values", () => {
    expect(() => validateOpenAIApiKeyFormat("short")).toThrow();
    expect(() => validateOpenAIApiKeyFormat("sk-valid-looking-but\nmultiline-value")).toThrow();
    expect(() => validateOpenAIApiKeyFormat("x".repeat(513))).toThrow();
  });

  it("verifies the credential directly with OpenAI without returning response content", async () => {
    const key = "test-user-funded-credential-not-a-secret-1111111111";
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "Cache-Control": "no-store",
      });
      expect(init?.redirect).toBe("manual");
      return new Response('{"sensitive":"ignored"}', { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    await expect(verifyOpenAIApiKey(key)).resolves.toBe(key);
    expect(request).toHaveBeenCalledOnce();
  });

  it("reports rejected credentials without echoing them", async () => {
    const key = "test-rejected-credential-not-a-secret-222222222222";
    const request = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", request);
    try {
      await verifyOpenAIApiKey(key);
      expect.unreachable("verification should reject the key");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("rejected");
      expect(message).not.toContain(key);
    }
    expect(request).toHaveBeenCalledOnce();
  });

  it("retries one transient transport failure without logging the key", async () => {
    const key = "test-retry-credential-not-a-secret-333333333333";
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError("network connection lost"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", request);

    await expect(verifyOpenAIApiKey(key)).resolves.toBe(key);

    expect(request).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(key);
  });

  it("retries a transient OpenAI response and remains bounded", async () => {
    const key = "test-retryable-status-not-a-secret-444444444444";
    const request = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", request);

    await expect(verifyOpenAIApiKey(key)).rejects.toThrow("could not verify");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("fails closed without following an unexpected redirect", async () => {
    const key = "test-redirected-credential-not-a-secret-454545454545";
    const request = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { Location: "https://example.com/untrusted" },
    }));
    vi.stubGlobal("fetch", request);

    await expect(verifyOpenAIApiKey(key)).rejects.toThrow("could not verify");
    expect(request).toHaveBeenCalledOnce();
  });

  it("fails closed after two transport attempts without exposing the key", async () => {
    const key = "test-unreachable-credential-not-a-secret-555555555555";
    const request = vi.fn(async () => {
      throw new TypeError(`network connection lost for ${key}`, {
        cause: new Error(`nested failure for ${key}`),
      });
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", request);

    await expect(verifyOpenAIApiKey(key)).rejects.toThrow("after two attempts");

    expect(request).toHaveBeenCalledTimes(2);
    const logs = JSON.stringify(consoleError.mock.calls);
    expect(logs).not.toContain(key);
    expect(logs).toContain("[REDACTED]");
    expect(logs).toContain("nested failure");
  });
});
