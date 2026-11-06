import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function hostError(e){
 const parts=[e?.name,e?.message,e?.code,e?.status,e?.data?.message,e?.cause?.message].filter(x=>typeof x==='string'||typeof x==='number');
 return [...new Set(parts)].join(': ')||'Host session API returned an error without a message';
}

export function prioritizeTasks(tasks){
 const rank=t=>t.role==='release-engineer'?0:t.role==='reviewer'?1:2;
 return [...tasks].sort((a,b)=>rank(a)-rank(b));
}
export async function taskDirectory(root,task){
 if(!task.directory)return root;
 const directory=await fs.realpath(task.directory);
 const {stdout}=await exec('git',['worktree','list','--porcelain'],{cwd:root});
 const registered=await Promise.all(stdout.split('\n').filter(l=>l.startsWith('worktree ')).map(l=>fs.realpath(l.slice(9))));
 if(!registered.includes(directory))throw Error('Assignment directory is not a registered worktree of this repository');
 if(task.role==='developer'){
  const branch=(await exec('git',['branch','--show-current'],{cwd:directory})).stdout.trim();
  if(directory===root||!branch.startsWith('rw/'))throw Error('Developer publishing requires a separate rw/ feature worktree');
 }
 return directory;
}

const terminal = new Set(['succeeded','failed','interrupted']);
const roles = new Set(['developer','reviewer','player','product-owner','release-engineer','ui-ux']);
const conflict=(a,b)=>a.some(x=>b.some(y=>x===y||x.startsWith(y+'/')||y.startsWith(x+'/')));
export function validateTask(t){
 if(!t||!/^[-a-zA-Z0-9_]{1,80}$/.test(t.id)||!roles.has(t.role)||typeof t.prompt!=='string'||!t.prompt.trim())throw Error('Invalid dispatch task');
 if(!Array.isArray(t.write_paths)||!t.write_paths.length||t.write_paths.some(p=>typeof p!=='string'||!p||p.includes('..')||p.includes('*')||p.includes('\\')||p.startsWith('/')))throw Error('Use explicit relative write path prefixes');
 return t;
}

export function createDispatcher(ctx,root){
 const dir=path.join(root,'.rustwake-runtime');
 let state={version:1,coordinator:null,enabled:false,workers:[],error:null},busy=false,timer;
 let notifyNeeded=false,starting=false;
 const save=async()=>{await fs.mkdir(dir,{recursive:true});const p=path.join(dir,'dispatcher.json');await fs.writeFile(p+'.tmp',JSON.stringify(state,null,2));await fs.rename(p+'.tmp',p);};
 const read=async name=>{try{return JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const active=()=>state.workers.filter(w=>!terminal.has(w.status));
 async function observe(){
  for(const w of active()){
   if(!w.session_id)throw Error('Unresolved dispatch intent '+w.id+'; reconcile before launching replacements');
   let info;
   try{info=await ctx.session.get({sessionID:w.session_id});}
   catch(e){throw Error('Cannot reconcile '+w.id+' ('+w.session_id+'): '+hostError(e));}
   if(!info)throw Error('Host returned no session for '+w.id+' ('+w.session_id+'); preserve lease and inspect the host');
   if(terminal.has(info.outcome)&&info.time?.idle){w.status=info.outcome;w.finished_at=new Date().toISOString();notifyNeeded=true;}
   else if(w.status==='created')throw Error('Prompt acceptance uncertain for '+w.id+'; inspect child before retry');
  }
 }
 async function tick(){
  if(busy||starting||!state.enabled)return;
  busy=true;
  try{
   await observe();
   const queue=await read('dispatch-queue.json');
   if(queue && queue.coordinator_session_id!==state.coordinator)throw Error('Dispatch queue belongs to another coordinator');
   const tasks=prioritizeTasks((queue?.tasks??[]).map(validateTask));
   const releasePending=tasks.some(t=>t.role==='release-engineer'&&!state.workers.some(w=>w.id===t.id));
   for(const t of tasks){
    if(!state.enabled||active().length>=5)break;
    if(state.workers.some(w=>w.id===t.id)||active().some(w=>conflict(w.write_paths,t.write_paths)))continue;
    if(t.role==='release-engineer'&&active().some(w=>w.role==='release-engineer'))continue;
    // Drain conflicting work for the queued release instead of refilling every slot with new development.
    if(releasePending&&t.role!=='release-engineer')continue;
    const directory=await taskDirectory(root,t);
    // Persist intent before creation: ambiguous failures never silently retry/create duplicates.
    const w={...t,status:'creating',session_id:null,created_at:new Date().toISOString()};
    state.workers.push(w);await save();
    const parent=await ctx.session.get({sessionID:state.coordinator});
    const child=await ctx.session.create({parentID:state.coordinator,agent:'rustwake-'+t.role,
      ...(parent.model?{model:parent.model}:{}),location:{directory},title:'Rustwake '+t.id,
      metadata:{rustwake_dispatch_id:t.id}});
    w.session_id=child.id;w.status='created';await save();
    await ctx.session.prompt({sessionID:child.id,resume:true,text:
      `Bounded Rustwake assignment ${t.id}. Read your role instructions, goal.md and docs/PUBLICATION.md. Do not spawn children. Only edit these owned paths: ${t.write_paths.join(', ')}. Never commit another worker's files. In an assigned rw/ feature worktree, commit and push coherent owned changes frequently using scripts/publish-feature.mjs; do not wait for final approval to publish a feature branch. Never push main unless you are the assigned release engineer. Complete this bounded assignment and return branch/SHA/test evidence; do not run a forever loop.\n${t.prompt}`});
    if(w.status==='created')w.status='queued';await save();
   }
   state.error=null;
   if(notifyNeeded){
    await ctx.session.synthetic({sessionID:state.coordinator,resume:true,text:'Rustwake dispatcher: worker completion recorded in .rustwake-runtime/dispatcher.json. Read child outputs using host tools, integrate results, and append new uniquely identified scoped assignments to dispatch-queue.json. Plugin owns dispatch; do not spawn duplicate workers.'});
    notifyNeeded=false;
   }
  }catch(e){state.error=e.message;}
  finally{state.checked_at=new Date().toISOString();try{await save();}finally{busy=false;}}
 }
 return {
  async start(id){
   if(starting)throw Error('Team recovery is already in progress; wait for its result');
   starting=true;clearInterval(timer);
   try{
   while(busy)await new Promise(r=>setTimeout(r,25));
   const previous=await read('dispatcher.json');if(previous)state=previous;
   // Verify the requested host session before changing ownership or interrupting anything.
   if(!await ctx.session.get({sessionID:id}))throw Error('Current coordinator session is unavailable');
   await observe();
   const from=state.coordinator;
   if(from&&from!==id){
    // Stop old scheduling before adopting its children. Never abort the children or replay prompts.
    await ctx.session.interrupt({sessionID:from});
    let old=await ctx.session.get({sessionID:from});
    for(let attempt=0;old&&!old.time?.idle&&attempt<20;attempt++){
     await new Promise(r=>setTimeout(r,100));old=await ctx.session.get({sessionID:from});
    }
    if(!old?.time?.idle)throw Error('Previous coordinator is still stopping. Run start again shortly; existing workers are preserved');
    state.recovery={from,to:id,adopted_workers:active().length,at:new Date().toISOString()};
    state.retired_coordinators=[...new Set([...(state.retired_coordinators??[]),from])].filter(x=>x!==id);
    notifyNeeded=true;
   }
   state.coordinator=id;state.enabled=true;state.recovery_pending=null;await save();
   const oldQueue=await read('dispatch-queue.json');
   if(oldQueue&&oldQueue.coordinator_session_id!==id){oldQueue.coordinator_session_id=id;const p=path.join(dir,'dispatch-queue.json');await fs.writeFile(p+'.tmp',JSON.stringify(oldQueue,null,2));await fs.rename(p+'.tmp',p);}
   if(!await read('dispatch-queue.json')){
    const tasks=[
     {id:'startup-ui-ux',role:'ui-ux',write_paths:['work/design/dispatch-startup'],prompt:'Use .opencode/skills/rustwake-ui-ux/SKILL.md. Inspect the current mobile game and actual screenshots. Produce one prioritized implementation-ready UI/UX brief in work/design/dispatch-startup, with before evidence, interaction states, accessibility and acceptance checks. Do not redesign everything or change production files.'},
     {id:'startup-product',role:'product-owner',write_paths:['work/product/dispatch-startup'],prompt:'Read sponsor inbox, backlog and game strategy. Produce a prioritized next implementation brief in work/product/dispatch-startup. Do not edit shared backlog. Return three useful independent assignments with exact file scopes.'},
     {id:'startup-review',role:'reviewer',write_paths:['work/review/dispatch-startup'],prompt:'Critically review the current game and available screenshots. If browser access works, inspect the actual mobile game. Report the three highest-impact visual/gameplay defects with evidence in work/review/dispatch-startup. Label unavailable visual/audio capabilities honestly.'},
     {id:'startup-code-audit',role:'developer',write_paths:['work/development/dispatch-startup'],prompt:'Inspect current source, tests and existing uncommitted work without changing app code. Identify the best next implementable improvement and any abandoned work needing recovery. Write an implementation handoff in work/development/dispatch-startup. Do not change other files or push.'}
    ];
    await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'dispatch-queue.json'),JSON.stringify({coordinator_session_id:id,tasks},null,2));
   }
   }catch(e){
    state.error='Recovery paused: '+hostError(e);state.enabled=false;
    state.recovery_pending={session_id:id,retry_seconds:5};
    await save();
    timer=setTimeout(()=>{void this.start(id).catch(()=>{});},5000);timer.unref?.();
    return state;
   }
   finally{starting=false;}
   await tick();timer=setInterval(()=>{void tick().catch(()=>{});},5000);timer.unref?.();
   return state;
  },
  async stop(){
   while(starting)await new Promise(r=>setTimeout(r,25));
   state.enabled=false;state.recovery_pending=null;clearInterval(timer);
   // A stop may arrive during a host request. Do not launch more work; retain unknown leases.
   while(busy)await new Promise(r=>setTimeout(r,25));
   for(const w of active())if(w.session_id){try{await ctx.session.interrupt({sessionID:w.session_id});}catch(e){state.error=e.message;}}
   await save();return state;
  },
  async status(){return {...state,workers:state.workers.map(({prompt,...w})=>w)};},
  async recordError(message){state.error=String(message);await save();},
  event(e){const w=state.workers.find(w=>w.session_id===e.data?.sessionID);if(!w)return;
   if(e.type==='session.execution.started')w.status='running';
   const outcome=e.type?.replace('session.execution.','');
   if(terminal.has(outcome)){w.status=outcome;w.finished_at=new Date().toISOString();notifyNeeded=true;}
  },
  tick,
  close(){state.enabled=false;clearInterval(timer);},
 };
}



