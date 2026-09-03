import fs from 'node:fs';

const VERSION = '0.12.9';
const dockerPath = 'apps/mcp-worker/Dockerfile';
const packagePath = 'apps/mcp-worker/package.json';
const lockPath = 'apps/mcp-worker/package-lock.json';
const checkPath = 'apps/mcp-worker/scripts/check-sandbox-version-sync.mjs';
const ledgerPath = 'governance/project-ledger.json';

const docker = fs.readFileSync(dockerPath, 'utf8');
if (!docker.includes('FROM docker.io/cloudflare/sandbox:0.7.0')) {
  throw new Error('expected historical cloudflare/sandbox:0.7.0 base was not found');
}
fs.writeFileSync(dockerPath, docker.replace('FROM docker.io/cloudflare/sandbox:0.7.0', `FROM docker.io/cloudflare/sandbox:${VERSION}`));

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (pkg.dependencies?.['@cloudflare/sandbox'] !== '^0.12.9') {
  throw new Error(`unexpected @cloudflare/sandbox package range: ${pkg.dependencies?.['@cloudflare/sandbox']}`);
}
pkg.dependencies['@cloudflare/sandbox'] = VERSION;
pkg.scripts['sandbox:version-check'] = 'node scripts/check-sandbox-version-sync.mjs';
pkg.scripts.check = 'npm run sandbox:version-check && npm run build && npm test';
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (lock.packages?.['']?.dependencies?.['@cloudflare/sandbox'] !== '^0.12.9') {
  throw new Error('unexpected root lockfile Sandbox dependency');
}
if (lock.packages?.['node_modules/@cloudflare/sandbox']?.version !== VERSION) {
  throw new Error('resolved Sandbox SDK version is not 0.12.9');
}
lock.packages[''].dependencies['@cloudflare/sandbox'] = VERSION;
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

fs.mkdirSync('apps/mcp-worker/scripts', { recursive: true });
fs.writeFileSync(checkPath, `import fs from "node:fs";\n\nconst packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));\nconst packageLock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));\nconst dockerfile = fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");\n\nconst sdkVersion = packageJson.dependencies?.["@cloudflare/sandbox"];\nif (typeof sdkVersion !== "string" || !/^\\d+\\.\\d+\\.\\d+$/.test(sdkVersion)) {\n  throw new Error("@cloudflare/sandbox must be pinned to one exact semantic version");\n}\nconst rootLockVersion = packageLock.packages?.[""]?.dependencies?.["@cloudflare/sandbox"];\nconst resolvedVersion = packageLock.packages?.["node_modules/@cloudflare/sandbox"]?.version;\nif (rootLockVersion !== sdkVersion || resolvedVersion !== sdkVersion) {\n  throw new Error(\`Sandbox package/lock mismatch: package=\${sdkVersion} rootLock=\${rootLockVersion} resolved=\${resolvedVersion}\`);\n}\nconst match = dockerfile.match(/^FROM\\s+docker\\.io\\/cloudflare\\/sandbox:([^\\s]+)$/m);\nif (!match) throw new Error("Dockerfile must use an explicit docker.io/cloudflare/sandbox:<version> base");\nconst imageVersion = match[1];\nif (imageVersion !== sdkVersion) {\n  throw new Error(\`Cloudflare Sandbox SDK/image mismatch: sdk=\${sdkVersion} image=\${imageVersion}\`);\n}\nconsole.log(\`Cloudflare Sandbox versions aligned at \${sdkVersion}\`);\n`);

const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
if (ledger.evidenceStories.some((story) => story.id === 'E-023')) throw new Error('E-023 already exists');
ledger.updatedAt = '2026-09-03';
const verify6 = ledger.workItems.find((item) => item.id === 'VERIFY-006');
if (!verify6) throw new Error('VERIFY-006 missing');
verify6.lastUpdated = '2026-09-03';
verify6.nextAction = 'Align the Cloudflare Sandbox npm SDK and container image at exact version 0.12.9, keep Codex 0.150.1 and HTTP transport unchanged for this correction, deploy only after normal review, then launch one fresh canary to determine whether the historical intermittent sandbox.exec HTTP 500 persists.';
verify6.waitCondition = 'Fresh issue 79 reached implementation on Worker adebd0c4-77c3-4ed0-9135-cd1003345258 after fresh-sandbox clone succeeded, then Sandbox.exec returned HTTP 500 after 194792 ms while running the unchanged Codex 0.150.1 command. Historical successful run 5ba4e808 completed the same Codex command in 158578 ms, and older maintenance runs alternated between implementation HTTP 500 failures and successful successor PRs. Repository inspection found an unsupported Cloudflare pairing: @cloudflare/sandbox 0.12.9 with cloudflare/sandbox:0.7.0. Correct that mismatch before adding Codex retries or changing transport.';
verify6.staleDate = '2026-09-10';
verify6.evidenceIds ??= [];
if (!verify6.evidenceIds.includes('E-023')) verify6.evidenceIds.push('E-023');

const verify4 = ledger.workItems.find((item) => item.id === 'VERIFY-004');
if (verify4) {
  verify4.lastUpdated = '2026-09-03';
  verify4.nextAction = 'After exact Sandbox 0.12.9 SDK/image alignment is reviewed and deployed with Codex and HTTP transport unchanged, run one fresh consequence-disabled maintenance canary through publication, exact-head CI, OpsTruth v2 response, and terminal DoneState read-back.';
  verify4.waitCondition = 'Issue 79 failed before publication at the Cloudflare Sandbox exec boundary. The next canary must wait for the one-variable SDK/image alignment so the experiment remains attributable; do not conflate this with the later HTTP-to-RPC migration.';
  verify4.staleDate = '2026-09-10';
  verify4.evidenceIds ??= [];
  if (!verify4.evidenceIds.includes('E-023')) verify4.evidenceIds.push('E-023');
}

ledger.evidenceStories.push({
  id: 'E-023',
  date: '2026-09-03',
  identity: 'Historical Sandbox implementation 500s traced to an unsupported SDK/image pairing before retry changes',
  situation: 'Fresh canary issue 79 reached the implementation step on DoneState Worker adebd0c4-77c3-4ed0-9135-cd1003345258 but produced no branch or pull request. Production observability recorded Sandbox.exec HTTP 500 after 194792 ms while running the unchanged Codex 0.150.1 implementation command.',
  verification: 'Historical comparison disproved a recent-regression theory: run 5ba4e808 completed the same Codex command in 158578 ms and published PR 66; earlier maintenance sequences also contain implementation HTTP 500 failures followed by successful successor runs. The Dockerfile has used cloudflare/sandbox:0.7.0 since the hosted control plane was introduced while the Worker lockfile resolves @cloudflare/sandbox 0.12.9. The current runtime also logs Using http transport. This change corrects only the documented SDK/image mismatch and adds a deterministic version-sync gate; Codex version, command, HTTP transport, OpsTruth, scheduler, webhook and retry semantics remain unchanged.',
  accountability: {
    owner: 'DoneState maintainers',
    status: 'active',
    nextAction: 'Review and deploy exact Sandbox SDK/image 0.12.9 alignment, confirm the deployed container image and version-sync gate, then launch a fresh canary without changing Codex or transport.',
    waitCondition: 'Do not add Codex retries or switch HTTP to RPC in the same experiment. Preserve issue 79 as terminal pre-publication failure evidence.',
    staleDate: '2026-09-10'
  },
  outcome: 'The implementation HTTP 500 is no longer being treated as proof of an OpenAI/Codex API failure. The first corrective layer is the objectively unsupported Cloudflare Sandbox package/image mismatch, isolated as one variable.',
  content: 'Exact successful and failed production command timings, historical HTTP 500/successor PR pattern, Worker and container versions, package-lock SDK version, Docker image version, and the one-variable correction boundary.',
  measurement: 'One successful comparable Codex exec at 158578 ms, one failed comparable exec at 194792 ms, at least two older HTTP 500 predecessor failures with successful successor PRs, SDK 0.12.9 versus image 0.7.0 mismatch found, and zero Codex/transport/retry changes in this correction.'
});

fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
