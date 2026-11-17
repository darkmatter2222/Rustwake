// CAM-05 (#341) panel camera + selection retention evidence — production
// build + preview. NEW script; leased capture scripts untouched. Reuses the
// capture-fleet.mjs harness (bounded waitForFunction, synchronous canvas
// camera stamps, seeded authoritative saves, ONE headless Chromium/SwiftShader
// browser, 2D-canvas PNG decode for non-blank proof).
// Proves at 1440x900 desktop and 390x844 phone (dpr2 touch): a real tap
// selects the starter Freight Depot; an intentional orbit+zoom pose survives
// opening AND closing all six toolbar panels, the freight ledger, sheet
// collapse/expand, sheet close/reopen and responsive resize with BYTE-IDENTICAL
// applied camera stamps and retained selectedId (panelProbe); Home/Recenter
// DOES refit to the exact isometric home (deterministic negative); the guard
// is REAL — the legacy framing policy at the same recorded pose would slip
// the machine pivot >100px (Node-side exact computation); Escape explicitly
// deselects without camera motion; no-selection panel opens never refit.
// Numeric/runtime evidence only — verdict ceiling PASS_NUMERIC_ONLY; the
// sponsor still owes G1 visual acceptance (#276) on the deployed build.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS} from "../src/camera.js";
import {createGame} from "../src/simulation.js";
import {CELL,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {projectGround,machineScreenRect,panelPlacement,frameSelection} from "../src/inspector.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {sheetMaxHeight,dockBottomOffset,classifyViewport} from "../src/dock.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/341-cam-05");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4191,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const report={version:1,issue:341,task:"CAM-05 panel transitions retain camera pose and selection",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:["One headless Chromium/SwiftShader run; phone view is emulated (390x844 dpr2 touch), not a physical device (#268/#275)",
  "Numeric layout/pose proofs do not certify visual beauty — sponsor G1 visual acceptance is reserved and NOT granted by this capture (#276)",
  "Local production preview only — the live hosted-browser receipt at the deployed SHA is produced at release by the release engineer",
  "Verdict ceiling PASS_NUMERIC_ONLY; only hosted-browser CI at the deployed SHA retires that caveat (smoke invariants only)"]};
const DEPOT=createGame().buildings.find(b=>b.id===2); // Freight Depot, cell 13,9
const PIVOT=worldFootprint(DEPOT.type,DEPOT.x,DEPOT.z,DEPOT.rot||0).pivot;
const TOOL_TITLES={build:"Build catalog",road:"Road engineer",fleet:"Fleet logistics",research:"Research & industry",market:"Trade exchange",select:"Freight Depot"};
let child,browser;
await mkdir(OUT,{recursive:true});
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;
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
 const proofPage=await browser.newPage();
 const nonBlank=async(file)=>{
  const b64=(await readFile(resolve(OUT,file))).toString("base64");
  const stats=await proofPage.evaluate(async(b64)=>{
   const img=new Image();
   await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src="data:image/png;base64,"+b64;});
   const c=document.createElement("canvas");c.width=img.width;c.height=img.height;
   const ctx=c.getContext("2d");ctx.drawImage(img,0,0);
   const d=ctx.getImageData(0,0,c.width,c.height).data;
   const colors=new Set();let sum=0,n=0;
   for(let i=0;i<d.length;i+=4*97){colors.add((d[i]<<16)|(d[i+1]<<8)|d[i+2]);sum+=d[i]+d[i+1]+d[i+2];n++;}
   return {width:img.width,height:img.height,distinctColors:colors.size,meanLuma:sum/n/3};
  },b64);
  if(stats.distinctColors<60)throw Error("Screenshot looks blank: "+file+" "+JSON.stringify(stats));
  return stats;
 };
 const pose=page=>page.locator(".world-canvas").evaluate(c=>({yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)}));
 const canvasRect=page=>page.locator(".world-canvas").evaluate(c=>{const r=c.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
 const probe=page=>page.evaluate(()=>JSON.parse(document.body.dataset.panelProbe||"null"));
 const assertPose=async(page,expected,label)=>{
  const actual=await pose(page);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(label+": camera moved\n expected "+JSON.stringify(expected)+"\n actual   "+JSON.stringify(actual));
  return actual;
 };
 const assertProbe=async(page,trigger,selectedId,label)=>{
  const p=await probe(page);
  if(!p||p.trigger!==trigger||p.selectedId!==selectedId)throw Error(label+": panelProbe wrong: "+JSON.stringify(p)+" (want trigger "+trigger+" selectedId "+selectedId+")");
  return p;
 };
 const noDocScroll=async(page)=>{
  const s=await page.evaluate(()=>({h:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),w:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),ih:innerHeight,iw:innerWidth}));
  if(s.h>s.ih+2||s.w>s.iw+2)throw Error("document scrolls: "+JSON.stringify(s));
  return false;
 };
 const tapAudit=async(page,label)=>{
  const rects=await page.evaluate(()=>{
   const sels=".tool-dock__item,.sheet-toggle,.sheet-close,.rail-controls button,.resources-strip button";
   return [...document.querySelectorAll(sels)].map(el=>{const r=el.getBoundingClientRect();
    return {tool:el.getAttribute("data-tool"),testid:el.getAttribute("data-testid"),width:r.width,height:r.height,visible:r.width>0&&r.height>0&&el.offsetParent!==null};})
   .filter(r=>r.visible);
  });
  if(!rects.length)throw Error(label+": no essential controls found");
  const bad=rects.filter(r=>r.width+0.5<44||r.height+0.5<44);
  if(bad.length)throw Error(label+": tap targets under 44px: "+JSON.stringify(bad));
  return {label,count:rects.length,minWidth:Math.min(...rects.map(r=>r.width)),minHeight:Math.min(...rects.map(r=>r.height))};
 };
 const newPage=async(v,save)=>{
  const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.mobile,hasTouch:v.touch,reducedMotion:"reduce"});
  await ctx.addInitScript(instrument);
  if(save)await ctx.addInitScript(seedScript(JSON.stringify(save)));
  const page=await ctx.newPage();
  const errs=[],failed=[];
  page.on("pageerror",e=>errs.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
  page.on("requestfailed",r=>{try{if(new URL(r.url()).origin===`http://127.0.0.1:${PORT}`)failed.push(r.url());}catch{}});
  await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  await page.waitForTimeout(900);
  return {ctx,page,errs,failed};
 };
 const shot=async(view,page,label)=>{
  const f=`${view.name}-${label}.png`;
  await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});
  view.screenshots.push(f);view.proof.nonBlank=await nonBlank(f);
  return f;
 };
 // Placement mirror of App.updatePlacement using the MEASURED panel/dock rects.
 const placementNow=async(page,P)=>{
  const rct=await canvasRect(page),vp={width:rct.width,height:rct.height};
  const isPhone=vp.width<=770;
  const pb=await page.locator('[data-testid="panel-host"]').boundingBox().catch(()=>null);
  const panelSize=pb&&pb.width>0&&pb.height>0?{width:pb.width,height:pb.height}
   :{width:isPhone?vp.width-12:Math.min(356,vp.width-28),height:sheetMaxHeight(vp)||120};
  const dock=await page.locator(".tool-dock").boundingBox();
  const bottomOffset=dock&&dock.y>0?Math.max(0,vp.height-dock.y)+6:dockBottomOffset(classifyViewport(vp));
  return {vp,place:panelPlacement({machineRect:machineScreenRect(P,DEPOT,vp),viewport:vp,panelSize,isPhone,preference:"auto",bottomOffset})};
 };
 // Real pointer-path tap on the depot pivot (zoom out until it is tappable).
 const tapDepot=async(page)=>{
  for(let i=0;i<5;i++){
   const p=await pose(page),rct=await canvasRect(page);
   const px=projectGround(p,PIVOT,{width:rct.width,height:rct.height});
   const inside=px.x>30&&px.x<rct.width-30&&px.y>90&&px.y<rct.height-130;
   const hit=inside?await page.evaluate(([x,y])=>{
    const el=document.elementFromPoint(x,y);return el?.classList.contains("world-canvas")?"canvas":(el?.className||el?.tagName||"none");
   },[rct.left+px.x,rct.top+px.y]):"outside";
   if(hit==="canvas"){
    await page.mouse.click(rct.left+px.x,rct.top+px.y);
    await page.waitForFunction(()=>document.querySelector('[data-testid="sheet-title"]')?.textContent==="Freight Depot",null,{timeout:8000});
    await page.waitForTimeout(600); // allow the UX-04 new-selection autoFrame rAF
    return {tapPixel:px,tapPose:p};
   }
   await page.getByRole("button",{name:"Zoom out"}).click();
   await page.waitForFunction(z=>Number(document.querySelector(".world-canvas").dataset.cameraZoom)<z,p.zoom,{timeout:8000});
  }
  throw Error("could not bring the Freight Depot into a tappable canvas region");
 };

 const runView=async(v,resizeTo)=>{
  const view={...v,screenshots:[],proof:{}};
  const {ctx,page,errs,failed}=await newPage(v,createGame());
  const homeZoom=v.viewport.width>=960?1.15:1;
  const HOME={yaw:45,elevation:35.264,zoom:homeZoom,x:0,z:0};
  const stamps=await page.locator(".world-canvas").evaluate(c=>({...c.dataset}));
  if(stamps.world3d!=="ready"||Number(stamps.cameraYaw)!==45||Math.abs(Number(stamps.cameraElevation)-35.264)>1e-6||Number(stamps.cameraZoom)!==homeZoom)
   throw Error("Isometric load stamps wrong: "+JSON.stringify(stamps));
  view.proof.loadStamps={world3d:stamps.world3d,yaw:45,elevation:35.264,zoom:homeZoom};
  // 1) REAL tap selection of the starter Freight Depot (id 2).
  const tap=await tapDepot(page);
  const afterSelect=await pose(page);
  // Obscuration is decided at the PRE-frame tap pose (the sheet geometry is
  // camera-independent); the pin is then verified at the applied pose.
  const selPlace=await placementNow(page,tap.tapPose);
  const moved=JSON.stringify(afterSelect)!==JSON.stringify(tap.tapPose);
  if(selPlace.place.obscured){
   // UX-04 preserved: a NEW obscured selection auto-frames to the focus pixel.
   if(!moved)throw Error("obscured new selection should auto-frame (UX-04) but camera stayed");
   const pinned=projectGround(afterSelect,PIVOT,selPlace.vp);
   const pinError=Math.hypot(pinned.x-selPlace.place.focusPixel.x,pinned.y-selPlace.place.focusPixel.y);
   if(pinError>2)throw Error("new-selection autoFrame pin error: "+pinError+"px");
   view.proof.newSelectionAutoFrame={moved:true,obscured:true,focusPixel:selPlace.place.focusPixel,pivotPixel:pinned,pinErrorPx:pinError};
  }else{
   if(moved)throw Error("unobscured new selection must not move the camera: "+JSON.stringify({before:tap.tapPose,after:afterSelect}));
   view.proof.newSelectionAutoFrame={moved:false,obscured:false};
  }
  view.proof.selection={depotId:2,tapPixel:tap.tapPixel,sheetTitle:"Freight Depot"};
  // 2) Intentional pose via REAL gestures. Desktop: Orbit + Zoom in buttons.
  //    Phone: wheel-zoom anchored AT the machine (cameraInput pointer path)
  //    + keyboard pan — a centre-anchored orbit button would swing the pinned
  //    machine off-canvas, so orbit retention is proven on desktop and
  //    pan+zoom retention on phone (both are intentional non-home poses).
  const isPhone=v.viewport.width<=770;
  if(!isPhone){
   await page.locator('[title="Orbit camera right"]').click();
   await page.getByRole("button",{name:"Zoom in"}).click();
   await page.waitForTimeout(600);
  }else{
   // Pan the pinned machine toward mid-canvas (real keyboardPan), then
   // wheel-zoom anchored at a VERIFIED canvas pixel near the machine so the
   // zoom gesture keeps it in the clear zone above the bottom sheet.
   for(let i=0;i<3;i++){await page.keyboard.press("ArrowDown");await page.waitForTimeout(250);}
   const rct=await canvasRect(page),p0=await pose(page);
   const px=projectGround(p0,PIVOT,{width:rct.width,height:rct.height});
   let anchor=null;
   for(const cand of [{x:px.x,y:px.y},{x:195,y:250},{x:280,y:250},{x:195,y:300}]){
    const hit=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.classList.contains("world-canvas")===true,[rct.left+cand.x,rct.top+cand.y]);
    if(hit){anchor=cand;break;}
   }
   if(!anchor)throw Error("no clear canvas pixel for the phone wheel-zoom anchor");
   await page.mouse.move(rct.left+anchor.x,rct.top+anchor.y);
   await page.mouse.wheel(0,-240); // zoomBy(exp(.36)) anchored near the machine
   await page.waitForTimeout(400);
   let zNow=(await pose(page)).zoom;
   if(zNow===p0.zoom){
    // Some emulated touch contexts swallow CDP wheel; dispatch the same real
    // WheelEvent the cameraInput listener consumes (deltaMode 0, deltaY -240).
    await page.evaluate(([x,y])=>{document.querySelector(".world-canvas").dispatchEvent(new WheelEvent("wheel",{deltaY:-240,deltaMode:0,bubbles:true,cancelable:true,clientX:x,clientY:y}));},[rct.left+anchor.x,rct.top+anchor.y]);
    await page.waitForTimeout(400);
    zNow=(await pose(page)).zoom;
    view.proof.phoneWheelFallback=true;
   }
   view.proof.phoneZoomAnchor=anchor;
   view.proof.phoneZoomAfterWheel=zNow;
  }
  let P=await pose(page);
  if(!isPhone&&(P.yaw!==90||Math.abs(P.zoom-homeZoom*1.55)>1e-9))throw Error("desktop intentional pose not applied: "+JSON.stringify(P));
  if(isPhone&&!(P.zoom>homeZoom&&(P.x!==0||P.z!==0)))throw Error("phone intentional pose not applied: "+JSON.stringify(P));
  if(JSON.stringify(P)===JSON.stringify(HOME))throw Error("precondition: posed camera must differ from home");
  let visPlace=await placementNow(page,P);
  let pivotPx=projectGround(P,PIVOT,visPlace.vp);
  if(pivotPx.x<0||pivotPx.x>visPlace.vp.width||pivotPx.y<0||pivotPx.y>visPlace.vp.height)
   throw Error("selected machine off-canvas at posed view: "+JSON.stringify(pivotPx));
  view.proof.intentionalPose={pose:P,gesture:isPhone?"wheel-zoom-at-machine + ArrowDown pan":"Orbit button + Zoom in button",machinePivotPixel:pivotPx,obscured:visPlace.place.obscured};
  await shot(view,page,"inspector-posed");
  // 2b) Phone ONLY: naturally-obscured retention. Pan the machine UNDER the
  //     bottom sheet with real arrow keys; the Focus button must appear; a
  //     panel open/close while obscured must NOT move the camera; the
  //     explicit Focus button then re-pins the machine above the sheet.
  if(isPhone){
   const underSheet=[];
   for(let i=0;i<8;i++){
    if(await page.locator('[data-testid="focus-machine"]').isVisible().catch(()=>false))break;
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(350);
    underSheet.push("ArrowDown");
   }
   if(!await page.locator('[data-testid="focus-machine"]').isVisible().catch(()=>false))
    throw Error("Focus button never appeared after panning machine under the sheet");
   const P2=await pose(page);
   const obscuredPlace=await placementNow(page,P2);
   if(!obscuredPlace.place.obscured)throw Error("expected naturally obscured machine under phone sheet");
   await page.locator('[data-tool="build"]').click();
   await page.waitForTimeout(450);
   await assertPose(page,P2,"OBSCURED build panel open must retain pose");
   await assertProbe(page,"tool:build",2,"obscured build panel");
   await page.locator('[data-testid="sheet-close"]').click();
   await page.waitForTimeout(400);
   await assertPose(page,P2,"obscured sheet close must retain pose");
   await page.locator('[data-tool="select"]').click();
   await page.waitForTimeout(600);
   await assertPose(page,P2,"obscured inspector re-entry must retain pose");
   await shot(view,page,"obscured-retained");
   await page.locator('[data-testid="focus-machine"]').click();
   await page.waitForTimeout(600);
   P=await pose(page);
   visPlace=await placementNow(page,P);
   pivotPx=projectGround(P,PIVOT,visPlace.vp);
   const focusErr=Math.hypot(pivotPx.x-visPlace.place.focusPixel.x,pivotPx.y-visPlace.place.focusPixel.y);
   if(focusErr>2)throw Error("explicit Focus pin error: "+focusErr+"px");
   if(pivotPx.y>=visPlace.place.panelRect.y)throw Error("Focus did not lift the machine above the sheet");
   view.proof.obscuredRetention={panPresses:underSheet.length,obscuredPose:P2,
    buildOpenPoseIdentical:true,sheetClosePoseIdentical:true,inspectorReentryPoseIdentical:true,
    explicitFocus:{pose:P,focusPixel:visPlace.place.focusPixel,pivotPixel:pivotPx,pinErrorPx:focusErr,aboveSheet:true}};
  }
  // 3) Guard-is-real: the LEGACY panel-open policy at this exact recorded pose
  //    would reframe (measurable slip); the approved policy slips exactly 0.
  if(isPhone){
   // After the explicit Focus pin the camera already sits AT focusPixel, so a
   // legacy reframe would be a no-op. One real keyboardPan moves the machine
   // off the pin (still visible above the sheet) so the negative control is
   // falsifiable at the very pose the six-panel loop will run.
   await page.keyboard.press("ArrowDown");
   await page.waitForTimeout(350);
   P=await pose(page);
   visPlace=await placementNow(page,P);
   pivotPx=projectGround(P,PIVOT,visPlace.vp);
   if(pivotPx.y>=visPlace.place.panelRect.y)throw Error("phone nudge pushed machine back under the sheet");
  }
  const legacy=frameSelection(P,DEPOT,visPlace.vp,visPlace.place.focusPixel);
  const legacyPx=projectGround(legacy,PIVOT,visPlace.vp);
  const legacySlip=Math.hypot(pivotPx.x-legacyPx.x,pivotPx.y-legacyPx.y);
  const legacyDelta=Math.hypot(legacy.x-P.x,legacy.z-P.z);
  if(!(legacySlip>1))throw Error("negative control not falsifiable: legacy slip "+legacySlip);
  view.proof.guardIsReal={pose:P,naturallyObscured:visPlace.place.obscured,
   note:visPlace.place.obscured?"naturally obscured at the recorded pose":"adversarial obscured=true input (worst case); the natural phone obscured case is proven in obscuredRetention",
   focusPixel:visPlace.place.focusPixel,legacyTarget:{x:legacy.x,z:legacy.z},
   expected:{legacyTargetDeltaWorldUnits:legacyDelta,legacyPivotScreenSlipPx:legacySlip,approvedPanelSlipPx:0},
   actual:{approvedPanelSlipPx:0,legacyWouldMove:true}};
  // 4) Open AND close all six toolbar panels: byte-identical stamps + selection.
  view.proof.panels=[];
  for(const tool of ["build","road","fleet","research","market","select"]){
   await page.locator(`[data-tool="${tool}"]`).click();
   await page.waitForTimeout(450);
   await assertPose(page,P,tool+" panel open");
   await assertProbe(page,"tool:"+tool,2,tool+" panel open");
   const title=await page.locator('[data-testid="sheet-title"]').innerText();
   if(title.toLowerCase()!==TOOL_TITLES[tool].toLowerCase())throw Error(tool+" sheet title wrong: "+title);
   if(tool==="build")await shot(view,page,"build-catalog-open");
   if(tool==="select")await shot(view,page,"inspector-reentry");
   await page.locator('[data-testid="sheet-close"]').click();
   await page.waitForTimeout(400);
   await assertPose(page,P,tool+" panel close");
   await assertProbe(page,"sheet-close",2,tool+" panel close");
   if(await page.locator('[data-testid="panel-host"]').count()!==0)throw Error(tool+" close must unmount the sheet");
   view.proof.panels.push({tool,open:{poseIdentical:true,selectedId:2,title},close:{poseIdentical:true,selectedId:2,sheetUnmounted:true}});
  }
  // Inspector re-entry after the close loop: framedRef must NOT reframe.
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(600);
  await assertPose(page,P,"inspector re-entry must not reframe");
  if((await page.locator('[data-testid="sheet-title"]').innerText()).toLowerCase()!=="freight depot")throw Error("inspector re-entry lost the machine");
  // 5) Sheet collapse/expand keeps pose + selection (UX-07 contract).
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(400);
  if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed")!=="true")throw Error("collapse failed");
  await assertPose(page,P,"sheet collapse");
  await assertProbe(page,"sheet-toggle",2,"sheet collapse");
  await shot(view,page,"sheet-collapsed");
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(400);
  await assertPose(page,P,"sheet expand");
  view.proof.sheetToggle={collapse:{poseIdentical:true,selectedId:2},expand:{poseIdentical:true}};
  // 6) Freight ledger (seventh panel) via the resource strip chip.
  await page.locator(".resources-strip button").first().click();
  await page.waitForTimeout(450);
  await assertPose(page,P,"ledger open");
  await assertProbe(page,"tool:inventory",2,"ledger open");
  if((await page.locator('[data-testid="sheet-title"]').innerText()).toLowerCase()!=="freight ledger")throw Error("ledger title wrong");
  await page.locator('[data-testid="sheet-close"]').click();
  await page.waitForTimeout(400);
  await assertPose(page,P,"ledger close");
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(500);
  view.proof.ledger={open:{poseIdentical:true,selectedId:2},close:{poseIdentical:true}};
  // 7) Responsive resize: stamps must survive the desktop<->phone transition.
  await page.setViewportSize(resizeTo);
  await page.waitForTimeout(800);
  await assertPose(page,P,"resize to "+JSON.stringify(resizeTo));
  await assertProbe(page,"resize",2,"resize");
  await shot(view,page,"resized-"+resizeTo.width+"x"+resizeTo.height);
  await page.setViewportSize(v.viewport);
  await page.waitForTimeout(800);
  await assertPose(page,P,"resize back to "+JSON.stringify(v.viewport));
  await assertProbe(page,"resize",2,"resize back");
  view.proof.responsiveResize={to:resizeTo,back:v.viewport,poseIdentical:true,selectedId:2};
  // 8) Deterministic NEGATIVE: Home/Recenter DOES refit to exact home values.
  await page.locator('[title="Fit isometric world (Home)"]').click();
  await page.waitForTimeout(500);
  await assertPose(page,HOME,"Home must refit to the exact isometric overview");
  await assertProbe(page,"reset",2,"Home refit keeps selection");
  await shot(view,page,"home-refit");
  view.proof.homeNegative={preconditionPose:P,expected:HOME,actual:await pose(page),refit:true,selectionRetained:true};
  // 9) Escape: explicit deselect, camera untouched.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const esc=await probe(page);
  if(JSON.stringify(esc)!==JSON.stringify({trigger:"escape",mode:"select",selectedId:null}))throw Error("Escape probe wrong: "+JSON.stringify(esc));
  await assertPose(page,HOME,"Escape must not move the camera");
  // 10) No-selection panel open must NOT refit to an empty plot.
  await page.locator('[data-tool="build"]').click();
  await page.waitForTimeout(450);
  await assertPose(page,HOME,"no-selection build panel must not refit");
  await assertProbe(page,"tool:build",null,"no-selection build panel");
  await page.locator('[data-testid="sheet-close"]').click();
  await page.waitForTimeout(300);
  view.proof.emptyPlotGuard={poseIdentical:true,selectedId:null};
  // 11) Runtime invariants: motion, one WebGL context, stamp sync, taps, scroll.
  const f1=await page.screenshot({animations:"disabled"});
  await page.waitForTimeout(1500);
  const f2=await page.screenshot({animations:"disabled"});
  if(f1.equals(f2))throw Error("simulation frozen between frames");
  view.proof.motion={framesDiffer:true};
  const bz=await pose(page);
  await page.getByRole("button",{name:"Zoom in"}).click();
  await page.waitForFunction(z=>Number(document.querySelector(".world-canvas").dataset.cameraZoom)>z,bz.zoom,{timeout:8000});
  const az=await pose(page);
  const applied=await page.evaluate(()=>Number(document.body.dataset.lastZoomApplied));
  if(Math.abs(az.zoom-applied)>1e-6)throw Error("CAMERA_STAMP_DESYNC");
  if(az.zoom>CAMERA_LIMITS.maxZoom)throw Error("zoom exceeded limits");
  const contexts=await page.evaluate(()=>window.__rwSmoke?.webglContexts);
  if(contexts!==1)throw Error("webglContextCount !== 1: "+contexts);
  view.proof.cameraInvariants={stampMatchesApplied:true,buttonZoom:az.zoom,appliedZoom:applied,webglContextCount:contexts,world3d:"ready",yawPreservedDuringPanels:true};
  view.proof.tapTargets=await tapAudit(page,"cam05");
  view.proof.documentScroll=await noDocScroll(page);
  await ctx.close();
  view.pageErrors=errs;view.failedRequests=failed;
  if(errs.length||failed.length)throw Error(view.name+" errors: "+JSON.stringify({errs,failed}));
  report.views.push(view);
 };

 await runView({name:"desktop",viewport:{width:1440,height:900},dpr:1,mobile:false,touch:false},{width:390,height:844});
 await runView({name:"phone",viewport:{width:390,height:844},dpr:2,mobile:true,touch:true},{width:1440,height:900});
 report.status="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child)child.kill("SIGTERM");
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("CAM-05 capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}