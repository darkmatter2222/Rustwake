// #580 starter-dock rendered proof — DEFAULT home camera, ZERO input.
// Refs #580. The flagship depot roller shutter never opened on a first-run
// yard: the shipped starter depot (content.js STARTER_BUILDINGS, (13,9) rot 0)
// has its LOG-02 bay approach cell at (13,10), which is NOT a road, while
// trucks routed to nearestRoad(depot)=(13,8) on the opposite side — so the
// nearest truck never came inside ART04_DOCK.far and depotDoorLift stayed 0.
// The fix (src/simulation.js dockApproach + src/fleet.js dockDeparture) gives
// depots a facing-side aligned road stop within ROAD_REACH of the bay plus a
// live off-road corridor tail, so a real freight truck parks on the bay and
// the shutter lifts on REAL nearest-truck bay distance (#274 — no timer, no
// ambient, no fake).
//
// This instrument measures the ACTUAL fresh starter yard (createGame() as
// shipped, INITIAL_BANK and tier UNTOUCHED, no seed, no gesture) at the
// DEFAULT home camera on desktop AND an emulated phone:
//   (1) a 15s real-clock watch — does the shutter EVER open on arrival?
//   (2) a real open/closed pixel pair at the home pose, compared with the
//       SAME independent pairMetrics used by scripts/capture-art04.mjs.
// Guards carried over verbatim from the ART-04 lease, INTACT:
//   MOTION_CLIP_AMPUTATED / DOCKING_CLIP_AMPUTATED — a clamped clip is missing
//     part of the rig (the shutter travels at the TOP); this REFUSES any
//     clamped clip rather than measuring an amputated region. No frameRig /
//     pan / zoom here: the home pose must stay untouched, so a clip that does
//     not fit the home frustum is a loud failure, never a silent crop.
//   SANITY_BLANK_OR_FLAT_FRAME — per-PNG unique-colour + luminance-sigma floor.
//   PREVIEW_SERVES_FOREIGN_BUILD — served entry bundle sha256 == our dist build.
//   CAMERA_HASH_DRIFT — applyCamera / stampCamera method hashes pinned.
// Numeric smoke only — PASS_NUMERIC_ONLY, never visual approval. The code
// author is not vision-capable; sponsor G1 (#276) and physical handsets
// (#268/#275) remain owed. ONE headless Chromium, sequential contexts, closed
// before exit; the preview child is killed in finally.
//
// Usage: RUSTWAKE_SOURCE_SHA=<40-hex captureHead> node scripts/capture-580-dock.mjs
//   (build first: the production preview serves dist/). Optional env:
//   RUSTWAKE_CAPTURE_OUT (default docs/evidence/580-starter-dock),
//   RUSTWAKE_PREVIEW_PORT (default 4195).
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile, readdir} from "node:fs/promises";
import {resolve} from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import {SCHEMA_ID, machineDescriptor} from "../src/voxelSchema.js";
import {worldFootprint, bayCells} from "../src/gridOccupancy.js";
import {CELL, SAVE_KEY} from "../src/content.js";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};
const {ART04_DOCK} = await import("../src/world.js");
const {createGame, nearestRoad} = await import("../src/simulation.js");

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/580-starter-dock");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4195);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SOURCE_SHA = process.env.RUSTWAKE_SOURCE_SHA || process.env.GITHUB_SHA || "local";

// The shipped starter yard, exactly as a first-run player receives it.
const starter = createGame();
const sd = starter.buildings.find(b => b.type === "depot");
const FP_DEPOT = worldFootprint("depot", sd.x, sd.z, sd.rot || 0);
const DEPOT_H = machineDescriptor("depot").bounds.height;
const bay = bayCells(sd.type, sd.x, sd.z, sd.rot || 0)[0];
const road = nearestRoad(starter, sd.x, sd.z);
const bayWorld = {x: (bay.x - 24 / 2 + .5) * CELL, z: (bay.z - 24 / 2 + .5) * CELL};
const roadWorld = road ? {x: (road.x - 24 / 2 + .5) * CELL, z: (road.z - 24 / 2 + .5) * CELL} : null;
const starterGeometry = {depot: {x: sd.x, z: sd.z, rot: sd.rot || 0}, bayCell: bay, roadCell: road,
  bayWorld, roadWorld,
  bayToRoadWorld: roadWorld ? +Math.hypot(bayWorld.x - roadWorld.x, bayWorld.z - roadWorld.z).toFixed(4) : null,
  dock: ART04_DOCK, initialBank: starter.bank, tier: starter.tier, trucks: starter.vehicles.length};

// Camera method hashes pinned to the ART-04 lease (no camera drift allowed).
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
  version: 1, build: "production-preview", issue: 580, schema: SCHEMA_ID,
  source_sha: SOURCE_SHA, started: new Date().toISOString(),
  cameraHashes, art04Dock: ART04_DOCK, starterGeometry,
  previewIntegrity: null, viewports: {}, sanity: null,
  status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is emulated (390x844 dpr2, hasTouch/isMobile) — physical handset verification remains #268/#275",
    "The yard is the SHIPPED first-run starter (createGame as-is): INITIAL_BANK and tier untouched, no seed, no camera gesture — the home pose is never moved",
    "Numeric smoke only (PASS_NUMERIC_ONLY) — not art parity vs public/reference/approved-yard.png, not reviewer/product acceptance, not sponsor G1 approval (#276, sponsor-reserved, still owed)",
    "The code author is not vision-capable; no art self-certification is made or implied"
  ]
};
let child, browser;
await mkdir(OUT, {recursive: true});

// ---- projection helpers (inverse of src/camera.js, extended with world Y) ----
function screenOfWorld(cam, rect, wx, wy, wz) {
  const wpp = 80 / (rect.height * cam.zoom);
  const dx = wx - cam.x, dz = wz - cam.z;
  const th = cam.yaw * Math.PI / 180, el = cam.elevation * Math.PI / 180;
  const cs = Math.cos(th), sn = Math.sin(th);
  const u = cs * dx - sn * dz;
  const v = wy * Math.cos(el) + (-sn * dx - cs * dz) * Math.sin(el);
  return {x: rect.left + rect.width / 2 + u / wpp, y: rect.top + rect.height / 2 - v / wpp};
}
const pose = page => page.locator(".world-canvas").evaluate(c => ({
  yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
  zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
  voxelSchema: c.dataset.voxelSchema, machineCount: Number(c.dataset.machineCount), world3d: c.dataset.world3d,
  art04Depot: c.dataset.art04Depot, art04Door: c.dataset.art04Door, art04BayDist: c.dataset.art04BayDist,
  art04Reduced: c.dataset.art04Reduced
}));
const canvasRect = page => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});
const shot = (page, name, clip) => page.screenshot({path: resolve(OUT, name), fullPage: false, animations: "disabled", ...(clip ? {clip} : {})});
const waitForClock = (page, ms) => page.evaluate(() => performance.now())
  .then(t0 => page.waitForFunction(a => performance.now() - a.t0 > a.ms, {t0, ms}, {timeout: ms + 15000, polling: 50}));
const topmostAt = (page, p) => page.evaluate(([x, y]) => {
  const e = document.elementFromPoint(x, y);
  if (!e) return {canvas: false, top: "null"};
  const desc = n => n.tagName.toLowerCase() +
    (typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/).join(".") : "") +
    (n.dataset && n.dataset.testid ? "[data-testid=" + n.dataset.testid + "]" : "");
  const chain = [];
  for (let n = e, i = 0; n && i < 3; n = n.parentElement, i++) chain.push(desc(n));
  return {canvas: e.classList.contains("world-canvas"), top: chain.join(" < ")};
}, [p.x, p.y]);
async function dismissToast(page) {
  const btn = page.locator('.toast button[aria-label="Dismiss notice"]');
  if (await btn.count()) {
    await btn.click();
    await page.waitForFunction(() => !document.querySelector(".toast"), null, {timeout: 4000, polling: 50});
  }
}
async function sheetToggleTo(page, collapsed) {
  const toggle = page.locator('[data-testid="sheet-toggle"]');
  if (!(await toggle.count())) return false;
  const want = collapsed ? "false" : "true";
  if ((await toggle.getAttribute("aria-expanded")) === want) return false;
  await dismissToast(page);
  const before = await pose(page);
  await toggle.click();
  await page.waitForFunction(c => document.querySelector('[data-testid="panel-host"]')?.dataset.collapsed === c,
    String(collapsed), {timeout: 8000, polling: 50});
  const after = await pose(page);
  for (const k of ["yaw", "elevation", "zoom", "x", "z"])
    if (before[k] !== after[k])
      throw Error("SHEET_TOGGLE_MOVED_CAMERA: " + k + " " + before[k] + " -> " + after[k]);
  return true;
}
async function assertContact(page, label) {
  const rect = await canvasRect(page);
  const p = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  let hit = await topmostAt(page, p);
  const rec = {label, point: p, initial: hit, collapsedSheet: false, final: hit, ok: hit.canvas};
  if (!hit.canvas) {
    await dismissToast(page);
    rec.collapsedSheet = await sheetToggleTo(page, true);
    hit = await topmostAt(page, p);
    rec.final = hit;
    rec.ok = hit.canvas;
  }
  if (!rec.ok)
    throw Error("OVERLAY_STEALS_CONTACT at " + label + ": elementFromPoint=" + hit.top);
  return rec;
}
const dismissIntro = async page => {
  const btn = page.getByRole("button", {name: /Enter the yard/});
  if (await btn.count()) await btn.click();
};
async function openPage(ctx) {
  const page = await ctx.newPage(), errs = [], failed = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
  // NO seed: the shipped first-run starter yard, zero input.
  await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
  await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
  await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
  await dismissIntro(page);
  return {page, errs, failed};
}
// Clip to the depot's projected bbox at the CURRENT (home) camera. A clamped
// clip amputates the rig — the shutter travels at the TOP — so motion clauses
// REFUSE it (DOCKING_CLIP_AMPUTATED). No framing gesture is performed here.
async function clipDepot(page, file) {
  const rect = await canvasRect(page), cam = await pose(page);
  const hw = FP_DEPOT.base.w * CELL / 2, hd = FP_DEPOT.base.d * CELL / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const dx of [-hw, hw]) for (const dz of [-hd, hd]) for (const y of [0, DEPOT_H]) {
    const p = screenOfWorld(cam, rect, FP_DEPOT.pivot.x + dx, y, FP_DEPOT.pivot.z + dz);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = 4;
  const clip = {x: Math.max(0, minX - pad), y: Math.max(0, minY - pad),
    width: Math.min(maxX - minX + 2 * pad, 4000), height: Math.min(maxY - minY + 2 * pad, 4000)};
  const clamped = minX - pad < 0 || minY - pad < 0 ||
    maxX + pad > rect.left + rect.width || maxY + pad > rect.top + rect.height;
  await shot(page, file, clip);
  return {file, clipCss: clip, clamped};
}
async function projectHome(page) {
  const rect = await canvasRect(page), cam = await pose(page);
  const hw = FP_DEPOT.base.w * CELL / 2, hd = FP_DEPOT.base.d * CELL / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const dx of [-hw, hw]) for (const dz of [-hd, hd]) for (const y of [0, DEPOT_H]) {
    const p = screenOfWorld(cam, rect, FP_DEPOT.pivot.x + dx, y, FP_DEPOT.pivot.z + dz);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const wpp = 80 / (rect.height * cam.zoom);
  return {cam, rect, bbox: {minX, minY, maxX, maxY},
    bboxFitsCanvas: minX >= rect.left && maxX <= rect.left + rect.width && minY >= rect.top && maxY <= rect.top + rect.height,
    shutterTravelPx: +(ART04_DOCK.travel * Math.cos(cam.elevation * Math.PI / 180) / wpp).toFixed(2),
    rigHeightPx: +(maxY - minY).toFixed(2)};
}

// ---- Independent PNG decode (8-bit non-interlaced RGB/RGBA) + 96px metrics ----
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw Error("not a PNG");
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12];}
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6))
    throw Error("unsupported PNG format: depth " + bitDepth + " color " + colorType + " interlace " + interlace);
  const ch = colorType === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0, b = prev ? prev[x] : 0, c = (prev && x >= ch) ? prev[x - ch] : 0;
      let v = raw[rp++];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw Error("bad PNG filter " + filter);
      row[x] = v & 255;
    }
  }
  return {w, h, ch, data: out};
}
function downsample96(img) {
  const out = new Float64Array(96 * 96 * 3);
  for (let oy = 0; oy < 96; oy++) for (let ox = 0; ox < 96; ox++) {
    const x0 = Math.floor(ox * img.w / 96), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * img.w / 96));
    const y0 = Math.floor(oy * img.h / 96), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * img.h / 96));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1 && y < img.h; y++) for (let x = x0; x < x1 && x < img.w; x++) {
      const i = (y * img.w + x) * img.ch;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
    const o = (oy * 96 + ox) * 3;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
  }
  return out;
}
function pairMetrics(a, b) {
  let sum = 0, diff24 = 0, maxD = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    sum += d; if (d > 24) diff24++; maxD = Math.max(maxD, d);
  }
  const n = a.length / 3;
  return {meanAbsDiff: +(sum / n).toFixed(3), diffFractionOver24: +(diff24 / n).toFixed(4), maxPixelDiff: +maxD.toFixed(1)};
}
function frameSanity(img) {
  const colors = new Set();
  let sum = 0, sum2 = 0, n = 0;
  for (let i = 0; i < img.data.length; i += img.ch) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    colors.add((r << 16) | (g << 8) | b);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l; sum2 += l * l; n++;
  }
  const mean = sum / n;
  return {colors: colors.size, luminanceMean: +mean.toFixed(2),
    luminanceSigma: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(3), pixels: n};
}

try {
  if (!/^[0-9a-f]{40}$/.test(SOURCE_SHA))
    throw Error("CAPTURE_SOURCE_SHA_REQUIRED: report must cite the reachable 40-char capture commit, got " + SOURCE_SHA);
  if (!cameraHashes.applyCamera.ok || !cameraHashes.stampCamera.ok)
    throw Error("CAMERA_HASH_DRIFT: " + JSON.stringify(cameraHashes));
  child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {stdio: ["ignore", "pipe", "pipe"]});
  let previewLog = "";
  let childExited = false;
  child.stdout.on("data", d => {previewLog += d.toString();});
  child.stderr.on("data", d => {previewLog += d.toString(); report.errors.push("preview: " + d.toString().slice(0, 400));});
  child.on("exit", (code, sig) => {childExited = true; previewLog += `\n[preview exited code=${code} sig=${sig}]`;});
  let open = false;
  for (let i = 0; i < 70; i++) {
    if (childExited) throw Error("PREVIEW_CHILD_EXITED (port collision or build error?): " + previewLog.slice(-800));
    try {const r = await fetch(HOST, {signal: AbortSignal.timeout(2000)}); if (r.ok) {open = true; break;}} catch {}
    await new Promise(r => setTimeout(r, 200)); // preview-server readiness poll only
  }
  if (!open) throw Error("Production preview did not become available: " + previewLog.slice(-800));
  if (childExited) throw Error("PREVIEW_CHILD_EXITED after readiness (foreign server on port?): " + previewLog.slice(-800));
  {
    const localHtml = await readFile(resolve("dist/index.html"), "utf8");
    const m = localHtml.match(/src="(\/rustwake\/assets\/[^"]+\.js)"/);
    if (!m) throw Error("PREVIEW_INTEGRITY: no entry bundle in dist/index.html");
    const servedHtml = await (await fetch(HOST, {signal: AbortSignal.timeout(5000)})).text();
    if (!servedHtml.includes(m[1])) throw Error("PREVIEW_SERVES_FOREIGN_BUILD: served index lacks our entry " + m[1]);
    const localJs = await readFile(resolve("dist" + m[1].replace("/rustwake", "")));
    const servedJs = Buffer.from(await (await fetch(`http://127.0.0.1:${PORT}${m[1]}`, {signal: AbortSignal.timeout(10000)})).arrayBuffer());
    const a = crypto.createHash("sha256").update(localJs).digest("hex");
    const b = crypto.createHash("sha256").update(servedJs).digest("hex");
    if (a !== b) throw Error("PREVIEW_SERVES_FOREIGN_BUILD: entry sha256 local " + a + " served " + b);
    report.previewIntegrity = {entry: m[1], sha256: a, ok: true};
  }
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});

  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true}
  ]) {
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "no-preference"});
    const {page, errs, failed} = await openPage(ctx);
    const contact = await assertContact(page, v.name + ":580-home");
    const landing = await pose(page);
    const home = await projectHome(page);
    await shot(page, v.name + "-580-home-landing.png");
    // (1) 15s real-clock watch on the SHIPPED starter yard, home pose untouched.
    const watch = [];
    const wt0 = Date.now();
    let firstDockWallT = null;
    while (Date.now() - wt0 < 15000) {
      await waitForClock(page, 200);
      const s = await pose(page);
      const t = +((Date.now() - wt0) / 1000).toFixed(2);
      if (firstDockWallT === null && s.art04Depot === "docking" && Number(s.art04Door) > 0) firstDockWallT = t;
      watch.push({t, door: Number(s.art04Door), bayDist: Number(s.art04BayDist), depot: s.art04Depot});
    }
    const watchRec = {samples: watch.length,
      maxDoorLift: Math.max(...watch.map(s => s.door)), minBayDist: Math.min(...watch.map(s => s.bayDist)),
      dockingSamples: watch.filter(s => s.depot === "docking").length,
      shutterEverOpens: watch.some(s => s.door > 0), firstDockWallT,
      screenshot: v.name + "-580-home-watch.png"};
    await shot(page, v.name + "-580-home-watch.png");
    // (2) Real open/closed pixel pair at the SAME default home camera.
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.art04Depot === "docking" && Number(d.art04Door) > 0;
    }, null, {timeout: 60000, polling: 100});
    const openStamp = await pose(page);
    const openClip = await clipDepot(page, v.name + "-580-home-depot-open.png");
    await shot(page, v.name + "-580-home-open-full.png");
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas").dataset;
      return d.art04Door === "0.000" && d.art04Depot !== "docking";
    }, null, {timeout: 60000, polling: 100});
    const closedStamp = await pose(page);
    const closedClip = await clipDepot(page, v.name + "-580-home-depot-closed.png");
    await shot(page, v.name + "-580-home-closed-full.png");
    if (openClip.clamped || closedClip.clamped)
      throw Error("DOCKING_CLIP_AMPUTATED " + v.name + ": home frustum clips the depot bbox " +
        JSON.stringify({open: openClip.clamped, closed: closedClip.clamped, bbox: home.bbox, rect: home.rect}));
    const pair = pairMetrics(
      downsample96(decodePNG(await readFile(resolve(OUT, openClip.file)))),
      downsample96(decodePNG(await readFile(resolve(OUT, closedClip.file)))));
    const motionDetectableAtHome = pair.meanAbsDiff >= 1;
    if (!motionDetectableAtHome)
      throw Error("MOTION_CLIP_AMPUTATED " + v.name + ": shutter travel not detectable at home, pair " + JSON.stringify(pair));
    report.viewports[v.name] = {
      landing, home, contact, watch: watchRec,
      doorLifts: [Number(openStamp.art04Door), Number(closedStamp.art04Door)],
      bayDists: [Number(openStamp.art04BayDist), Number(closedStamp.art04BayDist)],
      clips: [openClip, closedClip], pair,
      shutterTravelOnScreen: home.bboxFitsCanvas && !openClip.clamped && !closedClip.clamped,
      motionDetectableAtHome,
      screenshots: {landing: v.name + "-580-home-landing.png", watch: v.name + "-580-home-watch.png",
        openFull: v.name + "-580-home-open-full.png", closedFull: v.name + "-580-home-closed-full.png"},
      pageErrors: errs, failedRequests: failed
    };
    if (!watchRec.shutterEverOpens)
      throw Error("STARTER_SHUTTER_NEVER_OPENS " + v.name + ": fresh zero-input yard watch " + JSON.stringify(watchRec));
    await ctx.close();
  }

  // ---- Per-PNG sanity: colour count + luminance sigma (no blank/flat frame) ----
  {
    const files = (await readdir(OUT)).filter(f => f.endsWith(".png")).sort();
    const floor = {colors: 64, sigma: 6};
    const results = {};
    let minColors = Infinity, minSigma = Infinity;
    for (const f of files) {
      const s = frameSanity(decodePNG(await readFile(resolve(OUT, f))));
      results[f] = {...s, floor, ok: s.colors >= floor.colors && s.luminanceSigma >= floor.sigma};
      if (!results[f].ok)
        throw Error("SANITY_BLANK_OR_FLAT_FRAME " + f + ": " + JSON.stringify(results[f]));
      minColors = Math.min(minColors, s.colors);
      minSigma = Math.min(minSigma, s.luminanceSigma);
    }
    report.sanity = {fileCount: files.length, minColors, minSigma: +minSigma.toFixed(3), files: results};
  }

  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {
  report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("#580 starter-dock home capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
