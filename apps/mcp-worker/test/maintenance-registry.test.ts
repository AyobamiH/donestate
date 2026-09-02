import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { doneStateRunIdFromBranch, verifiedMergedMaintenanceBranchRetirementEligible, webhookAutoRepairEligible, workflowVerificationRetryEligible, type MaintenanceRegistry } from "../src/maintenance-registry";
import type { MaintenanceFinding, PublicRunRecord, SelectedRepository } from "../src/types";

async function webhookSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

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
  it("awaits durable queue setup before accepting an eligible issue webhook", async () => {
    const registry = env.MAINTENANCE_REGISTRY.getByName("await-webhook-dispatch");
    const webhookSecret = "awaited-webhook-secret";
    await registry.configureGitHubApp("AyobamiH", {
      id: 987,
      slug: "awaited-webhook-app",
      name: "Awaited Webhook App",
      htmlUrl: "https://github.com/apps/awaited-webhook-app",
      pem: "test-private-key",
      webhookSecret,
    });

    await runInDurableObject(registry, async (instance: MaintenanceRegistry) => {
      const state = Reflect.get(instance as unknown as object, "ctx") as DurableObjectState;
      const now = "2026-09-02T00:00:00.000Z";
      state.storage.sql.exec(
        `INSERT INTO selected_repositories (
          owner_login, repository, default_branch, installation_id, mode, schedule_enabled, auto_repair,
          required_checks_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        "operator", "owner/webhook-repository", "main", 123, "pr_only", 1, 1, JSON.stringify(["CI"]), now, now,
      );

      let releaseQueue!: () => void;
      let signalStarted!: () => void;
      const queueGate = new Promise<void>((resolve) => { releaseQueue = resolve; });
      const queueStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
      const originalStartRepair = instance.startRepair.bind(instance);
      Reflect.set(instance, "startRepair", async () => {
        signalStarted();
        await queueGate;
        return { runId: "test-run-id", finding: {} as MaintenanceFinding };
      });

      try {
        const body = JSON.stringify({
          action: "edited",
          repository: { full_name: "owner/webhook-repository" },
          issue: {
            number: 68,
            title: "Replacement canary",
            body: "bounded repair",
            html_url: "https://github.com/owner/webhook-repository/issues/68",
            labels: [{ name: "donestate:repair" }],
          },
        });
        const pending = instance.ingestWebhook({
          signature: await webhookSignature(webhookSecret, body),
          deliveryId: "awaited-webhook-dispatch-1",
          eventName: "issues",
          body,
        });

        await queueStarted;
        const beforeRelease = await Promise.race([
          pending.then(() => "resolved" as const),
          new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 25)),
        ]);
        expect(beforeRelease).toBe("pending");
        releaseQueue();
        await expect(pending).resolves.toEqual({ accepted: true, duplicate: false });
      } finally {
        Reflect.set(instance, "startRepair", originalStartRepair);
      }
    });
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

  it("parses only DoneState-owned UUID run branches for retirement", () => {
    expect(doneStateRunIdFromBranch("donestate/11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
    expect(doneStateRunIdFromBranch("donestate/not-a-run")).toBeNull();
    expect(doneStateRunIdFromBranch("feature/11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(doneStateRunIdFromBranch("main")).toBeNull();
  });

  it("retires only the exact merged branch of an independently VERIFIED maintenance run", () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const headSha = "a".repeat(40);
    const run = {
      id: runId,
      state: "VERIFIED",
      branchName: `donestate/${runId}`,
      branchHeadSha: headSha,
      pullRequestNumber: 72,
      objective: { objectiveClass: "maintenance_pr", repository: "owner/repository", baseRef: "main" },
    } as PublicRunRecord;
    const subject = {
      repository: "owner/repository",
      number: 72,
      merged: true,
      state: "closed" as const,
      headRef: `donestate/${runId}`,
      headSha,
      headRepository: "owner/repository",
      baseRef: "main",
    };

    expect(verifiedMergedMaintenanceBranchRetirementEligible(run, subject)).toBe(true);
    expect(verifiedMergedMaintenanceBranchRetirementEligible({ ...run, state: "AWAITING_VERIFICATION" } as PublicRunRecord, subject)).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible({ ...run, state: "FAILED_SAFE" } as PublicRunRecord, subject)).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible(run, { ...subject, merged: false })).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible(run, { ...subject, headRepository: "owner/fork" })).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible(run, { ...subject, headSha: "b".repeat(40) })).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible(run, { ...subject, number: 73 })).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible(run, { ...subject, baseRef: "release" })).toBe(false);
    expect(verifiedMergedMaintenanceBranchRetirementEligible({ ...run, objective: { ...run.objective, objectiveClass: "operator" } } as PublicRunRecord, subject)).toBe(false);
  });

});
