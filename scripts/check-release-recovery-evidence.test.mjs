import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { validateReleaseRecoveryEvidence } from "./check-release-recovery-evidence.mjs";

const source = fileURLToPath(new URL("../", import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "donestate-release-docs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ledger = JSON.parse(await readFile(join(source, "governance/project-ledger.json"), "utf8"));
  const item = ledger.workItems.find(value => value.id === "AGENTPROOF-001");
  // E-135 is a historical pending-decision fixture. Later live evidence must not
  // turn these refusal tests into tests that rewrite a successful current run.
  item.status = "blocked";
  item.evidenceIds = ["E-135"];
  const story = ledger.evidenceStories.find(value => value.id === "E-135");
  ledger.evidenceStories = [story];
  const checkpoint = JSON.parse(await readFile(join(source, story.artifact.path), "utf8"));
  const paths = new Set([checkpoint.decision.path, checkpoint.predecessor.path,
    ...Object.values(checkpoint.original.artifacts).map(value => value.path),
    ...ledger.evidenceStories.filter(value => value.artifact).map(value => value.artifact.path),
    "docs/CURRENT-STATUS.md", "docs/RELEASE-V1-CANDIDATE-GATE.md"]);
  for (const path of paths) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(source, path), join(root, path));
  }
  for (const path of ["docs/CURRENT-STATUS.md", "docs/RELEASE-V1-CANDIDATE-GATE.md"]) {
    await writeFile(join(root, path), "# Pending decision fixture\n\n" +
      "<!-- Current release recovery evidence: E-135 -->\n\nRelease acceptance: **PENDING**.\n\n" +
      story.artifact.path.slice("docs/".length) + "\n");
  }
  async function save() {
    const bytes = JSON.stringify(checkpoint, null, 2) + "\n";
    await writeFile(join(root, story.artifact.path), bytes);
    story.artifact.sha256 = sha(bytes);
  }
  async function state(value) {
    checkpoint.acceptance.state = value;
    for (const path of ["docs/CURRENT-STATUS.md", "docs/RELEASE-V1-CANDIDATE-GATE.md"]) {
      const file = join(root, path);
      const contents = await readFile(file, "utf8");
      await writeFile(file, contents.replace(/Release acceptance: \*\*[A-Z_]+\*\*\./,
        `Release acceptance: **${value}**.`));
    }
  }
  async function proof(name, value) {
    const path = "docs/evidence/" + name + ".json";
    const bytes = JSON.stringify(value, null, 2) + "\n";
    await writeFile(join(root, path), bytes);
    return { path, sha256: sha(bytes) };
  }
  async function deployment() {
    const previous = JSON.parse(await readFile(join(root, checkpoint.predecessor.path), "utf8"));
    const sources = { agentproof: "a".repeat(40), donestate: "b".repeat(40), opstruth: "c".repeat(40) };
    checkpoint.implementation.sources = sources;
    const projects = { "agentproof-release-approval": "agentproof", "agentproof-release-sign": "agentproof",
      "donestate-release-canary": "donestate", "opstruth-release-verify": "opstruth" };
    const observed = { schema: "donestate.agentproof.release-recovery-deployment.v1",
      observedAt: "2026-10-20T15:44:10.000Z", sources,
      services: previous.closure.services.map(service => ({ name: service.name,
        source: sources[projects[service.name]], namespaces: service.namespaces, versions: service.versions,
        health: { enabled: false, readbackRecoveryEnabled: true,
          trustedWorkflowCommit: checkpoint.original.producingWorkflowCommit,
          serviceSourceCommit: sources[projects[service.name]] } })) };
    checkpoint.deployment = { state: "DEPLOYED", artifact: await proof("synthetic-deployment", observed) };
  }
  return { root, ledger, item, story, checkpoint, save, state, proof, deployment,
    validate: () => validateReleaseRecoveryEvidence({ root, ledger }) };
}

test("the pending decision checkpoint resolves the original immutable evidence and role pins", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.validate(), { evidenceId: "E-135", state: "PENDING" });
});

test("nonempty evidence IDs cannot make incomplete release acceptance complete", async t => {
  const f = await fixture(t);
  f.item.status = "complete";
  await assert.rejects(f.validate, /complete requires exact independently VERIFIED acceptance/);
});

test("edited checkpoint bytes must match the canonical ledger digest", async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, f.story.artifact.path), JSON.stringify(f.checkpoint) + "\n");
  await assert.rejects(f.validate, /SHA-256 mismatch/);
});

test("recomputing the checkpoint hash cannot rebind the producing workflow", async t => {
  const f = await fixture(t);
  f.checkpoint.original.producingWorkflowCommit = "f".repeat(40);
  await f.save();
  await assert.rejects(f.validate, /original release\/run\/workflow\/completion binding changed/);
});

test("the original publication checkpoint cannot be rewritten as recovery success", async t => {
  const f = await fixture(t);
  const path = join(f.root, f.checkpoint.predecessor.path);
  const bytes = (await readFile(path, "utf8")) + "\n";
  await writeFile(path, bytes);
  f.checkpoint.predecessor.sha256 = sha(bytes);
  await f.save();
  await assert.rejects(f.validate, /immutable publication predecessor changed/);
});

test("a future receipt cannot replace the archived source of trusted signing roles", async t => {
  const f = await fixture(t);
  f.checkpoint.acceptance.trustPolicy = f.checkpoint.original.artifacts.prepared;
  await f.save();
  await assert.rejects(f.validate, /original trust source changed/);
});

test("terminal booleans are not signed proof artifacts", async t => {
  const f = await fixture(t);
  await f.state("VERIFIED");
  await f.deployment();
  f.checkpoint.recovery.state = "COMPLETED";
  f.checkpoint.acceptance.settledAt = "2026-10-20T15:44:11.000Z";
  f.checkpoint.acceptance.receipt = true;
  f.checkpoint.acceptance.independentDecision = true;
  await f.save();
  await assert.rejects(f.validate, /receipt must be a path\/SHA-256 artifact reference/);
});

test("terminal words without retained receipt and independent decision remain refused", async t => {
  const f = await fixture(t);
  await f.state("VERIFIED");
  await f.deployment();
  f.checkpoint.recovery.state = "COMPLETED";
  f.checkpoint.acceptance.settledAt = "2026-10-20T15:44:11.000Z";
  await f.save();
  await assert.rejects(f.validate, /terminal acceptance requires signed receipt/);
});

test("current documentation must identify the latest canonical release checkpoint", async t => {
  const f = await fixture(t);
  const path = join(f.root, "docs/RELEASE-V1-CANDIDATE-GATE.md");
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace("Current release recovery evidence: E-135", "Current release recovery evidence: E-134"));
  await assert.rejects(f.validate, /points to stale release evidence/);
});


test("a pending declaration cannot hide a terminal durable snapshot", async t => {
  const f = await fixture(t);
  const record = JSON.parse(await readFile(join(f.root, f.checkpoint.original.artifacts.authorised.path), "utf8"));
  record.status = "VERIFIED";
  f.checkpoint.acceptance.controllerSnapshot = await f.proof("false-terminal", record);
  await f.save();
  await assert.rejects(f.validate, /pending acceptance contradicts terminal durable snapshot/);
});

test("a deployment claim requires hash-bound exact-source provider observations", async t => {
  const f = await fixture(t);
  f.checkpoint.deployment = { state: "DEPLOYED", artifact: true };
  await f.save();
  await assert.rejects(f.validate, /recovery deployment must be a path\/SHA-256 artifact reference/);
});

test("a fresh disabled claim cannot reuse the historical closure", async t => {
  const f = await fixture(t);
  await f.deployment();
  f.checkpoint.closure.state = "DISABLED";
  f.checkpoint.closure.freshReadback = f.checkpoint.predecessor;
  await f.save();
  await assert.rejects(f.validate, /closure receipt identity\/time is invalid/);
});

test("declared runtime BLOCKED requires retained durable refusal evidence", async t => {
  const f = await fixture(t);
  f.checkpoint.recovery.state = "BLOCKED";
  await f.save();
  await assert.rejects(f.validate, /declared recovery state requires matching durable snapshot/);
});


test("local validation cannot be declared without retained source and command evidence", async t => {
  const f = await fixture(t);
  f.checkpoint.implementation.state = "LOCAL_VALIDATED";
  await f.save();
  await assert.rejects(f.validate, /local validation requires one hash-bound source\/check report/);
});
