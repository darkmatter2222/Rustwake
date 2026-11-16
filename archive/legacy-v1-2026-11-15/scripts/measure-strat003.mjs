// STRAT-003 g1: the priced fork measured on the shipped artifact in Chromium.
// Four cells (360 × 640 and 390 × 844, each at text scale 1.0 and 2.0, device pixel
// ratio 2, isMobile + hasTouch), one frame per combination, at 2-machine depth with the
// fork open. Printed per cell: every dock row label with its own price, the box of each
// fork face (the 44 px floor), the objective card against `hudContentBox.height` (the
// 42 % cap, CH-1), the `.objective` bottom → `.dock` top gap, document scroll height
// against the visual viewport, page errors, and the favicon request count (DEF-002).
//
// The frame is a save the engine itself wrote: the same boot cadence as the jsdom cases
// (work/feedback/strat002-harness.mjs), two machines, links settled, then the purse set
// to 34 credits so the dearer face (40) is one step out of reach and the cheaper face
// (30) is not. The seed is written into `rustwake.save.v1` before the app boots.
//
// Run: npm run build && npm run preview (background, port 4173)
//      npx tsx scripts/measure-strat003.mjs
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { BLUEPRINTS, TUNING } from "../src/game/content/defs";
import { applyCommand, branchPrice, DOCK_TILE, YARD_TILES, upgradeCost } from "../src/game/simulation/commands";
import { planConnections } from "../src/game/simulation/autoconnect";
import { advance } from "../src/game/simulation/engine";
import { nextYardStep } from "../src/game/simulation/plan";
import { createInitialState } from "../src/game/simulation/types";
import { encodeSave, decodeSave } from "../src/game/persistence/save";
import { branchOptions } from "../src/ui/text";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const SAVE_KEY = "rustwake.save.v1";
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));

/** The four combinations CH-1 names, in ticket order. */
const CELLS = [
  { label: "360x640 ts1", width: 360, height: 640, textScale: 1 },
  { label: "360x640 ts2", width: 360, height: 640, textScale: 2 },
  { label: "390x844 ts1", width: 390, height: 844, textScale: 1 },
  { label: "390x844 ts2", width: 390, height: 844, textScale: 2 },
];

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The jsdom boot cadence, run through the real engine, ending two machines deep. */
function forkFrame() {
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
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  // Fund the yard the way the jsdom cases do, so both machines and their links are the
  // same two machines in every cell; the fork frame below then fixes the purse.
  const fund = (scrap, ferrous) => {
    state.store = { ...state.store, scrap, ferrous };
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
  };
  fund(60, 20);
  send({ type: "machine.build", blueprint: "sorter", tile: firstFreeTile(state) });
  connect(state.machines[0].id);
  advance(state, 300);
  fund(60, 20);
  send({ type: "machine.build", blueprint: "furnace", tile: firstFreeTile(state) });
  connect(state.machines[state.machines.length - 1].id);
  advance(state, 300);
  // The purse of the fork frame: the plain ladder's price fits, the premium does not.
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
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return {
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      top: Math.round(r.top * 10) / 10,
      bottom: Math.round(r.bottom * 10) / 10,
      left: Math.round(r.left * 10) / 10,
      right: Math.round(r.right * 10) / 10,
    };
  };
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const root = document.documentElement;
  const hud = document.querySelector(".hud");
  const card = document.querySelector(".objective");
  const dock = document.querySelector(".dock");
  const faces = [...document.querySelectorAll(".dock .dock__btn")];
  const icon = document.querySelector("link[rel='icon']");
  const lines = [...document.querySelectorAll(".status-line")];
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    dpr: window.devicePixelRatio,
    fontPx: Math.round(parseFloat(getComputedStyle(document.body).fontSize) * 10) / 10,
    textScale: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    hudContentBoxHeight: hud ? hud.clientHeight : null,
    scroll: { width: root.scrollWidth, height: root.scrollHeight },
    cardText: text(card),
    cardBox: card ? box(card) : null,
    dockBox: dock ? box(dock) : null,
    dockRows: [...new Set(faces.map((node) => Math.round(node.getBoundingClientRect().y)))].length,
    faces: faces.map((node) => {
      const b = box(node);
      const style = getComputedStyle(node);
      return {
        text: text(node),
        cost: text(node.querySelector(".dock__cost")),
        box: b,
        minHeight: style.minHeight,
        minWidth: style.minWidth,
        fontSize: style.fontSize,
        clipped:
          b.top < -0.5 || b.left < -0.5 || b.bottom > window.innerHeight + 0.5 || b.right > window.innerWidth + 0.5,
      };
    }),
    // Every text box of the card, so a wrap is attributable to a line, not the card.
    statusLines: lines.map((node) => ({ text: text(node), box: box(node), overflowX: node.scrollWidth - node.clientWidth, overflowY: node.scrollHeight - node.clientHeight })),
    restingLine: text(document.querySelector(".hud__rest") ?? document.querySelector(".objective")),
    iconLink: icon ? icon.getAttribute("href") : null,
    iconLinkLength: icon ? (icon.getAttribute("href") ?? "").length : 0,
    panelOpen: !!document.querySelector(".panel"),
  };
};

/**
 * Pass B - the recorded control method (`qa-p2-fork.mjs`, PLAY-002 g1): a fresh store,
 * the gate button, `Text size` taps to the target scale, then primary taps until the
 * yard is two machines deep, then the first frame whose dock carries the fork. Same
 * 250 ms cadence, so the card ratio is directly comparable to the recorded
 * 16.4 / 41.3 / 12.4 / 31.4 %.
 */
async function passB(browser, tag) {
  const rows = [];
  for (const cell of CELLS) {
    const context = await browser.newContext({
      viewport: { width: cell.width, height: cell.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const pageErrors = [];
    const faviconRequests = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("response", (response) => {
      if (/favicon\.ico(\?|$)/.test(response.url())) faviconRequests.push(response.status());
    });
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
          levels: envelope.payload.sim.machines.map((m) => m.level),
        };
      });
    let taps = 0;
    let saved = null;
    while (taps < 600) {
      await tap(0);
      taps += 1;
      saved = await readSave();
      if (saved && saved.machines >= 2) break;
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
      cell,
      measured,
      pageErrors: [...pageErrors],
      faviconRequests: [...faviconRequests],
      taps,
      forkFrameAt,
      saved: await readSave(),
    });
    await context.close();
  }
  report(rows, tag);
}

const run = async () => {
  const frame = forkFrame();
  const machine = frame.machines[0];
  const base = BLUEPRINTS[machine.blueprint].baseUpgradeCost;
  console.log(
    `frame: machines=${frame.machines.length}` +
      ` [${frame.machines.map((m) => `${m.blueprint}#${m.id}:${m.level}@${m.tile}`).join(", ")}]` +
      ` links=${frame.routes.length} tick=${frame.tick} credits=${frame.credits}` +
      ` store=${JSON.stringify(frame.store)} branchOf=${machine.blueprint}#${machine.id}` +
      ` plain=${upgradeCost(base, machine.level)}` +
      ` prices=${JSON.stringify(Object.fromEntries(branchOptions(frame, machine.id).map((o) => [o.id, o.cost])))}` +
      ` step=${JSON.stringify(nextYardStep(frame).kind)}`
  );
  const decodedProbe = decodeSave(encodeSave(forkFrame(), 10, { textScale: 1, muted: true }));
  console.log(
    `decode: ${JSON.stringify(
      decodedProbe.ok
        ? { ok: true, tick: decodedProbe.payload.sim.tick, tutorial: decodedProbe.payload.sim.tutorial, machines: decodedProbe.payload.sim.machines.length, credits: decodedProbe.payload.sim.credits, settings: decodedProbe.payload.settings }
        : decodedProbe
    )}`
  );
  const browser = await chromium.launch({ executablePath, headless: true });
  const rows = [];
  const only = process.env.STRAT003_PASS ?? "AB";
  try {
    if (only.includes("A"))
      for (const cell of CELLS) {
      const state = forkFrame(); // one fresh engine per cell: identical numbers, no shared cursor
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
      // The intro card is the first thing a returning player sees; dismiss it the way
      // the recorded audits do, so the measured frame is the yard with the fork open.
      await page.evaluate(() => {
        const begin = [...document.querySelectorAll("button")].find(
          (node) => (node.textContent ?? "").trim() === "Begin recovery"
        );
        begin?.click();
      });
      await page.waitForTimeout(300);
      if (process.env.STRAT003_DEBUG) {
        console.log(
          `debug ${cell.label}: ` +
            JSON.stringify(
              await page.evaluate(() => ({
                dock: !!document.querySelector(".dock"),
                buttons: document.querySelectorAll("button").length,
                hud: !!document.querySelector(".hud"),
                keys: Object.keys(localStorage),
                saved: (localStorage.getItem("rustwake.save.v1") ?? "").slice(0, 40),
                text: (document.body.textContent ?? "").replace(/\s+/g, " ").slice(0, 220),
              }))
            )
        );
      }
      // The return report is the first thing a returning player sees; close it so the
      // measured frame is the yard with the fork open, as the recorded cells are.
      await page.evaluate(() => document.querySelector(".panel .icon-btn")?.click());
      await page.waitForTimeout(150);
      const measured = await page.evaluate(readCell);
      rows.push({
        pass: "A seeded",
        cell,
        measured,
        pageErrors: [...pageErrors],
        faviconRequests: [...faviconRequests],
        taps: null,
        forkFrameAt: null,
        saved: { tick: state.tick, machines: state.machines.length, credits: state.credits, textScale: cell.textScale },
      });
      await context.close();
    }
    if (only.includes("A")) report(rows, "A seeded frame (engine save written into localStorage, deterministic)");
    if (only.includes("B"))
      await passB(browser, "B live frame (recorded control: primary taps to 2 machines, then the fork)");
  } finally {
    await browser.close();
  }
};

function report(rows, tag) {
  console.log(`\n== pass ${tag} ==`);
  for (const row of rows) {
    const m = row.measured;
    if (!m) {
      console.log(`\n${row.cell.label}: no fork frame found (taps ${row.taps})`);
      continue;
    }
    const base = m.hudContentBoxHeight ?? m.inner.height;
    const ratio = m.cardBox && base > 0 ? Math.round((m.cardBox.h / base) * 1000) / 10 : null;
    const gap = m.dockBox && m.cardBox ? Math.round((m.dockBox.top - m.cardBox.bottom) * 10) / 10 : null;
    const minFace = m.faces.reduce(
      (a, f) => Math.min(a, Math.round(Math.min(f.box.w, f.box.h) * 10) / 10),
      999
    );
    console.log(
      `\n${row.cell.label}: inner ${m.inner.width}×${m.inner.height} dpr ${m.dpr} font ${m.fontPx}px` +
        ` --text-scale ${m.textScale} text-large ${m.textLarge}` +
        `${row.taps !== null && row.taps !== undefined ? ` taps ${row.taps} forkFrame ${row.forkFrameAt}` : ""}` +
        `${row.saved ? ` save ${JSON.stringify(row.saved)}` : ""}`
    );
    console.log(`  hudContentBox.height ${m.hudContentBoxHeight}; card ${m.cardBox?.h}px` +
      ` => card/hudContentBox ${ratio} % (cap 42 %)`);
    console.log(`  .objective bottom ${m.cardBox?.bottom} -> .dock top ${m.dockBox?.top} = gap ${gap} px (floor 8 px)`);
    console.log(`  scroll ${m.scroll.width}×${m.scroll.height} vs viewport ${m.inner.width}×${m.inner.height}` +
      ` => ${m.scroll.width <= m.inner.width && m.scroll.height <= m.inner.height ? "no page scroll" : "PAGES SCROLL"}`);
    console.log(`  dock rows ${m.dockRows}, faces ${m.faces.length}, smallest face ${minFace}px (floor 44 px)`);
    for (const face of m.faces) {
      console.log(
        `    [${face.box.w}×${face.box.h} y${face.box.top} minH ${face.minHeight} font ${face.fontSize}]` +
          ` ${face.clipped ? "CLIPPED " : ""}"${face.text}" cost="${face.cost}"`
      );
    }
    console.log(`  card: "${m.cardText}"`);
    for (const line of m.statusLines) console.log(`    line ${line.box.h}px ox${line.overflowX} oy${line.overflowY} "${line.text}"`);
    console.log(`  icon link: ${m.iconLink === null ? "none" : `${m.iconLink.slice(0, 60)}... (${m.iconLinkLength} chars)`}`);
    console.log(`  panelOpen ${m.panelOpen}; pageerrors ${row.pageErrors.length}` +
      `${row.pageErrors.length ? `: ${row.pageErrors.join(" | ")}` : ""}` +
      `; /favicon.ico requests ${row.faviconRequests.length}${row.faviconRequests.length ? ` (${row.faviconRequests.join(",")})` : ""}`);
  }
  const fails = [];
  for (const row of rows) {
    const m = row.measured;
    if (!m) continue;
    const base = m.hudContentBoxHeight ?? m.inner.height;
    const ratio = m.cardBox && base > 0 ? (m.cardBox.h / base) * 100 : 100;
    if (ratio > 42) fails.push(`${row.cell.label} card ${Math.round(ratio * 10) / 10} % > 42 %`);
    const gap = m.dockBox && m.cardBox ? m.dockBox.top - m.cardBox.bottom : -1;
    if (gap < 8) fails.push(`${row.cell.label} objective-to-dock gap ${Math.round(gap * 10) / 10} px < 8 px`);
    if (m.scroll.width > m.inner.width || m.scroll.height > m.inner.height) fails.push(`${row.cell.label} page scrolls`);
    const minFace = m.faces.reduce((a, f) => Math.min(a, f.box.w, f.box.h), 999);
    if (minFace < 44) fails.push(`${row.cell.label} smallest face ${Math.round(minFace * 10) / 10} px < 44 px`);
    if (m.faces.some((f) => f.clipped)) fails.push(`${row.cell.label} a face is clipped`);
    if (row.pageErrors.length) fails.push(`${row.cell.label} ${row.pageErrors.length} pageerror(s)`);
    if (row.faviconRequests.length) fails.push(`${row.cell.label} ${row.faviconRequests.length} /favicon.ico request(s)`);
    if (m.iconLink === null) fails.push(`${row.cell.label} no inline icon link (DEF-002)`);
  }
  console.log(
    `\nSTRAT-003 cell gates: ${fails.length === 0 ? "all four cells pass" : fails.join("; ")}`
  );
}

await run();
