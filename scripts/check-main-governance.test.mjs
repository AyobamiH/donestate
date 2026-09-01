import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateMainGovernance } from "./check-main-governance.mjs";

const root = new URL("../", import.meta.url);

async function fixture() {
  const [manifestSource, codeowners, workflow, runbook, currentStatus, ledgerSource] = await Promise.all([
    readFile(new URL("governance/main-ruleset.proposed.json", root), "utf8"),
    readFile(new URL(".github/CODEOWNERS", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
    readFile(new URL("docs/MAIN-GOVERNANCE.md", root), "utf8"),
    readFile(new URL("docs/CURRENT-STATUS.md", root), "utf8"),
    readFile(new URL("governance/project-ledger.json", root), "utf8"),
  ]);
  return {
    manifest: JSON.parse(manifestSource),
    codeowners,
    workflow,
    runbook,
    currentStatus,
    ledger: JSON.parse(ledgerSource),
  };
}

function clone(value) {
  return structuredClone(value);
}

test("accepts the blocked review-only main governance proposal", async () => {
  validateMainGovernance(await fixture());
});

test("rejects an active claim while provider evidence remains unprotected", async () => {
  const value = await fixture();
  const changed = clone(value);
  changed.manifest.activation.state = "ACTIVE";
  changed.manifest.githubRuleset.enforcement = "active";
  assert.throws(() => validateMainGovernance(changed), /activation must remain BLOCKED/);
});

test("rejects a documentation claim that main is protected", async () => {
  const value = await fixture();
  const changed = clone(value);
  changed.currentStatus += "\nMain is protected.\n";
  assert.throws(() => validateMainGovernance(changed), /current status must not claim main is protected/);
});

test("rejects a required check that is not in the always-emitted inventory", async () => {
  const value = await fixture();
  const changed = clone(value);
  changed.manifest.githubRuleset.rules
    .find((rule) => rule.type === "required_status_checks")
    .parameters.required_status_checks.push({ context: "Governance freshness / project-state" });
  assert.throws(() => validateMainGovernance(changed), /ruleset required contexts must be exactly/);
});

test("rejects pull-request path filters that could deadlock required checks", async () => {
  const value = await fixture();
  const changed = clone(value);
  changed.workflow = changed.workflow.replace("  pull_request:\n", "  pull_request:\n    paths: [src/**]\n");
  assert.throws(() => validateMainGovernance(changed), /pull_request trigger cannot be filtered/);
});

test("rejects an invented independent reviewer", async () => {
  const value = await fixture();
  const changed = clone(value);
  changed.manifest.ownership.independentReviewer.login = "placeholder-reviewer";
  changed.manifest.ownership.independentReviewer.state = "NAMED";
  assert.throws(() => validateMainGovernance(changed), /do not invent or imply an independent reviewer/);
});
