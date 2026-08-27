import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CredentialVault } from "../src/credential-vault";

const USER_KEY = "test-user-funded-credential-not-a-secret-0000000000";

describe("CredentialVault", () => {
  it("stores a user credential encrypted and never returns it in status", async () => {
    const stub = env.CREDENTIAL_VAULT.getByName("alice");
    expect((await stub.status("alice")).connected).toBe(false);

    const status = await stub.storeCredential("alice", USER_KEY);
    expect(status.connected).toBe(true);
    expect(status.fingerprint).toMatch(/^[a-f0-9]{12}$/);
    expect(JSON.stringify(status)).not.toContain(USER_KEY);

    await runInDurableObject(stub, async (_instance: CredentialVault, state) => {
      const stored = state.storage.sql.exec<{ sealed_openai_key: string }>(
        "SELECT sealed_openai_key FROM credential",
      ).one();
      expect(stored.sealed_openai_key).toMatch(/^v1\./);
      expect(stored.sealed_openai_key).not.toContain(USER_KEY);
    });
  });

  it("leases one credential to one run and accounts idempotently", async () => {
    const stub = env.CREDENTIAL_VAULT.getByName("lease-user");
    await stub.storeCredential("lease-user", USER_KEY);

    await expect(stub.acquire("lease-user", "run-1", 60_000)).resolves.toBe(USER_KEY);
    await expect(stub.acquire("lease-user", "run-1", 60_000)).resolves.toBe(USER_KEY);
    expect(await stub.status("lease-user")).toMatchObject({
      activeRunId: "run-1",
      dailyRunsUsed: 1,
    });
    await runInDurableObject(stub, async (instance: CredentialVault) => {
      await expect(instance.acquire("lease-user", "run-2", 60_000)).rejects.toThrow(
        "another objective is already using this execution credential",
      );
    });

    await stub.release("lease-user", "run-1");
    await expect(stub.acquire("lease-user", "run-2", 60_000)).resolves.toBe(USER_KEY);
    expect((await stub.status("lease-user")).dailyRunsUsed).toBe(2);
  });

  it("will not delete a credential while a run owns its lease", async () => {
    const stub = env.CREDENTIAL_VAULT.getByName("delete-user");
    await stub.storeCredential("delete-user", USER_KEY);
    await stub.acquire("delete-user", "active-run", 60_000);
    await runInDurableObject(stub, async (instance: CredentialVault) => {
      await expect(instance.disconnect("delete-user")).rejects.toThrow("cancel the active objective");
    });
    await stub.release("delete-user", "active-run");
    expect((await stub.disconnect("delete-user")).connected).toBe(false);
  });

  it("rejects cross-identity access to a named vault", async () => {
    const stub = env.CREDENTIAL_VAULT.getByName("owner");
    await stub.storeCredential("owner", USER_KEY);
    await runInDurableObject(stub, async (instance: CredentialVault) => {
      await expect(instance.status("intruder")).rejects.toThrow("another identity");
      await expect(instance.acquire("intruder", "run-1", 60_000)).rejects.toThrow("another identity");
    });
  });

  it("binds an empty vault to its first identity and atomically consumes setup tickets", async () => {
    const stub = env.CREDENTIAL_VAULT.getByName("ticket-owner");
    await stub.status("ticket-owner");
    await runInDurableObject(stub, async (instance: CredentialVault) => {
      await expect(instance.status("intruder")).rejects.toThrow("another identity");
      instance.registerSetupTicket(
        "ticket-owner",
        "a".repeat(64),
        "https://done.example",
        Date.now() + 60_000,
      );
      expect(instance.consumeSetupTicket("ticket-owner", "a".repeat(64), "https://done.example")).toBe(true);
      expect(instance.consumeSetupTicket("ticket-owner", "a".repeat(64), "https://done.example")).toBe(false);
    });
  });

  it("fails closed when the configured daily run budget is exhausted", async () => {
    const stub = env.CREDENTIAL_VAULT.getByName("quota-user");
    await stub.storeCredential("quota-user", USER_KEY);
    await runInDurableObject(stub, async (instance: CredentialVault, state) => {
      state.storage.sql.exec("UPDATE quota SET runs_started = 10 WHERE owner_login = ?", "quota-user");
      await expect(instance.acquire("quota-user", "run-over-budget", 60_000)).rejects.toThrow(
        "daily autonomous-run limit reached",
      );
    });
    expect((await stub.status("quota-user")).activeRunId).toBeNull();
  });
});
