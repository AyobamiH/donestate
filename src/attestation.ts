import { createHash, createPublicKey, verify } from "node:crypto";
import { DoneStateError } from "./errors.js";
import { canonicalJson } from "./hash.js";
import type { ExecutionPolicy, VerificationAttestation } from "./types.js";

const DOMAIN = "donestate.verification-attestation.v1\0";

export type UnsignedAttestation = Omit<VerificationAttestation, "signature">;

export function attestationSigningInput(attestation: UnsignedAttestation): Buffer {
  return Buffer.from(`${DOMAIN}${canonicalJson(attestation)}`, "utf8");
}

export function verifierFingerprint(publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  const der = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function validateAttestation(
  attestation: VerificationAttestation,
  runId: string,
  snapshotDigest: string,
  policy: ExecutionPolicy,
): void {
  if (attestation.schema !== "donestate.verification-attestation.v1") {
    throw new DoneStateError("VERIFICATION_REJECTED", "Unsupported attestation schema.");
  }
  if (attestation.runId !== runId) {
    throw new DoneStateError("VERIFICATION_REJECTED", "The attestation targets another run.");
  }
  if (attestation.executionSnapshotDigest !== snapshotDigest) {
    throw new DoneStateError("VERIFICATION_REJECTED", "The attestation does not match the sealed execution snapshot.");
  }
  if (!attestation.issuedBy.trim() || /^donestate(?:$|[/:_-])/i.test(attestation.issuedBy)) {
    throw new DoneStateError("VERIFICATION_REJECTED", "DoneState cannot attest to its own outcome.");
  }
  if (new Date(attestation.issuedAt).toString() === "Invalid Date") {
    throw new DoneStateError("VERIFICATION_REJECTED", "The attestation issuedAt value is invalid.");
  }
  if (attestation.evidenceRefs.length === 0 || attestation.evidenceRefs.some((item) => !item.trim())) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Independent evidence references are required.");
  }
  if (attestation.signature.algorithm !== "ed25519") {
    throw new DoneStateError("VERIFICATION_REJECTED", "Only Ed25519 verifier signatures are accepted.");
  }
  const actualFingerprint = verifierFingerprint(attestation.signature.publicKeyPem);
  if (actualFingerprint !== attestation.signature.signerFingerprint) {
    throw new DoneStateError("VERIFICATION_REJECTED", "The verifier fingerprint does not match its public key.");
  }
  if (!policy.trustedVerifierFingerprints.includes(actualFingerprint)) {
    throw new DoneStateError("VERIFICATION_REJECTED", "The verifier key is not trusted by this run policy.");
  }
  const { signature, ...unsigned } = attestation;
  const valid = verify(
    null,
    attestationSigningInput(unsigned),
    createPublicKey(signature.publicKeyPem),
    Buffer.from(signature.signatureBase64, "base64"),
  );
  if (!valid) throw new DoneStateError("VERIFICATION_REJECTED", "The verifier signature is invalid.");
}
