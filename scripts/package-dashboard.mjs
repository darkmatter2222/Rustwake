import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {computeMetrics} from './team-metrics.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeNumber=v=>Number.isFinite(v)&&v>=0?v:null;
export function publicSnapshot(board,sha,now=new Date().toISOString()){
 if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Full immutable source SHA required');
 // Explicit allowlist. Never publish sponsor text, internal evidence, session IDs,
 // infrastructure details, raw backlog, usernames or arbitrary narrative fields.
 const roles=new Set(['coordinator','developer','reviewer','player','product-owner','release-engineer']);
 const states=new Set(['inbox','triaged','ready','implementing','review','rework','accepted','published','deployed','measured','blocked','deferred','rejected']);
 const measured=computeMetrics(board,{now});
 const metrics=Object.fromEntries(['published_tickets','deployed_tickets','story_points_published','median_cycle_hours','reworked_tickets','utilization_percent','coverage_percent','observed_minutes'].map(k=>[k,safeNumber(measured[k])]));
 return {version:1,metrics,source_sha:sha,packaged_at:now,snapshot_at:board.updated_at,max_sessions:4,
  label:'Rustwake development progress',
  tickets:(board.tickets??[]).map(t=>({id:/^[A-Z]+-\d+$/.test(t.id)?t.id:'unknown',status:states.has(t.status)?t.status:'unknown',role:roles.has(t.owner)?t.owner:'team',points:safeNumber(t.estimate?.points),
   // A title is public only after the PO explicitly approves that exact field.
   title:typeof t.public_title==='string'?t.public_title.slice(0,160):'Work item'})),
  telemetry:'Published snapshot, not a live connection to local agent sessions'};
}
export function page(data){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>Rustwake team</title><style>body{background:#101923;color:#edf4fa;font:16px system-ui;margin:0}main{max-width:1100px;margin:auto;padding:28px}a{color:#80e5df}p,small{color:#afc4d5}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #334957}header{padding-bottom:24px}code{overflow-wrap:anywhere}.note{padding:14px;background:#203543;border-radius:8px}h1{margin-bottom:8px}</style></head><body><main><header><small>RUSTWAKE / AUTONOMOUS STUDIO</small><h1>Development progress</h1><a href="../">Play Rustwake</a><p>Up to four active sessions including the coordinator. Auto-refresh every 60 seconds.</p><p class="note">${esc(data.telemetry)}. Snapshot: <time>${esc(data.snapshot_at)}</time>. <span id="age"></span></p></header><section class="note"><strong>Trailing 24-hour delivery</strong><p>${Object.entries(data.metrics).map(([k,v])=>`${esc(k.replaceAll('_',' '))}: ${v===null?'unknown':Math.round(v*100)/100}`).join(' · ')}</p><small>Utilization covers observed intervals only. Story points require an estimate recorded before implementation.</small></section><table><thead><tr><th>Item</th><th>Stage</th><th>Role</th><th>Points</th></tr></thead><tbody>${data.tickets.map(t=>`<tr><td><strong>${esc(t.id)}</strong><br>${esc(t.title)}</td><td>${esc(t.status)}</td><td>${esc(t.role)}</td><td>${t.points??'not estimated'}</td></tr>`).join('')}</tbody></table><p>Artifact source: <code>${esc(data.source_sha)}</code>. This is the dashboard artifact source, not a claim that every ticket has shipped.</p></main><script>const date=Date.parse(document.querySelector('time').textContent);function age(){const minutes=Math.max(0,Math.floor((Date.now()-date)/60000));document.querySelector('#age').textContent=Number.isFinite(minutes)?'Age: '+minutes+' min'+(minutes>10?' — stale; team may be offline.':''): 'Age unknown';}age();setInterval(age,10000);</script></body></html>\n`;}
export function packageDashboard(root,sha){
 const dist=path.join(root,'dist');if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('Build dist/index.html before packaging');
 const data=publicSnapshot(JSON.parse(fs.readFileSync(path.join(root,'work/backlog.json'),'utf8')),sha);
 const out=path.join(dist,'team');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'index.html'),page(data));fs.writeFileSync(path.join(out,'status.json'),JSON.stringify(data,null,2)+'\n');
 const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('No symlinks in release');if(e.isDirectory())walk(p);else if(e.isFile()&&e.name!=='release-manifest.json')files.push({path:path.relative(dist,p).split(path.sep).join('/'),sha256:createHash('sha256').update(fs.readFileSync(p)).digest('hex'),bytes:fs.statSync(p).size});}}walk(dist);
 fs.writeFileSync(path.join(dist,'release-manifest.json'),JSON.stringify({version:1,source_sha:sha,files:files.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+'\n');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');packageDashboard(root,process.env.RUSTWAKE_SOURCE_SHA??process.argv[2]??'');console.log('Sanitized dashboard and release manifest packaged in dist/team');}
