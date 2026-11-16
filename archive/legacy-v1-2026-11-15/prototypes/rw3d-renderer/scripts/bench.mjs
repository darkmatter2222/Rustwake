// Bounded benchmark for issue #130 (P01 initial measurement, P03 cold load).
// Reproducible: pnpm bench  (seed/state rw3d-t03-bench-v1, fixed dt=1/60,
// 900-frame scripted timeline in src/main.js runBench). Writes raw JSON to
// docs/evidence/2026-11-14-rw3d-t03-benchmark.json and exits 0/1 on checks.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  startPreview, stopPreview, launchBrowser, headSha, percentile,
  evidenceDir, PREFIX, PREVIEW_URL, protoRoot,
} from "./lib.mjs";

const FRAMES = 900;
const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }

const devicePath = resolve(evidenceDir, `${PREFIX}-device.json`);
const device = existsSync(devicePath) ? JSON.parse(readFileSync(devicePath, "utf8")) : null;

const preview = await startPreview();
const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
let exitCode = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(PREVIEW_URL, { waitUntil: "load" });
  await page.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");

  const info = await page.evaluate(() => ({
    threeRevision: window.__RW3D__.threeRevision,
    gl: window.__RW3D__.glInfo(),
    startup: window.__RW3D__.startup,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: navigator.deviceMemory ?? null,
    heapBefore: performance.memory ? performance.memory.usedJSHeapSize : null,
  }));

  const samples = await page.evaluate((n) => window.__RW3D__.runBench(n), FRAMES);

  // Real pointer interaction: 5 clicks on the crane, 5 on empty ground.
  for (let k = 0; k < 10; k += 1) {
    if (k % 2 === 0) {
      const p = await page.evaluate(() => window.__RW3D__.projectCraneCenter());
      await page.mouse.click(p.x, p.y);
    } else {
      await page.mouse.click(20, 860);
    }
    await page.evaluate(() => window.__RW3D__.waitFrames(2));
  }
  const latencies = await page.evaluate(() => window.__RW3D__.selectionLatencies.slice());
  const after = await page.evaluate(() => ({
    stats: window.__RW3D__.stats(),
    heapAfter: performance.memory ? performance.memory.usedJSHeapSize : null,
    pivot: window.__RW3D__.pivot(),
  }));

  // Cold load under the contract's documented 20 Mbps / 50 ms simulation (P03).
  const coldPage = await context.newPage();
  const cdp = await context.newCDPSession(coldPage);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 50, downloadThroughput: 2500000, uploadThroughput: 1250000,
  });
  await coldPage.goto(PREVIEW_URL, { waitUntil: "load" });
  await coldPage.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");
  const cold = await coldPage.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const rs = performance.getEntriesByType("resource");
    return {
      firstFrameMs: window.__RW3D__.startup.firstFrameMs,
      gltfLoadMs: window.__RW3D__.startup.gltfLoadMs,
      navTransferBytes: nav ? nav.transferSize : null,
      resourceTransferBytes: rs.reduce((a, r) => a + (r.transferSize || 0), 0),
      resourceEncodedBytes: rs.reduce((a, r) => a + (r.encodedBodySize || 0), 0),
      resourceCount: rs.length,
    };
  });
  await coldPage.close();

  const renderMs = samples.map((s) => s.renderMs);
  const rafMs = samples.map((s) => s.rafMs).filter((v) => v !== null);
  const meanRaf = rafMs.reduce((a, b) => a + b, 0) / rafMs.length;
  const calls = samples.map((s) => s.calls);
  const tris = samples.map((s) => s.triangles);

  check("frames completed", FRAMES, samples.length, samples.length === FRAMES);
  check("no page errors", 0, pageErrors.length, pageErrors.length === 0);
  check("max draw calls <= 32 (spike sanity)", "<=32", Math.max(...calls), Math.max(...calls) <= 32);
  check("max triangles <= 5000 (spike sanity)", "<=5000", Math.max(...tris), Math.max(...tris) <= 5000);
  check("p95 rAF delta <= 250ms (not frozen; software rasterizer tolerance)", "<=250", percentile(rafMs, 0.95), percentile(rafMs, 0.95) <= 250);
  check("selection samples >= 10", ">=10", latencies.length, latencies.length >= 10);
  check("p95 input-to-feedback <= 100ms (contract)", "<=100", percentile(latencies, 0.95), latencies.length >= 10 && percentile(latencies, 0.95) <= 100);
  check("cold first frame <= 5000ms @20Mbps/50ms (contract P03)", "<=5000", cold.firstFrameMs, cold.firstFrameMs <= 5000);
  const totalTransfer = (cold.navTransferBytes ?? 0) + cold.resourceTransferBytes;
  check("cold transferred payload <= 8MB (contract P03)", "<=8388608", totalTransfer, totalTransfer <= 8 * 1024 * 1024);
  check("warm startup first frame <= 5000ms (sanity)", "<=5000", info.startup.firstFrameMs, info.startup.firstFrameMs <= 5000);

  const report = {
    meta: {
      issue: 130, role: "developer", seed: "rw3d-t03-bench-v1",
      sha: headSha(), command: "pnpm --dir prototypes/rw3d-renderer bench",
      timestamp: new Date().toISOString(),
      state: "static crane blockout on 12x12 sand patch; scripted 900-frame timeline, fixed dt=1/60; no economy simulation",
      qualityTier: "blockout-flat: no shadows, DPR cap 2, shared glTF materials, antialias on",
      viewport: "1440x900 @1x",
    },
    device,
    browser: { executablePath, userAgent: info.userAgent, probeRenderer, swiftshaderForced },
    gl: info.gl,
    renderer: { name: "three.js", revision: info.threeRevision, pinned: "0.187.0" },
    scene: {
      asset: "crane.gltf (reference blockout, 8 box meshes)",
      meshes: after.stats.geometries, textures: after.stats.textures,
      drawCalls: { min: Math.min(...calls), max: Math.max(...calls) },
      triangles: { min: Math.min(...tris), max: Math.max(...tris) },
    },
    frameTime: {
      renderMs: { p50: percentile(renderMs, 0.5), p95: percentile(renderMs, 0.95), p99: percentile(renderMs, 0.99), max: Math.max(...renderMs) },
      rafMs: { p50: percentile(rafMs, 0.5), p95: percentile(rafMs, 0.95), max: Math.max(...rafMs) },
      achievedFps: +(1000 / meanRaf).toFixed(2),
    },
    inputLatencyMs: { samples: latencies.length, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? +Math.max(...latencies).toFixed(3) : null },
    memory: { heapBefore: info.heapBefore, heapAfter: after.heapAfter, geometries: after.stats.geometries, textures: after.stats.textures },
    startup: info.startup,
    coldLoad: { network: "CDP 20Mbps down / 50ms latency, cache disabled", ...cold, totalTransferBytes: totalTransfer },
    pivotAfter: after.pivot,
    checks,
    limitations: [
      "Single-asset blockout scene: P1 normal/stress/battle population targets (20/100 buildings etc.) are NOT measured here.",
      /swiftshader/i.test(info.gl.renderer ?? "")
        ? "Headless rasterizer was SwiftShader (CPU); GPU-path frame times on this device remain unverified."
        : "Headless Chrome rasterized on the declared GPU via ANGLE/D3D11 (see gl.renderer); no headed interactive run was performed.",
      "No real phone attached: no handset evidence; desktop emulation is not phone evidence.",
      "performance.memory is Chromium-only and approximate.",
    ],
  };
  const out = resolve(evidenceDir, `${PREFIX}-benchmark.json`);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`benchmark written: ${out}`);
  console.log(`frames=${samples.length} fps=${report.frameTime.achievedFps} renderMs p50=${report.frameTime.renderMs.p50} p95=${report.frameTime.renderMs.p95} calls(max)=${report.scene.drawCalls.max} tris(max)=${report.scene.triangles.max}`);
  console.log(`cold: firstFrameMs=${cold.firstFrameMs} transferBytes=${totalTransfer}; input p95=${report.inputLatencyMs.p95}ms`);
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  exitCode = checks.every((c) => c.pass) ? 0 : 1;
} catch (err) {
  console.error("bench failed:", err);
  exitCode = 1;
} finally {
  await browser.close();
  stopPreview(preview);
}
process.exit(exitCode);
