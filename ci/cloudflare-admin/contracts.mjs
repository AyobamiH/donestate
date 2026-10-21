import { createHash } from 'node:crypto';

export const ACCOUNT_ID = '6ddcbcb8474f1a7e460b2f0aabec0e2f';
export const BUILD_COMMAND = 'node ci/cloudflare/run.mjs --provider cloudflare-pages';
export const BASE_POLICY = Object.freeze({
  pullRequest: 'github-open-pull-request-main-ancestor',
  main: 'git-first-parent-public-github-corroborated-single-commit-delta',
});
export const PROJECTS = Object.freeze({
  'AyobamiH/agentproof': { name: 'proof-state-ci-agentproof', repositoryId: '1317413810' },
  'AyobamiH/donestate': { name: 'proof-state-ci-donestate', repositoryId: '1348643925' },
  'AyobamiH/opstruth-chatgpt-plugin': { name: 'proof-state-ci-opstruth', repositoryId: '1345997124' },
});
export const ENV_VARS = Object.freeze({
  NODE_VERSION: { type: 'plain_text', value: '24.22.0' },
  SKIP_DEPENDENCY_INSTALL: { type: 'plain_text', value: '1' },
});
export const EXPECTED_JOBS = Object.freeze({
  'AyobamiH/agentproof': ['validate-linux-node22', 'validate-linux-node24', 'provider', 'release-provider'],
  'AyobamiH/donestate': ['core-node22', 'core-node24', 'hosted-plugin', 'release-controller'],
  'AyobamiH/opstruth-chatgpt-plugin': ['verify', 'review', 'release-verifier'],
});

export class AdminError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
export function requireThat(condition, code, details) {
  if (!condition) throw new AdminError(code, details);
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const empty = (value) => value == null || value === false || value === '' ||
  (typeof value === 'object' && Object.keys(value).length === 0);
const directory = (value) => (value ?? '').replace(/^\.\//, '').replace(/\/$/, '').replace(/^\.$/, '');

export function subject(repository, repositoryId) {
  const spec = PROJECTS[repository];
  requireThat(spec && String(repositoryId) === spec.repositoryId, 'UNAPPROVED_REPOSITORY_IDENTITY');
  const [owner, repo] = repository.split('/');
  return { ...spec, repository, owner, repo };
}

export function validateBranch(branch) {
  requireThat(typeof branch === 'string' && branch.length > 0 && branch.length <= 200 &&
    !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) && !branch.includes('..') &&
    !branch.includes('@{') && !branch.includes('//') && !branch.startsWith('/') &&
    !branch.startsWith('-') && !branch.endsWith('/') && !branch.endsWith('.') &&
    branch.split('/').every((part) => !part.startsWith('.') && !part.endsWith('.lock')),
  'INVALID_BRANCH');
  return branch;
}
export function validateSha(sha) {
  requireThat(typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha), 'FULL_COMMIT_SHA_REQUIRED');
  return sha;
}
export function validateDeploymentId(id) {
  requireThat(typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id), 'INVALID_DEPLOYMENT_ID');
  return id;
}

export function scope(branch = null, enableMain = false) {
  if (branch !== null) validateBranch(branch);
  requireThat(branch !== 'main', 'PREVIEW_BRANCH_MUST_DIFFER_FROM_MAIN');
  return {
    production_deployments_enabled: enableMain,
    preview_deployment_setting: branch ? 'custom' : 'none',
    preview_branch_includes: branch ? [branch] : [],
    preview_branch_excludes: [],
  };
}

export function projectBody(spec) {
  return {
    name: spec.name,
    production_branch: 'main',
    build_config: {
      build_command: BUILD_COMMAND, destination_dir: 'ci-report', root_dir: '', build_caching: false,
    },
    deployment_configs: Object.fromEntries(['preview', 'production'].map((name) => [name, {
      build_image_major_version: 3, env_vars: structuredClone(ENV_VARS),
    }])),
    source: { type: 'github', config: {
      owner: spec.owner, repo_name: spec.repo, repo_id: spec.repositoryId,
      production_branch: 'main', ...scope(), pr_comments_enabled: false,
      path_includes: ['*'], path_excludes: [],
    } },
  };
}

export function sourceMatches(source, spec) {
  const config = source?.config;
  return source?.type === 'github' && config?.owner === spec.owner &&
    config?.repo_name === spec.repo && String(config?.repo_id) === spec.repositoryId;
}

export function projectDrift(project, spec) {
  const drift = [];
  const check = (condition, path) => { if (!condition) drift.push(path); };
  check(project?.name === spec.name, 'name');
  check(sourceMatches(project?.source, spec), 'source.identity');
  check(project?.production_branch === 'main', 'production_branch');
  const source = project?.source?.config ?? {};
  check(source.production_branch === 'main', 'source.production_branch');
  check(source.pr_comments_enabled === false, 'source.pr_comments_enabled');
  check(equal(source.path_includes, ['*']), 'source.path_includes');
  check(equal(source.path_excludes ?? [], []), 'source.path_excludes');
  check(typeof source.production_deployments_enabled === 'boolean', 'source.production_deployments_enabled');
  const scoped = source.preview_deployment_setting === 'none' ||
    (source.preview_deployment_setting === 'custom' && source.preview_branch_includes?.length === 1 &&
      (() => { try { validateBranch(source.preview_branch_includes[0]); return true; } catch { return false; } })());
  check(scoped, 'source.preview_deployment_setting');
  check(equal(source.preview_branch_excludes ?? [], []), 'source.preview_branch_excludes');
  const build = project?.build_config ?? {};
  check(build.build_command === BUILD_COMMAND, 'build_config.build_command');
  check(directory(build.destination_dir) === 'ci-report', 'build_config.destination_dir');
  check(directory(build.root_dir) === '', 'build_config.root_dir');
  check(build.build_caching === false, 'build_config.build_caching');
  check(empty(build.web_analytics_tag) && empty(build.web_analytics_token), 'build_config.web_analytics');
  check(project?.uses_functions !== true, 'uses_functions');
  check((project?.domains ?? []).every((domain) => domain === `${spec.name}.pages.dev`), 'domains');
  const metadata = new Set(['always_use_latest_compatibility_date', 'compatibility_date',
    'compatibility_flags', 'fail_open', 'usage_model', 'build_image_major_version', 'env_vars']);
  for (const environment of ['preview', 'production']) {
    const config = project?.deployment_configs?.[environment];
    check(config?.build_image_major_version === 3, `deployment_configs.${environment}.build_image_major_version`);
    check(Object.keys(config?.env_vars ?? {}).sort().join(',') === Object.keys(ENV_VARS).sort().join(','),
      `deployment_configs.${environment}.env_vars.names`);
    for (const [name, expected] of Object.entries(ENV_VARS)) {
      check(config?.env_vars?.[name]?.type === expected.type && config?.env_vars?.[name]?.value === expected.value,
        `deployment_configs.${environment}.env_vars.${name}`);
    }
    for (const [name, value] of Object.entries(config ?? {})) {
      if (!metadata.has(name)) check(empty(value), `deployment_configs.${environment}.${name}`);
    }
  }
  return drift;
}

export function assertProject(project, spec) {
  const drift = projectDrift(project, spec);
  requireThat(drift.length === 0, 'PROJECT_IDENTITY_OR_CONFIGURATION_DRIFT', { fields: drift });
}
export function currentScope(project) {
  const config = project.source.config;
  return Object.fromEntries(Object.keys(scope()).map((key) => [key, config[key] ?? []]));
}
export function assertDisabled(project) {
  requireThat(equal(currentScope(project), scope()), 'AUTOMATIC_BUILDS_MUST_BE_DISABLED');
}
export function activationBody(project, desiredScope) {
  const old = currentScope(project);
  const previewUnchanged = old.preview_deployment_setting === desiredScope.preview_deployment_setting &&
    equal(old.preview_branch_includes, desiredScope.preview_branch_includes) && equal(old.preview_branch_excludes, desiredScope.preview_branch_excludes);
  requireThat((old.preview_deployment_setting === 'none' || previewUnchanged) &&
    (!old.production_deployments_enabled || desiredScope.production_deployments_enabled), 'EXISTING_ACTIVATION_SCOPE_CONFLICT');
  // Only branch controls change. Source identity and unrelated project fields are never rewritten.
  return { source: { type: 'github', config: desiredScope } };
}

export function deploymentSummary(deployment) {
  return {
    id: deployment.id, projectId: deployment.project_id, projectName: deployment.project_name,
    createdAt: deployment.created_on, modifiedAt: deployment.modified_on,
    trigger: deployment.deployment_trigger?.type,
    branch: deployment.deployment_trigger?.metadata?.branch,
    commit: deployment.deployment_trigger?.metadata?.commit_hash,
    dirty: deployment.deployment_trigger?.metadata?.commit_dirty,
    environment: deployment.environment, url: deployment.url, usesFunctions: deployment.uses_functions,
    skipped: deployment.is_skipped, latestStage: deployment.latest_stage,
    stages: deployment.stages?.map(({ name, status, started_on, ended_on }) => ({ name, status, started_on, ended_on })),
  };
}
export function isSkipped(deployment) {
  const active = deployment.latest_stage?.status === 'active' ||
    deployment.stages?.some((stage) => stage.status === 'active');
  return !active && (deployment.is_skipped === true || deployment.latest_stage?.status === 'skipped');
}
export function terminal(deployment) {
  const stage = deployment.latest_stage;
  if (stage?.status === 'active' || deployment.stages?.some((item) => item.status === 'active')) return false;
  return isSkipped(deployment) || ['failure', 'canceled'].includes(stage?.status) ||
    (stage?.name === 'deploy' && stage?.status === 'success');
}
export function assertDeployment(deployment, project, spec, branch, sha) {
  // Pages deployment snapshots can omit repo_id. Bind their project ID to the
  // independently read current project, whose numeric repository ID is required.
  const source = deployment.source?.config;
  requireThat(sourceMatches(project.source, spec) && deployment.project_id === project.id &&
    deployment.project_name === spec.name && deployment.source?.type === 'github' &&
    source?.owner === spec.owner && source?.repo_name === spec.repo &&
    (source.repo_id == null || String(source.repo_id) === spec.repositoryId), 'DEPLOYMENT_SOURCE_IDENTITY_MISMATCH');
  requireThat(deployment.deployment_trigger?.metadata?.branch === branch &&
    deployment.deployment_trigger?.metadata?.commit_hash === sha &&
    deployment.deployment_trigger?.metadata?.commit_dirty === false,
  'DEPLOYMENT_SOURCE_SHA_OR_BRANCH_MISMATCH');
  const build = deployment.build_config;
  requireThat(build?.build_command === BUILD_COMMAND && directory(build.destination_dir) === 'ci-report' &&
    directory(build.root_dir) === '' && build.build_caching === false &&
    empty(build.web_analytics_tag) && empty(build.web_analytics_token) &&
    deployment.environment === (branch === 'main' ? 'production' : 'preview') &&
    equal(Object.keys(deployment.env_vars ?? {}).sort(), Object.keys(ENV_VARS).sort()) &&
    Object.entries(ENV_VARS).every(([name, expected]) => deployment.env_vars?.[name]?.type === expected.type &&
      deployment.env_vars?.[name]?.value === expected.value), 'DEPLOYMENT_BUILD_CONFIGURATION_MISMATCH');
}
export function immutableReceiptUrl(deployment, spec) {
  requireThat(typeof deployment.short_id === 'string' && /^[a-z0-9]{8}$/.test(deployment.short_id),
    'INVALID_IMMUTABLE_DEPLOYMENT_URL');
  const expected = `https://${deployment.short_id}.${spec.name}.pages.dev`;
  requireThat(deployment.url?.replace(/\/$/, '') === expected, 'INVALID_IMMUTABLE_DEPLOYMENT_URL');
  return `${expected}/receipt.json`;
}

export function validateCapacity(evidence, now = Date.now()) {
  requireThat(evidence?.accountId === ACCOUNT_ID &&
    evidence.allowOverage === false && evidence.maxNewBuilds === 1 &&
    typeof evidence.source === 'string' && evidence.source.length > 0,
  'CAPACITY_EVIDENCE_REQUIRED');
  const measured = evidence.schema === 'cloudflare-pages-capacity/v1' &&
    Number.isSafeInteger(evidence.availableBuilds) && evidence.availableBuilds >= 1;
  const included = evidence.schema === 'cloudflare-pages-capacity/v2' &&
    evidence.mode === 'included-pages-plan' && evidence.availableBuilds === null &&
    evidence.allowPlanChange === false && evidence.allowFunctions === false &&
    evidence.plan === 'free' && evidence.includedMonthlyBuildLimit === 500 &&
    evidence.headroomVerification === 'not-exposed-by-published-api' &&
    evidence.billingAssessment === 'fixed-plan-quota-inference';
  requireThat(measured || included, 'CAPACITY_EVIDENCE_REQUIRED');
  const age = now - Date.parse(evidence.observedAt);
  requireThat(Number.isFinite(age) && age >= -60_000 && age <= 15 * 60_000, 'CAPACITY_EVIDENCE_STALE');
}

export function assertReceipt(receipt, spec, branch, sha, manifestBytes, manifest) {
  const expectedPreflight = ['ci/cloudflare/run.test.mjs', ...(spec.repository === 'AyobamiH/donestate'
    ? ['ci/cloudflare-admin/pages.test.mjs'] : [])];
  requireThat(manifest?.schema === 'proofstate.cloudflare-ci-manifest.v1' &&
    manifest.repository?.name === spec.repository && String(manifest.repository?.id) === spec.repositoryId &&
    equal(manifest.jobs?.map((job) => job.id).sort(), [...EXPECTED_JOBS[spec.repository]].sort()) &&
    equal(manifest.basePolicy, BASE_POLICY) && equal(manifest.preflightTests, expectedPreflight),
  'MANIFEST_JOB_COVERAGE_MISMATCH');
  if (spec.repository === 'AyobamiH/agentproof') {
    requireThat(manifest.excludedCoverage?.some((item) => item.id === 'validate-macos-node24' &&
      item.platform === 'macos' && item.requiredSeparately === true), 'REQUIRED_MACOS_COVERAGE_MUST_REMAIN_SEPARATE');
  }
  requireThat(receipt?.schema === 'proofstate.cloudflare-ci.v1' && receipt.status === 'passed' &&
    receipt.evidenceKind === 'maintainer_engineering' && receipt.productionAuthorityProven === false &&
    receipt.independentAdoptionCredit === 0 && receipt.provider?.hostedReadbackVerified === false &&
    receipt.repository?.name === spec.repository && String(receipt.repository?.id) === spec.repositoryId &&
    receipt.source?.commit === sha && receipt.provider?.commit === sha &&
    /^[a-f0-9]{40}$/.test(receipt.source?.tree ?? '') && /^[a-f0-9]{40}$/.test(receipt.source?.baseCommit ?? '') &&
    /^[a-f0-9]{64}$/.test(receipt.source?.inventorySha256 ?? '') &&
    receipt.provider?.branch === branch && receipt.provider?.kind === 'cloudflare-pages' &&
    receipt.manifestSha256 === sha256(manifestBytes) && receipt.preflight?.status === 'passed' && receipt.preflight.exitCode === 0 &&
    receipt.preflight.node === '24.22.0' && equal(receipt.preflight.tests, expectedPreflight),
  'RECEIPT_SOURCE_OR_MANIFEST_MISMATCH');
  const actual = receipt.jobs?.map((job) => job.id).sort();
  const expected = manifest.jobs.map((job) => job.id).sort();
  requireThat(Array.isArray(actual) && equal(actual, expected) && new Set(actual).size === actual.length &&
    receipt.jobs.every((job) => job.status === 'passed' && job.commands?.length > 0 &&
      job.commands.every((command) => command.exitCode === 0)), 'RECEIPT_JOB_COVERAGE_MISMATCH');
  const commandIdentity = ({ tool, cwd, argv }) => ({ tool, cwd, argv });
  for (const expectedJob of manifest.jobs) {
    const actualJob = receipt.jobs.find((job) => job.id === expectedJob.id);
    requireThat(actualJob.node === expectedJob.node && actualJob.platform === expectedJob.platform &&
      Array.isArray(expectedJob.commands) && expectedJob.commands.length > 0 &&
      equal(actualJob.commands.map(commandIdentity), expectedJob.commands.map(commandIdentity)),
    'RECEIPT_COMMAND_OR_TOOLCHAIN_COVERAGE_MISMATCH');
  }
  requireThat(equal(receipt.excludedCoverage ?? [], manifest.excludedCoverage ?? []), 'RECEIPT_EXCLUDED_COVERAGE_MISMATCH');
}
