import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = '9f0058975321b6f9b9075aee48cae9840cae39b6';
let text = execFileSync('git', ['show', `${BASE}:governance/project-ledger.json`], { encoding: 'utf8' });

text = text.replace('"updatedAt": "2026-09-02"', '"updatedAt": "2026-09-03"');

function updateWorkItem(id, values) {
  const marker = `"id":"${id}"`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`${id} not found`);
  const blockStart = text.lastIndexOf('    {', start);
  const blockEnd = text.indexOf('\n    }', start) + '\n    }'.length;
  let block = text.slice(blockStart, blockEnd);
  for (const [key, value] of Object.entries(values)) {
    const escaped = JSON.stringify(value);
    const re = new RegExp(`"${key}":(?:"(?:[^"\\\\]|\\\\.)*"|\\[[^\\]]*\\])`);
    if (!re.test(block)) throw new Error(`${id}.${key} not found`);
    block = block.replace(re, `"${key}":${escaped}`);
  }
  const evidenceMatch = block.match(/"evidenceIds":\[([^\]]*)\]/);
  if (!evidenceMatch) throw new Error(`${id}.evidenceIds not found`);
  if (!evidenceMatch[1].includes('"E-023"')) {
    const inside = evidenceMatch[1].trim();
    block = block.replace(evidenceMatch[0], `"evidenceIds":[${inside}${inside ? ',' : ''}"E-023"]`);
  }
  text = text.slice(0, blockStart) + block + text.slice(blockEnd);
}

updateWorkItem('VERIFY-006', {
  lastUpdated: '2026-09-03',
  nextAction: 'Align the Cloudflare Sandbox npm SDK and container image at exact version 0.12.9, keep Codex 0.150.1 and HTTP transport unchanged for this correction, deploy only after normal review, then launch one fresh canary to determine whether the historical intermittent sandbox.exec HTTP 500 persists.',
  waitCondition: 'Fresh issue 79 reached implementation on Worker adebd0c4-77c3-4ed0-9135-cd1003345258 after fresh-sandbox clone succeeded, then Sandbox.exec returned HTTP 500 after 194792 ms while running the unchanged Codex 0.150.1 command. Historical successful run 5ba4e808 completed the same Codex command in 158578 ms, and older maintenance runs alternated between implementation HTTP 500 failures and successful successor PRs. Repository inspection found an unsupported Cloudflare pairing: @cloudflare/sandbox 0.12.9 with cloudflare/sandbox:0.7.0. Correct that mismatch before adding Codex retries or changing transport.',
  staleDate: '2026-09-10'
});

updateWorkItem('VERIFY-004', {
  lastUpdated: '2026-09-03',
  nextAction: 'After exact Sandbox 0.12.9 SDK/image alignment is reviewed and deployed with Codex and HTTP transport unchanged, run one fresh consequence-disabled maintenance canary through publication, exact-head CI, OpsTruth v2 response, and terminal DoneState read-back.',
  waitCondition: 'Issue 79 failed before publication at the Cloudflare Sandbox exec boundary. The next canary must wait for the one-variable SDK/image alignment so the experiment remains attributable; do not conflate this with the later HTTP-to-RPC migration.',
  staleDate: '2026-09-10'
});

const story = `    {\n      "id":"E-023","date":"2026-09-03","identity":"Historical Sandbox implementation 500s traced to an unsupported SDK/image pairing before retry changes","situation":"Fresh canary issue 79 reached the implementation step on DoneState Worker adebd0c4-77c3-4ed0-9135-cd1003345258 but produced no branch or pull request. Production observability recorded Sandbox.exec HTTP 500 after 194792 ms while running the unchanged Codex 0.150.1 implementation command.","verification":"Historical comparison disproved a recent-regression theory: run 5ba4e808 completed the same Codex command in 158578 ms and published PR 66; earlier maintenance sequences also contain implementation HTTP 500 failures followed by successful successor runs. The Dockerfile has used cloudflare/sandbox:0.7.0 since the hosted control plane was introduced while the Worker lockfile resolves @cloudflare/sandbox 0.12.9. The current runtime also logs Using http transport. This change corrects only the documented SDK/image mismatch and adds a deterministic version-sync gate; Codex version, command, HTTP transport, OpsTruth, scheduler, webhook and retry semantics remain unchanged.",\n      "accountability":{"owner":"DoneState maintainers","status":"active","nextAction":"Review and deploy exact Sandbox SDK/image 0.12.9 alignment, confirm the deployed container image and version-sync gate, then launch a fresh canary without changing Codex or transport.","waitCondition":"Do not add Codex retries or switch HTTP to RPC in the same experiment. Preserve issue 79 as terminal pre-publication failure evidence.","staleDate":"2026-09-10"},\n      "outcome":"The implementation HTTP 500 is no longer being treated as proof of an OpenAI/Codex API failure. The first corrective layer is the objectively unsupported Cloudflare Sandbox package/image mismatch, isolated as one variable.","content":"Exact successful and failed production command timings, historical HTTP 500/successor PR pattern, Worker and container versions, package-lock SDK version, Docker image version, and the one-variable correction boundary.","measurement":"One successful comparable Codex exec at 158578 ms, one failed comparable exec at 194792 ms, at least two older HTTP 500 predecessor failures with successful successor PRs, SDK 0.12.9 versus image 0.7.0 mismatch found, and zero Codex/transport/retry changes in this correction."\n    }`;

const suffix = '\n    }\n  ]\n}\n';
if (!text.endsWith(suffix)) throw new Error('unexpected ledger suffix');
text = text.slice(0, -suffix.length) + '\n    },\n' + story + '\n  ]\n}\n';
fs.writeFileSync('governance/project-ledger.json', text);
