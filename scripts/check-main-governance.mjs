import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const expectedContexts = ["core (22)", "core (24)", "hosted-plugin"];

export function validateMainGovernance({ manifest, codeowners, workflow, runbook, currentStatus, ledger }) {
  requireValue(manifest.schemaVersion === 1, "main governance schemaVersion must be 1");
  requireValue(manifest.proposalId === "donestate.main-governance.v1", "unexpected main governance proposalId");
  requireValue(manifest.repository?.fullName === "AyobamiH/donestate", "main governance repository name drifted");
  requireValue(manifest.repository?.repositoryId === 1348643925, "main governance repository ID drifted");
  requireValue(manifest.repository?.defaultBranch === "main", "main governance default branch drifted");

  const provider = manifest.providerObservation;
  requireValue(provider?.state === "UNPROTECTED", "provider evidence must remain UNPROTECTED until authenticated activation read-back");
  requireValue(provider?.headCommit === "4543c4dcbc1f5f95d1d53ef0a1f8cbeafd8ead4a", "provider main subject drifted");
  requireValue(provider?.providerMessage === "Your main branch isn't protected", "provider observation message drifted");
  requireValue(provider?.rulesetId === null, "an unapplied provider observation cannot name a ruleset ID");

  const activation = manifest.activation;
  requireValue(activation?.state === "BLOCKED", "activation must remain BLOCKED while provider evidence is UNPROTECTED");
  requireValue(activation?.desiredProviderEnforcement === "active", "desired provider enforcement must be active");
  requireValue(activation?.artifactProviderEnforcement === "disabled", "review artifact enforcement must remain disabled");
  requireValue(activation?.appliedAt === null, "blocked activation cannot have an applied timestamp");
  requireValue(activation?.blockingIssue === "https://github.com/AyobamiH/donestate/issues/60", "activation must remain tied to issue 60");
  const blockerStates = new Map(activation?.blockers?.map((blocker) => [blocker.id, blocker.state]));
  for (const blocker of ["SECOND_TRUSTED_HUMAN_REVIEWER", "QUALIFYING_REVIEW_ACCESS_MODEL", "PR58_DEFAULT_BRANCH_RECOVERY", "OWNER_ACTIVATION_APPROVAL"]) {
    requireValue(blockerStates.get(blocker) === "UNRESOLVED", `activation blocker ${blocker} must remain unresolved`);
  }

  const reviewer = manifest.ownership?.independentReviewer;
  requireValue(reviewer?.login === null && reviewer?.state === "UNNAMED", "do not invent or imply an independent reviewer");
  requireValue(reviewer?.mustBeHuman === true && reviewer?.mustNotBePullRequestAuthor === true, "independent reviewer constraints drifted");
  requireValue(reviewer?.automatedReviewDoesNotQualify === true, "automated review must not qualify as human approval");
  requireValue(reviewer?.mustBeCodeOwnerBeforeActivation === true, "independent reviewer must become a code owner before activation");
  requireValue(reviewer?.qualifyingProviderAccess === "UNRESOLVED", "reviewer access must remain unresolved until a real reviewer is named");
  requireValue(manifest.ownership?.reviewAccessModel?.state === "UNRESOLVED", "qualifying review access model must remain unresolved");
  requireValue(manifest.ownership?.reviewAccessModel?.providerMergeCapabilityMayBeConferred === true, "provider merge capability consequence must remain explicit");
  requireValue(manifest.ownership?.reviewAccessModel?.authorityGranted === "REVIEW_ONLY", "second reviewer authority must remain review-only");
  requireValue(manifest.ownership?.reviewAccessModel?.mergeAuthorityRemains === "AyobamiH", "owner-only merge authority drifted");
  requireValue(manifest.ownership?.mergeExecutor?.login === "AyobamiH", "owner-only merge executor drifted");
  requireValue(manifest.ownership?.mergeExecutor?.userId === 47716486, "owner merge executor ID drifted");
  requireValue(manifest.ownership?.mergeExecutor?.authority === "OWNER_ONLY", "merge authority must remain owner-only");
  requireValue(codeowners.includes("* @AyobamiH"), "CODEOWNERS must identify the current repository owner");
  requireValue(/does not name or imply the independent human/i.test(codeowners), "CODEOWNERS must state that the independent reviewer is not yet named");

  const inventory = manifest.checkInventory;
  requireValue(inventory?.workflowPath === ".github/workflows/ci.yml", "required checks must come from the CI workflow");
  requireValue(inventory?.workflowName === "CI" && inventory?.event === "pull_request", "required-check workflow identity drifted");
  requireValue(inventory?.branchFiltered === false && inventory?.pathFiltered === false, "required-check workflow cannot be branch or path filtered");
  requireValue(inventory?.jobLevelConditions === false, "required jobs cannot have job-level conditions");
  requireExactSet(inventory?.contexts, expectedContexts, "check inventory contexts");
  requireValue(inventory?.providerApp?.slug === "github-actions" && inventory?.providerApp?.integrationId === 15368, "required checks must remain pinned to the GitHub Actions App");
  requireValue(inventory?.providerEvidence?.sourceCommit === "c84faf1433a01a5cd3e7eef616175b4273d0bb47", "provider check evidence subject drifted");
  requireValue(inventory?.providerEvidence?.workflowRunId === 33484917639, "provider workflow evidence drifted");
  requireExactSet(inventory?.providerEvidence?.jobs?.map((job) => job.name), expectedContexts, "provider job names");
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
  requireValue(ruleset?.enforcement === "disabled", "proposed ruleset must remain disabled while activation is blocked");
  requireExactSet(ruleset?.conditions?.ref_name?.include, ["refs/heads/main"], "ruleset include refs");
  requireExactSet(ruleset?.conditions?.ref_name?.exclude, [], "ruleset exclude refs");
  requireValue(ruleset?.bypass_actors?.length === 1, "ruleset must preserve exactly one owner recovery bypass");
  const bypass = ruleset?.bypass_actors?.[0];
  requireValue(bypass?.actor_id === 47716486 && bypass?.actor_type === "User" && bypass?.bypass_mode === "always", "owner recovery bypass drifted");
  const rules = new Map(ruleset?.rules?.map((rule) => [rule.type, rule]));
  for (const type of ["deletion", "non_fast_forward", "pull_request", "required_status_checks"]) {
    requireValue(rules.has(type), `proposed ruleset is missing ${type}`);
  }
  const pullRequest = rules.get("pull_request")?.parameters;
  requireValue(pullRequest?.required_approving_review_count === 1, "exactly one independent approval must be required");
  requireValue(pullRequest?.dismiss_stale_reviews_on_push === true, "stale reviews must be dismissed");
  requireValue(pullRequest?.require_code_owner_review === true, "code-owner review must be required");
  requireValue(pullRequest?.require_last_push_approval === true, "last reviewable push must receive independent approval");
  requireValue(pullRequest?.required_review_thread_resolution === true, "review threads must be resolved");
  const statusChecks = rules.get("required_status_checks")?.parameters;
  requireValue(statusChecks?.strict_required_status_checks_policy === true, "required checks must be current with the target branch");
  requireValue(statusChecks?.do_not_enforce_on_create === false, "required checks cannot be waived on branch creation");
  requireExactSet(statusChecks?.required_status_checks?.map((check) => check.context), expectedContexts, "ruleset required contexts");
  requireValue(statusChecks?.required_status_checks?.every((check) => check.integration_id === 15368), "every required check must be pinned to GitHub Actions integration 15368");

  requireValue(manifest.emergencyRecovery?.mode === "OWNER_BYPASS", "emergency recovery must remain owner-only");
  requireValue(manifest.emergencyRecovery?.bypassMode === "always", "emergency bypass must remain auditable, not exempt");
  requireValue(manifest.emergencyRecovery?.rulesetMustRemainEnabled === true, "emergency recovery cannot disable the ruleset");
  requireValue(manifest.emergencyRecovery?.providerBypassMustRemainAuditable === true, "emergency bypass must preserve provider audit evidence");
  requireValue(manifest.emergencyRecovery?.normalMergeMayNotUseBypass === true, "normal merges cannot use the emergency bypass");
  requireValue(manifest.activationReadBack?.state === "NOT_ATTEMPTED", "activation read-back cannot advance before provider action");
  requireValue(manifest.activationReadBack?.rulesetId === null, "activation read-back cannot invent a ruleset ID");

  for (const [name, contents] of [["runbook", runbook], ["current status", currentStatus]]) {
    requireValue(/UNPROTECTED/.test(contents), `${name} must state the current provider state is UNPROTECTED`);
    requireValue(/BLOCKED/.test(contents), `${name} must state activation is BLOCKED`);
    requireValue(!/main (?:branch )?is protected/i.test(contents), `${name} must not claim main is protected`);
    requireValue(!/(?:ruleset|protection|governance) is (?:active|enabled|enforced)/i.test(contents), `${name} must not claim governance is active`);
  }

  const item = ledger.workItems?.find((candidate) => candidate.id === "GOV-003");
  requireValue(item?.status === "blocked", "GOV-003 must remain blocked while main is unprotected");
  requireValue(item?.evidenceIds?.includes("E-014"), "GOV-003 must reference current branch-governance evidence");
  const evidence = ledger.evidenceStories?.find((story) => story.id === "E-014");
  requireValue(evidence?.accountability?.status === "blocked", "E-014 accountability must remain blocked");
  requireValue(/UNPROTECTED/.test(JSON.stringify(evidence)), "E-014 must record the provider UNPROTECTED state");
  requireValue(/BLOCKED/.test(JSON.stringify(evidence)), "E-014 must record blocked activation");
  requireValue(ledger.evidenceStories?.some((story) => story.id === "E-013"), "current Marketplace evidence E-013 must be preserved");
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
  validateMainGovernance({
    manifest: JSON.parse(manifestSource),
    codeowners,
    workflow,
    runbook,
    currentStatus,
    ledger: JSON.parse(ledgerSource),
  });
  console.log("main governance: blocked and truthful");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
