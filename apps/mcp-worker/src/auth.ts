import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { digest } from "./canonical";
import { credentialSettingsHandler } from "./credential-settings";
import type { DoneStateEnv } from "./environment";
import { exchangeGitHubCode, getAuthenticatedUser } from "./github";
import type { GitHubAuthProps } from "./types";

export const EXECUTION_SCOPE = "donestate:execute";

export type AuthEnv = DoneStateEnv & { OAUTH_PROVIDER: OAuthHelpers };

interface PendingAuthorization {
  oauthRequest: AuthRequest;
  csrfDigest: string;
  approved: boolean;
}

const STATE_COOKIE = "__Host-DONESTATE_STATE";
const CSRF_COOKIE = "__Host-DONESTATE_CSRF";
const TEN_MINUTES = 600;

function cookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function secureCookie(name: string, value: string, maxAge = TEN_MINUTES): string {
  return `${name}=${value}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name: string): string {
  return secureCookie(name, "", 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function constantTimeEqual(left: string | null, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left ?? "")),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return left !== null && crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

function html(body: string, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  cookies.forEach((value) => headers.append("Set-Cookie", value));
  return new Response(body, { status, headers });
}

async function validateBrowserState(request: Request, stateId: string): Promise<boolean> {
  const expected = cookie(request, STATE_COOKIE);
  return constantTimeEqual(expected, await digest(stateId));
}

async function consent(request: Request, env: AuthEnv): Promise<Response> {
  const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  if (!oauthRequest.clientId) return new Response("Invalid client", { status: 400 });
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) return new Response("Unknown client", { status: 400 });
  const stateId = crypto.randomUUID();
  const csrf = crypto.randomUUID();
  const pending: PendingAuthorization = {
    oauthRequest,
    csrfDigest: await digest(csrf),
    approved: false,
  };
  await env.OAUTH_KV.put(`oauth:pending:${stateId}`, JSON.stringify(pending), { expirationTtl: TEN_MINUTES });
  const clientName = escapeHtml(client.clientName || "ChatGPT");
  const scopes = escapeHtml(oauthRequest.scope.join(", ") || EXECUTION_SCOPE);
  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorise DoneState</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#15171a;margin:0}.card{max-width:620px;margin:8vh auto;background:white;padding:32px;border:1px solid #dfe3e8;border-radius:14px;box-shadow:0 10px 32px #0001}h1{margin-top:0}.scope{background:#f3f5f7;padding:12px;border-radius:8px}li{margin:.6rem 0}.actions{display:flex;gap:12px;margin-top:24px}button,a{font:inherit;padding:11px 18px;border-radius:8px;text-decoration:none}.approve{border:0;background:#15171a;color:white}.cancel{border:1px solid #ccd1d7;color:#15171a}</style></head>
<body><main class="card"><h1>Authorise DoneState</h1><p><strong>${clientName}</strong> is requesting access to your DoneState execution plane.</p>
<p class="scope"><strong>Client scopes:</strong> ${scopes}</p>
<p>GitHub will ask for repository access. DoneState will still require an explicit authority envelope for every objective. It cannot silently push or open a pull request.</p>
<ul><li>Use your separately connected OpenAI API key for your runs</li><li>Run a coding agent in an isolated sandbox</li><li>Validate and commit bounded repository changes</li><li>Push or open a pull request only when granted</li><li>Stop before claiming completion until an independent verifier signs the exact snapshot</li></ul>
<form method="post" action="/authorize"><input type="hidden" name="state_id" value="${stateId}"><input type="hidden" name="csrf" value="${csrf}"><div class="actions"><a class="cancel" href="/">Cancel</a><button class="approve" type="submit">Continue with GitHub</button></div></form></main></body></html>`, 200, [
    secureCookie(STATE_COOKIE, await digest(stateId)),
    secureCookie(CSRF_COOKIE, await digest(csrf)),
  ]);
}

async function approve(request: Request, env: AuthEnv): Promise<Response> {
  const form = await request.formData();
  const stateId = form.get("state_id");
  const csrf = form.get("csrf");
  if (typeof stateId !== "string" || typeof csrf !== "string") return new Response("Invalid approval", { status: 400 });
  if (!await validateBrowserState(request, stateId)) return new Response("Expired browser state", { status: 400 });
  const pendingJson = await env.OAUTH_KV.get(`oauth:pending:${stateId}`);
  if (!pendingJson) return new Response("Expired approval", { status: 400 });
  const pending = JSON.parse(pendingJson) as PendingAuthorization;
  const cookieCsrf = cookie(request, CSRF_COOKIE);
  const submittedDigest = await digest(csrf);
  const [cookieCsrfValid, pendingCsrfValid] = await Promise.all([
    constantTimeEqual(cookieCsrf, submittedDigest),
    constantTimeEqual(pending.csrfDigest, submittedDigest),
  ]);
  if (!cookieCsrfValid || !pendingCsrfValid) {
    return new Response("CSRF validation failed", { status: 400 });
  }
  pending.approved = true;
  await env.OAUTH_KV.put(`oauth:pending:${stateId}`, JSON.stringify(pending), { expirationTtl: TEN_MINUTES });
  const callback = new URL("/callback", request.url).href;
  const upstream = new URL("https://github.com/login/oauth/authorize");
  upstream.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  upstream.searchParams.set("redirect_uri", callback);
  upstream.searchParams.set("scope", "public_repo read:user");
  upstream.searchParams.set("state", stateId);
  return Response.redirect(upstream.href, 302);
}

async function callback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const stateId = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateId || !code || !await validateBrowserState(request, stateId)) return new Response("Invalid OAuth callback", { status: 400 });
  const pendingJson = await env.OAUTH_KV.get(`oauth:pending:${stateId}`);
  if (!pendingJson) return new Response("Expired OAuth callback", { status: 400 });
  const pending = JSON.parse(pendingJson) as PendingAuthorization;
  if (!pending.approved) return new Response("Consent was not recorded", { status: 400 });
  const callbackUrl = new URL("/callback", request.url).href;
  const accessToken = await exchangeGitHubCode(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, code, callbackUrl);
  const user = await getAuthenticatedUser(accessToken);
  const props: GitHubAuthProps = {
    userId: user.login,
    login: user.login,
    name: user.name,
    email: user.email,
    accessToken,
    origin: new URL(request.url).origin,
  };
  const grantedScopes = pending.oauthRequest.scope.length === 0
    ? [EXECUTION_SCOPE]
    : pending.oauthRequest.scope.filter((scope) => scope === EXECUTION_SCOPE);
  if (!grantedScopes.includes(EXECUTION_SCOPE)) return new Response("Required DoneState scope was not requested", { status: 400 });
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: pending.oauthRequest,
    userId: user.login,
    metadata: { label: user.login },
    scope: grantedScopes,
    props,
  });
  await env.OAUTH_KV.delete(`oauth:pending:${stateId}`);
  const headers = new Headers({ Location: redirectTo });
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE));
  headers.append("Set-Cookie", clearCookie(CSRF_COOKIE));
  return new Response(null, { status: 302, headers });
}

function home(): Response {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoneState MCP</title></head><body><main><h1>DoneState MCP</h1><p>Governed autonomous coding for ChatGPT. Connect an MCP client at <code>/mcp</code>.</p><p>DoneState completes authorised work. Independent verifiers such as OpsTruth prove it.</p></main></body></html>`);
}

export const authHandler = {
  async fetch(request: Request, env: AuthEnv, _ctx?: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/authorize" && request.method === "GET") return consent(request, env);
      if (url.pathname === "/authorize" && request.method === "POST") return approve(request, env);
      if (url.pathname === "/callback" && request.method === "GET") return callback(request, env);
      if (url.pathname === "/settings/openai") return credentialSettingsHandler.fetch(request, env);
      if (url.pathname === "/" && request.method === "GET") return home();
      return new Response("Not found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown authorization error";
      console.error(JSON.stringify({ message: "authorization request failed", error: message }));
      return new Response("Authorization failed", { status: 500 });
    }
  },
};
