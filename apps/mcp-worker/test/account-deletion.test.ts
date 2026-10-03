import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createCredentialSetup, credentialSettingsHandler } from "../src/credential-settings";
import type { MaintenanceRegistry } from "../src/maintenance-registry";
import type { RunCoordinator } from "../src/coordinator";
import { contractObjective } from "./verification-fixtures";

const origin = "https://done.example";

async function deletionSession(login: string) {
  const setup = await createCredentialSetup(env, login, origin);
  const response = await credentialSettingsHandler.fetch(new Request(setup.setupUrl), env);
  const html = await response.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)![1]!;
  const cookie = response.headers.get("Set-Cookie")!.split(";", 1)[0]!;
  return () => {
    const body = new URLSearchParams({ csrf, action: "delete_account", confirm_login: login }).toString();
    return new Request(`${origin}/settings/openai`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(new TextEncoder().encode(body).length) },
      body,
    });
  };
}

async function fixture(login: string) {
  const registry = env.MAINTENANCE_REGISTRY.getByName("global");
  const runId = crypto.randomUUID();
  const run = env.RUN_COORDINATOR.getByName(runId);
  const objective = { ...contractObjective(runId, "a".repeat(64)), requestedBy: login };
  await run.create(objective, "test-token-not-a-secret");
  const admission = await registry.recordRun(login, runId, objective.repository, "operator");
  return { registry, runId, run, admission, request: await deletionSession(login) };
}

describe("account deletion acceptance", () => {
  it("refuses active runs, then deletes cancelled runs and fences old admissions", async () => {
    const login = "deletion-active-fixture";
    const f = await fixture(login);
    const refusal = await credentialSettingsHandler.fetch(f.request(), env);
    expect(await refusal.text()).toContain("Cancel active objectives before deletion");
    expect((await f.run.accountDeletionState(login))?.state).toBe("RECEIVED");
    expect(await f.registry.listRuns(login)).toHaveLength(1);
    await expect(f.registry.requireAccountWritable(login)).resolves.toMatchObject({ writable: true });
    await runInDurableObject(f.registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.requireAccountWritable(login, f.admission.accountGeneration)).rejects.toThrow("state changed");
    });
    await f.run.cancel(login);
    const deleted = await credentialSettingsHandler.fetch(f.request(), env);
    expect(await deleted.text()).toContain("DoneState account data deleted");
    expect(await f.run.accountDeletionState(login)).toBeNull();
    expect(await f.registry.listRuns(login)).toEqual([]);
    expect(await f.registry.accountDataSummary(login)).toMatchObject({ indexedRuns: 0, selectedRepositories: 0, findings: 0 });
    await runInDurableObject(f.registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.recordRun(login, crypto.randomUUID(), "owner/repository", "operator", f.admission.accountGeneration)).rejects.toThrow("state changed");
    });
    expect((await credentialSettingsHandler.fetch(f.request(), env)).status).toBe(401);
  });

  it("keeps the index and deletion lock on unreadable state, then retries safely", async () => {
    const login = "deletion-unreadable-fixture";
    const f = await fixture(login);
    await f.run.cancel(login);
    const failingEnv = {
      ...env,
      RUN_COORDINATOR: {
        getByName: () => ({
          get: () => f.run.get(login),
          accountDeletionState: () => { throw new Error("temporary coordinator read failure"); },
          purge: () => { throw new Error("purge must not run after an unreadable state"); },
        }),
      } as unknown as typeof env.RUN_COORDINATOR,
    };
    const failed = await credentialSettingsHandler.fetch(f.request(), failingEnv);
    const html = await failed.text();
    expect(html).toContain("Account deletion remains locked");
    expect(html).not.toContain("<h1>DoneState account data deleted</h1>");
    expect(await f.registry.listRuns(login)).toHaveLength(1);
    expect((await f.run.accountDeletionState(login))?.state).toBe("CANCELLED");
    await runInDurableObject(f.registry, async (instance: MaintenanceRegistry) => {
      await expect(instance.requireAccountWritable(login)).rejects.toThrow("deletion is in progress");
    });
    const retry = await credentialSettingsHandler.fetch(f.request(), env);
    expect(await retry.text()).toContain("DoneState account data deleted");
  });

  it("resumes after an objective purge without confusing absence with an ownership failure", async () => {
    const login = "deletion-partial-fixture";
    const f = await fixture(login);
    await runInDurableObject(f.run, async (instance: RunCoordinator) => {
      await expect(instance.accountDeletionState("another-owner")).rejects.toThrow("another GitHub identity");
    });
    await f.run.cancel(login);
    await f.registry.beginAccountDeletion(login);
    await env.CREDENTIAL_VAULT.getByName(login).beginAccountDeletion();
    await f.run.purge(login);
    expect(await f.registry.listRuns(login)).toHaveLength(1);
    const retry = await credentialSettingsHandler.fetch(f.request(), env);
    expect(await retry.text()).toContain("DoneState account data deleted");
    expect(await f.registry.listRuns(login)).toEqual([]);
  });
});
