import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ORIGIN = "https://donestate.proofandstate.com";
export const RESOURCE = `${ORIGIN}/mcp`;
export const SCOPE = "donestate:execute";
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(code); };
const check = (condition, code) => { if (!condition) fail(code); };
const safeFailure = (error) => /^[A-Z][A-Z0-9_]+$/.test(error?.message ?? "") ? error.message : "UNEXPECTED_FAILURE_REDACTED";

export async function request(url, options = {}, fetcher = fetch) {
  check(new URL(url).origin === ORIGIN, "UNTRUSTED_ENDPOINT");
  try {
    return await fetcher(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  } catch { fail("REQUEST_EFFECT_UNCONFIRMED_NO_RETRY"); }
}

async function json(response, code) {
  check(response.ok, code);
  try { return await response.json(); } catch { fail("INVALID_JSON_RESPONSE"); }
}

export async function discover(fetcher = fetch) {
  const metadata = await json(await request(`${ORIGIN}/.well-known/oauth-authorization-server`, {}, fetcher), "DISCOVERY_HTTP_FAILED");
  check(metadata.issuer === ORIGIN, "ISSUER_MISMATCH");
  for (const [key, path] of Object.entries({ authorization_endpoint: "/authorize", token_endpoint: "/oauth/token", registration_endpoint: "/oauth/register", revocation_endpoint: "/oauth/token" })) {
    check(metadata[key] === `${ORIGIN}${path}`, "ENDPOINT_MISMATCH");
  }
  check(metadata.code_challenge_methods_supported?.includes("S256"), "S256_UNAVAILABLE");
  check(metadata.token_endpoint_auth_methods_supported?.includes("none"), "PUBLIC_CLIENT_UNAVAILABLE");
  check(metadata.authorization_response_iss_parameter_supported === true, "CALLBACK_ISSUER_UNAVAILABLE");
  const resource = await json(await request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`, {}, fetcher), "RESOURCE_DISCOVERY_HTTP_FAILED");
  check(resource.resource === RESOURCE && resource.authorization_servers?.length === 1 && resource.authorization_servers[0] === ORIGIN, "RESOURCE_MISMATCH");
  check(resource.scopes_supported?.includes(SCOPE), "EXECUTION_SCOPE_UNAVAILABLE");
  return metadata;
}

export function validateCallback(url, redirectUri, state) {
  check(url.origin + url.pathname === redirectUri, "CALLBACK_TARGET_MISMATCH");
  for (const key of ["state", "code", "iss"]) check(url.searchParams.getAll(key).length === 1, "CALLBACK_PARAMETER_COUNT");
  const received = Buffer.from(url.searchParams.get("state"));
  const expected = Buffer.from(state);
  check(received.length === expected.length && timingSafeEqual(received, expected), "CALLBACK_STATE_MISMATCH");
  check(url.searchParams.get("iss") === ORIGIN, "CALLBACK_ISSUER_MISMATCH");
  const code = url.searchParams.get("code");
  check(code.length > 0 && code.length <= 4096 && !url.searchParams.has("error"), "CALLBACK_DENIED");
  return code;
}

export async function consentSession({ timeoutMs = 15 * 60_000 } = {}) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let redirectUri, authorizationUrl, consumed = false;
  let resolveCode, rejectCode;
  const code = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // Attach a handler immediately: a timeout before registration must not create an unhandled rejection.
  code.catch(() => {});
  const reply = (res, status, body, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(body);
  };
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.headers.host !== new URL(redirectUri).host) return reply(res, 400, "Invalid local callback request.");
    const url = new URL(req.url, redirectUri);
    if (url.pathname === "/" && authorizationUrl) {
      const href = authorizationUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      return reply(res, 200, `<!doctype html><html lang="en"><meta charset="utf-8"><title>DoneState OAuth acceptance</title><h1>Fresh DoneState OAuth connection</h1><p>Use the customer GitHub account. This test checks login, read-only MCP access and token refresh, then revokes its own new grant. No OpenAI key or coding run is needed.</p><p><a href="${href}">Continue to DoneState and GitHub consent</a></p><p>Keep the terminal open. Do not copy codes or tokens into chat.</p></html>`, "text/html; charset=utf-8");
    }
    if (url.pathname !== "/callback") return reply(res, 404, "Not found.");
    if (consumed) return reply(res, 409, "This callback was already consumed.");
    try {
      const value = validateCallback(url, redirectUri, state);
      consumed = true;
      clearTimeout(timer);
      reply(res, 200, "GitHub consent received. Return to the terminal for the acceptance result and cleanup status.");
      resolveCode(value);
    } catch { reply(res, 400, "Callback rejected. Return to the original consent tab; do not copy its URL into chat."); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
  const timer = setTimeout(() => { rejectCode(new Error("CONSENT_TIMEOUT")); server.close(); }, timeoutMs);
  return {
    state, verifier, challenge, redirectUri, code,
    setAuthorizationUrl(value) { check(new URL(value).origin === ORIGIN, "UNTRUSTED_AUTHORIZATION_URL"); authorizationUrl = value; },
    close() { clearTimeout(timer); server.close(); server.closeAllConnections(); },
  };
}

export async function registerClient(redirectUri, fetcher = fetch) {
  const response = await request(`${ORIGIN}/oauth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "DoneState fresh OAuth acceptance", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
  }, fetcher);
  const client = await json(response, "REGISTRATION_HTTP_FAILED");
  check(typeof client.client_id === "string" && client.client_id.length > 0 && !client.client_secret, "PUBLIC_CLIENT_REGISTRATION_INVALID");
  check(client.token_endpoint_auth_method === "none" && client.redirect_uris?.length === 1 && client.redirect_uris[0] === redirectUri, "REGISTRATION_REDIRECT_MISMATCH");
  return client.client_id;
}

async function tokenRequest(parameters, fetcher) {
  return request(`${ORIGIN}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(parameters) }, fetcher);
}

function validateTokens(tokens) {
  check(typeof tokens.access_token === "string" && tokens.access_token.length > 0 && typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0, "TOKEN_RESPONSE_INCOMPLETE");
  check(tokens.token_type?.toLowerCase() === "bearer" && tokens.scope === SCOPE && tokens.resource === RESOURCE, "TOKEN_AUTHORITY_MISMATCH");
}

export async function decodeRpc(response) {
  check(response.ok, "MCP_HTTP_FAILED");
  const body = await response.text();
  check(body.length <= 1_000_000, "MCP_RESPONSE_TOO_LARGE");
  let messages;
  try {
    messages = response.headers.get("Content-Type")?.includes("text/event-stream")
      ? body.split(/\r?\n\r?\n/).flatMap((event) => {
        const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        return data ? [JSON.parse(data)] : [];
      })
      : [JSON.parse(body)];
  } catch { fail("MCP_JSON_INVALID"); }
  const message = messages.find((item) => item.id === 1);
  check(message?.jsonrpc === "2.0" && message.result && !message.error, "MCP_RPC_FAILED");
  return message.result;
}

async function mcpReadOnly(accessToken, fetcher) {
  let sessionId;
  const call = async (method, params, notification = false) => {
    const response = await request(RESOURCE, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: 1 }), method, params }),
    }, fetcher);
    sessionId ??= response.headers.get("Mcp-Session-Id");
    if (notification) { check(response.ok, "MCP_INITIALIZED_HTTP_FAILED"); return; }
    return decodeRpc(response);
  };
  const initialized = await call("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "donestate-fresh-oauth-acceptance", version: "1" } });
  check(initialized.serverInfo?.name === "DoneState", "MCP_SERVER_IDENTITY_MISMATCH");
  await call("notifications/initialized", {} , true);
  const listed = await call("tools/list", {});
  const statusTool = listed.tools?.find((tool) => tool.name === "get_openai_credential_status");
  check(statusTool?.annotations?.readOnlyHint === true, "READ_ONLY_STATUS_TOOL_UNAVAILABLE");
  const called = await call("tools/call", { name: "get_openai_credential_status", arguments: {} });
  check(!called.isError, "READ_ONLY_STATUS_FAILED");
  let status;
  try { status = called.structuredContent ?? JSON.parse(called.content.find((item) => item.type === "text").text); } catch { fail("READ_ONLY_STATUS_INVALID"); }
  check(status.connected === false && status.fingerprint === null && status.billingOwner === "authenticated_user", "CUSTOMER_CREDENTIAL_NOT_ABSENT");
  return { server: initialized.serverInfo.name, credentialAbsent: true, readOnlyTool: statusTool.name };
}

export async function exerciseGrant({ clientId, code, verifier, redirectUri }, fetcher = fetch) {
  const evidence = { authorizationCodeExchanged: false, mcpReadOnly: false, tokenRefreshed: false, refreshMcpReadOnly: false, cleanup: { grantRevocationConfirmed: false, accessDeniedAfterRevocation: false } };
  let tokens, currentAccess, cleanupRefresh;
  try {
    tokens = await json(await tokenRequest({ client_id: clientId, grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE }, fetcher), "CODE_EXCHANGE_HTTP_FAILED");
    // Retain returned token material for cleanup even when validation fails.
    currentAccess = tokens.access_token;
    cleanupRefresh = tokens.refresh_token;
    validateTokens(tokens);
    evidence.authorizationCodeExchanged = true;
    evidence.readOnly = await mcpReadOnly(tokens.access_token, fetcher);
    evidence.mcpReadOnly = true;
    const refreshed = await json(await tokenRequest({ client_id: clientId, grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource: RESOURCE }, fetcher), "REFRESH_HTTP_FAILED");
    tokens = refreshed;
    if (typeof tokens.access_token === "string") currentAccess = tokens.access_token;
    if (typeof tokens.refresh_token === "string") cleanupRefresh = tokens.refresh_token;
    validateTokens(tokens);
    evidence.tokenRefreshed = true;
    await mcpReadOnly(tokens.access_token, fetcher);
    evidence.refreshMcpReadOnly = true;
  } catch (error) {
    evidence.failure = safeFailure(error);
  } finally {
    if (typeof cleanupRefresh === "string" || typeof currentAccess === "string") {
      try {
        const hasRefresh = typeof cleanupRefresh === "string";
        const revoked = await tokenRequest({ client_id: clientId, token: hasRefresh ? cleanupRefresh : currentAccess, token_type_hint: hasRefresh ? "refresh_token" : "access_token" }, fetcher);
        check(revoked.status === 200, "REVOCATION_HTTP_FAILED");
        evidence.cleanup.grantRevocationConfirmed = hasRefresh;
        const denied = await request(RESOURCE, { method: "POST", headers: { Authorization: `Bearer ${currentAccess}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "revoked-token-check", version: "1" } } }) }, fetcher);
        evidence.cleanup.accessDeniedAfterRevocation = denied.status === 401;
        check(evidence.cleanup.accessDeniedAfterRevocation, "REVOKED_TOKEN_STILL_ACCEPTED");
      } catch (error) { evidence.cleanup.failure = safeFailure(error); }
    }
    tokens = undefined; currentAccess = undefined; cleanupRefresh = undefined;
  }
  evidence.passed = evidence.authorizationCodeExchanged && evidence.mcpReadOnly && evidence.tokenRefreshed && evidence.refreshMcpReadOnly && evidence.cleanup.grantRevocationConfirmed && evidence.cleanup.accessDeniedAfterRevocation && !evidence.failure && !evidence.cleanup.failure;
  return evidence;
}

export async function main(args = process.argv.slice(2)) {
  check(args.length === 2 && args[0] === "--receipt", "USAGE_NODE_GA_OAUTH_MJS_RECEIPT_PATH");
  const receipt = { schema: "donestate.fresh-oauth-acceptance.v1", startedAt: new Date().toISOString(), issuer: ORIGIN, resource: RESOURCE, scope: SCOPE, connection: "new_dynamically_registered_public_client", identityHistory: "Not established: fresh client consent does not establish first-ever GitHub or DoneState identity.", modelStarts: 0, credentialSetups: 0, repositoryMutations: 0, clientMetadataRetention: "Non-secret dynamic client registration metadata remains; the provider exposes no public client-delete endpoint.", passed: false };
  let session;
  try {
    await discover();
    receipt.discoveryPassed = true;
    session = await consentSession();
    const clientId = await registerClient(session.redirectUri);
    receipt.clientIdSha256 = sha256(clientId);
    const authorization = new URL(`${ORIGIN}/authorize`);
    for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: session.redirectUri, response_type: "code", scope: SCOPE, resource: RESOURCE, code_challenge: session.challenge, code_challenge_method: "S256", state: session.state })) authorization.searchParams.set(key, value);
    session.setAuthorizationUrl(authorization.href);
    console.log(`Open this local page on this computer: ${new URL("/", session.redirectUri).href}`);
    console.log("Complete DoneState consent and GitHub sign-in in your own browser. Keep codes and tokens out of chat.");
    const code = await session.code;
    receipt.callbackStateAndIssuerValidated = true;
    const result = await exerciseGrant({ clientId, code, verifier: session.verifier, redirectUri: session.redirectUri });
    Object.assign(receipt, result);
  } catch (error) { receipt.failure = safeFailure(error); }
  finally { session?.close(); }
  receipt.finishedAt = new Date().toISOString();
  await writeFile(args[1], `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => { console.error("ACCEPTANCE_RECEIPT_WRITE_FAILED_OR_INVALID_ARGUMENTS"); process.exitCode = 1; });
}
