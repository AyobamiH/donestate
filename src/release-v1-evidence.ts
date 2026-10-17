import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";

/**
 * Inactive source-only receipt+independent-verdict gate. Do not wire into the
 * hosted DoneState Worker or mutate a target here. Published AgentProof RC6
 * does not contain the release.v1 action, and live OpsTruth has no release
 * signing lane. This contract cannot itself authorise a release.
 */
export const RELEASE_V1_RECEIPT_DOMAIN = "agentproof.signed-receipt.v2.release\0";
export const OPSTRUTH_RELEASE_DECISION_DOMAIN = "opstruth.release-v1-verification.v1\0";
const SHA = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const ALLOWED_SUBJECT = ["schema", "provider", "owner", "repository", "ownerId", "repositoryId",
  "releaseId", "tagName", "tagCommit", "packageAssetId", "packageAssetName", "packageDigest",
  "provenanceAssetId", "provenanceDigest", "prerelease", "makeLatest"];
function fail(reason: string): never { throw new Error("release_v1_gate:" + reason); }
function expect(value: unknown, reason: string): asserts value {
  if (!value) fail(reason);
}
function shape(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, any> {
  expect(value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype, label + "_type");
  const actual = Object.keys(value as object).sort();
  expect(JSON.stringify(actual) === JSON.stringify([...keys].sort()), label + "_shape");
}
function stable(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
}
function hash(input: string | Buffer): string { return createHash("sha256").update(input).digest("hex"); }
function keyFingerprint(pem: string): string {
  const key = createPublicKey(pem);
  expect(key.asymmetricKeyType === "ed25519", "key_algorithm");
  return "sha256:" + hash(key.export({ type: "spki", format: "der" }));
}
function proofSignature(pem: string, encoded: string, input: string): boolean {
  expect(typeof encoded === "string" && BASE64.test(encoded) &&
    Buffer.from(encoded, "base64").toString("base64") === encoded, "signature_encoding");
  return verifySignature(null, Buffer.from(input), createPublicKey(pem), Buffer.from(encoded, "base64"));
}
function validTime(raw: unknown): number {
  expect(typeof raw === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw), "time_invalid");
  const time = Date.parse(raw as string);
  expect(Number.isFinite(time) && new Date(time).toISOString() === raw, "time_invalid");
  return time;
}
export interface ReleaseGatePolicy {
  runId: string;
  transactionId: string;
  subjectDigest: string;
  trustedAgentProofSignerFingerprint: string;
  trustedApprovalFingerprint: string;
  trustedOpsTruthVerifierFingerprint: string;
  trustedProvenanceSignerFingerprint: string;
}
export interface ReleaseGateResult {
  status: "AWAITING_INDEPENDENT_VERIFICATION" | "VERIFIED" | "UNPROVEN" | "CONTRADICTED";
  releaseReceiptTrusted: boolean;
  independentlySignedDecision: boolean;
  reasonCode: string;
  subjectDigest: string;
  releaseReceiptPayloadDigest: string;
}
function verifyAgentProofReleaseV2(receipt: any, policy: ReleaseGatePolicy) {
  shape(receipt, ["payload", "proof"], "receipt");
  const p = receipt.payload, proof = receipt.proof;
  shape(p, ["schemaId", "schemaVersion", "receiptFormatVersion", "actionType", "receiptId", "issuedAt",
    "transactionId", "nonce", "idempotencyKey", "subject", "subjectDigest", "approval", "approvalDigest",
    "intentDigest", "effect", "attemptedAt", "verifiedAt", "before", "after", "verificationState",
    "independentOutcomeVerified", "compensationState", "signerRole", "signingPolicyId",
    "predecessorPayloadDigest"], "receipt_payload");
  shape(proof, ["algorithm", "keyId", "publicKeyPem", "signerFingerprint",
    "payloadDigest", "signatureBase64"], "receipt_proof");
  shape(p.subject, ALLOWED_SUBJECT, "release_subject");
  expect(p.schemaId === "agentproof.signed-receipt.v2" && p.schemaVersion === "2.0.0" &&
    p.receiptFormatVersion === "v2" && p.actionType === "agentproof.release.v1" &&
    p.effect === "publish_exact_existing_draft_prerelease" &&
    p.verificationState === "verified_provider_readback" &&
    p.independentOutcomeVerified === false && p.compensationState === "not_supported" &&
    p.predecessorPayloadDigest === null && p.signerRole === "independent_receipt_signer",
    "release_receipt_action_untrusted");
  const s = p.subject;
  expect(s.schema === "agentproof.release.subject.v1" && s.provider === "github" &&
    s.makeLatest === false && s.prerelease === true &&
    Number.isSafeInteger(s.ownerId) && Number.isSafeInteger(s.repositoryId) &&
    Number.isSafeInteger(s.releaseId) && SHA.test(p.subjectDigest) &&
    p.subjectDigest === hash(stable(s)) && p.subjectDigest === policy.subjectDigest &&
    p.transactionId === policy.transactionId, "release_subject_untrusted");
  for (const field of ["packageDigest", "provenanceDigest"])
    expect(FINGERPRINT.test(s[field]), "release_asset_subject_invalid");
  expect(proof.algorithm === "Ed25519" && proof.keyId === p.signingPolicyId &&
    proof.signerFingerprint === policy.trustedAgentProofSignerFingerprint &&
    keyFingerprint(proof.publicKeyPem) === proof.signerFingerprint, "release_signer_untrusted");
  const raw = RELEASE_V1_RECEIPT_DOMAIN + stable(p);
  expect(proof.payloadDigest === hash(raw) && proofSignature(proof.publicKeyPem, proof.signatureBase64, raw),
    "release_receipt_signature_invalid");
  const a = p.approval;
  shape(a, ["schema", "actionType", "subjectDigest", "transactionId", "nonce", "decision",
    "environment", "issuer", "decidedAt", "expiresAt", "authorityPublicKeyPem", "signatureBase64"], "approval");
  expect(a.schema === "agentproof.release.approval.v1" && a.actionType === p.actionType &&
    a.decision === "approved" && a.environment === "production" &&
    a.transactionId === p.transactionId && a.subjectDigest === p.subjectDigest &&
    a.nonce === p.nonce && p.approvalDigest === hash(stable(a)) &&
    keyFingerprint(a.authorityPublicKeyPem) === policy.trustedApprovalFingerprint &&
    policy.trustedApprovalFingerprint !== policy.trustedAgentProofSignerFingerprint,
    "approval_untrusted");
  const { signatureBase64: signature, ...unsignedApproval } = a;
  expect(proofSignature(a.authorityPublicKeyPem, signature, stable(unsignedApproval)), "approval_signature_invalid");
  expect(p.intentDigest === hash(stable({ transactionId: p.transactionId,
    idempotencyKey: p.idempotencyKey, nonce: p.nonce, subjectDigest: p.subjectDigest })), "intent_untrusted");
  const issued = validTime(p.issuedAt), attempted = validTime(p.attemptedAt), verified = validTime(p.verifiedAt);
  expect(validTime(a.decidedAt) <= attempted && attempted < validTime(a.expiresAt) &&
    attempted <= verified && verified <= issued, "release_timeline_invalid");
  for (const [obs, published] of [[p.before, false], [p.after, true]] as const) {
    shape(obs, ["schema", "ownerId", "repositoryId", "releaseId", "tagName", "tagCommit",
      "packageAssetId", "packageAssetName", "packageDigest", "provenanceAssetId", "provenanceDigest",
      "assetCount", "draft", "prerelease", "publishedAt"], "release_observation");
    expect(obs.schema === "agentproof.release.observation.v1" && obs.draft === !published &&
      obs.prerelease === true && obs.assetCount === 2 &&
      (published ? validTime(obs.publishedAt) > 0 : obs.publishedAt === null), "release_observation_state");
    for (const k of ["ownerId", "repositoryId", "releaseId", "tagName", "tagCommit", "packageAssetId",
      "packageAssetName", "packageDigest", "provenanceAssetId", "provenanceDigest"])
      expect(obs[k] === s[k], "release_observation_subject_mismatch");
  }
  return { subject: s, receiptPayloadDigest: proof.payloadDigest };
}
function projection(s: any) {
  const { owner, repository, ownerId, repositoryId, releaseId, tagName, tagCommit, packageAssetId,
    packageAssetName, packageDigest, provenanceAssetId, provenanceDigest } = s;
  return { schema: "opstruth.release-v1.subject.v1", owner, repository, ownerId, repositoryId,
    releaseId, tagName, tagCommit, packageAssetId, packageAssetName, packageDigest,
    provenanceAssetId, provenanceDigest };
}
/**
 * No side effects. Validates AgentProof execution evidence AND one independently
 * signed release-specific OpsTruth observation. Never accepts unsigned kit output.
 */
export function classifyReleaseV1Outcome(args: {
  policy: ReleaseGatePolicy; receipt: unknown; signedOpsTruthDecision?: unknown; now?: number;
}): ReleaseGateResult {
  const { policy, receipt, signedOpsTruthDecision, now = Date.now() } = args;
  for (const key of ["trustedAgentProofSignerFingerprint", "trustedApprovalFingerprint",
    "trustedOpsTruthVerifierFingerprint", "trustedProvenanceSignerFingerprint"] as const)
    expect(FINGERPRINT.test(policy[key]), "untrusted_policy");
  expect(new Set([policy.trustedAgentProofSignerFingerprint, policy.trustedApprovalFingerprint,
    policy.trustedOpsTruthVerifierFingerprint]).size === 3, "role_separation_missing");
  expect(typeof policy.runId === "string" && policy.runId.length >= 8 &&
    typeof policy.transactionId === "string" && policy.transactionId.length >= 8 &&
    SHA.test(policy.subjectDigest), "policy_subject_invalid");
  const verified = verifyAgentProofReleaseV2(receipt, policy);
  const base = { releaseReceiptTrusted: true, subjectDigest: policy.subjectDigest,
    releaseReceiptPayloadDigest: verified.receiptPayloadDigest };
  if (!signedOpsTruthDecision) return { ...base, status: "AWAITING_INDEPENDENT_VERIFICATION",
    independentlySignedDecision: false, reasonCode: "no_independent_release_attestation" };
  const report = signedOpsTruthDecision as any;
  shape(report, ["schema", "runId", "transactionId", "subjectDigest", "receiptPayloadDigest",
    "observation", "decision", "observedAt", "issuedBy", "signature"], "opstruth_release_decision");
  shape(report.signature, ["algorithm", "publicKeyPem", "signerFingerprint", "signatureBase64"], "opstruth_release_signature");
  const observation = report.observation;
  shape(observation, ["schema", "verdict", "reasonCode", "subjectDigest", "observedAt", "readOnly", "source",
    "independentAttestationIssued", "packageSha256", "provenanceSha256", "provenanceSignerFingerprint",
    "releaseId", "repositoryId", "tagCommit", "bytesObserved"], "opstruth_observation");
  shape(observation.bytesObserved, ["package", "provenance"], "opstruth_observed_bytes");
  const s = verified.subject;
  expect(report.schema === "opstruth.release-v1-signed-outcome.v1" &&
    report.runId === policy.runId && report.transactionId === policy.transactionId &&
    report.subjectDigest === policy.subjectDigest &&
    report.receiptPayloadDigest === verified.receiptPayloadDigest &&
    typeof report.issuedBy === "string" && /^opstruth[-.:]/i.test(report.issuedBy) &&
    report.signature.algorithm === "ed25519" &&
    keyFingerprint(report.signature.publicKeyPem) === policy.trustedOpsTruthVerifierFingerprint &&
    report.signature.signerFingerprint === policy.trustedOpsTruthVerifierFingerprint, "independent_identity_invalid");
  const { signature, ...unsigned } = report;
  expect(proofSignature(signature.publicKeyPem, signature.signatureBase64,
    OPSTRUTH_RELEASE_DECISION_DOMAIN + stable(unsigned)), "independent_signature_invalid");
  const time = validTime(report.observedAt), observedTime = validTime(observation.observedAt);
  expect(Math.abs(now - time) <= 15 * 60_000 && observedTime === time &&
    time >= validTime((receipt as any).payload.verifiedAt), "independent_evidence_stale");
  expect(observation.schema === "opstruth.release-v1.observation.v1" &&
    observation.readOnly === true && observation.independentAttestationIssued === false &&
    observation.subjectDigest === hash(stable(projection(s))) &&
    observation.repositoryId === s.repositoryId && observation.releaseId === s.releaseId &&
    observation.tagCommit === s.tagCommit &&
    observation.packageSha256 === s.packageDigest.slice(7) &&
    observation.provenanceSha256 === s.provenanceDigest.slice(7) &&
    observation.provenanceSignerFingerprint === policy.trustedProvenanceSignerFingerprint &&
    Number.isSafeInteger(observation.bytesObserved.package) && observation.bytesObserved.package > 0 &&
    Number.isSafeInteger(observation.bytesObserved.provenance) && observation.bytesObserved.provenance > 0,
    "independent_observation_unbound");
  expect(["verified", "failed", "uncertain"].includes(report.decision) &&
    ["VERIFIED", "CONTRADICTED", "UNPROVEN"].includes(observation.verdict), "independent_decision_invalid");
  if (report.decision === "verified") {
    expect(observation.verdict === "VERIFIED" &&
      observation.reasonCode === "exact_release_bytes_and_signed_provenance_match", "independent_false_success");
    return { ...base, status: "VERIFIED", independentlySignedDecision: true, reasonCode: "independent_verified_release" };
  }
  expect(report.decision === "failed" ? observation.verdict === "CONTRADICTED" :
    observation.verdict === "UNPROVEN", "independent_verdict_mismatch");
  return { ...base, status: report.decision === "failed" ? "CONTRADICTED" : "UNPROVEN",
    independentlySignedDecision: true, reasonCode: "independent_" + report.decision };
}
