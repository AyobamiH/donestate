import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "../../../dist/hash.js";
import { demand } from "./identity.mjs";
const digest = value => createHash("sha256").update(canonicalJson(value)).digest("hex");
function exact(value, keys) {
  demand(value && Object.getPrototypeOf(value) === Object.prototype &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson(keys.sort()), "reservation_shape");
}
function time(value) {
  demand(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, "reservation_time");
  return Date.parse(value);
}
export function verifyReservation(request, reservation, record, claims, env, now) {
  exact(request,["stateDirectory","transactionId","nonce","idempotencyKey","subject","approval"]);
  const stamp = "release-canary:" + claims.githubRunId;
  demand(request.transactionId === record.transactionId && digest(request.subject) === record.subjectDigest &&
    request.stateDirectory === "/tmp/agentproof-release-canary-" + claims.githubRunId &&
    request.nonce === stamp && request.idempotencyKey === stamp, "reservation_request_binding");
  exact(reservation,["schema","state","recoveryPolicy","requestDigest","subjectDigest","transactionId","githubRunId",
    "githubRunAttempt","workflowCommit","issuedAt","expiresAt","authorityPublicKeyPem","signatureBase64"]);
  demand(reservation.schema === "agentproof.release-reservation.v1" && reservation.state === "reserved" &&
    reservation.requestDigest === digest(request) && reservation.subjectDigest === record.subjectDigest &&
    reservation.transactionId === record.transactionId && reservation.githubRunId === claims.githubRunId &&
    reservation.githubRunAttempt === claims.githubRunAttempt &&
    reservation.workflowCommit === env.TRUSTED_SOURCE_SHA, "reservation_binding");
  exact(reservation.recoveryPolicy,["fingerprint","runId"]);
  demand(reservation.recoveryPolicy.fingerprint === env.HANDOFF_FINGERPRINT &&
    reservation.recoveryPolicy.runId === record.runId, "reservation_causal_gate_required");
  const issued = time(reservation.issuedAt), expires = time(reservation.expiresAt);
  demand(issued <= now && expires > now && expires - issued > 0 && expires - issued <= 300000,
    "reservation_expired_or_future");
  demand(request.approval?.decidedAt === reservation.issuedAt && request.approval?.expiresAt === reservation.expiresAt,
    "reservation_approval_time");
  const key = createPublicKey(reservation.authorityPublicKeyPem);
  const fingerprint = "sha256:" + createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex");
  demand(key.asymmetricKeyType === "ed25519" && fingerprint === env.APPROVAL_FINGERPRINT,
    "reservation_signer_untrusted");
  const {signatureBase64,...unsigned} = reservation;
  demand(typeof signatureBase64 === "string" && /^[A-Za-z0-9+/]{86}==$/.test(signatureBase64) &&
    Buffer.from(signatureBase64,"base64").toString("base64") === signatureBase64 &&
    verify(null,Buffer.from("agentproof.release-reservation.v1\0" + canonicalJson(unsigned)),
      key,Buffer.from(signatureBase64,"base64")), "reservation_signature_invalid");
  return digest(reservation);
}
