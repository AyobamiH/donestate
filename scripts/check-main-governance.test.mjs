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
    readFile(new URL("governance/project-ledger.json", root), "utf8")
  ]);
  return { manifest: JSON.parse(manifestSource), codeowners, workflow, runbook, currentStatus, ledger: JSON.parse(ledgerSource) };
}
const clone = value => structuredClone(value);

test("accepts verified active main protection", async () => validateMainGovernance(await fixture()));
test("rejects provider regression to unprotected", async () => {
  const changed = clone(await fixture());
  changed.manifest.providerObservation.state = "UNPROTECTED";
  assert.throws(() => validateMainGovernance(changed), /PROTECTED/);
});
test("rejects ruleset identity drift", async () => {
  const changed = clone(await fixture());
  changed.manifest.providerObservation.rulesetId = 1;
  assert.throws(() => validateMainGovernance(changed), /ruleset ID/);
});
test("rejects silently adding a Stage 1 approval", async () => {
  const changed = clone(await fixture());
  changed.manifest.githubRuleset.rules.find(rule => rule.type === "pull_request").parameters.required_approving_review_count = 1;
  assert.throws(() => validateMainGovernance(changed), /must not invent human approval/);
});
test("rejects required check drift", async () => {
  const changed = clone(await fixture());
  changed.manifest.githubRuleset.rules.find(rule => rule.type === "required_status_checks").parameters.required_status_checks.push({ context: "other", integration_id: 15368 });
  assert.throws(() => validateMainGovernance(changed), /required contexts/);
});
test("rejects stale blocked documentation", async () => {
  const changed = clone(await fixture());
  changed.currentStatus += "\nProvider activation is therefore **BLOCKED_PROVIDER_ACTION**.\n";
  assert.throws(() => validateMainGovernance(changed), /cannot claim provider activation is blocked/);
});
test("rejects reopening GOV-003 without evidence", async () => {
  const changed = clone(await fixture());
  changed.ledger.workItems.find(item => item.id === "GOV-003").status = "blocked";
  assert.throws(() => validateMainGovernance(changed), /GOV-003 must remain complete/);
});
