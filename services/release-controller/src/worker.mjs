import { authenticate, demand, Refusal } from "./identity.mjs";
import { Controller, configuration, exact } from "./controller.mjs";
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json", "cache-control": "no-store",
    "x-content-type-options": "nosniff" } });
}
function failure(error) {
  return reply({ error: error instanceof Refusal ? error.code : "release_evidence_rejected" },
    error instanceof Refusal ? error.status : 403);
}
async function body(request) {
  demand(request.headers.get("content-type")?.split(";")[0]?.trim() === "application/json",
    "json_required", 415);
  demand(request.body, "body_required", 400);
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength; demand(size <= 65536, "body_too_large", 413);
      chunks.push(part.value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
}
export async function handle(request, env, auth = authenticate) {
  try {
    const url = new URL(request.url);
    demand(!url.search, "query_not_allowed", 400);
    if (request.method === "GET" && url.pathname === "/health") return reply({
      service: "donestate-isolated-release-controller", enabled: env.ENABLED === "true",
      sourceCommit: env.SERVICE_SOURCE_SHA, trustedWorkflowCommit: env.TRUSTED_SOURCE_SHA,
      targetConfigured: !!env.TARGET_SUBJECT_JSON, signerConfigured: !!env.HANDOFF_PUBLIC_KEY_PEM,
    });
    demand(request.method === "POST" &&
      ["/v1/start","/v1/receipt","/v1/settle","/v1/status","/v1/refresh"].includes(url.pathname), "route_not_found", 404);
    const claims = await auth(request, env);
    demand(!request.headers.has("x-github-token"), "publisher_token_not_allowed");
    const { subject } = configuration(env);
    const input = await body(request);
    const id = env.RUNS.idFromName(subject.repositoryId + ":" + subject.releaseId);
    return env.RUNS.get(id).fetch(new Request("https://run.internal" + url.pathname, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ claims, input }),
    }));
  } catch (error) { return failure(error); }
}
export class ReleaseRun {
  constructor(ctx, env) { this.controller = new Controller(ctx.storage, env); }
  async fetch(request) {
    try {
      const { claims, input } = await request.json();
      const path = new URL(request.url).pathname;
      if (path === "/v1/start") return reply(this.controller.start(claims, input));
      if (path === "/v1/receipt") return reply(await this.controller.receipt(claims, input));
      if (path === "/v1/refresh") return reply(await this.controller.refresh(claims, input));
      if (path === "/v1/settle") return reply(this.controller.settle(claims, input));
      demand(path === "/v1/status", "route_not_found", 404);
      exact(input, []);
      return reply(this.controller.bound(claims));
    } catch (error) { return failure(error); }
  }
}
export default { fetch(request, env) { return handle(request,env); } };
