// UX-01 (#359) resource strip + freight ledger evidence capture. NEW script —
// the leased scripts/capture-v2.mjs and scripts/capture-live.mjs are untouched;
// this reuses the capture-ux.mjs production-preview harness (bounded
// waitForFunction + synchronous camera stamps, seeded authoritative saves).
// Proves: strip mirrors the source-of-truth save (no ghost balances), critical
// vs warning shortage states, reserved transit badges, committed assembly
// costs, locked prestige rows, empty state, persisted disclosure toggle,
// world-center preservation across panel open/close/resize, 44px targets,
// no document scroll, motion, intact #307 camera stamp sync.
// Numeric/runtime evidence only — the sponsor still reviews the screenshots.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS} from "../src/camera.js";
import {createGame,checkSite,buildAt,connectedToRoad,advanceGame} from "../src/simulation.js";
import {BLUEPRINTS,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {STRIP_SETTINGS_KEY,LOCKED_RESOURCES} from "../src/resourceStrip.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/359-ux-01");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4176,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const report={version:1,issue:359,task:"UX-01 actionable resource strip",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:["One headless Chromium/SwiftShader run; phone/landscape views are emulated, not physical devices","Numeric mirror proofs do not certify visual beauty — sponsor review required at G1 (#276)","Local preview only — the live hosted receipt is produced at release by the release engineer"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// ---- deterministic seeded saves (authoritative sim transactions in-node) ----
function legalSite(g,type,rot=0,avoid=[]){
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++){
  if(avoid.some(a=>Math.abs(a.x-x)<3&&Math.abs(a.z-z)<3))continue;
  if(checkSite(g,type,x,z,rot).ok&&connectedToRoad(g,{x,z,type,rot}))return {x,z};
 }
 throw Error("No legal site for "+type+" on seed "+g.seed);
}
// CRITICAL: starving furnace, depot cannot cover, trucks cannot dispatch
// (bank below the sim's n*2 resupply threshold) -> stable critical shortage.
function criticalSave(){
 const g=createGame();
 g.bank.iron=0;g.bank.fuel=0;
 const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};
 g.vehicles.forEach(v=>{v.job=null;});
 return g;
}
// TRANSIT: real in-node dispatch — assignJob take()s cargo from the depot, so
// the seeded jobs are genuine reservations, never fabricated balances.
function transitSave(){
 const g=createGame();
 const f=g.buildings.find(b=>b.type==="furnace");f.inventory={};
 for(let i=0;i<400;i++){
  advanceGame(g,0.25);
  if(g.vehicles.some(v=>v.job&&v.job.resource==="iron")&&g.vehicles.some(v=>v.job&&v.job.resource==="fuel"))break;
 }
 if(!g.vehicles.some(v=>v.job))throw Error("transit seed: sim never dispatched");
 // Normalize every job to its exact at-assignment state (phase toSource,
 // segment 0, progress 0 — the same fields assignJob writes after take()).
 // Cargo is genuinely reserved; the trucks simply haven't driven yet.
 for(const v of g.vehicles)if(v.job){v.job.phase="toSource";v.job.route=v.job.toSource;v.job.segment=0;v.job.progress=0;}
 return g;
}
// PROCESSING: a real buildAt transaction mid-assembly (committed blueprint cost).
function processingSave(){
 const g=createGame();
 const site=legalSite(g,"furnace");
 const r=buildAt(g,"furnace",site.x,site.z,0);
 if(!r.ok)throw Error("processing seed: "+r.reason);
 r.building.remaining=4.5;
 return {save:g,assembling:r.building};
}
function poorSave(){const g=createGame();g.bank={credits:3,scrap:2,stone:0,iron:0,fuel:0,steel:0,parts:0,chips:0};g.buildings.forEach(b=>b.inventory={});return g;}
const CRITICAL=criticalSave(),TRANSIT=transitSave(),PROCESSING=processingSave();
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;
const jobSum=(g,id)=>g.vehicles.reduce((a,v)=>a+(v.job&&v.job.resource===id?v.job.amount:0),0);

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
  {name:"landscape",viewport:{width:844,height:390},dpr:2,isMobile:true,touch:true},
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
  const pose=page=>page.locator(".world-canvas").evaluate(c=>({yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)}));
  const waitForStamp=async(page,pred,arg,label)=>{
   try{await page.waitForFunction(pred,arg,{timeout:8000,polling:50});}
   catch{throw Error(label+" — stamp never updated within 8000ms: pose="+JSON.stringify(await pose(page)));}
  };
  const chipValue=async(page,id)=>Number((await page.locator(`.resources-strip button[data-resource="${id}"] strong`).innerText()).replace(/[^0-9.-]/g,""));
  const chipState=async(page,id)=>page.locator(`.resources-strip button[data-resource="${id}"]`).getAttribute("data-state");
  const saveNow=page=>page.evaluate(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},SAVE_KEY);
  const openLedger=async(page,id)=>{
   await page.locator(id?`.resources-strip button[data-resource="${id}"]`:".resource-more").click();
   await page.locator(".panel-host .ledger-panel").waitFor({state:"visible",timeout:5000});
   await page.waitForTimeout(350);
  };
  const detailNum=async(page,testid)=>Number((await page.locator(`[data-testid="${testid}"]`).innerText()).replace(/[^0-9.-]/g,""));

  // ================= CRITICAL context: mirror / shortages / locked / disclosure / persistence =================
  {
   const {ctx,page}=await newPage(JSON.stringify(CRITICAL));
   const stamps=await page.locator(".world-canvas").evaluate(c=>({...c.dataset}));
   if(stamps.world3d!=="ready"||!Number.isFinite(Number(stamps.cameraYaw)))throw Error("Camera stamps missing at load: "+JSON.stringify(stamps));
   view.proof.loadStamps={world3d:stamps.world3d,yaw:Number(stamps.cameraYaw),elevation:Number(stamps.cameraElevation),zoom:Number(stamps.cameraZoom)};

   // 1) All six headline chips visible at EVERY viewport (no hidden shortages).
   const chips=await page.evaluate(()=>[...document.querySelectorAll(".resources-strip button[data-resource]")].map(el=>{
    const r=el.getBoundingClientRect();return {id:el.dataset.resource,state:el.dataset.state,width:Math.round(r.width),height:Math.round(r.height),visible:r.width>0&&r.height>0};
   }));
   if(chips.length!==6||chips.some(c=>!c.visible))throw Error("Strip must show all 6 headline resources: "+JSON.stringify(chips));
   if(chips.some(c=>c.height<44))throw Error("Strip touch targets below 44px: "+JSON.stringify(chips));
   const moreBox=await page.locator(".resource-more").boundingBox();
   if(!moreBox||moreBox.height<44)throw Error("Ledger opener below 44px: "+JSON.stringify(moreBox));
   view.proof.strip={chips,moreTarget:{width:Math.round(moreBox.width),height:Math.round(moreBox.height)}};

   // 2) Critical shortage states + alert (desktop) mirror the starving furnace.
   if(await chipState(page,"iron")!=="critical"||await chipState(page,"fuel")!=="critical")
    throw Error("Starving furnace with empty depot must flag iron/fuel CRITICAL");
   const alert=page.locator('[data-testid="strip-alert"]');
   const alertVisible=await alert.isVisible();
   if(v.viewport.width>1150){
    if(!alertVisible)throw Error("Desktop strip must surface the critical shortage alert");
    const alertTxt=await alert.innerText();
    if(!/2 SHORT/.test(alertTxt))throw Error("Alert must count both critical materials: "+alertTxt);
    view.proof.stripAlert={text:alertTxt.replace(/\s+/g," "),visible:true};
   }else view.proof.stripAlert={visible:false,note:"phone/compact: per-chip flags carry the signal"};
   await shot(page,"critical");

   // 3) SOURCE-OF-TRUTH mirror: frozen resources match the live save exactly;
   //    scrap only grows (salvager produces), so chip >= persisted save.
   const save=await saveNow(page);
   if(!save)throw Error("Seeded save missing from localStorage");
   const mirror={};
   for(const id of ["credits","iron","steel","fuel","data"]){
    const shown=await chipValue(page,id);
    if(shown!==(save.bank[id]||0))throw Error(`Ghost balance: ${id} chip ${shown} != save ${save.bank[id]||0}`);
    mirror[id]={chip:shown,save:save.bank[id]||0,exact:true};
   }
   const scrapShown=await chipValue(page,"scrap"),scrapSave=save.bank.scrap||0;
   if(scrapShown<scrapSave)throw Error(`Scrap chip ${scrapShown} below save ${scrapSave}`);
   mirror.scrap={chip:scrapShown,save:scrapSave,monotonic:true};
   view.proof.sourceOfTruth=mirror;

   // 4) World center preserved across ledger open / close / resize.
   const poseBefore=await pose(page);
   await openLedger(page,"iron");
   const poseOpen=await pose(page);
   if(JSON.stringify(poseOpen)!==JSON.stringify(poseBefore))throw Error("Opening the ledger moved the camera: "+JSON.stringify({poseBefore,poseOpen}));
   // Ledger breakdown mirrors the read model over the same authoritative bags.
   const detail={resource:await page.locator('[data-testid="ledger-detail"]').getAttribute("data-resource"),
    state:await page.locator('[data-testid="ledger-state"]').innerText(),
    depot:await detailNum(page,"ledger-depot"),machines:await detailNum(page,"ledger-machines"),
    reserved:await detailNum(page,"ledger-reserved"),committed:await detailNum(page,"ledger-committed"),
    total:await detailNum(page,"ledger-total"),capacity:await page.locator('[data-testid="ledger-capacity"]').innerText()};
   if(detail.resource!=="iron"||!/CRITICAL/.test(detail.state))throw Error("Iron detail must open CRITICAL: "+JSON.stringify(detail));
   if(detail.depot!==0||detail.machines!==0||detail.reserved!==0||detail.total!==0)throw Error("Critical iron breakdown must be honest zeros: "+JSON.stringify(detail));
   if(detail.capacity!=="No cap")throw Error("Capacity must honestly say No cap (sim exposes none): "+detail.capacity);
   const shortageRows=await page.locator('[data-testid="ledger-shortages"] [data-state="critical"]').count();
   if(shortageRows<2)throw Error("Ledger must list both critical shortages, got "+shortageRows);
   const shortageNote=await page.locator('[data-testid="shortage-iron"] small').innerText();
   if(!/cannot cover/.test(shortageNote))throw Error("Critical detail must explain the deficit: "+shortageNote);
   view.proof.ledgerCritical={detail,shortageRows,shortageNote};
   await shot(page,"ledger-critical");

   // 5) LOCKED prestige rows: honest locked state, no fabricated earnability.
   const lockedRows=await page.evaluate(ids=>ids.map(id=>{
    const el=document.querySelector(`.ledger-row[data-resource="${id}"]`);
    return el?{id,state:el.dataset.state,lockedBadge:!!el.querySelector("em")}:null;
   }),LOCKED_RESOURCES);
   if(lockedRows.some(r=>!r||r.state!=="locked"||!r.lockedBadge))throw Error("Prestige rows must be LOCKED with badge: "+JSON.stringify(lockedRows));
   await page.locator('.ledger-row[data-resource="relics"]').click();
   await page.waitForTimeout(250);
   const lockedState=await page.locator('[data-testid="ledger-state"]').innerText();
   const lockedNote=await page.locator('[data-testid="ledger-detail-note"]').innerText();
   if(!/LOCKED/.test(lockedState)||!/later progression/.test(lockedNote))throw Error("Locked detail must be honest: "+lockedState+" / "+lockedNote);
   view.proof.locked={rows:lockedRows,detailState:lockedState,detailNote:lockedNote};
   await shot(page,"ledger-locked");

   // 6) Progressive disclosure: transaction ledger hidden until requested.
   const toggle=page.locator('[data-testid="ledger-toggle"]');
   if(await toggle.getAttribute("aria-expanded")!=="false")throw Error("Transaction ledger must start collapsed");
   if(await page.locator('[data-testid="ledger-entries"]').count())throw Error("Collapsed ledger must not render entries");
   const toggleBox=await toggle.boundingBox();
   if(!toggleBox||toggleBox.height<44)throw Error("Disclosure toggle below 44px");
   await toggle.click();
   await page.locator('[data-testid="ledger-entries"]').waitFor({state:"visible",timeout:5000});
   if(await toggle.getAttribute("aria-expanded")!=="true")throw Error("Toggle must expose aria-expanded=true");
   const emptyEntries=await page.locator('[data-testid="ledger-entries"]').innerText();
   if(!/No transactions recorded yet/.test(emptyEntries))throw Error("Fresh save must show the honest empty ledger: "+emptyEntries);
   view.proof.disclosure={startsCollapsed:true,emptyState:emptyEntries.trim(),toggleTarget:{width:Math.round(toggleBox.width),height:Math.round(toggleBox.height)}};
   await shot(page,"ledger-open");

   // 7) Escape closes the panel; world center untouched.
   await page.keyboard.press("Escape");
   await page.waitForFunction(()=>!document.querySelector(".panel-host"),null,{timeout:5000,polling:50});
   const poseClosed=await pose(page);
   if(JSON.stringify(poseClosed)!==JSON.stringify(poseBefore))throw Error("Closing the ledger moved the camera");
   view.proof.worldCenter={before:poseBefore,open:poseOpen,closed:poseClosed,preserved:true};

   // 8) Disclosure preference persists across reload (separate strip key).
   await page.reload({waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await page.waitForTimeout(700);
   const persisted=await page.evaluate(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},STRIP_SETTINGS_KEY);
   if(persisted?.ledgerOpen!==true)throw Error("Strip disclosure preference did not persist: "+JSON.stringify(persisted));
   await openLedger(page,null);
   if(await page.locator('[data-testid="ledger-toggle"]').getAttribute("aria-expanded")!=="true")throw Error("Persisted ledgerOpen not applied after reload");
   if(!(await page.locator('[data-testid="ledger-entries"]').isVisible()))throw Error("Persisted open ledger must render entries after reload");
   view.proof.settingsPersistence={key:STRIP_SETTINGS_KEY,ledgerOpenAfterReload:true};
   await page.keyboard.press("Escape");
   await page.waitForFunction(()=>!document.querySelector(".panel-host"),null,{timeout:5000,polling:50});

   // 9) Resize preserves the world center (desktop only; phone rotates below).
   if(!v.isMobile){
    const resizeProof=[];
    for(const vp of [{width:1180,height:820},{width:1440,height:900}]){
     await page.setViewportSize(vp);await page.waitForTimeout(700);
     const p=await pose(page);
     if(p.x!==poseBefore.x||p.z!==poseBefore.z||p.yaw!==poseBefore.yaw||p.elevation!==poseBefore.elevation)
      throw Error("Resize moved the world center: "+JSON.stringify({poseBefore,after:p}));
     resizeProof.push({viewport:vp,center:{x:p.x,z:p.z},yaw:p.yaw,elevation:p.elevation});
    }
    view.proof.resizeWorldCenter=resizeProof;
   }

   // 10) Motion proof: rAF simulation advances under reduced-motion CSS.
   const f1=await page.screenshot({animations:"disabled"});
   await page.waitForTimeout(1500);
   const f2=await page.screenshot({animations:"disabled"});
   view.proof.motion={framesDiffer:!f1.equals(f2),note:"rAF simulation advances even with prefers-reduced-motion CSS"};
   if(f1.equals(f2))throw Error("Simulation appears frozen between frames 1.5s apart");

   // 11) #307 camera invariants intact: visible Zoom in works + stamp sync.
   const beforeZoom=await pose(page);
   await page.getByRole("button",{name:"Zoom in"}).click();
   await waitForStamp(page,p=>{const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraZoom)>p;},beforeZoom.zoom,"Zoom in control did not work");
   const afterZoom=await pose(page);
   const applied=await page.evaluate(()=>Number(document.body.dataset.lastZoomApplied));
   if(!Number.isFinite(applied)||Math.abs(afterZoom.zoom-applied)>1e-6)throw Error("CAMERA_STAMP_DESYNC: zoom "+afterZoom.zoom+" vs applied "+applied);
   if(afterZoom.zoom>CAMERA_LIMITS.maxZoom)throw Error("Zoom exceeded CAMERA_LIMITS");
   view.proof.cameraInvariants={beforeZoom:beforeZoom.zoom,afterZoom:afterZoom.zoom,stampMatchesApplied:true,world3d:"ready"};

   const scroll=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)>innerHeight+2||Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+2);
   if(scroll)throw Error("Document scrolls at "+v.name+" — layout must stay fixed");
   view.proof.documentScroll=false;
   await ctx.close();
  }

  // ================= TRANSIT context: reserved badges mirror real dispatch =================
  {
   const {ctx,page}=await newPage(JSON.stringify(TRANSIT));
   // Read immediately: the seed save is the live state until the first persist.
   const ironJobs=jobSum(TRANSIT,"iron"),fuelJobs=jobSum(TRANSIT,"fuel");
   await page.locator('.resources-strip button[data-resource="iron"] .resource__reserved').waitFor({state:"visible",timeout:5000});
   const reservedTxt=await page.locator('.resources-strip button[data-resource="iron"] .resource__reserved').innerText();
   const reservedShown=Number(reservedTxt.replace(/[^0-9.-]/g,""));
   if(reservedShown!==ironJobs)throw Error(`Reserved badge ${reservedShown} != real dispatched iron jobs ${ironJobs}`);
   const ironDepot=await chipValue(page,"iron");
   if(ironDepot!==(TRANSIT.bank.iron||0))throw Error(`Transit depot ${ironDepot} != save ${TRANSIT.bank.iron}`);
   const ironState=await chipState(page,"iron");
   if(ironState!=="warning"&&ironState!=="critical")throw Error("Starving furnace with inbound cargo must flag a shortage, got "+ironState);
   await openLedger(page,"iron");
   const reservedDetail=await detailNum(page,"ledger-reserved");
   const totalDetail=await detailNum(page,"ledger-total");
   const machinesDetail=await detailNum(page,"ledger-machines");
   const depotDetail=await detailNum(page,"ledger-depot");
   if(reservedDetail!==ironJobs)throw Error("Ledger reserved must equal real job cargo: "+reservedDetail+" vs "+ironJobs);
   if(totalDetail!==depotDetail+machinesDetail+reservedDetail)throw Error("Yard total must conserve depot+machines+transit: "+JSON.stringify({totalDetail,depotDetail,machinesDetail,reservedDetail}));
   view.proof.transit={ironJobs,fuelJobs,reservedBadge:reservedTxt,depot:ironDepot,chipState:ironState,
    ledger:{depot:depotDetail,machines:machinesDetail,reserved:reservedDetail,total:totalDetail},conservation:true};
   await shot(page,"transit");
   await ctx.close();
  }

  // ================= PROCESSING context: committed assembly + real ledger entry =================
  {
   const {ctx,page}=await newPage(JSON.stringify(PROCESSING.save));
   await openLedger(page,"iron");
   const committed=await detailNum(page,"ledger-committed");
   const expectedCommitted=BLUEPRINTS.furnace.cost.iron||0;
   if(committed!==expectedCommitted)throw Error(`Committed iron ${committed} != assembling blueprint cost ${expectedCommitted}`);
   const depot=await detailNum(page,"ledger-depot");
   if(depot!==(PROCESSING.save.bank.iron||0))throw Error("Processing depot must mirror the post-buildAt bank");
   const toggle=page.locator('[data-testid="ledger-toggle"]');
   if(await toggle.getAttribute("aria-expanded")==="true"){await toggle.click();} // normalize (fresh context starts collapsed anyway)
   await toggle.click();
   await page.locator('[data-testid="ledger-entries"]').waitFor({state:"visible",timeout:5000});
   const entryTxt=await page.locator('[data-testid="ledger-entries"] .ledger-entry[data-kind="build"]').first().innerText();
   if(!/furnace/i.test(entryTxt))throw Error("Ledger must show the real BUILD transaction: "+entryTxt);
   view.proof.processing={committedIron:committed,depotAfterSpend:depot,ledgerEntry:entryTxt.replace(/\s+/g," "),
    note:"committed cost is already spent by buildAt; cancel refunds it in full (unit-tested)"};
   await shot(page,"ledger-processing");
   await ctx.close();
  }

  // ================= EMPTY context: honest zeros everywhere =================
  {
   const {ctx,page}=await newPage(JSON.stringify(poorSave()));
   // Open the ledger first — rows only exist inside the panel.
   await openLedger(page,null);
   const rows=await page.evaluate(()=>[...document.querySelectorAll(".ledger-row")].map(el=>({id:el.dataset.resource,state:el.dataset.state})));
   const nonLocked=rows.filter(r=>!LOCKED_RESOURCES.includes(r.id));
   if(nonLocked.some(r=>r.state!=="empty"&&r.state!=="critical"))throw Error("Poor save must read empty/critical, never fabricated stock: "+JSON.stringify(rows));
   const creditsChip=await chipValue(page,"credits");
   if(creditsChip!==3)throw Error("Credits chip must mirror the poor save exactly: "+creditsChip);
   view.proof.empty={creditsChip,rows:rows.length,emptyOrCritical:nonLocked.length,locked:rows.length-nonLocked.length};
   await shot(page,"empty");
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
 console.log("UX-01 resource strip capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}
