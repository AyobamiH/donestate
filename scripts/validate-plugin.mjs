import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const pluginRoot = new URL("../plugins/donestate/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL(".codex-plugin/plugin.json", pluginRoot), "utf8"),
);
const mcp = JSON.parse(await readFile(new URL(".mcp.json", pluginRoot), "utf8"));

assert.equal(manifest.name, "donestate");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.skills, "./skills/");
assert.equal(manifest.mcpServers, "./.mcp.json");
assert.ok(manifest.interface.capabilities.includes("Write"));
assert.match(manifest.interface.privacyPolicyURL, /^https:\/\//);
assert.match(manifest.interface.termsOfServiceURL, /^https:\/\//);

const server = mcp.mcpServers?.donestate;
assert.equal(server?.type, "http");
assert.match(server?.url, /\/mcp$/);

const skillsRoot = new URL("skills/", pluginRoot);
const skillDirectories = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

assert.deepEqual(skillDirectories, [
  "monitor-objective",
  "run-objective",
  "verify-objective",
]);

for (const directory of skillDirectories) {
  const source = await readFile(join(skillsRoot.pathname, directory, "SKILL.md"), "utf8");
  assert.match(source, /^---\nname: [a-z0-9-]+\ndescription: .+\n---\n/);
}

console.log(`Validated DoneState plugin ${manifest.version} with ${skillDirectories.length} skills.`);
