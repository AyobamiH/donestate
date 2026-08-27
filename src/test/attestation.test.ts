import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { attestationSigningInput, validateAttestation, verifierFingerprint } from "../attestation.js";
import { DoneStateError } from "../errors.js";
import { policyFor, temporaryRoot } from "./helpers.js";
import type { VerificationAttestation } from "../types.js";

test("accepts an Ed25519 attestation from a pinned independent verifier", async () => {
  const root = await temporaryRoot();
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = verifierFingerprint(publicKeyPem);
  const unsigned = {
    schema: "donestate.verification-attestation.v1" as const,
    runId: "run_1",
    executionSnapshotDigest: "snapshot",
    decision: "verified" as const,
    issuedBy: "opstruth:production",
    issuedAt: new Date().toISOString(),
    evidenceRefs: ["https://example.invalid/evidence/1"],
  };
  const attestation: VerificationAttestation = {
    ...unsigned,
    signature: {
      algorithm: "ed25519",
      publicKeyPem,
      signerFingerprint: fingerprint,
      signatureBase64: sign(null, attestationSigningInput(unsigned), pair.privateKey).toString("base64"),
    },
  };
  const policy = policyFor(root);
  policy.trustedVerifierFingerprints = [fingerprint];
  assert.doesNotThrow(() => validateAttestation(attestation, "run_1", "snapshot", policy));
});

test("rejects DoneState as its own verifier", async () => {
  const root = await temporaryRoot();
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = verifierFingerprint(publicKeyPem);
  const unsigned = {
    schema: "donestate.verification-attestation.v1" as const,
    runId: "run_1",
    executionSnapshotDigest: "snapshot",
    decision: "verified" as const,
    issuedBy: "donestate",
    issuedAt: new Date().toISOString(),
    evidenceRefs: ["evidence://self"],
  };
  const attestation: VerificationAttestation = {
    ...unsigned,
    signature: {
      algorithm: "ed25519",
      publicKeyPem,
      signerFingerprint: fingerprint,
      signatureBase64: sign(null, attestationSigningInput(unsigned), pair.privateKey).toString("base64"),
    },
  };
  const policy = policyFor(root);
  policy.trustedVerifierFingerprints = [fingerprint];
  assert.throws(
    () => validateAttestation(attestation, "run_1", "snapshot", policy),
    (error: unknown) => error instanceof DoneStateError && error.code === "VERIFICATION_REJECTED",
  );
});
