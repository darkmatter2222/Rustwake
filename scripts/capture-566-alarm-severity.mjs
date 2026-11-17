// #566 — alarm-rail severity evidence capture. NEW evidence tooling (no leased
// harness touched; probe-564-geometry.mjs, probe-568-topband.mjs, capture-ux06.mjs
// and probe-566-swipe-discrimination.mjs are separate). Production-preview harness
// (vite preview of the REAL production build) on a private port. One view per run
// (RUSTWAKE_CAPTURE_VIEW=desktop|phone) so each bounded run stays well under cap.
//
// Clause 1 — fresh UNTOUCHED yard, ZERO player input (no seed, no clicks): sample
//   the rendered alarm rail at t=0/15/30/45/60/120/180/240 real seconds and assert
//   NO WARNING chip whose own aria-label (problem+remedy) says the condition is
//   already covered / automatic. The covered-shortage signal must still survive on
//   the UX-01 strip chip flag (◔) — recorded per sample.
// Clause 3 — DISCRIMINATION via a REAL player UI path: on a fresh yard, open the
//   Trade Exchange and repeatedly press the real "Sell 10" iron button until the
//   depot is drained and the furnace deficit becomes UNCOVERED. The SAME resource
//   that was covered (strip ◔, no rail alarm) must then raise a visible CRITICAL
//   rail alarm with the correct "cannot cover it" problem text and a STATE-CHANGING
//   remedy (Construct Scrap Extractor) that routes into the build catalog. A fixture
//   is NOT used; this is reachable by any player through the real Exchange UI.
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — phone EMULATED, headless
// Chromium/SwiftShader; sponsor G1 (#276) and handset (#268/#275) remain owed.
import {chromium} from "playwright-core";
import {SAVE_KEY} from "../src/content.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const VIEW=(process.env.RUSTWAKE_CAPTURE_VIEW||"desktop").toLowerCase();
if(!["desktop","phone"].includes(VIEW))throw Error("RUSTWAKE_CAPTURE_VIEW must be desktop|phone");
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||`docs/evidence/566-alarm-severity/timeline-${VIEW}`);
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4199,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const V=VIEW==="phone"
 ?{name:"phone",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true}
 :{name:"desktop",viewport:{width:1440,height:900},dpr:1,isMobile:false,touch:false};
const TIMELINE=[0,15,30,45,60,120,180,240];
// A WARNING cries wolf iff its own text says the deficit is already covered/automatic.
const CRY_WOLF=/covers it|already covers|deliver automatically|delivery is automatic|\bautomatic\b/i;
const report={version:1,issue:566,view:VIEW,build:"production-preview",source_sha:SHA,
 started:new Date().toISOString(),timeline:[],discrimination:null,status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone 390x844 is EMULATED (isMobile+hasTouch+dpr2), not a physical handset (#268/#275 owed)",
  "PASS_NUMERIC_ONLY: rendered chip/aria-label/box proofs do not certify visual fidelity — sponsor visual review at G1 (#276) is still owed",
  "Local production preview only — no hosted-deployment receipt; branch CI green is not a production release",
  "Clause 1 uses a normal fresh yard with NO seed and ZERO input; clause 3 reaches the uncovered deficit through the real Trade Exchange Sell-10 UI, not a fixture"]};
let child,browser,anyFail=false;
await mkdir(OUT,{recursive:true});

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 let previewExit=null;
 child.on("exit",c=>{previewExit=c;});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){
  if(previewExit!==null)throw Error("preview exited early (code "+previewExit+") — port conflict? Refusing a foreign/stale server on "+PORT);
  try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!open)throw Error("Production preview did not become available on "+PORT);
 {
  const html=await (await fetch(HOST,{signal:AbortSignal.timeout(5000)})).text();
  const hrefs=[...html.matchAll(/href="([^"]+\.css)"/g)].map(m=>m[1]);
  let served=null;
  for(const h of hrefs){const t=await (await fetch(new URL(h,HOST),{signal:AbortSignal.timeout(5000)})).text();
   if(t.includes("grid-template-rows:30px 44px")&&t.includes("top:156px")&&t.includes("touch-action:pan-x")){served=h;break;}}
  if(!served)throw Error("served CSS on "+PORT+" lacks the #568/#550 markers — stale or foreign build; refusing to measure");
  report.servedCss=served;
 }
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 const errs=[];
 const newPage=async(seedJson)=>{
  const ctx=await browser.newContext({viewport:V.viewport,deviceScaleFactor:V.dpr,isMobile:V.isMobile,hasTouch:V.touch,reducedMotion:"reduce"});
  // __RW_PROBES__ is a READ-ONLY telemetry flag (alarmProbe/panelProbe); it does
  // not inject game state. Clause 1 passes NO seed: the app boots its own fresh yard.
  await ctx.addInitScript(([key,seed])=>{try{window.__RW_PROBES__=true;if(seed!=null){const g=JSON.parse(seed);g.lastSavedAt=Date.now();localStorage.setItem(key,JSON.stringify(g));}}catch(e){window.__SEED_ERR__=String(e);}},[SAVE_KEY,seedJson??null]);
  const page=await ctx.newPage();
  page.on("pageerror",e=>errs.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
  await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.alarmProbe||"null")?.kind==="ready";}catch{return false;}},null,{timeout:15000,polling:100});
  await page.waitForTimeout(700);
  return {ctx,page};
 };
 const shot=async(page,label)=>{const f=`${VIEW}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});return f;};
 // Passive read of the RENDERED rail + strip (no input). The chip aria-label
 // carries the full problem+remedy text the player hears/sees.
 const readRail=page=>page.evaluate(()=>{
  const chips=[...document.querySelectorAll('.alarm-rail .alarm-chip[data-testid^="alarm-chip-"]')].map(el=>({
   testid:el.getAttribute("data-testid"),severity:el.getAttribute("data-severity"),state:el.getAttribute("data-state"),
   kind:el.getAttribute("data-kind"),ariaLabel:el.getAttribute("aria-label")}));
  let probe=null;try{probe=JSON.parse(document.body.dataset.alarmProbe);}catch{}
  const iron=document.querySelector('.resources-strip .resource[data-resource="iron"]');
  const ironFlag=iron?iron.querySelector(".resource__flag"):null;
  return {chips,empty:!!document.querySelector('[data-testid="alarms-empty"]'),
   summary:!!document.querySelector('[data-testid="alarm-summary"]'),
   probe:probe?{ids:probe.ids,counts:probe.counts}:null,
   stripIron:iron?{state:iron.getAttribute("data-state"),flag:ironFlag?ironFlag.textContent:null}:null,
   live:document.querySelector('[data-testid="alarm-live"]')?.textContent||null};
 });

 // ================= Clause 1 — untouched-yard timeline (ZERO input) =================
 {
  const {ctx,page}=await newPage(null);
  const seedErr=await page.evaluate(()=>window.__SEED_ERR__||null);
  if(seedErr)throw Error("init flag failed: "+seedErr);
  const t0=Date.now();
  for(const t of TIMELINE){
   const waitMs=t*1000-(Date.now()-t0);
   if(waitMs>0)await page.waitForTimeout(waitMs);
   const snap=await readRail(page);
   const elapsed=+((Date.now()-t0)/1000).toFixed(1);
   const warnings=snap.chips.filter(c=>c.severity==="warning");
   const cryWolf=warnings.filter(c=>CRY_WOLF.test(c.ariaLabel||""));
   const starveWarnings=snap.chips.filter(c=>c.severity==="warning"&&/starve-/.test(c.testid||""));
   const storage=snap.chips.filter(c=>/storage-/.test(c.testid||"")).map(c=>c.ariaLabel);
   const rec={t,elapsed,...snap,warningsCount:warnings.length,cryWolfWarnings:cryWolf.map(c=>c.testid),starveWarnings:starveWarnings.map(c=>c.testid),storageRemedy:storage,screenshot:await shot(page,`t${String(t).padStart(3,"0")}`)};
   report.timeline.push(rec);
   if(cryWolf.length){anyFail=true;report.errors.push(`clause1 t=${t}: WARNING chip(s) whose own text says covered/automatic: `+JSON.stringify(cryWolf.map(c=>({id:c.testid,aria:c.ariaLabel}))));}
   if(starveWarnings.length){anyFail=true;report.errors.push(`clause1 t=${t}: covered starvation still raises a WARNING rail chip: `+JSON.stringify(starveWarnings.map(c=>c.testid)));}
  }
  await ctx.close();
 }

 // ================= Clause 3 — player-reachable uncovered deficit (real Exchange) =================
 {
  const {ctx,page}=await newPage(null);
  const before=await readRail(page);
  const beforeShot=await shot(page,"disc-before-covered");
  // Open the real Trade Exchange tool.
  await page.locator('[data-tool="market"]').click();
  await page.locator(".trade-row").first().waitFor({state:"visible",timeout:5000});
  const ironSell=page.locator(".trade-row button").nth(1); // map order: scrap,iron,...
  const sellStart=Date.now();
  let clicks=0,after=null,afterShot=null,reached=false;
  // Press the real "Sell 10" iron button until the deficit becomes UNCOVERED and
  // the rail raises starve-iron CRITICAL. Bounded by wall clock (player-reachable).
  while(Date.now()-sellStart<80000){
   for(let k=0;k<6;k++){
    if(await ironSell.isEnabled().catch(()=>false)){await ironSell.click().catch(()=>{});clicks++;}
    await page.waitForTimeout(45);
   }
   const probe=await page.evaluate(()=>{try{return JSON.parse(document.body.dataset.alarmProbe);}catch{return null;}});
   const chip=page.locator('[data-testid="alarm-chip-starve-iron"]');
   if(probe?.ids?.includes("starve-iron")&&await chip.count()){
    const sev=await chip.getAttribute("data-severity");
    if(sev==="critical"){reached=true;break;}
   }
  }
  const sellElapsed=+((Date.now()-sellStart)/1000).toFixed(1);
  const disc={sellClicks:clicks,sellElapsed,reached,before:{stripIron:before.stripIron,railStarveIron:before.chips.some(c=>c.testid==="alarm-chip-starve-iron"),chips:before.chips.map(c=>({id:c.testid,sev:c.severity})),screenshot:beforeShot}};
  if(!reached){
   anyFail=true;report.errors.push(`clause3: real Exchange Sell-10 iron did not raise starve-iron CRITICAL within 80s (clicks=${clicks}). Final probe: `+JSON.stringify(await page.evaluate(()=>{try{return JSON.parse(document.body.dataset.alarmProbe);}catch{return null;}})));
   disc.after=null;
  }else{
   // Collapse the Exchange sheet so the rail chip is reachable (real sheet-toggle).
   if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed").catch(()=>null)!=="true"){
    await page.locator('[data-testid="sheet-toggle"]').click().catch(()=>{});
    await page.waitForFunction(()=>document.querySelector('[data-testid="panel-host"]')?.dataset.collapsed==="true",null,{timeout:5000}).catch(()=>{});
   }
   const chip=page.locator('[data-testid="alarm-chip-starve-iron"]');
   await chip.waitFor({state:"visible",timeout:5000});
   let chipSeverity=await chip.getAttribute("data-severity");
   const chipAria=await chip.getAttribute("aria-label");
   await chip.click();
   await page.locator('[data-testid="alarm-detail"]').waitFor({state:"visible",timeout:5000});
   const problem=await page.locator('[data-testid="alarm-problem"]').textContent();
   const remedy=await page.locator('[data-testid="alarm-remedy"]').textContent();
   const actionLabel=await page.locator('[data-testid="alarm-action"]').textContent();
   // MEASURE the remedy button before activating it: count, box, visible/enabled,
   // computed display/visibility/opacity/pointer-events for it AND every ancestor
   // up to body, and document.elementFromPoint at its centre (overlay hit-test).
   const measureAction=()=>page.evaluate(()=>{
    const els=[...document.querySelectorAll('[data-testid="alarm-action"]')];
    const el=els[0];if(!el)return {count:els.length,present:false};
    const r=el.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2,cs=getComputedStyle(el);
    const ancestors=[];let n=el;
    while(n&&n!==document.body){const s=getComputedStyle(n),b=n.getBoundingClientRect();
     ancestors.push({tag:n.tagName,cls:String(n.className).slice(0,80),testid:n.getAttribute?.("data-testid")||null,
      display:s.display,visibility:s.visibility,opacity:s.opacity,pointerEvents:s.pointerEvents,
      overflowY:s.overflowY,position:s.position,zIndex:s.zIndex,
      rect:{x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1)},
      scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight});
     n=n.parentElement;}
    const hit=document.elementFromPoint(cx,cy);
    const rail=document.querySelector(".alarm-rail"),rr=rail?.getBoundingClientRect();
    return {count:els.length,present:true,rect:{x:r.x,y:r.y,w:r.width,h:r.height},center:{cx,cy},
     inViewport:cx>=0&&cy>=0&&cx<innerWidth&&cy<innerHeight,
     button:{display:cs.display,visibility:cs.visibility,opacity:cs.opacity,pointerEvents:cs.pointerEvents,disabled:el.disabled},
     ancestors,
     elementFromPoint:hit?{tag:hit.tagName,cls:String(hit.className).slice(0,120),testid:hit.getAttribute("data-testid"),isSelfOrChild:hit===el||el.contains(hit)}:null,
     railClip:rr?{x:rr.x,y:rr.y,w:rr.width,h:rr.height,buttonInsideRailRect:r.y>=rr.y&&r.y+r.height<=rr.y+rr.height}:null};
   });
   const actionMeasurement=await measureAction();
   const shotT=Date.now();
   afterShot=await shot(page,"disc-after-uncovered-detail");
   const detailShotMs=Date.now()-shotT;
   // Activate the remedy with a REAL user click: it must route into the build
   // catalog (state-changing), not "open a panel and watch". CAM-05: camera-neutral.
   // The uncovered window is LIVE: the sim keeps producing/delivering iron, and
   // once depot+inbound cover the deficit again the #566 read model CORRECTLY
   // suppresses starve-iron and the detail unmounts (measured: the previous
   // session's 30s click timeout was "waiting for locator" — the node was gone,
   // not occluded). If that happens before the click lands, re-drain through the
   // REAL Exchange Sell-10 UI (player-reachable, no fixture) and click at once.
   // Never force, never dispatchEvent, never scroll-to-reach; assertions unchanged.
   const readProbe=()=>page.evaluate(()=>{try{return JSON.parse(document.body.dataset.alarmProbe);}catch{return null;}});
   const readStripIron=()=>page.evaluate(()=>{const el=document.querySelector('.resources-strip .resource[data-resource="iron"]');return el?{state:el.getAttribute("data-state"),flag:el.querySelector(".resource__flag")?.textContent??null}:null;});
   let clickErr=null,healedBeforeClick=null,attempts=0,actionMeasurement2=null;
   let panelProbe=null,selectedBlueprint=null,toast=null,actionShot=null;
   while(attempts<3){
    attempts++;
    try{await page.locator('[data-testid="alarm-action"]').click({timeout:5000});clickErr=null;break;}
    catch(e){
     clickErr=String(e).split("\n")[0];
     if(await page.locator('[data-testid="alarm-action"]').count()){
      // Node IS present but the real click failed: a genuine hit-test defect.
      // Re-measure and ship an honest FAIL with the blocker identity.
      actionMeasurement2=await measureAction();break;
     }
     const p=await readProbe(),si=await readStripIron();
     healedBeforeClick={attempt:attempts,probeIds:p?.ids??null,stripIron:si,detailPresent:false};
     if(p?.ids?.includes("starve-iron")){clickErr="clause3: detail unmounted while starve-iron still in probe (unexpected)";break;}
     // Re-drain via the REAL Exchange until uncovered CRITICAL returns.
     await page.locator('[data-tool="market"]').click();
     // choose() does not expand a collapsed sheet (persisted dock pref): the
     // player taps the real sheet-toggle to bring the Exchange body back.
     if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed").catch(()=>null)==="true"){
      await page.locator('[data-testid="sheet-toggle"]').click().catch(()=>{});
      await page.waitForFunction(()=>document.querySelector('[data-testid="panel-host"]')?.dataset.collapsed==="false",null,{timeout:5000}).catch(()=>{});
     }
     await page.locator(".trade-row").first().waitFor({state:"visible",timeout:5000});
     const s2=Date.now();let ok2=false;
     while(Date.now()-s2<60000){
      for(let k=0;k<6;k++){if(await ironSell.isEnabled().catch(()=>false)){await ironSell.click().catch(()=>{});clicks++;}await page.waitForTimeout(45);}
      const p2=await readProbe();
      if(p2?.ids?.includes("starve-iron")&&await page.locator('[data-testid="alarm-chip-starve-iron"]').count()){ok2=true;break;}
     }
     if(!ok2){clickErr="clause3: real Exchange re-drain did not re-raise starve-iron within 60s";break;}
     if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed").catch(()=>null)!=="true"){
      await page.locator('[data-testid="sheet-toggle"]').click().catch(()=>{});
      await page.waitForFunction(()=>document.querySelector('[data-testid="panel-host"]')?.dataset.collapsed==="true",null,{timeout:5000}).catch(()=>{});
     }
     // expandedAlarmId persists: the detail auto-re-expands when the alarm
     // re-fires. Click the chip ONLY when the detail is not already open.
     if(!(await page.locator('[data-testid="alarm-detail"]').count())){
      await page.locator('[data-testid="alarm-chip-starve-iron"]').click();
     }
     await page.locator('[data-testid="alarm-detail"]').waitFor({state:"visible",timeout:5000});
     chipSeverity=await page.locator('[data-testid="alarm-chip-starve-iron"]').getAttribute("data-severity");
     actionMeasurement2=await measureAction();
    }
   }
   if(clickErr){
    anyFail=true;report.errors.push("clause3: remedy click failed: "+clickErr+(healedBeforeClick?" healedBeforeClick="+JSON.stringify(healedBeforeClick):"")+(actionMeasurement2?" measure2="+JSON.stringify(actionMeasurement2):""));
   }else{
    await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.panelProbe).trigger==="tool:build";}catch{return false;}},null,{timeout:5000});
    panelProbe=await page.evaluate(()=>JSON.parse(document.body.dataset.panelProbe));
    await page.locator(".catalog-panel").waitFor({state:"visible",timeout:5000});
    selectedBlueprint=await page.locator(".blueprint--selected").getAttribute("aria-label").catch(()=>null);
    toast=await page.locator(".toast span").textContent().catch(()=>null);
    actionShot=await shot(page,"disc-after-action-build");
   }
   disc.after={chipSeverity,chipAria,problem,remedy,actionLabel,actionMeasurement,actionMeasurement2,healedBeforeClick,detailShotMs,clickAttempts:attempts,panelProbe,selectedBlueprint,toast,screenshot:afterShot,actionScreenshot:actionShot};
   if(chipSeverity!=="critical"){anyFail=true;report.errors.push("clause3: uncovered starve-iron chip severity is not critical: "+chipSeverity);}
   if(!/cannot cover it/i.test(problem||"")){anyFail=true;report.errors.push("clause3: problem text does not state uncovered deficit: "+problem);}
   if(!/Construct/i.test(actionLabel||"")){anyFail=true;report.errors.push("clause3: remedy action is not a state-changing construct action: "+actionLabel);}
   if(!clickErr&&panelProbe?.trigger!=="tool:build"){anyFail=true;report.errors.push("clause3: remedy did not route to build: "+JSON.stringify(panelProbe));}
  }
  report.discrimination=disc;
  await ctx.close();
 }
 if(errs.length){report.errors.push("console/page errors: "+JSON.stringify(errs));anyFail=true;}
 report.status=anyFail?"FAIL":"PASS_NUMERIC_ONLY";
 if(anyFail)process.exitCode=1;
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child){try{execSync("taskkill /PID "+child.pid+" /T /F",{stdio:"ignore"});}catch{try{child.kill("SIGKILL");}catch{}}}
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("#566 alarm-severity capture ("+VIEW+"):",report.status,OUT);
 console.log("timeline cryWolf/starveWarnings:",JSON.stringify(report.timeline.map(r=>({t:r.t,warnings:r.warningsCount,cryWolf:r.cryWolfWarnings,starveW:r.starveWarnings,stripIron:r.stripIron,ids:r.probe?.ids}))));
 console.log("discrimination reached:",report.discrimination?.reached,"clicks:",report.discrimination?.sellClicks,"afterSeverity:",report.discrimination?.after?.chipSeverity);
 if(report.errors.length)console.error(report.errors.join("\n"));
}
