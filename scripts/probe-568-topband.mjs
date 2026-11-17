// #568 — phone top-HUD occlusion of the PLAYER machine at (10,10).
// NEW probe (no leased harness touched). Production-preview harness (vite preview
// of the REAL production build), the SAME authoritative uiSeed as
// scripts/capture-dismantle.mjs, and the SAME projection path (worldFootprint +
// projectGround over the APPLIED camera stamps). NO pan, NO camera manipulation:
//  - top-band boxes (hud-top / brand / resources-strip / left-rail / alarm-rail /
//    rail-controls / coordinate-chip) at phone 390x844 dpr2, desktop 1440x900,
//    landscape 667x375 and 844x390;
//  - all five aim heights (1.2 / 0 / 3 / 5 / 7) for building 10 @ (10,10) and
//    document.elementFromPoint for each, at the home camera;
//  - the PROTECTED starter (id 1 @7,9) five-height aim recorded alongside for
//    #564 non-regression cross-reference;
//  - phone decisive clause: a REAL touch tap at the (10,10) home pivot selects
//    building 10 and renders the inspector eyebrow SITE 10.10.
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — phone EMULATED, one headless
// Chromium/SwiftShader run; sponsor G1 (#276) and handset (#268/#275) remain owed.
import {chromium} from "playwright-core";
import {createGame,buildAt,advanceGame,checkSite,nearestRoad,snapshot} from "../src/simulation.js";
import {BLUEPRINTS,WORLD_SIZE,SAVE_KEY} from "../src/content.js";
import {projectGround} from "../src/inspector.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/568-top-hud");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4185,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const HEIGHTS=[1.2,0,3,5,7];
const report={version:1,issue:568,task:"phone home-camera top-HUD occlusion of the player machine at (10,10)",
 build:"production-preview",source_sha:SHA,started:new Date().toISOString(),views:[],status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone/landscape views are EMULATED (isMobile+hasTouch+dpr2), not physical handsets (#268/#275 owed)",
  "PASS_NUMERIC_ONLY: elementFromPoint/box/tap proofs do not certify visual fidelity — sponsor visual review at G1 (#276) is still owed",
  "Local production preview only — no hosted-deployment receipt; branch CI green is not a production release",
  "The probe script itself is new evidence tooling for #568; scripts/capture-dismantle.mjs, scripts/probe-564-geometry.mjs and capture-ux06.mjs remain UNMODIFIED"]};
let child,browser,anyFail=false;
await mkdir(OUT,{recursive:true});

// ---- uiSeed: byte-for-byte the same construction as capture-dismantle.mjs ----
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
const UI=uiSeed();
if(UI.building.x!==10||UI.building.z!==10)throw Error("uiSeed player machine must sit at (10,10); got "+UI.building.x+","+UI.building.z);
const seedScript=(json)=>`(()=>{try{const g=JSON.parse(${JSON.stringify(json)});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){}})()`;

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 let previewExit=null;
 child.on("exit",c=>{previewExit=c;});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){
  if(previewExit!==null)throw Error("preview exited early (code "+previewExit+") — port conflict? Refusing to measure a foreign/stale server on "+PORT);
  try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
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
  const bandBoxes=page=>page.evaluate(()=>{
   const out={};
   for(const sel of [".hud-top",".brand",".resources-strip",".left-rail",".alarm-rail",".rail-controls",".coordinate-chip"]){
    const el=document.querySelector(sel);
    if(!el){out[sel]=null;continue;}
    const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    out[sel]={top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2),
     height:+r.height.toFixed(2),pointerEvents:cs.pointerEvents,order:cs.order,display:cs.display};
   }
   return out;
  });
  const aim=async(page,b)=>{
   const box=await page.locator(".world-canvas").boundingBox();
   const cam=await page.locator(".world-canvas").evaluate(c=>({yaw:+c.dataset.cameraYaw,elevation:+c.dataset.cameraElevation,zoom:+c.dataset.cameraZoom,x:+c.dataset.cameraX,z:+c.dataset.cameraZ}));
   const fp=worldFootprint(b.type,b.x,b.z,b.rot||0);
   const aims=[];
   for(const h of HEIGHTS){
    const p=projectGround(cam,{x:fp.pivot.x,y:h,z:fp.pivot.z},{width:box.width,height:box.height});
    const px=Math.round(box.x+p.x),py=Math.round(box.y+p.y);
    const top=await hit(page,px,py);
    aims.push({h,px,py,top,canvas:/world-canvas/.test(top)});
   }
   return {camera:cam,aims};
  };

  // ---- uiSeed context: the (10,10) player machine + starter cross-reference ----
  {
   const {ctx,page}=await newPage(JSON.stringify(UI.save));
   const rec={};
   rec.bandBoxes=await bandBoxes(page);
   rec.centre={point:v.centre,top:await hit(page,v.centre.x,v.centre.y)};
   rec.centre.canvas=/world-canvas/.test(rec.centre.top);
   rec.machine10=await aim(page,UI.building);
   rec.machine10.allCanvas=rec.machine10.aims.every(a=>a.canvas);
   const starter=UI.save.buildings.find(b=>b.id===1);
   rec.starter=await aim(page,starter);
   rec.starter.allCanvas=rec.starter.aims.every(a=>a.canvas);
   if(v.hard){
    if(!rec.centre.canvas)fails.push("phone centre is NOT canvas: "+rec.centre.top);
    if(!rec.machine10.allCanvas)fails.push("phone (10,10) five-height home aim NOT all canvas: "+JSON.stringify(rec.machine10.aims));
    if(!rec.starter.allCanvas)fails.push("phone starter (#564) five-height aim NOT all canvas: "+JSON.stringify(rec.starter.aims));
   }
   await shot(page,"home-uiSeed");
   if(v.hard){
    // Decisive clause: a REAL touch tap at the (10,10) home pivot selects id 10.
    const a=rec.machine10.aims[0];
    if(!a.canvas){
     rec.tapSelect={at:{px:a.px,py:a.py},selected:false,blockedBy:a.top,note:"home pivot occluded; no pan/camera manipulation permitted to compensate"};
     fails.push("decisive clause: (10,10) home pivot tap target is "+a.top+", not CANVAS");
    }else{
     await page.touchscreen.tap(a.px,a.py);
     await page.waitForFunction(()=>{const e=document.querySelector(".inspector-panel .eyebrow");return !!e&&e.textContent.includes("SITE 10.10");},null,{timeout:5000,polling:100});
     rec.tapSelect={at:{px:a.px,py:a.py},selected:true,site:"10.10"};
     await shot(page,"machine10-home-tap");
    }
   }
   view.contexts.uiSeed=rec;
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
 if(child){try{execSync("taskkill /PID "+child.pid+" /T /F",{stdio:"ignore"});}catch{try{child.kill("SIGKILL");}catch{}}}
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("#568 top-band probe:",report.status,OUT);
 if(report.errors.length)console.error(report.errors.join("\n"));
}
