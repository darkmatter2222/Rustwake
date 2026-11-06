import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {formatTeamStatus,sponsorState} from './telemetry.mjs';import {createSidebarPoll} from './sidebar-poll.mjs';import {setup} from './supervisor.mjs';
const now=Date.parse('2026-11-05T23:00:00Z');
test('failed start does not bind guard to an abandoned command session',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'team-start-'));let command;
 const reg=()=>({dispose:async()=>{}});
 const ctx={location:{directory:root},options:{},command:{transform:async fn=>{fn({add:c=>command=c});return reg();}},session:{get:async()=>({location:{directory:root}}),synthetic:async()=>{},hook:async()=>reg()},tool:{hook:async()=>reg()}};
 const cleanup=await setup(ctx);
 try{
  await assert.rejects(command.execute({sessionID:'abandoned',prompt:{text:'start'}}),/API unavailable/);
  const diagnostic=JSON.parse(await fs.readFile(path.join(root,'.rustwake-runtime/last-command-error.json'),'utf8'));
  assert.equal(diagnostic.phase,'start-dispatcher');
  await command.execute({sessionID:'replacement',prompt:{text:'bind'}});
 }finally{await cleanup();await fs.rm(root,{recursive:true,force:true});}
});
const data=()=>({bound_session:'parent',stopping:false,guarded_wait_tools:[],sponsor_inbox:'empty',board_updated_at:new Date(now).toISOString(),observation:{coordinator_session_id:'parent',observed_at:new Date(now).toISOString(),capacity_children:3,active_children:2,workers:[{role:'developer',task_id:'ART-001',status:'running'}],runnable_task_ids:['QA-002'],idle_reasons:['ready review']}});
test('five observed workers display six model sessions',()=>{const s=data();s.observation.capacity_children=5;s.observation.active_children=5;assert.match(formatTeamStatus(s,'parent',now),/Model sessions: 6\/6/);});
test('startup failure remains visible when dispatcher is off',()=>{const s=data();s.dispatcher={enabled:false,error:'Cannot reconcile child'};assert.match(formatTeamStatus(s,'parent',now),/START BLOCKED: Cannot reconcile child/);});
test('bound status distinguishes capacity, workers and guard',()=>{const t=formatTeamStatus(data(),'parent',now);for(const v of ['BOUND · this session','Workers: 2/3','Model sessions: 3/4','ART-001','not configured','Sponsor inbox: empty'])assert.ok(t.includes(v));});
test('stale, future and unscoped observations cannot claim active workers',()=>{for(const change of [{observed_at:'2026-11-05T22:00:00Z'},{observed_at:'2026-11-06T00:00:00Z'},{coordinator_session_id:null}]){const s=data();Object.assign(s.observation,change);assert.match(formatTeamStatus(s,'parent',now),/Workers: unknown/);}assert.match(formatTeamStatus({...data(),stopping:true},'parent',now),/Workers: unknown/);});
test('session isolation and missing observations',()=>{assert.match(formatTeamStatus(data(),'other',now),/another session/);assert.ok(!formatTeamStatus(data(),'other',now).includes('ART-001'));assert.match(formatTeamStatus({...data(),observation:null},'parent',now),/Observation: missing/);});
test('empty template is not pending sponsor input',()=>{assert.equal(sponsorState('Instructions\n<!-- WRITE BELOW THIS LINE -->\n'),'empty');assert.equal(sponsorState('<!-- WRITE BELOW THIS LINE -->\nImprove art'),'pending input');assert.equal(sponsorState(null),'unavailable');});
test('poll deduplicates and ignores old-session responses',async()=>{const resolvers={},writes=[];let calls=0;const p=createSidebarPoll({read:s=>{calls++;return new Promise(r=>resolvers[s]=r);},write:(...a)=>writes.push(a)});const a=p.refresh('a');await p.refresh('a');assert.equal(calls,1);const b=p.refresh('b');resolvers.b({text:'B'});await b;resolvers.a({text:'A'});await a;assert.deepEqual(writes.at(-1),['b','B']);p.close();await p.refresh('c');assert.equal(calls,2);});
test('poll reports RPC failure and recovers',async()=>{let fail=true;const writes=[];const p=createSidebarPoll({read:async()=>{if(fail)throw Error();return {text:'recovered'};},write:(s,t)=>writes.push(t)});await p.refresh('a');assert.match(writes.at(-1),/unavailable/);fail=false;await p.refresh('a');assert.equal(writes.at(-1),'recovered');p.close();});
test('RPC reflects bind/stop, isolates workspaces and cleans up',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'team-rpc-'));let handler,command,disposed=0;const reg=()=>({dispose:async()=>disposed++});const ctx={location:{directory:root},options:{},rpc:{register:async(def,h)=>{handler=h;return reg();}},command:{transform:async fn=>{fn({add:c=>command=c});return reg();}},session:{get:async({sessionID})=>({location:{directory:sessionID==='alien'?os.tmpdir():root}}),synthetic:async()=>{},hook:async()=>reg()},tool:{hook:async()=>reg()}};try{const cleanup=await setup(ctx,{});assert.match((await handler.read({sessionID:'parent'})).text,/NOT BOUND/);await command.execute({sessionID:'parent',prompt:{text:'bind'}});assert.match((await handler.read({sessionID:'parent'})).text,/BOUND · this session/);await assert.rejects(handler.read({sessionID:'alien'}),/Different workspace/);await command.execute({sessionID:'parent',prompt:{text:'stop'}});assert.match((await handler.read({sessionID:'parent'})).text,/STOPPED/);await cleanup();assert.equal(disposed,4);}finally{await fs.rm(root,{recursive:true,force:true});}});


