import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDispatcher,validateTask,MAX_TOTAL_AGENTS,MAX_CHILD_AGENTS,prioritizeTasks} from './dispatcher.mjs';
const ISSUE='https://github.com/darkmatter2222/Rustwake/issues/1';
const task=(id,role)=>({id,role,issue_url:ISSUE,prompt:'Deliver bounded work for the linked GitHub Issue',write_paths:['work/'+id]});
async function fixture(t,{failVerify=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rw-dispatch-'));
 const infos=new Map(); let calls=0,failPrompt=false;
 const ctx={session:{
  get:async({sessionID})=>infos.get(sessionID)??(['parent','replacement'].includes(sessionID)?{model:{id:'test',providerID:'local'}}:undefined),
  create:async input=>{const id='child'+(++calls);infos.set(id,{id,time:{}});return {id};},
  prompt:async()=>{if(failPrompt)throw Error('provider unavailable');return {};},
  synthetic:async()=>{},
  interrupt:async({sessionID})=>{infos.set(sessionID,{outcome:'interrupted',time:{idle:Date.now()}});}
 }};
 const d=createDispatcher(ctx,root,{verifyIssue:async()=>{if(failVerify)throw Error('GitHub auth unavailable');return {url:ISSUE,state:'OPEN'};}});
 t.after(async()=>{d.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,ctx,d,infos,calls:()=>calls,fail:()=>{failPrompt=true;}};
}
async function enqueue(f,tasks){
 const file=path.join(f.root,'.rustwake-runtime/dispatch-queue.json');
 const q=JSON.parse(await fs.readFile(file,'utf8'));q.tasks=tasks;await fs.writeFile(file,JSON.stringify(q));
}
test('fresh start performs no local audit launches; coordinator queues real GitHub Issues',async t=>{
 const f=await fixture(t);await f.d.start('parent');
 assert.equal(f.calls(),0);const s=await f.d.status();assert.equal(s.enabled,true);
 assert.equal(s.workers.length,0);
});
test('five agents total means one coordinator and at most FOUR children',async t=>{
 const f=await fixture(t);await f.d.start('parent');
 assert.equal(MAX_TOTAL_AGENTS,5);assert.equal(MAX_CHILD_AGENTS,4);
 await enqueue(f,[task('product','product-owner'),task('review','reviewer'),task('play','player'),task('ux','ui-ux'),task('release','release-engineer')]);
 await f.d.tick();await f.d.tick();assert.equal(f.calls(),4);
 assert.equal((await f.d.status()).workers.filter(w=>!['succeeded','failed','interrupted'].includes(w.status)).length,4);
 const first=(await f.d.status()).workers[0];f.infos.set(first.session_id,{outcome:'succeeded',time:{idle:Date.now()}});
 await f.d.tick();assert.equal(f.calls(),5);
 assert.equal((await f.d.status()).workers.filter(w=>!['succeeded','failed','interrupted'].includes(w.status)).length,4);
});
test('dispatch rejects missing or cross-repository Issue and unsafe path',()=>{
 assert.throws(()=>validateTask({id:'x',role:'reviewer',prompt:'x',write_paths:['work/x']}),/GitHub Issue URL/);
 assert.throws(()=>validateTask({...task('x','reviewer'),issue_url:'https://github.com/elsewhere/repo/issues/2'}),/GitHub Issue URL/);
 for(const p of ['../x','/etc','src/*','src\\\\x'])assert.throws(()=>validateTask({...task('x','reviewer'),write_paths:[p]}),/write path prefixes/);
});
test('GitHub verification failure leaves worker undispatched',async t=>{
 const f=await fixture(t,{failVerify:true});await f.d.start('parent');await enqueue(f,[task('p','product-owner')]);
 await f.d.tick();assert.equal(f.calls(),0);assert.match((await f.d.status()).error,/GitHub auth unavailable/);
});
test('uncertain prompt failures reserve the slot rather than duplicate it',async t=>{
 const f=await fixture(t);await f.d.start('parent');await enqueue(f,[task('p','product-owner')]);f.fail();await f.d.tick();
 assert.equal(f.calls(),1);assert.match((await f.d.status()).error,/provider unavailable/);
 await f.d.tick();assert.equal(f.calls(),1);assert.match((await f.d.status()).error,/uncertain/);
});
test('stop interrupts known workers and blocks dispatch',async t=>{
 const f=await fixture(t);await f.d.start('parent');await enqueue(f,[task('p','product-owner')]);await f.d.tick();
 await f.d.stop();assert.equal((await f.d.status()).enabled,false);assert.equal(f.infos.get('child1').outcome,'interrupted');
 await f.d.tick();assert.equal(f.calls(),1);
});
test('fresh restart archives old state and preserves dirty work',async t=>{
 const f=await fixture(t);await f.d.start('parent');await enqueue(f,[task('p','product-owner')]);await f.d.tick();
 await fs.writeFile(path.join(f.root,'unfinished.txt'),'valuable edits');
 await f.d.start('replacement');const s=await f.d.status();
 assert.equal(s.enabled,true);assert.equal(s.workers.length,0);assert.equal(f.infos.get('child1').outcome,'interrupted');
 assert.equal(await fs.readFile(path.join(f.root,'unfinished.txt'),'utf8'),'valuable edits');
 const archived=JSON.parse(await fs.readFile(path.join(f.root,'.rustwake-runtime/archive',s.epoch,'previous-team.json')));
 assert.equal(archived.dispatcher.workers.length,1);
});
test('release tasks are ranked ahead of developers but do not mutate queue',()=>{
 const tasks=[task('dev','developer'),task('qa','reviewer'),task('rel','release-engineer')];
 assert.equal(prioritizeTasks(tasks)[0].role,'release-engineer');assert.equal(tasks[0].role,'developer');
});


import {assertDispatchableIssue} from './dispatcher.mjs';
test('live GitHub labels veto dispatch even when an issue is open',()=>{for(const label of ['status:blocked','status:deferred','status:superseded'])assert.throws(()=>assertDispatchableIssue({state:'OPEN',labels:[{name:label}]}));assert.throws(()=>assertDispatchableIssue({state:'OPEN'}));assert.doesNotThrow(()=>assertDispatchableIssue({labels:[{name:'status:ready'}]}));});

test('dispatch readiness is explicit and role-aware',()=>{assert.throws(()=>assertDispatchableIssue({labels:[]},'developer'));assert.throws(()=>assertDispatchableIssue({labels:[{name:'status:triage'}]},'developer'));assert.doesNotThrow(()=>assertDispatchableIssue({labels:[{name:'status:triage'}]},'product-owner'));assert.doesNotThrow(()=>assertDispatchableIssue({labels:[{name:'status:review'}]},'reviewer'));assert.throws(()=>assertDispatchableIssue({labels:[{name:'status:review'}]},'developer'));assert.doesNotThrow(()=>assertDispatchableIssue({labels:[{name:'status:accepted'}]},'release-engineer'));});
