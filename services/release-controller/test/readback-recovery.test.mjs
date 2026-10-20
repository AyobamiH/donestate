import test from "node:test";
import assert from "node:assert/strict";
import { digest } from "../src/controller.mjs";
import { verifyReadbackEvidence, verifyRecoveryAuthority } from "../src/readback.mjs";
import { handle, scheduled } from "../src/worker.mjs";
import { recoveryFixture } from "./readback-fixtures.mjs";

async function tick(f, controller = f.recovery) {
  const record = controller.get();
  if (record.readbackRecovery?.nextWakeAt) f.now = Math.max(f.now,Date.parse(record.readbackRecovery.nextWakeAt));
  return controller.alarm();
}
async function finish(f, limit = 12) {
  for (let i=0;i<limit;i++) {
    const record = f.recovery.get();
    if (["BLOCKED","COMPLETED"].includes(record.readbackRecovery?.state)) return record;
    await tick(f);
  }
  assert.fail("recovery did not finish within the synthetic budget");
}
function audit(record) {
  for (const [i,entry] of record.audit.entries()) {
    const {digest:hash,...unsigned} = entry;
    assert.equal(hash,digest(unsigned));assert.equal(entry.previousDigest,i ? record.audit[i-1].digest : null);
  }
}

test("two-day-old signed execution recovers through fresh readback without renewed authority or publication",async () => {
  const f = await recoveryFixture(), original = structuredClone(f.record);
  await f.recovery.arm();
  const terminal = await finish(f);
  assert.equal(terminal.status,"VERIFIED");assert.equal(terminal.readbackRecovery.state,"COMPLETED");
  assert.deepEqual(terminal.recoveryAuthorisation,original.recoveryAuthorisation);
  assert.deepEqual(terminal.authorisationHistory,original.authorisationHistory);
  assert.deepEqual(terminal.readbackRecovery.execution.completion,f.completion);
  assert.equal(terminal.receipt.payload.attemptedAt,f.completion.attemptedAt);
  assert.equal(terminal.receipt.payload.verifiedAt,f.completion.verifiedAt);
  assert(terminal.readbackRecovery.observation.observedAt > f.completion.verifiedAt);
  assert.deepEqual(f.calls.map(call => call.method),["observe","sign","verify"]);
  assert(f.calls.every(call => !JSON.stringify(call).includes("x-github-token")));
  assert.equal(await f.storage.getAlarm(),null);audit(terminal);
  f.now += 172800000;
  assert.deepEqual(await f.restart().arm(),terminal);
  assert.deepEqual(await f.restart().alarm(),terminal);
  assert.equal(f.calls.length,3);
});

test("provider outage longer than two days resumes from durable backoff after object reconstruction",async () => {
  const f = await recoveryFixture({ageMs:30000}), availableAt = f.now+172800001;
  f.handlers.observe = () => f.now < availableAt ?
    {state:"BLOCKED",signed:false,reasonCode:"public_readback_unavailable",status:503} :
    {state:"verified",request:f.request,completion:f.completion,observation:f.readback(),publicationResponse:f.publicationResponse};
  await f.recovery.arm();
  for (let i=0;i<80 && f.recovery.get().status !== "VERIFIED";i++) await tick(f,f.restart());
  const terminal = f.recovery.get();
  assert.equal(terminal.status,"VERIFIED");assert(f.now >= availableAt);
  assert(terminal.readbackRecovery.failures > 40);assert(terminal.readbackRecovery.attempts < 96);
  assert.equal(f.calls.filter(call => call.method === "sign").length,1);
  assert.equal(terminal.receipt.payload.verifiedAt,f.completion.verifiedAt);audit(terminal);
});

test("crash after durable lease and lost signer response preserve receipt identity and permanent execution evidence",async () => {
  const f = await recoveryFixture();
  await f.recovery.arm();
  const claimed = f.recovery.claim(f.now);
  assert.equal(claimed.readbackRecovery.state,"RUNNING");
  await f.restart().alarm();assert.equal(f.calls.length,0);
  f.now += 90000;
  await f.restart().alarm();
  let failed = false;
  f.handlers.sign = (_input,receipt) => {
    if (!failed) {failed = true;throw new TypeError("lost response after receipt persisted");}
    return {state:"signed",receipt};
  };
  await tick(f,f.restart());
  const persistedReceipt = structuredClone(f.signedReceipt);
  assert.equal(f.recovery.get().readbackRecovery.state,"SCHEDULED");
  f.recovery = f.restart();
  const terminal = await finish(f);
  assert.equal(terminal.status,"VERIFIED");assert.deepEqual(terminal.receipt,persistedReceipt);
  assert.equal(f.calls.filter(call => call.method === "sign").length,2);
  assert.deepEqual(terminal.readbackRecovery.execution.completion,f.completion);
});

test("persisted receipt survives observation expiry and lost verifier response without being reissued",async () => {
  const f = await recoveryFixture();
  await f.recovery.arm();await tick(f);await tick(f);
  const receipt = structuredClone(f.recovery.get().receipt), first = f.recovery.get().readbackRecovery.observation;
  f.now += 172800000;
  let failed = false;
  f.handlers.verify = input => {
    if (!failed) {failed = true;throw new TypeError("independent response lost");}
    return {state:"VERIFIED",signed:true,report:f.report(input.receipt)};
  };
  const terminal = await finish(f);
  assert.equal(terminal.status,"VERIFIED");assert.deepEqual(terminal.receipt,receipt);
  assert.equal(f.calls.filter(call => call.method === "sign").length,1);
  assert.equal(terminal.readbackRecovery.observationHistory.length,2);
  assert.deepEqual(terminal.readbackRecovery.observationHistory[0],first);
  assert.equal(terminal.handoffHistory.length,2);audit(terminal);
});

test("duplicate concurrent alarm delivery performs one bounded RPC for the current lease",async () => {
  const f = await recoveryFixture();await f.recovery.arm();
  let release;
  f.handlers.observe = () => new Promise(resolve => {release = () => resolve({state:"verified",request:f.request,
    completion:f.completion,observation:f.readback(),publicationResponse:f.publicationResponse});});
  const first = f.recovery.alarm();
  for (let i=0;i<8 && !release;i++) await Promise.resolve();
  assert.equal(typeof release,"function");
  await f.restart().alarm();assert.equal(f.calls.length,1);
  release();await first;
  assert.equal(f.recovery.get().readbackRecovery.stage,"SIGN");
});

test("unsigned contradiction blocks recovery without fabricating a terminal DoneState verdict",async () => {
  const f = await recoveryFixture();
  f.handlers.verify = () => ({state:"CONTRADICTED",signed:false,reasonCode:"artifact_digest_mismatch",observation:{}});
  await f.recovery.arm();const blocked = await finish(f);
  assert.equal(blocked.status,"AWAITING_INDEPENDENT_VERIFICATION");
  assert.equal(blocked.decision,null);assert.equal(blocked.readbackRecovery.state,"BLOCKED");
  assert.equal(blocked.readbackRecovery.lastError.reasonCode,"artifact_digest_mismatch");
  const count = f.calls.length;await f.restart().arm();await f.restart().alarm();
  assert.equal(f.calls.length,count);assert.equal(await f.storage.getAlarm(),null);audit(blocked);
});

test("separately signed negative decisions remain immutable terminal evidence",async () => {
  for (const [decision,state] of [["failed","CONTRADICTED"],["uncertain","UNPROVEN"]]) {
    const f = await recoveryFixture();
    f.handlers.verify = input => {
      const report = f.report(input.receipt);
      return {state,signed:true,report:f.evidence.signReport({...report,decision,
        observation:{...report.observation,verdict:state,reasonCode:"independent_negative_observation"}})};
    };
    await f.recovery.arm();const terminal = await finish(f);
    assert.equal(terminal.status,state);assert.equal(terminal.readbackRecovery.state,"COMPLETED");
    assert.equal(terminal.outcome.independentlySignedDecision,true);
    assert.deepEqual(await f.restart().alarm(),terminal);audit(terminal);
  }
});

test("authority expiring during independent I/O returns to fresh observation while retaining the receipt",async () => {
  for (const reasonCode of ["readback_expired","handoff_expired"]) {
    const f = await recoveryFixture();let expired = false;
    f.handlers.verify = input => {
      if (!expired) {expired = true;f.now += 300001;return {state:"BLOCKED",signed:false,reasonCode};}
      return {state:"VERIFIED",signed:true,report:f.report(input.receipt)};
    };
    await f.recovery.arm();await tick(f);await tick(f);
    const receipt = structuredClone(f.recovery.get().receipt);
    await tick(f);assert.equal(f.recovery.get().readbackRecovery.stage,"OBSERVE");
    assert.equal(f.recovery.get().readbackRecovery.state,"SCHEDULED");
    const terminal = await finish(f);
    assert.equal(terminal.status,"VERIFIED");assert.deepEqual(terminal.receipt,receipt);
    assert.equal(terminal.readbackRecovery.observationHistory.length,2);
    assert.equal(f.calls.filter(call => call.method === "sign").length,1);
  }
});

test("only bounded public transport diagnostics survive retry and audit persistence",async () => {
  const f = await recoveryFixture();
  const diagnostic = {endpoint:"repository",upstreamStatus:429,rateLimitRemaining:0,
    rateLimitReset:1792321200,retryAfterSeconds:60};
  f.handlers.observe = () => ({state:"BLOCKED",signed:false,reasonCode:"public_readback_unavailable",
    status:503,diagnostic});
  await f.recovery.arm();await tick(f);
  assert.deepEqual(f.recovery.get().readbackRecovery.lastError.diagnostic,diagnostic);
  assert.deepEqual(f.recovery.get().audit.at(-1).detail.diagnostic,diagnostic);
  f.handlers.observe = () => ({state:"BLOCKED",signed:false,reasonCode:"public_readback_unavailable",status:503,
    diagnostic:{...diagnostic,body:"sensitive-untrusted-response-body"}});
  await tick(f);
  assert.equal(f.recovery.get().readbackRecovery.lastError.diagnostic,undefined);
  assert(!JSON.stringify(f.recovery.get()).includes("sensitive-untrusted-response-body"));audit(f.recovery.get());
});

test("retry and elapsed-time budgets stop visibly without clearing existing authority",async () => {
  for (const duration of [false,true]) {
    const f = await recoveryFixture({maxAttempts:3});
    f.handlers.observe = () => ({state:"BLOCKED",signed:false,reasonCode:"readback_provider_unavailable",status:503});
    await f.recovery.arm();
    if (duration) f.now += 259200001;
    const blocked = await finish(f);
    assert.equal(blocked.readbackRecovery.state,"BLOCKED");
    assert.equal(blocked.readbackRecovery.lastError.reasonCode,"recovery_retry_budget_exhausted");
    assert.equal(blocked.status,"AUTHORISED");assert.deepEqual(blocked.recoveryAuthorisation,f.record.recoveryAuthorisation);
    assert.equal(f.calls.length,duration ? 0 : 3);assert.equal(await f.storage.getAlarm(),null);
  }
});

test("fresh sidecar cannot substitute for stale, altered or untrusted predecessor evidence",async () => {
  const f = await recoveryFixture();
  const evidence = {request:f.request,completion:f.completion,observation:f.readback(),publicationResponse:f.publicationResponse};
  assert.doesNotThrow(() => verifyReadbackEvidence(evidence,f.record,f.env,f.now));
  for (const mutate of [
    e => {e.observation.readOnly = false;},
    e => {e.observation.runId = "00000000-0000-0000-0000-000000000000";},
    e => {e.observation.completionDigest = "f".repeat(64);},
    e => {e.observation.signatureBase64 = "A".repeat(86)+"==";},
    e => {e.completion.verifiedAt = e.observation.observedAt;},
    e => {e.request.subject.releaseId++;},
    e => {e.observation.after.draft = true;},
  ]) {
    const changed = structuredClone(evidence);mutate(changed);
    assert.throws(() => verifyReadbackEvidence(changed,f.record,f.env,f.now));
  }
  assert.throws(() => verifyReadbackEvidence(evidence,f.record,f.env,f.now+300001),/expired/);
  assert.throws(() => verifyRecoveryAuthority({...f.record,recoveryAuthorisation:null},f.env));
  assert.throws(() => verifyRecoveryAuthority({...f.record,audit:[]},f.env));
});

test("trust or predecessor drift halts a scheduled run before outbound work",async () => {
  for (const key of ["TRUSTED_SOURCE_SHA","READBACK_RECOVERY_RUN_ID","READBACK_RECOVERY_COMPLETION_DIGEST",
    "READBACK_RECOVERY_AUTHORISATION_DIGEST","OPSTRUTH_FINGERPRINT"]) {
    const f = await recoveryFixture();await f.recovery.arm();
    f.env[key] = key === "READBACK_RECOVERY_RUN_ID" ? "00000000-0000-0000-0000-000000000000" :
      key === "TRUSTED_SOURCE_SHA" ? "c".repeat(40) : key === "OPSTRUTH_FINGERPRINT" ? "sha256:"+"f".repeat(64) : "f".repeat(64);
    await f.recovery.alarm();
    assert.equal(f.calls.length,0);assert.equal(f.recovery.get().readbackRecovery.state,"BLOCKED");
    assert.equal(f.recovery.get().status,"AUTHORISED");
  }
});

test("scheduled bootstrap only resumes an existing pinned record and private paths stay off public routing",async () => {
  const f = await recoveryFixture();
  let calls = 0;
  f.env.RUNS = {idFromName:key => key,get:key => ({fetch:async request => {
    calls++;assert.equal(key,f.record.subject.repositoryId+":"+f.record.subject.releaseId);
    assert.equal(new URL(request.url).pathname,"/internal/readback-recovery-arm");
    return Response.json(await f.recovery.arm());
  }})};
  await scheduled({},f.env);assert.equal(calls,1);assert.equal(f.recovery.get().readbackRecovery.stage,"OBSERVE");
  const disabled = {...f.env,READBACK_RECOVERY_ENABLED:"false"};
  await scheduled({},disabled);assert.equal(calls,1);
  for (const path of ["/internal/readback-recovery-arm","/internal/readback-recovery-status","/v1/readback-recovery"]) {
    const response = await handle(new Request("https://example"+path,{method:"POST",body:"{}"}),f.env,
      () => {assert.fail("private route reached public authentication");});
    assert.equal(response.status,404);
  }
  f.storage.kv.put("run",undefined);
  await assert.rejects(f.restart().arm(),/recovery_predecessor_changed/);
  assert.equal(f.storage.kv.get("run"),undefined);
});

test("bootstrap repairs an interruption between persisting a pending stage and scheduling its alarm",async () => {
  const f = await recoveryFixture(), real = f.storage.setAlarm;
  f.storage.setAlarm = async () => {throw new Error("synthetic storage interruption");};
  await assert.rejects(f.recovery.arm());
  assert.equal(f.recovery.get().readbackRecovery.state,"SCHEDULED");assert.equal(await f.storage.getAlarm(),null);
  f.storage.setAlarm = real;
  await f.restart().arm();assert.equal(await f.storage.getAlarm(),f.now);
  assert.equal(f.calls.length,0);
});
