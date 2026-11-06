import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const terminal=new Set(['completed','failed','canceled','joined']);
const done=new Set(['accepted','published','deployed','measured']);
const stamp=x=>Number.isFinite(Date.parse(x))?Date.parse(x):null;
const prefix=p=>p.replace(/\\/g,'/').replace(/^\.\//,'').split('*')[0].replace(/\/$/,'');
export function pathsConflict(a,b){
 if(!a?.length||!b?.length)return true; // unknown ownership is not safe parallel ownership
 return a.some(x=>b.some(y=>{const p=prefix(x),q=prefix(y);return !p||!q||p===q||p.startsWith(q+'/')||q.startsWith(p+'/')||(x.includes('*')&&q.startsWith(p))||(y.includes('*')&&p.startsWith(q));}));
}
/** Pure advisory planner. It never launches sessions, frees a lease, or claims liveness. */
export function planAssignments(board,{now=board.updated_at,staleAfterMs=120000}={}){
 const observed=stamp(board.runtime?.observed_at),time=stamp(now);
 const cap=Math.max(0,Math.min(6,board.max_active_sessions??6)-1);
 const active=(board.runtime?.sessions??[]).filter(s=>!terminal.has(s.status));
 const warnings=[];
 if(time===null||observed===null||time-observed>staleAfterMs||observed>time){
  return {status:'reconcile-runtime',capacity_children:cap,active_children:active.length,assignments:[],idle_reasons:['Fresh runtime observation required before reserving slots; stale snapshots never imply free capacity.']};
 }
 if(active.length>cap)return {status:'over-capacity',capacity_children:cap,active_children:active.length,assignments:[],idle_reasons:['Stop dispatching; reconcile excess sessions without abandoning mutations.']};
 const ids=new Map(board.tickets.map(t=>[t.id,t]));
 const occupied=new Set(active.map(s=>s.task_id));
 const writeSets=active.map(s=>s.write_paths??[]);
 const releaseActive=active.some(s=>['release-engineer','publisher','deployer'].includes(s.role));
 const candidates=[];
 for(const t of board.tickets){
  if(occupied.has(t.id)||t.scheduling?.enabled!==true)continue;
  if((t.dependencies??[]).some(id=>!done.has(ids.get(id)?.status)))continue;
  let role;
  if(t.status==='review')role='reviewer';
  else if(t.status==='accepted')role='release-engineer';
  else if(t.status==='triaged'||t.status==='inbox')role='product-owner';
  else if(['ready','rework'].includes(t.status))role=t.scheduling.role??t.owner;
  else continue;
  if(!['developer','reviewer','player','product-owner','release-engineer','ui-ux'].includes(role))continue;
  if(role==='developer'&&!t.product_approved)continue;
  if(role==='release-engineer'&&releaseActive)continue;
  const writes=t.scheduling.write_paths;
  if(!Array.isArray(writes)||!writes.length){warnings.push(`${t.id}: explicit isolated write_paths required`);continue;}
  const readyAt=stamp(t.scheduling.ready_at)??time;
  // Ready releases/reviews must not starve behind a permanent developer queue.
  const overdue=['release-engineer','reviewer'].includes(role)&&time-readyAt>=600000;
  candidates.push({ticket:t,role,writes,rank:overdue?-1:Number(t.priority?.slice(1)??3),readyAt});
 }
 candidates.sort((a,b)=>a.rank-b.rank||a.readyAt-b.readyAt||a.ticket.id.localeCompare(b.ticket.id));
 const assignments=[];
 for(const c of candidates){
  if(assignments.length+active.length>=cap)break;
  if(c.role==='release-engineer'&&assignments.some(a=>a.role==='release-engineer'))continue;
  if(writeSets.some(w=>pathsConflict(w,c.writes))){warnings.push(`${c.ticket.id}: write ownership overlaps active/planned work`);continue;}
  assignments.push({task_id:c.ticket.id,role:c.role,generation:(c.ticket.generation??0)+1,write_paths:c.writes,base_sha:c.ticket.scheduling.base_sha??board.publication?.inspected_head,reason:c.rank===-1?'overdue review/release gets next safe slot':'highest-priority independent useful work'});
  writeSets.push(c.writes);
 }
 const free=cap-active.length-assignments.length;
 return {status:'advisory-plan',capacity_children:cap,active_children:active.length,assignments,idle_reasons:free?[...warnings,'No further explicitly scoped, dependency-ready independent assignment. PM must split useful work or record the blocker; do not invent busywork.']:warnings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];if(!file)throw new Error('Usage: node scripts/team-scheduler.mjs <fresh-runtime-board.json>');
 console.log(JSON.stringify(planAssignments(JSON.parse(fs.readFileSync(file,'utf8')),{now:new Date().toISOString()}),null,2));
}

