// #558 dispatch-cooldown evidence capture — NO DECOY SEEDS.
// Proves against the REAL production build (vite preview), at desktop 1440x900
// and emulated phone 390x844 dpr2, driven through REAL dock clicks + physical
// canvas taps, that the cancel->dismantle window is normally winnable.
//
// RACE VARIANT CAPTURED: input-supply (depot -> player furnace). This is the
// same #558 defect (cancelFreight returns cargo exactly once, the next substep
// re-reserves the SAME source+resource pair) on the input side, which my
// cooldown covers identically (tests/dispatchCooldown.test.mjs c5). Measured
// in-node on the normal yard: clean base 6ebb7ff re-reserves the cancelled
// pair onto the player furnace on the very next 0.5s tick in 495/513 cancels
// (96.5%); with the fix, 0/32. The output-haul variant is proven deterministically
// in c1-c4; a real-UI OUTPUT-side capture is currently blocked by a SEPARATE
// pre-existing dispatch-starvation defect (deliveryCandidates' stable sort
// always prefers starter candidates in building-array order, so player
// machines are never served output hauls in the normal starter yard — 0 jobs
// in 120s on BOTH base and fix; filed as a follow-up, evidence on #567).
//
//  1) NORMAL YARD: createGame() untouched — all six starters, the generator,
//     all three trucks at NORMAL speeds, normal bank. One player furnace is
//     constructed through the public buildAt API (normal cost deducted) at a
//     legal road-adjacent site near yard center (phone-reachable) and assembled
//     with 8s of normal simulation. NO inventory hand-stocked, NO speed
//     altered, NO decoy candidates. Production and freight run live throughout.
//  2) LIVE JOB + REAL CANCEL: wait (condition-based, on the app's own
//     fleetProbe stamp writes) for a real resupply job whose DESTINATION is the
//     player furnace; cancel it through the REAL fleet panel. cancelProbe
//     (stamped INSIDE the transaction) proves exact-once source return:
//     bagAfter-bagBefore === amount and grand totals unchanged. Any OTHER pair
//     still referencing the machine (fuel resupply, rare steel haul) is
//     cancelled the same way — each cancel arms its own pair's cooldown.
//  3) COOLDOWN SUPPRESSION: for the next fresh stamps NO vehicle job
//     references the player machine (on base the dispatcher re-reserved the
//     cancelled pair on the very next substep).
//  4) RELOAD DURABILITY: page.reload() fires the app's pagehide persist; the
//     conditional seed script does NOT re-seed over the live save. Persisted
//     dispatchCooldowns entries are read back from localStorage and
//     post-reload stamps prove dispatch is still suppressed.
//  5) REAL TWO-STEP DISMANTLE inside the window: canvas-tap the machine, open
//     the confirm dialog (recovery rows exact; cargo rows bounded by one
//     furnace cycle against straddling probes — iron/fuel only decrease and
//     steel only grows while all referencing pairs are cooled), confirm. The
//     toast carries the sim's exact transaction refund; credits/stone bank
//     deltas are EXACT (no other flow produces them). Grand totals move by
//     recovery + the strict live-production envelope (<=1 salvager cycle and
//     <=1 cycle per furnace inside the ~0.5s probe straddle; hauls cancel out
//     of totals). The bank moves by WHOLE TRUCK HAULS (<=15 units accumulated
//     over many cycles), so bank deltas are checked by the exact four-ledger
//     manifest identity (bank + inventories + reserved + onboard === totals)
//     plus a haul-term envelope bounded by the before stamp's depot-bound cargo
//     and one haul cap per truck. Building spliced exactly once.
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — sponsor G1 visual review
// (#276) is still owed. One headless Chromium/SwiftShader run; phone emulated.
import {chromium} from "playwright-core";
import {createGame,buildAt,advanceGame,checkSite,nearestRoad,snapshot} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,WORLD_SIZE,SAVE_KEY,RESOURCE_BY_ID} from "../src/content.js";
import {projectGround,dismantleRefund,refundEntries} from "../src/inspector.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/558-dispatch-cooldown");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4183,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const BANK_KEYS=Object.keys(INITIAL_BANK);
const RECOVERY=dismantleRefund(BLUEPRINTS.furnace,{}); // {credits:144,iron:9,scrap:20,stone:8}
const NAME_TO_ID=Object.fromEntries(Object.entries(RESOURCE_BY_ID).map(([id,r])=>[r.name,id]));
const UNIT_TO_ID=Object.fromEntries(Object.entries(RESOURCE_BY_ID).map(([id,r])=>[r.unit,id]));
const report={version:1,issue:558,task:"cancel->dismantle window winnable via per-source dispatch cooldown (no decoy seeds)",
 build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 raceControl:{method:"in-node: normal createGame + public buildAt furnace @(10,10) + advanceGame(8); loop 600x0.5s, cancel the first live job with destId===playerFurnace, advance 0.5s, check whether the SAME source+resource pair re-reserves onto the player furnace",
  base_6ebb7ff:{cancels:513,samePairReReserveToPlayer:495},fix:{cancels:32,samePairReReserveToPlayer:0},
  note:"fix also observed 16 pre-existing in-flight depot:iron jobs to the STARTER furnace (cooldown gates NEW dispatch, never returns in-flight freight) and 15 other-resource (fuel) jobs to the player furnace, which the capture cancels pair-by-pair"},
 limitations:[
  "One headless Chromium/SwiftShader run; phone view is emulated 390x844 dpr2, not a physical device; no physical display",
  "Numeric proofs do not certify visual fidelity — sponsor screenshot+motion review required at G1 (#276)",
  "Local production preview only — the live hosted receipt is produced at release by the release engineer; this is NOT a release",
  "NO DECOY SEEDS: normal createGame yard, all starters/generator intact, all three trucks at normal speed, no hand-stocked inventory. The single player furnace is built through the public buildAt API (normal cost deducted) at a legal road-adjacent site near yard center and assembled with 8s of normal simulation; live production and freight run throughout",
  "Captured race variant is input-supply (depot->player furnace): the same #558 next-tick same-pair re-reservation, measured 495/513 on clean base vs 0/32 with the fix. The output-haul variant is proven deterministically in tests/dispatchCooldown.test.mjs c1-c4; a real-UI OUTPUT-side capture is blocked by a SEPARATE pre-existing dispatch-starvation defect (stable building-order sort always prefers starter output candidates; 0 player output jobs in 120s on BOTH base and fix) — filed as a follow-up with evidence on #567, NOT fixed here",
  "Because the yard stays live, exact bank-delta assertions are made only for credits and stone (no other flow produces them). Grand-totals deltas are bounded by the strict live-production envelope (at most one salvager cycle and one cycle per furnace inside the ~0.5s probe straddle) — hauls cancel out of totals. Bank deltas additionally satisfy the exact four-ledger manifest identity (bank + inventories + reserved + onboard === totals at both stamps) and a haul-term envelope: the bank moves by whole truck hauls (<=15 units accumulated over many cycles), so the bank delta minus the exact toast refund is bounded by cargo already headed to the depot in the before stamp plus one haul cap per truck. The toast carries the sim's exact transaction refund (including 100% cargo return) and is cross-checked against the straddling probes",
  "Reload durability is proven here through the app's real pagehide persist + conditional seed (no re-seed over the live save) and deterministically in tests/dispatchCooldown.test.mjs (persist/readGame round-trip, hostile-expiry clamp, expiry boundary)",
  "The 15s sim-time window, pair granularity, output+input coverage and exactly-once conservation under suppression are proven in tests/dispatchCooldown.test.mjs (7 tests); this capture proves the window is winnable through the real UI at normal fleet speed"]};
let child,browser;
await mkdir(OUT,{recursive:true});
const clone=x=>JSON.parse(JSON.stringify(x));
const delta=(after,before,keys)=>Object.fromEntries(keys.map(k=>[k,(after[k]||0)-(before[k]||0)]));
function legalSite(g,type,rot=0){
 // Near yard center (11,10): corner sites project outside the phone home
 // frustum and cannot be tapped (same constraint as capture-dismantle.mjs).
 const sites=[];
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok&&nearestRoad(g,x,z))sites.push({x,z,d:Math.hypot(x-11,z-10)});
 if(!sites.length)throw Error("no legal site for "+type);
 sites.sort((a,b)=>a.d-b.d||a.z-b.z||a.x-b.x);
 return {x:sites[0].x,z:sites[0].z};
}
// NORMAL yard + one legitimately built player furnace. Nothing else touched.
function normalSeed(){
 const g=createGame();
 const site=legalSite(g,"furnace");
 const r=buildAt(g,"furnace",site.x,site.z,0,"capture-558-build");
 if(!r.ok)throw Error("seed build failed: "+r.reason);
 advanceGame(g,8); // assembly completes; normal production/dispatch begin
 if(!(r.building.remaining<=0))throw Error("seed assembly did not complete");
 return {save:snapshot(g),building:clone(r.building),site,bankId:g.buildings.find(b=>b.type==="depot").id,
  speeds:g.vehicles.map(v=>({id:v.id,speed:v.speed})),
  starters:g.buildings.filter(b=>b.id<=6).map(b=>({id:b.id,type:b.type}))};
}
const SEED=normalSeed();
// CONDITIONAL seed: only when no save exists, so page.reload() keeps the LIVE
// post-cancel save (pagehide persist) instead of re-seeding the original yard.
const seedScript=json=>`(()=>{try{if(localStorage.getItem(${JSON.stringify(SAVE_KEY)}))return;const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;
const bagOf=(p,id)=>p?.buildings?.find(b=>b.id===id)?.inventory||{};
const jobOn=(p,id)=>(p?.vehicles||[]).filter(v=>v.job&&(v.job.sourceId===id||v.job.destId===id));
const inEnvelope=(d,lo,hi)=>d>=lo&&d<=hi;

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!open)throw Error("Production preview did not become available on "+PORT);
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 for(const v of [
  {name:"desktop",viewport:{width:1440,height:900},dpr:1,isMobile:false,touch:false},
  {name:"phone",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true},
 ]){
  const view={name:v.name,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,screenshots:[],proof:{seed:{site:SEED.site,speeds:SEED.speeds,starters:SEED.starters,buildingId:SEED.building.id,bankId:SEED.bankId}}};
  const errs=[],failed=[],probeWaits=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  const installObserver=page=>page.evaluate(()=>{
   window.__fleetProbeWrites=0;
   new MutationObserver(ms=>{for(const m of ms)if(m.attributeName==="data-fleet-probe")window.__fleetProbeWrites++;})
    .observe(document.body,{attributes:true,attributeFilter:["data-fleet-probe"]});
  });
  const newPage=async()=>{
   const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
   await ctx.addInitScript(seedScript(JSON.stringify(SEED.save)));
   const page=await ctx.newPage();
   page.on("pageerror",e=>errs.push(String(e)));
   page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
   page.on("requestfailed",r=>{try{if(new URL(r.url()).origin===`http://127.0.0.1:${PORT}`)failed.push(r.url());}catch{}});
   await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await installObserver(page);
   await page.waitForTimeout(900);
   return {ctx,page};
  };
  const probe=async(page)=>{
   const t0=Date.now();
   const baseline=await page.evaluate(()=>window.__fleetProbeWrites??0);
   await page.waitForFunction(b=>(window.__fleetProbeWrites??0)>b,baseline,{timeout:15000,polling:25});
   probeWaits.push(Date.now()-t0);
   return page.evaluate(()=>{try{return JSON.parse(document.body.dataset.fleetProbe||"null");}catch{return null;}});
  };
  const tap=async(page,x,y)=>{if(v.touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
  const selectBuilding=async(page,b)=>{
   const box=await page.locator(".world-canvas").boundingBox();
   if(!box)throw Error("world canvas has no box");
   const cam=await page.locator(".world-canvas").evaluate(c=>({yaw:+c.dataset.cameraYaw,elevation:+c.dataset.cameraElevation,zoom:+c.dataset.cameraZoom,x:+c.dataset.cameraX,z:+c.dataset.cameraZ}));
   const fp=worldFootprint(b.type,b.x,b.z,b.rot||0);
   const attempts=[];
   for(const h of [1.2,0,3,5,7]){
    const p=projectGround(cam,{x:fp.pivot.x,y:h,z:fp.pivot.z},{width:box.width,height:box.height});
    const px=Math.round(box.x+p.x),py=Math.round(box.y+p.y);
    const top=await page.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);return el?(el.tagName+"."+String(el.className)):"none";},[px,py]);
    if(!/world-canvas/.test(top)){attempts.push({h,px,py,top,skipped:"overlay"});continue;}
    await tap(page,px,py);
    try{
     await page.waitForFunction(([x,z])=>{const e=document.querySelector(".inspector-panel .eyebrow");return !!e&&e.textContent.includes("SITE "+x+"."+z);},[b.x,b.z],{timeout:3000,polling:100});
     attempts.push({h,px,py,top,ok:true});
     return {attempts,px,py};
    }catch{
     attempts.push({h,px,py,top,ok:false});
     await page.keyboard.press("Escape");
     await page.waitForTimeout(200);
    }
   }
   throw Error("could not select building "+b.id+" ("+b.type+" @"+b.x+","+b.z+"): "+JSON.stringify(attempts));
  };
  const dialogRows=page=>page.locator('[data-testid="dismantle-refund"] > div').evaluateAll(ds=>ds.map(d=>({
   name:d.querySelector("span").textContent,source:d.querySelector("em").textContent,
   amount:Number(d.querySelector("strong").textContent.replace(/[^0-9.-]/g,""))})));
  // Wait for a live job referencing the player machine (input resupply first).
  const waitJob=async(page,timeoutMs)=>{
   const t0=Date.now();let p=await probe(page);
   while(Date.now()-t0<timeoutMs){
    const hit=jobOn(p,pid)[0];
    if(hit)return {p,hit};
    p=await probe(page);
   }
   throw Error("no live job on player machine within "+timeoutMs+"ms");
  };
  // Real fleet-panel cancel of the given truck; returns the cancelProbe stamp.
  const uiCancel=async(page,truckId)=>{
   await page.locator('[data-tool="fleet"]').click();
   await page.locator('[data-testid="fleet-rows"]').waitFor({state:"visible",timeout:5000});
   const row=page.locator(`[data-testid="truck-${truckId}"]`);
   await row.waitFor({state:"visible",timeout:3000});
   await row.click();
   await page.locator(`[data-testid="fleet-detail"][data-truck="${truckId}"]`).waitFor({state:"visible",timeout:3000});
   const btn=page.locator('[data-testid="fleet-cancel"]');
   if(!(await btn.isEnabled()))return null; // job ended between probe and click
   await btn.click();
   return page.evaluate(()=>{try{return JSON.parse(document.body.dataset.cancelProbe||"null");}catch{return null;}});
  };

  const {ctx,page}=await newPage();
  const pid=SEED.building.id;
  try{
   // ---- 1) wait for a REAL live resupply job destined at the player furnace ----
   let {p:jobStamp,hit}=await waitJob(page,45000);
   const motion=[{id:hit.id,x:hit.x,z:hit.z,phase:hit.job.phase}];
   await shot(page,"motion-a");
   for(let i=0;i<2;i++){const mp=await probe(page);const mv=mp.vehicles.find(x=>x.id===hit.id);if(mv)motion.push({id:mv.id,x:mv.x,z:mv.z,phase:mv.job?.phase||"idle"});}
   await shot(page,"motion-b");
   if(!motion.some((m,i)=>i>0&&(m.x!==motion[0].x||m.z!==motion[0].z)))throw Error("truck did not move across stamps: "+JSON.stringify(motion));
   view.proof.job={truckId:hit.id,resource:hit.job.resource,amount:hit.job.amount,phase:hit.job.phase,sourceId:hit.job.sourceId,destId:hit.job.destId,motion};

   // ---- 2) REAL fleet-panel cancels: every pair referencing the machine ----
   // A cancel only counts when the cancelProbe confirms the SAME truck, source
   // and resource we targeted (the dispatcher can re-assign a truck between
   // probe and click; a stray cancel of another pair is recorded, not counted).
   // Prefer the job with the most route remaining (toSource, low progress) so
   // the real click lands while the job is genuinely live.
   const pickTarget=refs=>refs.slice().sort((a,b)=>
    ((a.job.phase==="toSource"?0:1)-(b.job.phase==="toSource"?0:1))||
    ((a.job.progress||0)-(b.job.progress||0)))[0];
   const cancels=[];let shotTaken=false;
   const haveCancel=()=>cancels.some(c=>c.probe);
   for(let round=0;round<10;round++){
    let p=await probe(page);
    let refs=jobOn(p,pid);
    if(!refs.length){
     if(haveCancel())break; // quiet window reached AFTER >=1 verified cancel
     ({p}=await waitJob(page,30000)); // no cancel yet: keep waiting for a real job
     refs=jobOn(p,pid);
    }
    let target=pickTarget(refs),cp=null;
    for(let attempt=0;attempt<6&&!cp;attempt++){
     try{
      if(!shotTaken){await shot(page,"fleet-before-cancel");shotTaken=true;}
      const r=await uiCancel(page,target.id);
      if(r&&r.ok&&r.id===target.id&&r.sourceId===target.job.sourceId&&r.resource===target.job.resource)cp=r;
      else{
       if(r&&r.ok)cancels.push({round,attempt,stray:{expected:{id:target.id,sourceId:target.job.sourceId,resource:target.job.resource},got:{id:r.id,sourceId:r.sourceId,resource:r.resource}}});
       const np=await probe(page);const nrefs=jobOn(np,pid);
       if(!nrefs.length){
        if(haveCancel())break; // quiet after a verified cancel: done
        ({hit:target}=await waitJob(page,30000));
       }else target=pickTarget(nrefs);
      }
     }catch(e){
      cancels.push({round,attempt,error:String(e).slice(0,160)});
      const np=await probe(page);const nrefs=jobOn(np,pid);
      if(!nrefs.length){
       if(haveCancel())break;
       ({hit:target}=await waitJob(page,30000));
      }else target=pickTarget(nrefs);
     }
    }
    if(!cp){
     if(haveCancel())break; // quiet window reached after a verified cancel
     throw Error("real UI cancel never succeeded: "+JSON.stringify(cancels));
    }
    if(!(cp.amount>0))throw Error("cancel returned no cargo: "+JSON.stringify(cp));
    if(cp.bagAfter-cp.bagBefore!==cp.amount)throw Error("cancel source return not exact: "+JSON.stringify(cp));
    if(JSON.stringify(cp.before.totals)!==JSON.stringify(cp.after.totals))throw Error("cancel changed grand totals (not exact-once): "+JSON.stringify(cp));
    cancels.push({round,probe:cp});
   }
   if(!haveCancel())throw Error("no cancel performed");
   view.proof.cancels=cancels;

   // ---- 3) cooldown suppression: NO job may reference the player machine ----
   const cooldownStamps=[];
   for(let i=0;i<6;i++){
    const p=await probe(page);
    const refs=jobOn(p,pid);
    if(refs.length)throw Error("dispatcher re-reserved a cooled pair during cooldown (stamp "+i+"): "+JSON.stringify(refs.map(r=>({id:r.id,job:r.job}))));
    cooldownStamps.push({bag:bagOf(p,pid),jobs:p.vehicles.map(x=>({id:x.id,sourceId:x.job?.sourceId??null,destId:x.job?.destId??null,resource:x.job?.resource??null}))});
   }
   await shot(page,"after-cancel-fleet");
   view.proof.cooldownSuppression={stamps:cooldownStamps.length,windowSeconds:15,cancelledPairs:cancels.filter(c=>c.probe).map(c=>c.probe.sourceId+":"+c.probe.resource)};

   // ---- 4) reload: pagehide persist keeps the cooldown; seed does NOT re-run ----
   // Read the save IMMEDIATELY after reload (before the WebGL ready-wait can
   // eat into the 15s window), with raw diagnostics if anything is off.
   const preReload=await page.evaluate(k=>{const raw=localStorage.getItem(k);if(!raw)return{has:false};try{const s=JSON.parse(raw);return{has:true,elapsed:s.elapsed,dispatchCooldowns:s.dispatchCooldowns||null};}catch(e){return{has:true,parseError:String(e).slice(0,120)};}},SAVE_KEY);
   view.proof.preReloadSave=preReload;
   await page.reload({waitUntil:"domcontentloaded",timeout:30000});
   const persisted=await page.evaluate(({k,pid})=>{const raw=localStorage.getItem(k);if(!raw)return{has:false};try{const s=JSON.parse(raw);return{has:true,len:raw.length,elapsed:s.elapsed,dispatchCooldowns:s.dispatchCooldowns||null,hasBuilding:(s.buildings||[]).some(b=>b.id===pid)};}catch(e){return{has:true,len:raw.length,parseError:String(e).slice(0,120),head:raw.slice(0,80)};}},{k:SAVE_KEY,pid});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await installObserver(page);
   if(!persisted.has||!persisted.dispatchCooldowns)throw Error("persisted save lost dispatchCooldowns: "+JSON.stringify(persisted));
   const pairs=cancels.filter(c=>c.probe).map(c=>c.probe.sourceId+":"+c.probe.resource);
   for(const key of pairs){
    const until=persisted.dispatchCooldowns[key];
    if(!Number.isFinite(until))throw Error("persisted save lost cooldown "+key+": "+JSON.stringify(persisted));
    if(!(until>persisted.elapsed))throw Error("persisted cooldown already expired at reload: "+JSON.stringify({key,persisted}));
    if(!(until-persisted.elapsed<=15+1e-6))throw Error("persisted cooldown exceeds one window: "+JSON.stringify({key,persisted}));
   }
   if(!persisted.hasBuilding)throw Error("player machine missing from persisted save");
   const reloadStamps=[];
   for(let i=0;i<5;i++){
    const p=await probe(page);
    const refs=jobOn(p,pid);
    if(refs.length)throw Error("reload bypassed the cooldown (stamp "+i+"): "+JSON.stringify(refs.map(r=>({id:r.id,job:r.job}))));
    reloadStamps.push({bag:bagOf(p,pid),jobs:p.vehicles.map(x=>({id:x.id,sourceId:x.job?.sourceId??null,destId:x.job?.destId??null}))});
   }
   view.proof.reload={persistedCooldowns:Object.fromEntries(pairs.map(k=>[k,{until:persisted.dispatchCooldowns[k],elapsed:persisted.elapsed}])),stamps:reloadStamps.length};

   // ---- 5) REAL two-step dismantle inside the window ----
   await page.locator('[data-tool="select"]').click();
   const sel=await selectBuilding(page,SEED.building);
   view.proof.selection=sel;
   await page.locator('[data-testid="dismantle-open"]').waitFor({state:"visible",timeout:5000});
   const p1=await probe(page);
   if(jobOn(p1,pid).length)throw Error("a new job referenced the machine before dialog (starved steel haul?) — honest FAIL, not relaxed");
   await page.locator('[data-testid="dismantle-open"]').click();
   await page.locator('[data-testid="dismantle-confirm-dialog"]').waitFor({state:"visible",timeout:5000});
   const rows=await dialogRows(page);
   const p2=await probe(page);
   const recRows=rows.filter(r=>r.source==="40% recovery");
   const expRec=refundEntries(RECOVERY,BLUEPRINTS.furnace).map(e=>({name:e.name,amount:e.amount}));
   if(JSON.stringify(recRows.map(r=>({name:r.name,amount:r.amount})))!==JSON.stringify(expRec))
    throw Error("dialog recovery rows != floor(40%) paid: "+JSON.stringify({recRows,expRec}));
   // While every referencing pair is cooled: iron/fuel only decrease (smelt
   // consumption), steel only grows (production). One 5.5s cycle max between
   // the straddling stamps.
   const b1=bagOf(p1,pid),b2=bagOf(p2,pid);
   const mono={iron:[b2.iron||0,b1.iron||0],fuel:[b2.fuel||0,b1.fuel||0],steel:[b1.steel||0,b2.steel||0]};
   for(const r of rows.filter(r=>r.source==="cargo return")){
    const id=NAME_TO_ID[r.name];if(!id)throw Error("unknown cargo row "+r.name);
    if(id==="scrap")throw Error("furnace cannot hold scrap: "+JSON.stringify(r));
    const [lo,hi]=mono[id]||[0,0];
    if(!inEnvelope(r.amount,lo,hi))throw Error("cargo row outside one-cycle monotone envelope: "+JSON.stringify({row:r,lo,hi,b1,b2}));
   }
   await shot(page,"dismantle-dialog");
   view.proof.dialog={rows,p1Bag:b1,p2Bag:b2};
   const before=await probe(page);
   if(!before.buildings.some(b=>b.id===pid))throw Error("building vanished before confirm");
   if(jobOn(before,pid).length)throw Error("a new job referenced the machine before confirm — honest FAIL, not relaxed");
   await page.locator('[data-testid="dismantle-confirm"]').click();
   await page.waitForFunction(id=>{try{const p=JSON.parse(document.body.dataset.fleetProbe||"null");return !!p&&!p.buildings.some(x=>x.id===id);}catch{return false;}},pid,{timeout:10000,polling:50});
   const after=await probe(page);
   const toast=await page.locator(".toast span").innerText({timeout:5000});
   const refund={};for(const m of toast.matchAll(/\+(\d+)\s+([A-Z]+)/g)){const id=UNIT_TO_ID[m[2]];if(id)refund[id]=Number(m[1]);}
   if(!Object.keys(refund).length)throw Error("no dismantle refund toast: "+toast);
   // exact transaction refund vs straddling bag (one player-furnace cycle max)
   const b0=bagOf(before,pid);
   const bagChecks={iron:[(refund.iron||0)-9,[b0.iron||0,(b0.iron||0)-5]],
    fuel:[refund.fuel||0,[b0.fuel||0,(b0.fuel||0)-2]],
    steel:[refund.steel||0,[b0.steel||0,(b0.steel||0)+4]]};
   for(const [r,[bagAt,opts]] of Object.entries(bagChecks))
    if(!opts.includes(bagAt))throw Error("toast refund bag outside one-cycle straddle: "+JSON.stringify({r,bagAt,opts,refund}));
   if((refund.scrap||0)!==20)throw Error("furnace scrap refund must be exactly the 20 recovery: "+JSON.stringify(refund));
   for(const r of ["credits","stone"])if((refund[r]||0)!==RECOVERY[r])throw Error("toast recovery not exact: "+JSON.stringify({r,refund,RECOVERY}));
   const bankD=delta(after.bank,before.bank,BANK_KEYS);
   const totalsD=delta(after.totals,before.totals,BANK_KEYS);
   for(const r of ["credits","stone"]){
    if(bankD[r]!==RECOVERY[r])throw Error("bank delta not exact for "+r+": "+JSON.stringify({bankD,RECOVERY}));
    if(totalsD[r]!==RECOVERY[r])throw Error("grand totals delta not exact for "+r+": "+JSON.stringify({totalsD,RECOVERY}));
   }
   // NET-CREATION envelope (grand totals): <=1 salvager cycle (scrap+9/iron+3/
   // copper+1) and <=1 cycle per furnace (iron-5/fuel-2/steel+4, starter AND
   // player) inside the ~0.5s probe straddle. Totals count bank + inventories +
   // reserved + onboard, so truck hauls cancel out and only production/consumption
   // moves them — this is the strict conservation assertion, unchanged.
   const env={scrap:[refund.scrap||0,(refund.scrap||0)+9],iron:[(refund.iron||0)-10,(refund.iron||0)+3],
    copper:[0,1],steel:[refund.steel||0,(refund.steel||0)+8],fuel:[(refund.fuel||0)-4,refund.fuel||0]};
   for(const [r,[lo,hi]] of Object.entries(env))
    if(!inEnvelope(totalsD[r],lo,hi))throw Error("totals delta outside production envelope for "+r+": "+JSON.stringify({totalsD,env}));
   // BANK accounting: the bank does NOT move by production cycles — it moves by
   // WHOLE TRUCK HAULS (deliveryCandidates caps a load at 15 units accumulated
   // over many cycles) plus the exact dismantle refund. The earlier cycle-granular
   // bank envelope was mechanically wrong (a single 12-steel haul landing in the
   // straddle is 3 furnace cycles of output, not 1). Two strict checks replace it:
   //  (a) exact manifest identity per resource: bank + inventories + reserved +
   //      onboard === totals at BOTH stamps, so every bank unit is tied to an
   //      observable ledger component (the #384 four-ledger contract);
   //  (b) the haul term (bank delta minus the sim's exact toast refund, which
   //      already includes 100% cargo return) is bounded by truck traffic visible
   //      in the before stamp: deposits <= cargo already headed to the depot plus
   //      one 15-unit haul cap per other truck; loads <= one 15-unit cap per truck
   //      (reserve deducts from the bank at assignment). Credits/stone never ride
   //      trucks — their exact deltas are asserted above.
   const sumInv=p=>{const o={};for(const b of p.buildings)for(const [r,n] of Object.entries(b.inventory||{}))o[r]=(o[r]||0)+n;return o;};
   const sumRes=p=>{const o={};for(const v of p.vehicles)if(v.job?.phase==="toSource"&&v.job.amount>0)o[v.job.resource]=(o[v.job.resource]||0)+v.job.amount;return o;};
   const sumCargo=p=>{const o={};for(const v of p.vehicles)if(v.cargo?.amount>0)o[v.cargo.resource]=(o[v.cargo.resource]||0)+v.cargo.amount;return o;};
   const ib=sumInv(before),ia=sumInv(after),rb=sumRes(before),ra=sumRes(after),cb=sumCargo(before),ca=sumCargo(after);
   const HAUL_CAP=15,nTrucks=before.vehicles.length;
   const toBank=r=>before.vehicles.filter(v=>v.cargo?.resource===r&&v.job?.destId===SEED.bankId).reduce((a,v)=>a+v.cargo.amount,0);
   const haulD={};
   for(const r of BANK_KEYS){
    const invD=(ia[r]||0)-(ib[r]||0),resD=(ra[r]||0)-(rb[r]||0),cargoD=(ca[r]||0)-(cb[r]||0);
    if(bankD[r]+invD+resD+cargoD!==totalsD[r])
     throw Error("manifest identity broken for "+r+": "+JSON.stringify({bank:bankD[r],invD,resD,cargoD,totals:totalsD[r]}));
    haulD[r]=bankD[r]-(refund[r]||0);
    const lo=-HAUL_CAP*nTrucks,hi=toBank(r)+HAUL_CAP*nTrucks;
    if(!inEnvelope(haulD[r],lo,hi))
     throw Error("bank haul term outside truck-traffic envelope for "+r+": "+JSON.stringify({haul:haulD[r],lo,hi,bank:bankD[r],refund:refund[r]||0,toBank:toBank(r)}));
   }
   for(const r of BANK_KEYS.filter(k=>!["credits","stone","scrap","iron","copper","steel","fuel"].includes(k)))
    if(bankD[r]!==0||totalsD[r]!==0)throw Error("unexpected delta for "+r+": "+JSON.stringify({bankD,totalsD}));
   if(after.buildings.length!==before.buildings.length-1)throw Error("dismantle must splice exactly one building");
   if(jobOn(after,pid).length)throw Error("job still references dismantled machine");
   await shot(page,"after-dismantle");
   view.proof.dismantle={toast,refund,bankBefore:before.bank,bankAfter:after.bank,bankDelta:bankD,totalsDelta:totalsD,
    bagBefore:b0,buildingsBefore:before.buildings.length,buildingsAfter:after.buildings.length,
    haulDelta:haulD,beforeVehicles:before.vehicles,afterVehicles:after.vehicles};
   view.proof.probeWaitMs={count:probeWaits.length,max:Math.max(...probeWaits),avg:Math.round(probeWaits.reduce((a,b)=>a+b,0)/probeWaits.length)};
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
 try{if(child)child.kill();}catch{}
 report.finished=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,views:report.views.map(x=>({name:x.name,status:x.status,failure:x.failure||null,errors:x.errors.length}))},null,2));
}
process.exit(report.status==="PASS_NUMERIC_ONLY"?0:1);