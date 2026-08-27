import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { inspectWorkspace } from "../workspace.js";
import { temporaryRoot } from "./helpers.js";

test("counts Git workspace changes while excluding DoneState local state", async () => {
  const root = await temporaryRoot();
  assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
  await writeFile(path.join(root, "changed.txt"), "content\n");
  await mkdir(path.join(root, ".donestate", "state"), { recursive: true });
  await writeFile(path.join(root, ".donestate", "state", "donestate.sqlite"), "state");
  const inspection = inspectWorkspace(root);
  assert.equal(inspection.gitRepository, true);
  assert.deepEqual(inspection.changedFiles, ["changed.txt"]);
});
