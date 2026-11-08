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
  const observed=await read('.rustwake-runtime/supervisor-observation.json');
  const inbox=await fs.readFile(path.join(root,'SPONSOR_INBOX.md'),'utf8').catch(()=>null);
  return {publication:await publication(),dispatcher:await dispatcher.status(),observation:observed,sponsor_inbox:sponsorState(inbox),sponsor_file_bytes:inbox===null?null:Buffer.byteLength(inbox),guarded_wait_tools:waitTools};
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
   const prior={coordinator,stopping};
   let phase='validate-command';
   try{
    if(action==='bind'||action==='start'){
     phase='read-coordinator-session';
     const info=await ctx.session.get({sessionID:input.sessionID});
     if(await fs.realpath(info.location.directory)!==root)throw new Error('Different workspace');
     if(action==='bind'&&coordinator&&coordinator!==input.sessionID){
      const current=await dispatcher.status();
      const unresolved=current.workers.some(w=>!['succeeded','failed','interrupted'].includes(w.status));
      if(unresolved)throw new Error('A team already exists. Use /rustwake-team start here to launch a fresh team');
     }
     if(action==='start'){
      phase='start-dispatcher';
      if(!ctx.session.create||!ctx.session.prompt||!ctx.event?.subscribe)throw Error('OpenCode session/event API unavailable');
      await dispatcher.start(input.sessionID);
     }
     // Bind only after setup has completed. Failed setup must not capture a new UI session.
     coordinator=input.sessionID;stopping=false;
    }else if(action==='stop'){
     if(coordinator&&coordinator!==input.sessionID)throw Error('Only bound coordinator may stop guard: '+coordinator);
     phase='stop-dispatcher';await dispatcher.stop();stopping=true;coordinator=null;
    }else if(action!=='status')throw Error('Use start, bind, stop or status');
    phase='render-command-result';
    await ctx.session.synthetic({sessionID:input.sessionID,resume:false,text:JSON.stringify({bound_session:coordinator,stopping,...await status()})});
   }catch(error){
    const message=String(error?.message??error);
    const current=await dispatcher.status();
    // Preserve an actually started team's ownership even if rendering its command result failed.
    if(!current.enabled||current.coordinator!==input.sessionID){coordinator=prior.coordinator;stopping=prior.stopping;}
    const diagnostic={at:new Date().toISOString(),action,phase,session_id:input.sessionID,
      error_name:error?.name??'Error',message,cause:error?.cause?.message??null,
      dispatcher_coordinator:current.coordinator,enabled:current.enabled,
      workers:current.workers.map(w=>({id:w.id,session_id:w.session_id,status:w.status}))};
    await fs.mkdir(path.join(root,'.rustwake-runtime'),{recursive:true});
    await fs.writeFile(path.join(root,'.rustwake-runtime','last-command-error.json'),JSON.stringify(diagnostic,null,2)+'\n');
    await dispatcher.recordError(phase+': '+message);
    throw new Error('Rustwake '+phase+': '+message+'. Details saved in .rustwake-runtime/last-command-error.json');
   }
  }
 })));
 registrations.push(await ctx.session.hook('context',async e=>{
  if(!coordinator&&!stopping){
   const info=await ctx.session.get({sessionID:e.sessionID});
   if(info?.agent==='rustwake-coordinator'){
    await dispatcher.start(e.sessionID);coordinator=e.sessionID;
   }
  }
  const current=await dispatcher.status();
  if(current.retired_coordinators?.includes(e.sessionID)){
   e.system.push({type:'text',text:'This Rustwake coordinator has been retired by an explicit team start in another session. Stop this goal loop. Do not schedule, edit files, or launch workers. The replacement coordinator owns the preserved team.'});return;
  }
  if(e.sessionID!==coordinator||stopping)return;
  const s=await status();
  if(s.dispatcher.recovery_pending){
   e.system.push({type:'text',text:'TEAM RECOVERY PENDING: the plugin is retrying host session checks automatically. Existing worker reservations remain owned. Do not spawn workers, change the queue, or edit worker-owned files. Report the visible recovery error honestly. This is not an active dispatcher.'});return;
  }
  e.system.push({type:'text',text:
   (s.dispatcher.enabled?'RUSTWAKE GITHUB-NATIVE DISPATCHER ACTIVE. Read AGENTS.md and docs/GITHUB_WORKFLOW.md FIRST. GitHub Issues is the only live board; do not update archived work/backlog.json or regenerate an internal Jira. Use gh issue list/view and gh pr list/view to reconcile live Issues and PRs. New starts have an EMPTY dispatch queue; fill it with scoped assignments derived from OPEN GitHub Issues. The queue is runtime state only: {coordinator_session_id, tasks:[{id:unique,role:developer|reviewer|player|product-owner|release-engineer|ui-ux,issue_url:canonical GitHub Issues URL,prompt:bounded assignment,write_paths:[explicit paths],directory:registered worktree for developer}]}. Plugin validates open issue with gh before launching. Exactly FIVE TOTAL agents maximum (coordinator + FOUR children). Do not start sessions manually. Developers must create draft PRs with scripts/publish-feature.mjs --issue; reviewers record role-stamped verdicts at exact PR head SHA; release engineer merges only a verified PR or requests REWORK, NEVER direct-pushes main. On completion read returned child outputs and queue next safe Issue. No repeated startup audits.\\n':'')+
   'RUSTWAKE CHECKPOINT: '+JSON.stringify(s)+'\\nReconcile actual active sessions and GitHub Issue/PR status before dispatch; preserve old leases and worktrees. No more than FOUR children including queued/creating/running. If gh access is unavailable report the blocker, not local-board fallback. Keep releases and defects in GitHub. Respect host cancellation and stop.'});
 }));
 registrations.push(await ctx.tool.hook('execute.before',async e=>{
  const current=await dispatcher.status();
  if(current.retired_coordinators?.includes(e.sessionID))throw Error('This coordinator was replaced by /rustwake-team start. Work is supervised in the replacement session.');
  if(e.sessionID!==coordinator||stopping)return;
  if(shouldBlockWait({tool:e.tool,waitTools,observation:await read('.rustwake-runtime/supervisor-observation.json'),now:Date.now(),stopping}))
   throw new Error('Rustwake: fresh observation shows runnable work and spare capacity. Dispatch safe work or record why it cannot run before blocking wait. Reconcile existing sessions first.');
 }));
 return async()=>{dispatcher.close();eventsAbort.abort();stopping=true;coordinator=null;await Promise.allSettled(registrations.map(r=>r.dispose()));};
}






