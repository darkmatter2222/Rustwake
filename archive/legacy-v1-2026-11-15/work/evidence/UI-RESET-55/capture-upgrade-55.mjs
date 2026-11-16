// UI-RESET-55 — explicit upgrade branch comparison evidence probe (issue #55, G2 wave 4).
//
// Purpose: prove the branch-card comparison paints its claimed state on real builds
// in both form factors, that nothing is auto-selected, that repeated taps never drift
// the target or double-charge, that every purchase/respec goes through the REAL UI
// path (click -> dispatch -> applyCommand -> persisted sim) with the printed price
// equal to the engine's branchPrice equal to the credits delta, and that the two
// contrasting factory conditions (power-limited yard vs buffer-starved yard) explain
// the branch choice from state alone — no balance change anywhere.
//
// Prerequisites (from the worktree root):
//   pnpm build
//   node node_modules/vite/bin/vite.js preview --port 4275 --strictPort
//   node --import tsx work/evidence/UI-RESET-55/capture-upgrade-55.mjs
// (tsx lets the probe build seeds with the game's OWN command engine and encodeSave
// checksum, and assert painted numbers against the engine's own branchPrice /
// batchMilliOf / powerOf / inputCapacityOf — read-only imports; no src file is modified.)
//
// NO VISION: every frame is audited by DOM/geometry/console assertions only.
// FRAME AUDIT hard rule: shot() records probe() + audit() for EVERY capture; a frame
// whose claimed state is not painted fails the run (exit 1).
//
// Probe-only seed mutations (NEVER in src; sim validation untouched), documented in
// MUTATIONS below. Every seed is persisted via the game's own encodeSave (checksum
// included) with lastSeenMs = Date.now() so no catch-up drift lands during capture.
//
// Synchronous action proof: clickUpgradeSync / clickActionSync click the real button
// and read localStorage in the SAME JS task — dispatch -> applyCommand -> persist is
// synchronous, so zero engine ticks elapse between click and read. The pre-click
// baseline is flushed through the real HudTop sound toggle (setSettings persists the
// live sim synchronously and mutates no sim field; restored after the read).
//
// Determinism freeze (command-built yards): every route items=[]/inFlight=0, every
// machine tray empty, input buffer FULL (engine pullNeed=0, no arrivals) and the
// batch frozen mid-cycle (progress=1, batchMilli=1e9, never completes during
// capture). Credits move ONLY through the real upgrade commands under test.
//
// Camera/tap helpers are copied from the proven UI-RESET-54 inspector probe
// (App.fitToShell reproduction); taps land on real canvas machine centres.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
// Read-only game imports (run under tsx): seeds are built with the real command
// engine and persisted with the game's own encodeSave checksum, exactly like a
// player's save. Painted numbers are asserted against the engine's own functions.
import { applyCommand, branchPrice, upgradeCost } from "../../../src/game/simulation/commands.ts";
import {
  createInitialState,
  batchMilliOf,
  powerOf,
  inputCapacityOf,
  upgradeRanks,
} from "../../../src/game/simulation/types.ts";
import { advance } from "../../../src/game/simulation/engine.ts";
import { BLUEPRINTS, RECIPES, TUNING } from "../../../src/game/content/defs.ts";
import { researchBonus } from "../../../src/game/content/research.ts";
import { encodeSave, DEFAULT_SETTINGS } from "../../../src/game/persistence/save.ts";
import { formatSeconds, plural, t, unit } from "../../../src/game/content/strings.ts";
import { UPGRADE_COPY } from "../../../src/ui/upgrade/copy.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const out = __dirname;
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4275/";
const exe =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe",
   "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
if (!exe) throw new Error("no Chrome/Edge executable; set CHROME_PATH");

const seedRaw = fs.readFileSync(path.join(root, "docs/evidence/yard-mature.json"), "utf8");
const SAVE_KEY = "rustwake.save.v1";
const SECTION_TITLES = ["Identity", "Recipe", "Production", "Bottleneck", "Transport", "Recovery context", "Actions"];
const ACTION_GRAMMAR = /^(Connect|Upgrade · \d+ credits|Move · cell \d+ · \d+ units|Dismantle · \+\d+ units)$/;
const BRANCH_ORDER = ["speed", "buffer", "draw"];
const MUTATIONS = [
  "base: payload.lastSeenMs = Date.now() (avoid catch-up drift); yard-mature credits 82 -> 1000 (M1 lvl14 plain upgrade costs 222 via the engine's iterative ceil; the printed cost is still the real engine formula, asserted against the sim delta)",
  "commandYard: seed built with the real engine (createInitialState + 6 salvage pulses + drone.repair + advance 262, then probe-only restock store.scrap=500/store.ferrous=100/storeCapacity=2000 BEFORE the priced builds/connects so every command is affordable — furnace buildCost is scrap 10 + ferrous 5), then build sorter tile 8 + scrap input + ferrous/nonferrous outputs [+ furnaces tiles 9..12] + advance 120 + tutorial=9/exportClaimed + credits=1000 (or 12 for the shortfall yard); every seed command asserts ok",
  "freeze: every route items=[]/inFlight=0; every machine tray=[]/trayUnits=0, inBuf full at blueprint.inputBuffer (engine pullNeed=0, no arrivals), batch=[input x recipe qty]/progress=1/batchMilli=1e9 (frozen mid-batch, never completes during capture), status=running. Credits move ONLY through the real upgrade/respec commands under test",
  "starved: input route removed + sorter.inRoutes=[] + inBuf={}/inBufUnits=0 + batch=null/progress=0 (sorter stays starved while the frame is captured; the engine cannot start a batch with an empty buffer and no input link)",
  "power: NO batchPower mutation — four frozen furnaces (draw 2 each) plus the sorter (draw 1) request 9 > TUNING.yardPowerCapacity 8, so the yard is genuinely power limited; demand/percent are computed from the live sim at frame time and the DOM is asserted against that",
  "textScale: settings.textScale = 2 (200% text frames)",
];

const creditWord = t("unit.credit");
const unitWord = t("unit.unit");
const costText = (base, level, branch) => unit(branchPrice(base, level, branch), creditWord);
const secondsText = (m) => t("value.seconds", { seconds: formatSeconds(batchMilliOf(m) / 10000) });
const unitsText = (n) => unit(n, unitWord);
const shortfallText = (need, have) => t("reject.shortfall", { need, have, word: plural(need, creditWord) });
const afterBuy = (m, branch) => ({ ...m, level: m.level + 1, branch: [...(m.branch ?? []), branch] });
const endpointId = (e) => (e !== null && typeof e === "object" ? e.id : e);

// The engine's real upgrade cost: iterative ceil, NOT ceil(base*1.16^level).
// (Imported branchPrice/upgradeCost are the engine's own; this local copy is only
// used to cross-check the import against the documented formula.)
function engineUpgradeCost(base, level) {
  let cost = base;
  for (let i = 1; i < level; i += 1) cost = Math.ceil(cost * 1.16);
  return cost;
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function seedWith(fn) {
  const env = JSON.parse(seedRaw);
  fn(env.payload.sim, env.payload.settings, env.payload);
  env.checksum = fnv1a(JSON.stringify(env.payload));
  return JSON.stringify(env);
}

function install(ctx, text) {
  ctx.addInitScript(({ key, text }) => {
    const fnv = (s) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, "0");
    };
    const env = JSON.parse(text);
    env.checksum = fnv(JSON.stringify(env.payload));
    localStorage.setItem(key, JSON.stringify(env));
  }, { key: SAVE_KEY, text });
}

// Determinism freeze (probe-only, documented in MUTATIONS): tray empty + buffer
// full + frozen batch means the engine cannot load cargo or start a new batch, so
// credits and machine state move ONLY through the commands under test.
function freezeMachine(m) {
  const bp = BLUEPRINTS[m.blueprint];
  const recipe = RECIPES[bp.recipeId];
  const input = recipe.inputs[0];
  m.tray = [];
  m.trayUnits = 0;
  m.inBuf = { [input.resource]: bp.inputBuffer };
  m.inBufUnits = bp.inputBuffer;
  m.batch = [{ resource: input.resource, qty: input.qty }];
  m.progress = 1;
  m.batchMilli = 1000000000;
  m.status = "running";
}

// Command-built yard: every build/connect is a real engine command; the restock,
// credits and freeze are probe-only mutations documented in MUTATIONS. The result
// passes the game's own validateSim via encodeSave/decodeSave.
function commandYardSeed({ furnaceCount = 1, credits = 1000, starvedSorter = false, textScale = 1 }) {
  const s = createInitialState();
  let n = 0;
  const send = (body) => {
    const res = applyCommand(s, { ...body, id: `ev55-${(n += 1)}` });
    if (!res.ok) throw new Error(`commandYard seed ${body.type} rejected: ${res.reason}`);
    return res;
  };
  for (let i = 0; i < 6; i += 1) {
    send({ type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(s, 262);
  s.store.scrap = 500;
  s.store.ferrous = 100;
  s.storeCapacity = 2000;
  s.storeUnits = Object.values(s.store).reduce((total, q) => total + q, 0);
  send({ type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = s.machines[s.machines.length - 1];
  send({ type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send({ type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  send({ type: "route.connect", from: sorter.id, to: 0, filter: "nonferrous" });
  const furnaceIds = [];
  for (let i = 0; i < furnaceCount; i += 1) {
    send({ type: "machine.build", blueprint: "furnace", tile: 9 + i });
    const furnace = s.machines[s.machines.length - 1];
    furnaceIds.push(furnace.id);
    // Link every furnace (ferrous in, steel out) so it is a placed, working machine:
    // its inspector then leads with the Upgrade face exactly like the sorter, and the
    // #54 three-face action grammar holds. Routes are frozen below like the sorter's.
    send({ type: "route.connect", from: 0, to: furnace.id, filter: "ferrous" });
    send({ type: "route.connect", from: furnace.id, to: 0, filter: "steel" });
  }
  advance(s, 120);
  s.tutorial = 9;
  s.exportClaimed = true;
  s.credits = credits;
  for (const r of s.routes) { r.items = []; r.inFlight = 0; }
  if (starvedSorter) {
    const inputRoute = s.routes.find((r) => endpointId(r.to) === sorter.id && endpointId(r.from) === 0);
    if (!inputRoute) throw new Error("starved seed: no input route found");
    s.routes = s.routes.filter((r) => r.id !== inputRoute.id);
    sorter.inRoutes = [];
    sorter.inBuf = {};
    sorter.inBufUnits = 0;
    // Idle batch is an EMPTY ARRAY in the engine (engine.ts m.batch = []), never null:
    // validateSim refuses a non-array batch and the app would silently fall back to a
    // fresh tutorial yard. Keep the starved sorter save-valid.
    sorter.batch = [];
    sorter.progress = 0;
    sorter.tray = [];
    sorter.trayUnits = 0;
    sorter.status = "starved";
    for (const m of s.machines) if (m.id !== sorter.id) freezeMachine(m);
  } else {
    for (const m of s.machines) freezeMachine(m);
  }
  const settings = { ...DEFAULT_SETTINGS, textScale };
  return { text: encodeSave(s, Date.now(), settings), sorterId: sorter.id, furnaceIds, sim: s };
}

// Live power frame: demand = sum of batchPower over machines with progress>0
// (engine allocatePower), percent = round(min(1, 8/demand)*100).
function powerFrame(pr) {
  const demand = pr.sim.machines.reduce((total, m) => total + (m.progress > 0 ? m.batchPower : 0), 0);
  const percent = demand === 0 ? 100 : Math.max(0, Math.min(100, Math.round(Math.min(1, 8 / demand) * 100)));
  return { demand, percent };
}

async function make(browser, vp, seedText) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr ?? 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
  });
  const errors = [];
  if (seedText) install(ctx, seedText);
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery", { timeout: 15000 });
  return { ctx, p, errors };
}

async function settle(p, mature) {
  await p.click("text=Begin recovery");
  if (!mature) {
    // Dismiss the "While you were away" catch-up dialog so the yard — not the
    // overlay — is what paints. The frozen sim has no real catch-up to apply;
    // lastSeenMs=now keeps the away window empty, but the dialog still surfaces.
    for (let i = 0; i < 12; i++) {
      await p.waitForTimeout(200);
      const back = await p.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("Back to yard"));
        if (b) { b.click(); return true; }
        return false;
      });
      if (back) { await p.waitForTimeout(350); return; }
    }
    await p.waitForTimeout(300);
    return;
  }
  for (let i = 0; i < 32; i++) {
    await p.waitForTimeout(250);
    const state = await p.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Back to yard"));
      if (back) { back.click(); return "back"; }
      const begin = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Begin recovery"));
      return begin ? "gate" : "yard";
    });
    if (state === "back") { await p.waitForTimeout(400); return; }
    if (state === "yard" && i >= 6) { await p.waitForTimeout(250); return; }
  }
  await p.waitForTimeout(400);
}

// Shell + inspector + upgrade-surface probe: boxes, painted rects (clip-aware),
// floors, scroll, shell markers, inspector sections/rows/notes/actions, the branch
// cards/buy/receipt/respec, and the persisted sim (incl. machine.branch picks).
async function probe(p) {
  return p.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const painted = (el) => {
      const r = el.getBoundingClientRect();
      let x0 = r.x, y0 = r.y, x1 = r.right, y1 = r.bottom;
      let n = el.parentElement;
      while (n) {
        const s = getComputedStyle(n);
        if (/(auto|scroll|hidden)/.test(s.overflow + s.overflowX + s.overflowY)) {
          const c = n.getBoundingClientRect();
          x0 = Math.max(x0, c.x); y0 = Math.max(y0, c.y);
          x1 = Math.min(x1, c.right); y1 = Math.min(y1, c.bottom);
        }
        n = n.parentElement;
      }
      const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
      return { x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h), visible: w > 4 && h > 4 };
    };
    const doc = document.documentElement;
    const cs = getComputedStyle(doc);
    const buttons = [...document.querySelectorAll(".hud button")]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => {
        const pr = painted(b);
        return {
          label: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 80),
          minH: Math.round(Math.min(b.getBoundingClientRect().height, pr.h)),
          visible: pr.visible,
          px: pr.x, py: pr.y, pw: pr.w, ph: pr.h,
          inPanelActions: !!b.closest(".panel__actions"),
          inUpgrade: !!b.closest(".upgrade-compare"),
          fullH: Math.round(b.getBoundingClientRect().height),
        };
      });
    const panel = document.querySelector(".panel.panel--stack");
    const readRows = (scope) => [...scope.querySelectorAll(".panel__row")].map((r) => ({
      label: (r.querySelector("dt")?.textContent ?? "").trim(),
      value: (r.querySelector("dd")?.textContent ?? "").trim(),
    }));
    const sections = panel
      ? [...panel.querySelectorAll("section.inspector-section")].map((s) => ({
          title: (s.querySelector(".inspector-section__title")?.textContent ?? "").trim(),
          rows: readRows(s),
        }))
      : null;
    const rowMap = {};
    if (sections) for (const s of sections) for (const r of s.rows) if (!(r.label in rowMap)) rowMap[r.label] = r.value;
    const notes = panel ? [...panel.querySelectorAll(".inspector-note--constraint")].map((n) => n.textContent.trim()) : [];
    const faces = panel ? [...panel.querySelectorAll(".panel__actions > .icon-btn")].map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()) : [];
    const accentCount = panel ? panel.querySelectorAll(".panel__actions > .icon-btn:first-child").length : 0;
    const body = panel?.querySelector(".panel__body");
    const upgrade = (() => {
      const u = panel?.querySelector(".upgrade-compare");
      if (!u) return null;
      const cards = [...u.querySelectorAll(".upgrade-card")].map((b) => ({
        branch: b.getAttribute("data-branch"),
        pressed: b.getAttribute("aria-pressed") === "true",
        disabled: b.disabled,
        text: (b.textContent ?? "").trim(),
        minH: Math.round(b.getBoundingClientRect().height),
        painted: painted(b),
      }));
      const buyEl = u.querySelector("[data-buy]");
      const receiptEl = u.querySelector(".upgrade-receipt");
      return {
        cards,
        buy: buyEl ? {
          label: (buyEl.textContent ?? "").trim(),
          disabled: buyEl.disabled,
          minH: Math.round(buyEl.getBoundingClientRect().height),
          painted: painted(buyEl),
          inPanelActions: !!buyEl.closest(".panel__actions"),
        } : null,
        receipt: receiptEl ? {
          kind: (receiptEl.className.match(/upgrade-receipt--(\w+)/) ?? [])[1] ?? "",
          text: (receiptEl.textContent ?? "").trim(),
          painted: painted(receiptEl),
        } : null,
        respec: [...u.querySelectorAll("[data-respec]")].map((b) => ({
          branch: b.getAttribute("data-respec"),
          disabled: b.disabled,
          text: (b.textContent ?? "").trim(),
          minH: Math.round(b.getBoundingClientRect().height),
        })),
        notes: [...u.querySelectorAll(".upgrade-note")].map((n) => (n.textContent ?? "").trim()),
      };
    })();
    const save = (() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")); } catch { return null; } })();
    const sim = save?.payload?.sim ?? null;
    const railOn = !!document.querySelector(".shell-rail");
    return {
      viewport: { w: innerWidth, h: innerHeight },
      mode: railOn ? "rail" : (innerWidth <= 599 ? "phone" : "column"),
      boxes: {
        hud: box(".hud"), lead: box(".hud__lead") ?? box(".hud__top"),
        dock: box(".dock"), rail: box(".shell-rail"), face: box(".shell-menu-face"),
        panel: box(".panel.panel--stack"), body: box(".panel.panel--stack .panel__body"),
        canvas: box("canvas"), zoom: box(".shell-zoom"),
      },
      painted: { panel: panel ? painted(panel) : null, body: body ? painted(body) : null },
      buttons,
      docScroll: { sw: doc.scrollWidth, sh: doc.scrollHeight, cw: doc.clientWidth, ch: doc.clientHeight },
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyScroll: body ? { sw: body.scrollWidth, cw: body.clientWidth, sh: body.scrollHeight, ch: body.clientHeight, overflow: getComputedStyle(body).overflowY } : null,
      markers: {
        shellInspectorTop: cs.getPropertyValue("--shell-inspector-top").trim(),
        rail: railOn,
        face: !!document.querySelector(".shell-menu-face"),
        zoomGroup: !!document.querySelector('.shell-zoom[role="group"]'),
        zoomButtons: [...document.querySelectorAll(".shell-zoom button")].map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()),
        hud: !!document.querySelector(".hud"),
        hudLead: !!(document.querySelector(".hud__lead") ?? document.querySelector(".hud__top")),
        canvas: !!document.querySelector("canvas"),
      },
      ink: (() => {
        const c = document.querySelector("canvas");
        if (!c) return 0;
        try {
          const g = c.getContext("2d");
          const d = g.getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 300)).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
          return n / (d.length / 4);
        } catch { return -1; }
      })(),
      panel: panel ? {
        rootLabel: panel.getAttribute("aria-label"),
        title: (panel.querySelector(".panel__title")?.textContent ?? "").trim(),
        sections, rowMap, notes, faces, accentCount,
        primaryNote: (panel.querySelector(".inspector-actions-note")?.textContent ?? "").trim(),
      } : null,
      upgrade,
      sim: sim ? {
        tick: sim.tick, revision: sim.revision, credits: sim.credits, storeUnits: sim.storeUnits, powerRatio: sim.powerRatio,
        machines: sim.machines.map((m) => ({ id: m.id, blueprint: m.blueprint, tile: m.tile, level: m.level, branch: m.branch ?? null, batchMilli: m.batchMilli, batchPower: m.batchPower, progress: m.progress, status: m.status, trayUnits: m.trayUnits, inBufUnits: m.inBufUnits })),
        machineTiles: sim.machines.map((m) => m.tile),
        routes: sim.routes.map((r) => ({
          id: r.id,
          from: r.from !== null && typeof r.from === "object" ? r.from.id : r.from,
          to: r.to !== null && typeof r.to === "object" ? r.to.id : r.to,
          filter: r.filter,
        })),
      } : null,
    };
  });
}

// The camera the shell paints, reproduced from the painted chrome boxes exactly
// as App.fitToShell does (scene.ts fitCamera + the rail recentering term).
function cameraFor(boxes, W, H) {
  const { lead, dock, rail } = boxes;
  if (!lead || !dock) return null;
  const top = lead.bottom + 6;
  const bottom = Math.max(0, H - dock.y) + 6;
  const left = rail ? rail.right + 6 : 0;
  const right = rail ? 334 : 60;
  const regionW = Math.max(1, W - left - right);
  const usableH = H - top - bottom;
  const raw = Math.min(4, regionW / 200);
  let scale, y;
  if (usableH <= 0) { scale = Math.max(1.4, raw); y = 112; }
  else {
    const bandScale = usableH / 236;
    scale = bandScale >= raw ? Math.max(1.4, raw) : Math.max(1.1, Math.min(raw, bandScale));
    const bandCentre = top + usableH / 2;
    y = 112 + (H / 2 - bandCentre) / scale;
  }
  let x = 96;
  if (left > 0 || right > 0) x += (W / 2 - (left + regionW / 2)) / scale;
  return { x, y, scale };
}

async function tapMachine(p, preferTile) {
  const pr = await probe(p);
  const { w: W, h: H } = pr.viewport;
  const cam = cameraFor(pr.boxes, W, H);
  if (!cam || !pr.sim) throw new Error("tapMachine: no camera/sim");
  const x0 = pr.boxes.rail ? pr.boxes.rail.right + 2 : 2;
  const x1 = W - (pr.boxes.rail ? 334 : 2) - 2;
  const y0 = pr.boxes.lead.bottom + 2;
  const y1 = pr.boxes.dock.y - 2;
  const project = (tile) => ({
    tile,
    sx: ((tile % 6) * 32 + 16 - cam.x) * cam.scale + W / 2,
    sy: (Math.floor(tile / 6) * 32 + 16 - cam.y) * cam.scale + H / 2,
  });
  const clear = (t) => t.sx >= x0 && t.sx <= x1 && t.sy >= y0 && t.sy <= y1;
  let hit = null;
  if (preferTile != null && pr.sim.machineTiles.includes(preferTile)) {
    const t = project(preferTile);
    if (clear(t)) hit = t;
  }
  if (!hit) for (const tile of pr.sim.machineTiles) { const t = project(tile); if (clear(t)) { hit = t; break; } }
  if (!hit) throw new Error("tapMachine: no machine centre inside the clear band");
  const machine = pr.sim.machines.find((m) => m.tile === hit.tile);
  let after = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await p.mouse.click(hit.sx, hit.sy);
    await p.waitForTimeout(450);
    after = await probe(p);
    if (after.panel) break;
  }
  return { tile: hit.tile, sx: Math.round(hit.sx), sy: Math.round(hit.sy), machine, probe: after };
}

// Click a real .panel__actions button and read the persisted sim in the SAME
// evaluate task (baseline flushed through the real HudTop sound toggle).
async function clickActionSync(p, labelPrefix) {
  return p.evaluate((prefix) => {
    const readSim = () => JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim;
    const action = () => [...document.querySelectorAll(".panel__actions > .icon-btn")]
      .find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith(prefix));
    const sound = () => [...document.querySelectorAll(".hud button")]
      .find((b) => ["Sound on", "Sound off"].includes((b.getAttribute("aria-label") ?? "").trim()));
    const btn = action();
    if (!btn) return { ok: false, reason: "button not found: " + prefix };
    const flush = sound();
    if (!flush) return { ok: false, reason: "sound toggle not found for the baseline flush" };
    const stale = readSim();
    flush.click();
    const live = action();
    if (!live) return { ok: false, reason: "action face vanished after the baseline flush: " + prefix };
    const label = (live.getAttribute("aria-label") ?? live.textContent ?? "").trim();
    const before = readSim();
    live.click();
    const after = readSim();
    const restore = sound();
    if (restore) restore.click();
    return { ok: true, label, before, after, baselineLagTicks: before.tick - stale.tick };
  }, labelPrefix);
}

// Click a real upgrade-surface button ([data-buy], [data-respec="..."],
// [data-branch="..."]) and read the persisted sim in the SAME evaluate task.
// Card taps dispatch nothing: the before/after sims prove it.
async function clickUpgradeSync(p, selector) {
  return p.evaluate((sel) => {
    const readSim = () => JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim;
    const sound = () => [...document.querySelectorAll(".hud button")]
      .find((b) => ["Sound on", "Sound off"].includes((b.getAttribute("aria-label") ?? "").trim()));
    const target = () => document.querySelector(sel);
    const btn = target();
    if (!btn) return { ok: false, reason: "button not found: " + sel };
    const flush = sound();
    if (!flush) return { ok: false, reason: "sound toggle not found for the baseline flush" };
    const stale = readSim();
    flush.click();
    const live = target();
    if (!live) return { ok: false, reason: "button vanished after the baseline flush: " + sel };
    const label = (live.textContent ?? "").trim();
    const disabled = live.disabled;
    const before = readSim();
    live.click();
    const after = readSim();
    const restore = sound();
    if (restore) restore.click();
    return { ok: true, label, disabled, before, after, baselineLagTicks: before.tick - stale.tick };
  }, selector);
}

async function scrollUpgradeIntoView(p, selector, block = "start") {
  await p.evaluate(({ sel, block }) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block });
  }, { sel: selector, block });
  await p.waitForTimeout(250);
}

// Reachability proof: scroll EACH card (and the buy face) into view and record
// that it paints at >= 44px. This is the scrollIntoView reachability the phone
// and 200% text frames claim; the frame itself paints whatever is in the window.
async function proveReachable(p, seq) {
  for (const branch of BRANCH_ORDER) {
    await scrollUpgradeIntoView(p, `[data-branch="${branch}"]`, "nearest");
    const pr = await probe(p);
    const card = pr.upgrade?.cards.find((c) => c.branch === branch);
    check(`${seq}.reach.${branch}`, !!card && card.painted.visible && card.minH >= 44, JSON.stringify(card?.painted));
  }
  await scrollUpgradeIntoView(p, "[data-buy]", "nearest");
  const pr = await probe(p);
  const buy = pr.upgrade?.buy;
  check(`${seq}.reach.buy`, !!buy && buy.painted.visible && buy.minH >= 44, JSON.stringify(buy?.painted));
}

const captures = [];
const failures = [];
const actionChecks = [];
const keyProofs = [];
let frameNo = 0;

function check(name, ok, detail) {
  actionChecks.push({ check: name, ok: !!ok, detail: detail ?? "" });
  if (!ok) failures.push(`${name}: ${detail}`);
  return ok;
}

function proof(name, numbers) {
  keyProofs.push({ proof: name, ...numbers });
}

// Frame audit: base shell checks + inspector contract + every claimed upgrade state.
function audit(seq, name, p, expect = {}) {
  const c = [];
  const ok = (n, cond, detail) => { c.push({ check: n, ok: !!cond, detail: detail ?? "" }); if (!cond) failures.push(`[${seq}/${name}] ${n}: ${detail ?? ""}`); };
  ok("noBodyScroll", p.docScroll.sw <= p.docScroll.cw + 1 && p.docScroll.sh <= p.docScroll.ch + 1, JSON.stringify(p.docScroll));
  ok("bodyHidden", p.bodyOverflow === "hidden", p.bodyOverflow);
  ok("ink", p.ink > 0.02 || p.ink === -1, `ink=${p.ink}`);
  if (expect.mode) ok("mode", p.mode === expect.mode, `mode=${p.mode}`);
  if (expect.markers) {
    ok("marker.shell-rail-or-face", p.markers.rail || p.markers.face, JSON.stringify(p.markers));
    ok("marker.zoom", p.markers.zoomGroup && p.markers.zoomButtons.includes("Zoom in") && p.markers.zoomButtons.includes("Zoom out"), JSON.stringify(p.markers.zoomButtons));
    ok("marker.hud", p.markers.hud && p.markers.hudLead, JSON.stringify(p.markers));
    ok("marker.canvas", p.markers.canvas, "");
  }
  if (expect.panelNull) ok("panelGone", p.panel === null, "panel still mounted");
  if (expect.panel) {
    ok("panelPresent", !!p.panel, "no .panel.panel--stack");
    if (p.panel) {
      const pn = p.panel;
      ok("rootContract", pn.rootLabel === `${expect.title ?? pn.title} details`, `rootLabel=${pn.rootLabel}`);
      if (expect.title) ok("title", pn.title === expect.title, `title=${pn.title}`);
      if (expect.sections) ok("sections", JSON.stringify(pn.sections.map((s) => s.title)) === JSON.stringify(SECTION_TITLES), JSON.stringify(pn.sections.map((s) => s.title)));
      for (const r of expect.rowEquals ?? []) ok(`row=${r.label}`, pn.rowMap[r.label] === r.value, `got "${pn.rowMap[r.label]}" want "${r.value}"`);
      for (const r of expect.rowContains ?? []) ok(`row~${r.label}`, (pn.rowMap[r.label] ?? "").includes(r.text), `got "${pn.rowMap[r.label]}" want~"${r.text}"`);
      for (const tx of expect.noteContains ?? []) ok(`note~${tx.slice(0, 28)}`, pn.notes.some((n) => n.includes(tx)), JSON.stringify(pn.notes));
      if (expect.firstAction) ok("firstAction", (pn.faces[0] ?? "").startsWith(expect.firstAction), JSON.stringify(pn.faces));
      if (expect.actionCount != null) ok("actionCount", pn.faces.length === expect.actionCount, JSON.stringify(pn.faces));
      if (expect.actionGrammar) ok("actionGrammar", pn.faces.length > 0 && pn.faces.every((f) => ACTION_GRAMMAR.test(f)), JSON.stringify(pn.faces));
      if (expect.accentOne) ok("accentOne", pn.accentCount === 1, `accent=${pn.accentCount}`);
      if (expect.longContent) ok("longContent", p.bodyScroll && p.bodyScroll.sh > p.bodyScroll.ch + 8, JSON.stringify(p.bodyScroll));
      if (expect.bodyScroller) ok("bodyScroller", p.bodyScroll && /(auto|scroll)/.test(p.bodyScroll.overflow), JSON.stringify(p.bodyScroll));
    }
  }
  if (expect.floors) {
    // Fixed chrome buttons must paint at >= 44px. Upgrade-surface controls live in a
    // scroll body and can be partially clipped mid-scroll, so their touch floor is
    // asserted on their FULL laid-out height (cardFloors / buyFloor / respecFloor),
    // not on the clipped painted sliver.
    const bad = p.buttons.filter((b) => b.visible && !b.inUpgrade && b.minH < 44);
    ok("floors", bad.length === 0, JSON.stringify(bad));
  }
  if (expect.reach) {
    const off = p.buttons.filter((b) => b.visible && (b.px < -0.5 || b.py < -0.5 || b.px + b.pw > p.viewport.w + 0.5 || b.py + b.ph > p.viewport.h + 0.5));
    ok("reach", off.length === 0, JSON.stringify(off));
  }
  if (p.mode === "rail" && p.boxes.panel) {
    const b = p.boxes.panel;
    ok("dockGeometry", b.right === p.viewport.w - 8 && b.w === 320 && b.y >= 103, JSON.stringify(b));
  }
  if (p.mode === "phone" && p.boxes.panel) {
    const b = p.boxes.panel;
    ok("sheetGeometry", b.x >= 0 && b.w <= p.viewport.w - 16 && b.right <= p.viewport.w, JSON.stringify(b));
  }
  const u = p.upgrade;
  if (expect.upgrade) {
    const ex = expect.upgrade;
    ok("upgradePresent", !!u, "no .upgrade-compare surface");
    if (u) {
      ok("cardOrder", JSON.stringify(u.cards.map((card) => card.branch)) === JSON.stringify(BRANCH_ORDER), JSON.stringify(u.cards.map((card) => card.branch)));
      ok("buyOutsideActions", u.buy && !u.buy.inPanelActions, JSON.stringify(u.buy));
      for (const want of ex.cards ?? []) {
        const card = u.cards.find((x) => x.branch === want.branch);
        ok(`card.${want.branch}.present`, !!card, "missing card");
        if (!card) continue;
        if (want.pressed != null) ok(`card.${want.branch}.pressed`, card.pressed === want.pressed, `pressed=${card.pressed}`);
        if (want.disabled != null) ok(`card.${want.branch}.disabled`, card.disabled === want.disabled, `disabled=${card.disabled}`);
        for (const tx of want.contains ?? []) ok(`card.${want.branch}~${tx.slice(0, 32)}`, card.text.includes(tx), `text="${card.text.slice(0, 200)}"`);
      }
      if (ex.noAutoSelect) ok("noAutoSelect", u.cards.every((card) => !card.pressed) && u.buy?.disabled === true, JSON.stringify({ pressed: u.cards.map((card) => card.pressed), buyDisabled: u.buy?.disabled }));
      if (ex.buyDisabled != null) ok("buyDisabled", u.buy?.disabled === ex.buyDisabled, `disabled=${u.buy?.disabled}`);
      for (const tx of ex.buyContains ?? []) ok(`buy~${tx.slice(0, 32)}`, (u.buy?.label ?? "").includes(tx), `label="${u.buy?.label}"`);
      if (ex.receiptKind !== undefined) {
        if (ex.receiptKind === null) ok("receiptAbsent", u.receipt === null, JSON.stringify(u.receipt));
        else {
          ok("receiptKind", u.receipt?.kind === ex.receiptKind, `kind=${u.receipt?.kind} want=${ex.receiptKind}`);
          for (const tx of ex.receiptContains ?? []) ok(`receipt~${tx.slice(0, 32)}`, (u.receipt?.text ?? "").includes(tx), `text="${u.receipt?.text?.slice(0, 240)}"`);
        }
      }
      for (const want of ex.respec ?? []) {
        const btn = u.respec.find((x) => x.branch === want.branch);
        ok(`respec.${want.branch}.present`, !!btn, "missing respec face");
        if (!btn) continue;
        if (want.disabled != null) ok(`respec.${want.branch}.disabled`, btn.disabled === want.disabled, `disabled=${btn.disabled}`);
        for (const tx of want.contains ?? []) ok(`respec.${want.branch}~${tx.slice(0, 32)}`, btn.text.includes(tx), `text="${btn.text}"`);
      }
      if (ex.respecNone) ok("respecNone", u.respec.length === 0 && u.notes.some((n) => n.includes(UPGRADE_COPY.respecNone)), JSON.stringify(u.notes));
      for (const tx of ex.notesContain ?? []) ok(`upgradeNote~${tx.slice(0, 28)}`, u.notes.some((n) => n.includes(tx)), JSON.stringify(u.notes.map((n) => n.slice(0, 60))));
      if (ex.cardFloors) {
        ok("cardFloors", u.cards.every((card) => card.minH >= 44), JSON.stringify(u.cards.map((card) => ({ b: card.branch, h: card.minH }))));
        ok("buyFloor", !!u.buy && u.buy.minH >= 44, JSON.stringify(u.buy?.minH));
        ok("respecFloor", u.respec.every((b) => b.minH >= 44), JSON.stringify(u.respec.map((b) => ({ b: b.branch, h: b.minH }))));
      }
      if (ex.cardsPainted) ok("cardsPainted", u.cards.every((card) => card.painted.visible), JSON.stringify(u.cards.map((card) => ({ b: card.branch, p: card.painted }))));
      if (ex.buyPainted) ok("buyPainted", !!u.buy && u.buy.painted.visible && u.buy.minH >= 44, JSON.stringify(u.buy?.painted));
      if (ex.receiptPainted) ok("receiptPainted", !!u.receipt && u.receipt.painted.visible, JSON.stringify(u.receipt?.painted));
      // Painted-text hygiene on the whole upgrade surface (the shipped i18n gate).
      const all = u.cards.map((card) => card.text).join(" ") + " " + (u.buy?.label ?? "") + " " + (u.receipt?.text ?? "") + " " + u.respec.map((b) => b.text).join(" ") + " " + u.notes.join(" ");
      ok("hygiene.noNaN", !all.includes("NaN"), all.slice(0, 120));
      ok("hygiene.noRawKeys", !/\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/.test(all), all.slice(0, 120));
      ok("hygiene.no1units", !/(^|[^0-9])1 units\b/.test(all), all.slice(0, 120));
    }
  }
  return c;
}

async function shot(seq, name, p, file, expect = {}) {
  frameNo++;
  const pr = await probe(p);
  const checks = audit(seq, name, pr, expect);
  await p.screenshot({ path: path.join(out, file) });
  captures.push({ frame: frameNo, sequence: seq, name, file, viewport: pr.viewport, mode: pr.mode, checks, passed: checks.every((c) => c.ok) });
  console.log(`${checks.every((c) => c.ok) ? "PASS" : "FAIL"} ${seq}/${name} -> ${file}`);
  return pr;
}

function seqConsole(seq, errors) {
  check(`${seq}.console`, errors.length === 0, JSON.stringify(errors.slice(0, 5)));
  return { consoleErrors: errors.slice() };
}

// Entry chunk budget: the built index-*.js must stay under 233000 bytes.
const entryFile = fs.readdirSync(path.join(root, "dist/assets")).find((f) => /^index-.*\.js$/.test(f));
const entryBytes = entryFile ? fs.statSync(path.join(root, "dist/assets", entryFile)).size : -1;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const sequences = [];

try {
  // ---- A: desktop 1280x800 — the full comparison lifecycle on a furnace ----
  // Cards rest (no auto-select) -> repeated card taps (stable, no dispatch) ->
  // speed buy -> 3 buffer buys (once per tap) -> draw buy (floor maxes) ->
  // free respec of the last pick -> sorter draw-floor -> plain unnamed upgrade.
  {
    const seed = commandYardSeed({ furnaceCount: 1, credits: 1000 });
    const fur = seed.sim.machines.find((m) => m.id === seed.furnaceIds[0]);
    const base = BLUEPRINTS.furnace.baseUpgradeCost; // 40
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed.text);
    await settle(p, false);
    const tap = await tapMachine(p, 9);
    check("A.tap", tap.machine && tap.machine.id === seed.furnaceIds[0] && !!tap.probe.panel, JSON.stringify(tap.machine));
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    const bonus = researchBonus(seed.sim).inputBuffer;
    await shot("A", "cards-rest", p, "a1-desk-cards-rest.png", {
      mode: "rail", markers: true, panel: true, title: "Furnace", sections: true,
      firstAction: "Upgrade", actionCount: 3, accentOne: true, actionGrammar: true,
      upgrade: {
        noAutoSelect: true, cardFloors: true, cardsPainted: true,
        cards: [
          { branch: "speed", pressed: false, disabled: false, contains: [`${secondsText(fur)} → ${secondsText(afterBuy(fur, "speed"))}`, `Cost: ${costText(base, 1, "speed")}`, UPGRADE_COPY.branches.speed.tradeoff, "Rank 0 → 1"] },
          { branch: "buffer", pressed: false, disabled: false, contains: [`${unitsText(inputCapacityOf(fur, bonus))} → ${unitsText(inputCapacityOf(fur, bonus) + 6)}`, `Cost: ${costText(base, 1, "buffer")}`, UPGRADE_COPY.branches.buffer.tradeoff] },
          { branch: "draw", pressed: false, disabled: false, contains: [`${unitsText(powerOf(fur))} → ${unitsText(powerOf(afterBuy(fur, "draw")))}`, `Cost: ${costText(base, 1, "draw")}`, UPGRADE_COPY.branches.draw.tradeoff] },
        ],
        buyContains: [UPGRADE_COPY.buy],
        notesContain: [UPGRADE_COPY.buyHint, UPGRADE_COPY.plainNote],
        receiptKind: null, respecNone: true,
      },
    });

    // Repeated card taps in ONE JS task: selection is deliberate and stable, and no
    // engine tick can elapse mid-task, so identical before/after revision + credits
    // prove the taps dispatch nothing (no drift, no charge).
    const taps = await p.evaluate(() => {
      const readSim = () => JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim;
      const before = readSim();
      const speed = document.querySelector('[data-branch="speed"]');
      const buffer = document.querySelector('[data-branch="buffer"]');
      if (!speed || !buffer) return { ok: false };
      for (let i = 0; i < 5; i += 1) speed.click();
      for (let i = 0; i < 5; i += 1) buffer.click();
      const after = readSim();
      return { ok: true, before, after };
    });
    check("A.taps.noDispatch", taps.ok && taps.after.revision === taps.before.revision && taps.after.credits === taps.before.credits && taps.after.credits === 1000, JSON.stringify({ revision: `${taps.before?.revision} -> ${taps.after?.revision}`, credits: taps.after?.credits }));
    await scrollUpgradeIntoView(p, "[data-buy]", "nearest");
    await shot("A", "selection-stable", p, "a2-desk-selection-stable.png", {
      panel: true, title: "Furnace",
      upgrade: {
        cards: [
          { branch: "speed", pressed: false },
          { branch: "buffer", pressed: true },
          { branch: "draw", pressed: false },
        ],
        buyDisabled: false, buyPainted: true, buyContains: [UPGRADE_COPY.branches.buffer.title, costText(base, 1, "buffer")],
        cardFloors: true,
      },
    });

    // Buy speed: deliberately select speed first (the tap demo left selection on
    // buffer), then printed === branchPrice === credits delta, pick recorded, readback.
    await clickUpgradeSync(p, '[data-branch="speed"]');
    const b1 = await clickUpgradeSync(p, "[data-buy]");
    check("A.buySpeed.clicked", b1.ok && !b1.disabled, b1.reason ?? `disabled=${b1.disabled}`);
    const speedPrice = branchPrice(base, 1, "speed");
    const printedSpeed = Number((b1.label.match(/· (\d+) credits$/) ?? [])[1]);
    const m1after = b1.after.machines.find((m) => m.id === seed.furnaceIds[0]);
    check("A.buySpeed.parity", printedSpeed === speedPrice && b1.before.credits - b1.after.credits === speedPrice, `printed=${printedSpeed} branchPrice=${speedPrice} delta=${b1.before.credits - b1.after.credits}`);
    check("A.buySpeed.level", m1after.level === 2 && JSON.stringify(m1after.branch) === JSON.stringify(["speed"]), `level=${m1after.level} branch=${JSON.stringify(m1after.branch)}`);
    check("A.buySpeed.batchMilli", m1after.batchMilli === batchMilliOf(m1after), `stored=${m1after.batchMilli} engine=${batchMilliOf(m1after)}`);
    check("A.buySpeed.revision", b1.after.revision === b1.before.revision + 1, `${b1.before.revision} -> ${b1.after.revision}`);
    proof("A.buySpeed", { printed: printedSpeed, branchPrice: speedPrice, creditsBefore: b1.before.credits, creditsAfter: b1.after.credits, level: m1after.level, branch: m1after.branch });
    await p.waitForTimeout(400);
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    const fur2 = { ...fur, level: 2, branch: ["speed"] };
    await shot("A", "after-speed-buy", p, "a3-desk-after-speed-buy.png", {
      panel: true, title: "Furnace", sections: true,
      rowEquals: [{ label: "Level", value: "2" }],
      upgrade: {
        cards: [{ branch: "speed", pressed: true, contains: ["Rank 1 → 2", costText(base, 2, "speed")] }],
        buyContains: [UPGRADE_COPY.branches.speed.title, costText(base, 2, "speed")],
        receiptKind: "applied",
        receiptContains: [`${UPGRADE_COPY.receiptApplied}: ${UPGRADE_COPY.branches.speed.title}`, "Rank 1", "level 2", `paid ${unit(speedPrice, creditWord)}`, "1000 → 950", `${secondsText(fur)} → ${secondsText(fur2)}`],
        cardFloors: true,
      },
    });

    // Three repeated buy taps on buffer: deliberately select buffer, then same branch,
    // once per tap, level +1 each — the target never drifts under repeated taps.
    await clickUpgradeSync(p, '[data-branch="buffer"]');
    let credits = b1.after.credits;
    let level = 2;
    const bufferPrices = [];
    for (let tapNo = 0; tapNo < 3; tapNo += 1) {
      const b = await clickUpgradeSync(p, "[data-buy]");
      const price = branchPrice(base, level, "buffer");
      const printed = Number((b.label.match(/· (\d+) credits$/) ?? [])[1]);
      const m = b.after.machines.find((x) => x.id === seed.furnaceIds[0]);
      check(`A.bufferTap${tapNo + 1}.parity`, b.ok && printed === price && b.before.credits - b.after.credits === price, `printed=${printed} branchPrice=${price} delta=${b.before.credits - b.after.credits}`);
      check(`A.bufferTap${tapNo + 1}.state`, m.level === level + 1 && m.branch[m.branch.length - 1] === "buffer" && m.branch.length === tapNo + 2, `level=${m.level} branch=${JSON.stringify(m.branch)}`);
      bufferPrices.push(price);
      credits -= price;
      level += 1;
      await p.waitForTimeout(250);
    }
    check("A.bufferTaps.credits", credits === 1000 - speedPrice - bufferPrices.reduce((a, b) => a + b, 0), `credits=${credits}`);
    proof("A.bufferTaps", { prices: bufferPrices, creditsAfter: credits, level, branch: ["speed", "buffer", "buffer", "buffer"] });
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    await shot("A", "after-buffer-taps", p, "a4-desk-after-buffer-taps.png", {
      panel: true, title: "Furnace",
      rowEquals: [{ label: "Level", value: "5" }],
      upgrade: {
        cards: [
          { branch: "buffer", pressed: true, contains: ["Rank 3 → 4", costText(base, 5, "buffer")] },
          { branch: "speed", pressed: false },
        ],
        buyContains: [UPGRADE_COPY.branches.buffer.title, costText(base, 5, "buffer")],
        receiptKind: "applied",
        receiptContains: [`${UPGRADE_COPY.receiptApplied}: ${UPGRADE_COPY.branches.buffer.title}`, "Rank 3", "level 5"],
        cardFloors: true,
      },
    });

    // Draw buy: deliberately switch the selection to draw, then power 2 -> 1 and the
    // card maxes honestly at the floor. (Level is 5 after the three buffer buys.)
    await clickUpgradeSync(p, '[data-branch="draw"]');
    const drawPrice = branchPrice(base, 5, "draw");
    const bDraw2 = await clickUpgradeSync(p, "[data-buy]");
    const printedDraw = Number((bDraw2.label.match(/· (\d+) credits$/) ?? [])[1]);
    const mDraw = bDraw2.after.machines.find((x) => x.id === seed.furnaceIds[0]);
    check("A.drawBuy.parity", printedDraw === drawPrice && bDraw2.before.credits - bDraw2.after.credits === drawPrice, `printed=${printedDraw} branchPrice=${drawPrice} delta=${bDraw2.before.credits - bDraw2.after.credits}`);
    check("A.drawBuy.power", powerOf(mDraw) === 1 && mDraw.branch[mDraw.branch.length - 1] === "draw" && mDraw.level === 6, `power=${powerOf(mDraw)} level=${mDraw.level} branch=${JSON.stringify(mDraw.branch)}`);
    proof("A.drawBuy", { printed: printedDraw, branchPrice: drawPrice, creditsBefore: bDraw2.before.credits, creditsAfter: bDraw2.after.credits, powerAfter: powerOf(mDraw) });
    await p.waitForTimeout(400);
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    await shot("A", "after-draw-buy", p, "a5-desk-after-draw-buy.png", {
      panel: true, title: "Furnace",
      rowEquals: [{ label: "Level", value: "6" }],
      upgrade: {
        cards: [{ branch: "draw", pressed: true, disabled: true, contains: [UPGRADE_COPY.noEffectBadge, UPGRADE_COPY.drawFloor, `${unitsText(1)} → ${unitsText(1)}`] }],
        receiptKind: "applied",
        receiptContains: [`${UPGRADE_COPY.receiptApplied}: ${UPGRADE_COPY.branches.draw.title}`, `${unitsText(2)} → ${unitsText(1)}`, "level 6"],
        cardFloors: true,
      },
    });

    // Free respec of the LAST named pick: credits/level untouched, batchMilli recomputed.
    const creditsBeforeRespec = bDraw2.after.credits;
    const r1 = await clickUpgradeSync(p, '[data-respec="speed"]');
    const mR = r1.after.machines.find((x) => x.id === seed.furnaceIds[0]);
    check("A.respec.free", r1.ok && r1.after.credits === creditsBeforeRespec && mR.level === 6, `credits ${creditsBeforeRespec} -> ${r1.after.credits}, level=${mR.level}`);
    check("A.respec.lastOnly", JSON.stringify(mR.branch) === JSON.stringify(["speed", "buffer", "buffer", "buffer", "speed"]), JSON.stringify(mR.branch));
    check("A.respec.batchMilli", mR.batchMilli === batchMilliOf(mR), `stored=${mR.batchMilli} engine=${batchMilliOf(mR)}`);
    check("A.respec.revision", r1.after.revision === r1.before.revision + 1, `${r1.before.revision} -> ${r1.after.revision}`);
    proof("A.respec", { creditsBefore: creditsBeforeRespec, creditsAfter: r1.after.credits, level: mR.level, branch: mR.branch, batchMilli: mR.batchMilli, engineBatchMilli: batchMilliOf(mR) });
    await p.waitForTimeout(400);
    await scrollUpgradeIntoView(p, ".upgrade-respec", "nearest");
    await shot("A", "respec-receipt", p, "a6-desk-respec-receipt.png", {
      panel: true, title: "Furnace",
      upgrade: {
        receiptKind: "respec",
        receiptContains: [`${UPGRADE_COPY.respecApplied} ${UPGRADE_COPY.branches.speed.title} (${UPGRADE_COPY.respecFree})`, "level 6", `${UPGRADE_COPY.creditsUnchanged} (${creditsBeforeRespec} → ${creditsBeforeRespec})`],
        respec: [
          { branch: "speed", disabled: true, contains: [UPGRADE_COPY.respecCurrent] },
          { branch: "buffer", disabled: false },
          { branch: "draw", disabled: false },
        ],
        cardFloors: true,
      },
    });
    // Second free re-pick: the guard follows the new last pick.
    const r2 = await clickUpgradeSync(p, '[data-respec="buffer"]');
    const mR2 = r2.after.machines.find((x) => x.id === seed.furnaceIds[0]);
    check("A.respec2.free", r2.ok && r2.after.credits === creditsBeforeRespec && mR2.level === 6 && mR2.branch[mR2.branch.length - 1] === "buffer", JSON.stringify({ credits: r2.after.credits, level: mR2.level, branch: mR2.branch }));
    await p.waitForTimeout(300);
    const r2pr = await probe(p);
    check("A.respec2.guard", r2pr.upgrade.respec.find((x) => x.branch === "buffer")?.disabled === true && r2pr.upgrade.respec.find((x) => x.branch === "speed")?.disabled === false, JSON.stringify(r2pr.upgrade.respec));

    // Sorter: the draw floor is a maxed no-effect card (demo f).
    const tapSorter = await tapMachine(p, 8);
    check("A.tapSorter", tapSorter.machine && tapSorter.machine.id === seed.sorterId && !!tapSorter.probe.panel, JSON.stringify(tapSorter.machine));
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    const sorter = seed.sim.machines.find((m) => m.id === seed.sorterId);
    await shot("A", "sorter-draw-floor", p, "a7-desk-sorter-draw-floor.png", {
      panel: true, title: "Scrap sorter", sections: true,
      upgrade: {
        noAutoSelect: true,
        cards: [
          { branch: "speed", disabled: false, contains: [`${secondsText(sorter)} → ${secondsText(afterBuy(sorter, "speed"))}`] },
          { branch: "buffer", disabled: false },
          { branch: "draw", disabled: true, contains: [UPGRADE_COPY.noEffectBadge, UPGRADE_COPY.drawFloor, `${unitsText(1)} → ${unitsText(1)}`, UPGRADE_COPY.noChange] },
        ],
        cardFloors: true, cardsPainted: true,
      },
    });

    // Plain unnamed upgrade stays the accent primary and counts as one speed rank.
    const plain = await clickActionSync(p, "Upgrade");
    const plainCost = Number((plain.label.match(/Upgrade · (\d+) credits/) ?? [])[1]);
    const mPlain = plain.after.machines.find((x) => x.id === seed.sorterId);
    check("A.plain.parity", plain.ok && plainCost === upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, 1) && plain.before.credits - plain.after.credits === plainCost, `printed=${plainCost} engine=${upgradeCost(30, 1)} delta=${plain.before.credits - plain.after.credits}`);
    check("A.plain.unnamed", mPlain.level === 2 && mPlain.branch === undefined && upgradeRanks(mPlain).speed === 1 && mPlain.batchMilli === batchMilliOf(mPlain) && mPlain.batchMilli < batchMilliOf(sorter), JSON.stringify({ level: mPlain.level, branch: mPlain.branch, ranks: upgradeRanks(mPlain), milli: mPlain.batchMilli, engineBefore: batchMilliOf(sorter) }));
    proof("A.plainUnnamed", { printed: plainCost, upgradeCost: upgradeCost(30, 1), creditsDelta: plain.before.credits - plain.after.credits, level: mPlain.level, branch: mPlain.branch ?? null, speedRanks: upgradeRanks(mPlain).speed });
    await p.waitForTimeout(400);
    await shot("A", "after-plain-upgrade", p, "a8-desk-after-plain-upgrade.png", {
      panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Level", value: "2" }],
      firstAction: "Upgrade", actionCount: 3, accentOne: true, actionGrammar: true,
      upgrade: { notesContain: [UPGRADE_COPY.plainNote], respecNone: true, cardFloors: true },
    });
    sequences.push({ id: "A", viewport: "1280x800", seed: "commandYard(sorter + furnace) + credits=1000 + freeze (MUTATIONS)", actions: ["card taps x10", "buy speed", "buy buffer x3", "buy draw", "respec speed", "respec buffer", "plain Upgrade"], tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("A", errors) });
    await ctx.close();
  }

  // ---- B: desktop shortfall yard — affordability from state, blocked tap ----
  {
    const seed = commandYardSeed({ furnaceCount: 1, credits: 12 });
    const base = BLUEPRINTS.furnace.baseUpgradeCost;
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed.text);
    await settle(p, false);
    const tap = await tapMachine(p, 9);
    check("B.tap", tap.machine && tap.machine.id === seed.furnaceIds[0] && !!tap.probe.panel, JSON.stringify(tap.machine));
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    const price = branchPrice(base, 1, "speed");
    await shot("B", "shortfall-cards", p, "b1-desk-shortfall-cards.png", {
      mode: "rail", markers: true, panel: true, title: "Furnace", sections: true,
      upgrade: {
        noAutoSelect: true,
        cards: [
          { branch: "speed", contains: [`Cost: ${costText(base, 1, "speed")}`, shortfallText(price, 12)] },
          { branch: "buffer", contains: [shortfallText(branchPrice(base, 1, "buffer"), 12)] },
          { branch: "draw", contains: [shortfallText(branchPrice(base, 1, "draw"), 12)] },
        ],
        cardFloors: true, cardsPainted: true,
      },
    });
    const notAffordable = await probe(p);
    check("B.notAffordable", notAffordable.upgrade.cards.every((c) => !c.text.includes(UPGRADE_COPY.affordable)), JSON.stringify(notAffordable.upgrade.cards.map((c) => c.text.slice(0, 80))));
    // Blocked tap through the real buy face: nothing spent, nothing applied.
    await clickUpgradeSync(p, '[data-branch="speed"]');
    const blocked = await clickUpgradeSync(p, "[data-buy]");
    const mB = blocked.after.machines.find((x) => x.id === seed.furnaceIds[0]);
    check("B.blocked.noCharge", blocked.ok && blocked.after.credits === 12 && mB.level === 1 && blocked.after.revision === blocked.before.revision, JSON.stringify({ credits: blocked.after.credits, level: mB.level, revision: `${blocked.before.revision} -> ${blocked.after.revision}` }));
    proof("B.blockedTap", { printedPrice: price, creditsBefore: blocked.before.credits, creditsAfter: blocked.after.credits, level: mB.level, revisionDelta: blocked.after.revision - blocked.before.revision });
    await p.waitForTimeout(400);
    await scrollUpgradeIntoView(p, ".upgrade-receipt", "nearest");
    await shot("B", "blocked-receipt", p, "b2-desk-blocked-receipt.png", {
      panel: true, title: "Furnace",
      upgrade: {
        receiptKind: "short",
        receiptContains: [`${UPGRADE_COPY.receiptShort}: ${shortfallText(price, 12)}. ${UPGRADE_COPY.nothingSpent}`],
        receiptPainted: true, cardFloors: true,
      },
    });
    sequences.push({ id: "B", viewport: "1280x800", seed: "commandYard(sorter + furnace) + credits=12 + freeze (MUTATIONS)", actions: ["select speed", "blocked buy"], tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("B", errors) });
    await ctx.close();
  }

  // ---- C: desktop legacy yard-mature — branch-less truthful values ----
  {
    const seed = seedWith((s, _st, pay) => { pay.lastSeenMs = Date.now(); s.credits = 1000; });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("C.tap", tap.machine && tap.machine.id === 1 && !!tap.probe.panel, JSON.stringify(tap.machine));
    const m1 = tap.probe.sim.machines.find((m) => m.id === 1);
    check("C.legacy", m1.level === 14 && m1.branch === null, JSON.stringify({ level: m1.level, branch: m1.branch }));
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    // The raw save sim carries the full machine; rebuild the engine view for math.
    const matureSim = JSON.parse(seed).payload.sim;
    const rawM1 = matureSim.machines.find((m) => m.id === 1);
    const matureCap = inputCapacityOf(rawM1, researchBonus(matureSim).inputBuffer);
    await shot("C", "legacy-sorter-cards", p, "c1-desk-legacy-sorter-cards.png", {
      mode: "rail", markers: true, panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Level", value: "14" }],
      upgrade: {
        noAutoSelect: true,
        cards: [
          { branch: "speed", contains: ["Rank 13 → 14", `${secondsText(rawM1)} → ${secondsText(afterBuy(rawM1, "speed"))}`, costText(30, 14, "speed")] },
          { branch: "buffer", contains: [`${unitsText(matureCap)} → ${unitsText(matureCap + 6)}`] },
          { branch: "draw", disabled: true, contains: [UPGRADE_COPY.noEffectBadge] },
        ],
        cardFloors: true, cardsPainted: true, respecNone: true,
      },
    });
    // Plain unnamed upgrade on the legacy machine: still one speed rank, no pick.
    const plain = await clickActionSync(p, "Upgrade");
    const plainCost = Number((plain.label.match(/Upgrade · (\d+) credits/) ?? [])[1]);
    const m1after = plain.after.machines.find((m) => m.id === 1);
    check("C.plain.parity", plain.ok && plainCost === engineUpgradeCost(30, 14) && plain.before.credits - plain.after.credits === plainCost, `printed=${plainCost} engine=${engineUpgradeCost(30, 14)} delta=${plain.before.credits - plain.after.credits}`);
    check("C.plain.unnamed", m1after.level === 15 && m1after.branch === undefined && m1after.batchMilli < rawM1.batchMilli, JSON.stringify({ level: m1after.level, branch: m1after.branch, milli: m1after.batchMilli }));
    proof("C.legacyPlain", { printed: plainCost, engineUpgradeCost: engineUpgradeCost(30, 14), creditsDelta: plain.before.credits - plain.after.credits, levelBefore: 14, levelAfter: m1after.level, branch: m1after.branch ?? null });
    await p.waitForTimeout(400);
    await shot("C", "legacy-after-plain", p, "c2-desk-legacy-after-plain.png", {
      panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Level", value: "15" }],
      firstAction: "Upgrade", actionCount: 3, actionGrammar: true,
      upgrade: { cards: [{ branch: "speed", contains: ["Rank 14 → 15"] }], cardFloors: true },
    });
    // Legacy furnace (power 2): the draw branch still has room above the floor.
    const tapFur = await tapMachine(p, 1);
    check("C.tapFurnace", tapFur.machine && tapFur.machine.id === 2 && !!tapFur.probe.panel, JSON.stringify(tapFur.machine));
    const rawM2 = JSON.parse(seed).payload.sim.machines.find((m) => m.id === 2);
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    await shot("C", "legacy-furnace-cards", p, "c3-desk-legacy-furnace-cards.png", {
      panel: true, title: "Furnace", sections: true,
      rowEquals: [{ label: "Level", value: "13" }],
      upgrade: {
        noAutoSelect: true,
        cards: [
          { branch: "speed", contains: ["Rank 12 → 13", secondsText(rawM2)] },
          { branch: "draw", disabled: false, contains: [`${unitsText(2)} → ${unitsText(1)}`, costText(40, 13, "draw")] },
        ],
        cardFloors: true, cardsPainted: true,
      },
    });
    sequences.push({ id: "C", viewport: "1280x800", seed: "yard-mature + lastSeenMs=now + credits=1000 (legacy branch-less machines)", actions: ["plain Upgrade (M1)"], tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("C", errors) });
    await ctx.close();
  }

  // ---- D: CONTRAST 1 — power-limited yard: the draw card explains the relief ----
  {
    const seed = commandYardSeed({ furnaceCount: 4, credits: 1000 });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed.text);
    await settle(p, false);
    const tap = await tapMachine(p, 9);
    check("D.tap", tap.machine && tap.machine.id === seed.furnaceIds[0] && !!tap.probe.panel, JSON.stringify(tap.machine));
    const pw = powerFrame(await probe(p));
    check("D.powerLimited", pw.demand > 8 && pw.percent < 100, JSON.stringify(pw));
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    await shot("D", "power-limited", p, "d1-desk-power-limited.png", {
      mode: "rail", markers: true, panel: true, title: "Furnace", sections: true,
      noteContains: ["Power limited: the yard requests", `${pw.demand}/8`, `${pw.percent}%`],
      rowContains: [{ label: "Power", text: `Power limited: ${pw.percent}% speed` }],
      upgrade: {
        noAutoSelect: true,
        cards: [
          { branch: "draw", disabled: false, contains: [`${unitsText(2)} → ${unitsText(1)}`, UPGRADE_COPY.branches.draw.tradeoff] },
          { branch: "speed", disabled: false },
          { branch: "buffer", disabled: false },
        ],
        cardFloors: true, cardsPainted: true,
      },
    });
    sequences.push({ id: "D", viewport: "1280x800", seed: "commandYard(sorter + 4 furnaces) + freeze: demand 9 > capacity 8 (MUTATIONS power)", condition: "power-limited", power: pw, tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("D", errors) });
    await ctx.close();
  }

  // ---- E: CONTRAST 2 — buffer-starved yard: the buffer card explains the space ----
  {
    const seed = commandYardSeed({ furnaceCount: 0, credits: 1000, starvedSorter: true });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed.text);
    await settle(p, false);
    const tap = await tapMachine(p, 8);
    check("E.tap", tap.machine && tap.machine.id === seed.sorterId && !!tap.probe.panel, JSON.stringify(tap.machine));
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    await shot("E", "buffer-starved", p, "e1-desk-buffer-starved.png", {
      mode: "rail", markers: true, panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Status", value: "Needs input" }],
      noteContains: ["Missing input: the buffer is short"],
      upgrade: {
        noAutoSelect: true,
        cards: [
          { branch: "buffer", disabled: false, contains: [`${unitsText(12)} → ${unitsText(18)}`, UPGRADE_COPY.branches.buffer.tradeoff] },
          { branch: "speed", disabled: false },
          { branch: "draw", disabled: true, contains: [UPGRADE_COPY.noEffectBadge] },
        ],
        cardFloors: true, cardsPainted: true,
      },
    });
    sequences.push({ id: "E", viewport: "1280x800", seed: "commandYard(sorter, input route removed, buffer empty) + freeze (MUTATIONS starved)", condition: "buffer-starved", tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("E", errors) });
    await ctx.close();
  }

  // ---- F: phone 390x844 — cards in the sheet, scroll reachability, real buy ----
  {
    const seed = commandYardSeed({ furnaceCount: 1, credits: 1000 });
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 }, seed.text);
    await settle(p, false);
    const tap = await tapMachine(p, 9);
    check("F.tap", tap.machine && tap.machine.id === seed.furnaceIds[0] && !!tap.probe.panel, JSON.stringify(tap.machine));
    await shot("F", "sheet-rest", p, "f1-phone-sheet-rest.png", {
      mode: "phone", markers: true, panel: true, title: "Furnace", sections: true,
      longContent: true, bodyScroller: true, floors: true,
      upgrade: { cardFloors: true, cards: [{ branch: "speed", pressed: false }, { branch: "buffer", pressed: false }, { branch: "draw", pressed: false }] },
    });
    await proveReachable(p, "F");
    await scrollUpgradeIntoView(p, ".upgrade-cards", "start");
    // The phone sheet shows the cards in a scroll body (≈1.5 cards per window); the
    // proveReachable loop above already painted EACH card and the buy at >=44px, so
    // this frame claims the scrolled card window, not all three at once.
    await shot("F", "sheet-cards", p, "f2-phone-sheet-cards.png", {
      panel: true, title: "Furnace", floors: true, reach: true,
      upgrade: { cardFloors: true, noAutoSelect: true, cards: [{ branch: "speed", pressed: false }] },
    });
    // Real phone purchase: select speed, buy, read back in the same task.
    await clickUpgradeSync(p, '[data-branch="speed"]');
    const buy = await clickUpgradeSync(p, "[data-buy]");
    const price = branchPrice(40, 1, "speed");
    const printed = Number((buy.label.match(/· (\d+) credits$/) ?? [])[1]);
    const mF = buy.after.machines.find((x) => x.id === seed.furnaceIds[0]);
    check("F.buy.parity", buy.ok && printed === price && buy.before.credits - buy.after.credits === price && mF.level === 2, `printed=${printed} branchPrice=${price} delta=${buy.before.credits - buy.after.credits} level=${mF.level}`);
    proof("F.phoneBuy", { printed, branchPrice: price, creditsBefore: buy.before.credits, creditsAfter: buy.after.credits, level: mF.level });
    await p.waitForTimeout(400);
    await scrollUpgradeIntoView(p, ".upgrade-receipt", "nearest");
    await shot("F", "sheet-receipt", p, "f3-phone-sheet-receipt.png", {
      panel: true, title: "Furnace", floors: true,
      upgrade: { receiptKind: "applied", receiptContains: [`${UPGRADE_COPY.receiptApplied}: ${UPGRADE_COPY.branches.speed.title}`, "level 2", `paid ${unit(price, creditWord)}`], receiptPainted: true, cardFloors: true },
    });
    sequences.push({ id: "F", viewport: "390x844", seed: "commandYard(sorter + furnace) + credits=1000 + freeze (MUTATIONS)", actions: ["select speed", "buy"], tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("F", errors) });
    await ctx.close();
  }

  // ---- G: phone 200% text — floors, reach, scrollIntoView reachability ----
  {
    const seed = commandYardSeed({ furnaceCount: 1, credits: 1000, textScale: 2 });
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 }, seed.text);
    await settle(p, false);
    const tap = await tapMachine(p, 9);
    check("G.tap", tap.machine && tap.machine.id === seed.furnaceIds[0] && !!tap.probe.panel, JSON.stringify(tap.machine));
    await shot("G", "ts2-rest", p, "g1-phone-ts2-rest.png", {
      mode: "phone", markers: true, panel: true, title: "Furnace", sections: true,
      floors: true, reach: true, longContent: true, bodyScroller: true,
      upgrade: { cardFloors: true },
    });
    await proveReachable(p, "G");
    await scrollUpgradeIntoView(p, '[data-branch="speed"]', "nearest");
    await shot("G", "ts2-cards", p, "g2-phone-ts2-cards.png", {
      panel: true, title: "Furnace", floors: true, reach: true,
      upgrade: { cardFloors: true, cards: [{ branch: "speed", pressed: false }] },
    });
    await clickUpgradeSync(p, '[data-branch="speed"]');
    await scrollUpgradeIntoView(p, "[data-buy]", "nearest");
    await shot("G", "ts2-buy", p, "g3-phone-ts2-buy.png", {
      panel: true, title: "Furnace", floors: true, reach: true,
      upgrade: { buyPainted: true, buyDisabled: false, buyContains: [UPGRADE_COPY.branches.speed.title, costText(40, 1, "speed")], cardFloors: true },
    });
    const buy = await clickUpgradeSync(p, "[data-buy]");
    const price = branchPrice(40, 1, "speed");
    const mG = buy.after.machines.find((x) => x.id === seed.furnaceIds[0]);
    check("G.buy.parity", buy.ok && buy.before.credits - buy.after.credits === price && mG.level === 2, `delta=${buy.before.credits - buy.after.credits} branchPrice=${price} level=${mG.level}`);
    await p.waitForTimeout(400);
    await scrollUpgradeIntoView(p, ".upgrade-receipt", "nearest");
    await shot("G", "ts2-receipt", p, "g4-phone-ts2-receipt.png", {
      panel: true, title: "Furnace", floors: true, reach: true,
      upgrade: { receiptKind: "applied", receiptContains: ["level 2", `paid ${unit(price, creditWord)}`], receiptPainted: true, cardFloors: true },
    });
    sequences.push({ id: "G", viewport: "390x844 @200% text", seed: "commandYard(sorter + furnace) + credits=1000 + textScale=2 + freeze (MUTATIONS)", actions: ["select speed", "buy"], tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("G", errors) });
    await ctx.close();
  }
} catch (err) {
  failures.push(`probe crashed: ${err && err.stack ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

const passed = captures.filter((c) => c.passed).length;
const receipt = {
  task: "UI-RESET-55 explicit upgrade branch comparison",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/55",
  headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
  headShaNote: "code commit under test; the evidence-only commit containing this receipt follows it as PR head",
  tool: "playwright-core headless Chrome, DOM/geometry/console assertions only (no vision)",
  seed: "A/B/D/E/F/G: command-built yards via the game's own applyCommand/advance + encodeSave checksum (see MUTATIONS commandYard/freeze); C: docs/evidence/yard-mature.json + lastSeenMs=now + credits=1000",
  mutations: MUTATIONS,
  frameAudit: "every capture frame runs probe()+audit() before screenshot; checks recorded per frame; any failed check fails the run; every action-level assertion (tap identity, printed===branchPrice===credits delta, picks, derived values, no-dispatch card taps, blocked taps, free respec, console) is recorded with its numbers in actionChecks, pass or fail",
  actionProof: "clickUpgradeSync/clickActionSync click the real button and read localStorage in the same JS task (dispatch->applyCommand->persist synchronous; zero engine ticks between click and read). The pre-click baseline is flushed through the real HudTop sound toggle first (setSettings -> synchronous persist, zero sim effect, restored). Card taps are proven dispatch-free by the same-task before/after revision and credits.",
  scrollProof: "phone and 200% text frames prove reachability by scrolling EACH card and the buy face into view with scrollIntoView and asserting painted visibility at >=44px (proveReachable, recorded per element); frames then paint the scrolled window they claim",
  contrastConditions: [
    "D power-limited: sorter (draw 1) + 4 frozen furnaces (draw 2 each) request 9 > yardPowerCapacity 8 -> powerRatio 8/9; the furnace's draw card (2 -> 1 unit) carries the shared-budget tradeoff and the inspector prints the live demand/percent",
    "E buffer-starved: lone sorter with its input route removed and an empty buffer stays Needs input; the buffer card (12 -> 18 units) carries the bursty-supply tradeoff while the draw card is maxed at the 1-unit floor",
    "same three cards in dock order in both yards: the state, not the UI, explains the branch choice; no balance value is changed by the probe",
  ],
  viewports: ["1280x800 desktop rail", "390x844 phone sheet", "390x844 phone @200% text"],
  entryChunk: { file: entryFile, bytes: entryBytes, baseBytes: 119100, deltaBytes: entryBytes - 119100, capBytes: 233000, underCap: entryBytes >= 0 && entryBytes < 233000 },
  sequences,
  summary: { frames: captures.length, passed, failed: captures.length - passed, checkFailures: failures.length, actionChecks: actionChecks.length, actionChecksPassed: actionChecks.filter((c) => c.ok).length },
  failures,
  keyProofs,
  actionChecks,
  captures,
};
fs.writeFileSync(path.join(out, "receipt-upgrade-55.json"), JSON.stringify(receipt, null, 2));
console.log(`\nframes=${captures.length} passed=${passed} failures=${failures.length} entryBytes=${entryBytes}`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
