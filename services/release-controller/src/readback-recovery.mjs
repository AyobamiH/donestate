import { randomUUID } from "node:crypto";
import { classifyReleaseV1Outcome } from "../../../dist/release-v1-evidence.js";
import { createReleaseV1Handoff, verifyReleaseV1Handoff } from "../../../dist/release-v1-handoff.js";
import { digest, event, exact, handoffPolicy, handoffSigner, policy } from "./controller.mjs";
import { demand, Refusal } from "./identity.mjs";
import { recoveryConfiguration, timestamp, verifyRecoveryAuthority,
  verifyReadbackEvidence, verifyRecoveryReceipt } from "./readback.mjs";

const TERMINAL = new Set(["VERIFIED","CONTRADICTED","UNPROVEN"]);
const CALL_TIMEOUT_MS = 75000;
const LEASE_MS = 90000;
const RETRYABLE = new Set(["public_readback_unavailable","public_readback_transport_unavailable",
  "readback_provider_unavailable","provider_read_unavailable","provider_not_available","recovery_service_unavailable",
  "readback_observation_expired","readback_expired","handoff_expired",
  "recovery_service_timeout","recovery_readback_expired_or_future"]);
const REFRESH_REQUIRED = new Set(["readback_observation_expired","readback_expired","handoff_expired",
  "recovery_readback_expired_or_future"]);
const iso = now => new Date(now).toISOString();
function reason(error) {
  return error instanceof Refusal ? error.code : "recovery_evidence_rejected";
}
function publicDiagnostic(value) {
  const fields = ["endpoint","upstreamStatus","rateLimitRemaining","rateLimitReset","retryAfterSeconds"];
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(fields.sort()) ||
    !["repository","tag","release"].includes(value.endpoint) ||
    !Number.isSafeInteger(value.upstreamStatus) || value.upstreamStatus < 100 || value.upstreamStatus > 599 ||
    ![value.rateLimitRemaining,value.rateLimitReset,value.retryAfterSeconds].every(v =>
      v === null || (Number.isSafeInteger(v) && v >= 0 && v <= 9999999999))) return null;
  return {...value};
}
function checkResult(result) {
  demand(result && Object.getPrototypeOf(result) === Object.prototype &&
    Buffer.byteLength(JSON.stringify(result)) <= 65536,"recovery_response_invalid",409);
  if (result.state === "BLOCKED" || (result.signed !== true && ["UNPROVEN","CONTRADICTED"].includes(result.state))) {
    const code = typeof result.reasonCode === "string" && /^[a-z0-9_.:-]{1,128}$/.test(result.reasonCode) ?
      result.reasonCode : "recovery_response_invalid";
    const transient = result.state !== "CONTRADICTED" && RETRYABLE.has(code);
    const error = new Refusal(code,transient ? 503 : 409);
    error.diagnostic = publicDiagnostic(result.diagnostic);
    throw error;
  }
  return result;
}
async function boundedCall(call) {
  let timer;
  try {
    return checkResult(await Promise.race([Promise.resolve().then(call).catch(error => {
      if (error instanceof Refusal) throw error;
      // Transport details and remote exception strings never enter the audit log.
      throw new Refusal("recovery_service_unavailable",503);
    }),new Promise((_,reject) => {timer = setTimeout(() =>
      reject(new Refusal("recovery_service_timeout",503)),CALL_TIMEOUT_MS);})]));
  } finally { clearTimeout(timer); }
}

/** Coordinates only already-completed publication evidence. No publisher capability exists here. */
export class ReadbackRecovery {
  constructor(storage, env, {clock = Date.now} = {}) {
    this.storage = storage; this.env = env; this.clock = clock;
  }
  get() { return this.storage.kv.get("run"); }
  put(record) { this.storage.kv.put("run",record); return record; }
  bound() {
    const record = this.get();
    verifyRecoveryAuthority(record,this.env);
    return record;
  }
  status() { return this.bound(); }
  async schedule(record) {
    const recovery = record?.readbackRecovery;
    if (!recovery || TERMINAL.has(record.status) || ["BLOCKED","COMPLETED"].includes(recovery.state)) {
      await this.storage.deleteAlarm(); return record;
    }
    await this.storage.setAlarm(timestamp(recovery.nextWakeAt));
    return record;
  }
  async arm() {
    const now = this.clock(), configured = recoveryConfiguration(this.env);
    const record = this.storage.transactionSync(() => {
      const current = this.bound();
      if (TERMINAL.has(current.status) || current.readbackRecovery) return current;
      demand(["AUTHORISED","AWAITING_INDEPENDENT_VERIFICATION"].includes(current.status),
        "recovery_run_not_pending",409);
      const recovery = {schema:"donestate.release-readback-recovery.v1",state:"SCHEDULED",stage:"OBSERVE",
        policyDigest:configured.policyDigest,completionDigest:configured.completionDigest,
        attempts:0,failures:0,startedAt:iso(now),deadlineAt:iso(now+configured.maxDurationMs),
        nextWakeAt:iso(now),lease:null,lastError:null,execution:null,observation:null,observationHistory:[]};
      return this.put({...current,readbackRecovery:recovery,
        audit:event(current,"begin_published_readback_recovery",{
          policyDigest:configured.policyDigest,completionDigest:configured.completionDigest,
          recoveryAuthorisationDigest:configured.recoveryAuthorisationDigest},now)});
    });
    return this.schedule(record);
  }
  stop(code, now = this.clock(), token, diagnostic = null) {
    return this.storage.transactionSync(() => {
      const current = this.get(), recovery = current?.readbackRecovery;
      if (!recovery || TERMINAL.has(current.status) || ["BLOCKED","COMPLETED"].includes(recovery.state) ||
        (token && recovery.lease?.token !== token)) return current;
      return this.put({...current,readbackRecovery:{...recovery,state:"BLOCKED",nextWakeAt:null,lease:null,
        lastError:{reasonCode:code,stage:recovery.stage,at:iso(now),...(diagnostic ? {diagnostic} : {})}},
        audit:event(current,"block_published_readback_recovery",{reasonCode:code,
          stage:recovery.stage,attempts:recovery.attempts,preservedRunStatus:current.status,
          ...(diagnostic ? {diagnostic} : {})},now)});
    });
  }
  claim(now) {
    const configured = recoveryConfiguration(this.env);
    return this.storage.transactionSync(() => {
      const current = this.bound(), recovery = current.readbackRecovery;
      if (!recovery || TERMINAL.has(current.status) || ["BLOCKED","COMPLETED"].includes(recovery.state)) return null;
      if (timestamp(recovery.nextWakeAt) > now) return null;
      if (timestamp(recovery.deadlineAt) <= now || recovery.attempts >= configured.maxAttempts) return null;
      let stage = recovery.stage;
      if (stage !== "OBSERVE" && (!recovery.observation ||
        timestamp(recovery.observation.expiresAt) <= now+CALL_TIMEOUT_MS+5000)) stage = "OBSERVE";
      demand(["OBSERVE","SIGN","VERIFY"].includes(stage),"recovery_stage_invalid",409);
      const lease = {token:randomUUID(),expiresAt:iso(now+LEASE_MS)};
      return this.put({...current,readbackRecovery:{...recovery,state:"RUNNING",stage,
        attempts:recovery.attempts+1,lease,nextWakeAt:lease.expiresAt},
        audit:event(current,"attempt_published_readback_recovery",{
          stage,attempt:recovery.attempts+1,nextWakeAt:lease.expiresAt},now)});
    });
  }
  finish(claim, update, action, detail, now) {
    if (timestamp(claim.readbackRecovery.deadlineAt) <= now)
      return this.stop("recovery_retry_budget_exhausted",now,claim.readbackRecovery.lease.token);
    return this.storage.transactionSync(() => {
      const current = this.bound(), recovery = current.readbackRecovery;
      if (TERMINAL.has(current.status) || recovery?.lease?.token !== claim.readbackRecovery.lease.token) return current;
      const {run = {},recovery:change = {}} = update;
      return this.put({...current,...run,readbackRecovery:{...recovery,state:"SCHEDULED",lease:null,
        nextWakeAt:iso(now+1000),lastError:null,...change},audit:event(current,action,detail,now)});
    });
  }
  async freshHandoff(record, receipt, evidence, now) {
    verifyReadbackEvidence(evidence,record,this.env,now);
    verifyRecoveryReceipt(receipt,record,this.env,evidence,now);
    const trust = handoffPolicy({...record,receipt},this.env);
    const {trustedHandoffFingerprint,otherRoleFingerprints,...binding} = trust;
    const ttl = Math.min(300000,timestamp(evidence.observation.expiresAt)-now,
      timestamp(record.readbackRecovery.deadlineAt)-now);
    demand(ttl >= 1000,"recovery_readback_expired_or_future",503);
    return createReleaseV1Handoff(binding,handoffSigner(this.env),
      {trustedHandoffFingerprint,otherRoleFingerprints},now,ttl);
  }
  async observe(claim) {
    const input = {runId:claim.runId,transactionId:claim.transactionId,githubRunId:claim.githubRunId,
      subjectDigest:claim.subjectDigest,recoveryAuthorisationDigest:digest(claim.recoveryAuthorisation)};
    demand(typeof this.env.AGENTPROOF_READBACK?.observe === "function","recovery_binding_missing",503);
    const result = await boundedCall(() => this.env.AGENTPROOF_READBACK.observe(input));
    exact(result,["state","request","completion","observation","publicationResponse"]);
    demand(result.state === "verified","recovery_publication_not_verified",409);
    const now = this.clock(), current = this.bound();
    verifyReadbackEvidence(result,current,this.env,now);
    const execution = {request:result.request,completion:result.completion,publicationResponse:result.publicationResponse};
    if (current.readbackRecovery.execution) demand(digest(execution) === digest(current.readbackRecovery.execution),
      "recovery_original_evidence_changed",409);
    const handoff = current.receipt ? await this.freshHandoff(current,current.receipt,result,now) : null;
    return this.finish(claim,{recovery:{execution,observation:result.observation,
      observationHistory:[...current.readbackRecovery.observationHistory,result.observation],
      stage:current.receipt ? "VERIFY" : "SIGN"},run:handoff ? {
        handoff,handoffHistory:[...current.handoffHistory,handoff]} : {}},"record_fresh_release_readback",{
      completionDigest:digest(result.completion),observationDigest:digest(result.observation),
      handoffDigest:handoff ? digest(handoff) : null},this.clock());
  }
  async sign(claim) {
    const evidence = {...claim.readbackRecovery.execution,observation:claim.readbackRecovery.observation};
    verifyReadbackEvidence(evidence,this.bound(),this.env,this.clock());
    demand(typeof this.env.AGENTPROOF_RECEIPTS?.sign === "function","recovery_binding_missing",503);
    const {request,completion,observation} = evidence;
    const result = await boundedCall(() => this.env.AGENTPROOF_RECEIPTS.sign({request,completion,observation}));
    exact(result,["state","receipt"]);
    demand(result.state === "signed","recovery_receipt_missing",409);
    const now = this.clock(), current = this.bound();
    const outcome = verifyRecoveryReceipt(result.receipt,current,this.env,evidence,now);
    const handoff = await this.freshHandoff(current,result.receipt,evidence,now);
    return this.finish(claim,{run:{receipt:result.receipt,handoff,
      handoffHistory:[...current.handoffHistory,handoff],outcome,status:"AWAITING_INDEPENDENT_VERIFICATION"},
      recovery:{stage:"VERIFY"}},"accept_recovered_receipt_and_issue_handoff",{
      receiptPayloadDigest:result.receipt.proof.payloadDigest,handoffDigest:digest(handoff),
      observationDigest:digest(observation)},this.clock());
  }
  async verify(claim) {
    const evidence = {...claim.readbackRecovery.execution,observation:claim.readbackRecovery.observation};
    verifyReadbackEvidence(evidence,this.bound(),this.env,this.clock());
    verifyReleaseV1Handoff(claim.handoff,{...handoffPolicy(claim,this.env),now:this.clock()});
    demand(typeof this.env.OPSTRUTH_RELEASE?.verify === "function","recovery_binding_missing",503);
    const result = await boundedCall(() => this.env.OPSTRUTH_RELEASE.verify({receipt:claim.receipt,
      handoff:claim.handoff,observation:claim.readbackRecovery.observation}));
    exact(result,["state","signed","report"]);
    demand(result.signed === true && TERMINAL.has(result.state),"independent_signed_outcome_required",409);
    const now = this.clock(), current = this.bound();
    verifyReadbackEvidence(evidence,current,this.env,now);
    verifyReleaseV1Handoff(current.handoff,{...handoffPolicy(current,this.env),now});
    const observed = timestamp(result.report.observedAt);
    demand(observed >= timestamp(evidence.observation.observedAt)-30000 && observed <= now+30000,
      "recovery_independent_evidence_stale",409);
    const outcome = classifyReleaseV1Outcome({policy:policy(current,this.env),receipt:current.receipt,
      signedOpsTruthDecision:result.report,now});
    demand(outcome.independentlySignedDecision && outcome.status === result.state,
      "independent_signed_outcome_required",409);
    if (current.decision) demand(digest(current.decision) === digest(result.report),"terminal_evidence_immutable",409);
    return this.finish(claim,{run:{decision:result.report,outcome,status:outcome.status},recovery:{
      state:"COMPLETED",stage:"COMPLETE",nextWakeAt:null,completedAt:iso(now)}},"accept_independent_outcome",{
      decisionDigest:digest(result.report),verifier:this.env.OPSTRUTH_FINGERPRINT,
      recoveryObservationDigest:digest(evidence.observation)},now);
  }
  retry(claim, code, now, diagnostic = null) {
    const configured = recoveryConfiguration(this.env), current = this.bound(), recovery = current.readbackRecovery;
    if (recovery.lease?.token !== claim.readbackRecovery.lease.token || TERMINAL.has(current.status)) return current;
    if (recovery.attempts >= configured.maxAttempts || timestamp(recovery.deadlineAt) <= now)
      return this.stop("recovery_retry_budget_exhausted",now,recovery.lease.token,diagnostic);
    const failures = recovery.failures+1;
    const delay = REFRESH_REQUIRED.has(code) ? 1000 : Math.min(3600000,60000*2**Math.min(failures-1,6));
    const next = Math.min(now+delay,timestamp(recovery.deadlineAt));
    return this.finish(claim,{recovery:{failures,nextWakeAt:iso(next),
      stage:REFRESH_REQUIRED.has(code) ? "OBSERVE" : recovery.stage,
      lastError:{reasonCode:code,stage:recovery.stage,at:iso(now),...(diagnostic ? {diagnostic} : {})}}},
      "retry_published_readback_recovery",{reasonCode:code,stage:recovery.stage,
        attempt:recovery.attempts,nextWakeAt:iso(next),...(diagnostic ? {diagnostic} : {})},now);
  }
  async alarm() {
    let claim;
    try {
      const current = this.bound(), recovery = current.readbackRecovery, now = this.clock();
      if (!recovery || TERMINAL.has(current.status) || ["BLOCKED","COMPLETED"].includes(recovery.state))
        return this.schedule(current);
      if (timestamp(recovery.nextWakeAt) > now) return this.schedule(current);
      const configured = recoveryConfiguration(this.env);
      if (timestamp(recovery.deadlineAt) <= now || recovery.attempts >= configured.maxAttempts)
        return this.schedule(this.stop("recovery_retry_budget_exhausted",now));
      claim = this.claim(now);
      if (!claim) return this.schedule(this.get());
      // Persist the next wakeup before any RPC. A killed isolate leaves a recoverable lease.
      await this.schedule(claim);
      const result = await ({OBSERVE:() => this.observe(claim),SIGN:() => this.sign(claim),
        VERIFY:() => this.verify(claim)})[claim.readbackRecovery.stage]();
      return this.schedule(result);
    } catch (error) {
      const code = reason(error), now = this.clock();
      const retryable = error instanceof Refusal && error.status >= 500 && RETRYABLE.has(code);
      let result;
      try { result = claim && retryable ? this.retry(claim,code,now,error.diagnostic) :
        this.stop(code,now,claim?.readbackRecovery.lease.token,error.diagnostic); }
      catch (failure) { result = this.stop(reason(failure),now,claim?.readbackRecovery.lease.token); }
      return this.schedule(result);
    }
  }
}
