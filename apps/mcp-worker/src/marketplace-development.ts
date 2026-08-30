import type { DoneStateEnv } from "./environment";

export const MARKETPLACE_DEVELOPMENT_MODE = "marketplace-development";

const ALLOWED_REQUESTS = new Set([
  "GET /",
  "GET /callback",
  "GET /github/marketplace/install",
  "POST /webhooks/github-marketplace",
]);

export function isMarketplaceDevelopment(env: Pick<DoneStateEnv, "DEPLOYMENT_MODE">): boolean {
  return env.DEPLOYMENT_MODE === MARKETPLACE_DEVELOPMENT_MODE;
}

export function allowsMarketplaceDevelopmentRequest(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return ALLOWED_REQUESTS.has(`${request.method.toUpperCase()} ${path}`);
}
