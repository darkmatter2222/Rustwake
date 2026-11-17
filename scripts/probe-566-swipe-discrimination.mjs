// #566 clause 4.3 — reusable touch-swipe DISCRIMINATION experiment.
// NEW evidence tooling (no leased harness touched; scripts/probe-564-geometry.mjs,
// scripts/probe-568-topband.mjs and scripts/capture-ux06.mjs remain UNMODIFIED).
// Production-preview harness (vite preview of the REAL production build) on a
// private port, the SAME authoritative sixAlarm seed as capture-ux06.mjs /
// probe-564-geometry.mjs (no generator + roads=[] => persistently overflowing
// alarm strip), phone 390x844 dpr2 EMULATED touch.
//
// The experiment that separates a GENUINE swipe from a fake auto-scroll:
//   A. baseline  — rail touch-action:pan-x (the shipped rule): a real CDP
//      Input.dispatchTouchEvent horizontal swipe scrolls the strip (delta>0).
//   B. discrimination — force the rail to touch-action:none, reset scrollLeft=0,
//      repeat the IDENTICAL real CDP swipe: native touch panning is disabled, so
//      the strip must NOT scroll (delta==0 => the real-swipe harness FAILS).
//   C. auto-scroll control — under the SAME touch-action:none, assign
//      rail.scrollLeft=400 directly: it scrolls regardless (delta>0 => an
//      auto-scroll variant PASSES even where the real swipe fails). This is the
//      fake a reviewer must not accept as a swipe.
//   D. restoration — remove the inline override (back to stylesheet pan-x),
//      reset, real CDP swipe scrolls again (delta>0).
// Reports BOTH decisive numbers (real-swipe-under-none vs auto-scroll-under-none).
// Numeric/runtime evidence only (PASS_NUMERIC_ONLY) — phone EMULATED, one headless
// Chromium/SwiftShader run; sponsor G1 (#276) and handset (#268/#275) remain owed.
import {chromium} from "playwright-core";
import {createGame,snapshot} from "../src/simulation.js";
import {SAVE_KEY} from "../src/content.js";
import {spawn,execSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT=resolve(process.env.RUSTWAKE_CAPTURE_OUT||"docs/evidence/566-alarm-severity/swipe-discrimination");
const PORT=Number(process.env.RUSTWAKE_PREVIEW_PORT)||4199,HOST=`http://127.0.0.1:${PORT}/rustwake/`;
const SHA=(()=>{try{return execSync("git rev-parse HEAD",{encoding:"utf8"}).trim();}catch{return process.env.GITHUB_SHA||"local";}})();
const report={version:1,issue:566,task:"clause 4.3 touch-swipe discrimination: real CDP swipe FAILS under touch-action:none while auto-scroll PASSES",
 build:"production-preview",source_sha:SHA,started:new Date().toISOString(),phone:{},status:"UNKNOWN",errors:[],
 limitations:[
  "One headless Chromium/SwiftShader run; phone 390x844 is EMULATED (isMobile+hasTouch+dpr2), not a physical handset (#268/#275 owed)",
  "PASS_NUMERIC_ONLY: scrollLeft deltas do not certify visual fidelity — sponsor visual review at G1 (#276) is still owed",
  "Local production preview only — no hosted-deployment receipt; branch CI green is not a production release",
  "New evidence tooling for #566; probe-564-geometry.mjs, probe-568-topband.mjs and capture-ux06.mjs are run UNMODIFIED elsewhere"]};
let child,browser,anyFail=false;
await mkdir(OUT,{recursive:true});

function sixAlarmGame(){const g=createGame();g.buildings=g.buildings.filter(b=>b.type!=="generator");g.roads=[];return g;}
const SAVE=snapshot(sixAlarmGame());
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
 // Served-bundle hard gate: the CSS actually served must carry the phone alarm-rail
 // pan-x rule AND the #568 geometry markers, or we would measure a foreign build.
 {
  const html=await (await fetch(HOST,{signal:AbortSignal.timeout(5000)})).text();
  const hrefs=[...html.matchAll(/href="([^"]+\.css)"/g)].map(m=>m[1]);
  let served=null;
  for(const h of hrefs){
   const t=await (await fetch(new URL(h,HOST),{signal:AbortSignal.timeout(5000)})).text();
   if(t.includes("touch-action:pan-x")&&t.includes("grid-template-rows:30px 44px")&&t.includes("top:156px")){served=h;break;}
  }
  if(!served)throw Error("served CSS on "+PORT+" lacks the phone alarm-rail pan-x rule / #568 markers — stale or foreign build; refusing to measure");
  report.servedCss=served;
 }
 browser=await chromium.launch({headless:true,args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:"reduce"});
 await ctx.addInitScript(seedScript(JSON.stringify(SAVE)));
 const page=await ctx.newPage();
 const errs=[];
 page.on("pageerror",e=>errs.push(String(e)));
 page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text().slice(0,300));});
 await page.goto(HOST,{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator(".world-canvas").waitFor({state:"visible",timeout:30000});
 await page.waitForFunction(()=>document.querySelector(".world-canvas")?.dataset.world3d==="ready",null,{timeout:20000});
 await page.locator('[data-testid="alarm-rail"]').waitFor({state:"visible",timeout:15000});
 await page.waitForTimeout(900);

 const rail=page.locator('[data-testid="alarm-rail"]');
 const railBox=await rail.boundingBox();
 const chipCount=await page.locator(".alarm-rail .alarm-chip, .alarm-rail .alarm-summary").count();
 const overflow=await rail.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,touchAction:getComputedStyle(el).touchAction}));
 report.phone={viewport:{width:390,height:844},railBox,chipCount,overflow,phases:{}};
 if(chipCount<1)throw Error("alarm rail rendered no chips — cannot run swipe discrimination");
 if(!(overflow.scrollWidth>overflow.clientWidth))throw Error("sixAlarm rail does not overflow — swipe discrimination needs a scrollable strip: "+JSON.stringify(overflow));
 if(overflow.touchAction!=="pan-x")throw Error("shipped phone alarm-rail touch-action is not pan-x: "+overflow.touchAction);

 const cdp=await ctx.newCDPSession(page);
 // IDENTICAL genuine CDP touch swipe used in every phase (no scrollLeft= here).
 const realSwipe=async()=>{
  const sy=railBox.y+railBox.height/2,sx=railBox.x+railBox.width-40;
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:sx,y:sy,id:1}]});
  for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:sx-30*i,y:sy,id:1}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await page.waitForTimeout(350);
 };
 const scrollLeft=()=>rail.evaluate(el=>el.scrollLeft);
 const setTouchAction=(v)=>rail.evaluate((el,v)=>{el.style.touchAction=v;},v);
 const shot=async(label)=>{const f=`phone-${label}.png`;await page.screenshot({path:resolve(OUT,f),fullPage:false,animations:"disabled"});return f;};

 // A. baseline pan-x: real swipe scrolls.
 await setTouchAction("");await rail.evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(120);
 let before=await scrollLeft();await realSwipe();let after=await scrollLeft();
 const A={touchAction:await rail.evaluate(el=>getComputedStyle(el).touchAction),scrollBefore:before,scrollAfter:after,delta:after-before};
 report.phone.phases.A_realSwipe_panX=A;report.phone.screenshots=[await shot("A-pan-x-real-swipe")];

 // B. discrimination: touch-action:none, IDENTICAL real swipe must NOT scroll.
 await setTouchAction("none");await rail.evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(120);
 before=await scrollLeft();await realSwipe();after=await scrollLeft();
 const B={touchAction:await rail.evaluate(el=>getComputedStyle(el).touchAction),scrollBefore:before,scrollAfter:after,delta:after-before};
 report.phone.phases.B_realSwipe_none=B;report.phone.screenshots.push(await shot("B-none-real-swipe"));

 // C. auto-scroll control under the SAME none: direct scrollLeft assignment scrolls.
 await rail.evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(120);
 before=await scrollLeft();await rail.evaluate(el=>{el.scrollLeft=400;});await page.waitForTimeout(120);after=await scrollLeft();
 const C={touchAction:await rail.evaluate(el=>getComputedStyle(el).touchAction),method:"scrollLeft=400 (auto-scroll, NOT a swipe)",scrollBefore:before,scrollAfter:after,delta:after-before};
 report.phone.phases.C_autoScroll_none=C;report.phone.screenshots.push(await shot("C-none-auto-scroll"));

 // D. restoration: remove override (stylesheet pan-x), real swipe scrolls again.
 await setTouchAction("");await rail.evaluate(el=>{el.scrollLeft=0;});await page.waitForTimeout(120);
 before=await scrollLeft();await realSwipe();after=await scrollLeft();
 const D={touchAction:await rail.evaluate(el=>getComputedStyle(el).touchAction),scrollBefore:before,scrollAfter:after,delta:after-before};
 report.phone.phases.D_realSwipe_restored=D;report.phone.screenshots.push(await shot("D-restored-real-swipe"));
 await cdp.detach();

 report.discrimination={
  realSwipe_under_none_delta:B.delta,autoScroll_under_none_delta:C.delta,
  realSwipe_under_panX_delta:A.delta,realSwipe_restored_delta:D.delta,
  realSwipeFailsUnderNone:B.delta===0,autoScrollPassesUnderNone:C.delta>0,
  genuineSwipeWorksUnderPanX:A.delta>0,restorationWorks:D.delta>0};
 const fails=[];
 if(!(A.delta>0))fails.push("A: genuine CDP swipe did not scroll under shipped pan-x: "+JSON.stringify(A));
 if(!(B.delta===0))fails.push("B: real CDP swipe STILL scrolled under touch-action:none (harness is not a genuine native swipe): "+JSON.stringify(B));
 if(!(C.delta>0))fails.push("C: auto-scroll did not scroll under touch-action:none: "+JSON.stringify(C));
 if(!(D.delta>0))fails.push("D: restoration to pan-x did not re-enable genuine swipe: "+JSON.stringify(D));
 report.phone.failures=fails;
 if(errs.length){report.errors.push("phone console/page errors: "+JSON.stringify(errs));anyFail=true;}
 if(fails.length){report.errors.push("discrimination failures:\n"+fails.join("\n"));anyFail=true;}
 await ctx.close();
 report.status=anyFail?"FAIL":"PASS_NUMERIC_ONLY";
 if(anyFail)process.exitCode=1;
}catch(e){report.errors.push(String(e.stack||e));report.status="FAIL";process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(child){try{execSync("taskkill /PID "+child.pid+" /T /F",{stdio:"ignore"});}catch{try{child.kill("SIGKILL");}catch{}}}
 report.completed=new Date().toISOString();
 await writeFile(resolve(OUT,"report.json"),JSON.stringify(report,null,2)+"\n");
 console.log("#566 swipe discrimination:",report.status,OUT);
 console.log(JSON.stringify(report.discrimination||{},null,1));
 if(report.errors.length)console.error(report.errors.join("\n"));
}
