// UI-002 g3: "the world outranks the text" - the chromium instrument for acceptance rows
// U-1..U-7. Modelled on `scripts/measure-chrm002.mjs` (which stays untouched as the base
// instrument); every number below is the browser's own layout on the **built artifact**
// served by `vite preview`, never a jsdom estimate.
//
// Five U-1 cells at the **eight-machine** yard (360x640 / 390x844 at text scale 1.0 and 2.0,
// plus the eight-machine fork-open frame with one refused tap): the deepest ladder the
// tables carry, which is the frame the 42 % card cap has to survive. Every row prints
// `hudContentBox.height` next to the card height and the ratio against the 42 % cap.
//
// The `stack` pass (U-5) is the two-layer overlay chain: the boot report underneath the
// panel the player opened last. It prints the `.panel` count before and after every press,
// for both ways of pressing (`Escape` and the painted target nearest the dock), plus the
// canvas still inside `#root` and `body.scrollHeight == innerHeight` at the last step.
//
// The text-scale 2.0 cells prove their own scale three ways (the recorded
// `work/review/dispatch-startup/captures/ds-measure.json` prints `textScale: 1` inside its
// "360x640 ts2" cell): the saved settings envelope, the `--text-scale` custom property and
// the resolved body font size in px.
//
// Run:
//   npm run build
//   npx vite preview --port 4173            (background)
//   npx tsx scripts/measure-ui002.mjs
//   UI002_PASS=rest|panel|research|dismiss|stack|fork   (default: all)
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { BLUEPRINTS, TUNING } from "../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../src/game/simulation/commands";
import { planConnections } from "../src/game/simulation/autoconnect";
import { advance } from "../src/game/simulation/engine";
import { nextYardStep } from "../src/game/simulation/plan";
import { createInitialState } from "../src/game/simulation/types";
import { encodeSave, decodeSave } from "../src/game/persistence/save";
import { fitCamera, tileToWorld, worldToScreen } from "../src/game/renderer/scene";
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

/** The eight blueprints the tables carry, in yard order: the deepest ladder (UI-002 g3). */
const EIGHT = [
  "sorter",
  "furnace",
  "copperSeparator",
  "polymerRecycler",
  "wireMill",
  "platePress",
  "circuitAssembler",
  "signalLab",
];

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The jsdom boot cadence through the real engine, `depth` machines deep (measure-chrm002). */
function yardFrame(depth, credits = 34, data = 0, tiles) {
  const state = createInitialState();
  let seq = 0;
  const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
  const connect = (machineId) => {
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
  };
  /**
   * One blueprint, funded at exactly its own build cost (UI-002 g3). The 4-machine fund
   * named three resources; the deeper ladder buys with steel, copper, residue, polymer and
   * wire too, so the cost table is read instead of a hand-copied triple - the same rule the
   * faces print (`costSummary`).
   */
  const fund = (blueprint) => {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = {
        ...state.store,
        [item.resource]: Math.max(state.store[item.resource] ?? 0, item.qty),
      };
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
    // The Research dock face only exists once data is in the store (spec 5.5), which the
    // U-4 / U-5 cells need.
    state.store.data = data;
    state.storeUnits += data;
  }
  advance(state, 1);
  return state;
}

/** Numbers the engine itself holds for one frame, for the persona comparison. */
function simRead(state) {
  let requested = 0;
  for (const m of state.machines) if (m.progress > 0) requested += m.batchPower;
  return {
    machineLevelSum: state.machines.reduce((total, m) => total + m.level, 0),
    machines: state.machines.map((m) => `${m.blueprint}#${m.tile} L${m.level}`),
    credits: state.credits,
    store: state.store,
    storeUnits: state.storeUnits,
    storeCapacity: state.storeCapacity,
    drones: (state.drone.repaired ? 1 : 0) + state.spares.length,
    powerRequested: requested,
    powerCapacity: TUNING.yardPowerCapacity,
    powerRatioPct: Math.round(state.powerRatio * 100),
    batchesDone: state.machines.reduce((total, m) => total + m.batchesDone, 0),
    step: nextYardStep(state).kind,
    forkPrices: state.machines[0]
      ? branchOptions(state, state.machines[0].id).map((o) => `${o.id}:${o.cost}`)
      : [],
  };
}

/**
 * In-page reading of one cell. Every number is the browser's own layout.
 */
const readCell = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const box = (r) => ({
    w: round(r.width),
    h: round(r.height),
    top: round(r.top),
    bottom: round(r.bottom),
    left: round(r.left),
    right: round(r.right),
  });
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const root = document.documentElement;
  const hud = document.querySelector(".hud");
  const card = document.querySelector(".objective");
  const dock = document.querySelector(".dock");
  /** Perceptual luminance of a computed colour, composited over the page ground. */
  const lum = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value ?? "");
    if (!m) return null;
    const [r, g, b, aRaw] = m[1].split(",").map((part) => parseFloat(part.trim()));
    const a = Number.isFinite(aRaw) ? aRaw : 1;
    const over = (channel, base) => channel * a + base * (1 - a);
    const rr = over(r, 8);
    const gg = over(g, 13);
    const bb = over(b, 24);
    const l = 0.299 * rr + 0.587 * gg + 0.114 * bb;
    return { l: round(l), bucket: Math.floor(l / 32) };
  };
  const lineBoxes = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()];
  };
  const readLine = (node, role) => {
    const style = getComputedStyle(node);
    const rects = lineBoxes(node);
    const ink = rects.length
      ? {
          top: round(Math.min(...rects.map((r) => r.top))),
          bottom: round(Math.max(...rects.map((r) => r.bottom))),
          right: round(Math.max(...rects.map((r) => r.right))),
        }
      : null;
    // The *visible* glyph extent, straight from the text-metrics engine, so the white
    // between two wrapped rows is `line-height - (ascent + descent)` and not an estimate.
    let glyph = null;
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = ctx.measureText(text(node) || "Drones 1");
      if ("actualBoundingBoxAscent" in metrics) {
        glyph = {
          ascentPx: round(metrics.actualBoundingBoxAscent),
          descentPx: round(metrics.actualBoundingBoxDescent),
        };
      }
    } catch {
      glyph = null;
    }
    const lineHeightPx =
      style.lineHeight === "normal" ? null : round(parseFloat(style.lineHeight));
    return {
      role,
      className: node.className || node.tagName.toLowerCase(),
      text: text(node),
      element: box(node.getBoundingClientRect()),
      fontSizePx: round(parseFloat(style.fontSize)),
      fontWeight: style.fontWeight,
      lineHeightPx: lineHeightPx === null ? "normal" : lineHeightPx,
      wrappedBoxes: rects.length,
      ink,
      glyph,
      whiteBetweenRowsPx:
        lineHeightPx !== null && glyph
          ? round(lineHeightPx - (glyph.ascentPx + glyph.descentPx))
          : null,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    };
  };
  const accentCount = (container) => {
    const buttons = [...container.querySelectorAll("button")];
    return {
      container: container.className,
      buttons: buttons.length,
      accentFilled: buttons.filter(
        (b) => (getComputedStyle(b).backgroundImage || "").indexOf("linear-gradient") === 0
      ).length,
      texts: buttons.map((b) => text(b)),
    };
  };
  const cardLines = card ? [...card.children].map((n, i) => readLine(n, "line" + i)) : [];
  const pill = document.querySelector(".resources__item");
  const primaryFace = document.querySelector(".dock__btn--primary");
  const plainFace = [...document.querySelectorAll(".dock .dock__btn")].find(
    (b) => !b.className.includes("--primary")
  );
  const faceBox = (node) => {
    const style = getComputedStyle(node);
    return {
      text: text(node),
      box: box(node.getBoundingClientRect()),
      fontSizePx: round(parseFloat(style.fontSize)),
      fontWeight: style.fontWeight,
      background: style.backgroundColor,
      backgroundImage: style.backgroundImage.slice(0, 34),
      luminance: lum(style.backgroundColor),
    };
  };
  const panelRows = [...document.querySelectorAll(".panel")].map((panel) => {
    const body = panel.querySelector(".panel__body");
    const overflow = (node) => (node ? node.scrollWidth - node.clientWidth : null);
    const wholeWord = (node) =>
      // A one-word column shows up as a box narrower than the text it holds, so the text
      // breaks after every word; `scrollWidth == clientWidth` is the flat form of that.
      node ? { sw: node.scrollWidth, cw: node.clientWidth, lines: lineBoxes(node).length } : null;
    const rows = [...panel.querySelectorAll(".panel__row")].map((row) => {
      const dt = row.querySelector("dt");
      const dd = row.querySelector("dd");
      const bdt = dt ? box(dt.getBoundingClientRect()) : null;
      const bdd = dd ? box(dd.getBoundingClientRect()) : null;
      return {
        text: text(row),
        ddText: dd ? text(dd) : null,
        dt: bdt,
        dd: bdd,
        sameLineBox: bdt && bdd ? Math.abs(bdt.top - bdd.top) <= 1 : null,
        valueAfterLabel: bdt && bdd ? bdd.left > bdt.right : null,
        // The two numbers the criterion is stated in, printed rather than inferred.
        topDelta: bdt && bdd ? round(bdd.top - bdt.top) : null,
        leftGap: bdt && bdd ? round(bdd.left - bdt.right) : null,
        rowWidth: round(row.getBoundingClientRect().width),
        dtOverflow: overflow(dt),
        ddOverflow: overflow(dd),
        ddWrapping: dd ? lineBoxes(dd).length : null,
      };
    });
    /** The research cards, row by row: name, effect, state and buy target in one line box. */
    const nodes = [...panel.querySelectorAll(".node")].map((node) => ({
      name: text(node.querySelector(".node__name")),
      effect: text(node.querySelector(".node__effect")),
      state: text(node.querySelector(".node__state")),
      width: round(node.getBoundingClientRect().width),
      cardOverflowX: overflow(node),
      nameBox: wholeWord(node.querySelector(".node__name")),
      effectBox: wholeWord(node.querySelector(".node__effect")),
      stateBox: wholeWord(node.querySelector(".node__state")),
      footBox: wholeWord(node.querySelector(".node__foot")),
      rightMostInk: round(
        Math.max(
          0,
          ...[...node.querySelectorAll("*")].map((n) => n.getBoundingClientRect().right)
        )
      ),
      bottom: round(node.getBoundingClientRect().bottom),
      buy: [...node.querySelectorAll("button")].map((b) => text(b)).join(" | "),
    }));
    // Which printed *value* strings appear more than once in this panel — the `20/900`
    // census (finding N-2): the capacity pair must be printed exactly once.
    const panelText = text(panel);
    const repeatedValues = rows
      .map((r) => ({
        value: r.ddText ?? "",
        count: (r.ddText ?? "").length >= 4 ? panelText.split(r.ddText ?? "").length - 1 : 1,
      }))
      .filter((entry) => entry.count > 1);
    const capacityPair =
      rows.map((r) => r.ddText ?? "").find((value) => /^\d[\d,.]*\/\d[\d,.]*$/.test(value)) ?? null;
    const last = rows[rows.length - 1];
    const bodyBox = body ? box(body.getBoundingClientRect()) : null;
    const dismiss = panel.querySelector(".panel__head button");
    const dismissBox = dismiss ? box(dismiss.getBoundingClientRect()) : null;
    return {
      label: text(panel.querySelector(".panel__title")),
      headDismiss: text(dismiss),
      headDismissBox: dismissBox,
      // The visible target has to be inside the viewport, not just painted somewhere.
      headDismissInView:
        dismissBox
          ? dismissBox.top >= 0 &&
            dismissBox.bottom <= window.innerHeight + 0.5 &&
            dismissBox.h >= 44
          : null,
      rows: rows.length,
      rowWidths: rows.map((r) => r.rowWidth),
      dtOverflows: rows.map((r) => r.dtOverflow),
      ddOverflows: rows.map((r) => r.ddOverflow),
      capacityPair,
      repeatedValues,
      nodes,
      nodeCardOverflow: nodes.map((n) => n.cardOverflowX),
      nodeNameBoxes: nodes.map((n) => n.nameBox),
      lastNodeBottom: nodes.length ? nodes[nodes.length - 1].bottom : null,
      lastNodeInsideBody:
        bodyBox && nodes.length ? nodes[nodes.length - 1].bottom <= bodyBox.bottom + 1 : null,
      dlOverflowX: [...panel.querySelectorAll("dl")].map((dl) => dl.scrollWidth - dl.clientWidth),
      bodyClientWidth: body ? body.clientWidth : null,
      bodyScrollHeight: body ? body.scrollHeight : null,
      bodyClientHeight: body ? body.clientHeight : null,
      bodyScrollTop: body ? round(body.scrollTop) : null,
      bodyScrollable: body ? body.scrollHeight > body.clientHeight + 0.5 : null,
      bodyBottom: bodyBox ? bodyBox.bottom : null,
      bodyTop: bodyBox ? bodyBox.top : null,
      lastRowText: last ? last.text : null,
      lastRowBottom: last && last.dd ? last.dd.bottom : null,
      lastRowInsideBody:
        // 1 px tolerance, the same one the row criterion uses: `clientHeight` is an integer
        // while the body's own rect is fractional, so a scroller at its maximum scrollTop
        // lands the last line 0.63 px past the truncated edge in chromium.
        last && last.dd && bodyBox ? last.dd.bottom <= bodyBox.bottom + 1 : null,
      dlCount: panel.querySelectorAll("dl").length,
      nodeRows: [...panel.querySelectorAll(".node__foot")].map((row) => accentCount(row)),
      firstRow: rows[0] ?? null,
      rowDetails: rows.map((r) => ({
        text: r.text,
        topDelta: r.topDelta,
        leftGap: r.leftGap,
        sameLineBox: r.sameLineBox,
        valueAfterLabel: r.valueAfterLabel,
        ddWrapping: r.ddWrapping,
      })),
      alignmentOk:
        rows.length > 0 &&
        rows.every((r) => r.dt && r.dd && r.sameLineBox && r.valueAfterLabel),
    };
  });
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    dpr: window.devicePixelRatio,
    fontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textScaleProperty: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    hudContentBoxHeight: hud ? hud.clientHeight : null,
    pageScroll: { width: root.scrollWidth, height: root.scrollHeight },
    cardText: text(card),
    cardBox: card ? box(card.getBoundingClientRect()) : null,
    cardLines,
    dockBox: dock ? box(dock.getBoundingClientRect()) : null,
    faces: [...document.querySelectorAll(".dock .dock__btn")].map(faceBox),
    accentRows: [...document.querySelectorAll(".dock, .panel__actions, .node__foot")].map(
      accentCount
    ),
    pillLuminance: pill ? lum(getComputedStyle(pill).backgroundColor) : null,
    pillFontSizePx: pill ? round(parseFloat(getComputedStyle(pill).fontSize)) : null,
    primaryLuminance: primaryFace ? lum(getComputedStyle(primaryFace).backgroundColor) : null,
    plainLuminance: plainFace ? lum(getComputedStyle(plainFace).backgroundColor) : null,
    panels: panelRows,
    panelCount: document.querySelectorAll(".panel").length,
  };
};

/**
 * The one simulated persona's raw material: what the resting screen itself paints,
 * read with no developer walkthrough (spec: card lines, dock faces, chips only).
 */
const readPersona = () => {
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const card = document.querySelector(".objective");
  const lines = card ? [...card.children].map(text).filter((t2) => t2.length > 0) : [];
  const faces = [...document.querySelectorAll(".dock .dock__btn")].map(text);
  const chips = [...document.querySelectorAll(".resources__item")].map(text);
  const shortfall = lines
    .join(" ")
    .match(/[Ll]ast need (\d+) (\w+) . have (\d+)/) ?? null;
  const power = lines.join(" ").match(/Power (\d+) . (\d+) requested . (\d+) %/) ?? null;
  const drones = lines.join(" ").match(/Drones (\d+)/) ?? null;
  const nextFace =
    [...document.querySelectorAll(".dock .dock__btn")].find((b) =>
      (getComputedStyle(b).backgroundImage || "").indexOf("linear-gradient") === 0
    ) ?? document.querySelector(".dock .dock__btn");
  return {
    nextTapFace: text(nextFace),
    leftmostFace: faces[0] ?? null,
    shortfall: shortfall
      ? { need: Number(shortfall[1]), word: shortfall[2], have: Number(shortfall[3]) }
      : null,
    power: power
      ? { capacity: Number(power[1]), requested: Number(power[2]), percent: Number(power[3]) }
      : null,
    drones: drones ? Number(drones[1]) : null,
    cardLineCount: lines.length,
    cardLines: lines,
    faces,
    chips,
  };
};

const CELLS = [
  { label: "360x640 ts1 8-machine", width: 360, height: 640, textScale: 1, depth: 8 },
  { label: "360x640 ts2 8-machine", width: 360, height: 640, textScale: 2, depth: 8 },
  { label: "390x844 ts1 8-machine", width: 390, height: 844, textScale: 1, depth: 8 },
  { label: "390x844 ts2 8-machine", width: 390, height: 844, textScale: 2, depth: 8 },
];

/** One fresh context per cell; the engine writes the save, the app boots into it. */
async function withPage(browser, cell, body) {
  const state = yardFrame(cell.depth, cell.purse ?? 34, cell.data ?? 0, cell.tiles);
  // `lastSeenMs: 10` is the base instrument's envelope, so the four U-1 cells reproduce the
  // numbers recorded in `ds-measure.json`. Cells that need a *specific* yard ladder step
  // (the fork row) ask for a live stamp instead, which makes the offline catch-up 0 ticks
  // long and leaves the plan the frame was built for on screen.
  const saved = cell.live ? Date.now() : 10;
  const save = encodeSave(state, saved, { textScale: cell.textScale, muted: true });
  const context = await browser.newContext({
    viewport: { width: cell.width, height: cell.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const pageErrors = [];
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, save]);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const begin = [...document.querySelectorAll("button")].find(
      (node) => (node.textContent ?? "").trim() === "Begin recovery"
    );
    begin?.click();
  });
  await page.waitForTimeout(250);
  // The store persists on a 1 s timer; one longer settle makes the localStorage envelope
  // the app's own caught-up state, which is the sim read the persona is checked against.
  await page.waitForTimeout(1100);
  // A boot after an encoded absence paints the return report first, and it owns the single
  // panel slot until its own visible target retires it (U-5 row 0). Retire it here so the
  // cell under test starts on the plain resting screen; the report's own dismiss chain is
  // printed from this same reading. `keepReport: true` cells (the `stack` pass) leave the
  // layer up, because the chain they measure *is* the two-layer stack.
  const report = await page.evaluate((keep) => {
    const panels = document.querySelectorAll(".panel").length;
    const panel = document.querySelector(".panel");
    const button = panel ? panel.querySelector(".panel__head button") : null;
    const label = button ? (button.textContent ?? "").trim() : null;
    const height = button ? Math.round(button.getBoundingClientRect().height) : 0;
    const width = button ? Math.round(button.getBoundingClientRect().width) : 0;
    if (!keep && button && /^Back to yard$/.test(label)) button.click();
    return { label, heightPx: height, widthPx: width, panelsBefore: panels, kept: keep };
  }, cell.keepReport === true);
  await page.waitForTimeout(150);
  report.panelsAfter = await page.evaluate(() => document.querySelectorAll(".panel").length);
  const result = await body(page);
  const rawSave = await page.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  const decoded = decodeSave(rawSave);
  const sim = decoded.ok ? simRead(decoded.payload.sim) : null;
  const envelope = rawSave
    ? (() => {
        const parsed = JSON.parse(rawSave);
        return {
          schemaVersion: parsed.schemaVersion,
          checksum: parsed.checksum,
          textScale: parsed.payload?.settings?.textScale ?? null,
          tick: parsed.payload?.sim?.tick,
          machines: parsed.payload?.sim?.machines?.length,
          credits: parsed.payload?.sim?.credits,
        };
      })()
    : null;
  const shot = process.env.UI002_SHOTS;
  if (shot) await page.screenshot({ path: `${shot}/ui002-${cell.label.replace(/ /g, "-")}.png` });
  await context.close();
  return { result, pageErrors: [...pageErrors], envelope, sim, report };
}

const tapFace = (page, index) =>
  page.evaluate((idx) => {
    const all = [...document.querySelectorAll(".dock .dock__btn")];
    all[idx]?.click();
  }, index);

/**
 * Click the dock face whose text is *exactly* `label`. `startsWith` is not enough here:
 * the accent-filled primary prints "Research Efficient Cutters 30 credits", which starts
 * with the plain "Research" face's own text and would steal the click.
 */
const clickFaceExactly = (page, label) =>
  page.evaluate((want) => {
    const faces = [...document.querySelectorAll(".dock .dock__btn")];
    const texts = faces.map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
    const index = texts.indexOf(want);
    faces[index]?.click();
    return { want, index, faces: texts };
  }, label);

/**
 * The canvas box and the chrome band, read the same two ways `chromeInsets` in `App.tsx`
 * reads them, so the tile centres this pass taps are the ones the renderer painted. The
 * camera comes from the shipped `fitCamera` / `worldToScreen`, so no hand-copied constant.
 */
const readGeometry = () => {
  const canvas = document.querySelector("canvas");
  const parent = canvas ? canvas.parentElement : null;
  if (!canvas || !parent) return null;
  const rect = canvas.getBoundingClientRect();
  const top = document.querySelector(".hud__top");
  const dock = document.querySelector(".dock");
  const topEdge = top ? top.getBoundingClientRect().bottom : 0;
  const dockTop = dock ? dock.getBoundingClientRect().top : 0;
  const cssHeight = parent.clientHeight;
  return {
    left: rect.left,
    top: rect.top,
    view: { width: parent.clientWidth, height: cssHeight },
    insets:
      topEdge > 0 && dockTop > 0
        ? { top: topEdge, bottom: Math.max(0, cssHeight - dockTop) }
        : undefined,
  };
};

/** Viewport coordinates of the centre of each named tile, via the shipped camera maths. */
async function tileTapPoints(page, tiles) {
  const geometry = await page.evaluate(readGeometry);
  if (!geometry) return [];
  const camera = fitCamera(geometry.view, geometry.insets);
  return tiles.map((tile) => {
    const world = tileToWorld(tile);
    const p = worldToScreen(camera, geometry.view, world.x, world.y);
    return {
      tile,
      x: Math.round(p.x + geometry.left),
      y: Math.round(p.y + geometry.top),
      camera: { x: camera.x, y: camera.y, scale: Math.round(camera.scale * 1000) / 1000 },
    };
  });
}

/**
 * Open one panel the way a thumb does. At the fork the dock carries only the two named
 * plans (STRAT-002/A1-3), so the panel faces are not on the row yet: pay the cheapest plan
 * once — the accent face, i.e. the plan the purse can reach — and the row returns to the
 * plain ladder, where `Store` / `Yard` / `Research` live.
 */
async function openPanel(page, name) {
  const attempts = [];
  let clicked = await clickFaceExactly(page, name);
  await page.waitForTimeout(150);
  let panels = await page.evaluate(() => document.querySelectorAll(".panel").length);
  attempts.push({ how: "face", index: clicked.index, panels });
  for (let i = 0; panels === 0 && i < 3; i += 1) {
    await page.evaluate(() => {
      const faces = [...document.querySelectorAll(".dock .dock__btn")];
      const accent =
        faces.find(
          (b) => (getComputedStyle(b).backgroundImage || "").indexOf("linear-gradient") === 0
        ) ?? faces[0];
      accent?.click();
    });
    await page.waitForTimeout(200);
    clicked = await clickFaceExactly(page, name);
    await page.waitForTimeout(150);
    panels = await page.evaluate(() => document.querySelectorAll(".panel").length);
    attempts.push({ how: "pay-cheapest-then-face", index: clicked.index, panels });
  }
  return { attempts, panels, faces: clicked.faces };
}

/** Tap the painted centre of each machine tile until the machine panel appears. */
async function openMachinePanel(page, tiles) {
  const points = await tileTapPoints(page, tiles);
  for (const point of points) {
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(140);
    const panel = await page.evaluate(() => {
      const node = document.querySelector(".panel");
      return node
        ? {
            title: (node.querySelector(".panel__title")?.textContent ?? "").trim(),
            actions: [...node.querySelectorAll(".panel__actions button")].map((b) =>
              (b.textContent ?? "").replace(/\s+/g, " ").trim()
            ),
            actionsInRow: [...node.querySelectorAll(".panel__actions button")].map((b) =>
              Math.round(b.getBoundingClientRect().height)
            ),
          }
        : null;
    });
    if (panel) return { panel, point, points: points.map((p) => ({ tile: p.tile, x: p.x, y: p.y })) };
  }
  return { panel: null, points: points.map((p) => ({ tile: p.tile, x: p.x, y: p.y })) };
}

/** Scroll an open panel body to its own bottom; returns the new scrollTop. */
const scrollPanelBody = (page) =>
  page.evaluate(() => {
    const body = document.querySelector(".panel__body");
    if (!body) return null;
    body.scrollTop = body.scrollHeight;
    return { scrollTop: Math.round(body.scrollTop), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
  });

// ---------------------------------------------------------------- pass 1: U-1 / U-2 / U-7
async function passRest(browser) {
  const rows = [];
  for (const cell of CELLS) {
    const { result, pageErrors, envelope, sim, report } = await withPage(browser, cell, async (page) => {
      const measured = await page.evaluate(readCell);
      return { measured, persona: await page.evaluate(readPersona) };
    });
    rows.push({
      cell,
      ...result,
      pageErrors,
      envelope,
      report,
      sim,
      frameSim: simRead(yardFrame(cell.depth, cell.purse ?? 34, cell.data ?? 0)),
    });
  }
  for (const row of rows) {
    const m = row.measured;
    const base = m.hudContentBoxHeight;
    const ratio = base > 0 ? Math.round((m.cardBox.h / base) * 1000) / 10 : null;
    console.log(
      `\n[${row.cell.label}] inner ${m.inner.width}x${m.inner.height} dpr ${m.dpr}` +
        ` font ${m.fontPx}px --text-scale ${m.textScaleProperty} text-large ${m.textLarge}` +
        ` saved ${JSON.stringify(row.envelope)}`
    );
    console.log(
      `  U-1 hudContentBox.height ${m.hudContentBoxHeight}; .objective ${m.cardBox.h}px` +
        ` => ${ratio} % (cap 42 %)`
    );
    console.log(
      `  boot report overlay: dismissed by "${row.report.label}" ${row.report.widthPx}x${row.report.heightPx}px` +
        ` -> panels ${row.report.panelsBefore} to ${row.report.panelsAfter}` +
        ` (retires one overlay per visible target)`
    );
    console.log(`  card: "${m.cardText}"`);
    for (const line of m.cardLines)
      console.log(
        `    ${line.role} .${line.className} font ${line.fontSizePx}px weight ${line.fontWeight}` +
          ` leading ${line.lineHeightPx}px wrappedBoxes ${line.wrappedBoxes}` +
          ` glyph a${line.glyph ? line.glyph.ascentPx : "-"}/d${line.glyph ? line.glyph.descentPx : "-"}` +
          ` white ${line.whiteBetweenRowsPx} px` +
          ` ink ${line.ink ? `${line.ink.top}..${line.ink.bottom} r${line.ink.right}` : "-"}` +
          ` sw${line.scrollWidth}/cw${line.clientWidth} sh${line.scrollHeight}/ch${line.clientHeight}` +
          ` "${line.text}"`
      );
    // Legibility guard, the same two tests the CHRM instrument uses: (a) consecutive
    // *element* boxes in the card keep a non-negative separation, (b) every wrapped line
    // keeps at least 0.5 px of white between its own rows, measured from the text-metrics
    // engine as `line-height - (ascent + descent)`. (`Range.getClientRects()` unions are
    // line-box tall, so they are printed for reference, not used as the separation test.)
    const inkedLines = m.cardLines.filter((l) => l.wrappedBoxes > 0);
    const separations = inkedLines.slice(1).map((l, i) =>
      Math.round((l.element.top - inkedLines[i].element.bottom) * 10) / 10
    );
    for (const sep of separations)
      if (sep < -0.5) console.log(`  LEGIBILITY: a card row overlaps the row above by ${-sep} px`);
    const tight = inkedLines.filter(
      (l) => l.wrappedBoxes > 1 && l.whiteBetweenRowsPx !== null && l.whiteBetweenRowsPx < 0.5
    );
    console.log(
      `  legibility: element separations ${JSON.stringify(separations)}` +
        ` (min ${separations.length ? Math.min(...separations) : "-"} px),` +
        ` wrapped lines under 0.5 px white ${tight.length}`
    );
    const tiers = [
      ...new Set(m.cardLines.filter((l) => l.wrappedBoxes > 0).map((l) => `${l.fontSizePx}/${l.fontWeight}`)),
    ];
    const inked = m.cardLines.filter((l) => l.wrappedBoxes > 0);
    const primaryPx = inked.length ? inked[0].fontSizePx : 0;
    const secondaryPx = inked.length > 1 ? inked[1].fontSizePx : primaryPx;
    console.log(
      `  U-2 tiers ${tiers.length} ${JSON.stringify(tiers)}` +
        ` => primary ${primaryPx}px / secondary ${secondaryPx}px` +
        ` = ${(primaryPx / (secondaryPx || 1)).toFixed(2)}x (floor 1.25x)`
    );
    for (const row2 of m.accentRows)
      console.log(
        `    accent row .${row2.container} buttons ${row2.buttons} accent-filled ${row2.accentFilled}` +
          ` ${JSON.stringify(row2.texts)}`
      );
    console.log(
      `    luminance: pill ${JSON.stringify(m.pillLuminance)} (font ${m.pillFontSizePx}px)` +
        ` | primary face ${JSON.stringify(m.primaryLuminance)}` +
        ` | plain face ${JSON.stringify(m.plainLuminance)}`
    );
    const minFace = m.faces.reduce((a, f) => Math.min(a, f.box.w, f.box.h), 999);
    console.log(
      `  U-7 smallest face ${Math.round(minFace * 10) / 10}px (floor 44 px)` +
        `; page scroll ${m.pageScroll.width}x${m.pageScroll.height}` +
        ` vs viewport ${m.inner.width}x${m.inner.height}` +
        ` => ${m.pageScroll.width <= m.inner.width && m.pageScroll.height <= m.inner.height ? "no page scroll (scrollHeight == innerHeight)" : "PAGES SCROLL"}` +
        `; pageerrors ${row.pageErrors.length}${row.pageErrors.length ? ": " + row.pageErrors.join(" | ") : ""}`
    );
    for (const face of m.faces)
      console.log(
        `    face [${face.box.w}x${face.box.h} top ${face.box.top} font ${face.fontSizePx}px w${face.fontWeight}]` +
          ` bg ${face.background} img ${face.backgroundImage} L ${JSON.stringify(face.luminance)} "${face.text}"`
      );
    console.log(`  persona ${JSON.stringify(row.persona)}`);
    console.log(`  sim(app persisted) ${JSON.stringify(row.sim)}`);
    console.log(`  sim(node frame)    ${JSON.stringify(row.frameSim)}`);
    const dom = row.persona;
    const agrees = {
      drones: dom.drones === row.sim?.drones,
      powerCapacity: dom.power?.capacity === row.sim?.powerCapacity,
      powerPercent: dom.power?.percent === row.sim?.powerRatioPct,
      powerRequested: dom.power?.requested === row.sim?.powerRequested,
      nextTapPriceMatchesTable: row.frameSim?.forkPrices?.length
        ? dom.faces.every((face) =>
            row.frameSim.forkPrices.some((entry) => face.endsWith(entry.split(":")[1]))
          )
        : null,
    };
    console.log(`  persona/sim agreement ${JSON.stringify(agrees)}`);
  }
  return rows;
}

// ------------------------------------------------------- pass 2: panel rows (Lane B) + U-4
async function passPanel(browser) {
  const rows = [];
  for (const cell of [
    { label: "360x640 ts1 store", width: 360, height: 640, textScale: 1, depth: 8, open: "Store" },
    { label: "360x640 ts2 store", width: 360, height: 640, textScale: 2, depth: 8, open: "Store" },
    {
      // Row 4 carries the machines here: at text scale 2.0 the top rows sit under the
      // objective card, whose own box is a hit target, so a tile centre there is not a
      // canvas tap. Rows 4 and 5 paint their centres between the card bottom and the dock.
      label: "360x640 ts2 machine",
      width: 360,
      height: 640,
      textScale: 2,
      depth: 8,
      open: "machine",
      data: 12,
      tiles: [24, 25, 26, 27, 28, 29, 30, 31],
    },
    {
      label: "360x640 ts2 research",
      width: 360,
      height: 640,
      textScale: 2,
      depth: 8,
      open: "Research",
      data: 12,
    },
    {
      label: "390x844 ts2 store",
      width: 390,
      height: 844,
      textScale: 2,
      depth: 8,
      open: "Store",
      data: 12,
    },
    {
      label: "390x844 ts1 machine",
      width: 390,
      height: 844,
      textScale: 1,
      depth: 8,
      open: "machine",
      data: 12,
      tiles: [24, 25, 26, 27, 28, 29, 30, 31],
    },
  ]) {
    const { result, pageErrors, envelope, report } = await withPage(browser, cell, async (page) => {
      const tiles = yardFrame(cell.depth, cell.purse ?? 34, cell.data ?? 0, cell.tiles).machines.map(
        (machine) => machine.tile
      );
      const machine = cell.open === "machine" ? await openMachinePanel(page, tiles) : null;
      const opened = cell.open === "machine" ? null : await openPanel(page, cell.open);
      const measured = await page.evaluate(readCell);
      // "The panel body scrolls with a visible target": drive its own scroll to the bottom
      // and re-read, so the last painted line is proven reachable inside the body box.
      const scrolled = await scrollPanelBody(page);
      await page.waitForTimeout(80);
      const afterScroll = await page.evaluate(readCell);
      return { measured, machine, opened, scrolled, afterScroll };
    });
    rows.push({ cell, ...result, pageErrors, envelope, report });
  }
  for (const row of rows) {
    const m = row.measured;
    console.log(
      `\n[${row.cell.label}] saved ${JSON.stringify(row.envelope)} panels ${m.panelCount}` +
        ` hudContentBox.height ${m.hudContentBoxHeight}` +
        ` open attempts ${JSON.stringify(row.opened?.attempts ?? null)}` +
        ` faces ${JSON.stringify(row.opened?.faces ?? [])}`
    );
    if (row.machine)
      console.log(
        `  machine panel ${JSON.stringify(row.machine.panel)}` +
          ` tapped ${JSON.stringify(row.machine.points)} (tile centres via the shipped fitCamera)`
      );
    console.log(
      `  boot report overlay: "${row.report.label}" ${row.report.widthPx}x${row.report.heightPx}px` +
        ` -> panels ${row.report.panelsBefore} to ${row.report.panelsAfter}`
    );
    for (const panel of m.panels) {
      console.log(
        `  panel "${panel.label}" dismiss "${panel.headDismiss}"${JSON.stringify(panel.headDismissBox)}` +
          ` in-view ${panel.headDismissInView} rows ${panel.rows}` +
          ` dl ${panel.dlCount} alignment ${panel.alignmentOk}` +
          ` body ${panel.bodyClientWidth}px cw / sh ${panel.bodyScrollHeight} ch ${panel.bodyClientHeight}` +
          ` scrollable ${panel.bodyScrollable} scrollTop ${panel.bodyScrollTop}` +
          ` lastRowInsideBody ${panel.lastRowInsideBody} (bottom ${panel.lastRowBottom})` +
          ` lastNodeInsideBody ${panel.lastNodeInsideBody} (bottom ${panel.lastNodeBottom})`
      );
      console.log(
        `    U-4 rows: widths ${JSON.stringify(panel.rowWidths)}` +
          ` vs body clientWidth ${panel.bodyClientWidth};` +
          ` dl overflow ${JSON.stringify(panel.dlOverflowX)}` +
          ` dt overflow ${JSON.stringify(panel.dtOverflows)} dd overflow ${JSON.stringify(panel.ddOverflows)}`
      );
      for (const detail of panel.rowDetails)
        console.log(
          `      row dTop ${detail.topDelta} leftGap ${detail.leftGap}` +
            ` sameLineBox ${detail.sameLineBox} valueAfterLabel ${detail.valueAfterLabel}` +
            ` ddLines ${detail.ddWrapping} "${detail.text}"`
        );
      console.log(
        `    printed values: capacity pair "${panel.capacityPair}"` +
          ` repeated ${JSON.stringify(panel.repeatedValues)} (empty = every value once)`
      );
      for (const node of panel.nodes)
        console.log(
          `      node "${node.name}" card w ${node.width} overflowX ${node.cardOverflowX}` +
            ` name ${JSON.stringify(node.nameBox)} effect ${JSON.stringify(node.effectBox)}` +
            ` state ${JSON.stringify(node.stateBox)} foot ${JSON.stringify(node.footBox)}` +
            ` rightMostInk ${node.rightMostInk} buy "${node.buy}"`
        );
    }
    const tail = row.afterScroll?.panels ?? [];
    for (const panel of tail)
      console.log(
        `    after scroll-to-bottom "${panel.label}" scrollTop ${panel.bodyScrollTop}` +
          `/${panel.bodyScrollHeight} ch ${panel.bodyClientHeight}` +
          ` body ${panel.bodyTop}..${panel.bodyBottom}` +
          ` lastRowInsideBody ${panel.lastRowInsideBody}` +
          ` lastNodeInsideBody ${panel.lastNodeInsideBody} (bottom ${panel.lastNodeBottom})` +
          ` dismiss in-view ${panel.headDismissInView}`
      );
    console.log(
      `  U-4 no page scroll: ${m.pageScroll.height <= m.inner.height && m.pageScroll.width <= m.inner.width}` +
        ` (${m.pageScroll.width}x${m.pageScroll.height} vs ${m.inner.width}x${m.inner.height})` +
        `; node-card overflow ${JSON.stringify(m.panels.map((p) => p.nodeCardOverflow))}` +
        `; hudContentBox.height ${m.hudContentBoxHeight}` +
        `; pageerrors ${row.pageErrors.length}`
    );
  }
  return rows;
}

// --------------------------------------------------------------- pass 3: U-5 dismiss chain
async function passDismiss(browser) {
  const cell = {
    label: "360x640 ts2 dismiss",
    width: 360,
    height: 640,
    textScale: 2,
    depth: 8,
    data: 12,
  };
  const { result, pageErrors, report } = await withPage(browser, cell, async (page) => {
    const log = [];
    const openBy = async (name) => {
      const opened = await openPanel(page, name);
      return { panels: opened.panels, faces: opened.faces, attempts: opened.attempts };
    };
    for (const name of ["Store", "Research", "Yard"]) {
      const opened = await openBy(name);
      const dismiss = await page.evaluate(() => {
        const panel = document.querySelector(".panel");
        const button = panel?.querySelector(".panel__head button");
        const rect = button?.getBoundingClientRect();
        if (button) button.click();
        return {
          text: button?.textContent ?? null,
          height: rect ? Math.round(rect.height) : 0,
          width: rect ? Math.round(rect.width) : 0,
          top: rect ? Math.round(rect.top) : null,
          inView: rect ? rect.top >= 0 && rect.bottom <= window.innerHeight + 0.5 : null,
        };
      });
      await page.waitForTimeout(120);
      const afterTarget = await page.evaluate(() => document.querySelectorAll(".panel").length);
      const reopened = await openBy(name);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      const afterEscape = await page.evaluate(() => document.querySelectorAll(".panel").length);
      log.push({ overlay: name, opened, dismiss, afterTarget, reopened, afterEscape });
    }
    // Build mode is the other overlay: Escape must retire the ghost, then the panel.
    const built = await clickFaceExactly(page, "Build");
    await page.waitForTimeout(120);
    const ghostLine = await page.evaluate(
      () => document.querySelector(".status-line")?.textContent ?? null
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    const ghostAfterEscape = await page.evaluate(
      () => document.querySelector(".status-line")?.textContent ?? null
    );
    const panelsAfterGhostEscape = await page.evaluate(
      () => document.querySelectorAll(".panel").length
    );
    const hudHeight = await page.evaluate(
      () => document.querySelector(".hud")?.clientHeight ?? null
    );
    return { log, built, ghostLine, ghostAfterEscape, panelsAfterGhostEscape, hudHeight };
  });
  console.log(
    `\n[${cell.label}] U-5 overlay dismiss chain (pageerrors ${pageErrors.length})` +
      `; boot report "${report.label}" ${report.widthPx}x${report.heightPx}px` +
      ` -> panels ${report.panelsBefore} to ${report.panelsAfter}`
  );
  for (const entry of result.log)
    console.log(
      `  ${entry.overlay}: opened ${entry.opened.panels} panel(s) (face index ${entry.opened.faces.indexOf(entry.overlay)})` +
        `; visible target "${entry.dismiss.text}" ${entry.dismiss.width}x${entry.dismiss.height}px` +
        ` top ${entry.dismiss.top} in-view ${entry.dismiss.inView} -> ${entry.afterTarget} panel(s)` +
        `; reopen ${entry.reopened.panels} (face index ${entry.reopened.faces.indexOf(entry.overlay)})` +
        ` -> Escape -> ${entry.afterEscape} panel(s)`
    );
  console.log(
    `  build mode (face index ${result.built.index}): ghost line "${result.ghostLine}"` +
      ` -> Escape -> "${result.ghostAfterEscape}" (${result.panelsAfterGhostEscape} panel(s))`
  );
  return result;
}

// ----------------------------------------- pass 3b: U-5 the two-layer overlay stack (g3)
/**
 * One reading of the overlay stack. `panelCount` is the number the criterion counts
 * (`2 -> 1 -> 0`); `layers` says which layer owns which painted slot (`order`), how tall it
 * is allowed to be (`max-height`), and whether its own dismiss target is inside the
 * viewport; the rest is the yard behind it: the canvas inside `#root`, the card ratio and
 * `body.scrollHeight` against `innerHeight` (the no-scroll gate, stated as equality).
 */
const readStack = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const layers = [...document.querySelectorAll(".panel")].map((panel) => {
    const dismiss = panel.querySelector(".panel__head button");
    const r = dismiss?.getBoundingClientRect();
    return {
      title: text(panel.querySelector(".panel__title")),
      order: getComputedStyle(panel).order,
      maxHeight: getComputedStyle(panel).maxHeight,
      dismiss: text(dismiss),
      top: r ? round(r.top) : null,
      bottom: r ? round(r.bottom) : null,
      heightPx: r ? round(r.height) : null,
      inView: r ? r.top >= 0 && r.bottom <= window.innerHeight + 0.5 && r.height >= 44 : null,
    };
  });
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const canvas = document.querySelector("#root canvas");
  const canvasBox = canvas?.getBoundingClientRect();
  return {
    panelCount: layers.length,
    layers,
    cardHeightPx: card ? round(card.getBoundingClientRect().height) : null,
    hudContentBoxHeight: hud ? hud.clientHeight : null,
    canvasInRoot: !!canvas,
    canvasBox: canvasBox
      ? { w: round(canvasBox.width), h: round(canvasBox.height) }
      : null,
    bodyScrollHeight: document.body.scrollHeight,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  };
};

/** Clicks the painted layer nearest the dock (the greatest `order`), i.e. a thumb tap. */
const tapPaintedTarget = (page) =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".panel")];
    const rank = (node) => Number(getComputedStyle(node).order || 0);
    const top = nodes.reduce(
      (best, node, index) =>
        nodes.length === 0
          ? null
          : best === null || rank(node) >= rank(best.node)
            ? { node, index }
            : best,
      null
    );
    const button = top?.node.querySelector(".panel__head button");
    const label = button ? (button.textContent ?? "").trim() : null;
    if (button) button.click();
    return { label, order: top ? rank(top.node) : null };
  });

async function passStack(browser) {
  const cells = [
    { label: "360x640 ts2 store back=keys", width: 360, height: 640, textScale: 2, depth: 8, data: 12, open: "Store", via: "keys" },
    { label: "360x640 ts2 store back=taps", width: 360, height: 640, textScale: 2, depth: 8, data: 12, open: "Store", via: "taps" },
    { label: "390x844 ts1 yard back=keys", width: 390, height: 844, textScale: 1, depth: 8, data: 12, open: "Yard", via: "keys" },
    { label: "390x844 ts1 yard back=taps", width: 390, height: 844, textScale: 1, depth: 8, data: 12, open: "Yard", via: "taps" },
    // The wide gutter (>= 1200 px) puts the two layers in one column with their own `top`
    // values, so it gets measured pixels rather than the declared ones (UI-002 g3).
    { label: "1440x900 ts1 store back=keys", width: 1440, height: 900, textScale: 1, depth: 8, data: 12, open: "Store", via: "keys" },
    { label: "1440x900 ts1 store back=taps", width: 1440, height: 900, textScale: 1, depth: 8, data: 12, open: "Store", via: "taps" },
  ];
  const rows = [];
  for (const cell of cells) {
    const { result, pageErrors, envelope, report } = await withPage(browser, { ...cell, keepReport: true }, async (page) => {
      const steps = [];
      const presses = [];
      const step = async (label, press) => {
        const s = await page.evaluate(readStack);
        steps.push({ label, press: press ?? null, ...s });
        return s;
      };
      const opened = await openPanel(page, cell.open);
      await step(`after face "${cell.open}"`);
      // The two-layer frame itself, captured before anything is retired: the deepest the
      // column ever gets, which is the frame the 26 % budget is for.
      if (process.env.UI002_SHOTS) {
        await page.screenshot({
          path: `${process.env.UI002_SHOTS}/ui002-${cell.label.replace(/ /g, "-")}-stacked.png`,
        });
      }
      for (let press = 1; press <= 3; press += 1) {
        let how = null;
        if (cell.via === "keys") {
          await page.keyboard.press("Escape");
          how = "Escape";
        } else {
          how = (await tapPaintedTarget(page)).label;
        }
        await page.waitForTimeout(140);
        const s = await step(`press ${press}`, how);
        presses.push(s.panelCount);
      }
      // One more press on the plain yard must not remove the chrome or the canvas.
      if (cell.via === "keys") await page.keyboard.press("Escape");
      else await tapPaintedTarget(page);
      await page.waitForTimeout(140);
      await step("one press too many", "extra");
      return { steps, presses, opened };
    });
    rows.push({ cell, ...result, pageErrors, envelope, report });
  }
  for (const row of rows) {
    const deepest = Math.max(...row.steps.map((s) => s.panelCount));
    console.log(
      `\n[${row.cell.label}] purse 34 saved ${JSON.stringify(row.envelope)}` +
        ` boot report "${row.report.label}" ${row.report.widthPx}x${row.report.heightPx}px` +
        ` kept ${row.report.kept}` +
        `; opened via face index ${row.opened.index ?? row.opened.attempts?.[0]?.index ?? -1}` +
        `; deepest stack ${deepest} layer(s); pageerrors ${row.pageErrors.length}` +
        `${row.pageErrors.length ? ": " + row.pageErrors.join(" | ") : ""}`
    );
    for (const s of row.steps) {
      const ratio =
        s.cardHeightPx !== null && s.hudContentBoxHeight
          ? Math.round((s.cardHeightPx / s.hudContentBoxHeight) * 1000) / 10
          : null;
      console.log(
        `  ${s.label}${s.press ? ` (${s.press})` : ""}: overlays ${s.panelCount}` +
          ` [${s.layers
            .map(
              (l) =>
                `"${l.title}" order ${l.order} cap ${l.maxHeight}` +
                ` target "${l.dismiss}" ${l.heightPx}px top ${l.top}..${l.bottom} in-view ${l.inView}`
            )
            .join(" | ")}]`
      );
      console.log(
        `      yard: .objective ${s.cardHeightPx}px / hudContentBox.height ${s.hudContentBoxHeight}` +
          ` = ${ratio} % (cap 42 %); #root canvas ${JSON.stringify(s.canvasBox)}` +
          ` present ${s.canvasInRoot}` +
          `; body.scrollHeight ${s.bodyScrollHeight} == innerHeight ${s.innerHeight}` +
          ` ${s.bodyScrollHeight === s.innerHeight ? "(no page scroll)" : "(SCROLLS)"}`
      );
    }
    console.log(
      `  chain ${row.steps.map((s) => s.panelCount).join(" -> ")}` +
        ` (expected 2 -> 1 -> 0 -> 0 for a two-deep stack)`
    );
  }
}

// ------------------------------------------------- pass 4: U-3 fork + U-1 cell with refusal
async function passFork(browser) {
  const cell = {
    label: "360x640 ts2 8-machine fork-open + refused tap",
    width: 360,
    height: 640,
    textScale: 2,
    depth: 8,
    purse: 30,
    live: true,
  };
  const { result, pageErrors, envelope, report, sim } = await withPage(browser, cell, async (page) => {
    const before = await page.evaluate(readCell);
    const personaBefore = await page.evaluate(readPersona);
    // One refused tap: the dearer face at a 30-credit purse.
    await tapFace(page, 1);
    await page.waitForTimeout(120);
    const refused = await page.evaluate(() => document.querySelector(".toast")?.textContent ?? null);
    const measured = await page.evaluate(readCell);
    const persona = await page.evaluate(readPersona);
    const toast = await page.evaluate(() => document.querySelector(".toast")?.textContent ?? null);
    const levelSum = () =>
      page.evaluate(() => {
        try {
          const raw = JSON.parse(localStorage.getItem("rustwake.save.v1") ?? "");
          return raw.payload.sim.machines.reduce((t, m) => t + m.level, 0);
        } catch {
          return null;
        }
      });
    const levelSumBefore = await levelSum();
    // U-3: the FIRST leftmost tap, once, blind. The store persists on a 1 s timer, so the
    // level sum is polled rather than guessed at (the DOM card is read at the same moment).
    await tapFace(page, 0);
    let levelSumAfter = await levelSum();
    for (let i = 0; i < 12; i += 1) {
      if (levelSumAfter !== levelSumBefore) break;
      await page.waitForTimeout(120);
      levelSumAfter = await levelSum();
    }
    const after = await page.evaluate(readCell);
    return { before, personaBefore, refused, measured, persona, toast, levelSumBefore, levelSumAfter, after };
  });
  const m = result.measured;
  const ratio = Math.round((m.cardBox.h / m.hudContentBoxHeight) * 1000) / 10;
  console.log(`\n[${cell.label}] purse ${cell.purse} saved ${JSON.stringify(envelope)}`);
  console.log(
    `  boot report overlay: "${report.label}" ${report.widthPx}x${report.heightPx}px` +
      ` -> panels ${report.panelsBefore} to ${report.panelsAfter}`
  );
  console.log(`  sim(app persisted) ${JSON.stringify(sim)}`);
  console.log(
    `  sim(node frame)    ${JSON.stringify(simRead(yardFrame(cell.depth, cell.purse, cell.data ?? 0)))}`
  );
  const accentIdx = m.faces.findIndex(
    (f) => (f.backgroundImage || "").indexOf("linear-gradient") === 0
  );
  console.log(
    `  accent-filled face index ${accentIdx} of ${m.faces.length}` +
      ` (${m.faces.map((f, i) => i + ":" + f.text).join(" | ")})`
  );
  console.log(
    `  U-1 hudContentBox.height ${m.hudContentBoxHeight}; .objective ${m.cardBox.h}px => ${ratio} % (cap 42 %)`
  );
  console.log(`  card: "${m.cardText}"`);
  for (const line of m.cardLines)
    console.log(
      `    ${line.role} font ${line.fontSizePx}px w${line.fontWeight} wrappedBoxes ${line.wrappedBoxes}` +
        ` sw${line.scrollWidth}/cw${line.clientWidth} "${line.text}"`
    );
  console.log(`  refused tap printed: "${result.refused}" (toast now "${result.toast}")`);
  console.log(`  persona before the refused tap ${JSON.stringify(result.personaBefore)}`);
  console.log(`  persona after the refused tap ${JSON.stringify(result.persona)}`);
  for (const face of m.faces)
    console.log(
      `    face [${face.box.w}x${face.box.h} top ${face.box.top} font ${face.fontSizePx}px w${face.fontWeight}]` +
        ` bg ${face.background} L ${JSON.stringify(face.luminance)} "${face.text}"`
    );
  console.log(
    `  U-3 leftmost face before the tap "${result.measured.faces[0]?.text}"` +
      ` (accent-filled index ${result.measured.faces.findIndex(
        (f) => (f.backgroundImage || "").indexOf("linear-gradient") === 0
      )}) prices` +
      ` ${JSON.stringify(result.measured.faces.map((f) => f.text))}` +
      `; machine level sum ${result.levelSumBefore} -> ${result.levelSumAfter} after one leftmost tap` +
      `; dock row after the paid tap ${JSON.stringify(result.after.faces.map((f) => f.text))}`
  );
  console.log(
    `  U-7 smallest face ${Math.round(m.faces.reduce((a, f) => Math.min(a, f.box.w, f.box.h), 999) * 10) / 10}px` +
      `; page scroll ${m.pageScroll.width}x${m.pageScroll.height} vs ${m.inner.width}x${m.inner.height}` +
      `; pageerrors ${pageErrors.length}${pageErrors.length ? ": " + pageErrors.join(" | ") : ""}`
  );
  return { cell, measured: m, ...result, pageErrors };
}

function entryChunkBytes() {
  return readdirSync("dist/assets")
    .filter((name) => /^index-.*\.js$/.test(name))
    .map((name) => ({ name, bytes: readFileSync(`dist/assets/${name}`).length }));
}

const run = async () => {
  const only = process.env.UI002_PASS ?? "rest,panel,dismiss,stack,fork";
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    if (only.includes("rest")) await passRest(browser);
    if (only.includes("panel")) await passPanel(browser);
    if (only.includes("dismiss")) await passDismiss(browser);
    if (only.includes("stack")) await passStack(browser);
    if (only.includes("fork")) await passFork(browser);
  } finally {
    await browser.close();
  }
  console.log(`\nentry chunk ${JSON.stringify(entryChunkBytes())} (base 231262 B, ceiling 233000 B)`);
};

await run();

