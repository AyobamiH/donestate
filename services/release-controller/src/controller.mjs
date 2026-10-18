import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import { canonicalJson } from "../../../dist/hash.js";
import { classifyReleaseV1Outcome } from "../../../dist/release-v1-evidence.js";
import { createReleaseV1Handoff, verifyReleaseV1Handoff } from "../../../dist/release-v1-handoff.js";
import { demand } from "./identity.mjs";
export const digest = value => createHash("sha256").update(canonicalJson(value)).digest("hex");
const fp = pem => "sha256:" + createHash("sha256").update(
  createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
export function exact(value, fields) {
  demand(value && Object.getPrototypeOf(value) === Object.prototype &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort()),
    "unexpected_fields", 400);
}
export function configuration(env) {
  demand(env.ENABLED === "true", "controller_disabled", 503);
  const pins = [env.APPROVAL_FINGERPRINT, env.RECEIPT_FINGERPRINT,
    env.OPSTRUTH_FINGERPRINT, env.PROVENANCE_FINGERPRINT, env.HANDOFF_FINGERPRINT];
  demand(pins.every(p => /^sha256:[a-f0-9]{64}$/.test(p)) &&
    new Set(pins).size === 5, "distinct_trust_roots_required", 503);
  let subject;
  try { subject = JSON.parse(env.TARGET_SUBJECT_JSON); }
  catch { demand(false, "target_unconfigured", 503); }
  exact(subject, ["schema","provider","owner","repository","ownerId","repositoryId",
    "releaseId","tagName","tagCommit","packageAssetId","packageAssetName","packageDigest",
    "provenanceAssetId","provenanceDigest","prerelease","makeLatest"]);
  demand(subject.schema === "agentproof.release.subject.v1" && subject.provider === "github" &&
    subject.owner === "AyobamiH" && subject.repository === "agentproof-release-canary" &&
    subject.ownerId === 47716486 && subject.repositoryId === 1423718326 &&
    subject.prerelease === true && subject.makeLatest === false &&
    [subject.releaseId,subject.packageAssetId,subject.provenanceAssetId]
      .every(n => Number.isSafeInteger(n) && n > 0) &&
    subject.packageAssetId !== subject.provenanceAssetId &&
    /^v0\.0\.0-rc\.[0-9]{10}$/.test(subject.tagName) &&
    /^[a-f0-9]{40}$/.test(subject.tagCommit) &&
    /^sha256:[a-f0-9]{64}$/.test(subject.packageDigest) &&
    /^sha256:[a-f0-9]{64}$/.test(subject.provenanceDigest),
    "target_not_allowed", 503);
  return { subject, pins };
}
function handoffSigner(env) {
  const key = createPrivateKey(env.HANDOFF_PRIVATE_KEY_PEM);
  const pem = createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
  demand(key.asymmetricKeyType === "ed25519" && pem === env.HANDOFF_PUBLIC_KEY_PEM &&
    fp(pem) === env.HANDOFF_FINGERPRINT, "handoff_signer_unavailable", 503);
  return { publicKeyPem: async () => pem,
    signCanonical: async value => sign(null, Buffer.from(value), key) };
}
function policy(record, env) {
  return { runId: record.runId, transactionId: record.transactionId,
    subjectDigest: record.subjectDigest,
    trustedApprovalFingerprint: env.APPROVAL_FINGERPRINT,
    trustedAgentProofSignerFingerprint: env.RECEIPT_FINGERPRINT,
    trustedOpsTruthVerifierFingerprint: env.OPSTRUTH_FINGERPRINT,
    trustedProvenanceSignerFingerprint: env.PROVENANCE_FINGERPRINT };
}
function handoffPolicy(record, env) {
  return { runId: record.runId, transactionId: record.transactionId,
    subjectDigest: record.subjectDigest, receiptPayloadDigest: record.receipt.proof.payloadDigest,
    githubRunId: record.githubRunId, trustedHandoffFingerprint: env.HANDOFF_FINGERPRINT,
    otherRoleFingerprints: [env.APPROVAL_FINGERPRINT,env.RECEIPT_FINGERPRINT,
      env.OPSTRUTH_FINGERPRINT,env.PROVENANCE_FINGERPRINT] };
}
function event(record, action, detail, now) {
  const previousDigest = record.audit.at(-1)?.digest ?? null;
  const entry = { sequence: record.audit.length + 1, action,
    at: new Date(now).toISOString(), previousDigest, detail };
  return [...record.audit, { ...entry, digest: digest(entry) }];
}
export class Controller {
  constructor(storage, env) { this.storage = storage; this.env = env; }
  get() { return this.storage.kv.get("run"); }
  put(record) { this.storage.kv.put("run", record); return record; }
  bound(claims) {
    const record = this.get();
    demand(record, "run_not_started", 409);
    demand(record.githubRunId === claims.githubRunId, "release_already_claimed", 409);
    demand(record.subjectDigest === digest(configuration(this.env).subject),
      "target_configuration_changed", 409);
    return record;
  }
  start(claims, body, now = Date.now()) {
    exact(body, []);
    const { subject } = configuration(this.env);
    // Fail before reserving the release if the separate signer is unavailable.
    handoffSigner(this.env);
    return this.storage.transactionSync(() => {
      if (this.get()) return this.bound(claims);
      const record = { schema: "donestate.release-canary-run.v1",
        runId: randomUUID(), transactionId: randomUUID(), githubRunId: claims.githubRunId,
        subject, subjectDigest: digest(subject), status: "AUTHORISED",
        authorisedAt: new Date(now).toISOString(), receipt: null, handoff: null,
        decision: null, outcome: null, audit: [] };
      record.audit = event(record, "authorise_exact_release",
        { subjectDigest: record.subjectDigest }, now);
      return this.put(record);
    });
  }
  async receipt(claims, body, now = Date.now()) {
    exact(body, ["runId", "receipt"]);
    const record = this.bound(claims);
    demand(body.runId === record.runId, "run_identity_changed");
    const received = body.receipt;
    if (record.receipt) {
      demand(digest(received) === digest(record.receipt), "receipt_already_bound", 409);
      return record;
    }
    demand(record.status === "AUTHORISED", "invalid_state", 409);
    const outcome = classifyReleaseV1Outcome({ policy: policy(record,this.env),
      receipt: received, now });
    demand(outcome.status === "AWAITING_INDEPENDENT_VERIFICATION" &&
      received.payload.nonce === "release-canary:" + claims.githubRunId &&
      received.payload.idempotencyKey === "release-canary:" + claims.githubRunId &&
      Date.parse(received.payload.attemptedAt) >= Date.parse(record.authorisedAt) &&
      Date.parse(received.payload.issuedAt) <= now + 60000 &&
      now - Date.parse(received.payload.issuedAt) <= 1200000,
      "receipt_not_authorised");
    const pending = { ...record, receipt: received };
    const trust = handoffPolicy(pending, this.env);
    const { trustedHandoffFingerprint, otherRoleFingerprints, ...binding } = trust;
    const handoff = await createReleaseV1Handoff(binding, handoffSigner(this.env),
      { trustedHandoffFingerprint, otherRoleFingerprints }, now);
    return this.storage.transactionSync(() => {
      const current = this.bound(claims);
      if (current.receipt) {
        demand(digest(current.receipt) === digest(received), "receipt_already_bound", 409);
        return current;
      }
      demand(current.status === "AUTHORISED", "invalid_state", 409);
      return this.put({ ...current, receipt: received, handoff,
        status: "AWAITING_INDEPENDENT_VERIFICATION", outcome,
        audit: event(current, "accept_receipt_and_issue_handoff",
          { receiptPayloadDigest: received.proof.payloadDigest, handoffDigest: digest(handoff) }, now) });
    });
  }
  settle(claims, body, now = Date.now()) {
    exact(body, ["runId", "decision"]);
    const record = this.bound(claims);
    demand(body.runId === record.runId, "run_identity_changed");
    if (record.decision) {
      demand(digest(body.decision) === digest(record.decision), "terminal_evidence_immutable", 409);
      return record;
    }
    demand(record.status === "AWAITING_INDEPENDENT_VERIFICATION",
      "independent_verification_not_pending", 409);
    verifyReleaseV1Handoff(record.handoff, { ...handoffPolicy(record,this.env), now });
    const outcome = classifyReleaseV1Outcome({ policy: policy(record,this.env),
      receipt: record.receipt, signedOpsTruthDecision: body.decision, now });
    demand(outcome.status === "VERIFIED" && outcome.independentlySignedDecision,
      "independent_verified_outcome_required", 409);
    return this.storage.transactionSync(() => {
      const current = this.bound(claims);
      if (current.decision) {
        demand(digest(body.decision) === digest(current.decision), "terminal_evidence_immutable", 409);
        return current;
      }
      demand(current.status === "AWAITING_INDEPENDENT_VERIFICATION", "invalid_state", 409);
      return this.put({ ...current, decision: body.decision, outcome, status: "VERIFIED",
        audit: event(current, "accept_independent_verified_outcome",
          { decisionDigest: digest(body.decision), verifier: this.env.OPSTRUTH_FINGERPRINT }, now) });
    });
  }
}
