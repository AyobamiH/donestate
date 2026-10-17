import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { canonicalJson } from "./hash.js";

/**
 * INACTIVE: source-only, permissionless handoff contract. The injected signer
 * belongs to a separately reviewed DoneState authority; this module must
 * not be added to the live controller or hosted Worker without a canary.
 */
export const RELEASE_V1_HANDOFF_DOMAIN = "donestate.release-verification-handoff.v1\0";
export const RELEASE_V1_HANDOFF_ISSUER = "donestate.release-handoff";
const HEX = /^[0-9a-f]{64}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[0-9a-f-]{36}$/;
const BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const ALL_KEYS = ["schema","runId","transactionId","subjectDigest","receiptPayloadDigest",
  "githubRunId","issuedAt","expiresAt","issuer","publicKeyPem","signatureBase64"];
function fail(code: string): never { throw new Error("release_handoff:" + code); }
function demand(value: unknown, code: string): asserts value { if (!value) fail(code); }
function time(value: string): number {
  demand(typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value), "invalid_time");
  const timestamp = Date.parse(value);
  demand(Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value, "invalid_time");
  return timestamp;
}
function keyFingerprint(pem: string): string {
  const key = createPublicKey(pem);
  demand(key.asymmetricKeyType === "ed25519", "wrong_signer_algorithm");
  return "sha256:" + createHash("sha256").update(
    key.export({ type: "spki", format: "der" })).digest("hex");
}
export interface ReleaseVerificationHandoffV1 {
  schema: "donestate.release-verification-handoff.v1";
  runId: string; transactionId: string;
  subjectDigest: string; receiptPayloadDigest: string; githubRunId: string;
  issuedAt: string; expiresAt: string; issuer: typeof RELEASE_V1_HANDOFF_ISSUER;
  publicKeyPem: string; signatureBase64: string;
}
export interface ReleaseHandoffSigner {
  publicKeyPem(): Promise<string>;
  signCanonical(input: string): Promise<Buffer>;
}
export interface ReleaseHandoffSubject {
  runId: string; transactionId: string; subjectDigest: string;
  receiptPayloadDigest: string; githubRunId: string;
}
export interface ReleaseHandoffPolicy extends ReleaseHandoffSubject {
  trustedHandoffFingerprint: string;
  otherRoleFingerprints: string[];
  now?: number;
}
function validateBinding(binding: ReleaseHandoffSubject): void {
  demand(UUID.test(binding.runId) && UUID.test(binding.transactionId) &&
    HEX.test(binding.subjectDigest) && HEX.test(binding.receiptPayloadDigest) &&
    /^[1-9]\d{0,19}$/.test(binding.githubRunId), "invalid_binding");
}
function distinct(key: string, otherRoles: string[]): void {
  demand(FINGERPRINT.test(key) && Array.isArray(otherRoles) &&
    otherRoles.length >= 3 &&
    otherRoles.every(item => FINGERPRINT.test(item)) &&
    !otherRoles.includes(key), "signer_not_independent");
}
/**
 * Construct one short-lived verification request; NEVER authorize execution.
 * Signer keys are injected from an external secret store, never returned.
 */
export async function createReleaseV1Handoff(
  subject: ReleaseHandoffSubject,
  signer: ReleaseHandoffSigner,
  trust: { trustedHandoffFingerprint: string; otherRoleFingerprints: string[] },
  now = Date.now(), ttlMs = 300_000,
): Promise<ReleaseVerificationHandoffV1> {
  validateBinding(subject);
  demand(Number.isFinite(now) && Number.isInteger(ttlMs) &&
    ttlMs >= 1_000 && ttlMs <= 600_000, "invalid_lifetime");
  const publicKeyPem = await signer.publicKeyPem();
  const actualFingerprint = keyFingerprint(publicKeyPem);
  demand(actualFingerprint === trust.trustedHandoffFingerprint, "untrusted_handoff_key");
  distinct(actualFingerprint, trust.otherRoleFingerprints);
  const unsigned: Omit<ReleaseVerificationHandoffV1, "signatureBase64"> = {
    schema: "donestate.release-verification-handoff.v1",
    ...subject, issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    issuer: RELEASE_V1_HANDOFF_ISSUER, publicKeyPem,
  };
  const message = RELEASE_V1_HANDOFF_DOMAIN + canonicalJson(unsigned);
  const signature = await signer.signCanonical(message);
  demand(Buffer.isBuffer(signature) && signature.length === 64, "invalid_signature_result");
  const result = { ...unsigned, signatureBase64: signature.toString("base64") };
  verifyReleaseV1Handoff(result, { ...subject, ...trust, now });
  return result;
}
export function verifyReleaseV1Handoff(
  handoff: ReleaseVerificationHandoffV1, policy: ReleaseHandoffPolicy,
): void {
  demand(handoff !== null && typeof handoff === "object" &&
    !Array.isArray(handoff) &&
    Object.getPrototypeOf(handoff) === Object.prototype &&
    JSON.stringify(Object.keys(handoff).sort()) === JSON.stringify([...ALL_KEYS].sort()),
    "invalid_handoff_shape");
  validateBinding(policy);
  const now = policy.now ?? Date.now();
  demand(handoff.schema === "donestate.release-verification-handoff.v1" &&
    handoff.issuer === RELEASE_V1_HANDOFF_ISSUER, "unsupported_handoff");
  for (const key of ["runId","transactionId","subjectDigest","receiptPayloadDigest",
    "githubRunId"] as const) {
    demand(handoff[key] === policy[key], "handoff_subject_mismatch");
  }
  const issued = time(handoff.issuedAt), expires = time(handoff.expiresAt);
  demand(expires > issued && expires-issued <= 600_000 &&
    issued <= now + 60_000 && expires > now, "handoff_expired_or_future");
  const fingerprint = keyFingerprint(handoff.publicKeyPem);
  demand(fingerprint === policy.trustedHandoffFingerprint, "untrusted_handoff_key");
  distinct(fingerprint, policy.otherRoleFingerprints);
  demand(typeof handoff.signatureBase64 === "string" &&
    BASE64.test(handoff.signatureBase64) &&
    Buffer.from(handoff.signatureBase64,"base64").toString("base64") === handoff.signatureBase64,
    "invalid_signature_encoding");
  const { signatureBase64, ...unsigned } = handoff;
  demand(verifySignature(null,
    Buffer.from(RELEASE_V1_HANDOFF_DOMAIN + canonicalJson(unsigned)),
    createPublicKey(handoff.publicKeyPem), Buffer.from(signatureBase64,"base64")),
    "signature_rejected");
}
