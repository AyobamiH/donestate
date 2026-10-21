// Synthetic keys and provider responses only. No fixture is a live acceptance record.
import { createHash } from "node:crypto";
import { Controller, digest } from "../src/controller.mjs";
import { canonicalJson } from "../../../dist/hash.js";
import { RELEASE_V1_RECEIPT_DOMAIN } from "../../../dist/release-v1-evidence.js";
import { ReadbackRecovery } from "../src/readback-recovery.mjs";
import { READBACK_DOMAIN } from "../src/readback.mjs";
import { fixture, pair } from "./fixtures.mjs";

export async function recoveryFixture({ageMs = 172800000, maxAttempts = 96, subject, roles} = {}) {
  const base = Date.parse("2026-10-18T11:40:00.000Z"), initial = fixture({now:base,subject,roles}), handoff = pair();
  let now = base+ageMs;
  const env = {ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40),
    TARGET_SUBJECT_JSON:JSON.stringify(initial.receipt.payload.subject),
    APPROVAL_FINGERPRINT:initial.roles.authority.fingerprint,RECEIPT_FINGERPRINT:initial.roles.receiptSigner.fingerprint,
    OPSTRUTH_FINGERPRINT:initial.roles.opstruth.fingerprint,PROVENANCE_FINGERPRINT:initial.roles.provenance.fingerprint,
    HANDOFF_FINGERPRINT:handoff.fingerprint,HANDOFF_PUBLIC_KEY_PEM:handoff.publicKeyPem,
    HANDOFF_PRIVATE_KEY_PEM:handoff.keys.privateKey.export({type:"pkcs8",format:"pem"}).toString()};
  const data = new Map(); let alarm = null;
  const storage = {kv:{get:key => structuredClone(data.get(key)),put:(key,value) => data.set(key,structuredClone(value))},
    transactionSync:fn => fn(),setAlarm:async value => {alarm = value;},deleteAlarm:async () => {alarm = null;},
    getAlarm:async () => alarm};
  const publicController = new Controller(storage,env);
  const predecessor = publicController.start({githubRunId:"123456789",githubRunAttempt:1},{},base-120000);
  env.RECOVERY_FROM_GITHUB_RUN_ID = predecessor.githubRunId;
  env.RECOVERY_FROM_WORKFLOW_SHA = env.TRUSTED_SOURCE_SHA;
  env.TRUSTED_SOURCE_SHA = "b".repeat(40);
  const githubRunId = "987654321", nonce = "release-canary:"+githubRunId;
  const evidence = fixture({roles:initial.roles,subject,runId:predecessor.runId,transactionId:predecessor.transactionId,
    nonce,idempotencyKey:nonce,now:base+30000});
  const {signatureBase64:_signature,...unsignedApproval} = evidence.receipt.payload.approval;
  unsignedApproval.issuer = "agentproof.release-canary.authority.v1";
  const approval = {...unsignedApproval,signatureBase64:initial.roles.authority.signature(canonicalJson(unsignedApproval))};
  const request = {stateDirectory:"/tmp/agentproof-release-canary-"+githubRunId,transactionId:predecessor.transactionId,
    nonce,idempotencyKey:nonce,subject:predecessor.subject,approval};
  const reservationUnsigned = {schema:"agentproof.release-reservation.v1",state:"reserved",
    recoveryPolicy:{fingerprint:env.HANDOFF_FINGERPRINT,runId:predecessor.runId},requestDigest:digest(request),
    subjectDigest:predecessor.subjectDigest,transactionId:predecessor.transactionId,githubRunId,githubRunAttempt:1,
    workflowCommit:env.TRUSTED_SOURCE_SHA,issuedAt:approval.decidedAt,expiresAt:approval.expiresAt,
    authorityPublicKeyPem:initial.roles.authority.publicKeyPem};
  const reservation = {...reservationUnsigned,signatureBase64:initial.roles.authority.signature(
    "agentproof.release-reservation.v1\0"+canonicalJson(reservationUnsigned))};
  const record = await publicController.recover({githubRunId,githubRunAttempt:1},{runId:predecessor.runId,
    previousGithubRunId:predecessor.githubRunId,request,reservation},base+2000);
  const {approval:_approval,...seed} = request;
  const completionUnsigned = {schema:"agentproof.release-canary.execution-evidence.v1",
    sourceCommit:env.TRUSTED_SOURCE_SHA,transactionId:record.transactionId,requestDigest:digest(seed),
    subjectDigest:record.subjectDigest,attemptedAt:evidence.receipt.payload.attemptedAt,
    verifiedAt:evidence.receipt.payload.verifiedAt,before:evidence.receipt.payload.before,after:evidence.receipt.payload.after,
    recoveryAuthorisationDigest:digest(record.recoveryAuthorisation)};
  const completion = {...completionUnsigned,signatureBase64:initial.roles.authority.signature(canonicalJson(completionUnsigned))};
  Object.assign(env,{ENABLED:"false",READBACK_RECOVERY_ENABLED:"true",READBACK_RECOVERY_RUN_ID:record.runId,
    READBACK_RECOVERY_TRANSACTION_ID:record.transactionId,READBACK_RECOVERY_GITHUB_RUN_ID:githubRunId,
    READBACK_RECOVERY_COMPLETION_DIGEST:digest(completion),
    READBACK_RECOVERY_AUTHORISATION_DIGEST:digest(record.recoveryAuthorisation),
    READBACK_RECOVERY_MAX_ATTEMPTS:String(maxAttempts)});
  const calls = [], handlers = {};
  let signedReceipt = null;
  function readback(at = now) {
    const unsigned = {schema:"agentproof.release-readback-attestation.v1",runId:record.runId,
      transactionId:record.transactionId,requestDigest:digest(request),subjectDigest:record.subjectDigest,githubRunId,
      workflowCommit:env.TRUSTED_SOURCE_SHA,completionDigest:digest(completion),
      recoveryAuthorisationDigest:digest(record.recoveryAuthorisation),observedAt:new Date(at).toISOString(),
      expiresAt:new Date(at+300000).toISOString(),after:completion.after,readOnly:true,
      authorityPublicKeyPem:initial.roles.authority.publicKeyPem};
    return {...unsigned,signatureBase64:initial.roles.authority.signature(READBACK_DOMAIN+canonicalJson(unsigned))};
  }
  function receipt(at = now) {
    const payload = {...evidence.receipt.payload,approval,approvalDigest:digest(approval),
      issuedAt:new Date(at).toISOString(),signingPolicyId:"agentproof.release-canary.receipts.v1"};
    const input = RELEASE_V1_RECEIPT_DOMAIN+canonicalJson(payload);
    return {payload,proof:{...evidence.receipt.proof,keyId:payload.signingPolicyId,
      payloadDigest:digestDomain(input),signatureBase64:initial.roles.receiptSigner.signature(input)}};
  }
  function report(value, at = now) {
    return evidence.signReport({...evidence.signedOpsTruthDecision,receiptPayloadDigest:value.proof.payloadDigest,
      observedAt:new Date(at).toISOString(),observation:{...evidence.signedOpsTruthDecision.observation,
        observedAt:new Date(at).toISOString()}});
  }
  const publicationResponse = {status:200,releaseId:record.subject.releaseId,publishedAt:completion.after.publishedAt};
  env.AGENTPROOF_READBACK = {observe:async input => {
    calls.push({role:"approval",method:"observe",input});
    return handlers.observe ? handlers.observe(input) : {state:"verified",request,completion,
      observation:readback(),publicationResponse};
  }};
  env.AGENTPROOF_RECEIPTS = {sign:async input => {
    calls.push({role:"receipt",method:"sign",input});
    signedReceipt ??= receipt();
    return handlers.sign ? handlers.sign(input,signedReceipt) : {state:"signed",receipt:signedReceipt};
  }};
  env.OPSTRUTH_RELEASE = {verify:async input => {
    calls.push({role:"opstruth",method:"verify",input});
    return handlers.verify ? handlers.verify(input) : {state:"VERIFIED",signed:true,report:report(input.receipt)};
  }};
  const restart = () => new ReadbackRecovery(storage,env,{clock:() => now});
  return {base,env,storage,record,request,completion,publicationResponse,evidence,calls,handlers,readback,receipt,report,restart,
    recovery:restart(),get now() {return now;},set now(value) {now = value;},get signedReceipt() {return signedReceipt;}};
}

function digestDomain(value) {return createHash("sha256").update(value).digest("hex");}
