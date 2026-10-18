import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey } from "node:crypto";
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
  const controller = new Controller(storage,env), claims={githubRunId:"123456789"};
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
test("OIDC exact identity, disabled controller and workflow retries are denied",()=>{
  const env={ENABLED:"true",TRUSTED_SOURCE_SHA:"a".repeat(40)};
  const claims={repository:"AyobamiH/agentproof-release-canary",repository_id:"1423718326",
    repository_owner_id:"47716486",actor_id:"47716486",ref:"refs/heads/main",
    event_name:"workflow_dispatch",runner_environment:"github-hosted",
    workflow_ref:"AyobamiH/agentproof-release-canary/.github/workflows/release-canary.yml@refs/heads/main",
    workflow_sha:env.TRUSTED_SOURCE_SHA,sha:env.TRUSTED_SOURCE_SHA,
    sub:"repo:AyobamiH@47716486/agentproof-release-canary@1423718326:environment:agentproof-release-canary",
    run_id:"123456789",run_attempt:"1"};
  assert.deepEqual(validateClaims(claims,env),{githubRunId:"123456789"});
  for(const key of Object.keys(claims))
    assert.throws(()=>validateClaims({...claims,[key]:"foreign"},env));
  assert.throws(()=>validateClaims({...claims,run_attempt:"2"},env));
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
