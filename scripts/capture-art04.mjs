// ART-04 (#350) production-build civic-rig capture. NEW script — does not
// modify any existing capture script. Run AFTER `npm run build`: spawns vite
// preview, ONE Chromium, sequential contexts.
//
// Evidence produced (docs/evidence/350-art-04 by default):
//  - FIRST, before any capture in every scenario: document.elementFromPoint
//    at the canvas centre contact point must be the world canvas (#550 alarm
//    rail / alarm sheet / notice toast overlay-interception guard). If an
//    overlay owns the centre the harness THROWS (OVERLAY_STEALS_CONTACT)
//    rather than producing a pretty-but-meaningless PNG;
//  - desktop 1440x900 dpr1 + emulated phone 390x844 dpr2 (hasTouch/isMobile):
//    fresh first-run home yard (depot + market visible, research/fabricator
//    stamps "absent"), then a tier-2 seeded save where a second generator,
//    the Crusher, the Signal Observatory, the Parts Fabricator AND the ART-03
//    Fuel Refinery + Alloy Foundry are placed through the REAL build UI
//    (blueprint card -> tap -> lastSiteOk -> real assembly via the inspector),
//  - per-rig strategic-zoom clips + picking proof for all four civic rigs,
//  - SIX-rig 96px silhouette legibility: all 15 pairs decoded independently
//    (zlib PNG decode in this script), box-downsampled, pairwise diff floors,
//    PLUS the Node-side occupancy-grid Jaccard distinctness matrix over the
//    real makeBuilding meshes (the issue's numeric pairwise metric),
//  - truck-access proof in the REAL scene: the motion run waits for a real
//    freight truck to reach the depot bay (art04Depot "docking", art04Door
//    lift > 0, art04BayDist <= ART04_DOCK.near) and captures that instant;
//    the swept-corridor geometry proof lives in tests/art04Models.test.mjs,
//  - negative states from REAL simulation seeds (never hardcoded timers):
//    starved yard (empty inventories + empty bank -> starved stamps),
//    unpowered yard (both generators frozen mid-assembly -> supply 0),
//    reduced-motion parked civic clocks + shutter CLOSED over real browser
//    time, and a WebGL-context failure proving the app fails loudly,
//  - motion timeline from the REAL per-type art04 clocks: market ambient
//    clock tracks SIM elapsed (load label 1), research/fabricator work clocks
//    integrate sim timer deltas, depot clock honestly constant 0.000 (no cycle),
//  - rendered-domain motion proof: research dish / fabricator gear train /
//    market beam clipped at TWO distinct sim times with a fixed camera and
//    compared via the same independent pairMetrics; depot shutter clipped
//    OPEN (real truck docking) vs CLOSED at the same camera,
//  - per-PNG colour-count + luminance-sigma sanity so a blank/flat frame
//    cannot pass (SANITY_BLANK_OR_FLAT_FRAME),
//  - #307 camera invariants: landing yaw/elevation, synchronous stamp==applied
//    zoom, single WebGL canvas, no document scroll, method-body sha256-16 hashes.
//
// No fixed setTimeout sleeps: every wait is page.waitForFunction on a real
// dataset stamp, inspector text, or the browser's own performance.now clock.
// Numeric smoke only — PASS_NUMERIC_ONLY, never visual approval. Reviewer/product
// acceptance and sponsor G1 visual review of the deployed build remain required.
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile, readdir} from "node:fs/promises";
import {resolve} from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import * as THREE from "three";
import {SCHEMA_ID, machineDescriptor} from "../src/voxelSchema.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {CELL, SAVE_KEY} from "../src/content.js";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};
const {makeBuilding, ART04_MOTION, ART04_TYPES, ART04_DOCK} = await import("../src/world.js");
const {createGame, checkSite} = await import("../src/simulation.js");

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/350-art-04");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4194);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SOURCE_SHA = process.env.RUSTWAKE_SOURCE_SHA || process.env.GITHUB_SHA || "local";

const RIGS = [
  {type: "depot", name: "Freight Depot"},
  {type: "market", name: "Trade Exchange"},
  {type: "research", name: "Signal Observatory"},
  {type: "fabricator", name: "Parts Fabricator"}
];
const SIX = [...RIGS, {type: "salvager", name: "Scrap Extractor"}, {type: "crusher", name: "Crusher"}];
// ART-03 (#349) rigs placed through the same real UI so the captured yard
// carries the full ART-03 + ART-04 set (generator + furnace are starters).
const ART03_EXTRA = [{type: "refinery", name: "Fuel Refinery"}, {type: "foundry", name: "Alloy Foundry"}];
const rigName = type => [...SIX, ...ART03_EXTRA].find(r => r.type === type).name;
const clockKey = type => "art04" + type[0].toUpperCase() + type.slice(1) + "Clock";
const statusKey = type => "art04" + type[0].toUpperCase() + type.slice(1);

// ---- Deterministic scenario seeds (real save schema, readGame coerces) ----
function richBank(g) {
  Object.assign(g.bank, {credits: 8000, scrap: 600, iron: 300, stone: 300, steel: 300, copper: 300, fuel: 200, water: 200, circuits: 80, gears: 60, data: 40});
  return g;
}
function baseSeed() {
  const g = createGame();
  g.tier = 2; g.stats.produced = 200; g.lastSavedAt = Date.now();
  return richBank(g);
}
function findSite(g, type, preferred) {
  for (const [x, z] of preferred) if (checkSite(g, type, x, z, 0).ok) return {x, z};
  for (let z = 4; z <= 20; z++) for (let x = 4; x <= 20; x++)
    if (checkSite(g, type, x, z, 0).ok) return {x, z};
  throw Error("NO_VALID_SITE for " + type);
}
function addRig(g, type, site, inventory = {}) {
  const b = {id: g.nextId++, type, x: site.x, z: site.z, rot: 0, level: 1, remaining: 0, timer: 0, inventory};
  g.buildings.push(b);
  return b;
}
// Sites validated with the REAL checkSite, placed in build order so the UI
// taps land on genuinely valid cells. A second generator keeps the grid
// powered: starter demand 5 (salvager 1 + furnace 3 + crane 1) + crusher 2 +
// research 4 + fabricator 5 + refinery 3 + foundry 4 = 23 <= 24 supply.
const scanG = baseSeed();
const SITE_GEN2 = findSite(scanG, "generator", [[7, 14], [6, 16], [8, 14], [7, 15]]);
addRig(scanG, "generator", SITE_GEN2);
const SITE_CRUSHER = findSite(scanG, "crusher", [[9, 9], [9, 10], [10, 9], [8, 9]]);
addRig(scanG, "crusher", SITE_CRUSHER);
const SITE_RESEARCH = findSite(scanG, "research", [[9, 14], [9, 15], [10, 14], [8, 14]]);
addRig(scanG, "research", SITE_RESEARCH);
const SITE_FABRICATOR = findSite(scanG, "fabricator", [[13, 14], [12, 14], [13, 15], [13, 16]]);
addRig(scanG, "fabricator", SITE_FABRICATOR);
const SITE_REFINERY = findSite(scanG, "refinery", [[6, 13], [6, 14], [8, 13], [17, 14]]);
addRig(scanG, "refinery", SITE_REFINERY);
const SITE_FOUNDRY = findSite(scanG, "foundry", [[17, 10], [17, 11], [18, 10], [6, 10]]);
const SITES = {generator2: SITE_GEN2, crusher: SITE_CRUSHER, research: SITE_RESEARCH, fabricator: SITE_FABRICATOR, refinery: SITE_REFINERY, foundry: SITE_FOUNDRY};
const FP = Object.fromEntries(SIX.map(r => {
  const site = r.type === "crusher" ? SITE_CRUSHER : r.type === "research" ? SITE_RESEARCH : r.type === "fabricator" ? SITE_FABRICATOR
    : {x: scanG.buildings.find(b => b.type === r.type).x, z: scanG.buildings.find(b => b.type === r.type).z};
  return [r.type, worldFootprint(r.type, site.x, site.z, 0)];
}));
const YARD_MID = {
  x: SIX.reduce((a, r) => a + FP[r.type].pivot.x, 0) / 6,
  z: SIX.reduce((a, r) => a + FP[r.type].pivot.z, 0) / 6
};
// Seeded unlock yard: starter layout untouched, tier 2 + bank affords all four
// placements (second generator, crusher, research, fabricator).
const unlockSeed = () => baseSeed();
// Working yard: all six rigs complete; second generator online; cycling rigs
// stocked so research/fabricator genuinely work on sim timer deltas.
function workingSeed() {
  const g = baseSeed();
  addRig(g, "generator", SITE_GEN2);
  addRig(g, "crusher", SITE_CRUSHER, {scrap: 80});
  addRig(g, "research", SITE_RESEARCH, {circuits: 40});
  addRig(g, "fabricator", SITE_FABRICATOR, {steel: 60, copper: 60});
  addRig(g, "refinery", SITE_REFINERY, {scrap: 40, water: 20});
  addRig(g, "foundry", SITE_FOUNDRY, {steel: 30, copper: 20, fuel: 10});
  g.buildings.find(b => b.type === "furnace").inventory = {iron: 40, fuel: 20};
  return g;
}
// Starved yard: no upstream producer, empty inventories + empty material bank
// -> research/fabricator genuinely lack recipe inputs (power still available).
function starvedSeed() {
  const g = workingSeed();
  g.buildings = g.buildings.filter(b => b.type !== "salvager");
  g.buildings.find(b => b.type === "research").inventory = {};
  g.buildings.find(b => b.type === "fabricator").inventory = {};
  g.buildings.find(b => b.type === "furnace").inventory = {};
  g.buildings.find(b => b.type === "crusher").inventory = {};
  g.buildings.find(b => b.type === "refinery").inventory = {};
  g.buildings.find(b => b.type === "foundry").inventory = {};
  for (const k of ["iron", "fuel", "scrap", "water", "steel", "copper", "circuits"]) g.bank[k] = 0;
  return g;
}
// Unpowered yard: BOTH generators frozen mid-assembly (remaining 1e9, the
// freight-test pattern) -> supply 0 < demand -> consumers unpowered.
function unpoweredSeed() {
  const g = workingSeed();
  for (const b of g.buildings.filter(b => b.type === "generator")) b.remaining = 1e9;
  return g;
}

// #307 hash guard — same extraction as tests/art04Models.test.mjs.
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

// Measured per-rig budgets from the REAL geometry (Node side, same as tests).
const budgets = {};
for (const {type} of SIX) {
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

// Acceptance metric #1: six-rig occupancy-grid Jaccard distinctness over the
// REAL makeBuilding meshes (same computation as tests/art04Models.test.mjs).
const GX = 14, GY = 20, GZ = 14, X0 = -1.75, Y0 = 0, Z0 = -1.75;
const SX = 3.5 / GX, SY = 5 / GY, SZ = 3.5 / GZ;
function occupancySignature(type) {
  const g = makeBuilding({id: 99, type, x: 11.5, z: 11.5, remaining: 0}, 0).group;
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
  g.updateWorldMatrix(true, true);
  const bits = new Uint8Array(GX * GY * GZ);
  g.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume") return;
    const bb = new THREE.Box3().setFromObject(n);
    const i0 = Math.max(0, Math.floor((bb.min.x - X0) / SX)), i1 = Math.min(GX - 1, Math.floor((bb.max.x - X0) / SX));
    const j0 = Math.max(0, Math.floor((bb.min.y - Y0) / SY)), j1 = Math.min(GY - 1, Math.floor((bb.max.y - Y0) / SY));
    const k0 = Math.max(0, Math.floor((bb.min.z - Z0) / SZ)), k1 = Math.min(GZ - 1, Math.floor((bb.max.z - Z0) / SZ));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++)
      bits[(i * GY + j) * GZ + k] = 1;
  });
  return bits;
}
function jaccardDistance(a, b) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {if (a[i] | b[i]) union++; if (a[i] & b[i]) inter++;}
  return union ? 1 - inter / union : 0;
}
const sigs = Object.fromEntries(SIX.map(r => [r.type, occupancySignature(r.type)]));
const distinctness3d = {grid: [GX, GY, GZ], pairs: {}};
let min3d = Infinity, min3dPair = "";
for (let i = 0; i < SIX.length; i++) for (let j = i + 1; j < SIX.length; j++) {
  const d = jaccardDistance(sigs[SIX[i].type], sigs[SIX[j].type]);
  distinctness3d.pairs[SIX[i].type + "/" + SIX[j].type] = +d.toFixed(4);
  if (d < min3d) {min3d = d; min3dPair = SIX[i].type + "/" + SIX[j].type;}
}
distinctness3d.min = +min3d.toFixed(4);
distinctness3d.minPair = min3dPair;

const report = {
  version: 1, build: "production-preview", issue: 350, schema: SCHEMA_ID,
  source_sha: SOURCE_SHA,
  started: new Date().toISOString(),
  cameraHashes, budgets, art04Motion: ART04_MOTION, art04Dock: ART04_DOCK,
  distinctness3d, sites: SITES,
  freshLanding: [], views: [], placement: [], picking: [], motion: null, dockingProof: null,
  contactChecks: [], motionDetails: null, sanity: null,
  negatives: {starved: [], unpowered: [], reducedMotion: [], webglFailure: null},
  legibility: null,
  status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is emulated (390x844 dpr2, hasTouch/isMobile) — physical handset verification remains #268/#275",
    "Scenario yards (tier-2 unlock, working, starved, unpowered) are seeded through the real save schema; status itself is derived only by the live simulation from that state",
    "V2 has no 2D fallback renderer; the WebGL-failure negative proves a loud failure, not a playable fallback",
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
const screenOfGround = (cam, rect, wx, wz) => screenOfWorld(cam, rect, wx, 0, wz);
const pose = page => page.locator(".world-canvas").evaluate(c => ({
  yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
  zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
  voxelSchema: c.dataset.voxelSchema, machineCount: Number(c.dataset.machineCount),
  world3d: c.dataset.world3d,
  art04Depot: c.dataset.art04Depot, art04Market: c.dataset.art04Market,
  art04Research: c.dataset.art04Research, art04Fabricator: c.dataset.art04Fabricator,
  art04Clock: c.dataset.art04Clock, art04Reduced: c.dataset.art04Reduced,
  art04Door: c.dataset.art04Door, art04BayDist: c.dataset.art04BayDist, art04MarketLoad: c.dataset.art04MarketLoad,
  art04DepotClock: c.dataset.art04DepotClock, art04MarketClock: c.dataset.art04MarketClock,
  art04ResearchClock: c.dataset.art04ResearchClock, art04FabricatorClock: c.dataset.art04FabricatorClock
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
  const want = collapsed ? "false" : "true"; // aria-expanded is the inverse
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
// #550 overlay-interception guard: BEFORE any capture or gesture in a
// scenario, the canvas centre contact point must hit the world canvas.
// An alarm rail / alarm sheet / notice toast owning the centre silently
// invalidates every capture in that context, so this THROWS instead.
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
  report.contactChecks.push(rec);
  if (!rec.ok)
    throw Error("OVERLAY_STEALS_CONTACT at " + label + ": elementFromPoint(" + p.x + "," + p.y + ")=" + hit.top);
  return rec;
}
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
const canvasHit = (page, p) => page.evaluate(([x, y]) => {
  const e = document.elementFromPoint(x, y);
  return !!(e && e.classList && e.classList.contains("world-canvas"));
}, [p.x, p.y]);
async function clickableCell(page, fp) {
  const rect = await canvasRect(page), cam = await pose(page);
  for (let i = 0; i < fp.base.w; i++)
    for (let j = 0; j < fp.base.d; j++) {
      const p = screenOfGround(cam, rect, fp.min.x + CELL / 2 + i * CELL, fp.min.z + CELL / 2 + j * CELL);
      if (await canvasHit(page, p)) return p;
    }
  return null;
}
async function clickableCellOffset(page, fp) {
  const rect = await canvasRect(page), cam = await pose(page);
  const offs = [[0, 0], [-.32, 0], [.32, 0], [0, -.32], [0, .32], [-.32, -.32], [.32, .32], [-.32, .32], [.32, -.32]];
  for (let i = 0; i < fp.base.w; i++)
    for (let j = 0; j < fp.base.d; j++)
      for (const [ox, oz] of offs) {
        const p = screenOfGround(cam, rect, fp.min.x + CELL / 2 + i * CELL + ox * CELL, fp.min.z + CELL / 2 + j * CELL + oz * CELL);
        if (p.x < rect.left || p.x > rect.left + rect.width || p.y < rect.top || p.y > rect.top + rect.height) continue;
        if (await canvasHit(page, p)) return p;
      }
  return null;
}
async function openPage(ctx, seed) {
  const page = await ctx.newPage(), errs = [], failed = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
  if (seed) await page.addInitScript(([k, json]) => {localStorage.setItem(k, json);}, [SAVE_KEY, JSON.stringify(seed)]);
  await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
  await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
  await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
  await dismissIntro(page);
  return {page, errs, failed};
}
// Real UI placement: build tool -> blueprint card -> tap -> lastSiteOk -> the
// inspector's own construction text disappears (REAL assembly, no sleep).
async function placeRig(page, touch, label, type, site) {
  const name = rigName(type);
  await dismissToast(page);
  await page.locator('[data-tool="build"]').click();
  await page.waitForFunction(() => document.querySelector('[data-tool="build"]')?.getAttribute("aria-pressed") === "true", null, {timeout: 8000});
  await page.locator(".blueprint", {hasText: name}).first().click();
  const fp = worldFootprint(type, site.x, site.z, 0);
  let p = await clickableCell(page, fp) || await clickableCellOffset(page, fp);
  if (!p) {
    const rect = await canvasRect(page);
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, .7);
    p = await clickableCell(page, fp) || await clickableCellOffset(page, fp);
  }
  if (!p) {
    const rect = await canvasRect(page);
    const diag = await topmostAt(page, screenOfGround(await pose(page), rect, fp.pivot.x, fp.pivot.z));
    throw Error("RIG_SITE_NOT_CLICKABLE " + type + " at " + label + " topmost=" + diag.top);
  }
  await tap(page, p, touch);
  await page.waitForFunction(() => document.body.dataset.lastSiteOk === "true", null, {timeout: 8000, polling: 50});
  await sheetToggleTo(page, false);
  const siteStamp = await page.evaluate(() => ({ok: document.body.dataset.lastSiteOk, code: document.body.dataset.lastSiteCode, reason: document.body.dataset.lastSiteReason}));
  const panel = page.locator(".inspector-panel");
  await panel.waitFor({timeout: 8000});
  await page.waitForFunction(n => {
    const el = document.querySelector(".inspector-panel");
    return el && el.innerText.includes(n) && !/remaining/.test(el.innerText);
  }, name, {timeout: 30000, polling: 100});
  const rec = {label, type, site, siteStamp, inspectorText: (await panel.innerText()).replace(/\s+/g, " ").slice(0, 240)};
  report.placement.push(rec);
  return rec;
}
async function pickMachine(page, fp, name, touch, label, file, minVisible) {
  await dismissToast(page);
  const groundDiag = async () => {
    const rect = await canvasRect(page);
    return topmostAt(page, screenOfGround(await pose(page), rect, fp.pivot.x, fp.pivot.z));
  };
  let p = await clickableCell(page, fp);
  let aim = "ground-center";
  if (!p) {
    await sheetToggleTo(page, true);
    p = await clickableCell(page, fp);
  }
  if (!p) {p = await clickableCellOffset(page, fp); aim = "ground-offset";}
  let reframed = false;
  const cover = p ? null : (await groundDiag()).top;
  if (!p) {
    const rect = await canvasRect(page);
    await wheelZoomAt(page, {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}, minVisible);
    reframed = true;
    p = await clickableCell(page, fp) || await clickableCellOffset(page, fp);
    aim = "ground-reframed";
  }
  if (!p)
    throw Error("MACHINE_NOT_CLICKABLE " + name + " at " + label + " topmost=" + (await groundDiag()).top + " firstCover=" + cover);
  await tap(page, p, touch);
  await sheetToggleTo(page, false);
  const panel = page.locator(".inspector-panel");
  await panel.waitFor({timeout: 8000});
  await panel.getByText(name).first().waitFor({timeout: 8000});
  const text = (await panel.innerText()).replace(/\s+/g, " ").slice(0, 260);
  if (!text.includes(name) || !text.includes("1×1"))
    throw Error("PICKING_WRONG " + name + " at " + label + ": " + text);
  await dismissToast(page);
  await shot(page, file);
  const rec = {label, machine: name, footprint: "1×1", aim, groundCover: cover, reframed, inspectorText: text, screenshot: file};
  report.picking.push(rec);
  return rec;
}
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
const envOf = page => page.evaluate(() => ({
  canvasCount: document.querySelectorAll("canvas").length,
  documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
}));

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
// Blank/flat-frame guard: unique colour count + luminance sigma per PNG.
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
  if (min3d < 0.15)
    throw Error("DISTINCTNESS_3D_TOO_LOW: min " + min3d + " at " + min3dPair);
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

  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false, zoom: 2.8, minVisible: .8},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true, zoom: 2.2, minVisible: .6}
  ]) {
    // (A) Fresh first-run home yard: depot + market visible from frame one;
    // research/fabricator legitimately absent (era-2 unlocks).
    {
      const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "reduce"});
      const {page, errs, failed} = await openPage(ctx, null);
      await assertContact(page, v.name + ":fresh");
      const landing = await pose(page);
      await shot(page, v.name + "-home-fresh.png");
      const parkedA = landing;
      await waitForClock(page, 2000);
      const parkedB = await pose(page);
      // Clocks + shutter park under reduced motion; STATUS may still change
      // (trucks move, sales happen) — that is honest sim, not decoration.
      const parkedKeys = ["art04Clock", "art04DepotClock", "art04MarketClock", "art04ResearchClock", "art04FabricatorClock", "art04Reduced", "art04MarketLoad", "art04Door"];
      const parkedConstant = parkedKeys.every(k => parkedA[k] === parkedB[k]);
      if (landing.machineCount !== 6 || landing.art04Research !== "absent" || landing.art04Fabricator !== "absent" ||
        landing.art04Depot === "absent" || landing.art04Market === "absent" ||
        landing.art04Reduced !== "1" || landing.art04Clock !== "0.000" || landing.art04MarketClock !== "0.000" ||
        landing.art04Door !== "0.000" || !parkedConstant ||
        Math.abs(landing.yaw - 45) > 1e-6 || Math.abs(landing.elevation - 35.264) > 1e-6 || errs.length || failed.length)
        throw Error("FRESH_LANDING_FAILURE at " + v.name + ": " + JSON.stringify({landing, parkedB, errs, failed}));
      report.freshLanding.push({label: v.name, landing, parkedB, parkedConstant, screenshot: v.name + "-home-fresh.png"});
      report.negatives.reducedMotion.push({label: v.name, stage: "fresh-landing", parkedA, parkedB, parkedConstant});
      await ctx.close();
    }

    // (B) Tier-2 seeded yard: place generator #2 + crusher + research +
    // fabricator through the REAL build UI (power headroom first).
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "reduce"});
    const {page, errs, failed} = await openPage(ctx, unlockSeed());
    await assertContact(page, v.name + ":unlock");
    const landing = await pose(page);
    await shot(page, v.name + "-landing.png");
    const beforeButton = await pose(page);
    await page.getByRole("button", {name: "Zoom in"}).click();
    await page.waitForFunction(z => Number(document.querySelector(".world-canvas").dataset.cameraZoom) > z,
      beforeButton.zoom, {timeout: 8000, polling: 50});
    const buttonZoom = await pose(page);
    const appliedZoom = await page.evaluate(() => Number(document.body.dataset.lastZoomApplied));
    const stampMatchesApplied = Number.isFinite(appliedZoom) && Math.abs(buttonZoom.zoom - appliedZoom) <= 1e-6;
    if (!stampMatchesApplied) throw Error("CAMERA_STAMP_DESYNC at " + v.name);

    const placedGen2 = await placeRig(page, v.touch, v.name, "generator", SITE_GEN2);
    const placedCrusher = await placeRig(page, v.touch, v.name, "crusher", SITE_CRUSHER);
    const placedResearch = await placeRig(page, v.touch, v.name, "research", SITE_RESEARCH);
    const placedFabricator = await placeRig(page, v.touch, v.name, "fabricator", SITE_FABRICATOR);
    const placedRefinery = await placeRig(page, v.touch, v.name, "refinery", SITE_REFINERY);
    const placedFoundry = await placeRig(page, v.touch, v.name, "foundry", SITE_FOUNDRY);
    await shot(page, v.name + "-yard-built.png");
    const parkedC = await pose(page);
    await waitForClock(page, 2000);
    const parkedD = await pose(page);
    const clockKeys = ART04_TYPES.map(clockKey);
    const allParkedConstant = [...clockKeys, "art04Clock", "art04MarketLoad", "art04Door"].every(k => parkedC[k] === parkedD[k]);
    if (parkedC.art04Reduced !== "1" || parkedC.art04Clock !== "0.000" || parkedC.art04Door !== "0.000" || !allParkedConstant ||
      ART04_TYPES.some(t => parkedC[statusKey(t)] === "absent") ||
      clockKeys.some(k => parkedC[k] !== "0.000"))
      throw Error("REDUCED_MOTION_NOT_PARKED_WITH_RIGS at " + v.name + ": " + JSON.stringify({parkedC, parkedD}));
    report.negatives.reducedMotion.push({label: v.name, stage: "all-rigs-live", parkedC, parkedD, allParkedConstant});

    // Per-rig strategic zoom: picking proof + HUD-free clip for all SIX rigs.
    await page.keyboard.press("Escape");
    await dismissToast(page);
    await page.locator('[data-tool="select"]').click();
    const clips = [], rigPoses = {};
    for (const {type, name} of SIX) {
      rigPoses[type] = await zoomToWorld(page, FP[type].pivot, v.zoom, v.minVisible);
      const pickRec = await pickMachine(page, FP[type], name, v.touch, v.name, v.name + "-" + type + "-selected.png", v.minVisible);
      if (pickRec.reframed) rigPoses[type] = await zoomToWorld(page, FP[type].pivot, v.zoom, v.minVisible);
      await sheetToggleTo(page, true);
      clips.push(await clipMachine(page, FP[type], machineDescriptor(type).bounds.height, v.name + "-" + type + "-clip.png"));
    }
    const iso = await pose(page);
    const front = await orbitTo(page, 0);
    await shot(page, v.name + "-yard-front.png");
    await orbitTo(page, 45);
    const final = await pose(page);
    const env = await envOf(page);
    report.views.push({
      name: v.name, viewport: v.viewport, dpr: v.dpr, isMobile: v.isMobile, hasTouch: v.touch,
      landing, iso, front, final, placedGen2, placedCrusher, placedResearch, placedFabricator, placedRefinery, placedFoundry, clips, rigPoses,
      stampMatchesApplied, beforeButtonZoom: beforeButton.zoom, buttonZoom: buttonZoom.zoom, appliedZoom,
      screenshots: {
        landing: v.name + "-landing.png", built: v.name + "-yard-built.png", front: v.name + "-yard-front.png",
        ...Object.fromEntries(SIX.map(r => [r.type + "Selected", v.name + "-" + r.type + "-selected.png"]))
      },
      pageErrors: errs, failedRequests: failed, ...env
    });
    if (landing.machineCount !== 6 || final.machineCount !== 12 ||
      Math.abs(landing.yaw - 45) > 1e-6 || Math.abs(landing.elevation - 35.264) > 1e-6 ||
      angDiff(front.yaw, 0) > .5 || Math.abs(iso.elevation - 35.264) > 1e-6 ||
      final.zoom < .20 || final.zoom > 12 || env.canvasCount !== 1 || env.documentScroll || errs.length || failed.length)
      throw Error("ART-04 still capture failure at " + v.name + ": " + JSON.stringify({landing, final, front, env, errs, failed}));
    await ctx.close();

    // (C) Starved yard negative: real sim inputs absent -> starved stamps.
    {
      const sctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "reduce"});
      const {page, errs, failed} = await openPage(sctx, starvedSeed());
      await assertContact(page, v.name + ":starved");
      await page.waitForFunction(() => {
        const d = document.querySelector(".world-canvas")?.dataset;
        return d && d.art04Research === "starved" && d.art04Fabricator === "starved";
      }, null, {timeout: 20000, polling: 50});
      const stamps = await pose(page);
      await shot(page, v.name + "-starved-yard.png");
      await zoomToWorld(page, FP.fabricator.pivot, v.zoom, v.minVisible);
      await sheetToggleTo(page, true);
      const clip = await clipMachine(page, FP.fabricator, machineDescriptor("fabricator").bounds.height, v.name + "-starved-fabricator-clip.png");
      await waitForClock(page, 2000);
      const after = await pose(page);
      const stable = ["art04Research", "art04Fabricator"].every(k => after[k] === "starved") &&
        after.art04ResearchClock === stamps.art04ResearchClock && after.art04FabricatorClock === stamps.art04FabricatorClock;
      if (!stable || errs.length || failed.length)
        throw Error("STARVED_NEGATIVE_FAILURE at " + v.name + ": " + JSON.stringify({stamps, after, errs, failed}));
      report.negatives.starved.push({label: v.name, stamps, after, stable, clip, screenshots: [v.name + "-starved-yard.png", v.name + "-starved-fabricator-clip.png"], pageErrors: errs});
      await sctx.close();
    }

    // (D) Unpowered yard negative: both generators frozen -> supply 0.
    {
      const uctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "reduce"});
      const {page, errs, failed} = await openPage(uctx, unpoweredSeed());
      await assertContact(page, v.name + ":unpowered");
      await page.waitForFunction(() => {
        const d = document.querySelector(".world-canvas")?.dataset;
        return d && d.art04Research === "unpowered" && d.art04Fabricator === "unpowered";
      }, null, {timeout: 20000, polling: 50});
      const stamps = await pose(page);
      await shot(page, v.name + "-unpowered-yard.png");
      await zoomToWorld(page, FP.research.pivot, v.zoom, v.minVisible);
      await sheetToggleTo(page, true);
      const clip = await clipMachine(page, FP.research, machineDescriptor("research").bounds.height, v.name + "-unpowered-research-clip.png");
      await waitForClock(page, 2000);
      const after = await pose(page);
      const stable = ["art04Research", "art04Fabricator"].every(k => after[k] === "unpowered") &&
        after.art04ResearchClock === stamps.art04ResearchClock && after.art04FabricatorClock === stamps.art04FabricatorClock;
      if (!stable || errs.length || failed.length)
        throw Error("UNPOWERED_NEGATIVE_FAILURE at " + v.name + ": " + JSON.stringify({stamps, after, errs, failed}));
      report.negatives.unpowered.push({label: v.name, stamps, after, stable, clip, screenshots: [v.name + "-unpowered-yard.png", v.name + "-unpowered-research-clip.png"], pageErrors: errs});
      await uctx.close();
    }
  }

  // ---- 96px silhouette legibility: all 15 six-rig pairs, both viewports ----
  {
    const machines = {};
    for (const v of ["desktop", "phone"])
      for (const {type} of SIX) {
        const file = v + "-" + type + "-clip.png";
        const img = decodePNG(await readFile(resolve(OUT, file)));
        machines[v + ":" + type] = {file, width: img.w, height: img.h, small: downsample96(img), edgeEnergy: edgeEnergy(img)};
      }
    const pairs = {};
    for (const v of ["desktop", "phone"])
      for (let i = 0; i < SIX.length; i++)
        for (let j = i + 1; j < SIX.length; j++) {
          const a = SIX[i].type, b = SIX[j].type;
          pairs[v + ":" + a + "-" + b] = pairMetrics(machines[v + ":" + a].small, machines[v + ":" + b].small);
        }
    const summary = {};
    for (const [k, m] of Object.entries(machines)) summary[k] = {file: m.file, width: m.width, height: m.height, edgeEnergy: m.edgeEnergy};
    report.legibility = {targetPx: 96, machines: summary, pairwise: pairs};
    for (const [k, p] of Object.entries(pairs))
      if (p.meanAbsDiff < 6 || p.diffFractionOver24 < .10)
        throw Error("SILHOUETTE_LEGIBILITY_TOO_LOW at " + k + ": " + JSON.stringify(p));
  }

  // ---- Motion run + real truck docking proof (desktop, no-preference) ----
  {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, reducedMotion: "no-preference"});
    const {page, errs, failed} = await openPage(ctx, workingSeed());
    await assertContact(page, "motion");
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.art04Reduced === "0" && d.art04Research === "working" && d.art04Fabricator === "working" &&
        d.art04MarketClock && Number.isFinite(Number(d.art04MarketClock));
    }, null, {timeout: 20000, polling: 50});
    await zoomToWorld(page, YARD_MID, 2.0, .8);

    // ACCEPTANCE: a REAL freight truck reaches the depot bay approach cell.
    // The shutter lift and docking lamp must follow the real truck distance.
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.art04Depot === "docking" && Number(d.art04Door) > 0;
    }, null, {timeout: 60000, polling: 50});
    const dockStamp = await pose(page);
    const bayDist = Number(dockStamp.art04BayDist), doorLift = Number(dockStamp.art04Door);
    if (!(bayDist <= ART04_DOCK.near + 1e-6) || !(doorLift > 0 && doorLift <= ART04_DOCK.travel + 1e-6))
      throw Error("DOCKING_PROOF_BAD: " + JSON.stringify({bayDist, doorLift, dockStamp}));
    await zoomToWorld(page, FP.depot.pivot, 2.4, .8);
    await sheetToggleTo(page, true);
    await shot(page, "desktop-depot-docking.png");
    const dockClip = await clipMachine(page, FP.depot, machineDescriptor("depot").bounds.height, "desktop-depot-docking-clip.png");
    report.dockingProof = {bayDist, doorLift, stamp: dockStamp, screenshot: "desktop-depot-docking.png", clip: dockClip,
      contract: "art04Depot docking iff nearest real truck <= ART04_DOCK.near (2.5) to the LOG-02 bay approach cell; shutter lift = depotDoorLift(distance)"};
    await zoomToWorld(page, YARD_MID, 2.0, .8);

    const motionStart = Date.now();
    const timeline = [];
    const simFloor = () => page.evaluate(() => {
      const m = /SIM (\d+)s/.exec(document.querySelector(".footline")?.textContent || "");
      return m ? Number(m[1]) : NaN;
    });
    const sample = async () => {
      const s = await pose(page);
      timeline.push({
        t: (Date.now() - motionStart) / 1000,
        marketClock: Number(s.art04MarketClock), researchClock: Number(s.art04ResearchClock),
        fabricatorClock: Number(s.art04FabricatorClock), depotClock: Number(s.art04DepotClock),
        marketLoad: Number(s.art04MarketLoad), simFloor: await simFloor(),
        depot: s.art04Depot, market: s.art04Market, research: s.art04Research, fabricator: s.art04Fabricator,
        door: s.art04Door, bayDist: s.art04BayDist, reduced: s.art04Reduced
      });
      return s;
    };
    await sample();
    const stages = [];
    for (const [name, min] of [["clock-warmup", .8], ["clock-quarter-cycle", 2], ["clock-half-cycle", 3.5], ["clock-full-cycle", 5]]) {
      await page.waitForFunction(m => Number(document.querySelector(".world-canvas").dataset.art04MarketClock) >= m,
        min, {timeout: 30000, polling: 40});
      const s = await sample();
      const file = "desktop-motion-" + name + ".png";
      await shot(page, file);
      stages.push({name, stamp: {marketClock: s.art04MarketClock, researchClock: s.art04ResearchClock, fabricatorClock: s.art04FabricatorClock, depot: s.art04Depot, market: s.art04Market, research: s.art04Research, fabricator: s.art04Fabricator}, screenshot: file});
    }
    while ((Date.now() - motionStart < 12000 || timeline.length < 100) && Date.now() - motionStart < 40000) {
      await waitForClock(page, 90);
      await sample();
    }
    await sample();

    // Rendered-domain motion proof: fixed camera per rig, two clips at two
    // distinct sim times, compared with the SAME independent pairMetrics used
    // for silhouette distinctness. Depot shutter proven OPEN vs CLOSED.
    const motionDetails = {};
    for (const type of ["research", "fabricator", "market"]) {
      await zoomToWorld(page, FP[type].pivot, 2.8, .8);
      await sheetToggleTo(page, true);
      const h = machineDescriptor(type).bounds.height;
      const k = clockKey(type);
      const s1 = await pose(page);
      const f1 = await simFloor();
      const c1 = await clipMachine(page, FP[type], h, "desktop-motion-" + type + "-t1.png");
      const start = Number(s1[k]);
      await page.waitForFunction(a => Number(document.querySelector(".world-canvas").dataset[a.k]) >= a.v,
        {k, v: start + 1.2}, {timeout: 30000, polling: 50});
      const s2 = await pose(page);
      const f2 = await simFloor();
      const c2 = await clipMachine(page, FP[type], h, "desktop-motion-" + type + "-t2.png");
      const pair = pairMetrics(
        downsample96(decodePNG(await readFile(resolve(OUT, c1.file)))),
        downsample96(decodePNG(await readFile(resolve(OUT, c2.file)))));
      motionDetails[type] = {clocks: [start, Number(s2[k])], simFloors: [f1, f2],
        clips: [c1, c2], pair};
      if (!(Number(s2[k]) > start) || !(f2 > f1) || pair.meanAbsDiff < 1)
        throw Error("MOTION_NOT_VISIBLE_IN_RENDER " + type + ": " + JSON.stringify(motionDetails[type]));
    }
    {
      await zoomToWorld(page, FP.depot.pivot, 2.8, .8);
      await sheetToggleTo(page, true);
      const h = machineDescriptor("depot").bounds.height;
      await page.waitForFunction(() => {
        const d = document.querySelector(".world-canvas").dataset;
        return d.art04Depot === "docking" && Number(d.art04Door) > 0;
      }, null, {timeout: 60000, polling: 100});
      const openStamp = await pose(page);
      const openClip = await clipMachine(page, FP.depot, h, "desktop-motion-depot-open.png");
      await page.waitForFunction(() => {
        const d = document.querySelector(".world-canvas").dataset;
        return d.art04Door === "0.000" && d.art04Depot !== "docking";
      }, null, {timeout: 60000, polling: 100});
      const closedStamp = await pose(page);
      const closedClip = await clipMachine(page, FP.depot, h, "desktop-motion-depot-closed.png");
      const pair = pairMetrics(
        downsample96(decodePNG(await readFile(resolve(OUT, openClip.file)))),
        downsample96(decodePNG(await readFile(resolve(OUT, closedClip.file)))));
      motionDetails.depot = {doorLifts: [Number(openStamp.art04Door), Number(closedStamp.art04Door)],
        bayDists: [Number(openStamp.art04BayDist), Number(closedStamp.art04BayDist)],
        clips: [openClip, closedClip], pair};
      if (!(Number(openStamp.art04Door) > 0) || Number(closedStamp.art04Door) !== 0 || pair.meanAbsDiff < 1)
        throw Error("SHUTTER_MOTION_NOT_VISIBLE: " + JSON.stringify(motionDetails.depot));
    }
    report.motionDetails = motionDetails;

    const env = await envOf(page);
    await ctx.close();

    // Market ambient clock (load label 1) must track SIM elapsed, never wall.
    const mClocks = timeline.map(s => s.marketClock);
    let monotone = true, maxStep = 0;
    for (let i = 1; i < timeline.length; i++) {
      const dt = Math.max(.001, timeline[i].t - timeline[i - 1].t);
      const d = mClocks[i] - mClocks[i - 1];
      if (d < -1e-6) monotone = false;
      maxStep = Math.max(maxStep, d);
      if (d > dt * 2 + .01) monotone = false;
    }
    const elapsed = timeline[timeline.length - 1].t;
    const advance = mClocks[mClocks.length - 1] - mClocks[0];
    const simFloors = timeline.map(s => s.simFloor);
    if (simFloors.some(n => !Number.isFinite(n)))
      throw Error("SIM_FOOTLINE_MISSING: motion timeline has no SIM readout");
    const simAdvance = simFloors[simFloors.length - 1] - simFloors[0];
    const tracksSim = Math.abs(advance - simAdvance) <= 1.5;
    const boundedByWall = advance <= elapsed + .6;
    const moving = advance >= 8;
    const speedOk = tracksSim && boundedByWall && moving;
    // Work clocks: monotone, real progress, never outrun sim (load <= 1).
    const workOk = ["researchClock", "fabricatorClock"].every(k => {
      const cs = timeline.map(s => s[k]);
      for (let i = 1; i < cs.length; i++) if (cs[i] < cs[i - 1] - 1e-6) return false;
      const adv = cs[cs.length - 1] - cs[0];
      return adv > 0 && adv <= simAdvance + 1.5;
    });
    const depotClockZero = timeline.every(s => s.depotClock === 0);
    const researchWorking = timeline.every(s => s.research === "working" && s.fabricator === "working");
    const allReducedOff = timeline.every(s => s.reduced === "0");
    const loadOne = timeline.every(s => Math.abs(s.marketLoad - 1) < 1e-3);
    const dockingSamples = timeline.filter(s => s.depot === "docking").length;
    const distinct = {marketClock: new Set(mClocks).size};
    report.motion = {
      elapsedSeconds: elapsed, samples: timeline.length, stages, monotone, maxStep, speedOk,
      tracksSim, boundedByWall, moving, simAdvance, workOk, depotClockZero, dockingSamples,
      wallVsSim: {wall: elapsed, simFloorAdvance: simAdvance, marketClockAdvance: advance},
      researchWorking, allReducedOff, loadOne,
      distinctValues: distinct, marketClockAdvance: advance, pageErrors: errs, failedRequests: failed, ...env, timeline
    };
    if (!monotone || !speedOk || !workOk || !depotClockZero || !researchWorking || !allReducedOff || !loadOne ||
      elapsed < 12 || timeline.length < 100 || distinct.marketClock < 30 || stages.length !== 4 ||
      env.canvasCount !== 1 || env.documentScroll || errs.length || failed.length)
      throw Error("ART-04 motion capture failure: " + JSON.stringify({monotone, speedOk, tracksSim, boundedByWall, moving, simAdvance, workOk, depotClockZero, researchWorking, allReducedOff, loadOne, elapsed, samples: timeline.length, distinct, env, errs, failed}));
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
    await waitForClock(page, 800);
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

  // ---- Per-PNG sanity: colour count + luminance sigma (no blank/flat frame) ----
  {
    const files = (await readdir(OUT)).filter(f => f.endsWith(".png")).sort();
    const floors = {default: {colors: 64, sigma: 6}, "desktop-webgl-failure.png": {colors: 16, sigma: 2}};
    const results = {};
    let minColors = Infinity, minSigma = Infinity;
    for (const f of files) {
      const s = frameSanity(decodePNG(await readFile(resolve(OUT, f))));
      const fl = floors[f] || floors.default;
      results[f] = {...s, floor: fl, ok: s.colors >= fl.colors && s.luminanceSigma >= fl.sigma};
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
  console.log("ART-04 civic-rig production capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
