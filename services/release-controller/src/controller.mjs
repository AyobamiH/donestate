import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import { canonicalJson } from "../../../dist/hash.js";
import { classifyReleaseV1Outcome } from "../../../dist/release-v1-evidence.js";
import { createReleaseV1Handoff, verifyReleaseV1Handoff } from "../../../dist/release-v1-handoff.js";
import { demand } from "./identity.mjs";
import { verifyReservation } from "./reservation.mjs";
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
  return { subject, pins, trustDigest: digest({ pins, workflowCommit: env.TRUSTED_SOURCE_SHA }) };
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
    const configured = configuration(this.env);
    demand(record.subjectDigest === digest(configured.subject), "target_configuration_changed", 409);
    demand(record.trustDigest === configured.trustDigest, "trust_configuration_changed", 409);
    return record;
  }
  start(claims, body, now = Date.now()) {
    exact(body, []);
    const { subject, pins, trustDigest } = configuration(this.env);
    return this.storage.transactionSync(() => {
      if (this.get()) return this.bound(claims);
      demand(claims.githubRunAttempt === 1, "new_attempt_not_authorised", 409);
      // A recovery attempt may read an existing run, never authorise a new one.
      handoffSigner(this.env);
      const record = { schema: "donestate.release-canary-run.v1",
        runId: randomUUID(), transactionId: randomUUID(), githubRunId: claims.githubRunId,
        subject, subjectDigest: digest(subject), trustPins: pins, trustDigest, status: "AUTHORISED",
        authorisedAt: new Date(now).toISOString(), receipt: null, handoff: null,
        decision: null, outcome: null, handoffHistory: [], audit: [] };
      record.audit = event(record, "authorise_exact_release",
        { subjectDigest: record.subjectDigest, trustDigest }, now);
      return this.put(record);
    });
  }
  async recover(claims, body, now = Date.now()) {
    exact(body, ["runId", "previousGithubRunId", "request", "reservation"]);
    const configured = configuration(this.env);
    const recovered = this.storage.transactionSync(() => {
      const current = this.get();
      demand(current && body.runId === current.runId, "recovery_run_missing", 409);
      const evidenceDigest = digest(body);
      if (current.githubRunId === claims.githubRunId) {
        this.bound(claims);
        demand(current.recoveryEvidenceDigest === evidenceDigest, "recovery_evidence_changed", 409);
        return current;
      }
      demand(claims.githubRunAttempt === 1 && /^\d{1,20}$/.test(this.env.RECOVERY_FROM_GITHUB_RUN_ID ?? "") &&
        /^[a-f0-9]{40}$/.test(this.env.RECOVERY_FROM_WORKFLOW_SHA ?? "") &&
        this.env.RECOVERY_FROM_WORKFLOW_SHA !== this.env.TRUSTED_SOURCE_SHA &&
        current.githubRunId === this.env.RECOVERY_FROM_GITHUB_RUN_ID &&
        body.previousGithubRunId === current.githubRunId, "recovery_not_configured", 409);
      demand(current.status === "AUTHORISED" && !current.receipt && !current.handoff &&
        !current.decision && !current.outcome, "recovery_after_evidence_forbidden", 409);
      demand(current.subjectDigest === digest(configured.subject) &&
        digest(current.trustPins) === digest(configured.pins) &&
        current.trustDigest === digest({pins:configured.pins,workflowCommit:this.env.RECOVERY_FROM_WORKFLOW_SHA}),
        "recovery_trust_changed", 409);
      const reservationDigest = verifyReservation(body.request, body.reservation, current, claims, this.env, now);
      // Preserve the complete original authority. No release fence or receipt is cleared.
      const next = { ...current, githubRunId: claims.githubRunId, trustDigest: configured.trustDigest,
        executionNotBefore: new Date(now).toISOString(), recoveryEvidenceDigest: evidenceDigest,
        recoveryReservation: body.reservation, recoveryAuthorisation: null, authorisationHistory: [current],
        audit: event(current, "resume_unexecuted_authorisation", {
          previousGithubRunId:current.githubRunId, githubRunId:claims.githubRunId,
          previousTrustDigest:current.trustDigest, trustDigest:configured.trustDigest,
          reservationDigest }, now) };
      return this.put(next);
    });
    if(recovered.recoveryAuthorisation) return recovered;
    // The durable recovery transaction has committed before signing this gate.
    // A crash or signer outage leaves authority stored but cannot permit execution.
    const unsigned={schema:"donestate.release-recovery-authorisation.v1",runId:recovered.runId,
      transactionId:recovered.transactionId,subjectDigest:recovered.subjectDigest,
      githubRunId:recovered.githubRunId,githubRunAttempt:body.reservation.githubRunAttempt,
      workflowCommit:this.env.TRUSTED_SOURCE_SHA,reservationDigest:digest(recovered.recoveryReservation),
      authorisationAuditDigest:recovered.audit.at(-1).digest,issuedAt:recovered.executionNotBefore,
      expiresAt:recovered.recoveryReservation.expiresAt,
      publicKeyPem:this.env.HANDOFF_PUBLIC_KEY_PEM};
    const signer=handoffSigner(this.env);
    const grant={...unsigned,signatureBase64:Buffer.from(await signer.signCanonical(
      "donestate.release-recovery-authorisation.v1\0"+canonicalJson(unsigned))).toString("base64")};
    return this.storage.transactionSync(()=>{
      const current=this.bound(claims);
      demand(current.recoveryEvidenceDigest===digest(body),"recovery_evidence_changed",409);
      if(current.recoveryAuthorisation)return current;
      demand(current.status==="AUTHORISED" && !current.receipt,"recovery_after_evidence_forbidden",409);
      return this.put({...current,recoveryAuthorisation:grant});
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
    demand(!record.recoveryReservation || record.recoveryAuthorisation,"recovery_authorisation_not_signed",409);
    const outcome = classifyReleaseV1Outcome({ policy: policy(record,this.env),
      receipt: received, now });
    demand(outcome.status === "AWAITING_INDEPENDENT_VERIFICATION" &&
      received.payload.nonce === "release-canary:" + claims.githubRunId &&
      received.payload.idempotencyKey === "release-canary:" + claims.githubRunId &&
      Date.parse(received.payload.attemptedAt) >= Date.parse(record.executionNotBefore ?? record.authorisedAt) &&
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
      return this.put({ ...current, receipt: received, handoff, handoffHistory: [handoff],
        status: "AWAITING_INDEPENDENT_VERIFICATION", outcome,
        audit: event(current, "accept_receipt_and_issue_handoff",
          { receiptPayloadDigest: received.proof.payloadDigest, handoffDigest: digest(handoff) }, now) });
    });
  }
  async refresh(claims, body, now = Date.now()) {
    exact(body, ["runId", "receiptPayloadDigest"]);
    const record = this.bound(claims);
    demand(body.runId === record.runId && body.receiptPayloadDigest === record.receipt?.proof.payloadDigest,
      "refresh_binding_changed", 409);
    demand(record.status === "AWAITING_INDEPENDENT_VERIFICATION", "independent_verification_not_pending", 409);
    // Do not extend the receipt freshness boundary while renewing the short handoff.
    demand(now - Date.parse(record.receipt.payload.issuedAt) <= 1200000, "receipt_recovery_window_expired", 409);
    if (Date.parse(record.handoff.expiresAt) > now) return record;
    const trust = handoffPolicy(record, this.env);
    const { trustedHandoffFingerprint, otherRoleFingerprints, ...binding } = trust;
    const ttl = Math.min(300000, Date.parse(record.receipt.payload.issuedAt) + 1200000 - now);
    demand(ttl >= 1000, "receipt_recovery_window_expired", 409);
    const handoff = await createReleaseV1Handoff(binding, handoffSigner(this.env),
      { trustedHandoffFingerprint, otherRoleFingerprints }, now, ttl);
    return this.storage.transactionSync(() => {
      const current = this.bound(claims);
      demand(current.status === "AWAITING_INDEPENDENT_VERIFICATION", "independent_verification_not_pending", 409);
      if (digest(current.handoff) !== digest(record.handoff)) return current;
      return this.put({ ...current, handoff, handoffHistory: [...current.handoffHistory, handoff],
        audit: event(current, "refresh_verification_handoff", {
          previousHandoffDigest: digest(record.handoff), handoffDigest: digest(handoff),
          receiptPayloadDigest: body.receiptPayloadDigest }, now) });
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
    demand(now - Date.parse(record.receipt.payload.issuedAt) <= 1200000,
      "receipt_recovery_window_expired", 409);
    verifyReleaseV1Handoff(record.handoff, { ...handoffPolicy(record,this.env), now });
    const outcome = classifyReleaseV1Outcome({ policy: policy(record,this.env),
      receipt: record.receipt, signedOpsTruthDecision: body.decision, now });
    demand(["VERIFIED", "CONTRADICTED", "UNPROVEN"].includes(outcome.status) && outcome.independentlySignedDecision,
      "independent_signed_outcome_required", 409);
    return this.storage.transactionSync(() => {
      const current = this.bound(claims);
      if (current.decision) {
        demand(digest(body.decision) === digest(current.decision), "terminal_evidence_immutable", 409);
        return current;
      }
      demand(current.status === "AWAITING_INDEPENDENT_VERIFICATION", "invalid_state", 409);
      return this.put({ ...current, decision: body.decision, outcome, status: outcome.status,
        audit: event(current, "accept_independent_outcome",
          { decisionDigest: digest(body.decision), verifier: this.env.OPSTRUTH_FINGERPRINT }, now) });
    });
  }
}
