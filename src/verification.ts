import { validateAttestation } from "./attestation.js";
import type { DoneStateStore } from "./store.js";
import type { RunRecord, RunState, VerificationAttestation } from "./types.js";

export async function recordIndependentAttestation(
  store: DoneStateStore,
  attestation: VerificationAttestation,
): Promise<RunRecord> {
  const run = await store.getRun(attestation.runId);
  if (!run.verificationSnapshotDigest) throw new Error("Run has no sealed verification snapshot.");
  validateAttestation(attestation, run.id, run.verificationSnapshotDigest, run.policy);
  const nextState: RunState = attestation.decision === "verified"
    ? "VERIFIED"
    : attestation.decision === "uncertain"
      ? "AMBIGUOUS_EFFECT"
      : "FAILED_SAFE";
  await store.saveAttestation(run.id, attestation, nextState);
  return store.getRun(run.id);
}
