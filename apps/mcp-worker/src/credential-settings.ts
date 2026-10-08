import { accountNextSteps, renderAccountDocument } from "./account-layout";
import { renderAccountRuns } from "./account-presentation";
import { digest } from "./canonical";
import type { DoneStateEnv } from "./environment";
import type { AccountDataSummary } from "./maintenance-registry";
import { AccountDeletionRefused, deleteIndexedAccountData, readAccountData, type AccountView } from "./account-data";
import { verifyOpenAIApiKey } from "./openai";
import type { CredentialStatus as StoredCredentialStatus } from "./credential-vault";

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

type CredentialSettingsEnv = Pick<
  DoneStateEnv,
  "CREDENTIAL_VAULT" | "MAINTENANCE_REGISTRY" | "OAUTH_KV" | "RUN_COORDINATOR"
>;

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
  const document = body.startsWith("<!doctype html>") ? body : renderAccountDocument(
    "DoneState account settings",
    `<div class="settings-intro">${body}</div>${accountNextSteps()}`,
  );
  return new Response(document, { status, headers });
}

function page(login: string, csrf: string, account: AccountView, message?: string): Response {
  const status = account.credential;
  const state = status.connected
    ? `Connected credential <code>${escapeHtml(status.fingerprint ?? "unknown")}</code>. Submitting replaces it.`
    : "No OpenAI credential is connected.";
  const notice = message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : "";
  const repositories = account.repositories.length > 0
    ? `<ul class="list">${account.repositories.map((item) => `<li><code>${escapeHtml(item.repository)}</code> — ${escapeHtml(item.mode)}</li>`).join("")}</ul>`
    : "<p class=\"muted\">No maintenance repositories are selected.</p>";
  const runs = renderAccountRuns(account.runs);
  return html(renderAccountDocument("DoneState account settings", `<div class="settings-intro"><h1>DoneState account settings</h1><p>Signed in as <strong>${escapeHtml(login)}</strong>.</p></div>${notice}<nav class="account-nav" aria-label="Account sections"><a href="#execution">Execution</a><a href="#repositories">Repositories</a><a href="#objectives">Objectives</a><a href="#deletion">Data controls</a></nav>
<section id="execution" class="settings-section"><h2>Execution credential</h2><p>${state}</p>
<p class="muted">The key goes directly to DoneState over HTTPS. It is encrypted at rest, never returned to ChatGPT or any other MCP client, and used only for your isolated autonomous runs. OpenAI charges usage to your API account.</p>
<p class="muted">Daily autonomous runs: ${status.dailyRunsUsed}/${status.dailyRunLimit}. Active run: ${escapeHtml(status.activeRunId ?? "none")}.</p>
<form method="post" action="/settings/openai"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="action" value="connect_openai"><label class="field-label" for="api_key">OpenAI API key</label><input id="api_key" name="api_key" type="password" required minlength="20" maxlength="512" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="submit">Verify and connect</button></form>
</section><section id="repositories" class="settings-section"><h2>Repository access</h2>${repositories}<p>To change your selection, ask your connected MCP client to use <code>select_maintenance_repository</code> or <code>remove_maintenance_repository</code>. <a href="https://proofandstate.com/docs/donestate/maintenance">Repository access guide</a>.</p></section>
<section id="objectives" class="settings-section"><h2>Known objectives</h2><p>Expand an objective to inspect its state and find the next step. This inventory does not start or retry work.</p>${runs}
<p class="muted">Indexed runs: ${account.summary.indexedRuns}; maintenance findings: ${account.summary.findings}. Run inventory covers objectives indexed by the account-controls release plus historical maintenance runs recoverable from findings. A direct objective created before this release may require deletion by its known run ID or a privacy request if it is not listed.</p>
</section><section id="deletion" class="settings-section danger-zone"><h2>Delete account data</h2>
<p class="muted">Deletion removes every indexed deletable objective, the stored OpenAI credential, selected-repository state, maintenance findings and user Marketplace entitlement records. Organization entitlement records keep the organization state but remove this login as authorizer. Active objectives must be cancelled first. Minimal opaque deletion-generation state remains only to fence stale in-flight writes; the global fence does not store your plaintext GitHub login.</p>
<form method="post" action="/settings/openai"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="action" value="delete_account"><label class="field-label" for="confirm_login">Type your GitHub login to confirm</label><input id="confirm_login" name="confirm_login" required autocomplete="off"><button class="danger" type="submit">Delete indexed DoneState account data</button></form>
</section>`));
}

function success(login: string, status: StoredCredentialStatus): Response {
  return html(renderAccountDocument("OpenAI connected", `<div class="settings-intro"><span class="eyebrow">Execution credential</span><h1>OpenAI connected</h1><p>The execution credential for <strong>${escapeHtml(login)}</strong> is encrypted and ready.</p></div><section class="settings-section"><h2>Connection details</h2><p>Credential fingerprint: <code>${escapeHtml(status.fingerprint ?? "unknown")}</code>.</p><p class="muted">Connecting a key does not start an objective. Execution begins only when you authorise it through your MCP client.</p></section>${accountNextSteps()}`), 200, [sessionCookie("", 0)]);
}

function deletionSuccess(login: string, receipt: Pick<AccountDataSummary, "indexedRuns" | "selectedRepositories" | "findings">): Response {
  return html(
    renderAccountDocument("DoneState account data deleted", `<div class="settings-intro"><span class="eyebrow">Account data</span><h1>DoneState account data deleted</h1><p>Indexed DoneState service data for <strong>${escapeHtml(login)}</strong> was deleted.</p></div><section class="settings-section"><h2>Deletion summary</h2><p>Deleted indexed objectives: ${receipt.indexedRuns}. Deleted selected repositories: ${receipt.selectedRepositories}. Deleted maintenance findings: ${receipt.findings}.</p><p class="muted">Your GitHub account and repositories have not been deleted.</p></section><section class="settings-section"><h2>Earlier objectives</h2><p>If you used direct DoneState objectives before the account-controls release and a historical run was not listed in the account console, delete it using its known run ID or submit a privacy request.</p></section>${accountNextSteps()}`),
    200,
    [sessionCookie("", 0)],
  );
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

function registry(env: CredentialSettingsEnv) {
  return env.MAINTENANCE_REGISTRY.getByName("global");
}

async function recordFunnelBestEffort(
  env: CredentialSettingsEnv,
  event: "credential_setup_issued" | "account_console_opened" | "credential_connected" | "account_deletion_completed",
): Promise<void> {
  try {
    await registry(env).recordFunnelEvent(event);
  } catch (error) {
    console.error(JSON.stringify({
      message: "DoneState funnel counter did not update",
      event,
      error: error instanceof Error ? error.message : "unknown error",
    }));
  }
}

async function accountPage(
  env: CredentialSettingsEnv,
  login: string,
  csrf: string,
  message?: string,
): Promise<Response> {
  return page(login, csrf, await readAccountData(env, login, false), message);
}

export async function createCredentialSetup(
  env: CredentialSettingsEnv,
  login: string,
  origin: string,
): Promise<{ setupUrl: string; expiresAt: string; status: StoredCredentialStatus }> {
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
  await recordFunnelBestEffort(env, "credential_setup_issued");
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
  await recordFunnelBestEffort(env, "account_console_opened");
  const response = await accountPage(env, pending.login, csrf);
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
  if (typeof csrf !== "string" || !await constantTimeEqual(await digest(csrf), pending.csrfDigest)) {
    return html("<h1>Setup request could not be verified</h1>", 400);
  }

  const action = form.get("action");
  if (action === "delete_account") {
    const confirmation = form.get("confirm_login");
    if (confirmation !== pending.login) {
      return accountPage(env, pending.login, csrf, "Type the exact GitHub login to confirm account-data deletion");
    }
    try {
      const { deleted: registryReceipt } = await deleteIndexedAccountData(env, pending.login);
      await recordFunnelBestEffort(env, "account_deletion_completed");
      await env.OAUTH_KV.delete(sessionKey);
      return deletionSuccess(pending.login, registryReceipt);
    } catch (error) {
      if (error instanceof AccountDeletionRefused) return accountPage(env, pending.login, csrf, error.message);
      const message = error instanceof Error ? error.message : "Account data could not be deleted";
      return accountPage(
        env,
        pending.login,
        csrf,
        `${message}. Account deletion remains locked so you can retry safely.`,
      );
    }
  }

  const apiKey = form.get("api_key");
  if (typeof apiKey !== "string") return accountPage(env, pending.login, csrf, "Enter an OpenAI API key");
  try {
    const registryAdmission = await registry(env).requireAccountWritable(pending.login);
    const vaultAdmission = await vault(env, pending.login).requireAccountWritable();
    const verifiedKey = await verifyOpenAIApiKey(apiKey);
    await registry(env).requireAccountWritable(pending.login, registryAdmission.generation);
    await vault(env, pending.login).requireAccountWritable(vaultAdmission.generation);
    const status = await vault(env, pending.login).storeCredential(
      pending.login,
      verifiedKey,
      vaultAdmission.generation,
    );
    await recordFunnelBestEffort(env, "credential_connected");
    await env.OAUTH_KV.delete(sessionKey);
    return success(pending.login, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The key could not be connected";
    return accountPage(env, pending.login, csrf, message);
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
