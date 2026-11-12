// @ts-nocheck
/**
 * Issue #60 (UI-RESET/WORLD) matched BEFORE/AFTER evidence probe.
 *
 * Headless Chrome DOM/geometry/console + canvas pixel checks ONLY. No vision: every
 * claim below is a number measured from the live canvas or the live DOM, never a
 * visual inspection. The probe drives the REAL app (vite preview of this branch's
 * build), seeds the yard through the game's own encodeSave with lastSeenMs=Date.now()
 * (no offline gap, so no return report), and reads the exact camera the app stamps
 * onto canvas.dataset.cam rather than re-deriving the fit.
 *
 * Usage:
 *   pnpm build && pnpm preview --port 5160   (separate shell)
 *   node --import tsx tests/renderer/world-60.evidence.mjs \
 *     --url http://localhost:5160/ --out tests/renderer/world-60-evidence --label before --sha <head>
 *
 * Fixtures fs1()/mature() are byte-for-byte the shapes tests/renderer/scene-draw.test.ts
 * draws, so the captured yard is the same yard the deterministic contracts pin. Fixture
 * mutation lives only here in probe code, never in src.
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, decodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { PALETTE } from "../../src/game/renderer/sprites.ts";
import { tileToWorld, worldToScreen, WRECK_POSITION } from "../../src/game/renderer/scene.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const URL = arg("url", "http://localhost:5160/");
const LABEL = arg("label", "before");
const SHA = arg("sha", "unknown");
const OUT = resolve(root, arg("out", "tests/renderer/world-60-evidence"));
mkdirSync(OUT, { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge executable found for headless capture");

/* ---- fixtures: the exact scene-draw.test.ts shapes ---------------------- */
function fs1() {
  const base = createInitialState();
  const machine = (id, blueprint, tile, status, level, trayUnits) => ({
    id, blueprint, tile, orientation: 0, level,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 120, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 3,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  });
  return {
    ...base,
    tick: 344,
    tutorial: 9,
    machines: [machine(1, "sorter", 8, "running", 1, 0), machine(2, "furnace", 14, "outputFull", 1, 1)],
    routes: [
      { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
        capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
      { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous",
        capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
    ],
    drone: { ...base.drone, repaired: true, inFlight: { arrive: 350, qty: 3 } },
    storeUnits: 770,
    storeCapacity: 900,
  };
}
function mature() {
  const base = fs1();
  const blueprints = ["sorter", "furnace", "wireMill", "signalLab", "sorter", "furnace", "platePress", "circuitAssembler"];
  const statuses = ["running", "starved", "outputFull", "idle", "powerLimited", "paused", "running", "outputFull"];
  base.machines = blueprints.map((bp, i) => ({
    ...base.machines[i % 2], id: i + 1, blueprint: bp, tile: i + 1, status: statuses[i], level: 2 + (i % 3),
  }));
  const spare = { ...base.drone, repaired: true, inFlight: { arrive: 350, qty: 2 } };
  return {
    ...base,
    spares: [spare, spare, spare, spare],
    routes: Array.from({ length: 18 }, (_, i) => ({
      id: i + 1, from: { kind: i % 2 ? "store" : "machine", id: 1 + (i % 8) },
      to: { kind: i % 3 ? "machine" : "store", id: 1 + ((i + 1) % 8) }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 + (i % 4) }], inFlight: 1,
    })),
  };
}

/* ---- helpers ------------------------------------------------------------ */
const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
// Machine body materials (the silhouette ink a player reads at phone scale).
const BODY_RGB = [PALETTE.bodyLight, PALETTE.bodyMid, PALETTE.steelLight, PALETTE.wreck].map(hexRgb);
const NEAR = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const seedEnvelope = (sim) => encodeSave(sim, Date.now(), { ...DEFAULT_SETTINGS });

async function boot(page) {
  await page.goto(URL, { waitUntil: "networkidle" });
  const begin = await page.$("text=Begin recovery");
  if (begin) await begin.click();
  const back = await page.$("text=Back to yard");
  if (back) await back.click();
  // Wait until the app has stamped a live camera (first rendered yard frame).
  await page.waitForFunction(() => {
    const c = document.querySelector(".game canvas");
    return c && c.dataset.cam && c.width > 0;
  }, { timeout: 15000 });
  await page.waitForTimeout(250);
}

async function readCamera(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".game canvas");
    const [x, y, scale] = c.dataset.cam.split(",").map(Number);
    const dpr = c.width / c.getBoundingClientRect().width;
    return { x, y, scale, dpr, deviceW: c.width, deviceH: c.height, cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height };
  });
}

/** Count machine-body pixels inside each machine cell box, in device pixels. */
async function cellInk(page, cam, tiles) {
  const boxes = tiles.map((t) => {
    const w = tileToWorld(t);
    const tl = worldToScreen(cam, { width: cam.cssW, height: cam.cssH }, w.x - 16, w.y - 16);
    const br = worldToScreen(cam, { width: cam.cssW, height: cam.cssH }, w.x + 16, w.y + 16);
    return { tile: t, x0: Math.round(tl.x * cam.dpr), y0: Math.round(tl.y * cam.dpr), x1: Math.round(br.x * cam.dpr), y1: Math.round(br.y * cam.dpr) };
  });
  return page.evaluate(({ boxes, body, tol }) => {
    const c = document.querySelector(".game canvas");
    const ctx = c.getContext("2d");
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const near = (r, g, b) => body.some((m) => Math.abs(r - m[0]) <= tol && Math.abs(g - m[1]) <= tol && Math.abs(b - m[2]) <= tol);
    return boxes.map((bx) => {
      let bodyPx = 0, total = 0;
      const x0 = Math.max(0, bx.x0), x1 = Math.min(c.width, bx.x1);
      const y0 = Math.max(0, bx.y0), y1 = Math.min(c.height, bx.y1);
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        const i = (y * c.width + x) * 4; total += 1;
        if (near(img[i], img[i + 1], img[i + 2])) bodyPx += 1;
      }
      return { tile: bx.tile, bodyPx, total, pct: total ? +((100 * bodyPx) / total).toFixed(2) : 0 };
    });
  }, { boxes, body: BODY_RGB, tol: 10 });
}

/** Whole-canvas counts: machine body ink, cyan route ink, night background ink. */
async function frameCensus(page) {
  return page.evaluate(({ body, tol }) => {
    const c = document.querySelector(".game canvas");
    const ctx = c.getContext("2d");
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const near = (r, g, b, m) => Math.abs(r - m[0]) <= tol && Math.abs(g - m[1]) <= tol && Math.abs(b - m[2]) <= tol;
    const cyan = [95, 216, 232];
    let bodyPx = 0, cyanPx = 0, nonBlack = 0;
    const total = c.width * c.height;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      if (r + g + b > 24) nonBlack += 1;
      if (body.some((m) => near(r, g, b, m))) bodyPx += 1;
      if (near(r, g, b, cyan)) cyanPx += 1;
    }
    return { total, bodyPx, cyanPx, nonBlack, bodyPct: +((100 * bodyPx) / total).toFixed(3), cyanPct: +((100 * cyanPx) / total).toFixed(3) };
  }, { body: BODY_RGB, tol: 10 });
}

/** DOM control/route visibility: the topmost element at each control centre is the
 *  control (or a descendant), never the canvas painting over it. */
async function controlVisibility(page) {
  return page.evaluate(() => {
    const sel = [".dock__btn", ".dock__btn--primary", ".hud__lead", ".shell-zoom__face", ".shell-rail__slot"];
    const out = [];
    for (const s of sel) {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const visible = !!top && (el === top || el.contains(top));
        // The art lives on the canvas, which stacks BELOW the HUD. A control is only
        // "hidden by decoration" when the canvas is topmost at its centre AND the control
        // is hit-testable. Click-through layout wrappers (pointer-events:none, e.g. the
        // .hud__lead resource bar) intentionally pass clicks to the yard and are not
        // obscured controls, so they are excluded from the art-covering assertion.
        const pe = getComputedStyle(el).pointerEvents;
        const coveredByCanvas = !!top && top.tagName === "CANVAS" && pe !== "none";
        out.push({ selector: s, label: (el.textContent || "").trim().slice(0, 24), cx: Math.round(cx), cy: Math.round(cy), visible, coveredByCanvas, pointerEvents: pe, topTag: top ? top.tagName : null, topClass: top ? top.className : null });
      }
    }
    return out;
  });
}

/** Sample the output-blocked accent bar width across frames on the real canvas.
 *  The bar sits at world (cell.x-9, cell.y+10), 2 units tall; we measure the longest
 *  rust run on its row. Two distinct widths => animation; one => reduced motion. */
async function barAmplitude(page, cam, tile, frames = 8) {
  const w = tileToWorld(tile);
  const origin = worldToScreen(cam, { width: cam.cssW, height: cam.cssH }, w.x - 9, w.y + 10);
  const rowY = Math.round((origin.y + 1) * cam.dpr);
  const x0 = Math.round(origin.x * cam.dpr);
  const widths = [];
  for (let f = 0; f < frames; f += 1) {
    const run = await page.evaluate(({ rowY, x0, dpr }) => {
      const c = document.querySelector(".game canvas");
      const ctx = c.getContext("2d");
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      const isRust = (i) => Math.abs(img[i] - 201) <= 12 && Math.abs(img[i + 1] - 113) <= 12 && Math.abs(img[i + 2] - 58) <= 12;
      let best = 0, cur = 0;
      const y = Math.max(0, Math.min(c.height - 1, rowY));
      for (let x = Math.max(0, x0 - 4); x < Math.min(c.width, x0 + Math.round(8 * dpr)); x += 1) {
        const i = (y * c.width + x) * 4;
        if (isRust(i)) { cur += 1; if (cur > best) best = cur; } else cur = 0;
      }
      return best;
    }, { rowY, x0, dpr: cam.dpr });
    widths.push(run);
    await page.waitForTimeout(70);
  }
  return { widths, distinct: [...new Set(widths)].length };
}

async function capture(page, file) {
  const path = resolve(OUT, file);
  await page.screenshot({ path });
  const bytes = readFileSync(path);
  return { file, bytes: bytes.length, fnv1a: fnv1a(bytes.toString("latin1")) };
}

/* ---- run ---------------------------------------------------------------- */
const DEVICES = [
  { name: "phone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const FIXTURES = [
  { name: "opening", sim: fs1(), tiles: [8, 14], barTile: 14 },
  { name: "mature", sim: mature(), tiles: [1, 2, 3, 4, 5, 6, 7, 8], barTile: 3 },
];

const results = { label: LABEL, sha: SHA, url: URL, generatedOn: new Date().toISOString(), devices: [] };
const hardFailures = [];
// Confirm each seed passes the game's own load-path validation before driving the UI.
for (const fx of FIXTURES) {
  const d = decodeSave(seedEnvelope(fx.sim));
  console.log(`seed ${fx.name}: ${d.ok ? `ok (${fx.sim.machines.length} machines, ${fx.sim.routes.length} routes)` : `REJECTED ${d.reason} ${d.detail ?? ""}`}`);
  if (!d.ok) hardFailures.push(`seed ${fx.name} rejected by decodeSave: ${d.reason} ${d.detail ?? ""}`);
}
const browser = await chromium.launch({ executablePath });
try {
  for (const dev of DEVICES) {
    for (const fx of FIXTURES) {
      const tag = `${dev.name}-${fx.name}`;
      const context = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.deviceScaleFactor, isMobile: dev.isMobile, hasTouch: dev.hasTouch });
      await context.addInitScript((value) => localStorage.setItem("rustwake.save.v1", value), seedEnvelope(fx.sim));
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      await boot(page);
      const cam = await readCamera(page);
      const cells = await cellInk(page, cam, fx.tiles);
      const census = await frameCensus(page);
      const controls = await controlVisibility(page);
      const bar = await barAmplitude(page, cam, fx.barTile);
      const shot = await capture(page, `world-60-${LABEL}-${tag}.png`);

      // Hard assertions: every machine cell carries body ink at this scale; controls
      // are not painted over; the canvas rendered something; no console errors.
      const minCell = Math.min(...cells.map((c) => c.bodyPx));
      if (minCell < 30) hardFailures.push(`${tag}: machine cell body ink too low (min ${minCell}px)`);
      const hidden = controls.filter((c) => !c.visible);
      const covered = controls.filter((c) => c.coveredByCanvas);
      if (covered.length) hardFailures.push(`${tag}: ${covered.length} controls covered by canvas art`);
      if (census.nonBlack < 1000) hardFailures.push(`${tag}: canvas appears empty`);
      if (consoleErrors.length) hardFailures.push(`${tag}: console errors ${consoleErrors.slice(0, 3).join(" | ")}`);

      // Reduced-motion alternative: emulate the OS preference, reload, re-measure.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await page.reload({ waitUntil: "networkidle" });
      const begin2 = await page.$("text=Begin recovery");
      if (begin2) await begin2.click();
      await page.waitForFunction(() => { const c = document.querySelector(".game canvas"); return c && c.dataset.cam && c.width > 0; }, { timeout: 15000 });
      await page.waitForTimeout(250);
      const camR = await readCamera(page);
      const barR = await barAmplitude(page, camR, fx.barTile);
      const cellsR = await cellInk(page, camR, fx.tiles);
      const shotR = await capture(page, `world-60-${LABEL}-${tag}-reduced.png`);
      const reducedOk = Math.min(...cellsR.map((c) => c.bodyPx)) >= 30;
      if (!reducedOk) hardFailures.push(`${tag}: reduced-motion frame lost machine ink`);

      results.devices.push({
        device: dev.name, fixture: fx.name, tag, camera: cam,
        cells, census, bar, reduced: { bar: barR, cells: cellsR, shot: shotR },
        controls: { total: controls.length, visible: controls.filter((c) => c.visible).length, hidden, coveredByCanvas: covered.length },
        consoleErrors, shot,
        assertions: { minCellBodyPx: minCell, controlsNotCoveredByArt: covered.length === 0, reducedRenders: reducedOk, barAnimated: bar.distinct >= 2, barReducedFrozen: barR.distinct <= 1 },
      });
      console.log(`[${tag}] cam=${JSON.stringify(cam)} minCellBodyPx=${minCell} bodyPct=${census.bodyPct} cyanPct=${census.cyanPct} controls=${controls.filter((c) => c.visible).length}/${controls.length} barDistinct=${bar.distinct} reducedBarDistinct=${barR.distinct} errors=${consoleErrors.length}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

results.hardFailures = hardFailures;
results.pass = hardFailures.length === 0;
const jsonPath = resolve(OUT, `world-60-${LABEL}-metrics.json`);
writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.log(`\nWrote ${jsonPath}`);
console.log(`HARD ${results.pass ? "PASS" : "FAIL"}: ${hardFailures.length} failure(s)`);
for (const f of hardFailures) console.log(`  - ${f}`);
process.exit(results.pass ? 0 : 1);
