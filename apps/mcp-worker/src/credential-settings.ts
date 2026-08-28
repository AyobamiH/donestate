import { digest } from "./canonical";
import type { CredentialStatus } from "./credential-vault";
import type { DoneStateEnv } from "./environment";
import { verifyOpenAIApiKey } from "./openai";

interface SetupTicket {
  login: string;
  origin: string;
}

interface SetupSession extends SetupTicket {
  csrfDigest: string;
}

const TICKET_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 15 * 60;
const SESSION_COOKIE = "__Host-DONESTATE_CREDENTIAL";

type CredentialSettingsEnv = Pick<DoneStateEnv, "CREDENTIAL_VAULT" | "OAUTH_KV">;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function sessionCookie(value: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=${maxAge}`;
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
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  cookies.forEach((value) => headers.append("Set-Cookie", value));
  return new Response(body, { status, headers });
}

function page(login: string, csrf: string, status: CredentialStatus, message?: string): Response {
  const state = status.connected
    ? `Connected credential <code>${escapeHtml(status.fingerprint ?? "unknown")}</code>. Submitting replaces it.`
    : "No OpenAI credential is connected.";
  const notice = message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : "";
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect OpenAI to DoneState</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#15171a;margin:0}.card{max-width:620px;margin:8vh auto;background:#fff;padding:32px;border:1px solid #dfe3e8;border-radius:14px;box-shadow:0 10px 32px #0001}h1{margin-top:0}label{display:block;font-weight:650;margin:24px 0 8px}input{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #aeb6c0;border-radius:8px}button{font:inherit;border:0;background:#15171a;color:#fff;padding:11px 18px;border-radius:8px;margin-top:18px}.muted{color:#59636e}.error{padding:12px;border-radius:8px;background:#fff0f0;color:#8b1e1e}code{font-family:ui-monospace,monospace}</style></head>
<body><main class="card"><h1>Connect your OpenAI API key</h1><p>Signed in to DoneState as <strong>${escapeHtml(login)}</strong>.</p><p>${state}</p>${notice}
<p class="muted">The key goes directly to DoneState over HTTPS. It is encrypted at rest, never returned to ChatGPT and used only for your isolated autonomous runs. OpenAI charges usage to your API account.</p>
<form method="post" action="/settings/openai"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><label for="api_key">OpenAI API key</label><input id="api_key" name="api_key" type="password" required minlength="20" maxlength="512" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="submit">Verify and connect</button></form></main></body></html>`);
}

function success(login: string, status: CredentialStatus): Response {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenAI connected</title></head><body><main><h1>OpenAI connected</h1><p>The execution credential for <strong>${escapeHtml(login)}</strong> is encrypted and ready.</p><p>Credential fingerprint: <code>${escapeHtml(status.fingerprint ?? "unknown")}</code>.</p><p>You can close this tab and return to ChatGPT.</p></main></body></html>`, 200, [sessionCookie("", 0)]);
}

function parseTicket(value: string | null): SetupTicket | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const login = Reflect.get(parsed, "login");
    const origin = Reflect.get(parsed, "origin");
    if (typeof login !== "string" || !login || typeof origin !== "string" || !origin) return null;
    return { login, origin };
  } catch {
    return null;
  }
}

function parseSession(value: string | null): SetupSession | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const login = Reflect.get(parsed, "login");
    const origin = Reflect.get(parsed, "origin");
    const csrfDigest = Reflect.get(parsed, "csrfDigest");
    if (
      typeof login !== "string" || !login
      || typeof origin !== "string" || !origin
      || typeof csrfDigest !== "string" || !csrfDigest
    ) return null;
    return { login, origin, csrfDigest };
  } catch {
    return null;
  }
}

function vault(env: CredentialSettingsEnv, login: string) {
  return env.CREDENTIAL_VAULT.getByName(login);
}

export async function createCredentialSetup(
  env: CredentialSettingsEnv,
  login: string,
  origin: string,
): Promise<{ setupUrl: string; expiresAt: string; status: CredentialStatus }> {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || (parsedOrigin.protocol !== "https:" && parsedOrigin.hostname !== "localhost")) {
    throw new Error("Reconnect DoneState from its production HTTPS origin before setting up execution");
  }
  const ticket = randomToken();
  const ticketDigest = await digest(ticket);
  const expiresAtMs = Date.now() + TICKET_TTL_SECONDS * 1_000;
  const userVault = vault(env, login);
  await userVault.status(login);
  await userVault.registerSetupTicket(login, ticketDigest, origin, expiresAtMs);
  await env.OAUTH_KV.put(
    `credential:ticket:${ticketDigest}`,
    JSON.stringify({ login, origin } satisfies SetupTicket),
    { expirationTtl: TICKET_TTL_SECONDS },
  );
  const setupUrl = new URL("/settings/openai", origin);
  setupUrl.searchParams.set("ticket", ticket);
  return {
    setupUrl: setupUrl.href,
    expiresAt: new Date(expiresAtMs).toISOString(),
    status: await userVault.status(login),
  };
}

async function beginSetup(request: Request, env: CredentialSettingsEnv): Promise<Response> {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket || ticket.length > 128) return html("<h1>Setup link is invalid or expired</h1>", 400);
  const ticketDigest = await digest(ticket);
  const ticketKey = `credential:ticket:${ticketDigest}`;
  const pending = parseTicket(await env.OAUTH_KV.get(ticketKey));
  const accepted = pending
    ? await vault(env, pending.login).consumeSetupTicket(pending.login, ticketDigest, url.origin)
    : false;
  await env.OAUTH_KV.delete(ticketKey);
  if (!pending || pending.origin !== url.origin || !accepted) {
    return html("<h1>Setup link is invalid or expired</h1>", 400);
  }
  const session = randomToken();
  const csrf = randomToken();
  await env.OAUTH_KV.put(
    `credential:session:${await digest(session)}`,
    JSON.stringify({ ...pending, csrfDigest: await digest(csrf) } satisfies SetupSession),
    { expirationTtl: SESSION_TTL_SECONDS },
  );
  const response = page(pending.login, csrf, await vault(env, pending.login).status(pending.login));
  response.headers.append("Set-Cookie", sessionCookie(session));
  return response;
}

async function finishSetup(request: Request, env: CredentialSettingsEnv): Promise<Response> {
  const length = Number.parseInt(request.headers.get("Content-Length") ?? "", 10);
  if (!Number.isSafeInteger(length) || length < 1 || length > 8_192) return html("<h1>Invalid setup request</h1>", 400);
  const session = cookie(request, SESSION_COOKIE);
  if (!session || session.length > 128) return html("<h1>Setup session expired</h1>", 401);
  const sessionKey = `credential:session:${await digest(session)}`;
  const pending = parseSession(await env.OAUTH_KV.get(sessionKey));
  const origin = new URL(request.url).origin;
  if (!pending || typeof pending.csrfDigest !== "string" || pending.origin !== origin) {
    return html("<h1>Setup session expired</h1>", 401, [sessionCookie("", 0)]);
  }
  const form = await request.formData();
  const csrf = form.get("csrf");
  const apiKey = form.get("api_key");
  if (typeof csrf !== "string" || !await constantTimeEqual(await digest(csrf), pending.csrfDigest)) {
    return html("<h1>Setup request could not be verified</h1>", 400);
  }
  if (typeof apiKey !== "string") return page(pending.login, csrf, await vault(env, pending.login).status(pending.login), "Enter an OpenAI API key");
  try {
    const verifiedKey = await verifyOpenAIApiKey(apiKey);
    const status = await vault(env, pending.login).storeCredential(pending.login, verifiedKey);
    await env.OAUTH_KV.delete(sessionKey);
    return success(pending.login, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The key could not be connected";
    return page(pending.login, csrf, await vault(env, pending.login).status(pending.login), message);
  }
}

export const credentialSettingsHandler = {
  async fetch(request: Request, env: CredentialSettingsEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/settings/openai") return new Response("Not found", { status: 404 });
    if (request.method === "GET") return beginSetup(request, env);
    if (request.method === "POST") return finishSetup(request, env);
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  },
};
