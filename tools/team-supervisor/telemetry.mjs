const clean=(s,max=64)=>String(s??'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,max);
const age=(value,now)=>{const t=Date.parse(value);return Number.isFinite(t)&&t<=now?Math.floor((now-t)/1000):null;};
const label=n=>n===null?'unknown':n<60?`${n}s ago`:n<3600?`${Math.floor(n/60)}m ago`:`${Math.floor(n/3600)}h ago`;
export function sponsorState(text){
 if(typeof text!=='string')return 'unavailable';
 const marker='<!-- WRITE BELOW THIS LINE -->';const at=text.indexOf(marker);
 if(at<0)return 'marker missing';
 return text.slice(at+marker.length).trim()?'pending input':'empty';
}
export function formatTeamStatus(s,sessionID,now=Date.now()){
 const bound=!!s.bound_session&&!s.stopping;
 const here=bound&&s.bound_session===sessionID;
 const lines=['RUSTWAKE TEAM',s.stopping?'STOPPED':here?'BOUND · this session':bound?'BOUND · another session':'NOT BOUND · /rustwake-team bind'];
 const tools=Array.isArray(s.guarded_wait_tools)?s.guarded_wait_tools:[];
 lines.push(`Wait guard: ${tools.length?'mapped ('+tools.length+')':'not configured'}`);
 if(bound&&!here){lines.push('Open the bound coordinator for telemetry.');return lines.join('\n');}
 const o=s.observation;
 const seconds=age(o?.observed_at,now);
 const scoped=here&&o?.coordinator_session_id===sessionID;
 const fresh=scoped&&seconds!==null&&seconds<=120;
 lines.push(`Observation: ${!o?'missing':!scoped?'unscoped / previous session':seconds===null?'invalid timestamp':fresh?'fresh':'STALE'} (${label(seconds)})`);
 const capacity=o?.capacity_children;const active=o?.active_children;
 const valid=Number.isInteger(capacity)&&capacity>=0&&capacity<=3&&Number.isInteger(active)&&active>=0;
 lines.push(`Workers: ${fresh&&valid?`${active}/${capacity} child slots${active>capacity?' · OVER CAPACITY':''}`:'unknown'}`);
 if(fresh&&valid){
  lines.push(`Model sessions: ${active+1}/${capacity+1} incl. coordinator`);
  const workers=Array.isArray(o.workers)?o.workers:[];
  for(const w of workers.slice(0,3))lines.push(`${clean(w.role,20)} · ${clean(w.task_id,24)} · ${clean(w.status,18)}`);
  if(workers.length>3)lines.push(`+${workers.length-3} additional records`);
  lines.push(`Ready assignments: ${Array.isArray(o.runnable_task_ids)?o.runnable_task_ids.length:'unknown'}`);
  if(active<capacity&&o.idle_reasons?.length)lines.push(`Idle: ${clean(o.idle_reasons[0],90)}`);
 }
 lines.push(`Sponsor inbox: ${s.sponsor_inbox??'unknown'}`);
 const boardAge=age(s.board_updated_at,now);
 lines.push(`Board: ${label(boardAge)}${boardAge!==null&&boardAge>600?' · STALE':''}`);
 lines.push('Observed state, not a live worker guarantee.');
 return lines.join('\n');
}
