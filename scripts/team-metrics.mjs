import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const time=x=>Number.isFinite(Date.parse(x))?Date.parse(x):null;
const first=(t,state)=>{const a=(t.history??[]).filter(e=>e.to_state===state).map(e=>time(e.at)).filter(v=>v!==null);return a.length?Math.min(...a):null;};
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
/** Retrospective metrics never infer throughput or live utilization from intentions. */
export function computeMetrics(board,{now=board.updated_at,windowHours=24,maxSampleGapSeconds=120}={}){
 const end=time(now);if(end===null)throw new Error('metrics require valid now');const start=end-windowHours*3600000;
 const published=[],deployed=[],cycles=[],reworked=new Set();let points=0,estimated=0,unmeasuredCycles=0;
 for(const t of board.tickets??[]){
  const p=first(t,'published'),d=first(t,'deployed'),began=first(t,'implementing');
  if(p!==null&&p>=start&&p<=end){published.push(t.id);if(began!==null&&began<p)cycles.push((p-began)/3600000);else unmeasuredCycles++;
   const est=t.estimate,at=time(est?.estimated_at);
   if(Number.isFinite(est?.points)&&est.points>0&&at!==null&&began!==null&&at<=began){points+=est.points;estimated++;}
  }
  if(d!==null&&d>=start&&d<=end)deployed.push(t.id);
  if((t.history??[]).some(e=>e.to_state==='rework'&&time(e.at)>=start&&time(e.at)<=end))reworked.add(t.id);
 }
 const samples=(board.telemetry?.samples??[]).filter(s=>time(s.observed_at)!==null&&Number.isInteger(s.active_children)&&Number.isInteger(s.capacity_children)&&s.capacity_children>0&&s.capacity_children<=3&&s.active_children>=0&&s.active_children<=s.capacity_children).sort((a,b)=>time(a.observed_at)-time(b.observed_at));
 let knownMs=0,busyMs=0,capacityMs=0;
 for(let i=0;i+1<samples.length;i++){
  const a=samples[i],b=samples[i+1],ta=time(a.observed_at),tb=time(b.observed_at);
  if(tb<=ta||tb-ta>maxSampleGapSeconds*1000)continue; // gaps are unknown, not idle or busy
  const span=Math.max(0,Math.min(end,tb)-Math.max(start,ta));
  knownMs+=span;busyMs+=span*a.active_children;capacityMs+=span*a.capacity_children;
 }
 const latest=samples.length?time(samples.at(-1).observed_at):null;
 return {window_hours:windowHours,as_of:now,published_tickets:published.length,deployed_tickets:deployed.length,story_points_published:estimated?points:null,estimated_published_tickets:estimated,unestimated_published_tickets:published.length-estimated,median_cycle_hours:median(cycles),unmeasured_cycle_tickets:unmeasuredCycles,reworked_tickets:reworked.size,utilization_percent:capacityMs?100*busyMs/capacityMs:null,observed_minutes:knownMs/60000,coverage_percent:100*knownMs/(end-start),latest_sample_age_seconds:latest===null?null:(end-latest)/1000,live_status:latest!==null&&latest<=end&&end-latest<=maxSampleGapSeconds*1000?'recent sample':'unknown / stale',notes:'Published and deployed counts are distinct ticket transitions, not commits. Points count once at first publication only if estimated before implementation. Zero-duration/backfilled lifecycle pairs are excluded from cycle time. Utilization excludes unsampled gaps; no data is unknown.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Usage: node scripts/team-metrics.mjs <backlog.json>');
 console.log(JSON.stringify(computeMetrics(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),{now:new Date().toISOString()}),null,2));
}
