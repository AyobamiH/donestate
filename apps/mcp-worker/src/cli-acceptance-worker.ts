import { getSandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

interface CliAcceptanceEnv {
  Sandbox: Env["Sandbox"];
  CLI_ACCEPTANCE_TOKEN: string;
  GH_TOKEN: string;
}

const TARGET_REPOSITORY = "AyobamiH/donestate";
const TARGET_VERSION = "0.2.0";
const OPSTRUTH_MCP_URL = "https://mcp.opstruth.io/mcp";
const SANDBOX_OPTIONS = { sleepAfter: "15m", keepAlive: true, enableDefaultSession: false } as const;
const ACCEPTANCE_ID = /^[0-9a-f-]{36}$/;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function authorised(request: Request, env: CliAcceptanceEnv): boolean {
  const token = request.headers.get("authorization");
  return Boolean(env.CLI_ACCEPTANCE_TOKEN && token === "Bearer " + env.CLI_ACCEPTANCE_TOKEN);
}

function parseAcceptanceId(url: URL): string {
  const id = url.searchParams.get("id") ?? "";
  if (!ACCEPTANCE_ID.test(id)) throw new Error("invalid acceptance id");
  return id;
}

function sandboxFor(env: CliAcceptanceEnv, id: string) {
  return getSandbox(env.Sandbox, "cli-acceptance-" + id, SANDBOX_OPTIONS);
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function base64(value: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function readJsonFile(sandbox: ReturnType<typeof sandboxFor>, filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse((await sandbox.readFile(filePath)).content) as unknown;
  } catch {
    return null;
  }
}

async function verifierFingerprint(): Promise<string> {
  const response = await fetch(OPSTRUTH_MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "donestate-cli-cloudflare-acceptance",
      method: "tools/call",
      params: { name: "opstruth_get_verifier_identity", arguments: {} },
    }),
  });
  if (!response.ok) throw new Error("OpsTruth identity request failed with HTTP " + response.status);
  const body = await response.json() as {
    result?: { structuredContent?: { doneStateSignerFingerprint?: unknown } };
    error?: { message?: string };
  };
  if (body.error) throw new Error("OpsTruth identity RPC failed: " + (body.error.message ?? "unknown error"));
  const fingerprint = body.result?.structuredContent?.doneStateSignerFingerprint;
  if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error("OpsTruth did not return a DoneState-compatible verifier fingerprint");
  }
  return fingerprint;
}

function startScript(id: string, fingerprint: string): string {
  const proofName = id + ".json";
  const repositoryProofPath = "evidence/cli-cloudflare-acceptance/" + proofName;
  const proofValue = "donestate-cli-0.2.0-cloudflare";
  const goal = "Create " + proofName + " containing exactly {\"value\":\"" + proofValue + "\",\"acceptanceId\":\"" + id + "\"}. Change no other repository file.";
  const accept = repositoryProofPath + " contains the exact published-CLI Cloudflare acceptance value.";
  const fakeGh = [
    "#!/bin/sh",
    "if [ \"$1\" = \"repo\" ] && [ \"$2\" = \"view\" ]; then",
    "  printf '" + TARGET_REPOSITORY + "\\n'",
    "  exit 0",
    "fi",
    "printf 'unsupported acceptance gh invocation: %s\\n' \"$*\" >&2",
    "exit 2",
    "",
  ].join("\n");
  const fakeCodex = [
    "#!/bin/sh",
    "cat > " + shellQuote(proofName) + " <<'JSON'",
    JSON.stringify({ value: proofValue, acceptanceId: id }),
    "JSON",
    "printf '{\"type\":\"done\",\"message\":\"deterministic Cloudflare acceptance harness wrote one bounded proof file\"}\\n'",
    "",
  ].join("\n");
  const requirements = JSON.stringify([
    {
      id: "proof-value",
      criterionIndex: 0,
      kind: "json_equals",
      path: repositoryProofPath,
      pointer: "/value",
      expected: proofValue,
    },
    {
      id: "exact-head-checks",
      criterionIndex: 1,
      kind: "github_checks_pass",
      requiredNames: ["core (22)", "core (24)", "hosted-plugin"],
    },
    {
      id: "bounded-diff",
      criterionIndex: 2,
      kind: "changed_files",
      max: 1,
      allowedPaths: [repositoryProofPath],
    },
  ], null, 2);
  const publishedNode = [
    "const fs=require('fs');",
    "const run=JSON.parse(fs.readFileSync('/workspace/acceptance/run.json','utf8'));",
    "const handoff=JSON.parse(fs.readFileSync('/workspace/acceptance/handoff.json','utf8'));",
    "const caps=JSON.parse(fs.readFileSync('/workspace/acceptance/capabilities.json','utf8'));",
    "if(run.state!=='AWAITING_VERIFICATION')throw new Error('expected AWAITING_VERIFICATION, got '+run.state);",
    "if(!run.publicationSubject||run.publicationSubject.publication!=='branch')throw new Error('branch publication subject missing');",
    "fs.writeFileSync('/workspace/acceptance/published.json',JSON.stringify({phase:'published',acceptanceId:" + JSON.stringify(id) + ",packageVersion:caps.version,runId:run.id,state:run.state,branchName:run.publicationSubject.branchName,headSha:run.publicationSubject.headSha,baseHeadSha:run.publicationSubject.baseHeadSha,handoffDigest:handoff.handoffDigest,verificationNonce:handoff.verificationNonce,verifierFingerprint:" + JSON.stringify(fingerprint) + ",proofPath:" + JSON.stringify(repositoryProofPath) + "},null,2));",
  ].join("");
  const capabilityNode = [
    "const fs=require('fs');",
    "const value=JSON.parse(fs.readFileSync('/workspace/acceptance/capabilities.json','utf8'));",
    "if(value.version!==" + JSON.stringify(TARGET_VERSION) + ")throw new Error('installed CLI version mismatch');",
    "if(!Array.isArray(value.audience)||!value.audience.includes('human')||!value.audience.includes('agent'))throw new Error('installed CLI audience mismatch');",
    "if(!Array.isArray(value.pendingPortableParity)||value.pendingPortableParity.length!==0)throw new Error('installed CLI still reports portable parity gaps');",
  ].join("");
  const failureNode = [
    "const fs=require('fs');",
    "const code=Number(process.argv[1]);",
    "let log='';try{log=fs.readFileSync('/workspace/acceptance/start.log','utf8').slice(-12000)}catch{}",
    "fs.writeFileSync('/workspace/acceptance/failure.json',JSON.stringify({phase:'failed',stage:'start',exitCode:code,log},null,2));",
  ].join("");

  return [
    "#!/bin/bash",
    "set +e",
    "(",
    "  set -euo pipefail",
    "  export HOME=/root",
    "  export PATH=/workspace/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "  rm -rf /workspace/repo /workspace/state /workspace/bin",
    "  mkdir -p /workspace/bin /workspace/state",
    "  git clone --no-tags --single-branch --branch main https://github.com/" + TARGET_REPOSITORY + ".git /workspace/repo",
    "  cd /workspace/repo",
    "  git config user.name 'DoneState Cloudflare Acceptance'",
    "  git config user.email 'donestate-cloudflare-acceptance@example.invalid'",
    "  printf 'https://x-access-token:%s@github.com\\n' \"$GH_TOKEN\" > /workspace/.git-credentials",
    "  chmod 600 /workspace/.git-credentials",
    "  git config credential.helper 'store --file=/workspace/.git-credentials'",
    "  printf %s " + shellQuote(base64(fakeGh)) + " | base64 -d > /workspace/bin/gh",
    "  chmod 755 /workspace/bin/gh",
    "  mkdir -p /workspace/repo/evidence/cli-cloudflare-acceptance",
    "  printf %s " + shellQuote(base64(fakeCodex)) + " | base64 -d > /workspace/bin/codex",
    "  chmod 755 /workspace/bin/codex",
    "  printf %s " + shellQuote(base64(requirements)) + " | base64 -d > /workspace/acceptance/verification-requirements.json",
    "  npm_view_version=\"$(npm view donestate version)\"",
    "  test \"$npm_view_version\" = " + shellQuote(TARGET_VERSION),
    "  npm install --global donestate@" + TARGET_VERSION,
    "  donestate --help | grep -F " + shellQuote("DoneState " + TARGET_VERSION) + " >/dev/null",
    "  donestate capabilities > /workspace/acceptance/capabilities.json",
    "  node -e " + shellQuote(capabilityNode),
    "  donestate go " + shellQuote(goal) + " --repo /workspace/repo/evidence/cli-cloudflare-acceptance --accept " + shellQuote(accept) + " --publish branch --base main --verification-requirements /workspace/acceptance/verification-requirements.json --trusted-verifiers " + shellQuote(fingerprint) + " --state-dir /workspace/state > /workspace/acceptance/run.json",
    "  run_id=\"$(node -e " + shellQuote("const j=require('/workspace/acceptance/run.json');if(!j.id)process.exit(2);process.stdout.write(j.id)") + ")\"",
    "  donestate handoff \"$run_id\" --state-dir /workspace/state --out /workspace/acceptance/handoff.json > /workspace/acceptance/handoff-command.json",
    "  node -e " + shellQuote(publishedNode),
    "  rm -f /workspace/.git-credentials",
    ") > /workspace/acceptance/start.log 2>&1",
    "code=$?",
    "if [ \"$code\" -ne 0 ]; then node -e " + shellQuote(failureNode) + " \"$code\"; fi",
    "exit \"$code\"",
    "",
  ].join("\n");
}

function verifyScript(id: string): string {
  const finalNode = [
    "const fs=require('fs');",
    "const published=JSON.parse(fs.readFileSync('/workspace/acceptance/published.json','utf8'));",
    "const verification=JSON.parse(fs.readFileSync('/workspace/acceptance/verification.json','utf8'));",
    "const status=JSON.parse(fs.readFileSync('/workspace/acceptance/final-status.json','utf8'));",
    "if(status.run?.state!=='VERIFIED')throw new Error('expected VERIFIED, got '+(status.run?.state??'missing'));",
    "fs.writeFileSync('/workspace/acceptance/final.json',JSON.stringify({...published,phase:'verified',state:status.run.state,verifierDecision:verification.response?.report?.decision??null,evidenceRefs:verification.response?.report?.evidenceRefs??[],observedHeadSha:verification.response?.report?.subject?.observedHeadSha??null,eventChainValid:status.eventChain?.valid===true},null,2));",
  ].join("");
  const failureNode = [
    "const fs=require('fs');",
    "const code=Number(process.argv[1]);",
    "let log='';try{log=fs.readFileSync('/workspace/acceptance/verify.log','utf8').slice(-12000)}catch{}",
    "fs.writeFileSync('/workspace/acceptance/failure.json',JSON.stringify({phase:'failed',stage:'verify',exitCode:code,log},null,2));",
  ].join("");
  return [
    "#!/bin/bash",
    "set +e",
    "(",
    "  set -euo pipefail",
    "  export HOME=/root",
    "  export PATH=/workspace/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "  run_id=\"$(node -e " + shellQuote("const j=require('/workspace/acceptance/published.json');process.stdout.write(j.runId)") + ")\"",
    "  donestate verify-opstruth \"$run_id\" --endpoint " + shellQuote(OPSTRUTH_MCP_URL) + " --state-dir /workspace/state > /workspace/acceptance/verification.json",
    "  donestate status \"$run_id\" --state-dir /workspace/state > /workspace/acceptance/final-status.json",
    "  node -e " + shellQuote(finalNode),
    ") > /workspace/acceptance/verify.log 2>&1",
    "code=$?",
    "if [ \"$code\" -ne 0 ]; then node -e " + shellQuote(failureNode) + " \"$code\"; fi",
    "exit \"$code\"",
    "",
  ].join("\n");
}

export default {
  async fetch(request: Request, env: CliAcceptanceEnv): Promise<Response> {
    if (!authorised(request, env)) return json({ error: "unauthorised" }, 401);
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/start") {
        const id = crypto.randomUUID();
        const sandbox = sandboxFor(env, id);
        await sandbox.mkdir("/workspace/acceptance", { recursive: true });
        const fingerprint = await verifierFingerprint();
        await sandbox.writeFile("/workspace/acceptance/start.sh", startScript(id, fingerprint));
        const process = await sandbox.startProcess("bash /workspace/acceptance/start.sh", {
          cwd: "/workspace",
          env: { GH_TOKEN: env.GH_TOKEN },
          processId: "cli-acceptance-start-" + id,
        });
        return json({ phase: "started", acceptanceId: id, processId: process.id });
      }

      if (request.method === "GET" && url.pathname === "/status") {
        const id = parseAcceptanceId(url);
        const sandbox = sandboxFor(env, id);
        const failure = await readJsonFile(sandbox, "/workspace/acceptance/failure.json");
        if (failure) return json(failure, 500);
        const final = await readJsonFile(sandbox, "/workspace/acceptance/final.json");
        if (final) return json(final);
        const published = await readJsonFile(sandbox, "/workspace/acceptance/published.json");
        if (published) return json(published);
        return json({ phase: "running", acceptanceId: id });
      }

      if (request.method === "POST" && url.pathname === "/verify") {
        const id = parseAcceptanceId(url);
        const sandbox = sandboxFor(env, id);
        const published = await readJsonFile(sandbox, "/workspace/acceptance/published.json");
        if (!published) return json({ error: "publication not ready" }, 409);
        const final = await readJsonFile(sandbox, "/workspace/acceptance/final.json");
        if (final) return json(final);
        try {
          await sandbox.readFile("/workspace/acceptance/verify.started");
          return json({ phase: "verification_running", acceptanceId: id });
        } catch {
          await sandbox.writeFile("/workspace/acceptance/verify.started", new Date().toISOString());
        }
        await sandbox.writeFile("/workspace/acceptance/verify.sh", verifyScript(id));
        const process = await sandbox.startProcess("bash /workspace/acceptance/verify.sh", {
          cwd: "/workspace",
          processId: "cli-acceptance-verify-" + id,
        });
        return json({ phase: "verification_started", acceptanceId: id, processId: process.id });
      }

      if (request.method === "POST" && url.pathname === "/cleanup") {
        const id = parseAcceptanceId(url);
        await sandboxFor(env, id).destroy();
        return json({ phase: "cleaned", acceptanceId: id });
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      return json({
        error: "acceptance_control_failure",
        message: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  },
} satisfies ExportedHandler<CliAcceptanceEnv>;
