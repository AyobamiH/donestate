import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subject, validateSha, validateBranch, validateCapacity, scope, projectBody, terminal } from './contracts.mjs';
import { execute } from './pages.mjs';

test('fixed repositories only', () => assert.throws(() => subject('other/repo', '1')));
test('wrong numeric repository identity refused', () => assert.throws(() => subject('AyobamiH/donestate', '1')));
test('full commit required', () => assert.throws(() => validateSha('main')));
test('ambiguous branch refused', () => assert.throws(() => validateBranch('../main')));
test('capacity must be current', () => assert.throws(() => validateCapacity({})));
test('source defaults disable every trigger', () => assert.deepEqual(scope(), {
  production_deployments_enabled: false, preview_deployment_setting: 'none',
  preview_branch_includes: [], preview_branch_excludes: [],
}));

const spec = subject('AyobamiH/opstruth-chatgpt-plugin', '1345997124');
const commit = '5313fce23b7b20b78c8a5a2c0d9bcedac4ba549f';
const branch = 'fix/durable-release-recovery-20261020';
const deploymentId = '5614ea88-8656-4393-add2-c04c229f1d89';
const retriedId = '7614ea88-8656-4393-add2-c04c229f1d89';
const observedAt = '2026-10-21T11:34:22.429Z';
const project = { ...projectBody(spec), id: '87f1320d-0e85-4e15-8555-7749a95bfc17',
  uses_functions: null, domains: [spec.name + '.pages.dev'] };
function skippedDeployment() {
  return {
    id: deploymentId, project_id: project.id, project_name: spec.name,
    source: project.source, build_config: project.build_config,
    deployment_trigger: { type: 'github:push', metadata: { branch, commit_hash: commit, commit_dirty: false } },
    environment: 'preview', env_vars: project.deployment_configs.preview.env_vars,
    is_skipped: true, uses_functions: null,
    latest_stage: { name: 'queued', status: 'idle', started_on: null, ended_on: null },
    stages: ['queued', 'initialize', 'clone_repo', 'build', 'deploy'].map(name =>
      ({ name, status: 'idle', started_on: null, ended_on: null })),
  };
}
function activeDeployment() {
  const value = skippedDeployment();
  value.is_skipped = false;
  value.latest_stage = { name: 'build', status: 'active', started_on: observedAt, ended_on: null };
  value.stages[3] = value.latest_stage;
  return value;
}
async function fixture(t, action, changes = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'pages-admin-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const capacityPath = join(directory, 'capacity.json');
  await writeFile(capacityPath, JSON.stringify({
    schema: 'cloudflare-pages-capacity/v1', accountId: '6ddcbcb8474f1a7e460b2f0aabec0e2f',
    availableBuilds: 1, maxNewBuilds: 1, allowOverage: false,
    source: 'test-only provider capacity fixture', observedAt,
  }));
  const calls = [];
  const deployment = changes.deployment ?? skippedDeployment();
  const retry = { ...skippedDeployment(), id: retriedId, is_skipped: false };
  const options = {
    action, repository: spec.repository, 'repository-id': spec.repositoryId,
    report: join(directory, 'report.json'), branch, sha: commit, deployment: deploymentId,
    'capacity-evidence': capacityPath, ...changes.options,
  };
  const reply = (result, extra = {}) => Response.json({ success: true, result, ...extra });
  const fetchImpl = async (url, request) => {
    calls.push({ url, method: request.method });
    if (request.method !== 'GET') {
      assert.equal(request.method, 'POST');
      assert.ok(url.endsWith('/deployments/' + deploymentId + '/retry'));
      if (changes.ambiguousRetry) throw new Error('fixture connection lost after request');
      return reply(retry);
    }
    if (url.startsWith('https://api.github.com/')) {
      return Response.json({ object: { type: 'commit', sha: changes.branchHead ?? commit } });
    }
    if (url.endsWith('/' + spec.name)) return reply(project);
    if (/projects\/proof-state-ci-(agentproof|donestate)$/.test(url)) {
      return changes.otherActive ? reply({ latest_deployment: activeDeployment() })
        : reply({ latest_deployment: skippedDeployment() });
    }
    if (url.includes('/deployments?page=')) {
      return reply([deployment], { result_info: { per_page: 10, total_count: 1, total_pages: 1 } });
    }
    if (url.endsWith('/deployments/' + deploymentId)) return reply(deployment);
    if (url.endsWith('/deployments/' + retriedId)) return reply(retry);
    throw new Error('unexpected fixture URL: ' + url);
  };
  const report = await execute(options, { token: 'fixture-only', fetchImpl, now: () => Date.parse(observedAt) });
  return { report, calls, writes: calls.filter(call => call.method !== 'GET') };
}

test('provider skipped flag with idle stages is terminal, never an active build', () => {
  assert.equal(terminal(skippedDeployment()), true);
  assert.equal(terminal(activeDeployment()), false);
  assert.equal(terminal({ latest_stage: { name: 'queued', status: 'idle' }, is_skipped: false }), false);
});
test('contradictory skipped flag does not hide an active stage', () => {
  assert.equal(terminal({ ...activeDeployment(), is_skipped: true }), false);
});
test('skipped status is reported without pretending logs or receipt exist', async t => {
  const { report, calls, writes } = await fixture(t, 'status');
  assert.equal(report.outcome, 'BUILD_SKIPPED');
  assert.equal(report.receipt, undefined);
  assert.equal(report.logs, undefined);
  assert.equal(calls.length, 2);
  assert.equal(writes.length, 0);
});
test('ordinary trigger cannot silently replay a skipped deployment', async t => {
  const { report, writes } = await fixture(t, 'trigger');
  assert.equal(report.outcome, 'BLOCKED');
  assert.equal(report.error.code, 'EXPLICIT_RETRY_REQUIRED_AFTER_SKIPPED_DEPLOYMENT');
  assert.equal(writes.length, 0);
});
test('explicit retry of source-checked skipped deployment requests exactly one build', async t => {
  const { report, writes } = await fixture(t, 'retry');
  assert.equal(report.outcome, 'BUILD_REQUESTED_SOURCE_READ_BACK');
  assert.equal(report.createdDeploymentId, retriedId);
  assert.equal(writes.length, 1);
});
test('retry still refuses unavailable capacity', async t => {
  const { report, writes } = await fixture(t, 'retry', { options: { 'capacity-evidence': undefined } });
  assert.equal(report.outcome, 'BLOCKED');
  assert.equal(report.error.code, 'ABSOLUTE_EXTERNAL_FILE_REQUIRED');
  assert.equal(writes.length, 0);
});
test('retry still refuses a moved source branch', async t => {
  const { report, writes } = await fixture(t, 'retry', { branchHead: 'a'.repeat(40) });
  assert.equal(report.error.code, 'CURRENT_GITHUB_BRANCH_HEAD_MISMATCH');
  assert.equal(writes.length, 0);
});
test('retry still refuses another managed project active build', async t => {
  const { report, writes } = await fixture(t, 'retry', { otherActive: true });
  assert.equal(report.error.code, 'OTHER_MANAGED_PROJECT_BUILD_IN_PROGRESS');
  assert.equal(writes.length, 0);
});
test('retry cannot duplicate an active deployment', async t => {
  const { report, writes } = await fixture(t, 'retry', { deployment: activeDeployment() });
  assert.equal(report.error.code, 'EXISTING_BUILD_STILL_IN_PROGRESS');
  assert.equal(writes.length, 0);
});
test('ambiguous retry preserves intent and never retries automatically', async t => {
  const { report, writes } = await fixture(t, 'retry', { ambiguousRetry: true });
  assert.equal(report.outcome, 'AMBIGUOUS_EFFECT');
  assert.equal(report.mutationIntent.method, 'POST');
  assert.equal(writes.length, 1);
});
test('successful deployments remain ineligible for explicit retry', async t => {
  const deployment = skippedDeployment();
  deployment.is_skipped = false;
  deployment.latest_stage = { name: 'deploy', status: 'success', ended_on: observedAt };
  const { report, writes } = await fixture(t, 'retry', { deployment });
  assert.equal(report.error.code, 'RETRY_REQUIRES_VERIFIED_FAILURE_OR_SKIP');
  assert.equal(writes.length, 0);
});

test('verified terminal failure remains eligible for one explicit retry', async t => {
  const deployment = skippedDeployment();
  deployment.is_skipped = false;
  deployment.latest_stage = { name: 'build', status: 'failure', ended_on: observedAt };
  const { report, writes } = await fixture(t, 'retry', { deployment });
  assert.equal(report.outcome, 'BUILD_REQUESTED_SOURCE_READ_BACK');
  assert.equal(report.retryReason, 'terminal-failure');
  assert.equal(writes.length, 1);
});
test('failure without settlement timestamp cannot be retried', async t => {
  const deployment = skippedDeployment();
  deployment.is_skipped = false;
  deployment.latest_stage = { name: 'build', status: 'failure', ended_on: null };
  const { report, writes } = await fixture(t, 'retry', { deployment });
  assert.equal(report.error.code, 'RETRY_REQUIRES_VERIFIED_FAILURE_OR_SKIP');
  assert.equal(writes.length, 0);
});
test('skipped deployment from another source cannot be retried', async t => {
  const deployment = skippedDeployment();
  deployment.deployment_trigger.metadata.commit_hash = 'b'.repeat(40);
  const { report, writes } = await fixture(t, 'retry', { deployment });
  assert.equal(report.error.code, 'DEPLOYMENT_SOURCE_SHA_OR_BRANCH_MISMATCH');
  assert.equal(writes.length, 0);
});

// Static Pages builds are quota-limited; do not demand or broaden billing credentials.
const fixedQuotaBudget = {
  schema: 'cloudflare-pages-capacity/v3', accountId: '6ddcbcb8474f1a7e460b2f0aabec0e2f',
  observedAt, mode: 'static-pages-fixed-quota', availableBuilds: null, maxNewBuilds: 1,
  plan: null, headroomVerification: 'unknown-provider-enforced', planVerification: 'not-claimed',
  allowOverage: false, allowPlanChange: false, allowFunctions: false, allowPaidUsage: false,
  onQuotaRefusal: 'stop-no-upgrade', owner: 'AyobamiH', repository: spec.repository,
  commit, branch, projectId: project.id, costBasis: 'published-static-pages-fixed-plan-quota',
  source: 'https://developers.cloudflare.com/pages/platform/limits/',
};
test('bounded static Pages budget does not pretend to know plan or remaining quota', () =>
  assert.doesNotThrow(() => validateCapacity(fixedQuotaBudget, Date.parse(observedAt))));
for (const [name, value] of Object.entries({allowPaidUsage:true,allowPlanChange:true,allowFunctions:true,
  allowOverage:true,maxNewBuilds:2,plan:'free',availableBuilds:500,headroomVerification:'measured',
  planVerification:'fresh-readback',onQuotaRefusal:'upgrade',repository:'untrusted/repo',commit:'main'})) {
  test('static quota budget refuses '+name, () => assert.throws(() =>
    validateCapacity({...fixedQuotaBudget,[name]:value}, Date.parse(observedAt))));
}
test('static quota budget expires and cannot redate a stale plan observation', () =>
  assert.throws(() => validateCapacity(fixedQuotaBudget, Date.parse(observedAt)+16*60*1000)));
