// Source policy validation only. Provider application and current check outcomes
// require separately fetched API evidence; this module never changes settings.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const identities = {
  'AyobamiH/agentproof': { id: 1317413810, project: 'proof-state-ci-agentproof', ruleset: 25292351, jobs: ['validate-linux-node22','validate-linux-node24','provider','release-provider'], macos: true },
  'AyobamiH/donestate': { id: 1348643925, project: 'proof-state-ci-donestate', ruleset: 22247029, jobs: ['core-node22','core-node24','hosted-plugin','release-controller'], macos: false },
  'AyobamiH/opstruth-chatgpt-plugin': { id: 1345997124, project: 'proof-state-ci-opstruth', ruleset: 22247265, jobs: ['verify','review','release-verifier'], macos: false },
};
const digest = value => createHash('sha256').update(value).digest('hex');
const requireThat = (value, message) => { if (!value) throw new Error(message); };
export function validateNativePolicy({ policy, baseline, manifestBytes, runnerBytes }) {
  const spec = identities[policy.repository];
  requireThat(spec && policy.schema === 'proofstate.native-ci-provider-policy.v1' && policy.repositoryId === spec.id, 'POLICY_IDENTITY');
  requireThat(policy.owner?.login === 'AyobamiH' && policy.owner?.userId === 47716486 && policy.owner?.authorisedOn === '2026-10-21', 'OWNER_AUTHORITY');
  requireThat(policy.provider?.context === 'Cloudflare Pages' && policy.provider?.appId === 85455 && policy.provider?.appSlug === 'cloudflare-workers-and-pages' && policy.provider?.project === spec.project, 'PINNED_PROVIDER_REQUIRED');
  requireThat(policy.rulesetId === spec.ruleset && baseline.id === spec.ruleset && baseline.enforcement === 'active', 'RULESET_IDENTITY');
  requireThat(policy.pipeline?.manifestSha256 === digest(manifestBytes) && policy.pipeline?.runnerSha256 === digest(runnerBytes), 'REVIEWED_PIPELINE_HASH_MISMATCH');
  const manifest = JSON.parse(manifestBytes.toString());
  requireThat(manifest.repository?.name === policy.repository && String(manifest.repository?.id) === String(spec.id) && manifest.project === spec.project, 'PIPELINE_REPOSITORY_MISMATCH');
  requireThat(isDeepStrictEqual(manifest.jobs.map(j => j.id).sort(), [...spec.jobs].sort()) && manifest.jobs.every(j => j.platform === 'linux' && j.commands?.length > 0), 'LINUX_COVERAGE_MISSING');
  const required = [{context:'Cloudflare Pages',integration_id:85455}, ...(spec.macos ? [{context:'validate (macos-latest, 24)',integration_id:15368}] : [])];
  requireThat(isDeepStrictEqual(policy.requiredChecks,required), 'REQUIRED_CHECKS_MISMATCH');
  requireThat(spec.macos === policy.requiresSeparateMacOS, 'PLATFORM_BOUNDARY_CHANGED');
  if(spec.macos) requireThat(manifest.excludedCoverage?.some(x => x.id === 'validate-macos-node24' && x.platform === 'macos' && x.requiredSeparately === true), 'MACOS_EXCLUSION_MISSING');
  const desired = structuredClone(baseline);
  const rule = desired.rules.filter(r=>r.type==='required_status_checks');
  requireThat(rule.length === 1 && rule[0].parameters.strict_required_status_checks_policy === true, 'STRICT_FRESHNESS_REQUIRED');
  rule[0].parameters.required_status_checks = required;
  requireThat(isDeepStrictEqual(policy.desiredRuleset,desired), 'UNAPPROVED_RULESET_CHANGE');
  requireThat(policy.cost?.allowPlanUpgrade === false && policy.cost?.allowPaidActions === false && policy.cost?.allowFunctions === false && policy.cost?.allowProductionApplicationDeploy === false, 'COST_OR_AUTHORITY_EXPANSION');
  requireThat(policy.activation?.requireExactHeadHostedReceipt === true && policy.activation?.requireNativeAppCheck === true && policy.activation?.enableAllPreviewBranches === false, 'UNBOUNDED_ACTIVATION');
  return {repository:policy.repository, context:policy.provider.context, appId:policy.provider.appId, sourcePolicy:'valid', externalEnforcement:'requires_readback'};
}
export async function checkPolicy(root = fileURLToPath(new URL('../../', import.meta.url))) {
  const [policy, baseline, manifestBytes, runnerBytes] = await Promise.all([
    readFile(resolve(root,'governance/native-ci-provider-policy.json'),'utf8').then(JSON.parse),
    readFile(resolve(root,'governance/native-ci-before-20261021.json'),'utf8').then(JSON.parse),
    readFile(resolve(root,'ci/cloudflare/manifest.json')), readFile(resolve(root,'ci/cloudflare/run.mjs')),
  ]);
  return validateNativePolicy({policy,baseline,manifestBytes,runnerBytes});
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(JSON.stringify(await checkPolicy()));
