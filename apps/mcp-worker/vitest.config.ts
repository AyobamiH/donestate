import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const workers = {
  miniflare: {
    bindings: {
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
  },
});
