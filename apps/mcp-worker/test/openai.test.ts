import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOpenAIApiKeyFormat, verifyOpenAIApiKey } from "../src/openai";

afterEach(() => vi.unstubAllGlobals());

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
      expect(init?.headers).toEqual({ Authorization: `Bearer ${key}` });
      expect(init?.redirect).toBe("error");
      return new Response('{"sensitive":"ignored"}', { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    await expect(verifyOpenAIApiKey(key)).resolves.toBe(key);
    expect(request).toHaveBeenCalledOnce();
  });

  it("reports rejected credentials without echoing them", async () => {
    const key = "test-rejected-credential-not-a-secret-222222222222";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    try {
      await verifyOpenAIApiKey(key);
      expect.unreachable("verification should reject the key");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("rejected");
      expect(message).not.toContain(key);
    }
  });
});
