// @ts-nocheck
/**
 * Issue #151 (G1/P1 gate) pass-3 performance evidence: P01 normal/stress benches,
 * P02 three warmed identical 10-minute MATURE loops, P03 cold-load + quality
 * fallback vs the prospective #67 budgets.
 *
 * NON-VISION DISCLAIMER: every number here is a numeric browser/engine readout
 * (Performance API, rAF deltas, renderer.info, performance.memory, pixel diffs).
 * No visual-fidelity claim is made; capable visual inspection is PENDING the
 * sponsor at the live URL (G1 #151). HEADLESS CHROME EMULATION on a desktop
 * host, NOT a physical phone (#190 blocker): viewport/dpr/isMobile/hasTouch are
 * emulated; CPU/GPU/thermal/real-touch/mobile-network are NOT.
 *
 * Real engine only: P01/P02 drive the coordinator-verified rw3d-t07 harness
 * (tests/renderer/rw3d-t07) which runs the REAL renderer modules at fixed dt;
 * the legacy deep-yard fixture import is swapped for the pass-1 release
 * fixtures (tests/fixtures/release.ts) via Playwright route interception, so
 * the harness decodes MATURE/STRESS through the game's own decodeSave+migrate.
 * P03 drives the REAL built app (vite preview of this branch's dist).
 *
 * Usage (tsx resolves the .ts fixture imports):
 *   npx tsx tests/perf/perf-151.evidence.mjs --mode p02   # ~32 min wall clock
 *   npx tsx tests/perf/perf-151.evidence.mjs --mode p01   # harness benches
 *   npx tsx tests/perf/perf-151.evidence.mjs --mode p03   # built-app probe (needs dist)
 *
 * Exit codes: 0 iff every HARD numeric check passes; 1 on any hard failure or
 * crash. Budget verdicts (P03) are reported met/unmet/UNKNOWN and never
 * silently passed; an unmet prospective budget is a recorded FINDING, not a
 * script crash (brief: "if a budget fails, record it honestly as a finding").
 *
 * Writes only docs/evidence/151-*.{json,png}. Never touches src/.
 */
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  startDevServer, stopDevServer, launchBrowser, findBrowser, headSha,
  percentile, evidenceDir, HARNESS_URL, repoRoot,
} from "../renderer/rw3d-t07/lib.mjs";
import {
  buildMature, buildMatureResearch, buildStress, fixtureSaveText, FIXTURE_WITNESS_MS,
  MATURE_BUILDINGS, MATURE_UNITS, MATURE_CARGO, STRESS_BUILDINGS,
} from "../fixtures/release.ts";
import { SAVE_KEY, DEFAULT_SETTINGS, decodeSave } from "../../src/game/persistence/save.ts";
import { tileToWorld, worldToScreen } from "../../src/game/renderer/scene.ts";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const MODE = arg("mode", "p02");
const SHA = headSha();
const GENERATED = new Date().toISOString();
const LIMITATION =
  "HEADLESS CHROME EMULATION on a desktop host, NOT a physical phone (#190). " +
  "Numeric checks only; visual fidelity PENDING sponsor inspection at the live URL (G1 #151). " +
  "Frame-time/memory are host-relative; a concurrent P02 background loop may add host contention.";

/* ---- release fixtures (pass 1) ------------------------------------------- */
const mature = buildMature();
// #231: P03 MATURE panel contexts seed the Research variant (canonical MATURE
// + bounded data fill + real research.buy cutters) so the Research dock face
// renders. P01/P02 and the STRESS/FALLBACK contexts keep canonical MATURE.
const matureResearch = buildMatureResearch();
const stress = buildStress();
const matureEnvelope = JSON.parse(fixtureSaveText(mature.sim, FIXTURE_WITNESS_MS));
const matureResearchEnvelope = JSON.parse(fixtureSaveText(matureResearch.sim, FIXTURE_WITNESS_MS));
const stressEnvelope = JSON.parse(fixtureSaveText(stress.sim, FIXTURE_WITNESS_MS));
for (const [name, env] of [["MATURE", matureEnvelope], ["MATURE-RESEARCH", matureResearchEnvelope], ["STRESS", stressEnvelope]]) {
  const d = decodeSave(JSON.stringify(env));
  if (!d.ok) { console.error(`fixture ${name} rejected by decodeSave: ${d.reason}`); process.exit(1); }
}
const appSeed = (sim) => fixtureSaveText(sim, Date.now(), { ...DEFAULT_SETTINGS, muted: true });

/* #231 live-shell navigation selectors. The 2D-era Menu face/sheet
 * (button[aria-label="Menu"] / .shell-menu) was retired by the #135 compact
 * shell: navigation is now the persistent six-slot toolbar, and a destination
 * tap roots the ONE panel host (.shell-host, inspector on desktop / sheet on
 * phone). Trade is ungated on every fixture (App.tsx onSlot), so it is the
 * stable menu-open instrument target; Escape pops the single rooted layer, so
 * each sample starts closed. Same measurement semantics as before: click ->
 * rAF-poll the navigation surface painted. */
const MENU_OPEN_SEL = '.toolbar__btn[data-slot="trade"]';
const MENU_APPEAR_SEL = ".shell-host";

/* ---- shared helpers ------------------------------------------------------- */
const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }
const round = (n, p = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** p) / 10 ** p);

/** Reuse an already-running T07 dev server (e.g. the background P02 run) if present. */
async function ensureDevServer() {
  try {
    const res = await fetch(HARNESS_URL, { signal: AbortSignal.timeout(1500) });
    if (res.ok && (await res.text()).includes("RW3D T07 camera/selection harness")) return null;
  } catch { /* not up */ }
  return startDevServer();
}

/** Swap the harness's legacy deep-yard import for a release fixture envelope.
 *  Vite serves the JSON import as an ES module; we fulfill the same URL with
 *  `export default <envelope>` so harness.mjs decodes it unchanged. */
async function installFixture(context, envelope) {
  await context.route("**/deep-yard.modern.json*", (route) =>
    route.fulfill({ contentType: "application/javascript", body: `export default ${JSON.stringify(envelope)};` }));
}

async function openHarness(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");
  return { page, pageErrors };
}

/** renderer.info equivalent straight from the REAL three.js renderer singleton. */
async function rendererInfo(page) {
  return page.evaluate(async () => {
    const mod = await import("/src/game/renderer/three/index.ts");
    const w = mod.getWorld3D();
    if (!w) return null;
    const i = w.renderer.info;
    return {
      stats: w.stats(),
      memory: { geometries: i.memory.geometries, textures: i.memory.textures },
      programs: i.programs ? i.programs.length : null,
      render: { calls: i.render.calls, triangles: i.render.triangles, frame: i.render.frame },
    };
  });
}

async function readHeap(page) {
  return page.evaluate(() => {
    const m = performance.memory;
    if (!m) return null;
    const r2 = (n) => Math.round(n * 100) / 100;
    return { usedJSHeapMB: r2(m.usedJSHeapSize / 1048576), totalJSHeapMB: r2(m.totalJSHeapSize / 1048576), jsHeapLimitMB: r2(m.jsHeapSizeLimit / 1048576) };
  });
}

/** launchBrowser (lib.mjs) plus --expose-gc so P02 heap start/end are GC-stable. */
async function launchGcBrowser() {
  const executablePath = findBrowser();
  const gcArgs = ["--js-flags=--expose-gc"];
  const probe = async (browser) => {
    const p = await browser.newPage();
    try {
      return await p.evaluate(() => {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return null;
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";
      });
    } finally { await p.close(); }
  };
  let browser = await chromium.launch({ executablePath, headless: true, args: gcArgs });
  let gl = await probe(browser);
  let swiftshaderForced = false;
  if (!gl) {
    await browser.close();
    browser = await chromium.launch({ executablePath, headless: true, args: [...gcArgs, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    gl = await probe(browser);
    swiftshaderForced = true;
    if (!gl) { await browser.close(); throw new Error("WebGL unavailable even with SwiftShader"); }
  }
  return { browser, executablePath, probeRenderer: gl, swiftshaderForced };
}

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
  throw new Error(`vite preview did not start on ${port} within 30s`);
}
const stopServer = (child) => { if (child && child.exitCode === null) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" }); };

function writeReport(name, report) {
  const out = resolve(evidenceDir, name);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`written: ${out}`);
  return out;
}
function finish(report) {
  report.checks = checks;
  const failed = checks.filter((c) => !c.pass);
  report.pass = failed.length === 0;
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  console.log(`${report.mode}: ${report.pass ? "PASS" : "FAIL"} (${checks.length - failed.length}/${checks.length} hard checks)`);
  return report.pass ? 0 : 1;
}

/* ===========================================================================
 * P02 — three warmed identical 10-minute MATURE loops (wall clock, 10 Hz sim)
 * ========================================================================= */

/** One wall-clock loop inside the harness page: rAF-driven render, sim advanced
 *  at 10 Hz from elapsed wall time (the shipped TICK_MS), phase cycled for drone
 *  motion. Samples renderMs per frame + heap/renderer.info every ~30 s. */
async function runWallLoop(page, durationMs) {
  return page.evaluate(async (duration) => {
    const api = window.__RW3D__;
    const mod = await import("/src/game/renderer/three/index.ts");
    const world = mod.getWorld3D();
    const mem = () => performance.memory
      ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize }
      : null;
    const info = () => {
      const i = world.renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0 };
    };
    const gc = () => { if (typeof window.gc === "function") window.gc(); };
    gc();
    const heapStart = mem(); const infoStart = info(); const stateStart = api.state();
    const renderTimes = []; const snapshots = [];
    const t0 = performance.now();
    let last = t0; let acc = 0; let frames = 0; let ticks = 0;
    while (performance.now() - t0 < duration) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      acc += now - last; last = now;
      const due = Math.floor(acc / 100); acc -= due * 100;
      if (due > 0) { const n = Math.min(due, 20); api.advanceTicks(n); ticks += n; }
      api.setPhase((frames % 60) / 60);
      const r0 = performance.now();
      api.render();
      renderTimes.push(performance.now() - r0);
      frames += 1;
      if (frames % 1800 === 0) snapshots.push({ tSec: Math.round((now - t0) / 1000), heap: mem(), info: info(), tick: api.state().tick });
    }
    gc();
    const heapEnd = mem(); const infoEnd = info();
    const sorted = [...renderTimes].sort((a, b) => a - b);
    const pct = (q) => (sorted.length ? +sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))].toFixed(3) : null);
    return {
      durationMs: Math.round(performance.now() - t0), frames, simTicks: ticks,
      stateStart, stateEnd: api.state(),
      renderMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted.length ? +sorted[sorted.length - 1].toFixed(3) : null, count: sorted.length },
      heapStart, heapEnd,
      heapGrowthPct: heapStart && heapEnd ? +(((heapEnd.usedJSHeapSize - heapStart.usedJSHeapSize) / heapStart.usedJSHeapSize) * 100).toFixed(2) : null,
      infoStart, infoEnd, snapshots,
    };
  }, durationMs);
}

async function runP02() {
  const server = await ensureDevServer();
  const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchGcBrowser();
  const report = {
    mode: "P02", issue: 151, sha: SHA, generatedOn: GENERATED,
    command: "npx tsx tests/perf/perf-151.evidence.mjs --mode p02",
    limitation: LIMITATION,
    protocol: "rw3d-t07 harness (REAL renderer modules), MATURE release fixture via route-swapped decodeSave+migrate; 60 s warmup then three identical 600 s wall-clock loops (reset to the same fixture decode between loops); sim at 10 Hz wall clock, render every rAF; heap measured after forced GC (--expose-gc) at loop start/end; renderer.info from the live three.js singleton.",
    declaredDevice: "headless desktop Chrome emulation, 1440x900 @1x (no physical phone, #190)",
    browser: { executablePath, probeRenderer, swiftshaderForced, gcExposed: true },
    fixture: { name: "MATURE (tests/fixtures/release.ts buildMature)", buildings: MATURE_BUILDINGS, units: MATURE_UNITS, cargo: MATURE_CARGO, note: "harness info() still labels the legacy import name; the route swap installs MATURE — verified by machine count below" },
    warmup: null, loops: [], hiddenTab: null, simCatchUp: null, contextLoss: null,
  };
  let exitCode = 1;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await installFixture(context, matureEnvelope);
    const { page, pageErrors } = await openHarness(context);
    const info = await page.evaluate(() => ({ ...window.__RW3D__.info(), gl: window.__RW3D__.glInfo(), status: window.__RW3D__.status(), userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency }));
    report.device = info;
    check("MATURE fixture installed (20 machines)", MATURE_BUILDINGS, info.machines, info.machines === MATURE_BUILDINGS);
    check("3D world ready (not 2D fallback)", "ready", info.status, info.status === "ready");

    console.log("P02 warmup: 60 s wall-clock loop (discarded)...");
    report.warmup = await runWallLoop(page, 60000);
    console.log(`warmup done: frames=${report.warmup.frames} ticks=${report.warmup.simTicks}`);

    for (let i = 1; i <= 3; i += 1) {
      await page.evaluate(() => window.__RW3D__.reset());
      console.log(`P02 loop ${i}/3: 600 s wall-clock MATURE loop...`);
      const loop = await runWallLoop(page, 600000);
      report.loops.push(loop);
      console.log(`loop ${i}: frames=${loop.frames} ticks=${loop.simTicks} renderP95=${loop.renderMs.p95}ms heapGrowth=${loop.heapGrowthPct}% calls ${loop.infoStart.calls}->${loop.infoEnd.calls} geom ${loop.infoStart.geometries}->${loop.infoEnd.geometries} tex ${loop.infoStart.textures}->${loop.infoEnd.textures} prog ${loop.infoStart.programs}->${loop.infoEnd.programs}`);
      check(`loop ${i}: completed ~600 s`, ">=595000", loop.durationMs, loop.durationMs >= 595000);
      check(`loop ${i}: rendered frames (>20000)`, ">20000", loop.frames, loop.frames > 20000);
      check(`loop ${i}: sim ticks ~6000 (10 Hz, ±5%)`, "5700..6100", loop.simTicks, loop.simTicks >= 5700 && loop.simTicks <= 6100);
      check(`loop ${i}: identical fixture start (20 machines)`, MATURE_BUILDINGS, loop.stateStart.machines, loop.stateStart.machines === MATURE_BUILDINGS);
      check(`loop ${i}: heap growth <= 10%`, "<=10", loop.heapGrowthPct, loop.heapGrowthPct != null && loop.heapGrowthPct <= 10);
      check(`loop ${i}: world textures stay 0 (no text in world textures)`, 0, loop.infoEnd.textures, loop.infoEnd.textures === 0);
      check(`loop ${i}: geometries bounded (delta <= 2)`, "<=2", loop.infoEnd.geometries - loop.infoStart.geometries, loop.infoEnd.geometries - loop.infoStart.geometries <= 2);
      check(`loop ${i}: programs bounded (delta <= 2)`, "<=2", loop.infoEnd.programs - loop.infoStart.programs, loop.infoEnd.programs - loop.infoStart.programs <= 2);
      check(`loop ${i}: draw calls bounded (<= 500)`, "<=500", loop.infoEnd.calls, loop.infoEnd.calls <= 500);
    }

    // Hidden-tab: paint must freeze while hidden even though sim+phase advance,
    // then resume on restore. Stronger than the house hiddenPause() (which
    // re-renders the same phase): we advance 30 ticks + change phase while hidden.
    report.hiddenTab = await page.evaluate(() => {
      const api = window.__RW3D__;
      api.reset(); api.setPhase(0); api.render();
      api.snapshot();
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      api.advanceTicks(30); api.setPhase(0.5); api.render();
      const whileHidden = api.diffSnapshot();
      delete document.hidden;
      api.render();
      const afterRestore = api.diffSnapshot();
      const house = api.hiddenPause();
      return { whileHidden, afterRestore, house };
    });
    check("hidden-tab paint diff = 0 (sim+phase advanced while hidden)", 0, report.hiddenTab.whileHidden, report.hiddenTab.whileHidden === 0);
    check("paint resumes after restore (diff > 0)", ">0", report.hiddenTab.afterRestore, report.hiddenTab.afterRestore > 0);
    check("house hiddenPause() whileHidden = 0", 0, report.hiddenTab.house.whileHidden, report.hiddenTab.house.whileHidden === 0);

    // Sim catch-up correctness: 600 continuous ticks == 300 + hidden gap + 300.
    report.simCatchUp = await page.evaluate(() => {
      const api = window.__RW3D__;
      api.reset(); api.advanceTicks(600); api.setPhase(0.25); api.render();
      const a = { state: api.state(), hash: api.pixelHash() };
      api.reset(); api.advanceTicks(300);
      api.hiddenPause();
      api.advanceTicks(300); api.setPhase(0.25); api.render();
      const b = { state: api.state(), hash: api.pixelHash() };
      return { continuous: a, splitWithHiddenGap: b };
    });
    check("sim catch-up: state identical across hidden gap", JSON.stringify(report.simCatchUp.continuous.state), JSON.stringify(report.simCatchUp.splitWithHiddenGap.state), JSON.stringify(report.simCatchUp.continuous.state) === JSON.stringify(report.simCatchUp.splitWithHiddenGap.state));
    check("sim catch-up: pixel hash identical across hidden gap", report.simCatchUp.continuous.hash, report.simCatchUp.splitWithHiddenGap.hash, report.simCatchUp.continuous.hash === report.simCatchUp.splitWithHiddenGap.hash);

    // Context loss: status -> lost, save bytes unchanged, restore -> ready.
    const saveBefore = await page.evaluate(() => window.__RW3D__.saveText());
    const lostStatus = await page.evaluate(() => window.__RW3D__.loseContext());
    const saveAfter = await page.evaluate(() => window.__RW3D__.saveText());
    const restoredStatus = await page.evaluate(() => window.__RW3D__.restoreContext());
    report.contextLoss = {
      lostStatus, restoredStatus,
      saveBytesBefore: saveBefore.length, saveBytesAfter: saveAfter.length,
      saveSha256Before: createHash("sha256").update(saveBefore).digest("hex"),
      saveSha256After: createHash("sha256").update(saveAfter).digest("hex"),
      saveUnchanged: saveBefore === saveAfter,
    };
    check("context loss reported", "lost", lostStatus, lostStatus === "lost");
    check("save bytes unchanged through context loss", true, report.contextLoss.saveUnchanged, report.contextLoss.saveUnchanged);
    check("context restored to ready", "ready", restoredStatus, restoredStatus === "ready");
    check("no page errors", 0, pageErrors.length, pageErrors.length === 0);
    report.pageErrors = pageErrors;
    await context.close();
    exitCode = finish(report);
  } catch (err) {
    console.error("P02 failed:", err);
    report.error = String(err && err.stack || err);
    exitCode = 1;
  } finally {
    writeReport("151-p02-loops.json", report);
    await browser.close();
    stopServer(server);
  }
  process.exit(exitCode);
}

/* ===========================================================================
 * P01 — MATURE (normal) + STRESS harness benches, double-run determinism
 * ========================================================================= */

async function benchFixture(browser, name, envelope, clickIds) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await installFixture(context, envelope);
  const { page, pageErrors } = await openHarness(context);
  const FRAMES = 1200;
  const info = await page.evaluate(() => ({
    ...window.__RW3D__.info(), gl: window.__RW3D__.glInfo(), status: window.__RW3D__.status(),
    userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
  }));
  const heapBefore = await readHeap(page);
  const infoBefore = await rendererInfo(page);
  const run1 = await page.evaluate((n) => window.__RW3D__.runTimeline(n), FRAMES);
  await page.evaluate(() => window.__RW3D__.reset());
  const run2 = await page.evaluate((n) => window.__RW3D__.runTimeline(n), FRAMES);

  const ids = clickIds || (await page.evaluate(() => window.__RW3D__.machineIds()));
  const clickResults = [];
  for (let k = 0; k < 10; k += 1) {
    if (k % 2 === 0) {
      const id = ids[(k / 2) % ids.length];
      const p = await page.evaluate((mid) => window.__RW3D__.projectMachine(mid), id);
      if (!p || p.x < 0 || p.y < 0 || p.x > 1440 || p.y > 900) { clickResults.push({ target: id, selected: null, hit: false, offscreen: true }); continue; }
      await page.mouse.click(p.x, p.y);
      const sel = await page.evaluate(() => window.__RW3D__.selected());
      clickResults.push({ target: id, selected: sel, hit: sel === id });
    } else {
      await page.mouse.click(8, 8);
      const sel = await page.evaluate(() => window.__RW3D__.selected());
      clickResults.push({ target: "empty", selected: sel, hit: sel === null });
    }
    await page.evaluate(() => window.__RW3D__.advanceTicks(2));
  }
  const latencies = await page.evaluate(() => window.__RW3D__.selectionLatencies.slice());
  const infoAfter = await rendererInfo(page);
  const heapAfter = await readHeap(page);
  const renderMs = run1.samples.map((s) => s.renderMs);
  const machineHits = clickResults.filter((c) => c.target !== "empty" && c.hit).length;
  const emptyHits = clickResults.filter((c) => c.target === "empty" && c.hit).length;

  check(`${name}: fixture machine count`, name === "MATURE" ? MATURE_BUILDINGS : STRESS_BUILDINGS, info.machines, info.machines === (name === "MATURE" ? MATURE_BUILDINGS : STRESS_BUILDINGS));
  check(`${name}: 3D world ready`, "ready", info.status, info.status === "ready");
  check(`${name}: frames run 1`, FRAMES, run1.samples.length, run1.samples.length === FRAMES);
  check(`${name}: frames run 2`, FRAMES, run2.samples.length, run2.samples.length === FRAMES);
  check(`${name}: determinism state`, JSON.stringify(run1.state), JSON.stringify(run2.state), JSON.stringify(run1.state) === JSON.stringify(run2.state));
  check(`${name}: determinism pixel hash`, run1.hash, run2.hash, run1.hash === run2.hash);
  check(`${name}: p95 render <= 250 ms (software-rasterizer tolerance, house bench)`, "<=250", percentile(renderMs, 0.95), percentile(renderMs, 0.95) <= 250);
  check(`${name}: machine clicks select (5/5)`, 5, machineHits, machineHits === 5);
  check(`${name}: empty clicks clear (5/5)`, 5, emptyHits, emptyHits === 5);
  check(`${name}: input p95 <= 250 ms (software tolerance)`, "<=250", percentile(latencies, 0.95), latencies.length >= 10 && percentile(latencies, 0.95) <= 250);
  check(`${name}: no page errors`, 0, pageErrors.length, pageErrors.length === 0);

  const result = {
    fixture: name, info, heapBefore, heapAfter,
    frameTime: { renderMs: { p50: percentile(renderMs, 0.5), p95: percentile(renderMs, 0.95), p99: percentile(renderMs, 0.99), max: round(Math.max(...renderMs)) } },
    inputLatencyMs: { samples: latencies.length, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? round(Math.max(...latencies)) : null },
    clicks: clickResults,
    determinism: { run1: { state: run1.state, hash: run1.hash }, run2: { state: run2.state, hash: run2.hash } },
    rendererInfo: { before: infoBefore, after: infoAfter },
    qualityTier: "blockout-flat: no shadows, DPR cap 2, hemisphere 1.6 + directional 1.0, instanced batches (no quality auto-tuner exists yet)",
    pageErrors,
  };
  await context.close();
  return result;
}

async function runP01() {
  const server = await ensureDevServer();
  const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
  const report = {
    mode: "P01", issue: 151, sha: SHA, generatedOn: GENERATED,
    command: "npx tsx tests/perf/perf-151.evidence.mjs --mode p01",
    limitation: LIMITATION,
    protocol: "rw3d-t07 harness pattern (bench.mjs): REAL renderer modules at fixed dt=1 tick/frame, 1200-frame scripted timeline (quarter turns + anchored zoom pulses) run TWICE from a fresh fixture decode; real pointer clicks through the production gesture reducer + raycast; renderer.info read from the live three.js singleton. Release fixtures MATURE (normal) and STRESS installed via route swap.",
    battle: "DEFINED, measurement DEFERRED: see tests/perf/battle-protocol-151.md — defense structures D01-06 are G3 scope and unbuilt at this SHA.",
    browser: { executablePath, probeRenderer, swiftshaderForced },
    devices: [],
  };
  let exitCode = 1;
  try {
    // STRESS machines sit on tiles 0..99; only tiles inside the yard grid are
    // on-screen at the fitted camera, so aim clicks at those.
    const stressClickIds = stress.sim.machines.filter((m) => m.tile < 30).slice(0, 5).map((m) => m.id);
    report.devices.push(await benchFixture(browser, "MATURE", matureEnvelope, null));
    report.devices.push(await benchFixture(browser, "STRESS", stressEnvelope, stressClickIds));
    exitCode = finish(report);
  } catch (err) {
    console.error("P01 failed:", err);
    report.error = String(err && err.stack || err);
    exitCode = 1;
  } finally {
    writeReport("151-p01-bench.json", report);
    await browser.close();
    stopServer(server);
  }
  process.exit(exitCode);
}

/* ===========================================================================
 * P03 — built-app cold load + quality fallback vs budgets.json
 * (perf-67.evidence.mjs patterns, release fixtures instead of legacy yardFrame)
 * ========================================================================= */

const PERF_INIT = () => {
  window.__perf = { resources: [], longTasks: [], paint: [], lcp: [] };
  const safe = (type, cb, buffered) => {
    try {
      const obs = new PerformanceObserver((list) => cb(list.getEntries()));
      obs.observe({ type, buffered });
    } catch { /* unsupported observer type */ }
  };
  safe("resource", (entries) => {
    for (const e of entries) {
      window.__perf.resources.push({
        name: e.name, initiatorType: e.initiatorType,
        transferSize: e.transferSize, encodedBodySize: e.encodedBodySize,
        decodedBodySize: e.decodedBodySize, duration: e.duration,
        startTime: e.startTime, responseEnd: e.responseEnd,
      });
    }
  }, true);
  safe("longtask", (entries) => { for (const e of entries) window.__perf.longTasks.push({ startTime: e.startTime, duration: e.duration }); }, true);
  safe("paint", (entries) => { for (const e of entries) window.__perf.paint.push({ name: e.name, startTime: e.startTime }); }, true);
  safe("largest-contentful-paint", (entries) => { for (const e of entries) window.__perf.lcp.push({ startTime: e.startTime, size: e.size }); }, true);
};

/** Force the 2D quality fallback: every WebGL context request returns null. */
const NO_WEBGL_INIT = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
    return orig.call(this, type, ...rest);
  };
};

function frameStats(deltas) {
  if (!deltas || !deltas.length) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = deltas.reduce((a, b) => a + b, 0);
  const dropped = deltas.filter((d) => d > 50).length;
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  return {
    count: deltas.length, meanMs: round(sum / deltas.length),
    p50Ms: round(pct(50)), p95Ms: round(pct(95)), p99Ms: round(pct(99)), maxMs: round(sorted[sorted.length - 1]),
    droppedOver50ms: dropped, droppedPct: round((100 * dropped) / deltas.length), fpsMean: round(1000 / (sum / deltas.length), 1),
  };
}

async function enterYard(page) {
  const tryClick = async (selector, timeout) => {
    try {
      const el = await page.waitForSelector(selector, { timeout, state: "visible" });
      if (el) { await el.click(); return true; }
    } catch { /* absent on this fixture */ }
    return false;
  };
  if (await tryClick(".gate__btn", 4000)) {
    await page.waitForSelector(".gate", { state: "detached", timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  if (await tryClick("text=Back to yard", 3000)) await page.waitForTimeout(300);
  await page.waitForFunction(() => {
    const c = document.querySelector(".game canvas");
    return c && c.dataset.cam && c.width > 0 && !document.querySelector(".gate");
  }, { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function readColdLoad(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || null;
    const perf = window.__perf || { resources: [], paint: [], lcp: [], longTasks: [] };
    const fcp = perf.paint.find((p) => p.name === "first-contentful-paint") || null;
    const lcp = perf.lcp.length ? perf.lcp[perf.lcp.length - 1] : null;
    // #236: attribute entryJs to the module script index.html actually references.
    // The probe-gated dynamic import("./three") emits a SECOND index-*.js async chunk;
    // counting it as entry would misreport entryDecodedBytes in 3D MATURE. It lands in
    // otherJs and is fetched cold ONLY in WebGL contexts (FALLBACK-2D never fires the
    // import). Ground-truth attribution of the same real PerformanceResourceTiming
    // decoded bytes — no ceiling, floor or assertion changed. The BEFORE build has a
    // single index-*.js (the HTML entry), so this rule classifies it identically.
    const entryBase = (document.querySelector('script[type="module"][src]')?.getAttribute("src") || "").split("/").pop();
    const cat = (name, type) => {
      if (/\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(name)) return "image";
      if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(name)) return "audio";
      if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(name)) return "font";
      if (/\.css(\?|$)/i.test(name)) return "css";
      if (/worker/i.test(name) || type === "worker") return "worker";
      if (/vendor-.*\.js/.test(name)) return "vendorJs";
      if (/tables-.*\.js/.test(name)) return "tablesJs";
      if (/index-.*\.js/.test(name)) return name.split("/").pop() === entryBase ? "entryJs" : "otherJs";
      if (/\.js(\?|$)/i.test(name)) return "otherJs";
      if (type === "navigation" || type === "document") return "html";
      return "other";
    };
    const buckets = {};
    let totalTransfer = 0; let totalEncoded = 0; let totalDecoded = 0; let count = 0;
    const binaryMedia = [];
    for (const r of perf.resources) {
      const c = cat(r.name, r.initiatorType);
      const b = (buckets[c] ||= { count: 0, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0, names: [] });
      b.count += 1; b.transferSize += r.transferSize || 0;
      b.encodedBodySize += r.encodedBodySize || 0; b.decodedBodySize += r.decodedBodySize || 0;
      b.names.push(r.name.split("/").pop());
      totalTransfer += r.transferSize || 0; totalEncoded += r.encodedBodySize || 0;
      totalDecoded += r.decodedBodySize || 0; count += 1;
      if (c === "image" || c === "audio") binaryMedia.push(r.name.split("/").pop());
    }
    const docTransfer = nav ? nav.transferSize || 0 : 0;
    const docDecoded = nav ? nav.decodedBodySize || 0 : 0;
    const r2 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);
    return {
      navigation: nav ? {
        domInteractiveMs: r2(nav.domInteractive), domContentLoadedMs: r2(nav.domContentLoadedEventEnd),
        loadEventEndMs: r2(nav.loadEventEnd), responseEndMs: r2(nav.responseEnd), durationMs: r2(nav.duration),
        transferSize: nav.transferSize, decodedBodySize: nav.decodedBodySize, type: nav.type,
      } : null,
      fcpMs: fcp ? r2(fcp.startTime) : null,
      lcpMs: lcp ? r2(lcp.startTime) : null,
      longTasksDuringLoad: perf.longTasks.filter((t) => nav && t.startTime <= nav.loadEventEnd + 50).length,
      resources: {
        count, totalTransferSize: totalTransfer + docTransfer,
        totalEncodedBodySize: totalEncoded, totalDecodedBodySize: totalDecoded + docDecoded,
        document: { transferSize: docTransfer, decodedBodySize: docDecoded },
        buckets, binaryMediaCount: binaryMedia.length, binaryMedia,
      },
    };
  });
}

async function sampleFrames(page, ms) {
  const deltas = await page.evaluate((duration) => new Promise((resolve) => {
    const out = [];
    let last = performance.now();
    const end = last + duration;
    const loop = (now) => {
      out.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(loop);
      else resolve(out);
    };
    requestAnimationFrame(loop);
  }), ms);
  return frameStats(deltas);
}

async function measureClickOpen(page, { sel, appear }, times = 3) {
  const samples = [];
  for (let i = 0; i < times; i += 1) {
    const res = await page.evaluate(({ sel, appear }) => new Promise((resolve) => {
      const target = document.querySelector(sel);
      if (!target) { resolve({ ok: false, reason: "no-target" }); return; }
      // #231 strengthening: a surface already painted before the click would
      // resolve at ~0ms and fake a fast open. Refuse the sample instead.
      if (document.querySelector(appear)) { resolve({ ok: false, reason: "already-open" }); return; }
      const t0 = performance.now();
      target.click();
      const start = performance.now();
      const tick = () => {
        if (document.querySelector(appear)) { resolve({ ok: true, ms: performance.now() - t0 }); return; }
        if (performance.now() - start > 4000) { resolve({ ok: false, reason: "timeout" }); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { sel, appear });
    samples.push(res);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }
  const ok = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p) => (ok.length ? ok[Math.min(ok.length - 1, Math.max(0, Math.ceil((p / 100) * ok.length) - 1))] : null);
  return { samples: samples.map((s) => (s.ok ? round(s.ms) : s.reason)), medianMs: round(pct(50)), p95Ms: round(pct(95)), okCount: ok.length };
}

async function tileTapPoints(page, tiles) {
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector(".game canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const parts = (canvas.dataset.cam || "").split(",").map((v) => parseFloat(v));
    if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) return null;
    return { left: rect.left, top: rect.top, view: { width: canvas.clientWidth, height: canvas.clientHeight }, camera: { x: parts[0], y: parts[1], scale: parts[2] } };
  });
  if (!geometry) return [];
  return tiles.map((tile) => {
    const world = tileToWorld(tile);
    const p = worldToScreen(geometry.camera, geometry.view, world.x, world.y);
    return { tile, x: Math.round(p.x + geometry.left), y: Math.round(p.y + geometry.top) };
  });
}

async function closePanels(page) {
  await page.evaluate(() => { for (const b of document.querySelectorAll(".panel__head button")) b.click(); });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
}

async function measureMachineTap(page, tiles, times = 3) {
  const points = await tileTapPoints(page, tiles);
  const samples = [];
  for (let i = 0; i < times && points.length; i += 1) {
    let ms = null;
    for (const point of points) {
      const t0 = Date.now();
      await page.mouse.click(point.x, point.y);
      try {
        await page.waitForSelector(".panel", { timeout: 1500 });
        ms = round(Date.now() - t0);
        break;
      } catch { /* next machine centre */ }
    }
    samples.push(ms === null ? "timeout" : ms);
    await closePanels(page);
  }
  const ok = samples.filter((s) => typeof s === "number").sort((a, b) => a - b);
  const pct = (p) => (ok.length ? ok[Math.min(ok.length - 1, Math.max(0, Math.ceil((p / 100) * ok.length) - 1))] : null);
  return { samples, medianMs: round(pct(50)), p95Ms: round(pct(95)), okCount: ok.length };
}

async function openPanelRobust(page, name) {
  const clickFace = () => page.evaluate((want) => {
    const faces = [...document.querySelectorAll(".dock .dock__btn")];
    const texts = faces.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
    const index = texts.indexOf(want);
    if (index >= 0) faces[index].click();
    return { index, faces: texts };
  }, name);
  let clicked = await clickFace();
  await page.waitForTimeout(150);
  let panels = await page.evaluate(() => document.querySelectorAll(".panel").length);
  for (let i = 0; panels === 0 && i < 3; i += 1) {
    await page.evaluate(() => {
      const faces = [...document.querySelectorAll(".dock .dock__btn")];
      const accent = faces.find((b) => (getComputedStyle(b).backgroundImage || "").indexOf("linear-gradient") === 0) ?? faces[0];
      accent?.click();
    });
    await page.waitForTimeout(200);
    clicked = await clickFace();
    await page.waitForTimeout(150);
    panels = await page.evaluate(() => document.querySelectorAll(".panel").length);
  }
  return { panels, faces: clicked.faces };
}

async function shot(page, name) {
  const path = resolve(evidenceDir, name);
  await page.screenshot({ path });
  const bytes = readFileSync(path);
  return { file: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function buildInventory() {
  const dir = resolve(repoRoot, "dist/assets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().map((name) => {
    const bytes = readFileSync(resolve(dir, name));
    const role = /index-.*\.js$/.test(name) ? "entryJs" : /vendor-.*\.js$/.test(name) ? "vendorJs" : /tables-.*\.js$/.test(name) ? "tablesJs" : /worker.*\.js$/.test(name) ? "lazyWorkerJs" : /\.css$/.test(name) ? "css" : "other";
    return { name, role, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}

const DEVICES = [
  { name: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const CPU_THROTTLE_RATE = Number(process.env.PERF_CPU_THROTTLE || 6);

function evaluateBudgets(res, budgets) {
  const verdicts = [];
  const b = budgets.budgets || {};
  const check = (metric, scope, value, limit, unit) => {
    if (value == null || limit == null) { verdicts.push({ metric, scope, value, limit, unit, met: null, note: "not measured / no budget" }); return; }
    verdicts.push({ metric, scope, value, limit, unit, dir: "max", met: value <= limit });
  };
  for (const d of res.devices.filter((x) => x.fixture === "MATURE" && !x.fallback)) {
    const mobile = d.device !== "desktop";
    const scope = d.tag;
    if (b.coldLoad) {
      check("fcp", scope, d.coldLoad?.fcpMs, mobile ? b.coldLoad.mobileFcpMs : b.coldLoad.desktopFcpMs, "ms");
      check("loadEventEnd", scope, d.coldLoad?.navigation?.loadEventEndMs, mobile ? b.coldLoad.mobileLoadMs : b.coldLoad.desktopLoadMs, "ms");
    }
    if (b.transferred) {
      // #237 (§5.7 re-declaration, product verdict 6901199383): decoded ceilings
      // are CONTEXT-AWARE. 3D MATURE contexts evaluate transferred.mature3d;
      // FALLBACK-2D evaluates transferred.fallback2d (below). Same metrics and
      // checks — only the ceiling VALUES + mapping are re-declared, grounded in
      // the measured post-#236 baseline. A missing ceiling stays UNKNOWN, never MET.
      const t3 = b.transferred.mature3d || {};
      check("entryDecodedBytes", scope, d.coldLoad?.resources?.buckets?.entryJs?.decodedBodySize, t3.entryDecodedBytes, "B");
      check("totalColdDecodedBytes", scope, d.coldLoad?.resources?.totalDecodedBodySize, t3.totalColdDecodedBytes, "B");
      check("binaryMediaCount", scope, d.coldLoad?.resources?.binaryMediaCount, b.transferred.imageAudioBinaryCount, "count");
    }
    if (b.interaction) {
      check("menuOpenMedian", scope, d.interaction?.menuOpen?.medianMs, b.interaction.menuOpenP95Ms, "ms");
      check("machineTapMedian", scope, d.interaction?.machineTap?.medianMs, b.interaction.machineTapP95Ms, "ms");
      check("throttledMenuOpenMedian", scope, d.throttled?.menuOpen?.medianMs, b.interaction.throttledMenuOpenP95Ms, "ms");
      check("throttledMachineTapMedian", scope, d.throttled?.machineTap?.medianMs, b.interaction.throttledMachineTapP95Ms, "ms");
    }
    if (b.frame) {
      check("idleP95", scope, d.idleFrame?.p95Ms, b.frame.idleP95Ms, "ms");
      check("idleDroppedPct", scope, d.idleFrame?.droppedPct, b.frame.idleDroppedPct, "%");
      const worstPanelP95 = Math.max(...(d.panels || []).map((p) => p.frameWhileOpen?.p95Ms ?? 0));
      check("panelOpenP95", scope, worstPanelP95 || null, b.frame.panelOpenP95Ms, "ms");
      check("stressLongSessionP95", scope, d.stress?.longSessionFrame?.p95Ms, b.frame.stressP95Ms, "ms");
      check("throttledIdleP95", scope, d.throttled?.idleFrame?.p95Ms, b.frame.throttledIdleP95Ms, "ms");
      check("throttledIdleDroppedPct", scope, d.throttled?.idleFrame?.droppedPct, b.frame.throttledIdleDroppedPct, "%");
      check("throttledStoreP95", scope, d.throttled?.storeFrame?.p95Ms, b.frame.throttledStoreP95Ms, "ms");
    }
    if (b.memory) {
      check("idleUsedHeap", scope, d.memoryIdle?.usedJSHeapMB, b.memory.idleUsedHeapMB, "MB");
      check("sessionHeapGrowth", scope, d.stress?.heapGrowthMB, b.memory.sessionGrowthMB, "MB");
    }
  }
  for (const d of res.devices.filter((x) => x.fixture === "STRESS")) {
    if (b.frame) check("stressFixtureIdleP95", d.tag, d.idleFrame?.p95Ms, b.frame.stressP95Ms, "ms");
    if (b.memory) check("stressFixtureIdleHeap", d.tag, d.memoryIdle?.usedJSHeapMB, b.memory.idleUsedHeapMB, "MB");
  }
  for (const d of res.devices.filter((x) => x.fallback)) {
    const mobile = d.device !== "desktop";
    if (b.coldLoad) {
      check("fallbackFcp", d.tag, d.coldLoad?.fcpMs, mobile ? b.coldLoad.mobileFcpMs : b.coldLoad.desktopFcpMs, "ms");
      check("fallbackLoadEventEnd", d.tag, d.coldLoad?.navigation?.loadEventEndMs, mobile ? b.coldLoad.mobileLoadMs : b.coldLoad.desktopLoadMs, "ms");
    }
    if (b.transferred) {
      // #237: FALLBACK-2D cold ceiling is context-aware (transferred.fallback2d);
      // the three chunk is never fetched without WebGL (#236, measured).
      check("fallbackTotalColdDecodedBytes", d.tag, d.coldLoad?.resources?.totalDecodedBodySize, b.transferred.fallback2d?.totalColdDecodedBytes, "B");
    }
    if (b.frame) check("fallbackIdleP95", d.tag, d.idleFrame?.p95Ms, b.frame.idleP95Ms, "ms");
  }
  const met = verdicts.filter((v) => v.met === true).length;
  const unmet = verdicts.filter((v) => v.met === false).length;
  const unknown = verdicts.filter((v) => v.met === null).length;
  return { verdicts, summary: { met, unmet, unknown, total: verdicts.length, allMet: unmet === 0 && unknown === 0 } };
}

async function runP03() {
  if (!existsSync(resolve(repoRoot, "dist/index.html"))) { console.error("dist missing — run pnpm build first"); process.exit(1); }
  const preview = await startPreview(4167);
  const URL = "http://localhost:4167/";
  const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
  const budgets = JSON.parse(readFileSync(resolve(repoRoot, "tests/perf/budgets.json"), "utf8"));
  const report = {
    mode: "P03", issue: 151, sha: SHA, generatedOn: GENERATED, url: URL,
    command: "npx tsx tests/perf/perf-151.evidence.mjs --mode p03",
    limitation: LIMITATION,
    protocol: "perf-67.evidence.mjs patterns against vite preview of THIS branch's build; pass-1 release fixtures seeded through the game's own encodeSave before first paint (lastSeenMs=Date.now(), no offline catch-up); cold-load read on the gate pre-start; identical emulation conditions to the #67 budget grounding (phone 390x844@2, desktop 1920x1080@1, 6x CPU throttle). MATURE panel contexts seed tutorial=9 (the engine's own Yard-unlock value; the as-is fixture never taps the wreck so its tutorial stays 0 and the Yard face is gated off). #231: menu-open instrument re-targeted from the retired #135 Menu face/sheet (button[aria-label=\"Menu\"] / .shell-menu) to the live compact-shell navigation: toolbar trade tap -> .shell-host panel host painted (trade is ungated on every fixture; Escape pops the single rooted layer between samples; a surface already open before the click is refused as already-open, never counted as ~0ms). MATURE panel contexts seed the MATURE-RESEARCH variant (canonical MATURE + 12 data at the conserved addToStore boundary + real research.buy cutters) so showResearch renders the Research dock face; STRESS and FALLBACK contexts keep canonical fixtures. #236: cold bytes are the REAL per-context PerformanceResourceTiming decodedBodySize sums (as before); entryJs is now attributed to the index.html module script so the probe-gated async three chunk (a second index-*.js, bucket otherJs) is not miscounted as entry — it is fetched cold only in WebGL contexts, and FALLBACK-2D never fires the import. #236 changed no budget, floor or assertion. #237 (§5.7 re-declaration, product verdict 6901199383 on PR #239): decoded-byte ceilings are now CONTEXT-AWARE — MATURE/STRESS 3D contexts evaluate transferred.mature3d.entryDecodedBytes (360000 B) / transferred.mature3d.totalColdDecodedBytes (1220000 B); FALLBACK-2D evaluates transferred.fallback2d.totalColdDecodedBytes (620000 B); binaryMediaCount stays 0. Same metrics, same checks, re-declared ceiling values grounded in the MEASURED post-#236 baseline at this head (~1.1x, tighter than 1.2x); the 2D-era global 240000/520000 ceilings and the measurably dead 'HOLD FALLBACK + close via (A) alone' branch are openly retired (docs/PERF_BUDGETS.md, docs/evidence/237-budget-redeclaration.md). All experience budgets (coldLoad/interaction/frame/memory) UNCHANGED; no floor or assertion weakened; UNKNOWN never auto-MET.",
    browser: { executablePath, probeRenderer, swiftshaderForced },
    cpuThrottleRate: CPU_THROTTLE_RATE,
    budgets, devices: [], hardFailures: [],
  };
  const hardFailures = report.hardFailures;
  // Same 20 tiles as canonical MATURE (the variant only adds store data + one
  // research node); read from the variant so the P03 context is self-contained.
  const matureTiles = matureResearch.sim.machines.map((m) => m.tile);
  let exitCode = 1;
  try {
    // Warmup navigation so the first measured context does not pay browser cold-start.
    {
      const warm = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const wp = await warm.newPage();
      await wp.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
      await wp.waitForTimeout(200);
      await warm.close();
    }
    for (const dev of DEVICES) {
      const tag = `${dev.name}-MATURE`;
      const context = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.isMobile, hasTouch: dev.hasTouch });
      await context.addInitScript(PERF_INIT);
      // Seed precondition (verified live): the as-is MATURE fixture never taps
      // the wreck, so its tutorial cannot reach the Yard gate (tutorial >= 9,
      // App.tsx) and the Yard panel would never open. tutorial=9 is the exact
      // value syncTutorial reaches after the first machine upgrade; it unlocks
      // the shipped Yard face without altering any measurement below.
      // #231: seed the MATURE-RESEARCH variant (canonical MATURE + 12 data via
      // the conserved addToStore boundary + real research.buy cutters) so
      // showResearch (App.tsx: data > 0 OR owned node) renders the Research
      // dock face. Canonical MATURE has no data/research, which is why the
      // Research panel-open check hard-failed on the retired instrument.
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, appSeed({ ...matureResearch.sim, tutorial: 9 })]);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      await page.goto(URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(350);
      const coldLoad = await readColdLoad(page);
      await enterYard(page);
      const camOk = await page.evaluate(() => { const c = document.querySelector(".game canvas"); return !!(c && c.dataset.cam && c.width > 0); });
      if (!camOk) hardFailures.push(`${tag}: canvas never stamped a live camera`);
      const world3d = await page.evaluate(() => document.querySelector(".game canvas")?.dataset.world3d ?? null);
      const idleFrame = await sampleFrames(page, 3000);
      const memoryIdle = await readHeap(page);
      const menuOpen = await measureClickOpen(page, { sel: MENU_OPEN_SEL, appear: MENU_APPEAR_SEL }, 3);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      const machineTap = await measureMachineTap(page, matureTiles, 3);
      const panels = [];
      for (const name of ["Store", "Research", "Yard"]) {
        await closePanels(page);
        const opened = await openPanelRobust(page, name);
        const frameWhileOpen = opened.panels > 0 ? await sampleFrames(page, 1500) : null;
        const title = await page.evaluate(() => (document.querySelector(".panel__title")?.textContent || "").trim());
        panels.push({ name, present: opened.panels, title, frameWhileOpen });
        if (opened.panels === 0) hardFailures.push(`${tag}: panel ${name} did not open`);
        await closePanels(page);
      }
      const memBeforeStress = await readHeap(page);
      const longSessionFrame = await sampleFrames(page, 4000);
      const churnFramePromise = sampleFrames(page, 2500);
      for (let i = 0; i < 12; i += 1) {
        await page.evaluate((sel) => document.querySelector(sel)?.click(), MENU_OPEN_SEL);
        await page.waitForTimeout(70);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(70);
      }
      const churnFrame = await churnFramePromise;
      const memAfterStress = await readHeap(page);
      const heapGrowthMB = memBeforeStress && memAfterStress ? round(memAfterStress.usedJSHeapMB - memBeforeStress.usedJSHeapMB) : null;

      await closePanels(page);
      const cdpT = await context.newCDPSession(page);
      await cdpT.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
      await page.waitForTimeout(250);
      const throttledIdleFrame = await sampleFrames(page, 3000);
      const throttledMenuOpen = await measureClickOpen(page, { sel: MENU_OPEN_SEL, appear: MENU_APPEAR_SEL }, 3);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      const throttledMachineTap = await measureMachineTap(page, matureTiles, 3);
      await closePanels(page);
      const tStore = await openPanelRobust(page, "Store");
      const throttledStoreFrame = tStore.panels > 0 ? await sampleFrames(page, 1500) : null;
      await closePanels(page);
      await cdpT.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdpT.detach().catch(() => {});

      const screenshot = await shot(page, `151-p03-${tag}.png`);
      if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);
      report.devices.push({
        device: dev.name, fixture: "MATURE", seedFixture: "MATURE-RESEARCH (#231: +12 data fill, research.buy cutters, tutorial=9)", fallback: false, tag, viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor,
        world3d, coldLoad, idleFrame, memoryIdle, interaction: { menuOpen, machineTap },
        throttled: { rate: CPU_THROTTLE_RATE, idleFrame: throttledIdleFrame, menuOpen: throttledMenuOpen, machineTap: throttledMachineTap, storeFrame: throttledStoreFrame },
        panels, stress: { longSessionFrame, churnFrame, heapGrowthMB, memBeforeStress, memAfterStress },
        consoleErrors, screenshot,
      });
      console.log(`[${tag}] fcp=${coldLoad.fcpMs}ms load=${coldLoad.navigation?.loadEventEndMs}ms transfer=${coldLoad.resources.totalTransferSize}B idleP95=${idleFrame?.p95Ms}ms menu=${menuOpen.medianMs}ms tap=${machineTap.medianMs}ms heap=${memoryIdle?.usedJSHeapMB}MB growth=${heapGrowthMB}MB thrIdleP95=${throttledIdleFrame?.p95Ms}ms world3d=${world3d} errors=${consoleErrors.length}`);
      await context.close();
    }

    // STRESS fixture on desktop: population stress frame cost in the built app.
    {
      const dev = DEVICES[1];
      const tag = "desktop-STRESS";
      const context = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor });
      await context.addInitScript(PERF_INIT);
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, appSeed(stress.sim)]);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      await page.goto(URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(350);
      const coldLoad = await readColdLoad(page);
      await enterYard(page);
      const idleFrame = await sampleFrames(page, 4000);
      const memoryIdle = await readHeap(page);
      const screenshot = await shot(page, `151-p03-${tag}.png`);
      if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);
      report.devices.push({ device: dev.name, fixture: "STRESS", fallback: false, tag, coldLoad, idleFrame, memoryIdle, consoleErrors, screenshot });
      console.log(`[${tag}] fcp=${coldLoad.fcpMs}ms idleP95=${idleFrame?.p95Ms}ms heap=${memoryIdle?.usedJSHeapMB}MB errors=${consoleErrors.length}`);
      await context.close();
    }

    // QUALITY FALLBACK: WebGL unavailable -> 2D paint, cold load vs same budgets.
    for (const dev of DEVICES) {
      const tag = `${dev.name}-FALLBACK-2D`;
      const context = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.isMobile, hasTouch: dev.hasTouch });
      await context.addInitScript(PERF_INIT);
      await context.addInitScript(NO_WEBGL_INIT);
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, appSeed(mature.sim)]);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      await page.goto(URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(350);
      const coldLoad = await readColdLoad(page);
      await enterYard(page);
      const world3d = await page.evaluate(() => document.querySelector(".game canvas")?.dataset.world3d ?? null);
      const camOk = await page.evaluate(() => { const c = document.querySelector(".game canvas"); return !!(c && c.dataset.cam && c.width > 0); });
      if (world3d !== "unavailable") hardFailures.push(`${tag}: expected world3d=unavailable, got ${world3d}`);
      if (!camOk) hardFailures.push(`${tag}: 2D fallback canvas never stamped a live camera`);
      const idleFrame = await sampleFrames(page, 2000);
      const memoryIdle = await readHeap(page);
      const screenshot = await shot(page, `151-p03-${tag}.png`);
      if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);
      report.devices.push({ device: dev.name, fixture: "MATURE", fallback: true, tag, world3d, coldLoad, idleFrame, memoryIdle, consoleErrors, screenshot });
      console.log(`[${tag}] fcp=${coldLoad.fcpMs}ms load=${coldLoad.navigation?.loadEventEndMs}ms world3d=${world3d} idleP95=${idleFrame?.p95Ms}ms errors=${consoleErrors.length}`);
      await context.close();
    }

    report.buildInventory = buildInventory();
    report.budgetVerdicts = evaluateBudgets(report, budgets);
    const s = report.budgetVerdicts.summary;
    console.log(`BUDGETS: ${s.met} met / ${s.unmet} unmet / ${s.unknown} unknown (total ${s.total}) allMet=${s.allMet}`);
    for (const v of report.budgetVerdicts.verdicts.filter((x) => x.met === false)) console.log(`  UNMET ${v.metric} [${v.scope}] ${v.value}${v.unit} > ${v.limit}${v.unit}`);
    for (const v of report.budgetVerdicts.verdicts.filter((x) => x.met === null)) console.log(`  UNKNOWN ${v.metric} [${v.scope}] (${v.note})`);
    check("no hard failures", 0, hardFailures.length, hardFailures.length === 0);
    exitCode = finish(report);
  } catch (err) {
    console.error("P03 failed:", err);
    report.error = String(err && err.stack || err);
    exitCode = 1;
  } finally {
    writeReport("151-p03-coldload.json", report);
    await browser.close();
    stopServer(preview);
  }
  process.exit(exitCode);
}

if (MODE === "p02") await runP02();
else if (MODE === "p01") await runP01();
else if (MODE === "p03") await runP03();
else { console.error(`unknown --mode ${MODE} (use p01|p02|p03)`); process.exit(1); }
