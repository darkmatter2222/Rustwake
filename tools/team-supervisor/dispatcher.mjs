import fs from 'node:fs/promises';
import path from 'node:path';

const terminal = new Set(['succeeded','failed','interrupted']);
const roles = new Set(['developer','reviewer','player','product-owner','release-engineer']);
const conflict=(a,b)=>a.some(x=>b.some(y=>x===y||x.startsWith(y+'/')||y.startsWith(x+'/')));
export function validateTask(t){
 if(!t||!/^[-a-zA-Z0-9_]{1,80}$/.test(t.id)||!roles.has(t.role)||typeof t.prompt!=='string'||!t.prompt.trim())throw Error('Invalid dispatch task');
 if(!Array.isArray(t.write_paths)||!t.write_paths.length||t.write_paths.some(p=>typeof p!=='string'||!p||p.includes('..')||p.includes('*')||p.includes('\\')||p.startsWith('/')))throw Error('Use explicit relative write path prefixes');
 return t;
}

export function createDispatcher(ctx,root){
 const dir=path.join(root,'.rustwake-runtime');
 let state={version:1,coordinator:null,enabled:false,workers:[],error:null},busy=false,timer;
 let notifyNeeded=false;
 const save=async()=>{await fs.mkdir(dir,{recursive:true});const p=path.join(dir,'dispatcher.json');await fs.writeFile(p+'.tmp',JSON.stringify(state,null,2));await fs.rename(p+'.tmp',p);};
 const read=async name=>{try{return JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const active=()=>state.workers.filter(w=>!terminal.has(w.status));
 async function observe(){
  for(const w of active()){
   if(!w.session_id)throw Error('Unresolved dispatch intent '+w.id+'; reconcile before launching replacements');
   const info=await ctx.session.get({sessionID:w.session_id});
   if(terminal.has(info.outcome)&&info.time?.idle){w.status=info.outcome;w.finished_at=new Date().toISOString();notifyNeeded=true;}
   else if(w.status==='created')throw Error('Prompt acceptance uncertain for '+w.id+'; inspect child before retry');
  }
 }
 async function tick(){
  if(busy||!state.enabled)return;
  busy=true;
  try{
   await observe();
   const queue=await read('dispatch-queue.json');
   if(queue && queue.coordinator_session_id!==state.coordinator)throw Error('Dispatch queue belongs to another coordinator');
   const tasks=(queue?.tasks??[]).map(validateTask);
   for(const t of tasks){
    if(!state.enabled||active().length>=3)break;
    if(state.workers.some(w=>w.id===t.id)||active().some(w=>conflict(w.write_paths,t.write_paths)))continue;
    if(t.role==='release-engineer'&&active().some(w=>w.role==='release-engineer'))continue;
    // Persist intent before creation: ambiguous failures never silently retry/create duplicates.
    const w={...t,status:'creating',session_id:null,created_at:new Date().toISOString()};
    state.workers.push(w);await save();
    const parent=await ctx.session.get({sessionID:state.coordinator});
    const child=await ctx.session.create({parentID:state.coordinator,agent:'rustwake-'+t.role,
      ...(parent.model?{model:parent.model}:{}),location:{directory:root},title:'Rustwake '+t.id,
      metadata:{rustwake_dispatch_id:t.id}});
    w.session_id=child.id;w.status='created';await save();
    await ctx.session.prompt({sessionID:child.id,resume:true,text:
      `Bounded Rustwake assignment ${t.id}. Read your role instructions and goal.md. Do not spawn children. Only edit these owned paths: ${t.write_paths.join(', ')}. Never commit another worker's files. Complete this assignment and return findings; do not run a forever loop.\n${t.prompt}`});
    if(w.status==='created')w.status='queued';await save();
   }
   state.error=null;
   if(notifyNeeded){
    await ctx.session.synthetic({sessionID:state.coordinator,resume:true,text:'Rustwake dispatcher: worker completion recorded in .rustwake-runtime/dispatcher.json. Read child outputs using host tools, integrate results, and append new uniquely identified scoped assignments to dispatch-queue.json. Plugin owns dispatch; do not spawn duplicate workers.'});
    notifyNeeded=false;
   }
  }catch(e){state.error=e.message;}
  finally{state.checked_at=new Date().toISOString();await save();busy=false;}
 }
 return {
  async start(id){
   if(busy)throw Error('Dispatch reconciliation in progress');
   const previous=await read('dispatcher.json');if(previous)state=previous;
   await observe();
   // Parent identity is a lease: never abandon workers merely because UI restarted.
   if(state.coordinator&&state.coordinator!==id&&active().length)throw Error('Previous coordinator owns unresolved workers. Open that coordinator and use status/stop before starting another.');
   state.coordinator=id;state.enabled=true;await save();
   const oldQueue=await read('dispatch-queue.json');
   if(oldQueue&&oldQueue.coordinator_session_id!==id&&!active().length){oldQueue.coordinator_session_id=id;await fs.writeFile(path.join(dir,'dispatch-queue.json'),JSON.stringify(oldQueue,null,2));}
   if(!await read('dispatch-queue.json')){
    const tasks=[
     {id:'startup-product',role:'product-owner',write_paths:['work/product/dispatch-startup'],prompt:'Read sponsor inbox, backlog and game strategy. Produce a prioritized next implementation brief in work/product/dispatch-startup. Do not edit shared backlog. Return three useful independent assignments with exact file scopes.'},
     {id:'startup-review',role:'reviewer',write_paths:['work/review/dispatch-startup'],prompt:'Critically review the current game and available screenshots. If browser access works, inspect the actual mobile game. Report the three highest-impact visual/gameplay defects with evidence in work/review/dispatch-startup. Label unavailable visual/audio capabilities honestly.'},
     {id:'startup-code-audit',role:'developer',write_paths:['work/development/dispatch-startup'],prompt:'Inspect current source, tests and existing uncommitted work without changing app code. Identify the best next implementable improvement and any abandoned work needing recovery. Write an implementation handoff in work/development/dispatch-startup. Do not change other files or push.'}
    ];
    await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'dispatch-queue.json'),JSON.stringify({coordinator_session_id:id,tasks},null,2));
   }
   clearInterval(timer);await tick();timer=setInterval(()=>{void tick().catch(()=>{});},5000);timer.unref?.();
   return state;
  },
  async stop(){
   state.enabled=false;clearInterval(timer);
   // A stop may arrive during a host request. Do not launch more work; retain unknown leases.
   while(busy)await new Promise(r=>setTimeout(r,25));
   for(const w of active())if(w.session_id){try{await ctx.session.interrupt({sessionID:w.session_id});}catch(e){state.error=e.message;}}
   await save();return state;
  },
  async status(){return {...state,workers:state.workers.map(({prompt,...w})=>w)};},
  event(e){const w=state.workers.find(w=>w.session_id===e.data?.sessionID);if(!w)return;
   if(e.type==='session.execution.started')w.status='running';
   const outcome=e.type?.replace('session.execution.','');
   if(terminal.has(outcome)){w.status=outcome;w.finished_at=new Date().toISOString();notifyNeeded=true;}
  },
  tick,
  close(){state.enabled=false;clearInterval(timer);},
 };
}
