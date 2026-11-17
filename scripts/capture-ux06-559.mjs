// #559 — UX-06 capture debt: the two runtime proofs owed for the LIVE alarm
// rail (PR #550, main 38c36cc0a68f7900ea1daf6751fa4b153133bd3b).
//
// Part A (issue #559 item 1): LANDSCAPE phones (844x390 and 667x375) with the
// alarm detail OPEN. The CSS docks the detail as a right-side sheet
// (src/styles.css @media(max-height:600px)); until now that was CSS-only.
// This harness asserts document.elementFromPoint(centre) === CANVAS FIRST
// (THROWS otherwise — defect class #4: overlay steals contact), then a REAL
// single-finger CDP touch pan at the centre proves the sheet does not eat
// the gesture (cameraX actually changes, yaw unchanged).
//
// Part B (issue #559 item 2): portrait phone 390x844. The warnings toggle
// (x~1107) and collapse button (x~1192) sit beyond the 390px viewport edge
// inside the horizontally scrolling strip. The #550 capture reached them via
// Playwright AUTO-SCROLL click (capture-ux06.mjs:171,256,261-263) — that is
// not thumb reachability. Here a real CDP Input.dispatchTouchEvent
// single-finger horizontal swipe scrolls the strip (scrollLeft logged
// before/after EVERY swipe), and only once both controls are measured inside
// the viewport are they tapped with real CDP touch taps. No locator.click /
// scrollIntoViewIfNeeded is used on any strip control in this script. If a
// real swipe cannot reach them the harness THROWS — a genuine player-facing
// defect, never papered over with auto-scroll.
//
// Numeric/runtime evidence only — PASS_NUMERIC_ONLY. Phones are EMULATED
// (headless Chromium/SwiftShader), not physical handsets (#268/#275 owed);
// numeric pixels do not certify visual fidelity — G1 sponsor visual review
// (#276) is STILL OWED. No hosted-deployment receipt is claimed.
import {chromium} from "playwright-core";
import {createGame} from "../src/simulation.js";
import {SAVE_KEY} from "../src/content.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/559-ux06-capture-debt");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4569,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return "local";}})();
if(!/^[0-9a-f]{40}$/.test(SHA))throw Error("capture must run at a real commit head; source_sha 'local' is unacceptable");
const BASE=(()=>{try{return execSync("git merge-base HEAD origin/main",{encoding:"utf8"}).trim();}catch{return "unknown";}})();
const report={version:1,issue:559,branch:"rw/559-ux06-capture-debt",
 build:"production-preview",source_sha:SHA,rebase_base:BASE,started:new Date().toISOString(),
 verdict:"FAIL",phone_emulated:true,preview_only:true,views:[],errors:[],
 debt:{prior_capture:"scripts/capture-ux06.mjs (PR #550)",
  autoscroll_lines:[171,256,"261-263"],
  live_main:"38c36cc0a68f7900ea1daf6751fa4b153133bd3b"},
 limitations:[
  "One headless Chromium/SwiftShader run; all phone views are EMULATED (isMobile+hasTouch+dpr2), not physical devices (#268/#275 owed)",
  "PASS_NUMERIC_ONLY: numeric hit-test/pan/scroll proofs do not certify visual fidelity — sponsor visual review at G1 (#276) is still owed",
  "Local production preview only — no hosted-deployment receipt (#333) is claimed by this capture",
  "CDP touch swipes/taps are synthesized single-finger contacts; fling momentum is whatever Chromium derives from the dispatched moves — no Playwright auto-scroll is used on any strip control"]};
let child,browser;
await mkdir(OUT,{recursive:true});

// Same deterministic seeded fixture as capture-ux06.mjs: no generator + no
// roads => 6 real alarms (power-brownout first). Never fabricated flags.
function sixAlarmSave(){const g=createGame();g.buildings=g.buildings.filter(b=>b.type!=="generator");g.roads=[];return g;}
const seedScript=(json)=>`(()=>{try{window.__RW_PROBES__=true;const g=JSON.parse(${JSON.stringify(JSON.stringify(json))});g.lastSavedAt=Date.now();localStorage.setItem(${JSON.stringify(SAVE_KEY)},JSON.stringify(g));}catch(e){window.__SEED_ERR__=String(e);}})()`;

try{
 child=spawn(process.execPath,["node_modules/vite/bin/vite.js","preview","--port",String(PORT),"--strictPort","--host","127.0.0.1"],{stdio:["ignore","pipe","pipe"]});
 child.stdout.on("data",()=>{});child.stderr.on("data",d=>report.errors.push("preview: "+d.toString().slice(0,400)));
 let open=false;
 for(let i=0;i<70;i++){try{const r=await fetch(HOST,{signal:AbortSignal.timeout(2000)});if(r.ok){open=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!open)throw Error("Production preview did not become available on "+PORT);
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});

 for(const v of [
  {name:"landscape-844x390",viewport:{width:844,height:390},dpr:2,isMobile:true,touch:true,centre:{x:422,y:195},part:"A"},
  {name:"landscape-667x375",viewport:{width:667,height:375},dpr:2,isMobile:true,touch:true,centre:{x:333.5,y:187.5},part:"A"},
  {name:"phone-390x844",viewport:{width:390,height:844},dpr:2,isMobile:true,touch:true,centre:{x:195,y:422},part:"B"},
 ]){
  const view={name:v.name,part:v.part,viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,screenshots:[],proof:{}};
  report.views.push(view);
  const errs=[];
  const shot=async(page,label)=>{const f=`${v.name}-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});view.screenshots.push(f);return f;};
  const ctx=await browser.newContext({viewport:v.viewport,deviceScaleFactor:v.dpr,isMobile:v.isMobile,hasTouch:v.touch,reducedMotion:"reduce"});
  await ctx.addInitScript(seedScript(sixAlarmSave()));
  const page=await ctx.newPage();
  page.on("pageerror",e=>errs.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
  await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
  await page.waitForFunction(()=>{try{return JSON.parse(document.body.dataset.alarmProbe||"null")?.kind==="ready";}catch{return false;}},null,{timeout:15000,polling:100});
  const seedErr=await page.evaluate(()=>window.__SEED_ERR__||null);
  if(seedErr)throw Error("init-script seed failed (fresh-yard fallback would fake the fixture): "+seedErr);
  const ids=await page.evaluate(()=>JSON.parse(document.body.dataset.alarmProbe).ids);
  if(ids[0]!=="power-brownout"||ids.length!==6)throw Error("expected seeded 6-alarm fixture, got "+JSON.stringify(ids));
  view.proof.seeded_ids=ids;

  const cdp=await ctx.newCDPSession(page);
  const pose=()=>page.locator(".world-canvas").evaluate(c=>({yaw:Number(c.dataset.cameraYaw),elevation:Number(c.dataset.cameraElevation),zoom:Number(c.dataset.cameraZoom),x:Number(c.dataset.cameraX),z:Number(c.dataset.cameraZ)}));
  const hit=(x,y)=>page.evaluate(([x,y])=>{
   const el=document.elementFromPoint(x,y);
   if(!el)return {tag:null,cls:null,testid:null,isCanvas:false};
   return {tag:el.tagName,cls:String(el.className).slice(0,80),testid:el.getAttribute("data-testid"),isCanvas:el.classList.contains("world-canvas")};
  },[x,y]);
  const rect=sel=>page.evaluate(s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};},sel);
  // The warnings testid rides the 16px checkbox INPUT; the thumb target is its
  // 44px parent LABEL (styles.css .alarm-controls label min-height:44px), and
  // a real tap on the label natively activates the checkbox.
  const warnRect=()=>page.evaluate(()=>{const el=document.querySelector('[data-testid="alarm-setting-warnings"]')?.closest("label");if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
  // Methodology gate: elementFromPoint FIRST, THROW if the centre is not
  // CANVAS (mirrors capture-ux06.mjs:119/:210). A pretty PNG of an overlay is
  // worthless.
  const assertCentreCanvas=async(label)=>{
   const h=await hit(v.centre.x,v.centre.y);
   if(!h.isCanvas)throw Error(label+": elementFromPoint centre is NOT canvas: "+JSON.stringify(h));
   return h;
  };
  // REAL single-finger CDP touch pan at the canvas centre; bounded stamp
  // observation, then assert the pose actually changed (no
  // predicate-implies-assertion).
  const touchPan=async(label)=>{
   const before=await pose();
   const {x,y}=v.centre;
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});
   for(let i=1;i<=6;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x+20*i,y,id:1}]});
   try{await page.waitForFunction(b=>Number(document.querySelector(".world-canvas").dataset.cameraX)!==b,before.x,{timeout:8000,polling:50});}
   catch{await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    throw Error(label+": centre touch drag produced NO cameraX change (sheet/overlay eats the gesture?) pose="+JSON.stringify(await pose()));}
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
   const after=await pose();
   return {before_x:before.x,after_x:after.x,delta_x:+(after.x-before.x).toFixed(6),yaw_unchanged:after.yaw===before.yaw};
  };
  // Real CDP touch TAP (start+end at one point => synthesized click). Used
  // ONLY on controls already measured inside the viewport — never auto-scroll.
  const touchTap=async(sel,box)=>{
   const b=box||await rect(sel);
   if(!b)throw Error("tap target missing: "+sel);
   if(b.x<0||b.y<0||b.x+b.width>v.viewport.width+0.5||b.y+b.height>v.viewport.height+0.5)
    throw Error("refusing to tap off-viewport control (that would repeat the auto-scroll cheat): "+sel+" "+JSON.stringify(b));
   const p={x:b.x+b.width/2,y:b.y+b.height/2,id:1};
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[p]});
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
   return {tapPoint:p,box:b};
  };

  if(v.part==="A"){
   // ================= Part A: landscape, detail OPEN =================
   view.proof.railOnly_hit=await assertCentreCanvas("rail-only");
   const railBox=await rect('[data-testid="alarm-rail"]');
   view.proof.railBox=railBox;
   // Open the road-2 detail. (locator.click may scroll the RAIL to its chip —
   // that is not the reachability claim under test; the claim is the centre
   // with the sheet OPEN, measured below.)
   await page.locator('[data-testid="alarm-chip-road-2"]').click();
   await page.locator('[data-testid="alarm-detail"]').waitFor({state:"visible",timeout:5000});
   // FIRST: centre hit-test with the sheet open — THROW if not CANVAS.
   view.proof.detailOpen_hit=await assertCentreCanvas("detail-open");
   const detailBox=await rect('[data-testid="alarm-detail"]');
   view.proof.detailBox=detailBox;
   const maxW=Math.min(320,0.45*v.viewport.width);
   if(detailBox.x<=v.centre.x)throw Error("landscape sheet covers the canvas centre column: "+JSON.stringify(detailBox));
   if(detailBox.width>maxW+0.5)throw Error("landscape sheet wider than min(320px,45vw): "+JSON.stringify(detailBox));
   if(detailBox.x+detailBox.width>v.viewport.width+0.5)throw Error("landscape sheet overflows right edge: "+JSON.stringify(detailBox));
   if(detailBox.y<83.5||detailBox.y+detailBox.height>v.viewport.height-95.5)throw Error("landscape sheet outside top:84/bottom:96 dock: "+JSON.stringify(detailBox));
   view.proof.rightDock={sheet_left:detailBox.x,centre_x:v.centre.x,clearance_px:+(detailBox.x-v.centre.x).toFixed(2),width_cap:maxW};
   // REAL pan with the sheet OPEN — the sheet must not eat the gesture.
   view.proof.detailOpen_pan=await touchPan("detail-open");
   if(view.proof.detailOpen_pan.delta_x===0)throw Error("detail-open pan delta is zero");
   if(!view.proof.detailOpen_pan.yaw_unchanged)throw Error("single-finger pan orbited the camera");
   await shot(page,"detail-open");
   // Close and re-verify the centre (sheet gone, canvas still hittable).
   await page.keyboard.press("Escape");
   await page.waitForFunction(()=>!document.querySelector('[data-testid="alarm-detail"]'),null,{timeout:5000});
   view.proof.afterClose_hit=await assertCentreCanvas("after-close");
   await shot(page,"after-close");
  }else{
   // ================= Part B: portrait thumb-swipe reachability =================
   view.proof.railOnly_hit=await assertCentreCanvas("rail-only");
   const railBox=await rect('[data-testid="alarm-rail"]');
   view.proof.railBox=railBox;
   if(railBox.y+railBox.height>=v.centre.y)throw Error("phone strip covers the canvas centre: "+JSON.stringify(railBox));
   const stripY=railBox.y+railBox.height/2;
   const scrollLeft=()=>page.evaluate(()=>document.querySelector('[data-testid="alarm-rail"]').scrollLeft);
   const inViewport=b=>b&&b.x>=0&&b.y>=0&&b.x+b.width<=v.viewport.width+0.5&&b.y+b.height<=v.viewport.height+0.5;
   const warnBefore=await warnRect();
   const collapseBefore=await rect('[data-testid="alarm-collapse"]');
   view.proof.controls_before={warningsLabelBox:warnBefore,warningsInputBox:await rect('[data-testid="alarm-setting-warnings"]'),collapseBox:collapseBefore,scrollLeft:await scrollLeft()};
   if(!(warnBefore.x>v.viewport.width&&collapseBefore.x>v.viewport.width))
    throw Error("debt precondition not met — controls are not off-viewport: "+JSON.stringify({warnBefore,collapseBefore}));
   await shot(page,"strip-before-swipe");
   // REAL single-finger horizontal swipes. Each swipe's scrollLeft is logged
   // before AND after so the swipe is provably what moved the controls.
   const swipe=async()=>{
    const before=await scrollLeft();
    const x0=v.viewport.width-30,x1=50;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:x0,y:stripY,id:1}]});
    for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x0+(x1-x0)*i/8,y:stripY,id:1}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    try{await page.waitForFunction(b=>document.querySelector('[data-testid="alarm-rail"]').scrollLeft>b,before,{timeout:4000,polling:50});}
    catch{throw Error("REAL single-finger swipe did NOT scroll the strip (player-facing reachability defect) — scrollLeft stayed "+before);}
    const after=await scrollLeft();
    return {before,after,delta:after-before,finger:{from:x0,to:x1,y:stripY}};
   };
   const swipeUntilVisible=async(label)=>{
    const swipes=[];
    for(let i=0;i<12;i++){
     const w=await warnRect();
     const c=await rect('[data-testid="alarm-collapse"]');
     if(inViewport(w)&&inViewport(c))return {swipes,warningsBox:w,collapseBox:c};
     const maxScroll=await page.evaluate(()=>{const el=document.querySelector('[data-testid="alarm-rail"]');return el.scrollWidth-el.clientWidth;});
     if((await scrollLeft())>=maxScroll-0.5)
      throw Error(label+": strip scrolled to its end but controls are STILL off-viewport (genuine defect): "+JSON.stringify({w,c,maxScroll}));
     swipes.push(await swipe());
    }
    throw Error(label+": 12 real swipes did not bring both controls into the viewport");
   };
   const reached=await swipeUntilVisible("initial reach");
   view.proof.swipes=reached.swipes;
   view.proof.controls_after={warningsLabelBox:reached.warningsBox,collapseBox:reached.collapseBox,scrollLeft:await scrollLeft()};
   if(reached.collapseBox.height<44)throw Error("collapse control below 44px: "+JSON.stringify(reached.collapseBox));
   if(reached.warningsBox.height<44)throw Error("warnings toggle LABEL below 44px: "+JSON.stringify(reached.warningsBox));
   await shot(page,"strip-after-swipe");
   // REAL taps (CDP touch, no auto-scroll) on BOTH controls.
   view.proof.collapse_tap=await touchTap('[data-testid="alarm-collapse"]');
   await page.locator('[data-testid="alarm-summary"]').waitFor({state:"visible",timeout:5000});
   view.proof.collapsed_summary_visible=true;
   view.proof.collapsed_hit=await assertCentreCanvas("collapsed");
   await shot(page,"collapsed");
   // Re-expand via a real tap on the summary chip.
   view.proof.summary_tap=await touchTap('[data-testid="alarm-summary"]');
   await page.locator('[data-testid="alarm-chip-road-2"]').waitFor({state:"visible",timeout:5000});
   // Warnings toggle: swipe back into view if re-expansion moved it, then tap.
   const warnReach=await swipeUntilVisible("warnings reach");
   view.proof.warnings_swipes=warnReach.swipes;
   view.proof.warnings_tap_1=await touchTap('[data-testid="alarm-setting-warnings"]',warnReach.warningsBox);
   await page.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem("rustwake:v2:alarm-settings")).showWarnings===false;}catch{return false;}},null,{timeout:5000});
   view.proof.warnings_tap_2=await touchTap('[data-testid="alarm-setting-warnings"]',await warnRect());
   await page.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem("rustwake:v2:alarm-settings")).showWarnings===true;}catch{return false;}},null,{timeout:5000});
   view.proof.warnings_toggle_persisted=true;
   view.proof.tap_method="CDP Input.dispatchTouchEvent touchStart+touchEnd (no locator.click / scrollIntoViewIfNeeded on any strip control)";
   await shot(page,"warnings-toggled");
  }
  await cdp.detach();
  if(errs.length)throw Error(v.name+" page errors: "+errs.join(" | ").slice(0,800));
  await ctx.close();
 }
 report.verdict="PASS_NUMERIC_ONLY";
}catch(e){report.errors.push(String(e?.stack||e));}
finally{
 try{await browser?.close();}catch{}
 try{child?.kill();}catch{}
 report.finished=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,1));
 console.log(JSON.stringify({verdict:report.verdict,errors:report.errors,source_sha:SHA},null,1));
 process.exitCode=report.errors.length?1:0;
}
