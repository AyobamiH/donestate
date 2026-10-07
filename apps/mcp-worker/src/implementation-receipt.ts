import type { Sandbox } from "@cloudflare/sandbox";
import { boundedOutput, digest, redact } from "./canonical";
import type { ExecutionCheckpoint, ExecutionJournal } from "./executor";
import { RunFailure, type HostedObjective } from "./types";

export const IMPLEMENTATION_RECEIPT_POLL_INTERVAL_MS = 5_000;
export const IMPLEMENTATION_RECEIPT_GRACE_MS = 15_000;
export const IMPLEMENTATION_RECEIPT_SCHEMA = "donestate.implementation-receipt.v1";

export const IMPLEMENTATION_RECEIPT_DIR = "/workspace/.donestate-control";

export function implementationReceiptPath(runId: string): string {
  return IMPLEMENTATION_RECEIPT_DIR + "/implementation-" + runId + ".receipt";
}

export function implementationReceiptScriptPath(runId: string): string {
  return IMPLEMENTATION_RECEIPT_DIR + "/implementation-" + runId + ".sh";
}

export function implementationReceiptLogPath(runId: string): string {
  return IMPLEMENTATION_RECEIPT_DIR + "/implementation-" + runId + ".log";
}

export function implementationReceiptDeadlineMs(startedAtMs: number, maxDurationMs: number): number {
  if (!Number.isFinite(startedAtMs) || startedAtMs < 0) throw new Error("implementation receipt start time is invalid");
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) throw new Error("implementation duration is invalid");
  return startedAtMs + maxDurationMs + IMPLEMENTATION_RECEIPT_GRACE_MS;
}

export function implementationReceiptPollDelayMs(nowMs: number, deadlineMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) throw new Error("implementation receipt poll time is invalid");
  return Math.max(0, Math.min(IMPLEMENTATION_RECEIPT_POLL_INTERVAL_MS, deadlineMs - nowMs));
}

export interface ImplementationReceipt {
  schema: typeof IMPLEMENTATION_RECEIPT_SCHEMA;
  runId: string;
  commandDigest: string;
  exitCode: number;
  nonce: string;
}

export function parseImplementationReceipt(value: string): ImplementationReceipt {
  const parts = value.trim().split("\t");
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

export function receiptResumeAtMs(nowMs: number, deadlineMs: number): number {
  return nowMs + implementationReceiptPollDelayMs(nowMs, deadlineMs);
}

export type ImplementationStep =
  | { status: "deferred"; sandbox: Sandbox; checkpoint: ExecutionCheckpoint; resumeAtMs: number }
  | { status: "succeeded"; sandbox: Sandbox; checkpoint: ExecutionCheckpoint; newlySucceeded: boolean };

async function implementationLogEvidence(
  sandbox: Sandbox,
  checkpoint: ExecutionCheckpoint,
  secrets: string[],
): Promise<Record<string, unknown> | null> {
  try {
    const log = await sandbox.readFile(checkpoint.receiptLogPath);
    const bounded = boundedOutput(redact(log.content, secrets));
    return { text: bounded.text, truncated: bounded.truncated };
  } catch {
    return null;
  }
}

export async function reconcileImplementationCheckpoint(
  sandbox: Sandbox,
  journal: ExecutionJournal,
  objective: HostedObjective,
  checkpoint: ExecutionCheckpoint,
  openaiApiKey: string,
  githubToken: string,
): Promise<ImplementationStep> {
  if (checkpoint.objectiveDigest !== await digest(objective)) {
    throw new RunFailure("BLOCKED_SAFETY", "execution checkpoint targets another objective");
  }
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
      const implementationLog = await implementationLogEvidence(sandbox, checkpoint, [openaiApiKey, githubToken, receipt.nonce]);
      const result = {
        success: false,
        exitCode: receipt.exitCode,
        sandboxId: checkpoint.sandboxId,
        receiptSchema: receipt.schema,
        receiptVerified: true,
        launchAcknowledged: checkpoint.launchAcknowledged,
        launchError: checkpoint.launchError,
        receiptPollAttempt,
        implementationLog,
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

  const implementationLog = await implementationLogEvidence(sandbox, checkpoint, [openaiApiKey, githubToken]);
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
