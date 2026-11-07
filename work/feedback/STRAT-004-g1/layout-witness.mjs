// STRAT-004 g1: the layout witnesses on the seeded yard frame, base vs candidate.
// The third line inside the primary face must not cost a dock row, a tap-target floor,
// a page scroll or the 42 % card cap. Four recorded cells plus the fork row at the largest
// text scale, from the same deterministic engine save in both artifacts.
//
// Usage: npx tsx work/feedback/STRAT-004-g1/layout-witness.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../../src/game/simulation/commands";
import { planConnections } from "../../../src/game/simulation/autoconnect";
import { advance } from "../../../src/game/simulation/engine";
import { createInitialState } from "../../../src/game/simulation/types";
import { encodeSave } from "../../../src/game/persistence/save";

const BUDGET = { cardCapPct: 42, faceFloorPx: 44 };
const HERE = "work/feedback/STRAT-004-g1";
const SAVE_KEY = "rustwake.save.v1";
const DIST_BASE = process.env.BASE_DIST ?? "C:/Users/ryans/source/repos/Rustwake/dist";
const DIST_CAND = process.env.CAND_DIST ?? `${process.cwd()}/dist`;
const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean).find((p) => existsSync(p));

const CELLS = [
  { label: "360x640 ts1", width: 360, height: 640, textScale: 1 },
  { label: "360x640 ts2", width: 360, height: 640, textScale: 2 },
  { label: "390x844 ts1", width: 390, height: 844, textScale: 1 },
  { label: "390x844 ts2", width: 390, height: 844, textScale: 2 },
  { label: "390x844 ts2 fork", width: 390, height: 844, textScale: 2, fork: true },
  // The three-line face: one rung short, so the pending line is painted at every scale.
  { label: "360x640 ts2 short", width: 360, height: 640, textScale: 2, short: true },
  { label: "390x844 ts2 short", width: 390, height: 844, textScale: 2, short: true },
  { label: "390x844 ts1 short", width: 390, height: 844, textScale: 1, short: true },
];

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The recorded yard frame: two machines, links settled; `fork: true` prices the fork row. */
function yardFrame(fork = false, short = false) {
  const state = createInitialState();
  let seq = 0;
  const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
  const connect = (machineId) => {
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
  };
  state.tutorial = 9;
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, 26);
  }
  state.store = { ...state.store, scrap: 24 };
  send({ type: "drone.repair" });
  advance(state, 262);
  state.store = { ...state.store, scrap: 60, ferrous: 20 };
  state.storeUnits = 80;
  send({ type: "machine.build", blueprint: "sorter", tile: firstFreeTile(state) });
  connect(state.machines[0].id);
  advance(state, 300);
  send({ type: "machine.build", blueprint: "furnace", tile: firstFreeTile(state) });
  connect(state.machines[state.machines.length - 1].id);
  advance(state, 300);
  state.credits = fork ? 34 : 12;
  if (short) {
    // One rung short, so the pressed face carries its own pending line.
    state.store = { ...state.store, scrap: 6, ferrous: 1 };
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
  }
  advance(state, 1);
  return state;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function serve(dist, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const file = join(dist, rel === "/" ? "index.html" : rel.replace(/^\/+/, ""));
      if (!existsSync(file)) return void res.writeHead(404).end("not found");
      res
        .writeHead(200, { "content-type": TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream" })
        .end(readFileSync(file));
    });
    server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${port}/` }));
  });
}

const READ = () => {
  const box = (n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top * 10) / 10 };
  };
  const text = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
  const root = document.documentElement;
  const faces = [...document.querySelectorAll(".dock .dock__btn")];
  const card = document.querySelector(".objective");
  const dock = document.querySelector(".dock");
  const hud = document.querySelector(".hud");
  const canvas = document.querySelector("canvas");
  return {
    inner: { w: window.innerWidth, h: window.innerHeight },
    scroll: { w: root.scrollWidth, h: root.scrollHeight },
    dpr: window.devicePixelRatio,
    textScale: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    cardBox: card ? box(card) : null,
    dockBox: dock ? box(dock) : null,
    canvasBox: canvas ? box(canvas) : null,
    hudClientH: hud ? hud.clientHeight : null,
    dockRows: [...new Set(faces.map((n) => Math.round(n.getBoundingClientRect().y)))].length,
    faces: faces.map((n) => {
      const b = box(n);
      return {
        text: text(n),
        lines: [...n.querySelectorAll(".dock__cost")].map((c) => text(c)),
        w: b.w,
        h: b.h,
        clipped:
          b.top < -0.5 ||
          b.w < 0 ||
          n.getBoundingClientRect().bottom > window.innerHeight + 0.5 ||
          n.getBoundingClientRect().right > window.innerWidth + 0.5,
      };
    }),
  };
};

const run = async () => {
  mkdirSync(`${HERE}/stills`, { recursive: true });
  const base = await serve(DIST_BASE, 4393);
  const cand = await serve(DIST_CAND, 4394);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const rows = [];
  try {
    for (const [artifact, url] of [
      ["base", base.url],
      ["candidate", cand.url],
    ]) {
      for (const cell of CELLS) {
        const state = yardFrame(!!cell.fork, !!cell.short);
        const save = encodeSave(state, 10, { textScale: cell.textScale, muted: true });
        const context = await browser.newContext({
          viewport: { width: cell.width, height: cell.height },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });
        await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, save]);
        const pageErrors = [];
        const page = await context.newPage();
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        await page.goto(url, { waitUntil: "load" });
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          const begin = [...document.querySelectorAll("button")].find(
            (n) => (n.textContent ?? "").trim() === "Begin recovery"
          );
          begin?.click();
        });
        await page.waitForTimeout(250);
        await page.evaluate(() => document.querySelector(".panel .icon-btn")?.click());
        await page.waitForTimeout(150);
        const m = await page.evaluate(READ);
        const fill = m.cardBox && m.hudClientH ? +((100 * m.cardBox.h) / m.hudClientH).toFixed(1) : null;
        rows.push({
          artifact,
          cell: cell.label,
          textScale: m.textScale,
          inner: m.inner,
          scroll: m.scroll,
          noScroll: m.scroll.h <= m.inner.h && m.scroll.w <= m.inner.w,
          dockH: m.dockBox ? m.dockBox.h : null,
          dockTop: m.dockBox ? m.dockBox.top : null,
          canvasH: m.canvasBox ? m.canvasBox.h : null,
          hudClientH: m.hudClientH,
          dockRows: m.dockRows,
          smallestFace: m.faces.reduce((a, f) => Math.min(a, Math.min(f.w, f.h)), 999),
          anyClipped: m.faces.some((f) => f.clipped),
          cardFillPct: fill,
          primaryFace: m.faces.find((f) => f.text.length > 0),
          facesText: m.faces.map((f) => f.text),
          primaryLines: m.faces.find((f) => f.lines.length > 0)?.lines ?? [],
          pageErrors: pageErrors.length,
        });
        await page.screenshot({ path: `${HERE}/stills/layout-${artifact}-${cell.label.replace(/\s/g, "")}.png` });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    base.server.close();
    cand.server.close();
  }
  writeFileSync(`${HERE}/layout-witness.json`, JSON.stringify({ budget: BUDGET, rows }, null, 1), "utf8");
  for (const r of rows) {
    const fails = [];
    if (r.cardFillPct !== null && r.cardFillPct > BUDGET.cardCapPct) fails.push(`card ${r.cardFillPct} % > ${BUDGET.cardCapPct} %`);
    if (r.smallestFace < BUDGET.faceFloorPx) fails.push(`face ${r.smallestFace} px < ${BUDGET.faceFloorPx} px`);
    if (!r.noScroll) fails.push("page scrolls");
    if (r.anyClipped) fails.push("a face is clipped");
    if (r.pageErrors) fails.push(`${r.pageErrors} pageerror(s)`);
    console.log(
      `${r.artifact} ${r.cell}: --text-scale ${r.textScale} card ${r.cardFillPct} % ` +
        `(cap ${BUDGET.cardCapPct}) smallestFace ${r.smallestFace}px dockRows ${r.dockRows} ` +
        `scroll ${r.scroll.w}x${r.scroll.h} vs ${r.inner.w}x${r.inner.h} => ${r.noScroll ? "no scroll" : "PAGES"} ` +
        `errors ${r.pageErrors} ${fails.length ? "FAIL " + fails.join("; ") : "pass"}`
    );
    console.log(`   face lines ${JSON.stringify(r.primaryLines)} row ${JSON.stringify(r.facesText)}`);
  }
  console.log(`\nwrote ${HERE}/layout-witness.json`);
};

await run();
