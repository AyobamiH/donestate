import { digest } from "./canonical";
import type { DoneStateEnv } from "./environment";
import { exchangeGitHubCode, getAuthenticatedMarketplacePurchases, getAuthenticatedUser } from "./github";
import type { MarketplacePurchaseAction } from "./types";

const MARKETPLACE_STATE_PREFIX = "marketplace.";
const MARKETPLACE_STATE_TTL_SECONDS = 10 * 60;
const MAX_WEBHOOK_BYTES = 1_000_000;

interface MarketplaceOAuthState {
  schema: "donestate.marketplace-oauth-state.v1";
  planId: number;
  origin: string;
  createdAt: string;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function requiredSecret(env: DoneStateEnv, name: "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET"): string {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing Worker secret: ${name}`);
  return value;
}

function canonicalOrigin(request: Request, env: DoneStateEnv): string {
  const configured = env.CANONICAL_ORIGIN?.trim() ?? new URL(request.url).origin;
  const origin = new URL(configured);
  if (origin.protocol !== "https:" || origin.origin !== configured) {
    throw new Error("CANONICAL_ORIGIN must be an HTTPS origin without a path");
  }
  return configured;
}

function callbackUrl(request: Request, env: DoneStateEnv): string {
  return new URL("/callback", canonicalOrigin(request, env)).href;
}

function stateKey(state: string): Promise<string> {
  return digest(state).then((value) => `github-marketplace:state:${value}`);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  } });
}

function registry(env: DoneStateEnv) {
  return env.MAINTENANCE_REGISTRY.getByName("global");
}

export function isMarketplaceOAuthState(value: string): boolean {
  return value.startsWith(MARKETPLACE_STATE_PREFIX);
}

export async function beginMarketplaceInstall(request: Request, env: DoneStateEnv): Promise<Response> {
  const planIdValue = new URL(request.url).searchParams.get("marketplace_listing_plan_id");
  if (!planIdValue || !/^[0-9]{1,20}$/.test(planIdValue)) return html("<h1>Invalid GitHub Marketplace plan</h1>", 400);
  const planId = Number(planIdValue);
  if (!Number.isSafeInteger(planId) || planId < 1) return html("<h1>Invalid GitHub Marketplace plan</h1>", 400);
  const origin = canonicalOrigin(request, env);
  const state = MARKETPLACE_STATE_PREFIX + randomToken();
  const pending: MarketplaceOAuthState = {
    schema: "donestate.marketplace-oauth-state.v1",
    planId,
    origin,
    createdAt: new Date().toISOString(),
  };
  await env.OAUTH_KV.put(await stateKey(state), JSON.stringify(pending), { expirationTtl: MARKETPLACE_STATE_TTL_SECONDS });
  const upstream = new URL("https://github.com/login/oauth/authorize");
  upstream.searchParams.set("client_id", requiredSecret(env, "GITHUB_CLIENT_ID"));
  upstream.searchParams.set("redirect_uri", callbackUrl(request, env));
  upstream.searchParams.set("scope", "read:user");
  upstream.searchParams.set("state", state);
  return Response.redirect(upstream.href, 302);
}

export async function completeMarketplaceInstall(
  request: Request,
  env: DoneStateEnv,
  state: string,
  code: string,
): Promise<Response> {
  if (!isMarketplaceOAuthState(state) || state.length > 128 || !code || code.length > 256) {
    return html("<h1>Invalid GitHub Marketplace callback</h1>", 400);
  }
  const key = await stateKey(state);
  const raw = await env.OAUTH_KV.get(key);
  await env.OAUTH_KV.delete(key);
  let pending: MarketplaceOAuthState | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) as Partial<MarketplaceOAuthState> : null;
    if (parsed?.schema === "donestate.marketplace-oauth-state.v1"
      && Number.isSafeInteger(parsed.planId) && Number(parsed.planId) > 0
      && parsed.origin === canonicalOrigin(request, env)
      && typeof parsed.createdAt === "string") {
      pending = parsed as MarketplaceOAuthState;
    }
  } catch { pending = null; }
  if (!pending) return html("<h1>GitHub Marketplace setup expired</h1>", 400);
  const accessToken = await exchangeGitHubCode(
    requiredSecret(env, "GITHUB_CLIENT_ID"),
    requiredSecret(env, "GITHUB_CLIENT_SECRET"),
    code,
    callbackUrl(request, env),
  );
  const [user, purchases] = await Promise.all([
    getAuthenticatedUser(accessToken),
    getAuthenticatedMarketplacePurchases(accessToken),
  ]);
  const purchase = purchases.find((candidate) => candidate.plan.id === pending.planId);
  if (!purchase) return html("<h1>GitHub Marketplace purchase was not found</h1>", 403);
  const entitlement = await registry(env).recordMarketplacePurchase({
    accountId: purchase.account.id,
    accountLogin: purchase.account.login,
    accountType: purchase.account.type,
    authorizedByLogin: user.login,
    planId: purchase.plan.id,
    planName: purchase.plan.name,
    action: "purchased",
    effectiveAt: new Date().toISOString(),
  });
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoneState Marketplace setup</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#f0f6fc;margin:0}.card{max-width:680px;margin:8vh auto;padding:32px;border:1px solid #30363d;border-radius:14px;background:#161b22}code{color:#7ee787}a{color:#58a6ff}</style></head><body><main class="card"><p>GitHub Marketplace · ${escapeHtml(entitlement.planName)}</p><h1>DoneState is linked</h1><p><strong>${escapeHtml(entitlement.accountLogin)}</strong> is provisioned for the free public-repository service.</p><p>This purchase does not grant execution authority. Every objective still requires explicit repository scope and PR-only publication authority, and independent OpsTruth verification remains separate.</p><p>Connect your client at <code>https://donestate.proofandstate.com/mcp</code> to continue.</p><p><a href="https://donestate.proofandstate.com">Return to DoneState</a></p></main></body></html>`);
}

async function validSignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.slice(7).match(/.{2}/g) ?? [], (value) => Number.parseInt(value, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
}

export const githubMarketplaceWebhookHandler = {
  async fetch(request: Request, env: DoneStateEnv): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    const secret = env.GITHUB_MARKETPLACE_WEBHOOK_SECRET?.trim();
    if (!secret) return Response.json({ accepted: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(length) || length > MAX_WEBHOOK_BYTES) return new Response("Payload too large", { status: 413 });
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES) return new Response("Payload too large", { status: 413 });
    if (!await validSignature(body, request.headers.get("x-hub-signature-256") ?? "", secret)) {
      return Response.json({ accepted: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (request.headers.get("x-github-event") !== "marketplace_purchase") {
      return Response.json({ accepted: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    try {
      const payload = JSON.parse(body) as {
        action?: MarketplacePurchaseAction;
        effective_date?: string;
        marketplace_purchase?: {
          account?: { id?: number; login?: string; type?: "User" | "Organization" };
          plan?: { id?: number; name?: string };
        };
      };
      const purchase = payload.marketplace_purchase;
      if (!payload.action || !["purchased", "changed", "cancelled", "pending_change", "pending_change_cancelled"].includes(payload.action)
        || !payload.effective_date || !purchase?.account?.id || !purchase.account.login || !purchase.account.type
        || !purchase.plan?.id || !purchase.plan.name) throw new Error("invalid GitHub Marketplace payload");
      const result = await registry(env).ingestMarketplaceWebhook({
        deliveryId: request.headers.get("x-github-delivery") ?? "",
        purchase: {
          accountId: purchase.account.id,
          accountLogin: purchase.account.login,
          accountType: purchase.account.type,
          planId: purchase.plan.id,
          planName: purchase.plan.name,
          action: payload.action,
          effectiveAt: payload.effective_date,
        },
      });
      return Response.json(result, { status: result.duplicate ? 200 : 202, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error(JSON.stringify({ message: "GitHub Marketplace webhook rejected", error: error instanceof Error ? error.message : "unknown error" }));
      return Response.json({ accepted: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  },
};
