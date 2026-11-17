// UX-07 (#365) phone-safe bottom dock + collapsible contextual sheet evidence.
// NEW script — the leased scripts/capture-v2.mjs / capture-live.mjs are untouched;
// this reuses the capture-ux.mjs / capture-strip.mjs production-preview harness
// (bounded waitForFunction + synchronous camera stamps, seeded authoritative saves).
// Proves at 1440x900 desktop, 390x844 portrait, 844x390 landscape, 200%-text
// (195x422 CSS viewport = 390x844 at 200% page zoom) and an emulated safe-area
// portrait view: sheet/dock never overlap, no document scroll, >=44px essential
// taps, a usable world band under open panels, collapse/expand keeps camera +
// selection + mounted panel, persisted preference, toast lifted above the sheet,
// exactly ONE WebGL context, intact #307 camera stamp sync.
// Numeric/runtime evidence only — the sponsor still reviews the screenshots.
import {chromium} from "playwright-core";
import {groundAtScreen,CAMERA_LIMITS} from "../src/camera.js";
import {createGame} from "../src/simulation.js";
import {CELL,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {projectGround,machineScreenRect,rectsIntersect} from "../src/inspector.js";
import {DOCK_SETTINGS_KEY} from "../src/dock.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/365-ux-07");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4178,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const report={version:1,issue:365,task:"UX-07 phone-safe bottom dock + collapsible contextual sheet",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:["One headless Chromium/SwiftShader run; phone/landscape views are emulated, not physical devices",
  "200%-text is emulated as the halved CSS layout viewport (195x422 at dpr4), which is what 200% page zoom produces on a 390x844 dpr2 phone",
  "Safe-area insets are emulated by overriding the --sat/--sab CSS vars (47px/34px, iPhone-class) that every chrome band consumes; headless Chromium reports env()=0",
  "Numeric layout proofs do not certify visual beauty — sponsor review required at G1 (#276)",
  "Local preview only — the live hosted receipt is produced at release by the release engineer"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// Deterministic seeded save: the starter yard already has a furnace (id<=6).
const RICH=(()=>{const g=createGame();const f=g.buildings.find(b=>b.type==="furnace");f.inventory={iron:10,fuel:7,steel:6};return {save:g,furnace:f};})();
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;
// Instrument BEFORE any page script: count unique WebGL contexts (capture-live pattern).
const instrument=()=>{
 window.__rwSmoke={webglContexts:0};
 const seen=new WeakSet(),orig=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(type,...rest){
  const c=orig.call(this,type,...rest);
  if(c&&/webgl/i.test(String(type))&&!seen.has(c)){seen.add(c);window.__rwSmoke.webglContexts++;}
  return c;
 };
};

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
  {name:"text200",viewport:{width:195,height:422},dpr:4,isMobile:true,touch:true},
  {name:"phone-safearea",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true,safeArea:{sat:47,sab:34}},
  {name:"small-landscape",viewport:{width:667,height:375},dpr:2,isMobile:true,touch:true},
 ]){
  const view={name:v.name,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,safeAreaEmulation:v.safeArea||null,screenshots:[],proof:{}};
  const errs=[],failed=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  const newPage=async(saveJson)=>{
   const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
   await ctx.addInitScript(instrument);
   if(saveJson!=null)await ctx.addInitScript(seedScript(saveJson));
   const page=await ctx.newPage();
   page.on("pageerror",e=>errs.push(String(e)));
   page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
   page.on("requestfailed",r=>{try{if(new URL(r.url()).origin===`http://127.0.0.1:${PORT}`)failed.push(r.url());}catch{}});
   await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   if(v.safeArea){
    // Every UX-07 chrome band consumes these vars; overriding them exercises the
    // exact reservation math env() would feed on a notched device.
    await page.addStyleTag({content:`:root{--sat:${v.safeArea.sat}px;--sar:0px;--sab:${v.safeArea.sab}px;--sal:0px}`});
    const sab=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--sab").trim());
    if(sab!==v.safeArea.sab+"px")throw Error("Safe-area var override did not apply: "+sab);
   }
   await page.waitForTimeout(900);
   return {ctx,page};
  };
  const pose=page=>page.locator(".world-canvas").evaluate(c=>({yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)}));
  const canvasRect=page=>page.locator(".world-canvas").evaluate(c=>{const r=c.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
  const waitForStamp=async(page,pred,arg,label)=>{
   try{await page.waitForFunction(pred,arg,{timeout:8000,polling:50});}
   catch{throw Error(label+" — stamp never updated within 8000ms: pose="+JSON.stringify(await pose(page)));}
  };
  const box=async(page,sel)=>{const b=await page.locator(sel).boundingBox();if(!b)throw Error(sel+" has no bounding box");return b;};
  const intersects=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
  const noDocScroll=async(page)=>{
   const s=await page.evaluate(()=>({h:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),w:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),ih:innerHeight,iw:innerWidth}));
   if(s.h>s.ih+2||s.w>s.iw+2)throw Error(v.name+" document scrolls: "+JSON.stringify(s));
   return false;
  };
  // Essential tap audit: every visible interactive control in the chrome bands
  // and inside the open sheet must keep a >=44 CSS px surface (0.5px tolerance).
  const tapAudit=async(page,label)=>{
   const rects=await page.evaluate(()=>{
    const sels=".tool-dock__item,.sheet-toggle,.sheet-close,.rail-controls button,.resources-strip button,.toast button,.sheet-body button,.focus-button";
    return [...document.querySelectorAll(sels)].map(el=>{const r=el.getBoundingClientRect();
     return {sel:el.className&&String(el.className).slice(0,40)||el.tagName,testid:el.getAttribute("data-testid"),tool:el.getAttribute("data-tool"),
      x:r.x,y:r.y,width:r.width,height:r.height,visible:r.width>0&&r.height>0&&el.offsetParent!==null};})
    .filter(r=>r.visible);
   });
   if(!rects.length)throw Error(label+": no essential controls found");
   const bad=rects.filter(r=>r.width+0.5<44||r.height+0.5<44);
   if(bad.length)throw Error(label+": essential tap targets under 44px: "+JSON.stringify(bad));
   return {label,count:rects.length,minWidth:Math.min(...rects.map(r=>r.width)),minHeight:Math.min(...rects.map(r=>r.height))};
  };
  const cellPixel=async(page,cell)=>{
   const p=await pose(page),rect=await canvasRect(page);
   const ground={x:(cell.x-WORLD_SIZE/2+.5)*CELL,z:(cell.z-WORLD_SIZE/2+.5)*CELL};
   const px=projectGround(p,ground,{width:rect.width,height:rect.height});
   const back=groundAtScreen(p,px,{width:rect.width,height:rect.height});
   if(Math.hypot(back.x-ground.x,back.z-ground.z)>1e-6)throw Error("projectGround inverse diverged from camera math");
   if(px.x<0||px.y<0||px.x>rect.width||px.y>rect.height)throw Error("Target cell projects outside canvas: "+JSON.stringify({cell,px}));
   return {x:rect.left+px.x,y:rect.top+px.y};
  };
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

  const {ctx,page}=await newPage(JSON.stringify(RICH.save));
  const stamps=await page.locator(".world-canvas").evaluate(c=>({...c.dataset}));
  if(stamps.world3d!=="ready"||Number(stamps.cameraYaw)!==45||Math.abs(Number(stamps.cameraElevation)-35.264)>1e-6)
   throw Error("Isometric load stamps wrong: "+JSON.stringify({yaw:stamps.cameraYaw,elev:stamps.cameraElevation,world3d:stamps.world3d}));
  view.proof.loadStamps={world3d:stamps.world3d,yaw:Number(stamps.cameraYaw),elevation:Number(stamps.cameraElevation),zoom:Number(stamps.cameraZoom)};

  // ================= BUILD SHEET: geometry / taps / world band / no doc scroll =================
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-testid="sheet-title"]').waitFor({state:"visible",timeout:5000});
  await page.waitForTimeout(650); // placement rAF + one UI tick
  const title=await page.locator('[data-testid="sheet-title"]').innerText();
  if(title.toLowerCase()!=="build catalog")throw Error("Sheet title wrong: "+title); // CSS uppercases
  if(await page.locator('[data-testid="sheet-toggle"]').getAttribute("aria-expanded")!=="true")throw Error("Toggle must start expanded");
  const dock=await box(page,".tool-dock"),panel=await box(page,".panel-host"),hud=await box(page,".hud-top");
  if(intersects(panel,dock))throw Error(v.name+" sheet overlaps the dock: "+JSON.stringify({panel,dock}));
  if(panel.y+panel.height>dock.y+1)throw Error(v.name+" sheet bottom must sit above the dock top");
  const sideDocked=v.name==="desktop"||v.name==="landscape";
  let worldBand;
  if(sideDocked){
   const freeW=v.viewport.width-(panel.x+panel.width)-12;
   if(freeW<350)throw Error(v.name+" side sheet leaves too little world width: "+freeW);
   worldBand={kind:"horizontal-free-width",px:freeW};
  }else{
   const rail=await box(page,".left-rail");
   const band=panel.y-Math.max(hud.y+hud.height,rail.y+rail.height);
   // Small landscape phones keep a slimmer band by design (sheet yields 64px
   // while a notice is up); the acceptance viewports keep >=60px.
   const floor=v.name==="small-landscape"?20:60;
   if(band<floor)throw Error(v.name+" world band under HUD/rail too small: "+band);
   worldBand={kind:"vertical-band-below-hud-rail",px:band};
  }
  if(v.safeArea){
   const sab=v.safeArea.sab,sat=v.safeArea.sat;
   if(v.viewport.height-(dock.y+dock.height)<sab-0.5)throw Error("Dock does not reserve the bottom safe area");
   if(v.viewport.height-(panel.y+panel.height)<96+sab-0.5)throw Error("Sheet does not reserve dock band + bottom safe area");
   const foot=await box(page,".footline");
   if(foot.height<23+sab-0.5)throw Error("Footline does not reserve the bottom safe area: "+foot.height);
   const brand=await box(page,".brand");
   if(brand.y<sat-0.5)throw Error("HUD content does not clear the top safe area: "+brand.y);
   view.proof.safeArea={sat,sab,dockClearance:v.viewport.height-(dock.y+dock.height),sheetBottomReserve:v.viewport.height-(panel.y+panel.height),footlineHeight:foot.height,hudContentTop:brand.y};
  }
  const tapsBuild=await tapAudit(page,"build-open");
  view.proof.documentScroll=await noDocScroll(page);
  view.proof.buildSheet={title,panel,dock,worldBand,tapTargets:tapsBuild,
   internalScroll:await page.locator(".sheet-body .glass-panel").evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:getComputedStyle(el).overflowY}))};
  await shot(page,"build-open");

  // ================= COLLAPSE: camera + selection untouched, panel stays mounted =================
  const poseBefore=await pose(page);
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(350);
  if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed")!=="true")throw Error("data-collapsed not true after toggle");
  if(await page.locator("#context-sheet-body").evaluate(el=>el.hidden)!==true)throw Error("Sheet body must be hidden when collapsed");
  if(await page.locator('[data-testid="sheet-toggle"]').getAttribute("aria-expanded")!=="false")throw Error("aria-expanded must be false when collapsed");
  if(await page.locator(".sheet-body .glass-panel").count()!==1)throw Error("Panel must stay MOUNTED when collapsed (scroll/confirm survive)");
  const poseAfter=await pose(page);
  if(JSON.stringify(poseBefore)!==JSON.stringify(poseAfter))throw Error("Collapse moved the camera: "+JSON.stringify({poseBefore,poseAfter}));
  if(await page.locator('[data-tool="build"].is-active').count()!==1)throw Error("Collapse cleared the active tool/selection");
  const collapsedDock=await box(page,".tool-dock"),collapsedPanel=await box(page,".panel-host");
  if(intersects(collapsedPanel,collapsedDock))throw Error("Collapsed bar overlaps the dock");
  view.proof.collapse={poseUnchanged:true,bodyHidden:true,panelMounted:true,ariaExpanded:false,barHeight:collapsedPanel.height,documentScroll:await noDocScroll(page)};
  await shot(page,"build-collapsed");
  // Persistence across reload (player preference only).
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  if(v.safeArea)await page.addStyleTag({content:`:root{--sat:${v.safeArea.sat}px;--sar:0px;--sab:${v.safeArea.sab}px;--sal:0px}`});
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-testid="sheet-title"]').waitFor({state:"visible",timeout:5000});
  await page.waitForTimeout(350);
  if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed")!=="true")throw Error("Collapsed preference did not persist across reload");
  const stored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),DOCK_SETTINGS_KEY);
  if(stored?.sheetCollapsed!==true)throw Error("dock-settings key wrong: "+JSON.stringify(stored));
  view.proof.collapse.persistedAfterReload=true;
  await page.locator('[data-testid="sheet-toggle"]').click(); // expand again
  await page.waitForTimeout(350);
  if(await page.locator("#context-sheet-body").evaluate(el=>el.hidden)!==false)throw Error("Expand did not restore the body");

  // ================= INSPECT SHEET: selection toast lifted, non-obscuring, taps =================
  await page.locator('[data-tool="select"]').click();
  await tapCell(page,{x:RICH.furnace.x,z:RICH.furnace.z});
  await page.locator('[data-testid="inspector-status"]').waitFor({state:"visible",timeout:5000});
  await page.waitForTimeout(650);
  const inspPanel=await box(page,".panel-host");
  const inspDock=await box(page,".tool-dock");
  if(intersects(inspPanel,inspDock))throw Error(v.name+" inspector overlaps the dock");
  // Selection fires a real toast; it must never sit on the sheet or the dock.
  const toastVisible=await page.locator(".toast").count()>0;
  let toastProof={visible:toastVisible};
  if(toastVisible){
   const t=await box(page,".toast"),rail=await box(page,".left-rail");
   if(intersects(t,inspPanel)||intersects(t,inspDock)||intersects(t,rail))
    throw Error(v.name+" toast overlaps sheet/dock/rail: "+JSON.stringify({t,inspPanel,inspDock,rail}));
   toastProof={visible:true,nonOverlapping:true,rect:t};
  }
  // Non-obscuring: machine screen rect vs live panel box (focus fallback on mobile).
  const p=await pose(page),rect=await canvasRect(page);
  const m=machineScreenRect(p,RICH.furnace,{width:rect.width,height:rect.height});
  let occluded=rectsIntersect(m,{x:inspPanel.x-rect.left,y:inspPanel.y-rect.top,width:inspPanel.width,height:inspPanel.height});
  if(occluded&&v.isMobile){
   const fb=page.locator('[data-testid="focus-machine"]');
   if(await fb.count()){await fb.click();await page.waitForTimeout(700);
    const p2=await pose(page),m2=machineScreenRect(p2,RICH.furnace,{width:rect.width,height:rect.height}),b2=await box(page,".panel-host");
    occluded=rectsIntersect(m2,{x:b2.x-rect.left,y:b2.y-rect.top,width:b2.width,height:b2.height});}
  }
  if(occluded)throw Error(v.name+" inspector obscures the selected machine");
  const tapsInspect=await tapAudit(page,"inspect-open");
  view.proof.inspect={toast:toastProof,obscured:false,tapTargets:tapsInspect,documentScroll:await noDocScroll(page)};
  await shot(page,"inspect-open");
  // Motion proof: rAF simulation keeps animating under the open sheet.
  const f1=await page.screenshot({animations:"disabled"});
  await page.waitForTimeout(1500);
  const f2=await page.screenshot({animations:"disabled"});
  if(f1.equals(f2))throw Error("Simulation appears frozen between frames 1.5s apart");
  view.proof.motion={framesDiffer:true};
  // Collapse the inspector too: selection must survive.
  const poseIns=await pose(page);
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(300);
  if(JSON.stringify(await pose(page))!==JSON.stringify(poseIns))throw Error("Inspector collapse moved the camera");
  if(await page.locator('[data-testid="inspector-status"]').count()!==1)throw Error("Inspector must stay mounted collapsed");
  await shot(page,"inspect-collapsed");
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(300);

  // ================= CAMERA INVARIANTS: visible zoom works, stamp sync, 1 context =================
  const beforeZoom=await pose(page);
  await page.getByRole("button",{name:"Zoom in"}).click();
  await waitForStamp(page,p=>{const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraZoom)>p;},beforeZoom.zoom,"Zoom in control did not work");
  const afterZoom=await pose(page);
  const applied=await page.evaluate(()=>Number(document.body.dataset.lastZoomApplied));
  if(!Number.isFinite(applied)||Math.abs(afterZoom.zoom-applied)>1e-6)throw Error("CAMERA_STAMP_DESYNC: zoom "+afterZoom.zoom+" vs applied "+applied);
  if(afterZoom.zoom>CAMERA_LIMITS.maxZoom)throw Error("Zoom exceeded CAMERA_LIMITS");
  const contexts=await page.evaluate(()=>window.__rwSmoke?.webglContexts);
  if(contexts!==1)throw Error("webglContextCount !== 1: "+contexts);
  view.proof.cameraInvariants={beforeZoom:beforeZoom.zoom,afterZoom:afterZoom.zoom,stampMatchesApplied:true,webglContextCount:contexts,world3d:"ready"};
  view.proof.documentScroll=await noDocScroll(page);
  await ctx.close();

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
 console.log("UX-07 dock capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}