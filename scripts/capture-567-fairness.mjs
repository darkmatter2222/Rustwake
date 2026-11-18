// #567 dispatch-fairness evidence capture — FRESH UNTOUCHED YARD, NO SEEDS.
//
// LIVE-SITE MODE (C3 motion half, issue 567 stays OPEN until product rules):
//   RUSTWAKE_LIVE_URL=https://home.darkmatter2222.com/rustwake/ \
//   node scripts/capture-567-fairness.mjs <expected-deployed-40-hex-sha>
// When RUSTWAKE_LIVE_URL is set the harness skips build+preview entirely and
// runs the SAME stamp/vehicle-motion gate against the DEPLOYED build. argv[0]
// (the expected deployed SHA) is REQUIRED; release-manifest.json source_sha is
// fetched over the same TLS path (httpsFetch from verify-live-release.mjs) and
// compared BEFORE any browser launch — a stale deployment is refused with a
// FAIL report and no browser process (capture-552-c2.mjs discipline).
// The fresh-untouched-yard discipline is KEPT in live mode: the starter yard
// (salvager + depot + generator + furnace with iron/fuel inputs + crane +
// market, road grid, HAULER-01/02/03) already has real work, so no save
// fixture is injected — the 552 fixture precedent exists for conditions that
// need a non-starter layout; C3 motion needs haulers doing real jobs, which
// the default player-reachable yard provides. The moved gate falsifies if not.
// Per-truck position deltas (net + path distance) and job-phase transitions
// are recorded per view in proof.motion.perTruck, with vacuity disclosures.
// reducedMotion:"reduce" is KEPT and disclosed: src/world.js sets
// truck.position from sim state UNCONDITIONALLY every frame; reduce parks
// only decorative channels (wheel spin/steer/bob/beacon, ART-02/03/04, crane,
// forklift, drone) — haulers still visibly traverse the yard.
//
// Proves against the REAL production build (pnpm build + vite preview of dist),
// at desktop 1440x900 and emulated phone 390x844 dpr2, that furnace OUTPUT
// freight reaches the depot bank unattended: bank steel strictly rises above
// the starter 20 within 120s of normal simulation, with visible truck motion.
//
// This is the capture the #558 sibling (scripts/capture-558-cooldown.mjs)
// explicitly could NOT take: its real-UI OUTPUT-side proof was blocked by the
// pre-existing dispatch-starvation defect (deliveryCandidates' stable
// building-order sort always preferred starter output candidates; 0 player
// output jobs in 120s on BOTH base and fix). #573 is that fix, so this is the
// first real-UI proof that the starter furnace's steel actually banks.
//
// State discipline (product ruling): the fresh untouched yard IS the default
// player-reachable state. NO seeds, NO builds, NO bank mutation, NO speed
// changes, NO hand-stocked inventory, NO save injection. Each view loads the
// app in a fresh browser context (empty localStorage) and just lets it run at
// normal speed. The only page-side instrumentation is a read-only rAF frame
// counter; all game readings come from the app's OWN periodic persist
// (SAVE_KEY, ~4.2s cadence) and its own fleetProbe observability stamp.
//
// Gate bar (product C-2): bank steel > 20, strictly rising from the starter
// 20. NOT equality with the node harness figure (84 @ t=120s): the browser
// steps at rAF granularity (dt capped 0.07s per frame) while measure-567.mjs
// steps at fixed 0.5s substeps, so the measured values legitimately differ.
// The measured number is reported and the granularity difference disclosed.
//
// Also reported read-only from the save: the furnace bay steel series (bay
// must not be monotonically piling — output is being hauled away) and the
// derived alarm ids via the pure src/alarms.js read model (no storage-4
// latch). Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — local
// production preview, NOT a release, NOT visual acceptance; sponsor G1
// screenshot+motion review (#276) is still owed. One headless
// Chromium/SwiftShader run; phone emulated, not physical.
import {chromium} from "playwright-core";
import {SAVE_KEY,INITIAL_BANK,CELL} from "../src/content.js";
import {alarmsState} from "../src/alarms.js";
import {httpsFetch} from "./verify-live-release.mjs";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import net from "node:net";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
// Live-site mode: RUSTWAKE_LIVE_URL + argv[0] expected deployed SHA (required).
const LIVE_URL=process.env.RUSTWAKE_LIVE_URL?new URL(process.env.RUSTWAKE_LIVE_URL).href:null;
const EXPECTED_SHA=process.argv[2]||null;
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||resolve(ROOT,LIVE_URL?"docs/evidence/567-c3-motion":"docs/evidence/567-dispatch-fairness"));
// Port 4183 is a FOREIGN leaked process (not ours) — never bind it, never kill
// it. Default 4569; honour RUSTWAKE_PREVIEW_PORT; if the requested port is
// occupied by something we did not start, pick another free port and disclose.
const FORBIDDEN_PORT=4183;
const requestedPort=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4569;
const portFree=p=>new Promise(res=>{const s=net.createServer();s.once("error",()=>res(false));s.once("listening",()=>s.close(()=>res(true)));s.listen(p,"127.0.0.1");});
let PORT=requestedPort,portNote=null;
if(!LIVE_URL){
 if(PORT===FORBIDDEN_PORT){portNote="requested port 4183 is a foreign leaked process — refused, fell back to 4569";PORT=4569;}
 if(!(await portFree(PORT))){
  const from=PORT;let found=null;
  for(let p=4570;p<=4599;p++){if(p===FORBIDDEN_PORT)continue;if(await portFree(p)){found=p;break;}}
  if(found==null)throw Error("no free preview port found (requested "+from+" occupied; scanned 4570-4599)");
  portNote=(portNote?portNote+"; ":"")+"requested port "+from+" occupied by a process we did not start — using "+found;
  PORT=found;
 }
}
const HOST=LIVE_URL||`http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN=new URL(HOST).origin;
// Provenance: derived from git rev-parse HEAD at capture time. Never an env
// var, never a hand-written constant — E must be captured with HEAD == H.
const SHA=execSync("git rev-parse HEAD",{cwd:ROOT,encoding:"utf8"}).trim();
if(!/^[0-9a-f]{40}$/.test(SHA))throw Error("git rev-parse HEAD did not yield a 40-hex SHA: "+SHA);
// Provenance is SELF-VERIFYING (issue 567 C3 rework): record the harness blob
// id at HEAD alongside harness_sha. In live mode, BEFORE any browser launch,
// refuse a dirty TRACKED tree and assert blob-at-harness_sha == HEAD blob ==
// hash of the file ACTUALLY RUNNING on disk. The original defect (harness_sha
// = main while the live-mode harness was modified-but-uncommitted) fails the
// running-file comparison even if the dirty-tree guard were bypassed.
const HARNESS_REL="scripts/capture-567-fairness.mjs";
const HARNESS_BLOB=execSync("git rev-parse HEAD:"+HARNESS_REL,{cwd:ROOT,encoding:"utf8"}).trim();
if(!/^[0-9a-f]{40}$/.test(HARNESS_BLOB))throw Error("git rev-parse HEAD:"+HARNESS_REL+" did not yield a 40-hex blob id: "+HARNESS_BLOB);
const STARTER_STEEL=INITIAL_BANK.steel; // 20 — the product gate bar baseline
const SIM_TARGET=120;   // seconds of SIM elapsed (normal speed, real wall clock)
const WALL_CAP_MS=240000; // generous per-view wall cap; fail loud on timeout
const FURNACE_ID=4;     // starter furnace (STARTER_BUILDINGS); storage-4 alarm subject

const report={version:1,issue:567,task:"dispatch fairness — furnace output freight reaches the bank unattended on a fresh untouched yard (real production build)",
 mode:LIVE_URL?"hosted-live":"production-preview",
 build:LIVE_URL?"hosted-live":"production-preview",source_sha:LIVE_URL?null:SHA,
 live_url:LIVE_URL,expected_source_sha:EXPECTED_SHA,manifest_source_sha:null,harness_sha:SHA,harness_blob:HARNESS_BLOB,
 releaseCitation:LIVE_URL&&EXPECTED_SHA==="9baecedf32175110189bda4e08bbb09cf5ade855"?{liveSha:EXPECTED_SHA,receiptCommentA:6990127018,receiptCommentB:6990286378,note:"release chain already verified (PR 583 release Receipts A/B, live-verified at release) — cited, NOT re-verified by this capture"}:null,
 port:LIVE_URL?null:PORT,portNote,started:new Date().toISOString(),
 views:[],status:"UNKNOWN",errors:[],
 gate:{bar:"bank steel > "+STARTER_STEEL+" (strictly rising from the starter "+STARTER_STEEL+") by sim elapsed >= "+SIM_TARGET+"s",
  nodeReference:{harness:"scripts/measure-567.mjs",bankSteelAt120s:84,substep:"0.5s fixed"},
  granularityDisclosure:"The browser advances at rAF granularity (dt capped 0.07s per frame); the node harness steps at fixed 0.5s substeps. Measured browser values legitimately differ from the node figure 84. The gate asserted here is the product bar (> 20, strictly rising), NOT equality with 84 — requiring 84 would be a fabricated gate."},
 limitations:[
  LIVE_URL
   ?"Hosted-live capture at the DEPLOYED SHA: release-manifest.json source_sha gated BEFORE any browser launch; the release chain itself is cited (PR 583 release receipts 6990127018 / 6990286378, live-verified at release), NOT re-verified here. This is NOT a release action and NOT visual acceptance"
   :"Local production preview only (pnpm build + vite preview of dist) — the live hosted receipt is produced at release by the release engineer; this is NOT a release and NOT visual acceptance",
  ...(LIVE_URL?["Live fresh context dismisses the first-run intro overlay (Enter the yard) if present — the ONLY UI input; no builds, no seeds, no save injection, no bank/speed/inventory mutation. The fresh starter yard already has real work (salvager, furnace with iron/fuel inputs, depot, road grid, HAULER-01/02/03), so no fixture is injected; the moved gate falsifies if the yard produced no motion"]:[]),
  "One headless Chromium/SwiftShader run; phone view is EMULATED 390x844 dpr2 (isMobile/hasTouch), not a physical device; no physical display",
  "Numeric proofs do not certify visual fidelity or art parity — sponsor screenshot+motion review required at G1 (#276), still owed",
  "FRESH UNTOUCHED YARD: no seeds, no builds, no bank mutation, no speed changes, no hand-stocked inventory, no save injection. Each view is a fresh browser context with empty localStorage; the app's own createGame starter yard runs at normal speed. The fresh yard IS the default player-reachable state (product ruling)",
  "Browser rAF granularity differs from the node harness's 0.5s substeps, so the measured bank-steel value differs from the node figure 84; the asserted gate is the product bar (> 20, strictly rising from the starter 20), and the measured number is reported as-is",
  "Game readings come from the app's own periodic persist (SAVE_KEY, ~4.2s wall cadence) and its own fleetProbe stamp (~270ms); stamp elapsed values are therefore quantized to the persist cadence. The only page-side instrumentation is a read-only rAF frame counter",
  "storage-4 is DERIVED, not stored: the save does not persist alarm state, so alarm ids are computed read-only from each persisted save via the pure src/alarms.js read model (alarmsState never mutates g)",
  "This capture proves the OUTPUT-side player-visible promise that the #558 sibling harness disclosed as BLOCKED by the pre-#573 dispatch-starvation defect (0 player output jobs in 120s on both base and fix). Deterministic gate coverage lives in tests/dispatchGate567.test.mjs + tests/dispatchFairness.test.mjs and scripts/measure-567.mjs"]};

let child,browser;
await mkdir(OUT,{recursive:true});
try{
 if(LIVE_URL){
  // ---- Provenance gates BEFORE any browser launch — same discipline and
  // placement as the manifest gate below. A dirty TRACKED tree means the
  // running harness is not the committed one: refuse. Untracked files (the
  // capture's own output, pnpm-lock.yaml) must NOT trip this, hence
  // --untracked-files=no.
  const dirty=execSync("git status --porcelain --untracked-files=no",{cwd:ROOT,encoding:"utf8"}).trim();
  if(dirty)throw Error("live mode refuses a dirty TRACKED tree (no browser launched) — commit the harness before capturing. Offending paths:\n"+dirty);
  // ---- Harness provenance self-check (falsifiable; would have caught the
  // original harness_sha misattribution). git hash-object reads the WORKING
  // TREE file, so a modified-but-uncommitted harness fails here even if the
  // dirty-tree guard above were bypassed. All three ids must be valid 40-hex
  // and equal — undefined/empty can never pass.
  const blobAtSha=execSync("git rev-parse "+SHA+":"+HARNESS_REL,{cwd:ROOT,encoding:"utf8"}).trim();
  const runningBlob=execSync('git hash-object "'+resolve(ROOT,HARNESS_REL)+'"',{cwd:ROOT,encoding:"utf8"}).trim();
  if(!/^[0-9a-f]{40}$/.test(blobAtSha)||!/^[0-9a-f]{40}$/.test(runningBlob))
   throw Error("harness provenance self-check got non-blob ids (no browser launched): atHarnessSha="+blobAtSha+" runningFile="+runningBlob);
  if(blobAtSha!==HARNESS_BLOB||runningBlob!==HARNESS_BLOB)
   throw Error("harness provenance self-check FAILED (no browser launched): blob at harness_sha "+SHA+" = "+blobAtSha+", running file = "+runningBlob+", recorded harness_blob = "+HARNESS_BLOB);
  // The harness blob at harness_sha must actually CONTAIN live mode — zero
  // RUSTWAKE_LIVE_URL occurrences while RUSTWAKE_LIVE_URL is set is the
  // original reachable-wrong-action defect: a reproducer following the
  // recorded SHA could not run live mode at all.
  const blobSrc=execSync("git cat-file blob "+HARNESS_BLOB,{cwd:ROOT,encoding:"utf8"});
  const liveModeHits=(blobSrc.match(/RUSTWAKE_LIVE_URL/g)||[]).length;
  report.provenanceSelfCheck={harness_sha:SHA,harness_blob:HARNESS_BLOB,blobAtHarnessSha:blobAtSha,runningFileBlob:runningBlob,
   trackedTreeClean:true,liveModeOccurrencesAtHarnessSha:liveModeHits,match:true};
  if(liveModeHits===0)throw Error("harness blob at harness_sha contains ZERO RUSTWAKE_LIVE_URL occurrences — live mode is not reproducible at the recorded SHA (no browser launched)");
  // ---- Manifest gate BEFORE any browser launch (capture-552-c2 discipline) ----
  if(!EXPECTED_SHA||!/^[0-9a-f]{40}$/.test(EXPECTED_SHA))
   throw Error("live mode requires argv[0] = expected deployed 40-hex SHA (no browser launched)");
  const manifestUrl=new URL("release-manifest.json",HOST).href;
  const res=await httpsFetch(manifestUrl);
  if(res.status!==200)throw Error("release-manifest.json unreachable: HTTP "+res.status+" (no browser launched)");
  const m=JSON.parse(res.buffer.toString("utf8"));
  const manifestSha=String(m.source_sha||"");
  report.manifest_source_sha=manifestSha;
  if(!/^[0-9a-f]{40}$/.test(manifestSha))throw Error("release-manifest.json malformed source_sha: "+manifestSha+" (no browser launched)");
  if(manifestSha!==EXPECTED_SHA)
   throw Error("live manifest source_sha "+manifestSha+" != expected deployed SHA "+EXPECTED_SHA+" — refusing to capture a stale deployment (no browser launched)");
  report.source_sha=manifestSha;
 }else{
  // REAL production build — never the dev server.
  const t0=Date.now();
  const buildLog=execSync("pnpm build",{cwd:ROOT,encoding:"utf8",timeout:300000,stdio:["ignore","pipe","pipe"]});
  report.buildMs=Date.now()-t0;
  report.buildLogTail=String(buildLog).trim().split("\n").slice(-6).join("\n");
  child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{cwd:ROOT,stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
  let open=false;
  for(let i=0;i<70;i++){try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!open)throw Error("Production preview did not become available on "+PORT);
 }
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 for(const v of [
  {name:"desktop",viewport:{width:1440,height:900},dpr:1,isMobile:false,touch:false},
  {name:"phone",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true},
 ]){
  const view={name:v.name,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,screenshots:[],proof:{}};
  const errs=[],failed=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  // Read the app's OWN persisted save (read-only). Returns null until the
  // first periodic persist (~4.2s wall).
  const readSave=page=>page.evaluate(k=>{try{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;}catch{return null;}},SAVE_KEY);
  const readProbe=page=>page.evaluate(()=>{try{return JSON.parse(document.body.dataset.fleetProbe||"null");}catch{return null;}});
  const readFrames=page=>page.evaluate(()=>window.__rwFrameCount??0);
  const stamp=async(page,label)=>{
   const save=await readSave(page);
   if(!save)throw Error("no persisted save at stamp "+label);
   const probe=await readProbe(page);
   const frames=await readFrames(page);
   const al=alarmsState(save); // pure read model over the persisted save; never mutates
   const furnace=(save.buildings||[]).find(b=>b.id===FURNACE_ID&&b.type==="furnace");
   const s={label,elapsed:save.elapsed,bankSteel:save.bank?.steel??null,
    furnaceSteel:furnace?(furnace.inventory?.steel??0):null,
    alarmIds:al.kind==="ready"?(al.alarms||[]).map(a=>a.id):["<"+al.kind+">"],
    frames,vehicles:(probe?.vehicles||[]).map(x=>({id:x.id,x:x.x,z:x.z,job:x.job?{resource:x.job.resource,sourceId:x.job.sourceId,destId:x.job.destId,phase:x.job.phase}:null})),
    screenshot:await shot(page,label)};
   view.proof.stamps.push(s);
   return s;
  };
  const viewStart=Date.now();
  // Fresh context: empty localStorage, NO seed script. The untouched yard.
  const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
  const page=await ctx.newPage();
  page.on("pageerror",e=>errs.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
  page.on("requestfailed",r=>{try{if(new URL(r.url()).origin===ORIGIN)failed.push(r.url());}catch{}});
  try{
   await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:LIVE_URL?45000:30000});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:30000});
   // First-run intro overlay (live fresh context): dismiss if present. This is
   // the ONLY UI input — no builds, no seeds, no bank/speed/inventory mutation.
   const introBtn=page.getByRole("button",{name:/Enter the yard/});
   view.proof.introDismissed=!!(await introBtn.count());
   if(view.proof.introDismissed)await introBtn.click();
   // reducedMotion evidence: the context asks for "reduce"; record the
   // renderer's OWN dataset stamps proving what the world actually applied.
   view.proof.reducedMotion={contextSetting:"reduce",
    canvasDataset:await page.locator(".world-canvas").evaluate(c=>({rigReducedMotion:c.dataset.rigReducedMotion,art02Reduced:c.dataset.art02Reduced,craneReducedMotion:c.dataset.craneReducedMotion})),
    disclosure:"reduce KEPT per capture-live precedent. src/world.js sets truck.position from sim state UNCONDITIONALLY every frame (world.js:1454); stepTruck under reduce parks only wheel spin/steer/suspension bob/beacon (world.js:736-739). Haulers therefore visibly traverse the yard under reduce; ART-02/03/04 machine channels, crane, forklift lift and drone hover park. Per-truck position deltas below are the motion evidence; decorative-channel motion review belongs to sponsor G1 (#276), still owed."};
   // Read-only frame counter (observer only; never touches game state).
   await page.evaluate(()=>{window.__rwFrameCount=0;const t=()=>{window.__rwFrameCount++;requestAnimationFrame(t);};requestAnimationFrame(t);});
   view.proof.stamps=[];
   // Wait for the app's first periodic persist, then stamp the fresh yard.
   await page.waitForFunction(k=>{try{return !!localStorage.getItem(k);}catch{return false;}},SAVE_KEY,{timeout:30000,polling:500});
   const first=await stamp(page,"fresh-yard");
   // Stamp at sim-elapsed thresholds; poll the persisted save between stamps.
   for(const target of [30,60,90,SIM_TARGET]){
    let save=null;
    while(Date.now()-viewStart<WALL_CAP_MS){
     save=await readSave(page);
     if(save&&save.elapsed>=target)break;
     await page.waitForTimeout(1500);
    }
    if(!save||save.elapsed<target)
     throw Error("timeout: sim elapsed "+(save?save.elapsed:"<no save>")+" < "+target+" after "+(Date.now()-viewStart)+"ms wall (cap "+WALL_CAP_MS+"ms)");
    await stamp(page,"t"+target);
   }
   const stamps=view.proof.stamps;
   // ---- frames advancing between every consecutive stamp ----
   for(let i=1;i<stamps.length;i++)
    if(!(stamps[i].frames>stamps[i-1].frames))
     throw Error("frames not advancing between stamps "+stamps[i-1].label+" and "+stamps[i].label+": "+JSON.stringify(stamps.map(s=>({label:s.label,frames:s.frames}))));
   view.proof.frames={perStamp:stamps.map(s=>({label:s.label,frames:s.frames})),advancing:true};
   // ---- motion proof: some truck moved across >=3 stamps (sibling pattern) ----
   const base=stamps[0].vehicles;
   const moved=[];
   for(let i=1;i<stamps.length;i++)for(const m of stamps[i].vehicles){
    const b0=base.find(x=>x.id===m.id);
    if(b0&&(m.x!==b0.x||m.z!==b0.z))moved.push({stamp:stamps[i].label,id:m.id,from:{x:b0.x,z:b0.z},to:{x:m.x,z:m.z}});
   }
   if(stamps.length<3)throw Error("fewer than 3 stamps: "+stamps.length);
   if(!moved.length)throw Error("no truck moved across stamps: "+JSON.stringify(stamps.map(s=>({label:s.label,vehicles:s.vehicles}))));
   view.proof.motion={stamps:stamps.length,movedCount:moved.length,moved:moved.slice(0,12),assertion:"PASS"};
   // ---- C3 motion record: per-truck deltas + job-phase transitions ----
   // Distances in cell units (fleetProbe x/z); world units = cells * CELL.
   // Path distance sums consecutive-steps; net is first→last. A round trip has
   // net 0 but path > 0 — path is the motion measure, net alone would be
   // vacuous. Phase sampling is quantized to the ~4.2s persist cadence, so
   // short phases can be missed between stamps (disclosed, not hidden).
   const truckIds=[...new Set(stamps.flatMap(s=>s.vehicles.map(v=>v.id)))].sort((a,b)=>a-b);
   const perTruck=truckIds.map(id=>{
    const series=stamps.map(s=>{const v=s.vehicles.find(x=>x.id===id);return v?{label:s.label,elapsed:s.elapsed,x:v.x,z:v.z,phase:v.job?v.job.phase:null,resource:v.job?v.job.resource:null}:null;}).filter(Boolean);
    const first=series[0],last=series[series.length-1];
    let pathCells=0,maxStepCells=0;
    for(let i=1;i<series.length;i++){const d=Math.hypot(series[i].x-series[i-1].x,series[i].z-series[i-1].z);pathCells+=d;if(d>maxStepCells)maxStepCells=d;}
    const transitions=[];
    for(let i=1;i<series.length;i++)if(series[i].phase!==series[i-1].phase)transitions.push({at:series[i].label,from:series[i-1].phase,to:series[i].phase});
    return {id,from:{label:first.label,x:first.x,z:first.z},to:{label:last.label,x:last.x,z:last.z},
     netCells:Math.hypot(last.x-first.x,last.z-first.z),pathCells,maxStepCells,
     netWorldUnits:Math.hypot(last.x-first.x,last.z-first.z)*CELL,pathWorldUnits:pathCells*CELL,
     phaseSeries:series.map(p=>({label:p.label,phase:p.phase})),transitions,series};
   });
   const parkedTrucks=perTruck.filter(t=>t.pathCells===0).map(t=>t.id);
   const noTransitionTrucks=perTruck.filter(t=>!t.transitions.length).map(t=>t.id);
   view.proof.motion.perTruck=perTruck;
   view.proof.motion.vacuityNotes=[
    ...(parkedTrucks.length?["trucks "+parkedTrucks.join(",")+" never moved across stamps — their motion record is VACUOUS (disclosed, not deleted)"]:[]),
    ...(noTransitionTrucks.length?["trucks "+noTransitionTrucks.join(",")+" show no job-phase transition between stamps (persist-cadence quantization can miss short phases; disclosed)"]:[]),
    ...(perTruck.some(t=>t.netCells===0&&t.pathCells>0)?["some truck has net displacement 0 with path distance > 0 (round trip) — net alone would be vacuous; path distance is the motion measure"]:[]),
   ];
   // ---- the fairness gate: bank steel > 20, strictly rising from starter 20 ----
   const series=[{elapsed:0,steel:STARTER_STEEL,source:"INITIAL_BANK (starter baseline)"}]
    .concat(stamps.map(s=>({elapsed:s.elapsed,steel:s.bankSteel,source:"persisted save @ "+s.label})));
   if(series.some(x=>!Number.isFinite(x.steel)))throw Error("non-numeric bank steel in series: "+JSON.stringify(series));
   for(let i=1;i<series.length;i++)
    if(!(series[i].steel>=series[i-1].steel))throw Error("bank steel series not monotone non-decreasing: "+JSON.stringify(series));
   const finalSteel=series[series.length-1].steel;
   if(!(finalSteel>STARTER_STEEL))throw Error("GATE FAIL: bank steel "+finalSteel+" did not rise above the starter "+STARTER_STEEL+" by sim elapsed "+stamps[stamps.length-1].elapsed+"s: "+JSON.stringify(series));
   view.proof.bankSteel={series,final:finalSteel,elapsedAtRead:stamps[stamps.length-1].elapsed,gate:"PASS (> "+STARTER_STEEL+", strictly rising)",
    nodeComparison:{nodeFigure:84,browserMeasured:finalSteel,note:"rAF granularity vs 0.5s substeps — difference disclosed, equality NOT asserted"}};
   // ---- furnace bay: not monotonically piling (output is being hauled away) ----
   const bay=stamps.map(s=>({label:s.label,elapsed:s.elapsed,steel:s.furnaceSteel}));
   if(bay.some(x=>!Number.isFinite(x.steel)))throw Error("furnace bay steel not exposed in save: "+JSON.stringify(bay));
   const piling=bay.every((x,i)=>i===0||x.steel>bay[i-1].steel);
   if(piling)throw Error("furnace bay monotonically piling across all stamps (output never hauled): "+JSON.stringify(bay));
   view.proof.furnaceBay={id:FURNACE_ID,series:bay,max:Math.max(...bay.map(x=>x.steel)),notMonotonePiling:true,
    note:"read-only from the persisted save; bay steel rises and falls as hauls collect output"};
   // ---- no storage-4 alarm latched at any stamp (derived read-only) ----
   const latched=stamps.filter(s=>s.alarmIds.includes("storage-"+FURNACE_ID));
   if(latched.length)throw Error("storage-"+FURNACE_ID+" alarm present at stamps: "+JSON.stringify(latched.map(s=>({label:s.label,alarmIds:s.alarmIds}))));
   view.proof.storage4={latched:false,alarmIdsPerStamp:stamps.map(s=>({label:s.label,ids:s.alarmIds})),
    note:"alarms are derived, not persisted — computed read-only from each save via src/alarms.js alarmsState"};
   view.proof.wallMs=Date.now()-viewStart;
   view.proof.simElapsedAtFinal=stamps[stamps.length-1].elapsed;
   view.status=errs.length||failed.length?"FAIL":"PASS_NUMERIC_ONLY";
  }catch(e){
   view.status="FAIL";view.failure=String(e).slice(0,600);
   try{await shot(page,"failure");}catch{}
  }
  view.errors=errs;view.failedRequests=failed;
  report.views.push(view);
  await ctx.close();
 }
 report.status=report.views.every(x=>x.status==="PASS_NUMERIC_ONLY")&&!report.errors.length?"PASS_NUMERIC_ONLY":"FAIL";
}catch(e){report.status="FAIL";report.errors.push(String(e).slice(0,600));}
finally{
 try{if(browser)await browser.close();}catch{}
 try{if(child)child.kill();}catch{} // only the preview WE spawned
 report.finished=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,mode:report.mode,source_sha:report.source_sha,expected_source_sha:EXPECTED_SHA,manifest_source_sha:report.manifest_source_sha,harness_sha:SHA,harness_blob:HARNESS_BLOB,port:LIVE_URL?null:PORT,
  views:report.views.map(x=>({name:x.name,status:x.status,failure:x.failure||null,errors:x.errors.length,finalSteel:x.proof?.bankSteel?.final??null,
   movedCount:x.proof?.motion?.movedCount??null,
   perTruck:(x.proof?.motion?.perTruck||[]).map(t=>({id:t.id,netCells:+t.netCells.toFixed(3),pathCells:+t.pathCells.toFixed(3),phaseTransitions:t.transitions.length})),
   vacuityNotes:x.proof?.motion?.vacuityNotes||[]}))},null,2));
}
process.exit(report.status==="PASS_NUMERIC_ONLY"?0:1);
