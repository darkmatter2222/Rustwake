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
 if(!task.directory){if(task.role==='developer')throw Error('Developer assignment requires an isolated registered rw/ feature worktree directory');return root;}
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
// Five model sessions TOTAL: one coordinator plus at most four child workers.
export const MAX_TOTAL_AGENTS = 5;
export const MAX_CHILD_AGENTS = MAX_TOTAL_AGENTS - 1;
const ISSUE_URL = /^https:\/\/github\.com\/darkmatter2222\/Rustwake\/issues\/[1-9]\d*$/;
export function assertDispatchableIssue(issue,role){
 if(!Array.isArray(issue.labels))throw Error('GitHub issue labels are required before dispatch');
 const blocked=new Set(['status:blocked','status:deferred','status:superseded']);
 const names=issue.labels.map(label=>typeof label==='string'?label:label.name);
 if(names.some(label=>blocked.has(label)))throw Error('GitHub issue is blocked, deferred or superseded; coordinator must resolve it before dispatch');
 const allowed=role==='product-owner'?['status:triage','status:ready','status:doing','status:rework','status:review','status:accepted']:role==='release-engineer'?['status:accepted','status:ready','status:doing']:role==='reviewer'||role==='player'?['status:review','status:ready','status:doing','status:rework']:['status:ready','status:doing','status:rework'];
 if(!names.some(name=>allowed.includes(name)))throw Error('GitHub issue has no eligible status for role '+role);
}
export async function verifyIssueWithGh(root, task){
  let issue;
  try {
    const number = task.issue_url.split('/').at(-1);
    const {stdout}=await exec('gh',['issue','view',number,'--repo','darkmatter2222/Rustwake','--json','url,state,title,labels'],{cwd:root,timeout:20000});
    issue=JSON.parse(stdout);
  } catch(e) {
    throw Error('Cannot read GitHub Issue '+task.issue_url+'. Install/authenticate GitHub CLI (gh auth status). '+hostError(e));
  }
  if(issue.url!==task.issue_url||issue.state!=='OPEN')throw Error('GitHub Issue must exist and be OPEN before dispatch: '+task.issue_url);
  assertDispatchableIssue(issue,task.role);
  return issue;
}

const roles = new Set(['developer','reviewer','player','product-owner','release-engineer','ui-ux']);
const conflict=(a,b)=>a.some(x=>b.some(y=>x===y||x.startsWith(y+'/')||y.startsWith(x+'/')));
export function validateTask(t){
 if(!t||!/^[-a-zA-Z0-9_]{1,80}$/.test(t.id)||!roles.has(t.role)||typeof t.prompt!=='string'||!t.prompt.trim())throw Error('Invalid dispatch task');
 if(!ISSUE_URL.test(t.issue_url??''))throw Error('Every dispatch task requires a canonical open GitHub Issue URL (issue_url); the local board is not authoritative');
 if(!Array.isArray(t.write_paths)||!t.write_paths.length||t.write_paths.some(p=>typeof p!=='string'||!p||p.includes('..')||p.includes('*')||p.includes('\\')||p.startsWith('/')))throw Error('Use explicit relative write path prefixes');
 return t;
}

export function createDispatcher(ctx,root,{verifyIssue=verifyIssueWithGh,requestTimeoutMs=30000,now=Date.now}={}){
 const dir=path.join(root,'.rustwake-runtime');
 let state={version:1,coordinator:null,enabled:false,workers:[],error:null},busy=false,timer;
 let notifyNeeded=false,starting=false;
 let deliveredToWait=false;let revision=0;const waiters=new Set(),pending=new Map();
 let streamError=null;const uncertainEvents=new Set();let saving=Promise.resolve();
 const iso=()=>new Date(now()).toISOString();
 const changed=()=>{if(waiters.size)deliveredToWait=true;revision++;for(const wake of waiters)wake();};
 async function bounded(key,fn){
  if(pending.has(key))throw Error('Host request still unresolved: '+key);
  const request=Promise.resolve().then(fn);pending.set(key,request);
  request.finally(()=>pending.delete(key)).catch(()=>{});
  let timer;try{return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Host request timed out: '+key+'; outcome unknown, lease retained')),requestTimeoutMs);})]);}finally{clearTimeout(timer);}
 }
 const host=(method,input)=>bounded(method+':'+(input.sessionID??input.metadata?.rustwake_dispatch_id??''),()=>ctx.session[method](input));
 function finish(w,outcome){if(terminal.has(w.status))return;w.status=outcome;w.finished_at=iso();notifyNeeded=true;changed();}
 function health(w){
  if(terminal.has(w.status))return w.status;
  if(w.unmanaged)return 'unmanaged: reconcile before dispatch';
  const since=now()-Date.parse(w.last_progress_at??w.created_at);
  if(w.status!=='running'&&since>=120000)return 'start unconfirmed';
  if(since>=600000)return 'no progress evidence for 10m';
  return w.last_progress_at?'host activity observed':'awaiting execution evidence';
 }
 const save=()=>{const snapshot=JSON.stringify(state,null,2);const next=saving.catch(()=>{}).then(async()=>{await fs.mkdir(dir,{recursive:true});const p=path.join(dir,'dispatcher.json');await fs.writeFile(p+'.tmp',snapshot);await fs.rename(p+'.tmp',p);});saving=next;return next;};
 const read=async name=>{try{return JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const active=()=>state.workers.filter(w=>!terminal.has(w.status));
 async function observe(){
  for(const w of active()){
   if(!w.session_id)throw Error('Unresolved dispatch intent '+w.id+'; reconcile before launching replacements');
   let info;
   try{info=await host('get',{sessionID:w.session_id});}
   catch(e){throw Error('Cannot reconcile '+w.id+' ('+w.session_id+'): '+hostError(e));}
   if(!info)throw Error('Host returned no session for '+w.id+' ('+w.session_id+'); preserve lease and inspect the host');
   w.last_checked_at=iso();
   const fingerprint=JSON.stringify([info.tokens?.output,info.tokens?.reasoning,info.time?.updated]);
   if(w.observation_fingerprint!==fingerprint){if(w.observation_fingerprint!==undefined)w.last_progress_at=iso();w.observation_fingerprint=fingerprint;}
   if(terminal.has(info.outcome)&&info.time?.idle&&(!w.unmanaged||w.execution_started_at)&&info.time.idle>=Date.parse(w.execution_started_at??w.created_at))finish(w,info.outcome);
   else if(w.status==='created')throw Error('Prompt acceptance uncertain for '+w.id+'; inspect child before retry');
  }
 }
 async function tick(){
  if(busy||starting||!state.enabled)return;
  busy=true;
  try{
   await observe();
   if(uncertainEvents.size)throw Error('Host child reconciliation uncertain: '+[...uncertainEvents].join(', '));
   if(streamError)throw Error('Event stream unavailable: '+streamError);
   if(active().some(w=>w.unmanaged))throw Error('Unmanaged host child detected; reconcile its lease before launching work');
   const warnings=active().map(w=>[w,health(w)]).filter(([,h])=>h==='start unconfirmed'||h==='no progress evidence for 10m');
   for(const [w,h] of warnings){if(w.health_alert!==h){w.health_alert=h;notifyNeeded=true;changed();}}
   if(warnings.length)throw Error(warnings.map(([w,h])=>w.id+': '+h).join('; '));
   const queue=await read('dispatch-queue.json');
   if(queue && queue.coordinator_session_id!==state.coordinator)throw Error('Dispatch queue belongs to another coordinator');
   const tasks=prioritizeTasks((queue?.tasks??[]).map(validateTask));
   const releasePending=tasks.some(t=>t.role==='release-engineer'&&!state.workers.some(w=>w.id===t.id));
   for(const t of tasks){
    if(!state.enabled||active().length>=MAX_CHILD_AGENTS)break;
    if(state.workers.some(w=>w.id===t.id)||active().some(w=>conflict(w.write_paths,t.write_paths)))continue;
    if(t.role==='release-engineer'&&active().some(w=>w.role==='release-engineer'))continue;
    // Drain conflicting work for the queued release instead of refilling every slot with new development.
    if(releasePending&&t.role!=='release-engineer')continue;
    await verifyIssue(root,t);
    const directory=await taskDirectory(root,t);
    if(!state.enabled)break;
    // Persist intent before creation: ambiguous failures never silently retry/create duplicates.
    const w={...t,status:'creating',session_id:null,created_at:iso()};
    state.workers.push(w);await save();
    const parent=await host('get',{sessionID:state.coordinator});
    const child=await host('create',{parentID:state.coordinator,agent:'rustwake-'+t.role,
      ...(parent.model?{model:parent.model}:{}),location:{directory},title:'Rustwake '+t.id,
      metadata:{rustwake_dispatch_id:t.id}});
    w.session_id=child.id;if(w.status==='creating')w.status='created';await save();
    if(!state.enabled){await host('interrupt',{sessionID:child.id});break;}
    await host('prompt',{sessionID:child.id,resume:true,text:
      `Bounded Rustwake assignment ${t.id} for open GitHub Issue ${t.issue_url}. FIRST read AGENTS.md, docs/GITHUB_WORKFLOW.md, docs/GITHUB_PROJECT.md and your persona file. The only active work tracker is GitHub Issues; do not update historical work/backlog.json. Use the same GitHub account, distinguish each persona in GitHub comments with Role: ${t.role}. Five total agents including coordinator, maximum four children. Do not spawn children. Only edit these owned paths: ${t.write_paths.join(', ')}. Never commit peer files. Developer: only in registered rw/ worktree, push with node scripts/publish-feature.mjs --issue ${t.issue_url} "commit message" <owned paths>; it MUST open/reuse a linked draft PR. After verification mark PR ready, include head SHA and evidence; do not push main. Reviewer: inspect linked PR and comment ACCEPT/REWORK at exact head SHA. Release engineer: inspect independent review, product decision and CI; request rework or gh pr merge approved PR; NEVER push main directly. No role may merge unreviewed code. Return issue/PR URLs and evidence for the bounded assignment, not a new local board.\n${t.prompt}`});
    if(w.status==='created')w.status='queued';await save();
   }
   state.error=null;
  }catch(e){if(state.error!==e.message){changed();notifyNeeded=true;}state.error=e.message;}

  finally{
   state.checked_at=iso();
   try{
    if(notifyNeeded&&state.enabled){
     // One attempt per transition: a timed-out delivery may already have resumed the model.
     notifyNeeded=false;
     if(!deliveredToWait&&!waiters.size){try{await host('synthetic',{sessionID:state.coordinator,resume:true,text:'Rustwake team transition: inspect /rustwake-team status and exact child IDs. Completion or health changed. Do not infer progress from CPU/file timestamps or spawn manually.'});}catch(e){state.notification_error=hostError(e);}}
    }
    deliveredToWait=false;await save();
   }finally{busy=false;}
  }
 }
 return {
  async start(id){
   if(starting)throw Error('Fresh team startup is already in progress');
   starting=true;clearInterval(timer);let restored=false;
   try{
   while(busy)await new Promise(r=>setTimeout(r,25));
   const previous=await read('dispatcher.json');
   if(previous)state={...previous,enabled:false};restored=true;
   if(!await host('get',{sessionID:id}))throw Error('Current coordinator session is unavailable');
   const oldQueue=await read('dispatch-queue.json');
   if((previous?.workers??[]).some(w=>!terminal.has(w.status)&&!w.session_id))throw Error('Previous creation outcome unknown; reconcile its session ID before a fresh start');
   const epoch=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
   const archive=path.join(dir,'archive',epoch);
   await fs.mkdir(archive,{recursive:true});
   await fs.writeFile(path.join(archive,'previous-team.json'),JSON.stringify({dispatcher:previous,queue:oldQueue},null,2));
   // Cancel known old executions. A confirmed missing session is already gone.
   const oldIds=[...(previous?.workers??[]).filter(w=>!terminal.has(w.status)).map(w=>w.session_id),
     previous?.coordinator!==id?previous?.coordinator:null].filter(Boolean);
   for(const sessionID of new Set(oldIds)){
    try{await host('interrupt',{sessionID});}
    catch(e){if(!/Session.NotFoundError|session.*not found/i.test(hostError(e)))throw Error('Cannot stop previous execution: '+hostError(e));}
   }
   const retired=[...(previous?.retired_coordinators??[]),...oldIds].filter(x=>x!==id);
   state={version:2,epoch,coordinator:id,enabled:true,workers:[],error:null,
     retired_coordinators:[...new Set(retired)],started_at:new Date().toISOString()};
   notifyNeeded=false;await save();
   {
    // GitHub Issues, not hardcoded local audits, supply the new team agenda.
    // Coordinator populates this transient queue only after inspecting open Issues.
    const tasks=[];
    await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'dispatch-queue.json'),JSON.stringify({coordinator_session_id:id,tasks},null,2));
   }
   }catch(e){
    state.error='Fresh start blocked: '+hostError(e);state.enabled=false;
    state.recovery_pending=null;if(restored)await save();throw e;
   }
   finally{starting=false;}
   await tick();timer=setInterval(()=>{void tick().catch(()=>{});},5000);timer.unref?.();
   return state;
  },
  async stop(){
   while(starting)await new Promise(r=>setTimeout(r,25));
   state.enabled=false;changed();state.recovery_pending=null;clearInterval(timer);
   // A stop may arrive during a host request. Do not launch more work; retain unknown leases.
   while(busy)await new Promise(r=>setTimeout(r,25));
   for(const w of active())if(w.session_id){try{await host('interrupt',{sessionID:w.session_id});}catch(e){state.error=e.message;}}
   await save();return state;
  },
  async reconcile(ids){
   for(const id of ids){
    if(typeof id!=='string'||!/^[-a-zA-Z0-9_]+$/.test(id))throw Error('Invalid host session ID');
    const info=await host('get',{sessionID:id});
    if(!info)throw Error('Host returned no session: '+id);
    uncertainEvents.delete(id);
    if(info.parentID!==state.coordinator)throw Error('Session is not a child of the bound coordinator: '+id);
    let w=state.workers.find(w=>w.session_id===id);
    if(!w&&info.metadata?.rustwake_dispatch_id){w=state.workers.find(w=>!w.session_id&&w.id===info.metadata.rustwake_dispatch_id);if(w){w.session_id=id;w.unmanaged=true;w.status='unknown';changed();}}
    if(!w){w={id:'unmanaged-'+id,session_id:id,role:info.agent??'unknown',status:'unknown',unmanaged:true,write_paths:[],created_at:iso()};state.workers.push(w);changed();}
    if(terminal.has(info.outcome)&&info.time?.idle&&(!w.unmanaged||w.execution_started_at)&&info.time.idle>=Date.parse(w.execution_started_at??w.created_at))finish(w,info.outcome);
   }
   await save();await tick();
  },
  async status(){return {...state,revision,event_stream_error:streamError,coverage:'dispatcher leases plus observed host events; pre-existing untracked sessions are unknown',workers:state.workers.map(({prompt,...w})=>({...w,health:health(w)}))};},
  async recordError(message){state.error=String(message);await save();},
  async event(e){
   const id=e.data?.sessionID;if(!id||id===state.coordinator||!state.enabled)return;
   let w=state.workers.find(w=>w.session_id===id);
   if(!w&&e.type?.startsWith('session.execution.')){
    let info;try{info=await host('get',{sessionID:id});uncertainEvents.delete(id);}catch(error){uncertainEvents.add(id);state.error='Child lookup uncertain: '+id+': '+hostError(error);notifyNeeded=true;changed();return;}
    if(info?.parentID!==state.coordinator)return;
    // Creation may race its execution event. Match our persisted dispatch intent first.
    w=state.workers.find(w=>w.id===info.metadata?.rustwake_dispatch_id);
    if(w)w.session_id=id;
    else{w={id:'unmanaged-'+id,session_id:id,role:info.agent??'unknown',status:'unknown',unmanaged:true,write_paths:[],created_at:iso()};state.workers.push(w);notifyNeeded=true;changed();}
   }
   if(!w)return;
   if(e.type==='session.execution.started'){
    if(terminal.has(w.status)){
     if(e.created&&e.created<=Date.parse(w.finished_at))return;
     w.unmanaged=true;notifyNeeded=true;changed();
    }
    w.status='running';w.execution_started_at=new Date(e.created??now()).toISOString();w.last_progress_at=iso();
   }
   const outcome=e.type?.replace('session.execution.','');
   if(terminal.has(outcome)){if(e.created&&w.execution_started_at&&e.created<Date.parse(w.execution_started_at))return;w.last_error=e.data?.error?.message;finish(w,outcome);}
  },
  activity(id,detail){const w=active().find(w=>w.session_id===id);if(w){w.last_progress_at=iso();w.last_activity=detail;w.health_alert=null;}},
  streamFailure(error){streamError=hostError(error);changed();notifyNeeded=true;},
  async waitForChange(since,signal,timeoutMs=300000){
   if(since!==revision||!state.enabled)return {revision,reason:'changed'};
   if(signal?.aborted)return {revision,reason:'cancelled'};
   return new Promise(resolve=>{
    let timer;
    const done=reason=>{clearTimeout(timer);waiters.delete(wake);signal?.removeEventListener('abort',abort);resolve({revision,reason});};
    const wake=()=>done('changed'),abort=()=>done('cancelled');
    waiters.add(wake);signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>done('health-check deadline'),Math.min(300000,Math.max(1,timeoutMs)));
   });
  },
  host,
  tick,
  close(){state.enabled=false;changed();clearInterval(timer);},
 };
}





