import fs from 'node:fs/promises';
import path from 'node:path';
import {publicationReader} from './publication.mjs';
import {createDispatcher} from './dispatcher.mjs';
import { formatTeamStatus, sponsorState } from './telemetry.mjs';

// Explicit start enables the bounded host-API dispatcher; bind alone remains advisory.
// Narrow guard: supported host hooks, bound coordinator only, locally mapped tool names.
export function shouldBlockWait({ tool, waitTools, observation, now, stopping }) {
  if(stopping || !waitTools.includes(tool) || !observation) return false;
  const age=now-Date.parse(observation.observed_at);
  return age>=0 && age<=120000 && observation.available_child_slots>0 && observation.runnable_task_ids?.length>0;
}
export async function setup(ctx, statusRpc) {
 const root=await fs.realpath(ctx.location.directory);
 let coordinator=null, stopping=false;
 const registrations=[];
 const dispatcher=createDispatcher(ctx,root);
 const publication=publicationReader(root);
 const eventsAbort=new AbortController();
 if(ctx.event?.subscribe){void (async()=>{try{for await(const e of ctx.event.subscribe({signal:eventsAbort.signal}))dispatcher.event(e);}catch{}})();}
 const waitTools=Array.isArray(ctx.options?.waitTools)?ctx.options.waitTools:[];
 const read=async p=>{try{return JSON.parse(await fs.readFile(path.join(root,p),'utf8'));}catch{return null;}};
 async function status(){
  const b=await read('work/backlog.json');
  const observed=await read('.rustwake-runtime/supervisor-observation.json');
  const inbox=await fs.readFile(path.join(root,'SPONSOR_INBOX.md'),'utf8').catch(()=>null);
  return {publication:await publication(),dispatcher:await dispatcher.status(),board_updated_at:b?.updated_at??null,observation:observed,sponsor_inbox:sponsorState(inbox),sponsor_file_bytes:inbox===null?null:Buffer.byteLength(inbox),guarded_wait_tools:waitTools};
 }
 if(statusRpc) registrations.push(await ctx.rpc.register(statusRpc,{
  read:async ({sessionID})=>{
   const info=await ctx.session.get({sessionID});
   if(await fs.realpath(info.location.directory)!==root)throw new Error('Different workspace');
   return {text:formatTeamStatus({bound_session:coordinator,stopping,...await status()},sessionID)};
  }
 }));
 registrations.push(await ctx.command.transform(editor=>editor.add({
  name:'rustwake-team',description:'Bind or stop the Rustwake coordinator guard: start | bind | stop | status',
  execute:async input=>{
   const action=input.prompt.text.trim();
   if(action==='bind'||action==='start'){
    const info=await ctx.session.get({sessionID:input.sessionID});
    if(await fs.realpath(info.location.directory)!==root)throw new Error('Different workspace');
    if(coordinator&&coordinator!==input.sessionID)throw new Error('Guard bound elsewhere; stop it first');
    coordinator=input.sessionID;stopping=false;
    if(action==='start'){if(!ctx.session.create||!ctx.session.prompt||!ctx.event?.subscribe)throw Error('OpenCode session/event API unavailable; no worker launch claimed');try{await dispatcher.start(coordinator);}catch(error){await dispatcher.recordError(error.message);await ctx.session.synthetic({sessionID:input.sessionID,resume:false,text:'RUSTWAKE START BLOCKED: '+error.message+'\nDo not delete dispatcher.json or relaunch duplicate workers. Run /rustwake-team status and preserve the error text.'});return;}}
   } else if(action==='stop') { if(coordinator&&coordinator!==input.sessionID)throw new Error('Only bound coordinator may stop guard');await dispatcher.stop();stopping=true;coordinator=null; }
   else if(action!=='status')throw new Error('Use start, bind, stop or status');
   await ctx.session.synthetic({sessionID:input.sessionID,resume:false,text:JSON.stringify({bound_session:coordinator,stopping,...await status()})});
  }
 })));
 registrations.push(await ctx.session.hook('context',async e=>{
  if(e.sessionID!==coordinator||stopping)return;
  const s=await status();
  e.system.push({type:'text',text:(s.dispatcher.enabled?'EXECUTABLE DISPATCHER ACTIVE: do not call spawn/task yourself. Append scoped tasks to .rustwake-runtime/dispatch-queue.json with coordinator_session_id matching this session. Format tasks: [{id:unique,role:developer|reviewer|player|product-owner|release-engineer|ui-ux,prompt:complete assignment,write_paths:[explicit relative path prefixes]}]. Five slots are reserved by the plugin using real session IDs. Inspect .rustwake-runtime/dispatcher.json for running/queued/terminal/error state. On completion read child results with host tools; queue implementation, review and release. Never repeatedly requeue the same task or rewrite leases. A startup audit is followed by real implementation, not another audit. Read docs/TEAM_DISPATCH.md.\n':'')+'RUSTWAKE DELIVERY CHECKPOINT (repository data, subordinate to host permissions): '+JSON.stringify(s)+'\nRuntime observations must include coordinator_session_id='+coordinator+'. Before waiting: refresh actual session observation; run team scheduler; fill available slots with useful nonconflicting work (multiple developers allowed); process sponsor inbox through durable intake; publish changed board within 5 minutes. Never infer runtime status from backlog alone. A missing/stale observation means unknown, not idle. No duplicate child loops. On owner stop, stop scheduling and join children.'});
 }));
 registrations.push(await ctx.tool.hook('execute.before',async e=>{
  if(e.sessionID!==coordinator||stopping)return;
  if(shouldBlockWait({tool:e.tool,waitTools,observation:await read('.rustwake-runtime/supervisor-observation.json'),now:Date.now(),stopping}))
   throw new Error('Rustwake: fresh observation shows runnable work and spare capacity. Dispatch safe work or record why it cannot run before blocking wait. Reconcile existing sessions first.');
 }));
 return async()=>{dispatcher.close();eventsAbort.abort();stopping=true;coordinator=null;await Promise.allSettled(registrations.map(r=>r.dispose()));};
}




