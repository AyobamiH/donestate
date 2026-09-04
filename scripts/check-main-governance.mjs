import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const expectedContexts = ["core (22)", "core (24)", "hosted-plugin"];

export function validateMainGovernance({ manifest, codeowners, workflow, runbook, currentStatus, ledger }) {
  requireValue(manifest.schemaVersion === 2, "main governance schemaVersion must be 2");
  requireValue(manifest.proposalId === "donestate.main-governance.v2", "unexpected main governance proposalId");
  requireValue(manifest.repository?.fullName === "AyobamiH/donestate", "main governance repository name drifted");
  requireValue(manifest.repository?.repositoryId === 1348643925, "main governance repository ID drifted");
  requireValue(manifest.repository?.defaultBranch === "main", "main governance default branch drifted");

  const provider = manifest.providerObservation;
  requireValue(provider?.state === "UNPROTECTED", "provider evidence must remain UNPROTECTED until authenticated activation read-back");
  requireValue(provider?.headCommit === "e75a78e45f73ce8eebd13284c5bd52097bc764cc", "provider main subject drifted");
  requireValue(provider?.rulesetId === null, "unprotected provider observation cannot name a ruleset ID");
  requireValue(/protected=false/.test(provider?.providerMessage || ""), "provider observation must record protected=false");
  requireValue(/active rulesets=0/.test(provider?.providerMessage || ""), "provider observation must record zero active rulesets");

  const activation = manifest.activation;
  requireValue(activation?.state === "BLOCKED_PROVIDER_ACTION", "activation must remain BLOCKED_PROVIDER_ACTION while provider evidence is UNPROTECTED");
  requireValue(activation?.desiredProviderEnforcement === "active", "desired provider enforcement must be active");
  requireValue(activation?.artifactProviderEnforcement === "disabled", "checked-in artifact cannot claim provider enforcement");
  requireValue(activation?.appliedAt === null, "blocked provider activation cannot have an applied timestamp");
  requireValue(activation?.blockingIssue === "https://github.com/AyobamiH/donestate/issues/60", "activation must remain tied to issue 60");
  requireValue(activation?.blockers?.length === 1, "mechanical baseline must have exactly one provider-action blocker");
  requireValue(activation?.blockers?.[0]?.id === "PROVIDER_RULESET_WRITE" && activation.blockers[0].state === "UNRESOLVED", "provider ruleset write must be the only activation blocker");

  requireValue(manifest.stages?.mechanicalBaseline?.state === "READY_FOR_PROVIDER_ACTIVATION", "mechanical baseline must be activation-ready");
  requireValue(manifest.stages?.mechanicalBaseline?.requiresSecondHumanReviewer === false, "second human reviewer cannot block mechanical protection");
  requireValue(manifest.stages?.mechanicalBaseline?.requiredApprovals === 0, "mechanical baseline must require zero approvals until a trusted human exists");
  requireValue(manifest.stages?.independentHumanReview?.state === "FOLLOW_ON", "independent human review must be a follow-on strengthening stage");
  requireValue(manifest.stages?.independentHumanReview?.requiredApprovalsAfterActivation === 1, "follow-on human review must add one approval");
  requireValue(manifest.stages?.independentHumanReview?.mustNotWeakenMechanicalBaseline === true, "human-review upgrade cannot weaken mechanical rules");

  const reviewer = manifest.ownership?.independentReviewer;
  requireValue(reviewer?.login === null && reviewer?.state === "UNNAMED", "do not invent or imply an independent reviewer");
  requireValue(reviewer?.mustBeHuman === true && reviewer?.mustNotBePullRequestAuthor === true, "independent reviewer constraints drifted");
  requireValue(reviewer?.automatedReviewDoesNotQualify === true, "automated review must not qualify as human approval");
  requireValue(reviewer?.activationBlocker === false, "unnamed reviewer must not block mechanical protection");
  requireValue(manifest.ownership?.reviewAccessModel?.state === "FOLLOW_ON", "review access model must remain follow-on until a real reviewer is named");
  requireValue(manifest.ownership?.mergeExecutor?.login === "AyobamiH" && manifest.ownership.mergeExecutor.userId === 47716486, "owner merge executor drifted");
  requireValue(manifest.ownership?.mergeExecutor?.authority === "OWNER_ONLY", "merge authority must remain owner-only");
  requireValue(codeowners.includes("* @AyobamiH"), "CODEOWNERS must identify the current repository owner");

  const inventory = manifest.checkInventory;
  requireValue(inventory?.workflowPath === ".github/workflows/ci.yml", "required checks must come from the CI workflow");
  requireValue(inventory?.workflowName === "CI" && inventory?.event === "pull_request", "required-check workflow identity drifted");
  requireValue(inventory?.branchFiltered === false && inventory?.pathFiltered === false, "required-check workflow cannot be branch or path filtered");
  requireValue(inventory?.jobLevelConditions === false, "required jobs cannot have job-level conditions");
  requireExactSet(inventory?.contexts, expectedContexts, "check inventory contexts");
  requireValue(inventory?.providerApp?.integrationId === 15368, "required checks must remain pinned to GitHub Actions");
  requireValue(inventory?.providerEvidence?.jobs?.every((job) => job.conclusion === "success"), "provider evidence jobs must all be successful");

  requireValue(/^name: CI$/m.test(workflow), "CI workflow name drifted");
  requireValue(/^  pull_request:\s*$/m.test(workflow), "CI must emit on every pull_request event");
  requireValue(!/^\s+(?:paths|paths-ignore|branches|branches-ignore):/m.test(pullRequestBlock(workflow)), "CI pull_request trigger cannot be filtered");
  requireValue(!/^\s{4}if:/m.test(workflow), "required CI jobs cannot have job-level conditions");
  requireValue(!/continue-on-error:/m.test(workflow), "required CI jobs cannot tolerate failure");
  requireValue(/^  core:\s*$/m.test(workflow) && /^  hosted-plugin:\s*$/m.test(workflow), "required CI job IDs drifted");
  requireValue(/node-version:\s*\[22, 24\]/.test(workflow), "core matrix must emit the exact Node 22 and 24 contexts");

  const ruleset = manifest.githubRuleset;
  requireValue(ruleset?.target === "branch", "proposed ruleset must target branches");
  requireValue(ruleset?.enforcement === "disabled", "checked-in ruleset must remain disabled until provider action");
  requireExactSet(ruleset?.conditions?.ref_name?.include, ["refs/heads/main"], "ruleset include refs");
  requireExactSet(ruleset?.conditions?.ref_name?.exclude, [], "ruleset exclude refs");
  requireValue(ruleset?.bypass_actors?.length === 1, "ruleset must preserve exactly one owner recovery bypass");
  const bypass = ruleset?.bypass_actors?.[0];
  requireValue(bypass?.actor_id === 47716486 && bypass?.actor_type === "User" && bypass?.bypass_mode === "always", "owner recovery bypass drifted");
  const rules = new Map(ruleset?.rules?.map((rule) => [rule.type, rule]));
  for (const type of ["deletion", "non_fast_forward", "pull_request", "required_status_checks"]) requireValue(rules.has(type), `proposed ruleset is missing ${type}`);
  const pullRequest = rules.get("pull_request")?.parameters;
  requireValue(pullRequest?.required_approving_review_count === 0, "mechanical baseline must not invent a human approval requirement");
  requireValue(pullRequest?.require_code_owner_review === false, "code-owner review belongs to the follow-on human-review stage");
  requireValue(pullRequest?.require_last_push_approval === false, "last-push approval belongs to the follow-on human-review stage");
  requireValue(pullRequest?.required_review_thread_resolution === true, "review threads must be resolved");
  const statusChecks = rules.get("required_status_checks")?.parameters;
  requireValue(statusChecks?.strict_required_status_checks_policy === true, "required checks must be current with the target branch");
  requireValue(statusChecks?.do_not_enforce_on_create === false, "required checks cannot be waived on branch creation");
  requireExactSet(statusChecks?.required_status_checks?.map((check) => check.context), expectedContexts, "ruleset required contexts");
  requireValue(statusChecks?.required_status_checks?.every((check) => check.integration_id === 15368), "every required check must be pinned to GitHub Actions integration 15368");

  requireValue(manifest.emergencyRecovery?.mode === "OWNER_BYPASS", "emergency recovery must remain owner-only");
  requireValue(manifest.emergencyRecovery?.rulesetMustRemainEnabled === true, "emergency recovery cannot disable the ruleset");
  requireValue(manifest.emergencyRecovery?.normalMergeMayNotUseBypass === true, "normal merges cannot use the emergency bypass");
  requireValue(manifest.activationReadBack?.state === "NOT_ATTEMPTED" && manifest.activationReadBack?.rulesetId === null, "activation read-back cannot advance before provider action");

  for (const [name, contents] of [["runbook", runbook], ["current status", currentStatus]]) {
    requireValue(/UNPROTECTED/.test(contents), `${name} must state the current provider state is UNPROTECTED`);
    requireValue(/BLOCKED_PROVIDER_ACTION/.test(contents), `${name} must state provider activation is blocked`);
    requireValue(!/main (?:branch )?is protected/i.test(contents), `${name} must not claim main is protected`);
  }

  const item = ledger.workItems?.find((candidate) => candidate.id === "GOV-003");
  requireValue(item?.status === "blocked", "GOV-003 must remain blocked while main is unprotected");
  requireValue(item?.evidenceIds?.includes("E-014"), "GOV-003 must preserve branch-governance evidence");
  requireValue(/zero required approvals|zero approvals|required approvals at zero/i.test(JSON.stringify(item)), "GOV-003 must record staged zero-approval mechanical activation");
  const evidence = ledger.evidenceStories?.find((story) => story.id === "E-014");
  requireValue(evidence?.accountability?.status === "blocked", "historical E-014 accountability must remain blocked");
  requireValue(ledger.evidenceStories?.some((story) => story.id === "E-037"), "production VERIFIED evidence E-037 must be preserved");
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
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  requireValue(JSON.stringify(sortedActual) === JSON.stringify(sortedExpected), `${label} must be exactly ${expected.join(", ") || "empty"}`);
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
    readFile(new URL("governance/project-ledger.json", root), "utf8"),
  ]);
  validateMainGovernance({ manifest: JSON.parse(manifestSource), codeowners, workflow, runbook, currentStatus, ledger: JSON.parse(ledgerSource) });
  console.log("main governance: mechanical baseline ready; provider activation pending");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
