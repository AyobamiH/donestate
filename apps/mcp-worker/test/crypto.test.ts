import { describe, expect, it } from "vitest";
import { sealSecret, unsealSecret } from "../src/crypto";

const TEST_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

describe("secret envelope", () => {
  it("round-trips without persisting plaintext", async () => {
    const sealed = await sealSecret("github-test-token", TEST_KEY);
    expect(sealed).not.toContain("github-test-token");
    expect(await unsealSecret(sealed, TEST_KEY)).toBe("github-test-token");
  });

  it("rejects the wrong key", async () => {
    const sealed = await sealSecret("value", TEST_KEY);
    const otherKey = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    await expect(unsealSecret(sealed, otherKey)).rejects.toThrow();
  });
});
