import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "../../../dist/hash.js";
import { classifyReleaseV1Outcome } from "../../../dist/release-v1-evidence.js";
import { configuration, digest, exact, policy } from "./controller.mjs";
import { demand } from "./identity.mjs";

export const READBACK_SCHEMA = "agentproof.release-readback-attestation.v1";
export const READBACK_DOMAIN = READBACK_SCHEMA + "\0";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const OBSERVATION_FIELDS = ["schema","ownerId","repositoryId","releaseId","tagName","tagCommit",
  "packageAssetId","packageAssetName","packageDigest","provenanceAssetId","provenanceDigest",
  "assetCount","draft","prerelease","publishedAt"];

export function timestamp(value) {
  demand(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    "recovery_time_invalid", 409);
  return Date.parse(value);
}
function signature(pem, fingerprint, encoded, message) {
  const key = createPublicKey(pem);
  demand(key.asymmetricKeyType === "ed25519" && "sha256:" + createHash("sha256")
    .update(key.export({type:"spki",format:"der"})).digest("hex") === fingerprint,
    "recovery_signer_untrusted", 409);
  demand(typeof encoded === "string" && /^[A-Za-z0-9+/]{86}==$/.test(encoded) &&
    Buffer.from(encoded,"base64").toString("base64") === encoded &&
    verify(null,Buffer.from(message),key,Buffer.from(encoded,"base64")),
    "recovery_signature_invalid", 409);
}
function signed(value, keyField, fingerprint, domain) {
  const {signatureBase64,...unsigned} = value;
  signature(value[keyField],fingerprint,signatureBase64,domain + canonicalJson(unsigned));
}
export function recoveryConfiguration(env) {
  const configured = configuration(env,{readbackRecovery:true});
  demand(UUID.test(env.READBACK_RECOVERY_RUN_ID ?? "") &&
    UUID.test(env.READBACK_RECOVERY_TRANSACTION_ID ?? "") &&
    /^[1-9]\d{0,19}$/.test(env.READBACK_RECOVERY_GITHUB_RUN_ID ?? "") &&
    HEX.test(env.READBACK_RECOVERY_COMPLETION_DIGEST ?? "") &&
    HEX.test(env.READBACK_RECOVERY_AUTHORISATION_DIGEST ?? "") &&
    /^[a-f0-9]{40}$/.test(env.TRUSTED_SOURCE_SHA ?? "") && !/^0+$/.test(env.TRUSTED_SOURCE_SHA),
    "recovery_predecessor_unconfigured", 503);
  const maxAttempts = Number(env.READBACK_RECOVERY_MAX_ATTEMPTS ?? 96);
  const maxDurationMs = Number(env.READBACK_RECOVERY_MAX_DURATION_MS ?? 259200000);
  demand(Number.isSafeInteger(maxAttempts) && maxAttempts >= 3 && maxAttempts <= 256 &&
    Number.isSafeInteger(maxDurationMs) && maxDurationMs >= 60000 && maxDurationMs <= 604800000,
    "recovery_budget_invalid", 503);
  const binding = {runId:env.READBACK_RECOVERY_RUN_ID,transactionId:env.READBACK_RECOVERY_TRANSACTION_ID,
    githubRunId:env.READBACK_RECOVERY_GITHUB_RUN_ID,completionDigest:env.READBACK_RECOVERY_COMPLETION_DIGEST,
    recoveryAuthorisationDigest:env.READBACK_RECOVERY_AUTHORISATION_DIGEST,
    subjectDigest:digest(configured.subject),trustDigest:configured.trustDigest,maxAttempts,maxDurationMs};
  return {...configured,...binding,policyDigest:digest(binding)};
}

/** Historical authority is verified at its original lifetime, never renewed. */
export function verifyRecoveryAuthority(record, env) {
  const configured = recoveryConfiguration(env);
  demand(record?.schema === "donestate.release-canary-run.v1" && record.runId === configured.runId &&
    record.transactionId === configured.transactionId && record.githubRunId === configured.githubRunId &&
    record.subjectDigest === configured.subjectDigest && digest(record.subject) === configured.subjectDigest &&
    record.trustDigest === configured.trustDigest && digest(record.trustPins) === digest(configured.pins),
    "recovery_predecessor_changed", 409);
  demand(Array.isArray(record.audit) && record.audit.length > 0 && record.audit.length <= 4096,
    "recovery_audit_invalid", 409);
  for (const [i,entry] of record.audit.entries()) {
    const {digest:hash,...unsigned} = entry;
    demand(entry.sequence === i+1 && entry.previousDigest === (i ? record.audit[i-1].digest : null) &&
      digest(unsigned) === hash,"recovery_audit_invalid",409);
  }
  const grant = record.recoveryAuthorisation, reservation = record.recoveryReservation;
  exact(grant,["schema","runId","transactionId","subjectDigest","githubRunId","githubRunAttempt",
    "workflowCommit","reservationDigest","authorisationAuditDigest","issuedAt","expiresAt","publicKeyPem","signatureBase64"]);
  exact(reservation,["schema","state","recoveryPolicy","requestDigest","subjectDigest","transactionId",
    "githubRunId","githubRunAttempt","workflowCommit","issuedAt","expiresAt","authorityPublicKeyPem","signatureBase64"]);
  exact(reservation.recoveryPolicy,["fingerprint","runId"]);
  demand(grant.schema === "donestate.release-recovery-authorisation.v1" &&
    digest(grant) === configured.recoveryAuthorisationDigest && grant.runId === record.runId &&
    grant.transactionId === record.transactionId && grant.subjectDigest === record.subjectDigest &&
    grant.githubRunId === record.githubRunId && grant.githubRunAttempt === 1 &&
    grant.workflowCommit === env.TRUSTED_SOURCE_SHA && grant.reservationDigest === digest(reservation) &&
    grant.publicKeyPem === env.HANDOFF_PUBLIC_KEY_PEM && grant.issuedAt === record.executionNotBefore,
    "recovery_authorisation_changed",409);
  demand(reservation.schema === "agentproof.release-reservation.v1" && reservation.state === "reserved" &&
    reservation.transactionId === record.transactionId && reservation.subjectDigest === record.subjectDigest &&
    reservation.githubRunId === record.githubRunId && reservation.githubRunAttempt === grant.githubRunAttempt &&
    reservation.workflowCommit === grant.workflowCommit && HEX.test(reservation.requestDigest) &&
    reservation.recoveryPolicy.runId === record.runId &&
    reservation.recoveryPolicy.fingerprint === env.HANDOFF_FINGERPRINT,
    "recovery_reservation_changed",409);
  const issued = timestamp(grant.issuedAt), expires = timestamp(grant.expiresAt);
  const reserved = timestamp(reservation.issuedAt), reserveExpiry = timestamp(reservation.expiresAt);
  demand(reserved <= issued && issued < expires && expires === reserveExpiry &&
    reserveExpiry-reserved <= 300000 && timestamp(record.authorisedAt) <= issued,
    "recovery_authorisation_timeline_invalid",409);
  const causal = record.audit.find(entry => entry.digest === grant.authorisationAuditDigest);
  demand(causal?.action === "resume_unexecuted_authorisation" && causal.at === grant.issuedAt &&
    causal.detail.githubRunId === record.githubRunId && causal.detail.trustDigest === record.trustDigest &&
    causal.detail.reservationDigest === grant.reservationDigest,
    "recovery_causal_authority_missing",409);
  signed(reservation,"authorityPublicKeyPem",env.APPROVAL_FINGERPRINT,"agentproof.release-reservation.v1\0");
  signed(grant,"publicKeyPem",env.HANDOFF_FINGERPRINT,"donestate.release-recovery-authorisation.v1\0");
  if (record.readbackRecovery) demand(record.readbackRecovery.policyDigest === configured.policyDigest,
    "recovery_policy_changed",409);
  return configured;
}
function validateObservation(value, subject, published) {
  exact(value,OBSERVATION_FIELDS);
  demand(value.schema === "agentproof.release.observation.v1" && value.draft === !published &&
    value.prerelease === true && value.assetCount === 2,"recovery_observation_phase",409);
  for (const key of ["ownerId","repositoryId","releaseId","tagName","tagCommit","packageAssetId",
    "packageAssetName","packageDigest","provenanceAssetId","provenanceDigest"])
    demand(value[key] === subject[key],"recovery_observation_subject_changed",409);
  if (published) timestamp(value.publishedAt);
  else demand(value.publishedAt === null,"recovery_draft_time_changed",409);
}

export function verifyReadbackEvidence(evidence, record, env, now = Date.now()) {
  const configured = verifyRecoveryAuthority(record,env);
  const {request,completion,observation} = evidence;
  exact(request,["stateDirectory","transactionId","nonce","idempotencyKey","subject","approval"]);
  const stamp = "release-canary:" + record.githubRunId;
  demand(request.transactionId === record.transactionId && digest(request.subject) === record.subjectDigest &&
    request.stateDirectory === "/tmp/agentproof-release-canary-" + record.githubRunId &&
    request.nonce === stamp && request.idempotencyKey === stamp &&
    digest(request) === record.recoveryReservation.requestDigest,"recovery_request_changed",409);
  const approval = request.approval;
  exact(approval,["schema","actionType","subjectDigest","transactionId","nonce","decision","environment",
    "issuer","decidedAt","expiresAt","authorityPublicKeyPem","signatureBase64"]);
  demand(approval.schema === "agentproof.release.approval.v1" && approval.actionType === "agentproof.release.v1" &&
    approval.subjectDigest === record.subjectDigest && approval.transactionId === record.transactionId &&
    approval.nonce === stamp && approval.decision === "approved" && approval.environment === "production" &&
    approval.issuer === "agentproof.release-canary.authority.v1" &&
    approval.decidedAt === record.recoveryReservation.issuedAt &&
    approval.expiresAt === record.recoveryReservation.expiresAt,"recovery_approval_changed",409);
  signed(approval,"authorityPublicKeyPem",env.APPROVAL_FINGERPRINT,"");
  exact(completion,["schema","sourceCommit","transactionId","requestDigest","subjectDigest","attemptedAt",
    "verifiedAt","before","after","recoveryAuthorisationDigest","signatureBase64"]);
  const {approval:_approval,...seed} = request;
  demand(completion.schema === "agentproof.release-canary.execution-evidence.v1" &&
    completion.sourceCommit === env.TRUSTED_SOURCE_SHA && completion.transactionId === record.transactionId &&
    completion.requestDigest === digest(seed) && completion.subjectDigest === record.subjectDigest &&
    completion.recoveryAuthorisationDigest === configured.recoveryAuthorisationDigest &&
    digest(completion) === configured.completionDigest,"recovery_completion_changed",409);
  const attempted = timestamp(completion.attemptedAt), verified = timestamp(completion.verifiedAt);
  demand(timestamp(approval.decidedAt) <= attempted && attempted < timestamp(approval.expiresAt) &&
    timestamp(record.recoveryAuthorisation.issuedAt) <= attempted &&
    attempted < timestamp(record.recoveryAuthorisation.expiresAt) &&
    attempted <= verified && verified <= now + 30000,"recovery_execution_timeline_invalid",409);
  validateObservation(completion.before,record.subject,false);
  validateObservation(completion.after,record.subject,true);
  const {signatureBase64,...unsignedCompletion} = completion;
  signature(approval.authorityPublicKeyPem,env.APPROVAL_FINGERPRINT,signatureBase64,canonicalJson(unsignedCompletion));
  exact(observation,["schema","runId","transactionId","requestDigest","subjectDigest","githubRunId",
    "workflowCommit","completionDigest","recoveryAuthorisationDigest","observedAt","expiresAt","after",
    "readOnly","authorityPublicKeyPem","signatureBase64"]);
  demand(observation.schema === READBACK_SCHEMA && observation.runId === record.runId &&
    observation.transactionId === record.transactionId && observation.requestDigest === digest(request) &&
    observation.subjectDigest === record.subjectDigest && observation.githubRunId === record.githubRunId &&
    observation.workflowCommit === env.TRUSTED_SOURCE_SHA && observation.completionDigest === configured.completionDigest &&
    observation.recoveryAuthorisationDigest === configured.recoveryAuthorisationDigest &&
    observation.readOnly === true && digest(observation.after) === digest(completion.after),
    "recovery_readback_changed",409);
  const observed = timestamp(observation.observedAt), expiry = timestamp(observation.expiresAt);
  demand(observed >= verified && observed <= now+30000 && expiry > observed &&
    expiry-observed <= 300000 && expiry > now,"recovery_readback_expired_or_future",409);
  signed(observation,"authorityPublicKeyPem",env.APPROVAL_FINGERPRINT,READBACK_DOMAIN);
  return observation;
}

export function verifyRecoveryReceipt(receipt, record, env, execution, now = Date.now()) {
  const outcome = classifyReleaseV1Outcome({policy:policy(record,env),receipt,now});
  const p = receipt.payload, {request,completion} = execution;
  demand(outcome.status === "AWAITING_INDEPENDENT_VERIFICATION" &&
    p.signingPolicyId === "agentproof.release-canary.receipts.v1" &&
    p.transactionId === request.transactionId && p.nonce === request.nonce &&
    p.idempotencyKey === request.idempotencyKey && digest(p.subject) === digest(request.subject) &&
    digest(p.approval) === digest(request.approval) && p.attemptedAt === completion.attemptedAt &&
    p.verifiedAt === completion.verifiedAt && digest(p.before) === digest(completion.before) &&
    digest(p.after) === digest(completion.after) && timestamp(p.issuedAt) <= now+60000,
    "recovery_receipt_changed",409);
  if (record.receipt) demand(digest(receipt) === digest(record.receipt),"receipt_already_bound",409);
  return outcome;
}
