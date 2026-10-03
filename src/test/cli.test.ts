import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { policyFor, simpleObjective, temporaryRoot } from "./helpers.js";

const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

function runCli(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: { ...env },
  });
}

function jsonOutput(result: ReturnType<typeof runCli>): Record<string, unknown> {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

test("CLI exposes machine-readable capabilities for humans and agents", async () => {
  const root = await temporaryRoot();
  const result = jsonOutput(runCli(root, ["capabilities"]));
  assert.equal(result.schema, "donestate.cli-capabilities.v1");
  assert.deepEqual(result.audience, ["human", "agent"]);
  assert.equal(result.output, "structured-json");
});

test("CLI create/list/cancel/delete lifecycle is consumable as structured JSON", async () => {
  const root = await temporaryRoot();
  const stateDir = path.join(root, "state");
  const objectiveFile = path.join(root, "objective.json");
  const policyFile = path.join(root, "policy.json");
  await writeFile(objectiveFile, JSON.stringify(simpleObjective(root)));
  await writeFile(policyFile, JSON.stringify(policyFor(root)));

  const created = jsonOutput(runCli(root, [
    "create", "--objective", objectiveFile, "--policy", policyFile, "--state-dir", stateDir,
  ]));
  assert.equal(created.state, "RECEIVED");
  assert.equal(typeof created.id, "string");
  const runId = created.id as string;

  const listed = jsonOutput(runCli(root, ["list", "--state-dir", stateDir]));
  assert.equal(listed.count, 1);
  assert.equal((listed.runs as Array<{ id: string }>)[0]?.id, runId);

  const cancelled = jsonOutput(runCli(root, ["cancel", runId, "--state-dir", stateDir]));
  assert.equal(cancelled.state, "CANCELLED");

  const deleted = jsonOutput(runCli(root, ["delete", runId, "--confirm", "--state-dir", stateDir]));
  assert.deepEqual(deleted, { runId, deleted: true });

  const empty = jsonOutput(runCli(root, ["list", "--state-dir", stateDir]));
  assert.equal(empty.count, 0);
});

test("CLI maintenance discovery persists labeled issues and keeps workflow failures evidence-only", async () => {
  const root = await temporaryRoot();
  const bin = path.join(root, "bin");
  const stateDir = path.join(root, "state");
  await mkdir(bin, { recursive: true });
  const fakeGh = path.join(bin, "gh");
  await writeFile(fakeGh, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "api") process.exit(2);
const endpoint = args[1] || "";
if (endpoint.includes("/issues?")) {
  process.stdout.write(JSON.stringify([{
    number: 17,
    title: "Repair the bounded parser",
    body: "The parser rejects a supported input.",
    html_url: "https://github.com/owner/repo/issues/17"
  }]));
} else if (endpoint.includes("/actions/runs?")) {
  process.stdout.write(JSON.stringify({workflow_runs:[{
    id: 99,
    name: "CI",
    display_title: "tests",
    html_url: "https://github.com/owner/repo/actions/runs/99",
    head_sha: "0123456789012345678901234567890123456789"
  }]}));
} else process.exit(3);
`);
  await chmod(fakeGh, 0o700);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };

  const discovered = jsonOutput(runCli(root, [
    "maintenance-discover", "--repo", "owner/repo", "--state-dir", stateDir,
  ], env));
  assert.equal(discovered.discovered, 2);
  assert.equal(discovered.repairEligible, 1);

  const listed = jsonOutput(runCli(root, [
    "maintenance-list", "--repo", "owner/repo", "--state-dir", stateDir,
  ], env));
  assert.equal(listed.count, 2);
  const findings = listed.findings as Array<{ source: string; repairEligible: boolean }>;
  assert.equal(findings.find((item) => item.source === "github_issue")?.repairEligible, true);
  assert.equal(findings.find((item) => item.source === "workflow_run")?.repairEligible, false);
});

