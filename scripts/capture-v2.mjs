// G0/G1 production-preview visual smoke: one Chromium instance, sequential contexts.
// This does not certify visual beauty or a physical phone; the sponsor still reviews screenshots.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS,normalizeCamera,groundAtScreen} from "../src/camera.js";
import {createGame,checkSite} from "../src/simulation.js";
import {BLUEPRINTS,CELL,WORLD_SIZE} from "../src/content.js";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"artifacts/v2-preview");
const HOST="http://127.0.0.1:4173/rustwake/";
const report={version:2,build:"production-preview",source_sha:process.env.GITHUB_SHA||"local",started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],limitations:["One headless Chromium/SwiftShader run; phone view is emulated","Cannot certify README art parity, genuine touch latency or player enjoyment","CAM-01 gesture matrix runs on the desktop viewport; phone/landscape keep zoom-button + stamp checks"]};
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

    // ---- CAM-01 (#337) 360-degree pointer-grip regression matrix ----
    // Real DOM pointer gestures against the PRODUCTION build. Every pose is
    // read back from the canvas dataset, which world.applyCamera stamps
    // synchronously from the SAME THREE camera used for rendering/raycasting.
    // Tolerance: <= 1 CSS px, computed with the exact inverse ground projection.
    const vp=v.viewport;
    const rad=d=>d*Math.PI/180;
    const kOf=(box,zoom)=>CAMERA_LIMITS.frustumHeight/(box.height*zoom);
    const errPx=(cam,expected,pixel,box)=>{
      const c=normalizeCamera(cam),a=groundAtScreen(c,pixel,box);
      const gx=a.x-expected.x,gz=a.z-expected.z;
      const cs=Math.cos(rad(c.yaw)),sn=Math.sin(rad(c.yaw));
      const u=cs*gx-sn*gz,vv=-Math.sin(rad(c.elevation))*(sn*gx+cs*gz);
      return Math.hypot(u,vv)/kOf(box,c.zoom);
    };
    const screenAtGround=(cam,g,box)=>{
      const c=normalizeCamera(cam),k=kOf(box,c.zoom);
      const cs=Math.cos(rad(c.yaw)),sn=Math.sin(rad(c.yaw));
      const gx=g.x-c.x,gz=g.z-c.z;
      const u=cs*gx-sn*gz,vv=-Math.sin(rad(c.elevation))*(sn*gx+cs*gz);
      return {x:box.width/2+u/k,y:box.height/2-vv/k};
    };
    // Negative controls: the two documented legacy bugs (delta-only pan without
    // 1/sin(elevation); wheel zoom pivoting about screen center).
    const legacyDeltaPan=(cam,p0,p1,box)=>{
      const c=normalizeCamera(cam),k=kOf(box,c.zoom);
      const u=(p1.x-p0.x)*k,vv=(p0.y-p1.y)*k;
      const cs=Math.cos(rad(c.yaw)),sn=Math.sin(rad(c.yaw));
      return normalizeCamera({...c,x:c.x-(cs*u-sn*vv),z:c.z-(-sn*u-cs*vv)});
    };
    const legacyCenterZoom=(cam,nextZoom)=>normalizeCamera({...normalizeCamera(cam),zoom:nextZoom});
    const matrix={toleranceCssPx:1,viewport:vp,
      method:"real DOM pointer/wheel gestures on production preview; pose read from canvas dataset stamped synchronously by world.applyCamera (the rendered THREE camera)",
      poses:[],negativeCases:[],raycastPick:null,maxGripErrorCssPx:0,dragCases:0,wheelCases:0};
    const noteErr=e=>{matrix.maxGripErrorCssPx=Math.max(matrix.maxGripErrorCssPx,e);};
    const assertEnvelope=(cam,label)=>{
      if(Math.abs(cam.x)>=CAMERA_LIMITS.panExtent||Math.abs(cam.z)>=CAMERA_LIMITS.panExtent)
        throw Error("CAM_MATRIX_ENVELOPE: "+label+" hit pan clamp x="+cam.x+" z="+cam.z+" (case must measure grip, not clamping)");
    };
    const home=async()=>{
      await page.keyboard.press("Home");
      await waitForStamp(()=>{const c=document.querySelector(".world-canvas");
        return !!c&&Number(c.dataset.cameraYaw)===45&&Number(c.dataset.cameraZoom)===1.15;},
        null,"CAM_MATRIX Home recenter did not restore yaw45/zoom1.15");
    };
    // Right-drag orbit: yaw -= dx*.42, elevation += dy*.23 per CSS px.
    // Pitch requests overshoot the 20/80 bounds so the clamp lands EXACTLY.
    const orbitTo=async(yawTarget,elevRequest)=>{
      const cur=await pose();
      const dYaw=((yawTarget-cur.yaw+540)%360)-180;
      const dx=-dYaw/.42,dy=(elevRequest-cur.elevation)/.23;
      if(Math.hypot(dx,dy)<7)return;
      const s={x:vp.width/2,y:vp.height/2};
      await page.mouse.move(s.x,s.y);await page.mouse.down({button:"right"});
      await page.mouse.move(s.x+dx,s.y+dy,{steps:Math.max(2,Math.ceil(Math.hypot(dx,dy)/10))});
      await page.mouse.up({button:"right"});
      await waitForStamp(p=>{const c=document.querySelector(".world-canvas");
        return !!c&&(Number(c.dataset.cameraYaw)!==p.yaw||Number(c.dataset.cameraElevation)!==p.elev);},
        {yaw:cur.yaw,elev:cur.elevation},"CAM_MATRIX orbit never applied");
    };
    // Wheel about screen center changes zoom with ZERO target shift.
    const wheelTo=async(targetZoom,requestZoom)=>{
      const cur=await pose();
      await page.mouse.move(vp.width/2,vp.height/2);
      await page.mouse.wheel(0,-Math.log(requestZoom/cur.zoom)/.0015);
      await waitForStamp(p=>{const c=document.querySelector(".world-canvas");
        return !!c&&Math.abs(Number(c.dataset.cameraZoom)-p)<1e-6;},
        targetZoom,"CAM_MATRIX wheel never reached zoom "+targetZoom);
    };
    const dragGrip=async(start,d,label)=>{
      const before=await pose();
      const end={x:start.x+(start.x>vp.width/2?-d:d),y:start.y+(start.y>vp.height/2?-d:d)};
      const anchor=groundAtScreen(before,start,vp);
      await page.mouse.move(start.x,start.y);await page.mouse.down();
      await page.mouse.move(end.x,end.y,{steps:Math.max(2,Math.ceil(d/8))});
      await page.mouse.up();
      await waitForStamp(p=>{const c=document.querySelector(".world-canvas");
        return !!c&&(Number(c.dataset.cameraX)!==p.x||Number(c.dataset.cameraZ)!==p.z);},
        {x:before.x,z:before.z},"CAM_MATRIX drag never applied: "+label);
      const after=await pose();
      assertEnvelope(after,label);
      const errorCssPx=errPx(after,anchor,end,vp);
      noteErr(errorCssPx);matrix.dragCases++;
      if(errorCssPx>1)throw Error("CAM_MATRIX_GRIP_DRIFT "+label+": "+errorCssPx+" CSS px > 1; before="+JSON.stringify(before)+" after="+JSON.stringify(after)+" start="+JSON.stringify(start)+" end="+JSON.stringify(end));
      return {label,start,end,poseBefore:before,poseAfter:after,anchorWorld:anchor,afterWorld:groundAtScreen(after,end,vp),errorCssPx};
    };
    const wheelGrip=async(pixel,ratio,label)=>{
      const before=await pose();
      const anchor=groundAtScreen(before,pixel,vp);
      await page.mouse.move(pixel.x,pixel.y);
      await page.mouse.wheel(0,-Math.log(ratio)/.0015);
      await waitForStamp(p=>{const c=document.querySelector(".world-canvas");
        return !!c&&Number(c.dataset.cameraZoom)!==p;},before.zoom,"CAM_MATRIX wheel tick never applied: "+label);
      const after=await pose();
      assertEnvelope(after,label);
      const errorCssPx=errPx(after,anchor,pixel,vp);
      noteErr(errorCssPx);matrix.wheelCases++;
      if(errorCssPx>1)throw Error("CAM_MATRIX_WHEEL_DRIFT "+label+": "+errorCssPx+" CSS px > 1; before="+JSON.stringify(before)+" after="+JSON.stringify(after)+" pixel="+JSON.stringify(pixel));
      return {label,pixel,ratio,poseBefore:before,poseAfter:after,anchorWorld:anchor,afterWorld:groundAtScreen(after,pixel,vp),errorCssPx};
    };
    const matrixPoses=[
      {label:"q1-minpitch-minzoom",yaw:0,elev:20,elevRequest:15,zoom:.2,zoomRequest:.1,shot:true},
      {label:"q2-maxpitch-maxzoom",yaw:90,elev:80,elevRequest:85,zoom:12,zoomRequest:20,shot:true},
      {label:"q3-minpitch-maxzoom",yaw:180,elev:20,elevRequest:15,zoom:12,zoomRequest:20},
      {label:"q4-maxpitch-minzoom",yaw:270,elev:80,elevRequest:85,zoom:.2,zoomRequest:.1,shot:true},
      {label:"q3-diagonal-mid",yaw:225,elev:35.264,elevRequest:35.264,zoom:1.37,zoomRequest:1.37,raycast:true},
      {label:"q2-oblique-negative",yaw:115,elev:20,elevRequest:15,zoom:1.37,zoomRequest:1.37,negative:true},
    ];
    for(const p of matrixPoses){
      await home();
      await orbitTo(p.yaw,p.elevRequest);
      await wheelTo(p.zoom,p.zoomRequest);
      const achieved=await pose();
      const yawDiff=Math.abs(((achieved.yaw-p.yaw+540)%360)-180);
      if(yawDiff>.5)throw Error("CAM_MATRIX yaw not reached: want "+p.yaw+" got "+achieved.yaw);
      if(Math.abs(achieved.elevation-p.elev)>.5)throw Error("CAM_MATRIX pitch not reached: want "+p.elev+" got "+achieved.elevation);
      if(Math.abs(achieved.zoom-p.zoom)>1e-6)throw Error("CAM_MATRIX zoom not reached: want "+p.zoom+" got "+achieved.zoom);
      const entry={label:p.label,requested:{yaw:p.yaw,elevation:p.elev,zoom:p.zoom},achieved,drags:[],wheel:null,screenshot:null};
      // Rendered-world raycast cross-check: drag the depot's math-projected
      // pixel to screen center, then TAP it. onTap uses the live THREE
      // raycaster (world.screenToCell), so the inspector panel proves the
      // rendered camera agrees with the pure projection math.
      if(p.raycast){
        const depotWorld={x:(13-WORLD_SIZE/2+.5)*CELL,z:(9-WORLD_SIZE/2+.5)*CELL};
        const poseNow=await pose();
        const raw=screenAtGround(poseNow,depotWorld,vp);
        const depotPixel={x:Math.round(raw.x),y:Math.round(raw.y)};
        if(depotPixel.x<250||depotPixel.x>1100||depotPixel.y<120||depotPixel.y>740)
          throw Error("CAM_MATRIX raycast depot pixel outside safe canvas region: "+JSON.stringify(depotPixel));
        const center={x:vp.width/2,y:vp.height/2};
        const anchor=groundAtScreen(poseNow,depotPixel,vp);
        await page.mouse.move(depotPixel.x,depotPixel.y);await page.mouse.down();
        await page.mouse.move(center.x,center.y,{steps:12});await page.mouse.up();
        await waitForStamp(q=>{const c=document.querySelector(".world-canvas");
          return !!c&&(Number(c.dataset.cameraX)!==q.x||Number(c.dataset.cameraZ)!==q.z);},
          {x:poseNow.x,z:poseNow.z},"CAM_MATRIX raycast drag never applied");
        const afterDrag=await pose();
        const dragErr=errPx(afterDrag,anchor,center,vp);
        noteErr(dragErr);matrix.dragCases++;
        if(dragErr>1)throw Error("CAM_MATRIX raycast drag drift "+dragErr+" CSS px > 1");
        await page.mouse.click(center.x,center.y);
        await page.waitForFunction(()=>{
          const el=document.querySelector(".panel-host .eyebrow");
          return !!el&&/^SITE /.test(el.textContent||"");},null,{timeout:8000});
        const eyebrow=await page.locator(".panel-host .eyebrow").first().textContent();
        const below=groundAtScreen(afterDrag,center,vp);
        const mathCell={x:Math.floor(below.x/CELL+WORLD_SIZE/2),z:Math.floor(below.z/CELL+WORLD_SIZE/2)};
        if(!/^SITE 13\.9\b/.test(eyebrow||""))
          throw Error("CAM_MATRIX_RAYCAST_MISMATCH: tapped math-projected depot center, inspector shows '"+eyebrow+"' (expected SITE 13.9); pose="+JSON.stringify(afterDrag));
        if(mathCell.x!==13||mathCell.z!==9)
          throw Error("CAM_MATRIX_RAYCAST_MATH: math cell "+JSON.stringify(mathCell)+" != depot 13,9");
        matrix.raycastPick={depotCell:{x:13,z:9},depotWorld,depotPixel,dragEnd:center,
          poseBefore:poseNow,poseAfter:afterDrag,dragErrorCssPx:dragErr,
          mathCell,inspectorEyebrow:eyebrow,
          proof:"live THREE raycaster tap landed on the math-predicted depot cell at a non-default yaw quadrant"};
        await page.keyboard.press("Escape");
        await page.waitForFunction(()=>!document.querySelector(".panel-host"),null,{timeout:8000});
      }
      const d=achieved.zoom<=.2?12:achieved.zoom>=12?120:60;
      // Near-edge targets chosen inside the HUD-free canvas region.
      entry.drags.push(await dragGrip({x:210,y:450},d,p.label+"-drag-left-edge"));
      entry.drags.push(await dragGrip({x:720,y:760},d,p.label+"-drag-bottom-edge"));
      const ratio=achieved.zoom<=.2?1.1:achieved.zoom>=12?1/1.55:1.55;
      entry.wheel=await wheelGrip({x:1140,y:450},ratio,p.label+"-wheel-right-edge");
      if(p.negative){
        const d0=entry.drags[0];
        const legacyCam=legacyDeltaPan(d0.poseBefore,d0.start,d0.end,vp);
        const legacyErr=errPx(legacyCam,d0.anchorWorld,d0.end,vp);
        const w0=entry.wheel;
        const legacyZErr=errPx(legacyCenterZoom(w0.poseBefore,w0.poseAfter.zoom),w0.anchorWorld,w0.pixel,vp);
        if(!(legacyErr>1)||!(legacyZErr>1))
          throw Error("CAM_MATRIX negative control lost sensitivity: deltaPan="+legacyErr+"px centerZoom="+legacyZErr+"px");
        matrix.negativeCases.push({pose:achieved,
          deltaPan:{input:{start:d0.start,end:d0.end,poseBefore:d0.poseBefore},
            expected:"legacy delta-only pan MUST exceed 1 CSS px (matrix sensitivity)",
            actualCssPx:legacyErr,legacyCameraTarget:{x:legacyCam.x,z:legacyCam.z},
            approvedActualCssPx:d0.errorCssPx},
          centerZoom:{input:{pixel:w0.pixel,zoomBefore:w0.poseBefore.zoom,zoomAfter:w0.poseAfter.zoom},
            expected:"legacy center-pivot zoom MUST exceed 1 CSS px",
            actualCssPx:legacyZErr,approvedActualCssPx:w0.errorCssPx}});
      }
      if(p.shot){
        const filename="camera-matrix-"+p.label+".png";
        await page.screenshot({path:resolve(OUT,filename),fullPage:false,animations:"disabled"});
        entry.screenshot=filename;
      }
      matrix.poses.push(entry);
    }
    report.cameraMatrix=matrix;
    await writeFile(resolve(OUT,"camera-gesture-trace.json"),
      JSON.stringify({issue:337,source_sha:report.source_sha,generated:new Date().toISOString(),...matrix},null,2)+"\n");
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
