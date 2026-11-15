/**
 * #248: One browser, one independent observation of each successful deployment.
 * Runs ONLY on a GitHub-hosted runner after the trusted self-hosted deploy job.
 * Never runs repository code or launches browsers on the deployment host.
 *
 * Proof: exact live release manifest SHA + SHA256 of served assets; then a fresh
 * desktop/mobile visit with a single Chromium instance and sequential contexts.
 * Evidence is automatically uploaded by delivery.yml. Numeric smoke is not a
 * visual-fidelity verdict or sponsor approval of G1 (#151 / #244).
 */
import {createHash} from "node:crypto";
import {promises as fs} from "node:fs";
import path from "node:path";
import process from "node:process";
import {chromium} from "playwright-core";
import {auditManifest, assertBrowserObservation} from "./verify-live-helpers.mjs";

const EXPECTED_SHA = process.env.RUSTWAKE_EXPECTED_SHA || "";
const BASE = new URL(process.env.RUSTWAKE_LIVE_URL || "https://home.darkmatter2222.com/rustwake/");
const OUTPUT = path.resolve(process.env.RUSTWAKE_VERIFY_OUT || "work/live-verification");
const FETCH_TIMEOUT_MS = 20000;
const report = {
  version:1,
  expected_sha:EXPECTED_SHA,
  base_url:BASE.href,
  started_at:new Date().toISOString(),
  outcome:"UNKNOWN",
  source_identity:null,
  assets:[],
  devices:[],
  errors:[],
  visual_acceptance:"NOT_ASSERTED: screenshots require independent human/sponsor review",
  notes:[
    "Browser viewports are headless emulation, NOT actual phones.",
    "Canvas readiness and asset SHA integrity do not prove the approved isometric look, orbit controls or gameplay.",
    "A deployment verification PASS is never G1 #151 visual ACCEPT."
  ]
};
let browser;

function checkTarget() {
  if (BASE.protocol !== "https:" || BASE.hostname !== "home.darkmatter2222.com" ||
      BASE.pathname !== "/rustwake/" || BASE.username || BASE.password ||
      BASE.search || BASE.hash) {
    throw new Error("Unexpected live verification URL; refuse untrusted target");
  }
  if (!/^[a-f0-9]{40}$/.test(EXPECTED_SHA)) {
    throw new Error("Missing expected immutable main SHA");
  }
}
async function fetchBytes(rel) {
  const url = new URL(rel, BASE);
  const res = await fetch(url, {redirect:"error", signal:AbortSignal.timeout(FETCH_TIMEOUT_MS), cache:"no-store"});
  if (!res.ok) throw new Error("Live HTTP " + res.status + " for " + rel);
  return Buffer.from(await res.arrayBuffer());
}
async function verifyServedRelease() {
  const bytes = await fetchBytes("release-manifest.json");
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Live release manifest is not valid JSON"); }
  const files = auditManifest(manifest, EXPECTED_SHA);
  report.source_identity = {expected_sha:EXPECTED_SHA,served_sha:manifest.source_sha,files:files.length,verified:true};
  for (const file of files) {
    const data = await fetchBytes(file.path);
    const digest = createHash("sha256").update(data).digest("hex");
    if (file.bytes !== data.length || file.sha256 !== digest) {
      throw new Error("SERVED_ASSET_MISMATCH: " + file.path);
    }
    report.assets.push({path:file.path,bytes:data.length,sha256:digest,match:true});
  }
}
const devices = [
  {name:"desktop",viewport:{width:1440,height:900},deviceScaleFactor:1,isMobile:false,hasTouch:false},
  {name:"phone-emulation",viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}
];
async function visit(device) {
  const context = await browser.newContext({
    viewport:device.viewport,
    deviceScaleFactor:device.deviceScaleFactor,
    isMobile:device.isMobile,
    hasTouch:device.hasTouch,
    reducedMotion:"reduce"
  });
  const entry = {name:device.name,viewport:device.viewport,page_errors:[],failed_assets:[],console_errors:[],screenshots:[],observation:null,roads_control:null};
  report.devices.push(entry);
  let page;
  try {
    page = await context.newPage();
    page.on("pageerror", e=>entry.page_errors.push(String(e).slice(0,500)));
    page.on("console", msg=>{if(msg.type()==="error")entry.console_errors.push(msg.text().slice(0,500));});
    page.on("requestfailed", req=>{
      try {
        const u = new URL(req.url());
        if (u.origin===BASE.origin && /\.(js|css|mjs)(\?|$)/.test(u.pathname)) {
          entry.failed_assets.push(u.pathname + ": " + (req.failure()?.errorText || "failed"));
        }
      } catch { /* do not persist arbitrary malformed request URL */ }
    });
    await page.goto(BASE.href,{waitUntil:"domcontentloaded",timeout:30000});
    await page.locator(".gate__btn").waitFor({state:"visible",timeout:15000});
    await page.screenshot({path:path.join(OUTPUT,device.name+"-gate.png"),animations:"disabled"});
    entry.screenshots.push(device.name+"-gate.png");
    await page.locator(".gate__btn").click();
    await page.waitForFunction(()=>{
      const c = document.querySelector("canvas[data-world3d]");
      return c && c.dataset.world3d === "ready";
    },null,{timeout:25000});
    await page.waitForTimeout(800);
    entry.observation = await page.evaluate(()=>{
      const c = document.querySelector("canvas[data-world3d]");
      const rect = c?.getBoundingClientRect();
      const documentScroll = Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0)>window.innerHeight+2 ||
        Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)>window.innerWidth+2;
      const controls = Array.from(document.querySelectorAll("button"))
        .map(b=>(b.getAttribute("aria-label")||b.textContent||"").trim().slice(0,90))
        .filter(Boolean).slice(0,50);
      return {
        title:document.title,
        world3d:c?.dataset.world3d||"missing",
        canvasWidth:c?.width||0,
        canvasHeight:c?.height||0,
        visibleCanvas:!!rect && rect.width>100 && rect.height>100 &&
          getComputedStyle(c).display!=="none",
        documentScroll,
        cameraStamp:c?.dataset.cam||null,
        cameraYaw:"NOT_EXPOSED: require explicit yaw/elevation instrumentation in #245",
        controls
      };
    });
    await page.screenshot({path:path.join(OUTPUT,device.name+"-world.png"),animations:"disabled"});
    entry.screenshots.push(device.name+"-world.png");
    const roads = page.getByRole("button",{name:/^Roads$/i}).first();
    entry.roads_control = {found:(await roads.count())>0};
    if(entry.roads_control.found) {
      entry.roads_control.enabled = await roads.isEnabled();
      if(entry.roads_control.enabled) {
        try {
          await roads.click({timeout:5000});
          await page.screenshot({path:path.join(OUTPUT,device.name+"-roads.png"),animations:"disabled"});
          entry.screenshots.push(device.name+"-roads.png");
          entry.roads_control.clicked=true;
        } catch(e) {entry.roads_control.clicked=false;entry.roads_control.error=String(e).slice(0,350);}
      }
    }
    assertBrowserObservation(entry.observation);
    if(entry.page_errors.length)throw new Error(device.name+": uncaught page errors");
    if(entry.failed_assets.length)throw new Error(device.name+": failed game assets");
  } finally {
    await context.close();
  }
}
async function writeEvidence() {
  report.finished_at = new Date().toISOString();
  await fs.mkdir(OUTPUT,{recursive:true});
  await fs.writeFile(path.join(OUTPUT,"report.json"),JSON.stringify(report,null,2)+"\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "### Rustwake live deployment verification",
      "",
      "- Expected main SHA: "+EXPECTED_SHA,
      "- Result: **"+report.outcome+"**",
      "- Manifest/served asset integrity: "+(report.source_identity?.verified?"VERIFIED":"NOT VERIFIED"),
      "- Browser: one Chromium process, two sequential fresh contexts (desktop/phone-emulation)",
      "- 3D canvas and UI smoke: "+report.devices.map(d=>d.name+"="+(d.observation?.world3d||"UNKNOWN")).join(", "),
      "- Art/isometric/sandbox acceptance: **NOT VERIFIED** (sponsor G1 gate #151 / #244)",
      "- Evidence: attached workflow artifact",
      report.errors.length?"- Errors: "+report.errors.join("; ").slice(0,1000):""
    ].filter(Boolean);
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join("\n")+"\n");
  }
}
try {
  await fs.mkdir(OUTPUT,{recursive:true});
  checkTarget();
  await verifyServedRelease();
  browser = await chromium.launch({
    headless:true,
    args:["--enable-webgl","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
  });
  for(const device of devices)await visit(device);
  report.outcome="PASS: operational smoke only";
} catch(error) {
  report.errors.push(String(error?.stack||error).slice(0,3000));
  report.outcome="FAIL";
  process.exitCode=1;
} finally {
  try { if(browser) await browser.close(); }
  catch(e) {report.errors.push("Browser cleanup: "+String(e));report.outcome="FAIL";process.exitCode=1;}
  await writeEvidence();
  console.log("Rustwake live verification: "+report.outcome+"; "+EXPECTED_SHA+"; artifact "+OUTPUT);
  if(report.errors.length)console.error(report.errors.join("\n"));
}
