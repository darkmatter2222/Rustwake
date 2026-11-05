import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planAssignments} from './team-scheduler.mjs';

// The observer is the installed OpenCode runtime/adapter. This utility does not invent session state.
export function checkpoint(board,runtime,now=new Date().toISOString()){
 if(!runtime?.source||!Array.isArray(runtime.sessions)||!Number.isFinite(Date.parse(runtime.observed_at)))throw Error('Actual runtime source, observation time and sessions required');
 if(Date.parse(now)-Date.parse(runtime.observed_at)>120000||Date.parse(runtime.observed_at)>Date.parse(now))throw Error('Runtime observation stale or future dated');
 for(const s of runtime.sessions)if(!s.session_id||!s.task_id||!s.role||!s.status||!Array.isArray(s.write_paths))throw Error('Incomplete observed session ownership');
 const merged={...board,runtime};const plan=planAssignments(merged,{now});
 return {plan,observation:{observed_at:runtime.observed_at,source:runtime.source,available_child_slots:Math.max(0,plan.capacity_children-plan.active_children),runnable_task_ids:plan.assignments.map(a=>a.task_id),idle_reasons:plan.idle_reasons}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 if(!process.argv[2])throw Error('Usage: node scripts/team-checkpoint.mjs <actual-runtime-observation.json>');
 const result=checkpoint(JSON.parse(fs.readFileSync(path.join(root,'work/backlog.json'),'utf8')),JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 const dir=path.join(root,'.rustwake-runtime');fs.mkdirSync(dir,{recursive:true});const out=path.join(dir,'supervisor-observation.json');fs.writeFileSync(out+'.tmp',JSON.stringify(result.observation,null,2));fs.renameSync(out+'.tmp',out);console.log(JSON.stringify(result,null,2));
}
