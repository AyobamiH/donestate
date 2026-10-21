#!/usr/bin/env node
// Trusted-source CI runner. It is not a sandbox for hostile pull requests.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, lstat, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, relative, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASE_POLICY = { pullRequest: 'github-open-pull-request-main-ancestor', main: 'git-first-parent-public-github-corroborated-single-commit-delta' };
export const TOOLCHAINS = {
  '22.23.3': 'df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de',
  '24.22.0': 'cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008',
};
const activeGroups = new Set();
let executionAbort;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function requireThat(value, code) { if (!value) throw new Error(code); }
export function safeSha(value) { requireThat(/^[a-f0-9]{40}$/.test(value ?? ''), 'FULL_SHA_REQUIRED'); return value; }
export function safeDirectory(root, value) {
  requireThat(typeof value === 'string' && !value.includes('\0'), 'INVALID_DIRECTORY');
  const target = resolve(root, value);
  requireThat(target === root || target.startsWith(`${root}/`), 'DIRECTORY_ESCAPE');
  return target;
}
export function isolatedEnvironment(bin, home, extra = {}) {
  const allowed = new Set(['GOVERNANCE_BASE_SHA', 'OPSTRUTH_BASE_REF', 'OPSTRUTH_HEAD_REF', 'OPSTRUTH_CHECK_STATUS', 'OPSTRUTH_BOUNDARY_STATUS']);
  for (const key of Object.keys(extra)) requireThat(allowed.has(key), 'UNAPPROVED_ENVIRONMENT_KEY');
  return {
    PATH: `${bin}${delimiter}/usr/local/bin${delimiter}/usr/bin${delimiter}/bin`, HOME: home, TMPDIR: home,
    CI: 'true', NO_COLOR: '1', LANG: 'C.UTF-8', WRANGLER_SEND_METRICS: 'false',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    npm_config_userconfig: join(home, 'empty.npmrc'), npm_config_globalconfig: join(home, 'empty-global.npmrc'),
    npm_config_cache: join(home, 'npm-cache'), npm_config_update_notifier: 'false', ...extra,
  };
}
export function providerIdentity(provider, environment, commit, project) {
  requireThat(['local', 'cloudflare-pages'].includes(provider), 'INVALID_PROVIDER');
  safeSha(commit);
  if (provider === 'local') return { kind: 'local', hostedReadbackVerified: false, commit };
  requireThat(environment.CF_PAGES === '1' && environment.CF_PAGES_COMMIT_SHA === commit, 'PAGES_SOURCE_MISMATCH');
  const branch = environment.CF_PAGES_BRANCH;
  requireThat(typeof branch === 'string' && branch.length > 0 && branch.length <= 200 && !/[\x00-\x20]/.test(branch), 'BRANCH_REQUIRED');
  const url = new URL(environment.CF_PAGES_URL);
  requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    new RegExp(`^[a-z0-9]{8}\\.${project.replaceAll('.', '\\.')}\\.pages\\.dev$`).test(url.hostname) &&
    url.pathname === '/' && !url.search && !url.hash, 'IMMUTABLE_PAGES_URL_REQUIRED');
  return { kind: provider, hostedReadbackVerified: false, commit, branch, url: url.origin };
}
export function validateManifest(manifest) {
  requireThat(manifest.schema === 'proofstate.cloudflare-ci-manifest.v1', 'MANIFEST_SCHEMA');
  requireThat(/^AyobamiH\/(agentproof|donestate|opstruth-chatgpt-plugin)$/.test(manifest.repository?.name ?? ''), 'REPOSITORY_SCOPE');
  requireThat(/^\d+$/.test(String(manifest.repository.id)), 'REPOSITORY_ID_REQUIRED');
  requireThat(JSON.stringify(manifest.basePolicy) === JSON.stringify(BASE_POLICY), 'BASE_POLICY');
  requireThat(Array.isArray(manifest.jobs) && manifest.jobs.length > 0 && manifest.jobs.length <= 5, 'JOB_COUNT');
  requireThat(new Set(manifest.jobs.map(j => j.id)).size === manifest.jobs.length, 'DUPLICATE_JOB');
  for (const job of manifest.jobs) {
    requireThat(/^[a-z0-9-]+$/.test(job.id) && job.platform === 'linux' && Object.hasOwn(TOOLCHAINS, job.node), 'JOB_IDENTITY');
    requireThat(job.commands?.length > 0 && job.commands.length <= 10, 'COMMAND_COUNT');
    for (const command of job.commands) {
      requireThat(['node', 'npm'].includes(command.tool), 'COMMAND_TOOL_NOT_ALLOWED');
      requireThat(Array.isArray(command.argv) && command.argv.every(v => typeof v === 'string' && !v.includes('\0')), 'COMMAND_ARGUMENTS');
      safeDirectory('/source', command.cwd);
    }
  }
  return manifest;
}

export async function runCommand(file, argv, { cwd, env, timeoutMs, outputLimit = 1024 * 1024 } = {}) {
  requireThat(Number.isFinite(timeoutMs) && timeoutMs > 0, 'DEADLINE_EXHAUSTED');
  const startedAt = new Date().toISOString();
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(file, argv, { cwd, env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    activeGroups.add(child.pid);
    let timedOut = false; let bytes = 0; let tail = ''; const hash = createHash('sha256');
    const collect = chunk => { bytes += chunk.length; hash.update(chunk); tail = (tail + chunk.toString('utf8')).slice(-4000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const signalGroup = signal => { try { process.kill(-child.pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; } };
    let killTimer;
    const timer = setTimeout(() => { timedOut = true; signalGroup('SIGTERM'); killTimer = setTimeout(() => signalGroup('SIGKILL'), 750); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); clearTimeout(killTimer); reject(error); });
    child.once('close', (code, signal) => {
      activeGroups.delete(child.pid);
      clearTimeout(timer); clearTimeout(killTimer);
      // Retire any ordinary background descendants even when the direct child succeeded.
      signalGroup('SIGKILL');
      resolvePromise({ exitCode: timedOut ? 124 : code, signal, timedOut, startedAt, completedAt: new Date().toISOString(),
        outputBytes: bytes, outputSha256: hash.digest('hex'), outputOverLimit: bytes > outputLimit, tail });
    });
  });
}
function git(root, args, env) {
  return execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 }).trim();
}
export async function sourceIdentity(root, env) {
  const commit = safeSha(git(root, ['rev-parse', 'HEAD'], env));
  requireThat(git(root, ['status', '--porcelain', '--untracked-files=all'], env) === '', 'SOURCE_DIRTY');
  const flags = git(root, ['ls-files', '-v'], env).split('\n');
  requireThat(flags.every(line => line.startsWith('H ')), 'HIDDEN_INDEX_FLAGS');
  const records = [];
  for (const line of git(root, ['ls-files', '-s'], env).split('\n')) {
    const [meta, path] = line.split('\t');
    requireThat(path && !meta.startsWith('160000'), 'SUBMODULE_REFUSED');
    const target = safeDirectory(root, path); const info = await lstat(target);
    requireThat(info.isFile() && !info.isSymbolicLink(), 'NON_REGULAR_SOURCE_REFUSED');
    records.push([path, meta.split(' ')[0], digest(await readFile(target))]);
  }
  return { commit, tree: safeSha(git(root, ['rev-parse', 'HEAD^{tree}'], env)), inventorySha256: digest(JSON.stringify(records)) };
}
async function boundedGet(url, maximum = 2 * 1024 * 1024, timeoutMs = 30000) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ProofState-Cloudflare-CI', Accept: 'application/json' }, redirect: 'error', signal: executionAbort ? AbortSignal.any([executionAbort.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  requireThat(response.ok, `HTTP_${response.status}`);
  const reader = response.body.getReader(); let length = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length;
    if (length > maximum) { await reader.cancel(); throw new Error('RESPONSE_TOO_LARGE'); } chunks.push(value); }
  return Buffer.concat(chunks);
}
async function baseIdentity(root, manifest, provider, env) {
  const repository = manifest.repository.name;
  const meta = JSON.parse(await boundedGet(`https://api.github.com/repos/${repository}`));
  requireThat(String(meta.id) === String(manifest.repository.id) && meta.full_name === repository, 'REMOTE_REPOSITORY_ID_MISMATCH');
  if (git(root, ['rev-parse', '--is-shallow-repository'], env) === 'true') {
    const fetched = await runCommand('git', ['fetch', '--unshallow', '--no-tags', 'origin', provider.branch], { cwd: root, env, timeoutMs: 60000 });
    requireThat(fetched.exitCode === 0, 'SOURCE_HISTORY_FETCH_FAILED');
  }
  let base;
  if (provider.branch === 'main') {
    const remote = JSON.parse(await boundedGet(`https://api.github.com/repos/${repository}/git/commits/${provider.commit}`));
    base = safeSha(remote.parents?.[0]?.sha);
    requireThat(git(root, ['rev-parse', 'HEAD^'], env) === base, 'FIRST_PARENT_MISMATCH');
    return { baseCommit: base, baseSource: 'git-first-parent', baseScope: 'single-commit-delta', baseCorroboration: 'github-git-commit-first-parent' };
  }
  const pulls = JSON.parse(await boundedGet(`https://api.github.com/repos/${repository}/pulls?state=open&base=main&head=${encodeURIComponent(`AyobamiH:${provider.branch}`)}&per_page=10`));
  requireThat(Array.isArray(pulls), 'PULL_REQUEST_READBACK');
  const matches = pulls.filter(p => p.head?.sha === provider.commit && p.head?.repo?.id === Number(manifest.repository.id) && p.base?.ref === 'main');
  requireThat(matches.length === 1, 'EXACT_OPEN_PULL_REQUEST_REQUIRED');
  base = safeSha(matches[0].base.sha);
  const result = await runCommand('git', ['fetch', '--no-tags', 'origin', base], { cwd: root, env, timeoutMs: 45000 });
  requireThat(result.exitCode === 0, 'BASE_FETCH_FAILED');
  requireThat(git(root, ['merge-base', base, 'HEAD'], env) === base, 'PR_MUST_INCLUDE_CURRENT_MAIN');
  return { baseCommit: base, baseSource: 'github-open-pull-request', baseScope: 'pull-request-delta', baseCorroboration: 'github-main-ancestor', pullRequest: matches[0].number };
}
async function nodeBinary(version, temporary, env) {
  if (process.versions.node === version) return process.execPath;
  const name = `node-v${version}-linux-x64.tar.xz`;
  console.log(JSON.stringify({ stage: 'toolchain-download', node: version }));
  const archive = await boundedGet(`https://nodejs.org/dist/v${version}/${name}`, 80 * 1024 * 1024, 60000);
  requireThat(digest(archive) === TOOLCHAINS[version], 'NODE_ARCHIVE_DIGEST_MISMATCH');
  const path = join(temporary, name); await writeFile(path, archive, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ stage: 'toolchain-extract', node: version, timeoutMs: 120000 }));
  const unpacked = await runCommand('tar', ['-xJf', path, '-C', temporary], { cwd: temporary, env, timeoutMs: 120000 });
  if (unpacked.exitCode !== 0) {
    console.error(JSON.stringify({ stage: 'node-extraction', version, exitCode: unpacked.exitCode, timedOut: unpacked.timedOut, signal: unpacked.signal, detail: unpacked.tail.slice(-1500) }));
  }
  requireThat(unpacked.exitCode === 0, unpacked.timedOut ? 'NODE_EXTRACTION_TIMEOUT' : 'NODE_EXTRACTION_FAILED');
  const binary = join(temporary, `node-v${version}-linux-x64/bin/node`);
  requireThat(execFileSync(binary, ['--version'], { env, encoding: 'utf8' }).trim() === `v${version}`, 'NODE_VERSION_MISMATCH');
  return binary;
}
function expand(value, replacements) { return value.replace(/\{([A-Z_]+)\}/g, (_, name) => { requireThat(name in replacements, 'UNKNOWN_PLACEHOLDER'); return replacements[name]; }); }
async function writeReport(root, report) {
  const directory = join(root, 'ci-report'); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'receipt.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Proof & State CI</title><h1>Cloudflare CI evidence</h1><p>Engineering validation only. No release or production acceptance is implied.</p><a href="receipt.json">Exact-source receipt</a>');
  await writeFile(join(directory, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Cache-Control: no-store\n');
}
export async function execute(providerName, root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')) {
  requireThat(process.platform === 'linux' && process.arch === 'x64', 'LINUX_X64_REQUIRED');
  const temporary = await mkdtemp(join(tmpdir(), 'proofstate-ci-')); const deadline = Date.now() + 18 * 60 * 1000;
  executionAbort = new AbortController();
  const cancel = () => { executionAbort.abort(); for (const pid of activeGroups) { try { process.kill(-pid, 'SIGKILL'); } catch {} } };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const outerTimer = setTimeout(cancel, Math.max(1, deadline - Date.now()));
  const report = { schema: 'proofstate.cloudflare-ci.v1', status: 'failed', evidenceKind: 'maintainer_engineering',
    productionAuthorityProven: false, independentAdoptionCredit: 0, startedAt: new Date().toISOString(), jobs: [],
    bounds: { deadlineMs: 18 * 60 * 1000, retries: 0, processGroupCleanup: true } };
  try {
    await writeFile(join(temporary, 'empty.npmrc'), ''); await writeFile(join(temporary, 'empty-global.npmrc'), '');
    const env = isolatedEnvironment(dirname(process.execPath), temporary);
    const manifestBytes = await readFile(join(root, 'ci/cloudflare/manifest.json'));
    const manifest = validateManifest(JSON.parse(manifestBytes)); report.manifestSha256 = digest(manifestBytes);
    report.repository = manifest.repository; report.excludedCoverage = manifest.excludedCoverage ?? [];
    console.log(JSON.stringify({ stage: 'source-validation', provider: providerName }));
    report.source = await sourceIdentity(root, env);
    report.provider = providerIdentity(providerName, process.env, report.source.commit, manifest.project);
    if (providerName === 'local') report.provider.branch = git(root, ['branch', '--show-current'], env);
    Object.assign(report.source, await baseIdentity(root, manifest, report.provider, env));
    const binaries = {};
    for (const version of new Set(['24.22.0', ...manifest.jobs.map(j => j.node)])) binaries[version] = await nodeBinary(version, temporary, env);
    console.log(JSON.stringify({ stage: 'preflight', tests: manifest.preflightTests }));
    const preflight = await runCommand(binaries['24.22.0'], ['--test', ...manifest.preflightTests], {
      cwd: root, env: isolatedEnvironment(dirname(binaries['24.22.0']), temporary), timeoutMs: 60000 });
    report.preflight = { status: preflight.exitCode === 0 ? 'passed' : 'failed', exitCode: preflight.exitCode, node: '24.22.0', tests: manifest.preflightTests };
    requireThat(preflight.exitCode === 0, `PREFLIGHT_FAILED\n${preflight.tail}`);
    for (const job of manifest.jobs) {
      const work = join(temporary, job.id); const home = join(temporary, `${job.id}-home`); await mkdir(home);
      await writeFile(join(home, 'empty.npmrc'), ''); await writeFile(join(home, 'empty-global.npmrc'), '');
      const binary = binaries[job.node]; const jobEnv = isolatedEnvironment(dirname(binary), home);
      git(root, ['worktree', 'add', '--detach', work, report.source.commit], env);
      const item = { id: job.id, node: job.node, platform: job.platform, status: 'failed', commands: [] }; report.jobs.push(item);
      const replacements = { SOURCE_SHA: report.source.commit, BASE_SHA: report.source.baseCommit, ARTIFACT_DIR: home };
      for (const command of job.commands) {
        requireThat(!executionAbort.signal.aborted && Date.now() < deadline, 'CANCELLED_OR_DEADLINE');
        const argv = command.argv.map(value => expand(value, replacements));
        const extra = Object.fromEntries(Object.entries(command.env ?? {}).map(([k,v]) => [k, expand(v, replacements)]));
        const commandEnv = isolatedEnvironment(dirname(binary), home, extra);
        console.log(JSON.stringify({ stage: 'command-start', job: job.id, index: item.commands.length + 1, tool: command.tool }));
        const result = await runCommand(command.tool === 'node' ? binary : join(dirname(binary), 'npm'), argv, {
          cwd: safeDirectory(work, command.cwd), env: commandEnv, timeoutMs: Math.min(6 * 60 * 1000, deadline - Date.now()) });
        const { tail, ...metadata } = result; item.commands.push({ tool: command.tool, cwd: command.cwd, argv: command.argv, ...metadata });
        console.log(`${job.id}: ${command.tool} ${command.argv.slice(0,2).join(' ')} => ${result.exitCode}`);
        if (result.exitCode !== 0) { console.error(tail); throw new Error(`JOB_FAILED:${job.id}`); }
      }
      const afterJob = await sourceIdentity(work, jobEnv);
      requireThat(afterJob.inventorySha256 === report.source.inventorySha256, 'JOB_MUTATED_SOURCE');
      item.status = 'passed';
      git(root, ['worktree', 'remove', '--force', work], env);
    }
    const after = await sourceIdentity(root, env);
    requireThat(after.inventorySha256 === report.source.inventorySha256, 'SOURCE_CHANGED');
    report.status = 'passed';
  } catch (error) {
    report.error = /^[A-Z0-9_:]+$/.test(error.message ?? '') ? error.message : 'CI_FAILED';
    console.error(error.message); process.exitCode = 1;
  } finally {
    clearTimeout(outerTimer); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    executionAbort = undefined;
    try { await rm(temporary, { recursive: true, force: true }); report.cleanup = 'completed'; }
    catch { report.cleanup = 'failed'; report.status = 'failed'; process.exitCode = 1; }
    report.finishedAt = new Date().toISOString(); await writeReport(root, report);
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireThat(process.argv.length === 4 && process.argv[2] === '--provider', 'EXPLICIT_PROVIDER_REQUIRED');
  await execute(process.argv[3]);
}
