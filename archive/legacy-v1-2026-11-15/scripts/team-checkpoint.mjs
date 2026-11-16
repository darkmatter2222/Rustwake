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
 return {plan,observation:{observed_at:runtime.observed_at,source:runtime.source,coordinator_session_id:runtime.coordinator_session_id??null,capacity_children:plan.capacity_children,active_children:plan.active_children,workers:runtime.sessions.filter(s=>!['completed','failed','canceled','joined'].includes(s.status)).map(s=>({task_id:s.task_id,role:s.role,status:s.status})),available_child_slots:Math.max(0,plan.capacity_children-plan.active_children),runnable_task_ids:plan.assignments.map(a=>a.task_id),idle_reasons:plan.idle_reasons}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.error('Retired local-board command. Use live GitHub Issues and https://github.com/users/darkmatter2222/projects/1; see docs/GITHUB_PROJECT.md.');
 process.exitCode=1;
}
