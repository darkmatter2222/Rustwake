import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMetrics } from './team-metrics.mjs';

export const states = ['inbox','triaged','ready','implementing','review','rework','accepted','published','deployed','measured','blocked','deferred','rejected'];
const edges = {
 inbox:['triaged','deferred','rejected'],triaged:['ready','deferred','rejected','blocked'],
 ready:['implementing','blocked','deferred'],implementing:['review','blocked'],
 review:['accepted','rework','blocked'],rework:['ready','implementing','blocked','deferred'],
 accepted:['published','rework','blocked'],published:['deployed','measured','rework','blocked'],
 deployed:['measured','rework','blocked'],measured:['triaged'],blocked:['triaged','ready','implementing','review','accepted','published','deployed','rework','deferred'],
 deferred:['triaged','rejected'],rejected:['triaged']
};
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export function validate(b) {
 const errors=[]; const need=(ok,msg)=>{if(!ok)errors.push(msg);};
 need(b.schema_version===1,'schema_version must be 1');
 need(Number.isInteger(b.max_active_sessions)&&b.max_active_sessions>=1&&b.max_active_sessions<=4,'session cap must be 1..4 including coordinator');
 need(Number.isFinite(Date.parse(b.updated_at)),'updated_at must be a timestamp');
 need(Array.isArray(b.tickets),'tickets must be an array');
 if(!Array.isArray(b.tickets)) return errors;
 const sessions=b.runtime?.sessions;
 need(Array.isArray(sessions),'runtime.sessions must be an array');
 if(Array.isArray(sessions)) {
  need(sessions.length+1<=b.max_active_sessions,'active children plus coordinator exceed cap');
  need(new Set(sessions.map(s=>s.session_id)).size===sessions.length,'duplicate session');
  for(const s of sessions) need(s.session_id&&s.task_id&&Number.isInteger(s.generation)&&s.generation>0,'session requires identity/task/generation');
 }
 const ids=new Set(b.tickets.map(t=>t.id));need(ids.size===b.tickets.length,'duplicate ticket id');
 need(b.tickets.filter(t=>t.status==='ready').length<=5,'more than five ready tasks');
 for(const t of b.tickets){
  const n=msg=>`${t.id}: ${msg}`;
  need(typeof t.id==='string'&&/^[A-Z]+-\d+$/.test(t.id),n('invalid id'));
  for(const k of ['title','type','owner','player_problem','hypothesis'])need(typeof t[k]==='string'&&t[k].length>0,n(`missing ${k}`));
  need(['P0','P1','P2','P3'].includes(t.priority),n('invalid priority'));
  need(states.includes(t.status),n('invalid status'));
  need(Number.isInteger(t.generation)&&t.generation>=0,n('invalid generation'));
  for(const k of ['acceptance','scope','non_goals','dependencies','evidence','history'])need(Array.isArray(t[k]),n(`${k} must be an array`));
  need(t.acceptance?.length>0,n('acceptance required'));
  for(const d of t.dependencies??[])need(ids.has(d)&&d!==t.id,n(`invalid dependency ${d}`));
  if(['ready','implementing','review','accepted','published','deployed','measured'].includes(t.status))need(t.product_approved===true,n('product intent approval required'));
  if(['review','accepted','published','deployed','measured'].includes(t.status))need(sha(t.candidate_sha),n('full candidate SHA required'));
  if(['accepted','published','deployed','measured'].includes(t.status))need(t.review_verdict==='accept'&&t.evidence?.length>0,n('independent acceptance evidence required'));
  if(['published','deployed','measured'].includes(t.status))need(sha(t.published_sha),n('full published SHA required'));
  if(t.status==='deployed')need(sha(t.deployed_sha),n('full deployed SHA required'));
  if(t.status==='measured')need(typeof t.outcome==='string'&&t.outcome.length>0,n('outcome decision required'));
  if(['blocked','deferred','rejected'].includes(t.status))need(typeof t.disposition_reason==='string'&&t.disposition_reason.length>0,n('disposition_reason required'));
  const h=t.history??[];need(h.length>0,n('history required'));
  for(let i=0;i<h.length;i++){
   const e=h[i];need(e.actor&&e.reason&&Number.isFinite(Date.parse(e.at)),n('invalid history evidence'));
   need(states.includes(e.to_state),n('invalid history target'));
   if(i===0)need(e.from_state===null,n('initial event starts at null'));
   else {need(e.from_state===h[i-1].to_state,n('broken history chain'));need(edges[e.from_state]?.includes(e.to_state),n('illegal transition'));}
  }
  if(h.length)need(h.at(-1).to_state===t.status,n('history does not match status'));
 }
 const visiting=new Set(),done=new Set(),byId=new Map(b.tickets.map(t=>[t.id,t]));
 const walk=id=>{if(visiting.has(id)){errors.push('dependency cycle at '+id);return;}if(done.has(id))return;visiting.add(id);for(const d of byId.get(id)?.dependencies??[])if(byId.has(d))walk(d);visiting.delete(id);done.add(id);};
 for(const id of ids)walk(id);
 return errors;
}
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md = s=>String(s??'').replace(/[|\r\n]/g,' ');
export function render(b){
 const metrics=computeMetrics(b);
 const fmt=(v,suffix='')=>v===null?'unknown':`${Number(v.toFixed(1))}${suffix}`;
 const metricLines=['## Team efficiency (last 24 hours)','',`Published tickets: **${metrics.published_tickets}** · Deployed tickets: **${metrics.deployed_tickets}** · Prospectively estimated points published: **${fmt(metrics.story_points_published)}**`,`Median implementation-to-publication: **${fmt(metrics.median_cycle_hours,' h')}** · Tickets returned to rework: **${metrics.reworked_tickets}**`,`Observed child-slot utilization: **${fmt(metrics.utilization_percent,'%')}** over ${fmt(metrics.observed_minutes,' min')} sampled (${fmt(metrics.coverage_percent,'%')} window coverage). Runtime telemetry: **${metrics.live_status}**.`,`${metrics.unestimated_published_tickets} published ticket(s) have no valid pre-work estimate; no retrospective points are fabricated.`,metrics.notes,''];
 const metricsHtml=`<section aria-label="Team efficiency"><h2>Delivery and utilization · 24 hours</h2><p>Published ${metrics.published_tickets} · deployed ${metrics.deployed_tickets} · estimated points ${fmt(metrics.story_points_published)} · median cycle ${fmt(metrics.median_cycle_hours,' h')} · rework ${metrics.reworked_tickets}</p><p>Child-slot utilization ${fmt(metrics.utilization_percent,'%')} · observed ${fmt(metrics.observed_minutes,' min')} · coverage ${fmt(metrics.coverage_percent,'%')} · ${esc(metrics.live_status)}</p><p>Unknown means no reliable evidence. Estimates count only when recorded before implementation. This board refreshes every 30 seconds; a refresh is not a new runtime observation.</p></section>`;
 const lines=['# Rustwake team board','','Generated from `work/backlog.json`; do not edit this view manually. This is a published snapshot, not proof of live sessions.','',`**${b.sprint.id}: ${b.sprint.goal}** — ${b.sprint.status}`,`Session cap: **${b.max_active_sessions} total including coordinator**. Runtime: **${b.runtime.status}**. Snapshot: ${b.updated_at}.`,'',`[Visual board](board.html) · [Canonical JSON](backlog.json) · [Legacy findings](BOARD-legacy.md) · [Sprint plan](product/SPRINT-002.md)`,'','| ID | Priority | State | Role | Player outcome |','|---|---|---|---|---|',...b.tickets.map(t=>`| ${t.id} | ${t.priority} | ${t.status} | ${t.owner} | ${md(t.title)} |`),'',...metricLines,'## Release evidence','',`Last inspected source: \`${b.publication.inspected_head}\`.`,`Last evidenced deployed source: \`${b.publication.deployed_sha}\`.`,`[Play](${b.publication.url}) · [Receipt](../${b.publication.receipt})`,b.publication.verification,'','Every role can submit feedback. Product owns priority; PM owns scheduling; release engineer publishes. Acceptance, publication, deployment and measured outcomes remain distinct.',''];
 const cards=b.tickets.map(t=>`<article data-state="${esc(t.status)}"><small>${esc(t.id)} · ${esc(t.priority)} · ${esc(t.owner)}</small><h3>${esc(t.title)}</h3><span class="pill">${esc(t.status)}</span><p>${esc(t.player_problem)}</p><details><summary>Hypothesis and acceptance</summary><p>${esc(t.hypothesis)}</p><ul>${t.acceptance.map(a=>`<li>${esc(a)}</li>`).join('')}</ul><p>Dependencies: ${esc(t.dependencies.join(', ')||'none')}</p><p>Evidence: ${t.evidence.map(esc).join(', ')}</p></details></article>`).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>Rustwake team board</title><style>body{margin:0;background:#101923;color:#e5edf5;font:16px system-ui}main{max-width:1300px;margin:auto;padding:28px}h1{margin-bottom:8px}p{line-height:1.5;color:#b7c8d8}a{color:#7edbe0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#1a2a38;border:1px solid #344c60;border-radius:12px;padding:20px}small{color:#83bdce}h3{line-height:1.3}.pill{background:#69532a;color:#ffe1a1;padding:4px 10px;border-radius:20px;font-size:13px}select{font:inherit;padding:10px;background:#213545;color:white;border:1px solid #638096;border-radius:6px;margin:12px 0 22px}summary{cursor:pointer;margin-top:16px}li{margin:8px 0;line-height:1.4}footer{margin-top:28px}article[hidden]{display:none}</style><main><small>RUSTWAKE / DEVELOPMENT STUDIO</small><h1>${esc(b.sprint.goal)}</h1><p>${esc(b.sprint.id)} · ${esc(b.sprint.status)} · maximum ${b.max_active_sessions} sessions including PM<br>Published snapshot ${esc(b.updated_at)} · ${esc(b.runtime.status)}. This page does not monitor live agents.</p><p id="snapshot-age" data-time="${esc(b.updated_at)}">Snapshot age pending browser clock.</p>${metricsHtml}<label for="state">Filter stage </label><select id="state"><option value="all">All stages</option>${states.map(s=>`<option>${s}</option>`).join('')}</select><div class="grid">${cards}</div><footer><a href="BOARD.md">Markdown board</a> · <a href="backlog.json">Canonical JSON</a> · <a href="../README.md">Project README</a><p>Product → development → QA/player feedback → release → measured outcome. Deferred ideas remain visible in the canonical backlog.</p></footer></main><script>const age=document.querySelector('#snapshot-age');function refreshAge(){const seconds=Math.max(0,(Date.now()-Date.parse(age.dataset.time))/1000);age.textContent='Snapshot age: '+Math.floor(seconds/60)+' minutes'+(seconds>300?' — stale; awaiting publication':'');}refreshAge();setInterval(refreshAge,10000);document.querySelector('#state').addEventListener('change',e=>document.querySelectorAll('article').forEach(a=>a.hidden=e.target.value!=='all'&&a.dataset.state!==e.target.value));</script></html>\n`;
 return {'work/BOARD.md':lines.join('\n'),'work/board.html':html};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const b=JSON.parse(fs.readFileSync(path.join(root,'work/backlog.json'),'utf8'));
 const errors=validate(b);if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
 else {for(const [p,content]of Object.entries(render(b))){const f=path.join(root,p);if(process.argv.includes('--check')){if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==content){console.error('Stale generated file: '+p);process.exitCode=1;}}else fs.writeFileSync(f,content);}if(!process.exitCode)console.log('Team board valid; '+(process.argv.includes('--check')?'generated views current':'views generated'));}
}

