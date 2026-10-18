import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { canonicalJson } from "../../../dist/hash.js";
import { Controller, digest } from "../src/controller.mjs";
import { validateClaims } from "../src/identity.mjs";
import { handle } from "../src/worker.mjs";
import { fixture, pair } from "./fixtures.mjs";

function setup() {
  const f = fixture(), handoff = pair(), now = Date.now();
  const env = {
    ENABLED:"true", TRUSTED_SOURCE_SHA:"a".repeat(40), TARGET_SUBJECT_JSON:JSON.stringify(f.receipt.payload.subject),
    APPROVAL_FINGERPRINT:f.roles.authority.fingerprint, RECEIPT_FINGERPRINT:f.roles.receiptSigner.fingerprint,
    OPSTRUTH_FINGERPRINT:f.roles.opstruth.fingerprint, PROVENANCE_FINGERPRINT:f.roles.provenance.fingerprint,
    HANDOFF_FINGERPRINT:handoff.fingerprint, HANDOFF_PUBLIC_KEY_PEM:handoff.publicKeyPem,
    HANDOFF_PRIVATE_KEY_PEM:handoff.keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),
  };
  const data = new Map();
  const storage = {kv:{get:k=>structuredClone(data.get(k)),put:(k,v)=>data.set(k,structuredClone(v))},
    transactionSync:fn=>fn()};
  const controller = new Controller(storage,env), claims={githubRunId:"123456789",githubRunAttempt:1};
  const record=controller.start(claims,{},now-60000);
  const evidence=fixture({roles:f.roles,runId:record.runId,transactionId:record.transactionId,
    nonce:"release-canary:"+claims.githubRunId,idempotencyKey:"release-canary:"+claims.githubRunId,now});
  return {env,storage,controller,claims,record,evidence,now};
}
test("durable authorised run, handoff, independent terminal result and recovery are idempotent",async()=>{
  const f=setup(), {controller:c,claims,record:r,evidence:e,now}=f;
  assert.equal(r.status,"AUTHORISED");assert.equal(c.start(claims,{},now).runId,r.runId);
  const p=await c.receipt(claims,{runId:r.runId,receipt:e.receipt},now);
  assert.equal(p.status,"AWAITING_INDEPENDENT_VERIFICATION");
  assert.equal(p.outcome.independentlySignedDecision,false);
  assert.equal(p.handoff.githubRunId,claims.githubRunId);
  const recovered=new Controller(f.storage,f.env);
  assert.deepEqual(await recovered.receipt(claims,{runId:r.runId,receipt:e.receipt},now),p);
  const done=c.settle(claims,{runId:r.runId,decision:e.signedOpsTruthDecision},now);
  assert.equal(done.status,"VERIFIED");assert.equal(done.audit.length,3);
  assert.deepEqual(recovered.settle(claims,{runId:r.runId,decision:e.signedOpsTruthDecision},now+900000),done);
  for (const [i,item] of done.audit.entries()) {
    const {digest:hash,...unsigned}=item;assert.equal(hash,digest(unsigned));
    assert.equal(item.previousDigest,i?done.audit[i-1].digest:null);
  }
});
test("foreign workflow, target drift, absent run and premature settlement cannot change state",()=>{
  const {controller:c,claims,env,record:r,evidence:e,now}=setup();
  const before=c.get();
  assert.throws(()=>c.start({githubRunId:"987654321"},{},now),/already_claimed/);
  assert.throws(()=>c.settle(claims,{runId:r.runId,decision:e.signedOpsTruthDecision},now),/not_pending/);
  env.TARGET_SUBJECT_JSON=JSON.stringify({...r.subject,releaseId:r.subject.releaseId+1});
  assert.throws(()=>c.bound(claims),/configuration_changed/);
  assert.deepEqual(c.get(),before);
});
test("tampered or foreign receipts and wrong run IDs are rejected before handoff",async()=>{
  for(const mutate of [
    f=>({...f.evidence.receipt,proof:{...f.evidence.receipt.proof,signatureBase64:"A".repeat(86)+"=="}}),
    f=>fixture().receipt,
    f=>({...f.evidence.receipt,payload:{...f.evidence.receipt.payload,subjectDigest:"f".repeat(64)}}),
  ]) {
    const f=setup(),before=f.controller.get();
    await assert.rejects(f.controller.receipt(f.claims,{runId:f.record.runId,receipt:mutate(f)},f.now));
    assert.deepEqual(f.controller.get(),before);
  }
});
test("unsigned, stale, wrong signer, wrong target, expired handoff and changed terminal evidence fail closed",async()=>{
  for(const mode of ["unsigned","stale","signer","target","expired"]) {
    const f=setup(),c=f.controller,r=f.record,e=f.evidence;
    await c.receipt(f.claims,{runId:r.runId,receipt:e.receipt},f.now);
    let d=structuredClone(e.signedOpsTruthDecision),when=f.now;
    if(mode==="unsigned")delete d.signature;
    if(mode==="stale")d=e.signReport({...d,observedAt:new Date(f.now-3600000).toISOString()});
    if(mode==="signer")d.signature.signerFingerprint="sha256:"+"f".repeat(64);
    if(mode==="target")d=e.signReport({...d,subjectDigest:"f".repeat(64)});
    if(mode==="expired")when+=600001;
    const before=c.get();assert.throws(()=>c.settle(f.claims,{runId:r.runId,decision:d},when));
    assert.deepEqual(c.get(),before);
  }
  const f=setup();await f.controller.receipt(f.claims,{runId:f.record.runId,receipt:f.evidence.receipt},f.now);
  f.controller.settle(f.claims,{runId:f.record.runId,decision:f.evidence.signedOpsTruthDecision},f.now);
  assert.throws(()=>f.controller.settle(f.claims,{runId:f.record.runId,decision:{}},f.now),/immutable/);
});
test("signer outage and colliding roles cannot reserve or advance a run",async()=>{
  const f=setup(),before=f.controller.get();f.env.HANDOFF_PRIVATE_KEY_PEM="";
  await assert.rejects(f.controller.receipt(f.claims,{runId:f.record.runId,receipt:f.evidence.receipt},f.now));
  assert.deepEqual(f.controller.get(),before);
  f.env.PROVENANCE_FINGERPRINT=f.env.OPSTRUTH_FINGERPRINT;
  assert.throws(()=>f.controller.bound(f.claims),/distinct_trust/);
});
test("OIDC exact identity rejects foreign claims and admits authenticated recovery attempts",()=>{
  const env={ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40)};
  const claims={repository:"AyobamiH/agentproof-release-canary",repository_id:"1423718326",
    repository_owner_id:"47716486",actor_id:"47716486",ref:"refs/heads/main",
    event_name:"workflow_dispatch",runner_environment:"github-hosted",
    workflow_ref:"AyobamiH/agentproof-release-canary/.github/workflows/release-canary.yml@refs/heads/main",
    workflow_sha:env.TRUSTED_SOURCE_SHA,sha:env.TRUSTED_SOURCE_SHA,
    sub:"repo:AyobamiH@47716486/agentproof-release-canary@1423718326:environment:agentproof-release-canary",
    run_id:"123456789",run_attempt:"1"};
  assert.deepEqual(validateClaims(claims,env),{githubRunId:"123456789",githubRunAttempt:1});
  for(const key of Object.keys(claims))
    assert.throws(()=>validateClaims({...claims,[key]:"foreign"},env));
  assert.deepEqual(validateClaims({...claims,run_attempt:"2"},env),{githubRunId:"123456789",githubRunAttempt:2});
  assert.throws(()=>validateClaims(claims,{...env,ENABLED:"false"}));
});
test("anonymous, publisher credential and unsupported route requests are rejected",async()=>{
  const f=setup();
  assert.equal((await handle(new Request("https://example/v1/start",{method:"POST",body:"{}"}),f.env)).status,401);
  const request=new Request("https://example/v1/start",{method:"POST",
    headers:{"x-github-token":"test-token","content-type":"application/json"},body:"{}"});
  assert.equal((await handle(request,f.env,async()=>f.claims)).status,403);
  assert.equal((await handle(new Request("https://example/v1/delete",{method:"POST"}),f.env)).status,404);
});

test("every trust role is frozen before receipt and settlement",async()=>{
  for(const key of ["APPROVAL_FINGERPRINT","RECEIPT_FINGERPRINT","OPSTRUTH_FINGERPRINT","PROVENANCE_FINGERPRINT","HANDOFF_FINGERPRINT"]) {
    for(const pending of [false,true]) {
      const f=setup();
      if(pending)await f.controller.receipt(f.claims,{runId:f.record.runId,receipt:f.evidence.receipt},f.now);
      const before=f.controller.get();f.env[key]=pair().fingerprint;
      assert.throws(()=>f.controller.bound(f.claims),/trust_configuration_changed/);
      assert.deepEqual(f.controller.get(),before);
    }
  }
});
test("valid signed negative decisions are immutable terminal outcomes",async()=>{
  for(const [decision,status] of [["failed","CONTRADICTED"],["uncertain","UNPROVEN"]]) {
    const f=setup(),c=f.controller;
    await c.receipt(f.claims,{runId:f.record.runId,receipt:f.evidence.receipt},f.now);
    const original=f.evidence.signedOpsTruthDecision;
    const report=f.evidence.signReport({...original,decision,observation:{...original.observation,verdict:status}});
    const final=c.settle(f.claims,{runId:f.record.runId,decision:report},f.now);
    assert.equal(final.status,status);assert.equal(final.audit.length,3);
    assert.deepEqual(c.settle(f.claims,{runId:f.record.runId,decision:report},f.now),final);
    assert.throws(()=>c.settle(f.claims,{runId:f.record.runId,decision:original},f.now),/immutable/);
  }
});
test("same-run recovery can refresh an expired handoff without authorising a new release",async()=>{
  const f=setup(),c=f.controller,recovery={...f.claims,githubRunAttempt:2};
  const pending=await c.receipt(f.claims,{runId:f.record.runId,receipt:f.evidence.receipt},f.now);
  assert.deepEqual(c.start(recovery,{},f.now),pending);
  const body={runId:f.record.runId,receiptPayloadDigest:f.evidence.receipt.proof.payloadDigest};
  const later=f.now+300001;
  const fresh=await c.refresh(recovery,body,later);
  assert.equal(fresh.handoffHistory.length,2);assert.deepEqual(fresh.handoffHistory[0],pending.handoff);
  assert.notDeepEqual(fresh.handoff,pending.handoff);assert.equal(fresh.audit.length,3);
  assert.deepEqual(await c.refresh(recovery,body,later),fresh);
  const final=c.settle(recovery,{runId:f.record.runId,decision:f.evidence.signedOpsTruthDecision},later);
  assert.equal(final.status,"VERIFIED");assert.equal(final.audit.length,4);
  const empty={kv:{get:()=>undefined,put:()=>assert.fail("unexpected write")},transactionSync:fn=>fn()};
  assert.throws(()=>new Controller(empty,f.env).start(recovery,{},later),/new_attempt_not_authorised/);
  const g=setup();await g.controller.receipt(g.claims,{runId:g.record.runId,receipt:g.evidence.receipt},g.now);
  await assert.rejects(g.controller.refresh(g.claims,{runId:g.record.runId,receiptPayloadDigest:g.evidence.receipt.proof.payloadDigest},g.now+1200001),/window_expired/);
});

test("handoff renewal cannot extend the receipt deadline for settlement",async()=>{
  const f=setup(),c=f.controller,r=f.record,e=f.evidence;
  await c.receipt(f.claims,{runId:r.runId,receipt:e.receipt},f.now);
  const deadline=Date.parse(e.receipt.payload.issuedAt)+1200000;
  const fresh=await c.refresh(f.claims,{runId:r.runId,receiptPayloadDigest:e.receipt.proof.payloadDigest},deadline-2000);
  assert.equal(Date.parse(fresh.handoff.expiresAt),deadline);
  const observedAt=new Date(deadline-2000).toISOString();
  const decision=e.signReport({...e.signedOpsTruthDecision,observedAt,
    observation:{...e.signedOpsTruthDecision.observation,observedAt}});
  const before=c.get();
  assert.throws(()=>c.settle(f.claims,{runId:r.runId,decision},deadline+1),/receipt_recovery_window_expired/);
  assert.deepEqual(c.get(),before);
});

function recovery(f) {
  f.env.RECOVERY_FROM_WORKFLOW_SHA=f.env.TRUSTED_SOURCE_SHA;
  f.env.RECOVERY_FROM_GITHUB_RUN_ID=f.claims.githubRunId;
  f.env.TRUSTED_SOURCE_SHA="b".repeat(40);
  const claims={githubRunId:"987654321",githubRunAttempt:1};
  const request={stateDirectory:"/tmp/agentproof-release-canary-"+claims.githubRunId,
    transactionId:f.record.transactionId,nonce:"release-canary:"+claims.githubRunId,
    idempotencyKey:"release-canary:"+claims.githubRunId,subject:f.record.subject,
    approval:f.evidence.receipt.payload.approval};
  const unsigned={schema:"agentproof.release-reservation.v1",state:"reserved",
    requestDigest:digest(request),subjectDigest:f.record.subjectDigest,
    transactionId:f.record.transactionId,githubRunId:claims.githubRunId,githubRunAttempt:claims.githubRunAttempt,
    workflowCommit:f.env.TRUSTED_SOURCE_SHA,issuedAt:request.approval.decidedAt,
    expiresAt:request.approval.expiresAt,authorityPublicKeyPem:f.evidence.roles.authority.publicKeyPem};
  const signReservation=(value,key=f.evidence.roles.authority)=>{
    const {signatureBase64:_old,...raw}=value;
    return {...raw,signatureBase64:key.signature("agentproof.release-reservation.v1\0"+canonicalJson(raw))};
  };
  return {claims,signReservation,body:{runId:f.record.runId,previousGithubRunId:f.claims.githubRunId,
    request,reservation:signReservation(unsigned)}};
}
test("fresh signed fence reservation resumes exact unexecuted authority and preserves history",async()=>{
  const f=setup(),r=recovery(f),original=f.controller.get();
  const resumed=await f.controller.recover(r.claims,r.body,f.now);
  assert.deepEqual(resumed.authorisationHistory,[original]);assert.equal(resumed.audit.length,2);
  assert.equal(resumed.githubRunId,r.claims.githubRunId);assert.equal(resumed.runId,original.runId);
  assert.equal(resumed.transactionId,original.transactionId);assert.equal(resumed.status,"AUTHORISED");
  assert.equal(resumed.executionNotBefore,new Date(f.now).toISOString());
  assert.deepEqual(await f.controller.recover(r.claims,r.body,f.now+900000),resumed);
  assert.throws(()=>f.controller.bound(f.claims),/already_claimed/);
  const fresh=fixture({roles:f.evidence.roles,runId:resumed.runId,transactionId:resumed.transactionId,
    nonce:"release-canary:"+r.claims.githubRunId,idempotencyKey:"release-canary:"+r.claims.githubRunId,now:f.now+40000});
  const pending=await f.controller.receipt(r.claims,{runId:resumed.runId,receipt:fresh.receipt},f.now+40000);
  assert.equal(pending.status,"AWAITING_INDEPENDENT_VERIFICATION");
  assert.equal(f.controller.settle(r.claims,{runId:resumed.runId,decision:fresh.signedOpsTruthDecision},f.now+40000).status,"VERIFIED");
});
test("recovery rejects stale, tampered, foreign, attempted and changed authority proofs without writes",async()=>{
  for(const mode of ["expired","future","tampered","wrong-signature","wrong-key","wrong-run","wrong-workflow",
    "wrong-transaction","wrong-target","wrong-attempt","attempted","wrong-predecessor","trust-drift","unconfigured","rerun"]) {
    const f=setup(),r=recovery(f),before=f.controller.get();let now=f.now;
    if(mode==="expired")now+=600001;
    if(mode==="future")now=Date.parse(r.body.reservation.issuedAt)-1;
    if(mode==="tampered")r.body.reservation.requestDigest="f".repeat(64);
    if(mode==="wrong-signature")r.body.reservation.signatureBase64="A".repeat(86)+"==";
    if(mode==="wrong-key") {const key=pair();r.body.reservation=r.signReservation({...r.body.reservation,authorityPublicKeyPem:key.publicKeyPem},key);}
    if(mode==="wrong-run")r.body.reservation=r.signReservation({...r.body.reservation,githubRunId:"111111111"});
    if(mode==="wrong-attempt")r.body.reservation=r.signReservation({...r.body.reservation,githubRunAttempt:2});
    if(mode==="wrong-workflow")r.body.reservation=r.signReservation({...r.body.reservation,workflowCommit:"c".repeat(40)});
    if(mode==="wrong-transaction")r.body.request.transactionId="00000000-0000-0000-0000-000000000000";
    if(mode==="wrong-target")r.body.request={...r.body.request,subject:{...r.body.request.subject,releaseId:999}};
    if(mode==="attempted")r.body.reservation=r.signReservation({...r.body.reservation,state:"attempted"});
    if(mode==="wrong-predecessor")r.body.previousGithubRunId="111111111";
    if(mode==="trust-drift")f.env.OPSTRUTH_FINGERPRINT=pair().fingerprint;
    if(mode==="unconfigured")delete f.env.RECOVERY_FROM_GITHUB_RUN_ID;
    if(mode==="rerun")r.claims.githubRunAttempt=2;
    await assert.rejects(f.controller.recover(r.claims,r.body,now),undefined,mode);
    assert.deepEqual(f.controller.get(),before,mode);
  }
});
test("receipt or terminal evidence forbids recovery and execution before recovery is refused",async()=>{
  for(const terminal of [false,true]) {
    const f=setup();await f.controller.receipt(f.claims,{runId:f.record.runId,receipt:f.evidence.receipt},f.now);
    if(terminal)f.controller.settle(f.claims,{runId:f.record.runId,decision:f.evidence.signedOpsTruthDecision},f.now);
    const r=recovery(f),before=f.controller.get();await assert.rejects(f.controller.recover(r.claims,r.body,f.now),/after_evidence/);
    assert.deepEqual(f.controller.get(),before);
  }
  const f=setup(),r=recovery(f);await f.controller.recover(r.claims,r.body,f.now);
  const premature=fixture({roles:f.evidence.roles,runId:f.record.runId,transactionId:f.record.transactionId,
    nonce:"release-canary:"+r.claims.githubRunId,idempotencyKey:"release-canary:"+r.claims.githubRunId,now:f.now});
  const before=f.controller.get();await assert.rejects(f.controller.receipt(r.claims,{runId:f.record.runId,receipt:premature.receipt},f.now),/not_authorised/);
  assert.deepEqual(f.controller.get(),before);
  await assert.rejects(f.controller.recover(r.claims,{...r.body,previousGithubRunId:"111111111"},f.now),/evidence_changed/);
});

test("recovery grant is signed only after durable commit and signer outage cannot admit a receipt",async()=>{
  const f=setup(),r=recovery(f),key=f.env.HANDOFF_PRIVATE_KEY_PEM;
  let inTransaction=false;
  f.storage.transactionSync=fn=>{inTransaction=true;try{return fn();}finally{inTransaction=false;}};
  Object.defineProperty(f.env,'HANDOFF_PRIVATE_KEY_PEM',{configurable:true,get(){
    assert.equal(inTransaction,false,'recovery signature must follow committed authority');return key;
  }});
  const resumed=await f.controller.recover(r.claims,r.body,f.now);
  const grant=resumed.recoveryAuthorisation;
  assert.equal(grant.authorisationAuditDigest,resumed.audit.at(-1).digest);
  assert.equal(grant.reservationDigest,digest(r.body.reservation));
  const {signatureBase64,...unsigned}=grant;
  assert(verify(null,Buffer.from('donestate.release-recovery-authorisation.v1\0'+canonicalJson(unsigned)),
    createPublicKey(grant.publicKeyPem),Buffer.from(signatureBase64,'base64')));
  const g=setup(),recoveryRequest=recovery(g),privateKey=g.env.HANDOFF_PRIVATE_KEY_PEM;
  g.env.HANDOFF_PRIVATE_KEY_PEM='';
  await assert.rejects(g.controller.recover(recoveryRequest.claims,recoveryRequest.body,g.now));
  const committed=g.controller.get();assert.equal(committed.githubRunId,recoveryRequest.claims.githubRunId);
  assert.equal(committed.recoveryAuthorisation,null);assert.equal(committed.authorisationHistory.length,1);
  await assert.rejects(g.controller.receipt(recoveryRequest.claims,{runId:g.record.runId,receipt:g.evidence.receipt},g.now),/not_signed/);
  g.env.HANDOFF_PRIVATE_KEY_PEM=privateKey;
  const recovered=await g.controller.recover(recoveryRequest.claims,recoveryRequest.body,g.now+1000);
  assert.equal(recovered.audit.length,committed.audit.length);assert(recovered.recoveryAuthorisation);
});
