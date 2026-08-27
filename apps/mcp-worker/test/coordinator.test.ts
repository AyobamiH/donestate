import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { RunCoordinator } from "../src/coordinator";
import type { HostedObjective, PublicRunRecord } from "../src/types";

function objective(runId: string): HostedObjective {
  return {
    schema: "donestate.hosted-objective.v1",
    runId,
    repository: "owner/repository",
    baseRef: "main",
    baseHeadSha: "a".repeat(40),
    goal: "Implement the requested behaviour.",
    acceptanceCriteria: ["Tests pass."],
    requestedBy: "operator",
    authorities: ["local_read", "local_write", "test", "commit", "push", "secret_access"],
    validationProfile: "none",
    publication: "branch",
    trustedVerifierFingerprints: [],
    maxChangedFiles: 10,
    maxDurationMs: 60_000,
  };
}

describe("RunCoordinator", () => {
  it("persists a received run without exposing its GitHub token", async () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    const run: PublicRunRecord = await stub.create(objective(runId), "github-test-token");
    expect(run.state).toBe("RECEIVED");
    expect(JSON.stringify(run)).not.toContain("github-test-token");
    expect(run.events).toHaveLength(1);

    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      const stored = state.storage.sql.exec<{ sealed_github_token: string }>("SELECT sealed_github_token FROM run").one();
      expect(stored.sealed_github_token).not.toContain("github-test-token");
      expect(stored.sealed_github_token).toMatch(/^v1\./);
    });
  });

  it("records operator cancellation", async () => {
    const runId = "22222222-2222-4222-8222-222222222222";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    const cancelled: PublicRunRecord = await stub.cancel("operator");
    expect(cancelled.state).toBe("CANCELLED");
    expect(cancelled.events.at(-1)?.eventType).toBe("operator_cancelled");
  });

  it("deletes a cancelled run and its sealed credential", async () => {
    const runId = "33333333-3333-4333-8333-333333333333";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    await stub.cancel("operator");
    await expect(stub.purge("operator")).resolves.toEqual({ runId, deleted: true });

    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      expect(state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM run").one().count).toBe(0);
    });
  });
});
