// ART-07 (#353) production-build yard terrain / scenery capture. NEW script —
// does not modify capture-v2.mjs, capture-art.mjs, capture-crane.mjs,
// capture-rigs.mjs or capture-fleet.mjs.
// Run AFTER `pnpm build`: spawns vite preview, one Chromium, sequential contexts.
//
// Evidence produced (docs/evidence/353-art-07 by default, per-SHA suffixed PNGs):
//  - desktop 1440x900 + phone 390x844 dpr2 FRESH-SAVE landing (default iso yaw 45),
//    yard-wide frame showing the exterior landmark belt, wreck-cell detail frame,
//    orbit frame (yaw 135) for foreground/background depth, exterior shed/silo
//    landmark frame,
//  - build-ghost negative state: in build mode (key "2") hovering the wreck rock
//    cell renders the RED invalid ghost (region chroma R-G rises vs the same
//    camera in select mode) and tapping it stamps lastSiteOk=false /
//    lastSiteCode=TERRAIN; hovering a graded pad cell renders the GREEN valid
//    ghost (region G>R) and tapping it builds (lastSiteOk=true, machineCount+1)
//    while sceneryHidden stays "0" — legal construction never hides scenery,
//  - scenery stamps: seed 4073, 27 props / 177 rubble / 233 decals, hidden "0"
//    on the fresh save and constant over time (static scenery, no per-frame
//    churn) while truck1Dist keeps accruing (simulation untouched),
//  - #307 camera invariants: landing yaw/elevation, synchronous stamp==applied
//    zoom via the visible Zoom in control, single WebGL canvas, no document
//    scroll, applyCamera/stampCamera method-body sha256-16 hashes,
//  - every PNG is decoded (8-bit truecolor): dimensions == viewport*dpr,
//    distinct-color / luminance-variance non-blank stats.
//
// Numeric smoke only — NOT visual approval; independent reviewer/product and
// sponsor G1 (#276) visual review of the deployed build are still required.
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import {SCHEMA_ID} from "../src/voxelSchema.js";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};
const {DEFAULT_YARD_SEED, yardSceneryPlan, validateSceneryPlan} = await import("../src/world.js");

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/353-art-07");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4177);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SOURCE_SHA = process.env.RUSTWAKE_SOURCE_SHA || process.env.GITHUB_SHA || "local";
const SUFFIX = SOURCE_SHA === "local" ? "local" : SOURCE_SHA.slice(0, 8);
// Seed-4073 interior wreck cell (rock, checkSite TERRAIN) + a fresh-save
// buildable graded pad cell for the salvager default blueprint (verified in
// tests/yardScenery.test.mjs against the real gridOccupancy validator).
const WRECK_CELL = {x: 19, z: 6};
const PAD_CELL = {x: 17, z: 4};
const cellWorld = c => ({x: (c.x - 12 + .5) * 3.5, z: (c.z - 12 + .5) * 3.5});
const WRECK_W = cellWorld(WRECK_CELL), PAD_W = cellWorld(PAD_CELL);
const SHED_W = {x: -47.5, z: -23}; // exterior shed + drone pad landmark

// #307 hash guard — same extraction as tests/yardScenery.test.mjs.
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

const plan = yardSceneryPlan(DEFAULT_YARD_SEED);
const planValidation = validateSceneryPlan(plan, DEFAULT_YARD_SEED);
const kindCounts = {};
for (const p of plan.props) kindCounts[p.kind] = (kindCounts[p.kind] || 0) + 1;

const report = {
  version: 1, build: "production-preview", issue: 353, schema: SCHEMA_ID,
  source_sha: SOURCE_SHA, artifactSuffix: SUFFIX,
  started: new Date().toISOString(),
  cameraHashes,
  scenery: {
    seed: DEFAULT_YARD_SEED, props: plan.props.length, rubble: plan.rubble.length,
    decals: plan.decals.length, propKinds: kindCounts,
    planValidation, wreckCell: WRECK_CELL, padCell: PAD_CELL
  },
  views: [], status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is emulated",
    "Ghost verdicts are proven via the real lastSiteOk/lastSiteCode stamps plus region-chroma shifts in decoded PNGs; exact art parity is NOT certified",
    "Numeric smoke only (PASS_NUMERIC_ONLY) — not reviewer/product acceptance or sponsor G1 (#276) approval"
  ]
};
let child, browser;
await mkdir(OUT, {recursive: true});

// ---- Minimal PNG decode (8-bit truecolor, non-interlaced) + stats ----
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw Error("not png");
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12] !== 0) throw Error("interlaced");}
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw Error("unsupported ct=" + colorType);
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const v = raw[pos + x];
      const a = x >= ch ? row[x - ch] : 0, bb = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0;
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + bb;
      else if (f === 3) r = v + ((a + bb) >> 1);
      else {const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c);}
      row[x] = r & 255;
    }
    pos += stride;
  }
  return {w, h, ch, stride, data: out};
}
function pngStats(img) {
  const colors = new Set();
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const i = y * img.stride + x * img.ch;
    const R = img.data[i], G = img.data[i + 1], B = img.data[i + 2];
    colors.add((R << 16) | (G << 8) | B);
    const L = .2126 * R + .7152 * G + .0722 * B;
    sum += L; sum2 += L * L; n++;
  }
  const mean = sum / n;
  return {w: img.w, h: img.h, distinctColors: colors.size, lumMean: +mean.toFixed(1), lumSD: +Math.sqrt(sum2 / n - mean * mean).toFixed(1)};
}
// Mean (R-G) over a device-pixel disk — red ghost raises it, green ghost lowers it.
function regionChromaRG(img, cx, cy, radius) {
  let sum = 0, n = 0;
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(img.w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(img.h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
    const i = y * img.stride + x * img.ch;
    sum += img.data[i] - img.data[i + 1]; n++;
  }
  if (!n) throw Error("EMPTY_CHROMA_REGION");
  return +(sum / n).toFixed(2);
}

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
  world3d: c.dataset.world3d, scenerySeed: c.dataset.scenerySeed,
  sceneryProps: c.dataset.sceneryProps, sceneryRubble: c.dataset.sceneryRubble,
  sceneryDecals: c.dataset.sceneryDecals, sceneryHidden: c.dataset.sceneryHidden,
  truck1Dist: c.dataset.truck1Dist
}));
const canvasRect = page => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});
const pngs = new Map(); // name -> decoded image (for chroma comparisons)
async function shot(page, base, v) {
  const name = `${base}-${SUFFIX}.png`;
  await page.screenshot({path: resolve(OUT, name), fullPage: false, animations: "disabled"});
  const img = decodePng(await readFile(resolve(OUT, name)));
  const stats = pngStats(img);
  if (img.w !== v.viewport.width * v.dpr || img.h !== v.viewport.height * v.dpr)
    throw Error("PNG_DIMENSIONS_WRONG " + name + ": " + JSON.stringify(stats));
  if (stats.distinctColors < 200 || stats.lumSD < 8)
    throw Error("PNG_BLANK_OR_FLAT " + name + ": " + JSON.stringify(stats));
  pngs.set(name, img);
  return {name, stats};
}
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
async function zoomTo(page, world, targetZoom, minVisibleZoom) {
  let cam = await pose(page), rect = await canvasRect(page);
  let p = screenOfGround(cam, rect, world.x, world.z);
  if (p.x < 0 || p.x > rect.left + rect.width || p.y < 0 || p.y > rect.top + rect.height) {
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, minVisibleZoom);
    cam = await pose(page); rect = await canvasRect(page);
    p = screenOfGround(cam, rect, world.x, world.z);
  }
  return wheelZoomAt(page, p, targetZoom);
}
// Find a point inside the cell whose topmost element is the canvas (HUD-safe).
async function cellPoint(page, world) {
  const cam = await pose(page), rect = await canvasRect(page);
  for (const [ox, oz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = screenOfGround(cam, rect, world.x + ox, world.z + oz);
    const hit = await page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      return !!(e && e.classList && e.classList.contains("world-canvas"));
    }, [p.x, p.y]);
    if (hit) return {p, cam, rect};
  }
  throw Error("CELL_NOT_CLICKABLE: " + JSON.stringify(world));
}
const siteStamp = page => page.evaluate(() => ({
  ok: document.body.dataset.lastSiteOk, code: document.body.dataset.lastSiteCode,
  reason: document.body.dataset.lastSiteReason
}));

try {
  if (!cameraHashes.applyCamera.ok || !cameraHashes.stampCamera.ok)
    throw Error("CAMERA_HASH_DRIFT: " + JSON.stringify(cameraHashes));
  if (!planValidation.ok) throw Error("PLAN_INVALID: " + JSON.stringify(planValidation.errors));
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

  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false, detailZoom: 2.8, minVisible: .8, wideZoom: .5, landmarkZoom: 1.6},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true, detailZoom: 2.2, minVisible: .6, wideZoom: .35, landmarkZoom: 1.2}
  ]) {
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "no-preference"});
    const page = await ctx.newPage(), errs = [], failed = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await page.waitForTimeout(1100);
    const landing = await pose(page);
    const shots = {};
    shots.landing = await shot(page, v.name + "-landing", v);

    // Synchronous stamp==applied zoom via the visible Zoom in control (#307/CAM-01).
    const beforeButton = await pose(page);
    await page.getByRole("button", {name: "Zoom in"}).click();
    await page.waitForFunction(z => Number(document.querySelector(".world-canvas").dataset.cameraZoom) > z,
      beforeButton.zoom, {timeout: 8000, polling: 50});
    const buttonZoom = await pose(page);
    const appliedZoom = await page.evaluate(() => Number(document.body.dataset.lastZoomApplied));
    const stampMatchesApplied = Number.isFinite(appliedZoom) && Math.abs(buttonZoom.zoom - appliedZoom) <= 1e-6;
    if (!stampMatchesApplied) throw Error("CAMERA_STAMP_DESYNC at " + v.name);

    // Yard-wide: exterior landmark belt (containers/sheds/silos/fence/boulders).
    const rect0 = await canvasRect(page);
    const wide = await wheelZoomAt(page, {x: rect0.left + rect0.width / 2, y: rect0.top + rect0.height / 2}, v.wideZoom);
    shots.wide = await shot(page, v.name + "-yard-wide", v);

    // Wreck-cell detail (select mode, no ghost) — also the chroma baseline.
    const detail = await zoomTo(page, WRECK_W, v.detailZoom, v.minVisible);
    shots.wreckDetail = await shot(page, v.name + "-wreck-detail", v);
    const wreckPt = await cellPoint(page, WRECK_W);
    const cellPx = 3.5 * detail.zoom * v.viewport.height / 80;
    const radius = cellPx * .42 * v.dpr;
    const wreckDev = {x: wreckPt.p.x * v.dpr, y: wreckPt.p.y * v.dpr};
    const baselineRG = regionChromaRG(pngs.get(shots.wreckDetail.name), wreckDev.x, wreckDev.y, radius);

    // NEGATIVE STATE: build mode (key "2"), hover the wreck rock cell -> red
    // ghost; tap -> the real validator stamps TERRAIN (no construction).
    await page.keyboard.press("2");
    // On compact layouts the build catalog opens as a bottom sheet that can
    // cover the target cell. Collapse it through the REAL UX-07 toggle (a
    // genuine player action; camera + selection untouched) so hover/tap reach
    // the canvas. No gate is relaxed: the cell must still be canvas-topmost.
    let sheetCollapsedForTap = false;
    {
      const covered = await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y);
        return !(e && e.classList && e.classList.contains("world-canvas"));
      }, [wreckPt.p.x, wreckPt.p.y]);
      if (covered) {
        const host = page.locator('[data-testid="panel-host"]');
        if (await host.count() && await host.getAttribute("data-collapsed") === "false") {
          await page.locator('[data-testid="sheet-toggle"]').click();
          await page.waitForFunction(() => document.getElementById("context-sheet-body")?.hidden === true, null, {timeout: 5000});
          sheetCollapsedForTap = true;
        }
        const still = await page.evaluate(([x, y]) => {
          const e = document.elementFromPoint(x, y);
          return !(e && e.classList && e.classList.contains("world-canvas"));
        }, [wreckPt.p.x, wreckPt.p.y]);
        if (still) throw Error("CELL_COVERED_AFTER_SHEET_COLLAPSE at " + v.name);
      }
    }
    await page.mouse.move(wreckPt.p.x + 1, wreckPt.p.y);
    await page.mouse.move(wreckPt.p.x, wreckPt.p.y);
    await page.waitForTimeout(600);
    shots.ghostTerrain = await shot(page, v.name + "-build-ghost-terrain", v);
    const terrainRG = regionChromaRG(pngs.get(shots.ghostTerrain.name), wreckDev.x, wreckDev.y, radius);
    await page.mouse.click(wreckPt.p.x, wreckPt.p.y);
    await page.waitForTimeout(300);
    const terrainVerdict = await siteStamp(page);
    const afterReject = await pose(page);
    if (terrainVerdict.ok !== "false" || terrainVerdict.code !== "TERRAIN")
      throw Error("TERRAIN_REJECTION_NOT_STAMPED at " + v.name + ": " + JSON.stringify(terrainVerdict));
    if (afterReject.machineCount !== landing.machineCount)
      throw Error("REJECTED_TAP_BUILT at " + v.name);
    if (!(terrainRG > baselineRG + 2))
      throw Error("RED_GHOST_NOT_VISIBLE at " + v.name + ": " + JSON.stringify({baselineRG, terrainRG}));

    // POSITIVE CONTROL: graded pad cell -> green ghost; tap builds (salvager),
    // machineCount +1, sceneryHidden stays "0" (legal site hides no scenery).
    const padPt = await cellPoint(page, PAD_W);
    await page.mouse.move(padPt.p.x, padPt.p.y, {steps: 4});
    await page.waitForTimeout(600);
    shots.ghostValid = await shot(page, v.name + "-build-ghost-valid", v);
    const padDev = {x: padPt.p.x * v.dpr, y: padPt.p.y * v.dpr};
    const validRG = regionChromaRG(pngs.get(shots.ghostValid.name), padDev.x, padDev.y, radius);
    await page.mouse.click(padPt.p.x, padPt.p.y);
    await page.waitForTimeout(700);
    const padVerdict = await siteStamp(page);
    const afterBuild = await pose(page);
    shots.placed = await shot(page, v.name + "-build-placed", v);
    if (padVerdict.ok !== "true")
      throw Error("PAD_SITE_NOT_BUILDABLE at " + v.name + ": " + JSON.stringify(padVerdict));
    if (afterBuild.machineCount !== landing.machineCount + 1 || afterBuild.sceneryHidden !== "0")
      throw Error("BUILD_SIDE_EFFECT at " + v.name + ": " + JSON.stringify(afterBuild));
    if (!(validRG < 0))
      throw Error("GREEN_GHOST_NOT_VISIBLE at " + v.name + ": " + JSON.stringify({validRG}));
    await page.keyboard.press("Escape");

    // Depth: orbit to yaw 135 at detail zoom, then the exterior shed landmark.
    const orbit = await orbitTo(page, 135);
    shots.orbit = await shot(page, v.name + "-wreck-orbit135", v);
    await orbitTo(page, 45);
    const landmark = await zoomTo(page, SHED_W, v.landmarkZoom, v.wideZoom);
    shots.landmark = await shot(page, v.name + "-exterior-landmarks", v);

    // Static scenery stamps over time while the simulation keeps running.
    const stillA = await pose(page);
    await page.waitForTimeout(1600);
    const stillB = await pose(page);
    const sceneryStatic = ["scenerySeed", "sceneryProps", "sceneryRubble", "sceneryDecals", "sceneryHidden"]
      .every(k => stillA[k] === stillB[k]);
    const simRunning = Number(stillB.truck1Dist) > Number(stillA.truck1Dist);
    if (!sceneryStatic || !simRunning)
      throw Error("SCENERY_STATIC_OR_SIM_DEAD at " + v.name + ": " + JSON.stringify({stillA, stillB}));

    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    report.views.push({
      name: v.name, viewport: v.viewport, dpr: v.dpr,
      landing, wide, detail, orbit, landmark, afterReject, afterBuild,
      stampMatchesApplied, beforeButtonZoom: beforeButton.zoom, buttonZoom: buttonZoom.zoom, appliedZoom,
      ghostChroma: {baselineRG, terrainRG, validRG, radiusDevicePx: radius},
      terrainVerdict, padVerdict, sheetCollapsedForTap, sceneryStatic, simRunning,
      screenshots: shots, pageErrors: errs, failedRequests: failed, ...env
    });
    if (landing.world3d !== "ready" || landing.voxelSchema !== SCHEMA_ID || landing.machineCount !== 6 ||
      Math.abs(landing.yaw - 45) > 1e-6 || Math.abs(landing.elevation - 35.264) > 1e-6 ||
      landing.scenerySeed !== String(DEFAULT_YARD_SEED) ||
      landing.sceneryProps !== String(plan.props.length) ||
      landing.sceneryRubble !== String(plan.rubble.length) ||
      landing.sceneryDecals !== String(plan.decals.length) ||
      landing.sceneryHidden !== "0" ||
      angDiff(orbit.yaw, 135) > .5 || Math.abs(orbit.elevation - 35.264) > 1e-6 ||
      env.canvasCount !== 1 || env.documentScroll || errs.length || failed.length)
      throw Error("ART-07 capture failure at " + v.name + ": " + JSON.stringify({landing, orbit, env, errs, failed}));
    await ctx.close();
  }

  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {
  report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("ART-07 terrain production capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}