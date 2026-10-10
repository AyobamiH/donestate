import type { Sandbox } from "@cloudflare/sandbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionJournal } from "../src/executor";
import { pushRepositoryBranch } from "../src/repository-publication";
import type { HostedObjective } from "../src/types";

const { probe } = vi.hoisted(() => ({ probe: vi.fn() }));
vi.mock("../src/github", () => ({ getBranchHead: probe }));
const token = "ghs_publication-test-token";
const encoded = btoa(`x-access-token:${token}`);
const commit = "a".repeat(40);
const objective = {
  runId: "63548914-2b17-4534-8a1c-008ca8c20c94", repository: "owner/private-target",
  baseHeadSha: "b".repeat(40), authorities: ["push", "secret_access"],
} as HostedObjective;

function fixture(candidate = objective) {
  const sandbox = { exec: vi.fn().mockResolvedValue({ success: true, exitCode: 0, stdout: "", stderr: "" }), writeFile: vi.fn() };
  const journal = { startAction: vi.fn(), settleAction: vi.fn(), cancelled: () => false };
  const execute = () => pushRepositoryBranch(sandbox as unknown as Sandbox, journal as unknown as ExecutionJournal, candidate, token, "donestate/test", commit, "/workspace/repo");
  return { sandbox, journal, execute };
}

async function complete(execute: () => Promise<void>) {
  const outcome = execute().then(() => null, (error: unknown) => error);
  await vi.runAllTimersAsync();
  return outcome;
}

describe("single-attempt branch publication", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); probe.mockResolvedValue(commit); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("publishes in an isolated process with command-local credentials and requires the exact remote ref", async () => {
    const f = fixture(); await expect(f.execute()).resolves.toBeUndefined();
    expect(f.sandbox.exec).toHaveBeenCalledExactlyOnceWith("setsid -f -w git push https://github.com/owner/private-target.git HEAD:refs/heads/donestate/test", expect.objectContaining({
      cwd: "/workspace/repo", env: expect.objectContaining({
        GIT_CONFIG_VALUE_1: `Authorization: Basic ${encoded}`, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_VALUE_0: "",
      }),
    }));
    expect(f.sandbox.writeFile).not.toHaveBeenCalled();
    expect(f.journal.settleAction).toHaveBeenCalledWith("push-branch", { state: "SUCCEEDED", result: { branchName: "donestate/test", branchHeadSha: commit, probe: "github_ref_match" } });
    const persisted = JSON.stringify([f.journal.startAction.mock.calls, f.journal.settleAction.mock.calls]);
    for (const secret of [token, encoded]) expect(persisted).not.toContain(secret);
  });

  it.each(["push", "secret_access"])("requires %s before touching credentials or launching", async (authority) => {
    const f = fixture({ ...objective, authorities: objective.authorities.filter((x) => x !== authority) });
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_AUTHORITY" });
    expect(f.sandbox.exec).not.toHaveBeenCalled(); expect(f.journal.startAction).not.toHaveBeenCalled();
  });

  it("reconciles an interrupted push by read-only probing without repeating the mutation", async () => {
    const f = fixture(); f.sandbox.exec.mockResolvedValue({ success: false, exitCode: 143, stdout: "", stderr: "" });
    probe.mockResolvedValueOnce(null).mockResolvedValueOnce(commit);
    expect(await complete(f.execute)).toBeNull();
    expect(probe).toHaveBeenCalledTimes(2); expect(f.sandbox.exec).toHaveBeenCalledTimes(1);
    expect(f.journal.settleAction).toHaveBeenCalledWith("push-branch", expect.objectContaining({ state: "SUCCEEDED" }));
  });

  it("keeps absent remote effects ambiguous after bounded read-only observation", async () => {
    const f = fixture(); probe.mockResolvedValue(null);
    expect(await complete(f.execute)).toMatchObject({ state: "AMBIGUOUS_EFFECT" });
    expect(probe).toHaveBeenCalledTimes(4); expect(f.sandbox.exec).toHaveBeenCalledTimes(1);
    expect(f.journal.settleAction).toHaveBeenCalledWith("push-branch", expect.objectContaining({ state: "AMBIGUOUS" }));
  });

  it("never accepts a different remote commit even when the push reports success", async () => {
    const f = fixture(); probe.mockResolvedValue("c".repeat(40));
    expect(await complete(f.execute)).toMatchObject({ state: "AMBIGUOUS_EFFECT" });
    expect(probe).toHaveBeenCalledTimes(1); expect(f.sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it("redacts interrupted transport and probe errors without retrying a push", async () => {
    const f = fixture(); f.sandbox.exec.mockRejectedValue(new Error(`transport ${token} ${encoded}`));
    probe.mockRejectedValue(new Error(`probe ${token} ${encoded}`));
    expect(await complete(f.execute)).toMatchObject({ state: "AMBIGUOUS_EFFECT" });
    for (const secret of [token, encoded]) expect(JSON.stringify(f.journal.settleAction.mock.calls)).not.toContain(secret);
    expect(f.sandbox.exec).toHaveBeenCalledTimes(1); expect(probe).toHaveBeenCalledTimes(4);
  });

  it("refuses to replay a settled publication that was not visible", async () => {
    const f = fixture(); f.journal.startAction.mockResolvedValueOnce(null).mockResolvedValueOnce({ branchHeadSha: commit });
    await expect(f.execute()).rejects.toMatchObject({ state: "BLOCKED_SAFETY" });
    expect(f.sandbox.exec).not.toHaveBeenCalled(); expect(probe).not.toHaveBeenCalled();
  });
});
