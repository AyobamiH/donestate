import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { policyFor, simpleObjective, temporaryRoot } from "./helpers.js";

const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: { ...process.env },
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
