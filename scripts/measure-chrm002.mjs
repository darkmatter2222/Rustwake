// CHRM-002 g1: the chrome-cap measurement, in both depths, with the legibility guard.
//
// Eight cells = two depths × four viewport/text-scale combinations
// (360 × 640 and 390 × 844, each at text scale 1.0 and 2.0; deviceScaleFactor 2,
// isMobile + hasTouch, one fresh context per cell):
//
//   depth "2-machine"   - pass A, the seeded 2-machine frame with the fork row open
//                         (the same engine frame the recorded 16.7 / 42.9 / 10.6 / 32.5 %
//                         was read from, `scripts/measure-strat003.mjs` pass A);
//   depth "4-machine"   - pass C, the seeded 4-machine frame with the fork row open
//                         (the deterministic twin of the organic 4-machine frame whose
//                         360 × 640 ts 2.0 cell is recorded at 46.9 %), and pass B, the
//                         recorded organic control method (tap-driven), printed as the
//                         cross-check against that recorded number.
//
// Printed per cell: `hudContentBox.height` (`.hud` clientHeight), the `.objective` card
// height and its ratio against that box (CH-1 cap 42 %), the `.objective` bottom →
// `.dock` top gap (floor 8 px), the smallest face (floor 44 px), `documentElement.scroll*`
// against the visual viewport, page errors, and the legibility guard for every
// `.status-line`: computed `font-size` and `line-height` in px, the number of wrapped
// line boxes (`Range.getClientRects()`), per-row `scrollWidth` vs `clientWidth`, and the
// intersection of each card box with the dock rect.
//
// Run:  npm run build
//       npx vite preview --port 8461            (background)
//       npx tsx scripts/measure-chrm002.mjs
//       CHRM002_PASS=AC  -> restrict to the seeded passes
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { BLUEPRINTS, TUNING } from "../src/game/content/defs";
import { applyCommand, branchPrice, DOCK_TILE, YARD_TILES, upgradeCost } from "../src/game/simulation/commands";
import { planConnections } from "../src/game/simulation/autoconnect";
import { advance } from "../src/game/simulation/engine";
import { nextYardStep } from "../src/game/simulation/plan";
import { createInitialState } from "../src/game/simulation/types";
import { encodeSave } from "../src/game/persistence/save";
import { branchOptions } from "../src/ui/text";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const SAVE_KEY = "rustwake.save.v1";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((path) => existsSync(path));

const CELLS = [
  { label: "360x640 ts1", width: 360, height: 640, textScale: 1 },
  { label: "360x640 ts2", width: 360, height: 640, textScale: 2 },
  { label: "390x844 ts1", width: 390, height: 844, textScale: 1 },
  { label: "390x844 ts2", width: 390, height: 844, textScale: 2 },
];

/** The four blueprints the seeded 4-machine frame carries, in plan reveal order. */
const FOUR = ["sorter", "furnace", "copperSeparator", "polymerRecycler"];

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/**
 * The jsdom boot cadence through the real engine, `depth` machines deep. The first two
 * machines are built with the *recorded* funding pattern of `scripts/measure-strat003.mjs`
 * (`fund(60, 20)` before each build), so the 2-machine frame reproduces the recorded
 * 16.7 / 42.9 / 10.6 / 32.5 % digit for digit; the 4-machine frame continues that pattern.
 */
function yardFrame(depth) {
  const state = createInitialState();
  let seq = 0;
  const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
  const connect = (machineId) => {
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
  };
  const fund = (scrap, ferrous, nonferrous) => {
    state.store = { ...state.store, scrap, ferrous };
    if (nonferrous !== undefined) state.store.nonferrous = nonferrous;
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
  };
  const order = FOUR.slice(0, depth);
  state.tutorial = 9;
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  order.forEach((blueprint, index) => {
    const need = {};
    for (const item of BLUEPRINTS[blueprint].buildCost) need[item.resource] = item.qty;
    // The first two builds use the recorded `fund(60, 20)`; the deeper two add the
    // nonferrous its own build cost names, so every build is accepted on the first try.
    fund(60, 20, index >= 2 ? need.nonferrous ?? 0 : undefined);
    send({ type: "machine.build", blueprint, tile: firstFreeTile(state) });
    connect(state.machines[state.machines.length - 1].id);
    advance(state, 300);
  });
  // The fork frame: the plain ladder's price fits, the premium does not.
  state.credits = 34;
  state.store = { scrap: 9 };
  state.storeUnits = 9;
  advance(state, 1);
  return state;
}

/**
 * In-page reading of one cell. Every number is the browser's own layout, none estimated.
 */
const readCell = () => {
  const round = (n) => Math.round(n * 10) / 10;
  const box = (r) => ({ w: round(r.width), h: round(r.height), top: round(r.top), bottom: round(r.bottom), left: round(r.left), right: round(r.right) });
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const root = document.documentElement;
  const hud = document.querySelector(".hud");
  const card = document.querySelector(".objective");
  const dock = document.querySelector(".dock");
  const dockRect = dock ? dock.getBoundingClientRect() : null;
  const faces = [...document.querySelectorAll(".dock .dock__btn")];
  const icon = document.querySelector("link[rel='icon']");
  // Wrapped line boxes of one inline element: one client rect per line box it occupies,
  // plus the union of those rects.
  const lineBoxes = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    const ink = rects.reduce(
      (acc, r) => ({
        top: Math.min(acc.top, r.top),
        bottom: Math.max(acc.bottom, r.bottom),
        left: Math.min(acc.left, r.left),
        right: Math.max(acc.right, r.right),
      }),
      { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity }
    );
    return { count: rects.length, ink: rects.length ? box(ink) : null };
  };
  /**
   * The *visible* glyph extent of this element's text, straight from the text metrics
   * engine: `actualBoundingBoxAscent/Descent` are the ink box, not the font's content
   * area, so `lineHeight - (ascent + descent)` is the real white between two wrapped
   * lines of the same element. Zero or less would mean colliding rows.
   */
  const glyphBox = (node, style) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = ctx.measureText(text(node) || "Drones 1 · Power 8 · 100 %");
    if (!("actualBoundingBoxAscent" in metrics)) return null;
    return {
      ascentPx: round(metrics.actualBoundingBoxAscent),
      descentPx: round(metrics.actualBoundingBoxDescent),
    };
  };
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? round(w * h) : 0;
  };
  const readLine = (node, role) => {
    const style = getComputedStyle(node);
    const b = box(node.getBoundingClientRect());
    const lines = lineBoxes(node);
    return {
      role,
      text: text(node),
      box: b,
      fontSizePx: round(parseFloat(style.fontSize)),
      lineHeightPx:
        style.lineHeight === "normal"
          ? "normal"
          : round(parseFloat(style.lineHeight)),
      lineBoxes: lines,
      glyph: glyphBox(node, style),
      whiteBetweenRowsPx:
        style.lineHeight !== "normal" && glyphBox(node, style)
          ? round(parseFloat(style.lineHeight) - (glyphBox(node, style).ascentPx + glyphBox(node, style).descentPx))
          : null,
      inkDockGapPx:
        lines.ink && dockRect ? round(box(dockRect).top - lines.ink.bottom) : null,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      clippedX: node.scrollWidth - node.clientWidth,
      clippedY: node.scrollHeight - node.clientHeight,
      overlapDockPx2: dockRect ? overlap(b, box(dockRect)) : 0,
    };
  };
  const cardRows = card ? [...card.children].map((node, i) => readLine(node, `row${i}:${node.className || node.tagName.toLowerCase()}`)) : [];
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    dpr: window.devicePixelRatio,
    fontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textLarge: root.classList.contains("text-large"),
    hudContentBoxHeight: hud ? hud.clientHeight : null,
    scroll: { width: root.scrollWidth, height: root.scrollHeight },
    cardText: text(card),
    cardBox: card ? box(card.getBoundingClientRect()) : null,
    dockBox: dock ? box(dockRect) : null,
    dockRows: [...new Set(faces.map((node) => Math.round(node.getBoundingClientRect().y)))].length,
    faces: faces.map((node) => {
      const b = box(node.getBoundingClientRect());
      const style = getComputedStyle(node);
      return {
        text: text(node),
        cost: text(node.querySelector(".dock__cost")),
        box: b,
        fontSizePx: round(parseFloat(style.fontSize)),
        clipped:
          b.top < -0.5 || b.left < -0.5 || b.bottom > window.innerHeight + 0.5 || b.right > window.innerWidth + 0.5,
      };
    }),
    cardRows,
    statusLines: [...document.querySelectorAll(".status-line")].map((node, i) => readLine(node, `status${i}`)),
    iconLink: icon ? icon.getAttribute("href") : null,
    panelOpen: !!document.querySelector(".panel"),
  };
};

/** One seeded frame per cell: the engine writes the save, the app boots into it. */
async function seededPass(browser, depth) {
  const rows = [];
  for (const cell of CELLS) {
    const state = yardFrame(depth); // fresh engine per cell: identical numbers, no shared cursor
    const save = encodeSave(state, 10, { textScale: cell.textScale, muted: true });
    const context = await browser.newContext({
      viewport: { width: cell.width, height: cell.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const pageErrors = [];
    const faviconRequests = [];
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, save]);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("response", (response) => {
      if (/favicon\.ico(\?|$)/.test(response.url())) faviconRequests.push(response.status());
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const begin = [...document.querySelectorAll("button")].find(
        (node) => (node.textContent ?? "").trim() === "Begin recovery"
      );
      begin?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector(".panel .icon-btn")?.click());
    await page.waitForTimeout(150);
    if (process.env.CHRM002_SHOTS) {
      // Visual inspection of the affected screen itself, one PNG per cell.
      await page.screenshot({ path: `${process.env.CHRM002_SHOTS}/chrm002-${depth}m-${cell.label}.png` });
    }
    rows.push({
      pass: `seeded ${depth}-machine frame (deterministic)`,
      cell,
      measured: await page.evaluate(readCell),
      pageErrors: [...pageErrors],
      faviconRequests: [...faviconRequests],
      taps: null,
      saved: { tick: state.tick, machines: state.machines.length, credits: state.credits, textScale: cell.textScale },
    });
    await context.close();
  }
  return rows;
}

/** The recorded organic control (`qa-p2-fork.mjs`): taps to the fork frame, at 4 machines. */
async function organicPass(browser) {
  const rows = [];
  for (const cell of CELLS) {
    const context = await browser.newContext({
      viewport: { width: cell.width, height: cell.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const pageErrors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector(".gate__btn");
    await page.click(".gate__btn");
    const tap = async (index) => {
      await page.evaluate((idx) => {
        const all = [...document.querySelectorAll(".dock .dock__btn")];
        const node = idx === 0 ? (document.querySelector(".dock__btn--primary") ?? all[0]) : all[idx];
        node?.click();
      }, index ?? 0);
      await page.waitForTimeout(250);
    };
    const readSave = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("rustwake.save.v1");
        if (!raw) return null;
        const envelope = JSON.parse(raw);
        return {
          machines: envelope.payload.sim.machines.length,
          tick: envelope.payload.sim.tick,
          textScale: envelope.payload.settings?.textScale ?? 1,
          credits: envelope.payload.sim.credits,
        };
      });
    let taps = 0;
    let saved = null;
    while (taps < 600) {
      await tap(0);
      taps += 1;
      saved = await readSave();
      if (saved && saved.machines >= 2) break; // the recorded control stops at 2, then scans
    }
    for (let i = 0; i < 6 && (await readSave())?.textScale !== cell.textScale; i += 1) {
      await page.evaluate(() => {
        const node = [...document.querySelectorAll("button")].find((b) =>
          (b.getAttribute("aria-label") ?? "").startsWith("Text size")
        );
        node?.click();
      });
      await page.waitForTimeout(120);
    }
    let measured = null;
    let forkFrameAt = 0;
    for (let scan = 1; scan <= 240 && measured === null; scan += 1) {
      const candidate = await page.evaluate(readCell);
      const isFork =
        candidate.faces.some((face) => face.text.startsWith("Faster batches")) &&
        candidate.faces.some((face) => face.text.startsWith("Less power")) &&
        candidate.faces.every((face) => /\d+ credits$/.test(face.text));
      if (isFork) {
        measured = candidate;
        forkFrameAt = scan;
        break;
      }
      await tap(0);
      taps += 1;
    }
    rows.push({
      pass: "organic control (recorded tap method)",
      cell,
      measured,
      pageErrors: [...pageErrors],
      faviconRequests: [],
      taps,
      forkFrameAt,
      saved: await readSave(),
    });
    await context.close();
  }
  return rows;
}

function report(rows) {
  for (const row of rows) {
    const m = row.measured;
    if (!m) {
      console.log(`\n${row.cell.label}: no fork frame found (taps ${row.taps})`);
      continue;
    }
    const base = m.hudContentBoxHeight ?? m.inner.height;
    const ratio = m.cardBox && base > 0 ? Math.round((m.cardBox.h / base) * 1000) / 10 : null;
    const gap = m.dockBox && m.cardBox ? Math.round((m.dockBox.top - m.cardBox.bottom) * 10) / 10 : null;
    const minFace = m.faces.reduce((a, f) => Math.min(a, Math.min(f.box.w, f.box.h)), 999);
    console.log(
      `\n${row.cell.label} [${row.pass}]: inner ${m.inner.width}×${m.inner.height} dpr ${m.dpr}` +
        ` font ${m.fontPx}px text-large ${m.textLarge}` +
        `${row.taps !== null && row.taps !== undefined ? ` taps ${row.taps} forkFrame ${row.forkFrameAt}` : ""}` +
        `${row.saved ? ` save ${JSON.stringify(row.saved)}` : ""}`
    );
    console.log(
      `  hudContentBox.height ${m.hudContentBoxHeight}; card ${m.cardBox?.h}px` +
        ` => card/hudContentBox ${ratio} % (cap 42 %)`
    );
    console.log(`  .objective bottom ${m.cardBox?.bottom} -> .dock top ${m.dockBox?.top} = gap ${gap} px (floor 8 px)`);
    console.log(
      `  scroll ${m.scroll.width}×${m.scroll.height} vs viewport ${m.inner.width}×${m.inner.height}` +
        ` => ${m.scroll.width <= m.inner.width && m.scroll.height <= m.inner.height ? "no page scroll (scrollHeight == innerHeight)" : "PAGES SCROLL"}`
    );
    console.log(`  dock rows ${m.dockRows}, faces ${m.faces.length}, smallest face ${Math.round(minFace * 10) / 10}px (floor 44 px)`);
    for (const face of m.faces)
      console.log(
        `    [${face.box.w}×${face.box.h} y${face.box.top} font ${face.fontSizePx}px]` +
          ` ${face.clipped ? "CLIPPED " : ""}"${face.text}" cost="${face.cost}"`
      );
    console.log(`  card: "${m.cardText}"`);
    for (const line of [...m.cardRows])
      console.log(
        `    ${line.role} h${line.box.h}px font ${line.fontSizePx}px/line ${line.lineHeightPx}px` +
          ` wrappedBoxes ${line.lineBoxes.count}` +
          ` glyph a${line.glyph ? line.glyph.ascentPx : "-"}/d${line.glyph ? line.glyph.descentPx : "-"}` +
          ` white ${line.whiteBetweenRowsPx} px` +
          ` ink[${line.lineBoxes.ink ? `${line.lineBoxes.ink.top}..${line.lineBoxes.ink.bottom}×${line.lineBoxes.ink.right}` : "-"}]` +
          ` ink→dock ${line.inkDockGapPx} px` +
          ` sw${line.scrollWidth}/cw${line.clientWidth}` +
          ` sh${line.scrollHeight}/ch${line.clientHeight} overlapDock ${line.overlapDockPx2}px²` +
          ` ox${line.clippedX} oy${line.clippedY} "${line.text}"`
      );
    console.log(
      `  icon link ${m.iconLink ? "inline" : "none"}; panelOpen ${m.panelOpen};` +
        ` pageerrors ${row.pageErrors.length}${row.pageErrors.length ? `: ${row.pageErrors.join(" | ")}` : ""}` +
        `; /favicon.ico requests ${row.faviconRequests.length}`
    );
  }
  const fails = [];
  for (const row of rows) {
    const m = row.measured;
    if (!m) {
      fails.push(`${row.cell.label} no fork frame`);
      continue;
    }
    const base = m.hudContentBoxHeight ?? m.inner.height;
    const ratio = m.cardBox && base > 0 ? (m.cardBox.h / base) * 100 : 100;
    if (ratio > 42) fails.push(`${row.cell.label} card ${Math.round(ratio * 10) / 10} % > 42 %`);
    const gap = m.dockBox && m.cardBox ? m.dockBox.top - m.cardBox.bottom : -1;
    if (gap < 8) fails.push(`${row.cell.label} objective-to-dock gap ${Math.round(gap * 10) / 10} px < 8 px`);
    if (m.scroll.width > m.inner.width || m.scroll.height > m.inner.height) fails.push(`${row.cell.label} page scrolls`);
    const minFace = m.faces.reduce((a, f) => Math.min(a, f.box.w, f.box.h), 999);
    if (minFace < 44) fails.push(`${row.cell.label} smallest face ${Math.round(minFace * 10) / 10} px < 44 px`);
    if (m.faces.some((f) => f.clipped)) fails.push(`${row.cell.label} a face is clipped`);
    if (m.cardRows.some((r) => r.clippedX > 0)) fails.push(`${row.cell.label} a card row clips horizontally`);
    if (m.cardRows.some((r) => r.overlapDockPx2 > 0)) fails.push(`${row.cell.label} a card row overlaps the dock`);
    // Legibility guard. (a) the painted line boxes stay inside the card box; (b) every
    // painted line box clears the dock by the 8 px floor; (c) the *glyph* ink of a wrapped
    // line keeps at least 0.5 px of white between the descender above and the ascent below
    // (`lineHeight − (ascent + descent)`, from the text-metrics engine); (d) consecutive
    // element boxes in the card keep a non-negative separation.
    if (m.cardBox) {
      for (const r of m.cardRows) {
        const ink = r.lineBoxes.ink;
        if (!ink) continue;
        if (ink.bottom > m.cardBox.bottom + 0.5 || ink.right > m.cardBox.right + 0.5)
          fails.push(`${row.cell.label} ${r.role} ink passes its card box`);
        if (m.dockBox && m.dockBox.top - ink.bottom < 8)
          fails.push(
            `${row.cell.label} ${r.role} ink is ${Math.round((m.dockBox.top - ink.bottom) * 10) / 10} px above the dock (< 8 px)`
          );
        if (r.lineBoxes.count > 1 && r.whiteBetweenRowsPx !== null && r.whiteBetweenRowsPx < 0.5)
          fails.push(`${row.cell.label} ${r.role} wrapped rows have ${r.whiteBetweenRowsPx} px of white (< 0.5 px)`);
      }
      const painted = m.cardRows.filter((r) => r.lineBoxes.ink);
      for (let i = 1; i < painted.length; i += 1) {
        const sep = painted[i].box.top - painted[i - 1].box.bottom;
        if (sep < -0.5) fails.push(`${row.cell.label} ${painted[i].role} box overlaps the row above by ${Math.round((-sep) * 10) / 10} px`);
      }
    }
    if (m.statusLines.some((r) => r.lineHeightPx !== "normal" && r.fontSizePx > 0 && r.lineHeightPx < r.fontSizePx))
      fails.push(`${row.cell.label} a status line has leading below its font size`);
    if (row.pageErrors.length) fails.push(`${row.cell.label} ${row.pageErrors.length} pageerror(s)`);
  }
  console.log(`\nCHRM-002 cell gates: ${fails.length === 0 ? "ALL PASS" : fails.join("; ")}`);
}

const run = async () => {
  const only = process.env.CHRM002_PASS ?? "ABC";
  for (const depth of [2, 4]) {
    const frame = yardFrame(depth);
    const machine = frame.machines[0];
    console.log(
      `\nframe depth=${depth}: machines=${frame.machines.length}` +
        ` [${frame.machines.map((m) => `${m.blueprint}#${m.id}:${m.level}@${m.tile}`).join(", ")}]` +
        ` links=${frame.routes.length} tick=${frame.tick} credits=${frame.credits}` +
        ` store=${JSON.stringify(frame.store)}` +
        ` plain=${upgradeCost(BLUEPRINTS[machine.blueprint].baseUpgradeCost, machine.level)}` +
        ` prices=${JSON.stringify(Object.fromEntries(branchOptions(frame, machine.id).map((o) => [o.id, o.cost])))}` +
        ` step=${JSON.stringify(nextYardStep(frame).kind)}`
    );
  }
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    if (only.includes("A")) report(await seededPass(browser, 2));
    if (only.includes("B")) report(await organicPass(browser));
    if (only.includes("C")) report(await seededPass(browser, 4));
  } finally {
    await browser.close();
  }
};

await run();
