// Integration fixture only: no deployment, credentials or external publication.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {recoveryFixture} from "../services/release-controller/test/readback-fixtures.mjs";
import {pair} from "../services/release-controller/test/fixtures.mjs";
import {digest} from "../services/release-controller/src/controller.mjs";
import {canonicalJson} from "../dist/hash.js";
const args=process.argv.slice(2);
function root(flag){const i=args.indexOf(flag);assert.ok(i>=0&&args[i+1],flag+" required");return resolve(args[i+1]);}
const apRoot=root("--agentproof-root"),otRoot=root("--opstruth-root");
const moduleAt=(base,path)=>import(pathToFileURL(resolve(base,path)).href);
const {recoveryRpc}=await moduleAt(apRoot,"services/release-provider/src/readback-recovery.mjs");
const {ReleaseFence,ReleaseReceiptLedger}=await moduleAt(apRoot,"services/release-provider/src/worker.mjs");
const {evaluateRecovery}=await moduleAt(otRoot,"services/release-verifier/src/worker.mjs");
const {RELEASE_PROVENANCE_DOMAIN}=await moduleAt(otRoot,"verification-kits/release-v1/verify.js");
const hash=v=>createHash("sha256").update(v).digest("hex");
const roles={authority:pair(),receiptSigner:pair(),opstruth:pair(),provenance:pair()};
const packageBytes=Buffer.from("deterministic durable recovery cross-service fixture\n");
const partial={schema:"opstruth.release-v1.subject.v1",owner:"AyobamiH",repository:"agentproof-release-canary",
 ownerId:47716486,repositoryId:1423718326,releaseId:303,tagName:"v0.0.0-rc.2026101801",tagCommit:"a".repeat(40),
 packageAssetId:404,packageAssetName:"artifact.tgz",packageDigest:"sha256:"+hash(packageBytes)};
const manifest={schema:"opstruth.release-v1.provenance.v1",subjectDigest:digest(partial),
 packageSha256:hash(packageBytes),issuer:"independent-canary-provenance-issuer",issuedAt:"2026-10-18T11:40:00.000Z"};
const provenanceBytes=Buffer.from(JSON.stringify({...manifest,signature:{algorithm:"Ed25519",
 publicKeyPem:roles.provenance.publicKeyPem,signerFingerprint:roles.provenance.fingerprint,
 signatureBase64:roles.provenance.signature(RELEASE_PROVENANCE_DOMAIN+canonicalJson(manifest))}}));
const otSubject={...partial,provenanceAssetId:505,provenanceDigest:"sha256:"+hash(provenanceBytes)};
const subject={...otSubject,schema:"agentproof.release.subject.v1",provider:"github",prerelease:true,makeLatest:false};
// Freeze synthetic evidence time so this archived check stays reproducible after
// the production provenance policy's 31-day freshness window has elapsed.
const f=await recoveryFixture({subject,roles,ageMs:2*24*60*60*1000});
const common={...f.env,RECOVERY_REQUIRED:"true",RECOVERY_RUN_ID:f.record.runId,
 RECOVERY_HANDOFF_PUBLIC_KEY_PEM:f.env.HANDOFF_PUBLIC_KEY_PEM,RECOVERY_HANDOFF_FINGERPRINT:f.env.HANDOFF_FINGERPRINT};
const a={...common,ROLE:"approval",SIGNING_PUBLIC_KEY_PEM:roles.authority.publicKeyPem,
 SIGNING_PRIVATE_KEY_PEM:roles.authority.keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),
 SIGNER_FINGERPRINT:roles.authority.fingerprint,RECEIPT_FINGERPRINT:roles.receiptSigner.fingerprint};
const s={...common,ROLE:"signing",SIGNING_PUBLIC_KEY_PEM:roles.receiptSigner.publicKeyPem,
 SIGNING_PRIVATE_KEY_PEM:roles.receiptSigner.keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),
 SIGNER_FINGERPRINT:roles.receiptSigner.fingerprint,AUTHORITY_FINGERPRINT:roles.authority.fingerprint,
 AUTHORITY_PUBLIC_KEY_PEM:roles.authority.publicKeyPem};
const ot={...f.env,TARGET_SUBJECT_JSON:JSON.stringify(otSubject),SIGNER_FINGERPRINT:roles.opstruth.fingerprint,
 SIGNING_PUBLIC_KEY_PEM:roles.opstruth.publicKeyPem,
 SIGNING_PRIVATE_KEY_PEM:roles.opstruth.keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),
 TRUSTED_AGENTPROOF_APPROVAL_FINGERPRINT:roles.authority.fingerprint,
 TRUSTED_AGENTPROOF_SIGNER_FINGERPRINT:roles.receiptSigner.fingerprint,
 TRUSTED_PROVENANCE_SIGNER_FINGERPRINT:roles.provenance.fingerprint,
 TRUSTED_DONESTATE_HANDOFF_FINGERPRINT:f.env.HANDOFF_FINGERPRINT};
function store(initial={}){const data=new Map(Object.entries(initial));return {kv:{get:k=>structuredClone(data.get(k)),
 put:(k,v)=>data.set(k,structuredClone(v))},transactionSync:fn=>fn()};}
const {approval,...seed}=f.request;
const original={state:"verified",seed,approval,reservation:f.record.recoveryReservation,
 recoveryAuthorisation:f.record.recoveryAuthorisation,recoveryPolicy:{runId:f.record.runId,fingerprint:f.env.HANDOFF_FINGERPRINT},
 before:f.completion.before,after:f.completion.after,attemptedAt:f.completion.attemptedAt,
 verifiedAt:f.completion.verifiedAt,completion:f.completion,publicationResponse:f.publicationResponse};
const aStorage=store({release:original}),sStorage=store();
const ns=(storage,env,Class)=>({idFromName:name=>name,get:name=>{
 assert.equal(name,subject.repositoryId+":"+subject.releaseId);
 return {fetch:request=>new Class({storage},env).fetch(request)};}});
a.RELEASE_LEDGER=ns(aStorage,a,ReleaseFence);s.RECEIPT_LEDGER=ns(sStorage,s,ReleaseReceiptLedger);
f.handlers.observe=input=>recoveryRpc(a,"observe",input);f.handlers.sign=input=>recoveryRpc(s,"sign",input);
f.handlers.verify=input=>evaluateRecovery(input,ot,f.now);
const actualFetch=globalThis.fetch,ActualDate=globalThis.Date,calls=[];let outage=true;
globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[f.now]));}static now(){return f.now;}};
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);assert.equal(init.method,"GET");assert.equal(init.headers.authorization,undefined);
 calls.push({host:url.hostname,path:url.pathname,reader:init.headers["user-agent"]});
 if(outage){outage=false;return new Response("unavailable",{status:429,headers:{"retry-after":"60","x-ratelimit-remaining":"0"}});}
 if(url.hostname==="github.com")return new Response(url.pathname.endsWith("/provenance.json")?provenanceBytes:packageBytes);
 assert.equal(url.hostname,"api.github.com");
 let body;
 if(url.pathname.endsWith("/git/ref/tags/"+subject.tagName))body={ref:"refs/tags/"+subject.tagName,object:{type:"commit",sha:subject.tagCommit}};
 else if(url.pathname.endsWith("/releases/"+subject.releaseId))body={id:subject.releaseId,tag_name:subject.tagName,
  draft:false,prerelease:true,published_at:f.completion.after.publishedAt,assets:[
   {id:subject.packageAssetId,name:subject.packageAssetName,state:"uploaded",digest:subject.packageDigest,
    browser_download_url:"https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+subject.tagName+"/"+subject.packageAssetName},
   {id:subject.provenanceAssetId,name:"provenance.json",state:"uploaded",digest:subject.provenanceDigest,
    browser_download_url:"https://github.com/AyobamiH/agentproof-release-canary/releases/download/"+subject.tagName+"/provenance.json"}]};
 else body={id:subject.repositoryId,name:subject.repository,private:false,owner:{id:subject.ownerId,login:subject.owner}};
 return Response.json(body);
};
try{
 await f.recovery.arm();await f.recovery.alarm();
 let state=f.storage.kv.get("run");
 assert.equal(state.readbackRecovery.lastError.reasonCode,"public_readback_unavailable");
 const outageReason=state.readbackRecovery.lastError.reasonCode;
 for(let i=0;i<5&&!["VERIFIED","BLOCKED"].includes(state.readbackRecovery.state)&&state.status!=="VERIFIED";i++){
  f.now=Date.parse(state.readbackRecovery.nextWakeAt)+1;
  await f.restart().alarm();state=f.storage.kv.get("run");
 }
 assert.equal(state.status,"VERIFIED",JSON.stringify(state.readbackRecovery.lastError));
 assert.equal(state.readbackRecovery.state,"COMPLETED");
 assert.deepEqual(aStorage.kv.get("release"),original);
 assert.equal(state.receipt.payload.attemptedAt,f.completion.attemptedAt);
 assert.equal(state.receipt.payload.verifiedAt,f.completion.verifiedAt);
 assert.deepEqual(state.audit.slice(0,f.record.audit.length),f.record.audit);
 const finalDigest=digest(state),before=calls.length;f.now+=1000;await f.restart().alarm();
 assert.equal(calls.length,before);assert.equal(digest(f.storage.kv.get("run")),finalDigest);
 const sourceHashes={};
 for(const [name,base,path] of [["agentproof",apRoot,"services/release-provider/src/readback-recovery.mjs"],
  ["opstruth",otRoot,"services/release-verifier/src/worker.mjs"]])
  sourceHashes[name]=hash(await readFile(resolve(base,path)));
 console.log(JSON.stringify({schema:"release-recovery-cross-service-fixture.v1",fixtureOnly:true,
  observedAt:new ActualDate().toISOString(),fixtureClock:new ActualDate(f.now).toISOString(),
  outcome:state.status,outageReason,reconstructedBetweenStages:true,
  completionPreserved:true,additionalPublicationRequests:0,providerGetCount:calls.length,
  alarmAttempts:state.readbackRecovery.attempts,terminalDuplicateNoOp:true,sourceHashes},null,2));
}finally{globalThis.fetch=actualFetch;globalThis.Date=ActualDate;}
