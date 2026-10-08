import type { DoneStateEnv } from "./environment";
import type { CredentialStatus } from "./credential-vault";
import type { AccountDataSummary, AccountRunRecord } from "./maintenance-registry";
import type { RunState, SelectedRepository } from "./types";

export type AccountDataEnv = Pick<DoneStateEnv, "CREDENTIAL_VAULT" | "MAINTENANCE_REGISTRY" | "RUN_COORDINATOR">;
export interface AccountRunView extends AccountRunRecord {
  state: RunState | "MISSING";
  updatedAt: string;
}
export interface AccountView {
  credential: CredentialStatus;
  repositories: SelectedRepository[];
  runs: AccountRunView[];
  summary: AccountDataSummary;
  inventoryComplete: boolean;
}

const DELETABLE_RUN_STATES = new Set<RunState>([
  "AWAITING_VERIFICATION", "VERIFIED", "BLOCKED_AUTHORITY", "BLOCKED_CAPABILITY",
  "BLOCKED_SAFETY", "AMBIGUOUS_EFFECT", "FAILED_SAFE", "CANCELLED",
]);

function coordinator(env: AccountDataEnv, runId: string) {
  return env.RUN_COORDINATOR.getByName(runId) as unknown as {
    get(ownerLogin: string): Promise<{ state: RunState; updatedAt: string }>;
    accountDeletionState(ownerLogin: string): Promise<{ state: RunState; updatedAt: string } | null>;
    purge(ownerLogin: string): Promise<{ runId: string; deleted: true }>;
  };
}

export async function readAccountData(env: AccountDataEnv, login: string, strict = true): Promise<AccountView> {
  const registry = env.MAINTENANCE_REGISTRY.getByName("global");
  const [credential, repositories, runs, summary] = await Promise.all([
    env.CREDENTIAL_VAULT.getByName(login).status(login),
    registry.listRepositories(login), registry.listRuns(login), registry.accountDataSummary(login),
  ]);
  const views = await Promise.all(runs.map(async (item): Promise<AccountRunView> => {
    if (strict) {
      // Absence is returned only by a successful owner-checked coordinator read.
      const run = await coordinator(env, item.runId).accountDeletionState(login);
      return { ...item, state: run?.state ?? "MISSING", updatedAt: run?.updatedAt ?? item.updatedAt };
    }
    try {
      const run = await coordinator(env, item.runId).get(login);
      return { ...item, state: run.state, updatedAt: run.updatedAt };
    } catch {
      return { ...item, state: "MISSING", updatedAt: item.updatedAt };
    }
  }));
  // The current registry limits listRuns to 200. Never claim a full inventory at that boundary.
  const publicCredential: CredentialStatus = {
    connected: credential.connected, fingerprint: credential.fingerprint,
    createdAt: credential.createdAt, updatedAt: credential.updatedAt, lastUsedAt: credential.lastUsedAt,
    dailyRunsUsed: credential.dailyRunsUsed, dailyRunLimit: credential.dailyRunLimit, activeRunId: credential.activeRunId,
  };
  return {
    credential: publicCredential, repositories, runs: views, summary,
    inventoryComplete: runs.length < 200 && runs.length === summary.indexedRuns
      && repositories.length === summary.selectedRepositories,
  };
}

export class AccountDeletionRefused extends Error {}

export async function deleteIndexedAccountData(env: AccountDataEnv, login: string) {
  const registry = env.MAINTENANCE_REGISTRY.getByName("global");
  const vault = env.CREDENTIAL_VAULT.getByName(login);
  const registryFence = await registry.beginAccountDeletion(login);
  const vaultFence = await vault.beginAccountDeletion();
  const account = await readAccountData(env, login);
  if (!account.inventoryComplete) {
    // Keep the locks: an incomplete inventory cannot authorise any purge.
    throw new Error("BLOCKED_CAPABILITY: account inventory reaches the 200-run limit; use supported privacy support");
  }
  const active = account.runs.filter((item) => item.state !== "MISSING" && !DELETABLE_RUN_STATES.has(item.state));
  if (active.length > 0 || account.credential.activeRunId) {
    await vault.endAccountDeletion();
    await registry.endAccountDeletion(login);
    const ids = [...new Set([...active.map((item) => item.runId), ...(account.credential.activeRunId ? [account.credential.activeRunId] : [])])];
    throw new AccountDeletionRefused(`Cancel active objectives before deletion: ${ids.join(", ")}`);
  }
  for (const item of account.runs) {
    if (item.state !== "MISSING") await coordinator(env, item.runId).purge(login);
  }
  await vault.purgeAccount(login);
  const deleted = await registry.purgeAccount(login);
  return { deleted, registryGeneration: registryFence.generation, credentialGeneration: vaultFence.generation };
}
