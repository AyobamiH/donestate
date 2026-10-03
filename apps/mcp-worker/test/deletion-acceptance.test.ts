import { describe, expect, it, vi } from "vitest";
import worker, { runDeletionFenceAcceptance } from "../src/deletion-acceptance-worker";

function fixture() {
  let generation = 0;
  let deleting = false;
  const check = (expected?: number) => {
    if (deleting) throw new Error("deletion is in progress");
    if (expected !== undefined && expected !== generation) throw new Error("DoneState account state changed during operation");
    return { writable: true as const, generation };
  };
  const registry = { requireAccountWritable: vi.fn(async () => check()), beginAccountDeletion: vi.fn(async () => { deleting = true; return { generation: ++generation }; }), purgeAccount: vi.fn(async () => { deleting = false; }), recordRun: vi.fn(async (_a: string, _b: string, _c: string, _d: string, g: number) => check(g)), accountDataSummary: vi.fn(async () => ({ indexedRuns: 0, findings: 0, selectedRepositories: 0 })) };
  const vault = { requireAccountWritable: vi.fn(async () => check()), beginAccountDeletion: vi.fn(async () => ({ generation })), purgeAccount: vi.fn(async () => {}), storeCredential: vi.fn(async (_a: string, _b: string, g: number) => check(g)), status: vi.fn(async () => ({ connected: false })) };
  const env = { MAINTENANCE_REGISTRY: { getByName: () => registry }, CREDENTIAL_VAULT: { getByName: () => vault } } as unknown as Parameters<typeof runDeletionFenceAcceptance>[0];
  return { env, registry, vault };
}

describe("bounded production acceptance control", () => {
  it("orders delayed writes after deletion and cleans up", async () => {
    const { env, registry, vault } = fixture();
    const result = await runDeletionFenceAcceptance(env);
    expect(result.registryRejected).toBe(true);
    expect(result.vaultRejected).toBe(true);
    expect(result.fixture).toMatch(/^acceptance:deletion:/);
    expect(registry.purgeAccount).toHaveBeenCalledTimes(2);
    expect(vault.purgeAccount).toHaveBeenCalledTimes(2);
  });
  it("fails on an accepted stale write and still cleans up", async () => {
    const { env, registry, vault } = fixture();
    registry.recordRun.mockResolvedValueOnce({ writable: true, generation: 0 });
    await expect(runDeletionFenceAcceptance(env)).rejects.toThrow("unexpectedly accepted");
    expect(vault.purgeAccount).toHaveBeenCalledTimes(2);
  });
  it("rejects absent and expired tokens without touching bindings", async () => {
    const { env, registry } = fixture();
    for (const [token, expires] of [["", String(Date.now() + 60000)], ["wrong-token", String(Date.now() + 60000)], ["test-token", "0"]]) {
      const response = await worker.fetch(new Request("https://fixture.example/run", { method: "POST", headers: { Authorization: `Bearer ${token}` } }), { ...env, ACCEPTANCE_TOKEN: "test-token", ACCEPTANCE_EXPIRES_AT: expires! });
      expect(response.status).toBe(404);
    }
    expect(registry.requireAccountWritable).not.toHaveBeenCalled();
  });
});
