// ART-06 (#352) production-build crane mechanical-motion capture. NEW script —
// does not modify scripts/capture-v2.mjs or scripts/capture-art.mjs.
// Run AFTER `npm run build`: spawns vite preview, one Chromium, sequential contexts.
//
// Evidence produced (docs/evidence/352-art-06 by default):
//  - desktop + phone landing, front (yaw 0) / side (yaw 90) / isometric (yaw 45)
//    crane detail frames at strategic zoom (real shift+drag orbit, wheel zoom
//    anchored on the crane per CAM-03),
//  - 60s motion run with every one of the 10 lift-cycle phases captured as a
//    distinct stage frame plus a stamped timeline (cranePhase/craneTrolley/craneDrop),
//  - reduced-motion negative state: parked pose, stamps constant over time,
//  - selection proof: tapping the crane opens the inspector on HEAVY YARD CRANE,
//  - #307 camera invariants: landing yaw/elevation, synchronous stamp==applied
//    zoom, single WebGL canvas, no document scroll, method-body sha256-16 hashes.
//
// Numeric smoke only — NOT visual approval; independent reviewer/product and
// sponsor G1 visual review of the deployed build are still required.
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import crypto from "node:crypto";
import {SCHEMA_ID} from "../src/voxelSchema.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {CELL} from "../src/content.js";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
// This lets the capture share the REAL phase table/limits with the runtime and tests.
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};
const {CRANE_PHASES, CRANE_CYCLE_TOTAL, CRANE_LIMITS} = await import("../src/world.js");

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/352-art-06");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4176);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CRANE = worldFootprint("crane", 15, 5, 0); // starter crane id 5 (src/content.js)
const PHASE_NAMES = CRANE_PHASES.map(p => p.name);
const L = CRANE_LIMITS;

// #307 hash guard — same extraction as tests/craneMotion.test.mjs (definition
// anchor "name(){", brace-matched, LF-normalized, sha256(" "+body) first 16 hex).
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
  version: 1, build: "production-preview", issue: 352, schema: SCHEMA_ID,
  source_sha: process.env.RUSTWAKE_SOURCE_SHA || process.env.GITHUB_SHA || "local",
  started: new Date().toISOString(),
  cameraHashes,
  crane: {pivot: CRANE.pivot, cycleTotal: CRANE_CYCLE_TOTAL, phases: CRANE_PHASES, limits: L},
  views: [], motion: null, phoneMotion: null,
  status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is emulated",
    "V2 has no 2D fallback renderer; the reduced-motion parked pose is the negative state",
    "Numeric smoke only — not art parity, reviewer/product acceptance or sponsor G1 approval"
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
  cranePhase: c.dataset.cranePhase, craneTrolley: c.dataset.craneTrolley,
  craneDrop: c.dataset.craneDrop, craneReducedMotion: c.dataset.craneReducedMotion
}));
const canvasRect = page => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});
const craneScreen = async page => {
  const rect = await canvasRect(page), cam = await pose(page);
  return screenOfGround(cam, rect, CRANE.pivot.x, CRANE.pivot.z);
};
const shot = (page, name) => page.screenshot({path: resolve(OUT, name), fullPage: false, animations: "disabled"});

// Wrap-aware angular difference in degrees (camera yaw normalizes to [0,360)).
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// Real orbit: shift+drag. src/cameraInput.js rotate(): yaw -= dx*.42 deg/px.
// Pointer clientX is integer-quantized, so allow a 1px (.42deg) tolerance.
async function orbitTo(page, targetYaw) {
  const cam = await pose(page), rect = await canvasRect(page);
  const curYaw = ((cam.yaw + 180) % 360) - 180; // signed rep keeps drags short
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
// CAM-03 anchored wheel zoom: ratio = exp(-deltaY*.0015), ground point under cursor
// fixed. Closed-loop: touch/dpr2 contexts deliver a scaled wheel delta, so re-measure
// the stamp and correct the residual each iteration (converges for any fixed scale).
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
async function zoomToCrane(page, targetZoom, minVisibleZoom) {
  let cam = await pose(page), rect = await canvasRect(page);
  let p = screenOfGround(cam, rect, CRANE.pivot.x, CRANE.pivot.z);
  if (p.x < 0 || p.x > rect.left + rect.width || p.y < 0 || p.y > rect.top + rect.height) {
    // Crane off-screen at this zoom (phone default): zoom out at canvas center first.
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, minVisibleZoom);
    cam = await pose(page); rect = await canvasRect(page);
    p = screenOfGround(cam, rect, CRANE.pivot.x, CRANE.pivot.z);
  }
  return wheelZoomAt(page, p, targetZoom);
}

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

  // ---- Stills + reduced-motion negative + selection (desktop and phone) ----
  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false, zoom: 2.8, minVisible: .8},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true, zoom: 2.2, minVisible: .6}
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

    // Reduced-motion negative: parked pose, stamps constant over 2s.
    const parkedA = await pose(page);
    await page.waitForTimeout(2000);
    const parkedB = await pose(page);
    const parkedConstant = ["cranePhase", "craneTrolley", "craneDrop", "craneReducedMotion"]
      .every(k => parkedA[k] === parkedB[k]);
    if (parkedA.cranePhase !== "parked" || parkedA.craneReducedMotion !== "1" || !parkedConstant)
      throw Error("REDUCED_MOTION_NOT_STATIC at " + v.name + ": " + JSON.stringify({parkedA, parkedB}));

    // Synchronous stamp==applied zoom via the visible Zoom in control (#307/CAM-01).
    const beforeButton = await pose(page);
    await page.getByRole("button", {name: "Zoom in"}).click();
    await page.waitForFunction(z => Number(document.querySelector(".world-canvas").dataset.cameraZoom) > z,
      beforeButton.zoom, {timeout: 8000, polling: 50});
    const buttonZoom = await pose(page);
    const appliedZoom = await page.evaluate(() => Number(document.body.dataset.lastZoomApplied));
    const stampMatchesApplied = Number.isFinite(appliedZoom) && Math.abs(buttonZoom.zoom - appliedZoom) <= 1e-6;
    if (!stampMatchesApplied) throw Error("CAMERA_STAMP_DESYNC at " + v.name);

    // Strategic zoom anchored on the crane, then front/side/isometric orbit frames.
    const zoomed = await zoomToCrane(page, v.zoom, v.minVisible);
    const iso = await pose(page);
    await shot(page, v.name + "-crane-iso.png");
    const front = await orbitTo(page, 0);
    await shot(page, v.name + "-crane-front.png");
    const side = await orbitTo(page, 90);
    await shot(page, v.name + "-crane-side.png");
    await orbitTo(page, 45); // back to isometric for the selection frame

    // Selection proof: tap a crane footprint cell in Inspect mode. HUD cards
    // (right-rail activity feed) can overlay parts of the yard, so scan the
    // footprint cells and click the first one that hits the canvas itself.
    const rect = await canvasRect(page), cam = await pose(page);
    let anchor = null;
    for (let i = 0; i < CRANE.base.w && !anchor; i++)
      for (let j = 0; j < CRANE.base.d && !anchor; j++) {
        const p = screenOfGround(cam, rect, CRANE.min.x + CELL / 2 + i * CELL, CRANE.min.z + CELL / 2 + j * CELL);
        const hit = await page.evaluate(([x, y]) => {
          const e = document.elementFromPoint(x, y);
          return !!(e && e.classList && e.classList.contains("world-canvas"));
        }, [p.x, p.y]);
        if (hit) anchor = p;
      }
    if (!anchor) throw Error("CRANE_NOT_CLICKABLE at " + v.name + ": every footprint cell is covered by HUD");
    await page.mouse.click(anchor.x, anchor.y);
    const panel = page.locator(".inspector-panel");
    await panel.waitFor({timeout: 8000});
    await panel.getByText("Heavy Yard Crane").first().waitFor({timeout: 8000});
    const selectedText = (await panel.innerText()).replace(/\s+/g, " ").slice(0, 240);
    if (!selectedText.includes("Heavy Yard Crane") || !selectedText.includes("2×3"))
      throw Error("CRANE_SELECTION_WRONG at " + v.name + ": " + selectedText);
    await shot(page, v.name + "-crane-selected.png");

    const final = await pose(page);
    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    report.views.push({
      name: v.name, viewport: v.viewport, landing, parkedA, parkedB, parkedConstant,
      zoomed, iso, front, side, final, selectedText,
      stampMatchesApplied, beforeButtonZoom: beforeButton.zoom, buttonZoom: buttonZoom.zoom, appliedZoom,
      screenshots: {
        landing: v.name + "-landing.png", iso: v.name + "-crane-iso.png",
        front: v.name + "-crane-front.png", side: v.name + "-crane-side.png",
        selected: v.name + "-crane-selected.png"
      },
      pageErrors: errs, failedRequests: failed, ...env
    });
    if (landing.world3d !== "ready" || landing.voxelSchema !== SCHEMA_ID || landing.machineCount !== 6 ||
      Math.abs(landing.yaw - 45) > 1e-6 || Math.abs(landing.elevation - 35.264) > 1e-6 ||
      angDiff(front.yaw, 0) > .5 || angDiff(side.yaw, 90) > .5 ||
      Math.abs(iso.elevation - 35.264) > 1e-6 || env.canvasCount !== 1 || env.documentScroll ||
      errs.length || failed.length)
      throw Error("ART-06 still capture failure at " + v.name + ": " + JSON.stringify({landing, front, side, env, errs, failed}));
    await ctx.close();
  }

  // ---- 60s motion run (desktop, prefers-reduced-motion: no-preference) ----
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
      return d && d.cranePhase && d.cranePhase !== "none" && d.cranePhase !== "parked" && d.craneReducedMotion === "0";
    }, null, {timeout: 20000});
    await zoomToCrane(page, 2.8, .8);

    const motionStart = Date.now();
    const timeline = [];
    const sample = async () => {
      const s = await pose(page);
      timeline.push({t: (Date.now() - motionStart) / 1000, phase: s.cranePhase, trolley: Number(s.craneTrolley), drop: Number(s.craneDrop), reduced: s.craneReducedMotion});
      return s;
    };
    const first = await sample();
    const startIdx = PHASE_NAMES.indexOf(first.cranePhase);
    if (startIdx < 0) throw Error("Unknown crane phase at motion start: " + first.cranePhase);
    // Moving phases are captured mid-stroke by watching the stamped channel value
    // (robust to SwiftShader timer latency); constant dwells/slews by phase name.
    const MID = {
      "travel-out": {ch: "craneTrolley", a: L.trolleyMin, b: L.trolleyMax},
      "lower": {ch: "craneDrop", a: L.dropMin, b: L.dropMax},
      "raise": {ch: "craneDrop", a: L.dropMax, b: L.dropMin},
      "travel-in": {ch: "craneTrolley", a: L.trolleyMax, b: L.trolleyMin},
      "lower-drop": {ch: "craneDrop", a: L.dropMin, b: L.dropRelease},
      "raise-drop": {ch: "craneDrop", a: L.dropRelease, b: L.dropMin}
    };
    const SLEWS = new Set(["slew-to-drop", "slew-back"]);
    const stages = [];
    for (let k = 0; k < PHASE_NAMES.length; k++) {
      const idx = (startIdx + k) % PHASE_NAMES.length, name = PHASE_NAMES[idx];
      const mid = MID[name];
      let s = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (mid) {
          await page.waitForFunction(({n, ch, a, b}) => {
            const d = document.querySelector(".world-canvas").dataset;
            if (d.cranePhase !== n) return false;
            const f = (Number(d[ch]) - a) / (b - a);
            return f >= .3 && f <= .8;
          }, {n: name, ch: mid.ch, a: mid.a, b: mid.b}, {timeout: 30000, polling: 40});
        } else {
          await page.waitForFunction(n => document.querySelector(".world-canvas").dataset.cranePhase === n, name, {timeout: 30000, polling: 40});
          if (SLEWS.has(name)) await page.waitForTimeout(500); // mid-slew boom angle
        }
        s = await sample();
        if (s.phase === name) break;
      }
      if (!s || s.cranePhase !== name) throw Error("STAGE_PHASE_MISMATCH: wanted " + name + " got " + (s && s.cranePhase));
      const file = "desktop-motion-" + String(idx).padStart(2, "0") + "-" + name + ".png";
      await shot(page, file);
      stages.push({index: idx, phase: name, stamp: {phase: s.cranePhase, trolley: s.craneTrolley, drop: s.craneDrop}, screenshot: file});
      await sample();
    }
    // Guarantee a full 60s window AND a dense timeline even if stage screenshots
    // (SwiftShader) consumed most of the minute; hard cap 90s.
    while ((Date.now() - motionStart < 60000 || timeline.length < 120) && Date.now() - motionStart < 90000) {
      await page.waitForTimeout(100); await sample();
    }
    await sample();
    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    await ctx.close();

    // Assertions: full phase coverage in cyclic order, bounded continuous motion.
    const seen = [...new Set(timeline.map(s => s.phase))];
    const order = [];
    for (const s of timeline) if (order[order.length - 1] !== s.phase) order.push(s.phase);
    // Sparse samples can skip short dwells during screenshot latency, so the
    // timeline must only ever advance FORWARD around the cycle (skips allowed,
    // never backwards). The dense stage pass pins the exact adjacent order.
    let cyclic = true;
    for (let i = 1; i < order.length; i++) {
      const a = PHASE_NAMES.indexOf(order[i - 1]), b = PHASE_NAMES.indexOf(order[i]);
      const delta = (b - a + PHASE_NAMES.length) % PHASE_NAMES.length;
      // Forward 1..5 phases (sparse skips ok); a backward step yields delta 6..9.
      if (a < 0 || b < 0 || delta < 1 || delta > 5) cyclic = false;
    }
    const stagesAdjacent = stages.every((s, i) => i === 0 ||
      s.index === (stages[i - 1].index + 1) % PHASE_NAMES.length);
    const trolleys = timeline.map(s => s.trolley), drops = timeline.map(s => s.drop);
    const inBounds = trolleys.every(t => t >= L.trolleyMin - .001 && t <= L.trolleyMax + .001) &&
      drops.every(d => d >= L.dropMin - .001 && d <= L.dropMax + .001);
    // Peak smoothstep speed = 1.5x average; 2x margin over the sample interval.
    const trolleySpeed = (L.trolleyMax - L.trolleyMin) * 1.5 / 3, dropSpeed = (L.dropMax - L.dropMin) * 1.5 / 3;
    let continuous = true, maxStep = {trolley: 0, drop: 0};
    for (let i = 1; i < timeline.length; i++) {
      const dt = Math.max(.001, timeline[i].t - timeline[i - 1].t);
      const dTrolley = Math.abs(timeline[i].trolley - timeline[i - 1].trolley);
      const dDrop = Math.abs(timeline[i].drop - timeline[i - 1].drop);
      maxStep.trolley = Math.max(maxStep.trolley, dTrolley); maxStep.drop = Math.max(maxStep.drop, dDrop);
      if (dTrolley > trolleySpeed * dt * 2 + .002 || dDrop > dropSpeed * dt * 2 + .002) continuous = false;
    }
    const allReducedOff = timeline.every(s => s.reduced === "0");
    const elapsed = timeline[timeline.length - 1].t;
    const distinctTrolley = new Set(trolleys).size, distinctDrop = new Set(drops).size;
    report.motion = {
      elapsedSeconds: elapsed, samples: timeline.length, stages, seenPhases: seen,
      phaseOrderCyclic: cyclic, stagesAdjacent, inBounds, continuous, maxStep, allReducedOff,
      distinctTrolleyValues: distinctTrolley, distinctDropValues: distinctDrop,
      pageErrors: errs, failedRequests: failed, ...env, timeline
    };
    if (seen.length !== 10 || !cyclic || !stagesAdjacent || !inBounds || !continuous || !allReducedOff ||
      elapsed < 60 || timeline.length < 100 || distinctTrolley < 20 || distinctDrop < 20 ||
      env.canvasCount !== 1 || env.documentScroll || errs.length || failed.length)
      throw Error("ART-06 motion capture failure: " + JSON.stringify({seen, cyclic, stagesAdjacent, inBounds, continuous, allReducedOff, elapsed, samples: timeline.length, distinctTrolley, distinctDrop, env, errs, failed}));
  }

  // ---- Phone motion stages (no-preference): two distinct cable states ----
  {
    const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "no-preference"});
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.cranePhase && d.cranePhase !== "none" && d.cranePhase !== "parked" && d.craneReducedMotion === "0";
    }, null, {timeout: 20000});
    await zoomToCrane(page, 2.2, .6);
    const stages = [];
    for (const name of ["hook-dwell", "lower-drop"]) {
      let s = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (name === "lower-drop") // mid-stroke cable extension at the drop site
          await page.waitForFunction(() => {
            const d = document.querySelector(".world-canvas").dataset;
            return d.cranePhase === "lower-drop" && Number(d.craneDrop) >= 1.3 && Number(d.craneDrop) <= 2.2;
          }, null, {timeout: 40000, polling: 40});
        else
          await page.waitForFunction(n => document.querySelector(".world-canvas").dataset.cranePhase === n, name, {timeout: 40000, polling: 40});
        s = await pose(page);
        if (s.cranePhase === name) break;
      }
      if (!s || s.cranePhase !== name) throw Error("PHONE_STAGE_MISMATCH: wanted " + name + " got " + (s && s.cranePhase));
      const file = "phone-motion-" + name + ".png";
      await shot(page, file);
      stages.push({phase: name, stamp: {phase: s.cranePhase, trolley: s.craneTrolley, drop: s.craneDrop}, screenshot: file});
    }
    await ctx.close();
    report.phoneMotion = {stages, pageErrors: errs};
    if (errs.length) throw Error("Phone motion page errors: " + errs.join("; "));
  }

  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {
  report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("ART-06 crane production capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
