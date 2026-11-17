// UX-05 (#363) fleet logistics panel evidence — production build + preview.
// NEW script; leased capture scripts untouched. Reuses the capture-dock.mjs
// harness (bounded waitForFunction, synchronous camera stamps, seeded
// authoritative saves, one headless Chromium/SwiftShader browser).
// Proves at 1440x900 desktop and 390x844 phone (+ adverse desktop and empty
// phone views): panel values EQUAL the sim's own freight fields (fleetProbe
// dataset stamp of the exact rendered snapshot), reserved/onboard conservation
// across a real cancelFreight click (atomic cancelProbe stamp taken inside the
// transaction, because dispatch may re-assign on the next frame), progress/ETA
// derivation, bay queue order, follow-camera pin via public setView/applyCamera
// only (#307 pose preserved), truck tap inspect without mis-triggering road
// construction (+ deterministic negative tap), persisted prefs, honest
// NO_ROUTE + unaffordable + empty + locked-build states, sheet/dock geometry,
// >=44px taps, no document scroll, ONE WebGL context, motion, and non-blank
// screenshots (pixel-sample decoded in a 2D canvas).
// Numeric/runtime evidence only — verdict ceiling PASS_NUMERIC_ONLY; the
// sponsor still owes G1 visual acceptance (#276) on the deployed build.
import {chromium} from "playwright-core";
import {groundAtScreen,CAMERA_LIMITS} from "../src/camera.js";
import {createGame} from "../src/simulation.js";
import {CELL,WORLD_SIZE,SAVE_KEY,RESOURCE_BY_ID} from "../src/content.js";
import {projectGround} from "../src/inspector.js";
import {sheetMaxHeight} from "../src/dock.js";
import {fleetFocusPixel,truckGround,TRUCK_TAP_RADIUS_CELLS,FLEET_SETTINGS_KEY} from "../src/fleet.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve} from "node:path";
const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/363-ux-05");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4183,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const report={version:1,issue:363,task:"UX-05 fleet logistics panel with real truck and cargo states",build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:["One headless Chromium/SwiftShader run; phone view is emulated (390x844 dpr2 touch), not a physical device",
  "Numeric layout/value proofs do not certify visual beauty — sponsor G1 review required (#276)",
  "Local preview only — the live hosted receipt is produced at release by the release engineer",
  "Blocked/error freight rows are transient in the live sim (the next tick returns the load); those states are proven by tests/fleet.test.mjs + tests/fleetWiring.test.mjs against the real transactions, and the persistent NO_ROUTE/unaffordable/empty/locked states are captured here"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// ---- Deterministic seeds (authoritative sim shapes, never a UI ledger) ----
const freshSave=()=>createGame();
const noRouteSave=()=>{
 const g=createGame();
 // Disconnect every source from every destination while trucks keep road
 // frontage (depot patch within 3 cells of both spawns): waiting loads exist,
 // no connected asphalt path reaches them -> persistent NO_ROUTE. The bank
 // cannot afford a segment (3 AG + 4 CR). Trucks stay idle and STATIONARY.
 g.roads=["12,9","13,9","14,9","13,8","13,10"];
 g.buildings.find(b=>b.id===1).inventory={scrap:12};
 g.bank={...g.bank,stone:1,credits:2};
 return g;
};
const emptyFleetSave=()=>{const g=createGame();g.vehicles=[];return g;};
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
// Unit labels resolved in NODE scope and passed INTO browser predicates as
// data — Playwright serializes page functions, so Node closures (unit,
// RESOURCE_BY_ID) do not exist in the page. See PR #538 harness-bug note.
const UNITS=Object.fromEntries(Object.keys(RESOURCE_BY_ID).map(id=>[id,RESOURCE_BY_ID[id]?.unit||id]));

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!open)throw Error("Production preview did not become available on "+PORT);
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 // Non-blank proof: decode each PNG in a 2D canvas and count distinct colors.
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
 const probe=page=>page.evaluate(()=>JSON.parse(document.body.dataset.fleetProbe||"null"));
 const box=async(page,sel)=>{const b=await page.locator(sel).boundingBox();if(!b)throw Error(sel+" has no bounding box");return b;};
 const intersects=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 const noDocScroll=async(page)=>{
  const s=await page.evaluate(()=>({h:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),w:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),ih:innerHeight,iw:innerWidth}));
  if(s.h>s.ih+2||s.w>s.iw+2)throw Error("document scrolls: "+JSON.stringify(s));
  return false;
 };
 const tapAudit=async(page,label)=>{
  const rects=await page.evaluate(()=>{
   const sels=".tool-dock__item,.sheet-toggle,.sheet-close,.rail-controls button,.resources-strip button,.toast button,.sheet-body button,.focus-button";
   return [...document.querySelectorAll(sels)].map(el=>{const r=el.getBoundingClientRect();
    return {testid:el.getAttribute("data-testid"),tool:el.getAttribute("data-tool"),width:r.width,height:r.height,visible:r.width>0&&r.height>0&&el.offsetParent!==null};})
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
 const openFleet=async(page)=>{
  await page.locator('[data-tool="fleet"]').click();
  await page.locator('[data-testid="sheet-title"]').waitFor({state:"visible",timeout:5000});
  await page.waitForFunction(()=>!!document.body.dataset.fleetProbe,null,{timeout:8000});
  await page.waitForTimeout(400);
  const title=await page.locator('[data-testid="sheet-title"]').innerText();
  if(title.toLowerCase()!=="fleet logistics")throw Error("Sheet title wrong: "+title);
  return title;
 };
 const shot=async(view,page,label)=>{
  const f=`${view.name}-${label}.png`;
  await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});
  view.screenshots.push(f);view.proof.nonBlank=await nonBlank(f);
  return f;
 };
 const geometry=async(view,page)=>{
  const dock=await box(page,".tool-dock"),panel=await box(page,".panel-host");
  if(intersects(panel,dock))throw Error(view.name+" fleet sheet overlaps the dock: "+JSON.stringify({panel,dock}));
  if(panel.y+panel.height>dock.y+1)throw Error(view.name+" sheet bottom must sit above the dock top");
  const vp=view.viewport,maxH=sheetMaxHeight(vp);
  const body=await page.locator(".sheet-body .glass-panel").evaluate(el=>({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,overflowY:getComputedStyle(el).overflowY}));
  if(body.clientHeight>maxH+1)throw Error(view.name+" sheet body exceeds sheetMaxHeight: "+JSON.stringify({body,maxH}));
  return {panel,dock,sheetMaxHeight:maxH,sheetBody:body,tapTargets:await tapAudit(page,"fleet-open"),documentScroll:await noDocScroll(page)};
 };
 // Atomic panel-vs-sim equality: expected values derived from the fleetProbe
 // stamp of the EXACT snapshot the panel rendered; poll until a consistent
 // tick, then record expected/actual pairs.
 const panelEquality=async(page,focusId,timeout=10000,requireDetail=false)=>{
  const res=await page.waitForFunction(({fid,units,needDetail})=>{
   // unit() must be defined INSIDE the page: this predicate is serialized
   // and runs in the browser, where Node-scope helpers do not exist.
   const unit=id=>units[id]||id;
   const p=JSON.parse(document.body.dataset.fleetProbe||"null");if(!p)return null;
   const txt=t=>document.querySelector('[data-testid="'+t+'"]')?.textContent?.trim()??null;
   const active=p.vehicles.filter(v=>v.job).length;
   const exp={active:active+"/"+p.vehicles.length,reserved:String(p.reserved),onboard:String(p.onboard)};
   const act={active:txt("fleet-active"),reserved:txt("fleet-reserved"),onboard:txt("fleet-onboard")};
   if(JSON.stringify(exp)!==JSON.stringify(act))return null;
   const out={totals:{expected:exp,actual:act}};
   const v=p.vehicles.find(x=>x.id===fid);
   const detail=document.querySelector('[data-testid="fleet-detail"]');
   if(v&&v.job&&detail&&Number(detail.dataset.truck)===fid){
    const j=v.job,speed=(v.speed||2.1)*(p.fleetResearch?1.18:1);
    const rem=(j.routeLen-1)-(j.segment+j.progress);
    const expD={reserved:(j.phase==="toSource"?j.amount:0)+" "+unit(j.resource),
     onboard:(v.cargo?v.cargo.amount:0)+" "+unit(j.resource),
     progress:Math.round(Math.min(1,(j.segment+j.progress)/(j.routeLen-1))*100)+"%",
     eta:(rem/speed).toFixed(1)+"s"};
    const actD={reserved:txt("fleet-reserved-load"),onboard:txt("fleet-onboard-load"),progress:txt("fleet-progress"),eta:txt("fleet-eta")};
    if(JSON.stringify(expD)!==JSON.stringify(actD))return null;
    out.detail={expected:expD,actual:actD,job:{phase:j.phase,amount:j.amount,resource:j.resource,segment:j.segment,progress:j.progress,routeLen:j.routeLen},speedFormula:"(speed||2.1)*(fleetResearch?1.18:1)"};
   }
   // When a detail is being sought, never succeed on a totals-only tick.
   if(needDetail&&!out.detail)return null;
   return out;
  },{fid:focusId,units:UNITS,needDetail:requireDetail},{timeout,polling:60});
  return res.jsonValue();
 };
 // Focus a hauling truck with a long remaining route and capture a stable
 // detail equality + bay queue + state chip before it can deliver.
 const haulingDetail=async(page)=>{
  // Every attempt's outcome is recorded (never silently swallowed) so a
  // future failure is diagnosable from report.json alone.
  const attempts=[];
  for(let attempt=0;attempt<6;attempt++){
   await page.waitForFunction(()=>!!document.querySelector('.fleet-row[data-state="hauling"]'),null,{timeout:45000,polling:150});
   const id=await page.evaluate(()=>{
    const p=JSON.parse(document.body.dataset.fleetProbe||"null");if(!p)return null;
    let best=null,bestRem=-1;
    for(const v of p.vehicles)if(v.job&&v.job.phase==="toDest"&&v.cargo){
     const rem=(v.job.routeLen-1)-(v.job.segment+v.job.progress);
     if(rem>bestRem){bestRem=rem;best=v.id;}}
    return best;
   });
   if(id==null){attempts.push({attempt,skip:"no toDest carrier in fleetProbe"});continue;}
   await page.locator('[data-testid="truck-'+id+'"]').click();
   try{
    const eq=await panelEquality(page,id,4000,true);
    if(!eq.detail){attempts.push({attempt,id,skip:"equality resolved without detail"});continue;}
    const chip=await page.locator('[data-testid="fleet-state"]').innerText();
    if(!chip.includes("DELIVERING")){attempts.push({attempt,id,skip:"state chip not DELIVERING: "+chip});continue;}
    const queue=await page.evaluate(()=>{
     const q=document.querySelector('[data-testid="fleet-bay-queue"]');if(!q)return null;
     return [...q.querySelectorAll(".fleet-queue__row")].map(r=>({vehicle:Number(r.dataset.vehicle),text:r.querySelector("em")?.textContent||""}));
    });
    if(!queue){attempts.push({attempt,id,skip:"bay queue element absent"});continue;}
    const cells=queue.map(q=>q.text==="AT BAY"?0:Number(q.text.replace(" cells out","")));
    for(let i=1;i<cells.length;i++)if(cells[i]<cells[i-1])throw Error("bay queue not ordered by remaining cells: "+JSON.stringify(queue));
    attempts.push({attempt,id,ok:true});
    return {id,eq,chip,queue:{rows:queue,ordered:true},attempts};
   }catch(e){
    if(String(e).includes("bay queue not ordered"))throw e;
    attempts.push({attempt,id,error:String(e&&e.message||e).slice(0,400)});
   }
  }
  throw Error("could not capture a stable hauling detail with bay queue; attempts="+JSON.stringify(attempts));
 };
 // Tap a ground cell through the REAL pointer path, zooming out if the pixel
 // is off-canvas or covered by UI (capture-dock.mjs precedent).
 const tapGroundCell=async(page,cell)=>{
  for(let i=0;i<5;i++){
   const p=await pose(page),rct=await canvasRect(page);
   const ground={x:(cell.x-WORLD_SIZE/2+.5)*CELL,z:(cell.z-WORLD_SIZE/2+.5)*CELL};
   const px=projectGround(p,ground,{width:rct.width,height:rct.height});
   const inside=px.x>30&&px.x<rct.width-30&&px.y>90&&px.y<rct.height-130;
   const hit=inside?await page.evaluate(([x,y])=>{
    const el=document.elementFromPoint(x,y);return el?.classList.contains("world-canvas")?"canvas":(el?.className||el?.tagName||"none");
   },[rct.left+px.x,rct.top+px.y]):"outside";
   if(hit==="canvas"){
    await page.mouse.click(rct.left+px.x,rct.top+px.y);
    await page.waitForTimeout(300);
    return {cell,pixel:px,zoom:p.zoom};
   }
   await page.getByRole("button",{name:"Zoom out"}).click();
   await page.waitForFunction(z=>Number(document.querySelector(".world-canvas").dataset.cameraZoom)<z,p.zoom,{timeout:8000});
  }
  throw Error("could not bring cell "+JSON.stringify(cell)+" into a tappable canvas region");
 };

 // ================= VIEW 1: desktop 1440x900 — live fleet =================
 {
  const v={name:"desktop",viewport:{width:1440,height:900},dpr:1,mobile:false,touch:false};
  const view={...v,screenshots:[],proof:{}};
  const {ctx,page,errs,failed}=await newPage(v,freshSave());
  const stamps=await page.locator(".world-canvas").evaluate(c=>({...c.dataset}));
  if(stamps.world3d!=="ready"||Number(stamps.cameraYaw)!==45||Math.abs(Number(stamps.cameraElevation)-35.264)>1e-6)
   throw Error("Isometric load stamps wrong: "+JSON.stringify(stamps));
  view.proof.loadStamps={world3d:stamps.world3d,yaw:Number(stamps.cameraYaw),elevation:Number(stamps.cameraElevation),zoom:Number(stamps.cameraZoom)};
  await openFleet(page);
  await page.locator('[data-testid="fleet-rows"]').waitFor({state:"visible",timeout:5000});
  view.proof.geometry=await geometry(view,page);
  await shot(view,page,"fleet-panel");
  // REAL hauling truck: validated toDest job + onboard cargo, stable detail.
  const haul=await haulingDetail(page);
  view.proof.equality=haul.eq;
  view.proof.haulingChip=haul.chip;
  view.proof.bayQueue=haul.queue;
  view.proof.haulingAttempts=haul.attempts;
  await shot(view,page,"fleet-hauling-detail");
  // Follow camera: pose preserved, truck pinned to the clear-zone focus pixel.
  const before=await pose(page);
  await page.locator('[data-testid="fleet-follow"]').click();
  await page.waitForFunction(()=>!!document.body.dataset.followProbe,null,{timeout:5000});
  await page.waitForTimeout(700);
  const follow=await page.evaluate(()=>({cam:{yaw:Number(document.querySelector(".world-canvas").dataset.cameraYaw),elevation:Number(document.querySelector(".world-canvas").dataset.cameraElevation),zoom:Number(document.querySelector(".world-canvas").dataset.cameraZoom),x:Number(document.querySelector(".world-canvas").dataset.cameraX),z:Number(document.querySelector(".world-canvas").dataset.cameraZ)},truck:JSON.parse(document.body.dataset.followProbe)}));
  if(follow.cam.yaw!==45||Math.abs(follow.cam.elevation-35.264)>1e-6||follow.cam.zoom!==before.zoom)
   throw Error("follow camera changed the isometric pose: "+JSON.stringify({before,follow}));
  const rect=await canvasRect(page);
  const px=projectGround(follow.cam,truckGround(follow.truck),{width:rect.width,height:rect.height});
  const focus=fleetFocusPixel({width:rect.width,height:rect.height});
  const pinError=Math.hypot(px.x-focus.x,px.y-focus.y);
  if(pinError>2)throw Error("follow pin error too large: "+pinError+"px");
  if(follow.cam.x===before.x&&follow.cam.z===before.z)throw Error("follow camera target did not move");
  view.proof.follow={posePreserved:true,cameraTargetMoved:true,truckId:follow.truck.id,focusPixel:focus,truckPixel:px,pinErrorPx:pinError,viewport:{width:rect.width,height:rect.height}};
  await shot(view,page,"fleet-follow");
  await page.locator('[data-testid="fleet-follow"]').click(); // stop following
  if(await page.locator('[data-testid="fleet-follow"]').getAttribute("aria-pressed")!=="false")throw Error("stop follow failed");
  // Cancel conservation: click the REAL cancel button; the atomic cancelProbe
  // stamp (taken inside the transaction) proves exact-once return. The sim may
  // re-dispatch the truck on the next frame — that is honest, not a defect.
  let cancel=null;
  for(let attempt=0;attempt<6&&!cancel;attempt++){
   const p0=await probe(page);
   const carrier=p0.vehicles.find(x=>x.job&&x.job.phase==="toDest"&&x.cargo)||p0.vehicles.find(x=>x.job);
   if(!carrier){await page.waitForTimeout(500);continue;}
   await page.locator('[data-testid="truck-'+carrier.id+'"]').click();
   await page.waitForTimeout(250);
   if(await page.locator('[data-testid="fleet-cancel"]').isDisabled()){continue;}
   await page.locator('[data-testid="fleet-cancel"]').click();
   const res=await page.waitForFunction(id=>{
    const c=JSON.parse(document.body.dataset.cancelProbe||"null");return c&&c.id===id?c:null;
   },carrier.id,{timeout:8000});
   cancel=await res.jsonValue();
  }
  if(!cancel)throw Error("no cancel transaction captured");
  if(!cancel.ok||cancel.code!=="OK")throw Error("cancel failed: "+JSON.stringify(cancel));
  const totalsEqual=JSON.stringify(cancel.before.totals)===JSON.stringify(cancel.after.totals);
  const returnedOnce=cancel.bagAfter===cancel.bagBefore+cancel.amount;
  const ledgerDrop=cancel.phase==="toSource"
   ?(cancel.before.reserved-cancel.after.reserved===cancel.amount&&cancel.after.onboard===cancel.before.onboard)
   :(cancel.before.onboard-cancel.after.onboard===cancel.amount&&cancel.after.reserved===cancel.before.reserved);
  if(!totalsEqual||!returnedOnce||!ledgerDrop)throw Error("cancel conservation failed: "+JSON.stringify({totalsEqual,returnedOnce,ledgerDrop,cancel}));
  const rowState=await page.locator('[data-testid="truck-'+cancel.id+'"]').getAttribute("data-state");
  if(["hauling","error","blocked"].includes(rowState))throw Error("cancelled truck shown as "+rowState);
  view.proof.cancel={truckId:cancel.id,phase:cancel.phase,resource:cancel.resource,amount:cancel.amount,sourceId:cancel.sourceId,
   expected:{sourceBagDelta:cancel.amount,totalsUnchanged:true,reservedDelta:cancel.phase==="toSource"?-cancel.amount:0,onboardDelta:cancel.phase==="toDest"?-cancel.amount:0},
   actual:{sourceBagDelta:cancel.bagAfter-cancel.bagBefore,totalsUnchanged:totalsEqual,reservedDelta:cancel.after.reserved-cancel.before.reserved,onboardDelta:cancel.after.onboard-cancel.before.onboard,rowStateAfter:rowState},
   note:"Atomic in-transaction stamp; dispatch may legitimately re-assign the idle truck afterwards"};
  await shot(view,page,"fleet-after-cancel");
  // Prefs persistence across reload (own storage key).
  await page.locator('[data-testid="fleet-setting-idle"]').click();
  await page.waitForTimeout(300);
  const stored=await page.evaluate(k=>localStorage.getItem(k),FLEET_SETTINGS_KEY);
  if(JSON.parse(stored).showIdle!==false)throw Error("showIdle pref not persisted: "+stored);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  await openFleet(page);
  if(await page.locator('[data-testid="fleet-setting-idle"]').isChecked()!==false)throw Error("showIdle pref lost across reload");
  const idleRows=await page.locator('.fleet-row[data-state="idle"]').count();
  if(idleRows!==0)throw Error("showIdle=false still shows idle rows: "+idleRows);
  await page.locator('[data-testid="fleet-setting-idle"]').click(); // restore
  view.proof.prefs={key:FLEET_SETTINGS_KEY,storedAfterToggle:stored,afterReload:{showIdleChecked:false,idleRowsVisible:idleRows}};
  // Road arming regression: a tap on EMPTY ground still arms a road origin,
  // and Escape clears it (truck-tap gate must not swallow normal road taps).
  await page.locator('[data-tool="road"]').click();
  await page.waitForTimeout(300);
  const arm=await tapGroundCell(page,{x:12,z:14});
  const hint=await page.locator(".center-hint").innerText().catch(()=> "");
  if(!hint.includes("DESTINATION"))throw Error("road arming regressed on empty ground: "+hint);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  // Escape calls choose("select") (App.jsx onKey, unchanged from main): it
  // clears roadStart AND exits road mode, so the center-hint unmounts.
  // Assert the real contract: no DESTINATION hint remains, and re-entering
  // road mode shows the START hint — proving the origin was truly cleared.
  const hint2=await page.locator(".center-hint").innerText().catch(()=> "");
  if(hint2.includes("DESTINATION"))throw Error("Escape left a road origin armed: "+hint2);
  const titleAfterEsc=await page.locator('[data-testid="sheet-title"]').innerText().catch(()=> "");
  if(titleAfterEsc.toLowerCase()==="road engineer")throw Error("Escape did not exit road mode: "+titleAfterEsc);
  await page.locator('[data-tool="road"]').click();
  await page.waitForTimeout(300);
  const hint3=await page.locator(".center-hint").innerText().catch(()=> "");
  if(!hint3.includes("START"))throw Error("road origin survived Escape (START hint missing on re-entry): "+hint3);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  view.proof.roadArmingRegression={...arm,armed:true,escapeCleared:true,escapeReturnsToSelect:true,startHintOnReentry:hint3};
  // Motion + camera invariants + one WebGL context.
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
  view.proof.cameraInvariants={beforeZoom:bz.zoom,afterZoom:az.zoom,stampMatchesApplied:true,webglContextCount:contexts,world3d:"ready"};
  view.proof.documentScroll=await noDocScroll(page);
  await ctx.close();
  view.pageErrors=errs;view.failedRequests=failed;
  if(errs.length||failed.length)throw Error("desktop errors: "+JSON.stringify({errs,failed}));
  report.views.push(view);
 }

 // ================= VIEW 2: phone 390x844 — sheet + follow =================
 {
  const v={name:"phone",viewport:{width:390,height:844},dpr:2,mobile:true,touch:true};
  const view={...v,screenshots:[],proof:{}};
  const {ctx,page,errs,failed}=await newPage(v,freshSave());
  await openFleet(page);
  await page.locator('[data-testid="fleet-rows"]').waitFor({state:"visible",timeout:5000});
  await page.locator('[data-testid="fleet-rows"] .fleet-row').first().click();
  await page.locator('[data-testid="fleet-detail"]').waitFor({state:"visible",timeout:5000});
  view.proof.geometry=await geometry(view,page);
  const panel=await box(page,".panel-host");
  const rect0=await canvasRect(page);
  const focus=fleetFocusPixel({width:rect0.width,height:rect0.height});
  if(focus.y>=panel.y)throw Error("phone focus pixel must sit above the sheet: "+JSON.stringify({focus,panel}));
  view.proof.focusAboveSheet={focusPixel:focus,sheetTop:panel.y};
  await shot(view,page,"fleet-sheet");
  // Follow on phone: pinned truck stays above the sheet, pose preserved.
  const before=await pose(page);
  await page.locator('[data-testid="fleet-follow"]').click();
  await page.waitForFunction(()=>!!document.body.dataset.followProbe,null,{timeout:5000});
  await page.waitForTimeout(700);
  const follow=await page.evaluate(()=>({cam:{yaw:Number(document.querySelector(".world-canvas").dataset.cameraYaw),elevation:Number(document.querySelector(".world-canvas").dataset.cameraElevation),zoom:Number(document.querySelector(".world-canvas").dataset.cameraZoom),x:Number(document.querySelector(".world-canvas").dataset.cameraX),z:Number(document.querySelector(".world-canvas").dataset.cameraZ)},truck:JSON.parse(document.body.dataset.followProbe)}));
  if(follow.cam.yaw!==45||Math.abs(follow.cam.elevation-35.264)>1e-6||follow.cam.zoom!==before.zoom)throw Error("phone follow changed pose");
  const rect=await canvasRect(page);
  const px=projectGround(follow.cam,truckGround(follow.truck),{width:rect.width,height:rect.height});
  const pinError=Math.hypot(px.x-focus.x,px.y-focus.y);
  if(pinError>2)throw Error("phone follow pin error: "+pinError);
  if(px.y>=panel.y)throw Error("followed truck rendered under the phone sheet");
  view.proof.follow={posePreserved:true,pinErrorPx:pinError,truckPixel:px,focusPixel:focus,aboveSheet:true};
  await shot(view,page,"fleet-follow");
  await page.locator('[data-testid="fleet-follow"]').click();
  // Collapse/expand keeps camera + mounted panel (UX-07 contract).
  const poseC=await pose(page);
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(350);
  if(await page.locator('[data-testid="panel-host"]').getAttribute("data-collapsed")!=="true")throw Error("collapse failed");
  if(JSON.stringify(await pose(page))!==JSON.stringify(poseC))throw Error("collapse moved the camera");
  if(await page.locator('[data-testid="fleet-rows"]').count()!==1)throw Error("fleet panel must stay mounted collapsed");
  await page.locator('[data-testid="sheet-toggle"]').click();
  await page.waitForTimeout(300);
  view.proof.collapse={cameraUnmoved:true,panelMounted:true};
  const f1=await page.screenshot({animations:"disabled"});
  await page.waitForTimeout(1500);
  const f2=await page.screenshot({animations:"disabled"});
  if(f1.equals(f2))throw Error("phone simulation frozen");
  view.proof.motion={framesDiffer:true};
  const contexts=await page.evaluate(()=>window.__rwSmoke?.webglContexts);
  if(contexts!==1)throw Error("phone webglContextCount !== 1: "+contexts);
  view.proof.cameraInvariants={webglContextCount:contexts,world3d:"ready",yaw:45,elevation:35.264};
  view.proof.documentScroll=await noDocScroll(page);
  await ctx.close();
  view.pageErrors=errs;view.failedRequests=failed;
  if(errs.length||failed.length)throw Error("phone errors: "+JSON.stringify({errs,failed}));
  report.views.push(view);
 }

 // ====== VIEW 3: adverse desktop — NO_ROUTE + unaffordable + tap inspect ======
 {
  const v={name:"adverse-desktop",viewport:{width:1440,height:900},dpr:1,mobile:false,touch:false};
  const view={...v,screenshots:[],proof:{}};
  const {ctx,page,errs,failed}=await newPage(v,noRouteSave());
  await openFleet(page);
  await page.waitForFunction(()=>!!document.querySelector('.fleet-row[data-state="noroute"]'),null,{timeout:8000});
  await page.locator('[data-testid="truck-1"]').click();
  await page.locator('[data-testid="fleet-stuck"]').waitFor({state:"visible",timeout:5000});
  const stuck=await page.locator('[data-testid="fleet-stuck"]').innerText();
  if(!stuck.includes("NO_ROUTE"))throw Error("expected NO_ROUTE stuck reason: "+stuck);
  const unaff=await page.locator('[data-testid="fleet-unaffordable"]').innerText();
  if(!unaff.includes("3 AG + 4 CR"))throw Error("unaffordable hint wrong: "+unaff);
  if(await page.locator('[data-testid="fleet-build-locked"]').isDisabled()!==true)throw Error("build button must stay disabled");
  const lockReason=await page.locator("#fleet-build-lock-reason").innerText();
  view.proof.adverse={stuckCode:"NO_ROUTE",stuckText:stuck,unaffordableText:unaff,buildDisabled:true,lockReason};
  view.proof.geometry=await geometry(view,page);
  await shot(view,page,"fleet-noroute");
  // Truck tap: inspects the truck, NEVER arms a road origin. Trucks are
  // stationary here (no dispatch without routes) — deterministic.
  const tapTruck=async(id,tool)=>{
   const pr=await probe(page);const tv=pr.vehicles.find(x=>x.id===id);
   const p=await pose(page),rct=await canvasRect(page);
   const px=projectGround(p,truckGround(tv),{width:rct.width,height:rct.height});
   // Hit-radius proof: the tapped pixel maps back within TRUCK_TAP_RADIUS_CELLS.
   const back=groundAtScreen(p,px,{width:rct.width,height:rct.height});
   const backCell={x:back.x/CELL+WORLD_SIZE/2-.5,z:back.z/CELL+WORLD_SIZE/2-.5};
   const d=Math.hypot(backCell.x-tv.x,backCell.z-tv.z);
   if(d>TRUCK_TAP_RADIUS_CELLS)throw Error("tap point outside truck radius: "+d);
   await page.mouse.click(rct.left+px.x,rct.top+px.y);
   await page.waitForTimeout(400);
   const title=await page.locator('[data-testid="sheet-title"]').innerText();
   if(title.toLowerCase()!=="fleet logistics")throw Error(tool+" tap on truck did not open fleet: "+title);
   const detail=await page.locator('[data-testid="fleet-detail"]').getAttribute("data-truck");
   if(Number(detail)!==id)throw Error(tool+" tap focused wrong truck: "+detail);
   // choose("fleet") cleared any road origin: re-enter road mode -> START hint.
   await page.locator('[data-tool="road"]').click();
   await page.waitForTimeout(300);
   const hint=await page.locator(".center-hint").innerText().catch(()=> "");
   if(!hint.includes("START"))throw Error("truck tap left a road origin armed: "+hint);
   await page.keyboard.press("Escape");
   return {truckId:id,tapPixel:px,roundTripCellDistance:d,mode:tool,focused:true,roadArmed:false};
  };
  await page.locator('[data-tool="road"]').click();
  await page.waitForTimeout(300);
  view.proof.truckTapRoadMode=await tapTruck(1,"road");
  await page.locator('[data-tool="select"]').click();
  await page.waitForTimeout(300);
  view.proof.truckTapSelectMode=await tapTruck(2,"select");
  // Deterministic NEGATIVE case: a road cell OUTSIDE the tap radius of both
  // stationary trucks (12,9 is >=1.41 cells away) must arm a road origin.
  await page.locator('[data-tool="road"]').click();
  await page.waitForTimeout(300);
  const neg=await tapGroundCell(page,{x:12,z:9});
  const negHint=await page.locator(".center-hint").innerText().catch(()=> "");
  const negTitle=await page.locator('[data-testid="sheet-title"]').innerText();
  if(!negHint.includes("DESTINATION")||negTitle.toLowerCase()==="fleet logistics")
   throw Error("negative tap mis-fired as truck inspect: "+JSON.stringify({negHint,negTitle}));
  await page.keyboard.press("Escape");
  view.proof.negativeTap={...neg,nearestTruckDistanceCells:Math.min(Math.hypot(12-11,9-10),Math.hypot(12-11,9-11)),radius:TRUCK_TAP_RADIUS_CELLS,roadArmed:true,fleetOpened:false};
  await shot(view,page,"fleet-tap-inspect");
  view.proof.documentScroll=await noDocScroll(page);
  const contexts=await page.evaluate(()=>window.__rwSmoke?.webglContexts);
  if(contexts!==1)throw Error("adverse webglContextCount !== 1: "+contexts);
  view.proof.cameraInvariants={webglContextCount:contexts,world3d:"ready"};
  await ctx.close();
  view.pageErrors=errs;view.failedRequests=failed;
  if(errs.length||failed.length)throw Error("adverse errors: "+JSON.stringify({errs,failed}));
  report.views.push(view);
 }

 // ================= VIEW 4: empty phone — honest empty state =================
 {
  const v={name:"empty-phone",viewport:{width:390,height:844},dpr:2,mobile:true,touch:true};
  const view={...v,screenshots:[],proof:{}};
  const {ctx,page,errs,failed}=await newPage(v,emptyFleetSave());
  await openFleet(page);
  await page.locator('[data-testid="fleet-empty"]').waitFor({state:"visible",timeout:5000});
  const emptyText=await page.locator('[data-testid="fleet-empty"]').innerText();
  const active=await page.locator('[data-testid="fleet-active"]').innerText();
  if(active!=="0/0")throw Error("empty fleet totals wrong: "+active);
  if(await page.locator('[data-testid="fleet-build-locked"]').isDisabled()!==true)throw Error("build must stay disabled on empty fleet");
  view.proof.empty={totals:active,text:emptyText,buildDisabled:true};
  view.proof.geometry=await geometry(view,page);
  await shot(view,page,"fleet-empty");
  await ctx.close();
  view.pageErrors=errs;view.failedRequests=failed;
  if(errs.length||failed.length)throw Error("empty errors: "+JSON.stringify({errs,failed}));
  report.views.push(view);
 }
 report.status="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child)child.kill("SIGTERM");
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("UX-05 fleet capture:",report.status,OUT);
 console.log(JSON.stringify(report.views.map(v=>({view:v.name,shots:v.screenshots.length,errors:v.pageErrors?.length??-1})),null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}