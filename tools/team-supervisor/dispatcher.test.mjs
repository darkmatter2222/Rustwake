import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDispatcher,validateTask,MAX_TOTAL_AGENTS,MAX_CHILD_AGENTS,prioritizeTasks} from './dispatcher.mjs';
const ISSUE='https://github.com/darkmatter2222/Rustwake/issues/1';
const task=(id,role)=>({id,role,issue_url:ISSUE,prompt:'Deliver bounded work for the linked GitHub Issue',write_paths:['work/'+id]});
async function fixture(t,{failVerify=false,requestTimeoutMs=30000,now=Date.now}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rw-dispatch-'));
 const infos=new Map(); let calls=0,failPrompt=false;
 const ctx={session:{
  get:async({sessionID})=>infos.get(sessionID)??(['parent','replacement'].includes(sessionID)?{model:{id:'test',providerID:'local'}}:undefined),
  create:async input=>{const id='child'+(++calls);infos.set(id,{id,time:{}});return {id};},
  prompt:async()=>{if(failPrompt)throw Error('provider unavailable');return {};},
  synthetic:async()=>{},
  interrupt:async({sessionID})=>{infos.set(sessionID,{outcome:'interrupted',time:{idle:Date.now()}});}
 }};
 const d=createDispatcher(ctx,root,{requestTimeoutMs,now,verifyIssue:async()=>{if(failVerify)throw Error('GitHub auth unavailable');return {url:ISSUE,state:'OPEN'};}});
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


test('completion wakes quiet wait once, duplicate events do not resume coordinator',async t=>{
 const f=await fixture(t);let wakes=0;f.ctx.session.synthetic=async()=>{wakes++;};
 await f.d.start('parent');await enqueue(f,[task('qa','reviewer')]);await f.d.tick();
 const rev=(await f.d.status()).revision;const waiting=f.d.waitForChange(rev,null,1000);
 await f.d.event({type:'session.execution.succeeded',data:{sessionID:'child1'}});
 assert.equal((await waiting).reason,'changed');await f.d.tick();assert.equal(wakes,0);
 await f.d.event({type:'session.execution.succeeded',data:{sessionID:'child1'}});await f.d.tick();assert.equal(wakes,0);
});
test('missing completion events are recovered by host outcome without duplicate notification',async t=>{
 const f=await fixture(t);let wakes=0;f.ctx.session.synthetic=async()=>{wakes++;};await f.d.start('parent');await enqueue(f,[task('qa','reviewer')]);await f.d.tick();
 f.infos.set('child1',{outcome:'succeeded',time:{idle:Date.now()}});await f.d.tick();await f.d.tick();assert.equal(wakes,1);
});
test('unmanaged child event reserves capacity and blocks new work; unrelated session is ignored',async t=>{
 const f=await fixture(t);await f.d.start('parent');f.infos.set('outside',{parentID:'other'});await f.d.event({type:'session.execution.started',data:{sessionID:'outside'}});assert.equal((await f.d.status()).workers.length,0);
 f.infos.set('manual',{parentID:'parent',agent:'rustwake-reviewer',time:{}});await f.d.event({type:'session.execution.started',data:{sessionID:'manual'}});await enqueue(f,[task('qa','reviewer')]);await f.d.tick();assert.equal(f.calls(),0);assert.match((await f.d.status()).error,/Unmanaged/);assert.equal((await f.d.status()).workers[0].session_id,'manual');
});
test('hanging host read times out, retains lease and does not pile up requests',async t=>{
 const f=await fixture(t,{requestTimeoutMs:10});await f.d.start('parent');await enqueue(f,[task('qa','reviewer')]);await f.d.tick();let reads=0;const original=f.ctx.session.get;let release;
 f.ctx.session.get=async input=>input.sessionID==='child1'?(reads++,await new Promise(r=>release=r)):original(input);
 await f.d.tick();assert.match((await f.d.status()).error,/timed out/);await f.d.tick();assert.equal(reads,1);assert.equal(f.calls(),1);assert.equal((await f.d.status()).workers.length,1);release({time:{}});
});
test('quiet waiting honours cancellation and stop without model polling',async t=>{
 const f=await fixture(t);await f.d.start('parent');let revision=(await f.d.status()).revision;const controller=new AbortController();const waiting=f.d.waitForChange(revision,controller.signal,1000);controller.abort();assert.equal((await waiting).reason,'cancelled');const stopping=f.d.waitForChange(revision,null,1000);await f.d.stop();assert.equal((await stopping).reason,'changed');
});
test('stalled starts alert once and retain slots; CPU and files are not evidence',async t=>{
 let clock=Date.now();const f=await fixture(t,{now:()=>clock});let wakes=0;f.ctx.session.synthetic=async()=>{wakes++;};await f.d.start('parent');await enqueue(f,[task('qa','reviewer')]);await f.d.tick();clock+=121000;await f.d.tick();assert.match((await f.d.status()).workers[0].health,/start unconfirmed/);await f.d.tick();assert.equal(wakes,1);assert.equal(f.calls(),1);
});
test('event stream failure is visible and blocks dispatch',async t=>{
 const f=await fixture(t);await f.d.start('parent');f.d.streamFailure(Error('disconnected'));await enqueue(f,[task('qa','reviewer')]);await f.d.tick();assert.equal(f.calls(),0);assert.match((await f.d.status()).event_stream_error,/disconnected/);
});
test('explicit reconciliation detects pre-existing host children, rejects unrelated IDs',async t=>{
 const f=await fixture(t);await f.d.start('parent');f.infos.set('old',{parentID:'parent',time:{}});await f.d.reconcile(['old']);assert.equal((await f.d.status()).workers[0].unmanaged,true);f.infos.set('alien',{parentID:'other'});await assert.rejects(f.d.reconcile(['alien']),/not a child/);
});
test('concurrent persistence serializes snapshots without losing final error',async t=>{
 const f=await fixture(t);await f.d.start('parent');
 await Promise.all(Array.from({length:12},(_,i)=>f.d.recordError('error-'+i)));
 assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'.rustwake-runtime/dispatcher.json'),'utf8')).error,'error-11');
});
test('historical outcome cannot release an unmanaged running child',async t=>{
 const f=await fixture(t);await f.d.start('parent');
 f.infos.set('external',{parentID:'parent',outcome:'succeeded',time:{idle:1}});
 await f.d.reconcile(['external']);assert.equal((await f.d.status()).workers[0].status,'unknown');
 await f.d.event({type:'session.execution.started',created:Date.now(),data:{sessionID:'external'}});
 await f.d.tick();assert.equal((await f.d.status()).workers[0].status,'running');
});
test('transient event lookup failure preserves event handling and fails closed',async t=>{
 const f=await fixture(t);await f.d.start('parent');const get=f.ctx.session.get;
 f.ctx.session.get=async()=>{throw Error('temporary transport failure');};
 await f.d.event({type:'session.execution.started',data:{sessionID:'external'}});
 await f.d.tick();assert.match((await f.d.status()).error,/reconciliation uncertain/);
 assert.equal((await f.d.status()).event_stream_error,null);
 f.ctx.session.get=get;f.infos.set('external',{parentID:'parent'});
 await f.d.event({type:'session.execution.started',data:{sessionID:'external'}});
 await f.d.event({type:'session.execution.succeeded',data:{sessionID:'external'}});
 await f.d.tick();assert.equal((await f.d.status()).workers[0].status,'succeeded');
});
test('successful foreign-session lookup clears prior event uncertainty',async t=>{
 const f=await fixture(t);await f.d.start('parent');const get=f.ctx.session.get;
 f.ctx.session.get=async()=>{throw Error('offline');};
 await f.d.event({type:'session.execution.started',data:{sessionID:'foreign'}});
 f.ctx.session.get=get;f.infos.set('foreign',{parentID:'other'});
 await assert.rejects(f.d.reconcile(['foreign']),/not a child/);
 await f.d.tick();assert.equal((await f.d.status()).error,null);
});
test('out-of-band restart of a completed child reopens an unmanaged lease',async t=>{
 const f=await fixture(t);await f.d.start('parent');await enqueue(f,[task('p','product-owner')]);await f.d.tick();
 await f.d.event({type:'session.execution.succeeded',data:{sessionID:'child1'}});
 const finished=Date.parse((await f.d.status()).workers[0].finished_at);
 await f.d.event({type:'session.execution.started',created:finished-1,data:{sessionID:'child1'}});
 assert.equal((await f.d.status()).workers[0].status,'succeeded');
 await f.d.event({type:'session.execution.started',created:finished+1,data:{sessionID:'child1'}});
 await f.d.tick();const s=await f.d.status();assert.equal(s.workers[0].status,'running');assert.equal(s.workers[0].unmanaged,true);assert.match(s.error,/Unmanaged/);
});
