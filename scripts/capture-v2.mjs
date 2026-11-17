// G0/G1 production-preview visual smoke: one Chromium instance, sequential contexts.
// This does not certify visual beauty or a physical phone; the sponsor still reviews screenshots.
import {chromium} from "playwright-core";
import {groundAtScreen,CAMERA_LIMITS} from "../src/camera.js";
import {createGame,checkSite} from "../src/simulation.js";
import {BLUEPRINTS,CELL,WORLD_SIZE} from "../src/content.js";
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
  const pose=()=>page.locator(".world-canvas").evaluate(c=>({
    yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),
    zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)
  }));
  const bodyTrace=()=>page.evaluate(()=>({...document.body.dataset}));
  // Bounded observation instead of a fixed sleep: wait for the canvas stamp
  // (written synchronously by world.applyCamera) to prove the camera moved.
  // A timeout still FAILS the capture honestly if zoom/pan truly never apply.
  const waitForStamp=async(pred,arg,label)=>{
   try{await page.waitForFunction(pred,arg,{timeout:8000,polling:50});}
   catch{throw Error(label+" — stamp never updated within 8000ms: pose="+JSON.stringify(await pose())+", bodyTrace="+JSON.stringify(await bodyTrace())+", jsErrors="+errs.join(";"));}
  };
  const waitZoomAbove=(prev,label)=>waitForStamp(
    p=>{const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraZoom)>p;},
    prev,label);
  let gripProof=null;
  if(v.name==="desktop"){
    const start={x:v.viewport.width*.53,y:v.viewport.height*.53};
    const end={x:start.x+74,y:start.y+43};
    const first=await pose(),firstWorld=groundAtScreen(first,start,v.viewport);
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    await page.mouse.move(end.x,end.y,{steps:10});await page.mouse.up();
    await waitForStamp(p=>{const c=document.querySelector(".world-canvas");
      return !!c&&(Number(c.dataset.cameraX)!==p.x||Number(c.dataset.cameraZ)!==p.z);},
      {x:first.x,z:first.z},"ISOMETRIC_GRIP_DRIFT: pan never applied");
    const dragged=await pose(),afterDragWorld=groundAtScreen(dragged,end,v.viewport);
    const dragError=Math.hypot(firstWorld.x-afterDragWorld.x,firstWorld.z-afterDragWorld.z);
    if(dragError>.12)throw Error("ISOMETRIC_GRIP_DRIFT: ground moved "+dragError+" world units under cursor.");
    const zoomCursor={x:v.viewport.width*.61,y:v.viewport.height*.44};
    const beforeZoom=await pose(),zoomWorld=groundAtScreen(beforeZoom,zoomCursor,v.viewport);
    await page.mouse.move(zoomCursor.x,zoomCursor.y);
    await page.mouse.wheel(0,-640);
    await waitZoomAbove(beforeZoom.zoom,"Wheel-up did not increase camera zoom");
    const zoomed=await pose(),afterZoomWorld=groundAtScreen(zoomed,zoomCursor,v.viewport);
    const zoomError=Math.hypot(zoomWorld.x-afterZoomWorld.x,zoomWorld.z-afterZoomWorld.z);
    if(zoomError>.12)throw Error("ZOOM_ANCHOR_DRIFT: ground moved "+zoomError+" world units under cursor.");
    if(zoomed.zoom<=beforeZoom.zoom)throw Error("Wheel-up did not increase camera zoom");
    gripProof={dragWorldError:dragError,wheelWorldError:zoomError,
      initialZoom:first.zoom,afterWheel:zoomed.zoom,
      expected:"ground coordinate remains directly beneath moving cursor"};
  }
  // The visible Zoom in control must work at EVERY viewport (44px touch
  // surface), and the canvas stamp must equal the applied zoom synchronously.
  const beforeButton=await pose();
  await page.getByRole("button",{name:"Zoom in"}).click();
  await waitZoomAbove(beforeButton.zoom,"Visible Zoom in control did not work");
  const buttonZoom=await pose(),trace=await bodyTrace();
  if(buttonZoom.zoom<=beforeButton.zoom)throw Error("Visible Zoom in control did not work: before="+beforeButton.zoom+", button="+buttonZoom.zoom+", clickTrace="+JSON.stringify(trace)+", jsErrors="+errs.join(";"));
  const appliedZoom=Number(trace.lastZoomApplied);
  if(!Number.isFinite(appliedZoom)||Math.abs(buttonZoom.zoom-appliedZoom)>1e-6)
   throw Error("CAMERA_STAMP_DESYNC: canvas cameraZoom="+buttonZoom.zoom+" but applied zoom="+trace.lastZoomApplied+", clickTrace="+JSON.stringify(trace)+", jsErrors="+errs.join(";"));
  gripProof={...(gripProof||{}),beforeZoomButton:beforeButton.zoom,afterZoomButton:buttonZoom.zoom,
    stampMatchesApplied:true,
    expected:(gripProof?gripProof.expected+"; ":"")+"zoom button stamp equals applied camera zoom"};

  // #370 REAL construction mechanic on the live preview: an occupied site is
  // rejected with the exact validator reason and ZERO bank movement, a legal
  // surveyed pad builds (single charge), and canceling mid-assembly refunds in
  // full. This exercises gameplay transactions, not a decorative animation.
  let constructionProof=null;
  if(v.name==="desktop"){
    const sim=createGame(); // same deterministic seed/bank as a fresh player save
    const occupied={x:7,z:9}; // starter Scrap Extractor anchor cell
    if(checkSite(sim,"salvager",occupied.x,occupied.z,1).code!=="COLLISION")
      throw Error("Capture precondition changed: (7,9) is no longer an occupied site");
    let legal=null;
    for(let z=1;z<WORLD_SIZE-1&&!legal;z++)
      for(let x=1;x<WORLD_SIZE-1;x++)
        if(checkSite(sim,"salvager",x,z,1).ok){legal={x,z};break;}
    if(!legal)throw Error("Capture precondition changed: no legal rot1 salvager site on seed "+sim.seed);
    // Inverse of camera.groundAtScreen: cell center world -> CSS pixel, proved
    // by round-tripping through the authoritative camera math before clicking.
    const cellPixel=async(cell)=>{
      const p=await pose();
      const rect=await page.locator(".world-canvas").evaluate(c=>{
        const r=c.getBoundingClientRect();
        return {left:r.left,top:r.top,width:r.width,height:r.height};
      });
      const wx=(cell.x-WORLD_SIZE/2+.5)*CELL,wz=(cell.z-WORLD_SIZE/2+.5)*CELL;
      const th=p.yaw*Math.PI/180,cs=Math.cos(th),sn=Math.sin(th);
      const sine=Math.sin(p.elevation*Math.PI/180);
      const wpp=CAMERA_LIMITS.frustumHeight/(rect.height*p.zoom);
      const u=cs*(wx-p.x)-sn*(wz-p.z);
      const vv=(-sn*(wx-p.x)-cs*(wz-p.z))*sine;
      const px={x:rect.width/2+u/wpp,y:rect.height/2-vv/wpp};
      const back=groundAtScreen(p,px,{width:rect.width,height:rect.height});
      if(Math.hypot(back.x-wx,back.z-wz)>1e-6)
        throw Error("Capture projection inverse diverged from camera math at "+JSON.stringify(cell));
      if(px.x<0||px.y<0||px.x>rect.width||px.y>rect.height)
        throw Error("Capture target cell projects outside the canvas: "+JSON.stringify({cell,px,rect}));
      return {x:rect.left+px.x,y:rect.top+px.y};
    };
    const credits=async()=>Number((await page.locator('.resources-strip button[title="Credits"] strong').innerText()).replace(/[^0-9.-]/g,""));
    const waitCredits=async(expected,label)=>{
      try{await page.waitForFunction(e=>{
        const el=document.querySelector('.resources-strip button[title="Credits"] strong');
        return !!el&&Number(el.innerText.replace(/[^0-9.-]/g,""))===e;
      },expected,{timeout:5000,polling:50});}
      catch{throw Error(label+": credits strip never reached "+expected+" (now "+await credits()+")");}
      return expected;
    };
    const toastText=()=>page.locator(".toast span").innerText();
    await page.getByRole("button",{name:"Recenter"}).click();
    await waitForStamp(()=>{const c=document.querySelector(".world-canvas");
      return !!c&&Number(c.dataset.cameraX)===0&&Number(c.dataset.cameraZ)===0;},
      null,"Recenter did not reset the camera target");
    await page.locator('[data-tool="build"]').click();
    await page.keyboard.press("r"); // one quarter turn: bay SOUTH -> EAST
    await page.waitForFunction(()=>document.querySelector('[data-testid="bay-facing"]')?.textContent==="EAST",
      null,{timeout:5000,polling:50});
    const dims=await page.locator('[data-testid="footprint-dims"]').innerText();
    if(dims!=="1×1")throw Error("Rotated salvager footprint dims wrong: "+dims);
    // 1) Occupied site: exact rejection, no spend.
    const bankBefore=await credits();
    const pOcc=await cellPixel(occupied);
    await page.mouse.click(pOcc.x,pOcc.y);
    await waitForStamp(()=>document.body.dataset.lastSiteCode==="COLLISION",
      null,"Occupied-site tap never stamped COLLISION");
    const rejectTrace=await bodyTrace();
    if(rejectTrace.lastSiteOk!=="false"||rejectTrace.lastSiteReason!=="A machine occupies this site")
      throw Error("Occupied-site verdict wrong: "+JSON.stringify(rejectTrace));
    if(await toastText()!=="A machine occupies this site")
      throw Error("Occupied-site toast did not show the exact validator reason");
    const bankAfterReject=await waitCredits(bankBefore,"Rejected selection deducted bank");
    await page.screenshot({path:resolve(OUT,"desktop-construction-reject.png"),fullPage:false,animations:"disabled"});
    // 2) Legal surveyed pad: builds with exactly one blueprint charge.
    const cost=BLUEPRINTS.salvager.cost;
    const pOk=await cellPixel(legal);
    await page.mouse.click(pOk.x,pOk.y);
    await waitForStamp(()=>document.body.dataset.lastSiteOk==="true",
      null,"Legal-site tap never stamped OK");
    if(await toastText()!=="Construction underway — "+BLUEPRINTS.salvager.name)
      throw Error("Build toast wrong: "+await toastText());
    const bankAfterBuild=await waitCredits(bankBefore-cost.credits,"Build did not charge exactly once");
    await page.locator('[data-testid="cancel-construction"]').waitFor({state:"visible",timeout:5000});
    await page.screenshot({path:resolve(OUT,"desktop-construction-assembly.png"),fullPage:false,animations:"disabled"});
    // 3) Cancel mid-assembly: full refund back to the exact pre-build bank.
    await page.locator('[data-testid="cancel-construction"]').click();
    await page.waitForFunction(()=>document.querySelector(".toast span")?.textContent==="Construction canceled — materials refunded",
      null,{timeout:5000,polling:50});
    const bankAfterCancel=await waitCredits(bankBefore,"Cancel did not refund in full");
    await page.screenshot({path:resolve(OUT,"desktop-construction-refund.png"),fullPage:false,animations:"disabled"});
    constructionProof={occupiedCell:occupied,legalCell:legal,buildRot:1,
      rejectCode:"COLLISION",rejectReason:"A machine occupies this site",
      bankBefore,bankAfterReject,bankAfterBuild,bankAfterCancel,buildCreditsCost:cost.credits,
      screenshots:["desktop-construction-reject.png","desktop-construction-assembly.png","desktop-construction-refund.png"],
      expected:"occupied site rejected with exact reason and zero spend; legal pad charges once; cancel refunds in full"};
  }

  report.views.push({name:v.name,viewport:v.viewport,...actual,pageErrors:errs,failedRequests:failed,screenshot:filename,gripProof,constructionProof});
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
