import type { CredentialVault } from "./credential-vault";
import type { MaintenanceRegistry } from "./maintenance-registry";

interface AcceptanceEnv {
  CREDENTIAL_VAULT: DurableObjectNamespace<CredentialVault>;
  MAINTENANCE_REGISTRY: DurableObjectNamespace<MaintenanceRegistry>;
  ACCEPTANCE_TOKEN: string;
  ACCEPTANCE_EXPIRES_AT: string;
}

async function rejected(operation: () => Promise<unknown>, expected: string): Promise<boolean> {
  try { await operation(); } catch (error) {
    if (error instanceof Error && error.message.includes(expected)) return true;
    throw error;
  }
  throw new Error("stale write unexpectedly accepted");
}

export async function runDeletionFenceAcceptance(env: Pick<AcceptanceEnv, "CREDENTIAL_VAULT" | "MAINTENANCE_REGISTRY">) {
  // A colon makes this impossible to collide with a real GitHub login.
  // No caller-supplied identity, repository, credential or method is accepted.
  const fixture = `acceptance:deletion:${crypto.randomUUID()}`;
  const runId = crypto.randomUUID();
  const registry = env.MAINTENANCE_REGISTRY.getByName("global");
  const vault = env.CREDENTIAL_VAULT.getByName(fixture);
  const observedAt = new Date().toISOString();
  let release!: () => void;
  let admit!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const admitted = new Promise<void>((resolve) => { admit = resolve; });
  // This operation remains in flight across the deletion. The barrier controls
  // ordering; there is no timing-dependent sleep or probabilistic race.
  const pendingWrite = (async () => {
    const registryAdmission = await registry.requireAccountWritable(fixture);
    const vaultAdmission = await vault.requireAccountWritable();
    admit();
    await barrier;
    const registryRejected = await rejected(
      () => registry.recordRun(fixture, runId, "acceptance/deletion-fixture", "operator", registryAdmission.generation),
      "state changed during operation",
    );
    const vaultRejected = await rejected(
      () => vault.storeCredential(fixture, "acceptance-dummy-not-an-api-key", vaultAdmission.generation),
      "state changed during operation",
    );
    return { registryRejected, vaultRejected, registryGeneration: registryAdmission.generation, vaultGeneration: vaultAdmission.generation };
  })();
  // Attach a handler immediately, including if admission fails before the barrier.
  const pendingResult = pendingWrite.then(value => ({ value }), error => ({ error }));
  try {
    const admissionResult = await Promise.race([admitted.then(() => true), pendingResult.then(() => false)]);
    if (!admissionResult) throw new Error("fixture admission failed");
    const registryDeletion = await registry.beginAccountDeletion(fixture);
    const vaultDeletion = await vault.beginAccountDeletion();
    await vault.purgeAccount(fixture);
    await registry.purgeAccount(fixture);
    release();
    const result = await pendingResult;
    if ("error" in result) throw result.error;
    const summary = await registry.accountDataSummary(fixture);
    const credential = await vault.status(fixture);
    if (summary.indexedRuns || summary.findings || summary.selectedRepositories || credential.connected) {
      throw new Error("fixture data reappeared after deletion");
    }
    return {
      schema: "donestate.production-deletion-fence.v1",
      observedAt,
      fixture,
      productionWorker: "donestate-mcp",
      ordering: ["admit", "pause", "delete", "resume", "reject", "readback"],
      ...result.value,
      registryDeletionGeneration: registryDeletion.generation,
      vaultDeletionGeneration: vaultDeletion.generation,
      indexedRunsAfter: summary.indexedRuns,
      credentialConnectedAfter: credential.connected,
      boundary: "Production storage guards; synthetic identity. Real authenticated account journey recorded separately in E-064.",
    };
  } finally {
    release();
    await pendingResult;
    // Remove any data even when a regression unexpectedly admits a write.
    await registry.beginAccountDeletion(fixture);
    await vault.beginAccountDeletion();
    await vault.purgeAccount(fixture);
    await registry.purgeAccount(fixture);
  }
}

export default {
  async fetch(request: Request, env: AcceptanceEnv): Promise<Response> {
    const expires = Number(env.ACCEPTANCE_EXPIRES_AT);
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    if (request.method !== "POST" || new URL(request.url).pathname !== "/run"
      || !env.ACCEPTANCE_TOKEN || !Number.isFinite(expires) || Date.now() >= expires
      || token.length !== env.ACCEPTANCE_TOKEN.length
      || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(token), new TextEncoder().encode(env.ACCEPTANCE_TOKEN))) {
      return new Response("Not found", { status: 404 });
    }
    try {
      return Response.json(await runDeletionFenceAcceptance(env), { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "deletion_fence_acceptance_failed" }, { status: 500 });
    }
  },
};
