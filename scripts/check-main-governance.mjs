import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const expectedContexts = ["core (22)", "core (24)", "hosted-plugin"];
const expectedRules = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"];

export function validateMainGovernance({ manifest, codeowners, workflow, runbook, currentStatus, ledger }) {
  requireValue(manifest.schemaVersion === 2, "main governance schemaVersion must be 2");
  requireValue(manifest.proposalId === "donestate.main-governance.v2", "unexpected main governance proposalId");
  requireValue(manifest.repository?.fullName === "AyobamiH/donestate", "main governance repository name drifted");
  requireValue(manifest.repository?.repositoryId === 1348643925, "main governance repository ID drifted");
  requireValue(manifest.repository?.defaultBranch === "main", "main governance default branch drifted");

  const provider = manifest.providerObservation;
  requireValue(provider?.state === "PROTECTED", "provider evidence must remain PROTECTED");
  requireValue(provider?.rulesetId === 22247029, "active DoneState ruleset ID drifted");
  requireValue(/protected=true/.test(provider?.providerMessage || ""), "provider observation must record protected=true");
  requireValue(/active rulesets=1/.test(provider?.providerMessage || ""), "provider observation must record one active ruleset");

  const activation = manifest.activation;
  requireValue(activation?.state === "ACTIVE", "mechanical main protection must remain ACTIVE");
  requireValue(activation?.desiredProviderEnforcement === "active", "desired provider enforcement must be active");
  requireValue(activation?.artifactProviderEnforcement === "disabled", "checked-in import template must remain disabled by default");
  requireValue(typeof activation?.appliedAt === "string" && activation.appliedAt.length > 0, "active protection must record appliedAt");
  requireValue(activation?.blockingIssue === "https://github.com/AyobamiH/donestate/issues/117", "activation proof issue drifted");
  requireValue(Array.isArray(activation?.blockers) && activation.blockers.length === 0, "active protection cannot retain provider blockers");

  requireValue(manifest.stages?.mechanicalBaseline?.state === "ACTIVE", "mechanical baseline must remain ACTIVE");
  requireValue(manifest.stages?.mechanicalBaseline?.requiresSecondHumanReviewer === false, "second human reviewer cannot become a Stage 1 blocker");
  requireValue(manifest.stages?.mechanicalBaseline?.requiredApprovals === 0, "Stage 1 must keep zero approvals until a trusted human exists");
  requireValue(manifest.stages?.independentHumanReview?.state === "FOLLOW_ON", "independent human review must remain follow-on");
  requireValue(manifest.stages?.independentHumanReview?.requiredApprovalsAfterActivation === 1, "Stage 2 must add one approval");
  requireValue(manifest.stages?.independentHumanReview?.mustNotWeakenMechanicalBaseline === true, "Stage 2 cannot weaken mechanical protection");

  const reviewer = manifest.ownership?.independentReviewer;
  requireValue(reviewer?.login === null && reviewer?.state === "UNNAMED", "do not invent an independent reviewer");
  requireValue(reviewer?.activationBlocker === false, "unnamed reviewer cannot block active Stage 1 protection");
  requireValue(manifest.ownership?.mergeExecutor?.login === "AyobamiH" && manifest.ownership.mergeExecutor.userId === 47716486, "owner merge executor drifted");
  requireValue(codeowners.includes("* @AyobamiH"), "CODEOWNERS must identify the current owner");

  const inventory = manifest.checkInventory;
  requireExactSet(inventory?.contexts, expectedContexts, "check inventory contexts");
  requireValue(inventory?.providerApp?.integrationId === 15368, "required checks must remain pinned to GitHub Actions");
  requireValue(/^name: CI$/m.test(workflow) && /^  pull_request:\s*$/m.test(workflow), "CI must emit on pull requests");
  requireValue(!/^\s+(?:paths|paths-ignore|branches|branches-ignore):/m.test(pullRequestBlock(workflow)), "CI pull_request trigger cannot be filtered");
  requireValue(!/^\s{4}if:/m.test(workflow), "required CI jobs cannot have job-level conditions");
  requireValue(!/continue-on-error:/m.test(workflow), "required CI jobs cannot tolerate failure");

  const ruleset = manifest.githubRuleset;
  requireValue(ruleset?.target === "branch" && ruleset?.enforcement === "disabled", "checked-in ruleset must remain an import-safe disabled template");
  requireExactSet(ruleset?.conditions?.ref_name?.include, ["refs/heads/main"], "ruleset include refs");
  requireExactSet(ruleset?.conditions?.ref_name?.exclude, [], "ruleset exclude refs");
  requireValue(ruleset?.bypass_actors?.length === 1, "ruleset must preserve exactly one owner recovery bypass");
  const bypass = ruleset.bypass_actors[0];
  requireValue(bypass.actor_id === 47716486 && bypass.actor_type === "User" && bypass.bypass_mode === "always", "owner recovery bypass drifted");
  const rules = new Map(ruleset.rules.map(rule => [rule.type, rule]));
  requireExactSet([...rules.keys()], expectedRules, "ruleset rule types");
  const pr = rules.get("pull_request").parameters;
  requireValue(pr.required_approving_review_count === 0 && pr.require_code_owner_review === false && pr.require_last_push_approval === false, "Stage 1 must not invent human approval");
  requireValue(pr.required_review_thread_resolution === true, "review threads must resolve");
  const checks = rules.get("required_status_checks").parameters;
  requireValue(checks.strict_required_status_checks_policy === true, "required checks must be current with main");
  requireExactSet(checks.required_status_checks.map(check => check.context), expectedContexts, "ruleset required contexts");
  requireValue(checks.required_status_checks.every(check => check.integration_id === 15368), "every required check must be pinned to GitHub Actions");

  const readBack = manifest.activationReadBack;
  requireValue(readBack?.state === "VERIFIED", "provider activation read-back must remain VERIFIED");
  requireValue(readBack?.rulesetId === 22247029 && readBack?.providerEnforcement === "active", "provider activation read-back drifted");
  for (const token of ["pull request required", "deletion blocked", "non-fast-forward blocked", "zero required approvals"]) {
    requireValue(readBack.effectiveBranchRules?.includes(token), `activation read-back missing ${token}`);
  }

  for (const [name, contents] of [["runbook", runbook], ["current status", currentStatus]]) {
    requireValue(/PROTECTED/.test(contents), `${name} must state the provider state is PROTECTED`);
    requireValue(/22247029/.test(contents), `${name} must record active ruleset 22247029`);
    requireValue(!/Current provider state:\s*UNPROTECTED/.test(contents), `${name} cannot claim current provider state is UNPROTECTED`);
    requireValue(!/Provider activation is therefore \*\*BLOCKED_PROVIDER_ACTION\*\*/.test(contents), `${name} cannot claim provider activation is blocked`);
  }

  const item = ledger.workItems?.find(candidate => candidate.id === "GOV-003");
  requireValue(item?.status === "complete", "GOV-003 must remain complete while provider protection is active");
  requireValue(item?.evidenceIds?.includes("E-038"), "GOV-003 must cite provider-enforcement evidence E-038");
  const evidence = ledger.evidenceStories?.find(story => story.id === "E-038");
  requireValue(evidence?.accountability?.status === "complete", "E-038 must remain complete");
  requireValue(ledger.evidenceStories?.some(story => story.id === "E-037"), "production VERIFIED evidence E-037 must be preserved");
}

function pullRequestBlock(workflow) {
  const start = workflow.search(/^  pull_request:\s*$/m);
  if (start < 0) return "";
  const rest = workflow.slice(start + workflow.slice(start).indexOf("\n") + 1);
  const end = rest.search(/^\S/m);
  return end < 0 ? rest : rest.slice(0, end);
}

function requireExactSet(actual, expected, label) {
  requireValue(Array.isArray(actual), `${label} must be an array`);
  requireValue(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()), `${label} must be exactly ${expected.join(", ") || "empty"}`);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const root = new URL("../", import.meta.url);
  const [manifestSource, codeowners, workflow, runbook, currentStatus, ledgerSource] = await Promise.all([
    readFile(new URL("governance/main-ruleset.proposed.json", root), "utf8"),
    readFile(new URL(".github/CODEOWNERS", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
    readFile(new URL("docs/MAIN-GOVERNANCE.md", root), "utf8"),
    readFile(new URL("docs/CURRENT-STATUS.md", root), "utf8"),
    readFile(new URL("governance/project-ledger.json", root), "utf8")
  ]);
  validateMainGovernance({ manifest: JSON.parse(manifestSource), codeowners, workflow, runbook, currentStatus, ledger: JSON.parse(ledgerSource) });
  console.log("main governance: active provider protection verified");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
