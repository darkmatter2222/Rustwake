// ART-02 (#348) production-build salvage-structure capture. NEW script — does not
// modify scripts/capture-v2.mjs, capture-art.mjs, capture-terrain.mjs or capture-crane.mjs.
// Run AFTER `npm run build`: spawns vite preview, ONE Chromium, sequential contexts.
//
// Evidence produced (docs/evidence/348-art-02 by default):
//  - desktop 1440x900 dpr1 + emulated phone 390x844 dpr2 (hasTouch/isMobile):
//    landing, front (yaw 0) / side (yaw 90) / isometric (yaw 45) frames of the
//    rebuilt Scrap Extractor + Crusher/screening plant at strategic zoom,
//  - real UI placement of a Crusher at cell (9,9) (build tool -> blueprint card ->
//    tap -> lastSiteOk stamp -> 5s mechanical assembly observed via inspector),
//  - footprint/picking proof: tapping each machine cell opens the inspector on the
//    CORRECT machine with its 1x1 footprint, under the angled isometric geometry,
//  - 96px silhouette legibility: each machine's projected bbox clipped, decoded
//    independently (zlib PNG decode in this script), box-downsampled to 96x96,
//    pairwise per-pixel diff + edge energy reported,
//  - motion timeline from the REAL art02Arm/art02Roller/art02Screen stamps
//    (counter-rotating rollers, oscillating rocker + screen deck),
//  - negative states: invalid build site (red ghost + lastSiteOk=false verdict),
//    reduced-motion parked stamps constant over real time, and a WebGL-context
//    failure proving the app fails loudly (no fake 2D world is drawn),
//  - #307 camera invariants: landing yaw/elevation, synchronous stamp==applied
//    zoom, single WebGL canvas, no document scroll, method-body sha256-16 hashes.
//
// No fixed setTimeout sleeps: every wait is page.waitForFunction on a real
// dataset stamp, inspector text, or the browser's own performance.now clock.
// Numeric smoke only — PASS_NUMERIC_ONLY, never visual approval. Reviewer/product
// acceptance and sponsor G1 visual review of the deployed build remain required.
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import {SCHEMA_ID, machineDescriptor} from "../src/voxelSchema.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {CELL} from "../src/content.js";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};
const {makeBuilding, ART02_MOTION} = await import("../src/world.js");

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/348-art-02");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4179);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SALVAGER = worldFootprint("salvager", 7, 9, 0);  // starter extractor id 1
const CRUSHER_SITE = worldFootprint("crusher", 9, 9, 0); // free cell beside it
const DEPOT = worldFootprint("depot", 13, 9, 0);       // occupied -> invalid site
const TRIO_MID = {x: (SALVAGER.pivot.x + CRUSHER_SITE.pivot.x) / 2, z: (SALVAGER.pivot.z + CRUSHER_SITE.pivot.z) / 2};

// #307 hash guard — same extraction as tests/salvageModels.test.mjs.
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

// Measured per-machine budgets from the REAL geometry (Node side, same as tests).
const budgets = {};
for (const type of ["salvager", "crusher", "refinery"]) {
  const {group} = makeBuilding({id: 99, type, x: 11.5, z: 11.5, remaining: 0}, 0);
  let meshes = 0, triangles = 0;
  group.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume" || !n.material.visible) return;
    meshes++;
    triangles += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
  });
  const desc = machineDescriptor(type);
  budgets[type] = {meshes, triangles, declared: desc.budget, pivots: desc.pivots.map(p => p.id),
    bounds: desc.bounds, pickHeight: desc.pick.size[1]};
}

const report = {
  version: 1, build: "production-preview", issue: 348, schema: SCHEMA_ID,
  source_sha: process.env.RUSTWAKE_SOURCE_SHA || process.env.GITHUB_SHA || "local",
  started: new Date().toISOString(),
  cameraHashes, budgets, art02Motion: ART02_MOTION,
  views: [], placement: [], picking: [], motion: null,
  negatives: {invalidSite: [], reducedMotion: [], webglFailure: null},
  legibility: null,
  status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is emulated (390x844 dpr2, hasTouch/isMobile)",
    "The ART-02 trio's sorter outcome is the crusher's oscillating screen deck + twin discharge chutes; V2 has no standalone buildable sorter (content/sim registry is outside the ART-02 lease)",
    "V2 has no 2D fallback renderer; the WebGL-failure negative proves a loud failure, not a playable fallback",
    "Numeric smoke only (PASS_NUMERIC_ONLY) — not art parity, reviewer/product acceptance or sponsor G1 approval"
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
const screenOfGround = (cam, rect, wx, wz) => screenOfWorld(cam, rect, wx, 0, wz);
const pose = page => page.locator(".world-canvas").evaluate(c => ({
  yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
  zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
  voxelSchema: c.dataset.voxelSchema, machineCount: Number(c.dataset.machineCount),
  world3d: c.dataset.world3d,
  art02Arm: c.dataset.art02Arm, art02Roller: c.dataset.art02Roller,
  art02Screen: c.dataset.art02Screen, art02Reduced: c.dataset.art02Reduced,
  cranePhase: c.dataset.cranePhase, craneReducedMotion: c.dataset.craneReducedMotion
}));
const canvasRect = page => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});
const shot = (page, name, clip) => page.screenshot({path: resolve(OUT, name), fullPage: false, animations: "disabled", ...(clip ? {clip} : {})});
// Real-clock wait inside the browser (NOT a Node setTimeout sleep).
const waitForClock = (page, ms) => page.evaluate(() => performance.now())
  .then(t0 => page.waitForFunction(a => performance.now() - a.t0 > a.ms, {t0, ms}, {timeout: ms + 15000, polling: 50}));
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

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
  return pose(page);
}
// Which element actually owns a screen point (wheel/tap delivery diagnostics).
const topmostAt = (page, p) => page.evaluate(([x, y]) => {
  const e = document.elementFromPoint(x, y);
  if (!e) return {canvas: false, top: "null"};
  const cls = typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).join(".") : "";
  const tid = e.dataset && e.dataset.testid ? "[data-testid=" + e.dataset.testid + "]" : "";
  return {canvas: e.classList.contains("world-canvas"), top: e.tagName.toLowerCase() + cls + tid};
}, [p.x, p.y]);
// CAM-05: collapsing/expanding the contextual sheet through its REAL toggle must
// never move the applied camera. Assert it on every scripted toggle.
async function sheetToggleTo(page, collapsed) {
  const toggle = page.locator('[data-testid="sheet-toggle"]');
  if (!(await toggle.count())) return false;
  const want = collapsed ? "false" : "true"; // aria-expanded is the inverse
  if ((await toggle.getAttribute("aria-expanded")) === want) return false;
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
// UX-07 phone sheet can overlay the canvas centre: a wheel sent there scrolls
// the sheet body and NEVER reaches the canvas wheel listener. Resolve a
// genuinely exposed canvas anchor before wheeling — prefer the requested point,
// else collapse the sheet via its own toggle, else scan the canvas rect.
async function exposedCanvasPoint(page, preferred) {
  let hit = await topmostAt(page, preferred);
  if (hit.canvas) return preferred;
  await sheetToggleTo(page, true);
  hit = await topmostAt(page, preferred);
  if (hit.canvas) return preferred;
  const rect = await canvasRect(page);
  for (const fy of [.3, .45, .6, .2, .75])
    for (const fx of [.5, .3, .7, .15, .85]) {
      const p = {x: rect.left + rect.width * fx, y: rect.top + rect.height * fy};
      hit = await topmostAt(page, p);
      if (hit.canvas) return p;
    }
  throw Error("NO_EXPOSED_CANVAS_ANCHOR: preferred=" + JSON.stringify(preferred) + " topmost=" + hit.top);
}
// CAM-03 anchored wheel zoom, closed-loop on the synchronous stamp (no sleeps).
// A stalled stamp is a HARD failure with the real delivery diagnostics (which
// element owns the anchor, whether the stamp moved at all) — never a silent
// no-op loop. The 1e-3 target tolerance and ZOOM_TARGET_NOT_REACHED stay exact.
async function wheelZoomAt(page, point, targetZoom) {
  point = await exposedCanvasPoint(page, point);
  await page.mouse.move(point.x, point.y);
  let zoom = (await pose(page)).zoom;
  for (let i = 0; i < 24 && Math.abs(zoom - targetZoom) > 1e-4; i++) {
    const prev = zoom;
    await page.mouse.wheel(0, -Math.log(targetZoom / prev) / .0015);
    try {
      await page.waitForFunction(p => Math.abs(Number(document.querySelector(".world-canvas").dataset.cameraZoom) - p) > 1e-6,
        prev, {timeout: 2000, polling: 30});
    } catch {
      const diag = await topmostAt(page, point);
      const stampNow = (await pose(page)).zoom;
      throw Error("WHEEL_ZOOM_STAMP_STALLED iter " + i + ": anchor=" + JSON.stringify(point) +
        " topmost=" + diag.top + " prev=" + prev + " stampNow=" + stampNow + " target=" + targetZoom);
    }
    zoom = (await pose(page)).zoom;
  }
  if (Math.abs(zoom - targetZoom) > 1e-3)
    throw Error("ZOOM_TARGET_NOT_REACHED: wanted " + targetZoom + " got " + zoom);
  return pose(page);
}
async function zoomToWorld(page, wp, targetZoom, minVisibleZoom) {
  let cam = await pose(page), rect = await canvasRect(page);
  let p = screenOfGround(cam, rect, wp.x, wp.z);
  if (p.x < rect.left || p.x > rect.left + rect.width || p.y < rect.top || p.y > rect.top + rect.height) {
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, minVisibleZoom);
    cam = await pose(page); rect = await canvasRect(page);
    p = screenOfGround(cam, rect, wp.x, wp.z);
  }
  return wheelZoomAt(page, p, targetZoom);
}
const dismissIntro = async page => {
  const btn = page.getByRole("button", {name: /Enter the yard/});
  if (await btn.count()) await btn.click();
};
const tap = (page, p, touch) => touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
// First footprint-cell center whose screen point hits the canvas itself (HUD-safe).
async function clickableCell(page, fp) {
  const rect = await canvasRect(page), cam = await pose(page);
  for (let i = 0; i < fp.base.w; i++)
    for (let j = 0; j < fp.base.d; j++) {
      const p = screenOfGround(cam, rect, fp.min.x + CELL / 2 + i * CELL, fp.min.z + CELL / 2 + j * CELL);
      const hit = await page.evaluate(([x, y]) => {
        const e = document.elementFromPoint(x, y);
        return !!(e && e.classList && e.classList.contains("world-canvas"));
      }, [p.x, p.y]);
      if (hit) return p;
    }
  return null;
}
async function placeCrusher(page, touch, label) {
  await page.locator('[data-tool="build"]').click();
  await page.waitForFunction(() => document.querySelector('[data-tool="build"]')?.getAttribute("aria-pressed") === "true", null, {timeout: 8000});
  await page.locator(".blueprint", {hasText: "Crusher"}).first().click();
  let p = await clickableCell(page, CRUSHER_SITE);
  if (!p) { // site off-screen/covered at landing zoom: zoom out at center first
    const rect = await canvasRect(page);
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, .7);
    p = await clickableCell(page, CRUSHER_SITE);
  }
  if (!p) throw Error("CRUSHER_SITE_NOT_CLICKABLE at " + label);
  await tap(page, p, touch);
  await page.waitForFunction(() => document.body.dataset.lastSiteOk === "true", null, {timeout: 8000, polling: 50});
  // The zoom-out fallback may have collapsed the sheet; selection does NOT
  // auto-expand it, so re-expand through the real toggle to observe assembly.
  await sheetToggleTo(page, false);
  const site = await page.evaluate(() => ({ok: document.body.dataset.lastSiteOk, code: document.body.dataset.lastSiteCode, reason: document.body.dataset.lastSiteReason}));
  // Auto-switch to inspect selected the new build; wait out the REAL 5s assembly
  // by watching the inspector's own construction text disappear.
  const panel = page.locator(".inspector-panel");
  await panel.waitFor({timeout: 8000});
  await page.waitForFunction(() => {
    const el = document.querySelector(".inspector-panel");
    return el && el.innerText.includes("Crusher") && !/remaining/.test(el.innerText);
  }, null, {timeout: 30000, polling: 100});
  const rec = {label, site, cell: {x: 9, z: 9}, inspectorText: (await panel.innerText()).replace(/\s+/g, " ").slice(0, 240)};
  report.placement.push(rec);
  return rec;
}
async function pickMachine(page, fp, name, touch, label, file) {
  let p = await clickableCell(page, fp);
  if (!p) {
    // The sheet opened by the previous pick may cover the next machine cell on
    // phone: collapse it through its real toggle (CAM-05 keeps camera/selection).
    await sheetToggleTo(page, true);
    p = await clickableCell(page, fp);
  }
  if (!p) throw Error("MACHINE_NOT_CLICKABLE " + name + " at " + label);
  await tap(page, p, touch);
  await sheetToggleTo(page, false); // inspector must be visibly open for the proof
  const panel = page.locator(".inspector-panel");
  await panel.waitFor({timeout: 8000});
  await panel.getByText(name).first().waitFor({timeout: 8000});
  const text = (await panel.innerText()).replace(/\s+/g, " ").slice(0, 260);
  if (!text.includes(name) || !text.includes("1×1"))
    throw Error("PICKING_WRONG " + name + " at " + label + ": " + text);
  await shot(page, file);
  const rec = {label, machine: name, footprint: "1×1", inspectorText: text, screenshot: file};
  report.picking.push(rec);
  return rec;
}
// Projected-bbox clip of one machine (8 corners of footprint x pick-height box).
async function clipMachine(page, fp, height, file) {
  const rect = await canvasRect(page), cam = await pose(page);
  const hw = fp.base.w * CELL / 2, hd = fp.base.d * CELL / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const dx of [-hw, hw]) for (const dz of [-hd, hd]) for (const y of [0, height]) {
    const p = screenOfWorld(cam, rect, fp.pivot.x + dx, y, fp.pivot.z + dz);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = 4;
  const clip = {x: Math.max(0, minX - pad), y: Math.max(0, minY - pad),
    width: Math.min(maxX - minX + 2 * pad, 4000), height: Math.min(maxY - minY + 2 * pad, 4000)};
  await shot(page, file, clip);
  return {file, clipCss: clip};
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
function edgeEnergy(img) {
  let sum = 0, n = 0;
  for (let y = 1; y < img.h - 1; y++) for (let x = 1; x < img.w - 1; x++) {
    const i = (y * img.w + x) * img.ch, l = (y * img.w + x - 1) * img.ch, r = (y * img.w + x + 1) * img.ch;
    const u = ((y - 1) * img.w + x) * img.ch, d = ((y + 1) * img.w + x) * img.ch;
    for (let c = 0; c < 3; c++) {
      const gx = img.data[r + c] - img.data[l + c], gy = img.data[d + c] - img.data[u + c];
      sum += Math.sqrt(gx * gx + gy * gy); n++;
    }
  }
  return +(sum / n).toFixed(3);
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
    await new Promise(r => setTimeout(r, 200)); // preview-server readiness poll only
  }
  if (!open) throw Error("Production preview did not become available");
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});

  // ---- Stills + placement + picking + negatives (desktop and phone) ----
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
    await dismissIntro(page);
    const landing = await pose(page);
    await shot(page, v.name + "-landing.png");

    // Reduced-motion negative: every ART-02 channel parked at 0.000 (or "none"
    // = that machine not yet in the yard), constant over 2s of the browser's
    // real clock; crane stays parked too (ART-06). Re-asserted with ALL three
    // channels live ("0.000") after the crusher is really placed below.
    const parkedA = await pose(page);
    await waitForClock(page, 2000);
    const parkedB = await pose(page);
    const parkedConstant = ["art02Arm", "art02Roller", "art02Screen", "art02Reduced", "cranePhase"]
      .every(k => parkedA[k] === parkedB[k]);
    const parkedOrAbsent = v => v === "0.000" || v === "none";
    if (parkedA.art02Reduced !== "1" || parkedA.art02Arm !== "0.000" || !parkedOrAbsent(parkedA.art02Roller) ||
      !parkedOrAbsent(parkedA.art02Screen) || !parkedConstant)
      throw Error("REDUCED_MOTION_NOT_PARKED at " + v.name + ": " + JSON.stringify({parkedA, parkedB}));
    report.negatives.reducedMotion.push({label: v.name, stage: "landing", parkedA, parkedB, parkedConstant});

    // Synchronous stamp==applied zoom via the visible Zoom in control (#307).
    const beforeButton = await pose(page);
    await page.getByRole("button", {name: "Zoom in"}).click();
    await page.waitForFunction(z => Number(document.querySelector(".world-canvas").dataset.cameraZoom) > z,
      beforeButton.zoom, {timeout: 8000, polling: 50});
    const buttonZoom = await pose(page);
    const appliedZoom = await page.evaluate(() => Number(document.body.dataset.lastZoomApplied));
    const stampMatchesApplied = Number.isFinite(appliedZoom) && Math.abs(buttonZoom.zoom - appliedZoom) <= 1e-6;
    if (!stampMatchesApplied) throw Error("CAMERA_STAMP_DESYNC at " + v.name);

    // Real UI placement of the crusher + full assembly observation.
    const placed = await placeCrusher(page, v.touch, v.name);
    await shot(page, v.name + "-crusher-built.png");
    // With the crusher live, all three channels must stamp exact parked 0.000
    // and stay constant over another 2s of real browser clock.
    const parkedC = await pose(page);
    await waitForClock(page, 2000);
    const parkedD = await pose(page);
    const allParkedConstant = ["art02Arm", "art02Roller", "art02Screen"].every(k => parkedC[k] === parkedD[k]);
    if (parkedC.art02Arm !== "0.000" || parkedC.art02Roller !== "0.000" || parkedC.art02Screen !== "0.000" || !allParkedConstant)
      throw Error("REDUCED_MOTION_NOT_PARKED_WITH_CRUSHER at " + v.name + ": " + JSON.stringify({parkedC, parkedD}));
    report.negatives.reducedMotion.push({label: v.name, stage: "crusher-live", parkedC, parkedD, allParkedConstant});

    // Invalid-site negative: hover the occupied depot cell (red ghost), then tap.
    await page.locator('[data-tool="build"]').click();
    await page.locator(".blueprint", {hasText: "Crusher"}).first().click();
    let dp = await clickableCell(page, DEPOT);
    if (!dp) {
      const rect = await canvasRect(page);
      await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, .7);
      dp = await clickableCell(page, DEPOT);
    }
    if (!dp) throw Error("DEPOT_NOT_CLICKABLE at " + v.name);
    await page.mouse.move(dp.x, dp.y);
    await waitForClock(page, 350); // let the hover ghost render a real frame
    await shot(page, v.name + "-invalid-site-ghost.png");
    await tap(page, dp, v.touch);
    await page.waitForFunction(() => document.body.dataset.lastSiteOk === "false", null, {timeout: 8000, polling: 50});
    const invalid = await page.evaluate(() => ({ok: document.body.dataset.lastSiteOk, code: document.body.dataset.lastSiteCode, reason: document.body.dataset.lastSiteReason}));
    if (!invalid.reason) throw Error("INVALID_SITE_NO_REASON at " + v.name);
    await shot(page, v.name + "-invalid-site-verdict.png");
    report.negatives.invalidSite.push({label: v.name, cell: {x: 13, z: 9}, ...invalid, screenshots: [v.name + "-invalid-site-ghost.png", v.name + "-invalid-site-verdict.png"]});
    await page.keyboard.press("Escape");
    await page.locator('[data-tool="select"]').click();

    // Strategic zoom on the extractor+crusher pair, then front/side/iso frames.
    const zoomed = await zoomToWorld(page, TRIO_MID, v.zoom, v.minVisible);
    const iso = await pose(page);
    await shot(page, v.name + "-trio-iso.png");
    const front = await orbitTo(page, 0);
    await shot(page, v.name + "-trio-front.png");
    const side = await orbitTo(page, 90);
    await shot(page, v.name + "-trio-side.png");
    await orbitTo(page, 45);

    // Footprint/picking proof under the angled geometry (both machines).
    await pickMachine(page, SALVAGER, "Scrap Extractor", v.touch, v.name, v.name + "-salvager-selected.png");
    await pickMachine(page, CRUSHER_SITE, "Crusher", v.touch, v.name, v.name + "-crusher-selected.png");

    // 96px silhouette clips at the strategic isometric zoom. Collapse the sheet
    // first so the clips contain ONLY world pixels, never HUD overlay.
    await sheetToggleTo(page, true);
    const clips = [];
    clips.push(await clipMachine(page, SALVAGER, machineDescriptor("salvager").pick.size[1], v.name + "-salvager-clip.png"));
    clips.push(await clipMachine(page, CRUSHER_SITE, machineDescriptor("crusher").bounds.height, v.name + "-crusher-clip.png"));

    const final = await pose(page);
    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    report.views.push({
      name: v.name, viewport: v.viewport, dpr: v.dpr, isMobile: v.isMobile, hasTouch: v.touch,
      landing, zoomed, iso, front, side, final, placed, clips,
      stampMatchesApplied, beforeButtonZoom: beforeButton.zoom, buttonZoom: buttonZoom.zoom, appliedZoom,
      screenshots: {
        landing: v.name + "-landing.png", built: v.name + "-crusher-built.png",
        iso: v.name + "-trio-iso.png", front: v.name + "-trio-front.png", side: v.name + "-trio-side.png",
        salvagerSelected: v.name + "-salvager-selected.png", crusherSelected: v.name + "-crusher-selected.png"
      },
      pageErrors: errs, failedRequests: failed, ...env
    });
    if (landing.world3d !== "ready" || landing.voxelSchema !== SCHEMA_ID || landing.machineCount !== 6 ||
      final.machineCount !== 7 ||
      Math.abs(landing.yaw - 45) > 1e-6 || Math.abs(landing.elevation - 35.264) > 1e-6 ||
      angDiff(front.yaw, 0) > .5 || angDiff(side.yaw, 90) > .5 ||
      Math.abs(iso.elevation - 35.264) > 1e-6 || env.canvasCount !== 1 || env.documentScroll ||
      errs.length || failed.length)
      throw Error("ART-02 still capture failure at " + v.name + ": " + JSON.stringify({landing, final, front, side, env, errs, failed}));
    await ctx.close();
  }

  // ---- 96px silhouette legibility (independent decode of the real clips) ----
  {
    const machines = {};
    for (const v of ["desktop", "phone"]) {
      for (const m of ["salvager", "crusher"]) {
        const file = v + "-" + m + "-clip.png";
        const img = decodePNG(await readFile(resolve(OUT, file)));
        machines[v + ":" + m] = {file, width: img.w, height: img.h, small: downsample96(img), edgeEnergy: edgeEnergy(img)};
      }
    }
    const pairs = {};
    for (const v of ["desktop", "phone"])
      pairs[v] = pairMetrics(machines[v + ":salvager"].small, machines[v + ":crusher"].small);
    const summary = {};
    for (const [k, m] of Object.entries(machines)) summary[k] = {file: m.file, width: m.width, height: m.height, edgeEnergy: m.edgeEnergy};
    report.legibility = {targetPx: 96, machines: summary, pairwise: pairs};
    // Legibility floor: the two rebuilt machines must remain measurably distinct
    // silhouettes at 96px (mean per-pixel channel diff >= 6/255, >= 10% of pixels
    // differing by > 24). A failure here means the structures read too alike.
    for (const [v, p] of Object.entries(pairs))
      if (p.meanAbsDiff < 6 || p.diffFractionOver24 < .10)
        throw Error("SILHOUETTE_LEGIBILITY_TOO_LOW at " + v + ": " + JSON.stringify(p));
  }

  // ---- Motion run (desktop, prefers-reduced-motion: no-preference) ----
  {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, reducedMotion: "no-preference"});
    const page = await ctx.newPage(), errs = [], failed = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    // Landing readiness: the salvager IS in the yard, so its arm channel is live;
    // the crusher's roller/screen channels legitimately stamp "none" until the
    // crusher is really placed below (presence-aware stamps, see SALVAGE_MODELS).
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.art02Reduced === "0" && d.art02Arm && d.art02Arm !== "none";
    }, null, {timeout: 20000});
    await dismissIntro(page);
    await placeCrusher(page, false, "motion");
    // With the crusher live, ALL three channels must be numeric (never "none")
    // before any motion sampling — the timeline may not contain absent channels.
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && ["art02Arm", "art02Roller", "art02Screen"].every(k => d[k] && d[k] !== "none" && Number.isFinite(Number(d[k])));
    }, null, {timeout: 20000, polling: 50});
    await zoomToWorld(page, TRIO_MID, 2.8, .8);

    const motionStart = Date.now();
    const timeline = [];
    const sample = async () => {
      const s = await pose(page);
      timeline.push({t: (Date.now() - motionStart) / 1000, arm: Number(s.art02Arm), roller: Number(s.art02Roller), screen: Number(s.art02Screen), reduced: s.art02Reduced});
      return s;
    };
    await sample();
    // Distinct working-part states captured mid-motion by watching real stamps.
    const stages = [];
    const rollerBase = Number((await pose(page)).art02Roller);
    // Browser-scope predicates: every threshold is computed in Node and passed
    // as the single argument (no Node-scope closures inside waitForFunction).
    for (const [name, arg] of [
      ["rollers-quarter-turn", {ch: "art02Roller", min: rollerBase + Math.PI / 2, abs: false}],
      ["extractor-arm-mid-swing", {ch: "art02Arm", min: ART02_MOTION.rockerAmp * .8, abs: true}],
      ["rollers-half-turn", {ch: "art02Roller", min: rollerBase + Math.PI, abs: false}],
      ["screen-deck-tilted", {ch: "art02Screen", min: ART02_MOTION.screenAmp * .8, abs: true}]
    ]) {
      await page.waitForFunction(a => {
        const v = Number(document.querySelector(".world-canvas").dataset[a.ch]);
        return a.abs ? Math.abs(v) >= a.min : v >= a.min;
      }, arg, {timeout: 30000, polling: 40});
      const s = await sample();
      const file = "desktop-motion-" + name + ".png";
      await shot(page, file);
      stages.push({name, stamp: {arm: s.art02Arm, roller: s.art02Roller, screen: s.art02Screen}, screenshot: file});
    }
    // Dense 12s timeline on the browser clock (no fixed sleeps).
    while ((Date.now() - motionStart < 12000 || timeline.length < 100) && Date.now() - motionStart < 40000) {
      await waitForClock(page, 90);
      await sample();
    }
    await sample();
    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    await ctx.close();

    const M = ART02_MOTION;
    const rollers = timeline.map(s => s.roller), arms = timeline.map(s => s.arm), screens = timeline.map(s => s.screen);
    let monotone = true, maxStep = 0;
    for (let i = 1; i < timeline.length; i++) {
      const dt = Math.max(.001, timeline[i].t - timeline[i - 1].t);
      const d = timeline[i].roller - timeline[i - 1].roller;
      if (d < -1e-6) monotone = false;
      maxStep = Math.max(maxStep, d);
      if (d > M.rollSpeed * dt * 2 + .01) monotone = false; // bounded continuous spin
    }
    const elapsed = timeline[timeline.length - 1].t;
    const advance = rollers[rollers.length - 1] - rollers[0];
    const speedOk = Math.abs(advance - M.rollSpeed * elapsed) <= M.rollSpeed * .5 + .2;
    const inBounds = arms.every(a => Math.abs(a) <= M.rockerAmp + .002) && screens.every(s => Math.abs(s) <= M.screenAmp + .002);
    const allReducedOff = timeline.every(s => s.reduced === "0");
    const distinct = {roller: new Set(rollers).size, arm: new Set(arms).size, screen: new Set(screens).size};
    report.motion = {
      elapsedSeconds: elapsed, samples: timeline.length, stages, monotone, maxStep, speedOk, inBounds, allReducedOff,
      distinctValues: distinct, rollerAdvance: advance, pageErrors: errs, failedRequests: failed, ...env, timeline
    };
    if (!monotone || !speedOk || !inBounds || !allReducedOff || elapsed < 12 || timeline.length < 100 ||
      distinct.roller < 30 || distinct.arm < 10 || distinct.screen < 10 || stages.length !== 4 ||
      env.canvasCount !== 1 || env.documentScroll || errs.length || failed.length)
      throw Error("ART-02 motion capture failure: " + JSON.stringify({monotone, speedOk, inBounds, allReducedOff, elapsed, samples: timeline.length, distinct, env, errs, failed}));
  }

  // ---- WebGL-failure negative: loud failure, never a fake 2D world ----
  {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      window.__webglNullHits = 0;
      HTMLCanvasElement.prototype.getContext = function (type, ...a) {
        if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") {window.__webglNullHits++; return null;}
        return orig.call(this, type, ...a);
      };
    });
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.waitForFunction(() => window.__webglNullHits > 0, null, {timeout: 20000, polling: 50});
    await waitForClock(page, 800); // let React surface the failure
    const state = await page.evaluate(() => ({
      webglNullHits: window.__webglNullHits,
      canvasCount: document.querySelectorAll("canvas").length,
      worldCanvasCount: document.querySelectorAll(".world-canvas").length,
      world3dReady: [...document.querySelectorAll(".world-canvas")].some(c => c.dataset.world3d === "ready"),
      bodyText: document.body.innerText.replace(/\s+/g, " ").slice(0, 300)
    }));
    await shot(page, "desktop-webgl-failure.png");
    await ctx.close();
    report.negatives.webglFailure = {...state, pageErrors: errs, screenshot: "desktop-webgl-failure.png"};
    if (state.world3dReady || state.worldCanvasCount !== 0 || errs.length === 0)
      throw Error("WEBGL_FAILURE_NOT_LOUD: " + JSON.stringify({state, errs}));
  }

  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {
  report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("ART-02 salvage production capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
