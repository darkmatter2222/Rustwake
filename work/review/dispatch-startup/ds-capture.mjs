// dispatch-startup QA capture + probe (independent of scripts/capture.mjs).
// Usage:
//   node work/review/dispatch-startup/ds-capture.mjs [url]
// Env: CHROME_PATH optional; default uses the ms-playwright cached Chromium.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("./captures/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

const URL_BASE =
  process.argv[2] ?? "https://home.darkmatter2222.com/rustwake/";
const EXE = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => existsSync(p));

const SAVE_KEY = "rustwake.save.v1";
const seedPath = new URL("../../../docs/evidence/yard-mature.json", import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, "$1");
const seedText = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : null;

const clickFace = (page, label, cls = ".dock .dock__btn") =>
  page.evaluate(
    ([sel, text]) => {
      const node = [...document.querySelectorAll(sel)].find((n) =>
        (n.textContent ?? "").trim().startsWith(text)
      );
      if (!node) return false;
      node.click();
      return true;
    },
    [cls, label]
  );

const closePanel = (page) =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll(".panel button")].find((n) =>
      /^(Close|Back|Back to yard)$/.test((n.textContent ?? "").trim())
    );
    btn?.click();
    return Boolean(btn);
  });

/** Layout + pixel statistics straight from the live document. */
const probe = () => {
  const round = (n) => Math.round(n * 10) / 10;
  const rect = (n) => {
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  };
  const root = document.documentElement;
  const canvas = document.querySelector("canvas");
  const hud = document.querySelector(".hud");
  const card = document.querySelector(".objective");
  const dock = document.querySelector(".dock");
  const faces = [...document.querySelectorAll(".dock .dock__btn")].map((n) => ({
    text: (n.textContent ?? "").replace(/\s+/g, " ").trim(),
    box: rect(n),
  }));
  const out = {
    inner: { w: window.innerWidth, h: window.innerHeight },
    dpr: window.devicePixelRatio,
    pageScroll: {
      w: root.scrollWidth,
      h: root.scrollHeight,
      scrolls: root.scrollWidth > window.innerWidth || root.scrollHeight > window.innerHeight,
    },
    hud: rect(hud),
    card: rect(card),
    cardText: (card?.textContent ?? "").replace(/\s+/g, " ").trim(),
    cardRatioPct:
      card && hud && hud.clientHeight > 0
        ? round((card.getBoundingClientRect().height / hud.clientHeight) * 100)
        : null,
    dock: rect(dock),
    faces,
    minFacePx: faces.length
      ? Math.min(...faces.map((f) => Math.min(f.box.w, f.box.h)))
      : null,
    canvas: rect(canvas),
    panel: rect(document.querySelector(".panel")),
    panelText: (document.querySelector(".panel")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  };
  // Pixel statistics on the painted canvas (integer canvas px).
  if (canvas) {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const counts = new Map();
    let lumHist = new Array(8).fill(0);
    const step = 2;
    let n = 0;
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        const i = (y * c.width + x) * 4;
        const r = img[i], g = img[i + 1], b = img[i + 2];
        const key = `${r},${g},${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        lumHist[Math.min(7, Math.floor(((r * 0.299 + g * 0.587 + b * 0.114) / 255) * 8))] += 1;
        n += 1;
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    out.canvasPixels = {
      w: c.width,
      h: c.height,
      distinctColors: counts.size,
      topColors: top.map(([k, v]) => `${k} ${(v / n) * 100 > 0.1 ? round((v / n) * 100) : ""}%`.trim()),
      luminanceBuckets8: lumHist.map((v) => round((v / n) * 100)),
    };
    // Row-band ink coverage: share of non-dominant-color pixels per 1/8 of height.
    const dominant = top.length ? top[0][0] : null;
    const bands = new Array(8).fill(0).map(() => ({ ink: 0, total: 0 }));
    for (let y = 0; y < c.height; y += step) {
      const band = Math.min(7, Math.floor((y / c.height) * 8));
      for (let x = 0; x < c.width; x += step) {
        const i = (y * c.width + x) * 4;
        const key = `${img[i]},${img[i + 1]},${img[i + 2]}`;
        bands[band].total += 1;
        if (key !== dominant) bands[band].ink += 1;
      }
    }
    out.inkByBandPct = bands.map((b) => (b.total ? round((b.ink / b.total) * 100) : 0));
  }
  return out;
};

const tapPrimary = (page) =>
  page.evaluate(() => {
    const n =
      document.querySelector(".dock__btn--primary") ??
      document.querySelector(".dock .dock__btn");
    n?.click();
  });

const readSave = (page) =>
  page.evaluate(
    ([key]) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const p = JSON.parse(raw).payload.sim;
      return {
        tick: p.tick,
        machines: p.machines.map((m) => `${m.blueprint}:${m.level}:${m.status}:${m.batchesDone}`),
        routes: p.routes.length,
        drones: p.drones?.length ?? null,
        credits: p.credits,
        store: p.store,
        research: Object.keys(p.research ?? {}),
      };
    },
    [SAVE_KEY]
  );

const newTextScale = (page, scale) =>
  page.evaluate(
    (target) => {
      for (let i = 0; i < 6; i += 1) {
        const b = [...document.querySelectorAll("button")].find((n) =>
          (n.getAttribute("aria-label") ?? "").startsWith("Text size")
        );
        const current = Number((b?.getAttribute("aria-label") ?? "").replace(/[^\d.]/g, "")) || 1;
        if (current === target) return current;
        b?.click();
      }
      return Number(
        (
          [...document.querySelectorAll("button")].find((n) =>
            (n.getAttribute("aria-label") ?? "").startsWith("Text size")
          )?.textContent ?? ""
        ).replace(/[^\d.]/g, "")
      );
    },
    scale
  );

const organicRun = async (page, maxTaps = 260) => {
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".gate__btn");
  await page.click(".gate__btn");
  await page.waitForTimeout(250);
  let taps = 0;
  let saved = null;
  for (; taps < maxTaps; taps += 1) {
    await tapPrimary(page);
    await page.waitForTimeout(120);
    saved = await readSave(page);
    // cancel a leftover build preview so the ladder keeps moving
    if (saved && saved.machines.length >= 4) break;
  }
  return { taps, saved };
};

const run = async () => {
  const results = { url: URL_BASE, capturedAt: new Date().toISOString(), cells: [] };
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const shot = async (page, name) => {
    const path = `${OUT}${name}.png`;
    await page.screenshot({ path });
    return path;
  };

  // --- Cell 1: organic run at 390x844 (iPhone-class), text scale 1 ---
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const run1 = await organicRun(page);
    await page.waitForTimeout(700);
    await shot(page, "ds-390-rest");
    const rest = await page.evaluate(probe);

    // motion clip: 6 frames ~130 ms apart on the running yard
    const clip = [];
    for (let i = 1; i <= 6; i += 1) {
      await shot(page, `ds-390-clip-f${String(i).padStart(2, "0")}`);
      clip.push(i);
      await page.waitForTimeout(130);
    }

    // panels: Store, Yard, Research, Build; the machine panel via world taps
    const panels = {};
    for (const label of ["Store", "Yard", "Research", "Build"]) {
      const ok = await clickFace(page, label);
      await page.waitForTimeout(220);
      const p = await page.evaluate(probe);
      panels[label] = { opened: ok, panelText: p.panelText.slice(0, 400), panelBox: p.panel };
      if (ok) await shot(page, `ds-390-panel-${label.toLowerCase()}`);
      await closePanel(page);
      await page.waitForTimeout(150);
    }
    // build mode: the placement/affordance frame (lit cells)
    const buildMode = { opened: await clickFace(page, "Build") };
    await page.waitForTimeout(220);
    const bmp = await page.evaluate(probe);
    buildMode.panelText = bmp.panelText.slice(0, 300);
    buildMode.faces = bmp.faces.map((f) => f.text);
    buildMode.ink = bmp.inkByBandPct;
    await shot(page, "ds-390-buildmode");
    // and after one place: the toast / placed machine
    await page.waitForTimeout(150);

    let machinePanel = null;
    for (let y = 300; y <= 620 && !machinePanel; y += 26) {
      for (let x = 30; x <= 380 && !machinePanel; x += 26) {
        await page.mouse.click(x, y);
        await page.waitForTimeout(40);
        const p = await page.evaluate(probe);
        if (p.panel && /Next step|Level|Output|Intake/i.test(p.panelText)) {
          machinePanel = { at: [x, y], text: p.panelText.slice(0, 400), box: p.panel };
          await shot(page, "ds-390-panel-machine");
        }
      }
    }
    results.cells.push({
      cell: "390x844 ts1 organic",
      taps: run1.taps,
      save: run1.saved,
      errors,
      rest,
      clipFrames: clip.length,
      panels,
      machinePanel,
    });
    await ctx.close();
  }

  // --- Cell 2: 360x640 with text scale 2 (largest chrome pressure) ---
  {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const run2 = await organicRun(page, 200);
    const scale = await newTextScale(page, 2);
    await page.waitForTimeout(600);
    await shot(page, "ds-360-ts2-rest");
    const rest = await page.evaluate(probe);
    const panels = {};
    for (const label of ["Store", "Research"]) {
      const ok = await clickFace(page, label);
      await page.waitForTimeout(220);
      const p = await page.evaluate(probe);
      panels[label] = { opened: ok, panelText: p.panelText.slice(0, 300), panelBox: p.panel };
      if (ok) await shot(page, `ds-360-ts2-panel-${label.toLowerCase()}`);
      await closePanel(page);
      await page.waitForTimeout(150);
    }
    results.cells.push({
      cell: "360x640 ts2 organic",
      taps: run2.taps,
      save: run2.saved,
      textScale: scale,
      errors,
      rest,
      panels,
    });
    await ctx.close();
  }

  // --- Cell 3: seeded mature yard, 390x844 ---
  if (seedText) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    await ctx.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [SAVE_KEY, seedText]
    );
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL_BASE, { waitUntil: "networkidle" });
    await page.waitForSelector(".gate__btn");
    await page.click(".gate__btn");
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".panel button")].find((n) =>
        /^Back to yard$/.test((n.textContent ?? "").trim())
      );
      b?.click();
    });
    await page.waitForTimeout(500);
    await shot(page, "ds-390-seed-mature");
    const p = await page.evaluate(probe);
    // research panel on the mature save
    const ok = await clickFace(page, "Research");
    await page.waitForTimeout(250);
    const rp = await page.evaluate(probe);
    await shot(page, "ds-390-seed-research");
    results.cells.push({
      cell: "390x844 seeded mature",
      errors,
      rest: p,
      research: { opened: ok, panelText: rp.panelText.slice(0, 500), panelBox: rp.panel },
    });
    await ctx.close();
  }

  // --- Cell 4: desktop 1440x900, seeded mature (composition at wide format) ---
  if (seedText) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    await ctx.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [SAVE_KEY, seedText]
    );
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL_BASE, { waitUntil: "networkidle" });
    await page.waitForSelector(".gate__btn");
    await page.click(".gate__btn");
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".panel button")].find((n) =>
        /^Back to yard$/.test((n.textContent ?? "").trim())
      );
      b?.click();
    });
    await page.waitForTimeout(500);
    await shot(page, "ds-1440-seed-mature");
    const p = await page.evaluate(probe);
    results.cells.push({ cell: "1440x900 seeded mature", errors, rest: p });
    await ctx.close();
  }

  await browser.close();
  const file = `${OUT}ds-measure.json`;
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
};

await run();
