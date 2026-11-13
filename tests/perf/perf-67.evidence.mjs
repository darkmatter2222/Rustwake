// @ts-nocheck
/**
 * Issue #67 (UI-RESET/PERF) matched BEFORE/AFTER performance probe.
 *
 * Headless Chrome Performance-API / DOM measurements ONLY. No vision: every number
 * below is read from the browser's own navigation timing, PerformanceResourceTiming,
 * requestAnimationFrame deltas, PerformanceObserver long tasks and (Chrome-only)
 * performance.memory — never a visual inspection. The probe drives the REAL app
 * (vite preview of this branch's BUILD), seeds the yard through the game's own
 * encodeSave + real engine (the same yardFrame the UI-002 instrument uses), and reads
 * the camera the app stamps onto canvas.dataset.cam.
 *
 * DEVICE-vs-EMULATION LIMITATION (criterion 2/4): these are HEADLESS CHROME EMULATION
 * numbers on a desktop host, NOT a physical phone. Viewport / deviceScaleFactor /
 * isMobile / hasTouch / prefers-reduced-motion are emulated; CPU, GPU, thermal
 * throttling, real touch latency and mobile network are NOT. Frame-time and memory
 * are host-relative. Budgets are grounded in this same emulation so before/after are
 * compared under IDENTICAL conditions; they are experience targets, not device claims.
 *
 * Usage:
 *   pnpm build && pnpm preview --port 4167        (separate shell)
 *   pnpm exec tsx tests/perf/perf-67.evidence.mjs \
 *     --url http://localhost:4167/ --out tests/perf/perf-67.evidence \
 *     --label before --sha <head> [--budgets tests/perf/budgets.json] [--quick]
 *
 * Fixture mutation lives only here in probe code, never in src. The store internals,
 * worker internals, save schema and offline catch-up are PRESERVED: the probe only
 * seeds a save and reads the running app.
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, decodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs.ts";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../src/game/simulation/commands.ts";
import { planConnections } from "../../src/game/simulation/autoconnect.ts";
import { advance } from "../../src/game/simulation/engine.ts";
import { tileToWorld, worldToScreen } from "../../src/game/renderer/scene.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL = arg("url", "http://localhost:4167/");
const LABEL = arg("label", "before");
const SHA = arg("sha", "unknown");
const OUT = resolve(root, arg("out", "tests/perf/perf-67.evidence"));
const BUDGETS_PATH = arg("budgets", "");
const QUICK = argv.includes("--quick");
mkdirSync(OUT, { recursive: true });
mkdirSync(resolve(OUT, "frames"), { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge executable found for headless capture");

/* ---- fixtures: the real-engine eight-machine yard (UI-002 yardFrame) -------- */
const EIGHT = [
  "sorter", "furnace", "copperSeparator", "polymerRecycler",
  "wireMill", "platePress", "circuitAssembler", "signalLab",
];
const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};
function yardFrame(depth, credits = 34, data = 0, tiles) {
  const state = createInitialState();
  let seq = 0;
  const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
  const connect = (machineId) => {
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
  };
  const fund = (blueprint) => {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = { ...state.store, [item.resource]: Math.max(state.store[item.resource] ?? 0, item.qty) };
    }
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
  };
  const order = EIGHT.slice(0, depth);
  state.tutorial = 9;
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  order.forEach((blueprint, index) => {
    fund(blueprint);
    send({ type: "machine.build", blueprint, tile: tiles?.[index] ?? firstFreeTile(state) });
    connect(state.machines[state.machines.length - 1].id);
    advance(state, 300);
  });
  state.credits = credits;
  state.store = { scrap: 9 };
  state.storeUnits = 9;
  if (data > 0) {
    state.store.data = data;
    state.storeUnits += data;
  }
  advance(state, 1);
  return state;
}
const seedEnvelope = (sim, textScale, lastSeen) =>
  encodeSave(sim, lastSeen, { ...DEFAULT_SETTINGS, textScale, muted: true });

/* ---- in-page perf instrumentation (installed before any app script) -------- */
const PERF_INIT = () => {
  window.__perf = { resources: [], longTasks: [], paint: [], lcp: [] };
  const safe = (type, cb, buffered) => {
    try {
      const obs = new PerformanceObserver((list) => cb(list.getEntries()));
      obs.observe({ type, buffered });
    } catch {
      /* observer type unsupported in this engine; metric reported null */
    }
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
  safe("longtask", (entries) => {
    for (const e of entries) window.__perf.longTasks.push({ startTime: e.startTime, duration: e.duration });
  }, true);
  safe("paint", (entries) => {
    for (const e of entries) window.__perf.paint.push({ name: e.name, startTime: e.startTime });
  }, true);
  safe("largest-contentful-paint", (entries) => {
    for (const e of entries) window.__perf.lcp.push({ startTime: e.startTime, size: e.size });
  }, true);
};

/* ---- Node-side helpers ---------------------------------------------------- */
const round = (n, p = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** p) / 10 ** p);
const percentile = (sorted, pct) => {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[idx];
};
function frameStats(deltas) {
  if (!deltas || !deltas.length) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = deltas.reduce((a, b) => a + b, 0);
  const dropped = deltas.filter((d) => d > 50).length;
  return {
    count: deltas.length,
    meanMs: round(sum / deltas.length),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted[sorted.length - 1]),
    droppedOver50ms: dropped,
    droppedPct: round((100 * dropped) / deltas.length),
    fpsMean: round(1000 / (sum / deltas.length), 1),
  };
}

/** Dismiss the intro gate / return report and wait for the live yard.
 *  The gate's primary button reads "Continue" for a saved yard and "Begin recovery"
 *  for a fresh one (its accessible name starts "Begin recovery"), so target the
 *  `.gate__btn` class rather than visible text. The gate paints a live yard preview
 *  behind it (the canvas already carries dataset.cam), so wait for the gate itself
 *  to retire — not merely the camera — before measuring chrome. An encoded absence
 *  then paints a return report that owns the panel slot; retire it via "Back to yard".
 *  Caller performs goto/reload first. */
async function enterYard(page) {
  const tryClick = async (selector, timeout) => {
    try {
      const el = await page.waitForSelector(selector, { timeout, state: "visible" });
      if (el) { await el.click(); return true; }
    } catch { /* button absent on this fixture */ }
    return false;
  };
  if (await tryClick(".gate__btn", QUICK ? 2000 : 4000)) {
    await page.waitForSelector(".gate", { state: "detached", timeout: QUICK ? 3000 : 6000 }).catch(() => {});
    await page.waitForTimeout(QUICK ? 150 : 300);
  }
  if (await tryClick("text=Back to yard", QUICK ? 1500 : 3000)) {
    await page.waitForTimeout(QUICK ? 150 : 300);
  }
  await page.waitForFunction(() => {
    const c = document.querySelector(".game canvas");
    return c && c.dataset.cam && c.width > 0 && !document.querySelector(".gate");
  }, { timeout: 20000 });
  await page.waitForTimeout(QUICK ? 200 : 400);
}

async function boot(page) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await enterYard(page);
}

/** Cold-load navigation timing + FCP/LCP + transferred-asset census, read in-page. */
async function readColdLoad(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || null;
    const perf = window.__perf || { resources: [], paint: [], lcp: [], longTasks: [] };
    const fcp = perf.paint.find((p) => p.name === "first-contentful-paint") || null;
    const lcp = perf.lcp.length ? perf.lcp[perf.lcp.length - 1] : null;
    const cat = (name, type) => {
      if (/\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(name)) return "image";
      if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(name)) return "audio";
      if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(name)) return "font";
      if (/\.css(\?|$)/i.test(name)) return "css";
      if (/worker/i.test(name) || type === "worker") return "worker";
      if (/vendor-.*\.js/.test(name)) return "vendorJs";
      if (/tables-.*\.js/.test(name)) return "tablesJs";
      if (/index-.*\.js/.test(name)) return "entryJs";
      if (/\.js(\?|$)/i.test(name)) return "otherJs";
      if (type === "navigation" || type === "document") return "html";
      return "other";
    };
    const buckets = {};
    let totalTransfer = 0, totalEncoded = 0, totalDecoded = 0, count = 0;
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
    // The document itself (navigation entry) is part of the cold transfer.
    const docTransfer = nav ? nav.transferSize || 0 : 0;
    const docDecoded = nav ? nav.decodedBodySize || 0 : 0;
    return {
      navigation: nav ? {
        domInteractiveMs: round2(nav.domInteractive),
        domContentLoadedMs: round2(nav.domContentLoadedEventEnd),
        loadEventEndMs: round2(nav.loadEventEnd),
        responseEndMs: round2(nav.responseEnd),
        durationMs: round2(nav.duration),
        transferSize: nav.transferSize, decodedBodySize: nav.decodedBodySize,
        type: nav.type,
      } : null,
      fcpMs: fcp ? round2(fcp.startTime) : null,
      lcpMs: lcp ? round2(lcp.startTime) : null,
      longTasksDuringLoad: perf.longTasks.filter((t) => nav && t.startTime <= nav.loadEventEnd + 50).length,
      resources: {
        count, totalTransferSize: totalTransfer + docTransfer,
        totalEncodedBodySize: totalEncoded, totalDecodedBodySize: totalDecoded + docDecoded,
        document: { transferSize: docTransfer, decodedBodySize: docDecoded },
        buckets, binaryMediaCount: binaryMedia.length, binaryMedia,
      },
    };
    function round2(n) { return n == null || !isFinite(n) ? null : Math.round(n * 100) / 100; }
  });
}

/** Sample real requestAnimationFrame deltas for `ms` while the app runs untouched. */
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

async function readMemory(page) {
  return page.evaluate(() => {
    const m = performance.memory;
    if (!m) return null;
    return {
      usedJSHeapMB: Math.round((m.usedJSHeapSize / 1048576) * 100) / 100,
      totalJSHeapMB: Math.round((m.totalJSHeapSize / 1048576) * 100) / 100,
      jsHeapLimitMB: Math.round((m.jsHeapSizeLimit / 1048576) * 100) / 100,
    };
  });
}

async function readLongTasks(page) {
  return page.evaluate(() => (window.__perf ? window.__perf.longTasks.length : 0));
}

/**
 * Click→DOM-appear latency, measured in-page across rAF frames (input dispatch to the
 * first frame where `appear` matches). `sel`+`text` pick the control; `index` fallback.
 * Repeated `times` and reduced to a median by the caller.
 */
async function measureClickOpen(page, { sel, text, appear, index = 0 }, times = 3) {
  const samples = [];
  for (let i = 0; i < times; i += 1) {
    const res = await page.evaluate(({ sel, text, appear, index }) => new Promise((resolve) => {
      const nodes = [...document.querySelectorAll(sel)];
      const target = text
        ? nodes.find((n) => (n.textContent || "").replace(/\s+/g, " ").trim() === text) || nodes[index]
        : nodes[index];
      if (!target) { resolve({ ok: false, reason: "no-target" }); return; }
      const t0 = performance.now();
      target.click();
      const start = performance.now();
      const tick = () => {
        if (document.querySelector(appear)) { resolve({ ok: true, ms: performance.now() - t0 }); return; }
        if (performance.now() - start > 4000) { resolve({ ok: false, reason: "timeout" }); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { sel, text, appear, index });
    samples.push(res);
    // Close whatever opened so the next sample starts from the resting screen.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(QUICK ? 60 : 120);
  }
  const ok = samples.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
  return {
    samples: samples.map((s) => (s.ok ? round(s.ms) : s.reason)),
    medianMs: ok.length ? round(percentile(ok, 50)) : null,
    p95Ms: ok.length ? round(percentile(ok, 95)) : null,
    maxMs: ok.length ? round(ok[ok.length - 1]) : null,
    okCount: ok.length,
  };
}

const clickFaceExactly = (page, label) =>
  page.evaluate((want) => {
    const faces = [...document.querySelectorAll(".dock .dock__btn")];
    const texts = faces.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
    const index = texts.indexOf(want);
    if (index >= 0) faces[index].click();
    return { want, index, faces: texts };
  }, label);

/** Robust panel opener (UI-002 openPanel): face click, paying the cheapest fork plan if needed. */
async function openPanelRobust(page, name) {
  const attempts = [];
  let clicked = await clickFaceExactly(page, name);
  await page.waitForTimeout(QUICK ? 80 : 150);
  let panels = await page.evaluate(() => document.querySelectorAll(".panel").length);
  attempts.push({ how: "face", index: clicked.index, panels });
  for (let i = 0; panels === 0 && i < 3; i += 1) {
    await page.evaluate(() => {
      const faces = [...document.querySelectorAll(".dock .dock__btn")];
      const accent = faces.find((b) => (getComputedStyle(b).backgroundImage || "").indexOf("linear-gradient") === 0) ?? faces[0];
      accent?.click();
    });
    await page.waitForTimeout(QUICK ? 100 : 200);
    clicked = await clickFaceExactly(page, name);
    await page.waitForTimeout(QUICK ? 80 : 150);
    panels = await page.evaluate(() => document.querySelectorAll(".panel").length);
    attempts.push({ how: "pay-cheapest-then-face", index: clicked.index, panels });
  }
  return { attempts, panels, faces: clicked.faces };
}

async function closePanels(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll(".panel__head button")) b.click();
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(QUICK ? 60 : 120);
}

/** Viewport tap points for machine tiles via the shipped camera maths (UI-002). */
async function tileTapPoints(page, tiles) {
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector(".game canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // dataset.cam is the renderer's stamped paint truth (App.tsx): "x,y,scale" in the
    // canvas's own CSS-pixel box. Reading it — rather than re-fitting — keeps tap points
    // on the painted machines through the shell's rail/inspector insets and any zoom,
    // which a bare fitCamera(view) does not reproduce (fitToShell shifts camera.x).
    const parts = (canvas.dataset.cam || "").split(",").map((v) => parseFloat(v));
    if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) return null;
    return {
      left: rect.left, top: rect.top,
      view: { width: canvas.clientWidth, height: canvas.clientHeight },
      camera: { x: parts[0], y: parts[1], scale: parts[2] },
    };
  });
  if (!geometry) return [];
  return tiles.map((tile) => {
    const world = tileToWorld(tile);
    const p = worldToScreen(geometry.camera, geometry.view, world.x, world.y);
    return { tile, x: Math.round(p.x + geometry.left), y: Math.round(p.y + geometry.top) };
  });
}

/** Canvas-tap → MachinePanel latency: the core game interaction, single click, no fork dance. */
async function measureMachineTap(page, tiles, times = 3) {
  const points = await tileTapPoints(page, tiles);
  const samples = [];
  for (let i = 0; i < times && points.length; i += 1) {
    let ms = null;
    // Tap machine centres until one opens the inspector; a tile may sit under chrome,
    // so walk the row the way a thumb does (UI-002 openMachinePanel) and time the tap
    // that actually lands. The per-tap clock excludes earlier misses.
    for (const point of points) {
      const t0 = Date.now();
      await page.mouse.click(point.x, point.y);
      try {
        await page.waitForSelector(".panel", { timeout: QUICK ? 800 : 1500 });
        ms = round(Date.now() - t0);
        break;
      } catch { /* next machine centre */ }
    }
    samples.push(ms === null ? "timeout" : ms);
    await closePanels(page);
  }
  const ok = samples.filter((s) => typeof s === "number").sort((a, b) => a - b);
  return {
    samples, points: points.slice(0, 3),
    medianMs: ok.length ? round(percentile(ok, 50)) : null,
    p95Ms: ok.length ? round(percentile(ok, 95)) : null,
    okCount: ok.length,
  };
}

async function capture(page, file) {
  const path = resolve(OUT, "frames", file);
  await page.screenshot({ path });
  const bytes = readFileSync(path);
  return { file: `frames/${file}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** On-disk build inventory: every emitted chunk's decoded bytes + SHA256 (HEAD/CODE evidence). */
function buildInventory() {
  const dir = resolve(root, "dist/assets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().map((name) => {
    const bytes = readFileSync(resolve(dir, name));
    const role = /index-.*\.js$/.test(name) ? "entryJs"
      : /vendor-.*\.js$/.test(name) ? "vendorJs"
      : /tables-.*\.js$/.test(name) ? "tablesJs"
      : /worker.*\.js$/.test(name) ? "lazyWorkerJs"
      : /\.css$/.test(name) ? "css" : "other";
    return { name, role, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}

/* ---- devices / scales ----------------------------------------------------- */
const DEVICES = [
  { name: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: "phone-landscape", viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const SCALES = [1, 2];
const idleMs = QUICK ? 900 : 1800;
const openFrameMs = QUICK ? 500 : 900;
const reducedMs = QUICK ? 700 : 1300;

const results = {
  issue: 67, label: LABEL, sha: SHA, url: URL,
  generatedOn: new Date().toISOString(),
  browser: { executablePath, headless: true, engine: "chromium (playwright-core)" },
  limitation: "HEADLESS CHROME EMULATION on a desktop host, NOT a physical device. Viewport/dpr/isMobile/hasTouch/reduced-motion emulated; CPU/GPU/thermal/real-touch/mobile-network are NOT. Frame-time and memory are host-relative; before/after compared under identical conditions.",
  durations: { idleMs, openFrameMs, reducedMs, quick: QUICK },
  devices: [], hardFailures: [],
};
const hardFailures = results.hardFailures;

const matureSim = yardFrame(8, 34, 12);
const openingSim = yardFrame(2, 34, 0);
// Confirm each seed passes the game's own load-path validation before driving the UI.
for (const [name, sim] of [["opening", openingSim], ["mature", matureSim]]) {
  const d = decodeSave(seedEnvelope(sim, 1, Date.now()));
  console.log(`seed ${name}: ${d.ok ? `ok (${sim.machines.length} machines, ${sim.routes.length} routes)` : `REJECTED ${d.reason}`}`);
  if (!d.ok) hardFailures.push(`seed ${name} rejected by decodeSave: ${d.reason}`);
}
const matureTiles = matureSim.machines.map((m) => m.tile);

// CPU throttle for the low-end-device pass. Default 6x ("low-end mobile"): on a
// fast host the 10Hz sim rerender fits inside the 60Hz vsync budget at 4x, so a
// higher rate is needed to expose per-tick rerender cost in frame time. Override
// with PERF_CPU_THROTTLE for experimentation; before/after MUST use the same rate.
const CPU_THROTTLE_RATE = Number(process.env.PERF_CPU_THROTTLE || 6);
results.cpuThrottleRate = CPU_THROTTLE_RATE;
const browser = await chromium.launch({ executablePath, headless: true });
try {
  // Warmup: one throwaway navigation so the first measured context is not paying
  // browser-process cold-start (which inflated the first FCP in early validation runs).
  {
    const warm = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const wp = await warm.newPage();
    await wp.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
    await wp.waitForTimeout(200);
    await warm.close();
  }
  for (const dev of DEVICES) {
    for (const ts of SCALES) {
      const tag = `${dev.name}-ts${ts}-mature`;
      const context = await browser.newContext({
        viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor,
        isMobile: dev.isMobile, hasTouch: dev.hasTouch,
      });
      await context.addInitScript(PERF_INIT);
      await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, seedEnvelope(matureSim, ts, Date.now())]);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));

      // COLD LOAD: navigation timing + FCP + transferred assets, on the Gate (pre-start).
      await page.goto(URL, { waitUntil: "networkidle" });
      await page.waitForTimeout(QUICK ? 150 : 350);
      const coldLoad = await readColdLoad(page);
      // BOOT into the running yard (dismiss intro/return gate robustly).
      await enterYard(page);

      const camOk = await page.evaluate(() => { const c = document.querySelector(".game canvas"); return !!(c && c.dataset.cam && c.width > 0); });
      if (!camOk) hardFailures.push(`${tag}: canvas never stamped a live camera`);

      // IDLE frame time + memory while the sim ticks untouched (the per-tick rerender cost).
      const longTasksBefore = await readLongTasks(page);
      const idleFrame = await sampleFrames(page, idleMs);
      const memoryIdle = await readMemory(page);
      const longTasksIdle = (await readLongTasks(page)) - longTasksBefore;

      // INTERACTION LATENCY: menu sheet open (always-present face) + canvas machine tap.
      const menuOpen = await measureClickOpen(page, { sel: 'button[aria-label="Menu"]', appear: ".shell-menu" }, 3);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(QUICK ? 60 : 120);
      const machineTap = await measureMachineTap(page, matureTiles, 3);

      // OPEN-MENU COST: each panel's open latency + frame time while open (sim still ticking).
      const panels = [];
      for (const name of ["Store", "Research", "Yard"]) {
        await closePanels(page);
        const t0 = Date.now();
        const opened = await openPanelRobust(page, name);
        const openMs = round(Date.now() - t0);
        const present = await page.evaluate(() => document.querySelectorAll(".panel").length);
        const frameWhileOpen = present > 0 ? await sampleFrames(page, openFrameMs) : null;
        const title = await page.evaluate(() => (document.querySelector(".panel__title")?.textContent || "").trim());
        panels.push({ name, openMs, attempts: opened.attempts, present, title, frameWhileOpen });
        if (present === 0) hardFailures.push(`${tag}: panel ${name} did not open`);
        await closePanels(page);
      }
      // Settings via Menu → Settings row.
      await page.evaluate(() => document.querySelector('button[aria-label="Menu"]')?.click());
      await page.waitForTimeout(QUICK ? 80 : 150);
      const settingsT0 = Date.now();
      const settingsClicked = await page.evaluate(() => {
        const row = [...document.querySelectorAll(".shell-menu__row")].find((r) => /Settings/i.test(r.textContent || ""));
        if (row) { row.click(); return true; }
        return false;
      });
      let settingsPresent = 0;
      try { await page.waitForSelector(".panel--settings", { timeout: 4000 }); settingsPresent = 1; } catch { settingsPresent = 0; }
      const settingsOpenMs = round(Date.now() - settingsT0);
      const settingsFrame = settingsPresent ? await sampleFrames(page, openFrameMs) : null;
      panels.push({ name: "Settings", openMs: settingsOpenMs, clicked: settingsClicked, present: settingsPresent, frameWhileOpen: settingsFrame });
      if (!settingsPresent) hardFailures.push(`${tag}: Settings panel did not open`);
      await closePanels(page);

      // STRESS: long session (sustained ticking) + rapid menu churn + resize, frame + heap growth.
      const memBeforeStress = await readMemory(page);
      const stressLongTasksBefore = await readLongTasks(page);
      const longSessionFrame = await sampleFrames(page, QUICK ? 1500 : 4000);
      // Rapid menu open/close churn while sampling.
      const churnFramePromise = sampleFrames(page, QUICK ? 1200 : 2500);
      for (let i = 0; i < (QUICK ? 6 : 12); i += 1) {
        await page.evaluate(() => document.querySelector('button[aria-label="Menu"]')?.click());
        await page.waitForTimeout(QUICK ? 40 : 70);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(QUICK ? 40 : 70);
      }
      const churnFrame = await churnFramePromise;
      // Resize stress: phone <-> landscape orientation flips (desktop stays wide).
      const resizeFrame = await (async () => {
        if (dev.name === "desktop") return null;
        const orig = dev.viewport;
        const flip = { width: orig.height, height: orig.width };
        const p = sampleFrames(page, QUICK ? 1000 : 2000);
        await page.setViewportSize(flip);
        await page.waitForTimeout(QUICK ? 120 : 250);
        await page.setViewportSize(orig);
        await page.waitForTimeout(QUICK ? 120 : 250);
        await page.setViewportSize(flip);
        await page.waitForTimeout(QUICK ? 120 : 250);
        await page.setViewportSize(orig);
        return p;
      })();
      const memAfterStress = await readMemory(page);
      const stressLongTasks = (await readLongTasks(page)) - stressLongTasksBefore;
      const heapGrowthMB = memBeforeStress && memAfterStress ? round(memAfterStress.usedJSHeapMB - memBeforeStress.usedJSHeapMB) : null;

      // CPU-THROTTLED EMULATION (CPU_THROTTLE_RATE, default 6x "low-end mobile"): a
      // slower-mobile approximation that exposes the per-tick rerender cost the fast
      // host hides at the 60 Hz vsync floor. Clearly labelled EMULATION, NOT a physical
      // device; applied IDENTICALLY before/after so the comparison is fair. On this host
      // frame time stays at the vsync floor even throttled, so throttled interaction
      // latency (menu open / machine tap) is the sensitive rerender-cost signal.
      await closePanels(page);
      const cdpT = await context.newCDPSession(page);
      await cdpT.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
      await page.waitForTimeout(QUICK ? 100 : 250);
      const tLongBefore = await readLongTasks(page);
      const throttledIdleFrame = await sampleFrames(page, idleMs);
      const throttledIdleLongTasks = (await readLongTasks(page)) - tLongBefore;
      const throttledMenuOpen = await measureClickOpen(page, { sel: 'button[aria-label="Menu"]', appear: ".shell-menu" }, 3);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(QUICK ? 60 : 120);
      const throttledMachineTap = await measureMachineTap(page, matureTiles, 3);
      await closePanels(page);
      const tStore = await openPanelRobust(page, "Store");
      const throttledStoreFrame = tStore.panels > 0 ? await sampleFrames(page, openFrameMs) : null;
      await closePanels(page);
      await cdpT.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdpT.detach().catch(() => {});
      const throttled = {
        rate: CPU_THROTTLE_RATE, idleFrame: throttledIdleFrame, idleLongTasks: throttledIdleLongTasks,
        menuOpen: throttledMenuOpen, machineTap: throttledMachineTap, storeFrame: throttledStoreFrame,
      };

      const shot = await capture(page, `perf-67-${LABEL}-${tag}.png`);

      // REDUCED MOTION: emulate the OS preference, reload, re-boot, re-measure idle frame.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await page.reload({ waitUntil: "networkidle" });
      await enterYard(page);
      const reducedIdleFrame = await sampleFrames(page, reducedMs);
      const reducedMemory = await readMemory(page);
      const shotReduced = await capture(page, `perf-67-${LABEL}-${tag}-reduced.png`);
      const reducedCamOk = await page.evaluate(() => { const c = document.querySelector(".game canvas"); return !!(c && c.dataset.cam && c.width > 0); });
      if (!reducedCamOk) hardFailures.push(`${tag}: reduced-motion frame lost the canvas`);

      if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);

      results.devices.push({
        device: dev.name, textScale: ts, fixture: "mature", tag,
        viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor,
        coldLoad, idleFrame, idleLongTasks: longTasksIdle, memoryIdle,
        interaction: { menuOpen, machineTap },
        throttled,
        panels,
        stress: { longSessionFrame, churnFrame, resizeFrame, heapGrowthMB, longTasks: stressLongTasks, memBeforeStress, memAfterStress },
        reducedMotion: { idleFrame: reducedIdleFrame, memory: reducedMemory, shot: shotReduced },
        consoleErrors, shot,
      });
      console.log(`[${tag}] fcp=${coldLoad.fcpMs}ms load=${coldLoad.navigation?.loadEventEndMs}ms transfer=${coldLoad.resources.totalTransferSize}B binaryMedia=${coldLoad.resources.binaryMediaCount} idleP95=${idleFrame?.p95Ms}ms dropped=${idleFrame?.droppedPct}% menuOpen=${menuOpen.medianMs}ms machineTap=${machineTap.medianMs}ms heap=${memoryIdle?.usedJSHeapMB}MB growth=${heapGrowthMB}MB | thr${CPU_THROTTLE_RATE}x idleP95=${throttledIdleFrame?.p95Ms}ms thrDrop=${throttledIdleFrame?.droppedPct}% thrMenu=${throttledMenuOpen.medianMs}ms thrTap=${throttledMachineTap.medianMs}ms thrStoreP95=${throttledStoreFrame?.p95Ms}ms | reducedP95=${reducedIdleFrame?.p95Ms}ms errors=${consoleErrors.length}`);
      await context.close();
    }
  }

  // ENTRY comparison: a lighter opening yard (2 machines) cold load on phone + desktop ts1.
  for (const dev of [DEVICES[0], DEVICES[1]]) {
    const tag = `${dev.name}-ts1-opening`;
    const context = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.isMobile, hasTouch: dev.hasTouch });
    await context.addInitScript(PERF_INIT);
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, seedEnvelope(openingSim, 1, Date.now())]);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(QUICK ? 150 : 350);
    const coldLoad = await readColdLoad(page);
    await boot(page);
    const idleFrame = await sampleFrames(page, idleMs);
    const memoryIdle = await readMemory(page);
    const shot = await capture(page, `perf-67-${LABEL}-${tag}.png`);
    if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);
    results.devices.push({ device: dev.name, textScale: 1, fixture: "opening", tag, viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, coldLoad, idleFrame, memoryIdle, consoleErrors, shot });
    console.log(`[${tag}] fcp=${coldLoad.fcpMs}ms transfer=${coldLoad.resources.totalTransferSize}B idleP95=${idleFrame?.p95Ms}ms errors=${consoleErrors.length}`);
    await context.close();
  }

  // OFFLINE CATCH-UP / LAZY CHUNK: an absence seed (lastSeenMs=10) triggers catch-up, which
  // spawns the catchup.worker lazy chunk and paints the return report. Proves criterion 5
  // (catch-up preserved) and measures the lazy chunk's actual transfer (criterion 2).
  {
    const dev = DEVICES[0];
    const tag = "phone-ts1-catchup";
    const context = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.isMobile, hasTouch: dev.hasTouch });
    await context.addInitScript(PERF_INIT);
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, seedEnvelope(matureSim, 1, 10)]);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(QUICK ? 200 : 500);
    const coldLoad = await readColdLoad(page);
    const reportBefore = await page.evaluate(() => {
      const panel = document.querySelector(".panel");
      const button = panel ? panel.querySelector(".panel__head button") : null;
      return { panels: document.querySelectorAll(".panel").length, dismiss: button ? (button.textContent || "").trim() : null };
    });
    // Enter via the gate's primary button ("Continue" for a saved yard); the encoded
    // absence then runs catch-up and paints the return report, which owns the panel
    // slot until its "Back to yard" target retires it.
    const gateBtn = await page.$(".gate__btn");
    if (gateBtn) await gateBtn.click();
    await page.waitForSelector(".gate", { state: "detached", timeout: QUICK ? 3000 : 6000 }).catch(() => {});
    await page.waitForTimeout(QUICK ? 400 : 1200);
    const reportAfterBegin = await page.evaluate(() => {
      const panel = document.querySelector(".panel");
      const button = panel ? panel.querySelector(".panel__head button") : null;
      const dismiss = button ? (button.textContent || "").trim() : null;
      if (button && /Back to yard/.test(dismiss)) button.click();
      return { panels: document.querySelectorAll(".panel").length, dismiss };
    });
    await page.waitForTimeout(QUICK ? 150 : 300);
    await page.waitForFunction(() => { const c = document.querySelector(".game canvas"); return c && c.dataset.cam && c.width > 0 && !document.querySelector(".gate"); }, { timeout: 20000 }).catch(() => {});
    const camOk = await page.evaluate(() => { const c = document.querySelector(".game canvas"); return !!(c && c.dataset.cam && c.width > 0) && !document.querySelector(".gate"); });
    const workerLoaded = coldLoad.resources.buckets.worker ? coldLoad.resources.buckets.worker.count > 0 : false;
    const catchupRan = reportBefore.panels > 0 || reportAfterBegin.panels > 0 || workerLoaded;
    if (!catchupRan) hardFailures.push(`${tag}: offline catch-up did not run (no return report / worker)`);
    if (!camOk) hardFailures.push(`${tag}: canvas did not render after catch-up`);
    if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);
    const shot = await capture(page, `perf-67-${LABEL}-${tag}.png`);
    results.devices.push({
      device: dev.name, textScale: 1, fixture: "mature-absence", tag, viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor,
      coldLoad, catchup: { workerLoaded, reportBefore, reportAfterBegin, catchupRan, camOk }, consoleErrors, shot,
    });
    console.log(`[${tag}] workerLoaded=${workerLoaded} workerBytes=${coldLoad.resources.buckets.worker?.decodedBodySize ?? 0} report=${JSON.stringify(reportBefore)} catchupRan=${catchupRan} cam=${camOk} errors=${consoleErrors.length}`);
    await context.close();
  }
} finally {
  await browser.close();
}

results.buildInventory = buildInventory();
results.hardFailures = hardFailures;
results.pass = hardFailures.length === 0;

/* ---- optional budget evaluation (grounded in baseline; experience targets) ---- */
if (BUDGETS_PATH && existsSync(resolve(root, BUDGETS_PATH))) {
  const budgets = JSON.parse(readFileSync(resolve(root, BUDGETS_PATH), "utf8"));
  results.budgets = budgets;
  results.budgetVerdicts = evaluateBudgets(results, budgets);
}

function evaluateBudgets(res, budgets) {
  const verdicts = [];
  const b = budgets.budgets || {};
  const mature = res.devices.filter((d) => d.fixture === "mature");
  const check = (metric, scope, value, limit, unit, dir = "max") => {
    if (value == null || limit == null) { verdicts.push({ metric, scope, value, limit, unit, met: null, note: "not measured / no budget" }); return; }
    const met = dir === "max" ? value <= limit : value >= limit;
    verdicts.push({ metric, scope, value, limit, unit, dir, met });
  };
  for (const d of mature) {
    const mobile = d.device !== "desktop";
    const scope = d.tag;
    if (b.coldLoad) {
      check("fcp", scope, d.coldLoad?.fcpMs, mobile ? b.coldLoad.mobileFcpMs : b.coldLoad.desktopFcpMs, "ms");
      check("loadEventEnd", scope, d.coldLoad?.navigation?.loadEventEndMs, mobile ? b.coldLoad.mobileLoadMs : b.coldLoad.desktopLoadMs, "ms");
    }
    if (b.transferred) {
      check("entryDecodedBytes", scope, d.coldLoad?.resources?.buckets?.entryJs?.decodedBodySize, b.transferred.entryDecodedBytes, "B");
      check("totalColdDecodedBytes", scope, d.coldLoad?.resources?.totalDecodedBodySize, b.transferred.totalColdDecodedBytes, "B");
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
  const met = verdicts.filter((v) => v.met === true).length;
  const unmet = verdicts.filter((v) => v.met === false).length;
  const unknown = verdicts.filter((v) => v.met === null).length;
  return { verdicts, summary: { met, unmet, unknown, total: verdicts.length, allMet: unmet === 0 && unknown === 0 } };
}

const jsonPath = resolve(OUT, `perf-67-${LABEL}-metrics.json`);
writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.log(`\nWrote ${jsonPath}`);
console.log(`build inventory: ${results.buildInventory.map((c) => `${c.role}=${c.bytes}B`).join(" ")}`);
if (results.budgetVerdicts) {
  const s = results.budgetVerdicts.summary;
  console.log(`BUDGETS: ${s.met} met / ${s.unmet} unmet / ${s.unknown} unknown (total ${s.total}) allMet=${s.allMet}`);
  for (const v of results.budgetVerdicts.verdicts.filter((x) => x.met === false)) console.log(`  UNMET ${v.metric} [${v.scope}] ${v.value}${v.unit} > ${v.limit}${v.unit}`);
}
console.log(`HARD ${results.pass ? "PASS" : "FAIL"}: ${hardFailures.length} failure(s)`);
for (const f of hardFailures) console.log(`  - ${f}`);
process.exit(results.pass ? 0 : 1);