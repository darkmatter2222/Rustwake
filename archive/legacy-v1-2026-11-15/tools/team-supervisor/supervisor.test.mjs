import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldBlockWait} from './supervisor.mjs';
const now=Date.parse('2026-11-05T23:00:00Z');
const sample=()=>({tool:'verified_wait',waitTools:['verified_wait'],now,stopping:false,observation:{observed_at:new Date(now).toISOString(),available_child_slots:2,runnable_task_ids:['ART-002']}});
test('reject mapped blocking wait with fresh useful spare capacity',()=>assert.equal(shouldBlockWait(sample()),true));
test('stop, stale observations and unrelated tools never trap coordinator',()=>{for(const change of [{stopping:true},{tool:'cancel'},{observation:null},{observation:{...sample().observation,observed_at:'2026-11-05T20:00:00Z'}}])assert.equal(shouldBlockWait({...sample(),...change}),false);});
test('full or legitimately idle team can wait',()=>{for(const o of [{available_child_slots:0},{runnable_task_ids:[]}])assert.equal(shouldBlockWait({...sample(),observation:{...sample().observation,...o}}),false);});
