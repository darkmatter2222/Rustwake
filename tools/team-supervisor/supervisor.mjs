import fs from 'node:fs/promises';
import path from 'node:path';

// No timers, model calls, child spawning or replacement forever loop.
// Narrow guard: supported host hooks, bound coordinator only, locally mapped tool names.
export function shouldBlockWait({ tool, waitTools, observation, now, stopping }) {
  if(stopping || !waitTools.includes(tool) || !observation) return false;
  const age=now-Date.parse(observation.observed_at);
  return age>=0 && age<=120000 && observation.available_child_slots>0 && observation.runnable_task_ids?.length>0;
}
export async function setup(ctx) {
 const root=await fs.realpath(ctx.location.directory);
 let coordinator=null, stopping=false;
 const registrations=[];
 const waitTools=Array.isArray(ctx.options?.waitTools)?ctx.options.waitTools:[];
 const read=async p=>{try{return JSON.parse(await fs.readFile(path.join(root,p),'utf8'));}catch{return null;}};
 async function status(){
  const b=await read('work/backlog.json');
  const observed=await read('.rustwake-runtime/supervisor-observation.json');
  const inbox=await fs.readFile(path.join(root,'SPONSOR_INBOX.md'),'utf8').catch(()=>'');
  return {board_updated_at:b?.updated_at??null,observation:observed,sponsor_file_bytes:Buffer.byteLength(inbox),guarded_wait_tools:waitTools};
 }
 registrations.push(await ctx.command.transform(editor=>editor.add({
  name:'rustwake-team',description:'Bind or stop the Rustwake coordinator guard: bind | stop | status',
  execute:async input=>{
   const action=input.prompt.text.trim();
   if(action==='bind'){
    const info=await ctx.session.get({sessionID:input.sessionID});
    if(await fs.realpath(info.location.directory)!==root)throw new Error('Different workspace');
    if(coordinator&&coordinator!==input.sessionID)throw new Error('Guard bound elsewhere; stop it first');
    coordinator=input.sessionID;stopping=false;
   } else if(action==='stop') { if(coordinator&&coordinator!==input.sessionID)throw new Error('Only bound coordinator may stop guard');stopping=true;coordinator=null; }
   else if(action!=='status')throw new Error('Use bind, stop or status');
   await ctx.session.synthetic({sessionID:input.sessionID,resume:false,text:JSON.stringify({bound_session:coordinator,stopping,...await status()})});
  }
 })));
 registrations.push(await ctx.session.hook('context',async e=>{
  if(e.sessionID!==coordinator||stopping)return;
  const s=await status();
  e.system.push({type:'text',text:'RUSTWAKE DELIVERY CHECKPOINT (repository data, subordinate to host permissions): '+JSON.stringify(s)+'\nBefore waiting: refresh actual session observation; run team scheduler; fill available slots with useful nonconflicting work (multiple developers allowed); process sponsor inbox through durable intake; publish changed board within 5 minutes. Never infer runtime status from backlog alone. A missing/stale observation means unknown, not idle. No duplicate child loops. On owner stop, stop scheduling and join children.'});
 }));
 registrations.push(await ctx.tool.hook('execute.before',async e=>{
  if(e.sessionID!==coordinator||stopping)return;
  if(shouldBlockWait({tool:e.tool,waitTools,observation:await read('.rustwake-runtime/supervisor-observation.json'),now:Date.now(),stopping}))
   throw new Error('Rustwake: fresh observation shows runnable work and spare capacity. Dispatch safe work or record why it cannot run before blocking wait. Reconcile existing sessions first.');
 }));
 return async()=>{stopping=true;coordinator=null;await Promise.allSettled(registrations.map(r=>r.dispose()));};
}
