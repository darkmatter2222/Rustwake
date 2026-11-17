// #564 — phone HUD occlusion of the PROTECTED starter at the HOME camera.
// NEW probe script (no leased harness is touched). Production-preview harness
// (vite preview of the REAL production build), the SAME authoritative seeds as
// scripts/capture-dismantle.mjs (freshYard / uiSeed / reservedSeed / fixture),
// and the SAME projection path (worldFootprint + projectGround over the APPLIED
// camera stamps). NO pan, NO camera manipulation, NO state hand-setting:
//  - document.elementFromPoint at the starter's projected pivot, five aim
//    heights (1.2 / 0 / 3 / 5 / 7), at the home camera in every seed context;
//  - left-rail child boxes (alarm-rail / coordinate-chip / rail-controls);
//  - viewport centre hit-test in all four contexts at phone 390x844 dpr2,
//    desktop 1440x900, landscape 667x375 and 844x390;
//  - phone decisive clause: a REAL touch tap at the home-camera pivot selects
//    building 1 and renders the PROTECTED-disabled dismantle control;
//  - #550 alarm rail still functional on ux06's own overflowing sixAlarm seed:
//    strip box, rendered chips, a GENUINE CDP Input.dispatchTouchEvent
//    horizontal swipe scrolls the strip (no scrollLeft= assignment), and
//    collapse/expand work through real taps reached by genuine swipes.
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — phone is EMULATED, one
// headless Chromium/SwiftShader run; sponsor G1 visual (#276) and physical
// handset (#268/#275) remain owed. This is NOT a release.
import {chromium} from "playwright-core";
import {createGame,buildAt,advanceGame,checkSite,nearestRoad,snapshot} from "../src/simulation.js";
import {BLUEPRINTS,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {projectGround} from "../src/inspector.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/564-phone-hud");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4184,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const HEIGHTS=[1.2,0,3,5,7];
const report={version:1,issue:564,task:"phone home-camera HUD occlusion of the PROTECTED starter (regression from #550)",
 build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone/landscape views are EMULATED (isMobile+hasTouch+dpr2), not physical handsets (#268/#275 owed)",
  "PASS_NUMERIC_ONLY: elementFromPoint/box/tap proofs do not certify visual fidelity — sponsor visual review at G1 (#276) is still owed",
  "Local production preview only — no hosted-deployment receipt (#333); branch CI green is not a production release",
  "Landscape/desktop five-height results are recorded for regression comparison; the hard gate is the phone decisive clause + centres + rail function",
  "The probe script itself is new evidence tooling for #564; scripts/capture-dismantle.mjs and every BLD-08 harness remain UNMODIFIED"]};
let child,browser,anyFail=false;
await mkdir(OUT,{recursive:true});

// ---- seeds: byte-for-byte the same constructions as capture-dismantle.mjs ----
const clone=(x)=>JSON.parse(JSON.stringify(x));
const ZERO_BANK=Object.fromEntries(Object.keys(BLUEPRINTS.salvager.cost).map(k=>[k,0]));
function legalSite(g,type,rot=0){
 const sites=[];
 for(let z=1;z<WORLD_SIZE-1;z++)for(let x=1;x<WORLD_SIZE-1;x++)
  if(checkSite(g,type,x,z,rot).ok&&nearestRoad(g,x,z))sites.push({x,z,d:Math.hypot(x-11,z-10)});
 if(!sites.length)throw Error("no legal site for "+type);
 sites.sort((a,b)=>a.d-b.d||a.z-b.z||a.x-b.x);
 return {x:sites[0].x,z:sites[0].z};
}
function frozenGame(){
 const g=createGame();
 g.buildings=g.buildings.filter(b=>b.id!==3);
 for(const b of g.buildings)b.inventory={};
 g.bank={...ZERO_BANK,credits:1000,scrap:100,stone:100};
 return g;
}
function completed(g,type,cmd){
 const site=legalSite(g,type);
 const r=buildAt(g,type,site.x,site.z,0,cmd);
 if(!r.ok)throw Error("seed build failed: "+r.reason);
 advanceGame(g,5);
 if(!(r.building.remaining<=0))throw Error("seed assembly did not complete");
 return r.building;
}
function uiSeed(){
 const g=frozenGame();
 g.vehicles=[];
 const b=completed(g,"salvager","capture-377-build");
 b.inventory={iron:7};
 return {save:snapshot(g),building:clone(b)};
}
function reservedSeed(){
 const g=frozenGame();
 const b=completed(g,"salvager","capture-377-reserved-build");
 b.inventory={scrap:20};
 let v=null;
 for(let i=0;i<400&&!v;i++){v=g.vehicles.find(x=>x.job&&x.job.sourceId===b.id)||null;if(!v)advanceGame(g,0.5);}
 if(!v)throw Error("no reservation seeded within 200s");
 g.buildings.find(x=>x.id===1).inventory={scrap:200};
 g.buildings.find(x=>x.id===4).inventory={iron:200,fuel:200};
 for(const x of g.vehicles)x.speed=0.02;
 return {save:snapshot(g),building:clone(b)};
}
const UI=uiSeed(),RESERVED=reservedSeed();
const FIXTURE=JSON.parse(await readFile(resolve("tests/fixtures/save-v2-dismantle.json"),"utf8"));
// Same construction as scripts/capture-ux06.mjs sixAlarmSave(): no generator +
// roads=[] yields a persistently overflowing alarm strip (the #550 functional
// proof seed). Used ONLY for the rail-function proof; uiSeed's strip can
// legitimately fit without scrolling, so overflow cannot be asserted there.
function sixAlarmGame(){const g=createGame();g.buildings=g.buildings.filter(b=>b.type!=="generator");g.roads=[];return g;}
const CONTEXTS=[
 {name:"freshYard",save:null},
 {name:"uiSeed",save:JSON.stringify(UI.save)},
 {name:"reservedSeed",save:JSON.stringify(RESERVED.save)},
 {name:"fixture",save:JSON.stringify(FIXTURE)},
 {name:"sixAlarm",save:JSON.stringify(snapshot(sixAlarmGame())),phoneOnly:true}];
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!open)throw Error("Production preview did not become available on "+PORT);
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 for(const v of [
  {name:"phone",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true,centre:{x:195,y:422},hard:true},
  {name:"desktop",viewport:{width:1440,height:900},dpr:1,isMobile:false,touch:false,centre:{x:720,y:450},hard:false},
  {name:"land-small",viewport:{width:667,height:375},dpr:2,isMobile:true,touch:true,centre:{x:333.5,y:187.5},hard:false},
  {name:"land-wide",viewport:{width:844,height:390},dpr:2,isMobile:true,touch:true,centre:{x:422,y:195},hard:false},
 ]){
  const view={name:v.name,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,screenshots:[],contexts:{}};
  report.views.push(view);
  const errs=[],fails=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  const newPage=async(saveJson)=>{
   const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
   if(saveJson!=null)await ctx.addInitScript(seedScript(saveJson));
   const page=await ctx.newPage();
   page.on("pageerror",e=>errs.push(String(e)));
   page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
   await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
   await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
   await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
   await page.waitForTimeout(900);
   return {ctx,page};
  };
  const hit=(page,x,y)=>page.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);return el?(el.tagName+"."+String(el.className)):"none";},[x,y]);
  const railBoxes=page=>page.evaluate(()=>{
   const out={};
   for(const sel of [".alarm-rail",".coordinate-chip",".rail-controls"]){
    const el=document.querySelector(sel);
    if(!el){out[sel]=null;continue;}
    const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    out[sel]={top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2),
     pointerEvents:cs.pointerEvents,order:cs.order,display:cs.display};
   }
   return out;
  });
  // Five-height aim at the starter pivot through the APPLIED camera stamps.
  const aimStarter=async(page,starter)=>{
   const box=await page.locator(".world-canvas").boundingBox();
   const cam=await page.locator(".world-canvas").evaluate(c=>({yaw:+c.dataset.cameraYaw,elevation:+c.dataset.cameraElevation,zoom:+c.dataset.cameraZoom,x:+c.dataset.cameraX,z:+c.dataset.cameraZ}));
   const fp=worldFootprint(starter.type,starter.x,starter.z,starter.rot||0);
   const aims=[];
   for(const h of HEIGHTS){
    const p=projectGround(cam,{x:fp.pivot.x,y:h,z:fp.pivot.z},{width:box.width,height:box.height});
    const px=Math.round(box.x+p.x),py=Math.round(box.y+p.y);
    const top=await hit(page,px,py);
    aims.push({h,px,py,top,canvas:/world-canvas/.test(top)});
   }
   return {camera:cam,aims};
  };
  const starterOf=(save)=>(save?JSON.parse(save):snapshot(createGame())).buildings.find(b=>b.id===1);

  for(const c of CONTEXTS){
   if(c.phoneOnly&&v.name!=="phone")continue;
   const {ctx,page}=await newPage(c.save);
   const rec={};
   rec.centre={point:v.centre,top:await hit(page,v.centre.x,v.centre.y)};
   rec.centre.canvas=/world-canvas/.test(rec.centre.top);
   if(v.hard&&!rec.centre.canvas)fails.push(v.name+"/"+c.name+": centre is NOT canvas: "+rec.centre.top);
   rec.railBoxes=await railBoxes(page);
   const starter=starterOf(c.save);
   if(starter){
    rec.starter=await aimStarter(page,starter);
    rec.starter.allCanvas=rec.starter.aims.every(a=>a.canvas);
    if(v.hard&&!rec.starter.allCanvas)fails.push(v.name+"/"+c.name+": five-height home aim NOT all canvas: "+JSON.stringify(rec.starter.aims));
   }
   if(c.name==="freshYard"&&v.name==="phone")await shot(page,"home-default");
   if(c.name==="sixAlarm"&&v.name==="phone"){
    // ---- #550 alarm rail still functional (real contacts only) ----
    // sixAlarm (ux06's own seed) guarantees an overflowing strip.
    const rail=await page.locator('[data-testid="alarm-rail"]').boundingBox();
    const chipCount=await page.locator(".alarm-rail .alarm-chip, .alarm-rail .alarm-summary").count();
    const scrollBefore=await page.locator('[data-testid="alarm-rail"]').evaluate(el=>el.scrollLeft);
    const cdp=await ctx.newCDPSession(page);
    const swipe=async()=>{
     const sy=rail.y+rail.height/2,sx=rail.x+rail.width-40;
     await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:sx,y:sy,id:1}]});
     for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:sx-30*i,y:sy,id:1}]});
     await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
     await page.waitForTimeout(350);
    };
    await swipe();
    let scrollAfter=await page.locator('[data-testid="alarm-rail"]').evaluate(el=>el.scrollLeft);
    // Reach the collapse control by GENUINE swipes only (no scrollLeft=, no
    // locator auto-scroll): swipe until its box sits inside the visible strip.
    let collapseBox=await page.locator('[data-testid="alarm-collapse"]').boundingBox().catch(()=>null);
    const inStrip=b=>!!b&&b.x>=rail.x-0.5&&b.x+b.width<=rail.x+rail.width+0.5&&b.width>0;
    let swipes=1;
    while(!inStrip(collapseBox)&&swipes<10){await swipe();swipes++;scrollAfter=await page.locator('[data-testid="alarm-rail"]').evaluate(el=>el.scrollLeft);collapseBox=await page.locator('[data-testid="alarm-collapse"]').boundingBox().catch(()=>null);}
    await cdp.detach();
    let collapse=null;
    if(inStrip(collapseBox)){
     const cx=collapseBox.x+collapseBox.width/2,cy=collapseBox.y+collapseBox.height/2;
     const topAt=await hit(page,cx,cy);
     await page.touchscreen.tap(cx,cy);
     const summaryShown=await page.locator('[data-testid="alarm-summary"]').waitFor({state:"visible",timeout:5000}).then(()=>true).catch(()=>false);
     let expandedAgain=false;
     if(summaryShown){
      const sb=await page.locator('[data-testid="alarm-summary"]').boundingBox();
      await page.touchscreen.tap(sb.x+sb.width/2,sb.y+sb.height/2);
      expandedAgain=await page.locator('[data-testid="alarm-collapse"]').waitFor({state:"visible",timeout:5000}).then(()=>true).catch(()=>false);
     }
     collapse={topAt,summaryShown,expandedAgain};
    }
    rec.railFunction={railBox:rail,chipCount,swipes,swipe:{scrollBefore,scrollAfter,delta:scrollAfter-scrollBefore},collapse};
    if(v.hard){
     if(rail.height>60)fails.push("phone alarm rail is not a single strip row: "+JSON.stringify(rail));
     if(rail.y+rail.height>=v.centre.y)fails.push("phone alarm strip covers the centre: "+JSON.stringify(rail));
     if(chipCount<1)fails.push("alarm rail rendered no chips");
     if(!(scrollAfter>scrollBefore))fails.push("genuine CDP swipe did not scroll the alarm strip: "+JSON.stringify({scrollBefore,scrollAfter}));
     if(!collapse||!collapse.summaryShown||!collapse.expandedAgain)fails.push("alarm collapse/expand broken or unreachable by genuine swipe: "+JSON.stringify(collapse));
    }
   }
   if(c.name==="uiSeed"&&v.name==="phone"){
    // ---- decisive clause: REAL touch tap at the home pivot selects id 1 ----
    const aim=rec.starter.aims[0];
    if(!aim.canvas){
     rec.tapSelect={at:{px:aim.px,py:aim.py},selected:false,blockedBy:aim.top,note:"home-camera pivot is occluded; a tap here cannot reach the canvas — no pan/camera manipulation is permitted to compensate"};
     fails.push("decisive clause: home pivot tap target is "+aim.top+", not CANVAS");
    }else{
     await page.touchscreen.tap(aim.px,aim.py);
     await page.waitForFunction(()=>{const e=document.querySelector(".inspector-panel .eyebrow");return !!e&&e.textContent.includes("SITE 7.9");},null,{timeout:5000,polling:100});
     await page.locator('[data-testid="dismantle-blocked"]').waitFor({state:"visible",timeout:5000});
     const disabled=await page.locator('[data-testid="dismantle-blocked"]').isDisabled();
     const reason=await page.locator('[data-testid="dismantle-blocked-reason"]').innerText();
     const openCount=await page.locator('[data-testid="dismantle-open"]').count();
     if(!disabled)fails.push("protected dismantle control must be disabled");
     if(reason!=="Starter buildings are protected; construct your own district.")fails.push("protected reason drift: "+reason);
     if(openCount!==0)fails.push("protected machine offers a dismantle opener");
     rec.tapSelect={at:{px:aim.px,py:aim.py},selected:true,site:"7.9",dismantleBlockedDisabled:disabled,reason,openCount};
     await shot(page,"protected-home-tap");
    }
   }
   if(c.name==="uiSeed"&&v.name!=="phone")await shot(page,"home");
   view.contexts[c.name]=rec;
   await ctx.close();
  }
  view.pageErrors=errs;
  view.failures=fails;
  if(errs.length){report.errors.push(v.name+" console/page errors: "+JSON.stringify(errs));anyFail=true;}
  if(fails.length){report.errors.push(v.name+" hard gate failures:\n"+fails.join("\n"));anyFail=true;}
 }
 report.status=anyFail?"FAIL":"PASS_NUMERIC_ONLY";
 if(anyFail)process.exitCode=1;
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child)child.kill("SIGTERM");
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("#564 geometry probe:",report.status,OUT);
 if(report.errors.length)console.error(report.errors.join("\n"));
}