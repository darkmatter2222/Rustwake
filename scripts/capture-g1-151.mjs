// @ts-nocheck
/**
 * Issue #151 (G1/P1 gate) pass-3 running-build captures: V01/V02/V05/BLOCKED
 * scene renders (desktop + phone), V04 60 s motion clips with per-frame hashes,
 * export/import round-trip, hidden-tab paint freeze and WebGL context-loss
 * behaviour — all against the REAL built app (vite preview of this branch's
 * dist), seeded with the pass-1 release fixtures through the game's own
 * encodeSave before first paint.
 *
 * NON-VISION DISCLAIMER: every check here is a numeric browser/engine readout
 * (sha256 frame hashes, dataset stamps, decoded save fields, pixel crops).
 * No visual-fidelity claim is made; capable visual inspection is PENDING the
 * sponsor at the live URL (G1 #151). HEADLESS CHROME EMULATION on a desktop
 * host, NOT a physical phone (#190 blocker): viewport/dpr/isMobile/hasTouch are
 * emulated; CPU/GPU/thermal/real-touch/mobile-network are NOT.
 *
 * V05 HONESTY NOTE: at this SHA the sim's machine.build is INSTANT
 * (src/game/simulation/commands.ts buildMachine) and the staged assembly
 * presentation (src/game/renderer/assembly.ts + three/assemblyView.ts, T10
 * #137) is unit-tested but NOT imported by the running renderer
 * (three/worldRenderer.ts / three/index.ts); the shell wiring join is owned by
 * #199. This script therefore captures what the running build ACTUALLY does
 * (instant placement, exact single charge, reload persistence, 0-5 s frame
 * sequence) and records the missing staged-construction clip as a GAP finding
 * for pass 4 / the sponsor. It never fabricates stage frames.
 *
 * Usage (tsx resolves the .ts fixture/save imports):
 *   npm run build                      # once, produces dist/
 *   npx tsx scripts/capture-g1-151.mjs # self-manages vite preview on :4168
 *
 * Exit codes: 0 iff every HARD numeric check passes; 1 on any hard failure or
 * crash. Findings (V05 gap, soft crop statistics) are recorded, not crashed on.
 *
 * Writes only docs/screenshots/151-*.png and docs/evidence/151-*.{json,md}.
 * Never touches src/.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  launchBrowser, headSha, evidenceDir, repoRoot, percentile,
} from "../tests/renderer/rw3d-t07/lib.mjs";
import {
  buildOpening, buildMature, buildBlocked, fixtureSaveText,
  MATURE_BUILDINGS, MATURE_UNITS,
} from "../tests/fixtures/release.ts";
import {
  SAVE_KEY, DEFAULT_SETTINGS, decodeSave, encodeSave,
} from "../src/game/persistence/save.ts";
import { BLUEPRINTS } from "../src/game/content/defs.ts";
import { fleetUnits } from "../src/game/simulation/types.ts";
import { tileToWorld, worldToScreen } from "../src/game/renderer/scene.ts";
import { ASSEMBLY_STAGES } from "../src/game/renderer/assembly.ts";

const SHA = headSha();
const GENERATED = new Date().toISOString();
const LIMITATION =
  "HEADLESS CHROME EMULATION on a desktop host, NOT a physical phone (#190). " +
  "Numeric checks only; visual fidelity PENDING sponsor inspection at the live URL (G1 #151). " +
  "Frame-time/memory are host-relative; a concurrent P02 background loop may add host contention.";
const PORT = 4168;
const URL = `http://localhost:${PORT}/`;
const shotDir = resolve(repoRoot, "docs/screenshots");
mkdirSync(shotDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

/* ---- checks / reporting ---------------------------------------------------- */
const checks = [];
const findings = [];
const artifacts = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }
function finding(name, detail) { findings.push({ name, detail }); console.log(`[FINDING] ${name}: ${detail}`); }
const round = (n, p = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** p) / 10 ** p);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function writeReport(name, report) {
  const out = resolve(evidenceDir, name);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`written: ${out}`);
  artifacts.push(out);
  return out;
}
function finish(report) {
  report.checks = checks;
  report.findings = findings;
  const failed = checks.filter((c) => !c.pass);
  report.pass = failed.length === 0;
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  console.log(`capture-g1-151: ${report.pass ? "PASS" : "FAIL"} (${checks.length - failed.length}/${checks.length} hard checks, ${findings.length} findings)`);
  return report.pass ? 0 : 1;
}
/** Real per-section verdict for a sub-report: filter the global checks by name
 *  prefix and compute pass from the SAME numeric checks (never a placeholder). */
function sectionVerdict(prefix) {
  const section = checks.filter((c) => c.name.startsWith(prefix));
  const failed = section.filter((c) => !c.pass);
  return { checks: section, pass: failed.length === 0, total: section.length, passed: section.length - failed.length };
}

/* ---- preview server -------------------------------------------------------- */
async function startPreview(port) {
  const child = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: repoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (res.ok && (await res.text()).includes('id="root"')) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  throw new Error(`vite preview did not start on ${port} within 30s (run npm run build first)`);
}
const stopServer = (child) => { if (child && child.exitCode === null) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" }); };

/* ---- seeded contexts ------------------------------------------------------- */
const appSeed = (sim) => fixtureSaveText(sim, Date.now(), { ...DEFAULT_SETTINGS, muted: true });
// Fixture reference-clock lead (ms): keeps store.creditAbsence at exactly zero
// offline ticks regardless of bundle-load latency (see newSeededContext). Small
// enough to be an obvious fixture artifact, large enough to cover any localhost
// load. The first real persist() rewrites lastSeenMs to wall-clock now().
const SEED_AHEAD_MS = 5000;

/** Seed before first paint + instrument GL contexts and tab visibility.
 *  The hidden/visibilityState getters are the SAME emulation the coordinator-
 *  verified T07 harness hiddenPause() uses (Object.defineProperty on document);
 *  the app's own document.hidden guard (scene.ts) does the rest. */
async function newSeededContext(browser, device, sim) {
  const context = await browser.newContext({ ...device, reducedMotion: "no-preference" });
  const seed = appSeed(sim);
  if (!decodeSave(seed).ok) throw new Error("fixture seed rejected by decodeSave");
  // CALIBRATION (pass 3, area 1 + V05 reload): seed ONLY when the slot is empty,
  // and stamp lastSeenMs slightly AHEAD of wall-clock at DOCUMENT START.
  //  - The store credits the absence since lastSeenMs once at construction
  //    (src/app/store.ts creditAbsence -> offline.ts catchUp advances the sim by
  //    floor((now-lastSeenMs)/TICK_MS) ticks, with NO inline minimum). A seed
  //    stamped at context creation arrives seconds later with tick>0, so
  //    hasSaveProgress is true and the gate correctly reads "Continue" even for
  //    the pristine OPENING yard. Stamping at init alone is not enough: bundle-
  //    load-to-construction latency can still exceed TICK_MS (100 ms). Stamping
  //    SEED_AHEAD_MS ahead makes (now-lastSeenMs) negative, so Math.max(0,...)=0
  //    and catch-up provably credits ZERO ticks regardless of load latency. The
  //    fixture then presents its exact intended state — a genuinely fresh opening
  //    yard ("Begin recovery") for V01. This is fixture calibration, NOT a relaxed
  //    check: offline catch-up itself is verified separately by the P02 harness.
  //  - Seeding only when absent keeps a mid-test reload a PERSISTENCE test: the
  //    old unconditional setItem re-wrote the fixture over the persisted save on
  //    every navigation, which would have erased a committed V05 build.
  await context.addInitScript(([k, v, ahead]) => {
    if (localStorage.getItem(k)) return; // never clobber a persisted save on reload
    const env = JSON.parse(v);
    env.payload.lastSeenMs = Date.now() + ahead;
    const body = JSON.stringify(env.payload);
    let hash = 0x811c9dc5;
    for (let i = 0; i < body.length; i += 1) { hash ^= body.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
    env.checksum = hash.toString(16).padStart(8, "0");
    localStorage.setItem(k, JSON.stringify(env));
  }, [SAVE_KEY, seed, SEED_AHEAD_MS]);
  await context.addInitScript(() => {
    window.__rwGL = [];
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      const ctx = orig.call(this, type, ...a);
      if (ctx && /webgl/.test(String(type))) window.__rwGL.push(ctx);
      return ctx;
    };
    // CALIBRATION (pass 3, area 5): __rwGL[0] is the throwaway WebGL PROBE canvas
    // (src/game/renderer/three/index.ts probeWebGL), NOT the world. The active
    // world context is the one whose canvas blitWorld3D draws into the visible 2D
    // canvas every frame (index.ts: ctx.drawImage(w.canvas, ...)). Record that
    // source canvas so context-loss targets the REAL world context.
    window.__rwActiveGLCanvas = null;
    const origDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (src, ...a) {
      if (src && window.__rwGL.some((g) => g.canvas === src)) window.__rwActiveGLCanvas = src;
      return origDraw.call(this, src, ...a);
    };
    window.__rwHidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__rwHidden === true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__rwHidden === true ? "hidden" : "visible") });
  });
  return context;
}

async function openApp(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForSelector(".game canvas", { timeout: 30000 });
  const gate = await page.evaluate(() => {
    const b = document.querySelector(".gate__btn");
    if (!b) return null;
    const label = (b.textContent || "").trim();
    b.click();
    return label;
  });
  await page.waitForFunction(() => {
    const c = document.querySelector(".game canvas");
    return c && (c.dataset.world3d === "ready" || c.dataset.world3d === "unavailable");
  }, { timeout: 30000 });
  await page.waitForTimeout(2500); // settle: camera fit + first batches
  return { page, pageErrors, gate };
}

/** Numeric truth of the RUNNING app: the live persisted envelope (PERSIST_MS
 *  1000) decoded through the game's own decodeSave. No debug globals exist in
 *  the built app; this is the shipped persistence path, read-only. */
async function readSave(page) {
  const raw = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  const d = decodeSave(raw);
  if (!d.ok) return { ok: false, reason: d.reason, raw };
  const s = d.payload.sim;
  return {
    ok: true, raw, sha: sha256(Buffer.from(raw, "utf8")),
    tick: s.tick, credits: s.credits,
    machines: s.machines.length, drones: fleetUnits(s).length, routes: s.routes.length,
    scrap: s.store.scrap, steel: s.store.steel,
    storeUnits: s.storeUnits, storeCapacity: s.storeCapacity,
    machineList: s.machines.map((m) => ({
      id: m.id, blueprint: m.blueprint, tile: m.tile, status: m.status, ageTicks: m.ageTicks,
      routed: s.routes.some((r) => (r.from.kind === "machine" && r.from.id === m.id) || (r.to.kind === "machine" && r.to.id === m.id)),
    })),
    // Fleet cargo state for the EXACT drone-scrap conservation correction below.
    fleet: fleetUnits(s).map((u) => ({ accumulated: u.accumulated, inFlightQty: u.inFlight ? u.inFlight.qty : 0, deliveries: u.deliveries })),
    wreckRemaining: s.wreck.remaining,
    lastSeenMs: d.payload.lastSeenMs, settings: d.payload.settings,
  };
}

/** Exact scrap the drone fleet delivered INTO the store between two persisted
 *  snapshots, by conservation: each unit's `accumulated` rises only when it takes
 *  cargo from the wreck (engine.ts updateUnit), and `inFlight.qty` is cargo still
 *  in the air. arrived = taken - delta(inFlight). This removes the periodic
 *  +5/unit drone deliveries (TUNING.droneDeliveryTicks) from a charge/drift
 *  measurement WITHOUT weakening it — the correction is computed, not assumed. */
function droneScrapArrived(before, after) {
  if (!before.fleet || !after.fleet || before.fleet.length !== after.fleet.length) return null;
  let taken = 0, flightDelta = 0;
  for (let i = 0; i < before.fleet.length; i += 1) {
    taken += after.fleet[i].accumulated - before.fleet[i].accumulated;
    flightDelta += after.fleet[i].inFlightQty - before.fleet[i].inFlightQty;
  }
  return taken - flightDelta;
}

/** Refresh lastSeenMs so a reload exercises PURE persistence with zero offline
 *  catch-up (same envelope rewrite pattern as scripts/capture.mjs). Stamped
 *  SEED_AHEAD_MS ahead so the reload loads the persisted yard exactly — the
 *  "no second build charge" check then sees only natural post-reload drift, not
 *  a catch-up burst. Offline catch-up is verified separately by the P02 harness. */
async function refreshLastSeen(page) {
  await page.evaluate(([k, ahead]) => {
    const raw = localStorage.getItem(k);
    if (!raw) return;
    const env = JSON.parse(raw);
    env.payload.lastSeenMs = Date.now() + ahead;
    const body = JSON.stringify(env.payload);
    let hash = 0x811c9dc5;
    for (let i = 0; i < body.length; i += 1) { hash ^= body.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
    env.checksum = hash.toString(16).padStart(8, "0");
    localStorage.setItem(k, JSON.stringify(env));
  }, [SAVE_KEY, SEED_AHEAD_MS]);
}

async function shot(page, name) {
  const path = resolve(shotDir, `151-${name}.png`);
  const buf = await page.screenshot({ path });
  const rec = { name: `151-${name}.png`, path, sha256: sha256(buf), bytes: buf.length };
  artifacts.push(path);
  return rec;
}

const canvasStamp = (page) => page.evaluate(() => {
  const c = document.querySelector(".game canvas");
  return c ? { cam: c.dataset.cam ?? null, world3d: c.dataset.world3d ?? null } : null;
});

// DEFECT #2 fix (pass 3): the authoritative paint-surface measurement is the 2D
// canvas backing store read IN-PAGE (getImageData FNV) — the coordinator-verified
// T07 harness method (harness.mjs imageData()/hiddenPause()). A live attribution
// probe proved the production hidden guard (scene.ts:277 drawScene /
// three/index.ts:108 blitWorld3D) freezes the backing store: 30/30 in-page samples
// identical while document.hidden=true, yet Playwright canvas.screenshot() bytes
// vary frame-to-frame (a compositor/GPU-readback artifact, NOT app painting).
// Freeze + motion checks therefore use this backing-store hash; the PNG
// screenshots remain supplementary visual evidence. This is a more direct
// measurement of the surface drawScene writes, not a relaxation of any threshold.
const canvasPixelHash = (page) => page.evaluate(() => {
  const c = document.querySelector(".game canvas");
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
});

// CALIBRATION (pass 3, area 3): crop hashes use the SAME authoritative in-page
// 2D backing-store read as canvasPixelHash (DEFECT #2 fix), not page.screenshot
// ({clip}) — compositor/GPU readback varies frame-to-frame even when the backing
// store is frozen, which made a static starved tile read 20/20 unique. The rect
// is canvas-relative CSS pixels; it is scaled to backing-store pixels in-page.
const cropPixelHash = (page, rect) => page.evaluate((r) => {
  const c = document.querySelector(".game canvas");
  if (!c) return null;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const sx = c.width / c.clientWidth, sy = c.height / c.clientHeight;
  const x = Math.max(0, Math.min(c.width - 1, Math.round(r.x * sx)));
  const y = Math.max(0, Math.min(c.height - 1, Math.round(r.y * sy)));
  const w = Math.max(1, Math.min(c.width - x, Math.round(r.w * sx)));
  const h = Math.max(1, Math.min(c.height - y, Math.round(r.h * sy)));
  const d = ctx.getImageData(x, y, w, h).data;
  let hash = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 1) { hash ^= d[i]; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}, rect);

/** Fresh camera + canvas geometry, read per sample so a crop tracks the camera. */
const canvasGeom = (page) => page.evaluate(() => {
  const c = document.querySelector(".game canvas");
  const r = c.getBoundingClientRect();
  const parts = (c.dataset.cam || "").split(",").map((v) => parseFloat(v));
  return { left: r.left, top: r.top, width: c.clientWidth, height: c.clientHeight, cam: parts };
});

/** Canvas-relative CSS crop rect centred on a machine tile (and its page clip). */
function tileCrop(geom, tile) {
  const w = tileToWorld(tile);
  const p = worldToScreen({ x: geom.cam[0], y: geom.cam[1], scale: geom.cam[2] }, { width: geom.width, height: geom.height }, w.x, w.y);
  const half = Math.max(18, 26 * geom.cam[2]);
  const x = Math.max(0, p.x - half);
  const y = Math.max(0, p.y - half);
  const rect = { x, y, w: Math.min(2 * half, geom.width - x), h: Math.min(2 * half, geom.height - y) };
  const clip = { x: geom.left + x, y: geom.top + y, width: rect.w, height: rect.h };
  return { rect, clip };
}

const clickDock = (page, label) => page.evaluate((want) => {
  const faces = [...document.querySelectorAll(".dock .dock__btn")];
  const texts = faces.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
  const index = texts.indexOf(want);
  if (index >= 0) faces[index].click();
  return { index, faces: texts };
}, label);

const clickByText = (page, text) => page.evaluate((label) => {
  const b = [...document.querySelectorAll("button")].find((n) => (n.textContent ?? "").trim().startsWith(label));
  if (!b) return false;
  b.click();
  return true;
}, text);

async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    window.__rwHidden = h;
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/* ---- scene renders: V01 / V02 / BLOCKED ------------------------------------ */
async function captureScenes(browser, report) {
  const opening = buildOpening();
  const mature = buildMature();
  const blocked = buildBlocked();
  const scenes = {};
  for (const [devName, device] of Object.entries(DEVICES)) {
    // V01 — opening: a genuinely fresh yard (lastSeenMs stamped at first paint,
    // so creditAbsence sees no gap and tick stays 0) must read "Begin recovery".
    // hasSaveProgress (save.ts) is false for the pristine seed; the earlier
    // "Continue" was seed-to-load catch-up contamination, not an app defect.
    {
      const context = await newSeededContext(browser, device, opening.sim);
      const { page, pageErrors, gate } = await openApp(context);
      const gateShot = await shot(page, `v01-opening-yard-${devName}`);
      const save = await readSave(page);
      const stamp = await canvasStamp(page);
      scenes[`v01-${devName}`] = { gate, save: { tick: save.tick, machines: save.machines }, stamp, shot: gateShot, pageErrors };
      check(`v01-${devName}: gate offered`, "Begin recovery", gate, gate === "Begin recovery");
      check(`v01-${devName}: fresh yard machines`, 0, save.machines, save.machines === 0);
      check(`v01-${devName}: world3d ready`, "ready", stamp?.world3d, stamp?.world3d === "ready");
      check(`v01-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
      await context.close();
    }
    // V02 — mature: 20 buildings / 30 units, routed economy running.
    {
      const context = await newSeededContext(browser, device, mature.sim);
      const { page, pageErrors, gate } = await openApp(context);
      await page.waitForTimeout(2500);
      const s = await shot(page, `v02-mature-${devName}`);
      const save = await readSave(page);
      const stamp = await canvasStamp(page);
      scenes[`v02-${devName}`] = { gate, save: { tick: save.tick, machines: save.machines, drones: save.drones, routes: save.routes, storeUnits: save.storeUnits }, stamp, shot: s, pageErrors };
      check(`v02-${devName}: gate offered`, "Continue", gate, gate === "Continue");
      check(`v02-${devName}: mature machines`, MATURE_BUILDINGS, save.machines, save.machines === MATURE_BUILDINGS);
      check(`v02-${devName}: mature drones`, 5, save.drones, save.drones === 5);
      check(`v02-${devName}: world3d ready`, "ready", stamp?.world3d, stamp?.world3d === "ready");
      check(`v02-${devName}: sim ticking`, ">0", save.tick, save.tick > 0);
      check(`v02-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
      await context.close();
    }
    // BLOCKED — storage full + occupied bay: the recovery-blocked witness.
    {
      const context = await newSeededContext(browser, device, blocked.sim);
      const { page, pageErrors, gate } = await openApp(context);
      await page.waitForTimeout(1500);
      const s = await shot(page, `blocked-yard-${devName}`);
      const save = await readSave(page);
      const stamp = await canvasStamp(page);
      const alert = await page.evaluate(() => {
        const a = document.querySelector(".hud-alert");
        return a ? { present: true, role: a.getAttribute("role"), text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) } : { present: false };
      });
      scenes[`blocked-${devName}`] = { gate, save: { tick: save.tick, storeUnits: save.storeUnits, storeCapacity: save.storeCapacity }, stamp, alert, shot: s, pageErrors };
      check(`blocked-${devName}: storage at capacity`, blocked.sim.storeCapacity, save.storeUnits, save.storeUnits >= save.storeCapacity);
      check(`blocked-${devName}: storage alert visible`, true, alert.present, alert.present === true);
      check(`blocked-${devName}: world3d ready`, "ready", stamp?.world3d, stamp?.world3d === "ready");
      check(`blocked-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
      await context.close();
    }
  }
  report.scenes = scenes;
}

/* ---- V05: construction reality at this SHA --------------------------------- */
async function captureV05(browser, report) {
  const mature = buildMature();
  const v05 = {};
  for (const [devName, device] of Object.entries(DEVICES)) {
    const context = await newSeededContext(browser, device, mature.sim);
    const { page, pageErrors } = await openApp(context);
    const before = await readSave(page);
    const beforeShot = await shot(page, `v05-before-${devName}`);
    // Dock Build face -> catalog (arms first unlocked blueprint + first free tile).
    const dock = await clickDock(page, "Build");
    await page.waitForSelector(".catalog", { timeout: 10000 });
    await page.waitForTimeout(400);
    const catalogShot = await shot(page, `v05-catalog-${devName}`);
    const armed = await page.evaluate(() => {
      const b = document.querySelector(".catalog__place");
      return b ? { label: (b.textContent || "").trim(), disabled: b.disabled } : null;
    });
    // CALIBRATION (pass 3, area 2): the catalog Place button ONLY closes the
    // catalog into the armed placement preview (App.tsx onPlace -> setCatalogOpen
    // (false)). The actual spend is the dock's armed primary face "Build {machine}"
    // (Hud.tsx DockButtons -> App.tsx onPlace -> dispatch machine.build). The old
    // script stopped at Place, so nothing was ever built (placed:null) and the
    // -2 scrap it saw was natural route feed. Commit through the shipped dock
    // face, then POLL the persisted envelope until the build flushes (PERSIST_MS
    // 1000) instead of reading a stale 350 ms snapshot.
    await page.evaluate(() => document.querySelector(".catalog__place")?.click());
    await page.waitForTimeout(250);
    const commitFace = await page.evaluate(() => {
      const b = document.querySelector(".dock .dock__btn--primary");
      return b ? { label: (b.textContent || "").replace(/\s+/g, " ").trim(), disabled: b.disabled } : null;
    });
    const beforeCommit = await readSave(page);
    await page.evaluate(() => {
      const b = document.querySelector(".dock .dock__btn--primary");
      if (b && !b.disabled) b.click();
    });
    const t0 = await shot(page, `v05-t0-${devName}`);
    let after = await readSave(page);
    for (let i = 0; i < 16 && after.machines !== beforeCommit.machines + 1; i += 1) {
      await page.waitForTimeout(200);
      after = await readSave(page);
    }
    const placed = after.machineList.find((m) => !beforeCommit.machineList.some((b) => b.id === m.id)) ?? null;
    const cost = placed ? BLUEPRINTS[placed.blueprint]?.buildCost ?? [] : [];
    const costOf = (r) => cost.find((c) => c.resource === r)?.qty ?? 0;
    const scrapDelta = after.scrap - beforeCommit.scrap;
    const steelDelta = after.steel - beforeCommit.steel;
    // Exact drone-scrap correction (conservation, see droneScrapArrived). The
    // remaining natural scrap drift is route feed into the sorter (<= a few units
    // over the <=2 s bracket); steel has NO natural source/sink in this window
    // (the only furnace is starved and a batch takes 40 ticks), so steel is exact.
    const droneArrived = droneScrapArrived(beforeCommit, after);
    const scrapCorrected = droneArrived === null ? null : scrapDelta - droneArrived;
    const tickBracket = after.tick - beforeCommit.tick;
    check(`v05-${devName}: catalog opened`, true, armed !== null && !armed.disabled, armed !== null && armed.disabled === false);
    check(`v05-${devName}: armed dock commit face`, "Build {machine}, enabled", commitFace, commitFace !== null && commitFace.disabled === false && commitFace.label.startsWith("Build"));
    check(`v05-${devName}: machine added`, beforeCommit.machines + 1, after.machines, after.machines === beforeCommit.machines + 1);
    check(`v05-${devName}: scrap charged exactly once (drone-corrected)`, `${-costOf("scrap")} +/-6`, scrapCorrected, placed !== null && scrapCorrected !== null && scrapCorrected <= -costOf("scrap") + 6 && scrapCorrected >= -costOf("scrap") - 6);
    check(`v05-${devName}: steel charged exactly once`, -costOf("steel"), steelDelta, placed !== null && steelDelta === -costOf("steel"));
    // 0-5 s frame sequence after placement (the V05 acceptance timeline).
    const seq = [{ t: 0, ...t0 }];
    for (let t = 1; t <= 5; t += 1) {
      await page.waitForTimeout(1000);
      seq.push({ t, ...(await shot(page, `v05-t${t}-${devName}`)) });
    }
    const seqUnique = new Set(seq.map((f) => f.sha256)).size;
    // Crop the placed machine tile across the sequence: staged construction
    // would change its pixels stage by stage; instant build paints the full
    // kit at t0. Occlusion tolerance: drones/overlay may cross the crop.
    let crop = null;
    if (placed) {
      const hashes = [];
      let firstClip = null;
      for (let i = 0; i < 6; i += 1) {
        const geom = await canvasGeom(page);
        if (geom.cam.length >= 3 && geom.cam.every((v) => Number.isFinite(v))) {
          const { rect, clip } = tileCrop(geom, placed.tile);
          if (rect.w > 8 && rect.h > 8) {
            hashes.push(await cropPixelHash(page, rect));
            if (i === 0) {
              firstClip = clip;
              const buf = await page.screenshot({ clip });
              const cp = resolve(shotDir, `151-v05-crop-${devName}.png`); writeFileSync(cp, buf); artifacts.push(cp);
            }
          }
        }
        await page.waitForTimeout(900);
      }
      if (hashes.length) {
        const mode = hashes.sort((a, b) => hashes.filter((h) => h === b).length - hashes.filter((h) => h === a).length)[0];
        crop = { tile: placed.tile, measurement: "in-page 2D backing-store FNV (getImageData)", hashes, identicalToMode: hashes.filter((h) => h === mode).length, samples: hashes.length, clip: firstClip };
      }
    }
    // Reload mid-"build": persistence + no second charge. Refresh lastSeenMs
    // first so the reload is a persistence test, not an offline catch-up test.
    await refreshLastSeen(page);
    const preReload = await readSave(page);
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".game canvas", { timeout: 30000 });
    await page.evaluate(() => document.querySelector(".gate__btn")?.click());
    await page.waitForFunction(() => {
      const c = document.querySelector(".game canvas");
      return c && (c.dataset.world3d === "ready" || c.dataset.world3d === "unavailable");
    }, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const reloaded = await readSave(page);
    const reloadShot = await shot(page, `v05-reload-${devName}`);
    const reloadScrapDelta = reloaded.scrap - preReload.scrap;
    const reloadSteelDelta = reloaded.steel - preReload.steel;
    const reloadTickDelta = reloaded.tick - preReload.tick;
    const reloadDroneArrived = droneScrapArrived(preReload, reloaded);
    const reloadScrapCorrected = reloadDroneArrived === null ? null : reloadScrapDelta - reloadDroneArrived;
    check(`v05-${devName}: reload keeps machine`, after.machines, reloaded.machines, reloaded.machines === after.machines);
    // No second charge: drone-corrected scrap drift is natural route feed only
    // (a second build would be -30); steel has no natural sink, so it is unchanged.
    check(`v05-${devName}: reload no second build charge (drone-corrected scrap)`, "[-6,+6]", reloadScrapCorrected, reloadScrapCorrected !== null && reloadScrapCorrected >= -6 && reloadScrapCorrected <= 6);
    check(`v05-${devName}: reload steel unchanged`, 0, reloadSteelDelta, reloadSteelDelta === 0);
    check(`v05-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
    v05[devName] = {
      before: { machines: before.machines, scrap: before.scrap, steel: before.steel },
      beforeCommit: { machines: beforeCommit.machines, scrap: beforeCommit.scrap, steel: beforeCommit.steel, tick: beforeCommit.tick },
      placed, cost, scrapDelta, steelDelta, droneArrived, scrapCorrected, tickBracket,
      armed, commitFace, dockFaces: dock.faces,
      sequence: seq.map(({ t, sha256, name }) => ({ t, sha256, name })), seqUnique,
      placedMachineCrop: crop,
      reload: { machines: reloaded.machines, scrapDelta: reloadScrapDelta, droneArrived: reloadDroneArrived, scrapCorrected: reloadScrapCorrected, steelDelta: reloadSteelDelta, tickDelta: reloadTickDelta, shot: reloadShot },
      beforeShot, catalogShot, pageErrors,
    };
    await context.close();
  }
  finding("V05 staged construction GAP",
    "ACCEPTANCE V05 requires a 0/1/2/3/4/5 s base/frame/walls/roof/activation clip and mid-build reload resume. " +
    "At this SHA machine.build is INSTANT (src/game/simulation/commands.ts buildMachine: no construction stages in SimState) " +
    "and the running renderer paints the full kit at t0. The staged assembly controller EXISTS " +
    "(src/game/renderer/assembly.ts ASSEMBLY_STAGES=" + JSON.stringify(ASSEMBLY_STAGES) + ", three/assemblyView.ts, " +
    "unit-tested by tests/renderer/assembly-stage.test.ts / assembly-timing.test.ts / assembly-view.test.ts and the rw3d-t10 harness) " +
    "but is NOT imported by three/worldRenderer.ts or three/index.ts; the app join is owned by shell wiring #199. " +
    "Captured instead: instant placement, exact single charge, 0-5 s frame sequence, reload persistence. " +
    "The staged clip CANNOT be produced from the running build at this SHA — pass 4 must record this as unmet/pending, not pass.");
  report.v05 = v05;
}

/* ---- V04: 60 s motion clips + truthful freeze ------------------------------ */
async function captureV04(browser, report) {
  const mature = buildMature();
  const v04 = {};
  const FRAMES = 120; // 2 fps x 60 s
  const HIDDEN_FROM = 60, HIDDEN_TO = 67; // t=30..33.5 s: 8 frozen frames
  for (const [devName, device] of Object.entries(DEVICES)) {
    const context = await newSeededContext(browser, device, mature.sim);
    const { page, pageErrors } = await openApp(context);
    await page.waitForTimeout(2000);
    const canvas = page.locator(".game canvas");
    const start = Date.now();
    const frames = [];
    let tickStart = null, tickEnd = null, hiddenTickStart = null, hiddenTickEnd = null;
    let readyCount = 0;
    for (let i = 0; i < FRAMES; i += 1) {
      const target = start + i * 500;
      const wait = target - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      if (i === HIDDEN_FROM) {
        await setHidden(page, true);
        hiddenTickStart = (await readSave(page)).tick;
      }
      if (i === HIDDEN_TO + 1) {
        hiddenTickEnd = (await readSave(page)).tick;
        await setHidden(page, false);
      }
      // Canvas-only capture: the painted yard is the motion surface. A full-
      // page shot would include the ticking HUD DOM and make hashes vacuous.
      // DEFECT #2 diagnostic: sample what the production hidden-pause guard
      // (scene.ts drawScene / index.ts blitWorld3D read document.hidden) actually
      // sees at capture time, so a non-frozen hidden window is attributed honestly
      // — emulation lag (hidden reads false) vs. app defect (hidden true, still paints).
      const vis = await page.evaluate(() => ({
        hidden: document.hidden, visibilityState: document.visibilityState, rwHidden: window.__rwHidden === true,
      }));
      const buf = await canvas.screenshot();
      const inPageHash = await canvasPixelHash(page);
      const stamp = await canvasStamp(page);
      if (stamp?.world3d === "ready") readyCount += 1;
      const rec = { i, tMs: Date.now() - start, sha256: sha256(buf), inPageHash, world3d: stamp?.world3d ?? null, cam: stamp?.cam ?? null, docHidden: vis.hidden, visState: vis.visibilityState, rwHidden: vis.rwHidden };
      if (i % 10 === 0 || i === FRAMES - 1) {
        const save = await readSave(page);
        rec.tick = save.tick;
        if (tickStart === null) tickStart = save.tick;
        tickEnd = save.tick;
      }
      if (i % 6 === 0) {
        const path = resolve(shotDir, `151-v04-${devName}-f${String(i).padStart(3, "0")}.png`);
        writeFileSync(path, buf);
        artifacts.push(path);
        rec.png = `151-v04-${devName}-f${String(i).padStart(3, "0")}.png`;
      }
      frames.push(rec);
    }
    // Authoritative paint-surface hashes = in-page 2D backing store (DEFECT #2
    // fix). Screenshot hashes are retained per-frame as supplementary evidence.
    const hashes = frames.map((f) => f.inPageHash);
    const screenshotHashes = frames.map((f) => f.sha256);
    const unique = new Set(hashes).size;
    let maxRun = 1, run = 1;
    for (let i = 1; i < hashes.length; i += 1) {
      run = hashes[i] === hashes[i - 1] ? run + 1 : 1;
      if (i <= HIDDEN_FROM || i > HIDDEN_TO) maxRun = Math.max(maxRun, run);
    }
    const hiddenHashes = hashes.slice(HIDDEN_FROM, HIDDEN_TO + 1);
    const hiddenFrozen = new Set(hiddenHashes).size === 1;
    const resumedDiffers = hashes[HIDDEN_TO + 1] !== hiddenHashes[hiddenHashes.length - 1];
    const tickDelta = tickEnd - tickStart;
    const hiddenTickDelta = hiddenTickEnd - hiddenTickStart;
    check(`v04-${devName}: independent motion (unique canvas hashes)`, ">=100 of 120", unique, unique >= 100);
    check(`v04-${devName}: no frozen run outside hidden window`, "<=2", maxRun, maxRun <= 2);
    check(`v04-${devName}: hidden-tab paint frozen`, "8/8 identical", `${new Set(hiddenHashes).size} unique of 8`, hiddenFrozen);
    check(`v04-${devName}: sim alive while hidden (tick delta)`, ">=30", hiddenTickDelta, hiddenTickDelta >= 30);
    check(`v04-${devName}: paint resumes after restore`, true, resumedDiffers, resumedDiffers);
    check(`v04-${devName}: 60 s sim catch-up (tick delta)`, "560..660", tickDelta, tickDelta >= 560 && tickDelta <= 660);
    check(`v04-${devName}: world3d ready every frame`, FRAMES, readyCount, readyCount === FRAMES);
    check(`v04-${devName}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);
    // Repeated-hash guard demanded by the brief: a clip whose frames repeat
    // outside the truthful hidden window is NOT motion evidence.
    if (unique < 100 || maxRun > 2) throw new Error(`v04-${devName}: repeated frame hashes — motion clip rejected (unique=${unique}, maxRun=${maxRun})`);
    v04[devName] = {
      frames: FRAMES, fps: 2, durationMs: Date.now() - start,
      measurement: "in-page 2D canvas backing-store FNV (getImageData) — the verified T07 paint-surface method; Playwright screenshot sha256 retained per-frame as supplementary evidence (DEFECT #2 fix: screenshots vary under compositor readback even when the backing store is frozen).",
      uniqueHashes: unique, maxConsecutiveIdenticalOutsideHidden: maxRun,
      screenshotUniqueHashes: new Set(screenshotHashes).size,
      hiddenWindow: { from: HIDDEN_FROM, to: HIDDEN_TO, frozen: hiddenFrozen, tickDelta: hiddenTickDelta, resumedDiffers },
      tickStart, tickEnd, tickDelta, readyCount,
      keyframes: frames.filter((f) => f.png).map((f) => ({ i: f.i, tMs: f.tMs, png: f.png, sha256: f.sha256, inPageHash: f.inPageHash })),
      pageErrors,
    };
    const v04Section = sectionVerdict(`v04-${devName}:`);
    writeReport(`151-v04-frames-${devName}.json`, {
      issue: 151, pass: v04Section.pass, headSha: SHA, generated: GENERATED, device: devName, limitation: LIMITATION,
      checks: v04Section.checks, checkSummary: { passed: v04Section.passed, total: v04Section.total },
      note: "Per-frame in-page 2D backing-store FNV hash (getImageData, the verified T07 method) at 2 fps for 60 s; Playwright canvas screenshot sha256 also recorded per-frame. Frames 60-67 are the emulated hidden-tab window (paint must freeze, sim must keep ticking). DEFECT #2 fix: freeze/motion checks use the backing-store hash because a live probe proved the production hidden guard freezes it (30/30 identical while document.hidden=true) even though screenshot bytes vary (compositor readback artifact). Every 6th frame is persisted as PNG; all 120 hashes are listed.",
      frames,
    });
    await context.close();
  }
  // Starved vs working machine crops (desktop): the 2D overlay paints an
  // animated working core (scene.ts S5/F5) and static starved marks. A starved
  // machine's tile must NOT fake motion; a working one should change.
  {
    const context = await newSeededContext(browser, DEVICES.desktop, mature.sim);
    const { page } = await openApp(context);
    await page.waitForTimeout(2000);
    const save = await readSave(page);
    const working = save.machineList.find((m) => m.status === "running" || m.status === "working") ?? save.machineList[0];
    // CALIBRATION (pass 3, area 3): prefer an UNROUTED starved machine. The old
    // pick (id 2, the furnace) carries routes 2/3, so drone/belt traffic crosses
    // its tile; ids 3-20 are starved with no routes (inRoutes [], outRoute null)
    // and paint a static quiet core (scene.ts: only `running` machines animate).
    const starved = save.machineList.find((m) => (m.status === "starved" || m.status === "idle") && !m.routed)
      ?? save.machineList.find((m) => m.status === "starved" || m.status === "idle");
    const sample = async (m, label) => {
      const hashes = [];
      let firstClip = null;
      for (let i = 0; i < 20; i += 1) {
        const geom = await canvasGeom(page); // per-sample camera tracking
        if (geom.cam.length >= 3 && geom.cam.every((v) => Number.isFinite(v))) {
          const { rect, clip } = tileCrop(geom, m.tile);
          if (rect.w > 8 && rect.h > 8) {
            hashes.push(await cropPixelHash(page, rect));
            if (i === 0) {
              firstClip = clip;
              const buf = await page.screenshot({ clip });
              const p = resolve(shotDir, `151-v04-crop-${label}-desktop.png`); writeFileSync(p, buf); artifacts.push(p);
            }
          }
        }
        await page.waitForTimeout(480);
      }
      const counts = {};
      for (const h of hashes) counts[h] = (counts[h] ?? 0) + 1;
      const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { machine: m, clip: firstClip, measurement: "in-page 2D backing-store FNV (getImageData)", hashes, unique: Object.keys(counts).length, modeCount: mode ? mode[1] : 0, samples: hashes.length };
    };
    const starvedCrop = starved ? await sample(starved, "starved") : null;
    const workingCrop = working ? await sample(working, "working") : null;
    if (starvedCrop) {
      check("v04-starved-crop: no fake motion (>=14/20 identical, drone occlusion tolerance)", ">=14", starvedCrop.modeCount, starvedCrop.modeCount >= 14);
    }
    if (workingCrop && workingCrop.unique < 6) {
      finding("v04-working-crop low variation", `working machine ${working.id} crop unique=${workingCrop.unique}/20 — batch cadence may be slower than the 10 s window; full-frame motion checks remain authoritative`);
    }
    v04.desktopCrops = { starved: starvedCrop, working: workingCrop };
    await context.close();
  }
  report.v04 = v04;
}

/* ---- export/import round-trip from the running build ----------------------- */
async function captureRoundTrip(browser, report) {
  const mature = buildMature();
  // Seed precondition (verified live): the command-built MATURE fixture never
  // taps the wreck, so wreck.pulses stays 0 and syncTutorial cannot advance;
  // the Yard face is gated at tutorial >= 9 (App.tsx) and never renders as-is.
  // Seed tutorial=9 — the exact value syncTutorial reaches after the first
  // machine upgrade — solely to unlock the shipped save-transfer UI. Every
  // round-trip check below is unchanged.
  const context = await newSeededContext(browser, DEVICES.desktop, { ...mature.sim, tutorial: 9 });
  const { page, pageErrors } = await openApp(context);
  await page.waitForTimeout(1500);
  const openYardBackup = async () => {
    await clickDock(page, "Yard");
    await page.waitForSelector(".panel", { timeout: 10000 });
    await clickByText(page, "Backup");
    await page.waitForSelector("#rustwake-save-export", { timeout: 10000 });
    return page.evaluate(() => document.querySelector("#rustwake-save-export").value);
  };
  const closePanel = async () => {
    await page.evaluate(() => { for (const b of document.querySelectorAll(".panel__head button")) b.click(); });
    await page.waitForTimeout(250);
  };
  const A = await openYardBackup();
  const shotA = await shot(page, "roundtrip-export-desktop");
  await closePanel();
  await page.waitForTimeout(2200); // live ticks advance the ledger
  const B = await openYardBackup();
  await closePanel();
  const dA = decodeSave(A), dB = decodeSave(B);
  const abDelta = {
    byteIdentical: A === B,
    tickDelta: dB.payload.sim.tick - dA.payload.sim.tick,
    lastSeenDeltaMs: dB.payload.lastSeenMs - dA.payload.lastSeenMs,
    simIdentical: JSON.stringify(dA.payload.sim) === JSON.stringify(dB.payload.sim),
  };
  // Import A back: Replace -> Import -> paste -> Apply -> ack -> Replace yard.
  await clickDock(page, "Yard");
  await page.waitForSelector(".panel", { timeout: 10000 });
  await clickByText(page, "Import");
  await page.waitForSelector("#rustwake-save-import", { timeout: 10000 });
  await page.fill("#rustwake-save-import", A);
  await clickByText(page, "Apply");
  await page.waitForSelector(".import-confirm", { timeout: 10000 });
  const shotConfirm = await shot(page, "roundtrip-confirm-desktop");
  await page.evaluate(() => { const c = document.querySelector(".import-confirm__ack input"); if (c && !c.checked) c.click(); });
  // CALIBRATION (pass 3, area 4): importSave swaps the whole yard and persists
  // SYNCHRONOUSLY inside the Replace handler (src/app/store.ts importSave ->
  // persist()). Read the persisted envelope in the SAME evaluate as the click so
  // no rAF tick/flush can interleave: this is the FROZEN imported snapshot, which
  // must equal export A exactly (tick included). The old check compared a C
  // exported ~0.7 s later against A and failed on 7 ticks of natural advance —
  // a methodology error, not an import defect (the note already proved tick 141).
  const importedRaw = await page.evaluate((k) => {
    document.querySelector(".import-confirm__replace")?.click();
    return localStorage.getItem(k);
  }, SAVE_KEY);
  const dI = decodeSave(importedRaw);
  await page.waitForTimeout(400);
  const note = await page.evaluate(() => document.querySelector(".panel .status-line")?.textContent?.trim() ?? null);
  await closePanel();
  const C = await openYardBackup();
  await closePanel();
  const dC = decodeSave(C);
  const simNoTick = (s) => JSON.stringify({ ...s, tick: 0 });
  const importedDelta = {
    ok: dI.ok,
    simIdentical: dI.ok && JSON.stringify(dI.payload.sim) === JSON.stringify(dA.payload.sim),
    tick: dI.ok ? dI.payload.sim.tick : null,
    settingsIdentical: dI.ok && JSON.stringify(dI.payload.settings) === JSON.stringify(dA.payload.settings),
    lastSeenDeltaMs: dI.ok ? dI.payload.lastSeenMs - dA.payload.lastSeenMs : null,
  };
  const acDelta = {
    byteIdentical: A === C,
    tickDelta: dC.payload.sim.tick - dA.payload.sim.tick,
    lastSeenDeltaMs: dC.payload.lastSeenMs - dA.payload.lastSeenMs,
    simIdenticalExceptTick: simNoTick(dA.payload.sim) === simNoTick(dC.payload.sim),
    settingsIdentical: JSON.stringify(dA.payload.settings) === JSON.stringify(dC.payload.settings),
  };
  check("roundtrip: import restores sim exactly (frozen snapshot, tick included)", true, importedDelta.simIdentical, importedDelta.simIdentical === true);
  check("roundtrip: settings preserved", true, importedDelta.settingsIdentical, importedDelta.settingsIdentical === true);
  check("roundtrip: import note names restored tick/machines", `Applied · tick ${dA.payload.sim.tick}, ${dA.payload.sim.machines.length} machines`, note, note === `Applied · tick ${dA.payload.sim.tick}, ${dA.payload.sim.machines.length} machines`);
  check("roundtrip: live export advances between reads (A!=B)", false, abDelta.byteIdentical, abDelta.byteIdentical === false);
  check("roundtrip: live sim resumes after import (C tick > imported tick)", ">0", acDelta.tickDelta, acDelta.tickDelta > 0);
  // Invalid import must change NOTHING (natural tick progression excepted).
  await clickDock(page, "Yard");
  await page.waitForSelector(".panel", { timeout: 10000 });
  await clickByText(page, "Import");
  await page.waitForSelector("#rustwake-save-import", { timeout: 10000 });
  const D1 = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  await page.fill("#rustwake-save-import", "rw-invalid{{{not-a-save");
  await clickByText(page, "Apply");
  await page.waitForTimeout(400);
  const invalid = await page.evaluate(() => ({
    confirmPresent: !!document.querySelector(".import-confirm"),
    note: document.querySelector(".panel .status-line")?.textContent?.trim() ?? null,
  }));
  const D2 = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  const shotInvalid = await shot(page, "roundtrip-invalid-desktop");
  await closePanel();
  const d1 = decodeSave(D1), d2 = decodeSave(D2);
  const economy = (s) => JSON.stringify({ machines: s.machines, routes: s.routes, store: s.store, credits: s.credits, drones: fleetUnits(s), storeUnits: s.storeUnits });
  const invalidDelta = {
    confirmPresent: invalid.confirmPresent, note: invalid.note,
    economyIdentical: economy(d1.payload.sim) === economy(d2.payload.sim),
    tickDelta: d2.payload.sim.tick - d1.payload.sim.tick,
  };
  check("roundtrip: invalid import refused (no confirm gate)", false, invalid.confirmPresent, invalid.confirmPresent === false);
  check("roundtrip: invalid import leaves economy byte-identical", true, invalidDelta.economyIdentical, invalidDelta.economyIdentical === true);
  check("roundtrip: invalid import tick drift <=2 (natural only)", "<=2", invalidDelta.tickDelta, invalidDelta.tickDelta >= 0 && invalidDelta.tickDelta <= 2);
  check("roundtrip: no page errors", 0, pageErrors.length, pageErrors.length === 0);
  report.roundTrip = {
    protocol: "Yard panel -> Backup export textarea (#rustwake-save-export) / Replace import (#rustwake-save-import) -> Apply -> ImportConfirm ack -> Replace yard; the shipped UI path, no store shortcuts. The restored snapshot is read from the shipped persistence slot in the same evaluate as the Replace click (importSave persists synchronously), so it is the frozen import, not the later live sim. Seed precondition: tutorial=9 (the engine's own unlock value; the as-is MATURE fixture never taps the wreck so its tutorial cannot reach the Yard gate).",
    exportA: { sha256: sha256(Buffer.from(A, "utf8")), chars: A.length, tick: dA.payload.sim.tick, shot: shotA },
    exportB: { sha256: sha256(Buffer.from(B, "utf8")), chars: B.length, tick: dB.payload.sim.tick },
    exportC: { sha256: sha256(Buffer.from(C, "utf8")), chars: C.length, tick: dC.payload.sim.tick },
    abDelta, importedDelta, acDelta, importNote: note, invalid: { ...invalidDelta, shot: shotInvalid },
    confirmShot: shotConfirm, pageErrors,
    envelopeA: A, envelopeImported: importedRaw, envelopeC: C,
  };
  const rtSection = sectionVerdict("roundtrip:");
  writeReport("151-roundtrip.json", {
    issue: 151, pass: rtSection.pass, headSha: SHA, generated: GENERATED, limitation: LIMITATION,
    checks: rtSection.checks, checkSummary: { passed: rtSection.passed, total: rtSection.total },
    ...report.roundTrip,
  });
  await context.close();
}

/* ---- WebGL context loss in the built app ----------------------------------- */
async function captureContextLoss(browser, report) {
  const mature = buildMature();
  const context = await newSeededContext(browser, DEVICES.desktop, mature.sim);
  const { page, pageErrors } = await openApp(context);
  await page.waitForTimeout(1500);
  const before = await readSave(page);
  // CALIBRATION (pass 3, area 5): target the ACTIVE world context, not __rwGL[0].
  // __rwGL[0] is the throwaway probe (three/index.ts probeWebGL); the world runs
  // on its own offscreen canvas (getWorld3D). The drawImage instrumentation
  // recorded the blit source canvas; lose/restore THAT context. The extension
  // handle is captured before loss (getExtension returns null on a lost context).
  const glInfo = await page.evaluate(() => {
    const active = window.__rwActiveGLCanvas || null;
    const index = window.__rwGL.findIndex((g) => g.canvas === active);
    const gl = index >= 0 ? window.__rwGL[index] : null;
    const ext = gl ? gl.getExtension("WEBGL_lose_context") : null;
    window.__rwLoseExt = ext || null;
    if (ext) ext.loseContext();
    return { count: window.__rwGL.length, activeIndex: index, hadExt: !!ext };
  });
  check("context-loss: WebGL context instrumented", ">=1", glInfo.count, glInfo.count >= 1);
  check("context-loss: active world GL identified + lost", true, glInfo.activeIndex >= 0 && glInfo.hadExt, glInfo.activeIndex >= 0 && glInfo.hadExt === true);
  await page.waitForTimeout(800);
  const lostStamp = await canvasStamp(page);
  const lostShot = await shot(page, "context-loss-banner-desktop");
  const during = await readSave(page);
  await page.evaluate(() => { if (window.__rwLoseExt) window.__rwLoseExt.restoreContext(); });
  await page.waitForTimeout(1500);
  const readyStamp = await canvasStamp(page);
  const restoredShot = await shot(page, "context-restored-desktop");
  const after = await readSave(page);
  // The renderer holds no save bytes (three/index.ts header), so a context loss
  // must not touch the economy. The live economy DOES advance naturally (drone
  // scrap deliveries + route feed), so the old live-bytes equality was invalid.
  // Measure the real invariant: structure (machines/routes/credits) identical,
  // and no resource SPEND beyond natural drone-corrected route feed. The mature
  // fixture has no export route, so credits never drift naturally.
  const structure = (s) => JSON.stringify({
    machines: s.machineList.map((m) => ({ id: m.id, blueprint: m.blueprint, tile: m.tile })),
    routes: s.routes, credits: s.credits,
  });
  const structureIdentical = structure(before) === structure(after);
  const scrapDelta = after.scrap - before.scrap;
  const steelDelta = after.steel - before.steel;
  const droneArrived = droneScrapArrived(before, after);
  const scrapCorrected = droneArrived === null ? null : scrapDelta - droneArrived;
  check("context-loss: dataset.world3d=lost", "lost", lostStamp?.world3d, lostStamp?.world3d === "lost");
  check("context-loss: dataset.world3d=ready after restore", "ready", readyStamp?.world3d, readyStamp?.world3d === "ready");
  check("context-loss: machines/routes/credits untouched", true, structureIdentical, structureIdentical === true);
  check("context-loss: no scrap spend (drone-corrected)", "[-8,+2] natural feed only", scrapCorrected, scrapCorrected !== null && scrapCorrected >= -8 && scrapCorrected <= 2);
  check("context-loss: no steel spend", "[0,+4] production only", steelDelta, steelDelta >= 0 && steelDelta <= 4);
  check("context-loss: no page errors", 0, pageErrors.length, pageErrors.length === 0);
  report.contextLoss = {
    glContexts: glInfo.count, activeGLIndex: glInfo.activeIndex, lostStamp, readyStamp,
    tickDelta: after.tick - before.tick,
    structureIdentical, scrapDelta, droneArrived, scrapCorrected, steelDelta,
    during: { tick: during.tick, scrap: during.scrap, steel: during.steel },
    lostShot, restoredShot, pageErrors,
    note: "Target is the ACTIVE world GL context (the blit source canvas), not the __rwGL[0] probe. Banner/fallback VISUALS are pending sponsor inspection; numeric proof is the dataset.world3d transition + untouched economy structure + no resource spend (drone deliveries corrected by conservation). The byte-strict frozen-save check lives in the P02 harness run (151-p02-loops.json).",
  };
  await context.close();
}

/* ---- main ------------------------------------------------------------------ */
async function main() {
  if (!existsSync(resolve(repoRoot, "dist/index.html"))) {
    console.error("dist/index.html missing — run `npm run build` first (this script never builds).");
    process.exit(1);
  }
  const report = {
    issue: 151, gate: "G1/P1", headSha: SHA, generated: GENERATED,
    mode: "running-build-captures", limitation: LIMITATION,
    build: "vite preview of THIS branch's dist (npm run build at head " + SHA + ")",
    fixtures: "pass-1 release fixtures (tests/fixtures/release.ts) seeded via the game's own encodeSave before first paint; seeded ONLY when the slot is empty and lastSeenMs re-stamped at DOCUMENT START so store.creditAbsence cannot add offline catch-up ticks (V01 'Begin recovery' + V05 reload persistence stay honest)",
    devices: DEVICES,
  };
  const preview = await startPreview(PORT);
  const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
  report.browser = { executablePath, probeRenderer, swiftshaderForced };
  console.log(`capture-g1-151: head=${SHA} browser=${executablePath} preview=:${PORT}`);
  try {
    await captureScenes(browser, report);
    await captureV05(browser, report);
    await captureV04(browser, report);
    await captureRoundTrip(browser, report);
    await captureContextLoss(browser, report);
  } finally {
    await browser.close();
    stopServer(preview);
  }
  report.artifacts = artifacts;
  // DEFECT #1 fix: finish() computes the REAL checks/findings/boolean pass and
  // mutates report; persist AFTER it so the on-disk JSON carries the true verdict
  // (never the old hardcoded "3/4" placeholder written before the verdict existed).
  const code = finish(report);
  writeReport("151-g1-captures.json", report);
  process.exit(code);
}

main().catch((e) => {
  console.error("capture-g1-151 CRASH:", e);
  process.exit(1);
});