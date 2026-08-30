import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { digest } from "./canonical";
import { credentialSettingsHandler } from "./credential-settings";
import { githubAppSettingsHandler, githubWebhookHandler } from "./github-app-settings";
import type { DoneStateEnv } from "./environment";
import { exchangeGitHubCode, getAuthenticatedUser } from "./github";
import type { GitHubAuthProps } from "./types";

export const EXECUTION_SCOPE = "donestate:execute";

export type AuthEnv = DoneStateEnv & { OAUTH_PROVIDER: OAuthHelpers };

const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OAUTH_APPROVAL_SCHEMA = "donestate.oauth-approval.v1" as const;
const OAUTH_APPROVAL_TTL_MS = 10 * 60 * 1_000;
const OPENAI_REVIEW_USERNAME = "openai-reviewer";

interface SealedAuthorization {
  schema: typeof OAUTH_APPROVAL_SCHEMA;
  stage: "consent" | "approved";
  oauthRequest: AuthRequest;
  csrfDigest: string;
  expiresAt: number;
}
export const OAUTH_FORM_ACTION = "'self' https://github.com https://chatgpt.com";

function requiredSecret(env: AuthEnv, name: "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET"): string {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing Worker secret: ${name}`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function approvalEncryptionKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("OAuth approval encryption secret is missing");
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${OAUTH_APPROVAL_SCHEMA}\0${secret}`),
  );
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function portableAuthRequest(request: AuthRequest): AuthRequest {
  return {
    responseType: request.responseType,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    scope: [...request.scope],
    state: request.state,
    ...(request.codeChallenge ? { codeChallenge: request.codeChallenge } : {}),
    ...(request.codeChallengeMethod ? { codeChallengeMethod: request.codeChallengeMethod } : {}),
    ...(request.resource
      ? { resource: Array.isArray(request.resource) ? [...request.resource] : request.resource }
      : {}),
    ...(request.issuer ? { issuer: request.issuer } : {}),
  };
}

async function sealAuthorization(value: SealedAuthorization, env: AuthEnv): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await approvalEncryptionKey(env.COOKIE_ENCRYPTION_KEY),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function unsealAuthorization(value: string, env: AuthEnv): Promise<string> {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("unsupported sealed approval format");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(encodedIv) },
    await approvalEncryptionKey(env.COOKIE_ENCRYPTION_KEY),
    base64UrlToBytes(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function readAuthorization(
  value: string,
  expectedStage: SealedAuthorization["stage"],
  env: AuthEnv,
): Promise<SealedAuthorization | null> {
  if (!value || value.length > 10_000) return null;
  try {
    const parsed = JSON.parse(await unsealAuthorization(value, env)) as Partial<SealedAuthorization>;
    if (
      parsed.schema !== OAUTH_APPROVAL_SCHEMA
      || parsed.stage !== expectedStage
      || !parsed.oauthRequest
      || typeof parsed.oauthRequest !== "object"
      || typeof parsed.csrfDigest !== "string"
      || typeof parsed.expiresAt !== "number"
      || parsed.expiresAt <= Date.now()
    ) return null;
    return parsed as SealedAuthorization;
  } catch {
    return null;
  }
}

function html(body: string, status = 200, formAction = "'self'"): Response {
  const headers = new Headers({
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  return new Response(body, { status, headers });
}

async function consent(request: Request, env: AuthEnv): Promise<Response> {
  const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  if (!oauthRequest.clientId) return new Response("Invalid client", { status: 400 });
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) return new Response("Unknown client", { status: 400 });
  const csrf = crypto.randomUUID();
  const approvalState = await sealAuthorization({
    schema: OAUTH_APPROVAL_SCHEMA,
    stage: "consent",
    oauthRequest: portableAuthRequest(oauthRequest),
    csrfDigest: await digest(csrf),
    expiresAt: Date.now() + OAUTH_APPROVAL_TTL_MS,
  }, env);
  const clientName = escapeHtml(client.clientName || "ChatGPT");
  const scopes = escapeHtml(oauthRequest.scope.join(", ") || EXECUTION_SCOPE);
  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorise DoneState</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;color:#15171a;margin:0}.card{max-width:620px;margin:8vh auto;background:white;padding:32px;border:1px solid #dfe3e8;border-radius:14px;box-shadow:0 10px 32px #0001}h1{margin-top:0}.scope{background:#f3f5f7;padding:12px;border-radius:8px}li{margin:.6rem 0}.actions{display:flex;gap:12px;margin-top:24px}button,a,input{font:inherit;padding:11px 18px;border-radius:8px;text-decoration:none}.approve{border:0;background:#15171a;color:white}.cancel{border:1px solid #ccd1d7;color:#15171a}.reviewer{margin-top:24px;padding-top:20px;border-top:1px solid #dfe3e8}.reviewer label{display:block;margin:12px 0}.reviewer input{display:block;width:100%;box-sizing:border-box;margin-top:6px;border:1px solid #aeb6c0}.hint{font-size:.9rem;color:#4b5563}</style></head>
<body><main class="card"><h1>Authorise DoneState</h1><p><strong>${clientName}</strong> is requesting access to your DoneState execution plane.</p>
<p class="scope"><strong>Client scopes:</strong> ${scopes}</p>
<p>GitHub will ask for repository access. DoneState will still require an explicit authority envelope for every objective. It cannot silently push or open a pull request.</p>
<ul><li>Use your separately connected OpenAI API key for your runs</li><li>Run a coding agent in an isolated sandbox</li><li>Validate and commit bounded repository changes</li><li>Push or open a pull request only when granted</li><li>Stop before claiming completion until an independent verifier signs the exact snapshot</li></ul>
<form method="post" action="/authorize"><input type="hidden" name="approval_state" value="${escapeHtml(approvalState)}"><input type="hidden" name="csrf" value="${csrf}"><div class="actions"><a class="cancel" href="/">Cancel</a><button class="approve" type="submit">Continue with GitHub</button></div></form>
<p class="hint">Cloud Browser users: if GitHub asks you to confirm access, use your password or authenticator app. Passkeys are not supported in Cloud Browser.</p>
<details class="reviewer"><summary>OpenAI reviewer test account</summary><p>For OpenAI review only. This account can inspect the sample repository and existing evidence but cannot create credentials, change repository selection, start work, open pull requests, merge, deploy, release, or submit verification.</p>
<form method="post" action="/authorize/reviewer"><input type="hidden" name="approval_state" value="${escapeHtml(approvalState)}"><input type="hidden" name="csrf" value="${csrf}">
<label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<button class="approve" type="submit">Sign in to review</button></form></details></main></body></html>`, 200, OAUTH_FORM_ACTION);
}

async function approve(request: Request, env: AuthEnv): Promise<Response> {
  const form = await request.formData();
  const approvalState = form.get("approval_state");
  const csrf = form.get("csrf");
  if (typeof approvalState !== "string" || typeof csrf !== "string") return new Response("Invalid approval", { status: 400 });
  const pending = await readAuthorization(approvalState, "consent", env);
  if (!pending) return new Response("Expired approval", { status: 400 });
  if (!await constantTimeEqual(pending.csrfDigest, await digest(csrf))) {
    return new Response("CSRF validation failed", { status: 400 });
  }
  const callback = new URL("/callback", request.url).href;
  const upstream = new URL("https://github.com/login/oauth/authorize");
  upstream.searchParams.set("client_id", requiredSecret(env, "GITHUB_CLIENT_ID"));
  upstream.searchParams.set("redirect_uri", callback);
  upstream.searchParams.set("scope", "public_repo read:user");
  upstream.searchParams.set("state", await sealAuthorization({ ...pending, stage: "approved" }, env));
  return Response.redirect(upstream.href, 302);
}

async function reviewerApprove(request: Request, env: AuthEnv): Promise<Response> {
  const form = await request.formData();
  const approvalState = form.get("approval_state");
  const csrf = form.get("csrf");
  const username = form.get("username");
  const password = form.get("password");
  if (
    typeof approvalState !== "string"
    || typeof csrf !== "string"
    || typeof username !== "string"
    || typeof password !== "string"
    || username.length > 100
    || password.length > 200
  ) return new Response("Invalid reviewer sign-in", { status: 400 });
  const pending = await readAuthorization(approvalState, "consent", env);
  if (!pending) return new Response("Expired approval", { status: 400 });
  if (!await constantTimeEqual(pending.csrfDigest, await digest(csrf))) {
    return new Response("CSRF validation failed", { status: 400 });
  }
  const expectedDigest = env.OPENAI_REVIEW_PASSWORD_SHA256;
  const owner = env.PLATFORM_OWNER_LOGIN;
  const validPassword = typeof expectedDigest === "string"
    && /^[a-f0-9]{64}$/.test(expectedDigest)
    && await constantTimeEqual(expectedDigest, await digest(password));
  if (username !== OPENAI_REVIEW_USERNAME || !validPassword || !owner) {
    return new Response("Reviewer sign-in failed", { status: 401 });
  }
  const grantedScopes = pending.oauthRequest.scope.length === 0
    ? [EXECUTION_SCOPE]
    : pending.oauthRequest.scope.filter((scope) => scope === EXECUTION_SCOPE);
  if (!grantedScopes.includes(EXECUTION_SCOPE)) {
    return new Response("Required DoneState scope was not requested", { status: 400 });
  }
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: pending.oauthRequest,
    userId: owner,
    metadata: { label: "OpenAI reviewer" },
    scope: grantedScopes,
    props: {
      userId: owner,
      login: owner,
      name: "OpenAI Reviewer",
      email: null,
      accessToken: "github-app-reviewer-read-only",
      origin: new URL(request.url).origin,
      reviewMode: true,
    } satisfies GitHubAuthProps,
  });
  return Response.redirect(redirectTo, 302);
}

async function callback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const stateId = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateId || !code) return new Response("Invalid OAuth callback", { status: 400 });
  const pending = await readAuthorization(stateId, "approved", env);
  if (!pending) return new Response("Expired OAuth callback", { status: 400 });
  const callbackUrl = new URL("/callback", request.url).href;
  const accessToken = await exchangeGitHubCode(
    requiredSecret(env, "GITHUB_CLIENT_ID"),
    requiredSecret(env, "GITHUB_CLIENT_SECRET"),
    code,
    callbackUrl,
  );
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
  return Response.redirect(redirectTo, 302);
}

function home(): Response {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoneState MCP</title></head><body><main><h1>DoneState MCP</h1><p>Governed autonomous coding for ChatGPT. Connect an MCP client at <code>/mcp</code>.</p><p>DoneState completes authorised work. Independent verifiers such as OpsTruth prove it.</p></main></body></html>`);
}

export const authHandler = {
  async fetch(request: Request, env: AuthEnv, _ctx?: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === OPENAI_APPS_CHALLENGE_PATH && request.method === "GET") {
        const token = env.OPENAI_APPS_CHALLENGE?.trim();
        if (!token) return new Response("Not found", { status: 404 });
        return new Response(token, {
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (url.pathname === "/authorize" && request.method === "GET") return await consent(request, env);
      if (url.pathname === "/authorize" && request.method === "POST") return await approve(request, env);
      if (url.pathname === "/authorize/reviewer" && request.method === "POST") return await reviewerApprove(request, env);
      if (url.pathname === "/callback" && request.method === "GET") return await callback(request, env);
      if (url.pathname === "/settings/openai") return await credentialSettingsHandler.fetch(request, env);
      if (url.pathname === "/settings/github-app" || url.pathname === "/settings/github-app/callback") {
        return await githubAppSettingsHandler.fetch(request, env);
      }
      if (url.pathname === "/webhooks/github") return await githubWebhookHandler.fetch(request, env);
      if (url.pathname === "/" && request.method === "GET") return home();
      return new Response("Not found", { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown authorization error";
      console.error(JSON.stringify({ message: "authorization request failed", error: message }));
      return new Response("Authorization failed", { status: 500 });
    }
  },
};
