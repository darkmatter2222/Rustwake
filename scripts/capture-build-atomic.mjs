// BLD-04 (#373) atomic + idempotent construction evidence capture. NEW script —
// the leased scripts/capture-v2.mjs and scripts/capture-live.mjs are untouched;
// this reuses the capture-strip.mjs production-preview harness (vite preview of
// the REAL production build, seeded authoritative saves, bounded waits).
// Proves, against the production-built world at desktop 1440x900 and phone
// 390x844:
//  1) IDEMPOTENT replay: real public-API transactions (the same buildAt the UI
//     calls) commit once, replay the same command id at DIFFERENT coordinates
//     with zero further spend, and a plain duplicate delivery COLLISIONs. The
//     seeded save renders exactly ONE new building where the legacy double
//     delivery would have built two, with real bank numbers on the strip.
//  2) REAL UI transactions: actual dock + canvas taps drive build -> cancel
//     (full refund of the paid cost, bank restored exactly) -> rebuild at the
//     same point -> duplicate plain click (COLLISION, zero spend, still one
//     building), with exact bank deltas read from the app's own fleetProbe
//     observability stamp and the validator's lastSite* stamps.
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — the sponsor still reviews
// the screenshots at G1 (#276). The UI does not yet issue command ids (App.jsx
// wiring is a registered follow-up); idempotent replay is proven through the
// authoritative public API + persisted registry, duplicate plain clicks through
// real UI taps.
import {chromium} from "playwright-core";
import {createGame,checkSite,buildAt,committedTotals} from "../src/simulation.js";
import {BLUEPRINTS,INITIAL_BANK,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/373-bld-04");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4179,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const COST=BLUEPRINTS.salvager.cost; // {credits:180,scrap:28,stone:12}
const report={version:1,issue:373,task:"BLD-04 atomic idempotent construction commit",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone view is emulated, not a physical device",
  "Numeric proofs do not certify visual fidelity — sponsor screenshot+motion review required at G1 (#276)",
  "Local production preview only — the live hosted receipt is produced at release by the release engineer",
  "UI is not idempotent end-to-end yet: App.jsx still calls the 4-arg buildAt (command-id wiring is a registered GAPS follow-up). Command-id replay is proven via authoritative in-node public-API transactions + the persisted registry; duplicate PLAIN clicks are proven through real UI taps",
  "Save/reload durability of paid provenance and the command registry is proven by tests/constructionAtomic.test.mjs (fixture replay + registry reload); the browser seed script re-seeds on reload, so reload is not re-proven here",
  "Assembly completion sinks the paid cost into machine capital and salvage returns floor(40%) — exact audited numbers, not a leak (unit-tested conservation chain)"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// ---- deterministic seeded saves (authoritative sim transactions in-node) ----
function legalSite(g,type,rot=0,avoid=[]){
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++){
  if(avoid.some(a=>a.x===x&&a.z===z))continue;
  if(checkSite(g,type,x,z,rot).ok)return {x,z};
 }
 throw Error("No legal site for "+type+" on seed "+g.seed);
}
const clone=(x)=>JSON.parse(JSON.stringify(x));
const delta=(after,before,keys)=>Object.fromEntries(keys.map(k=>[k,(after[k]||0)-(before[k]||0)]));
const KEYS=["credits","scrap","stone"];

// Context 1 seed: commit once with a command id, replay the SAME id at a
// different legal site (must be a zero-spend no-op), then a plain duplicate
// delivery at the occupied cell (must COLLISION with zero spend).
function idempotentSave(){
 const g=createGame();
 const first=buildAt(g,"salvager",6,7,0,"capture-build-1");
 if(!first.ok)throw Error("idempotent seed first build: "+first.code);
 const site2=legalSite(g,"salvager",0,[{x:6,z:7}]);
 const dup=buildAt(g,"salvager",site2.x,site2.z,0,"capture-build-1");
 if(!dup.ok||dup.duplicate!==true)throw Error("idempotent seed replay wrong: "+JSON.stringify(dup));
 if(dup.building?.id!==first.building.id)throw Error("replay must return the ORIGINAL building");
 const plain=buildAt(g,"salvager",6,7,0);
 if(plain.ok||plain.code!=="COLLISION")throw Error("plain duplicate must COLLISION: "+JSON.stringify(plain));
 if(g.buildings.length!==7)throw Error("expected exactly 7 buildings, got "+g.buildings.length);
 // Legacy counterfactual, reproduced exactly: pre-#373 buildAt had no command
 // registry — the same two deliveries spent twice and pushed two buildings.
 const legacy=clone(createGame());
 for(const site of [{x:6,z:7},site2]){
  for(const [id,n] of Object.entries(COST))legacy.bank[id]=Math.max(0,(legacy.bank[id]||0)-n);
  legacy.buildings.push({id:legacy.nextId++,type:"salvager",x:site.x,z:site.z,rot:0,level:1,remaining:5,inventory:{},timer:0});
 }
 return {save:g,first:{ok:first.ok,code:first.code,buildingId:first.building.id,x:6,z:7},
  replay:{ok:dup.ok,duplicate:dup.duplicate,code:dup.code,buildingId:dup.building.id,requestedSite:site2},
  plainCollision:{ok:plain.ok,code:plain.code,reason:plain.reason},
  legacy:{buildings:legacy.buildings.length,spend:delta(clone(INITIAL_BANK),legacy.bank,KEYS)},
  fixed:{buildings:g.buildings.length,spend:delta(clone(INITIAL_BANK),g.bank,KEYS),committed:committedTotals(g)}};
}
// Context 2 seed: fresh yard, generator removed so power supply is 0 and NO
// production can mask a bank delta (assembly is power-independent). The bank
// keeps its initial iron/fuel, so truck resupply may legitimately move those —
// credits/scrap/stone are never produced or dispatched and stay exact.
function uiSave(){
 const g=createGame();
 g.buildings=g.buildings.filter(b=>b.id!==3);
 return g;
}
const IDEMPOTENT=idempotentSave();
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;

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
   await page.waitForTimeout(900);
   return {ctx,page};
  };
  const chipValue=async(page,id)=>Number((await page.locator(`.resources-strip button[data-resource="${id}"] strong`).innerText()).replace(/[^0-9.-]/g,""));
  const saveNow=page=>page.evaluate(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},SAVE_KEY);
  // The app's OWN observability stamp: the same snapshot the panels render.
  const probe=async(page)=>{await page.waitForTimeout(320);return page.evaluate(()=>{try{return JSON.parse(document.body.dataset.fleetProbe||"null");}catch{return null;}});};
  const tap=async(page,x,y)=>{if(v.touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
  const clearSiteStamp=page=>page.evaluate(()=>{delete document.body.dataset.lastSiteOk;delete document.body.dataset.lastSiteCode;delete document.body.dataset.lastSiteReason;});
  const siteStamp=page=>page.evaluate(()=>({ok:document.body.dataset.lastSiteOk,code:document.body.dataset.lastSiteCode||"",reason:document.body.dataset.lastSiteReason||""}));
  const waitSiteStamp=page=>page.waitForFunction(()=>document.body.dataset.lastSiteOk!==undefined,null,{timeout:8000,polling:50});

  // ================= Context 1: idempotent replay renders ONE building =================
  {
   const {ctx,page}=await newPage(JSON.stringify(IDEMPOTENT.save));
   const stamps=await page.locator(".world-canvas").evaluate(c=>({...c.dataset}));
   if(stamps.world3d!=="ready")throw Error("world3d not ready: "+JSON.stringify(stamps));
   const p=await probe(page);
   if(!p)throw Error("fleetProbe stamp missing");
   const save=await saveNow(page);
   if(!save)throw Error("Seeded save missing from localStorage");
   // Live building count mirrors the authoritative save: exactly ONE new
   // salvager (id 10) at 6,7 — the replay at site2 never pushed a second.
   const newOnes=save.buildings.filter(b=>b.id===IDEMPOTENT.first.buildingId);
   if(newOnes.length!==1)throw Error("expected exactly one committed building, got "+newOnes.length);
   if(newOnes[0].x!==6||newOnes[0].z!==7)throw Error("committed building moved: "+JSON.stringify(newOnes[0]));
   if(JSON.stringify(newOnes[0].paid)!==JSON.stringify(COST))throw Error("paid provenance missing in seeded save: "+JSON.stringify(newOnes[0].paid));
   if(save.buildings.length!==7||p.buildings.length!==7)throw Error("building count drift: save "+save.buildings.length+" live "+p.buildings.length);
   const salvagers=p.buildings.filter(b=>b.type==="salvager").length;
   if(salvagers!==2)throw Error("expected starter + ONE new salvager, got "+salvagers);
   if(!save.commands.some(c=>c.id==="capture-build-1"&&c.ok&&c.buildingId===IDEMPOTENT.first.buildingId))throw Error("command registry not persisted in save");
   // Real bank numbers: credits is never produced, so the headline chip mirrors
   // the post-commit save EXACTLY; scrap only grows (live salvagers). Stone has
   // no headline chip — its ledger depot row must mirror the save exactly, and
   // the committed-assembly row must show the one assembling building's cost.
   const credits=await chipValue(page,"credits"),scrap=await chipValue(page,"scrap");
   if(credits!==save.bank.credits)throw Error(`credits chip ${credits} != save ${save.bank.credits}`);
   if(scrap<save.bank.scrap)throw Error(`scrap chip ${scrap} below save ${save.bank.scrap}`);
   if(p.bank.credits!==save.bank.credits)throw Error("fleetProbe bank drift (credits)");
   await page.locator(".resource-more").click();
   await page.locator(".panel-host .ledger-panel").waitFor({state:"visible",timeout:5000});
   await page.locator('.ledger-row[data-resource="stone"]').click();
   await page.waitForTimeout(300);
   const num=async(testid)=>Number((await page.locator(`[data-testid="${testid}"]`).innerText()).replace(/[^0-9.-]/g,""));
   const stoneDepot=await num("ledger-depot"),stoneCommitted=await num("ledger-committed");
   if(stoneDepot!==save.bank.stone)throw Error(`stone ledger depot ${stoneDepot} != save ${save.bank.stone}`);
   if(stoneCommitted!==COST.stone)throw Error(`stone committed ${stoneCommitted} != assembling paid cost ${COST.stone}`);
   await page.keyboard.press("Escape");
   await page.waitForFunction(()=>!document.querySelector(".panel-host"),null,{timeout:5000,polling:50});
   view.proof.idempotent={
    inNode:{first:IDEMPOTENT.first,replay:IDEMPOTENT.replay,plainCollision:IDEMPOTENT.plainCollision},
    legacyCounterfactual:{buildings:IDEMPOTENT.legacy.buildings,spend:IDEMPOTENT.legacy.spend},
    fixed:{buildings:IDEMPOTENT.fixed.buildings,spend:IDEMPOTENT.fixed.spend,committed:IDEMPOTENT.fixed.committed},
    browser:{buildingsLive:p.buildings.length,buildingsSave:save.buildings.length,salvagersLive:salvagers,
     committedBuilding:{id:newOnes[0].id,x:newOnes[0].x,z:newOnes[0].z,paid:newOnes[0].paid,remaining:newOnes[0].remaining},
     registryPersisted:true,strip:{credits,scrap,scrapMonotonic:true},ledgerStone:{depot:stoneDepot,committed:stoneCommitted},probeCredits:p.bank.credits}};
   await shot(page,"idempotent-one-building");
   await ctx.close();
  }

  // ================= Context 2: REAL UI build -> duplicate click -> cancel =================
  {
   const {ctx,page}=await newPage(JSON.stringify(uiSave()));
   const seedBank=(await probe(page)).bank;
   await page.locator('[data-tool="build"]').click();
   await page.waitForTimeout(250);
   const box=await page.locator(".world-canvas").boundingBox();
   if(!box)throw Error("world canvas has no box");
   // Bounded candidate taps (upper canvas, clear of the dock/sheet). Every
   // attempt is a REAL validator transaction; rejects spend nothing.
   const attempts=[];let built=null,bankBefore=null,bankAfter=null;
   const fractions=[[0.5,0.28],[0.42,0.32],[0.58,0.32],[0.36,0.36],[0.64,0.36],[0.5,0.38],[0.44,0.24],[0.56,0.24],[0.3,0.3],[0.7,0.3],[0.38,0.4],[0.62,0.4],[0.5,0.18],[0.34,0.22],[0.66,0.22],[0.46,0.34]];
   for(const [fx,fy] of fractions){
    const x=Math.round(box.x+box.width*fx),y=Math.round(box.y+box.height*fy);
    bankBefore=(await probe(page)).bank;
    await clearSiteStamp(page);
    await tap(page,x,y);
    await waitSiteStamp(page);
    const s=await siteStamp(page);
    attempts.push({x:Math.round(fx*100)/100,y:Math.round(fy*100)/100,ok:s.ok==="true",code:s.code});
    if(s.ok==="true"){built={x,y};bankAfter=(await probe(page)).bank;break;}
    const after=(await probe(page)).bank;
    if(JSON.stringify(delta(after,bankBefore,KEYS))!==JSON.stringify({credits:0,scrap:0,stone:0}))throw Error("rejected tap spent materials: "+JSON.stringify({s,after,bankBefore}));
   }
   if(!built)throw Error("no candidate tap produced a legal build: "+JSON.stringify(attempts));
   const buildDelta=delta(bankAfter,bankBefore,KEYS);
   if(JSON.stringify(buildDelta)!==JSON.stringify({credits:-COST.credits,scrap:-COST.scrap,stone:-COST.stone}))throw Error("UI build must spend exactly the blueprint cost once: "+JSON.stringify(buildDelta));
   const pAfter=await probe(page);
   if(pAfter.buildings.length!==6)throw Error("UI build must add exactly one building (6 starters minus frozen generator + 1): "+pAfter.buildings.length);
   // The successful tap auto-opens the inspector on the new machine. Cancel
   // FIRST (assembly completes in 5s — phone screenshots are slow), then prove
   // the duplicate plain click on a second real build at the same point.
   await page.locator('[data-testid="cancel-construction"]').waitFor({state:"visible",timeout:5000});
   await shot(page,"ui-build-ok");
   // Activate the cancel button via an in-page DOM click in the SAME task as
   // the label read: zero actionability delay, so the transaction lands well
   // inside the 5s assembly window. It fires the app's real onCancel handler
   // (simulation.cancelConstruction) — the same transaction a player click
   // drives. Bank before == the post-build probe: with power frozen,
   // credits/scrap/stone are never produced or dispatched between the taps.
   const cancelLabel=await page.evaluate(()=>{const btn=document.querySelector('[data-testid="cancel-construction"]');if(!btn)return null;const label=btn.textContent;btn.click();return label;});
   if(cancelLabel==null)throw Error("cancel button vanished before activation (assembly completed) — rerun");
   await page.waitForFunction((expected)=>{try{const p=JSON.parse(document.body.dataset.fleetProbe||"null");return !!p&&p.bank.credits>=expected;}catch{return false;}},bankAfter.credits+COST.credits,{timeout:5000,polling:50});
   const bankCancelAfter=(await probe(page)).bank;
   const refundDelta=delta(bankCancelAfter,bankAfter,KEYS);
   if(JSON.stringify(refundDelta)!==JSON.stringify({credits:COST.credits,scrap:COST.scrap,stone:COST.stone}))throw Error("cancel must refund the full paid cost exactly: "+JSON.stringify(refundDelta));
   const pCancel=await probe(page);
   if(pCancel.buildings.length!==5)throw Error("cancel must remove the assembling building: "+pCancel.buildings.length);
   if(JSON.stringify(delta(bankCancelAfter,seedBank,KEYS))!==JSON.stringify({credits:0,scrap:0,stone:0}))throw Error("build->cancel must restore the starting bank exactly: "+JSON.stringify(delta(bankCancelAfter,seedBank,KEYS)));
   await shot(page,"ui-cancel-refund");
   // REBUILD: same screen point, now empty again -> a second REAL UI build.
   await page.locator('[data-tool="build"]').click();
   await page.waitForTimeout(200);
   const bankRebuildBefore=(await probe(page)).bank;
   await clearSiteStamp(page);
   await tap(page,built.x,built.y);
   await waitSiteStamp(page);
   const rebuildStamp=await siteStamp(page);
   if(rebuildStamp.ok!=="true")throw Error("rebuild at the canceled site must succeed: "+JSON.stringify(rebuildStamp));
   const bankRebuildAfter=(await probe(page)).bank;
   const rebuildDelta=delta(bankRebuildAfter,bankRebuildBefore,KEYS);
   if(JSON.stringify(rebuildDelta)!==JSON.stringify({credits:-COST.credits,scrap:-COST.scrap,stone:-COST.stone}))throw Error("rebuild must spend exactly the cost once: "+JSON.stringify(rebuildDelta));
   const pRebuild=await probe(page);
   if(pRebuild.buildings.length!==6)throw Error("rebuild must add exactly one building: "+pRebuild.buildings.length);
   // DUPLICATE PLAIN CLICK: re-enter build mode, tap the SAME screen point.
   // The cell is now occupied -> COLLISION, zero spend, still one building.
   await page.locator('[data-tool="build"]').click();
   await page.waitForTimeout(200);
   const bankDupBefore=(await probe(page)).bank;
   await clearSiteStamp(page);
   await tap(page,built.x,built.y);
   await waitSiteStamp(page);
   const dupStamp=await siteStamp(page);
   if(dupStamp.ok!=="false"||dupStamp.code!=="COLLISION")throw Error("duplicate plain click must COLLISION: "+JSON.stringify(dupStamp));
   const bankDupAfter=(await probe(page)).bank;
   if(JSON.stringify(delta(bankDupAfter,bankDupBefore,KEYS))!==JSON.stringify({credits:0,scrap:0,stone:0}))throw Error("duplicate click spent materials");
   const pDup=await probe(page);
   if(pDup.buildings.length!==6)throw Error("duplicate click added a building: "+pDup.buildings.length);
   await shot(page,"ui-duplicate-collision");
   view.proof.uiTransactions={
    powerFrozen:"starter generator removed in seed -> supply 0, no production; credits/scrap/stone never produced or dispatched",
    attempts,buildDelta,buildingsAfterBuild:pAfter.buildings.length,
    cancel:{button:cancelLabel.replace(/\s+/g," "),refund:refundDelta,buildingsAfter:pCancel.buildings.length,bankRestoredToSeed:true},
    rebuild:{stamp:rebuildStamp,spend:rebuildDelta,buildings:pRebuild.buildings.length},
    duplicateClick:{stamp:dupStamp,spend:delta(bankDupAfter,bankDupBefore,KEYS),buildings:pDup.buildings.length},
    note:"build/rebuild/duplicate driven through real dock clicks + physical canvas taps on the production build; cancel activated via in-page DOM click on the real button (same onCancel transaction, zero actionability delay to stay inside the 5s assembly window); validator verdicts read from the app's own lastSite* stamps, banks from its fleetProbe snapshot"};
   await ctx.close();
  }

  view.pageErrors=errs;view.failedRequests=failed;
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
 console.log("BLD-04 atomic construction capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}
