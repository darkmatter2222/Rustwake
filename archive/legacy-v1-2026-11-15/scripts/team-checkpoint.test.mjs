import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpoint} from './team-checkpoint.mjs';
const now='2026-11-05T23:00:00Z';
const board={max_active_sessions:4,tickets:[],updated_at:now};
test('stale observations cannot make guard claim runnable spare capacity',()=>assert.throws(()=>checkpoint(board,{source:'host-api',observed_at:'2026-11-05T22:00:00Z',sessions:[]},now),/stale/));
test('fresh host observation produces explicit no-work reason',()=>{const r=checkpoint(board,{source:'host-api',observed_at:now,sessions:[]},now);assert.equal(r.observation.available_child_slots,3);assert.deepEqual(r.observation.runnable_task_ids,[]);assert.ok(r.observation.idle_reasons.length);});
test('missing assignment identity cannot be used as a runtime observation',()=>assert.throws(()=>checkpoint(board,{source:'host-api',observed_at:now,sessions:[{session_id:'one'}]},now),/Incomplete/));


test('checkpoint carries scoped worker rows without local paths or session IDs',()=>{const r=checkpoint(board,{source:'host-api',coordinator_session_id:'parent',observed_at:now,sessions:[{session_id:'child-private',task_id:'ART-001',role:'developer',status:'running',generation:1,write_paths:['private/path']}]},now);assert.equal(r.observation.coordinator_session_id,'parent');assert.equal(r.observation.active_children,1);assert.equal(r.observation.capacity_children,3);assert.deepEqual(r.observation.workers,[{task_id:'ART-001',role:'developer',status:'running'}]);assert.ok(!JSON.stringify(r.observation).includes('child-private'));});
