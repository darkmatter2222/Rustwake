// #552 condition C2.1 — DEPLOYED-SHA supplemental capture (evidence-only car).
// PR #577 (standalone buildable Screening Plant) merged to main as
// f0acf5a2b1e831bc0ba88fa0ab50a84547a95887 and is fully deployed + live-verified
// (release receipt 6986865110, delivery run 44361310545, hosted-browser #333 PASS).
// Both independent gates ACCEPTed #577 with C2.1 OWED: desktop AND phone captures
// at the DEPLOYED SHA showing the crusher and the Screening Plant ADJACENT in ONE
// frame. It could not be produced pre-merge because it needs the deployed build.
//
// Pattern sources (no src edits, no gate weakening):
//  - scripts/capture-live.mjs: LIVE-site default URL (RUSTWAKE_LIVE_URL override),
//    manifest source_sha gate over the same TLS path (httpsFetch from
//    verify-live-release.mjs), ONE Chromium, SEQUENTIAL fresh contexts
//    (desktop 1440x900 then emulated phone 390x844 dpr2), addInitScript
//    instrumentation counting unique WebGL contexts + rAF ticks BEFORE any page
//    script, and the .world-canvas dataset.world3d === "ready" readiness gate
//    (stamped by world.js only AFTER the first successful renderer.render).
//  - scripts/capture-art02.mjs: save-fixture injection via addInitScript,
//    screenOfWorld projection (inverse of src/camera.js), closed-loop anchored
//    wheel zoom on the synchronous camera stamp, sheet-toggle/exposed-canvas
//    handling, real-UI picking proof through the inspector panel.
//  - scripts/capture-567-fairness.mjs: read the loaded game back out of the
//    app's OWN periodic persist (SAVE_KEY) — never assume the fixture took.
//
// Fixture (load-bearing): a real public-shape v2 save injected BEFORE any page
// script, placing crusher id 7 at cell (9,9) and screening id 8 at cell (10,9)
// — neighbouring tiles — both remaining:0 (fully assembled; a half-built rig
// renders as scaffolding), both road-connected to the starter depot (13,9) via
// the starter z=8 asphalt row. Costs are deducted from the bank and recorded as
// b.paid exactly as a real build would. The loaded save is read back from the
// app's own persist and asserted; the renderer's machineCount/voxelSchema stamps
// prove the world rebuilt with all 8 buildings; real-UI taps open the inspector
// on EACH rig by name; projected 8-corner bounds prove BOTH rigs are inside the
// captured frame.
//
// DISCLOSURE (product ruling 6986365525): src/voxelSchema.js aliases
// RAW_MACHINES.screening = RAW_MACHINES.crusher and src/world.js routes both
// kinds to the same ART-02 rig. The two machines look IDENTICAL in these
// captures BY DESIGN — not a rendering bug, not a distinct silhouette. The
// distinct screening-only silhouette is serialized follow-up #578.
//
// Status contract: PASS_NUMERIC_ONLY (exit 0) only when the live manifest
// source_sha equals the expected deployed SHA AND every view passes every
// measured assertion. This does NOT certify visual fidelity or art parity;
// sponsor G1 (#276) and physical handsets (#268/#275) remain OWED. Phone is
// EMULATED. One headless Chromium/SwiftShader; reducedMotion:"reduce" per the
// capture-live precedent (rAF render loop still advances; ART-02 motion
// channels park — motion review belongs to the sponsor, not this numeric car).
//
// CLI: node scripts/capture-552-c2.mjs [expected-deployed-sha]
// Env: RUSTWAKE_LIVE_URL, RUSTWAKE_CAPTURE_OUT (default docs/evidence/552-c2-supplemental)
import {chromium} from "playwright-core";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve, dirname} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {httpsFetch} from "./verify-live-release.mjs";
import {SAVE_KEY, CELL, BLUEPRINTS} from "../src/content.js";
import {createGame, nearestRoad, roadPath, connectedToRoad} from "../src/simulation.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {machineDescriptor, SCHEMA_ID} from "../src/voxelSchema.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LIVE_URL = "https://home.darkmatter2222.com/rustwake/";
const DEFAULT_EXPECTED_SHA = "f0acf5a2b1e831bc0ba88fa0ab50a84547a95887";
const SHA_RE = /^[0-9a-f]{40}$/;
const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || resolve(ROOT, "docs/evidence/552-c2-supplemental"));

const VIEW_SPECS = [
  {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false, pairZoom: 2.8, contextZoom: .9, minVisibleZoom: .6},
  {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true, pairZoom: 2.4, contextZoom: .7, minVisibleZoom: .5},
];

// ---- Fixture: real public save shape, two fully assembled adjacent rigs ----
const CRUSHER_CELL = {x: 9, z: 9};
const SCREENING_CELL = {x: 10, z: 9};
function buildFixture() {
  const g = createGame();
  const add = (id, type, cell) => {
    const cost = {...BLUEPRINTS[type].cost};
    for (const [res, n] of Object.entries(cost)) g.bank[res] = Math.max(0, (g.bank[res] || 0) - n);
    g.buildings.push({id, type, x: cell.x, z: cell.z, rot: 0, level: 1, remaining: 0, inventory: {}, timer: 0, paid: cost});
  };
  add(7, "crusher", CRUSHER_CELL);
  add(8, "screening", SCREENING_CELL);
  g.stats.builds += 2;
  g.createdAt = Date.now();
  g.lastSavedAt = Date.now(); // away < 6s => readGame runs NO offline catch-up
  return g;
}
const FIXTURE = buildFixture();
const FIXTURE_JSON = JSON.stringify(FIXTURE);

// ---- Projection helpers (inverse of src/camera.js, as in capture-art02) ----
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
function rigBounds(cam, rect, type, cell) {
  const fp = worldFootprint(type, cell.x, cell.z, 0);
  const h = machineDescriptor(type).bounds.height;
  const hw = fp.base.w * CELL / 2, hd = fp.base.d * CELL / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const dx of [-hw, hw]) for (const dz of [-hd, hd]) for (const y of [0, h]) {
    const p = screenOfWorld(cam, rect, fp.pivot.x + dx, y, fp.pivot.z + dz);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY,
    pivotScreen: screenOfGround(cam, rect, fp.pivot.x, fp.pivot.z), worldPivot: fp.pivot, heightWorld: h};
}
const insideRect = (b, r, margin) =>
  b.minX >= r.left + margin && b.minY >= r.top + margin &&
  b.maxX <= r.left + r.width - margin && b.maxY <= r.top + r.height - margin;

// ---- Pure per-view assertion list (measured values only; nothing assumed) ----
export function viewFailures(v) {
  const f = [];
  if (!v || typeof v !== "object") return ["view record missing"];
  if (v.probeError) f.push("probe error: " + v.probeError);
  if (v.world3d !== "ready") f.push("canvas world3d not ready: " + JSON.stringify(v.world3d));
  if (v.framesAdvancing !== true) f.push("rAF ticks not advancing: " + JSON.stringify(v.rafProof));
  if (v.webglContextCount !== 1) f.push("webglContextCount !== 1: " + JSON.stringify(v.webglContextCount));
  if (!Array.isArray(v.pageErrors) || v.pageErrors.length) f.push("pageErrors: " + JSON.stringify(v.pageErrors));
  if (!Array.isArray(v.failedRequests) || v.failedRequests.length) f.push("same-origin failedRequests: " + JSON.stringify(v.failedRequests));
  if (v.documentScroll !== false) f.push("document scrolls");
  const lp = v.loadedProof;
  if (!lp) f.push("loaded-save proof missing");
  else {
    if (!lp.crusher || lp.crusher.remaining !== 0) f.push("crusher not loaded fully assembled: " + JSON.stringify(lp.crusher));
    if (!lp.screening || lp.screening.remaining !== 0) f.push("screening not loaded fully assembled: " + JSON.stringify(lp.screening));
    if (lp.adjacent !== true) f.push("rigs not on neighbouring tiles: " + JSON.stringify(lp.cells));
    if (lp.crusherRoadPath === false || lp.screeningRoadPath === false) f.push("rig not road-connected to depot: " + JSON.stringify({crusher: lp.crusherRoadPath, screening: lp.screeningRoadPath}));
    if (lp.machineCountMatches !== true) f.push("renderer machineCount != loaded buildings: " + JSON.stringify({stamp: lp.machineCountStamp, loaded: lp.loadedBuildingCount}));
    if (lp.schemaMatches !== true) f.push("voxelSchema stamp mismatch: " + JSON.stringify(lp.voxelSchemaStamp));
    if (lp.crusherInspector !== true) f.push("crusher inspector picking proof failed: " + JSON.stringify(lp.inspectorTexts));
    if (lp.screeningInspector !== true) f.push("screening inspector picking proof failed: " + JSON.stringify(lp.inspectorTexts));
  }
  const ob = v.onScreenProof;
  if (!ob) f.push("on-screen bounds proof missing");
  else {
    if (ob.crusherInside !== true) f.push("crusher projected bounds outside captured frame: " + JSON.stringify(ob.crusherBounds));
    if (ob.screeningInside !== true) f.push("screening projected bounds outside captured frame: " + JSON.stringify(ob.screeningBounds));
    if (ob.readable !== true) f.push("rig projected bounds below 24px readability floor: " + JSON.stringify(ob.sizes));
  }
  for (const s of v.screenshots || []) if (!s) f.push("screenshot artifact missing");
  if (!v.screenshots || v.screenshots.length < 4) f.push("expected pair+context+2 inspector screenshots, got " + JSON.stringify(v.screenshots));
  return f;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probeView({browser, view, liveUrl, origin}) {
  const ctx = await browser.newContext({
    viewport: view.viewport, deviceScaleFactor: view.dpr,
    isMobile: view.isMobile, hasTouch: view.touch, reducedMotion: "reduce",
  });
  const errs = [], failed = [];
  let page = null;
  const rec = {name: view.name, viewport: view.viewport, dpr: view.dpr, isMobile: view.isMobile, hasTouch: view.touch, screenshots: []};
  try {
    // BEFORE any page script: instrument WebGL/rAF AND inject the save fixture.
    await ctx.addInitScript(({saveKey, saveJson}) => {
      window.__rwSmoke = {webglContexts: 0, rafTicks: 0};
      const seen = new WeakSet();
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = orig.call(this, type, ...rest);
        if (c && /webgl/i.test(String(type)) && !seen.has(c)) {seen.add(c); window.__rwSmoke.webglContexts++;}
        return c;
      };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => raf(t => {window.__rwSmoke.rafTicks++; cb(t);});
      try {localStorage.setItem(saveKey, saveJson);} catch {}
    }, {saveKey: SAVE_KEY, saveJson: FIXTURE_JSON});
    page = await ctx.newPage();
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === origin) failed.push(r.url());} catch {}});
    await page.goto(liveUrl, {waitUntil: "domcontentloaded", timeout: 45000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 30000});
    const introBtn = page.getByRole("button", {name: /Enter the yard/});
    if (await introBtn.count()) await introBtn.click();

    // ---- Prove the fixture took: read the app's OWN periodic persist back ----
    await page.waitForFunction(k => {
      try {
        const g = JSON.parse(localStorage.getItem(k) || "null");
        return !!g && (g.buildings || []).some(b => b.type === "crusher" && b.id === 7) &&
          (g.buildings || []).some(b => b.type === "screening" && b.id === 8);
      } catch {return false;}
    }, SAVE_KEY, {timeout: 30000, polling: 500});
    const loaded = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), SAVE_KEY);
    const crusher = loaded.buildings.find(b => b.id === 7 && b.type === "crusher") || null;
    const screening = loaded.buildings.find(b => b.id === 8 && b.type === "screening") || null;
    const depot = loaded.buildings.find(b => b.type === "depot" && b.remaining <= 0) || null;
    const adjacent = !!crusher && !!screening &&
      Math.abs(crusher.x - screening.x) + Math.abs(crusher.z - screening.z) === 1;
    const pathFor = b => {
      if (!b || !depot || !connectedToRoad(loaded, b)) return false;
      const a = nearestRoad(loaded, b.x, b.z), d = nearestRoad(loaded, depot.x, depot.z);
      const p = roadPath(loaded, a, d);
      return Array.isArray(p) && p.length > 0;
    };
    const stamps0 = await page.locator(".world-canvas").evaluate(c => ({
      machineCount: Number(c.dataset.machineCount), voxelSchema: c.dataset.voxelSchema, world3d: c.dataset.world3d,
    }));
    rec.loadedProof = {
      saveKey: SAVE_KEY, source: "app's own periodic persist (read back from localStorage)",
      loadedBuildingCount: loaded.buildings.length, elapsedAtRead: loaded.elapsed,
      crusher: crusher && {id: crusher.id, type: crusher.type, x: crusher.x, z: crusher.z, remaining: crusher.remaining, paid: crusher.paid},
      screening: screening && {id: screening.id, type: screening.type, x: screening.x, z: screening.z, remaining: screening.remaining, paid: screening.paid},
      cells: {crusher: crusher && {x: crusher.x, z: crusher.z}, screening: screening && {x: screening.x, z: screening.z}},
      adjacent,
      crusherRoadPath: pathFor(crusher), screeningRoadPath: pathFor(screening),
      depot: depot && {id: depot.id, x: depot.x, z: depot.z},
      machineCountStamp: stamps0.machineCount, machineCountMatches: stamps0.machineCount === loaded.buildings.length,
      voxelSchemaStamp: stamps0.voxelSchema, schemaMatches: stamps0.voxelSchema === SCHEMA_ID,
      inspectorTexts: {}, crusherInspector: false, screeningInspector: false,
    };
    rec.world3d = stamps0.world3d;

    // ---- Camera helpers (art02 patterns; closed loops on real stamps) ----
    const pose = () => page.locator(".world-canvas").evaluate(c => ({
      yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
      zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
    }));
    const canvasRect = () => page.locator(".world-canvas").evaluate(c => {
      const r = c.getBoundingClientRect();
      return {left: r.left, top: r.top, width: r.width, height: r.height};
    });
    const topmostAt = p => page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      return !!(e && e.classList && e.classList.contains("world-canvas"));
    }, [p.x, p.y]);
    const topmostInfo = p => page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      if (!e) return "null";
      const cls = typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).join(".") : "";
      const tid = e.dataset && e.dataset.testid ? "[data-testid=" + e.dataset.testid + "]" : "";
      return e.tagName.toLowerCase() + cls + tid;
    }, [p.x, p.y]);
    const sheetToggleTo = async collapsed => {
      const toggle = page.locator('[data-testid="sheet-toggle"]');
      if (!(await toggle.count())) return false;
      const want = collapsed ? "false" : "true";
      if ((await toggle.getAttribute("aria-expanded")) === want) return false;
      await toggle.click();
      await page.waitForFunction(c => document.querySelector('[data-testid="panel-host"]')?.dataset.collapsed === c,
        String(collapsed), {timeout: 8000, polling: 50});
      return true;
    };
    const exposedCanvasPoint = async preferred => {
      if (await topmostAt(preferred)) return preferred;
      await sheetToggleTo(true);
      if (await topmostAt(preferred)) return preferred;
      const rect = await canvasRect();
      for (const fy of [.3, .45, .6, .2, .75]) for (const fx of [.5, .3, .7, .15, .85]) {
        const p = {x: rect.left + rect.width * fx, y: rect.top + rect.height * fy};
        if (await topmostAt(p)) return p;
      }
      throw Error("NO_EXPOSED_CANVAS_ANCHOR");
    };
    const wheelZoomAt = async (point, targetZoom) => {
      point = await exposedCanvasPoint(point);
      await page.mouse.move(point.x, point.y);
      let zoom = (await pose()).zoom;
      for (let i = 0; i < 24 && Math.abs(zoom - targetZoom) > 1e-4; i++) {
        const prev = zoom;
        await page.mouse.wheel(0, -Math.log(targetZoom / prev) / .0015);
        await page.waitForFunction(p => Math.abs(Number(document.querySelector(".world-canvas").dataset.cameraZoom) - p) > 1e-6,
          prev, {timeout: 2000, polling: 30});
        zoom = (await pose()).zoom;
      }
      if (Math.abs(zoom - targetZoom) > 1e-3) throw Error("ZOOM_TARGET_NOT_REACHED: wanted " + targetZoom + " got " + zoom);
      return pose();
    };
    const shot = async label => {
      const f = `${view.name}-${label}.png`;
      await page.screenshot({path: resolve(OUT, f), fullPage: false, animations: "disabled"});
      rec.screenshots.push(f);
      return f;
    };

    // ---- Frame BOTH rigs in ONE frame: pan midpoint to center, zoom in ----
    const mid = {
      x: (worldFootprint("crusher", CRUSHER_CELL.x, CRUSHER_CELL.z, 0).pivot.x + worldFootprint("screening", SCREENING_CELL.x, SCREENING_CELL.z, 0).pivot.x) / 2,
      z: (worldFootprint("crusher", CRUSHER_CELL.x, CRUSHER_CELL.z, 0).pivot.z + worldFootprint("screening", SCREENING_CELL.x, SCREENING_CELL.z, 0).pivot.z) / 2,
    };
    let rect = await canvasRect();
    const center = () => ({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2});
    const onCanvas = p => p.x >= rect.left && p.x <= rect.left + rect.width && p.y >= rect.top && p.y <= rect.top + rect.height;
    // Ground-anchored drag: the world point under pM lands exactly at center.
    const panMidToCenter = async () => {
      let cam = await pose(); rect = await canvasRect();
      let pM = screenOfGround(cam, rect, mid.x, mid.z);
      if (!onCanvas(pM) || !(await topmostAt(pM))) {
        await wheelZoomAt(center(), view.minVisibleZoom);
        cam = await pose(); rect = await canvasRect();
        pM = screenOfGround(cam, rect, mid.x, mid.z);
      }
      const panIterations = [];
      for (let i = 0; i < 5; i++) {
        cam = await pose(); rect = await canvasRect();
        pM = screenOfGround(cam, rect, mid.x, mid.z);
        if (!onCanvas(pM)) throw Error("MIDPOINT_OFF_CANVAS after zoom-out: " + JSON.stringify(pM));
        const from = await exposedCanvasPoint(pM);
        const c = center();
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(c.x, c.y, {steps: 20});
        await page.mouse.up();
        await sleep(150); // let the synchronous stamp settle (stamp is sync; poll below)
        await page.waitForFunction(() => Number.isFinite(Number(document.querySelector(".world-canvas").dataset.cameraX)), null, {timeout: 4000});
        cam = await pose();
        panIterations.push({iter: i, cameraX: cam.x, cameraZ: cam.z});
        if (Math.abs(cam.x - mid.x) < .25 && Math.abs(cam.z - mid.z) < .25) break;
      }
      if (Math.abs(cam.x - mid.x) >= .25 || Math.abs(cam.z - mid.z) >= .25)
        throw Error("PAN_TARGET_NOT_REACHED: " + JSON.stringify({mid, cam, panIterations}));
      return panIterations;
    };
    const framePair = async () => {
      const panIterations = await panMidToCenter();
      const pairCam = await wheelZoomAt(center(), view.pairZoom);
      rect = await canvasRect();
      return {pairCam, panIterations};
    };
    const {pairCam, panIterations} = await framePair();
    const crusherBounds = rigBounds(pairCam, rect, "crusher", CRUSHER_CELL);
    const screeningBounds = rigBounds(pairCam, rect, "screening", SCREENING_CELL);
    const viewportRect = {left: 0, top: 0, width: view.viewport.width, height: view.viewport.height};
    const readable = [crusherBounds, screeningBounds].every(b => b.width >= 24 && b.height >= 24);
    rec.onScreenProof = {
      pairCamera: pairCam, canvasRect: rect, midpointWorld: mid, panIterations,
      crusherBounds, screeningBounds,
      crusherInside: insideRect(crusherBounds, rect, 2) && insideRect(crusherBounds, viewportRect, 0),
      screeningInside: insideRect(screeningBounds, rect, 2) && insideRect(screeningBounds, viewportRect, 0),
      sizes: {crusher: {w: crusherBounds.width, h: crusherBounds.height}, screening: {w: screeningBounds.width, h: screeningBounds.height}},
      readable, readabilityFloorPx: 24,
      note: "8-corner projected bounds (footprint x descriptor height) from the synchronous camera dataset stamp; numeric floor only, NOT visual certification",
    };
    await shot("pair");
    // Measure scroll at the pair frame too, so a later probe error cannot
    // leave the scroll assertion unmeasured.
    const scrollNow = () => page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2);
    rec.documentScrollAtPair = await scrollNow();
    rec.documentScroll = rec.documentScrollAtPair;

    // ---- rAF advancement across a real interval + environment ----
    const ticks0 = await page.evaluate(() => window.__rwSmoke?.rafTicks ?? -1);
    await sleep(600);
    const ticks1 = await page.evaluate(() => window.__rwSmoke?.rafTicks ?? -1);
    rec.rafProof = {before: ticks0, after: ticks1, delta: ticks1 - ticks0, intervalMs: 600};
    rec.framesAdvancing = ticks1 > ticks0;
    rec.webglContextCount = await page.evaluate(() => window.__rwSmoke?.webglContexts ?? -1);

    // ---- Real-UI picking proof: inspector opens on EACH rig by name ----
    const tap = p => view.touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
    // Scan the cell center plus 8 sub-cell offsets: on phone the expanded
    // sheet / alarm chrome can cover the exact center while the rig's own
    // footprint still has exposed canvas pixels. Every candidate is verified
    // with elementFromPoint — never tap through HUD.
    const clickableCell = async (type, cell) => {
      const fp = worldFootprint(type, cell.x, cell.z, 0);
      const r = await canvasRect(), c = await pose();
      const offsets = [];
      for (const o of [0, -.25, .25, -.42, .42]) for (const q of [0, -.25, .25, -.42, .42]) offsets.push([o, q]);
      offsets.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2)); // center-out
      for (let i = 0; i < fp.base.w; i++) for (let j = 0; j < fp.base.d; j++)
        for (const [ox, oz] of offsets) {
          const p = screenOfGround(c, r, fp.min.x + CELL / 2 + i * CELL + ox * CELL, fp.min.z + CELL / 2 + j * CELL + oz * CELL);
          if (p.x < r.left || p.x > r.left + r.width || p.y < r.top || p.y > r.top + r.height) continue;
          if (await topmostAt(p)) return p;
        }
      return null;
    };
    const pick = async (type, cell, name, label) => {
      let p = await clickableCell(type, cell);
      if (!p) {
        await sheetToggleTo(true);
        await sleep(300); // let the sheet CSS transition clear the hit-test
        p = await clickableCell(type, cell);
      }
      if (!p) {
        await page.keyboard.press("Escape"); // deselect: sheet chrome relaxes
        await sleep(300);
        p = await clickableCell(type, cell);
      }
      if (!p) {
        // Selecting a rig can reframe the phone camera (sheet-avoidance), and
        // real alarm chips (e.g. crusher input-starvation warning) float over
        // the canvas. Restore the proven pair framing and retry — same target
        // and zoom as the pair shot, so the pick stays inside that frame.
        await page.keyboard.press("Escape");
        await sheetToggleTo(true);
        await sleep(300);
        await framePair();
        p = await clickableCell(type, cell);
        rec.pickReframes = (rec.pickReframes || 0) + 1;
      }
      if (!p) {
        const fp = worldFootprint(type, cell.x, cell.z, 0);
        const r = await canvasRect(), c = await pose();
        const ctr = screenOfGround(c, r, fp.pivot.x, fp.pivot.z);
        throw Error("MACHINE_NOT_CLICKABLE " + name + " center=" + JSON.stringify(ctr) + " topmost=" + await topmostInfo(ctr));
      }
      rec.pickCameras = rec.pickCameras || {};
      rec.pickCameras[label] = await pose();
      await tap(p);
      await sheetToggleTo(false);
      const panel = page.locator(".inspector-panel");
      await panel.waitFor({timeout: 8000});
      await panel.getByText(name).first().waitFor({timeout: 8000});
      const text = (await panel.innerText()).replace(/\s+/g, " ").slice(0, 260);
      if (!text.includes(name) || !text.includes("1×1")) throw Error("PICKING_WRONG " + name + ": " + text);
      rec.loadedProof.inspectorTexts[label] = text;
      await shot(label + "-inspector");
      return text;
    };
    await pick("crusher", CRUSHER_CELL, "Crusher", "crusher");
    rec.loadedProof.crusherInspector = true;
    await pick("screening", SCREENING_CELL, "Screening Plant", "screening");
    rec.loadedProof.screeningInspector = true;
    await page.keyboard.press("Escape");
    await sheetToggleTo(true);

    // ---- Wider context shot: same target, zoomed out to show the yard ----
    await framePair(); // restore the pair target in case a pick reframed it
    await wheelZoomAt(center(), view.contextZoom);
    await shot("context");

    const env = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll("canvas").length,
      documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2,
    }));
    rec.canvasCount = env.canvasCount;
    rec.documentScroll = rec.documentScrollAtPair || env.documentScroll;
    rec.documentScrollAtEnd = env.documentScroll;
    rec.pageErrors = errs;
    rec.failedRequests = failed;
  } catch (e) {
    rec.probeError = String(e && e.stack || e).slice(0, 1200);
    rec.pageErrors = errs;
    rec.failedRequests = failed;
    if (page) {try {await shot("failure");} catch {}}
  } finally {
    await ctx.close();
  }
  rec.failures = viewFailures(rec);
  return rec;
}

async function main(argv) {
  const expectedSha = argv[0] || DEFAULT_EXPECTED_SHA;
  const liveUrl = new URL(process.env.RUSTWAKE_LIVE_URL || DEFAULT_LIVE_URL).href;
  const origin = new URL(liveUrl).origin;
  const started = new Date().toISOString();
  const errors = [];
  let sourceSha = null;
  await mkdir(OUT, {recursive: true});
  if (!SHA_RE.test(expectedSha)) errors.push("expected deployed SHA not a full 40-hex commit id: " + expectedSha);

  // Manifest gate BEFORE spending a browser: refuse to capture a stale build.
  if (!errors.length) {
    const manifestUrl = new URL("release-manifest.json", liveUrl.endsWith("/") ? liveUrl : liveUrl + "/").href;
    try {
      const res = await httpsFetch(manifestUrl);
      if (res.status !== 200) errors.push("release-manifest.json unreachable: HTTP " + res.status);
      else {
        const m = JSON.parse(res.buffer.toString("utf8"));
        sourceSha = String(m.source_sha || "");
        if (!SHA_RE.test(sourceSha)) errors.push("release-manifest.json malformed source_sha: " + sourceSha);
        else if (sourceSha !== expectedSha) errors.push(`live manifest source_sha ${sourceSha} != expected deployed SHA ${expectedSha} — refusing to capture a stale deployment`);
      }
    } catch (e) {
      errors.push("release-manifest.json unreachable: " + String(e && e.message || e));
    }
  }

  const views = [];
  let browser = null;
  if (!errors.length) {
    try {
      // ONE serialized Chromium; fresh sequential contexts, no shared state.
      browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
      for (const view of VIEW_SPECS) views.push(await probeView({browser, view, liveUrl, origin}));
    } catch (e) {
      errors.push("browser runner error: " + String(e && e.stack || e));
    } finally {
      if (browser) {try {await browser.close();} catch {}}
    }
  }

  const status = !errors.length && views.length === VIEW_SPECS.length && views.every(v => v.failures.length === 0)
    ? "PASS_NUMERIC_ONLY" : "FAIL";
  const report = {
    version: 1, issue: 552, condition: "C2.1 — desktop + phone captures at the DEPLOYED SHA, crusher and Screening Plant adjacent in ONE frame",
    check: "rustwake-552-c2-deployed-supplemental", build: "hosted-live", live_url: liveUrl,
    expected_source_sha: expectedSha, source_sha: sourceSha, started, completed: new Date().toISOString(),
    mergedPr: 577, releaseReceiptComment: 6986865110, deliveryRun: 44361310545, mainCiRun: 44361187797,
    fixture: {
      injection: "ctx.addInitScript BEFORE any page script; localStorage[SAVE_KEY] = real public-shape v2 save",
      saveKey: SAVE_KEY, save: FIXTURE,
      intent: "crusher id 7 at (9,9) + screening id 8 at (10,9), neighbouring tiles, both remaining:0, costs deducted and recorded as b.paid, both road-connected to depot (13,9) via the starter z=8 asphalt row; lastSavedAt=now so readGame runs no offline catch-up",
      readBack: "asserted from the app's OWN periodic persist, plus renderer machineCount/voxelSchema stamps, plus real-UI inspector picking by name, plus projected on-screen bounds",
    },
    sharedSilhouetteDisclosure: "src/voxelSchema.js aliases RAW_MACHINES.screening = RAW_MACHINES.crusher and src/world.js routes both kinds to the same ART-02 rig: the two machines look IDENTICAL in these captures BY DESIGN (product ruling 6986365525). NOT a rendering bug and NOT a distinct silhouette; the distinct screening-only silhouette is follow-up #578.",
    views, errors,
    vacuityAudit: "Every assertion is evaluated against measured page data (persisted save read-back, dataset stamps, projected bounds, rAF deltas, event counts). No check is structurally vacuous: each has a concrete failing condition exercised by viewFailures. Measured values are recorded per view so a reviewer can re-derive every verdict. The 24px readability floor is a numeric floor only, not visual certification.",
    limitations: [
      "PASS_NUMERIC_ONLY — numeric assertions plus real screenshot artifacts; NO visual-fidelity self-certification. Sponsor G1 (#276, request 6983776010) and physical handsets (#268/#275) remain OWED",
      "One headless Chromium/SwiftShader run against the live site; phone view is EMULATED 390x844 dpr2 (isMobile/hasTouch), not a physical handset",
      "reducedMotion:\"reduce\" per the capture-live precedent: the rAF render loop advances (measured) but ART-02 motion channels park; motion review belongs to the sponsor",
      "The two rigs share the ART-02 silhouette by design (product ruling 6986365525); distinct screening silhouette is #578",
      "Fixture yard is injected evidence state, not a fresh player yard; it uses the real public save shape and the app's own load/persist path",
      "The fixture crusher starts with no scrap input, so the real bay-backup alarm chip (alarm-chip-storage-7) can float over the canvas; on phone a pick may need the proven pair framing restored first (recorded per view as pickReframes/pickCameras). The alarm is genuine simulation state of the fixture yard, not a #577 defect; taps are only ever made on elementFromPoint-verified exposed canvas",
    ],
    status,
  };
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Rustwake #552 C2.1 deployed supplemental:", status,
    "source_sha=" + sourceSha, "expected=" + expectedSha, OUT);
  for (const v of views) {
    console.log(JSON.stringify({
      view: v.name, failures: v.failures.length, world3d: v.world3d,
      rafDelta: v.rafProof?.delta, webgl: v.webglContextCount,
      crusher: v.loadedProof?.crusher, screening: v.loadedProof?.screening,
      adjacent: v.loadedProof?.adjacent, roadPaths: {crusher: v.loadedProof?.crusherRoadPath, screening: v.loadedProof?.screeningRoadPath},
      machineCount: v.loadedProof?.machineCountStamp,
      onScreen: {crusher: v.onScreenProof?.crusherInside, screening: v.onScreenProof?.screeningInside, sizes: v.onScreenProof?.sizes},
      inspectors: {crusher: v.loadedProof?.crusherInspector, screening: v.loadedProof?.screeningInspector},
      documentScroll: v.documentScroll, pageErrors: v.pageErrors?.length, failedRequests: v.failedRequests?.length,
      screenshots: v.screenshots,
    }, null, 2));
    if (v.failures.length) console.error(v.name + " FAILURES: " + v.failures.join("; "));
  }
  if (errors.length) console.error(errors.join("\n"));
  return status === "PASS_NUMERIC_ONLY" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => {process.exitCode = code;})
    .catch(err => {console.error("552-c2: FAIL unexpected error:", err); process.exitCode = 1;});
}
