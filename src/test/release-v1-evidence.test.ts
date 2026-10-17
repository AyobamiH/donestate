import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { classifyReleaseV1Outcome, OPSTRUTH_RELEASE_DECISION_DOMAIN,
  RELEASE_V1_RECEIPT_DOMAIN } from "../release-v1-evidence.js";

function stable(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function pair() {
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = "sha256:" + createHash("sha256")
    .update(keys.publicKey.export({ type: "spki", format: "der" })).digest("hex");
  return { keys, publicKeyPem, fingerprint,
    signature: (text: string) => sign(null, Buffer.from(text), keys.privateKey).toString("base64") };
}
function fixture() {
  const authority = pair(), receiptSigner = pair(), opstruth = pair(), provenance = pair();
  const now = Date.now();
  const times = { decidedAt: new Date(now - 30_000).toISOString(), attemptedAt: new Date(now - 20_000).toISOString(),
    verifiedAt: new Date(now - 12_000).toISOString(), issuedAt: new Date(now - 10_000).toISOString(),
    observedAt: new Date(now - 2000).toISOString() };
  const transactionId = randomUUID(), runId = randomUUID(),
    nonce = "release-nonce-" + randomUUID(), idempotencyKey = "release-idem-" + randomUUID();
  const subject = { schema: "agentproof.release.subject.v1", provider: "github", owner: "Example",
    repository: "disposable", ownerId: 101, repositoryId: 202, releaseId: 303,
    tagName: "v1.0.0-rc.1", tagCommit: "a".repeat(40),
    packageAssetId: 404, packageAssetName: "artifact.tgz", packageDigest: "sha256:" + "b".repeat(64),
    provenanceAssetId: 505, provenanceDigest: "sha256:" + "c".repeat(64),
    prerelease: true, makeLatest: false };
  const subjectDigest = sha(stable(subject));
  const approvalUnsigned = { schema: "agentproof.release.approval.v1", actionType: "agentproof.release.v1",
    subjectDigest, transactionId, nonce, decision: "approved", environment: "production",
    issuer: "distinct-release-authority", decidedAt: times.decidedAt,
    expiresAt: new Date(now + 180_000).toISOString(), authorityPublicKeyPem: authority.publicKeyPem };
  const approval = { ...approvalUnsigned, signatureBase64: authority.signature(stable(approvalUnsigned)) };
  const state = (draft: boolean) => ({ schema: "agentproof.release.observation.v1",
    ownerId: subject.ownerId, repositoryId: subject.repositoryId, releaseId: subject.releaseId,
    tagName: subject.tagName, tagCommit: subject.tagCommit,
    packageAssetId: subject.packageAssetId, packageAssetName: subject.packageAssetName,
    packageDigest: subject.packageDigest, provenanceAssetId: subject.provenanceAssetId,
    provenanceDigest: subject.provenanceDigest, assetCount: 2,
    draft, prerelease: true, publishedAt: draft ? null : times.verifiedAt });
  const payload = { schemaId: "agentproof.signed-receipt.v2", schemaVersion: "2.0.0",
    receiptFormatVersion: "v2", actionType: "agentproof.release.v1", receiptId: randomUUID(),
    issuedAt: times.issuedAt, transactionId, nonce, idempotencyKey, subject, subjectDigest, approval,
    approvalDigest: sha(stable(approval)),
    intentDigest: sha(stable({ transactionId, idempotencyKey, nonce, subjectDigest })),
    effect: "publish_exact_existing_draft_prerelease", attemptedAt: times.attemptedAt,
    verifiedAt: times.verifiedAt, before: state(true), after: state(false),
    verificationState: "verified_provider_readback", independentOutcomeVerified: false,
    compensationState: "not_supported", signerRole: "independent_receipt_signer",
    signingPolicyId: "separate-release-signing", predecessorPayloadDigest: null };
  const signedInput = RELEASE_V1_RECEIPT_DOMAIN + stable(payload);
  const receipt = { payload, proof: { algorithm: "Ed25519",
    keyId: payload.signingPolicyId, publicKeyPem: receiptSigner.publicKeyPem,
    signerFingerprint: receiptSigner.fingerprint, payloadDigest: sha(signedInput),
    signatureBase64: receiptSigner.signature(signedInput) } };
  const projection = { schema: "opstruth.release-v1.subject.v1", owner: subject.owner,
    repository: subject.repository, ownerId: subject.ownerId, repositoryId: subject.repositoryId,
    releaseId: subject.releaseId, tagName: subject.tagName, tagCommit: subject.tagCommit,
    packageAssetId: subject.packageAssetId, packageAssetName: subject.packageAssetName,
    packageDigest: subject.packageDigest, provenanceAssetId: subject.provenanceAssetId,
    provenanceDigest: subject.provenanceDigest };
  const observation = { schema: "opstruth.release-v1.observation.v1", verdict: "VERIFIED",
    reasonCode: "exact_release_bytes_and_signed_provenance_match", subjectDigest: sha(stable(projection)),
    observedAt: times.observedAt, readOnly: true, source: "injected-read-only-release-reader",
    independentAttestationIssued: false, packageSha256: subject.packageDigest.slice(7),
    provenanceSha256: subject.provenanceDigest.slice(7),
    provenanceSignerFingerprint: provenance.fingerprint,
    releaseId: subject.releaseId, repositoryId: subject.repositoryId, tagCommit: subject.tagCommit,
    bytesObserved: { package: 201, provenance: 124 } };
  const reportUnsigned = { schema: "opstruth.release-v1-signed-outcome.v1",
    runId, transactionId, subjectDigest, receiptPayloadDigest: receipt.proof.payloadDigest,
    observation, decision: "verified", observedAt: times.observedAt, issuedBy: "opstruth.release-verifier" };
  function signReport(input: any) {
    const { signature: _old, ...unsigned } = input;
    return { ...unsigned, signature: { algorithm: "ed25519", publicKeyPem: opstruth.publicKeyPem,
      signerFingerprint: opstruth.fingerprint,
      signatureBase64: opstruth.signature(OPSTRUTH_RELEASE_DECISION_DOMAIN + stable(unsigned)) } };
  }
  const signedOpsTruthDecision = signReport(reportUnsigned);
  const policy = { runId, transactionId, subjectDigest,
    trustedApprovalFingerprint: authority.fingerprint,
    trustedAgentProofSignerFingerprint: receiptSigner.fingerprint,
    trustedOpsTruthVerifierFingerprint: opstruth.fingerprint,
    trustedProvenanceSignerFingerprint: provenance.fingerprint };
  return { policy, receipt, signedOpsTruthDecision, signReport, times };
}

test("source-only gate never creates DoneState VERIFIED from AgentProof receipt alone", () => {
  const f = fixture(), result = classifyReleaseV1Outcome({ policy: f.policy, receipt: f.receipt });
  assert.equal(result.status, "AWAITING_INDEPENDENT_VERIFICATION");
  assert.equal(result.releaseReceiptTrusted, true);
  assert.equal(result.independentlySignedDecision, false);
});

test("separate pinned OpsTruth Ed25519 release report binds exact bytes, run and receipt", () => {
  const f = fixture();
  const result = classifyReleaseV1Outcome({ policy: f.policy, receipt: f.receipt,
    signedOpsTruthDecision: f.signedOpsTruthDecision });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.independentlySignedDecision, true);
  assert.equal(result.releaseReceiptPayloadDigest, f.receipt.proof.payloadDigest);
});

test("self-reported and unsigned OpsTruth VERIFIED is rejected", () => {
  const f = fixture();
  for (const decision of [
    { ...f.signedOpsTruthDecision, signature: { ...f.signedOpsTruthDecision.signature,
      signatureBase64: "A".repeat(86) + "==" } },
    { ...f.signedOpsTruthDecision, issuedBy: "donestate.self-verifier" },
    { ...f.signedOpsTruthDecision, observation: { ...f.signedOpsTruthDecision.observation,
      independentAttestationIssued: true } },
  ]) assert.throws(() => classifyReleaseV1Outcome({ policy: f.policy, receipt: f.receipt,
    signedOpsTruthDecision: decision }));
});

test("wrong agentproof release receipt, signer, environment and published subject cannot verify", () => {
  const f = fixture();
  const altered = [
    { ...f.receipt, proof: { ...f.receipt.proof, signerFingerprint: "sha256:" + "f".repeat(64) } },
    { ...f.receipt, payload: { ...f.receipt.payload, independentOutcomeVerified: true } },
    { ...f.receipt, payload: { ...f.receipt.payload, approval: {
      ...f.receipt.payload.approval, environment: "development" } } },
    { ...f.receipt, payload: { ...f.receipt.payload, after: {
      ...f.receipt.payload.after, tagCommit: "f".repeat(40) } } },
  ];
  for (const receipt of altered) assert.throws(() => classifyReleaseV1Outcome({ policy: f.policy, receipt }));
});

test("a previously trusted verification cannot be transplanted to another run or release", () => {
  const f = fixture();
  for (const policy of [
    { ...f.policy, runId: randomUUID() },
    { ...f.policy, transactionId: randomUUID() },
    { ...f.policy, subjectDigest: "f".repeat(64) },
    { ...f.policy, trustedProvenanceSignerFingerprint: "sha256:" + "f".repeat(64) },
  ]) assert.throws(() => classifyReleaseV1Outcome({ policy, receipt: f.receipt,
    signedOpsTruthDecision: f.signedOpsTruthDecision }));
});

test("signed uncertain or contradicted OpsTruth report does not produce VERIFIED", () => {
  const f = fixture();
  for (const [decision, verdict, resultState] of [
    ["failed", "CONTRADICTED", "CONTRADICTED"],
    ["uncertain", "UNPROVEN", "UNPROVEN"],
  ]) {
    const original = { ...f.signedOpsTruthDecision, decision,
      observation: { ...f.signedOpsTruthDecision.observation, verdict } };
    const signed = f.signReport(original);
    const result = classifyReleaseV1Outcome({ policy: f.policy, receipt: f.receipt,
      signedOpsTruthDecision: signed });
    assert.equal(result.status, resultState);
  }
});

test("stale independently signed report or self-attestation of bytes cannot pass", () => {
  const f = fixture(), old = new Date(Date.now() - 35 * 60_000).toISOString();
  const signed = f.signReport({ ...f.signedOpsTruthDecision, observedAt: old,
    observation: { ...f.signedOpsTruthDecision.observation, observedAt: old } });
  assert.throws(() => classifyReleaseV1Outcome({ policy: f.policy, receipt: f.receipt,
    signedOpsTruthDecision: signed }));
  const differentSigner = { ...f.policy, trustedOpsTruthVerifierFingerprint: f.policy.trustedAgentProofSignerFingerprint };
  assert.throws(() => classifyReleaseV1Outcome({ policy: differentSigner, receipt: f.receipt,
    signedOpsTruthDecision: f.signedOpsTruthDecision }));
});
