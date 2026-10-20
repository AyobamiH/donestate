// Local-only runtime acceptance: synthetic signing keys, persisted SQLite DO state,
// real workerd alarms and private RPC bindings. No provider or production request.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { recoveryFixture } from "./readback-fixtures.mjs";

const fixture = await recoveryFixture();
fixture.now = Date.now()-91000;
await fixture.recovery.arm();
const interrupted = fixture.recovery.claim(fixture.now);
assert.equal(interrupted.readbackRecovery.state,"RUNNING");
const bundle = await build({stdin:{resolveDir:dirname(fileURLToPath(import.meta.url)),sourcefile:"runtime-fixture.mjs",
  contents:`import worker,{ReleaseRun as ProductionRun,recoveryControl,scheduled} from "../src/worker.mjs";
    export {ReleaseRecovery} from "../src/entrypoints.mjs";
    export class ReleaseRun extends ProductionRun {
      constructor(ctx,env) {
        super(ctx,env);
        if (env.TEST_SEED_ENABLED && !ctx.storage.kv.get("run")) ctx.storage.kv.put("run",env.TEST_RECORD);
      }
    }
    export default {async fetch(request,env) {
      const path=new URL(request.url).pathname;
      if(path==="/__test/seed") return Response.json(await recoveryControl(env,"status"));
      if(path==="/__test/arm") return Response.json(await scheduled({},env));
      return worker.fetch(request,env);
    }};`},bundle:true,format:"esm",platform:"browser",target:"es2022",write:false,
  conditions:["workerd","worker","browser"],external:["cloudflare:workers","node:*"]});
const packet = {state:"verified",request:fixture.request,completion:fixture.completion,
  observation:fixture.readback(Date.now()),publicationResponse:fixture.publicationResponse};
const receipt = fixture.receipt(Date.now());
const decision = {state:"VERIFIED",signed:true,report:fixture.report(receipt,Date.now())};
const bindings = Object.fromEntries(Object.entries(fixture.env).filter(([,value]) => typeof value === "string"));
const persist = await mkdtemp(join(tmpdir(),"donestate-readback-workerd-"));
let runtime;
function options(seed) {
  const common = {modules:true,compatibilityDate:"2026-10-18",compatibilityFlags:["nodejs_compat"]};
  return convertV4MiniflareOptions({resourcePersistencePath:persist,workers:[
    {name:"caller",...common,serviceBindings:{DS:{name:"donestate",entrypoint:"ReleaseRecovery"}},
      script:`export default {async fetch(_request,env){return Response.json(await env.DS.status());}};`},
    {name:"donestate",...common,script:bundle.outputFiles[0].text,
      durableObjects:{RUNS:{className:"ReleaseRun",useSQLite:true}},
      bindings:{...bindings,TEST_SEED_ENABLED:seed,TEST_RECORD:seed ? interrupted : null},
      serviceBindings:{AGENTPROOF_READBACK:{name:"approval",entrypoint:"ReleaseRecovery"},
        AGENTPROOF_RECEIPTS:{name:"receipt",entrypoint:"ReleaseRecovery"},
        OPSTRUTH_RELEASE:{name:"opstruth",entrypoint:"ReleaseRecovery"}}},
    {name:"approval",...common,bindings:{PACKET:packet},script:`import {WorkerEntrypoint} from "cloudflare:workers";
      export class ReleaseRecovery extends WorkerEntrypoint {async observe(){return this.env.PACKET;}}
      export default {fetch(){return new Response(null,{status:404});}};`},
    {name:"receipt",...common,bindings:{RECEIPT:receipt},script:`import {WorkerEntrypoint} from "cloudflare:workers";
      export class ReleaseRecovery extends WorkerEntrypoint {async sign(){return {state:"signed",receipt:this.env.RECEIPT};}}
      export default {fetch(){return new Response(null,{status:404});}};`},
    {name:"opstruth",...common,bindings:{DECISION:decision},script:`import {WorkerEntrypoint} from "cloudflare:workers";
      export class ReleaseRecovery extends WorkerEntrypoint {async verify(){return this.env.DECISION;}}
      export default {fetch(){return new Response(null,{status:404});}};`},
  ]});
}
try {
  runtime = new Miniflare(options(true));
  let worker = await runtime.getWorker("donestate");
  const seeded = await (await worker.fetch("http://donestate/__test/seed")).json();
  console.log(JSON.stringify({checkpoint:"sqlite_seeded",state:seeded.readbackRecovery?.state}));
  assert.equal(seeded.readbackRecovery.stage,"OBSERVE");
  assert.equal(seeded.readbackRecovery.attempts,1);
  // Restart the complete worker process; the second worker cannot seed a record.
  await runtime.dispose();runtime = new Miniflare(options(false));
  worker = await runtime.getWorker("donestate");
  const resumed = await (await worker.fetch("http://donestate/__test/arm")).json();
  console.log(JSON.stringify({checkpoint:"sqlite_reopened",state:resumed.readbackRecovery?.state}));
  assert.equal(resumed.runId,fixture.record.runId);
  let terminal;
  const deadline = Date.now()+15000;
  do {
    terminal = await (await runtime.dispatchFetch("http://caller/")).json();
    if (terminal.readbackRecovery?.state === "COMPLETED") break;
    assert.notEqual(terminal.readbackRecovery?.state,"BLOCKED",JSON.stringify(terminal.readbackRecovery?.lastError));
    await new Promise(resolve => setTimeout(resolve,100));
  } while (Date.now() < deadline);
  assert.equal(terminal.status,"VERIFIED");assert.equal(terminal.readbackRecovery.state,"COMPLETED");
  assert.equal(terminal.readbackRecovery.attempts,4);
  assert.equal(terminal.readbackRecovery.nextWakeAt,null);
  assert.deepEqual(terminal.recoveryAuthorisation,fixture.record.recoveryAuthorisation);
  assert.deepEqual(terminal.readbackRecovery.execution.completion,fixture.completion);
  assert.equal(terminal.receipt.payload.attemptedAt,fixture.completion.attemptedAt);
  assert.equal(terminal.receipt.payload.verifiedAt,fixture.completion.verifiedAt);
  assert.deepEqual(await (await worker.fetch("http://donestate/__test/arm")).json(),terminal);
  const denial = await worker.fetch("http://donestate/internal/readback-recovery-status",{method:"POST",body:"{}"});
  assert.equal(denial.status,404);
  console.log(JSON.stringify({runtime:"workerd",persistedSQLiteRestart:true,nativeAlarmStages:3,
    namedBindings:true,status:terminal.status,originalCompletionPreserved:true,
    publicRecoveryRouteStatus:denial.status,publicationRequests:0}));
} finally {
  await runtime?.dispose();await rm(persist,{recursive:true,force:true});
}
