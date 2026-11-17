// BLD-08 (#377) safe dismantle / refund / local-stock-recovery evidence capture.
// NEW script — reuses the capture-build-atomic.mjs production-preview harness
// (vite preview of the REAL production build, seeded authoritative saves,
// condition-based waits on the app's own fleetProbe stamp writes). Proves,
// against the production-built world at desktop 1440x900 and emulated phone
// 390x844 dpr2, all driven through REAL dock clicks + physical canvas taps:
//  1) TWO-STEP CONFIRM: tapping a completed player machine opens the inspector;
//     "Dismantle machine…" opens the role=alertdialog confirm listing the EXACT
//     refunded units (floor(40%) paid recovery + 100% cargo, per-resource rows
//     cross-checked against the authoritative refund). "Keep machine" aborts
//     with zero bank change; confirming deposits EXACTLY the previewed units.
//  2) SUCCESS + BANK DELTA: fleetProbe bank before/after equals the exact
//     refund per resource; the building is spliced; a plain repeat tap at the
//     same screen point selects nothing and pays NOTHING (MISSING-safe); the
//     persisted localStorage save is then replayed through the REAL readGame +
//     removeBuilding public API in-node (reload path) — zero further payout.
//  3) PROTECTED refusal: a starter machine shows the disabled dismantle control
//     with the exact protected reason; bank untouched.
//  4) RESERVED refusal + option-(a) flow: a live truck job hard-blocks dismantle
//     (exact reason, inventory untouched); the player cancels the freight via
//     the REAL fleet panel (cancelProbe proves exact-once source return), the
//     dispatcher's immediate re-assignment goes to an earlier starter candidate
//     (seeded: stocked starters + slow fleet — disclosed), and the now-unreserved
//     machine dismantles with recovery + 100% of the returned cargo.
//  5) REPLAY / NO DOUBLE REFUND (API-SEEDED headline): the committed fixture
//     tests/fixtures/save-v2-dismantle.json renders the post-dismantle yard; the
//     recorded command id replays in-node with duplicate:true and ZERO further
//     deposit. The UI does not issue command ids yet (App.jsx wiring is a
//     registered cross-lease follow-up), so command-id replay cannot be
//     UI-driven; real UI duplicate safety is proven by the plain repeat tap.
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — sponsor G1 visual review
// (#276) is still owed. One headless Chromium/SwiftShader run; phone emulated.
import {chromium} from "playwright-core";
import {
 createGame,buildAt,removeBuilding,advanceGame,checkSite,nearestRoad,snapshot,readGame
} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,WORLD_SIZE,SAVE_KEY,RESOURCE_BY_ID} from "../src/content.js";
import {projectGround,dismantleRefund,refundEntries} from "../src/inspector.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/377-bld-08");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4183,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const BANK_KEYS=Object.keys(INITIAL_BANK);
const ZERO_BANK=Object.fromEntries(BANK_KEYS.map(k=>[k,0]));
const SALVAGER_COST=BLUEPRINTS.salvager.cost; // {credits:180,scrap:28,stone:12}
const report={version:1,issue:377,task:"BLD-08 safe dismantle, refunds and local stock recovery",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone view is emulated 390x844 dpr2, not a physical device; no physical display",
  "Numeric proofs do not certify visual fidelity — sponsor screenshot+motion review required at G1 (#276)",
  "Local production preview only — the live hosted receipt is produced at release by the release engineer; this is NOT a release",
  "UI is not idempotent end-to-end: App.jsx onRemove issues no command id (registered cross-lease follow-up, same debt as BLD-04). Command-id replay is proven via the authoritative public API + the persisted fixture registry (API-SEEDED headline); real UI duplicate safety is proven by the plain repeat tap (MISSING, zero payout) and by replaying the PERSISTED browser save through readGame+removeBuilding in-node",
  "RESERVED context seed: starter salvager/furnace inventories stocked (200 each) and ALL truck speeds seeded to 0.02 cells/s so (a) the reservation stays live for the whole capture and (b) after the real UI cancelFreight the dispatcher's IMMEDIATE next-tick re-assignment takes an earlier starter candidate instead of re-reserving the player machine. The one-tick re-dispatch race itself is real gameplay debt (a player cannot normally win the cancel->dismantle window) — disclosed in the GAPS row and filed as a follow-up; no gate was weakened to hide it",
  "UI dismantle context seed: generator removed (no power -> no production) and all trucks removed (no freight) so every bank resource is exact; the seeded cargo (iron 7) stands in for processed outputs — the crusher 3-cycle processed-output refund is proven with real production in tests/dismantleAtomic.test.mjs and the fixture",
  "Save/reload durability of the command registry, sanitized inventory and rollback atomicity is proven by tests/dismantleAtomic.test.mjs (15 tests, rollback control main 0/15 vs branch 15/15); the browser seed script re-seeds on reload, so reload is re-proven here only via the persisted-save in-node replay"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// ---- deterministic seeded saves (authoritative sim transactions in-node) ----
const clone=(x)=>JSON.parse(JSON.stringify(x));
const delta=(after,before,keys)=>Object.fromEntries(keys.map(k=>[k,(after[k]||0)-(before[k]||0)]));
const ZERO_DELTA=Object.fromEntries(BANK_KEYS.map(k=>[k,0]));
function legalSite(g,type,rot=0){
 // Prefer sites near the yard center (11,10): the first scan-order legal site
 // (11,1) projects OUTSIDE the phone home frustum (px 456 > 390 viewport,
 // elementFromPoint "none"), so a corner seed cannot be tapped on phone.
 const sites=[];
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok&&nearestRoad(g,x,z))sites.push({x,z,d:Math.hypot(x-11,z-10)});
 if(!sites.length)throw Error("no legal site for "+type);
 sites.sort((a,b)=>a.d-b.d||a.z-b.z||a.x-b.x);
 return {x:sites[0].x,z:sites[0].z};
}
function frozenGame(){
 const g=createGame();
 g.buildings=g.buildings.filter(b=>b.id!==3); // generator out: no production
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,credits:1000,scrap:100,stone:100};
 return g;
}
function completed(g,type,cmd){
 const site=legalSite(g,type);
 const r=buildAt(g,type,site.x,site.z,0,cmd);
 if(!r.ok)throw Error("seed build failed: "+r.reason);
 advanceGame(g,5); // assembly is power-independent
 if(!(r.building.remaining<=0))throw Error("seed assembly did not complete");
 return r.building;
}
// Context 1+2 seed: one completed player salvager with cargo, freight frozen.
function uiSeed(){
 const g=frozenGame();
 g.vehicles=[]; // no freight at all: every bank resource exact
 const b=completed(g,"salvager","capture-377-build");
 b.inventory={iron:7}; // stored cargo: returned at 100% on dismantle
 return {save:snapshot(g),building:clone(b),
  expectedRefund:{credits:72,scrap:11,stone:4,iron:7}};
}
// Context 4 seed: live job referencing the player machine; after a UI cancel the
// dispatcher must re-assign to an EARLIER starter candidate, not the player.
function reservedSeed(){
 const g=frozenGame();
 const b=completed(g,"salvager","capture-377-reserved-build");
 b.inventory={scrap:20};
 let v=null;
 for(let i=0;i<400&&!v;i++){v=g.vehicles.find(x=>x.job&&x.job.sourceId===b.id)||null;if(!v)advanceGame(g,0.5);}
 if(!v)throw Error("no reservation seeded within 200s");
 if(v.job.amount!==15||b.inventory.scrap!==5)throw Error("unexpected reservation: "+JSON.stringify({amount:v.job.amount,inv:b.inventory}));
 // Stock the starters AFTER the reservation so they were not earlier candidates
 // during seeding; in the browser they outrank the player machine (building
 // array order, stable priority sort) for the post-cancel re-assignment.
 g.buildings.find(x=>x.id===1).inventory={scrap:200};
 g.buildings.find(x=>x.id===4).inventory={iron:200,fuel:200};
 for(const x of g.vehicles)x.speed=0.02; // reservation + re-assignment stay live for the whole capture; no arrivals move the bank
 return {save:snapshot(g),building:clone(b),truckId:v.id,
  expectedRefund:{credits:72,scrap:31,stone:4}}; // floor(40%) 72/11/4 + returned cargo scrap 20
}
const UI=uiSeed(),RESERVED=reservedSeed();
const FIXTURE=JSON.parse(await readFile(resolve("tests/fixtures/save-v2-dismantle.json"),"utf8"));
const fixtureCmd=(FIXTURE.commands||[]).find(c=>c.kind==="dismantle"&&c.ok);
if(!fixtureCmd)throw Error("fixture has no recorded dismantle command");
// In-node replay of the fixture through the PUBLIC API (reload path).
const fixtureReplay=(()=>{
 const g=clone(FIXTURE);
 const bankBefore={...g.bank},count=g.buildings.length;
 const dup=removeBuilding(g,fixtureCmd.buildingId,fixtureCmd.id);
 if(!dup.ok||dup.duplicate!==true)throw Error("fixture replay must be duplicate:true: "+JSON.stringify(dup));
 if(JSON.stringify(dup.refund)!==JSON.stringify(fixtureCmd.refund))throw Error("fixture replay refund drift");
 if(JSON.stringify(delta(g.bank,bankBefore,BANK_KEYS))!==JSON.stringify(ZERO_DELTA))throw Error("fixture replay deposited stock");
 if(g.buildings.length!==count)throw Error("fixture replay changed buildings");
 const plain=removeBuilding(g,fixtureCmd.buildingId);
 if(plain.ok||plain.code!=="MISSING")throw Error("fixture plain repeat must be MISSING: "+JSON.stringify(plain));
 return {commandId:fixtureCmd.id,buildingId:fixtureCmd.buildingId,duplicate:dup.duplicate,refund:dup.refund,
  bankDelta:delta(g.bank,bankBefore,BANK_KEYS),plainRepeat:{ok:plain.ok,code:plain.code}};
})();
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;
const expectedEntries=(refund,type)=>refundEntries(refund,BLUEPRINTS[type]).map(e=>({
 name:e.name,amount:e.amount,source:e.source==="recovery"?"40% recovery":"cargo return"}));

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
  const view={name:v.name,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,screenshots:[],proof:{}};
  const errs=[],failed=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  const newPage=async(saveJson)=>{
   const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
   if(saveJson!=null)await ctx.addInitScript(seedScript(saveJson));
   const page=await ctx.newPage();
   page.on("pageerror",e=>errs.push(String(e)));
   page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
   page.on("requestfailed",r=>{try{if(new URL(r.url()).origin===`http://127.0.0.1:${PORT}`)failed.push(r.url());}catch{}});
   await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await page.evaluate(()=>{
    window.__fleetProbeWrites=0;
    new MutationObserver(ms=>{for(const m of ms)if(m.attributeName==="data-fleet-probe")window.__fleetProbeWrites++;})
     .observe(document.body,{attributes:true,attributeFilter:["data-fleet-probe"]});
   });
   await page.waitForTimeout(900);
   return {ctx,page};
  };
  const probeWaits=[];
  const probe=async(page)=>{
   const t0=Date.now();
   const baseline=await page.evaluate(()=>window.__fleetProbeWrites??0);
   await page.waitForFunction(b=>(window.__fleetProbeWrites??0)>b,baseline,{timeout:15000,polling:25});
   probeWaits.push(Date.now()-t0);
   return page.evaluate(()=>{try{return JSON.parse(document.body.dataset.fleetProbe||"null");}catch{return null;}});
  };
  const tap=async(page,x,y)=>{if(v.touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
  const chipValue=async(page,id)=>Number((await page.locator(`.resources-strip button[data-resource="${id}"] strong`).innerText()).replace(/[^0-9.-]/g,""));
  // Real canvas tap on a building: project its pivot through the APPLIED camera
  // stamps, verify document.elementFromPoint resolves to the canvas FIRST
  // (overlay contact debt), tap, and confirm the inspector eyebrow shows the
  // exact SITE x.z. Bounded height candidates; every attempt recorded.
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
  const assertRows=(rows,expected,label)=>{
   const norm=rs=>rs.map(r=>[r.name,r.source,r.amount]);
   if(JSON.stringify(norm(rows))!==JSON.stringify(norm(expected)))throw Error(label+" dialog rows != authoritative refund: "+JSON.stringify({rows,expected}));
  };
  const openConfirm=async(page,refund,type,label)=>{
   await page.locator('[data-testid="dismantle-open"]').waitFor({state:"visible",timeout:5000});
   await page.locator('[data-testid="dismantle-open"]').click();
   await page.locator('[data-testid="dismantle-confirm-dialog"]').waitFor({state:"visible",timeout:5000});
   const rows=await dialogRows(page);
   assertRows(rows,expectedEntries(refund,type),label);
   return rows;
  };
  const confirmDismantle=async(page,b,expectedRefund)=>{
   const before=await probe(page);
   if(!before.buildings.some(x=>x.id===b.id))throw Error("building vanished before confirm");
   await page.locator('[data-testid="dismantle-confirm"]').click();
   await page.waitForFunction(id=>{try{const p=JSON.parse(document.body.dataset.fleetProbe||"null");return !!p&&!p.buildings.some(x=>x.id===id);}catch{return false;}},b.id,{timeout:10000,polling:50});
   const after=await probe(page);
   const d=delta(after.bank,before.bank,BANK_KEYS);
   const expected=Object.fromEntries(BANK_KEYS.map(k=>[k,expectedRefund[k]||0]));
   if(JSON.stringify(d)!==JSON.stringify(expected))throw Error("dismantle bank delta != exact refund: "+JSON.stringify({d,expected}));
   if(after.buildings.length!==before.buildings.length-1)throw Error("dismantle must splice exactly one building");
   return {before:before.bank,after:after.bank,delta:d,buildingsBefore:before.buildings.length,buildingsAfter:after.buildings.length};
  };

  // ============ Context 1: REAL UI two-step confirm -> dismantle -> repeat ============
  {
   const {ctx,page}=await newPage(JSON.stringify(UI.save));
   const sel=await selectBuilding(page,UI.building);
   const previewText=await page.locator('[data-testid="dismantle-preview"]').innerText();
   // Step 1: open the confirm dialog; exact per-resource rows.
   const rows=await openConfirm(page,UI.expectedRefund,"salvager","confirm");
   await shot(page,"dismantle-confirm-dialog");
   // Two-step safety: Keep machine aborts with zero bank/building change.
   const bankKeepBefore=(await probe(page)).bank;
   await page.locator('[data-testid="dismantle-keep"]').click();
   await page.locator('[data-testid="dismantle-confirm-dialog"]').waitFor({state:"detached",timeout:5000});
   const keepProbe=await probe(page);
   if(JSON.stringify(delta(keepProbe.bank,bankKeepBefore,BANK_KEYS))!==JSON.stringify(ZERO_DELTA))throw Error("Keep machine moved stock");
   if(!keepProbe.buildings.some(x=>x.id===UI.building.id))throw Error("Keep machine dismantled the building");
   // Step 2: re-open and confirm — exact bank delta.
   await openConfirm(page,UI.expectedRefund,"salvager","re-confirm");
   const success=await confirmDismantle(page,UI.building,UI.expectedRefund);
   await shot(page,"dismantle-refunded");
   // Plain repeat at the SAME screen point: nothing selected, nothing paid.
   const bankRepeatBefore=(await probe(page)).bank;
   await tap(page,sel.px,sel.py);
   await page.waitForTimeout(600);
   const repeatProbe=await probe(page);
   const repeatSelected=await page.evaluate(()=>!!document.querySelector(".inspector-panel .eyebrow"));
   if(repeatSelected)throw Error("repeat tap re-selected a building at the dismantled site");
   if(JSON.stringify(delta(repeatProbe.bank,bankRepeatBefore,BANK_KEYS))!==JSON.stringify(ZERO_DELTA))throw Error("repeat tap paid stock");
   if(repeatProbe.buildings.some(x=>x.id===UI.building.id))throw Error("dismantled building reappeared");
   await shot(page,"dismantle-repeat-missing");
   // Persisted save (app autosaves every 4.2s) replayed through the REAL reload
   // path in-node: readGame + removeBuilding pay nothing further.
   await page.waitForFunction(({key,id,credits})=>{try{const s=JSON.parse(localStorage.getItem(key));return !!s&&s.bank.credits===credits&&!s.buildings.some(b=>b.id===id);}catch{return false;}},{key:SAVE_KEY,id:UI.building.id,credits:success.after.credits},{timeout:15000,polling:250});
   const persisted=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
   const reloadProof=await(async()=>{
    const saved=clone(persisted);saved.lastSavedAt=Date.now();
    globalThis.localStorage={getItem:()=>JSON.stringify(saved),setItem:()=>{},removeItem:()=>{}};
    try{
     const loaded=readGame();
     const bankBefore={...loaded.bank};
     const cmd=removeBuilding(loaded,UI.building.id,"capture-377-replay");
     const plain=removeBuilding(loaded,UI.building.id);
     if(cmd.ok||cmd.code!=="MISSING")throw Error("persisted-save command replay must be MISSING: "+JSON.stringify(cmd));
     if(plain.ok||plain.code!=="MISSING")throw Error("persisted-save plain repeat must be MISSING: "+JSON.stringify(plain));
     if(JSON.stringify(delta(loaded.bank,bankBefore,BANK_KEYS))!==JSON.stringify(ZERO_DELTA))throw Error("persisted-save replay paid stock");
     return {commandReplay:{ok:cmd.ok,code:cmd.code},plainRepeat:{ok:plain.ok,code:plain.code},bankDelta:delta(loaded.bank,bankBefore,BANK_KEYS),persistedBank:persisted.bank};
    }finally{delete globalThis.localStorage;}
   })();
   view.proof.uiDismantle={selection:sel.attempts,previewText,dialogRows:rows,keepMachine:{bankDeltaZero:true,buildingRetained:true},
    success,repeatTap:{selected:false,bankDelta:delta(repeatProbe.bank,bankRepeatBefore,BANK_KEYS)},reload:reloadProof,
    seed:{powerFrozen:"generator removed",freightFrozen:"all trucks removed",cargo:UI.building.inventory}};
   await ctx.close();
  }

  // ============ Context 2: PROTECTED starter refusal (same seeded yard) ============
  {
   const {ctx,page}=await newPage(JSON.stringify(UI.save));
   const starter=UI.save.buildings.find(b=>b.id===1); // starter salvager @7,9
   const bankBefore=(await probe(page)).bank;
   const sel=await selectBuilding(page,starter);
   await page.locator('[data-testid="dismantle-blocked"]').waitFor({state:"visible",timeout:5000});
   const disabled=await page.locator('[data-testid="dismantle-blocked"]').isDisabled();
   const reason=await page.locator('[data-testid="dismantle-blocked-reason"]').innerText();
   if(!disabled)throw Error("protected dismantle control must be disabled");
   if(reason!=="Starter buildings are protected; construct your own district.")throw Error("protected reason drift: "+reason);
   const openCount=await page.locator('[data-testid="dismantle-open"]').count();
   if(openCount!==0)throw Error("protected machine offers a dismantle opener");
   const bankAfter=(await probe(page)).bank;
   if(JSON.stringify(delta(bankAfter,bankBefore,BANK_KEYS))!==JSON.stringify(ZERO_DELTA))throw Error("protected refusal moved stock");
   await shot(page,"dismantle-protected");
   view.proof.protected={selection:sel.attempts,buildingId:1,disabled,reason,bankDelta:delta(bankAfter,bankBefore,BANK_KEYS)};
   await ctx.close();
  }

  // ============ Context 3: RESERVED refusal -> real UI cancelFreight -> dismantle ============
  {
   const {ctx,page}=await newPage(JSON.stringify(RESERVED.save));
   const b=RESERVED.building;
   const sel=await selectBuilding(page,b);
   await page.locator('[data-testid="dismantle-blocked"]').waitFor({state:"visible",timeout:5000});
   const reason=await page.locator('[data-testid="dismantle-blocked-reason"]').innerText();
   if(reason!=="A truck has reserved material at this building")throw Error("RESERVED reason drift: "+reason);
   const blockedProbe=await probe(page);
   const invBefore=blockedProbe.buildings.find(x=>x.id===b.id)?.inventory?.scrap;
   if(invBefore!==5)throw Error("reserved source bag must hold 5 (20 - reserved 15), got "+invBefore);
   const jobBefore=blockedProbe.vehicles.find(x=>x.id===RESERVED.truckId)?.job;
   if(!jobBefore||jobBefore.sourceId!==b.id||jobBefore.amount!==15)throw Error("seeded reservation not live: "+JSON.stringify(jobBefore));
   await shot(page,"dismantle-reserved");
   // REAL fleet panel: focus the reserved truck, cancel its job.
   await page.keyboard.press("Escape");
   await page.locator('[data-tool="fleet"]').click();
   await page.locator('[data-tool="fleet"][aria-pressed="true"]').waitFor({state:"attached",timeout:5000});
   await page.locator(`[data-testid="truck-${RESERVED.truckId}"]`).click();
   await page.locator(`[data-testid="fleet-detail"][data-truck="${RESERVED.truckId}"]`).waitFor({state:"visible",timeout:5000});
   await shot(page,"fleet-reserved-detail");
   await page.locator('[data-testid="fleet-cancel"]').click();
   await page.waitForFunction(()=>!!document.body.dataset.cancelProbe,null,{timeout:5000,polling:50});
   const cancelProbe=await page.evaluate(()=>JSON.parse(document.body.dataset.cancelProbe));
   if(!cancelProbe.ok||cancelProbe.amount!==15||cancelProbe.resource!=="scrap")throw Error("cancelFreight must return 15 scrap exactly once: "+JSON.stringify(cancelProbe));
   if(cancelProbe.bagBefore!==5||cancelProbe.bagAfter!==20)throw Error("cargo must return to the SOURCE bag exactly once: "+JSON.stringify(cancelProbe));
   if(JSON.stringify(cancelProbe.before.totals)!==JSON.stringify(cancelProbe.after.totals))throw Error("cancelFreight must conserve per-resource totals");
   await shot(page,"freight-canceled");
   // The dispatcher re-assigns the idle truck on the NEXT tick; the seeded
   // earlier starter candidates must win so the player machine stays free.
   await page.waitForFunction(id=>{try{const p=JSON.parse(document.body.dataset.fleetProbe||"null");return !!p&&!p.vehicles.some(x=>x.job&&(x.job.sourceId===id||x.job.destId===id));}catch{return false;}},b.id,{timeout:8000,polling:50});
   const freeProbe=await probe(page);
   const reassigned=freeProbe.vehicles.find(x=>x.id===RESERVED.truckId)?.job||null;
   const invFree=freeProbe.buildings.find(x=>x.id===b.id)?.inventory?.scrap;
   if(invFree!==20)throw Error("returned cargo missing from machine bag: "+invFree);
   // Now the REAL UI dismantle succeeds with recovery + 100% returned cargo.
   await page.keyboard.press("Escape");
   const sel2=await selectBuilding(page,b);
   const rows=await openConfirm(page,RESERVED.expectedRefund,"salvager","reserved-then-confirm");
   await shot(page,"reserved-then-confirm-dialog");
   const success=await confirmDismantle(page,b,RESERVED.expectedRefund);
   await shot(page,"reserved-then-dismantled");
   view.proof.reservedFlow={selection:sel.attempts,blockedReason:reason,sourceBagBefore:invBefore,jobBefore,
    cancelFreight:cancelProbe,reassignedJob:reassigned,sourceBagAfterCancel:invFree,selectionAfterCancel:sel2.attempts,
    dialogRows:rows,success,
    seed:{starterStocks:{salvager1:{scrap:200},furnace4:{iron:200,fuel:200}},truckSpeed:0.02,
     note:"post-cancel re-assignment deterministically takes an earlier starter candidate; the one-tick re-dispatch race is disclosed gameplay debt"}};
   await ctx.close();
  }

  // ============ Context 4: fixture replay headline (API-SEEDED) ============
  {
   const {ctx,page}=await newPage(JSON.stringify(FIXTURE));
   const p=await probe(page);
   if(p.buildings.some(x=>x.id===fixtureCmd.buildingId))throw Error("fixture post-dismantle building present in browser");
   if(p.buildings.length!==FIXTURE.buildings.length)throw Error("fixture building count drift");
   const credits=await chipValue(page,"credits");
   if(credits!==FIXTURE.bank.credits)throw Error(`credits chip ${credits} != fixture bank ${FIXTURE.bank.credits}`);
   if(p.bank.credits!==FIXTURE.bank.credits)throw Error("fleetProbe bank drift (credits)");
   const save=await page.evaluate(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},SAVE_KEY);
   if(!save||!save.commands.some(c=>c.id===fixtureCmd.id&&c.kind==="dismantle"&&c.ok))throw Error("fixture dismantle command not persisted in browser save");
   await shot(page,"replay-no-double-refund");
   view.proof.replay={inNode:fixtureReplay,browser:{buildingsLive:p.buildings.length,buildingsFixture:FIXTURE.buildings.length,
    creditsChip:credits,fixtureBankCredits:FIXTURE.bank.credits,registryPersisted:true},
    note:"API-SEEDED headline: command-id replay is proven through the authoritative public API + persisted registry; the UI issues no command ids yet (registered follow-up)"};
   await ctx.close();
  }

  view.pageErrors=errs;view.failedRequests=failed;
  view.probeWait={condition:"MutationObserver count of data-fleet-probe attribute writes > baseline captured at probe start (fresh post-action stamp)",
   timeoutMs:15000,pollingMs:25,count:probeWaits.length,
   maxMs:probeWaits.length?Math.max(...probeWaits):null,
   meanMs:probeWaits.length?Math.round(probeWaits.reduce((a,b)=>a+b,0)/probeWaits.length):null,
   samplesMs:probeWaits};
  if(errs.length||failed.length)throw Error(v.name+" console/page errors: "+JSON.stringify({errs,failed}));
  report.views.push(view);
 }
 report.status="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child)child.kill("SIGTERM");
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("BLD-08 dismantle capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}