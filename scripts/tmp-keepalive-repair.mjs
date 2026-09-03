import fs from "node:fs";

function replaceOnce(path, before, after, label) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${label} context drift`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

const executor = "apps/mcp-worker/src/executor.ts";
replaceOnce(
  executor,
  'export const PUBLIC_CLONE_RETRY_BASE_DELAY_MS = 2_000;\n',
  'export const PUBLIC_CLONE_RETRY_BASE_DELAY_MS = 2_000;\nexport const SANDBOX_RUNTIME_OPTIONS = { sleepAfter: "15m", keepAlive: true } as const;\n',
  "executor constants",
);
replaceOnce(
  executor,
  '    return getSandbox(env.Sandbox, sandboxId, { sleepAfter: "15m" });',
  '    return getSandbox(env.Sandbox, sandboxId, SANDBOX_RUNTIME_OPTIONS);',
  "restored sandbox options",
);
replaceOnce(
  executor,
  '    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "15m" });',
  '    const sandbox = getSandbox(env.Sandbox, sandboxId, SANDBOX_RUNTIME_OPTIONS);',
  "clone sandbox options",
);

const test = "apps/mcp-worker/test/executor.test.ts";
replaceOnce(
  test,
  'import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, PUBLIC_CLONE_MAX_ATTEMPTS, PUBLIC_CLONE_RETRY_BASE_DELAY_MS, decodeChangedFiles, implementationPrompt, protectedMaintenancePath, publicCloneCommand, publicCloneRetryDelayMs, publicCloneSandboxId } from "../src/executor";',
  'import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, PUBLIC_CLONE_MAX_ATTEMPTS, PUBLIC_CLONE_RETRY_BASE_DELAY_MS, SANDBOX_RUNTIME_OPTIONS, decodeChangedFiles, implementationPrompt, protectedMaintenancePath, publicCloneCommand, publicCloneRetryDelayMs, publicCloneSandboxId } from "../src/executor";',
  "executor test import",
);
replaceOnce(
  test,
  '  it("counts a complete NUL-delimited changed-file inventory without duplicates", () => {',
  '  it("keeps long-running implementation sandboxes alive until deterministic cleanup", () => {\n    expect(SANDBOX_RUNTIME_OPTIONS).toEqual({ sleepAfter: "15m", keepAlive: true });\n  });\n\n  it("counts a complete NUL-delimited changed-file inventory without duplicates", () => {',
  "keepAlive regression",
);

const ledgerPath = "governance/project-ledger.json";
let ledger = fs.readFileSync(ledgerPath, "utf8");
const replaceLedger = (before, after, label) => {
  if (!ledger.includes(before)) throw new Error(`${label} context drift`);
  ledger = ledger.replace(before, after);
};
replaceLedger(
  '      "nextAction":"Migrate the already-aligned Cloudflare Sandbox 0.12.9 stack from deprecated HTTP transport to RPC as the only runtime variable, keep Codex 0.150.1 and implementation/retry semantics unchanged, deploy under normal review, then launch one fresh canary through the same implementation boundary.","waitCondition":"Issue 81 proved exact SDK/image alignment alone was insufficient: Worker d67aa16a-914c-4e9a-940f-c06358e34f1b cloned successfully on the aligned 0.12.9 stack, explicitly logged HTTP transport, then the unchanged Codex 0.150.1 command again failed at Sandbox.exec with HTTP 500 after 133625 ms. Cloudflare stable documentation deprecates HTTP and recommends RPC after the staged version-alignment deployment already completed.","reentryCondition":"Close only after both products consume the same manifest and vectors, exact deployed versions pass a fresh replay-safe round trip, and historical run outcomes remain unchanged.","dependencies":[],"evidenceIds":["E-015","E-016","E-017","E-018","E-019","E-020","E-022","E-023","E-024"]',
  '      "nextAction":"Keep the aligned 0.12.9 RPC Sandbox runtime alive for the bounded active execution window using the SDK keepAlive lifecycle option, preserve the existing deterministic destroy cleanup, keep Codex 0.150.1, command, timeout and retry semantics unchanged, deploy under normal review, then launch one fresh canary.","waitCondition":"Issue 83 proved RPC transport removed the HTTP 500 signature but exposed the deeper lifecycle failure: on Worker 2e70de5c-cc10-4bc4-858b-42cb6ba37c35, clone succeeded under RPC and the unchanged Codex command was interrupted after 69498 ms because the Sandbox runtime connection was closing. DoneState passes a 30-minute implementation timeout, so this is not the configured command timeout. The executor creates Sandboxes with sleepAfter only and never enables keepAlive, while Cloudflare documents keepAlive for long-running builds/processes and the executor already destroys its active Sandbox in finally.","reentryCondition":"Close only after both products consume the same manifest and vectors, exact deployed versions pass a fresh replay-safe round trip, and historical run outcomes remain unchanged.","dependencies":[],"evidenceIds":["E-015","E-016","E-017","E-018","E-019","E-020","E-022","E-023","E-024","E-025"]',
  "VERIFY-006",
);
replaceLedger(
  '      "nextAction":"After RPC transport is reviewed and deployed on the aligned 0.12.9 stack, run one fresh consequence-disabled maintenance canary through Codex implementation, publication, exact-head CI, OpsTruth v2 response, and terminal DoneState read-back.","waitCondition":"Issue 81 failed before publication on the aligned 0.12.9 stack while HTTP transport remained enabled. The next canary must wait for the isolated HTTP-to-RPC migration; Codex version, command and retry behavior must remain unchanged so the result is attributable.","reentryCondition":"Resume after the versioned contract and authenticated verifier lane are deployed on exact reviewed commits.","dependencies":["VERIFY-001","VERIFY-002","VERIFY-003","VERIFY-006"],"evidenceIds":["E-002","E-003","E-012","E-016","E-017","E-018","E-019","E-020","E-022","E-023","E-024"]',
  '      "nextAction":"After the bounded Sandbox keepAlive lifecycle correction is reviewed and deployed on the aligned 0.12.9 RPC stack, run one fresh consequence-disabled maintenance canary through Codex implementation, publication, exact-head CI, OpsTruth v2 response, and terminal DoneState read-back.","waitCondition":"Issue 83 failed before publication because the RPC Sandbox runtime connection closed during the unchanged Codex command. The next canary must wait for the isolated keepAlive lifecycle correction; Codex version, command, timeout, retry behavior, RPC transport and verifier must remain unchanged so the result is attributable.","reentryCondition":"Resume after the versioned contract and authenticated verifier lane are deployed on exact reviewed commits.","dependencies":["VERIFY-001","VERIFY-002","VERIFY-003","VERIFY-006"],"evidenceIds":["E-002","E-003","E-012","E-016","E-017","E-018","E-019","E-020","E-022","E-023","E-024","E-025"]',
  "VERIFY-004",
);
if (ledger.includes('"id":"E-025"')) throw new Error("E-025 already exists");
const evidence = `    ,{
      "id":"E-025","date":"2026-09-03","identity":"RPC canary removed HTTP 500 and exposed active Sandbox lifecycle shutdown","situation":"PR 82 merged as 4c4964f2e5ee91c8b4315ec00eeaf70475443b08 and deployed Worker 2e70de5c-cc10-4bc4-858b-42cb6ba37c35 with exact Sandbox 0.12.9 alignment and SANDBOX_TRANSPORT=rpc. Fresh issue 83 exercised the unchanged Codex 0.150.1 implementation command.","verification":"Post-merge CI 33711766653 passed all three jobs and deployment 33711766651 passed 113 Worker tests with transport=rpc. Production observability for issue 83 recorded RPC transport and zero HTTP selections, successful anonymous materialization, then Sandbox.exec failed after 69498 ms with 'Sandbox operation commands.execute was interrupted while the runtime connection was closing'. The earlier HTTP 500 signature was absent. DoneState passes objective.maxDurationMs=1800000 to the implementation exec, so the stop is not the configured command timeout. Executor inspection shows the active Sandbox has sleepAfter=15m but no keepAlive, while the SDK exposes keepAlive specifically to prevent automatic sleep during long-running work and DoneState already destroys activeSandbox in finally.",
      "accountability":{"owner":"DoneState maintainers","status":"active","nextAction":"Enable keepAlive for the bounded Sandbox runtime used by clone/implementation while preserving deterministic destroy cleanup, keep RPC, Codex 0.150.1, command, timeout and retry semantics unchanged, deploy under normal review, and launch a fresh successor canary.","waitCondition":"Issue 83 is terminal pre-publication evidence and must not be retried or rewritten. Do not combine keepAlive with Codex upgrades, generic implementation retries, timeout changes or verifier changes.","staleDate":"2026-09-10"},
      "outcome":"RPC fixed the deprecated HTTP transport failure signature but did not complete the loop. The current failure is now isolated to Sandbox runtime lifecycle during a long active implementation command.","content":"Exact PR 82 merge/deploy subjects, RPC selection, clone success, 69498 ms runtime-closing interruption, absence of HTTP 500/publication/verifier activity, explicit 30-minute DoneState implementation timeout, missing keepAlive configuration, and existing deterministic Sandbox destroy cleanup.","measurement":"One RPC production deployment, one fresh canary, zero HTTP transport selections, one successful materialization, one runtime-closing implementation interruption at 69498 ms, zero HTTP 500s, zero branches, zero PRs, zero OpsTruth calls, and zero Codex/retry/timeout changes."
    }`;
const marker = "\n  ]\n}";
const idx = ledger.lastIndexOf(marker);
if (idx < 0) throw new Error("evidenceStories closing marker not found");
ledger = ledger.slice(0, idx) + evidence + ledger.slice(idx);
fs.writeFileSync(ledgerPath, ledger);
