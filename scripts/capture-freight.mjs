// LOG-04 (#384) freight-ledger evidence on the PRODUCTION preview build.
// One Chromium instance, sequential contexts. Deterministic mid-haul and
// arrived saves are injected via localStorage; the live app reloads them through
// readGame and keeps simulating. We measure the four ledgers exactly (bank strip,
// fleet panel, canvas freight stamps, persisted save) and capture world-space
// screenshots of the actual onboard load.
// PASS_NUMERIC_ONLY: headless SwiftShader run, emulated phone. This does NOT
// certify visual fidelity or crate color parity — G1 (#276) sponsor review of
// these artifacts is still required before any visual claim.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS,groundAtScreen} from "../src/camera.js";
import {createGame,advanceGame,freightTotals,freightManifest} from "../src/simulation.js";
import {SAVE_KEY,CELL,WORLD_SIZE} from "../src/content.js";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_FREIGHT_OUT||"docs/evidence/384-log-04");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT||4384);
const ORIGIN=`http://127.0.0.1:${PORT}`;
const HOST=`${ORIGIN}/rustwake/`;
const report={issue:384,version:2,build:"production-preview",source_sha:process.env.GITHUB_SHA||"local",
 started:new Date().toISOString(),views:[],measurements:{},status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone view is emulated, not a physical device",
  "PASS_NUMERIC_ONLY: ledger/stamp/DOM measurements are exact; crate color/count fidelity is screenshot-only and NOT self-certified",
  "G1 visual review (#276) is sponsor-reserved; these artifacts are evidence for that review, not approval",
  "Fixtures freeze power (generator never completes) and slow the fleet so the mid-haul state is observable; they are measurement scenes, not a balance claim"
 ]};

// ---- deterministic fixtures (same seed 4073 and rules as the unit tests) ----
function baseFixture(){
 const g=createGame();
 g.buildings.find(b=>b.type==="generator").remaining=1e9; // power frozen: no production drift
 for(const b of g.buildings)b.inventory={};
 for(const k of Object.keys(g.bank))if(k!=="credits")g.bank[k]=0;
 g.buildings.find(b=>b.id===1).inventory={scrap:12}; // salvager -> depot, 12 scrap
 return g;
}
function tick(g,pred){
 for(let i=0;i<6000;i++){advanceGame(g,0.1);if(pred(g))return g;}
 throw Error("fixture predicate never met");
}
const onboardFixture=()=>{
 const g=baseFixture();
 tick(g,()=>{const j=g.vehicles[0].job;return j?.phase==="toDest"&&j.segment<j.route.length-2;});
 for(const v of g.vehicles)v.speed=0.05; // stay mid-haul while we observe
 return g;
};
const arrivedFixture=()=>{
 const g=baseFixture();
 tick(g,()=>g.freightLedger.some(e=>e.kind==="arrive"&&e.amount===12));
 return g;
};
const ledgerSummary=g=>({
 kinds:g.freightLedger.map(e=>e.kind+(e.reason?":"+e.reason:"")+"="+e.amount),
 totals:freightTotals(g),manifest:freightManifest(g)
});

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

 const inject=async(ctx,g)=>{
  const json=JSON.stringify(g);
  await ctx.addInitScript(({json,key})=>{
   const save=JSON.parse(json);save.lastSavedAt=Date.now(); // no offline catch-up
   localStorage.setItem(key,JSON.stringify(save));
   localStorage.setItem("rustwake:v2:intro","1");
  },{json,key:SAVE_KEY});
 };
 const newPage=async(ctx)=>{
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
 const stamps=page=>page.locator(".world-canvas").evaluate(c=>({
  world3d:c.dataset.world3d,freightLoaded:c.dataset.freightLoaded,freightOnboard:c.dataset.freightOnboard,
  yaw:c.dataset.cameraYaw,zoom:c.dataset.cameraZoom
 }));
 const waitFreight=async(page,loaded,onboard,label)=>{
  try{await page.waitForFunction(e=>{
   const c=document.querySelector(".world-canvas");
   return !!c&&c.dataset.freightLoaded===String(e.loaded)&&c.dataset.freightOnboard===String(e.onboard);
  },{loaded,onboard},{timeout:10000,polling:50});}
  catch{throw Error(label+": freight stamps never reached loaded="+loaded+" onboard="+onboard+" (now "+JSON.stringify(await stamps(page))+")");}
 };
 const waitZoomAbove=(page,prev,label)=>page.waitForFunction(p=>{
  const c=document.querySelector(".world-canvas");return !!c&&Number(c.dataset.cameraZoom)>p;
 },prev,{timeout:8000,polling:50}).catch(()=>{throw Error(label)});
 const bankValue=async(page,title)=>Number((await page.locator('.resources-strip button[title="'+title+'"] strong').innerText()).replace(/[^0-9.-]/g,""));
 const openFleet=async(page)=>{
  await page.locator('[data-tool="fleet"]').click();
  await page.locator(".fleet-row").first().waitFor({state:"visible",timeout:8000});
  return page.locator(".fleet-row").first().innerText();
 };
 const readSave=page=>page.evaluate(key=>localStorage.getItem(key),SAVE_KEY);
 // Inverse of camera.groundAtScreen (continuous world coords -> CSS pixel),
 // round-tripped through the authoritative camera math before any gesture.
 const worldPixel=async(page,wx,wz)=>{
  const p=await pose(page);
  const rect=await page.locator(".world-canvas").evaluate(c=>{const r=c.getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height};});
  const th=p.yaw*Math.PI/180,cs=Math.cos(th),sn=Math.sin(th),sine=Math.sin(p.elevation*Math.PI/180);
  const wpp=CAMERA_LIMITS.frustumHeight/(rect.height*p.zoom);
  const u=cs*(wx-p.x)-sn*(wz-p.z),vv=(-sn*(wx-p.x)-cs*(wz-p.z))*sine;
  const px={x:rect.width/2+u/wpp,y:rect.height/2-vv/wpp};
  const back=groundAtScreen(p,px,{width:rect.width,height:rect.height});
  if(Math.hypot(back.x-wx,back.z-wz)>1e-6)throw Error("Capture projection inverse diverged from camera math");
  if(px.x<0||px.y<0||px.x>rect.width||px.y>rect.height)throw Error("Capture target projects outside the canvas: "+JSON.stringify({wx,wz,px}));
  return {x:rect.left+px.x,y:rect.top+px.y};
 };

 // ---- desktop: mid-haul onboard load, truck closeup, reload persistence ----
 {
  const g=onboardFixture();
  const expected=ledgerSummary(g);
  const hauler=g.vehicles[0];
  const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:"reduce"});
  await inject(ctx,g);
  const {page,errs,failed}=await newPage(ctx);
  await waitFreight(page,1,12,"ONBOARD_STAMPS");
  const fleetRow=await openFleet(page);
  if(!fleetRow.toLowerCase().includes("delivering cargo")||!fleetRow.toLowerCase().includes("12 scrap"))
   throw Error("Fleet panel does not show the actual onboard load: "+fleetRow);
  if(await bankValue(page,"Scrap")!==0)throw Error("Bank scrap must be 0 while the load is onboard");
  await page.screenshot({path:resolve(OUT,"desktop-freight-onboard.png"),fullPage:false,animations:"disabled"});
  // Closeup: pan the hauler to screen center and zoom in on the crate load.
  await page.keyboard.press("Escape");
  await page.waitForFunction(()=>!document.querySelector(".panel-host"),null,{timeout:8000});
  const wx=(hauler.x-WORLD_SIZE/2+.5)*CELL,wz=(hauler.z-WORLD_SIZE/2+.5)*CELL;
  const start=await worldPixel(page,wx,wz);
  const before=await pose(page);
  const center={x:720,y:450};
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(center.x,center.y,{steps:12});await page.mouse.up();
  await page.waitForFunction(q=>{const c=document.querySelector(".world-canvas");
   return !!c&&(Number(c.dataset.cameraX)!==q.x||Number(c.dataset.cameraZ)!==q.z);},
   {x:before.x,z:before.z},{timeout:8000,polling:50});
  for(let i=0;i<2;i++){
   const z0=(await pose(page)).zoom;
   await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-500);
   await waitZoomAbove(page,z0,"Closeup wheel zoom never applied");
  }
  await waitFreight(page,1,12,"CLOSEUP_STAMPS");
  await page.screenshot({path:resolve(OUT,"desktop-freight-truck-closeup.png"),fullPage:false,animations:"disabled"});
  const closeupPose=await pose(page);
  // Reload: the persisted mid-haul save must restore cargo/phase/ledger exactly.
  await page.reload({waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  await waitFreight(page,1,12,"RELOAD_STAMPS");
  const reloadRow=await openFleet(page);
  if(!reloadRow.toLowerCase().includes("delivering cargo")||!reloadRow.toLowerCase().includes("12 scrap"))
   throw Error("Reload lost the onboard load: "+reloadRow);
  const savedRaw=await readSave(page);
  const saved=JSON.parse(savedRaw);
  const savedTotals=freightTotals(saved);
  if(savedTotals.totals.scrap!==12||savedTotals.onboard!==12)
   throw Error("Reloaded save does not conserve the 12 scrap onboard: "+JSON.stringify(savedTotals));
  if(!saved.freightLedger.some(e=>e.kind==="reserve"&&e.amount===12)||!saved.freightLedger.some(e=>e.kind==="pickup"&&e.amount===12))
   throw Error("Reloaded save lost reserve/pickup ledger entries");
  await page.screenshot({path:resolve(OUT,"desktop-freight-reload.png"),fullPage:false,animations:"disabled"});
  report.measurements.onboard={fixture:expected,haulerCell:{x:hauler.x,z:hauler.z},
   stamps:await stamps(page),fleetRow,reloadFleetRow:reloadRow,
   reloadTotals:savedTotals,closeupPose,
   screenshots:["desktop-freight-onboard.png","desktop-freight-truck-closeup.png","desktop-freight-reload.png"],
   expected:"1 truck loaded with exactly 12 scrap; bank scrap 0; reload restores cargo, phase and ledger without duplication"};
  report.views.push({name:"desktop-onboard",viewport:{width:1440,height:900},pageErrors:errs,failedRequests:failed});
  if(errs.length||failed.length)throw Error("desktop-onboard page errors: "+errs.join(";")+" failed="+failed.join(","));
  await ctx.close();
 }

 // ---- desktop: arrival credited destination stock exactly once ----
 {
  const g=arrivedFixture();
  const expected=ledgerSummary(g);
  const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:"reduce"});
  await inject(ctx,g);
  const {page,errs,failed}=await newPage(ctx);
  await waitFreight(page,0,0,"ARRIVED_STAMPS");
  const scrap=await bankValue(page,"Scrap");
  if(scrap!==12)throw Error("Destination bank scrap must be exactly 12 after arrival, got "+scrap);
  const fleetRow=await openFleet(page);
  if(!fleetRow.toLowerCase().includes("available for dispatch")||!fleetRow.toLowerCase().includes("idle"))
   throw Error("Arrived truck must be idle, fleet shows: "+fleetRow);
  await page.screenshot({path:resolve(OUT,"desktop-freight-arrived.png"),fullPage:false,animations:"disabled"});
  const saved=JSON.parse(await readSave(page));
  const savedTotals=freightTotals(saved);
  if(savedTotals.totals.scrap!==12||savedTotals.onboard!==0||savedTotals.reserved!==0)
   throw Error("Arrived save does not conserve 12 scrap in destination stock: "+JSON.stringify(savedTotals));
  if(!saved.freightLedger.some(e=>e.kind==="arrive"&&e.amount===12))
   throw Error("Arrived save lost the arrive ledger entry");
  report.measurements.arrival={fixture:expected,bankScrapStrip:scrap,stamps:await stamps(page),fleetRow,
   reloadTotals:savedTotals,screenshot:"desktop-freight-arrived.png",
   expected:"onboard 0, reserved 0, destination (depot bank) scrap exactly 12; arrive ledger entry present; truck idle"};
  report.views.push({name:"desktop-arrived",viewport:{width:1440,height:900},pageErrors:errs,failedRequests:failed});
  if(errs.length||failed.length)throw Error("desktop-arrived page errors: "+errs.join(";")+" failed="+failed.join(","));
  await ctx.close();
 }

 // ---- phone: same mid-haul load, emulated touch viewport ----
 {
  const g=onboardFixture();
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  await inject(ctx,g);
  const {page,errs,failed}=await newPage(ctx);
  await waitFreight(page,1,12,"PHONE_STAMPS");
  const fleetRow=await openFleet(page);
  if(!fleetRow.toLowerCase().includes("delivering cargo")||!fleetRow.toLowerCase().includes("12 scrap"))
   throw Error("Phone fleet panel does not show the onboard load: "+fleetRow);
  const scroll=await page.evaluate(()=>Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)>innerHeight+2||Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+2);
  await page.screenshot({path:resolve(OUT,"phone-freight-onboard.png"),fullPage:false,animations:"disabled"});
  report.measurements.phone={stamps:await stamps(page),fleetRow,documentScroll:scroll,screenshot:"phone-freight-onboard.png"};
  report.views.push({name:"phone-onboard",viewport:{width:390,height:844},pageErrors:errs,failedRequests:failed,documentScroll:scroll});
  if(errs.length||failed.length||scroll)throw Error("phone-onboard failure: errors="+errs.join(";")+" failed="+failed.join(",")+" scroll="+scroll);
  await ctx.close();
 }

 report.status="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child)child.kill("SIGTERM");
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("Freight ledger capture:",report.status,OUT);
 if(report.errors.length)console.error(report.errors.join("\n"));
}
