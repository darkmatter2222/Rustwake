// G0/G1 production-preview visual smoke: one Chromium instance, sequential contexts.
// This does not certify visual beauty or a physical phone; the sponsor still reviews screenshots.
import {chromium} from "playwright-core";
import {groundAtScreen} from "../src/camera.js";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"artifacts/v2-preview");
const HOST="http://127.0.0.1:4173/rustwake/";
const report={version:2,build:"production-preview",source_sha:process.env.GITHUB_SHA||"local",started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],limitations:["One headless Chromium/SwiftShader run; phone view is emulated","Cannot certify README art parity, genuine touch latency or player enjoyment"]};
let child,browser;
await mkdir(OUT,{recursive:true});
try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port","4173","--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!open)throw Error("Production preview did not become available");
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 for(const v of [
   {name:"desktop",viewport:{width:1440,height:900},dpr:1,isMobile:false,touch:false},
   {name:"phone",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true},
   {name:"landscape",viewport:{width:844,height:390},dpr:2,isMobile:true,touch:true},
 ]){
  const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
  const page=await ctx.newPage(),errs=[],failed=[];
  page.on("pageerror",e=>errs.push(String(e)));
  page.on("requestfailed",r=>{try{if(new URL(r.url()).origin==="http://127.0.0.1:4173")failed.push(r.url())}catch{}});
  await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  await page.waitForTimeout(1100);
  const actual=await page.evaluate(()=>{
   const c=document.querySelector(".world-canvas"),r=c?.getBoundingClientRect();
   return {
    world3d:c?.dataset.world3d, yaw:Number(c?.dataset.cameraYaw),elevation:Number(c?.dataset.cameraElevation),
    canvasCssWidth:r?.width,canvasCssHeight:r?.height,
    documentScroll:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)>innerHeight+2 || Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+2,
    buttons:[...document.querySelectorAll("button")].map(b=>b.getAttribute("aria-label")||b.innerText.trim()).filter(Boolean).slice(0,30),
    shell:document.querySelector(".app-shell")?.dataset.world,
    webglContextCount:1
   };
  });
  const filename=v.name+"-world.png";await page.screenshot({path:resolve(OUT,filename),fullPage:false,animations:"disabled"});
  // Use the SAME browser instance after the initial visual reference capture.
  // The first 3D screenshot remains the pristine landing scene. Camera checks
  // are runtime measurements, not visual-fidelity approval.
  let gripProof=null;
  if(v.name==="desktop"){
    const pose=()=>page.locator(".world-canvas").evaluate(c=>({
      yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),
      zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)
    }));
    const start={x:v.viewport.width*.53,y:v.viewport.height*.53};
    const end={x:start.x+74,y:start.y+43};
    const first=await pose(),firstWorld=groundAtScreen(first,start,v.viewport);
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    await page.mouse.move(end.x,end.y,{steps:10});await page.mouse.up();
    await page.waitForTimeout(130);
    const dragged=await pose(),afterDragWorld=groundAtScreen(dragged,end,v.viewport);
    const dragError=Math.hypot(firstWorld.x-afterDragWorld.x,firstWorld.z-afterDragWorld.z);
    if(dragError>.12)throw Error("ISOMETRIC_GRIP_DRIFT: ground moved "+dragError+" world units under cursor.");
    const zoomCursor={x:v.viewport.width*.61,y:v.viewport.height*.44};
    const beforeZoom=await pose(),zoomWorld=groundAtScreen(beforeZoom,zoomCursor,v.viewport);
    await page.mouse.move(zoomCursor.x,zoomCursor.y);
    await page.mouse.wheel(0,-640);
    await page.waitForTimeout(130);
    const zoomed=await pose(),afterZoomWorld=groundAtScreen(zoomed,zoomCursor,v.viewport);
    const zoomError=Math.hypot(zoomWorld.x-afterZoomWorld.x,zoomWorld.z-afterZoomWorld.z);
    if(zoomError>.12)throw Error("ZOOM_ANCHOR_DRIFT: ground moved "+zoomError+" world units under cursor.");
    if(zoomed.zoom<=beforeZoom.zoom)throw Error("Wheel-up did not increase camera zoom");
    const zoomButton=page.getByRole("button",{name:"Zoom in"});
    await zoomButton.click();await page.waitForTimeout(130);
    const buttonZoom=await pose();
    if(buttonZoom.zoom<=zoomed.zoom)throw Error("Visible Zoom in control did not work: initial="+first.zoom+", wheel="+zoomed.zoom+", button="+buttonZoom.zoom+", clickTrace="+JSON.stringify(await page.evaluate(()=>({...document.body.dataset})))+", jsErrors="+errs.join(";"));
    gripProof={dragWorldError:dragError,wheelWorldError:zoomError,
      initialZoom:first.zoom,afterWheel:zoomed.zoom,afterZoomButton:buttonZoom.zoom,
      expected:"ground coordinate remains directly beneath moving cursor"};
  }

  report.views.push({name:v.name,viewport:v.viewport,...actual,pageErrors:errs,failedRequests:failed,screenshot:filename,gripProof});
  if(actual.world3d!=="ready"||actual.shell!=="v2"||!Number.isFinite(actual.yaw)||Math.abs(actual.yaw-45)>.5||Math.abs(actual.elevation-35.264)>.5||actual.documentScroll||errs.length||failed.length)throw Error("Preview smoke failure at "+v.name+": "+JSON.stringify(actual)+" errors="+errs.join(";"));
  await ctx.close();
 }
 report.status="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child){child.kill("SIGTERM");}
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("V2 production screenshot capture:",report.status,OUT,JSON.stringify(report.views.map(v=>({view:v.name,world:v.world3d,camera:[v.yaw,v.elevation],scroll:v.documentScroll}))));
 if(report.errors.length)console.error(report.errors.join("\n"));
}
