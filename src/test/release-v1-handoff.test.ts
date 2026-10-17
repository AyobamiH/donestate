import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { verifierFingerprint } from "../attestation.js";
import { createReleaseV1Handoff, verifyReleaseV1Handoff,
  RELEASE_V1_HANDOFF_DOMAIN, type ReleaseHandoffSigner,
  type ReleaseHandoffSubject } from "../release-v1-handoff.js";
import { canonicalJson } from "../hash.js";

function fixture() {
  const generated = generateKeyPairSync("ed25519");
  const pem = generated.publicKey.export({ format: "pem", type: "spki" }).toString();
  const fp = "sha256:" + verifierFingerprint(pem);
  const other = Array.from({ length: 3 }, () => {
    const x = generateKeyPairSync("ed25519");
    return "sha256:" + verifierFingerprint(
      x.publicKey.export({ format: "pem", type: "spki" }).toString());
  });
  const signer: ReleaseHandoffSigner = {
    publicKeyPem: async () => pem,
    signCanonical: async input => sign(null, Buffer.from(input), generated.privateKey),
  };
  const subject: ReleaseHandoffSubject = {
    runId: randomUUID(), transactionId: randomUUID(),
    subjectDigest: "a".repeat(64), receiptPayloadDigest: "b".repeat(64),
    githubRunId: "39069037772",
  };
  const trust = { trustedHandoffFingerprint: fp, otherRoleFingerprints: other };
  return { signer, subject, trust };
}

test("DoneState signs canonical short-lived release verification handoff and validates own signature", async () => {
  const x = fixture(), now = Date.now();
  const handoff = await createReleaseV1Handoff(x.subject, x.signer, x.trust, now);
  assert.equal(handoff.schema, "donestate.release-verification-handoff.v1");
  assert.equal(handoff.githubRunId, x.subject.githubRunId);
  assert.equal(handoff.expiresAt, new Date(now + 300_000).toISOString());
  assert.doesNotThrow(() => verifyReleaseV1Handoff(handoff, { ...x.subject, ...x.trust, now }));
  const { signatureBase64, ...unsigned } = handoff;
  assert(Buffer.from(signatureBase64, "base64").length === 64);
  assert.match(RELEASE_V1_HANDOFF_DOMAIN + canonicalJson(unsigned),
    /^donestate\.release-verification-handoff\.v1\x00\{/);
});
test("Signed handoff is bound to exact run, transaction, GitHub execution and receipt digest", async () => {
  const x = fixture(), h = await createReleaseV1Handoff(x.subject, x.signer, x.trust);
  for (const changed of [
    { runId: randomUUID() }, { transactionId: randomUUID() },
    { subjectDigest: "c".repeat(64) }, { receiptPayloadDigest: "d".repeat(64) },
    { githubRunId: "39069037773" },
  ]) assert.throws(() => verifyReleaseV1Handoff(h, {
    ...x.subject, ...x.trust, ...changed,
  }), /release_handoff:handoff_subject_mismatch/);
});
test("No signature, arbitrary fields and replaced digest cannot be accepted", async () => {
  const x = fixture(), h = await createReleaseV1Handoff(x.subject, x.signer, x.trust);
  const policy = { ...x.subject, ...x.trust };
  assert.throws(() => verifyReleaseV1Handoff({ ...h, signatureBase64: "A".repeat(86) + "==" }, policy),
    /release_handoff:signature_rejected/);
  assert.throws(() => verifyReleaseV1Handoff({ ...h, subjectDigest: "c".repeat(64) }, policy),
    /release_handoff:handoff_subject_mismatch/);
  assert.throws(() => verifyReleaseV1Handoff({ ...h, unknown: true } as never, policy),
    /release_handoff:invalid_handoff_shape/);
});
test("Expiry and future-issued handoffs fail closed", async () => {
  const x = fixture(), start = Date.now();
  const h = await createReleaseV1Handoff(x.subject, x.signer, x.trust, start, 5_000);
  assert.throws(() => verifyReleaseV1Handoff(h, { ...x.subject, ...x.trust, now: start+5_001 }),
    /release_handoff:handoff_expired_or_future/);
  assert.throws(() => verifyReleaseV1Handoff(h, { ...x.subject, ...x.trust, now: start-70_000 }),
    /release_handoff:handoff_expired_or_future/);
});
test("Signer cannot be same key as AgentProof or OpsTruth roles", async () => {
  const x = fixture();
  await assert.rejects(createReleaseV1Handoff(x.subject, x.signer,
    { ...x.trust, otherRoleFingerprints: [x.trust.trustedHandoffFingerprint, ...x.trust.otherRoleFingerprints] }),
    /release_handoff:signer_not_independent/);
  await assert.rejects(createReleaseV1Handoff(x.subject, x.signer,
    { ...x.trust, trustedHandoffFingerprint: x.trust.otherRoleFingerprints[0]! }),
    /release_handoff:untrusted_handoff_key/);
});
test("Malformed IDs and excessive handoff lifetime cannot mint a new authority claim", async () => {
  const x = fixture();
  await assert.rejects(createReleaseV1Handoff(
    { ...x.subject, githubRunId: "1; DELETE FROM runs" }, x.signer, x.trust),
    /release_handoff:invalid_binding/);
  await assert.rejects(createReleaseV1Handoff(
    { ...x.subject, runId: "arbitrary" }, x.signer, x.trust),
    /release_handoff:invalid_binding/);
  await assert.rejects(createReleaseV1Handoff(x.subject,x.signer,x.trust,Date.now(),900_000),
    /release_handoff:invalid_lifetime/);
});
test("Signer outage produces no signed verification handoff", async () => {
  const x = fixture();
  const signer: ReleaseHandoffSigner = {
    publicKeyPem: x.signer.publicKeyPem,
    signCanonical: async () => { throw new Error("fixture_signer_unavailable"); },
  };
  await assert.rejects(createReleaseV1Handoff(x.subject,signer,x.trust),
    /fixture_signer_unavailable/);
});
