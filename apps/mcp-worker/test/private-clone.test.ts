import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DoneStateEnv } from "../src/environment";
import { executeObjective, type ExecutionJournal } from "../src/executor";
import type { HostedObjective } from "../src/types";

const { sandbox } = vi.hoisted(() => ({ sandbox: {
  mkdir: vi.fn(), exec: vi.fn(), destroy: vi.fn(), writeFile: vi.fn(), startProcess: vi.fn(),
} }));
vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => sandbox }));

const token = "ghs_private-clone-test-token";
const encoded = btoa(`x-access-token:${token}`);
const objective: HostedObjective = {
  schema: "donestate.hosted-objective.v1", runId: "63548914-2b17-4534-8a1c-008ca8c20c94",
  repository: "owner/private-target", baseRef: "main", baseHeadSha: "a".repeat(40),
  requestedBy: "operator", goal: "Write one marker.", acceptanceCriteria: ["Only the marker changes."],
  authorities: ["local_read", "local_write", "test", "commit", "push", "open_pr", "secret_access"],
  validationProfile: "none", publication: "pull_request", trustedVerifierFingerprints: [],
  verificationRequirements: [], maxChangedFiles: 1, maxDurationMs: 60_000,
};

function fixture(isPrivate = true, candidate = objective, credential = token) {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    default_branch: "main", private: isPrivate, permissions: { push: true },
  }), { status: 200 }));
  sandbox.exec.mockImplementation(async (command: string) => ({
    success: true, exitCode: 0, stderr: "", stdout: command === "git rev-parse HEAD" ? objective.baseHeadSha : "",
  }));
  const journal: ExecutionJournal = {
    transition: vi.fn(), currentState: () => "EXECUTING", startAction: vi.fn(), settleAction: vi.fn(),
    startImplementationAction: vi.fn(), updateExecutionCheckpoint: vi.fn(), settleImplementationAction: vi.fn(),
    cancelled: () => false, recordPublication: vi.fn(),
  };
  return { fetch, journal, execute: () => executeObjective(env as unknown as DoneStateEnv, candidate, credential, "sk-test", journal) };
}

describe("private repository clone transport", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("authenticates only the private clone command and leaves the next process credential-free", async () => {
    const f = fixture();
    await expect(f.execute()).resolves.toMatchObject({ status: "deferred" });
    expect(f.fetch).toHaveBeenCalledWith("https://api.github.com/repos/owner/private-target", expect.any(Object));
    const [command, options] = sandbox.exec.mock.calls[0]!;
    expect(command).toBe("git clone --no-tags --single-branch --branch main https://github.com/owner/private-target.git /workspace/repo");
    expect(options.env).toEqual({
      GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "http.https://github.com/owner/private-target.git.extraheader",
      GIT_CONFIG_VALUE_1: `Authorization: Basic ${encoded}`,
      GIT_CONFIG_KEY_2: "http.followRedirects", GIT_CONFIG_VALUE_2: "false",
    });
    expect(sandbox.exec.mock.calls[1]).toEqual(["git rev-parse HEAD", { cwd: "/workspace/repo", timeout: 30_000 }]);
    expect(f.journal.startAction).toHaveBeenCalledWith("clone", "secret_access", expect.objectContaining({
      authentication: "repository_scoped_header", maxAttempts: 1,
    }));
    expect(f.journal.settleAction).toHaveBeenCalledWith("clone", expect.objectContaining({ state: "SUCCEEDED" }));
    for (const secret of [token, encoded]) {
      expect(command).not.toContain(secret);
      expect(JSON.stringify([vi.mocked(f.journal.startAction).mock.calls, vi.mocked(f.journal.settleAction).mock.calls])).not.toContain(secret);
    }
    expect(sandbox.writeFile).not.toHaveBeenCalled();
    expect(sandbox.startProcess).not.toHaveBeenCalled();
    expect(sandbox.destroy).not.toHaveBeenCalled();
  });

  it("keeps public cloning anonymous without requiring secret_access", async () => {
    const f = fixture(false, { ...objective, authorities: ["local_read"] });
    await expect(f.execute()).resolves.toMatchObject({ status: "deferred" });
    expect(sandbox.exec.mock.calls[0]![1].env).toEqual({ GIT_TERMINAL_PROMPT: "0" });
    expect(f.journal.startAction).toHaveBeenCalledWith("clone", "local_read", expect.objectContaining({
      maxAttempts: 3,
    }));
    expect(vi.mocked(f.journal.startAction).mock.calls[0]![2]).not.toHaveProperty("authentication");
  });

  it("blocks private credential transport without secret_access before creating a sandbox", async () => {
    const f = fixture(true, { ...objective, authorities: ["local_read"] });
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_AUTHORITY" });
    expect(sandbox.mkdir).not.toHaveBeenCalled();
    expect(sandbox.exec).not.toHaveBeenCalled();
    expect(f.journal.startAction).not.toHaveBeenCalled();
  });

  it("requires local_read as well as secret_access", async () => {
    const f = fixture(true, { ...objective, authorities: ["secret_access"] });
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_AUTHORITY" });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(sandbox.exec).not.toHaveBeenCalled();
  });

  it("fails closed on revoked repository access without an anonymous fallback", async () => {
    const f = fixture();
    f.fetch.mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_CAPABILITY" });
    expect(sandbox.exec).not.toHaveBeenCalled();
    expect(f.journal.startAction).not.toHaveBeenCalled();
  });

  it("redacts raw and encoded credentials from a rejected clone and never retries it", async () => {
    const f = fixture();
    sandbox.exec.mockResolvedValue({ success: false, exitCode: 128, stdout: token, stderr: `Authentication failed ${encoded}` });
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_CAPABILITY" });
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
    expect(sandbox.destroy).toHaveBeenCalledTimes(1);
    expect(f.journal.settleAction).toHaveBeenCalledWith("clone", { state: "FAILED", result: expect.objectContaining({
      stdout: "[REDACTED]", stderr: "Authentication failed [REDACTED]", attempts: 1,
    }) });
  });

  it("redacts thrown transport and cleanup errors while keeping the failure settled", async () => {
    const f = fixture();
    sandbox.exec.mockRejectedValue(new Error(`transport ${token} ${encoded}`));
    sandbox.destroy.mockRejectedValue(new Error(`cleanup ${token} ${encoded}`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(f.execute()).rejects.toMatchObject({ state: "FAILED_SAFE" });
    const persisted = JSON.stringify([vi.mocked(f.journal.settleAction).mock.calls, log.mock.calls]);
    for (const secret of [token, encoded]) expect(persisted).not.toContain(secret);
    expect(f.journal.settleAction).toHaveBeenCalledWith("clone", expect.objectContaining({ state: "FAILED" }));
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it("rejects unavailable private credentials before issuing a clone", async () => {
    const f = fixture(true, objective, "");
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_CAPABILITY" });
    expect(sandbox.exec).not.toHaveBeenCalled();
  });
});
