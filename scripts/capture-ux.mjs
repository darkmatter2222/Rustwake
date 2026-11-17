// UX-04 (#362) inspector evidence capture. NEW script — the leased
// scripts/capture-v2.mjs is untouched; this reuses its bounded waitForFunction
// + synchronous camera-stamp pattern and its production-preview harness.
// Proves: selected/empty/unaffordable/blocked/processing/dismantle-confirm
// states, non-obscuring panel after orbit+resize, exact refund conservation,
// alertdialog focus semantics, persisted settings, intact #307 camera stamps.
// Numeric/runtime evidence only — the sponsor still reviews the screenshots.
import {chromium} from "playwright-core";
import {groundAtScreen,CAMERA_LIMITS} from "../src/camera.js";
import {createGame,checkSite,buildAt,connectedToRoad} from "../src/simulation.js";
import {BLUEPRINTS,CELL,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {projectGround,machineScreenRect,rectsIntersect,UX_SETTINGS_KEY} from "../src/inspector.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/362-ux-04");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4174,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const report={version:1,issue:362,task:"UX-04 building inspector",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:["One headless Chromium/SwiftShader run; phone view is emulated, not a physical device","Numeric occlusion/refund proofs do not certify visual beauty — sponsor review required at G1"]};
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
function richSave(){
 const g=createGame();
 const f1=legalSite(g,"furnace");
 const r1=buildAt(g,"furnace",f1.x,f1.z,0);if(!r1.ok)throw Error("seed furnace: "+r1.reason);
 r1.building.remaining=0;r1.building.inventory={iron:10,fuel:7,steel:6};
 const f2=legalSite(g,"furnace",0,[f1]);
 const r2=buildAt(g,"furnace",f2.x,f2.z,0);if(!r2.ok)throw Error("seed furnace2: "+r2.reason);
 r2.building.remaining=0;r2.building.inventory={iron:4,fuel:3};
 const s1=legalSite(g,"salvager",0,[f1,f2]);
 const r3=buildAt(g,"salvager",s1.x,s1.z,0);if(!r3.ok)throw Error("seed salvager: "+r3.reason);
 r3.building.remaining=3.2; // extra yard traffic; PROCESSING proof uses its own fresh save below
 return {save:g,furnace:r1.building,furnace2:r2.building,assembling:r3.building};
}
function poorSave(){const g=createGame();g.bank={credits:3,scrap:2,stone:0,iron:0,fuel:0,steel:0,parts:0,chips:0};return g;}
const RICH=richSave();
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
  const pose=page=>page.locator(".world-canvas").evaluate(c=>({yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)}));
  const canvasRect=page=>page.locator(".world-canvas").evaluate(c=>{const r=c.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
  // Bounded stamp observation (same contract as capture-v2.mjs): the canvas
  // dataset is written synchronously by world.applyCamera/stampCamera.
  const waitForStamp=async(page,pred,arg,label)=>{
   try{await page.waitForFunction(pred,arg,{timeout:8000,polling:50});}
   catch{throw Error(label+" — stamp never updated within 8000ms: pose="+JSON.stringify(await pose(page)));}
  };
  const cellPixel=async(page,cell)=>{
   const p=await pose(page),rect=await canvasRect(page);
   const ground={x:(cell.x-WORLD_SIZE/2+.5)*CELL,z:(cell.z-WORLD_SIZE/2+.5)*CELL};
   const px=projectGround(p,ground,{width:rect.width,height:rect.height});
   const back=groundAtScreen(p,px,{width:rect.width,height:rect.height});
   if(Math.hypot(back.x-ground.x,back.z-ground.z)>1e-6)throw Error("projectGround inverse diverged from camera math at "+JSON.stringify(cell));
   if(px.x<0||px.y<0||px.x>rect.width||px.y>rect.height)throw Error("Target cell projects outside canvas: "+JSON.stringify({cell,px}));
   return {x:rect.left+px.x,y:rect.top+px.y};
  };
  // On narrow phone viewports the target may start off-canvas: zoom out
  // through the visible control (bounded) until the inverse projection fits.
  const tapCell=async(page,cell)=>{
   let pt=null;
   for(let i=0;i<7&&!pt;i++){
    try{pt=await cellPixel(page,cell);}
    catch(e){
     if(!String(e.message).includes("outside canvas")||i===6)throw e;
     const before=await pose(page);
     await page.getByRole("button",{name:"Zoom out"}).click();
     await waitForStamp(page,p=>{const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraZoom)<p;},before.zoom,"Zoom out did not work while framing selection");
    }
   }
   await page.mouse.click(pt.x,pt.y);
  };
  const selectBuilding=async(page,b)=>{
   await page.locator('[data-tool="select"]').click();
   await tapCell(page,{x:b.x,z:b.z});
   await page.locator('[data-testid="inspector-status"]').waitFor({state:"visible",timeout:5000});
   await page.waitForTimeout(450); // let the placement rAF + one UI tick settle
  };
  // Non-obscuring proof: conservative machine screen rect (pure inspector.js
  // math, round-trip tested) vs the live panel bounding box, in canvas space.
  const occlusion=async(page,b)=>{
   const p=await pose(page),rect=await canvasRect(page);
   const m=machineScreenRect(p,b,{width:rect.width,height:rect.height});
   const box=await page.locator(".panel-host").boundingBox();
   if(!box)throw Error("panel-host has no bounding box");
   const panel={x:box.x-rect.left,y:box.y-rect.top,width:box.width,height:box.height};
   return {machine:m,panel,obscured:rectsIntersect(m,panel)};
  };
  const assertClear=async(page,b,label,allowFallback=false)=>{
   await page.waitForTimeout(650);
   let o=await occlusion(page,b);
   if(o.obscured){await page.waitForTimeout(650);o=await occlusion(page,b);}
   if(o.obscured&&allowFallback){
    const fb=page.locator('[data-testid="focus-machine"]');
    if(await fb.count()){await fb.click();await page.waitForTimeout(650);o=await occlusion(page,b);}
   }
   if(o.obscured)throw Error(label+": inspector obscures the selected machine "+JSON.stringify(o));
   return o;
  };
  const credits=async(page)=>Number((await page.locator('.resources-strip button[title="Credits"] strong').innerText()).replace(/[^0-9.-]/g,""));

  // ================= main seeded context: selected / confirm / empty / keep / processing / blocked =================
  {
   const {ctx,page}=await newPage(JSON.stringify(RICH.save));
   const stamps=await page.locator(".world-canvas").evaluate(c=>({...c.dataset}));
   if(stamps.world3d!=="ready"||!Number.isFinite(Number(stamps.cameraYaw)))throw Error("Camera stamps missing at load: "+JSON.stringify(stamps));
   view.proof.loadStamps={world3d:stamps.world3d,yaw:Number(stamps.cameraYaw),elevation:Number(stamps.cameraElevation),zoom:Number(stamps.cameraZoom)};

   // 1) SELECTED — furnace with cargo: status, recipe, stock, bay, upgrade preview.
   await selectBuilding(page,RICH.furnace);
   const status=await page.locator('[data-testid="inspector-status"]').innerText();
   const recipeOut=await page.locator('[data-testid="recipe-output"]').innerText();
   const upgradeTxt=await page.locator('[data-testid="upgrade-effect"]').innerText();
   if(!/OPERATING|STARVED|ONLINE|POWERLESS|NO FRONTAGE/.test(status))throw Error("Unexpected furnace status: "+status);
   if(!upgradeTxt.includes("LEVEL"))throw Error("Upgrade effect preview missing levels: "+upgradeTxt);
   const lockedBtn=page.locator('[data-testid="upgrade-locked"]');
   if(!(await lockedBtn.isDisabled()))throw Error("Upgrade control must be honestly disabled (no sim transaction)");
   view.proof.selected={status,recipeOutput:recipeOut,upgradePreview:upgradeTxt.replace(/\s+/g," "),upgradeDisabled:true};
   await shot(page,"selected");

   // Motion proof: the simulation keeps animating under reduced-motion CSS
   // (trucks/assembly are rAF-driven, not CSS transitions). Two frames differ.
   const f1=await page.screenshot({animations:"disabled"});
   await page.waitForTimeout(1500);
   const f2=await page.screenshot({animations:"disabled"});
   view.proof.motion={framesDiffer:!f1.equals(f2),note:"rAF simulation advances even with prefers-reduced-motion CSS"};
   if(f1.equals(f2))throw Error("Simulation appears frozen between frames 1.5s apart");

   // 2) NON-OBSCURING after orbit (Q/E) and viewport resize.
   const orbit=[];
   for(const key of ["q","q","e","e","e","e"]){
    const before=await pose(page);
    await page.keyboard.press(key);
    await waitForStamp(page,(p)=>{const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraYaw)!==p;},before.yaw,"Orbit "+key+" never stamped yaw");
    const o=await assertClear(page,RICH.furnace,"after orbit "+key,!v.isMobile?false:true);
    orbit.push({key,yaw:(await pose(page)).yaw,obscured:o.obscured});
   }
   view.proof.orbitOcclusion=orbit;
   if(!v.isMobile){
    const resizeProof=[];
    for(const vp of [{width:1180,height:820},{width:1440,height:900}]){
     await page.setViewportSize(vp);await page.waitForTimeout(700);
     const o=await assertClear(page,RICH.furnace,"after resize "+vp.width+"x"+vp.height,false);
     resizeProof.push({viewport:vp,obscured:o.obscured});
    }
    view.proof.resizeOcclusion=resizeProof;
   }else{
    // Phone: sheet is bounded; auto-frame keeps the machine above it.
    const o=await assertClear(page,RICH.furnace,"phone sheet placement",true);
    view.proof.phoneSheet={obscured:o.obscured,machine:o.machine,panel:o.panel};
   }

   // 3) DISMANTLE CONFIRM — alertdialog, exact refund preview, focus semantics.
   const bankBefore=await credits(page);
   const previewTxt=await page.locator('[data-testid="dismantle-preview"]').innerText();
   await page.locator('[data-testid="dismantle-open"]').click();
   const dialog=page.locator('[data-testid="dismantle-confirm-dialog"]');
   await dialog.waitFor({state:"visible",timeout:5000});
   if(await dialog.getAttribute("role")!=="alertdialog")throw Error("Dismantle confirm must be role=alertdialog");
   const focused=await page.evaluate(()=>document.activeElement?.getAttribute("data-testid"));
   if(focused!=="dismantle-confirm")throw Error("Focus must land on Confirm dismantling, got: "+focused);
   const refundRows=await page.locator('[data-testid="dismantle-refund"] > div').allInnerTexts();
   if(!refundRows.length)throw Error("Refund list empty for a furnace with cargo");
   if(!refundRows.some(r=>/40% recovery/i.test(r))||!refundRows.some(r=>/cargo return/i.test(r)))
    throw Error("Refund list must distinguish 40% recovery vs cargo return: "+JSON.stringify(refundRows));
   const targets=await page.evaluate(()=>["dismantle-confirm","dismantle-keep"].map(t=>{
    const el=document.querySelector(`[data-testid="${t}"]`);const r=el.getBoundingClientRect();
    return {testid:t,width:Math.round(r.width),height:Math.round(r.height)};
   }));
   if(targets.some(t=>t.height<44||t.width<44))throw Error("Confirm/Keep touch targets below 44px: "+JSON.stringify(targets));
   view.proof.dismantleConfirm={role:"alertdialog",initialFocus:focused,refundRows,previewTxt,touchTargets:targets,bankBefore};
   await shot(page,"dismantle-confirm");

   // Keep machine: dialog closes, focus returns to the opener, nothing spent.
   await page.locator('[data-testid="dismantle-keep"]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-testid="dismantle-confirm-dialog"]'),null,{timeout:5000,polling:50});
   await page.waitForFunction(()=>document.activeElement?.getAttribute("data-testid")==="dismantle-open",null,{timeout:5000,polling:50})
    .catch(async()=>{throw Error("Keep must return focus to the opener, got: "+await page.evaluate(()=>document.activeElement?.getAttribute("data-testid")));});
   const keepFocus=await page.evaluate(()=>document.activeElement?.getAttribute("data-testid"));
   if(await credits(page)!==bankBefore)throw Error("Keep machine moved the bank");
   view.proof.keep={focusReturnedTo:keepFocus,bankUnchanged:true};

   // Escape also closes the confirm before clearing selection.
   await page.locator('[data-testid="dismantle-open"]').click();
   await dialog.waitFor({state:"visible",timeout:5000});
   await page.keyboard.press("Escape");
   await page.waitForFunction(()=>!document.querySelector('[data-testid="dismantle-confirm-dialog"]'),null,{timeout:5000,polling:50});
   if(!(await page.locator('[data-testid="inspector-status"]').isVisible()))throw Error("Escape closed the selection instead of only the confirm");
   view.proof.escapeClosesConfirmOnly=true;

   // 4) CONFIRM DISMANTLE — authoritative refund lands in the bank exactly.
   await page.locator('[data-testid="dismantle-open"]').click();
   await dialog.waitFor({state:"visible",timeout:5000});
   await page.locator('[data-testid="dismantle-confirm"]').click();
   await page.waitForFunction(()=>document.querySelector(".toast span")?.textContent?.startsWith("Machine dismantled"),null,{timeout:5000,polling:50});
   const expectedCredits=bankBefore+Math.floor(BLUEPRINTS.furnace.cost.credits*0.4);
   try{await page.waitForFunction(e=>{
    const el=document.querySelector('.resources-strip button[title="Credits"] strong');
    return !!el&&Number(el.innerText.replace(/[^0-9.-]/g,""))===e;
   },expectedCredits,{timeout:5000,polling:50});}
   catch{throw Error(`Dismantle refund wrong: expected ${expectedCredits} CR (bank ${bankBefore} + floor(40% of ${BLUEPRINTS.furnace.cost.credits})), got ${await credits(page)}`);}
   const afterFocus=await page.evaluate(()=>document.activeElement?.getAttribute("data-tool"));
   if(afterFocus!=="select")throw Error("After dismantle, focus must return to the Inspect tool, got: "+afterFocus);
   view.proof.dismantleTransaction={bankBefore,bankAfter:expectedCredits,creditRefund:Math.floor(BLUEPRINTS.furnace.cost.credits*0.4),focusReturnedTo:"select-tool"};

   // 5) EMPTY state — inspector stays open with honest empty guidance.
   await page.locator('[data-testid="inspector-empty"]').waitFor({state:"visible",timeout:5000});
   await shot(page,"empty");
   view.proof.empty={testid:"inspector-empty",shownAfterDismantle:true};

   // 6) PROCESSING — dedicated fresh save so assembly is genuinely mid-flight
   // (the live sim completes a 3s assembly long before the main flow gets here),
   // then cancel returns the FULL blueprint cost via the real transaction.
   {
    const proc=createGame();
    const site=legalSite(proc,"salvager");
    const built=buildAt(proc,"salvager",site.x,site.z,0);
    if(!built.ok)throw Error("processing seed: "+built.reason);
    built.building.remaining=4.5;
    const {ctx:pctx,page:ppage}=await newPage(JSON.stringify(proc));
    await selectBuilding(ppage,built.building);
    const asmStatus=await ppage.locator('[data-testid="inspector-status"]').innerText();
    if(!/ASSEMBLING/i.test(asmStatus))throw Error("Expected ASSEMBLING status, got: "+asmStatus);
    await ppage.locator('[data-testid="cancel-construction"]').waitFor({state:"visible",timeout:5000});
    await shot(ppage,"processing");
    const bankBeforeCancel=await credits(ppage);
    await ppage.locator('[data-testid="cancel-construction"]').click();
    await ppage.waitForFunction(()=>document.querySelector(".toast span")?.textContent?.startsWith("Construction canceled"),null,{timeout:5000,polling:50});
    const expectedCancel=bankBeforeCancel+(BLUEPRINTS.salvager.cost.credits||0);
    try{await ppage.waitForFunction(e=>{
      const el=document.querySelector('.resources-strip button[title="Credits"] strong');
      return !!el&&Number(el.innerText.replace(/[^0-9.-]/g,""))===e;
     },expectedCancel,{timeout:5000,polling:50});}
    catch{throw Error(`Cancel refund wrong: expected ${expectedCancel} CR (full salvager cost back), got ${await credits(ppage)}`);}
    view.proof.processing={status:asmStatus,cancelVisible:true,
     cancelTransaction:{bankBefore:bankBeforeCancel,bankAfter:expectedCancel,creditsReturned:BLUEPRINTS.salvager.cost.credits||0}};
    await pctx.close();
   }

   // 7) BLOCKED — starter structure is protected with the exact sim reason.
   const starter=RICH.save.buildings.find(b=>b.id===1);
   await selectBuilding(page,starter);
   await page.locator('[data-testid="dismantle-blocked"]').waitFor({state:"visible",timeout:5000});
   const blockedReason=await page.locator('[data-testid="dismantle-blocked-reason"]').innerText();
   if(blockedReason!=="Starter buildings are protected; construct your own district.")
     throw Error("Blocked reason must mirror the simulation exactly, got: "+blockedReason);
   if(!(await page.locator('[data-testid="dismantle-blocked"]').isDisabled()))throw Error("Blocked dismantle control must be disabled");
   await shot(page,"blocked");
   view.proof.blocked={reason:blockedReason,disabled:true};

   // 8) SETTINGS persist across reload (same context, same storage).
   await page.locator('[data-testid="setting-autoframe"]').click(); // toggle off
   await page.waitForFunction(k=>{try{return JSON.parse(localStorage.getItem(k))?.autoFrame===false;}catch{return false;}},UX_SETTINGS_KEY,{timeout:5000,polling:50});
   await page.reload({waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await selectBuilding(page,RICH.furnace2);
   const persisted=await page.locator('[data-testid="setting-autoframe"]').isChecked();
   if(persisted!==false)throw Error("autoFrame setting did not persist across reload");
   await page.locator('[data-testid="setting-autoframe"]').click(); // restore default for later shots
   view.proof.settingsPersistence={key:UX_SETTINGS_KEY,autoFrameAfterReload:false,restored:true};

   // 9) #307 camera invariants intact: visible Zoom in works + stamp sync.
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

  // ================= low-bank context: unaffordable / locked catalog =================
  {
   const {ctx,page}=await newPage(JSON.stringify(poorSave()));
   await page.locator('[data-tool="build"]').click();
   await page.locator(".blueprint-list").waitFor({state:"visible",timeout:5000});
   const short=await page.locator(".blueprint__cost--short").count();
   const lockedCount=await page.locator(".blueprint--locked").count();
   if(short<1)throw Error("Low-bank save must show unaffordable blueprints");
   if(lockedCount<1)throw Error("Tier-0 save must show locked blueprints");
   const bank=await credits(page);
   await shot(page,"unaffordable");
   view.proof.unaffordable={bankCredits:bank,unaffordableCount:short,lockedCount,note:"costs flagged --short; locked cards disabled with LOCKED badge"};
   // No spend possible: tap an unaffordable blueprint then the ground — bank unchanged.
   const firstShort=page.locator(".blueprint:not(.blueprint--locked)").first();
   await firstShort.click();
   await tapCell(page,{x:6,z:7});
   await page.waitForTimeout(600);
   if(await credits(page)!==bank)throw Error("Unaffordable build moved the bank");
   view.proof.unaffordableNoSpend=true;
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
 console.log("UX-04 inspector capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}