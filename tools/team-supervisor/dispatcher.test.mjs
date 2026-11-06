import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDispatcher,validateTask} from './dispatcher.mjs';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rw-dispatch-'));const infos=new Map();let calls=0,fail=false;
 const ctx={session:{get:async({sessionID})=>sessionID==='parent'?{model:{id:'test',providerID:'local'}}:infos.get(sessionID),create:async input=>{const id='child'+(++calls);infos.set(id,{id,time:{}});return {id};},prompt:async()=>{if(fail)throw Error('provider unavailable');return {};},synthetic:async()=>{},interrupt:async({sessionID})=>{infos.set(sessionID,{outcome:'interrupted',time:{idle:Date.now()}});}}};
 const d=createDispatcher(ctx,root);t.after(async()=>{d.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,ctx,d,infos,calls:()=>calls,fail:()=>fail=true};
}
test('five worker slots admit UI/UX, reject a sixth until completion',async t=>{
 const f=await fixture(t);await f.d.start('parent');assert.equal(f.calls(),4);
 assert.ok((await f.d.status()).workers.some(w=>w.role==='ui-ux'));
 const file=path.join(f.root,'.rustwake-runtime/dispatch-queue.json');const q=JSON.parse(await fs.readFile(file));
 q.tasks.push({id:'next',role:'developer',prompt:'Implement scoped change',write_paths:['src/new']}, {id:'overflow',role:'developer',prompt:'Next change',write_paths:['src/other']});await fs.writeFile(file,JSON.stringify(q));
 await f.d.tick();assert.equal(f.calls(),5);await f.d.tick();assert.equal(f.calls(),5);
 f.infos.set('child1',{outcome:'succeeded',time:{idle:Date.now()}});await f.d.tick();assert.equal(f.calls(),6);
 assert.equal((await f.d.status()).workers.filter(w=>w.status==='queued').length,5);
});
test('restart adopts recorded sessions without duplicate launches',async t=>{
 const f=await fixture(t);await f.d.start('parent');f.d.close();const next=createDispatcher(f.ctx,f.root);t.after(()=>next.close());
 await next.start('parent');assert.equal(f.calls(),4);
 await assert.rejects(next.start('different'),/Previous coordinator/);
});
test('uncertain prompt failure remains visible and reserves its slot',async t=>{
 const f=await fixture(t);f.fail();await f.d.start('parent');assert.equal(f.calls(),1);assert.match((await f.d.status()).error,/provider unavailable/);
 await f.d.tick();assert.equal(f.calls(),1);assert.match((await f.d.status()).error,/uncertain/);
});
test('stop interrupts known workers and stops dispatch',async t=>{
 const f=await fixture(t);await f.d.start('parent');await f.d.stop();await f.d.tick();assert.equal(f.calls(),4);assert.equal((await f.d.status()).enabled,false);
 assert.equal(f.infos.get('child1').outcome,'interrupted');
});
test('execution status requires a host event',async t=>{
 const f=await fixture(t);await f.d.start('parent');assert.equal((await f.d.status()).workers[0].status,'queued');
 f.d.event({type:'session.execution.started',data:{sessionID:'child1'}});assert.equal((await f.d.status()).workers[0].status,'running');
});
test('unsafe/ambiguous write paths rejected',()=>{
 for(const p of ['../x','/etc','src/*','src\\x'])assert.throws(()=>validateTask({id:'x',role:'developer',prompt:'x',write_paths:[p]}));
});
test('queued release drains conflicting workers instead of filling a spare slot with new work',async t=>{
 const f=await fixture(t);await f.d.start('parent');
 const file=path.join(f.root,'.rustwake-runtime/dispatch-queue.json');const q=JSON.parse(await fs.readFile(file));
 q.tasks.push({id:'new-dev',role:'developer',prompt:'new work',write_paths:['src/new']},
  {id:'release',role:'release-engineer',prompt:'publish accepted work',write_paths:['work/product/dispatch-startup']});
 await fs.writeFile(file,JSON.stringify(q));
 const workers=(await f.d.status()).workers;
 f.infos.set(workers.find(w=>w.id==='startup-review').session_id,{outcome:'succeeded',time:{idle:Date.now()}});await f.d.tick();assert.equal(f.calls(),4);
 f.infos.set(workers.find(w=>w.id==='startup-product').session_id,{outcome:'succeeded',time:{idle:Date.now()}});await f.d.tick();assert.equal(f.calls(),5);
 assert.equal((await f.d.status()).workers.at(-1).id,'release');
});


