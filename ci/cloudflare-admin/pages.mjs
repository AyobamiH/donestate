#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { ACCOUNT_ID, AdminError, PROJECTS, activationBody, assertDeployment, assertDisabled,
  assertProject, assertReceipt, currentScope, deploymentSummary, immutableReceiptUrl, projectBody,
  projectDrift, requireThat, scope, sha256, sourceMatches, subject, terminal, validateBranch, validateCapacity,
  validateDeploymentId, validateSha } from './contracts.mjs';
import { client, createReport, readEvidence } from './io.mjs';

const ACTIONS = new Set(['inspect', 'provision', 'trigger', 'retry', 'status', 'activate']);
const FLAGS = new Set(['repository', 'repository-id', 'report', 'branch', 'sha', 'deployment',
  'capacity-evidence', 'coverage-evidence', 'enable-main']);

export function parseArguments(argv) {
  const [action, ...args] = argv;
  requireThat(ACTIONS.has(action), 'EXPLICIT_ACTION_REQUIRED');
  const options = { action };
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '');
    const value = args[index + 1];
    requireThat(args[index]?.startsWith('--') && FLAGS.has(name) && value && !value.startsWith('--') &&
      !Object.hasOwn(options, name), 'INVALID_OR_DUPLICATE_ARGUMENT');
    options[name] = value;
  }
  return validateOptions(options);
}

function validateOptions(options) {
  const { action } = options;
  requireThat(ACTIONS.has(action), 'EXPLICIT_ACTION_REQUIRED');
  requireThat(options.repository && options['repository-id'] && options.report, 'EXPECTED_SUBJECT_AND_REPORT_REQUIRED');
  subject(options.repository, options['repository-id']);
  if (['trigger', 'retry', 'status', 'activate'].includes(action)) {
    validateBranch(options.branch); validateSha(options.sha);
  }
  if (['retry', 'status', 'activate'].includes(action)) validateDeploymentId(options.deployment);
  if (options['enable-main'] !== undefined) {
    requireThat(action === 'activate' && ['true', 'false'].includes(options['enable-main']), 'INVALID_MAIN_ACTIVATION');
  }
  return options;
}

function projectSummary(project, spec) {
  if (!project) return null;
  return {
    id: project.id, name: project.name,
    source: { matchesExpectedIdentity: sourceMatches(project.source, spec), type: project.source?.type },
    buildCommandMatches: project.build_config?.build_command === projectBody(spec).build_config.build_command,
    automaticBuilds: project.source?.config ? currentScope(project) : null,
    usesFunctions: project.uses_functions, drift: projectDrift(project, spec),
    latestDeployment: project.latest_deployment ? deploymentSummary(project.latest_deployment) : null,
  };
}

async function capacity(options, report, now) {
  const evidence = await readEvidence(options['capacity-evidence']);
  validateCapacity(evidence.value, now());
  report.capacity = {
    evidence: evidence.reference, schema: evidence.value.schema, mode: evidence.value.mode,
    observedAt: evidence.value.observedAt,
    availableBuilds: evidence.value.availableBuilds, maxNewBuilds: 1, allowOverage: false,
    allowPlanChange: evidence.value.allowPlanChange, allowFunctions: evidence.value.allowFunctions,
    plan: evidence.value.plan, includedMonthlyBuildLimit: evidence.value.includedMonthlyBuildLimit,
    headroomVerification: evidence.value.headroomVerification, billingAssessment: evidence.value.billingAssessment,
    verification: 'operator-reviewed-provider-evidence; not independently measured by this helper',
  };
}

async function branchHead(http, spec, branch, sha) {
  const response = await http.publicJson(`https://api.github.com/repos/${spec.repository}/git/ref/heads/${encodeURIComponent(branch)}`);
  requireThat(response.value?.object?.type === 'commit' && response.value.object.sha === sha,
    'CURRENT_GITHUB_BRANCH_HEAD_MISMATCH');
}

async function history(http, spec) {
  const deployments = [];
  for (let page = 1; page <= 3; page += 1) {
    const response = await http.api(`/${spec.name}/deployments?page=${page}&per_page=10`);
    requireThat(Array.isArray(response.value) && response.value.length <= 10, 'INVALID_DEPLOYMENT_HISTORY');
    deployments.push(...response.value);
    const info = response.envelope.result_info;
    requireThat(info?.per_page == null || info.per_page === 10, 'UNEXPECTED_HISTORY_PAGE_SIZE');
    if (Number.isSafeInteger(info?.total_pages)) {
      if (page >= info.total_pages) return deployments;
    } else if (Number.isSafeInteger(info?.total_count)) {
      if (deployments.length >= info.total_count) return deployments;
    } else if (response.value.length < 10) return deployments;
  }
  throw new AdminError('DEPLOYMENT_HISTORY_LIMIT_RECONCILE_MANUALLY');
}

async function noConcurrentManagedBuild(http, spec, deployments) {
  requireThat(deployments.every(terminal), 'EXISTING_BUILD_STILL_IN_PROGRESS');
  for (const other of Object.values(PROJECTS)) {
    if (other.name === spec.name) continue;
    const response = await http.api(`/${other.name}`, { missing: true });
    const latest = response?.value?.latest_deployment;
    requireThat(!latest || terminal(latest), 'OTHER_MANAGED_PROJECT_BUILD_IN_PROGRESS');
  }
}

async function sourceReadback(http, report, project, spec, options) {
  const response = await http.api(`/${spec.name}/deployments/${options.deployment}`);
  const deployment = response.value;
  report.deployment = deploymentSummary(deployment);
  assertDeployment(deployment, project, spec, options.branch, options.sha);
  if (!terminal(deployment)) return { outcome: 'BUILD_IN_PROGRESS', deployment };
  const logs = await http.api(`/${spec.name}/deployments/${options.deployment}/history/logs`);
  report.logs = { sha256: sha256(logs.bytes), total: logs.value.total,
    returnedLines: logs.value.data?.length, includesContainerLogs: logs.value.includes_container_logs,
    storage: 'digest only; untrusted log text and provider error bodies are not emitted' };
  if (deployment.latest_stage.status !== 'success' || deployment.is_skipped) return { outcome: 'BUILD_FAILED', deployment };
  requireThat(deployment.latest_stage.name === 'deploy' && deployment.latest_stage.ended_on &&
    deployment.uses_functions === false && deployment.stages?.some((stage) => stage.name === 'build' && stage.status === 'success'),
  'STATIC_BUILD_COMPLETION_NOT_CONFIRMED');
  const receiptUrl = immutableReceiptUrl(deployment, spec);
  const receipt = await http.publicJson(receiptUrl, { maximumBytes: 2 * 1024 * 1024 });
  requireThat(receipt.value.provider?.url === deployment.url.replace(/\/$/, ''), 'RECEIPT_DEPLOYMENT_URL_MISMATCH');
  const manifestUrl = `https://raw.githubusercontent.com/${spec.repository}/${options.sha}/ci/cloudflare/manifest.json`;
  const manifest = await http.publicJson(manifestUrl, { maximumBytes: 512 * 1024 });
  assertReceipt(receipt.value, spec, options.branch, options.sha, manifest.bytes, manifest.value);
  report.receipt = {
    url: receiptUrl, sha256: sha256(receipt.bytes), manifestUrl, manifestSha256: sha256(manifest.bytes),
    sourceCommit: receipt.value.source.commit, sourceTree: receipt.value.source.tree,
    baseSource: receipt.value.source.baseSource, baseScope: receipt.value.source.baseScope,
    baseCorroboration: receipt.value.source.baseCorroboration,
    jobIds: receipt.value.jobs.map((job) => job.id),
    excludedCoverage: receipt.value.excludedCoverage,
    coverageDecision: 'source and declared Linux jobs verified; required-check trust and separate coverage require review',
  };
  return { outcome: 'SOURCE_VERIFIED', deployment, manifest: manifest.value, receipt: receipt.value };
}

async function coverageReview(options, report, spec, readback) {
  const evidence = await readEvidence(options['coverage-evidence']);
  const review = evidence.value;
  requireThat(review?.schema === 'cloudflare-pages-coverage-review/v1' && review.repository === spec.repository &&
    String(review.repositoryId) === spec.repositoryId && review.commit === options.sha && review.branch === options.branch &&
    review.deploymentId === options.deployment && review.accepted === true && review.excludedCoveragePreserved === true &&
    Number.isSafeInteger(review.nativeCheck?.appId) && review.nativeCheck.appId > 0 &&
    typeof review.nativeCheck?.context === 'string' && review.nativeCheck.context.length > 0 &&
    JSON.stringify([...(review.acceptedJobIds ?? [])].sort()) === JSON.stringify(readback.manifest.jobs.map((job) => job.id).sort()),
  'EXPLICIT_COVERAGE_AND_NATIVE_CHECK_REVIEW_REQUIRED');
  report.coverageReview = { evidence: evidence.reference, nativeCheck: review.nativeCheck,
    acceptedJobIds: review.acceptedJobIds, excludedCoveragePreserved: true };
}

export async function execute(options, { token, fetchImpl = fetch, now = Date.now } = {}) {
  validateOptions(options);
  const spec = subject(options.repository, options['repository-id']);
  const report = {
    schema: 'proofstate.cloudflare-pages-admin.v1', action: options.action,
    accountId: ACCOUNT_ID, repository: spec.repository, repositoryId: spec.repositoryId, project: spec.name,
    expectedSource: options.sha ? { branch: options.branch, commit: options.sha } : undefined,
    startedAt: new Date(now()).toISOString(), phase: 'PREFLIGHT', requests: [],
    cancellation: 'No documented Pages cancellation API; no DELETE or implicit retry is implemented.',
  };
  const persist = await createReport(options.report, report);
  try {
    const http = client({ token, fetchImpl, now, report, persist });
    const projectResponse = await http.api(`/${spec.name}`, { missing: true });
    let project = projectResponse?.value ?? null;
    report.projectReadback = projectSummary(project, spec);
    if (options.action === 'inspect') {
      report.plan = projectBody(spec);
      if (project) assertProject(project, spec);
      report.outcome = project ? 'INSPECTED' : 'ABSENT';
    } else if (options.action === 'provision') {
      if (project) {
        assertProject(project, spec);
        report.outcome = 'ALREADY_PROVISIONED';
      } else {
        const created = await http.api('', { method: 'POST', body: projectBody(spec) });
        report.createdProjectId = created.value?.id;
        project = (await http.api(`/${spec.name}`)).value;
        assertProject(project, spec); assertDisabled(project);
        requireThat(!project.latest_deployment, 'UNEXPECTED_INITIAL_BUILD_REQUIRES_RECONCILIATION');
        report.projectReadback = projectSummary(project, spec);
        report.outcome = 'PROVISIONED_DISABLED';
      }
    } else {
      requireThat(project, 'PROJECT_NOT_PROVISIONED');
      assertProject(project, spec);
      if (options.action === 'status') {
        report.outcome = (await sourceReadback(http, report, project, spec, options)).outcome;
      } else if (options.action === 'activate') {
        const readback = await sourceReadback(http, report, project, spec, options);
        requireThat(readback.outcome === 'SOURCE_VERIFIED', 'SOURCE_ACCEPTANCE_REQUIRED_BEFORE_ACTIVATION');
        await coverageReview(options, report, spec, readback);
        const enableMain = options['enable-main'] === 'true';
        if (enableMain) requireThat(options.branch === 'main' && readback.receipt.source.baseSource === 'git-first-parent' &&
          readback.receipt.source.baseScope === 'single-commit-delta' &&
          readback.receipt.source.baseCorroboration === 'github-git-commit-first-parent', 'MAIN_FIRST_PARENT_ACCEPTANCE_REQUIRED');
        requireThat(options.branch !== 'main' || enableMain, 'MAIN_ACTIVATION_MUST_BE_EXPLICIT');
        const old = currentScope(project);
        const previewBranch = options.branch === 'main' ? old.preview_branch_includes[0] ?? null : options.branch;
        const desired = scope(previewBranch, enableMain || old.production_deployments_enabled);
        const body = activationBody(project, desired);
        requireThat(project.source.config.deployments_enabled !== false, 'AUTOMATIC_DEPLOYMENTS_GLOBALLY_DISABLED');
        if (JSON.stringify(currentScope(project)) === JSON.stringify(desired)) {
          report.outcome = 'ALREADY_ACTIVATED';
        } else {
          await capacity(options, report, now);
          await http.api(`/${spec.name}`, { method: 'PATCH', body });
          project = (await http.api(`/${spec.name}`)).value;
          assertProject(project, spec);
          requireThat(project.source.config.deployments_enabled !== false, 'AUTOMATIC_DEPLOYMENTS_GLOBALLY_DISABLED');
          requireThat(JSON.stringify(currentScope(project)) === JSON.stringify(desired), 'ACTIVATION_READBACK_MISMATCH');
          report.projectReadback = projectSummary(project, spec);
          report.outcome = 'ACTIVATED_SCOPED';
        }
      } else {
        // First acceptance builds are manual, one at a time. A main bootstrap may
        // preserve an accepted preview scope while production triggers stay off.
        const deployments = await history(http, spec);
        const existing = deployments.find((item) => item.deployment_trigger?.metadata?.commit_hash === options.sha &&
          item.deployment_trigger?.metadata?.branch === options.branch);
        if (options.action === 'trigger' && existing) {
          assertDeployment(existing, project, spec, options.branch, options.sha);
          report.deployment = deploymentSummary(existing);
          requireThat(existing.latest_stage?.status !== 'failure', 'EXPLICIT_RETRY_REQUIRED_AFTER_TERMINAL_FAILURE');
          report.outcome = 'EXISTING_DEPLOYMENT';
        } else {
          const controls = project.source.config;
          requireThat(options.branch === 'main' ? controls.production_deployments_enabled === false :
            controls.preview_deployment_setting === 'none' || !controls.preview_branch_includes.includes(options.branch),
          'REQUESTED_BRANCH_ALREADY_AUTOMATIC');
          await noConcurrentManagedBuild(http, spec, deployments);
          await capacity(options, report, now);
          await branchHead(http, spec, options.branch, options.sha);
          let started;
          if (options.action === 'retry') {
            const failed = (await http.api(`/${spec.name}/deployments/${options.deployment}`)).value;
            assertDeployment(failed, project, spec, options.branch, options.sha);
            requireThat(failed.latest_stage?.status === 'failure' && terminal(failed) && failed.latest_stage.ended_on,
              'RETRY_REQUIRES_VERIFIED_TERMINAL_FAILURE');
            started = await http.api(`/${spec.name}/deployments/${options.deployment}/retry`, { method: 'POST' });
          } else {
            const body = new FormData();
            body.set('branch', options.branch);
            // commit_hash is associated metadata, not a checkout pin. Deliberately never send it.
            started = await http.api(`/${spec.name}/deployments`, { method: 'POST', body });
          }
          validateDeploymentId(started.value?.id);
          report.createdDeploymentId = started.value.id;
          const deployment = (await http.api(`/${spec.name}/deployments/${started.value.id}`)).value;
          report.deployment = deploymentSummary(deployment);
          assertDeployment(deployment, project, spec, options.branch, options.sha);
          report.outcome = 'BUILD_REQUESTED_SOURCE_READ_BACK';
        }
      }
    }
    report.phase = 'SETTLED';
  } catch (error) {
    const known = error instanceof AdminError;
    const acknowledgedMutation = report.requests.some((request) => request.method !== 'GET' &&
      request.status >= 200 && request.status < 300);
    report.outcome = acknowledgedMutation || (known && error.details.ambiguous) ? 'AMBIGUOUS_EFFECT' : 'BLOCKED';
    report.phase = 'STOPPED';
    report.error = known ? { code: error.code, ...error.details } : { code: 'LOCAL_OPERATION_FAILED' };
    // Provider bodies, token values, exception messages and stacks are intentionally omitted.
  }
  report.completedAt = new Date(now()).toISOString();
  await persist();
  return report;
}

async function main() {
  if (process.argv[2] === '--help') {
    console.log('pages.mjs <inspect|provision|trigger|retry|status|activate> --repository OWNER/REPO --repository-id ID --report /outside/repository/report.json');
    console.log('Build actions also require --branch BRANCH --sha FULL_SHA; status/retry/activate require --deployment UUID. See README.md for evidence inputs.');
    return;
  }
  const report = await execute(parseArguments(process.argv.slice(2)), { token: process.env.CLOUDFLARE_API_TOKEN });
  console.log(JSON.stringify({ action: report.action, outcome: report.outcome, project: report.project,
    deploymentId: report.deployment?.id, error: report.error, report: process.argv[process.argv.indexOf('--report') + 1] }));
  if (['BLOCKED', 'AMBIGUOUS_EFFECT', 'BUILD_FAILED'].includes(report.outcome)) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ outcome: 'BLOCKED', error: error instanceof AdminError ? error.code : 'LOCAL_OPERATION_FAILED' }));
    process.exitCode = 1;
  });
}
