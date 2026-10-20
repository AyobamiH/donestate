import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const workers = {
  miniflare: {
    bindings: {
      COOKIE_ENCRYPTION_KEY: "test-cookie-secret-with-no-live-access",
      GITHUB_CLIENT_ID: "test-github-client",
      GITHUB_CLIENT_SECRET: "test-github-client-secret",
      TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      USER_CREDENTIAL_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
    },
  },
  wrangler: { configPath: "./wrangler.test.jsonc" },
};

export default defineConfig({
  plugins: [cloudflareTest(workers)],
  test: {
    pool: cloudflarePool(workers),
    testTimeout: 10_000,
  },
});
