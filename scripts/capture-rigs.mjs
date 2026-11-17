// ART-05 (#351) production-build vehicle/crew rig capture. NEW script — does not
// modify scripts/capture-v2.mjs, capture-art.mjs or capture-crane.mjs.
// Run AFTER `pnpm build`: spawns vite preview, one Chromium, sequential contexts.
//
// Evidence produced (docs/evidence/351-art-05 by default):
//  - desktop 1440x900 + phone 390x844 landing, front (yaw 0) / side (yaw 90) /
//    isometric (yaw 45) rig detail frames at strategic zoom anchored on the depot
//    staging area (real shift+drag orbit, CAM-03 anchored wheel zoom),
//  - LOD tier frames: detail (tier 0), silhouette (tier 1), proxy (tier 2) with
//    rigLod stamp asserts at each tier, plus a yard-wide frame showing the drone
//    over its real active-cycle anchor and the worker scale references,
//  - 30s motion timeline: truck1Wheel == truck1Dist / 0.3 (stamp rounding tol),
//    monotonic real distance, forklift lift responding to real truck proximity,
//    droneAnchor naming a genuinely cycling building, loaded vs EMPTY freight
//    frames keyed off the real freightLoaded stamp,
//  - reduced-motion negative: wheel/steer/forks parked (constant stamps) while
//    truck1Dist still accrues (sim/transport timing untouched),
//  - selection proof: clicking the depot opens the inspector on Freight Depot —
//    decorative crew never blocks machine picking,
//  - #307 camera invariants: landing yaw/elevation, synchronous stamp==applied
//    zoom, single WebGL canvas, no document scroll, method-body sha256-16 hashes.
//
// Numeric smoke only — NOT visual approval; independent reviewer/product and
// sponsor G1 (#276) visual review of the deployed build are still required.
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import crypto from "node:crypto";
import {SCHEMA_ID, rigLodTier, cellProjectedCssPx} from "../src/voxelSchema.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {CELL} from "../src/content.js";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};
const {TRUCK_WHEEL_RADIUS, FORKLIFT_POST} = await import("../src/world.js");

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/351-art-05");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4177);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DEPOT = worldFootprint("depot", 13, 9, 0); // starter depot id 2 (src/content.js)
// Depot staging area: initial truck queue (x 11, z 10..12) + forklift bay post.
const ANCHOR = {x: 2, z: -4};
const WHEEL_TOL = 0.01; // both stamps are toFixed(3): max rounding error ~0.0022

// #307 hash guard — same extraction as tests/vehicleRigs.test.mjs.
const worldSrc = (await readFile(resolve("src/world.js"), "utf8")).replace(/\r\n/g, "\n");
const methodBody = name => {
  const start = worldSrc.indexOf(name + "(){");
  if (start < 0) throw Error(name + " missing from src/world.js");
  let depth = 0, j = worldSrc.indexOf("{", start);
  for (; j < worldSrc.length; j++) {
    if (worldSrc[j] === "{") depth++;
    else if (worldSrc[j] === "}") {depth--; if (depth === 0) {j++; break;}}
  }
  return worldSrc.slice(start, j);
};
const cameraHashes = {};
for (const [name, expected] of [["applyCamera", "f3afa5479a66b97e"], ["stampCamera", "691b3c0a3480e97b"]]) {
  const actual = crypto.createHash("sha256").update(" " + methodBody(name)).digest("hex").slice(0, 16);
  cameraHashes[name] = {expected, actual, ok: actual === expected};
}

const report = {
  version: 1, build: "production-preview", issue: 351, schema: SCHEMA_ID,
  source_sha: process.env.RUSTWAKE_SOURCE_SHA || process.env.GITHUB_SHA || "local",
  started: new Date().toISOString(),
  cameraHashes,
  rigs: {
    wheelRadius: TRUCK_WHEEL_RADIUS, forkliftPost: FORKLIFT_POST, anchor: ANCHOR,
    depotPivot: DEPOT.pivot,
    lodThresholds: {detailMinCellPx: 26, blockMinCellPx: 12}
  },
  views: [], motion: null, phoneMotion: null,
  status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is emulated",
    "Cargo visibility is proven via the real freightLoaded/freightOnboard stamps and Node ledger tests; the renderer scene graph is not exposed to the page",
    "Numeric smoke only — not art parity, reviewer/product acceptance or sponsor G1 (#276) approval"
  ]
};
let child, browser;
await mkdir(OUT, {recursive: true});

// Inverse of src/camera.js groundAtScreen: world ground point -> canvas CSS pixel.
function screenOfGround(cam, rect, wx, wz) {
  const wpp = 80 / (rect.height * cam.zoom);
  const dx = wx - cam.x, dz = wz - cam.z;
  const th = cam.yaw * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
  const u = cs * dx - sn * dz;
  const v = (-sn * dx - cs * dz) * Math.sin(cam.elevation * Math.PI / 180);
  return {x: rect.left + rect.width / 2 + u / wpp, y: rect.top + rect.height / 2 - v / wpp};
}
const pose = page => page.locator(".world-canvas").evaluate(c => ({
  yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
  zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
  voxelSchema: c.dataset.voxelSchema, machineCount: Number(c.dataset.machineCount),
  world3d: c.dataset.world3d,
  freightLoaded: c.dataset.freightLoaded, freightOnboard: c.dataset.freightOnboard,
  rigLod: c.dataset.rigLod, rigReducedMotion: c.dataset.rigReducedMotion,
  truck1Dist: c.dataset.truck1Dist, truck1Wheel: c.dataset.truck1Wheel, truck1Cargo: c.dataset.truck1Cargo,
  forkliftLift: c.dataset.forkliftLift, droneAnchor: c.dataset.droneAnchor
}));
const canvasRect = page => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});
const shot = (page, name) => page.screenshot({path: resolve(OUT, name), fullPage: false, animations: "disabled"});

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// Real orbit: shift+drag. src/cameraInput.js rotate(): yaw -= dx*.42 deg/px.
async function orbitTo(page, targetYaw) {
  const cam = await pose(page), rect = await canvasRect(page);
  const curYaw = ((cam.yaw + 180) % 360) - 180;
  const dx = (curYaw - targetYaw) / .42;
  const sx = rect.left + rect.width * .6, sy = rect.top + rect.height * .5;
  await page.keyboard.down("Shift");
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx, sy, {steps: 16});
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.waitForFunction(t => Math.abs(((Number(document.querySelector(".world-canvas").dataset.cameraYaw) - t + 540) % 360) - 180) < .5,
    targetYaw, {timeout: 8000, polling: 50});
  await page.waitForTimeout(250);
  return pose(page);
}
// CAM-03 anchored wheel zoom, closed-loop (touch/dpr2 contexts scale wheel deltas).
async function wheelZoomAt(page, point, targetZoom) {
  await page.mouse.move(point.x, point.y);
  let zoom = (await pose(page)).zoom;
  for (let i = 0; i < 24 && Math.abs(zoom - targetZoom) > 1e-4; i++) {
    await page.mouse.wheel(0, -Math.log(targetZoom / zoom) / .0015);
    await page.waitForTimeout(120);
    zoom = (await pose(page)).zoom;
  }
  if (Math.abs(zoom - targetZoom) > 1e-3)
    throw Error("ZOOM_TARGET_NOT_REACHED: wanted " + targetZoom + " got " + zoom);
  await page.waitForTimeout(200);
  return pose(page);
}
async function zoomToAnchor(page, targetZoom, minVisibleZoom) {
  let cam = await pose(page), rect = await canvasRect(page);
  let p = screenOfGround(cam, rect, ANCHOR.x, ANCHOR.z);
  if (p.x < 0 || p.x > rect.left + rect.width || p.y < 0 || p.y > rect.top + rect.height) {
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, minVisibleZoom);
    cam = await pose(page); rect = await canvasRect(page);
    p = screenOfGround(cam, rect, ANCHOR.x, ANCHOR.z);
  }
  return wheelZoomAt(page, p, targetZoom);
}
const wheelVsDist = s => Math.abs(Number(s.truck1Wheel) - Number(s.truck1Dist) / TRUCK_WHEEL_RADIUS);

try {
  if (!cameraHashes.applyCamera.ok || !cameraHashes.stampCamera.ok)
    throw Error("CAMERA_HASH_DRIFT: " + JSON.stringify(cameraHashes));
  child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {stdio: ["ignore", "pipe", "pipe"]});
  child.stdout.on("data", () => {});
  child.stderr.on("data", d => report.errors.push("preview: " + d.toString().slice(0, 400)));
  let open = false;
  for (let i = 0; i < 70; i++) {
    try {const r = await fetch(HOST, {signal: AbortSignal.timeout(2000)}); if (r.ok) {open = true; break;}} catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  if (!open) throw Error("Production preview did not become available");
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});

  // ---- Stills + reduced-motion negative + LOD tiers + selection (desktop/phone) ----
  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false, zoom: 2.8, minVisible: .8, tier1Zoom: .5, tier2Zoom: .2, wideZoom: 1.0},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true, zoom: 2.2, minVisible: .6, tier1Zoom: .35, tier2Zoom: .2, wideZoom: .6}
  ]) {
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "reduce"});
    const page = await ctx.newPage(), errs = [], failed = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await page.waitForTimeout(1100);
    const landing = await pose(page);
    await shot(page, v.name + "-landing.png");

    // Reduced-motion negative: articulation stamps constant over 2s while the
    // real simulation keeps moving the truck (distance may accrue, wheel parked).
    const parkedA = await pose(page);
    await page.waitForTimeout(2000);
    const parkedB = await pose(page);
    const parkedConstant = ["truck1Wheel", "forkliftLift", "rigReducedMotion", "rigLod"]
      .every(k => parkedA[k] === parkedB[k]);
    const simStillRunning = Number(parkedB.truck1Dist) >= Number(parkedA.truck1Dist);
    if (parkedA.rigReducedMotion !== "1" || !parkedConstant || !simStillRunning || Number(parkedA.truck1Wheel) !== 0)
      throw Error("REDUCED_MOTION_NOT_PARKED at " + v.name + ": " + JSON.stringify({parkedA, parkedB}));

    // Synchronous stamp==applied zoom via the visible Zoom in control (#307/CAM-01).
    const beforeButton = await pose(page);
    await page.getByRole("button", {name: "Zoom in"}).click();
    await page.waitForFunction(z => Number(document.querySelector(".world-canvas").dataset.cameraZoom) > z,
      beforeButton.zoom, {timeout: 8000, polling: 50});
    const buttonZoom = await pose(page);
    const appliedZoom = await page.evaluate(() => Number(document.body.dataset.lastZoomApplied));
    const stampMatchesApplied = Number.isFinite(appliedZoom) && Math.abs(buttonZoom.zoom - appliedZoom) <= 1e-6;
    if (!stampMatchesApplied) throw Error("CAMERA_STAMP_DESYNC at " + v.name);

    // Strategic zoom anchored on the depot staging area; front/side/iso frames.
    const zoomed = await zoomToAnchor(page, v.zoom, v.minVisible);
    if (zoomed.rigLod !== "0") throw Error("DETAIL_TIER_EXPECTED at " + v.name + ": " + zoomed.rigLod);
    const iso = await pose(page);
    await shot(page, v.name + "-rigs-iso.png");
    const front = await orbitTo(page, 0);
    await shot(page, v.name + "-rigs-front.png");
    const side = await orbitTo(page, 90);
    await shot(page, v.name + "-rigs-side.png");
    await orbitTo(page, 45);

    // LOD tier frames with exact projected-cell math + stamp asserts.
    const rect = await canvasRect(page);
    const anchorPoint = screenOfGround(await pose(page), rect, ANCHOR.x, ANCHOR.z);
    const tier1 = await wheelZoomAt(page, anchorPoint, v.tier1Zoom);
    const tier1Expected = String(rigLodTier(v.tier1Zoom, v.viewport.height));
    if (tier1.rigLod !== tier1Expected || tier1Expected !== "1")
      throw Error("LOD_TIER1_MISMATCH at " + v.name + ": " + JSON.stringify({tier1, tier1Expected}));
    await shot(page, v.name + "-lod-tier1.png");
    const tier2 = await wheelZoomAt(page, anchorPoint, v.tier2Zoom);
    if (tier2.rigLod !== "2") throw Error("LOD_TIER2_MISMATCH at " + v.name + ": " + tier2.rigLod);
    await shot(page, v.name + "-lod-tier2.png");
    const wide = await wheelZoomAt(page, anchorPoint, v.wideZoom);
    await shot(page, v.name + "-yard-wide.png");
    await zoomToAnchor(page, v.zoom, v.minVisible); // back to detail for selection

    // Selection proof: click the depot footprint (decorative crew must not block
    // machine picking). Scan sub-cell points in case HUD cards overlay the center.
    const cam2 = await pose(page), rect2 = await canvasRect(page);
    let anchor = null;
    for (const [ox, oz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = screenOfGround(cam2, rect2, DEPOT.pivot.x + ox, DEPOT.pivot.z + oz);
      const hit = await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y);
        return !!(e && e.classList && e.classList.contains("world-canvas"));
      }, [p.x, p.y]);
      if (hit) {anchor = p; break;}
    }
    if (!anchor) throw Error("DEPOT_NOT_CLICKABLE at " + v.name + ": footprint covered by HUD");
    await page.mouse.click(anchor.x, anchor.y);
    const panel = page.locator(".inspector-panel");
    await panel.waitFor({timeout: 8000});
    await panel.getByText("Freight Depot").first().waitFor({timeout: 8000});
    const selectedText = (await panel.innerText()).replace(/\s+/g, " ").slice(0, 240);
    if (!selectedText.includes("Freight Depot"))
      throw Error("DEPOT_SELECTION_WRONG at " + v.name + ": " + selectedText);
    await shot(page, v.name + "-depot-selected.png");

    const final = await pose(page);
    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    report.views.push({
      name: v.name, viewport: v.viewport, landing, parkedA, parkedB, parkedConstant, simStillRunning,
      zoomed, iso, front, side, tier1, tier2, wide, final, selectedText,
      tier1CellPx: cellProjectedCssPx(v.tier1Zoom, v.viewport.height),
      tier2CellPx: cellProjectedCssPx(v.tier2Zoom, v.viewport.height),
      stampMatchesApplied, beforeButtonZoom: beforeButton.zoom, buttonZoom: buttonZoom.zoom, appliedZoom,
      screenshots: {
        landing: v.name + "-landing.png", iso: v.name + "-rigs-iso.png",
        front: v.name + "-rigs-front.png", side: v.name + "-rigs-side.png",
        tier1: v.name + "-lod-tier1.png", tier2: v.name + "-lod-tier2.png",
        wide: v.name + "-yard-wide.png", selected: v.name + "-depot-selected.png"
      },
      pageErrors: errs, failedRequests: failed, ...env
    });
    if (landing.world3d !== "ready" || landing.voxelSchema !== SCHEMA_ID || landing.machineCount !== 6 ||
      Math.abs(landing.yaw - 45) > 1e-6 || Math.abs(landing.elevation - 35.264) > 1e-6 ||
      angDiff(front.yaw, 0) > .5 || angDiff(side.yaw, 90) > .5 ||
      Math.abs(iso.elevation - 35.264) > 1e-6 || env.canvasCount !== 1 || env.documentScroll ||
      errs.length || failed.length)
      throw Error("ART-05 still capture failure at " + v.name + ": " + JSON.stringify({landing, front, side, env, errs, failed}));
    await ctx.close();
  }

  // ---- 30s motion run (desktop, prefers-reduced-motion: no-preference) ----
  {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, reducedMotion: "no-preference"});
    const page = await ctx.newPage(), errs = [], failed = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.rigReducedMotion === "0" && d.truck1Dist !== undefined;
    }, null, {timeout: 20000});
    // EMPTY-tray frame BEFORE any zoom latency: truck 1 starts with no real cargo.
    const emptyState = await pose(page);
    if (emptyState.truck1Cargo !== "none" || emptyState.freightLoaded !== "0")
      throw Error("EXPECTED_EMPTY_TRAY_AT_START: " + JSON.stringify({cargo: emptyState.truck1Cargo, loaded: emptyState.freightLoaded}));
    await shot(page, "desktop-motion-empty.png");
    await zoomToAnchor(page, 2.8, .8);

    const motionStart = Date.now();
    const timeline = [];
    const sample = async () => {
      const s = await pose(page);
      timeline.push({
        t: (Date.now() - motionStart) / 1000, dist: Number(s.truck1Dist), wheel: Number(s.truck1Wheel),
        lift: Number(s.forkliftLift), anchor: s.droneAnchor, loaded: Number(s.freightLoaded),
        onboard: Number(s.freightOnboard), cargo: s.truck1Cargo, lod: s.rigLod, reduced: s.rigReducedMotion
      });
      return s;
    };
    await sample();
    // LOADED frame: wait for truck 1's REAL onboard cargo signature, then capture.
    await page.waitForFunction(() => document.querySelector(".world-canvas").dataset.truck1Cargo !== "none", null, {timeout: 60000, polling: 100});
    const loadedState = await sample();
    await shot(page, "desktop-motion-loaded.png");
    // Second empty frame after truck 1's real drop-off proves the crate lifecycle
    // closes (per-truck stamp: fleet-wide freightLoaded can stay >0 via siblings).
    await page.waitForFunction(() => document.querySelector(".world-canvas").dataset.truck1Cargo === "none", null, {timeout: 90000, polling: 100});
    const droppedState = await sample();
    await shot(page, "desktop-motion-dropped.png");

    while (Date.now() - motionStart < 30000 && timeline.length < 400) {
      await page.waitForTimeout(100); await sample();
    }
    await sample();
    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    await ctx.close();

    // Assertions: wheel == distance/radius within stamp rounding, monotonic real
    // distance, lift bounded and actually responsive, drone anchored to a real
    // cycling building, all samples at detail tier with reduced motion off.
    let wheelTracksDist = true, maxWheelErr = 0, monotonic = true;
    for (let i = 0; i < timeline.length; i++) {
      const s = timeline[i];
      const err = Math.abs(s.wheel - s.dist / TRUCK_WHEEL_RADIUS);
      maxWheelErr = Math.max(maxWheelErr, err);
      if (err > WHEEL_TOL) wheelTracksDist = false;
      if (i > 0 && (s.dist < timeline[i - 1].dist - 1e-9 || s.wheel < timeline[i - 1].wheel - 1e-9)) monotonic = false;
    }
    const distanceGrew = timeline[timeline.length - 1].dist - timeline[0].dist;
    const distinctWheel = new Set(timeline.map(s => s.wheel)).size;
    const lifts = timeline.map(s => s.lift);
    const liftBounded = lifts.every(l => l >= 0 && l <= .75 + 1e-9);
    const liftResponsive = new Set(lifts).size >= 2 && Math.max(...lifts) > 0;
    const anchors = [...new Set(timeline.map(s => s.anchor))];
    const droneAnchored = anchors.some(a => a !== "none");
    const allDetail = timeline.every(s => s.lod === "0");
    const allReducedOff = timeline.every(s => s.reduced === "0");
    const cargoCycle = {empty: emptyState.truck1Cargo, loaded: loadedState.truck1Cargo, onboard: loadedState.freightOnboard, dropped: droppedState.truck1Cargo};
    const elapsed = timeline[timeline.length - 1].t;
    report.motion = {
      elapsedSeconds: elapsed, samples: timeline.length,
      wheelTracksDist, maxWheelErr, monotonic, distanceGrew, distinctWheelValues: distinctWheel,
      liftBounded, liftResponsive, maxLift: Math.max(...lifts), droneAnchors: anchors, droneAnchored,
      allDetail, allReducedOff, cargoCycle,
      screenshots: {empty: "desktop-motion-empty.png", loaded: "desktop-motion-loaded.png", dropped: "desktop-motion-dropped.png"},
      pageErrors: errs, failedRequests: failed, ...env, timeline
    };
    if (!wheelTracksDist || !monotonic || distanceGrew < 5 || distinctWheel < 20 ||
      !liftBounded || !liftResponsive || !droneAnchored || !allDetail || !allReducedOff ||
      cargoCycle.loaded === "none" || cargoCycle.onboard < 1 || cargoCycle.dropped !== "none" ||
      elapsed < 30 || timeline.length < 100 ||
      env.canvasCount !== 1 || env.documentScroll || errs.length || failed.length)
      throw Error("ART-05 motion capture failure: " + JSON.stringify({wheelTracksDist, maxWheelErr, monotonic, distanceGrew, distinctWheel, liftBounded, liftResponsive, droneAnchors, allDetail, allReducedOff, cargoCycle, elapsed, samples: timeline.length, env, errs, failed}));
  }

  // ---- Phone motion (no-preference): loaded frame + wheel/distance consistency ----
  {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "no-preference"});
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await zoomToAnchor(page, 2.2, .6);
    await page.waitForFunction(() => Number(document.querySelector(".world-canvas").dataset.freightLoaded) >= 1, null, {timeout: 60000, polling: 100});
    const loaded = await pose(page);
    await shot(page, "phone-motion-loaded.png");
    const samples = [];
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      const s = await pose(page);
      samples.push({dist: Number(s.truck1Dist), wheel: Number(s.truck1Wheel), err: wheelVsDist(s)});
    }
    await ctx.close();
    const phoneWheelOk = samples.every(s => s.err <= WHEEL_TOL);
    report.phoneMotion = {loaded, samples, phoneWheelOk, maxErr: Math.max(...samples.map(s => s.err)), screenshot: "phone-motion-loaded.png", pageErrors: errs};
    if (!phoneWheelOk || errs.length || loaded.rigLod !== "0")
      throw Error("Phone motion capture failure: " + JSON.stringify({phoneWheelOk, errs, lod: loaded.rigLod}));
  }

  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {
  report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("ART-05 rigs production capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
