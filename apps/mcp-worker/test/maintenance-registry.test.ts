import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { webhookAutoRepairEligible, workflowVerificationRetryEligible, type MaintenanceRegistry } from "../src/maintenance-registry";
import type { MaintenanceFinding, PublicRunRecord, SelectedRepository } from "../src/types";

describe("MaintenanceRegistry", () => {
  it("stores an observe-only repository without silently granting scheduled authority", async () => {
    const registry = env.MAINTENANCE_REGISTRY.getByName("global");
    const selected = await registry.selectRepository("operator", {
      repository: "owner/repository",
      defaultBranch: "main",
      mode: "observe",
      scheduleEnabled: false,
      autoRepair: false,
      requiredCheckNames: [],
    });
    expect(selected.mode).toBe("observe");
    expect(selected.installationId).toBeNull();
    expect(selected.scheduleEnabled).toBe(false);
    expect(await registry.listRepositories("another-user")).toEqual([]);
  });

  it("rejects automatic repair without PR-only scheduled policy", async () => {
    const registry = env.MAINTENANCE_REGISTRY.getByName("global");
    await runInDurableObject(registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.selectRepository("operator", {
        repository: "owner/unsafe",
        defaultBranch: "main",
        mode: "observe",
        scheduleEnabled: false,
        autoRepair: true,
        requiredCheckNames: ["CI"],
      })).rejects.toThrow("automatic repair requires pr_only mode and schedules");
    });
  });

  it("keeps GitHub App secrets out of status and enforces platform ownership", async () => {
    const registry = env.MAINTENANCE_REGISTRY.getByName("global");
    await runInDurableObject(registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.configureGitHubApp("not-owner", {
        id: 123,
        slug: "donestate-test",
        name: "DoneState Test",
        htmlUrl: "https://github.com/apps/donestate-test",
        pem: "private-key-material",
        webhookSecret: "webhook-secret-material",
      })).rejects.toThrow("platform owner");
    });
    const result = await registry.configureGitHubApp("AyobamiH", {
      id: 123,
      slug: "donestate-test",
      name: "DoneState Test",
      htmlUrl: "https://github.com/apps/donestate-test",
      pem: "private-key-material",
      webhookSecret: "webhook-secret-material",
    });
    expect(JSON.stringify(result)).not.toContain("private-key-material");
    expect(JSON.stringify(await registry.githubAppStatus())).not.toContain("webhook-secret-material");
  });
  it("dispatches issue webhooks only through the selected PR-only automatic-repair policy", () => {
    const selected: SelectedRepository = {
      schema: "donestate.selected-repository.v1",
      ownerLogin: "operator",
      repository: "owner/repository",
      defaultBranch: "main",
      installationId: 123,
      mode: "pr_only",
      scheduleEnabled: true,
      autoRepair: true,
      requiredCheckNames: ["CI"],
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    };
    const finding: MaintenanceFinding = {
      schema: "donestate.maintenance-finding.v1",
      id: "a".repeat(64),
      ownerLogin: "operator",
      repository: "owner/repository",
      source: "github_issue",
      sourceId: "68",
      title: "replacement canary",
      detail: "bounded repair",
      url: "https://github.com/owner/repository/issues/68",
      repairEligible: true,
      state: "OPEN",
      runId: null,
      discoveredAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    };

    expect(webhookAutoRepairEligible(selected, finding)).toBe(true);
    expect(webhookAutoRepairEligible({ ...selected, mode: "observe" }, finding)).toBe(false);
    expect(webhookAutoRepairEligible({ ...selected, scheduleEnabled: false }, finding)).toBe(false);
    expect(webhookAutoRepairEligible({ ...selected, autoRepair: false }, finding)).toBe(false);
    expect(webhookAutoRepairEligible({ ...selected, installationId: null }, finding)).toBe(false);
    expect(webhookAutoRepairEligible({ ...selected, requiredCheckNames: [] }, finding)).toBe(false);
    expect(webhookAutoRepairEligible(selected, { ...finding, repairEligible: false })).toBe(false);
    expect(webhookAutoRepairEligible(selected, { ...finding, state: "REPAIR_QUEUED", runId: "run" })).toBe(false);
    expect(webhookAutoRepairEligible(selected, { ...finding, repository: "owner/another" })).toBe(false);
  });
  it("retries independent verification only for the awaiting run bound to the completed workflow head", () => {
    const headSha = "a".repeat(40);
    const run = {
      state: "AWAITING_VERIFICATION",
      branchHeadSha: headSha,
      objective: { repository: "owner/repository" },
    } as PublicRunRecord;
    expect(workflowVerificationRetryEligible(run, "owner/repository", headSha)).toBe(true);
    expect(workflowVerificationRetryEligible(run, "owner/repository", "b".repeat(40))).toBe(false);
    expect(workflowVerificationRetryEligible({ ...run, state: "VERIFIED" } as PublicRunRecord, "owner/repository", headSha)).toBe(false);
    expect(workflowVerificationRetryEligible(run, "owner/another", headSha)).toBe(false);
  });

});
