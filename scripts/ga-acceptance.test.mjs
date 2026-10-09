import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { ORIGIN, RESOURCE, SCOPE, consentSession, validateCallback, discover, exerciseGrant, registerClient } from "./ga-oauth.mjs";
import { hasHourlyCron, maintenanceEvidence, observeNaturalSweep, providerClient, storedMaintenanceEvidence } from "./ga-production.mjs";

function callback(redirect, state, extra = {}) {
  const url = new URL(redirect);
  for (const [key, value] of Object.entries({ state, iss: ORIGIN, code: "fixture-code-never-published", ...extra })) url.searchParams.set(key, value);
  return url;
}

test("callback rejects a different state, issuer, target or duplicated code", () => {
  const redirect = "http://127.0.0.1:12345/callback";
  assert.throws(() => validateCallback(callback(redirect, "wrong"), redirect, "expected"), /CALLBACK_STATE_MISMATCH/);
  assert.throws(() => validateCallback(callback(redirect, "expected", { iss: "https://untrusted.example" }), redirect, "expected"), /CALLBACK_ISSUER_MISMATCH/);
  assert.throws(() => validateCallback(callback("http://127.0.0.1:12345/elsewhere", "expected"), redirect, "expected"), /CALLBACK_TARGET_MISMATCH/);
  const duplicated = callback(redirect, "expected"); duplicated.searchParams.append("code", "second-secret");
  assert.throws(() => validateCallback(duplicated, redirect, "expected"), /CALLBACK_PARAMETER_COUNT/);
});

test("loopback callback is bound locally and accepts a valid response only once", async () => {
  const session = await consentSession({ timeoutMs: 2000 });
  try {
    const invalid = await fetch(callback(session.redirectUri, "wrong"));
    assert.equal(invalid.status, 400);
    const accepted = await fetch(callback(session.redirectUri, session.state));
    assert.equal(accepted.status, 200);
    assert.equal(await session.code, "fixture-code-never-published");
    assert.equal((await fetch(callback(session.redirectUri, session.state))).status, 409);
    assert.equal((await fetch(new URL("/callback", session.redirectUri), { method: "POST" })).status, 400);
    const wrongHostStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(session.redirectUri, { headers: { Host: "attacker.example" } }, (response) => { response.resume(); resolve(response.statusCode); });
      req.on("error", reject); req.end();
    });
    assert.equal(wrongHostStatus, 400);
  } finally { session.close(); }
});

test("OAuth discovery refuses an endpoint on another origin before credentials are sent", async () => {
  await assert.rejects(discover(async () => Response.json({ issuer: ORIGIN, authorization_endpoint: "https://untrusted.example/authorize" })), /ENDPOINT_MISMATCH/);
});

test("ambiguous client registration is never automatically retried", async () => {
  let calls = 0;
  await assert.rejects(registerClient("http://127.0.0.1:12345/callback", async () => { calls++; throw new Error("private transport detail"); }), /REQUEST_EFFECT_UNCONFIRMED_NO_RETRY/);
  assert.equal(calls, 1);
});

function grantFixture({ failInitialize = false, ambiguousExchange = false, incompleteRefresh = false } = {}) {
  const calls = [];
  let revoked = false;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url === `${ORIGIN}/oauth/token`) {
      const form = new URLSearchParams(options.body);
      if (form.has("token")) { revoked = true; return new Response(null, { status: 200 }); }
      if (ambiguousExchange && form.get("grant_type") === "authorization_code") throw new Error("private-provider-token");
      if (incompleteRefresh && form.get("grant_type") === "refresh_token") return Response.json({ token_type: "bearer", scope: SCOPE, resource: RESOURCE });
      const suffix = form.get("grant_type") === "refresh_token" ? "-refreshed" : "";
      return Response.json({ access_token: `fixture-access-secret${suffix}`, refresh_token: `fixture-refresh-secret${suffix}`, token_type: "bearer", scope: SCOPE, resource: RESOURCE });
    }
    assert.equal(url, RESOURCE);
    if (revoked) return new Response("Invalid access token", { status: 401 });
    const rpc = JSON.parse(options.body);
    if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result;
    if (rpc.method === "initialize") {
      if (failInitialize) return new Response("private-response-secret", { status: 503 });
      result = { serverInfo: { name: "DoneState", version: "fixture" }, protocolVersion: "2025-11-25" };
    } else if (rpc.method === "tools/list") result = { tools: [{ name: "get_openai_credential_status", annotations: { readOnlyHint: true } }] };
    else {
      assert.deepEqual(rpc.params, { name: "get_openai_credential_status", arguments: {} });
      result = { content: [{ type: "text", text: JSON.stringify({ connected: false, billingOwner: "authenticated_user", fingerprint: null }) }] };
    }
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  };
  return { calls, fetcher };
}

const grantInput = { clientId: "new-fixture-client", code: "fixture-code-secret", verifier: "fixture-pkce-secret", redirectUri: "http://127.0.0.1:12345/callback" };

test("fresh grant checks authenticated read-only MCP, refresh and revoke without publishing secrets", async () => {
  const fixture = grantFixture();
  const result = await exerciseGrant(grantInput, fixture.fetcher);
  assert.equal(result.passed, true);
  assert.equal(result.cleanup.accessDeniedAfterRevocation, true);
  assert.equal(fixture.calls.filter((call) => call.url.endsWith("/oauth/token") && new URLSearchParams(call.options.body).has("token")).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /fixture-.*secret|fixture-code|fixture-pkce/);
});

test("MCP failure still revokes the new grant once and excludes private response bodies", async () => {
  const fixture = grantFixture({ failInitialize: true });
  const result = await exerciseGrant(grantInput, fixture.fetcher);
  assert.equal(result.passed, false);
  assert.equal(result.failure, "MCP_HTTP_FAILED");
  assert.equal(result.cleanup.grantRevocationConfirmed, true);
  assert.doesNotMatch(JSON.stringify(result), /private-response-secret|fixture-access-secret/);
});

test("ambiguous token exchange is reported without another exchange or invented cleanup proof", async () => {
  const fixture = grantFixture({ ambiguousExchange: true });
  const result = await exerciseGrant(grantInput, fixture.fetcher);
  assert.equal(result.failure, "REQUEST_EFFECT_UNCONFIRMED_NO_RETRY");
  assert.equal(result.cleanup.grantRevocationConfirmed, false);
  assert.equal(fixture.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-provider-token/);
});

test("incomplete refresh response preserves the previous refresh token for scoped cleanup", async () => {
  const fixture = grantFixture({ incompleteRefresh: true });
  const result = await exerciseGrant(grantInput, fixture.fetcher);
  assert.equal(result.passed, false);
  assert.equal(result.failure, "TOKEN_RESPONSE_INCOMPLETE");
  assert.equal(result.cleanup.grantRevocationConfirmed, true);
  const revocation = fixture.calls.find((call) => new URLSearchParams(call.options.body).has("token"));
  assert.equal(new URLSearchParams(revocation.options.body).get("token"), "fixture-refresh-secret");
});

function healthyEvent() {
  return { event: { cron: "0 * * * *", scheduledTime: Date.now(), privateAccount: "private-account" }, outcome: "ok", scriptVersion: { id: "worker-version" }, logs: [{ message: [JSON.stringify({ message: "maintenance sweep completed", selectedRepositories: ["private/repository"], marketplaceWebhook: { schema: "donestate.marketplace-webhook-health.v1", unresolvedRecent: 0, unresolvedConfiguration: 0, unresolvedProcessing: 0, escalationRequired: false, secret: "private-secret" } })] }] };
}

test("only a natural cron health event can produce an operational receipt; private fields are discarded", () => {
  const event = healthyEvent();
  const result = maintenanceEvidence(event);
  assert.equal(result.healthy, true);
  assert.doesNotMatch(JSON.stringify(result), /private-account|private\/repository|private-secret|selectedRepositories/);
  delete event.event.cron;
  assert.equal(maintenanceEvidence(event), null);
});

test("unresolved failures prevent a healthy operational result", () => {
  const event = healthyEvent();
  const log = JSON.parse(event.logs[0].message[0]);
  Object.assign(log.marketplaceWebhook, { unresolvedRecent: 1, unresolvedProcessing: 1, escalationRequired: true });
  event.logs[0].message[0] = JSON.stringify(log);
  assert.equal(maintenanceEvidence(event).healthy, false);
});

test("provider lane permits only deployment/schedule reads and ephemeral tail lifecycle", async () => {
  let sent = 0;
  const provider = providerClient({ accountId: "a".repeat(32), token: "private-api-token" }, async () => { sent++; return Response.json({ success: true, result: [] }); });
  await assert.rejects(provider("/schedules", "PUT"), /PROVIDER_OPERATION_NOT_ALLOWED/);
  await assert.rejects(provider("/secrets"), /PROVIDER_PATH_NOT_ALLOWED/);
  await assert.rejects(provider("/telemetry-query", "POST", { dry: false, parameters: {} }), /TELEMETRY_QUERY_NOT_SCOPED/);
  await provider("/schedules");
  assert.equal(sent, 1);
});

test("provider schedule wrapper is recognised without accepting a missing or different cron", () => {
  assert.equal(hasHourlyCron({ schedules: [{ cron: "0 * * * *" }] }), true);
  assert.equal(hasHourlyCron([{ cron: "0 * * * *" }]), true);
  assert.equal(hasHourlyCron({ schedules: [{ cron: "*/5 * * * *" }] }), false);
  assert.equal(hasHourlyCron({}), false);
});

test("stored logs require the exact service, dataset and scheduled trigger and retain only aggregate health", () => {
  const event = healthyEvent();
  const log = { dataset: "cloudflare-workers", $metadata: { service: "donestate-mcp" }, $workers: { eventType: "scheduled", ...event }, source: event.logs[0].message[0] };
  const observed = storedMaintenanceEvidence(log);
  assert.equal(observed.healthy, true);
  assert.doesNotMatch(JSON.stringify(observed), /private-account|private-secret|private\/repository/);
  log.$workers.eventType = "fetch";
  assert.equal(storedMaintenanceEvidence(log), null);
  log.$workers.eventType = "scheduled"; log.$metadata.service = "another-service";
  assert.equal(storedMaintenanceEvidence(log), null);
});

test("natural observation checks deployment stability and removes its ephemeral tail", async () => {
  const calls = [];
  const provider = async (path, method = "GET") => {
    calls.push([path, method]);
    if (path === "/deployments") return { deployments: [{ id: "deployment", created_on: "2026-10-09T00:00:00Z", versions: [{ version_id: "worker-version", percentage: 100 }] }] };
    if (path === "/schedules") return [{ cron: "0 * * * *" }];
    if (path === "/telemetry-query") return { events: { events: [] } };
    if (path === "/tails") return { id: "tail-fixture", url: "wss://tail.developers.workers.dev/?private-ticket" };
    if (path === "/tails/tail-fixture" && method === "DELETE") return null;
    assert.fail("Unexpected provider operation");
  };
  class Socket extends EventTarget {
    readyState = 1;
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    ping() {}
    send() { setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(healthyEvent()) })), 0); }
    close() {}
  }
  const result = await observeNaturalSweep(provider, 1000, Socket);
  assert.equal(result.passed, true);
  assert.equal(result.tailSessionRemoved, true);
  assert.deepEqual(calls.at(-2), ["/tails/tail-fixture", "DELETE"]);
  assert.doesNotMatch(JSON.stringify(result), /private-ticket|private-secret/);
});
