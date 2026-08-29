import { digest } from "./canonical";
import type { DoneStateEnv } from "./environment";
import { exchangeManifestCode } from "./github-app";

interface SetupTicket { login: string; origin: string }
interface SetupState extends SetupTicket { createdAt: string }

const TICKET_TTL_SECONDS = 10 * 60;
const STATE_TTL_SECONDS = 15 * 60;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function html(body: string, status = 200, formAction = "'self'"): Response {
  return new Response(body, { status, headers: {
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    "Content-Type": "text/html; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  } });
}

function parseTicket(value: string | null): SetupTicket | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SetupTicket>;
    return parsed.login && parsed.origin ? { login: parsed.login, origin: parsed.origin } : null;
  } catch { return null; }
}

function registry(env: DoneStateEnv) {
  return env.MAINTENANCE_REGISTRY.getByName("global");
}

export async function createGitHubAppSetup(env: DoneStateEnv, login: string, origin: string): Promise<{
  setupUrl: string; expiresAt: string; status: Awaited<ReturnType<ReturnType<typeof registry>["githubAppStatus"]>>;
}> {
  if (!env.PLATFORM_OWNER_LOGIN || login !== env.PLATFORM_OWNER_LOGIN) throw new Error("only the Proof & State platform owner can configure the GitHub App");
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || parsedOrigin.protocol !== "https:") throw new Error("GitHub App setup requires the production HTTPS origin");
  const ticket = randomToken();
  const expiresAtMs = Date.now() + TICKET_TTL_SECONDS * 1_000;
  await env.OAUTH_KV.put(`github-app:ticket:${await digest(ticket)}`, JSON.stringify({ login, origin } satisfies SetupTicket), { expirationTtl: TICKET_TTL_SECONDS });
  const setupUrl = new URL("/settings/github-app", origin);
  setupUrl.searchParams.set("ticket", ticket);
  return { setupUrl: setupUrl.href, expiresAt: new Date(expiresAtMs).toISOString(), status: await registry(env).githubAppStatus() };
}

async function begin(request: Request, env: DoneStateEnv): Promise<Response> {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket || ticket.length > 128) return html("<h1>Setup link is invalid or expired</h1>", 400);
  const key = `github-app:ticket:${await digest(ticket)}`;
  const pending = parseTicket(await env.OAUTH_KV.get(key));
  await env.OAUTH_KV.delete(key);
  if (!pending || pending.origin !== url.origin || pending.login !== env.PLATFORM_OWNER_LOGIN) return html("<h1>Setup link is invalid or expired</h1>", 400);
  const state = randomToken();
  await env.OAUTH_KV.put(`github-app:state:${await digest(state)}`, JSON.stringify({ ...pending, createdAt: new Date().toISOString() } satisfies SetupState), { expirationTtl: STATE_TTL_SECONDS });
  const callback = new URL("/settings/github-app/callback", url.origin);
  const githubCreateUrl = new URL("https://github.com/settings/apps/new");
githubCreateUrl.searchParams.set("state", state);
  const manifest = {
    name: `DoneState Maintenance ${pending.login}`.slice(0, 34),
    url: url.origin,
    description: "Selected-repository, PR-only autonomous maintenance for DoneState.",
    redirect_url: callback.href,
    public: false,
    hook_attributes: { url: new URL("/webhooks/github", url.origin).href, active: true },
    default_permissions: {
      actions: "read",
      contents: "write",
      issues: "read",
      metadata: "read",
      pull_requests: "write",
    },
    default_events: ["issues", "pull_request", "push", "workflow_run"],
  };
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Create DoneState GitHub App</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#15171a;margin:0}.card{max-width:680px;margin:8vh auto;background:#fff;padding:32px;border:1px solid #dfe3e8;border-radius:14px}li{margin:.6rem 0}button{font:inherit;border:0;background:#15171a;color:#fff;padding:12px 18px;border-radius:8px}</style></head><body><main class="card"><h1>Create the DoneState GitHub App</h1><p>This creates one private GitHub App for <strong>${escapeHtml(pending.login)}</strong>. Installation remains selected-repository only.</p><ul><li>Read Actions, issues, metadata and pull requests</li><li>Create repair branches and pull requests</li><li>No administration, secrets, deployments, releases, merge or workflow-write permission</li></ul><form method="post" action="${escapeHtml(githubCreateUrl.href)}"><input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}"><button type="submit">Create private GitHub App</button></form></main></body></html>`, 200, "https://github.com");
}

async function callback(request: Request, env: DoneStateEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || state.length > 128 || !code || code.length > 256) return html("<h1>GitHub App callback is invalid</h1>", 400);
  const stateKey = `github-app:state:${await digest(state)}`;
  const pending = parseTicket(await env.OAUTH_KV.get(stateKey));
  await env.OAUTH_KV.delete(stateKey);
  if (!pending || pending.origin !== url.origin || pending.login !== env.PLATFORM_OWNER_LOGIN) return html("<h1>GitHub App setup expired</h1>", 400);
  const app = await exchangeManifestCode(code);
  const configured = await registry(env).configureGitHubApp(pending.login, app);
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoneState GitHub App ready</title></head><body><main><h1>GitHub App credentials encrypted</h1><p><strong>${escapeHtml(app.name)}</strong> is configured. Install it only on repositories DoneState may maintain.</p><p><a href="${escapeHtml(configured.installUrl)}">Install on selected repositories</a></p><p>After installation, return to ChatGPT and select each repository in DoneState.</p></main></body></html>`);
}

export const githubAppSettingsHandler = {
  async fetch(request: Request, env: DoneStateEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/settings/github-app" && request.method === "GET") return begin(request, env);
    if (url.pathname === "/settings/github-app/callback" && request.method === "GET") return callback(request, env);
    return new Response("Not found", { status: 404 });
  },
};

export const githubWebhookHandler = {
  async fetch(request: Request, env: DoneStateEnv): Promise<Response> {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(length) || length > 1_000_000) return new Response("Payload too large", { status: 413 });
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 1_000_000) return new Response("Payload too large", { status: 413 });
    try {
      const result = await registry(env).ingestWebhook({
        signature: request.headers.get("x-hub-signature-256") ?? "",
        deliveryId: request.headers.get("x-github-delivery") ?? "",
        eventName: request.headers.get("x-github-event") ?? "",
        body,
      });
      return Response.json(result, { status: result.duplicate ? 200 : 202, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error(JSON.stringify({ message: "GitHub webhook rejected", error: error instanceof Error ? error.message : "unknown error" }));
      return Response.json({ accepted: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
  },
};
