import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpoint} from './team-checkpoint.mjs';
const now='2026-11-05T23:00:00Z';
const board={max_active_sessions:4,tickets:[],updated_at:now};
test('stale observations cannot make guard claim runnable spare capacity',()=>assert.throws(()=>checkpoint(board,{source:'host-api',observed_at:'2026-11-05T22:00:00Z',sessions:[]},now),/stale/));
test('fresh host observation produces explicit no-work reason',()=>{const r=checkpoint(board,{source:'host-api',observed_at:now,sessions:[]},now);assert.equal(r.observation.available_child_slots,3);assert.deepEqual(r.observation.runnable_task_ids,[]);assert.ok(r.observation.idle_reasons.length);});
test('missing assignment identity cannot be used as a runtime observation',()=>assert.throws(()=>checkpoint(board,{source:'host-api',observed_at:now,sessions:[{session_id:'one'}]},now),/Incomplete/));
