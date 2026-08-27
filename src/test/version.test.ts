import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_VERSION } from "../version.js";

test("CLI help reports the package metadata version", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const cliPath = fileURLToPath(new URL("../cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(PACKAGE_VERSION, packageJson.version);
  assert.equal(result.stdout.split("\n", 1)[0], `DoneState ${packageJson.version}`);
});
