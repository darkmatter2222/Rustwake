// Real on-device benchmark for issue #190 (T03a), run against an ATTACHED
// physical handset over adb + Chrome remote CDP. This is NOT desktop emulation:
// the page renders in Chrome on the phone, input is real CDP touch events, and
// the GPU is the phone's own (verified via WEBGL_debug_renderer_info).
//
// It reuses the spike harness helpers (prototypes/rw3d-renderer/scripts/lib.mjs)
// and the in-page window.__RW3D__ API WITHOUT modifying prototypes/. It mirrors
// scripts/bench.mjs measurement logic and pre-registered checks (same thresholds,
// not relaxed) but targets the remote phone instead of a local headless browser.
//
// Prerequisites (host):
//   pnpm --dir prototypes/rw3d-renderer install --frozen-lockfile
//   pnpm --dir prototypes/rw3d-renderer build
//   pnpm --dir prototypes/rw3d-renderer exec vite preview --port 4310 --strictPort
//   adb reverse tcp:4310 tcp:4310
//   adb shell am start -a android.intent.action.VIEW -d http://localhost:4310/ com.android.chrome
//   adb forward tcp:9222 localabstract:chrome_devtools_remote
// Run:
//   node docs/evidence/2026-11-14-rw3d-t03a-phone-bench.mjs
// Writes 2026-11-14-rw3d-t03a-phone-benchmark.json + phone-open/selected.png and
// exits 0/1 on the pre-registered checks. T03 artifacts are never overwritten.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { percentile, headSha, evidenceDir, PREVIEW_URL } from "../../prototypes/rw3d-renderer/scripts/lib.mjs";

// Resolve playwright-core from the prototype's own node_modules (no root dep).
const require = createRequire(new URL("../../prototypes/rw3d-renderer/package.json", import.meta.url));
const { chromium } = require("playwright-core");

const OUT = "2026-11-14-rw3d-t03a-phone";
const CDP_URL = process.env.RW3D_CDP || "http://localhost:9222";
const ADB = process.env.RW3D_ADB || "O:/platform-tools/adb.exe";
const FRAMES = 900;
const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }

function adb(args) {
  const r = spawnSync(ADB, args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
}
function census() {
  const raw = adb(["shell", [
    'echo MODEL=$(getprop ro.product.model); echo BRAND=$(getprop ro.product.brand);',
    'echo MANUFACTURER=$(getprop ro.product.manufacturer); echo DEVICE=$(getprop ro.product.device);',
    'echo ANDROID_RELEASE=$(getprop ro.build.version.release); echo SDK=$(getprop ro.build.version.sdk);',
    'echo BUILD_ID=$(getprop ro.build.display.id); echo SECURITY_PATCH=$(getprop ro.build.version.security_patch);',
    'echo SOC=$(getprop ro.soc.model); echo HARDWARE=$(getprop ro.hardware);',
    'echo WM_SIZE=$(wm size); echo WM_DENSITY=$(wm density);',
    'echo MEMTOTAL=$(grep MemTotal /proc/meminfo);',
    'echo BATT_TEMP=$(dumpsys battery | grep temperature); echo BATT_LEVEL=$(dumpsys battery | grep level);',
    'echo CHROME_VER=$(dumpsys package com.android.chrome | grep versionName | head -1);',
  ].join(" ")]);
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const sizeMatch = /(\d+)x(\d+)/.exec(map.WM_SIZE || "");
  const densityMatch = /(\d+)/.exec(map.WM_DENSITY || "");
  const memMatch = /(\d+)/.exec(map.MEMTOTAL || "");
  const tempMatch = /(\d+)/.exec(map.BATT_TEMP || "");
  const chromeMatch = /versionName=(\S+)/.exec(map.CHROME_VER || "");
  return {
    source: "adb shell getprop / wm / proc / dumpsys (collected by this runner at run time)",
    serial: adb(["get-serialno"]).trim(),
    model: map.MODEL || null, brand: map.BRAND || null, manufacturer: map.MANUFACTURER || null,
    device: map.DEVICE || null, socModel: map.SOC || null, hardware: map.HARDWARE || null,
    androidRelease: map.ANDROID_RELEASE || null, sdk: map.SDK || null,
    buildId: map.BUILD_ID || null, securityPatch: map.SECURITY_PATCH || null,
    chromeVersion: chromeMatch ? chromeMatch[1] : null,
    wmSizeRaw: map.WM_SIZE || null, wmDensityRaw: map.WM_DENSITY || null,
    screenWidthPx: sizeMatch ? +sizeMatch[1] : null, screenHeightPx: sizeMatch ? +sizeMatch[2] : null,
    densityDpi: densityMatch ? +densityMatch[1] : null,
    memTotalKb: memMatch ? +memMatch[1] : null,
    batteryTempC: tempMatch ? +tempMatch[1] / 10 : null,
    batteryLevelPct: map.BATT_LEVEL ? +(/(\d+)/.exec(map.BATT_LEVEL)?.[1] ?? NaN) : null,
    raw,
  };
}

const device = census();
const browser = await chromium.connectOverCDP(CDP_URL);
let exitCode = 0;
try {
  const context = browser.contexts()[0];
  if (!context) throw new Error("no default browser context over CDP");
  // Reuse the already-open localhost:4310 tab; never touch unrelated user tabs.
  let page = context.pages().find((p) => p.url().startsWith(PREVIEW_URL));
  if (!page) { page = await context.newPage(); }
  page.setDefaultTimeout(180000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.bringToFront().catch(() => {});
  await page.goto(PREVIEW_URL, { waitUntil: "load" });
  await page.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");

  const info = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return {
      threeRevision: window.__RW3D__.threeRevision,
      gl: window.__RW3D__.glInfo(),
      startup: window.__RW3D__.startup,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: navigator.deviceMemory ?? null,
      heapBefore: performance.memory ? performance.memory.usedJSHeapSize : null,
      devicePixelRatio: window.devicePixelRatio,
      effectivePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      cssWidth: window.innerWidth, cssHeight: window.innerHeight,
      screenW: screen.width, screenH: screen.height,
      drawingBufferWidth: canvas ? canvas.width : null,
      drawingBufferHeight: canvas ? canvas.height : null,
    };
  });

  // Clean open screenshot (real phone framebuffer).
  const cdp = await context.newCDPSession(page);
  const openShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(evidenceDir, `${OUT}-open.png`), Buffer.from(openShot.data, "base64"));

  const samples = await page.evaluate((n) => window.__RW3D__.runBench(n), FRAMES);

  // Real touch interaction: 5 taps on the crane, 5 on empty ground (CDP touch).
  for (let k = 0; k < 10; k += 1) {
    let x, y;
    if (k % 2 === 0) {
      const p = await page.evaluate(() => window.__RW3D__.projectCraneCenter());
      x = p.x; y = p.y;
    } else {
      const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      x = 20; y = vp.h - 30;
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.evaluate(() => window.__RW3D__.waitFrames(2));
  }
  const latencies = await page.evaluate(() => window.__RW3D__.selectionLatencies.slice());
  const after = await page.evaluate(() => ({
    stats: window.__RW3D__.stats(),
    heapAfter: performance.memory ? performance.memory.usedJSHeapSize : null,
    pivot: window.__RW3D__.pivot(),
  }));
  const selShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(evidenceDir, `${OUT}-selected.png`), Buffer.from(selShot.data, "base64"));

  // Cold load under the contract's documented 20 Mbps / 50 ms simulation (P03).
  const coldPage = await context.newPage();
  const coldCdp = await context.newCDPSession(coldPage);
  await coldCdp.send("Network.enable");
  await coldCdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await coldCdp.send("Network.emulateNetworkConditions", {
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

  // Pre-registered checks: identical thresholds to scripts/bench.mjs (NOT relaxed).
  check("frames completed", FRAMES, samples.length, samples.length === FRAMES);
  check("no page errors", 0, pageErrors.length, pageErrors.length === 0);
  check("max draw calls <= 32 (spike sanity)", "<=32", Math.max(...calls), Math.max(...calls) <= 32);
  check("max triangles <= 5000 (spike sanity)", "<=5000", Math.max(...tris), Math.max(...tris) <= 5000);
  check("p95 rAF delta <= 250ms (not frozen)", "<=250", percentile(rafMs, 0.95), percentile(rafMs, 0.95) <= 250);
  check("selection samples >= 10", ">=10", latencies.length, latencies.length >= 10);
  check("p95 input-to-feedback <= 100ms (contract)", "<=100", percentile(latencies, 0.95), latencies.length >= 10 && percentile(latencies, 0.95) <= 100);
  check("cold first frame <= 5000ms @20Mbps/50ms (contract P03)", "<=5000", cold.firstFrameMs, cold.firstFrameMs <= 5000);
  const totalTransfer = (cold.navTransferBytes ?? 0) + cold.resourceTransferBytes;
  check("cold transferred payload <= 8MB (contract P03)", "<=8388608", totalTransfer, totalTransfer <= 8 * 1024 * 1024);
  check("warm startup first frame <= 5000ms (sanity)", "<=5000", info.startup.firstFrameMs, info.startup.firstFrameMs <= 5000);

  const report = {
    meta: {
      issue: 190, role: "developer", seed: "rw3d-t03-bench-v1",
      sha: headSha(),
      command: "node docs/evidence/2026-11-14-rw3d-t03a-phone-bench.mjs",
      timestamp: new Date().toISOString(),
      evidenceClass: "REAL physical handset over adb + Chrome remote CDP (not desktop emulation)",
      state: "static crane blockout on 12x12 sand patch; scripted 900-frame timeline, fixed dt=1/60; no economy simulation",
      qualityTier: "blockout-flat: no shadows, DPR cap 2, shared glTF materials, antialias on",
      viewport: `${info.cssWidth}x${info.cssHeight} CSS @ devicePixelRatio ${info.devicePixelRatio} (effective ${info.effectivePixelRatio})`,
      inputMethod: "CDP Input.dispatchTouchEvent (real touch -> pointerdown/pointerup)",
    },
    device,
    browser: {
      cdpUrl: CDP_URL, userAgent: info.userAgent,
      note: "Android Chrome navigator.userAgent is reduced/frozen ('Android 10; K'); authoritative OS/build come from adb getprop above.",
      hardwareConcurrency: info.hardwareConcurrency, deviceMemoryGb: info.deviceMemoryGb,
    },
    display: {
      devicePixelRatio: info.devicePixelRatio, effectivePixelRatio: info.effectivePixelRatio,
      cssWidth: info.cssWidth, cssHeight: info.cssHeight,
      screenW: info.screenW, screenH: info.screenH,
      drawingBufferWidth: info.drawingBufferWidth, drawingBufferHeight: info.drawingBufferHeight,
    },
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
    pageErrors,
    checks,
    screenshots: [`${OUT}-open.png`, `${OUT}-selected.png`],
    limitations: [
      "Primary declared device is a Pixel 8 Pro FLAGSHIP (Tensor G3 / Mali-G715 MP7), not a mid-range phone; these numbers do NOT establish mid-range (e.g. Galaxy A54 / Mali-G68) compliance. Mid-range floor measurement is owed.",
      "Single-asset blockout scene: P1 normal/stress/battle population targets are NOT measured here.",
      "P02 warmed three-10-minute bounded-memory loops and hidden-tab/context-loss save integrity are NOT run here (deferred to #151 per product verdict); only P01 initial measurement + P03 cold load are covered.",
      "Input-to-feedback is the app's pointerup-handler metric (performance.now() - event.timeStamp); it excludes display scan-out/compositor presentation latency.",
      "Device display was set to 1008x2244 (not the panel's native 1344x2992); results reflect the active resolution setting.",
      "Thermal throttle not stressed: short 900-frame run from a cool start; sustained-load throttling unverified.",
      "performance.memory is Chromium-only and approximate; cold-load shaping is CDP emulation of network conditions on the real device (the renderer/GPU/input are real).",
    ],
  };
  const out = resolve(evidenceDir, `${OUT}-benchmark.json`);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`benchmark written: ${out}`);
  console.log(`device=${device.model} android=${device.androidRelease} chrome=${device.chromeVersion} gpu=${info.gl.renderer}`);
  console.log(`frames=${samples.length} fps=${report.frameTime.achievedFps} renderMs p50=${report.frameTime.renderMs.p50} p95=${report.frameTime.renderMs.p95} calls(max)=${report.scene.drawCalls.max} tris(max)=${report.scene.triangles.max}`);
  console.log(`cold: firstFrameMs=${cold.firstFrameMs} transferBytes=${totalTransfer}; input p95=${report.inputLatencyMs.p95}ms samples=${latencies.length}`);
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  exitCode = checks.every((c) => c.pass) ? 0 : 1;
} catch (err) {
  console.error("phone bench failed:", err);
  exitCode = 1;
} finally {
  await browser.close();
}
process.exit(exitCode);
