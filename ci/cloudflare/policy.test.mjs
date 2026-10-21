import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateNativePolicy } from './policy.mjs';
const root = new URL('../../', import.meta.url);
const original = {
 policy: JSON.parse(await readFile(new URL('governance/native-ci-provider-policy.json',root))),
 baseline: JSON.parse(await readFile(new URL('governance/native-ci-before-20261021.json',root))),
 manifestBytes: await readFile(new URL('ci/cloudflare/manifest.json',root)),
 runnerBytes: await readFile(new URL('ci/cloudflare/run.mjs',root)),
};
const fixture=()=>({...original,policy:structuredClone(original.policy),baseline:structuredClone(original.baseline)});
test('native policy validates without claiming live enforcement',()=>assert.equal(validateNativePolicy(fixture()).externalEnforcement,'requires_readback'));
for(const [name,mutate] of [
 ['untrusted app',x=>x.policy.provider.appId=15368],
 ['wrong repository',x=>x.policy.repositoryId=1],
 ['wrong check context',x=>x.policy.requiredChecks[0].context='success'],
 ['untrusted check source',x=>x.policy.requiredChecks[0].integration_id=15368],
 ['weakened freshness',x=>x.policy.desiredRuleset.rules.find(r=>r.type==='required_status_checks').parameters.strict_required_status_checks_policy=false],
 ['new bypass',x=>x.policy.desiredRuleset.bypass_actors.push({actor_id:1,actor_type:'User',bypass_mode:'always'})],
 ['disabled enforcement',x=>x.policy.desiredRuleset.enforcement='disabled'],
 ['lost PR protection',x=>x.policy.desiredRuleset.rules=x.policy.desiredRuleset.rules.filter(r=>r.type!=='pull_request')],
 ['paid Actions enabled',x=>x.policy.cost.allowPaidActions=true],
 ['unbounded preview scope',x=>x.policy.activation.enableAllPreviewBranches=true],
 ['changed test commands',x=>x.manifestBytes=Buffer.from('{}')],
 ['changed runner',x=>x.runnerBytes=Buffer.from('exit(0)')],
 ['platform misrepresentation',x=>x.policy.requiresSeparateMacOS=!x.policy.requiresSeparateMacOS],
])test('reject '+name,()=>{const x=fixture();mutate(x);assert.throws(()=>validateNativePolicy(x));});
