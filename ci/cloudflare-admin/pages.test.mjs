import test from 'node:test';
import assert from 'node:assert/strict';
import {subject,validateSha,validateBranch,validateCapacity,scope} from './contracts.mjs';
test('fixed repositories only',()=>assert.throws(()=>subject('other/repo','1')));
test('wrong numeric repository identity refused',()=>assert.throws(()=>subject('AyobamiH/donestate','1')));
test('full commit required',()=>assert.throws(()=>validateSha('main')));
test('ambiguous branch refused',()=>assert.throws(()=>validateBranch('../main')));
test('capacity must be current',()=>assert.throws(()=>validateCapacity({})));
test('source defaults disable every trigger',()=>assert.deepEqual(scope(),{production_deployments_enabled:false,preview_deployment_setting:'none',preview_branch_includes:[],preview_branch_excludes:[]}));
