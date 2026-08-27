import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { attestationSigningInput, verifierFingerprint, type UnsignedAttestation } from "../attestation.js";
import { defaultPolicy } from "../policy.js";
import type { ExecutionPolicy, ObjectiveSpec, VerificationAttestation } from "../types.js";

export async function temporaryRoot(prefix = "donestate-test-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export function simpleObjective(root: string, executable = process.execPath): ObjectiveSpec {
  return {
    schema: "donestate.objective.v1",
    goal: "Complete a bounded test objective.",
    repositoryRoot: root,
    requestedBy: "test-suite",
    acceptanceCriteria: ["The bounded command succeeds."],
    actions: [
      {
        id: "execute",
        name: "Execute bounded command",
        kind: "command",
        authority: "local_write",
        command: { executable, args: ["-e", "process.stdout.write('ok')"] },
      },
    ],
  };
}

export function policyFor(root: string, executable = process.execPath): ExecutionPolicy {
  return defaultPolicy(root, [executable]);
}

export function signedAttestation(
  unsigned: UnsignedAttestation,
): { attestation: VerificationAttestation; fingerprint: string } {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = verifierFingerprint(publicKeyPem);
  const signatureBase64 = sign(null, attestationSigningInput(unsigned), pair.privateKey).toString("base64");
  return {
    fingerprint,
    attestation: {
      ...unsigned,
      signature: { algorithm: "ed25519", publicKeyPem, signerFingerprint: fingerprint, signatureBase64 },
    },
  };
}
