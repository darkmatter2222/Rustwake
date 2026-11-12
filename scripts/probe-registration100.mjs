// Issue #100 headless evidence: output registration is derived from the route table.
// Real UI path in headless Chrome at BOTH form factors (390x844 mobile, 1920x1080 desktop):
//   four-yard      - the QA seeded 4-route yard: every touching belt is registered, so the
//                    Dismantle face and the engine store delta agree (pre-fix the first
//                    output belt was orphaned: face overprinted its refund).
//   connect R01/R03- one Connect click lays BOTH output plans through the panel button;
//                    the repaint face sums input + both output belts; the Dismantle click
//                    returns exactly that face, drops every route, conserves matter.
//   orphan-save    - a pre-fix damaged save (dismantled machine, orphan belt with cargo)
//                    loads REPAIRED: no silent fresh-yard reset, cargo conserved, belt
//                    refunded once; a reload refunds nothing a second time.
//
// Fixture discipline (documented mutations, ALL in this probe, never in src):
//   * Every build/connect goes through the real command path (applyCommand).
//   * Funding is the only state seeding: purses are sized so the leftover store balance
//     sits at/below TUNING.reserveFloor (10) or holds no resource the input belt filters,
//     so the live tick loop cannot move material during capture (inert yard). No advance.
//   * The orphan fixture simulates the pre-fix dismantle by removing the machine and
//     keeping its first output belt, and loads that belt with 4 copper (probe cargo).
//   * Seeds are written with the game's own encodeSave at lastSeenMs = Date.now() (no
//     offline catch-up), idle batches are [] (createInitialState shape), and every action
//     under test is a real DOM click. Readback audits decode the persisted frame mirror.
//   * Fixture hygiene: each scenario page clears the multi-tab lease key so it claims the
//     writer role (dispatch refuses read-only tabs), and seeds once per TAB — so the
//     orphan scenario's reload reads the app's own persisted repair instead of re-seeding
//     the damage (true idempotence, not just determinism).
//   * Tap/ink geometry reads the camera the shell stamps on the canvas (`data-cam`), the
//     same paint truth the app draws and hit-tests with, at the current chrome insets.
//   * Assertions are DOM/geometry/console + programmatic canvas ink sampling only.
//
// Run:  npx vite preview --port 4295            (background, serves the built head)
//       npx tsx scripts/probe-registration100.mjs
// env:  RUSTWAKE_URL (default http://localhost:4295/), REG100_SHOTS (default docs/evidence/registration100)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { BLUEPRINTS, RECIPES, TUNING } from "../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  beltRun,
  refundOf,
  DOCK_TILE,
  YARD_COLS,
} from "../src/game/simulation/commands";
import { createInitialState, manhattanRun, outputRouteIds } from "../src/game/simulation/types";
import { planConnections } from "../src/game/simulation/autoconnect";
import {
  SAVE_KEY,
  checksum,
  decodeSave,
  encodeSave,
  repairRegistration,
  validateSim,
} from "../src/game/persistence/save";
import { LEASE_KEY } from "../src/game/persistence/lease";
import { systemTotals, unitTotal } from "../src/game/simulation/invariants";
import { tileToWorld, worldToScreen } from "../src/game/renderer/scene";
import { beltExtentLine } from "../src/ui/text";
import { capacityText, hudNumber } from "../src/ui/hud/format";
import { t } from "../src/game/content/strings";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4295/";
const shots = process.env.REG100_SHOTS ?? "docs/evidence/registration100";
const TARGET = "docs/evidence/registration100-headless.json";
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

let seq = 0;
const send = (state, body) => applyCommand(state, { ...body, id: `e100-${(seq += 1)}` });
const must = (state, body) => {
  const result = send(state, body);
  if (!result.ok) throw new Error(`fixture command refused: ${JSON.stringify(body)} ${result.reason}`);
};
const beltRefundOf = (route) => refundOf(beltCost(route?.run?.length ?? 0));
const buildRefundOf = (blueprint) =>
  BLUEPRINTS[blueprint].buildCost.reduce((total, item) => total + refundOf(item.qty), 0);

/* ---- fixtures (real command path; funding is the only seeding) ---- */

/** The QA 4-route yard: sorter touched by TWO inputs + TWO outputs. The purse is sized
 * (build 20 + four 3-tile belts 12 + 10) so the leftover scrap sits exactly at the reserve
 * floor: pullFromStore draws nothing, no tray/batch exists, the yard is inert. */
function fourRouteYard() {
  seq = 0; // deterministic command ids per build (seenCommands is part of the save)
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 42;
  state.storeUnits = 42;
  must(state, { type: "machine.build", blueprint: "sorter", tile: 4 });
  const machine = state.machines[0];
  must(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" });
  must(state, { type: "route.connect", from: 0, to: machine.id, filter: "nonferrous" });
  must(state, { type: "route.connect", from: machine.id, to: 0, filter: "ferrous" });
  must(state, { type: "route.connect", from: machine.id, to: 0, filter: "nonferrous" });
  return state;
}

/** Machine + input link seeded; the panel's Connect click lays BOTH output plans. The
 * leftover purse (6 scrap) is below the reserve floor, and after Connect pays the belts the
 * balance (2) stays below it, so nothing flows before or after the click. */
function connectYard(blueprint) {
  seq = 0;
  const state = createInitialState();
  state.tutorial = 9;
  const def = BLUEPRINTS[blueprint];
  const scrapCost = def.buildCost.find((item) => item.resource === "scrap")?.qty ?? 0;
  const ferrousCost = def.buildCost.find((item) => item.resource === "ferrous")?.qty ?? 0;
  // Same run beltRun measures once the machine stands at tile 8 (dock hub -> tile 8).
  const inputRun = manhattanRun(DOCK_TILE, 8, YARD_COLS).length;
  state.store["scrap"] = scrapCost + beltCost(inputRun) + 6;
  if (ferrousCost > 0) state.store["ferrous"] = ferrousCost;
  state.storeUnits = Object.values(state.store).reduce((total, units) => total + units, 0);
  must(state, { type: "machine.build", blueprint, tile: 8 });
  const machine = state.machines[0];
  const input = RECIPES[def.recipeId].inputs[0].resource;
  must(state, { type: "route.connect", from: 0, to: machine.id, filter: input });
  return state;
}

/** A pre-fix damaged save: the copper separator was dismantled by the OLD engine, which
 * dropped the registered set but orphaned its first output belt (with 4 copper aboard).
 * validateSim refuses it (routeSource), so un-repaired it is the silent-reset trigger. */
function orphanSave() {
  seq = 0;
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 300;
  state.store["ferrous"] = 20;
  state.storeUnits = 320;
  must(state, { type: "machine.build", blueprint: "copperSeparator", tile: 8 });
  const machine = state.machines[0];
  must(state, { type: "route.connect", from: 0, to: machine.id, filter: "nonferrous" });
  for (const plan of planConnections(state, machine.id)) {
    must(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
  }
  const orphan = state.routes.find((route) => route.from.id === machine.id);
  orphan.items = [{ resource: "copper", qty: 4, arrive: 0 }]; // probe cargo loading
  state.machines = []; // pre-fix dismantle: machine gone, registered set dropped...
  state.routes = [orphan]; // ...but the earlier output belt survived, dangling.
  return { state, orphan };
}

/* ---- model-side expectations (shipped helpers, no magic numbers) ---- */

function fourYardExpect(state) {
  const machine = state.machines[0];
  const touching = state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id,
  );
  const beltSum = touching.reduce((total, route) => total + beltRefundOf(route), 0);
  const buildRefund = buildRefundOf("sorter");
  const face = buildRefund + beltSum; // no tray/buffer/batch: inert fixture
  // Pre-fix witness: the singular mirror named only the LAST output; the first output
  // belt was unregistered, so the old engine returned one belt refund less.
  const firstOutput = state.routes.find((route) => route.from.id === machine.id);
  const preFixDelta = face - beltRefundOf(firstOutput);
  return { machine, touching, beltSum, buildRefund, face, preFixDelta };
}

function connectExpect(state, blueprint) {
  const machine = state.machines[0];
  const plans = planConnections(state, machine.id);
  const inputRoute = state.routes.find((route) => route.to.id === machine.id);
  const buildRefund = buildRefundOf(blueprint);
  const preFace = buildRefund + beltRefundOf(inputRoute);
  const connectCost = plans.reduce((total, plan) => total + beltCost(plan.tiles), 0);
  const outputBeltSum = plans.reduce(
    (total, plan) => total + refundOf(beltCost(plan.tiles)),
    0,
  );
  const face = preFace + outputBeltSum;
  const created = {};
  for (const item of BLUEPRINTS[blueprint].buildCost) {
    created[item.resource] = (created[item.resource] ?? 0) + refundOf(item.qty);
  }
  created.scrap = (created.scrap ?? 0) + beltRefundOf(inputRoute) + outputBeltSum;
  return { machine, plans, inputRoute, buildRefund, preFace, connectCost, face, created };
}

/* ---- assertion ledger ---- */

const checks = [];
function check(scenario, cell, name, ok, detail) {
  const cellLabel = typeof cell === "string" ? cell : cell.label;
  checks.push({ scenario, cell: cellLabel, name, ok: ok === true, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${cellLabel}/${scenario}] ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
  return ok === true;
}

/* ---- page helpers (same geometry reading as measure-belt001-g4 / measure-ui002) ---- */

/** The app stamps its live camera on the canvas as `data-cam="x,y,scale"` — the paint
 * truth the shell actually draws with (chrome insets, rail gutter and region shift
 * included). Reading it beats recomputing a fit the shell may have refitted. */
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
  const rows = [...node.querySelectorAll(".panel__row")].map((row) => ({
    label: (row.querySelector("dt")?.textContent ?? "").trim(),
    value: (row.querySelector("dd")?.textContent ?? "").trim(),
  }));
  const sections = [...node.querySelectorAll(".inspector-section")].map((section) => ({
    title: (section.querySelector(".inspector-section__title")?.textContent ?? "").trim(),
    rows: [...section.querySelectorAll(".panel__row")].map((row) => ({
      label: (row.querySelector("dt")?.textContent ?? "").trim(),
      value: (row.querySelector("dd")?.textContent ?? "").trim(),
    })),
  }));
  return {
    title: (node.querySelector(".panel__title")?.textContent ?? "").trim(),
    rows,
    sections,
    actions: [...node.querySelectorAll(".panel__actions .icon-btn")].map((button) =>
      (button.textContent ?? "").trim(),
    ),
    constraints: [...node.querySelectorAll(".inspector-note--constraint")].map((note) =>
      (note.textContent ?? "").trim(),
    ),
  };
};

const readHud = () => ({
  store: (document.querySelector(".resources__item--store strong")?.textContent ?? "").trim(),
  scrap: (document.querySelector(".resources__item strong")?.textContent ?? "").trim(),
});

const readSave = () => localStorage.getItem("rustwake.save.v1");

/** Programmatic ink check: sample each route's painted polyline and count route-ink hits
 * (strict + within 3 px), the same class test measure-belt001-g4 uses. No vision claims. */
function inkFn(samplesList) {
  const canvas = document.querySelector("canvas");
  if (!canvas) return samplesList.map(() => ({ hits: 0, near: 0, total: 0 }));
  const ctx = canvas.getContext("2d");
  const dpr = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const at = (x, y) => {
    const X = Math.round(x * dpr);
    const Y = Math.round(y * dpr);
    if (!(X >= 0 && Y >= 0 && X < canvas.width && Y < canvas.height)) return null;
    const i = (Y * canvas.width + X) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  const routeInk = (rgb) => rgb !== null && rgb[1] - rgb[0] > 55 && rgb[2] - rgb[0] > 60;
  return samplesList.map((samples) => {
    let hits = 0;
    let near = 0;
    for (const sample of samples) {
      if (routeInk(at(sample.x, sample.y))) {
        hits += 1;
        near += 1;
        continue;
      }
      let found = false;
      for (let r = 1; r <= 3 && !found; r += 1) {
        for (let dy = -r; dy <= r && !found; dy += 1) {
          for (let dx = -r; dx <= r && !found; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (routeInk(at(sample.x + dx, sample.y + dy))) found = true;
          }
        }
      }
      if (found) near += 1;
    }
    return { hits, near, total: samples.length };
  });
}

function routeSamples(camera, view, run) {
  const pts = run.map((tile) => {
    const w = tileToWorld(tile);
    return worldToScreen(camera, view, w.x, w.y);
  });
  const samples = [];
  for (let i = 1; i < pts.length; i += 1) {
    for (let k = 0; k <= 5; k += 1) {
      const f = k / 5;
      samples.push({
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      });
    }
  }
  return samples;
}

/** Seed one scenario page: claim a fresh writer lease, then install the save once per
 * TAB (sessionStorage survives reload, not a new page). Later scenario pages overwrite
 * the shared-origin save; the orphan page's reload keeps the app's own persisted frame
 * (true idempotence, not a re-seed). */
async function seedPage(page, raw) {
  await page.addInitScript(
    ([saveKey, leaseKey, value]) => {
      localStorage.removeItem(leaseKey);
      if (!sessionStorage.getItem("rw100-seeded")) {
        localStorage.setItem(saveKey, value);
        sessionStorage.setItem("rw100-seeded", "1");
      }
    },
    [SAVE_KEY, LEASE_KEY, raw],
  );
}

async function dismissBoot(page) {
  await page.evaluate(() => {
    const begin = [...document.querySelectorAll("button")].find(
      (node) => (node.textContent ?? "").trim() === "Begin recovery",
    );
    begin?.click();
  });
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
  await page.waitForTimeout(250);
  return true;
}

async function clickAction(page, text) {
  const clicked = await page.evaluate((want) => {
    const button = [...document.querySelectorAll(".panel__actions .icon-btn")].find(
      (node) => (node.textContent ?? "").trim() === want,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);
  await page.waitForTimeout(300);
  return clicked;
}

const readDismantleCard = () => {
  const card = document.querySelector('[data-flow="dismantle"]');
  if (!card) return null;
  return {
    armed: card.dataset.armed ?? null,
    fits: card.dataset.fits ?? null,
    impact: [...card.querySelectorAll(".place-strip__impact li")].map((li) =>
      (li.textContent ?? "").trim(),
    ),
    total: (card.querySelector(".place-strip__total")?.textContent ?? "").trim(),
    confirm: (card.querySelector(".place-strip__confirm")?.textContent ?? "").trim(),
  };
};

async function clickCardConfirm(page) {
  const clicked = await page.evaluate(() => {
    const button = document.querySelector('[data-flow="dismantle"] .place-strip__confirm');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  });
  await page.waitForTimeout(300);
  return clicked;
}

/** The real dismantle path: panel face -> Dismantle check card -> arm -> commit. The
 * card's own belt line and total are asserted against the registered set on the way. */
async function dismantleThroughCard(page, scenario, cell, face, beltSum, linkCount) {
  check(scenario, cell, "dismantle face button opens the check card",
    await clickAction(page, `Dismantle · +${face} units`));
  let card = await page.evaluate(readDismantleCard);
  check(scenario, cell, "check card fits and is unarmed",
    card?.fits === "true" && card?.armed === "false", card);
  const beltLine = `Belt links return +${beltSum} across ${linkCount} links`;
  check(scenario, cell, `card belt line names all ${linkCount} registered links`,
    (card?.impact ?? []).includes(beltLine), { impact: card?.impact, expected: beltLine });
  check(scenario, cell, "card total == panel face",
    card?.total === `Total back to the store: +${face} units`, card?.total);
  check(scenario, cell, "first confirm arms", await clickCardConfirm(page));
  card = await page.evaluate(readDismantleCard);
  check(scenario, cell, "card armed after first confirm",
    card?.armed === "true" && card?.confirm === "Tap again to dismantle", card);
  const armedShot = await shot(page, cell, scenario, "armed");
  check(scenario, cell, "second confirm commits", await clickCardConfirm(page));
  return { card, armedShot };
}

const faceOf = (panel) => {
  const face = panel?.actions.find((text) => /^Dismantle · \+\d+ units?$/.test(text));
  if (!face) return null;
  return Number(face.match(/\+(\d+)/)[1]);
};

const linksRowOf = (panel) =>
  panel?.sections.find((section) => section.title === "Transport")?.rows.find(
    (row) => row.label === "Links",
  )?.value ?? null;

async function auditInk(page, scenario, cell, sim) {
  const geometry = await page.evaluate(readGeometry);
  const runs = sim.routes.filter((route) => route.run).map((route) => route.run);
  const samplesList = runs.map((run) => routeSamples(geometry.camera, geometry.view, run));
  const ink = await page.evaluate(inkFn, samplesList);
  ink.forEach((reading, index) => {
    check(scenario, cell, `route ${sim.routes.filter((r) => r.run)[index].id} painted (ink hits)`,
      reading.near > 0, reading);
  });
  return ink;
}

async function shot(page, cell, scenario, phase) {
  mkdirSync(shots, { recursive: true });
  const path = `${shots}/${cell.label}-${scenario}-${phase}.png`;
  await page.screenshot({ path });
  return path;
}

/* ---- scenarios ---- */

async function runFourYard(page, cell) {
  const scenario = "four-yard";
  const state = fourRouteYard();
  const expect = fourYardExpect(state);
  const raw = encodeSave(state, Date.now(), SETTINGS);
  await seedPage(page, raw);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await dismissBoot(page);
  check(scenario, cell, "tap opens the sorter panel", await tapMachine(page, 4));
  const panel = await page.evaluate(readPanel);
  check(scenario, cell, "panel title is Scrap sorter", panel?.title === "Scrap sorter", panel?.title);
  // Pre-capture face parity: the face sums ALL FOUR touching belts + the build refund.
  const face = faceOf(panel);
  check(scenario, cell, "dismantle face == model refund (all 4 belts)", face === expect.face,
    { face, expected: expect.face, buildRefund: expect.buildRefund, beltSum: expect.beltSum });
  check(scenario, cell, "face exceeds the pre-fix delta by the orphaned belt refund",
    face === expect.preFixDelta + beltRefundOf(state.routes.find((r) => r.from.id === 1)),
    { face, preFixDelta: expect.preFixDelta });
  const extent = expect.touching.map((route) => beltExtentLine(route)).join(t("value.comma"));
  check(scenario, cell, "Transport Links row lists all four extents", linksRowOf(panel) === extent,
    { got: linksRowOf(panel), expected: extent });
  check(scenario, cell, "no noOutputLink advisory (outputs exist)",
    !(panel?.constraints ?? []).some((text) => text.startsWith("No output link")),
    panel?.constraints);
  // Frame mirror audit before the click.
  const beforeRaw = await page.evaluate(readSave);
  const before = decodeSave(beforeRaw);
  check(scenario, cell, "pre-click save decodes", before.ok === true);
  const sim = before.ok ? before.payload.sim : null;
  check(scenario, cell, "pre-click mirror: 4 routes, mirror names last, 2 inRoutes",
    sim?.routes.length === 4 && sim?.machines[0]?.outRoute === 4 &&
      sim?.machines[0]?.inRoutes.length === 2,
    { routes: sim?.routes.length, outRoute: sim?.machines[0]?.outRoute, inRoutes: sim?.machines[0]?.inRoutes });
  check(scenario, cell, "pre-click store is the inert floor balance", sim?.storeUnits === 10,
    { storeUnits: sim?.storeUnits, store: sim?.store });
  await auditInk(page, scenario, cell, sim);
  const preShot = await shot(page, cell, scenario, "pre");
  // The real Dismantle click.
  const beforeTotals = systemTotals(sim);
  const beforeUnits = unitTotal(sim);
  const beforeRevision = sim.revision;
  const { armedShot } = await dismantleThroughCard(
    page, scenario, cell, face, expect.beltSum, expect.touching.length,
  );
  const afterRaw = await page.evaluate(readSave);
  const after = decodeSave(afterRaw);
  check(scenario, cell, "post-click save decodes", after.ok === true);
  const post = after.ok ? after.payload.sim : null;
  const delta = post ? post.storeUnits - sim.storeUnits : null;
  check(scenario, cell, "engine store delta == face", delta === face, { delta, face });
  check(scenario, cell, "machine and every route dropped", post?.machines.length === 0 && post?.routes.length === 0,
    { machines: post?.machines.length, routes: post?.routes.length });
  check(scenario, cell, "validateSim null after dismantle", post ? validateSim(post) === null : false,
    post ? validateSim(post) : "no save");
  check(scenario, cell, "revision advanced exactly once", post?.revision === beforeRevision + 1,
    { before: beforeRevision, after: post?.revision });
  const afterTotals = systemTotals(post);
  const createdScrap = expect.face; // build + belt refunds are all scrap; nothing else moves
  check(scenario, cell, "conservation: only the priced scrap refund is created",
    unitTotal(post) - beforeUnits === createdScrap &&
      (afterTotals.scrap ?? 0) - (beforeTotals.scrap ?? 0) === createdScrap,
    { unitDelta: unitTotal(post) - beforeUnits, scrapDelta: (afterTotals.scrap ?? 0) - (beforeTotals.scrap ?? 0), createdScrap });
  const hud = await page.evaluate(readHud);
  check(scenario, cell, "HUD store chip mirrors the refunded balance",
    hud.store === capacityText(post.storeUnits, post.storeCapacity) && hud.scrap === hudNumber(post.store.scrap ?? 0),
    { hud, expectedStore: capacityText(post.storeUnits, post.storeCapacity) });
  const postShot = await shot(page, cell, scenario, "post");
  return { preShot, armedShot, postShot, face, delta };
}

async function runConnectParity(page, cell, blueprint) {
  const scenario = `connect-${blueprint}`;
  const state = connectYard(blueprint);
  const expect = connectExpect(state, blueprint);
  const raw = encodeSave(state, Date.now(), SETTINGS);
  await seedPage(page, raw);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await dismissBoot(page);
  check(scenario, cell, "tap opens the machine panel", await tapMachine(page, 8));
  let panel = await page.evaluate(readPanel);
  check(scenario, cell, "panel title", panel?.title === BLUEPRINTS[blueprint].label, panel?.title);
  check(scenario, cell, "Connect affordance present", (panel?.actions ?? []).includes("Connect"), panel?.actions);
  check(scenario, cell, "pre-Connect face sums build + input belt only", faceOf(panel) === expect.preFace,
    { face: faceOf(panel), expected: expect.preFace });
  check(scenario, cell, "planner offers exactly the two output plans", expect.plans.length === 2,
    expect.plans.map((plan) => ({ from: plan.from, to: plan.to, filter: plan.filter, tiles: plan.tiles })));
  // The real Connect click: one tap lays BOTH output plans.
  check(scenario, cell, "Connect clicked", await clickAction(page, "Connect"));
  const midRaw = await page.evaluate(readSave);
  const mid = decodeSave(midRaw);
  check(scenario, cell, "post-Connect save decodes", mid.ok === true);
  const sim = mid.ok ? mid.payload.sim : null;
  const outputs = sim ? outputRouteIds(sim, expect.machine.id) : [];
  check(scenario, cell, "both output routes registered (derived from the table)", outputs.length === 2,
    { outputs, routes: sim?.routes.length });
  check(scenario, cell, "legacy mirror names the newest output only",
    sim?.machines[0]?.outRoute === outputs[outputs.length - 1],
    { outRoute: sim?.machines[0]?.outRoute, last: outputs[outputs.length - 1] });
  check(scenario, cell, "Connect paid exactly the printed belt price",
    sim?.storeUnits === state.storeUnits - expect.connectCost,
    { storeUnits: sim?.storeUnits, expected: state.storeUnits - expect.connectCost });
  // Repaint face parity: input + BOTH output belts + build refund.
  panel = await page.evaluate(readPanel);
  const face = faceOf(panel);
  check(scenario, cell, "repainted dismantle face == build + all three belt refunds", face === expect.face,
    { face, expected: expect.face });
  const touching = sim.routes.filter(
    (route) => route.from.id === expect.machine.id || route.to.id === expect.machine.id,
  );
  const extent = touching.map((route) => beltExtentLine(route)).join(t("value.comma"));
  check(scenario, cell, "Transport Links row lists all three extents", linksRowOf(panel) === extent,
    { got: linksRowOf(panel), expected: extent });
  check(scenario, cell, "no noOutputLink advisory with two live outputs",
    !(panel?.constraints ?? []).some((text) => text.startsWith("No output link")),
    panel?.constraints);
  check(scenario, cell, "no busy-link note on quiet belts",
    !(panel?.constraints ?? []).some((text) => text.startsWith("Transport limit")),
    panel?.constraints);
  await auditInk(page, scenario, cell, sim);
  const preShot = await shot(page, cell, scenario, "pre");
  // The real Dismantle click.
  const beforeTotals = systemTotals(sim);
  const beforeUnits = unitTotal(sim);
  const beltSum = touching.reduce((total, route) => total + beltRefundOf(route), 0);
  const { armedShot } = await dismantleThroughCard(
    page, scenario, cell, face, beltSum, touching.length,
  );
  const afterRaw = await page.evaluate(readSave);
  const after = decodeSave(afterRaw);
  check(scenario, cell, "post-dismantle save decodes", after.ok === true);
  const post = after.ok ? after.payload.sim : null;
  const delta = post ? post.storeUnits - sim.storeUnits : null;
  check(scenario, cell, "engine store delta == face (both belts refunded)", delta === face, { delta, face });
  check(scenario, cell, "machine and every route dropped", post?.machines.length === 0 && post?.routes.length === 0,
    { machines: post?.machines.length, routes: post?.routes.length });
  check(scenario, cell, "validateSim null after dismantle", post ? validateSim(post) === null : false,
    post ? validateSim(post) : "no save");
  const afterTotals = systemTotals(post);
  const keys = new Set([...Object.keys(beforeTotals), ...Object.keys(afterTotals)]);
  let conservationOk = unitTotal(post) - beforeUnits === Object.values(expect.created).reduce((a, b) => a + b, 0);
  const perResource = {};
  for (const key of keys) {
    const diff = (afterTotals[key] ?? 0) - (beforeTotals[key] ?? 0);
    perResource[key] = { diff, created: expect.created[key] ?? 0 };
    if (diff !== (expect.created[key] ?? 0)) conservationOk = false;
  }
  check(scenario, cell, "per-resource conservation (build refunds + belt scrap only)", conservationOk, perResource);
  const postShot = await shot(page, cell, scenario, "post");
  return { preShot, armedShot, postShot, face, delta };
}

async function runOrphanRepair(page, cell) {
  const scenario = "orphan-save";
  const { state, orphan } = orphanSave();
  const damagedValidation = validateSim(state);
  const beltRefund = beltRefundOf(orphan);
  const cargo = orphan.items.reduce((total, item) => total + item.qty, 0);
  const damagedUnits = state.storeUnits;
  const damagedScrap = state.store.scrap ?? 0;
  const damagedCopper = systemTotals(state).copper ?? 0;
  const raw = encodeSave(state, Date.now(), SETTINGS);
  // Node-side witness: un-repaired the save is invalid; decodeSave repairs it deterministically.
  const repaired = decodeSave(raw);
  check(scenario, cell, "damaged save fails validateSim un-repaired (the reset trigger)",
    damagedValidation === `routeSource:${orphan.id}`, damagedValidation);
  check(scenario, cell, "decodeSave repairs before validation", repaired.ok === true,
    repaired.ok ? null : repaired.reason);
  await seedPage(page, raw);
  await page.goto(url, { waitUntil: "networkidle" });
  // PERSIST_MS is 1000: wait past one periodic checkpoint so the app's OWN persisted
  // frame (not the seed) is what the reload reads.
  await page.waitForTimeout(2200);
  await dismissBoot(page);
  const liveRaw = await page.evaluate(readSave);
  const live = decodeSave(liveRaw);
  check(scenario, cell, "loaded frame mirror decodes (no invalid fallback)", live.ok === true,
    live.ok ? null : `${live.reason}:${live.detail ?? ""}`);
  const sim = live.ok ? live.payload.sim : null;
  check(scenario, cell, "orphan belt dropped on load", sim?.routes.length === 0, { routes: sim?.routes.length });
  check(scenario, cell, "no reset: tutorial, store and machine cursor survive",
    sim?.tutorial === 9 && sim?.storeUnits === damagedUnits + cargo + beltRefund && sim?.nextMachineId === 2,
    { tutorial: sim?.tutorial, storeUnits: sim?.storeUnits, expected: damagedUnits + cargo + beltRefund, nextMachineId: sim?.nextMachineId });
  check(scenario, cell, "cargo conserved: copper relocated to the store",
    (systemTotals(sim ?? state).copper ?? 0) === damagedCopper,
    { copper: systemTotals(sim ?? state).copper ?? 0, expected: damagedCopper });
  check(scenario, cell, "belt refunded exactly once at dismantleRefundPct",
    (sim?.store.scrap ?? 0) === damagedScrap + beltRefund &&
      unitTotal(sim ?? state) - damagedUnits === cargo + beltRefund,
    { scrap: sim?.store.scrap, expected: damagedScrap + beltRefund, beltRefund, cargo });
  check(scenario, cell, "validateSim null on the repaired live frame", sim ? validateSim(sim) === null : false,
    sim ? validateSim(sim) : "no save");
  const hud = await page.evaluate(readHud);
  check(scenario, cell, "HUD shows the repaired balance, not a fresh yard",
    sim != null && hud.store === capacityText(sim.storeUnits, sim.storeCapacity) && sim.storeUnits > 0,
    { hud, storeUnits: sim?.storeUnits });
  // The app itself must have persisted the repair (parse raw, no decode-repair): this is
  // what makes the reload a true idempotence test rather than a re-seed.
  const persisted = JSON.parse(liveRaw ?? "null");
  check(scenario, cell, "app persisted the repaired frame (routes gone, cargo in store)",
    persisted?.payload?.sim?.routes?.length === 0 &&
      persisted?.payload?.sim?.storeUnits === damagedUnits + cargo + beltRefund,
    { routes: persisted?.payload?.sim?.routes?.length, storeUnits: persisted?.payload?.sim?.storeUnits });
  const firstShot = await shot(page, cell, scenario, "loaded");
  // Reload idempotence: the repaired save must not refund a second time.
  const unitsBeforeReload = sim?.storeUnits;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await dismissBoot(page);
  const reloadRaw = await page.evaluate(readSave);
  const reload = decodeSave(reloadRaw);
  check(scenario, cell, "reload decodes", reload.ok === true);
  const reSim = reload.ok ? reload.payload.sim : null;
  check(scenario, cell, "reload refunds nothing a second time (idempotent repair)",
    reSim?.storeUnits === unitsBeforeReload && reSim?.routes.length === 0,
    { before: unitsBeforeReload, after: reSim?.storeUnits, routes: reSim?.routes.length });
  const reloadShot = await shot(page, cell, scenario, "reloaded");
  return { firstShot, reloadShot, beltRefund, cargo, storeUnits: reSim?.storeUnits };
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
    ["fourRouteYard", fourRouteYard],
    ["connectYard-sorter", () => connectYard("sorter")],
    ["connectYard-copperSeparator", () => connectYard("copperSeparator")],
    ["orphanSave", () => orphanSave().state],
  ]) {
    const a = encodeSave(build(), WITNESS_MS, SETTINGS);
    const b = encodeSave(build(), WITNESS_MS, SETTINGS);
    witness[name] = { byteIdentical: a === b, checksum: checksum(a) };
    if (a !== b) throw new Error(`fixture ${name} is not deterministic`);
  }
  // REWORK guard (QA verdict 6817277787): a checksum-VALID malformed route table must
  // refuse GRACEFULLY through decodeSave — repair never throws and never masks the
  // refusal. Engine-level checks, independent of the browser cells below.
  const malformedBase = createInitialState();
  malformedBase.tutorial = 9;
  const malformedEnvelope = (routes) => {
    const envelope = JSON.parse(encodeSave(malformedBase, WITNESS_MS, SETTINGS));
    envelope.payload.sim.routes = routes;
    envelope.checksum = checksum(JSON.stringify(envelope.payload));
    return JSON.stringify(envelope);
  };
  let malformedRefusal = null;
  let malformedThrow = null;
  try {
    malformedRefusal = decodeSave(malformedEnvelope([{}]));
  } catch (error) {
    malformedThrow = String(error);
  }
  check("malformed-import", "node", "checksum-valid routes:[{}] refuses gracefully, never throws",
    malformedThrow === null && malformedRefusal?.ok === false &&
      malformedRefusal?.reason === "invalid" && malformedRefusal?.detail === "routeCapacity:undefined",
    { threw: malformedThrow, result: malformedRefusal });
  const malformedSim = createInitialState();
  malformedSim.tutorial = 9;
  malformedSim.routes = [
    {},
    null,
    { id: 9, capacity: 4, inFlight: 0, items: [], from: null, to: { kind: "store", id: 0 } },
    { id: 10, capacity: 4, inFlight: 0, items: [], from: { kind: "store", id: 0 }, to: "yard" },
  ];
  const malformedBefore = JSON.stringify(malformedSim);
  let repairThrow = null;
  try {
    repairRegistration(malformedSim);
  } catch (error) {
    repairThrow = String(error);
  }
  check("malformed-import", "node", "repair leaves malformed route entries untouched, never throws",
    repairThrow === null && JSON.stringify(malformedSim) === malformedBefore,
    { threw: repairThrow });
  const nonArrayItemsSim = createInitialState();
  nonArrayItemsSim.tutorial = 9;
  nonArrayItemsSim.routes = [{
    id: 7, from: { kind: "machine", id: 99 }, to: { kind: "store", id: 0 },
    filter: null, capacity: 4, latency: 1, run: [1, 2],
    items: { resource: "scrap", qty: 3 }, inFlight: 0, busyTicks: 0, ageTicks: 0,
  }];
  const nonArrayBefore = nonArrayItemsSim.storeUnits;
  let nonArrayThrow = null;
  try {
    repairRegistration(nonArrayItemsSim);
  } catch (error) {
    nonArrayThrow = String(error);
  }
  const nonArrayRefund = Math.round((TUNING.beltCostPerTile * 2 * TUNING.dismantleRefundPct) / 100);
  check("malformed-import", "node", "dropped orphan with non-array items compensates without throwing",
    nonArrayThrow === null && nonArrayItemsSim.routes.length === 0 &&
      nonArrayItemsSim.storeUnits - nonArrayBefore === nonArrayRefund,
    { threw: nonArrayThrow, refund: nonArrayItemsSim.storeUnits - nonArrayBefore, expected: nonArrayRefund });
  console.log(`REG-100 headless evidence · ${url} · head ${headSha}`);
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
      // One fresh page per scenario: each seeds its own save via a page-level init script.
      const scenarios = [
        ["four-yard", (page) => runFourYard(page, cell)],
        ["connect-sorter", (page) => runConnectParity(page, cell, "sorter")],
        ["connect-copperSeparator", (page) => runConnectParity(page, cell, "copperSeparator")],
        ["orphan-save", (page) => runOrphanRepair(page, cell)],
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
    generatedBy: "scripts/probe-registration100.mjs",
    issue: "https://github.com/darkmatter2222/Rustwake/issues/100",
    pr: "https://github.com/darkmatter2222/Rustwake/pull/103",
    headSha,
    url,
    tuning: {
      beltCostPerTile: TUNING.beltCostPerTile,
      dismantleRefundPct: TUNING.dismantleRefundPct,
      reserveFloor: TUNING.reserveFloor,
      dockCapacity: TUNING.dockCapacity,
    },
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
  console.log(`\nREG-100 evidence: ${body.summary.passed}/${body.summary.total} checks passed, ${failed.length} failed`);
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