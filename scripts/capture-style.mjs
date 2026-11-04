// Q-002 style-slice capture (spec rev-q2spec-g3, evidence E1-E9).
// Phone + desktop contexts, FS-1 fixture through the localStorage envelope,
// states rest/build/mature/one-machine, plus the grayscale silhouette sheet.
// Pixel samples use ctx.getImageData modal RGB over 3x3 + the WCAG ratio,
// read inside the running page - no assumptions from source.
//
// Usage: RUSTWAKE_URL=http://localhost:5174/ node scripts/capture-style.mjs
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:5174/";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((path) => existsSync(path));

/** Same FNV-1a as the app, so a rewritten envelope still verifies (D-11). */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const template = JSON.parse(readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"));

function part(id, blueprint, tile, status, trayUnits) {
  return {
    id, blueprint, tile, orientation: 0, level: 1,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 300, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 5,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  };
}

/** FS-1: the two-machine yard, both links loaded, tick 344 (spec 2.1). */
function fs1Envelope(oneMachine) {
  const env = JSON.parse(JSON.stringify(template));
  const sim = env.payload.sim;
  sim.tick = 344;
  sim.tutorial = 9;
  sim.machines = oneMachine
    ? [part(1, "sorter", 8, "running", 0)]
    : [part(1, "sorter", 8, "running", 0), part(2, "furnace", 14, "outputFull", 1)];
  sim.routes = [
    { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
  ];
  if (!oneMachine) {
    sim.routes.push({
      id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 },
      filter: "ferrous", capacity: 5, latency: 5,
      items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1,
    });
  }
  sim.store.data = 20;
  sim.storeUnits = 770;
  sim.storeCapacity = 900;
  const text = JSON.stringify(env.payload);
  return JSON.stringify({ ...env, checksum: fnv1a(text) });
}

const worldSample = () => {
  /** Modal RGB over 3x3 device px + WCAG ratio against the floor sample. */
  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h).data;
  const modal = (cssX, cssY) => {
    const cx = Math.round(cssX * dpr);
    const cy = Math.round(cssY * dpr);
    const tally = new Map();
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const i = ((cy + dy) * w + (cx + dx)) * 4;
        const key = `${img[i]},${img[i + 1]},${img[i + 2]}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    let best = "";
    let bestN = -1;
    for (const [key, n] of tally) if (n > bestN) [best, bestN] = [key, n];
    return best;
  };
  const lum = (rgb) =>
    rgb.split(",").map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 1000) / 1000;
  };
  const scale = Math.max(1.4, Math.min(4, innerWidth / (192 + 24)));
  const sx = (wx) => Math.round(((wx - 96) * scale + innerWidth / 2) * 10) / 10;
  const sy = (wy) => Math.round(((wy - 112) * scale + (document.querySelector(".game")?.clientHeight ?? innerHeight) / 2) * 10) / 10;
  const pts = {
    backdrop: modal(10, 10),
    floor: modal(sx(112), sy(80)), // tile 15 centre, an empty cell
    wreck: modal(sx(88), sy(206.4)), // hull, stepped right of the amber pip band
    machineTop: modal(sx(80), sy(48 - 8)),
    machineWell: modal(sx(80), sy(48 - 2)),
    dockPad: modal(sx(80), sy(16)),
    amberToken: modal(sx(73.9), sy(20.9)), // dock store gauge pip, amber
  };
  return {
    dpr,
    scale: Math.round(scale * 10000) / 10000,
    samples: pts,
    ratios: {
      C1_floorVsBackdrop: ratio(pts.floor, pts.backdrop),
      C2_wreckVsFloor: ratio(pts.wreck, pts.floor),
      C3_machineVsFloor: ratio(pts.machineTop, pts.floor),
      C4_dockVsFloor: ratio(pts.dockPad, pts.floor),
      C5_amberVsFloor: ratio(pts.amberToken, pts.floor),
    },
  };
};

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const shotsDir = resolve(root, "docs/screenshots");
  mkdirSync(shotsDir, { recursive: true });
  const results = [];
  const open = async (width, height, dpr, envelope) => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: dpr,
      isMobile: dpr === 2,
      hasTouch: dpr === 2,
    });
    if (envelope !== null) {
      await context.addInitScript((text) => localStorage.setItem("rustwake.save.v1", text), envelope);
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Begin recovery");
    await page.click("text=Begin recovery");
    await page.waitForTimeout(250);
    const close = await page.evaluateHandle(() =>
      [...document.querySelectorAll("button")].find((n) => (n.textContent ?? "").trim() === "Back to yard") ?? null
    );
    if (close.asElement()) await close.asElement().click();
    await page.waitForTimeout(150);
    return { context, page };
  };
  try {
    const cases = [
      { name: "phone-rest", width: 390, height: 844, dpr: 2, env: fs1Envelope(false), build: false },
      { name: "phone-build", width: 390, height: 844, dpr: 2, env: fs1Envelope(false), build: true },
      { name: "phone-mature", width: 390, height: 844, dpr: 2, env: JSON.stringify(template), build: false },
      { name: "phone-one-machine", width: 390, height: 844, dpr: 2, env: fs1Envelope(true), build: false },
      { name: "desktop-rest", width: 1440, height: 900, dpr: 1, env: fs1Envelope(false), build: false },
      { name: "desktop-build", width: 1440, height: 900, dpr: 1, env: fs1Envelope(false), build: true },
      { name: "desktop-mature", width: 1440, height: 900, dpr: 1, env: JSON.stringify(template), build: false },
    ];
    for (const c of cases) {
      const { context, page } = await open(c.width, c.height, c.dpr, c.env);
      if (c.build) {
        const btn = await page.evaluateHandle(() =>
          [...document.querySelectorAll(".dock__btn")].find((n) => (n.textContent ?? "").trim() === "Build") ?? null
        );
        if (btn.asElement()) await btn.asElement().click();
        await page.waitForTimeout(150);
      }
      await page.screenshot({ path: resolve(shotsDir, `slice-${c.name}.png`) });
      const pixels = await page.evaluate(worldSample);
      results.push({ case: c.name, viewport: `${c.width}x${c.height}`, dpr: c.dpr, ...pixels });
      await context.close();
    }
    // The grayscale silhouette sheet from the same PARTS table (E8/B1-B2).
    const sheetContext = await browser.newContext({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 2 });
    const sheetPage = await sheetContext.newPage();
    await sheetPage.goto(url, { waitUntil: "networkidle" });
    await sheetPage.evaluate(async () => {
      const mod = await import("/src/game/renderer/scene.ts");
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 840;
      document.body.append(canvas);
      mod.drawSpriteSheet(canvas.getContext("2d"), { width: 900, height: 420 });
    });
    await sheetPage.screenshot({ path: resolve(shotsDir, "slice-sheet-silhouette.png") });
    await sheetContext.close();
  } finally {
    await browser.close();
  }
  const out = resolve(root, "docs/evidence/2026-11-03-style-slice-pixels.json");
  writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  for (const r of results) {
    console.log(
      `${r.case} ${r.viewport} dpr${r.dpr} s=${r.scale} ` +
        `floor[${r.samples.floor}] backdrop[${r.samples.backdrop}] wreck[${r.samples.wreck}] ` +
        `C1=${r.ratios.C1_floorVsBackdrop} C2=${r.ratios.C2_wreckVsFloor} C3=${r.ratios.C3_machineVsFloor} ` +
        `C4=${r.ratios.C4_dockVsFloor} C5=${r.ratios.C5_amberVsFloor}`
    );
  }
  console.log(`wrote ${out.replace(/\\/g, "/")} + docs/screenshots/slice-*.png (${results.length} pixel cases + sheet)`);
};

await run();
