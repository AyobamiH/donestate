import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { discover, ORIGIN, RESOURCE, request, sha256 } from "./ga-oauth.mjs";

const check = (condition, code) => { if (!condition) throw new Error(code); };
const safeFailure = (error) => /^[A-Z][A-Z0-9_]+$/.test(error?.message ?? "") ? error.message : "UNEXPECTED_FAILURE_REDACTED";
const utc = (value) => new Date(value).toISOString();

export async function publicPreflight(fetcher = fetch) {
  const evidence = { observedAt: utc(Date.now()), issuer: ORIGIN, resource: RESOURCE, probes: [] };
  const metadata = await discover(fetcher);
  evidence.discovery = { issuer: metadata.issuer, authorizationEndpoint: metadata.authorization_endpoint, tokenEndpoint: metadata.token_endpoint, pkce: "S256", publicClient: true };
  for (const [name, path, status, options] of [
    ["landing", "/", 200, {}],
    ["execution_resource_without_token", "/mcp", 401, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "anonymous-preflight", version: "1" } } }) }],
    ["account_resource_without_token", "/mcp/account/v1", 401, {}],
    ["unknown_oauth_client", "/authorize?client_id=ga-preflight-not-registered&response_type=code", 400, {}],
    ["malformed_client_registration", "/oauth/register", 400, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }],
  ]) {
    const response = await request(`${ORIGIN}${path}`, options, fetcher);
    check(response.status === status, `PREFLIGHT_${name.toUpperCase()}_HTTP_FAILED`);
    const body = await response.text();
    const probe = { name, path, expectedStatus: status, observedStatus: response.status, bodySha256: sha256(body), observedAt: utc(Date.now()) };
    if (status === 401) {
      const challenge = response.headers.get("WWW-Authenticate");
      check(challenge?.includes(`${ORIGIN}/.well-known/oauth-protected-resource`), "PROTECTED_RESOURCE_CHALLENGE_MISSING");
      probe.canonicalChallengePresent = true;
    }
    if (name === "landing") {
      check(body.includes("/authorize") || body.includes("/mcp"), "LANDING_ONBOARDING_PATH_MISSING");
      for (const target of ["https://proofandstate.com/privacy", "https://proofandstate.com/terms", "https://github.com/AyobamiH/donestate/issues"]) {
        check(body.includes(`href="${target}"`), "LANDING_POLICY_OR_SUPPORT_LINK_MISSING");
      }
      probe.bodyPublished = true;
    }
    evidence.probes.push(probe);
  }
  evidence.passed = true;
  return evidence;
}

// Only scheduled aggregate health is eligible for publication. All HTTP request,
// exception, account, repository and unrelated log fields are discarded.
export function maintenanceEvidence(event) {
  if (event?.event?.cron !== "0 * * * *" || !Number.isFinite(event.event.scheduledTime)) return null;
  const logs = (event.logs ?? []).flatMap((entry) => (Array.isArray(entry.message) ? entry.message : []));
  let result;
  for (const message of logs) {
    if (typeof message !== "string") continue;
    try {
      const parsed = JSON.parse(message);
      if (parsed.message === "maintenance sweep completed") result = parsed;
    } catch { /* Ordinary text is not a receipt. */ }
  }
  if (!result) return null;
  const health = result.marketplaceWebhook;
  check(health?.schema === "donestate.marketplace-webhook-health.v1", "MAINTENANCE_HEALTH_SCHEMA_INVALID");
  for (const key of ["unresolvedRecent", "unresolvedConfiguration", "unresolvedProcessing"]) {
    check(Number.isSafeInteger(health[key]) && health[key] >= 0, "MAINTENANCE_HEALTH_COUNT_INVALID");
  }
  check(health.unresolvedRecent === health.unresolvedConfiguration + health.unresolvedProcessing, "MAINTENANCE_HEALTH_COUNTS_DISAGREE");
  check(typeof health.escalationRequired === "boolean" && health.escalationRequired === (health.unresolvedRecent > 0), "MAINTENANCE_ESCALATION_INVALID");
  return {
    cron: event.event.cron, scheduledAt: utc(event.event.scheduledTime), observedAt: utc(Date.now()), outcome: event.outcome,
    ...(typeof event.scriptVersion?.id === "string" ? { workerVersion: event.scriptVersion.id } : {}),
    marketplaceWebhook: { schema: health.schema, unresolvedRecent: health.unresolvedRecent, unresolvedConfiguration: health.unresolvedConfiguration, unresolvedProcessing: health.unresolvedProcessing, escalationRequired: health.escalationRequired },
    healthy: event.outcome === "ok" && health.unresolvedRecent === 0 && health.escalationRequired === false,
  };
}

export function providerClient({ accountId, token }, fetcher = fetch) {
  check(/^[a-f0-9]{32}$/.test(accountId ?? "") && typeof token === "string" && token.length > 0, "PROVIDER_READ_CAPABILITY_MISSING");
  return async (suffix, method = "GET", body) => {
    check(/^\/(deployments|schedules|telemetry-query|tails(?:\/[a-zA-Z0-9-]+)?)$/.test(suffix), "PROVIDER_PATH_NOT_ALLOWED");
    check((suffix !== "/telemetry-query" && method === "GET") || (["/tails", "/telemetry-query"].includes(suffix) && method === "POST") || (suffix.startsWith("/tails/") && method === "DELETE"), "PROVIDER_OPERATION_NOT_ALLOWED");
    if (suffix === "/telemetry-query") {
      const filters = body?.parameters?.filters;
      check(body?.dry === true && body?.view === "events" && JSON.stringify(body?.parameters?.datasets) === '["cloudflare-workers"]' && Array.isArray(filters) && filters.length === 3
        && filters.some((filter) => filter.key === "$metadata.service" && filter.operation === "eq" && filter.value === "donestate-mcp")
        && filters.some((filter) => filter.key === "$metadata.origin" && filter.operation === "eq" && filter.value === "scheduled")
        && filters.some((filter) => filter.key === "$metadata.message" && filter.operation === "includes" && filter.value === "maintenance sweep completed"), "TELEMETRY_QUERY_NOT_SCOPED");
    }
    const path = suffix === "/telemetry-query" ? "/workers/observability/telemetry/query" : `/workers/scripts/donestate-mcp${suffix}`;
    let response;
    try {
      response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(20_000) });
    } catch { throw new Error("PROVIDER_REQUEST_EFFECT_UNCONFIRMED_NO_RETRY"); }
    check(response.ok, "PROVIDER_HTTP_FAILED");
    let parsed;
    try { parsed = await response.json(); } catch { throw new Error("PROVIDER_JSON_INVALID"); }
    check(parsed.success === true, "PROVIDER_READ_FAILED");
    return parsed.result;
  };
}

export function hasHourlyCron(payload) {
  const schedules = Array.isArray(payload) ? payload : payload?.schedules;
  return Array.isArray(schedules) && schedules.some((schedule) => schedule.cron === "0 * * * *");
}

export function storedMaintenanceEvidence(log) {
  if (log?.dataset !== "cloudflare-workers" || log.$metadata?.service !== "donestate-mcp" || log.$workers?.eventType !== "scheduled") return null;
  let source = log.source;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch { source = null; }
  }
  if (source?.message !== "maintenance sweep completed") {
    try { source = JSON.parse(log.$metadata.message); } catch { return null; }
  }
  if (source?.message !== "maintenance sweep completed") return null;
  return maintenanceEvidence({ event: log.$workers.event, outcome: log.$workers.outcome, scriptVersion: log.$workers.scriptVersion, logs: [{ message: [JSON.stringify(source)] }] });
}

async function readStoredSweep(provider, deployment) {
  const to = Date.now();
  const from = Math.max(to - 75 * 60_000, new Date(deployment.createdAt).getTime());
  check(Number.isFinite(from) && from < to, "STORED_LOG_TIMEFRAME_INVALID");
  const result = await provider("/telemetry-query", "POST", {
    queryId: "donestate-ga-scheduled-health", dry: true, view: "events", limit: 20,
    timeframe: { from, to }, parameters: { datasets: ["cloudflare-workers"], filterCombination: "and", filters: [
      { key: "$metadata.service", operation: "eq", type: "string", value: "donestate-mcp" },
      { key: "$metadata.origin", operation: "eq", type: "string", value: "scheduled" },
      { key: "$metadata.message", operation: "includes", type: "string", value: "maintenance sweep completed" },
    ] },
  });
  const events = result?.events?.events;
  check(Array.isArray(events), "STORED_LOG_RESPONSE_INVALID");
  return events.map(storedMaintenanceEvidence).filter((event) => event && new Date(event.scheduledAt).getTime() >= from && new Date(event.scheduledAt).getTime() <= to
    && event.workerVersion && deployment.versions.some((version) => version.id === event.workerVersion && version.percentage > 0))
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0] ?? null;
}

function deploymentSummary(payload) {
  const deployments = Array.isArray(payload) ? payload : payload.deployments;
  check(Array.isArray(deployments) && deployments.length > 0, "DEPLOYMENT_READBACK_EMPTY");
  const latest = [...deployments].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))[0];
  check(typeof latest.id === "string" && Array.isArray(latest.versions), "DEPLOYMENT_READBACK_INVALID");
  return { id: latest.id, createdAt: latest.created_on, versions: latest.versions.map((version) => ({ id: version.version_id, percentage: version.percentage })) };
}

export async function observeNaturalSweep(provider, timeoutMs, WebSocketClass, sessionWindowMs = 20 * 60_000) {
  check(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 65 * 60_000 && Number.isFinite(sessionWindowMs) && sessionWindowMs > 0 && sessionWindowMs <= 20 * 60_000, "OBSERVATION_BUDGET_INVALID");
  const before = deploymentSummary(await provider("/deployments"));
  const schedules = await provider("/schedules");
  check(hasHourlyCron(schedules), "HOURLY_CRON_NOT_PRESENT");
  let storedLogFailure;
  try {
    const stored = await readStoredSweep(provider, before);
    if (stored) {
      const after = deploymentSummary(await provider("/deployments"));
      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      return { deploymentBefore: before, deploymentAfter: after, deploymentUnchangedDuringObservation: unchanged, eventVersionMatches: true, naturalSweep: stored, observationSource: "provider_stored_scheduled_log", tailSessionCreated: false, passed: stored.healthy && unchanged };
    }
  } catch (error) { storedLogFailure = safeFailure(error); }
  const startedMs = Date.now();
  const deadline = startedMs + timeoutMs;
  const sessions = [];
  let result, failure, cleanupFailure;
  // Provider tails have a shorter lifetime than the next hourly cron can take.
  // Rotate only our own bounded session, after confirmed deletion. Never retry
  // ambiguous creation/deletion, abnormal closure or a connection error.
  while (!result && !failure && !cleanupFailure && Date.now() < deadline && sessions.length < 4) {
    let tail;
    try {
      tail = await provider("/tails", "POST", { filters: [{ query: "maintenance sweep" }] });
      check(typeof tail.id === "string" && /^[a-zA-Z0-9-]+$/.test(tail.id), "TAIL_RESPONSE_INVALID");
    } catch (error) { failure = safeFailure(error); break; }
    const session = { number: sessions.length + 1, completion: "unconfirmed", removed: false };
    sessions.push(session);
    let socket, timer, ping;
    try {
      const wsUrl = new URL(tail.url);
      check(wsUrl.protocol === "wss:" && wsUrl.hostname.endsWith(".workers.dev"), "TAIL_ENDPOINT_UNTRUSTED");
      WebSocketClass ??= createRequire(new URL("../apps/mcp-worker/package.json", import.meta.url))("ws");
      const remainingMs = Math.max(0, deadline - Date.now());
      const observed = await new Promise((resolve, reject) => {
        socket = new WebSocketClass(tail.url, "trace-v1");
        timer = setTimeout(() => resolve({ completion: remainingMs <= sessionWindowMs ? "observation_deadline" : "bounded_rotation" }), Math.min(sessionWindowMs, remainingMs));
        socket.addEventListener("open", () => {
          try {
            socket.send(JSON.stringify({ debug: false }));
            check(typeof socket.ping === "function", "TAIL_CONTROL_PING_UNAVAILABLE");
            // Use the same WebSocket control ping as the installed Wrangler.
            ping = setInterval(() => {
              try { if (socket.readyState === 1) socket.ping(Buffer.from("wrangler tail ping")); }
              catch { reject(new Error("TAIL_CONNECTION_FAILED")); }
            }, 10_000);
            console.log("TAIL_CONNECTED_WAITING_FOR_NATURAL_HOURLY_SWEEP");
          } catch (error) { reject(error); }
        });
        socket.addEventListener("message", async ({ data }) => {
          try {
            const text = typeof data === "string" ? data
              : Buffer.isBuffer(data) || data instanceof ArrayBuffer ? Buffer.from(data).toString()
              : Buffer.from(await data.arrayBuffer()).toString();
            if (text.length > 1_000_000) return;
            const event = JSON.parse(text);
            if (event.event?.scheduledTime < startedMs || event.event?.scheduledTime > Date.now()) return;
            const sweep = maintenanceEvidence(event);
            if (sweep) resolve({ completion: "natural_sweep", sweep });
          } catch (error) { if (/^MAINTENANCE_/.test(error.message)) reject(error); }
        });
        socket.addEventListener("error", () => reject(new Error("TAIL_CONNECTION_FAILED")));
        socket.addEventListener("close", (event) => {
          if (event.code === 1000 || event.code === 1001) resolve({ completion: "provider_normal_close" });
          else reject(new Error("TAIL_CLOSED_ABNORMALLY"));
        });
      });
      session.completion = observed.completion;
      result = observed.sweep;
      if (observed.completion === "observation_deadline") failure = "NATURAL_SWEEP_NOT_OBSERVED";
    } catch (error) { failure = safeFailure(error); session.completion = "failed"; }
    finally {
      clearTimeout(timer); clearInterval(ping);
      try { socket?.close(); } catch { failure ??= "TAIL_SOCKET_CLOSE_FAILED"; }
      try { await provider(`/tails/${tail.id}`, "DELETE"); session.removed = true; }
      catch (error) { cleanupFailure = safeFailure(error); }
    }
  }
  if (!result && !failure && !cleanupFailure) failure = Date.now() >= deadline ? "NATURAL_SWEEP_NOT_OBSERVED" : "TAIL_SESSION_BUDGET_EXHAUSTED";
  const after = deploymentSummary(await provider("/deployments"));
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const eventVersionMatches = Boolean(result?.workerVersion) && after.versions.some((version) => version.id === result.workerVersion && version.percentage > 0);
  return { deploymentBefore: before, deploymentAfter: after, deploymentUnchangedDuringObservation: unchanged, eventVersionMatches, ...(result ? { naturalSweep: result } : {}), observationSource: "provider_live_scheduled_log", ...(storedLogFailure ? { storedLogFailure } : {}), ...(failure ? { failure } : {}), tailSessionCreated: sessions.length > 0, tailSessionsCreated: sessions.length, tailSessions: sessions, tailSessionRemoved: sessions.length > 0 && sessions.every((session) => session.removed), ...(cleanupFailure ? { cleanupFailure } : {}), passed: Boolean(result?.healthy && unchanged && eventVersionMatches && !failure && !cleanupFailure) };
}

export async function main(args = process.argv.slice(2)) {
  check(args.length === 2 || args.length === 4, "INVALID_PRODUCTION_PROBE_ARGUMENTS");
  check(args[0] === "--receipt" && (args.length === 2 || (args[2] === "--observe-minutes" && Number(args[3]) >= 1 && Number(args[3]) <= 65)), "INVALID_PRODUCTION_PROBE_ARGUMENTS");
  const receipt = { schema: "donestate.ga-production-preflight.v1", startedAt: utc(Date.now()), productionMutations: 0, syntheticCronInvocations: 0, credentialSetups: 0, modelStarts: 0, passed: false };
  try {
    receipt.publicPreflight = await publicPreflight();
    if (args.length === 4) receipt.operations = await observeNaturalSweep(providerClient({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN }), Number(args[3]) * 60_000);
    receipt.passed = receipt.publicPreflight.passed && (!receipt.operations || receipt.operations.passed);
  } catch (error) { receipt.failure = safeFailure(error); }
  receipt.finishedAt = utc(Date.now());
  await writeFile(args[1], `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => { console.error("PRODUCTION_RECEIPT_WRITE_FAILED_OR_INVALID_ARGUMENTS"); process.exitCode = 1; });
}
