// BLD-001 + D-1 g1: cheapest-first dock paint order, and the compact `Last ...` tail.
//
// Cells = four viewport/text-scale combinations (360x640 and 390x844, each at text scale
// 1.0 and 2.0; deviceScaleFactor 2, isMobile + hasTouch, one fresh context per cell):
//   A seeded 2-machine frame, fork row open   (same frame as CHRM-002 pass A)
//   C seeded 4-machine frame, fork row open   (same frame as CHRM-002 pass C)
//   D seeded 4-machine frame, fork row open, ONE refused tap on the 40-credit face,
//     purse 30 exactly as the recorded cell (QA D-1: 44.6 % on the base build)
//   B organic control, fresh storage, recorded tap method: primary taps until the fork
//     row is up, then 31 taps on the leftmost face at 250 ms (the BLD-001 proof)
//
// Printed per cell: hudContentBox.height, card height + ratio (cap 42 %), objective
// bottom -> dock top (floor 8 px), face order with each face's box (floor 44 px),
// documentElement.scroll* vs the visual viewport, pageerror count, every .status-line
// with its wrapped line-box count, the exact `Last ...` tail and its character count,
// and the price agreement (card number, each face's .dock__cost, the engine's charge).
//
// Run (two servers, one per build):
//   npm run build                         -> dist/ (candidate)
//   npx vite build --outDir dist-base     (base build, built from the base SHA)
//   npx vite preview --port 8461 --outDir dist-base   (background)
//   npx vite preview --port 8462                      (background)
//   BUILD_LABEL=base  RUSTWAKE_URL=http://localhost:8461/ npx tsx scripts/measure-bld001.mjs
//   BUILD_LABEL=after RUSTWAKE_URL=http://localhost:8462/ npx tsx scripts/measure-bld001.mjs
//   BLD001_PASS=AC          restrict passes (default ABCD)
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

const url = process.env.RUSTWAKE_URL ?? "http://localhost:8461/";
const buildLabel = process.env.BUILD_LABEL ?? "build";
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
const FOUR = ["sorter", "furnace", "copperSeparator", "polymerRecycler"];

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The recorded engine frame (`fund(60, 20)` before each build), `depth` machines deep. */
function yardFrame(depth, credits) {
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
  state.tutorial = 9;
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  FOUR.slice(0, depth).forEach((blueprint, index) => {
    const need = {};
    for (const item of BLUEPRINTS[blueprint].buildCost) need[item.resource] = item.qty;
    fund(60, 20, index >= 2 ? need.nonferrous ?? 0 : undefined);
    send({ type: "machine.build", blueprint, tile: firstFreeTile(state) });
    connect(state.machines[state.machines.length - 1].id);
    advance(state, 300);
  });
  state.credits = credits;
  state.store = { scrap: 9 };
  state.storeUnits = 9;
  advance(state, 1);
  return state;
}

/** In-page reading of one cell. Every number is the browser's own layout, none estimated. */
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
  const readLine = (node, role) => {
    const style = getComputedStyle(node);
    return {
      role,
      text: text(node),
      box: box(node.getBoundingClientRect()),
      fontSizePx: round(parseFloat(style.fontSize)),
      lineHeightPx: style.lineHeight === "normal" ? "normal" : round(parseFloat(style.lineHeight)),
      lineBoxes: lineBoxes(node),
      clippedX: node.scrollWidth - node.clientWidth,
      clippedY: node.scrollHeight - node.clientHeight,
    };
  };
  const lines = [...document.querySelectorAll(".status-line")];
  const tails = lines
    .map((node) => text(node))
    .map((line) => line.split(" · ").filter((part) => part.startsWith("Last ")).pop())
    .filter((part) => part !== undefined);
  const lastLine = lines.map((node) => text(node)).find((line) => line.includes("Last ")) ?? null;
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
    faces: faces.map((node) => ({
      text: text(node),
      cost: text(node.querySelector(".dock__cost")),
      box: box(node.getBoundingClientRect()),
      fontSizePx: round(parseFloat(getComputedStyle(node).fontSize)),
      clipped:
        node.getBoundingClientRect().top < -0.5 ||
        node.getBoundingClientRect().left < -0.5 ||
        node.getBoundingClientRect().bottom > window.innerHeight + 0.5 ||
        node.getBoundingClientRect().right > window.innerWidth + 0.5,
    })),
    cardRows: card ? [...card.children].map((node, i) => readLine(node, `row${i}:${node.className || node.tagName.toLowerCase()}`)) : [],
    statusLines: lines.map((node, i) => readLine(node, `status${i}`)),
    tails,
    tailLengths: tails.map((tail) => tail.length),
    lastLine,
    lastLineLength: lastLine === null ? null : lastLine.length,
    toastText: text(document.querySelector(".toast")),
    panelOpen: !!document.querySelector(".panel"),
  };
};

const snapshot = () => {
  const raw = localStorage.getItem("rustwake.save.v1");
  return raw ? JSON.parse(raw).payload : null;
};

/** Boot one context into the given save and close the return-report panel. */
async function bootSeeded(context, save) {
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, save]);
  const pageErrors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
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
  return { page, pageErrors };
}

/** One seeded frame per cell; `refuse` adds one blocked tap on the 40-credit face. */
async function seededPass(browser, depth, refuse) {
  const rows = [];
  for (const cell of CELLS) {
    const state = yardFrame(depth, refuse ? 30 : 34);
    const save = encodeSave(state, 10, { textScale: cell.textScale, muted: true });
    const context = await browser.newContext({
      viewport: { width: cell.width, height: cell.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const { page, pageErrors } = await bootSeeded(context, save);
    if (refuse) {
      await page.evaluate(() => {
        const node = [...document.querySelectorAll(".dock .dock__btn")].find(
          (b) => (b.querySelector(".dock__cost")?.textContent ?? "").startsWith("40")
        );
        node?.click();
      });
      await page.waitForTimeout(250);
    }
    if (process.env.BLD001_SHOTS) {
      await page.screenshot({ path: `${process.env.BLD001_SHOTS}/bld001-${buildLabel}-${depth}m${refuse ? "b" : ""}-${cell.label}.png` });
    }
    rows.push({
      pass: `seeded ${depth}-machine frame${refuse ? " + one refused tap" : " (deterministic)"}`,
      cell,
      measured: await page.evaluate(readCell),
      pageErrors: [...pageErrors],
      taps: null,
      forkFrameAt: null,
      saved: { tick: state.tick, machines: state.machines.length, credits: state.credits, textScale: cell.textScale },
      engine: enginePrices(state),
    });
    await context.close();
  }
  return rows;
}

/** What the engine charges at this frame, for the price-agreement check. */
function enginePrices(state) {
  const machine = state.machines[0];
  const def = BLUEPRINTS[machine.blueprint];
  return {
    machineId: machine.id,
    level: machine.level,
    plain: upgradeCost(def.baseUpgradeCost, machine.level),
    prices: Object.fromEntries(
      ["speed", "draw"].map((id) => [id, branchPrice(def.baseUpgradeCost, machine.level, id)])
    ),
    dockOrder: branchOptions(state, machine.id).map((o) => [o.id, o.cost]),
    step: nextYardStep(state).kind,
  };
}

/** The recorded organic tap method, then 31 leftmost taps at 250 ms (the BLD-001 proof). */
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
    const tapIndex = async (idx) => {
      await page.evaluate((i) => {
        const all = [...document.querySelectorAll(".dock .dock__btn")];
        const node = i === 0 ? (document.querySelector(".dock__btn--primary") ?? all[0]) : all[i];
        node?.click();
      }, idx);
      await page.waitForTimeout(250);
    };
    const read = () => page.evaluate(snapshot);
    const simOf = (payload) => payload?.sim ?? null;
    // Phase 1: the recorded control - primary taps until the fork row is up.
    let taps = 0;
    let fork = null;
    while (taps < 600) {
      await tapIndex(0);
      taps += 1;
      const candidate = await page.evaluate(readCell);
      const isFork =
        candidate.faces.length === 2 &&
        candidate.faces.every((face) => /\d+ credits$/.test(face.text));
      if (isFork) {
        fork = candidate;
        break;
      }
    }
    for (let i = 0; i < 6 && (await read())?.settings?.textScale !== cell.textScale; i += 1) {
      await page.evaluate(() => {
        const node = [...document.querySelectorAll("button")].find((b) =>
          (b.getAttribute("aria-label") ?? "").startsWith("Text size")
        );
        node?.click();
      });
      await page.waitForTimeout(120);
    }
    const before = simOf(await read());
    const creditsBefore = before?.credits ?? null;
    const levelSumBefore = before ? before.machines.reduce((a, m) => a + m.level, 0) : null;
    let revision = before?.revision ?? 0;
    // Phase 2: 31 taps on the LEFTMOST face, 250 ms apart - the blind-tap park check. Each
    // tap is logged with the face that was leftmost at that instant, whether the fork row
    // was still up, and whether the engine accepted a command because of it (the save's
    // own `revision` is the counter, so nothing is inferred from the pixels).
    const tapLog = [];
    let commandsLanded = 0;
    let tapsOnForkRow = 0;
    for (let tap = 1; tap <= 31; tap += 1) {
      const face = await page.evaluate(() => {
        const node = document.querySelector(".dock .dock__btn");
        return node ? (node.textContent ?? "").replace(/\s+/g, " ").trim() : null;
      });
      const stillFork = await page.evaluate(() => {
        const faces = [...document.querySelectorAll(".dock .dock__btn")];
        return (
          faces.length === 2 &&
          faces.every((f) => /\d+ credits$/.test((f.textContent ?? "").trim()))
        );
      });
      await tapIndex(0);
      const sim = simOf(await read());
      const delta = (sim?.revision ?? revision) - revision;
      revision = sim?.revision ?? revision;
      commandsLanded += delta;
      if (stillFork) tapsOnForkRow += 1;
      tapLog.push(`${tap}:${face ?? "-"}+${delta}${stillFork ? "*" : ""}`);
    }
    const after = simOf(await read());
    const measured = await page.evaluate(readCell);
    if (process.env.BLD001_SHOTS) {
      await page.screenshot({ path: `${process.env.BLD001_SHOTS}/bld001-${buildLabel}-organic-${cell.label}.png` });
    }
    rows.push({
      pass: "organic control + 31 leftmost taps at 250 ms",
      cell,
      measured,
      pageErrors: [...pageErrors],
      taps,
      forkFrameAt: taps,
      blind: {
        facesAtFork: fork?.faces.map((f) => f.text) ?? null,
        leftmostAtFork: fork?.faces[0]?.text ?? null,
        tailAtFork: fork?.lastLine ?? null,
        tailCharsAtFork: fork?.lastLineLength ?? null,
        cardPxAtFork: fork?.cardBox?.h ?? null,
        ratioAtFork:
          fork && (fork.hudContentBoxHeight ?? 0) > 0
            ? Math.round(((fork.cardBox?.h ?? 0) / fork.hudContentBoxHeight) * 1000) / 10
            : null,
        commandsLanded,
        tapsOnForkRow,
        creditsBefore,
        creditsAfter: after?.credits ?? null,
        levelSumBefore,
        levelSumAfter: after ? after.machines.reduce((a, m) => a + m.level, 0) : null,
        branch: after?.machines?.[0]?.branch ?? null,
        tapLog: tapLog.join(" "),
      },
      saved: after ? { tick: after.tick, machines: after.machines.length, credits: after.credits } : null,
      engine: null,
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
      `\n${row.cell.label} [${row.pass}]: inner ${m.inner.width}x${m.inner.height} dpr ${m.dpr}` +
        ` font ${m.fontPx}px text-large ${m.textLarge}` +
        `${row.taps !== null ? ` primaryTaps ${row.taps}` : ""}` +
        `${row.saved ? ` save ${JSON.stringify(row.saved)}` : ""}`
    );
    console.log(
      `  hudContentBox.height ${m.hudContentBoxHeight}; card ${m.cardBox?.h}px => card/hudContentBox ${ratio} % (cap 42 %)`
    );
    console.log(`  .objective bottom ${m.cardBox?.bottom} -> .dock top ${m.dockBox?.top} = gap ${gap} px (floor 8 px)`);
    console.log(
      `  scroll ${m.scroll.width}x${m.scroll.height} vs viewport ${m.inner.width}x${m.inner.height}` +
        ` => ${m.scroll.width <= m.inner.width && m.scroll.height <= m.inner.height ? "no page scroll (scrollHeight == innerHeight)" : "PAGES SCROLL"}`
    );
    console.log(`  dock rows ${m.dockRows}, faces ${m.faces.length}, smallest face ${Math.round(minFace * 10) / 10}px (floor 44 px)`);
    for (const [i, face] of m.faces.entries())
      console.log(
        `    face${i} [${face.box.w}x${face.box.h} x${face.box.left} y${face.box.top} font ${face.fontSizePx}px]` +
          ` ${face.clipped ? "CLIPPED " : ""}"${face.text}" cost="${face.cost}"`
      );
    console.log(`  card: "${m.cardText}"`);
    for (const line of m.cardRows)
      console.log(
        `    ${line.role} h${line.box.h}px font ${line.fontSizePx}px/line ${line.lineHeightPx}px` +
          ` wrappedBoxes ${line.lineBoxes.count} sw/cw ox${line.clippedX} oy${line.clippedY} "${line.text}"`
      );
    if (row.engine) console.log(`  engine: ${JSON.stringify(row.engine)}`);
    if (m.toastText) console.log(`  toast: "${m.toastText}"`);
    console.log(`  tails ${JSON.stringify(m.tails)} chars ${JSON.stringify(m.tailLengths)}`);
    if (row.blind) console.log(`  blind ${JSON.stringify(row.blind)}`);
    console.log(
      `  panelOpen ${m.panelOpen}; pageerrors ${row.pageErrors.length}` +
        `${row.pageErrors.length ? `: ${row.pageErrors.join(" | ")}` : ""}`
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
    if (m.faces.length === 2) {
      const numbers = m.faces.map((f) => Number((f.cost.split(" ")[0] || "0")));
      for (let i = 1; i < numbers.length; i += 1)
        if (numbers[i] < numbers[i - 1]) fails.push(`${row.cell.label} faces not cheapest-first: ${numbers.join(", ")}`);
    }
    if (row.engine) {
      const plain = String(row.engine.plain) + " credits";
      const priceLine = m.cardRows[0]?.text ?? "";
      if (!priceLine.endsWith(plain))
        fails.push(`${row.cell.label} card price line "${priceLine}" != engine plain "${plain}"`);
      for (const [i, face] of m.faces.entries()) {
        const [, priced] = row.engine.dockOrder[i] ?? [];
        if (priced !== face.cost) fails.push(`${row.cell.label} face${i} "${face.cost}" != engine "${priced}"`);
      }
    }
    if (row.pageErrors.length) fails.push(`${row.cell.label} ${row.pageErrors.length} pageerror(s)`);
  }
  console.log(`\nBLD-001/D-1 cell gates [${buildLabel}]: ${fails.length === 0 ? "ALL PASS" : fails.join("; ")}`);
}

const run = async () => {
  const only = process.env.BLD001_PASS ?? "ABCD";
  console.log(`BLD-001/D-1 measurement, build label ${buildLabel}, url ${url}`);
  for (const depth of [2, 4]) {
    const frame = yardFrame(depth, 34);
    const machine = frame.machines[0];
    console.log(
      `frame depth=${depth}: machines=${frame.machines.length}` +
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
    if (only.includes("A")) report(await seededPass(browser, 2, false));
    if (only.includes("B")) report(await organicPass(browser));
    if (only.includes("C")) report(await seededPass(browser, 4, false));
    if (only.includes("D")) report(await seededPass(browser, 4, true));
  } finally {
    await browser.close();
  }
};

await run();
