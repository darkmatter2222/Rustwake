// RW3D T07 (#134) bounded bench. Reproducible: node tests/renderer/rw3d-t07/bench.mjs
// Seed/state rw3d-t07-bench-v1: deep-yard.modern fixture, fixed dt = 1 tick/frame,
// 600-frame scripted timeline (quarter turns + anchored zoom pulses), run TWICE
// from a fresh fixture decode to prove determinism. Real pointer clicks measure
// input-to-selection latency through the production gesture reducer + raycast.
// Writes docs/evidence/2026-11-14-rw3d-t07-benchmark.json; exits 0/1 on checks.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  startDevServer, stopDevServer, launchBrowser, headSha, percentile,
  evidenceDir, PREFIX, HARNESS_URL,
} from "./lib.mjs";

const FRAMES = 600;
const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }

const server = await startDevServer();
const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
let exitCode = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");

  const info = await page.evaluate(() => ({
    ...window.__RW3D__.info(),
    gl: window.__RW3D__.glInfo(),
    status: window.__RW3D__.status(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
  }));

  const run1 = await page.evaluate((n) => window.__RW3D__.runTimeline(n), FRAMES);
  await page.evaluate(() => window.__RW3D__.reset());
  const run2 = await page.evaluate((n) => window.__RW3D__.runTimeline(n), FRAMES);

  // Real pointer interaction: 5 clicks on machine centres, 5 on empty corners.
  const ids = await page.evaluate(() => window.__RW3D__.machineIds());
  const clickResults = [];
  for (let k = 0; k < 10; k += 1) {
    if (k % 2 === 0) {
      const id = ids[(k / 2) % ids.length];
      const p = await page.evaluate((mid) => window.__RW3D__.projectMachine(mid), id);
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

  // Gesture safety through the real reducer: drag round-trip and cancel commit nothing.
  const safety = await page.evaluate(() => {
    const drag = window.__RW3D__.dispatch([
      { type: "down", id: 1, x: 400, y: 300 },
      { type: "move", id: 1, x: 480, y: 360 },
      { type: "move", id: 1, x: 400, y: 300 },
      { type: "up", id: 1, x: 400, y: 300 },
    ]);
    const cancelled = window.__RW3D__.dispatch([
      { type: "down", id: 1, x: 400, y: 300 },
      { type: "down", id: 2, x: 500, y: 300 },
      { type: "cancel", id: 1 },
      { type: "up", id: 2, x: 500, y: 300 },
    ]);
    const fresh = window.__RW3D__.dispatch([
      { type: "down", id: 1, x: 400, y: 300 },
      { type: "up", id: 1, x: 400, y: 300 },
    ]);
    return { drag, cancelled, fresh };
  });

  const renderMs = run1.samples.map((s) => s.renderMs);
  check("frames completed (run 1)", FRAMES, run1.samples.length, run1.samples.length === FRAMES);
  check("frames completed (run 2)", FRAMES, run2.samples.length, run2.samples.length === FRAMES);
  check("no page errors", 0, pageErrors.length, pageErrors.length === 0);
  check("3D world ready (not 2D fallback)", "ready", info.status, info.status === "ready");
  check("determinism: final state identical", JSON.stringify(run1.state), JSON.stringify(run2.state), JSON.stringify(run1.state) === JSON.stringify(run2.state));
  check("determinism: final pixel hash identical", run1.hash, run2.hash, run1.hash === run2.hash);
  check("p95 render ms <= 250 (software-rasterizer tolerance)", "<=250", percentile(renderMs, 0.95), percentile(renderMs, 0.95) <= 250);
  check("machine clicks select the aimed machine (5/5)", 5, clickResults.filter((c) => c.target !== "empty" && c.hit).length, clickResults.filter((c) => c.target !== "empty" && c.hit).length === 5);
  check("empty clicks clear selection (5/5)", 5, clickResults.filter((c) => c.target === "empty" && c.hit).length, clickResults.filter((c) => c.target === "empty" && c.hit).length === 5);
  check("selection latency samples >= 10", ">=10", latencies.length, latencies.length >= 10);
  check("p95 input-to-selection <= 250ms (software tolerance)", "<=250", percentile(latencies, 0.95), latencies.length >= 10 && percentile(latencies, 0.95) <= 250);
  check("drag round-trip commits 0 taps", 0, safety.drag.commits, safety.drag.commits === 0);
  check("cancelled pinch commits 0 taps", 0, safety.cancelled.commits, safety.cancelled.commits === 0);
  check("fresh gesture after cancel taps once", 1, safety.fresh.commits, safety.fresh.commits === 1);

  const report = {
    meta: {
      issue: 134, role: "developer", seed: "rw3d-t07-bench-v1", sha: headSha(),
      command: "node tests/renderer/rw3d-t07/bench.mjs",
      timestamp: new Date().toISOString(),
      state: "deep-yard.modern legacy fixture (decodeSave+migrate), real engine at fixed dt=1 tick/frame; 600-frame scripted timeline run twice; no RNG, no wall clock in the state path",
      qualityTier: "blockout-flat: no shadows, DPR cap 2, hemisphere 1.6 + directional 1.0, instanced batches",
      viewport: "1440x900 @1x",
    },
    browser: { executablePath, userAgent: info.userAgent, probeRenderer, swiftshaderForced },
    gl: info.gl,
    renderer: { name: "three.js", revision: info.threeRevision, pinned: "0.187.0" },
    fixture: { name: info.fixture, tick: info.tick, machines: info.machines, drones: info.drones, credits: info.credits },
    frameTime: {
      renderMs: { p50: percentile(renderMs, 0.5), p95: percentile(renderMs, 0.95), p99: percentile(renderMs, 0.99), max: Math.max(...renderMs) },
    },
    determinism: { run1: { state: run1.state, hash: run1.hash }, run2: { state: run2.state, hash: run2.hash } },
    inputLatencyMs: { samples: latencies.length, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? +Math.max(...latencies).toFixed(3) : null },
    clicks: clickResults,
    gestureSafety: safety,
    finalStats: run1.stats,
    checks,
    limitations: [
      "Headless rasterizer may be SwiftShader (CPU); GPU-path frame times on this device remain unverified (see gl.renderer).",
      "Bounded 7-machine yard: P1 population stress targets are NOT measured here.",
      "Latency is pointerdown-to-tap-commit inside the page; compositor present latency is not included.",
      "No real phone attached: desktop only.",
    ],
  };
  const out = resolve(evidenceDir, `${PREFIX}-benchmark.json`);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`benchmark written: ${out}`);
  console.log(`frames=${run1.samples.length} renderMs p50=${report.frameTime.renderMs.p50} p95=${report.frameTime.renderMs.p95} hash=${run1.hash}/${run2.hash} input p95=${report.inputLatencyMs.p95}ms`);
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  exitCode = checks.every((c) => c.pass) ? 0 : 1;
} catch (err) {
  console.error("bench failed:", err);
  exitCode = 1;
} finally {
  await browser.close();
  stopDevServer(server);
}
process.exit(exitCode);