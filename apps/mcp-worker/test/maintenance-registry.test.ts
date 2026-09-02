import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { workflowVerificationRetryEligible, type MaintenanceRegistry } from "../src/maintenance-registry";
import type { PublicRunRecord } from "../src/types";

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
