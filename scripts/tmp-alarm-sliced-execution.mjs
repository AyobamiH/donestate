import fs from "node:fs";

function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label} context drift: ${count}`);
  return source.replace(oldText, newText);
}

const executorPath = "apps/mcp-worker/src/executor.ts";
let executor = fs.readFileSync(executorPath, "utf8");

executor = replaceOnce(executor,
`export interface ExecutionJournal {
  transition(state: RunState, eventType: string, detail?: string): Promise<void>;
  startAction(id: string, authority: AuthorityClass, intent: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  settleAction(id: string, settlement: ActionSettlement): Promise<void>;
  cancelled(): boolean;
  recordPublication(values: {
    branchName: string;
    branchHeadSha: string;
    pullRequestNumber?: number;
    pullRequestUrl?: string;
  }): void;
}

export interface ExecutionResult {
  repositoryCommitSha: string;
  branchName: string | null;
  branchHeadSha: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
}
`,
`export interface ExecutionCheckpointDraft {
  schema: "donestate.execution-checkpoint.v1";
  runId: string;
  sandboxId: string;
  objectiveDigest: string;
  commandDigest: string;
  launchCommandDigest: string;
  wrapperDigest: string;
  receiptSchema: "donestate.implementation-receipt.v1";
  receiptPath: string;
  receiptScriptPath: string;
  receiptLogPath: string;
  receiptNonceDigest: string;
  implementationTimeoutMs: number;
  startedAtMs: number;
  deadlineMs: number;
  repositoryGovernanceRequired: boolean;
  implementationPhase: "pending" | "succeeded";
  launchAcknowledged: boolean | null;
  launchError: string | null;
  lastControlError: string | null;
  receiptPollAttempt: number;
}

export interface ExecutionCheckpoint extends ExecutionCheckpointDraft {
  actionIntentDigest: string;
}

export type ImplementationActionStart =
  | { status: "started"; checkpoint: ExecutionCheckpoint }
  | { status: "succeeded"; result: Record<string, unknown> };

export interface ExecutionJournal {
  transition(state: RunState, eventType: string, detail?: string): Promise<void>;
  currentState(): RunState;
  startAction(id: string, authority: AuthorityClass, intent: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  settleAction(id: string, settlement: ActionSettlement): Promise<void>;
  startImplementationAction(intent: Record<string, unknown>, checkpoint: ExecutionCheckpointDraft): Promise<ImplementationActionStart>;
  updateExecutionCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>;
  settleImplementationAction(settlement: ActionSettlement, checkpoint: ExecutionCheckpoint | null): Promise<void>;
  cancelled(): boolean;
  recordPublication(values: {
    branchName: string;
    branchHeadSha: string;
    pullRequestNumber?: number;
    pullRequestUrl?: string;
  }): void;
}

export interface ExecutionResult {
  repositoryCommitSha: string;
  branchName: string | null;
  branchHeadSha: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
}

export type ExecutionOutcome =
  | { status: "deferred"; resumeAtMs: number }
  | { status: "completed"; result: ExecutionResult };
`, "execution interfaces");

executor = replaceOnce(executor,
`export const IMPLEMENTATION_LAUNCH_TIMEOUT_MS = 30_000;
export const IMPLEMENTATION_DETACHED_LAUNCH_COMMAND = 'nohup /bin/sh "$DONESTATE_RECEIPT_SCRIPT_PATH" > "$DONESTATE_RECEIPT_LOG_PATH" 2>&1 < /dev/null &';
`,
`export const IMPLEMENTATION_LAUNCH_TIMEOUT_MS = 30_000;
export const HOSTED_ALARM_COMMAND_TIMEOUT_MS = 10 * 60_000;
export const EXECUTION_ALARM_YIELD_MS = 1_000;
export const IMPLEMENTATION_DETACHED_LAUNCH_COMMAND = 'nohup /bin/sh "$DONESTATE_RECEIPT_SCRIPT_PATH" > "$DONESTATE_RECEIPT_LOG_PATH" 2>&1 < /dev/null &';
`, "alarm constants");

executor = replaceOnce(executor,
`export function implementationReceiptPollDelayMs(nowMs: number, deadlineMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) throw new Error("implementation receipt poll time is invalid");
  return Math.max(0, Math.min(IMPLEMENTATION_RECEIPT_POLL_INTERVAL_MS, deadlineMs - nowMs));
}
`,
`export function implementationReceiptPollDelayMs(nowMs: number, deadlineMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) throw new Error("implementation receipt poll time is invalid");
  return Math.max(0, Math.min(IMPLEMENTATION_RECEIPT_POLL_INTERVAL_MS, deadlineMs - nowMs));
}

export function executionResumeAtMs(nowMs = Date.now()): number {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error("execution resume time is invalid");
  return nowMs + EXECUTION_ALARM_YIELD_MS;
}
`, "resume helper");

executor = replaceOnce(executor,
`export function parseImplementationReceipt(value: string): ImplementationReceipt {
  const parts = value.trim().split("\\t");
  if (parts.length !== 5) throw new Error("implementation receipt field count is invalid");
  const schema = parts[0]!;
  const runId = parts[1]!;
  const commandDigest = parts[2]!;
  const exitCodeText = parts[3]!;
  const nonce = parts[4]!;
  if (schema !== IMPLEMENTATION_RECEIPT_SCHEMA) throw new Error("implementation receipt schema is invalid");
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("implementation receipt run id is invalid");
  if (!/^[a-f0-9]{64}$/.test(commandDigest)) throw new Error("implementation receipt command digest is invalid");
  if (!/^(?:0|[1-9][0-9]{0,2})$/.test(exitCodeText)) throw new Error("implementation receipt exit code is invalid");
  const exitCode = Number(exitCodeText);
  if (exitCode > 255) throw new Error("implementation receipt exit code is out of range");
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error("implementation receipt nonce is invalid");
  return { schema, runId, commandDigest, exitCode, nonce };
}
`,
`export function parseImplementationReceipt(value: string): ImplementationReceipt {
  const parts = value.trim().split("\\t");
  if (parts.length !== 5) throw new Error("implementation receipt field count is invalid");
  const schema = parts[0]!;
  const runId = parts[1]!;
  const commandDigest = parts[2]!;
  const exitCodeText = parts[3]!;
  const nonce = parts[4]!;
  if (schema !== IMPLEMENTATION_RECEIPT_SCHEMA) throw new Error("implementation receipt schema is invalid");
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("implementation receipt run id is invalid");
  if (!/^[a-f0-9]{64}$/.test(commandDigest)) throw new Error("implementation receipt command digest is invalid");
  if (!/^(?:0|[1-9][0-9]{0,2})$/.test(exitCodeText)) throw new Error("implementation receipt exit code is invalid");
  const exitCode = Number(exitCodeText);
  if (exitCode > 255) throw new Error("implementation receipt exit code is out of range");
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error("implementation receipt nonce is invalid");
  return { schema, runId, commandDigest, exitCode, nonce };
}

export function parseExecutionCheckpoint(value: unknown): ExecutionCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("execution checkpoint is invalid");
  const checkpoint = value as Record<string, unknown>;
  const required = [
    "schema", "runId", "sandboxId", "objectiveDigest", "commandDigest", "launchCommandDigest", "wrapperDigest",
    "receiptSchema", "receiptPath", "receiptScriptPath", "receiptLogPath", "receiptNonceDigest", "implementationTimeoutMs",
    "startedAtMs", "deadlineMs", "repositoryGovernanceRequired", "implementationPhase", "launchAcknowledged", "launchError",
    "lastControlError", "receiptPollAttempt", "actionIntentDigest",
  ];
  if (Object.keys(checkpoint).length !== required.length || required.some((key) => !Object.hasOwn(checkpoint, key))) {
    throw new Error("execution checkpoint shape is invalid");
  }
  if (checkpoint.schema !== "donestate.execution-checkpoint.v1") throw new Error("execution checkpoint schema is invalid");
  if (typeof checkpoint.runId !== "string" || !/^[0-9a-f-]{36}$/.test(checkpoint.runId)) throw new Error("execution checkpoint run id is invalid");
  if (typeof checkpoint.sandboxId !== "string" || ![1, 2, 3].some((attempt) => checkpoint.sandboxId === publicCloneSandboxId(checkpoint.runId as string, attempt))) {
    throw new Error("execution checkpoint sandbox id is invalid");
  }
  for (const key of ["objectiveDigest", "commandDigest", "launchCommandDigest", "wrapperDigest", "receiptNonceDigest", "actionIntentDigest"]) {
    if (typeof checkpoint[key] !== "string" || !/^[a-f0-9]{64}$/.test(checkpoint[key] as string)) throw new Error(`execution checkpoint ${key} is invalid`);
  }
  if (checkpoint.receiptSchema !== IMPLEMENTATION_RECEIPT_SCHEMA) throw new Error("execution checkpoint receipt schema is invalid");
  if (checkpoint.receiptPath !== implementationReceiptPath(checkpoint.runId as string)
    || checkpoint.receiptScriptPath !== implementationReceiptScriptPath(checkpoint.runId as string)
    || checkpoint.receiptLogPath !== implementationReceiptLogPath(checkpoint.runId as string)) {
    throw new Error("execution checkpoint receipt path is invalid");
  }
  if (!Number.isSafeInteger(checkpoint.implementationTimeoutMs) || (checkpoint.implementationTimeoutMs as number) < 60_000 || (checkpoint.implementationTimeoutMs as number) > 7_200_000) {
    throw new Error("execution checkpoint implementation timeout is invalid");
  }
  if (!Number.isSafeInteger(checkpoint.startedAtMs) || (checkpoint.startedAtMs as number) < 0
    || !Number.isSafeInteger(checkpoint.deadlineMs) || (checkpoint.deadlineMs as number) <= (checkpoint.startedAtMs as number) + (checkpoint.implementationTimeoutMs as number)) {
    throw new Error("execution checkpoint deadline is invalid");
  }
  if (typeof checkpoint.repositoryGovernanceRequired !== "boolean") throw new Error("execution checkpoint governance flag is invalid");
  if (checkpoint.implementationPhase !== "pending" && checkpoint.implementationPhase !== "succeeded") throw new Error("execution checkpoint phase is invalid");
  if (checkpoint.launchAcknowledged !== null && typeof checkpoint.launchAcknowledged !== "boolean") throw new Error("execution checkpoint launch acknowledgement is invalid");
  for (const key of ["launchError", "lastControlError"]) {
    if (checkpoint[key] !== null && (typeof checkpoint[key] !== "string" || (checkpoint[key] as string).length > 4_000)) throw new Error(`execution checkpoint ${key} is invalid`);
  }
  if (!Number.isSafeInteger(checkpoint.receiptPollAttempt) || (checkpoint.receiptPollAttempt as number) < 0) throw new Error("execution checkpoint poll count is invalid");
  return checkpoint as unknown as ExecutionCheckpoint;
}
`, "checkpoint parser");

executor = replaceOnce(executor,
`async function hasPackageScript(sandbox: Sandbox, repositoryPath: string, scriptName: string): Promise<boolean> {
  const probe = await sandbox.exec(
    \`node -e 'const p=require("./package.json"); process.exit(typeof p.scripts?.[\${JSON.stringify(scriptName)}] === "string" ? 0 : 1)'\`,
    { cwd: repositoryPath },
  );
  return probe.success;
}
`,
`async function hasPackageScript(sandbox: Sandbox, repositoryPath: string, scriptName: string): Promise<boolean> {
  const probe = await sandbox.exec(
    \`node -e 'const p=require("./package.json"); process.exit(typeof p.scripts?.[\${JSON.stringify(scriptName)}] === "string" ? 0 : 1)'\`,
    { cwd: repositoryPath, timeout: 30_000 },
  );
  return probe.success;
}
`, "package script probe timeout");

const runActionStart = executor.indexOf("async function runAction(");
const runActionEnd = executor.indexOf("\nasync function waitForPublicCloneRetry", runActionStart);
if (runActionStart < 0 || runActionEnd < 0) throw new Error("runAction block drift");
executor = executor.slice(0, runActionStart) + `async function runAction(
  sandbox: Sandbox,
  journal: ExecutionJournal,
  objective: HostedObjective,
  id: string,
  authority: AuthorityClass,
  command: string,
  options: ExecOptions = {},
  secrets: string[] = [],
): Promise<{ result: Record<string, unknown>; executed: boolean }> {
  if (!objective.authorities.includes(authority)) throw new RunFailure("BLOCKED_AUTHORITY", \`${"${authority}"} authority is required for ${"${id}"}\`);
  if (journal.cancelled()) throw new RunFailure("FAILED_SAFE", "objective was cancelled before the next action");
  const previousResult = await journal.startAction(id, authority, {
    schema: "donestate.action-intent.v1",
    idempotencyKey: actionIdempotency(objective.runId, id),
    commandDigest: await digest(command),
  });
  if (previousResult) return { result: previousResult, executed: false };
  let raw: Awaited<ReturnType<Sandbox["exec"]>>;
  try {
    raw = await sandbox.exec(command, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "sandbox command failed";
    await journal.settleAction(id, { state: "FAILED", result: { error: redact(message, secrets) } });
    throw new RunFailure("BLOCKED_CAPABILITY", \`${"${id}"} could not execute\`, { error: redact(message, secrets) });
  }
  const result = resultRecord(raw, secrets);
  await journal.settleAction(id, { state: raw.success ? "SUCCEEDED" : "FAILED", result });
  if (!raw.success) throw new RunFailure("FAILED_SAFE", \`${"${id}"} failed with exit code ${"${raw.exitCode}"}\`, result);
  return { result, executed: true };
}
` + executor.slice(runActionEnd);

executor = executor.replace(
`): Promise<{ sandbox: Sandbox; sandboxId: string }> {`,
`): Promise<{ sandbox: Sandbox; sandboxId: string; executed: boolean }> {`,
);
executor = replaceOnce(executor,
`    return { sandbox: getSandbox(env.Sandbox, sandboxId, SANDBOX_RUNTIME_OPTIONS), sandboxId };`,
`    return { sandbox: getSandbox(env.Sandbox, sandboxId, SANDBOX_RUNTIME_OPTIONS), sandboxId, executed: false };`, "restored clone result");
executor = replaceOnce(executor,
`        return { sandbox, sandboxId };`,
`        return { sandbox, sandboxId, executed: true };`, "fresh clone result");

executor = replaceOnce(executor,
`async function preparePublicationCredentials(
  sandbox: Sandbox,
  journal: ExecutionJournal,
  objective: HostedObjective,
  githubToken: string,
): Promise<void> {`,
`async function preparePublicationCredentials(
  sandbox: Sandbox,
  journal: ExecutionJournal,
  objective: HostedObjective,
  githubToken: string,
): Promise<boolean> {`, "publication credentials signature");
executor = replaceOnce(executor, `  if (previous) return;`, `  if (previous) return false;`, "publication previous result");
executor = replaceOnce(executor,
`    if (!configured.success) throw new RunFailure("FAILED_SAFE", "publication credentials could not be prepared", result);`,
`    if (!configured.success) throw new RunFailure("FAILED_SAFE", "publication credentials could not be prepared", result);\n    return true;`, "publication prepared return");

const tailStart = executor.indexOf("async function waitForImplementationReceiptPoll");
if (tailStart < 0) throw new Error("executor implementation tail drift");
const tail = String.raw`function receiptResumeAtMs(nowMs: number, deadlineMs: number): number {
  return nowMs + implementationReceiptPollDelayMs(nowMs, deadlineMs);
}

type ImplementationStep =
  | { status: "deferred"; sandbox: Sandbox; checkpoint: ExecutionCheckpoint; resumeAtMs: number }
  | { status: "succeeded"; sandbox: Sandbox; checkpoint: ExecutionCheckpoint; newlySucceeded: boolean };

async function launchImplementationWithReceipt(
  env: DoneStateEnv,
  sandbox: Sandbox,
  sandboxId: string,
  journal: ExecutionJournal,
  objective: HostedObjective,
  repositoryGovernanceRequired: boolean,
  openaiApiKey: string,
  githubToken: string,
): Promise<ImplementationStep> {
  const id = "implement";
  const authority: AuthorityClass = "local_write";
  if (!objective.authorities.includes(authority)) throw new RunFailure("BLOCKED_AUTHORITY", authority + " authority is required for " + id);
  if (journal.cancelled()) throw new RunFailure("FAILED_SAFE", "objective was cancelled before the next action");

  const commandDigest = await digest(CODEX_IMPLEMENT_COMMAND);
  const receiptNonce = crypto.randomUUID().replaceAll("-", "");
  const receiptPath = implementationReceiptPath(objective.runId);
  const receiptScriptPath = implementationReceiptScriptPath(objective.runId);
  const receiptLogPath = implementationReceiptLogPath(objective.runId);
  const wrapper = implementationReceiptCommand();

  try {
    await sandbox.mkdir(IMPLEMENTATION_RECEIPT_DIR, { recursive: true });
    await sandbox.writeFile(receiptScriptPath, wrapper);
  } catch (error) {
    const detail = redact(error instanceof Error ? error.message : "implementation receipt control files could not be prepared", [openaiApiKey, githubToken]);
    throw new RunFailure("BLOCKED_CAPABILITY", "implementation receipt control files could not be prepared", { error: detail, sandboxId });
  }

  const startedAtMs = Date.now();
  const deadlineMs = implementationReceiptDeadlineMs(startedAtMs, objective.maxDurationMs);
  const intent = {
    schema: "donestate.action-intent.v1",
    idempotencyKey: actionIdempotency(objective.runId, id),
    commandDigest,
    executionMode: "single_detached_exec_terminal_receipt_alarm_resumable_v3",
    startAttempts: IMPLEMENTATION_START_ATTEMPTS,
    launchCommandDigest: await digest(IMPLEMENTATION_DETACHED_LAUNCH_COMMAND),
    wrapperDigest: await digest(wrapper),
    receiptSchema: IMPLEMENTATION_RECEIPT_SCHEMA,
    receiptPath,
    receiptScriptPath,
    receiptLogPath,
    receiptNonceDigest: await digest(receiptNonce),
    sandboxId,
    implementationTimeoutMs: objective.maxDurationMs,
  };
  const checkpointDraft: ExecutionCheckpointDraft = {
    schema: "donestate.execution-checkpoint.v1",
    runId: objective.runId,
    sandboxId,
    objectiveDigest: await digest(objective),
    commandDigest,
    launchCommandDigest: intent.launchCommandDigest,
    wrapperDigest: intent.wrapperDigest,
    receiptSchema: IMPLEMENTATION_RECEIPT_SCHEMA,
    receiptPath,
    receiptScriptPath,
    receiptLogPath,
    receiptNonceDigest: intent.receiptNonceDigest,
    implementationTimeoutMs: objective.maxDurationMs,
    startedAtMs,
    deadlineMs,
    repositoryGovernanceRequired,
    implementationPhase: "pending",
    launchAcknowledged: null,
    launchError: null,
    lastControlError: null,
    receiptPollAttempt: 0,
  };
  const started = await journal.startImplementationAction(intent, checkpointDraft);
  if (started.status === "succeeded") {
    throw new RunFailure("BLOCKED_CAPABILITY", "settled implementation lost its resumable execution checkpoint", started.result);
  }
  let checkpoint = started.checkpoint;

  let launchRaw: Awaited<ReturnType<Sandbox["exec"]>> | null = null;
  let launchError: string | null = null;
  try {
    launchRaw = await sandbox.exec(IMPLEMENTATION_DETACHED_LAUNCH_COMMAND, {
      cwd: "/workspace/repo",
      env: {
        HOME: "/workspace/home",
        CODEX_API_KEY: openaiApiKey,
        DONESTATE_OBJECTIVE: implementationPrompt(objective, repositoryGovernanceRequired),
        DONESTATE_RECEIPT_NONCE: receiptNonce,
        DONESTATE_RECEIPT_PATH: receiptPath,
        DONESTATE_RECEIPT_SCHEMA: IMPLEMENTATION_RECEIPT_SCHEMA,
        DONESTATE_RECEIPT_RUN_ID: objective.runId,
        DONESTATE_RECEIPT_COMMAND_DIGEST: commandDigest,
        DONESTATE_RECEIPT_SCRIPT_PATH: receiptScriptPath,
        DONESTATE_RECEIPT_LOG_PATH: receiptLogPath,
        DONESTATE_IMPLEMENTATION_TIMEOUT_SECONDS: String(Math.max(1, Math.ceil(objective.maxDurationMs / 1_000))),
      },
      timeout: IMPLEMENTATION_LAUNCH_TIMEOUT_MS,
    });
    if (!launchRaw.success) {
      launchError = boundedOutput(redact(launchRaw.stderr || `detached implementation launch exited ${launchRaw.exitCode}`, [openaiApiKey, githubToken]), 4_000).text;
    }
  } catch (error) {
    launchError = boundedOutput(redact(error instanceof Error ? error.message : "implementation detached launch acknowledgement was interrupted", [openaiApiKey, githubToken]), 4_000).text;
  }
  checkpoint = {
    ...checkpoint,
    launchAcknowledged: launchRaw?.success ?? null,
    launchError,
  };
  await journal.updateExecutionCheckpoint(checkpoint);
  return {
    status: "deferred",
    sandbox,
    checkpoint,
    resumeAtMs: receiptResumeAtMs(Date.now(), checkpoint.deadlineMs),
  };
}

async function implementationLogEvidence(
  env: DoneStateEnv,
  checkpoint: ExecutionCheckpoint,
  secrets: string[],
): Promise<Record<string, unknown> | null> {
  try {
    const log = await getSandbox(env.Sandbox, checkpoint.sandboxId, SANDBOX_RUNTIME_OPTIONS).readFile(checkpoint.receiptLogPath);
    const bounded = boundedOutput(redact(log.content, secrets));
    return { text: bounded.text, truncated: bounded.truncated };
  } catch {
    return null;
  }
}

async function reconcileImplementationCheckpoint(
  env: DoneStateEnv,
  journal: ExecutionJournal,
  objective: HostedObjective,
  checkpoint: ExecutionCheckpoint,
  openaiApiKey: string,
  githubToken: string,
): Promise<ImplementationStep> {
  if (checkpoint.objectiveDigest !== await digest(objective)) {
    throw new RunFailure("BLOCKED_SAFETY", "execution checkpoint targets another objective");
  }
  const sandbox = getSandbox(env.Sandbox, checkpoint.sandboxId, SANDBOX_RUNTIME_OPTIONS);
  if (checkpoint.implementationPhase === "succeeded") {
    return { status: "succeeded", sandbox, checkpoint, newlySucceeded: false };
  }

  const receiptPollAttempt = checkpoint.receiptPollAttempt + 1;
  let receipt: ImplementationReceipt | null = null;
  let lastControlError: string | null = null;
  try {
    receipt = parseImplementationReceipt((await sandbox.readFile(checkpoint.receiptPath)).content);
  } catch (error) {
    lastControlError = boundedOutput(redact(
      error instanceof Error ? error.message : "implementation terminal receipt could not be read",
      [openaiApiKey, githubToken],
    ), 4_000).text;
  }

  if (receipt) {
    const nonceDigest = await digest(receipt.nonce);
    if (receipt.runId !== objective.runId || receipt.commandDigest !== checkpoint.commandDigest || nonceDigest !== checkpoint.receiptNonceDigest) {
      const result = {
        reason: "implementation_receipt_identity_mismatch",
        sandboxId: checkpoint.sandboxId,
        receiptSchema: receipt.schema,
        receiptRunId: receipt.runId,
        receiptCommandDigest: receipt.commandDigest,
        receiptNonceDigestMatched: nonceDigest === checkpoint.receiptNonceDigest,
        launchAcknowledged: checkpoint.launchAcknowledged,
        launchError: checkpoint.launchError,
        receiptPollAttempt,
      };
      await journal.settleImplementationAction({ state: "AMBIGUOUS", result }, null);
      throw new RunFailure("AMBIGUOUS_EFFECT", "implementation terminal receipt did not match the durable action intent", result);
    }
    if (receipt.exitCode !== 0) {
      const result = {
        success: false,
        exitCode: receipt.exitCode,
        sandboxId: checkpoint.sandboxId,
        receiptSchema: receipt.schema,
        receiptVerified: true,
        launchAcknowledged: checkpoint.launchAcknowledged,
        launchError: checkpoint.launchError,
        receiptPollAttempt,
      };
      await journal.settleImplementationAction({ state: "FAILED", result }, null);
      throw new RunFailure("FAILED_SAFE", "implement failed with exit code " + receipt.exitCode, result);
    }

    try {
      const head = await sandbox.exec("git rev-parse HEAD", { cwd: "/workspace/repo", timeout: 30_000 });
      if (!head.success) throw new Error("post-implementation repository head check failed with exit code " + head.exitCode);
      const observedHead = head.stdout.trim();
      const result = {
        success: true,
        exitCode: 0,
        sandboxId: checkpoint.sandboxId,
        receiptSchema: receipt.schema,
        receiptVerified: true,
        launchAcknowledged: checkpoint.launchAcknowledged,
        launchError: checkpoint.launchError,
        controlRecovered: true,
        receiptPollAttempt,
        receiptDeadlineMs: checkpoint.deadlineMs,
        postImplementationHead: observedHead,
        repositoryGovernanceRequired: checkpoint.repositoryGovernanceRequired,
      };
      if (observedHead !== objective.baseHeadSha) {
        await journal.settleImplementationAction({ state: "SUCCEEDED", result }, null);
        throw new RunFailure("BLOCKED_SAFETY", "coding harness changed the repository head directly", {
          expected: objective.baseHeadSha,
          actual: observedHead || null,
        });
      }
      const succeededCheckpoint: ExecutionCheckpoint = {
        ...checkpoint,
        implementationPhase: "succeeded",
        lastControlError: null,
        receiptPollAttempt,
      };
      await journal.settleImplementationAction({ state: "SUCCEEDED", result }, succeededCheckpoint);
      return { status: "succeeded", sandbox, checkpoint: succeededCheckpoint, newlySucceeded: true };
    } catch (error) {
      if (error instanceof RunFailure) throw error;
      lastControlError = boundedOutput(redact(
        error instanceof Error ? error.message : "post-implementation repository continuity could not be read",
        [openaiApiKey, githubToken],
      ), 4_000).text;
      if (Date.now() >= checkpoint.deadlineMs) {
        const result = {
          success: true,
          exitCode: 0,
          sandboxId: checkpoint.sandboxId,
          receiptSchema: receipt.schema,
          receiptVerified: true,
          launchAcknowledged: checkpoint.launchAcknowledged,
          launchError: checkpoint.launchError,
          controlRecovered: false,
          reason: "post_implementation_repository_continuity_unavailable",
          lastControlError,
          receiptPollAttempt,
          receiptDeadlineMs: checkpoint.deadlineMs,
          repositoryGovernanceRequired: checkpoint.repositoryGovernanceRequired,
        };
        await journal.settleImplementationAction({ state: "SUCCEEDED", result }, null);
        throw new RunFailure("BLOCKED_CAPABILITY", "implementation completed but the repository control plane could not be re-established", result);
      }
    }
  }

  const nowMs = Date.now();
  if (nowMs < checkpoint.deadlineMs) {
    const updated: ExecutionCheckpoint = { ...checkpoint, lastControlError, receiptPollAttempt };
    await journal.updateExecutionCheckpoint(updated);
    return { status: "deferred", sandbox, checkpoint: updated, resumeAtMs: receiptResumeAtMs(nowMs, updated.deadlineMs) };
  }

  const implementationLog = await implementationLogEvidence(env, checkpoint, [openaiApiKey, githubToken]);
  const result = {
    sandboxId: checkpoint.sandboxId,
    receiptSchema: IMPLEMENTATION_RECEIPT_SCHEMA,
    receiptVerified: false,
    launchAcknowledged: checkpoint.launchAcknowledged,
    launchError: checkpoint.launchError,
    reason: "implementation_terminal_receipt_unavailable_before_deadline",
    lastControlError,
    receiptPollAttempt,
    receiptDeadlineMs: checkpoint.deadlineMs,
    implementationLog,
  };
  await journal.settleImplementationAction({ state: "AMBIGUOUS", result }, null);
  throw new RunFailure("AMBIGUOUS_EFFECT", "implementation effect could not be reconciled from a terminal receipt before the configured deadline", result);
}

function deferredExecution(resumeAtMs = executionResumeAtMs()): ExecutionOutcome {
  return { status: "deferred", resumeAtMs };
}

export async function destroyExecutionSandbox(env: DoneStateEnv, sandboxId: string): Promise<void> {
  await getSandbox(env.Sandbox, sandboxId, SANDBOX_RUNTIME_OPTIONS).destroy();
}

export async function executeObjective(
  env: DoneStateEnv,
  objective: HostedObjective,
  githubToken: string,
  openaiApiKey: string,
  journal: ExecutionJournal,
  checkpoint: ExecutionCheckpoint | null = null,
): Promise<ExecutionOutcome> {
  const repositoryPath = "/workspace/repo";
  const branchName = `donestate/${objective.runId}`;
  const repositoryOwner = objective.repository.split("/")[0]!;
  let commitSha = "";
  let publicationCredentialsTouched = false;
  let activeSandbox: Sandbox | null = null;
  let preserveSandbox = false;
  let repositoryGovernanceRequired = checkpoint?.repositoryGovernanceRequired ?? false;
  try {
    let sandbox: Sandbox;
    if (checkpoint) {
      const parsedCheckpoint = parseExecutionCheckpoint(checkpoint);
      if (parsedCheckpoint.objectiveDigest !== await digest(objective)) {
        throw new RunFailure("BLOCKED_SAFETY", "execution checkpoint objective binding is invalid");
      }
      sandbox = getSandbox(env.Sandbox, parsedCheckpoint.sandboxId, SANDBOX_RUNTIME_OPTIONS);
      activeSandbox = sandbox;
      const implementation = await reconcileImplementationCheckpoint(
        env,
        journal,
        objective,
        parsedCheckpoint,
        openaiApiKey,
        githubToken,
      );
      if (implementation.status === "deferred") {
        preserveSandbox = true;
        return deferredExecution(implementation.resumeAtMs);
      }
      sandbox = implementation.sandbox;
      activeSandbox = sandbox;
      repositoryGovernanceRequired = implementation.checkpoint.repositoryGovernanceRequired;
      if (implementation.newlySucceeded) {
        preserveSandbox = true;
        return deferredExecution();
      }
    } else {
      const cloned = await clonePublicRepository(env, journal, objective, repositoryPath);
      sandbox = cloned.sandbox;
      activeSandbox = sandbox;
      const clonedHead = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath, timeout: 30_000 });
      if (!clonedHead.success || clonedHead.stdout.trim() !== objective.baseHeadSha) {
        throw new RunFailure("BLOCKED_SAFETY", "repository head changed before execution", {
          expected: objective.baseHeadSha,
          actual: clonedHead.stdout.trim() || null,
        });
      }
      if (cloned.executed) {
        preserveSandbox = true;
        return deferredExecution();
      }
      repositoryGovernanceRequired = objective.objectiveClass === "maintenance_pr"
        && await hasPackageScript(sandbox, repositoryPath, "governance:impact");
      const implementation = await launchImplementationWithReceipt(
        env,
        sandbox,
        cloned.sandboxId,
        journal,
        objective,
        repositoryGovernanceRequired,
        openaiApiKey,
        githubToken,
      );
      if (implementation.status === "deferred") {
        preserveSandbox = true;
        return deferredExecution(implementation.resumeAtMs);
      }
      throw new RunFailure("BLOCKED_CAPABILITY", "implementation launch unexpectedly returned a terminal result without a checkpoint");
    }

    if (journal.currentState() === "EXECUTING") await journal.transition("VALIDATING", "validation_started");
    const diffCheck = await runAction(
      sandbox,
      journal,
      objective,
      "diff-check",
      "test",
      "git diff --check",
      { cwd: repositoryPath, timeout: 60_000 },
    );
    if (diffCheck.executed) {
      preserveSandbox = true;
      return deferredExecution();
    }

    const validation = await selectedValidation(objective, sandbox);
    for (const action of validation) {
      const validationResult = await runAction(sandbox, journal, objective, action.id, "test", action.command, {
        cwd: repositoryPath,
        timeout: Math.min(objective.maxDurationMs, HOSTED_ALARM_COMMAND_TIMEOUT_MS),
      });
      if (validationResult.executed) {
        preserveSandbox = true;
        return deferredExecution();
      }
    }

    const headBeforeCommit = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath, timeout: 30_000 });
    if (!headBeforeCommit.success || !/^[a-f0-9]{40}$/.test(headBeforeCommit.stdout.trim())) {
      throw new RunFailure("FAILED_SAFE", "could not inspect repository head before commit");
    }
    const currentHead = headBeforeCommit.stdout.trim();
    const changedCommand = currentHead === objective.baseHeadSha
      ? CHANGED_FILES_COMMAND
      : `{ git diff --name-only -z ${objective.baseHeadSha}..HEAD; git ls-files --others --exclude-standard -z; } | base64 -w0`;
    const changed = await sandbox.exec(changedCommand, { cwd: repositoryPath, timeout: 60_000 });
    if (!changed.success) throw new RunFailure("FAILED_SAFE", "could not inspect changed files");
    let changedFiles: string[];
    try {
      changedFiles = decodeChangedFiles(changed.stdout);
    } catch {
      throw new RunFailure("FAILED_SAFE", "could not decode the changed-file inventory");
    }
    if (changedFiles.length === 0) throw new RunFailure("FAILED_SAFE", "coding harness produced no repository changes");
    if (changedFiles.length > objective.maxChangedFiles) {
      throw new RunFailure("BLOCKED_SAFETY", "changed-file budget exceeded", { changedFiles: changedFiles.length, limit: objective.maxChangedFiles });
    }
    if (objective.objectiveClass === "maintenance_pr") {
      const protectedChanges = changedFiles.filter(protectedMaintenancePath);
      if (protectedChanges.length > 0) {
        throw new RunFailure("BLOCKED_SAFETY", "autonomous maintenance cannot change protected authority files", { protectedChanges });
      }
    }

    const commitAction = await runAction(
      sandbox,
      journal,
      objective,
      "create-commit",
      "commit",
      `git config user.name DoneState && git config user.email bot@donestate.dev && git checkout -b ${branchName} && git add -A && git commit -m 'DoneState objective ${objective.runId}'`,
      { cwd: repositoryPath, timeout: 120_000 },
    );
    if (commitAction.executed) {
      preserveSandbox = true;
      return deferredExecution();
    }
    const commit = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath, timeout: 30_000 });
    if (!commit.success || !/^[a-f0-9]{40}$/.test(commit.stdout.trim())) throw new RunFailure("FAILED_SAFE", "could not seal the repository commit");
    commitSha = commit.stdout.trim();

    if (repositoryGovernanceRequired) {
      const governance = await runAction(
        sandbox,
        journal,
        objective,
        "governance-impact",
        "test",
        `npm run governance:impact -- ${objective.baseHeadSha}`,
        { cwd: repositoryPath, timeout: Math.min(objective.maxDurationMs, 300_000) },
      );
      if (governance.executed) {
        preserveSandbox = true;
        return deferredExecution();
      }
    }

    if (journal.currentState() !== "PUBLISHING") await journal.transition("PUBLISHING", "publication_started");
    const currentBase = await getBranchHead(githubToken, objective.repository, objective.baseRef);
    if (currentBase !== objective.baseHeadSha) {
      throw new RunFailure("BLOCKED_SAFETY", "base branch drifted before publication", { expected: objective.baseHeadSha, actual: currentBase });
    }
    const existingHead = await getBranchHead(githubToken, objective.repository, branchName);
    if (existingHead && existingHead !== commitSha) throw new RunFailure("BLOCKED_SAFETY", "publication branch already exists at another commit");
    if (!existingHead) {
      publicationCredentialsTouched = true;
      await preparePublicationCredentials(sandbox, journal, objective, githubToken);
      const previousPush = await journal.startAction("push-branch", "push", {
        schema: "donestate.action-intent.v1",
        idempotencyKey: actionIdempotency(objective.runId, "push-branch"),
        repository: objective.repository,
        branchName,
        expectedHeadSha: commitSha,
        expectedBaseSha: objective.baseHeadSha,
      });
      if (previousPush) {
        throw new RunFailure("BLOCKED_SAFETY", "a settled branch publication was not visible during reconciliation");
      }
      const push = await sandbox.exec(`git push origin HEAD:refs/heads/${branchName}`, { cwd: repositoryPath, timeout: 300_000 });
      const probedHead = await getBranchHead(githubToken, objective.repository, branchName);
      if (probedHead !== commitSha) {
        const result = resultRecord(push, [githubToken]);
        await journal.settleAction("push-branch", { state: "AMBIGUOUS", result: { ...result, probedHead } });
        throw new RunFailure("AMBIGUOUS_EFFECT", "branch push could not be reconciled to the intended commit", { probedHead, expectedHead: commitSha });
      }
      await journal.settleAction("push-branch", { state: "SUCCEEDED", result: { branchName, branchHeadSha: commitSha, probe: "github_ref_match" } });
      await cleanupPublicationCredentials(sandbox, objective.runId);
      publicationCredentialsTouched = false;
      journal.recordPublication({ branchName, branchHeadSha: commitSha });
      preserveSandbox = true;
      return deferredExecution();
    }

    journal.recordPublication({ branchName, branchHeadSha: commitSha });
    if (objective.publication === "branch") {
      return { status: "completed", result: { repositoryCommitSha: commitSha, branchName, branchHeadSha: commitSha, pullRequestNumber: null, pullRequestUrl: null } };
    }
    const previousPullRequest = await journal.startAction("open-pull-request", "open_pr", {
      schema: "donestate.action-intent.v1",
      idempotencyKey: actionIdempotency(objective.runId, "open-pull-request"),
      repository: objective.repository,
      branchName,
      baseRef: objective.baseRef,
      expectedHeadSha: commitSha,
    });
    if (previousPullRequest) {
      const number = previousPullRequest.number;
      const htmlUrl = previousPullRequest.htmlUrl;
      const headSha = previousPullRequest.headSha;
      if (typeof number !== "number" || typeof htmlUrl !== "string" || headSha !== commitSha) {
        throw new RunFailure("BLOCKED_SAFETY", "settled pull-request result does not match the intended publication");
      }
      journal.recordPublication({ branchName, branchHeadSha: commitSha, pullRequestNumber: number, pullRequestUrl: htmlUrl });
      return { status: "completed", result: { repositoryCommitSha: commitSha, branchName, branchHeadSha: commitSha, pullRequestNumber: number, pullRequestUrl: htmlUrl } };
    }
    let pull = await findOpenPullRequest(githubToken, objective.repository, repositoryOwner, branchName, objective.baseRef);
    if (!pull) {
      try {
        pull = await createPullRequest(
          githubToken,
          objective.repository,
          branchName,
          objective.baseRef,
          objective.goal.slice(0, 240),
          pullRequestBody(objective),
        );
      } catch (error) {
        pull = await findOpenPullRequest(githubToken, objective.repository, repositoryOwner, branchName, objective.baseRef);
        if (!pull) {
          const detail = error instanceof GitHubError ? { status: error.status, requestId: error.requestId } : {};
          await journal.settleAction("open-pull-request", { state: "AMBIGUOUS", result: detail });
          throw new RunFailure("AMBIGUOUS_EFFECT", "pull-request creation could not be reconciled", detail);
        }
      }
    }
    if (pull.headSha !== commitSha) {
      await journal.settleAction("open-pull-request", { state: "AMBIGUOUS", result: { ...pull } });
      throw new RunFailure("AMBIGUOUS_EFFECT", "pull request head does not match the intended commit", { expected: commitSha, actual: pull.headSha });
    }
    await journal.settleAction("open-pull-request", { state: "SUCCEEDED", result: { ...pull } });
    journal.recordPublication({ branchName, branchHeadSha: commitSha, pullRequestNumber: pull.number, pullRequestUrl: pull.htmlUrl });
    return {
      status: "completed",
      result: {
        repositoryCommitSha: commitSha,
        branchName,
        branchHeadSha: commitSha,
        pullRequestNumber: pull.number,
        pullRequestUrl: pull.htmlUrl,
      },
    };
  } finally {
    if (publicationCredentialsTouched && activeSandbox) await cleanupPublicationCredentials(activeSandbox, objective.runId);
    if (activeSandbox && !preserveSandbox) {
      try {
        await activeSandbox.destroy();
      } catch (error) {
        console.error(JSON.stringify({
          message: "sandbox cleanup failed",
          runId: objective.runId,
          error: error instanceof Error ? error.message : "unknown sandbox cleanup error",
        }));
      }
    }
  }
}
`;
executor = executor.slice(0, tailStart) + tail;
fs.writeFileSync(executorPath, executor);

const coordinatorPath = "apps/mcp-worker/src/coordinator.ts";
let coordinator = fs.readFileSync(coordinatorPath, "utf8");
coordinator = replaceOnce(coordinator,
`import { executeObjective, type ActionSettlement, type ExecutionJournal } from "./executor";`,
`import { destroyExecutionSandbox, executeObjective, parseExecutionCheckpoint, type ActionSettlement, type ExecutionCheckpoint, type ExecutionCheckpointDraft, type ExecutionJournal, type ImplementationActionStart } from "./executor";`, "coordinator executor imports");
coordinator = replaceOnce(coordinator,
`  verification_response_json: string | null;
}`,
`  verification_response_json: string | null;
  execution_checkpoint_json: string | null;
}`, "run row checkpoint");
coordinator = replaceOnce(coordinator,
`    if (!runColumns.some((column) => column.name === "verification_response_json")) {
      this.ctx.storage.sql.exec("ALTER TABLE run ADD COLUMN verification_response_json TEXT");
    }
`,
`    if (!runColumns.some((column) => column.name === "verification_response_json")) {
      this.ctx.storage.sql.exec("ALTER TABLE run ADD COLUMN verification_response_json TEXT");
    }
    if (!runColumns.some((column) => column.name === "execution_checkpoint_json")) {
      this.ctx.storage.sql.exec("ALTER TABLE run ADD COLUMN execution_checkpoint_json TEXT");
    }
`, "checkpoint migration");

const cancelStart = coordinator.indexOf("  async cancel(ownerLogin: string): Promise<PublicRunRecord> {");
const cancelEnd = coordinator.indexOf("\n  async get(ownerLogin: string)", cancelStart);
if (cancelStart < 0 || cancelEnd < 0) throw new Error("cancel block drift");
coordinator = coordinator.slice(0, cancelStart) + `  async cancel(ownerLogin: string): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    if (!TERMINAL_STATES.has(run.state) && run.state !== "AWAITING_VERIFICATION") {
      const checkpoint = this.executionCheckpoint(false);
      if (checkpoint) {
        try {
          await destroyExecutionSandbox(this.env, checkpoint.sandboxId);
        } catch (error) {
          console.error(JSON.stringify({
            message: "cancelled execution sandbox cleanup failed",
            runId: run.id,
            error: error instanceof Error ? error.message : "unknown sandbox cleanup error",
          }));
        }
        const runningImplementation = this.actions().find((action) => action.id === "implement" && action.state === "RUNNING");
        if (runningImplementation) {
          await this.settleImplementationAction(
            { state: "FAILED", result: { reason: "operator_cancelled_during_implementation" } },
            null,
          );
        } else {
          this.clearExecutionCheckpoint();
        }
      }
      await this.env.CREDENTIAL_VAULT.getByName(run.owner_login).release(run.owner_login, run.id);
      await this.transition("CANCELLED", "operator_cancelled");
      await this.ctx.storage.deleteAlarm();
    }
    return this.get(ownerLogin);
  }
` + coordinator.slice(cancelEnd);

const alarmStart = coordinator.indexOf("  override async alarm(): Promise<void> {");
const alarmEnd = coordinator.indexOf("\n  private runRow(): RunRow | null {", alarmStart);
if (alarmStart < 0 || alarmEnd < 0) throw new Error("alarm block drift");
const alarmBlock = `  override async alarm(): Promise<void> {
    let run = this.runRow();
    if (!run || TERMINAL_STATES.has(run.state) || run.state === "AWAITING_VERIFICATION") return;
    const objective = JSON.parse(run.objective_json) as HostedObjective;

    if (run.state === "RECONCILING") {
      await this.finishReconciliation(run, objective);
      return;
    }
    if (run.state === "QUEUED") {
      await this.transition("EXECUTING", "execution_started");
      run = this.runRow();
      if (!run) throw new Error("run disappeared after execution admission");
    }
    if (!["EXECUTING", "VALIDATING", "PUBLISHING"].includes(run.state)) return;

    let checkpoint: ExecutionCheckpoint | null;
    try {
      checkpoint = this.executionCheckpoint(true);
    } catch (error) {
      const running = this.actions().find((action) => action.state === "RUNNING");
      if (running) await this.settleAction(running.id, { state: "AMBIGUOUS", result: { reason: "execution_checkpoint_invalid" } });
      await this.transition("AMBIGUOUS_EFFECT", "execution_checkpoint_invalid", error instanceof Error ? error.message : "execution checkpoint is invalid");
      return;
    }
    const runningAction = this.actions().find((action) => action.state === "RUNNING");
    if (runningAction && !(runningAction.id === "implement" && checkpoint?.implementationPhase === "pending")) {
      await this.settleAction(runningAction.id, {
        state: "AMBIGUOUS",
        result: { reason: "durable intent exists without durable settlement after worker recovery" },
      });
      await this.transition("AMBIGUOUS_EFFECT", "interrupted_action_detected", runningAction.id);
      await this.cleanupExecutionContext(checkpoint);
      return;
    }
    if ((run.state === "VALIDATING" || run.state === "PUBLISHING") && !checkpoint) {
      await this.transition("BLOCKED_CAPABILITY", "execution_checkpoint_missing", run.state);
      return;
    }

    const credentialVault = this.env.CREDENTIAL_VAULT.getByName(run.owner_login);
    let credentialAcquired = false;
    let retainCredentialLease = false;
    let deferred = false;
    try {
      let openaiApiKey: string;
      try {
        openaiApiKey = await credentialVault.acquire(
          run.owner_login,
          run.id,
          Math.min(objective.maxDurationMs + 1_800_000, 10_800_000),
        );
        credentialAcquired = true;
      } catch (error) {
        throw new RunFailure(
          "BLOCKED_CAPABILITY",
          error instanceof Error ? error.message : "user-funded OpenAI execution credential is unavailable",
        );
      }
      const githubToken = await unsealSecret(run.sealed_github_token, this.env.TOKEN_ENCRYPTION_KEY);
      const journal: ExecutionJournal = {
        transition: async (state, eventType, detail) => this.transition(state, eventType, detail),
        currentState: () => this.runRow()?.state ?? "FAILED_SAFE",
        startAction: async (id, authority, intent) => this.startAction(id, authority, intent),
        settleAction: async (id, settlement) => this.settleAction(id, settlement),
        startImplementationAction: async (intent, draft) => this.startImplementationAction(intent, draft),
        updateExecutionCheckpoint: async (value) => this.updateExecutionCheckpoint(value),
        settleImplementationAction: async (settlement, value) => this.settleImplementationAction(settlement, value),
        cancelled: () => this.runRow()?.state === "CANCELLED",
        recordPublication: (values) => this.recordPublication(values),
      };
      const outcome = await executeObjective(this.env, objective, githubToken, openaiApiKey, journal, checkpoint);
      if (outcome.status === "deferred") {
        deferred = true;
        retainCredentialLease = true;
        await this.ctx.storage.setAlarm(outcome.resumeAtMs);
        return;
      }
      await this.transition("RECONCILING", "execution_reconciled");
      this.clearExecutionCheckpoint();
      const current = this.runRow();
      if (!current) throw new Error("run disappeared during reconciliation");
      await this.finishReconciliation(current, objective);
    } catch (error) {
      const current = this.runRow();
      const resumableCheckpoint = this.executionCheckpoint(false);
      const currentRunning = this.actions().find((action) => action.state === "RUNNING");
      if (!(error instanceof RunFailure)
        && current
        && !TERMINAL_STATES.has(current.state)
        && (deferred || (currentRunning?.id === "implement" && resumableCheckpoint?.implementationPhase === "pending"))) {
        retainCredentialLease = true;
        console.error(JSON.stringify({
          message: "resumable execution control operation was interrupted",
          runId: objective.runId,
          error: error instanceof Error ? error.message : "unknown resumable control error",
        }));
        throw error;
      }
      const failure = error instanceof RunFailure
        ? error
        : new RunFailure("FAILED_SAFE", error instanceof Error ? error.message : "unknown execution failure");
      if (current && !TERMINAL_STATES.has(current.state)) {
        await this.transition(failure.state, "execution_stopped", failure.message);
      }
      await this.cleanupExecutionContext(resumableCheckpoint);
      console.error(JSON.stringify({
        message: "DoneState run stopped",
        runId: objective.runId,
        state: failure.state,
        error: failure.message,
      }));
    } finally {
      if (credentialAcquired && !retainCredentialLease) {
        try {
          await credentialVault.release(run.owner_login, run.id);
        } catch (error) {
          console.error(JSON.stringify({
            message: "execution credential lease cleanup failed",
            runId: objective.runId,
            error: error instanceof Error ? error.message : "unknown credential cleanup error",
          }));
        }
      }
    }
  }

  private async finishReconciliation(run: RunRow, objective: HostedObjective): Promise<void> {
    const actions = this.actions();
    if (actions.some((action) => action.state !== "SUCCEEDED")) {
      throw new RunFailure("BLOCKED_SAFETY", "not every action has a durable successful settlement");
    }
    const snapshot = await this.snapshotDigest(run, actions);
    this.ctx.storage.sql.exec(
      "UPDATE run SET verification_snapshot_digest = ?, updated_at = ? WHERE id = ?",
      snapshot,
      new Date().toISOString(),
      run.id,
    );
    await this.transition("AWAITING_VERIFICATION", "independent_verification_required", snapshot);
    if (this.env.OPSTRUTH_MCP_URL && objective.trustedVerifierFingerprints.length > 0) {
      try {
        await this.requestIndependentVerification(run.owner_login);
      } catch (error) {
        console.error(JSON.stringify({
          message: "automatic independent verification did not complete",
          runId: objective.runId,
          error: error instanceof Error ? error.message : "unknown verification error",
        }));
      }
    }
  }

  private executionCheckpoint(strict: boolean): ExecutionCheckpoint | null {
    const run = this.runRow();
    if (!run?.execution_checkpoint_json) return null;
    try {
      const checkpoint = parseExecutionCheckpoint(JSON.parse(run.execution_checkpoint_json));
      const implement = this.actions().find((action) => action.id === "implement");
      if (!implement || checkpoint.actionIntentDigest !== implement.intentDigest) {
        throw new Error("execution checkpoint does not match the implementation action intent");
      }
      return checkpoint;
    } catch (error) {
      if (strict) throw error;
      return null;
    }
  }

  private clearExecutionCheckpoint(): void {
    this.ctx.storage.sql.exec("UPDATE run SET execution_checkpoint_json = NULL, updated_at = ?", new Date().toISOString());
  }

  private async cleanupExecutionContext(checkpoint: ExecutionCheckpoint | null): Promise<void> {
    if (checkpoint) {
      try {
        await destroyExecutionSandbox(this.env, checkpoint.sandboxId);
      } catch (error) {
        console.error(JSON.stringify({
          message: "execution sandbox cleanup failed",
          runId: checkpoint.runId,
          error: error instanceof Error ? error.message : "unknown sandbox cleanup error",
        }));
      }
    }
    this.clearExecutionCheckpoint();
  }
`;
coordinator = coordinator.slice(0, alarmStart) + alarmBlock + coordinator.slice(alarmEnd);

const startActionMarker = `  private async startAction(id: string, authority: AuthorityClass, intent: Record<string, unknown>): Promise<Record<string, unknown> | null> {`;
const startActionIndex = coordinator.indexOf(startActionMarker);
if (startActionIndex < 0) throw new Error("startAction marker drift");
const implementationMethods = `  private async startImplementationAction(
    intent: Record<string, unknown>,
    draft: ExecutionCheckpointDraft,
  ): Promise<ImplementationActionStart> {
    const run = this.runRow();
    if (!run) throw new Error("run not found");
    if (!JSON.parse(run.objective_json).authorities.includes("local_write")) {
      throw new RunFailure("BLOCKED_AUTHORITY", "local_write authority is required for implement");
    }
    const existing = this.ctx.storage.sql.exec<ActionRow>("SELECT * FROM actions WHERE id = 'implement'").toArray()[0];
    if (existing) {
      if (existing.state === "SUCCEEDED") {
        return { status: "succeeded", result: existing.result_json ? JSON.parse(existing.result_json) as Record<string, unknown> : {} };
      }
      throw new RunFailure("AMBIGUOUS_EFFECT", "action implement already has a non-terminal durable intent", { state: existing.state });
    }
    const intentDigest = await digest(intent);
    const checkpoint = parseExecutionCheckpoint({ ...draft, actionIntentDigest: intentDigest });
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      const locked = this.runRow();
      if (!locked || locked.id !== run.id || locked.state !== run.state || locked.execution_checkpoint_json) {
        throw new Error("implementation checkpoint conflicted with another coordinator request");
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO actions (id, authority, state, idempotency_key, intent_digest, updated_at)
         VALUES ('implement', 'local_write', 'RUNNING', ?, ?, ?)`,
        typeof intent.idempotencyKey === "string" ? intent.idempotencyKey : `${run.id}:implement:v1`,
        intentDigest,
        now,
      );
      this.ctx.storage.sql.exec(
        "UPDATE run SET execution_checkpoint_json = ?, updated_at = ? WHERE id = ?",
        canonicalJson(checkpoint),
        now,
        run.id,
      );
    });
    return { status: "started", checkpoint };
  }

  private async updateExecutionCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    const parsed = parseExecutionCheckpoint(checkpoint);
    const existing = this.ctx.storage.sql.exec<ActionRow>("SELECT * FROM actions WHERE id = 'implement'").toArray()[0];
    if (!existing || existing.state !== "RUNNING" || existing.intent_digest !== parsed.actionIntentDigest) {
      throw new Error("implementation checkpoint cannot update without its running action intent");
    }
    this.ctx.storage.sql.exec(
      "UPDATE run SET execution_checkpoint_json = ?, updated_at = ? WHERE id = ?",
      canonicalJson(parsed),
      new Date().toISOString(),
      parsed.runId,
    );
  }

  private async settleImplementationAction(
    settlement: ActionSettlement,
    checkpoint: ExecutionCheckpoint | null,
  ): Promise<void> {
    const existing = this.ctx.storage.sql.exec<ActionRow>("SELECT * FROM actions WHERE id = 'implement'").toArray()[0];
    if (!existing) throw new Error("action implement has no durable intent");
    if (existing.state === "SUCCEEDED" && settlement.state === "SUCCEEDED") return;
    if (existing.state !== "RUNNING") throw new Error(`action implement cannot settle from ${existing.state}`);
    const parsed = checkpoint ? parseExecutionCheckpoint(checkpoint) : null;
    if (parsed && parsed.actionIntentDigest !== existing.intent_digest) {
      throw new Error("implementation settlement checkpoint does not match its action intent");
    }
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE actions SET state = ?, result_json = ?, updated_at = ? WHERE id = 'implement' AND state = 'RUNNING'",
        settlement.state,
        canonicalJson(settlement.result),
        now,
      );
      this.ctx.storage.sql.exec(
        "UPDATE run SET execution_checkpoint_json = ?, updated_at = ?",
        parsed ? canonicalJson(parsed) : null,
        now,
      );
    });
  }

`;
coordinator = coordinator.slice(0, startActionIndex) + implementationMethods + coordinator.slice(startActionIndex);
fs.writeFileSync(coordinatorPath, coordinator);

const executorTestPath = "apps/mcp-worker/test/executor.test.ts";
let executorTest = fs.readFileSync(executorTestPath, "utf8");
executorTest = replaceOnce(executorTest,
`import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, IMPLEMENTATION_DETACHED_LAUNCH_COMMAND, IMPLEMENTATION_RECEIPT_GRACE_MS, IMPLEMENTATION_RECEIPT_POLL_INTERVAL_MS, IMPLEMENTATION_RECEIPT_SCHEMA, IMPLEMENTATION_START_ATTEMPTS, PUBLIC_CLONE_MAX_ATTEMPTS, PUBLIC_CLONE_RETRY_BASE_DELAY_MS, SANDBOX_RUNTIME_OPTIONS, decodeChangedFiles, implementationPrompt, implementationReceiptCommand, implementationReceiptDeadlineMs, implementationReceiptLogPath, implementationReceiptPath, implementationReceiptPollDelayMs, implementationReceiptScriptPath, parseImplementationReceipt, protectedMaintenancePath, publicCloneCommand, publicCloneRetryDelayMs, publicCloneSandboxId } from "../src/executor";`,
`import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, EXECUTION_ALARM_YIELD_MS, HOSTED_ALARM_COMMAND_TIMEOUT_MS, IMPLEMENTATION_DETACHED_LAUNCH_COMMAND, IMPLEMENTATION_RECEIPT_GRACE_MS, IMPLEMENTATION_RECEIPT_POLL_INTERVAL_MS, IMPLEMENTATION_RECEIPT_SCHEMA, IMPLEMENTATION_START_ATTEMPTS, PUBLIC_CLONE_MAX_ATTEMPTS, PUBLIC_CLONE_RETRY_BASE_DELAY_MS, SANDBOX_RUNTIME_OPTIONS, decodeChangedFiles, executionResumeAtMs, implementationPrompt, implementationReceiptCommand, implementationReceiptDeadlineMs, implementationReceiptLogPath, implementationReceiptPath, implementationReceiptPollDelayMs, implementationReceiptScriptPath, parseExecutionCheckpoint, parseImplementationReceipt, protectedMaintenancePath, publicCloneCommand, publicCloneRetryDelayMs, publicCloneSandboxId } from "../src/executor";`, "executor test imports");
const executorTestInsert = executorTest.lastIndexOf("\n});");
if (executorTestInsert < 0) throw new Error("executor test closing drift");
executorTest = executorTest.slice(0, executorTestInsert) + `

  it("keeps each alarm slice below the Durable Object alarm wall-time boundary", () => {
    expect(HOSTED_ALARM_COMMAND_TIMEOUT_MS).toBe(600_000);
    expect(EXECUTION_ALARM_YIELD_MS).toBe(1_000);
    expect(executionResumeAtMs(1_000)).toBe(2_000);
  });

  it("persists only hashed receipt identity in the resumable execution checkpoint", () => {
    const runId = "0e3fc377-6ff7-47ba-8cdf-df0a226a7a85";
    const checkpoint = parseExecutionCheckpoint({
      schema: "donestate.execution-checkpoint.v1",
      runId,
      sandboxId: `run-${runId}-clone-2`,
      objectiveDigest: "1".repeat(64),
      commandDigest: "2".repeat(64),
      launchCommandDigest: "3".repeat(64),
      wrapperDigest: "4".repeat(64),
      receiptSchema: IMPLEMENTATION_RECEIPT_SCHEMA,
      receiptPath: implementationReceiptPath(runId),
      receiptScriptPath: implementationReceiptScriptPath(runId),
      receiptLogPath: implementationReceiptLogPath(runId),
      receiptNonceDigest: "5".repeat(64),
      implementationTimeoutMs: 1_800_000,
      startedAtMs: 1_000,
      deadlineMs: 1_816_000,
      repositoryGovernanceRequired: true,
      implementationPhase: "pending",
      launchAcknowledged: null,
      launchError: null,
      lastControlError: null,
      receiptPollAttempt: 0,
      actionIntentDigest: "6".repeat(64),
    });
    expect(checkpoint.receiptNonceDigest).toBe("5".repeat(64));
    expect(JSON.stringify(checkpoint)).not.toContain("receiptNonce\"");
    expect(() => parseExecutionCheckpoint({ ...checkpoint, sandboxId: "other-sandbox" })).toThrow("sandbox id");
  });
` + executorTest.slice(executorTestInsert);
fs.writeFileSync(executorTestPath, executorTest);

const coordinatorTestPath = "apps/mcp-worker/test/coordinator.test.ts";
let coordinatorTest = fs.readFileSync(coordinatorTestPath, "utf8");
const coordinatorTestInsert = coordinatorTest.lastIndexOf("\n});");
if (coordinatorTestInsert < 0) throw new Error("coordinator test closing drift");
coordinatorTest = coordinatorTest.slice(0, coordinatorTestInsert) + `

  it("persists the implementation action intent and execution checkpoint in one durable transaction", async () => {
    const runId = "12121212-1212-4212-8212-121212121212";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    await runInDurableObject(stub, async (instance: RunCoordinator, state) => {
      state.storage.sql.exec("UPDATE run SET state = 'EXECUTING' WHERE id = ?", runId);
      const internal = instance as unknown as {
        startImplementationAction(intent: Record<string, unknown>, draft: Record<string, unknown>): Promise<{ status: string; checkpoint: Record<string, unknown> }>;
      };
      const draft = {
        schema: "donestate.execution-checkpoint.v1",
        runId,
        sandboxId: `run-${runId}-clone-1`,
        objectiveDigest: "1".repeat(64),
        commandDigest: "2".repeat(64),
        launchCommandDigest: "3".repeat(64),
        wrapperDigest: "4".repeat(64),
        receiptSchema: "donestate.implementation-receipt.v1",
        receiptPath: `/workspace/.donestate-control/implementation-${runId}.receipt`,
        receiptScriptPath: `/workspace/.donestate-control/implementation-${runId}.sh`,
        receiptLogPath: `/workspace/.donestate-control/implementation-${runId}.log`,
        receiptNonceDigest: "5".repeat(64),
        implementationTimeoutMs: 60_000,
        startedAtMs: 1_000,
        deadlineMs: 76_000,
        repositoryGovernanceRequired: true,
        implementationPhase: "pending",
        launchAcknowledged: null,
        launchError: null,
        lastControlError: null,
        receiptPollAttempt: 0,
      };
      const started = await internal.startImplementationAction({ idempotencyKey: `${runId}:implement:v1`, commandDigest: "2".repeat(64) }, draft);
      expect(started.status).toBe("started");
      const action = state.storage.sql.exec<{ state: string; intent_digest: string }>("SELECT state, intent_digest FROM actions WHERE id = 'implement'").one();
      const row = state.storage.sql.exec<{ execution_checkpoint_json: string }>("SELECT execution_checkpoint_json FROM run WHERE id = ?", runId).one();
      const stored = JSON.parse(row.execution_checkpoint_json) as Record<string, unknown>;
      expect(action.state).toBe("RUNNING");
      expect(stored.actionIntentDigest).toBe(action.intent_digest);
      expect(stored.receiptNonceDigest).toBe("5".repeat(64));
      expect(row.execution_checkpoint_json).not.toContain("github-test-token");
    });
  });

  it("keeps generic unsettled actions non-resumable", async () => {
    const runId = "13131313-1313-4313-8313-131313131313";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    await runInDurableObject(stub, async (instance: RunCoordinator, state) => {
      state.storage.sql.exec("UPDATE run SET state = 'VALIDATING' WHERE id = ?", runId);
      const internal = instance as unknown as {
        startAction(id: string, authority: "test", intent: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      };
      await internal.startAction("validate-node", "test", { idempotencyKey: `${runId}:validate-node:v1` });
      await expect(internal.startAction("validate-node", "test", { idempotencyKey: `${runId}:validate-node:v1` })).rejects.toMatchObject({ state: "AMBIGUOUS_EFFECT" });
    });
  });
` + coordinatorTest.slice(coordinatorTestInsert);
fs.writeFileSync(coordinatorTestPath, coordinatorTest);

const ledgerPath = "governance/project-ledger.json";
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const verify006 = ledger.workItems.find((item) => item.id === "VERIFY-006");
const verify004 = ledger.workItems.find((item) => item.id === "VERIFY-004");
if (!verify006 || !verify004) throw new Error("verification work item missing");
verify006.lastUpdated = "2026-09-03";
verify006.nextAction = "Replace the post-PR100 in-alarm receipt loop with alarm-sliced execution: keep the exact detached Codex launch and atomic receipt, persist a non-secret execution checkpoint bound to the implementation intent, perform one read-only receipt reconciliation per alarm, yield after each bounded action, preserve the sandbox and user credential lease across safe yields, keep every non-resumable unsettled mutation fail-closed, then deploy and run one fresh PR-only canary through exact-head CI and OpsTruth v2.";
verify006.waitCondition = "PR 100 merged as b4febe960fc7e71d48049e3a758256c1b61841ef; exact-head CI 33738177238, post-merge CI 33738273567 and deployment 33738273580 passed. Production Worker f89f842c-2f74-43a6-8f3e-ed90411e6964 runs container sha256:da8f52ef1570de5ace6c6d336ad29b92b7a5a5a8ecb9b0e336707a98fff5e9c2 with Sandbox 0.12.9 and Codex 0.150.1. Documentation re-assessment found the deployed code still awaits receipt completion inside RunCoordinator.alarm(), while hosted objectives default to 1800000 ms and can request 7200000 ms. Cloudflare Durable Object alarms have a 15-minute wall-time and at-least-once retry semantics, so a valid long implementation or combined validation slice could still be terminated and then misclassified by generic RUNNING-action recovery. A fresh canary must wait for this orchestration mismatch to be removed.";
if (!verify006.evidenceIds.includes("E-030")) verify006.evidenceIds.push("E-030");
verify004.lastUpdated = "2026-09-03";
verify004.nextAction = "After the alarm-sliced execution repair is reviewed and deployed, launch exactly one fresh PR-only maintenance canary from the new production Worker and require the complete branch/PR, exact-head core (22), core (24) and hosted-plugin checks, strict OpsTruth v2 response, and truthful DoneState VERIFIED read-back without merging the canary PR.";
verify004.waitCondition = "Issue 98 is terminal AMBIGUOUS_EFFECT evidence and must not be retried. PR 100 fixed the long Sandbox RPC but production still executes the receipt wait and multiple bounded actions inside a Durable Object alarm whose documented wall-time is 15 minutes, shorter than the 30-minute maintenance objective budget. The next canary waits for the alarm-sliced checkpoint repair and exact deployment evidence.";
if (!verify004.evidenceIds.includes("E-030")) verify004.evidenceIds.push("E-030");
if (ledger.evidenceStories.some((story) => story.id === "E-030")) throw new Error("E-030 already exists");
ledger.evidenceStories.push({
  id: "E-030",
  date: "2026-09-03",
  identity: "PR100 deployment exposed a Durable Object alarm lifetime mismatch",
  situation: "The detached terminal-receipt repair removed the known long Sandbox RPC dependency, but documentation re-assessment compared the deployed orchestration with Cloudflare Durable Object alarm limits before launching its successor canary.",
  verification: "PR 100 merged as b4febe960fc7e71d48049e3a758256c1b61841ef after exact-head CI 33738177238; post-merge CI 33738273567 and deployment 33738273580 passed. The deployment published Worker f89f842c-2f74-43a6-8f3e-ed90411e6964 and container sha256:da8f52ef1570de5ace6c6d336ad29b92b7a5a5a8ecb9b0e336707a98fff5e9c2 with Sandbox 0.12.9 and Codex 0.150.1. Source inspection shows RunCoordinator.alarm directly awaits executeObjective, whose detached implementation still polls until maxDurationMs plus receipt grace and whose Node validation could run multiple long commands in the same alarm. Hosted maintenance defaults to 1800000 ms and the public objective contract permits 7200000 ms. Cloudflare documents a 15-minute alarm-handler wall-time and at-least-once alarm retries.",
  accountability: {
    owner: "DoneState maintainers",
    status: "active",
    nextAction: "Make execution alarm-sliced with one durable implementation checkpoint, short per-alarm actions, safe same-run resumption, credential/sandbox retention across yields, and no replay of ambiguous generic mutations; then review, deploy and run one fresh canary.",
    waitCondition: "Fresh canary is blocked until the deployed execution model no longer depends on one alarm invocation surviving longer than the platform wall-time.",
    staleDate: "2026-09-10"
  },
  outcome: "PR100 remains valid evidence for the detached receipt layer, but it is not yet sufficient proof of the advertised autonomous duration contract.",
  content: "Exact PR100 source/CI/deployment/runtime subjects, Cloudflare alarm semantics, coordinator recovery behavior, objective duration limits, credential lease behavior, and the alarm-sliced repair boundary.",
  measurement: "One deployed detached-receipt repair is green; one platform-lifetime mismatch was found before a successor canary; zero historical canaries were retried or rewritten."
});
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
