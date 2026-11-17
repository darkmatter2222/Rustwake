// CAM-03 (#339) zoom-anchor evidence on the PRODUCTION preview build.
// One Chromium instance, sequential contexts. Real DOM wheel gestures, real UI
// zoom-button clicks, and a genuine two-finger pinch (CDP Input.dispatchTouchEvent)
// drive the SAME production input path (cameraInput -> zoomAtPixel/transformGesture
// -> world.setView/applyCamera/stampCamera). Every pose is read back from the canvas
// dataset, which world.applyCamera stamps SYNCHRONOUSLY from the rendered THREE
// camera, so dataset == applied state by construction; we also cross-check the
// body lastZoomApplied stamp and the normalizeCamera fixed point.
//
// Measurements (exact inverse ground projection, tolerance <= 1 CSS px):
//  - center +/- buttons reach the FULL 0.20-12 range with zero target shift;
//  - off-center cursor wheel keeps the world point fixed across the range and
//    clamps SMOOTHLY at the +/-90 pan envelope (zero slip, monotone, no jump);
//  - phone pinch keeps the touch centroid fixed and clamps smoothly;
//  - deterministic NEGATIVE: legacy center-pivot zoom drifts > 1px, approved 0.
//
// PASS_NUMERIC_ONLY: headless SwiftShader run, emulated phone. This does NOT
// certify visual fidelity — G1 (#276) sponsor review of these artifacts is still
// required before any visual claim.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS,normalizeCamera,groundAtScreen} from "../src/camera.js";
import {createGame} from "../src/simulation.js";
import {SAVE_KEY} from "../src/content.js";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_CAM03_OUT||"C:/Users/ryans/AppData/Local/Temp/rw-qwen/cam03-out");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT||4339);
const ORIGIN=`http://127.0.0.1:${PORT}`;
const HOST=`${ORIGIN}/rustwake/`;
const TOL=1;
const report={issue:339,version:2,build:"production-preview",source_sha:process.env.GITHUB_SHA||"local",
 started:new Date().toISOString(),views:[],measurements:{},status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone view is emulated, not a physical device",
  "PASS_NUMERIC_ONLY: anchor/stamp/DOM measurements are exact; visual fidelity is screenshot-only and NOT self-certified",
  "G1 visual review (#276) is sponsor-reserved; these artifacts are evidence for that review, not approval",
  "Off-center zoom clamps smoothly below a limit when the pinned anchor would leave the +/-90 pan envelope; the FULL 0.20-12 range is reached by center-anchored controls (zero target shift)"
 ]};

const rad=d=>d*Math.PI/180;
const kOf=(box,zoom)=>CAMERA_LIMITS.frustumHeight/(box.height*zoom);
function errPx(cam,expected,pixel,box){
 const c=normalizeCamera(cam),a=groundAtScreen(c,pixel,box);
 const gx=a.x-expected.x,gz=a.z-expected.z;
 const cs=Math.cos(rad(c.yaw)),sn=Math.sin(rad(c.yaw));
 const u=cs*gx-sn*gz,v=-Math.sin(rad(c.elevation))*(sn*gx+cs*gz);
 return Math.hypot(u,v)/kOf(box,c.zoom);
}
const legacyCenterZoom=(cam,nextZoom)=>normalizeCamera({...normalizeCamera(cam),zoom:nextZoom});
const inEnvelope=c=>Math.abs(c.x)<=CAMERA_LIMITS.panExtent+1e-9&&Math.abs(c.z)<=CAMERA_LIMITS.panExtent+1e-9;

let child,browser;
await mkdir(OUT,{recursive:true});
try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!open)throw Error("Production preview did not become available");
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 const inject=async ctx=>{
  const g=createGame();const json=JSON.stringify(g);
  await ctx.addInitScript(({json,key})=>{
   const save=JSON.parse(json);save.lastSavedAt=Date.now();
   localStorage.setItem(key,JSON.stringify(save));
   localStorage.setItem("rustwake:v2:intro","1");
  },{json,key:SAVE_KEY});
 };
 const newPage=async ctx=>{
  const page=await ctx.newPage(),errs=[],failed=[];
  page.on("pageerror",e=>errs.push(String(e)));
  page.on("requestfailed",r=>{try{if(new URL(r.url()).origin===ORIGIN)failed.push(r.url())}catch{}});
  await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  return {page,errs,failed};
 };
 const pose=page=>page.locator(".world-canvas").evaluate(c=>({
  yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),
  zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)
 }));
 const rect=page=>page.locator(".world-canvas").evaluate(c=>{const r=c.getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height};});
 const lastZoomApplied=page=>page.evaluate(()=>Number(document.body.dataset.lastZoomApplied));
 // world.applyCamera stamps synchronously inside the wheel/click handler; read a
 // stable pose (two equal consecutive reads) so a coalesced frame cannot mislead.
 const stablePose=async page=>{const a=await pose(page);await page.waitForTimeout(40);const b=await pose(page);return b.zoom===a.zoom&&b.x===a.x&&b.z===a.z?b:a;};
 // dataset == applied: the canvas dataset pose must be a normalizeCamera fixed
 // point (no silent post-stamp clamp), so groundAtScreen(pose) IS the rendered
 // THREE camera state. body.lastZoomApplied is a BUTTON-only stamp (zoomControl),
 // so it is cross-checked only on the button path (checkApplied), not wheel/pinch.
 const stampCheck=async(page,label,checkApplied=false)=>{
  const p=await pose(page),re=normalizeCamera(p),applied=await lastZoomApplied(page);
  const fixedPoint=["yaw","elevation","zoom","x","z"].every(k=>Math.abs(p[k]-re[k])<1e-9);
  if(!fixedPoint)throw Error("STAMP_NOT_APPLIED "+label+": dataset pose is not a normalizeCamera fixed point "+JSON.stringify({p,re}));
  const matchesApplied=checkApplied?(Number.isFinite(applied)&&Math.abs(p.zoom-applied)<=1e-6):true;
  if(!matchesApplied)throw Error("STAMP_NOT_APPLIED "+label+": canvas zoom "+p.zoom+" != body lastZoomApplied "+applied);
  return {pose:p,fixedPoint,matchesApplied,lastZoomApplied:applied};
 };

 // ================= DESKTOP 1440x900 =================
 {
  const vp={width:1440,height:900};
  const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:1,reducedMotion:"reduce"});
  await inject(ctx);
  const {page,errs,failed}=await newPage(ctx);
  const box=await rect(page);
  const home=await pose(page);
  await page.screenshot({path:resolve(OUT,"desktop-cam03-home.png"),fullPage:false,animations:"disabled"});

  // ---- (A) center +/- buttons reach the FULL 0.20-12 range, zero target shift ----
  const center={x:box.width/2,y:box.height/2};
  const centerAnchor=groundAtScreen(home,center,box);
  const buttonTrace=[];let maxButtonErr=0;
  const clickTo=async(name,target,dir)=>{
   for(let i=0;i<40;i++){
    const before=await pose(page);
    if(dir>0?before.zoom>=target-1e-6:before.zoom<=target+1e-6)break;
    await page.getByRole("button",{name}).click();
    await page.waitForFunction(t=>{const c=document.querySelector(".world-canvas");
     return !!c&&(t.dir>0?Number(c.dataset.cameraZoom)>=t.target-1e-6:Number(c.dataset.cameraZoom)<=t.target+1e-6)||Number(c.dataset.cameraZoom)!==t.prev;},
     {target,dir,prev:before.zoom},{timeout:8000,polling:50});
    const after=await stablePose(page);
    const e=errPx(after,centerAnchor,center,box);maxButtonErr=Math.max(maxButtonErr,e);
    const sc=await stampCheck(page,"button-"+name+"-"+i,true);
    buttonTrace.push({button:name,tick:i,zoom:after.zoom,x:after.x,z:after.z,errorCssPx:e,stampMatchesApplied:sc.matchesApplied});
    if(e>TOL)throw Error("BUTTON_ANCHOR_DRIFT "+name+" tick "+i+": "+e+"px");
    if(Math.abs(after.x-home.x)>1e-6||Math.abs(after.z-home.z)>1e-6)throw Error("BUTTON_TARGET_SHIFT "+name+": target moved to "+after.x+","+after.z);
   }
  };
  await clickTo("Zoom in",CAMERA_LIMITS.maxZoom,1);
  const atMax=await pose(page);
  if(Math.abs(atMax.zoom-CAMERA_LIMITS.maxZoom)>1e-6)throw Error("BUTTON_RANGE: Zoom in did not reach 12, got "+atMax.zoom);
  await page.screenshot({path:resolve(OUT,"desktop-cam03-zoom-max.png"),fullPage:false,animations:"disabled"});
  await clickTo("Zoom out",CAMERA_LIMITS.minZoom,-1);
  const atMin=await pose(page);
  if(Math.abs(atMin.zoom-CAMERA_LIMITS.minZoom)>1e-6)throw Error("BUTTON_RANGE: Zoom out did not reach 0.20, got "+atMin.zoom);
  await page.screenshot({path:resolve(OUT,"desktop-cam03-zoom-min.png"),fullPage:false,animations:"disabled"});
  report.measurements.desktopButtonRange={viewport:vp,home,centerAnchor,
   reachedMax:atMax.zoom,reachedMin:atMin.zoom,maxErrorCssPx:maxButtonErr,ticks:buttonTrace.length,
   trace:buttonTrace,expected:"center buttons reach exactly 12 and 0.20 with zero target shift and <=1px anchor error"};

  // ---- (B) off-center cursor wheel: anchor-exact across range, smooth clamp ----
  await page.getByRole("button",{name:"Zoom in"}).click(); // leave min so zoom-out has room
  await page.waitForFunction(()=>Number(document.querySelector(".world-canvas").dataset.cameraZoom)>0.21,null,{timeout:8000});
  // recenter target via Home so the cursor anchor starts inside the envelope
  await page.keyboard.press("Home");
  await page.waitForFunction(()=>{const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraYaw)===45&&Number(c.dataset.cameraZoom)===1.15;},null,{timeout:8000});
  const cursor={x:1140,y:450};
  const startPose=await pose(page);
  const anchor=groundAtScreen(startPose,cursor,box);
  const wheelTrace=[];let maxWheelErr=0,clampZoom=null,maxStep=0;
  const wheelTick=async(ratio,label)=>{
   const before=await pose(page);
   await page.mouse.move(cursor.x,cursor.y);
   await page.mouse.wheel(0,-Math.log(ratio)/.0015);
   const after=await stablePose(page);
   const e=errPx(after,anchor,cursor,box);maxWheelErr=Math.max(maxWheelErr,e);
   const step=Math.hypot(after.x-before.x,after.z-before.z);maxStep=Math.max(maxStep,step);
   const sc=await stampCheck(page,"wheel-"+label);
   if(!inEnvelope(after))throw Error("WHEEL_ENVELOPE "+label+": target outside +/-90: "+after.x+","+after.z);
   if(e>TOL)throw Error("WHEEL_ANCHOR_DRIFT "+label+": "+e+"px > "+TOL+"; before="+JSON.stringify(before)+" after="+JSON.stringify(after));
   wheelTrace.push({label,ratio,zoomBefore:before.zoom,zoomAfter:after.zoom,x:after.x,z:after.z,errorCssPx:e,targetStep:step,stampFixedPoint:sc.fixedPoint});
   return {before,after};
  };
  // Zoom IN toward 12 (overshoot request); cursor anchor (23,-23) is inside envelope so it reaches 12.
  let prevZoom=(await pose(page)).zoom,steady=0;
  for(let i=0;i<24;i++){
   const {after}=await wheelTick(1.55,"in-"+i);
   if(after.zoom<prevZoom-1e-9)throw Error("WHEEL_JUMP in-"+i+": zoom reversed "+prevZoom+"->"+after.zoom);
   if(Math.abs(after.zoom-prevZoom)<1e-9){steady++;if(steady>=2)break;}else steady=0;
   prevZoom=after.zoom;
   if(after.zoom>=CAMERA_LIMITS.maxZoom-1e-6)break;
  }
  const wheelMax=await pose(page);
  await page.screenshot({path:resolve(OUT,"desktop-cam03-cursor-max.png"),fullPage:false,animations:"disabled"});
  // Zoom OUT toward 0.20; at the envelope the zoom clamps SMOOTHLY (anchor sacred).
  prevZoom=wheelMax.zoom;steady=0;
  for(let i=0;i<40;i++){
   const {after}=await wheelTick(1/1.55,"out-"+i);
   if(after.zoom>prevZoom+1e-9)throw Error("WHEEL_JUMP out-"+i+": zoom reversed "+prevZoom+"->"+after.zoom);
   if(Math.abs(after.zoom-prevZoom)<1e-9){steady++;if(steady>=3){clampZoom=after.zoom;break;}}else steady=0;
   prevZoom=after.zoom;
   if(after.zoom<=CAMERA_LIMITS.minZoom+1e-6){clampZoom=after.zoom;break;}
  }
  const wheelEnd=await pose(page);
  await page.screenshot({path:resolve(OUT,"desktop-cam03-cursor-clamp.png"),fullPage:false,animations:"disabled"});
  if(maxWheelErr>TOL)throw Error("WHEEL max anchor error "+maxWheelErr);
  report.measurements.desktopCursorWheel={viewport:vp,cursor,startPose,anchorWorld:anchor,
   maxErrorCssPx:maxWheelErr,maxTargetStep:maxStep,reachedMaxZoom:wheelMax.zoom,clampZoom,
   endPose:wheelEnd,ticks:wheelTrace.length,trace:wheelTrace,
   expected:"world point under cursor fixed <=1px at every tick; zoom monotone; smooth clamp at envelope with zero slip and no target teleport"};

  // ---- (C) deterministic NEGATIVE on the production build: center-pivot drift ----
  const negPose=await pose(page);
  const negAnchor=groundAtScreen(negPose,cursor,box);
  const legacy=legacyCenterZoom(negPose,negPose.zoom*1.55);
  const legacyErr=errPx(legacy,negAnchor,cursor,box);
  // approved: a real anchored wheel tick from the same pose
  await page.mouse.move(cursor.x,cursor.y);await page.mouse.wheel(0,-Math.log(1.55)/.0015);
  const approvedPose=await stablePose(page);
  const approvedErr=errPx(approvedPose,negAnchor,cursor,box);
  if(!(legacyErr>TOL))throw Error("NEGATIVE_CONTROL: legacy center-pivot drift "+legacyErr+"px must exceed "+TOL);
  if(approvedErr>TOL)throw Error("NEGATIVE_CONTROL: approved drift "+approvedErr+"px must be <= "+TOL);
  report.measurements.negativeControl={viewport:vp,cursor,pose:negPose,anchorWorld:negAnchor,
   legacyCenterPivotDriftCssPx:legacyErr,approvedAnchoredDriftCssPx:approvedErr,
   expected:"legacy center-pivot zoom drifts >1px (fails the contract); approved anchored zoom drifts <=1px (passes)"};
  await page.screenshot({path:resolve(OUT,"desktop-cam03-negative.png"),fullPage:false,animations:"disabled"});

  report.views.push({name:"desktop",viewport:vp,pageErrors:errs,failedRequests:failed});
  if(errs.length||failed.length)throw Error("desktop page errors: "+errs.join(";")+" failed="+failed.join(","));
  await ctx.close();
 }

 // ================= PHONE 390x844 (real two-finger pinch) =================
 {
  const vp={width:390,height:844};
  const ctx=await browser.newContext({viewport:vp,deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  await inject(ctx);
  const {page,errs,failed}=await newPage(ctx);
  const box=await rect(page);
  const home=await pose(page);
  await page.screenshot({path:resolve(OUT,"phone-cam03-home.png"),fullPage:false,animations:"disabled"});
  const cdp=await ctx.newCDPSession(page);
  // Centroid fixed at 62%/55% of the canvas; fingers move symmetrically so the
  // gesture is a pure pinch (deltaYaw ~ 0) about a stationary centroid.
  const centroid={x:box.left+box.width*.62,y:box.top+box.height*.55};
  const localCentroid={x:box.width*.62,y:box.height*.55};
  const startPose=await pose(page);
  const anchor=groundAtScreen(startPose,localCentroid,box);
  const touch=(type,half)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:type==="touchEnd"?[]:[
   {x:centroid.x-half,y:centroid.y,id:1},{x:centroid.x+half,y:centroid.y,id:2}]});
  const pinchTrace=[];let maxPinchErr=0,prevZoom=startPose.zoom;
  let half=70;
  await touch("touchStart",half);
  await page.waitForTimeout(60);
  // Pinch OUT (fingers together -> zoom down) far past the envelope; smooth clamp.
  for(let i=0;i<16;i++){
   half=Math.max(8,half*0.72);
   await touch("touchMove",half);
   const after=await stablePose(page);
   const e=errPx(after,anchor,localCentroid,box);maxPinchErr=Math.max(maxPinchErr,e);
   const sc=await stampCheck(page,"pinch-out-"+i);
   if(!inEnvelope(after))throw Error("PINCH_ENVELOPE out-"+i+": "+after.x+","+after.z);
   if(e>TOL)throw Error("PINCH_CENTROID_DRIFT out-"+i+": "+e+"px > "+TOL);
   if(after.zoom>prevZoom+1e-9)throw Error("PINCH_JUMP out-"+i+": zoom reversed");
   pinchTrace.push({dir:"out",tick:i,half,zoom:after.zoom,x:after.x,z:after.z,errorCssPx:e,stampFixedPoint:sc.fixedPoint});
   prevZoom=after.zoom;
  }
  await touch("touchEnd",0);
  const pinchOutPose=await pose(page);
  await page.screenshot({path:resolve(OUT,"phone-cam03-pinch-clamp.png"),fullPage:false,animations:"disabled"});
  // Pinch IN (fingers apart -> zoom up) from the clamped state; re-anchors smoothly.
  half=20;await touch("touchStart",half);await page.waitForTimeout(60);prevZoom=pinchOutPose.zoom;
  for(let i=0;i<16;i++){
   half=Math.min(150,half*1.35);
   await touch("touchMove",half);
   const after=await stablePose(page);
   const e=errPx(after,anchor,localCentroid,box);maxPinchErr=Math.max(maxPinchErr,e);
   if(e>TOL)throw Error("PINCH_CENTROID_DRIFT in-"+i+": "+e+"px");
   if(after.zoom<prevZoom-1e-9)throw Error("PINCH_JUMP in-"+i+": zoom reversed");
   pinchTrace.push({dir:"in",tick:i,half,zoom:after.zoom,errorCssPx:e});
   prevZoom=after.zoom;
  }
  await touch("touchEnd",0);
  const pinchInPose=await pose(page);
  await page.screenshot({path:resolve(OUT,"phone-cam03-pinch-in.png"),fullPage:false,animations:"disabled"});
  const scroll=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)>innerHeight+2||Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+2);
  report.measurements.phonePinch={viewport:vp,home,centroid:localCentroid,anchorWorld:anchor,
   maxErrorCssPx:maxPinchErr,pinchOutPose,pinchInPose,ticks:pinchTrace.length,trace:pinchTrace,documentScroll:scroll,
   expected:"touch centroid world point fixed <=1px through pinch out/in; smooth envelope clamp; no jump"};
  report.views.push({name:"phone",viewport:vp,pageErrors:errs,failedRequests:failed,documentScroll:scroll});
  if(errs.length||failed.length||scroll)throw Error("phone failure: errors="+errs.join(";")+" failed="+failed.join(",")+" scroll="+scroll);
  await ctx.close();
 }

 report.status="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child)child.kill("SIGTERM");
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("CAM-03 zoom-anchor capture:",report.status,OUT);
 if(report.errors.length)console.error(report.errors.join("\n"));
}
