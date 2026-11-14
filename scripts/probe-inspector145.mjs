// Issue #145 headless evidence: the T18 inspector focus faces (U06) and the full
// engine before/after on every upgrade card (U05), exercised through the RUNNING
// build in headless Chrome at BOTH form factors (390x844 mobile, 1920x1080 desktop):
//   starved-source  - an inert starved sorter: the source face names the dock store,
//                     pans the camera through the gesture clamp, and dispatches
//                     nothing (revision, store and selection read back unchanged).
//   live-route      - the upgrade-55 seeded live yard: the route face names the
//                     busiest touching belt, pans to its run midpoint, and the
//                     live engine keeps its revision (ticks never bump it).
//   power           - five fed furnaces request 10 of 8 yard power: the power face
//                     opens the Power pane with the engine's exact demand/draw/
//                     speed rows, survives a manual close, and re-opens on tap.
//   upgrade-buy     - every card prints upgradeComparison's full before/after; a
//                     deliberate speed purchase reads back level/branch/credits/
//                     revision from the persisted mirror and re-prices the card.
//   upgrade-blocked - a zero-credit yard: the blocked tap reports the engine's own
//                     shortfall and the mirror proves nothing was spent or bumped.
//
// Fixture discipline (documented mutations, ALL in this probe, never in src):
//   * Every build/connect goes through the real command path (applyCommand) with
//     deterministic ids; the live yard replays the upgrade-55 pulse/repair sequence
//     and real `advance` ticks. Funding (store balance, credits) is the only seeding.
//   * Inert yards hold no belt, so the live tick loop cannot move material during
//     capture; the power yard keeps every tray below capacity for the capture window
//     (12-unit trays, 1 steel/batch, ~50 ticks/batch at 80%: >40 s of margin).
//   * Seeds are written with the game's own encodeSave at lastSeenMs = Date.now()
//     (no offline catch-up); each scenario page clears the multi-tab lease key so it
//     claims the writer role, and seeds once per TAB. Readback audits decode the
//     persisted frame mirror. Every action under test is a real DOM click.
//   * Camera assertions read the `data-cam` stamp (x,y toFixed(2), scale toFixed(3))
//     and compare against the clamp interval evaluated at the stamp's scale bounds,
//     so the check is exact at paint precision — no recomputed fit, no vision claims.
//   * The Routes pane is never opened: ContextPanes keys rows by label and the
//     sorter's two same-endpoint outputs collide (PRE-EXISTING at base 4cb479f,
//     documented in the issue evidence, not introduced or fixed here).
//
// Run:  npx vite preview --port 4295            (background, serves the built head)
//       npx tsx scripts/probe-inspector145.mjs
// env:  RUSTWAKE_URL (default http://localhost:4295/), INS145_SHOTS (default docs/evidence/inspector145)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { BLUEPRINTS, TUNING } from "../src/game/content/defs";
import {
  applyCommand,
  upgradeComparison,
  DOCK_TILE,
} from "../src/game/simulation/commands";
import {
  BUFFER_RANK_UNITS,
  UPGRADE_BRANCHES,
  createInitialState,
} from "../src/game/simulation/types";
import { advance } from "../src/game/simulation/engine";
import { rateReading, requestedPower } from "../src/game/simulation/diagnostics";
import { SAVE_KEY, checksum, decodeSave, encodeSave } from "../src/game/persistence/save";
import { LEASE_KEY } from "../src/game/persistence/lease";
import { tileToWorld, worldToScreen } from "../src/game/renderer/scene";
import { WORLD_H, WORLD_W } from "../src/game/renderer/grid";
import { COPY } from "../src/ui/inspector/copy";
import { HOME_COPY } from "../src/ui/home/copy";
import { endpointName, focusRoute, focusSource } from "../src/ui/inspector/model";
import { UPGRADE_COPY } from "../src/ui/upgrade/copy";
import { branchCards } from "../src/ui/upgrade/model";
import {
  formatNumber,
  formatRate,
  plural,
  t,
  unit,
  wholePercent,
} from "../src/game/content/strings";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4295/";
const shots = process.env.INS145_SHOTS ?? "docs/evidence/inspector145";
const TARGET = "docs/evidence/inspector145-headless.json";
const headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((path) => existsSync(path));

const SETTINGS = { muted: true, reducedMotion: false, textScale: 1 };
const WITNESS_MS = 1_700_000_000_000;
/** The camera stamp rounds x/y to 0.01 and scale to 0.001; the interval checks
 * below evaluate the clamp at the scale bounds and pad by the stamp precision. */
const SCALE_EPS = 0.0005;
const STAMP_PAD = 0.011;

let seq = 0;
const send = (state, body) => applyCommand(state, { ...body, id: `e145-${(seq += 1)}` });
const must = (state, body) => {
  const result = send(state, body);
  if (!result.ok) throw new Error(`fixture command refused: ${JSON.stringify(body)} ${result.reason}`);
};

/* ---- fixtures (real command path; funding is the only seeding) ---- */

/** Inert starved sorter: scrap 60 funds the 20-scrap build, no belt exists, so 60
 * ticks of real sim leave the machine starved and the store at the 40-unit balance. */
function starvedSourceYard() {
  seq = 0;
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 60;
  state.storeUnits = 60;
  must(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  advance(state, 60);
  return state;
}

/** The upgrade-55 seeded economy: six pulses, repair, build, links, 400 ticks of
 * real sim (belt latency puts the first batch near tick 160, so the 40 s rate
 * window holds a non-zero reading). Live yard: material flows during capture. */
function liveRouteYard() {
  seq = 0;
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    must(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  must(state, { type: "drone.repair" });
  advance(state, 262);
  must(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[state.machines.length - 1];
  must(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  must(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 400);
  state.tutorial = 9;
  state.exportClaimed = true;
  return state;
}

/** Five fed furnaces (2 power each) against the 8-unit yard budget: 200 ticks of
 * real sim leave every furnace mid-batch (requested 10, ratio 0.8). Each furnace
 * also ships its steel to the dock store: startBatches refuses to start a machine
 * whose tray is non-empty, so without the output link every furnace would stall
 * at tray=1 (outputFull) and demand would collapse to 0. With the link the trays
 * drain every tick and the 10/8 cap holds for the whole capture window. */
function powerYard() {
  seq = 0;
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 100;
  state.store["ferrous"] = 300;
  state.storeUnits = 400;
  for (const tile of [8, 9, 10, 11, 12]) {
    must(state, { type: "machine.build", blueprint: "furnace", tile });
    const machine = state.machines[state.machines.length - 1];
    must(state, { type: "route.connect", from: 0, to: machine.id, filter: "ferrous" });
    must(state, { type: "route.connect", from: machine.id, to: 0, filter: "steel" });
  }
  advance(state, 200);
  return state;
}

/** Inert sorter yard with a funded (or empty) purse: no belt, so nothing flows and
 * the only state the purchase can touch is credits/level/branch/revision. */
function upgradeYard(credits) {
  seq = 0;
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 60;
  state.storeUnits = 60;
  must(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  state.credits = credits; // funding seed, same discipline as the store balance
  advance(state, 30);
  return state;
}

/* ---- assertion ledger ---- */

const checks = [];
function check(scenario, cell, name, ok, detail) {
  const cellLabel = typeof cell === "string" ? cell : cell.label;
  checks.push({ scenario, cell: cellLabel, name, ok: ok === true, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${cellLabel}/${scenario}] ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
  return ok === true;
}

/* ---- page helpers (same geometry reading as probe-registration100) ---- */

const readGeometry = () => {
  const canvas = document.querySelector("canvas");
  const parent = canvas ? canvas.parentElement : null;
  if (!canvas || !parent) return null;
  const rect = canvas.getBoundingClientRect();
  const parts = (canvas.dataset.cam ?? "").split(",").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return {
    left: rect.left,
    top: rect.top,
    view: { width: parent.clientWidth, height: parent.clientHeight },
    camera: { x: parts[0], y: parts[1], scale: parts[2] },
  };
};

const readPanel = () => {
  const node = document.querySelector(".panel");
  if (!node) return null;
  const sections = [...node.querySelectorAll(".inspector-section")].map((section) => ({
    title: (section.querySelector(".inspector-section__title")?.textContent ?? "").trim(),
    rows: [...section.querySelectorAll(".panel__row")].map((row) => ({
      label: (row.querySelector("dt")?.textContent ?? "").trim(),
      value: (row.querySelector("dd")?.textContent ?? "").trim(),
    })),
  }));
  return {
    title: (node.querySelector(".panel__title")?.textContent ?? "").trim(),
    aria: node.getAttribute("aria-label"),
    sections,
  };
};

const readFocusRow = () => {
  const row = document.querySelector(".inspector-focus");
  if (!row) return { present: false, buttons: [], hint: null };
  return {
    present: true,
    buttons: [...row.querySelectorAll(".inspector-focus__btn")].map((button) => ({
      kind: button.dataset.focus ?? null,
      text: (button.textContent ?? "").trim(),
    })),
    hint: (row.querySelector(".inspector-note")?.textContent ?? "").trim(),
  };
};

const readContext = () => {
  const tabs = [...document.querySelectorAll(".inspector-context__btn")].map((button) => ({
    label: (button.textContent ?? "").trim(),
    pressed: button.getAttribute("aria-pressed"),
  }));
  const pane = document.querySelector(".inspector-context__pane");
  return {
    tabs,
    paneRows: pane
      ? [...pane.querySelectorAll(".panel__row")].map((row) => ({
          label: (row.querySelector("dt")?.textContent ?? "").trim(),
          value: (row.querySelector("dd")?.textContent ?? "").trim(),
        }))
      : null,
  };
};

const readUpgrade = (buyHintText) => {
  const root = document.querySelector(".upgrade-compare");
  if (!root) return null;
  const span = (node, selector) => (node.querySelector(selector)?.textContent ?? "").trim();
  const receipt = root.querySelector(".upgrade-receipt");
  return {
    cards: [...root.querySelectorAll(".upgrade-card")].map((card) => ({
      branch: card.dataset.branch ?? null,
      pressed: card.getAttribute("aria-pressed"),
      disabled: card.disabled,
      rate: span(card, ".upgrade-card__rate"),
      power: span(card, ".upgrade-card__power"),
      capacity: span(card, ".upgrade-card__capacity"),
      metric: span(card, ".upgrade-card__metric"),
      delta: span(card, ".upgrade-card__delta"),
      cost: span(card, ".upgrade-card__cost"),
      tradeoff: span(card, ".upgrade-card__tradeoff"),
      text: (card.textContent ?? "").trim(),
    })),
    buy: (() => {
      const button = root.querySelector("[data-buy]");
      return button ? { disabled: button.disabled, text: (button.textContent ?? "").trim() } : null;
    })(),
    buyHint: [...root.querySelectorAll(".upgrade-note")].some(
      (note) => (note.textContent ?? "").trim() === buyHintText,
    ),
    notes: [...root.querySelectorAll(".upgrade-note")].map((note) => (note.textContent ?? "").trim()),
    receipt: receipt
      ? {
          kind: [...receipt.classList].find((name) => name.startsWith("upgrade-receipt--"))?.replace("upgrade-receipt--", "") ?? null,
          role: receipt.getAttribute("role"),
          text: (receipt.textContent ?? "").trim(),
        }
      : null,
  };
};

const readSave = (key) => localStorage.getItem(key);

async function seedPage(page, raw) {
  await page.addInitScript(
    ([saveKey, leaseKey, value]) => {
      localStorage.removeItem(leaseKey);
      if (!sessionStorage.getItem("rw145-seeded")) {
        localStorage.setItem(saveKey, value);
        sessionStorage.setItem("rw145-seeded", "1");
      }
    },
    [SAVE_KEY, LEASE_KEY, raw],
  );
}

async function dismissBoot(page) {
  // The current build boots to the home screen (UI-RESET-62); "Continue" resumes
  // the seeded save into the yard.
  await page.evaluate((label) => {
    const begin = [...document.querySelectorAll("button")].find(
      (node) => (node.textContent ?? "").trim() === label,
    );
    begin?.click();
  }, HOME_COPY.continue);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const button = panel ? panel.querySelector(".panel__head button") : null;
    if (button && /^Back to yard$/.test((button.textContent ?? "").trim())) button.click();
  });
  await page.waitForTimeout(200);
}

async function tapMachine(page, tile) {
  const geometry = await page.evaluate(readGeometry);
  if (!geometry) return false;
  const world = tileToWorld(tile);
  const p = worldToScreen(geometry.camera, geometry.view, world.x, world.y);
  await page.mouse.click(Math.round(p.x + geometry.left), Math.round(p.y + geometry.top));
  await page.waitForTimeout(300);
  return true;
}

async function clickSelector(page, selector) {
  const clicked = await page.evaluate((want) => {
    const node = document.querySelector(want);
    if (!node || node.disabled) return false;
    node.click();
    return true;
  }, selector);
  await page.waitForTimeout(300);
  return clicked;
}

/** Zoom through the shell's own visible control until the yard is pan-able, so the
 * focus pan is a real camera move at both form factors (the fit pins both axes). */
async function zoomIn(page, minScale) {
  for (let i = 0; i < 6; i += 1) {
    const geometry = await page.evaluate(readGeometry);
    if (geometry && geometry.camera.scale >= minScale) return geometry;
    await page.evaluate(() => {
      document.querySelector('.shell-zoom__face[aria-label="Zoom in"]')?.click();
    });
    await page.waitForTimeout(200);
  }
  return page.evaluate(readGeometry);
}

/** The focus pan contract at paint precision: for each axis, evaluate the top-down
 * clamp at BOTH scale bounds of the pre-click stamp; a pinned axis stays at the
 * pre-click (fitted) centre. The post-click stamp must land inside that interval. */
function checkFocusCamera(scenario, cell, pre, post, tile, label) {
  const world = tileToWorld(tile);
  const view = pre.view;
  const bounds = [pre.camera.scale - SCALE_EPS, pre.camera.scale + SCALE_EPS];
  const interval = (worldAxis, viewSize, worldSize, preAxis) => {
    const candidates = [];
    for (const scale of bounds) {
      const half = viewSize / (2 * scale);
      if (half >= worldSize / 2) candidates.push(preAxis);
      else candidates.push(Math.min(worldSize - half, Math.max(half, worldAxis)));
    }
    return [Math.min(...candidates) - STAMP_PAD, Math.max(...candidates) + STAMP_PAD];
  };
  const ix = interval(world.x, view.width, WORLD_W, pre.camera.x);
  const iy = interval(world.y, view.height, WORLD_H, pre.camera.y);
  const okX = post.camera.x >= ix[0] && post.camera.x <= ix[1];
  const okY = post.camera.y >= iy[0] && post.camera.y <= iy[1];
  const okScale = Math.abs(post.camera.scale - pre.camera.scale) <= 0.001;
  check(scenario, cell, `${label}: camera x inside the clamp interval`, okX,
    { got: post.camera.x, interval: ix, tile, world: world.x });
  check(scenario, cell, `${label}: camera y inside the clamp interval`, okY,
    { got: post.camera.y, interval: iy, tile, world: world.y });
  check(scenario, cell, `${label}: zoom preserved`, okScale,
    { before: pre.camera.scale, after: post.camera.scale });
  const moved = Math.abs(post.camera.x - pre.camera.x) > 0.05 || Math.abs(post.camera.y - pre.camera.y) > 0.05;
  check(scenario, cell, `${label}: the camera actually panned`, moved,
    { before: pre.camera, after: post.camera });
  return okX && okY && okScale && moved;
}

const mirrorOf = async (page) => {
  const raw = await page.evaluate(readSave, SAVE_KEY);
  const decoded = decodeSave(raw);
  return decoded.ok ? decoded.payload.sim : null;
};

const cellRowOf = (panel) =>
  panel?.sections.find((section) => section.title === COPY.sections.identity)?.rows.find(
    (row) => row.label === COPY.rows.cell,
  )?.value ?? null;

async function shot(page, cell, scenario, phase) {
  mkdirSync(shots, { recursive: true });
  const path = `${shots}/${cell.label}-${scenario}-${phase}.png`;
  await page.screenshot({ path });
  return path;
}

async function bootYard(page, state) {
  const raw = encodeSave(state, Date.now(), SETTINGS);
  await seedPage(page, raw);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await dismissBoot(page);
}

/* ---- scenarios ---- */

async function runStarvedSource(page, cell) {
  const scenario = "starved-source";
  const state = starvedSourceYard();
  const machine = state.machines[0];
  const expected = focusSource(state, machine);
  await bootYard(page, state);
  check(scenario, cell, "tap opens the sorter panel", await tapMachine(page, 8));
  let panel = await page.evaluate(readPanel);
  check(scenario, cell, "panel title is Scrap sorter", panel?.title === BLUEPRINTS.sorter.label, panel?.title);
  const focus = await page.evaluate(readFocusRow);
  check(scenario, cell, "only the source face shows (no links, full power)",
    focus.present && focus.buttons.length === 1 && focus.buttons[0].kind === "source", focus);
  check(scenario, cell, "source face names the dock store",
    focus.buttons[0]?.text === `${COPY.focus.source} · ${expected.label}`,
    { got: focus.buttons[0]?.text, expected: `${COPY.focus.source} · ${expected.label}` });
  check(scenario, cell, "focus hint says the machine stays selected", focus.hint === COPY.focus.hint, focus.hint);
  // The world is only 192x224 units: at the 1920x1080 boot zoom BOTH axes are
  // pinned by the fit clamp, so a focus pan legitimately cannot move the camera.
  // Zoom near CAMERA_MAX_SCALE (6) first; above ~4.5 the y axis unpins at 1080p
  // and the pan is a real move at both form factors.
  const pre = await zoomIn(page, 5.5);
  const before = await mirrorOf(page);
  check(scenario, cell, "pre-click mirror decodes", before !== null);
  const preShot = await shot(page, cell, scenario, "pre");
  check(scenario, cell, "source face clicked", await clickSelector(page, '[data-focus="source"]'));
  const post = await page.evaluate(readGeometry);
  checkFocusCamera(scenario, cell, pre, post, expected.tile, "source pan");
  panel = await page.evaluate(readPanel);
  check(scenario, cell, "selection intact: title and cell unchanged",
    panel?.title === BLUEPRINTS.sorter.label && cellRowOf(panel) === "8",
    { title: panel?.title, cell: cellRowOf(panel) });
  const after = await mirrorOf(page);
  check(scenario, cell, "no dispatch: revision unchanged", after?.revision === before?.revision,
    { before: before?.revision, after: after?.revision });
  check(scenario, cell, "inert yard: store balance unchanged",
    after?.storeUnits === state.storeUnits && after?.store?.scrap === state.store.scrap,
    { storeUnits: after?.storeUnits, expected: state.storeUnits, scrap: after?.store?.scrap });
  const postShot = await shot(page, cell, scenario, "post");
  return { preShot, postShot, expected, camera: { before: pre.camera, after: post.camera } };
}

async function runLiveRoute(page, cell) {
  const scenario = "live-route";
  const state = liveRouteYard();
  const machine = state.machines[0];
  const expected = focusRoute(state, machine);
  await bootYard(page, state);
  check(scenario, cell, "tap opens the sorter panel", await tapMachine(page, 8));
  let panel = await page.evaluate(readPanel);
  check(scenario, cell, "panel title is Scrap sorter", panel?.title === BLUEPRINTS.sorter.label, panel?.title);
  const focus = await page.evaluate(readFocusRow);
  const routeFace = focus.buttons.find((button) => button.kind === "route");
  check(scenario, cell, "route face names the busiest belt's endpoints",
    routeFace?.text === `${COPY.focus.route} · ${expected.label}`,
    { got: routeFace?.text, expected: `${COPY.focus.route} · ${expected.label}` });
  // The world is only 192x224 units: at the 1920x1080 boot zoom BOTH axes are
  // pinned by the fit clamp, so a focus pan legitimately cannot move the camera.
  // Zoom near CAMERA_MAX_SCALE (6) first; above ~4.5 the y axis unpins at 1080p
  // and the pan is a real move at both form factors.
  const pre = await zoomIn(page, 5.5);
  const before = await mirrorOf(page);
  check(scenario, cell, "pre-click mirror decodes", before !== null);
  const preShot = await shot(page, cell, scenario, "pre");
  check(scenario, cell, "route face clicked", await clickSelector(page, '[data-focus="route"]'));
  const post = await page.evaluate(readGeometry);
  checkFocusCamera(scenario, cell, pre, post, expected.tile, "route pan");
  panel = await page.evaluate(readPanel);
  check(scenario, cell, "selection intact: title and cell unchanged",
    panel?.title === BLUEPRINTS.sorter.label && cellRowOf(panel) === "8",
    { title: panel?.title, cell: cellRowOf(panel) });
  const after = await mirrorOf(page);
  check(scenario, cell, "no dispatch in a LIVE yard: revision unchanged (ticks never bump it)",
    after?.revision === before?.revision, { before: before?.revision, after: after?.revision });
  const postShot = await shot(page, cell, scenario, "post");
  return { preShot, postShot, expected, camera: { before: pre.camera, after: post.camera } };
}

async function runPower(page, cell) {
  const scenario = "power";
  const state = powerYard();
  const machine = state.machines[0];
  const expectedRows = [
    { label: COPY.rows.requested, value: `${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity}` },
    {
      label: COPY.rows.thisMachine,
      value: t("value.powerUnits", {
        count: machine.batchPower,
        units: plural(machine.batchPower, t("unit.unit")),
      }),
    },
    { label: COPY.rows.speed, value: t("value.percent", { percent: wholePercent(state.powerRatio) }) },
  ];
  await bootYard(page, state);
  check(scenario, cell, "tap opens the furnace panel", await tapMachine(page, 8));
  let panel = await page.evaluate(readPanel);
  check(scenario, cell, "panel title is Furnace", panel?.title === BLUEPRINTS.furnace.label, panel?.title);
  const focus = await page.evaluate(readFocusRow);
  check(scenario, cell, "power face present while the yard is capped",
    focus.buttons.some((button) => button.kind === "power" && button.text === COPY.focus.power), focus);
  let context = await page.evaluate(readContext);
  check(scenario, cell, "Power tab starts closed",
    context.tabs.find((tab) => tab.label === COPY.context.power)?.pressed === "false" && context.paneRows === null,
    context);
  const before = await mirrorOf(page);
  const preShot = await shot(page, cell, scenario, "pre");
  check(scenario, cell, "power face clicked", await clickSelector(page, '[data-focus="power"]'));
  context = await page.evaluate(readContext);
  check(scenario, cell, "Power tab opened by the focus face",
    context.tabs.find((tab) => tab.label === COPY.context.power)?.pressed === "true", context.tabs);
  check(scenario, cell, "pane rows are the engine's exact demand/draw/speed",
    JSON.stringify(context.paneRows) === JSON.stringify(expectedRows),
    { got: context.paneRows, expected: expectedRows });
  // Manual close, then the same face must re-open (seq bump) — selection stays put.
  check(scenario, cell, "Power tab clicked closed", await clickSelector(page, ".inspector-context__btn:last-of-type"));
  context = await page.evaluate(readContext);
  check(scenario, cell, "manual close works",
    context.tabs.find((tab) => tab.label === COPY.context.power)?.pressed === "false", context.tabs);
  check(scenario, cell, "power face re-clicked", await clickSelector(page, '[data-focus="power"]'));
  context = await page.evaluate(readContext);
  check(scenario, cell, "focus face re-opens the pane after a manual close",
    context.tabs.find((tab) => tab.label === COPY.context.power)?.pressed === "true" &&
      JSON.stringify(context.paneRows) === JSON.stringify(expectedRows),
    context);
  panel = await page.evaluate(readPanel);
  check(scenario, cell, "selection intact: title and cell unchanged",
    panel?.title === BLUEPRINTS.furnace.label && cellRowOf(panel) === "8",
    { title: panel?.title, cell: cellRowOf(panel) });
  const after = await mirrorOf(page);
  check(scenario, cell, "no dispatch: revision unchanged", after?.revision === before?.revision,
    { before: before?.revision, after: after?.revision });
  const postShot = await shot(page, cell, scenario, "pane");
  return { preShot, postShot, expectedRows };
}

/** DOM spans vs the shipped read model, and the read model vs the engine itself. */
function checkCardParity(scenario, cell, upgrade, state, machine) {
  const models = branchCards(state, machine);
  check(scenario, cell, "three cards in dock order, none auto-selected",
    upgrade.cards.length === 3 &&
      upgrade.cards.every((card, index) => card.branch === UPGRADE_BRANCHES[index] && card.pressed === "false"),
    upgrade.cards.map((card) => ({ branch: card.branch, pressed: card.pressed })));
  for (const model of models) {
    const engine = upgradeComparison(state, machine.id, model.branch);
    const card = upgrade.cards.find((item) => item.branch === model.branch);
    check(scenario, cell, `${model.branch}: read model == upgradeComparison`,
      engine !== null &&
        model.rateNow === engine.before.batchesPerMinute &&
        model.rateNext === engine.after.batchesPerMinute &&
        model.powerNow === engine.before.power &&
        model.powerNext === engine.after.power &&
        model.capacityNow === engine.before.inputCapacity &&
        model.capacityNext === engine.after.inputCapacity &&
        model.cost === engine.cost,
      { model: { rate: [model.rateNow, model.rateNext], power: [model.powerNow, model.powerNext], capacity: [model.capacityNow, model.capacityNext], cost: model.cost }, engine });
    check(scenario, cell, `${model.branch}: painted spans == the model's texts`,
      card !== undefined &&
        card.rate === `${UPGRADE_COPY.throughputWord}: ${model.throughputText}` &&
        card.power === `${UPGRADE_COPY.powerDrawWord}: ${model.powerText}` &&
        card.capacity === `${UPGRADE_COPY.capacityWord}: ${model.capacityText}` &&
        card.cost.startsWith(`${UPGRADE_COPY.costWord}: ${model.costText}`) &&
        card.metric === `${model.metric}: ${model.currentText} → ${model.proposedText}` &&
        card.delta === model.deltaText &&
        card.tradeoff === model.tradeoff,
      card);
  }
  return models;
}

async function runUpgradeBuy(page, cell) {
  const scenario = "upgrade-buy";
  const state = upgradeYard(500);
  const machine = state.machines[0];
  const speedEngine = upgradeComparison(state, machine.id, "speed");
  await bootYard(page, state);
  check(scenario, cell, "tap opens the sorter panel", await tapMachine(page, 8));
  let upgrade = await page.evaluate(readUpgrade, UPGRADE_COPY.buyHint);
  check(scenario, cell, "comparison is inline immediately (no Upgrade action needed)", upgrade !== null);
  const models = checkCardParity(scenario, cell, upgrade, state, machine);
  const drawCard = upgrade.cards.find((card) => card.branch === "draw");
  check(scenario, cell, "sorter draw card is the honest maxed no-effect state",
    drawCard?.disabled === true && drawCard.text.includes(UPGRADE_COPY.noEffectBadge), drawCard);
  check(scenario, cell, "buy disabled until a deliberate selection; hint shown",
    upgrade.buy?.disabled === true && upgrade.buyHint === true, upgrade.buy);
  check(scenario, cell, "instant-apply note printed (no downtime promised)",
    upgrade.notes.includes(UPGRADE_COPY.instantNote), upgrade.notes);
  const cardsShot = await shot(page, cell, scenario, "cards");
  const before = await mirrorOf(page);
  check(scenario, cell, "pre-purchase mirror decodes", before !== null);
  check(scenario, cell, "speed card clicked", await clickSelector(page, '[data-branch="speed"]'));
  upgrade = await page.evaluate(readUpgrade, UPGRADE_COPY.buyHint);
  const speedCard = upgrade.cards.find((card) => card.branch === "speed");
  check(scenario, cell, "selection is explicit: speed pressed, buy enabled and named",
    speedCard?.pressed === "true" && upgrade.buy?.disabled === false &&
      upgrade.buy.text.includes(UPGRADE_COPY.branches.speed.title) &&
      upgrade.buy.text.includes(models.find((model) => model.branch === "speed").costText),
    { card: speedCard?.pressed, buy: upgrade.buy });
  const selectedShot = await shot(page, cell, scenario, "selected");
  check(scenario, cell, "buy clicked", await clickSelector(page, "[data-buy]"));
  upgrade = await page.evaluate(readUpgrade, UPGRADE_COPY.buyHint);
  check(scenario, cell, "applied receipt read back from the engine state",
    upgrade.receipt?.kind === "applied" && upgrade.receipt.role === "status" &&
      upgrade.receipt.text.includes(UPGRADE_COPY.receiptApplied) &&
      upgrade.receipt.text.includes(UPGRADE_COPY.branches.speed.title),
    upgrade.receipt);
  const after = await mirrorOf(page);
  const paid = speedEngine.cost;
  check(scenario, cell, "mirror: level+1, speed branch, exact price, revision+1",
    after?.machines[0]?.level === machine.level + 1 &&
      JSON.stringify(after?.machines[0]?.branch) === JSON.stringify(["speed"]) &&
      after?.credits === 500 - paid && after?.revision === before?.revision + 1,
    { level: after?.machines[0]?.level, branch: after?.machines[0]?.branch, credits: after?.credits, expectedCredits: 500 - paid, revision: [before?.revision, after?.revision] });
  check(scenario, cell, "inert yard: store untouched by the purchase",
    after?.storeUnits === state.storeUnits && after?.store?.scrap === state.store.scrap,
    { storeUnits: after?.storeUnits, expected: state.storeUnits });
  // The card re-prices from the APPLIED state: the new before is the old after.
  const next = upgradeComparison(after, machine.id, "speed");
  const expectedRate = `${UPGRADE_COPY.throughputWord}: ${formatRate(next.before.batchesPerMinute)} → ${formatRate(next.after.batchesPerMinute)} ${UPGRADE_COPY.batchesPerMinute}`;
  upgrade = await page.evaluate(readUpgrade, UPGRADE_COPY.buyHint);
  check(scenario, cell, "card re-renders the applied before/after",
    upgrade.cards.find((card) => card.branch === "speed")?.rate === expectedRate &&
      next.before.batchesPerMinute === speedEngine.after.batchesPerMinute,
    { got: upgrade.cards.find((card) => card.branch === "speed")?.rate, expected: expectedRate });
  const receiptShot = await shot(page, cell, scenario, "receipt");
  return { cardsShot, selectedShot, receiptShot, paid, revision: [before?.revision, after?.revision] };
}

async function runUpgradeBlocked(page, cell) {
  const scenario = "upgrade-blocked";
  const state = upgradeYard(0);
  const machine = state.machines[0];
  const speedEngine = upgradeComparison(state, machine.id, "speed");
  const speedModel = branchCards(state, machine).find((model) => model.branch === "speed");
  await bootYard(page, state);
  check(scenario, cell, "tap opens the sorter panel", await tapMachine(page, 8));
  let upgrade = await page.evaluate(readUpgrade, UPGRADE_COPY.buyHint);
  checkCardParity(scenario, cell, upgrade, state, machine);
  const speedCard = upgrade.cards.find((card) => card.branch === "speed");
  check(scenario, cell, "unaffordable card prints the engine's shortfall",
    speedModel.affordable === false && speedCard.text.includes(speedModel.shortfallText ?? ""),
    { shortfall: speedModel.shortfallText, card: speedCard?.text });
  const before = await mirrorOf(page);
  const preShot = await shot(page, cell, scenario, "pre");
  check(scenario, cell, "speed card clicked", await clickSelector(page, '[data-branch="speed"]'));
  check(scenario, cell, "buy clicked", await clickSelector(page, "[data-buy]"));
  // A refusal persists nothing immediately; wait past one periodic checkpoint so
  // the mirror read is the app's own latest frame, not a stale seed.
  await page.waitForTimeout(1200);
  upgrade = await page.evaluate(readUpgrade, UPGRADE_COPY.buyHint);
  const expectedReceipt = `${UPGRADE_COPY.receiptShort}: ${t("reject.shortfall", {
    need: speedEngine.cost,
    have: 0,
    word: plural(speedEngine.cost, t("unit.credit")),
  })}. ${UPGRADE_COPY.nothingSpent}`;
  check(scenario, cell, "short receipt reports the engine's exact numbers",
    upgrade.receipt?.kind === "short" && upgrade.receipt.role === "status" &&
      upgrade.receipt.text === expectedReceipt,
    { got: upgrade.receipt, expected: expectedReceipt });
  const after = await mirrorOf(page);
  check(scenario, cell, "refusal before mutation: revision, credits, level untouched",
    after?.revision === before?.revision && after?.credits === 0 &&
      after?.machines[0]?.level === machine.level &&
      (after?.machines[0]?.branch ?? []).length === 0,
    { revision: [before?.revision, after?.revision], credits: after?.credits, level: after?.machines[0]?.level, branch: after?.machines[0]?.branch });
  const postShot = await shot(page, cell, scenario, "receipt");
  return { preShot, postShot, expectedReceipt };
}

/* ---- run ---- */

const CELLS = [
  { label: "390x844", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { label: "1920x1080", width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const run = async () => {
  // Determinism witness: fixtures built twice encode byte-identical at a fixed clock.
  const witness = {};
  for (const [name, build] of [
    ["starvedSourceYard", starvedSourceYard],
    ["liveRouteYard", liveRouteYard],
    ["powerYard", powerYard],
    ["upgradeYard-500", () => upgradeYard(500)],
    ["upgradeYard-0", () => upgradeYard(0)],
  ]) {
    const a = encodeSave(build(), WITNESS_MS, SETTINGS);
    const b = encodeSave(build(), WITNESS_MS, SETTINGS);
    witness[name] = { byteIdentical: a === b, checksum: checksum(a) };
    if (a !== b) throw new Error(`fixture ${name} is not deterministic`);
  }
  // Engine-side fixture preconditions: the scenarios assert live DOM against these
  // exact numbers, so prove the fixtures hold them before any browser launches.
  const starved = starvedSourceYard();
  check("fixture", "node", "starved yard: machine starved, inert 40-unit balance, dock supplier",
    starved.machines[0].status === "starved" && starved.storeUnits === 40 &&
      focusSource(starved, starved.machines[0])?.tile === DOCK_TILE,
    { status: starved.machines[0].status, storeUnits: starved.storeUnits, source: focusSource(starved, starved.machines[0]) });
  const live = liveRouteYard();
  const liveFocus = focusRoute(live, live.machines[0]);
  // focusRoute picks the busiest of the machine's output AND input links; in this
  // seeded yard the scrap feed is the busiest, so assert the derivation itself
  // (endpoint label of the chosen route, midpoint tile) rather than a direction.
  const liveRoute = live.routes.find((route) => route.id === liveFocus?.routeId);
  check("fixture", "node", "live yard: non-zero measured rate and a derived route focus",
    rateReading(live.machines[0]).rate > 0 && liveFocus !== null && liveRoute !== undefined &&
      (liveRoute.from.id === live.machines[0].id || liveRoute.to.id === live.machines[0].id) &&
      liveFocus.label === `${endpointName(live, liveRoute.from.id)} ${COPY.recipe.arrow} ${endpointName(live, liveRoute.to.id)}` &&
      liveFocus.tile === (liveRoute.run?.length ? liveRoute.run[Math.floor(liveRoute.run.length / 2)] : live.machines[0].tile),
    { rate: rateReading(live.machines[0]), focus: liveFocus });
  const power = powerYard();
  check("fixture", "node", "power yard: 10/8 demand, 0.8 ratio, every furnace mid-batch, trays below capacity",
    requestedPower(power) === 10 && power.powerRatio === 0.8 &&
      power.machines.every((machine) => machine.progress > 0 && machine.trayUnits < BLUEPRINTS.furnace.outputBuffer),
    { requested: requestedPower(power), ratio: power.powerRatio, machines: power.machines.map((machine) => ({ progress: machine.progress, tray: machine.trayUnits, status: machine.status })) });
  const funded = upgradeYard(500);
  const speed = upgradeComparison(funded, funded.machines[0].id, "speed");
  const buffer = upgradeComparison(funded, funded.machines[0].id, "buffer");
  const drawModel = branchCards(funded, funded.machines[0]).find((model) => model.branch === "draw");
  // 16.5 bpm is the nominal anchor; the engine's 60000/batchMilli arithmetic lands
  // at 16.4998… in floating point, so compare within 0.01 (the painted formatRate
  // rounds to 16.50 either way).
  check("fixture", "node", "sorter anchors: speed 15→16.5 bpm, buffer +6 capacity, draw maxed at 1 unit",
    speed.before.batchesPerMinute === 15 && Math.abs(speed.after.batchesPerMinute - 16.5) < 0.01 &&
      buffer.after.inputCapacity - buffer.before.inputCapacity === BUFFER_RANK_UNITS &&
      drawModel.noEffect === true && drawModel.powerNow === 1 && drawModel.powerNext === 1,
    { speed: [speed.before.batchesPerMinute, speed.after.batchesPerMinute], buffer: [buffer.before.inputCapacity, buffer.after.inputCapacity], draw: drawModel.noEffect });
  console.log(`INS-145 headless evidence · ${url} · head ${headSha}`);
  const browser = await chromium.launch({ executablePath, headless: true });
  const results = {};
  try {
    for (const cell of CELLS) {
      results[cell.label] = {};
      const context = await browser.newContext({
        viewport: { width: cell.width, height: cell.height },
        deviceScaleFactor: cell.deviceScaleFactor,
        isMobile: cell.isMobile,
        hasTouch: cell.hasTouch,
      });
      const pageErrors = [];
      const consoleErrors = [];
      const scenarios = [
        ["starved-source", (page) => runStarvedSource(page, cell)],
        ["live-route", (page) => runLiveRoute(page, cell)],
        ["power", (page) => runPower(page, cell)],
        ["upgrade-buy", (page) => runUpgradeBuy(page, cell)],
        ["upgrade-blocked", (page) => runUpgradeBlocked(page, cell)],
      ];
      for (const [name, runScenario] of scenarios) {
        const page = await context.newPage();
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        results[cell.label][name] = await runScenario(page);
        await page.close();
      }
      await context.close();
      results[cell.label].pageErrors = pageErrors;
      results[cell.label].consoleErrors = consoleErrors;
      check("console", cell.label, "zero page errors", pageErrors.length === 0, pageErrors);
      check("console", cell.label, "zero console errors", consoleErrors.length === 0, consoleErrors);
    }
  } finally {
    await browser.close();
  }
  const failed = checks.filter((entry) => !entry.ok);
  const body = {
    generatedBy: "scripts/probe-inspector145.mjs",
    issue: "https://github.com/darkmatter2222/Rustwake/issues/145",
    headSha,
    url,
    tuning: {
      yardPowerCapacity: TUNING.yardPowerCapacity,
      reserveFloor: TUNING.reserveFloor,
      manualPulseTicks: TUNING.manualPulseTicks,
    },
    cameraStampPrecision: { scaleEpsilon: SCALE_EPS, stampPad: STAMP_PAD },
    fixtureDeterminism: witness,
    cells: CELLS.map(({ label, width, height, deviceScaleFactor, isMobile, hasTouch }) => ({
      label, width, height, deviceScaleFactor, isMobile, hasTouch,
    })),
    results,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(TARGET, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  console.log(`\nINS-145 evidence: ${body.summary.passed}/${body.summary.total} checks passed, ${failed.length} failed`);
  console.log(`wrote ${TARGET} · shots under ${shots}/`);
  if (failed.length > 0) {
    for (const entry of failed) console.log(`FAILED [${entry.cell}/${entry.scenario}] ${entry.name} · ${JSON.stringify(entry.detail)}`);
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});