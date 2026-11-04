// Q-002 style-slice capture (spec rev-q2spec-g3, evidence E1-E9).
// Phone 390x844 dpr2 + desktop 1440x900 dpr1, FS-1 fixture through the
// localStorage envelope, states rest/build/mature/one-machine, plus the
// grayscale silhouette sheet. Sample points are the first exact palette-RGB
// matches found by scanning the live canvas (both viewports, no hand-derived
// coordinates); each sample carries its measured block size (runX/runY in
// device px) and total coverage count. Contrast = WCAG ratio vs the floor.
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

/** FS-1: dock + sorter(8) + furnace(14, outputFull) + 2 loaded routes, tick 344. */
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
  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const w = canvas.width;
  const img = ctx.getImageData(0, 0, w, canvas.height).data;
  const rgbOf = (px, py) => {
    const i = (py * w + px) * 4;
    return [img[i], img[i + 1], img[i + 2]];
  };
  /** First pixel (row-major) with the exact RGB + horizontal/vertical runs. */
  const firstOf = (rgb, box) => {
    const parts = rgb.split(",").map(Number);
    const y0 = box ? box[1] : 0;
    const y1 = box ? box[3] : canvas.height;
    const x1 = box ? box[2] : w;
    const same = (px, py) => {
      const p = rgbOf(px, py);
      return p[0] === parts[0] && p[1] === parts[1] && p[2] === parts[2];
    };
    for (let py = y0; py < y1; py += 1) {
      for (let px = box ? box[0] : 0; px < x1; px += 1) {
        if (!same(px, py)) continue;
        let runX = 0;
        while (px + runX < x1 && same(px + runX, py)) runX += 1;
        let runY = 0;
        while (py + runY < y1 && same(px, py + runY)) runY += 1;
        let count = 0;
        for (let qy = 0; qy < canvas.height; qy += 1) {
          for (let qx = 0; qx < w; qx += 1) if (same(qx, qy)) count += 1;
        }
        return { x: px / dpr, y: py / dpr, runX, runY, count };
      }
    }
    return null;
  };
  const at = (rgb) => {
    const p = firstOf(rgb);
    return p ? { rgb, ...p } : { rgb, x: null, y: null, runX: 0, runY: 0, count: 0 };
  };
  const lum = (rgb) =>
    rgb.split(",").map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    return Math.round((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) * 1000) / 1000;
  };
  // floor(34,56,74) / bodyLight(138,169,196) / well(14,23,38) / bodyMid(127,159,187) / steelLight(109,144,171) / amber(255,183,101)
  const backdrop = at("11,18,32"); // nightDeep: sky band above the floor
  const floor = at("34,56,74");
  const wreck = at("109,144,171"); // steelLight: hull only
  const machineBody = at("138,169,196"); // bodyLight: bodies + crate tops
  const dockPad = at("127,159,187"); // bodyMid: pad + crates
  const amberToken = at("255,183,101");
  const machineWell = at("14,23,38"); // well: slots, empty pip sockets
  const s = (o) => o.rgb;
  return {
    dpr,
    samples: {
      backdrop: s(backdrop), floor: s(floor), wreck: s(wreck), machineBody: s(machineBody),
      machineWell: s(machineWell), dockPad: s(dockPad), amberToken: s(amberToken),
    },
    points: { backdrop, floor, wreck, machineBody, machineWell, dockPad, amberToken },
    ratios: {
      C1_floorVsBackdrop: ratio(s(floor), s(backdrop)),
      C2_wreckVsFloor: ratio(s(wreck), s(floor)),
      C3_machineBodyVsFloor: ratio(s(machineBody), s(floor)),
      C4_dockVsFloor: ratio(s(dockPad), s(floor)),
      C5_amberVsFloor: ratio(s(amberToken), s(floor)),
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
    // Grayscale silhouette sheet from the same PARTS table (E8 / B1-B2).
    const sheetContext = await browser.newContext({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 2 });
    const sheetPage = await sheetContext.newPage();
    await sheetPage.goto(url, { waitUntil: "networkidle" });
    await sheetPage.evaluate(async () => {
      const mod = await import("/src/game/renderer/scene.ts");
      const sprites = await import("/src/game/renderer/sprites.ts");
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 840;
      canvas.style.position = "fixed";
      canvas.style.top = "0";
      canvas.style.left = "0";
      document.body.append(canvas);
      const ctx = canvas.getContext("2d");
      // G-2: the CSS box is 900x420 while the backing store is 1800x840, so the sheet
      // has to be drawn under the dpr transform or three quarters of the PNG stays empty.
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.imageSmoothingEnabled = false;
      mod.drawSpriteSheet(ctx, { width: 900, height: 420 });
      const ids = Object.keys(sprites.PARTS);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const night = [11, 18, 32];
      let x0 = canvas.width;
      let y0 = canvas.height;
      let x1 = -1;
      let y1 = -1;
      let ink = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const i = (y * canvas.width + x) * 4;
          const blank =
            Math.abs(data[i] - night[0]) <= 1 && Math.abs(data[i + 1] - night[1]) <= 1 && Math.abs(data[i + 2] - night[2]) <= 1;
          if (!blank) {
            ink += 1;
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      }
      const boxW = x1 - x0 + 1;
      const boxH = y1 - y0 + 1;
      const fraction = +((boxW * boxH) / (canvas.width * canvas.height)).toFixed(4);
      window.__sheet = {
        ihdr: [canvas.width, canvas.height],
        ids: ids.length,
        partsRows: ids.length,
        roles: ids,
        inkBbox: [x0, y0, boxW, boxH],
        inkFractionOfIhdr: fraction,
        inkPx: ink,
      };
    });
    const sheetInfo = await sheetPage.evaluate(() => (window).__sheet);
    console.log(
      `sheet: ids=${sheetInfo.ids} partsRows=${sheetInfo.partsRows} inkBbox=${JSON.stringify(sheetInfo.inkBbox)} ` +
        `inkFraction=${sheetInfo.inkFractionOfIhdr} inkPx=${sheetInfo.inkPx} roles=${sheetInfo.roles.join(",")}`
    );
    await sheetPage.screenshot({ path: resolve(shotsDir, "slice-sheet-silhouette.png") });
    await sheetContext.close();
  } finally {
    await browser.close();
  }
  const out = resolve(root, "docs/evidence/2026-11-03-style-slice-pixels.json");
  writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  for (const r of results) {
    console.log(
      `${r.case} ${r.viewport} dpr${r.dpr} floor[${r.samples.floor}] backdrop[${r.samples.backdrop}] ` +
        `wreck[${r.samples.wreck}] body[${r.samples.machineBody}] well[${r.samples.machineWell}] ` +
        `pad[${r.samples.dockPad}] amber[${r.samples.amberToken}] ` +
        `C1=${r.ratios.C1_floorVsBackdrop} C2=${r.ratios.C2_wreckVsFloor} C3=${r.ratios.C3_machineBodyVsFloor} ` +
        `C4=${r.ratios.C4_dockVsFloor} C5=${r.ratios.C5_amberVsFloor}`
    );
  }
  console.log(`wrote ${out.replace(/\\/g, "/")} + docs/screenshots/slice-*.png (${results.length} pixel cases + sheet)`);
};

await run();
