import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { digest } from "../src/canonical";
import type { DoneStateEnv } from "../src/environment";
import {
  executeObjective, implementationReceiptLogPath, implementationReceiptPath,
  implementationReceiptScriptPath, type ExecutionCheckpoint, type ExecutionJournal,
} from "../src/executor";
import { IMPLEMENTATION_RECEIPT_SCHEMA } from "../src/implementation-receipt";
import { RunFailure, type HostedObjective } from "../src/types";

const { sandbox } = vi.hoisted(() => ({
  sandbox: {
    readFile: vi.fn(), exec: vi.fn(), destroy: vi.fn(), startProcess: vi.fn(),
  },
}));
vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => sandbox }));

const openaiKey = "sk-test-implementation-secret";
const githubToken = "ghp_test-publication-secret";
const receiptNonce = "b".repeat(32);
const runId = "63548914-2b17-4534-8a1c-008ca8c20c93";
const objective: HostedObjective = {
  schema: "donestate.hosted-objective.v1", runId, repository: "owner/repository",
  baseRef: "main", baseHeadSha: "a".repeat(40), goal: "Make the bounded change.",
  acceptanceCriteria: ["Required checks pass."], requestedBy: "operator",
  authorities: ["local_read", "local_write", "test", "commit", "push", "open_pr", "secret_access"],
  validationProfile: "none", publication: "pull_request", trustedVerifierFingerprints: [],
  verificationRequirements: [], maxChangedFiles: 3, maxDurationMs: 60_000,
};

async function fixture(exitCode: number, log = "provider request failed\n") {
  const order: string[] = [];
  const startedAtMs = Date.now();
  const checkpoint: ExecutionCheckpoint = {
    schema: "donestate.execution-checkpoint.v1", runId, sandboxId: `run-${runId}-clone-1`,
    objectiveDigest: await digest(objective), commandDigest: "c".repeat(64),
    launchCommandDigest: "d".repeat(64), wrapperDigest: "e".repeat(64),
    receiptSchema: IMPLEMENTATION_RECEIPT_SCHEMA, receiptPath: implementationReceiptPath(runId),
    receiptScriptPath: implementationReceiptScriptPath(runId), receiptLogPath: implementationReceiptLogPath(runId),
    receiptNonceDigest: await digest(receiptNonce), implementationTimeoutMs: 60_000,
    startedAtMs, deadlineMs: startedAtMs + 75_000, repositoryGovernanceRequired: false,
    implementationPhase: "pending", launchAcknowledged: true, launchError: null,
    lastControlError: null, receiptPollAttempt: 8, actionIntentDigest: "f".repeat(64),
  };
  const receipt = `${IMPLEMENTATION_RECEIPT_SCHEMA}\t${runId}\t${checkpoint.commandDigest}\t${exitCode}\t${receiptNonce}\n`;
  sandbox.readFile.mockImplementation(async (path: string) => {
    if (path === checkpoint.receiptPath) return { content: receipt };
    if (path === checkpoint.receiptLogPath) {
      order.push("read-log");
      return { content: log };
    }
    throw new Error("unexpected read");
  });
  sandbox.exec.mockResolvedValue({ success: true, exitCode: 0, stdout: objective.baseHeadSha + "\n", stderr: "" });
  sandbox.destroy.mockImplementation(async () => { order.push("destroy"); });
  const journal: ExecutionJournal = {
    transition: vi.fn(), currentState: () => "EXECUTING", startAction: vi.fn(),
    settleAction: vi.fn(), startImplementationAction: vi.fn(), updateExecutionCheckpoint: vi.fn(),
    settleImplementationAction: vi.fn(async () => { order.push("settle"); }),
    cancelled: () => false, recordPublication: vi.fn(),
  };
  const execute = () => executeObjective(env as unknown as DoneStateEnv, objective, githubToken, openaiKey, journal, checkpoint);
  return { checkpoint, journal, order, execute, receipt };
}

describe("implementation terminal diagnostics", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("saves redacted failure output before settling and destroying the sandbox without another launch", async () => {
    const f = await fixture(1, `request failed: ${openaiKey} ${githubToken} ${receiptNonce}\npassword=harness-password\n`);
    const failure = await f.execute().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RunFailure);
    expect(failure).toMatchObject({ state: "FAILED_SAFE", message: "implement failed with exit code 1" });
    expect(f.journal.settleImplementationAction).toHaveBeenCalledExactlyOnceWith({
      state: "FAILED",
      result: expect.objectContaining({
        exitCode: 1, success: false, receiptVerified: true, receiptPollAttempt: 9,
        implementationLog: { text: "request failed: [REDACTED] [REDACTED] [REDACTED]\npassword=[REDACTED]\n", truncated: false },
      }),
    }, null);
    const persisted = JSON.stringify(vi.mocked(f.journal.settleImplementationAction).mock.calls);
    for (const secret of [openaiKey, githubToken, receiptNonce, "harness-password"]) expect(persisted).not.toContain(secret);
    expect(f.order).toEqual(["read-log", "settle", "destroy"]);
    expect(sandbox.startProcess).not.toHaveBeenCalled();
    expect(sandbox.exec).not.toHaveBeenCalled();
    expect(f.journal.startAction).not.toHaveBeenCalled();
    expect(f.journal.recordPublication).not.toHaveBeenCalled();
  });

  it("bounds failure output to 64 KiB without splitting a UTF-8 character", async () => {
    const f = await fixture(1, "€".repeat(30_000));
    await expect(f.execute()).rejects.toMatchObject({ state: "FAILED_SAFE" });
    const settlement = vi.mocked(f.journal.settleImplementationAction).mock.calls[0]![0];
    const log = settlement.result.implementationLog as { text: string; truncated: boolean };
    expect(log.truncated).toBe(true);
    expect(new TextEncoder().encode(log.text).byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(log.text).not.toContain("\uFFFD");
    expect(f.order).toEqual(["read-log", "settle", "destroy"]);
  });

  it("keeps the verified nonzero receipt FAILED_SAFE when the diagnostic read fails", async () => {
    const f = await fixture(124);
    sandbox.readFile.mockImplementation(async (path: string) => {
      if (path === f.checkpoint.receiptPath) return { content: f.receipt };
      f.order.push("read-log");
      throw new Error(`control plane unavailable ${openaiKey}`);
    });
    await expect(f.execute()).rejects.toMatchObject({ state: "FAILED_SAFE", message: "implement failed with exit code 124" });
    expect(f.journal.settleImplementationAction).toHaveBeenCalledExactlyOnceWith({
      state: "FAILED", result: expect.objectContaining({ exitCode: 124, receiptVerified: true, implementationLog: null }),
    }, null);
    expect(JSON.stringify(vi.mocked(f.journal.settleImplementationAction).mock.calls)).not.toContain(openaiKey);
    expect(f.order).toEqual(["read-log", "settle", "destroy"]);
    expect(sandbox.startProcess).not.toHaveBeenCalled();
  });

  it("leaves successful execution resumable without collecting its log or destroying its sandbox", async () => {
    const f = await fixture(0);
    await expect(f.execute()).resolves.toMatchObject({ status: "deferred", resumeAtMs: expect.any(Number) });
    expect(f.journal.settleImplementationAction).toHaveBeenCalledExactlyOnceWith({
      state: "SUCCEEDED", result: expect.objectContaining({ success: true, exitCode: 0, receiptVerified: true }),
    }, expect.objectContaining({ implementationPhase: "succeeded" }));
    expect(sandbox.readFile).toHaveBeenCalledExactlyOnceWith(f.checkpoint.receiptPath);
    expect(f.order).toEqual(["settle"]);
    expect(sandbox.destroy).not.toHaveBeenCalled();
    expect(sandbox.startProcess).not.toHaveBeenCalled();
  });

  it("rejects a mismatched receipt before collecting failure diagnostics or launching again", async () => {
    const f = await fixture(1);
    sandbox.readFile.mockResolvedValue({ content: f.receipt.replace(receiptNonce, "a".repeat(32)) });
    await expect(f.execute()).rejects.toMatchObject({ state: "AMBIGUOUS_EFFECT" });
    expect(f.journal.settleImplementationAction).toHaveBeenCalledExactlyOnceWith({
      state: "AMBIGUOUS", result: expect.objectContaining({ reason: "implementation_receipt_identity_mismatch" }),
    }, null);
    expect(sandbox.readFile).toHaveBeenCalledExactlyOnceWith(f.checkpoint.receiptPath);
    expect(sandbox.startProcess).not.toHaveBeenCalled();
    expect(f.journal.recordPublication).not.toHaveBeenCalled();
  });

  it("retains redacted deadline diagnostics without changing an unavailable receipt to known failure", async () => {
    const f = await fixture(1, `terminal receipt missing ${openaiKey} ${githubToken}`);
    f.checkpoint.startedAtMs = 0;
    f.checkpoint.deadlineMs = 75_000;
    const readFile = sandbox.readFile.getMockImplementation()!;
    sandbox.readFile.mockImplementation(async (path: string) => {
      if (path === f.checkpoint.receiptPath) throw new Error("receipt absent");
      return readFile(path);
    });
    await expect(f.execute()).rejects.toMatchObject({ state: "AMBIGUOUS_EFFECT" });
    expect(f.journal.settleImplementationAction).toHaveBeenCalledExactlyOnceWith({
      state: "AMBIGUOUS", result: expect.objectContaining({
        receiptVerified: false, reason: "implementation_terminal_receipt_unavailable_before_deadline",
        implementationLog: { text: "terminal receipt missing [REDACTED] [REDACTED]", truncated: false },
      }),
    }, null);
    expect(sandbox.startProcess).not.toHaveBeenCalled();
  });

  it("continues polling before the receipt deadline without collecting a premature log or relaunching", async () => {
    const f = await fixture(1);
    sandbox.readFile.mockRejectedValue(new Error("receipt not ready"));
    await expect(f.execute()).resolves.toMatchObject({ status: "deferred" });
    expect(f.journal.settleImplementationAction).not.toHaveBeenCalled();
    expect(f.journal.updateExecutionCheckpoint).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ receiptPollAttempt: 9 }));
    expect(sandbox.readFile).toHaveBeenCalledExactlyOnceWith(f.checkpoint.receiptPath);
    expect(sandbox.startProcess).not.toHaveBeenCalled();
    expect(sandbox.destroy).not.toHaveBeenCalled();
  });
});
