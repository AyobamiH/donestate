import { DoneStateError } from "./errors.js";
import { digest } from "./hash.js";
import type { DoneStateStore } from "./store.js";
import type { PersistedAction, RunRecord, VerificationHandoff } from "./types.js";

export function executionSnapshotCore(run: RunRecord, actions: PersistedAction[]): Record<string, unknown> {
  return {
    schema: "donestate.execution-snapshot.v1",
    runId: run.id,
    objectiveDigest: run.objectiveDigest,
    repositoryRoot: run.objective.repositoryRoot,
    acceptanceCriteria: run.objective.acceptanceCriteria,
    actions: actions.map((action) => ({
      id: action.actionId,
      state: action.state,
      authority: action.spec.authority,
      idempotencyKey: action.idempotencyKey,
      intentDigest: action.intentDigest,
      resultDigest: action.result ? digest(action.result) : null,
    })),
  };
}

export function executionSnapshotDigest(run: RunRecord, actions: PersistedAction[]): string {
  return digest(executionSnapshotCore(run, actions));
}

export async function createVerificationHandoff(
  store: DoneStateStore,
  runId: string,
): Promise<VerificationHandoff> {
  const run = await store.getRun(runId);
  const actions = await store.listActions(runId);
  const chain = await store.verifyEventChain(runId);
  if (!chain.valid || !chain.head) {
    throw new DoneStateError("VERIFICATION_REJECTED", "The run event chain is missing or invalid.");
  }
  const snapshot = executionSnapshotDigest(run, actions);
  if (!run.verificationSnapshotDigest || run.verificationSnapshotDigest !== snapshot) {
    throw new DoneStateError("VERIFICATION_REJECTED", "The current run no longer matches its sealed verification snapshot.");
  }
  return {
    schema: "donestate.verification-handoff.v1",
    runId,
    generatedAt: new Date().toISOString(),
    objectiveDigest: run.objectiveDigest,
    executionSnapshotDigest: snapshot,
    repositoryRoot: run.objective.repositoryRoot,
    acceptanceCriteria: run.objective.acceptanceCriteria,
    actions: actions.map((action) => ({
      id: action.actionId,
      state: action.state,
      authority: action.spec.authority,
      idempotencyKey: action.idempotencyKey,
      resultDigest: action.result ? digest(action.result) : null,
    })),
    eventChainHead: chain.head,
  };
}
