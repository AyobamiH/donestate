import { describe, expect, it } from "vitest";
import {
  allowsMarketplaceDevelopmentRequest,
  isMarketplaceDevelopment,
  MARKETPLACE_DEVELOPMENT_MODE,
} from "../src/marketplace-development";

describe("Marketplace development isolation", () => {
  it("recognizes only the explicit development deployment mode", () => {
    expect(isMarketplaceDevelopment({ DEPLOYMENT_MODE: MARKETPLACE_DEVELOPMENT_MODE })).toBe(true);
    expect(isMarketplaceDevelopment({ DEPLOYMENT_MODE: "production" })).toBe(false);
    expect(isMarketplaceDevelopment({})).toBe(false);
  });

  it.each([
    ["GET", "https://development.example/"],
    ["GET", "https://development.example/callback?state=marketplace.test&code=test"],
    ["GET", "https://development.example/github/marketplace/install?marketplace_listing_plan_id=1"],
    ["POST", "https://development.example/webhooks/github-marketplace"],
  ])("allows %s %s", (method, url) => {
    expect(allowsMarketplaceDevelopmentRequest(new Request(url, { method }))).toBe(true);
  });

  it.each([
    ["GET", "https://development.example/mcp"],
    ["POST", "https://development.example/mcp"],
    ["GET", "https://development.example/authorize"],
    ["POST", "https://development.example/oauth/token"],
    ["POST", "https://development.example/oauth/register"],
    ["GET", "https://development.example/.well-known/openai-apps-challenge"],
    ["GET", "https://development.example/settings/openai"],
    ["GET", "https://development.example/settings/github-app"],
    ["POST", "https://development.example/webhooks/github"],
    ["GET", "https://development.example/webhooks/github-marketplace"],
  ])("blocks %s %s", (method, url) => {
    expect(allowsMarketplaceDevelopmentRequest(new Request(url, { method }))).toBe(false);
  });
});
