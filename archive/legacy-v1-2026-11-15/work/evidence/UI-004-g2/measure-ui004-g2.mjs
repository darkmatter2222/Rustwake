// UI-004 g2: the amber-string legibility census for Issue #19 (https://github.com/darkmatter2222/Rustwake/issues/19)
//
// Method inherited from `scripts/measure-legibility.mjs` (UI-004 g1) so every number is
// comparable with the recorded baseline: `getComputedStyle` for the px, WCAG relative luminance
// of the *resolved* colours for the ratio, alpha dropped from the background colour (the player
// lane's method, which reproduces the baseline 10.8 px / 2.67:1 exactly).
//
// g2 adds three columns/passes on purpose:
//   ratioEffective  - the same pair with the element's own `opacity` chain painted down as well,
//                     so a dimmed (`:disabled`, opacity 0.55) face is scored on the ink the eye
//                     actually meets instead of the declared token;
//   sweep           - EVERY visible text node in the HUD/panel layer, not only the 13 named
//                     selectors, each with its own effective ratio (acceptance row 2);
//   panel states    - Store / Yard / Research opened from a seeded 8-machine save at A 1 and
//                     A 1.5, which is where the accent-filled `.node__buy` and the amber cost
//                     chip live, including its disabled form.
//
// W-3 protocol: 390x844, deviceScaleFactor 2, isMobile + hasTouch, fresh storage, one tap per
// second on the accent-filled primary, then the `A` control twice (1 -> 1.25 -> 1.5).
//
// Run (from the worktree root):
//   npm run build
//   npx vite preview --port 4183                                  (background)
//   RUSTWAKE_URL=http://localhost:4183/ npx tsx work/evidence/UI-004-g2/measure-ui004-g2.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { BLUEPRINTS, TUNING } from "../../../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../../src/game/simulation/commands";
import { planConnections } from "../../../src/game/simulation/autoconnect";
import { advance } from "../../../src/game/simulation/engine";
import { createInitialState } from "../../../src/game/simulation/types";
import { encodeSave } from "../../../src/game/persistence/save";

const OUT = "work/evidence/UI-004-g2/";
const CAPTURES = OUT + "captures/";
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const SAVE_KEY = "rustwake.save.v1";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate));

/** `[selector, census label]`, one row per pair, up to three painted nodes each (g1's list). */
const ELEMENTS = [
  [".objective__primary", "objective primary"],
  [".objective .status-line", "objective status line"],
  [".dock__btn", "dock face label (plain fill)"],
  [".dock__btn--primary", "dock face label (amber fill)"],
  [".dock__cost", "dock price (plain fill)"],
  [".dock__btn--primary .dock__cost", "dock price (amber fill)"],
  [".resources__item", "resource chip"],
  [".hud .icon-btn", "cluster button"],
  [".panel dt", "panel label"],
  [".panel dd", "panel value"],
  [".node__effect", "research effect"],
  [".node__cost", "research cost"],
  [".toast", "toast"],
];

/** Extra selectors that only exist with a panel open. */
const PANEL_ELEMENTS = [
  ...ELEMENTS,
  [".panel__title", "panel title"],
  [".panel__lead-key", "panel lead key"],
  [".panel__lead-value", "panel lead value"],
  [".node__title", "research title"],
  [".node__state", "research state"],
  [".node__buy", "research buy target"],
];

const GROUND = [8, 13, 24];

/** Runs inside the page: one reading of the census selectors + the full visible-string sweep. */
const readPage = (elements) => {
  const GROUND = [8, 13, 24];
  const round = (n) => Math.round(n * 100) / 100;
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value ?? "");
    if (!m) return null;
    const parts = m[1].split(",").map((part) => parseFloat(part.trim()));
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const rgbOf = (value) => parse(value)?.rgb ?? [0, 0, 0];
  const channel = (raw) => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (parts) => 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2]);
  const ratioOfLum = (a, b) => round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
  /** g1's census column: the declared ink over the nearest painted background, alpha dropped. */
  const ratio = (fg, bg) => ratioOfLum(lum(rgbOf(fg)), lum(rgbOf(bg)));
  const over = (src, dst) => src.rgb.map((c, i) => round(c * src.a + dst[i] * (1 - src.a)));
  const transparent = (colour) => !colour || /rgba\(0, 0, 0, 0\)|transparent/.test(colour);

  /** Every painted layer above the page ground, farthest ancestor first. */
  const layersOf = (node) => {
    const stack = [];
    let walk = node;
    while (walk) {
      const style = getComputedStyle(walk);
      const image = style.backgroundImage ?? "";
      const colour = style.backgroundColor;
      const own = [];
      if (!transparent(colour)) own.push(parse(colour));
      if (image.indexOf("linear-gradient") === 0) {
        const stops = [...image.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter(Boolean);
        own.push(...stops);
      }
      if (own.length) stack.unshift(...own);
      walk = walk.parentElement;
    }
    return stack;
  };
  const paint = (layers) => layers.reduce((acc, layer) => (layer ? over(layer, acc) : acc), GROUND);

  /** The product of the `opacity` chain, i.e. the alpha the ink really arrives with. */
  const alphaChain = (node) => {
    let alpha = 1;
    let walk = node;
    while (walk) {
      const value = parseFloat(getComputedStyle(walk).opacity);
      if (!Number.isNaN(value)) alpha *= value;
      walk = walk.parentElement;
    }
    return round(alpha);
  };

  const measure = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const layers = layersOf(node);
    const nearest = [...layers].reverse().find(Boolean);
    const inkLum = lum(rgbOf(style.color));
    // The composited column walks the chain: the whole stack, and the stack minus the last
    // gradient stop, so the worst pixel row of a gradient fill is what is scored.
    const paintedAll = paint(layers);
    const paintedNoLastStop = layers.length > 1 ? paint(layers.slice(0, -1)) : paintedAll;
    const composite = [paintedAll, paintedNoLastStop].map((parts) => ratioOfLum(inkLum, lum(parts)));
    const alpha = alphaChain(node);
    const inkOver = (parts) =>
      ratioOfLum(lum([0, 1, 2].map((i) => round(parseFloat(style.color.match(/[\d.]+/g)[i]) * alpha + parts[i] * (1 - alpha)))), lum(parts));
    const effective = [inkOver(paintedAll), inkOver(paintedNoLastStop)].map((value) => round(value));
    return {
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 46),
      px: round(parseFloat(style.fontSize)),
      ratio: ratio(style.color, nearest ? `rgb(${nearest.rgb.join(",")})` : style.color),
      ratioComposited: Math.min(...composite),
      opacity: alpha,
      ratioEffective: Math.min(...effective),
      color: style.color,
      bg: nearest ? `rgb(${nearest.rgb.join(",")})` : null,
      layers: layers.filter(Boolean).length,
      heightPx: round(rect.height),
      widthPx: round(rect.width),
      clipped: node.scrollWidth > Math.ceil(rect.width) + 0.5,
      overflowYpx: node.scrollHeight - node.clientHeight,
    };
  };

  const rows = [];
  for (const [selector, label] of elements) {
    const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 3);
    nodes.forEach((node, index) => rows.push({ label, index, ...measure(node) }));
  }

  // The full sweep: every element that paints its own text, at any depth.
  const sweep = [];
  const all = document.querySelectorAll(".game *");
  for (const node of all) {
    const ownText = Array.from(node.childNodes).some(
      (child) => child.nodeType === 3 && (child.textContent ?? "").trim().length > 0
    );
    if (!ownText) continue;
    const rect = node.getBoundingClientRect();
    if (rect.height < 0.5 || rect.width < 0.5) continue;
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const cls = node.className && typeof node.className === "string" ? node.className : node.tagName.toLowerCase();
    sweep.push({ selector: `${cls}`, ...measure(node) });
  }

  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const root = document.documentElement;
  const targets = Array.from(document.querySelectorAll(".dock .dock__btn, .hud .icon-btn, .node__buy, .panel__actions .icon-btn")).map(
    (node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
        h: round(rect.height),
        w: round(rect.width),
        disabled: Boolean(node.disabled),
      };
    }
  );
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    dpr: window.devicePixelRatio,
    rootFontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textScaleProperty: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    rows,
    sweep,
    targets,
    cardFillPct: card && hud ? round((card.getBoundingClientRect().height / hud.clientHeight) * 1000) / 10 : null,
    pageScroll: {
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
  };
};

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

/** The seeded 8-machine yard used by `scripts/measure-ui002.mjs` (same cadence, same purse). */
function yardFrame(depth, credits = 34, data = 0) {
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
  order.forEach((blueprint) => {
    fund(blueprint);
    send({ type: "machine.build", blueprint, tile: firstFreeTile(state) });
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

const bootFresh = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const pageErrors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
  return { context, page, pageErrors };
};

const bootSeeded = async (browser, textScale) => {
  const state = yardFrame(8, 34, 12);
  const save = encodeSave(state, 10, { textScale, muted: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
  await page.waitForTimeout(1350);
  // Retire the return report so the cell starts on the plain resting screen.
  await page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const target = panel?.querySelector(".icon-btn");
    if (target) target.click();
  });
  await page.waitForTimeout(200);
  return { context, page, pageErrors };
};

const press = async (page, name) => {
  const button = page.getByRole("button", { name }).first();
  if ((await button.count()) > 0) await button.click({ force: true });
  await page.waitForTimeout(220);
};

const clickTextScaleControl = async (page) => {
  const button = page.locator(".hud .icon-btn", { hasText: "A " });
  if ((await button.count()) > 0) await button.first().click({ force: true });
  await page.waitForTimeout(350);
};

const censusOf = (steps, elements) => {
  const ladder = new Map();
  for (const step of steps)
    for (const entry of step.rows) {
      const key = `${entry.label} #${entry.index}`;
      if (!ladder.has(key))
        ladder.set(key, { text: entry.text, px: [], ratio: [], ratioComposited: [], ratioEffective: [], clipped: [] });
      const bucket = ladder.get(key);
      bucket.px.push(entry.px);
      bucket.ratio.push(entry.ratio);
      bucket.ratioComposited.push(entry.ratioComposited);
      bucket.ratioEffective.push(entry.ratioEffective);
      bucket.clipped.push(entry.clipped);
    }
  return [...ladder.entries()].map(([element, bucket]) => ({
    element,
    text: bucket.text,
    px: bucket.px,
    ratio: bucket.ratio,
    ratioComposited: bucket.ratioComposited,
    ratioEffective: bucket.ratioEffective,
    monotonic: bucket.px.length === 3 && bucket.px[1] >= bucket.px[0] && bucket.px[2] >= bucket.px[1],
    clipped: bucket.clipped.some((value) => value),
    priceFloorPass: element.startsWith("dock price") ? bucket.px.every((px) => px >= 12) : null,
    aaPass: bucket.ratioEffective.every((value) => value >= 4.5),
    ladderSteps: bucket.px.length,
  }));
};

const minOf = (rows, key) =>
  rows.length ? Math.min(...rows.map((row) => row[key])) : null;

const browser = await chromium.launch({ headless: true, executablePath });
mkdirSync(CAPTURES, { recursive: true });

// ---------------------------------------------------------------- pass 1: the A ladder at rest
const stepLabels = ["A 1", "A 1.25", "A 1.5"];
const ladderSteps = [];
const ladderErrors = [];
{
  const { context, page, pageErrors } = await bootFresh(browser);
  for (let i = 0; i < 12; i += 1) {
    const primary = page.locator(".dock__btn--primary");
    if ((await primary.count()) > 0) await primary.first().click({ force: true });
    await page.waitForTimeout(1000);
  }
  for (let i = 0; i < stepLabels.length; i += 1) {
    if (i > 0) await clickTextScaleControl(page);
    const measured = await page.evaluate(readPage, ELEMENTS);
    ladderSteps.push({ label: stepLabels[i], scale: measured.textScaleProperty, ...measured });
    await page.screenshot({ path: `${CAPTURES}ladder-${stepLabels[i].replace(/ /g, "")}-390x844-dpr2.png` });
  }
  ladderErrors.push(...pageErrors);
  await context.close();
}

// ------------------------------------------------------- pass 2: the panel states, seeded yard
const panelStates = [];
for (const textScale of [1, 1.5]) {
  for (const open of ["Store", "Yard", "Research"]) {
    const { context, page, pageErrors } = await bootSeeded(browser, textScale);
    await press(page, open);
    const measured = await page.evaluate(readPage, PANEL_ELEMENTS);
    panelStates.push({
      label: `390x844 A ${textScale} ${open}`,
      textScale,
      pageErrors: pageErrors.slice(),
      ...measured,
    });
    await page.screenshot({
      path: `${CAPTURES}panel-A${textScale}-${open.toLowerCase()}-390x844-dpr2.png`,
    });
    await context.close();
  }
}
await browser.close();

// ------------------------------------------------------------------------- witnesses + report
const ladderCensus = censusOf(ladderSteps, ELEMENTS);
const witness = (step) => ({
  label: step.label,
  scale: step.scale,
  textLarge: step.textLarge,
  rootFontPx: step.rootFontPx,
  clipped: step.rows.filter((r) => r.clipped).map((r) => `${r.label} #${r.index}`),
  sweepClipped: step.sweep.filter((r) => r.clipped).map((r) => `${r.selector} "${r.text}"`),
  verticalOverflow1pxRows: step.rows
    .filter((r) => r.overflowYpx > 0)
    .map((r) => `${r.label} #${r.index} +${r.overflowYpx}px`),
  minTargetPx: step.targets.length ? Math.min(...step.targets.map((t) => Math.min(t.h, t.w))) : null,
  targets: step.targets,
  noPageScroll:
    step.pageScroll.scrollHeight === step.pageScroll.innerHeight &&
    step.pageScroll.scrollWidth === step.pageScroll.innerWidth,
  pageScroll: step.pageScroll,
  cardFillPct: step.cardFillPct,
  sweepSize: step.sweep.length,
  sweepMinRatio: minOf(step.sweep, "ratioEffective"),
  sweepMinPx: minOf(step.sweep, "px"),
});

const sweepFailures = [];
for (const step of [...ladderSteps, ...panelStates])
  for (const row of step.sweep)
    if (row.ratioEffective < 4.5)
      sweepFailures.push({ step: step.label, selector: row.selector, text: row.text, px: row.px, ratio: row.ratio, ratioEffective: row.ratioEffective, opacity: row.opacity });

const report = {
  ticket: "UI-004 g2",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/19",
  window: "W-3 (180 s wall, 1 tap/s, 390x844 dpr2, isMobile + hasTouch, fresh storage)",
  url,
  columns: stepLabels,
  floors: { dockCostPx: 12, aaRatio: 4.5, tapTargetPx: 44, cardFillPct: 42 },
  census: ladderCensus,
  witnesses: ladderSteps.map(witness),
  panelStates: panelStates.map((step) => ({
    ...witness(step),
    pageErrors: step.pageErrors,
    census: step.rows.map((row, index) => ({ ...row, index })),
  })),
  sweepFailures,
  pageErrors: { ladder: ladderErrors, panels: panelStates.reduce((total, s) => total + s.pageErrors.length, 0) },
  entryChunk: readdirSync("dist/assets")
    .filter((name) => /^index-.*\.js$/.test(name))
    .map((name) => ({ name, bytes: readFileSync(`dist/assets/${name}`).length })),
};
writeFileSync(`${OUT}ui004-g2-census.json`, JSON.stringify(report, null, 1), "utf8");

for (const step of ladderSteps)
  console.log(
    `\n[${step.label}] --text-scale ${step.textScaleProperty} text-large ${step.textLarge}` +
      ` root font ${step.rootFontPx}px ${step.inner.width}x${step.inner.height} dpr ${step.dpr}` +
      ` | card fill ${step.cardFillPct} % (cap 42 %)` +
      ` | sweep ${step.sweep.length} strings, min effective ${minOf(step.sweep, "ratioEffective")}:1, min px ${minOf(step.sweep, "px")}`
  );
console.log(`\ncensus (${stepLabels.join(" | ")}) - px / ratio / composited / effective`);
for (const row of ladderCensus)
  console.log(
    `  ${row.element.padEnd(30)}` +
      ` px ${JSON.stringify(row.px).padEnd(24)}` +
      ` mono ${String(row.monotonic).padEnd(6)}` +
      ` ratio ${JSON.stringify(row.ratio).padEnd(24)}` +
      ` comp ${JSON.stringify(row.ratioComposited).padEnd(24)}` +
      ` eff ${JSON.stringify(row.ratioEffective).padEnd(24)}` +
      ` aa ${row.aaPass}${row.priceFloorPass === null ? "" : ` costFloor ${row.priceFloorPass}`}` +
      ` steps ${row.ladderSteps}` +
      ` clipped ${row.clipped} "${row.text}"`
  );
for (const w of report.witnesses)
  console.log(
    `\n[witness ${w.label}] clipped ${JSON.stringify(w.clipped)} sweepClipped ${JSON.stringify(w.sweepClipped)}` +
      ` | min tap ${w.minTargetPx} px (floor 44) | no page scroll ${w.noPageScroll} ${JSON.stringify(w.pageScroll)}` +
      ` | card fill ${w.cardFillPct} % | 1px overflow ${JSON.stringify(w.verticalOverflow1pxRows)}`
  );
console.log(`\npanel states`);
for (const w of report.panelStates)
  console.log(
    `  ${w.label.padEnd(26)} strings ${String(w.sweepSize).padEnd(4)}` +
      ` min effective ${String(w.sweepMinRatio).padEnd(6)}:1` +
      ` min px ${String(w.sweepMinPx).padEnd(6)}` +
      ` min tap ${w.minTargetPx} px (floor 44)` +
      ` card fill ${w.cardFillPct} %` +
      ` pageerrors ${w.pageErrors.length}` +
      ` clipped ${JSON.stringify(w.sweepClipped)}`
  );
console.log(`\nsub-4.5 strings (opacity-aware): ${sweepFailures.length}`);
for (const row of sweepFailures)
  console.log(`  FAIL ${row.step} ${row.selector} "${row.text}" px ${row.px} opacity ${row.opacity} ratio ${row.ratio} effective ${row.ratioEffective}`);
console.log(`\nentry chunk ${JSON.stringify(report.entryChunk)} (ceiling 233000 B)`);
console.log(`pageerrors ${JSON.stringify(report.pageErrors)}`);
const nonMono = ladderCensus.filter((row) => !row.monotonic && row.ladderSteps === 3);
console.log(`non-monotonic named elements: ${nonMono.length}${nonMono.length ? ": " + nonMono.map((r) => r.element).join(", ") : ""}`);
