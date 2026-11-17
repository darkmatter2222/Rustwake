// UX-06 (#364) + #548 evidence capture. NEW script — no leased capture script
// is touched. Production-preview harness (vite preview on a private port),
// bounded waitForFunction observation of the synchronous camera stamps, and
// document.elementFromPoint hit-tests (defect class #4: overlay steals contact).
//
// Proves on the SEEDED 6-alarm fixture (no generator + roads=[]):
//  - phone 390x844: canvas centre contact is CANVAS in rail-only / detail-open
//    / after-close states, with a REAL mouse-drag pan delta in each;
//  - the expanded detail is a bottom sheet fully inside the viewport with its
//    top strictly below the canvas centre, and >=44px remedy actions reachable;
//  - strip controls (warnings toggle, collapse/expand) stay actionable;
//  - #548: elementFromPoint over the toast BODY is CANVAS, over the dismiss
//    button is BUTTON; a CDP two-finger sweep with one contact inside the toast
//    region pans the camera, spends nothing and leaks no tap;
//  - rendered alarm clearing (assembling turbine completes -> YARD NOMINAL);
//  - empty/nominal state, Escape focus return, reduced-motion animation off.
// Numeric/runtime evidence only — PASS_NUMERIC_ONLY. The phone view is
// EMULATED (headless Chromium/SwiftShader), not a physical handset; the sponsor
// still reviews the screenshots at G1 (#276).
import {chromium} from "playwright-core";
import {createGame} from "../src/simulation.js";
import {SAVE_KEY} from "../src/content.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/364-ux-06");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4564,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return "local";}})();
if(!/^[0-9a-f]{40}$/.test(SHA))throw Error("capture must run at a real commit head; source_sha 'local' is unacceptable");
const BASE=(()=>{try{return execSync("git merge-base HEAD origin/main",{encoding:"utf8"}).trim();}catch{return "unknown";}})();
const report={version:1,issue:364,bundled_issue:548,pr:550,branch:"rw/v2-ux-06-actionable-alarms",
 build:"production-preview",source_sha:SHA,rebase_base:BASE,started:new Date().toISOString(),
 verdict:"FAIL",phone_emulated:true,preview_only:true,views:[],errors:[],
 before_reference:{reviewer_comment:6947563902,verdict_head:"a1eaa906a475f6454d9bd96ca49cb03d2f59aba3",
  phone_hitCenter:"BUTTON.alarm-chip-road-2 (rail stole the centre)",phone_panRailOnly:[0,0],
  phone_panWithRailHidden:-7.504,phone_detailBottom:886,viewport_height:844},
 limitations:[
  "One headless Chromium/SwiftShader run; phone 390x844 is EMULATED (isMobile+hasTouch+dpr2), not a physical device (#268/#275 owed)",
  "PASS_NUMERIC_ONLY: numeric hit-test/pan/conservation proofs do not certify visual fidelity — sponsor visual review at G1 (#276) is still owed",
  "Local production preview only — no hosted-deployment receipt (#333) is claimed by this capture",
  "Toast persistence is unchanged (#548 option A: pointer-transparent body); no auto-dismiss timer was added",
  "alarmProbe is test-gated (window.__RW_PROBES__) and registered as probe debt; production builds never write it"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// ---- deterministic seeded saves (real sim states, never fabricated flags) ----
function sixAlarmSave(){const g=createGame();g.buildings=g.buildings.filter(b=>b.type!=="generator");g.roads=[];return g;}
function nominalSave(){return createGame();}
function clearingSave(){
 const g=createGame();
 const gen=g.buildings.find(b=>b.type==="generator");
 if(!gen)throw Error("seed has no generator to clone");
 g.buildings=g.buildings.filter(b=>b.type!=="generator");
 g.buildings.push({...gen,remaining:0.6}); // assembling turbine: brownout PROCESSING, then real clear
 return g;
}
// Double stringify: the inner one embeds the save as a QUOTED JSON string
// literal (JSON.parse of a bare object literal would throw and silently seed
// nothing — the fresh-yard fallback then masquerades as the fixture).
const seedScript=(json)=>`(()=>{try{window.__RW_PROBES__=true;const g=JSON.parse(${JSON.stringify(JSON.stringify(json))});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){window.__SEED_ERR__=String(e);}})()`;

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!open)throw Error("Production preview did not become available on "+PORT);
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 for(const v of [
  {name:"desktop",viewport:{width:1440,height:900},dpr:1,isMobile:false,touch:false,centre:{x:720,y:450}},
  {name:"phone",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true,centre:{x:195,y:422}},
 ]){
  const view={name:v.name,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,screenshots:[],proof:{}};
  report.views.push(view);
  const errs=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  const newPage=async(saveJson)=>{
   const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
   await ctx.addInitScript(seedScript(saveJson));
   const page=await ctx.newPage();
   page.on("pageerror",e=>errs.push(String(e)));
   page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
   await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.alarmProbe||"null")?.kind==="ready";}catch{return false;}},null,{timeout:15000,polling:100});
   const seedErr=await page.evaluate(()=>window.__SEED_ERR__||null);
   if(seedErr)throw Error("init-script seed failed (fresh-yard fallback would fake the fixture): "+seedErr);
   return {ctx,page};
  };
  const pose=page=>page.locator(".world-canvas").evaluate(c=>({yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)}));
  const hit=(page,x,y)=>page.evaluate(([x,y])=>{
   const el=document.elementFromPoint(x,y);
   if(!el)return {tag:null,cls:null,testid:null,isCanvas:false};
   return {tag:el.tagName,cls:String(el.className).slice(0,80),testid:el.getAttribute("data-testid"),isCanvas:el.classList.contains("world-canvas")};
  },[x,y]);
  const box=(page,sel)=>page.locator(sel).boundingBox();
  // Real mouse-drag pan at the canvas centre; bounded stamp observation.
  const dragPan=async(page,label)=>{
   const before=await pose(page);
   const {x,y}=v.centre;
   await page.mouse.move(x,y);await page.mouse.down();
   for(let i=1;i<=6;i++)await page.mouse.move(x+20*i,y,{steps:2});
   await page.mouse.up();
   try{await page.waitForFunction(b=>Number(document.querySelector(".world-canvas").dataset.cameraX)!==b,before.x,{timeout:8000,polling:50});}
   catch{throw Error(label+": centre drag produced NO cameraX change (overlay still steals the contact?) pose="+JSON.stringify(await pose(page)));}
   const after=await pose(page);
   return {before_x:before.x,after_x:after.x,delta_x:+(after.x-before.x).toFixed(6),yaw_unchanged:after.yaw===before.yaw};
  };
  const centreProof=async(page,label)=>{
   const h=await hit(page,v.centre.x,v.centre.y);
   if(!h.isCanvas)throw Error(label+": elementFromPoint centre is NOT canvas: "+JSON.stringify(h));
   const pan=await dragPan(page,label);
   return {hit:h,pan};
  };
  const alarmIds=page=>page.evaluate(()=>{try{return JSON.parse(document.body.dataset.alarmProbe).ids;}catch{return null;}});

  // ================= six-alarm fixture =================
  {
   const {ctx,page}=await newPage(sixAlarmSave());
   const ids=await alarmIds(page);
   if(ids[0]!=="power-brownout"||ids.length!==6)throw Error("expected seeded 6-alarm fixture, got "+JSON.stringify(ids));
   view.proof.seeded_ids=ids;
   const railBox=await box(page,'[data-testid="alarm-rail"]');
   view.proof.railBox=railBox;
   if(v.name==="phone"){
    if(railBox.y+railBox.height>=v.centre.y)throw Error("phone strip still covers the canvas centre: "+JSON.stringify(railBox));
    if(railBox.height>60)throw Error("phone rail is not a single 44px strip row: "+JSON.stringify(railBox));
   }
   view.proof.railOnly=await centreProof(page,"rail-only");
   await shot(page,"rail-only");

   // --- expand road-2 detail ---
   await page.locator('[data-testid="alarm-chip-road-2"]').click();
   await page.locator('[data-testid="alarm-detail"]').waitFor({state:"visible",timeout:5000});
   const detailBox=await box(page,'[data-testid="alarm-detail"]');
   view.proof.detailBox=detailBox;
   if(v.name==="phone"){
    // Phone: the detail is a FIXED bottom sheet — it must sit fully inside the
    // viewport with its top strictly below the canvas centre (the blocker).
    if(detailBox.y+detailBox.height>v.viewport.height+0.5)throw Error("phone detail bottom outside viewport: "+JSON.stringify(detailBox));
    if(detailBox.y<=v.centre.y)throw Error("phone detail sheet covers the canvas centre: "+JSON.stringify(detailBox));
   }else{
    // Desktop: the detail scrolls inside the rail; the RAIL must fit the
    // viewport and the sticky remedy action must be reachable (checked below).
    if(railBox.y+railBox.height>v.viewport.height)throw Error("desktop rail overflows viewport: "+JSON.stringify(railBox));
   }
   const anim=await page.evaluate(()=>getComputedStyle(document.querySelector('[data-testid="alarm-detail"]')).animationName);
   view.proof.reducedMotion_animation=anim;
   if(anim!=="none")throw Error("reduced-motion context must disable the detail animation, got "+anim);
   view.proof.detailOpen=await centreProof(page,"detail-open");
   const action=page.locator('[data-testid="alarm-action"]');
   await action.scrollIntoViewIfNeeded();
   const actionBox=await action.boundingBox();
   view.proof.actionBox=actionBox;
   if(actionBox.height<44)throw Error("remedy action below 44px touch target: "+JSON.stringify(actionBox));
   if(actionBox.y<0||actionBox.y+actionBox.height>v.viewport.height)throw Error("remedy action unreachable in viewport: "+JSON.stringify(actionBox));
   await shot(page,"detail-open");

   // --- Escape closes detail, focus returns to its chip (desktop keyboard proof) ---
   await page.keyboard.press("Escape");
   await page.waitForFunction(()=>!document.querySelector('[data-testid="alarm-detail"]'),null,{timeout:5000});
   // Focus return is scheduled on the next rAF by App.jsx — observe it bounded.
   await page.waitForFunction(()=>document.activeElement?.getAttribute("data-testid")==="alarm-chip-road-2",null,{timeout:5000,polling:50});
   view.proof.escape_focus_return=await page.evaluate(()=>document.activeElement?.getAttribute("data-testid"));

   // --- reopen and APPLY the remedy ---
   await page.locator('[data-testid="alarm-chip-road-2"]').click();
   await page.locator('[data-testid="alarm-detail"]').waitFor({state:"visible",timeout:5000});
   await page.locator('[data-testid="alarm-action"]').click();
   await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.panelProbe).trigger==="tool:road";}catch{return false;}},null,{timeout:5000});
   await page.waitForFunction(()=>!document.querySelector('[data-testid="alarm-detail"]'),null,{timeout:5000});
   await page.locator(".toast").waitFor({state:"visible",timeout:5000});
   view.proof.remedy_applied={panelProbe:await page.evaluate(()=>JSON.parse(document.body.dataset.panelProbe)),toast:await page.locator(".toast span").textContent()};
   await shot(page,"remedy-applied");
   view.proof.afterClose=await centreProof(page,"after-close");
   await shot(page,"after-close");

   // --- #548 toast gesture safety (build-mode toast from the power remedy) ---
   await page.locator('[data-testid="alarm-chip-power-brownout"]').click();
   await page.locator('[data-testid="alarm-detail"]').waitFor({state:"visible",timeout:5000});
   await page.locator('[data-testid="alarm-action"]').click();
   await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.panelProbe).trigger==="tool:build";}catch{return false;}},null,{timeout:5000});
   await page.locator(".toast").waitFor({state:"visible",timeout:5000});
   const toastBox=await box(page,".toast"),btnBox=await box(page,".toast button");
   const bodyPoint={x:toastBox.x+30,y:toastBox.y+toastBox.height/2};
   const hitBody=await hit(page,bodyPoint.x,bodyPoint.y);
   const hitBtn=await hit(page,btnBox.x+btnBox.width/2,btnBox.y+btnBox.height/2);
   view.proof.toast={toastBox,btnBox,bodyPoint,hitBody,hitBtn,btnHeight:btnBox.height};
   if(!hitBody.isCanvas)throw Error("#548 NOT fixed: elementFromPoint over toast body is "+JSON.stringify(hitBody));
   if(hitBtn.tag!=="BUTTON")throw Error("dismiss button not hit-testable: "+JSON.stringify(hitBtn));
   if(btnBox.height<44)throw Error("dismiss button below 44px: "+JSON.stringify(btnBox));
   const bankBefore=await page.evaluate(()=>JSON.parse(document.body.dataset.fleetProbe).bank);
   const poseBefore=await pose(page);
   if(v.touch){
    // CDP two-finger sweep: contact 1 INSIDE the toast body, contact 2 on open
    // canvas; parallel translation => pure pan, both fingers gestured (no tap).
    const cdp=await ctx.newCDPSession(page);
    const p1={x:bodyPoint.x,y:bodyPoint.y,id:1},p2={x:Math.max(30,v.centre.x-90),y:v.centre.y+60,id:2};
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[p1,p2]});
    for(let i=1;i<=6;i++){
     await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...p1,x:p1.x+15*i,y:p1.y+8*i},{...p2,x:p2.x+15*i,y:p2.y+8*i}]});
    }
    await page.waitForFunction(b=>Number(document.querySelector(".world-canvas").dataset.cameraX)!==b,poseBefore.x,{timeout:8000,polling:50});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await cdp.detach();
   }else{
    // Desktop: mouse two-pointer straddle is not synthesizable; drag from the
    // toast body point instead (same pointer-transparent contract).
    await page.mouse.move(bodyPoint.x,bodyPoint.y);await page.mouse.down();
    for(let i=1;i<=6;i++)await page.mouse.move(bodyPoint.x+15*i,bodyPoint.y+8*i,{steps:2});
    await page.mouse.up();
    await page.waitForFunction(b=>Number(document.querySelector(".world-canvas").dataset.cameraX)!==b,poseBefore.x,{timeout:8000,polling:50});
   }
   const poseAfter=await pose(page);
   const bankAfter=await page.evaluate(()=>JSON.parse(document.body.dataset.fleetProbe).bank);
   const siteOk=await page.evaluate(()=>document.body.dataset.lastSiteOk??null);
   const toastStill=await page.locator(".toast").count();
   view.proof.toast.straddle={poseBefore_x:poseBefore.x,poseAfter_x:poseAfter.x,delta_x:+(poseAfter.x-poseBefore.x).toFixed(6),
    yaw_unchanged:poseAfter.yaw===poseBefore.yaw,bankBefore,bankAfter,bank_unchanged:JSON.stringify(bankBefore)===JSON.stringify(bankAfter),
    lastSiteOk:siteOk,toast_still_visible:toastStill===1};
   if(JSON.stringify(bankBefore)!==JSON.stringify(bankAfter))throw Error("#548 straddle gesture SPENT resources");
   if(siteOk!==null)throw Error("#548 straddle gesture leaked a tap: lastSiteOk="+siteOk);
   if(toastStill!==1)throw Error("toast vanished during the straddle gesture");
   await shot(page,"toast-straddle");
   await page.locator('.toast button[aria-label="Dismiss notice"]').click();
   await page.waitForFunction(()=>!document.querySelector(".toast"),null,{timeout:5000});
   view.proof.toast.dismiss_button_works=true;

   // --- strip controls stay actionable (phone) / rail controls (desktop) ---
   if(v.name==="phone"){
    const warnLabel=await box(page,'[data-testid="alarm-setting-warnings"]');
    const collapseBox=await box(page,'[data-testid="alarm-collapse"]');
    view.proof.controls={warningsBox:warnLabel,collapseBox};
    if(collapseBox.height<44)throw Error("collapse control below 44px: "+JSON.stringify(collapseBox));
    await page.locator('[data-testid="alarm-collapse"]').click();
    await page.locator('[data-testid="alarm-summary"]').waitFor({state:"visible",timeout:5000});
    view.proof.collapsedCentre=await centreProof(page,"collapsed");
    await page.locator('[data-testid="alarm-summary"]').click();
    await page.locator('[data-testid="alarm-chip-road-2"]').waitFor({state:"visible",timeout:5000});
    await page.locator('[data-testid="alarm-setting-warnings"]').click(); // toggle warnings off
    await page.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem("rustwake:v2:alarm-settings")).showWarnings===false;}catch{return false;}},null,{timeout:5000});
    await page.locator('[data-testid="alarm-setting-warnings"]').click(); // and back on
    view.proof.warnings_toggle_persisted=true;
   }
   await ctx.close();
  }

  // ================= empty / nominal state =================
  {
   const {ctx,page}=await newPage(nominalSave());
   await page.locator('[data-testid="alarms-empty"]').waitFor({state:"visible",timeout:5000});
   view.proof.empty={text:await page.locator('[data-testid="alarms-empty"]').textContent(),ids:await alarmIds(page)};
   view.proof.emptyCentre=await centreProof(page,"empty");
   await shot(page,"empty-nominal");
   await ctx.close();
  }

  // ================= rendered alarm clearing (phone only needs the proof once) =================
  if(v.name==="phone"){
   const {ctx,page}=await newPage(clearingSave());
   await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.alarmProbe).ids.includes("power-brownout");}catch{return false;}},null,{timeout:10000,polling:100});
   const processing=await page.locator('[data-testid="alarm-chip-power-brownout"]').getAttribute("data-state");
   view.proof.clearing={processing_state:processing};
   if(processing!=="processing")throw Error("assembling turbine should render PROCESSING, got "+processing);
   await shot(page,"alarm-processing");
   await page.waitForFunction(()=>{try{return !JSON.parse(document.body.dataset.alarmProbe).ids.includes("power-brownout");}catch{return false;}},null,{timeout:20000,polling:100});
   await page.locator('[data-testid="alarms-empty"]').waitFor({state:"visible",timeout:5000});
   view.proof.clearing.cleared_to=await page.locator('[data-testid="alarms-empty"]').textContent();
   view.proof.clearing.ids_after=await alarmIds(page);
   await shot(page,"alarm-cleared");
   await ctx.close();
  }
  if(errs.length)throw Error(v.name+" page errors: "+errs.join(" | ").slice(0,800));
 }
 report.verdict="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e?.stack||e));}
finally{
 try{await browser?.close();}catch{}
 try{child?.kill();}catch{}
 report.finished=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,1));
 console.log(JSON.stringify({verdict:report.verdict,errors:report.errors,source_sha:SHA},null,1));
 process.exitCode=report.errors.length?1:0;
}
