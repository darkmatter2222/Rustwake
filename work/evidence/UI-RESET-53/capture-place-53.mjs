// UI-RESET-53 — explicit placement, move and dismantle evidence probe (issue #53, G2 wave 4).
//
// Purpose: prove the placement / move / dismantle surfaces paint their claimed state on
// real builds in both form factors, that every action under test goes through the REAL
// UI path (tap/click -> dispatchCommand -> applyCommand -> persisted sim), and that the
// printed cost / refund numbers equal the engine's actual spend / payout.
//
// Prerequisites (from the worktree root):
//   pnpm build
//   node node_modules/vite/bin/vite.js preview --port 4280 --strictPort
//   node --import tsx work/evidence/UI-RESET-53/capture-place-53.mjs
// (tsx lets the probe build the seeds with the game's OWN command engine and encodeSave
// checksum — read-only imports; no engine/sim/UI file is modified.)
//
// NO VISION: every frame is audited by DOM/geometry/console assertions only.
// FRAME AUDIT hard rule: shot() records probe() + audit() for EVERY capture; a frame
// whose claimed state is not painted fails the run (exit 1).
//
// Probe-only seed mutations (NEVER in src; sim validation untouched), all documented in
// MUTATIONS. Seeds are built exactly like the jsdom suite's yardState fixture:
//   - restock the store BEFORE each priced build/connect so every seed command is
//     affordable (connectRoute charges the belt from store scrap),
//   - connect via the engine's own planConnections, then DRAIN scrap to 0 so the seed
//     advance loads no belt cargo: dropRoute rides in-transit items home on top of the
//     belt refund, and the parity reads must see EMPTY belts (the #54 inspector contract
//     excludes cargo too; inspector-54 precedent uses empty-belt fixtures),
//   - tutorial=9 / exportClaimed=true skip the tutorial ladder and open the sell desk,
//   - lastSeenMs=Date.now() so no offline catch-up moves the yard,
//   - muted:true so no audio context is needed headless.
//
// Synchronous action proof (copied from the UI-RESET-54 probe): page.evaluate clicks the
// real button and reads localStorage in the SAME task — dispatch -> applyCommand ->
// persist is synchronous, so zero engine ticks elapse between click and read. The
// pre-click baseline is flushed through the real HudTop sound toggle (setSettings
// persists the live sim synchronously and mutates no sim field; restored after the read).
//
// Camera/tap: the probe reads the camera's own paint truth (canvas.dataset.cam, stamped
// by App's render loop) and the canvas rect, and projects tile centres with the same
// screenToWorld inverse the pointer handler uses: s = rect.centre + (world - cam)*scale.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
// Read-only game imports (run under tsx).
import { applyCommand, beltCost, refundOf, DOCK_TILE, YARD_TILES } from "../../../src/game/simulation/commands.ts";
import { createInitialState } from "../../../src/game/simulation/types.ts";
import { advance } from "../../../src/game/simulation/engine.ts";
import { BLUEPRINTS, TUNING } from "../../../src/game/content/defs.ts";
import { planConnections } from "../../../src/game/simulation/autoconnect.ts";
import { encodeSave, DEFAULT_SETTINGS } from "../../../src/game/persistence/save.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = __dirname;
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4280/";
const exe =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe",
   "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
if (!exe) throw new Error("no Chrome/Edge executable; set CHROME_PATH");

const SAVE_KEY = "rustwake.save.v1";
const sumStore = (store) => Object.values(store).reduce((t, q) => t + q, 0);

const MUTATIONS = [
  "base: every seed payload.lastSeenMs = Date.now() (no offline catch-up drift); settings.muted=true; tutorial=9 and exportClaimed=true (skip the ladder, open the sell desk)",
  "yard: probe-only restock of each buildCost line BEFORE machine.build so the seed command is affordable (same fixture shape as tests/ui/place-53.test.tsx yardState); +100 scrap headroom unless overridden",
  "connect: route.connect via the engine's planConnections AFTER the scrap headroom (a 0-scrap connect is refused insufficient), then probe-only drain store.scrap=0 so the seed advance(1) loads EMPTY belts — dropRoute returns in-transit cargo on top of the belt refund, and the parity reads must isolate the registered-set refund (the orphaned output link from connectRoute's outRoute overwrite stays unrefunded; engine follow-up #100 HELD)",
  "fill: store.scrap=storeCapacity (store full -> dismantle no-room case)",
  "empty: no seed build (resting primary stays the build step for the repeated-tap probe), scrap=0",
  "textScale: settings.textScale=2 (200% text frames)",
];

// ---- seeds (the game's own engine + encoder; identical arithmetic to the jsdom suite) ----
function yardSeed(opts = {}) {
  const s = createInitialState();
  s.tutorial = 9;
  s.exportClaimed = true;
  let n = 0;
  const send = (body) => {
    const res = applyCommand(s, { ...body, id: `ev53-${(n += 1)}` });
    if (!res.ok) throw new Error(`yard seed ${body.type} rejected: ${res.reason}`);
    return res;
  };
  const buildAt = (blueprint, tile) => {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      s.store[item.resource] = (s.store[item.resource] ?? 0) + item.qty;
    }
    s.storeUnits = sumStore(s.store);
    send({ type: "machine.build", blueprint, tile });
  };
  if (!opts.empty) {
    buildAt(opts.blueprint ?? "sorter", opts.tile ?? 8);
    if (opts.second !== undefined) buildAt("sorter", opts.second);
  }
  if (opts.fill) {
    s.store.scrap = s.storeCapacity;
    s.storeUnits = s.storeCapacity;
  } else {
    s.store.scrap = (s.store.scrap ?? 0) + (opts.scrap ?? 100);
    s.storeUnits = sumStore(s.store);
  }
  if (opts.connect && !opts.empty) {
    const id = s.machines[0].id;
    for (const plan of planConnections(s, id)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    // Drain AFTER connecting: empty belts isolate the registered-set refund parity.
    s.store.scrap = 0;
    s.storeUnits = sumStore(s.store);
  }
  advance(s, 1);
  return encodeSave(s, Date.now(), { ...DEFAULT_SETTINGS, muted: true, textScale: opts.textScale ?? 1 });
}

// The engine's dismantle arithmetic from a RAW save sim: build refund + tray + buffer +
// batch in full + one belt refund per REGISTERED link ([outRoute, ...inRoutes]).
const endpointId = (e) => (e !== null && typeof e === "object" ? e.id : e);
const runLength = (r) => (Array.isArray(r.run) ? r.run.length : r.run ?? 0);
function batchUnitsOf(m) {
  return m.batch ? m.batch.reduce((t, b) => t + b.qty, 0) : m.batchUnits ?? 0;
}
function registeredRefundOf(sim, machineId) {
  const m = sim.machines.find((x) => x.id === machineId);
  if (!m) return null;
  const ids = [m.outRoute, ...(m.inRoutes ?? [])].filter((id) => id !== null);
  const reg = sim.routes.filter((r) => ids.includes(r.id));
  return (
    BLUEPRINTS[m.blueprint].buildCost.reduce((t, it) => t + refundOf(it.qty), 0) +
    m.trayUnits + m.inBufUnits + batchUnitsOf(m) +
    reg.reduce((t, r) => t + refundOf(beltCost(runLength(r))), 0)
  );
}
function registeredCargoOf(sim, machineId) {
  const m = sim.machines.find((x) => x.id === machineId);
  if (!m) return null;
  const ids = [m.outRoute, ...(m.inRoutes ?? [])].filter((id) => id !== null);
  return sim.routes.filter((r) => ids.includes(r.id))
    .reduce((t, r) => t + (r.items ? r.items.reduce((u, it) => u + it.qty, 0) : 0), 0);
}
function moveChargeOf(sim, machineId) {
  const m = sim.machines.find((x) => x.id === machineId);
  if (!m) return null;
  return BLUEPRINTS[m.blueprint].buildCost.map((it) => ({
    resource: it.resource,
    qty: Math.round((it.qty * TUNING.movePenaltyPct) / 100),
  }));
}

function install(ctx, text) {
  ctx.addInitScript(({ key, text }) => {
    // One-shot: addInitScript re-runs on EVERY navigation, including the save/reload
    // probe's p.reload() — re-seeding there would overwrite the persisted commands.
    // sessionStorage survives the reload in the same tab, so the seed installs once.
    if (sessionStorage.getItem("rw53.probe.seeded") === "1") return;
    sessionStorage.setItem("rw53.probe.seeded", "1");
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

async function settle(p) {
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("Begin recovery"));
    if (b) b.click();
  });
  for (let i = 0; i < 24; i++) {
    await p.waitForTimeout(200);
    const state = await p.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Back to yard"));
      if (back) { back.click(); return "back"; }
      const begin = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Begin recovery"));
      return begin ? "gate" : "yard";
    });
    if (state === "back") { await p.waitForTimeout(400); return; }
    if (state === "yard" && i >= 4) { await p.waitForTimeout(300); return; }
  }
  await p.waitForTimeout(400);
}

// ---- probe: shell + strips + dock + catalog + sim, all DOM/geometry ----
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
    const txt = (scope, sel) => (scope?.querySelector(sel)?.textContent ?? "").replace(/\s+/g, " ").trim();
    const doc = document.documentElement;
    const strips = {};
    for (const el of document.querySelectorAll("[data-flow]")) {
      const flow = el.getAttribute("data-flow");
      const confirm = el.querySelector(".place-strip__confirm");
      const cancel = [...el.querySelectorAll(".place-strip__actions button")].find((b) => !b.classList.contains("place-strip__confirm"));
      strips[flow] = {
        valid: el.getAttribute("data-valid"),
        verdict: el.getAttribute("data-verdict"),
        armed: el.getAttribute("data-armed"),
        fits: el.getAttribute("data-fits"),
        title: txt(el, ".place-strip__title"),
        machine: txt(el, ".place-strip__machine"),
        cell: txt(el, ".place-strip__cell"),
        reason: txt(el, ".place-strip__reason"),
        cost: txt(el, ".place-strip__cost"),
        short: txt(el, ".place-strip__short"),
        hint: txt(el, ".place-strip__hint"),
        dest: txt(el, ".place-strip__dest"),
        impact: [...el.querySelectorAll(".place-strip__impact li")].map((li) => li.textContent.trim()),
        total: txt(el, ".place-strip__total"),
        room: txt(el, ".place-strip__room"),
        confirm: confirm ? { label: confirm.textContent.trim(), disabled: confirm.disabled } : null,
        cancel: cancel ? cancel.textContent.trim() : null,
        painted: painted(el),
        actionsPainted: el.querySelector(".place-strip__actions") ? painted(el.querySelector(".place-strip__actions")) : null,
      };
    }
    const dockFaces = [...document.querySelectorAll(".dock .dock__btn")].map((b) => ({
      face: (b.firstChild?.textContent ?? "").trim(),
      label: (b.textContent ?? "").replace(/\s+/g, " ").trim(),
      primary: b.classList.contains("dock__btn--primary"),
      disabled: b.disabled,
    }));
    const catalog = document.querySelector(".catalog");
    const catButton = (label) => [...(catalog?.querySelectorAll("button") ?? [])]
      .find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith(label));
    const place = catButton("Place");
    const buttons = [...document.querySelectorAll(".hud button, .place-strip button")]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => {
        const pr = painted(b);
        return {
          label: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 80),
          minH: Math.round(Math.min(b.getBoundingClientRect().height, pr.h)),
          visible: pr.visible,
          px: pr.x, py: pr.y, pw: pr.w, ph: pr.h,
          inStrip: !!b.closest(".place-strip"),
        };
      });
    const panel = document.querySelector(".panel");
    const save = (() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")); } catch { return null; } })();
    const sim = save?.payload?.sim ?? null;
    const canvas = document.querySelector("canvas");
    const railOn = !!document.querySelector(".shell-rail");
    return {
      viewport: { w: innerWidth, h: innerHeight },
      mode: railOn ? "rail" : (innerWidth <= 599 ? "phone" : "column"),
      boxes: { lead: box(".hud__lead"), dock: box(".dock"), canvas: box("canvas"), panel: box(".panel"), strip: box(".place-strip") },
      strips,
      dockFaces,
      statusLine: (document.querySelector(".status-line")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      catalog: catalog ? {
        cards: [...catalog.querySelectorAll(".catalog__card")].map((c) => ({
          blueprint: c.getAttribute("data-blueprint"),
          affordable: c.getAttribute("data-affordable"),
          pressed: c.getAttribute("aria-pressed"),
        })),
        place: place ? { disabled: place.disabled, label: place.textContent.trim() } : null,
        close: !!catButton("Close catalog"),
      } : null,
      panel: panel ? {
        title: txt(panel, ".panel__title"),
        rootLabel: panel.getAttribute("aria-label"),
        faces: [...panel.querySelectorAll(".panel__actions > .icon-btn")].map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()),
        sellFaces: [...panel.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((l) => l.startsWith("Sell ")),
        tradeDesk: !!panel.querySelector(".store-section--trade"),
      } : null,
      buttons,
      docScroll: { sw: doc.scrollWidth, sh: doc.scrollHeight, cw: doc.clientWidth, ch: doc.clientHeight },
      bodyOverflow: getComputedStyle(document.body).overflow,
      markers: {
        hud: !!document.querySelector(".hud"),
        hudLead: !!document.querySelector(".hud__lead"),
        dock: !!document.querySelector(".dock"),
        canvas: !!canvas,
        rail: railOn,
        zoomGroup: !!document.querySelector('.shell-zoom[role="group"]'),
      },
      cam: canvas?.dataset?.cam ?? null,
      ink: (() => {
        if (!canvas) return 0;
        try {
          const g = canvas.getContext("2d");
          const d = g.getImageData(0, 0, Math.min(canvas.width, 400), Math.min(canvas.height, 300)).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
          return n / (d.length / 4);
        } catch { return -1; }
      })(),
      sim: sim ? {
        tick: sim.tick, revision: sim.revision, credits: sim.credits,
        store: sim.store, storeUnits: sim.storeUnits, storeCapacity: sim.storeCapacity,
        tutorial: sim.tutorial, exportClaimed: sim.exportClaimed,
        machines: sim.machines.map((m) => ({
          id: m.id, blueprint: m.blueprint, tile: m.tile,
          trayUnits: m.trayUnits, inBufUnits: m.inBufUnits, batchUnits: batchUnitsOf(m),
          outRoute: m.outRoute ?? null, inRoutes: m.inRoutes ?? [],
        })),
        routes: sim.routes.map((r) => ({
          id: r.id, from: endpointId(r.from), to: endpointId(r.to), filter: r.filter,
          run: runLength(r), cargo: (r.items ?? []).reduce((t, it) => t + it.qty, 0),
        })),
      } : null,
    };
    function batchUnitsOf(m) { return m.batch ? m.batch.reduce((t, b) => t + b.qty, 0) : 0; }
    function endpointId(e) { return e !== null && typeof e === "object" ? e.id : e; }
    function runLength(r) { return Array.isArray(r.run) ? r.run.length : r.run ?? 0; }
  });
}

// ---- real-UI actions ----
async function tapTile(p, tile) {
  await p.waitForFunction(() => !!document.querySelector("canvas")?.dataset?.cam, { timeout: 5000 });
  const pt = await p.evaluate((t) => {
    const canvas = document.querySelector("canvas");
    const [x, y, scale] = (canvas.dataset.cam ?? "").split(",").map(Number);
    const r = canvas.getBoundingClientRect();
    const wx = (t % 6) * 32 + 16, wy = Math.floor(t / 6) * 32 + 16;
    return { sx: r.left + r.width / 2 + (wx - x) * scale, sy: r.top + r.height / 2 + (wy - y) * scale, cam: canvas.dataset.cam };
  }, tile);
  if (!Number.isFinite(pt.sx) || !Number.isFinite(pt.sy)) throw new Error(`tapTile(${tile}): no camera stamp`);
  await p.mouse.click(pt.sx, pt.sy);
  await p.waitForTimeout(380);
  return pt;
}
// A real canvas tap whose world point lies OUTSIDE the 6x6 yard: the bottom-right
// corner of the canvas rect (the camera centres the yard, so the corner is off-yard
// in both form factors). The probe returns the mapped world point so the caller can
// assert it really is outside; the aim must hold (worldToTile -> null).
async function tapOutsideYard(p) {
  const pt = await p.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const [x, y, scale] = (canvas.dataset.cam ?? "").split(",").map(Number);
    const r = canvas.getBoundingClientRect();
    const sx = r.right - 6, sy = r.bottom - 6;
    return { sx, sy, wx: (sx - r.left - r.width / 2) / scale + x, wy: (sy - r.top - r.height / 2) / scale + y };
  });
  await p.mouse.click(pt.sx, pt.sy);
  await p.waitForTimeout(380);
  return pt;
}
async function clickDock(p, face) {
  const ok = await p.evaluate((f) => {
    const btn = [...document.querySelectorAll(".dock .dock__btn")].find((b) => (b.firstChild?.textContent ?? "").trim() === f);
    if (!btn) return false;
    btn.click();
    return true;
  }, face);
  if (!ok) throw new Error(`dock face not found: ${face}`);
  await p.waitForTimeout(380);
}
async function clickPanelFace(p, prefix) {
  const ok = await p.evaluate((pre) => {
    const btn = [...document.querySelectorAll(".panel__actions > .icon-btn")]
      .find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith(pre));
    if (!btn) return false;
    btn.click();
    return true;
  }, prefix);
  if (!ok) throw new Error(`panel face not found: ${prefix}`);
  await p.waitForTimeout(380);
}
async function armPlacement(p, blueprint = "sorter") {
  await clickDock(p, "Build");
  await p.evaluate((bp) => {
    document.querySelector(`.catalog__card[data-blueprint="${bp}"]`).click();
  }, blueprint);
  await p.waitForTimeout(250);
  const via = await p.evaluate(() => {
    const cat = document.querySelector(".catalog");
    const btn = (label) => [...(cat?.querySelectorAll("button") ?? [])]
      .find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith(label));
    const place = btn("Place");
    if (place && !place.disabled) { place.click(); return "Place"; }
    btn("Close catalog").click();
    return "Close catalog";
  });
  await p.waitForTimeout(420);
  return via;
}
async function openFlow(p, machineTile, face) {
  await tapTile(p, machineTile);
  await clickPanelFace(p, face);
}
async function pressEscape(p) {
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}
async function scrollStripIntoView(p) {
  await p.evaluate(() => {
    const a = document.querySelector(".place-strip__actions") ?? document.querySelector(".place-strip");
    if (a) a.scrollIntoView({ block: "nearest" });
  });
  await p.waitForTimeout(250);
}

// Same-task click + persisted-sim read (UI-RESET-54 clickActionSync pattern).
// kind: "primary" | "move" | "dismantle" | "sell" | "keep" | "cancel-move"
async function clickSync(p, kind) {
  return p.evaluate((k) => {
    const readSim = () => JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim;
    const find = () => {
      if (k === "primary") return document.querySelector(".dock__btn--primary");
      if (k === "move") return document.querySelector('[data-flow="move"] .place-strip__confirm');
      if (k === "dismantle") return document.querySelector('[data-flow="dismantle"] .place-strip__confirm');
      if (k === "keep") return [...document.querySelectorAll('[data-flow="dismantle"] .place-strip__actions button')]
        .find((b) => !b.classList.contains("place-strip__confirm"));
      if (k === "cancel-move") return [...document.querySelectorAll('[data-flow="move"] .place-strip__actions button')]
        .find((b) => !b.classList.contains("place-strip__confirm"));
      if (k === "sell") return [...document.querySelectorAll(".panel button")]
        .find((b) => b.textContent.trim().startsWith("Sell "));
      return null;
    };
    const sound = () => [...document.querySelectorAll(".hud button")]
      .find((b) => ["Sound on", "Sound off"].includes((b.getAttribute("aria-label") ?? "").trim()));
    const btn = find();
    if (!btn) return { ok: false, reason: "button not found: " + k };
    const flush = sound();
    if (!flush) return { ok: false, reason: "sound toggle not found for the baseline flush" };
    const stale = readSim();
    flush.click(); // setSettings -> persist live sim, zero sim mutation
    const live = find();
    if (!live) return { ok: false, reason: "face vanished after baseline flush: " + k };
    const label = (live.getAttribute("aria-label") ?? live.textContent ?? "").trim();
    const disabled = live.disabled;
    const before = readSim();
    live.click(); // dispatch -> applyCommand -> persist (or arm/no-op)
    const after = readSim();
    const restore = sound();
    if (restore) restore.click();
    return { ok: true, label, disabled, before, after, baselineLagTicks: before.tick - stale.tick };
  }, kind);
}

// ---- checks / audit / shot ----
const captures = [];
const failures = [];
const actionChecks = [];
let frameNo = 0;

function check(name, ok, detail) {
  actionChecks.push({ check: name, ok: !!ok, detail: detail ?? "" });
  if (!ok) failures.push(`${name}: ${detail}`);
  return ok;
}

function audit(seq, name, p, expect = {}) {
  const c = [];
  const ok = (n, cond, detail) => { c.push({ check: n, ok: !!cond, detail: detail ?? "" }); if (!cond) failures.push(`[${seq}/${name}] ${n}: ${detail ?? ""}`); };
  ok("noBodyScroll", p.docScroll.sw <= p.docScroll.cw + 1 && p.docScroll.sh <= p.docScroll.ch + 1, JSON.stringify(p.docScroll));
  ok("bodyHidden", p.bodyOverflow === "hidden", p.bodyOverflow);
  ok("ink", p.ink > 0.02 || p.ink === -1, `ink=${p.ink}`);
  ok("markers", p.markers.hud && p.markers.hudLead && p.markers.dock && p.markers.canvas, JSON.stringify(p.markers));
  if (expect.mode) ok("mode", p.mode === expect.mode, `mode=${p.mode}`);
  if (expect.strip) {
    const e = expect.strip;
    const s = p.strips[e.flow];
    ok(`strip.${e.flow}.present`, !!s, `strips=${Object.keys(p.strips)}`);
    if (s) {
      ok(`strip.${e.flow}.painted`, s.painted.visible, JSON.stringify(s.painted));
      if (e.valid !== undefined) ok("strip.valid", s.valid === e.valid, `valid=${s.valid}`);
      if (e.verdict !== undefined) ok("strip.verdict", s.verdict === e.verdict, `verdict=${s.verdict}`);
      if (e.armed !== undefined) ok("strip.armed", s.armed === e.armed, `armed=${s.armed}`);
      if (e.fits !== undefined) ok("strip.fits", s.fits === e.fits, `fits=${s.fits}`);
      for (const [field, want] of Object.entries(e.contains ?? {})) {
        const got = field === "impact" ? s.impact.join(" | ") : s[field];
        ok(`strip.${field}~${want.slice(0, 28)}`, (got ?? "").includes(want), `got "${got}" want~"${want}"`);
      }
      if (e.confirmLabel !== undefined) ok("strip.confirmLabel", s.confirm?.label === e.confirmLabel, JSON.stringify(s.confirm));
      if (e.confirmDisabled !== undefined) ok("strip.confirmDisabled", s.confirm?.disabled === e.confirmDisabled, JSON.stringify(s.confirm));
      if (e.cancelLabel !== undefined) ok("strip.cancelLabel", s.cancel === e.cancelLabel, `cancel=${s.cancel}`);
      if (e.actionsReachable) {
        const acts = p.buttons.filter((b) => b.inStrip);
        ok("strip.actionsReachable", acts.length >= 2 && acts.every((b) => b.visible && b.minH >= 44), JSON.stringify(acts));
      }
    }
  }
  if (expect.stripNull) ok(`strip.${expect.stripNull}.gone`, !p.strips[expect.stripNull], `strips=${Object.keys(p.strips)}`);
  if (expect.catalog) {
    ok("catalogPresent", !!p.catalog, "no .catalog");
    if (p.catalog && expect.catalog.placeDisabled !== undefined) {
      ok("catalog.placeDisabled", p.catalog.place?.disabled === expect.catalog.placeDisabled, JSON.stringify(p.catalog.place));
    }
    if (p.catalog && expect.catalog.pressed) {
      const card = p.catalog.cards.find((cd) => cd.blueprint === expect.catalog.pressed);
      ok("catalog.cardPressed", card?.pressed === "true", JSON.stringify(card));
    }
  }
  if (expect.catalogNull) ok("catalogGone", p.catalog === null, "catalog still open");
  if (expect.panel) {
    ok("panelPresent", !!p.panel, "no .panel");
    if (p.panel && expect.panel.title) ok("panel.title", p.panel.title === expect.panel.title, `title=${p.panel.title}`);
    if (p.panel && expect.panel.facePrefix) ok("panel.face", p.panel.faces.some((f) => f.startsWith(expect.panel.facePrefix)), JSON.stringify(p.panel.faces));
    if (p.panel && expect.panel.sellFace) ok("panel.sellFace", p.panel.sellFaces.length > 0, JSON.stringify(p.panel.sellFaces));
    if (p.panel && expect.panel.tradeDesk) ok("panel.tradeDesk", p.panel.tradeDesk, "");
  }
  if (expect.panelNull) ok("panelGone", p.panel === null, "panel still mounted");
  if (expect.dockFaces) ok("dockFaces", JSON.stringify(p.dockFaces.map((f) => f.face)) === JSON.stringify(expect.dockFaces), JSON.stringify(p.dockFaces.map((f) => f.face)));
  if (expect.statusContains) ok("statusLine", p.statusLine.includes(expect.statusContains), `status="${p.statusLine}"`);
  if (expect.floors) {
    const bad = p.buttons.filter((b) => b.visible && b.minH < 44);
    ok("floors", bad.length === 0, JSON.stringify(bad));
  }
  if (expect.reach) {
    const off = p.buttons.filter((b) => b.visible && (b.px < -0.5 || b.py < -0.5 || b.px + b.pw > p.viewport.w + 0.5 || b.py + b.ph > p.viewport.h + 0.5));
    ok("reach", off.length === 0, JSON.stringify(off));
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

const browser = await chromium.launch({ executablePath: exe, headless: true });
const sequences = [];

try {
  // ---- A: desktop fresh boot + the earn path (real Salvage command) ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 });
    await settle(p);
    const pr0 = await shot("A", "yard-fresh", p, "a1-desk-yard-fresh.png", { mode: "rail", floors: true, reach: true, panelNull: true, stripNull: "placement" });
    check("A.earn.primaryLabel", (pr0.dockFaces.find((f) => f.primary)?.label ?? "").startsWith("Salvage"), JSON.stringify(pr0.dockFaces));
    const sal = await clickSync(p, "primary");
    check("A.earn.ok", sal.ok, sal.reason ?? "");
    if (sal.ok) {
      const dScrap = (sal.after.store.scrap ?? 0) - (sal.before.store.scrap ?? 0);
      check("A.earn.charge", dScrap > 0 && sal.after.revision === sal.before.revision + 1 && sal.after.machines.length === 0,
        `dScrap=${dScrap} rev ${sal.before.revision}->${sal.after.revision} lag=${sal.baselineLagTicks}`);
    }
    await p.waitForTimeout(350);
    await shot("A", "salvage-earned", p, "a2-desk-salvage.png", { mode: "rail", floors: true, reach: true });
    sequences.push({ id: "A", viewport: "1280x800", seed: "fresh", ...seqConsole("A", errors) });
    await ctx.close();
  }

  // ---- B: phone fresh boot ----
  {
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 });
    await settle(p);
    await shot("B", "yard-fresh", p, "b1-phone-yard-fresh.png", { mode: "phone", floors: true, reach: true, panelNull: true });
    sequences.push({ id: "B", viewport: "390x844", seed: "fresh", ...seqConsole("B", errors) });
    await ctx.close();
  }

  // ---- C: desktop placement — valid/occupied/dock/edge, cancel, confirm, refusal paths ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({ second: 20 }));
    await settle(p);
    const via = await armPlacement(p, "sorter");
    check("C.arm.via", via === "Place", `via=${via}`);
    await tapTile(p, 28);
    await shot("C", "place-valid", p, "c1-desk-place-valid.png", {
      mode: "rail", strip: { flow: "placement", valid: "true", verdict: "ok", contains: { cell: "Cell 28", cost: "20 scrap", reason: "Clear cell", hint: "Build confirms" } },
    });
    await tapTile(p, 20);
    await shot("C", "place-occupied", p, "c2-desk-place-occupied.png", {
      strip: { flow: "placement", valid: "false", verdict: "occupied", contains: { cell: "Cell 20", reason: "Cell 20 is already occupied" } },
    });
    const ref = await clickSync(p, "primary");
    check("C.refuse.ok", ref.ok, ref.reason ?? "");
    if (ref.ok) {
      check("C.refuse.preserve", ref.after.revision === ref.before.revision &&
        ref.after.machines.length === ref.before.machines.length &&
        ref.after.storeUnits === ref.before.storeUnits,
        `rev ${ref.before.revision}->${ref.after.revision} machines=${ref.after.machines.length} units=${ref.after.storeUnits}`);
    }
    await p.waitForTimeout(350);
    await shot("C", "place-refused-preserved", p, "c3-desk-place-refused-preserved.png", {
      strip: { flow: "placement", valid: "false", verdict: "occupied", contains: { reason: "Cell 20 is already occupied" } },
      statusContains: "Tile blocked",
    });
    await tapTile(p, 28);
    const reaim = await probe(p);
    check("C.reaim.clears", reaim.strips.placement?.verdict === "ok" && reaim.statusLine.includes("Ghost on cell 28"),
      `verdict=${reaim.strips.placement?.verdict} status="${reaim.statusLine}"`);
    await tapTile(p, DOCK_TILE);
    await shot("C", "place-dock", p, "c4-desk-place-dock.png", {
      strip: { flow: "placement", valid: "false", verdict: "dock", contains: { reason: "The dock cell cannot hold a machine." } },
    });
    const dockRef = await clickSync(p, "primary");
    check("C.dockRefuse.preserve", dockRef.ok && dockRef.after.revision === dockRef.before.revision && dockRef.after.machines.length === dockRef.before.machines.length,
      dockRef.ok ? `rev ${dockRef.before.revision}->${dockRef.after.revision}` : dockRef.reason);
    await p.waitForTimeout(300);
    await tapTile(p, YARD_TILES - 1);
    const edge = await probe(p);
    check("C.edge.valid", edge.strips.placement?.verdict === "ok" && edge.strips.placement?.cell === `Cell ${YARD_TILES - 1}`,
      JSON.stringify(edge.strips.placement?.cell));
    const off = await tapOutsideYard(p); // off-yard canvas tap: worldToTile null, aim must hold
    check("C.outside.isOffYard", off.wx >= 192 || off.wx < 0 || off.wy >= 224 || off.wy < 0, `world=(${off.wx.toFixed(1)},${off.wy.toFixed(1)})`);
    await shot("C", "place-edge", p, "c5-desk-place-edge.png", {
      strip: { flow: "placement", valid: "true", verdict: "ok", contains: { cell: `Cell ${YARD_TILES - 1}` } },
    });
    const scrapBeforeCancel = (await probe(p)).sim.store.scrap ?? 0;
    await clickDock(p, "Cancel");
    await shot("C", "place-cancel-catalog", p, "c6-desk-place-cancel-catalog.png", {
      catalog: { pressed: "sorter" }, stripNull: "placement",
    });
    const cancelPr = await probe(p);
    check("C.cancel.noSpend", (cancelPr.sim.store.scrap ?? 0) === scrapBeforeCancel && cancelPr.sim.machines.length === 2,
      `scrap=${cancelPr.sim.store.scrap} machines=${cancelPr.sim.machines.length}`);
    // Back into the preview and confirm a REAL build on the free cell.
    await p.evaluate(() => {
      const cat = document.querySelector(".catalog");
      [...cat.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith("Place")).click();
    });
    await p.waitForTimeout(380);
    await tapTile(p, 28);
    const build = await clickSync(p, "primary");
    check("C.build.ok", build.ok, build.reason ?? "");
    if (build.ok) {
      const dScrap = (build.before.store.scrap ?? 0) - (build.after.store.scrap ?? 0);
      const built = build.after.machines.find((m) => m.tile === 28);
      check("C.build.charge", dScrap === 20 && built?.blueprint === "sorter" &&
        build.after.machines.length === build.before.machines.length + 1 &&
        build.after.revision === build.before.revision + 1,
        `dScrap=${dScrap} built=${JSON.stringify(built)} rev ${build.before.revision}->${build.after.revision} lag=${build.baselineLagTicks}`);
    }
    await p.waitForTimeout(380);
    await shot("C", "place-built", p, "c7-desk-place-built.png", { mode: "rail", stripNull: "placement", floors: true, reach: true });
    sequences.push({ id: "C", viewport: "1280x800", seed: "yard(sorter@8, sorter@20, scrap 100)", ...seqConsole("C", errors) });
    await ctx.close();
  }

  // ---- C2: desktop placement — affordability refusal returns to recovery; Store reachable ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({ scrap: 0 }));
    await settle(p);
    const via = await armPlacement(p, "sorter");
    check("C2.arm.viaClose", via === "Close catalog", `via=${via} (unaffordable Place is disabled, build-52)`);
    await tapTile(p, 20);
    await shot("C2", "place-shortfall", p, "c8-desk-place-shortfall.png", {
      strip: { flow: "placement", valid: "false", verdict: "ok", contains: { short: "Need 20 scrap", cost: "20 scrap" } },
    });
    const ref = await clickSync(p, "primary");
    check("C2.refuse.ok", ref.ok, ref.reason ?? "");
    if (ref.ok) {
      check("C2.refuse.recovery", ref.after.revision === ref.before.revision &&
        ref.after.machines.length === ref.before.machines.length &&
        ref.after.storeUnits === ref.before.storeUnits,
        `rev ${ref.before.revision}->${ref.after.revision} units=${ref.after.storeUnits}`);
    }
    await p.waitForTimeout(380);
    const rec = await shot("C2", "place-recovery", p, "c9-desk-place-recovery.png", { stripNull: "placement" });
    check("C2.recovery.explained", rec.statusLine.length > 0, `status="${rec.statusLine}"`);
    await clickDock(p, "Store");
    await shot("C2", "store-recovery", p, "c10-desk-store-recovery.png", {
      panel: { title: "Yard store" }, stripNull: "placement",
    });
    sequences.push({ id: "C2", viewport: "1280x800", seed: "yard(sorter@8, scrap 0)", ...seqConsole("C2", errors) });
    await ctx.close();
  }

  // ---- D: desktop move — preview, no charge until valid Confirm, cancel, N cycle ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({ second: 20 }));
    await settle(p);
    const pre = await probe(p);
    const id = pre.sim.machines.find((m) => m.tile === 8).id;
    await openFlow(p, 8, "Move");
    const d1 = await shot("D", "move-open", p, "d1-desk-move-open.png", {
      strip: { flow: "move", contains: { dest: "Destination: cell", cost: "10 scrap", machine: "Scrap sorter" } },
    });
    check("D.open.noCharge", d1.sim.revision === pre.sim.revision &&
      d1.sim.machines.find((m) => m.id === id).tile === 8 &&
      d1.sim.storeUnits === pre.sim.storeUnits,
      `rev ${pre.sim.revision}->${d1.sim.revision} tile=${d1.sim.machines.find((m) => m.id === id).tile}`);
    await tapTile(p, 20);
    await shot("D", "move-occupied", p, "d2-desk-move-occupied.png", {
      strip: { flow: "move", valid: "false", verdict: "occupied", confirmDisabled: true, contains: { reason: "Cell 20 is already occupied" } },
    });
    const blocked = await clickSync(p, "move");
    check("D.occupied.noSpend", blocked.ok && blocked.disabled === true &&
      blocked.after.revision === blocked.before.revision &&
      blocked.after.machines.find((m) => m.id === id).tile === 8 &&
      blocked.after.storeUnits === blocked.before.storeUnits,
      blocked.ok ? `disabled=${blocked.disabled} rev ${blocked.before.revision}->${blocked.after.revision}` : blocked.reason);
    await tapTile(p, 8); // own cell
    const own = await probe(p);
    check("D.ownCell.blocked", own.strips.move?.verdict === "occupied" && own.strips.move?.confirm?.disabled === true,
      JSON.stringify({ verdict: own.strips.move?.verdict, confirm: own.strips.move?.confirm }));
    await tapTile(p, DOCK_TILE);
    const dockDest = await probe(p);
    check("D.dock.blocked", dockDest.strips.move?.verdict === "dock" && dockDest.strips.move?.confirm?.disabled === true,
      JSON.stringify({ verdict: dockDest.strips.move?.verdict, confirm: dockDest.strips.move?.confirm }));
    await tapTile(p, 28);
    await shot("D", "move-valid", p, "d3-desk-move-valid.png", {
      strip: { flow: "move", valid: "true", verdict: "ok", confirmDisabled: false, confirmLabel: "Confirm move", contains: { dest: "Destination: cell 28", reason: "Clear destination" } },
    });
    const charge = moveChargeOf(pre.sim, id);
    const mv = await clickSync(p, "move");
    check("D.move.ok", mv.ok, mv.reason ?? "");
    if (mv.ok) {
      const dUnits = mv.before.storeUnits - mv.after.storeUnits;
      const wantUnits = charge.reduce((t, it) => t + it.qty, 0);
      const dScrap = (mv.before.store.scrap ?? 0) - (mv.after.store.scrap ?? 0);
      check("D.move.charge", mv.after.machines.find((m) => m.id === id).tile === 28 &&
        dScrap === charge[0].qty && dUnits === wantUnits &&
        mv.after.revision === mv.before.revision + 1,
        `tile=${mv.after.machines.find((m) => m.id === id).tile} dScrap=${dScrap} want=${charge[0].qty} dUnits=${dUnits} rev ${mv.before.revision}->${mv.after.revision} lag=${mv.baselineLagTicks}`);
    }
    await p.waitForTimeout(380);
    await shot("D", "move-done", p, "d4-desk-move-done.png", { stripNull: "move" });
    // Cancel path on the moved machine + N-key cycle (no spend).
    await openFlow(p, 28, "Move");
    await tapTile(p, 20);
    const beforeN = await probe(p);
    await p.keyboard.press("n");
    await p.waitForTimeout(300);
    const afterN = await probe(p);
    check("D.nCycle", afterN.strips.move?.dest !== beforeN.strips.move?.dest &&
      afterN.sim.revision === beforeN.sim.revision && afterN.sim.storeUnits === beforeN.sim.storeUnits,
      `"${beforeN.strips.move?.dest}" -> "${afterN.strips.move?.dest}"`);
    const canc = await clickSync(p, "cancel-move");
    check("D.cancel.noSpend", canc.ok && canc.after.revision === canc.before.revision &&
      canc.after.machines.find((m) => m.id === id).tile === 28 &&
      canc.after.storeUnits === canc.before.storeUnits,
      canc.ok ? `tile=${canc.after.machines.find((m) => m.id === id).tile} rev ${canc.before.revision}->${canc.after.revision}` : canc.reason);
    await p.waitForTimeout(350);
    await shot("D", "move-cancel", p, "d5-desk-move-cancel.png", { stripNull: "move" });
    sequences.push({ id: "D", viewport: "1280x800", seed: "yard(sorter@8, sorter@20, scrap 100)", ...seqConsole("D", errors) });
    await ctx.close();
  }

  // ---- E: desktop dismantle — impact parity, arm/commit safeguard, cancel, no-room recovery ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({ connect: true }));
    await settle(p);
    const pre = await probe(p);
    const id = pre.sim.machines[0].id;
    const expected = registeredRefundOf(pre.sim, id);
    const cargo = registeredCargoOf(pre.sim, id);
    check("E.seed.emptyBelts", cargo === 0, `registeredCargo=${cargo}`);
    await openFlow(p, 8, "Dismantle");
    const e1 = await shot("E", "dismantle-impact", p, "e1-desk-dismantle-impact.png", {
      strip: {
        flow: "dismantle", armed: "false", fits: "true", confirmLabel: "Dismantle machine", confirmDisabled: false, cancelLabel: "Keep machine",
        contains: { impact: "Build price returns +18", total: `+${expected}`, room: "Free store room" },
      },
    });
    const printedTotal = Number((e1.strips.dismantle?.total ?? "").match(/\+(\d+)/)?.[1] ?? NaN);
    check("E.parity.printedVsEngine", printedTotal === expected, `printed=${printedTotal} engine=${expected}`);
    check("E.parity.beltLine", e1.strips.dismantle?.impact.some((l) => l.startsWith("Belt links return")) === true, JSON.stringify(e1.strips.dismantle?.impact));
    check("E.open.noDispatch", e1.sim.revision === pre.sim.revision && e1.sim.machines.some((m) => m.id === id),
      `rev ${pre.sim.revision}->${e1.sim.revision}`);
    const arm = await clickSync(p, "dismantle");
    check("E.arm.noDispatch", arm.ok && arm.after.revision === arm.before.revision &&
      arm.after.machines.some((m) => m.id === id) && arm.after.storeUnits === arm.before.storeUnits,
      arm.ok ? `rev ${arm.before.revision}->${arm.after.revision}` : arm.reason);
    await p.waitForTimeout(350);
    await shot("E", "dismantle-armed", p, "e2-desk-dismantle-armed.png", {
      strip: { flow: "dismantle", armed: "true", fits: "true", confirmLabel: "Tap again to dismantle", contains: { hint: "Tap again to commit" } },
    });
    const keep = await clickSync(p, "keep");
    check("E.keep.noRefund", keep.ok && keep.after.revision === keep.before.revision &&
      keep.after.machines.some((m) => m.id === id) && keep.after.storeUnits === keep.before.storeUnits,
      keep.ok ? `rev ${keep.before.revision}->${keep.after.revision}` : keep.reason);
    await p.waitForTimeout(350);
    await shot("E", "dismantle-kept", p, "e3-desk-dismantle-kept.png", { stripNull: "dismantle" });
    // Re-open, arm, commit: store delta === printed === engine registered-set formula.
    await clickPanelFace(p, "Dismantle");
    await clickSync(p, "dismantle"); // arm
    await p.waitForTimeout(300);
    const commit = await clickSync(p, "dismantle");
    check("E.commit.ok", commit.ok, commit.reason ?? "");
    if (commit.ok) {
      const dUnits = commit.after.storeUnits - commit.before.storeUnits;
      const routesBefore = commit.before.routes.length;
      const links = [commit.before.machines.find((m) => m.id === id).outRoute, ...commit.before.machines.find((m) => m.id === id).inRoutes].filter((x) => x !== null).length;
      check("E.commit.parity", dUnits === expected && dUnits === printedTotal &&
        !commit.after.machines.some((m) => m.id === id) &&
        commit.after.revision === commit.before.revision + 1 &&
        commit.after.routes.length === routesBefore - links,
        `delta=${dUnits} printed=${printedTotal} engine=${expected} links=${links} routes ${routesBefore}->${commit.after.routes.length} rev ${commit.before.revision}->${commit.after.revision} lag=${commit.baselineLagTicks}`);
    }
    await p.waitForTimeout(380);
    await shot("E", "dismantle-committed", p, "e4-desk-dismantle-committed.png", { stripNull: "dismantle", panelNull: true });
    sequences.push({ id: "E", viewport: "1280x800", seed: "yard(sorter@8 connected, belts drained empty)", expectedRefund: expected, ...seqConsole("E", errors) });
    await ctx.close();
  }

  // ---- E2: full store — commit disabled, recovery hint, real sell frees room ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({ fill: true }));
    await settle(p);
    const pre = await probe(p);
    const id = pre.sim.machines[0].id;
    const expected = registeredRefundOf(pre.sim, id);
    await openFlow(p, 8, "Dismantle");
    await shot("E2", "dismantle-noroom", p, "e5-desk-dismantle-noroom.png", {
      strip: {
        flow: "dismantle", fits: "false", confirmDisabled: true,
        contains: { reason: `Store full — free ${expected} more unit`, hint: "Sell stock from the Store" },
      },
    });
    const blocked = await clickSync(p, "dismantle");
    check("E2.noroom.noDispatch", blocked.ok && blocked.disabled === true &&
      blocked.after.revision === blocked.before.revision && blocked.after.machines.some((m) => m.id === id),
      blocked.ok ? `disabled=${blocked.disabled}` : blocked.reason);
    await clickDock(p, "Store");
    const storePr = await probe(p);
    check("E2.store.sellFace", storePr.panel?.sellFaces.length > 0, JSON.stringify(storePr.panel?.sellFaces));
    const sell = await clickSync(p, "sell");
    check("E2.sell.ok", sell.ok, sell.reason ?? "");
    if (sell.ok) {
      check("E2.sell.freesRoom", sell.after.storeUnits < sell.before.storeUnits &&
        sell.after.credits > sell.before.credits && sell.after.revision === sell.before.revision + 1,
        `units ${sell.before.storeUnits}->${sell.after.storeUnits} credits ${sell.before.credits}->${sell.after.credits} lag=${sell.baselineLagTicks}`);
    }
    await p.waitForTimeout(350);
    // Close the Store via its real Close face; the dismantle card underneath must now fit.
    await p.evaluate(() => {
      const btn = [...document.querySelectorAll(".panel .panel__head button")].find((b) => b.textContent.trim() === "Close");
      if (btn) btn.click();
    });
    await p.waitForTimeout(380);
    const recovered = await probe(p);
    const room = recovered.sim.storeCapacity - recovered.sim.storeUnits;
    check("E2.recovery.fits", recovered.strips.dismantle?.fits === "true" && recovered.strips.dismantle?.confirm?.disabled === false && room >= expected,
      `fits=${recovered.strips.dismantle?.fits} room=${room} need=${expected}`);
    await shot("E2", "dismantle-recovered", p, "e6-desk-dismantle-recovered.png", {
      strip: { flow: "dismantle", fits: "true", confirmDisabled: false },
    });
    sequences.push({ id: "E2", viewport: "1280x800", seed: "yard(sorter@8, store full)", ...seqConsole("E2", errors) });
    await ctx.close();
  }

  // ---- F: empty yard — repeated taps on unavailable actions never buy, always explain ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({ empty: true, scrap: 0 }));
    await settle(p);
    const pre = await probe(p);
    check("F.seed.empty", pre.sim.machines.length === 0 && pre.sim.storeUnits === 0, JSON.stringify({ machines: pre.sim.machines.length, units: pre.sim.storeUnits }));
    const phases = [];
    let bought = false;
    let charged = false;
    // Tap 1 arms the ghost (resting primary is the build step); tap 2 is refused
    // (affordability) back to recovery; the cycle repeats with an explanation every time.
    for (let i = 0; i < 8; i++) {
      const r = await clickSync(p, "primary");
      if (!r.ok) { check(`F.tap${i}.found`, false, r.reason); break; }
      if (r.after.machines.length > 0) bought = true;
      if (r.after.storeUnits !== 0) charged = true;
      await p.waitForTimeout(280);
      const pr = await probe(p);
      phases.push(pr.statusLine);
      if (i === 0) {
        // The empty-yard ladder at tutorial 9 arms the NEAREST unbuilt blueprint
        // (furnace, 10 scrap + 5 ferrous), not the sorter — the contract under test is
        // the explained shortfall, not a specific price.
        const f1 = await shot("F", "taps-armed-shortfall", p, "f1-desk-taps-armed.png", {
          strip: { flow: "placement", valid: "false", verdict: "ok", contains: { short: "have 0" } },
        });
        check("F.shortfall.explained", /Need \d+ scrap · have 0/.test(f1.strips.placement?.short ?? ""), `short="${f1.strips.placement?.short}"`);
      }
      if (i === 1) {
        await shot("F", "taps-recovery", p, "f2-desk-taps-recovery.png", { stripNull: "placement" });
      }
    }
    check("F.taps.neverBuy", !bought, "a machine appeared");
    check("F.taps.neverCharge", !charged, "store units moved");
    check("F.taps.alwaysExplain", phases.length === 8 && phases.every((l) => l.trim().length > 0), JSON.stringify(phases));
    // The catalog's disabled Place is the same contract: taps cannot spend.
    await clickDock(p, "Build");
    const catPr = await probe(p);
    check("F.catalog.placeDisabled", catPr.catalog?.place?.disabled === true, JSON.stringify(catPr.catalog?.place));
    for (let i = 0; i < 4; i++) {
      await p.evaluate(() => {
        const cat = document.querySelector(".catalog");
        const place = [...cat.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith("Place"));
        place.click(); // disabled: the browser delivers no activation
      });
      await p.waitForTimeout(150);
    }
    const after = await probe(p);
    check("F.catalog.neverBuy", after.sim.machines.length === 0 && after.sim.storeUnits === 0 && after.catalog !== null,
      JSON.stringify({ machines: after.sim.machines.length, units: after.sim.storeUnits, catalog: !!after.catalog }));
    await shot("F", "catalog-disabled", p, "f3-desk-catalog-disabled.png", { catalog: { placeDisabled: true } });
    sequences.push({ id: "F", viewport: "1280x800", seed: "empty yard, scrap 0", phases, ...seqConsole("F", errors) });
    await ctx.close();
  }

  // ---- H: phone 390x844 — the three flows painted, floors + reach ----
  {
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 }, yardSeed({ second: 20 }));
    await settle(p);
    await armPlacement(p, "sorter");
    await tapTile(p, 28);
    await shot("H", "phone-place-valid", p, "h1-phone-place-valid.png", {
      mode: "phone", floors: true, reach: true,
      strip: { flow: "placement", valid: "true", verdict: "ok", contains: { cell: "Cell 28", cost: "20 scrap" } },
    });
    await pressEscape(p); // retire the build layer
    await openFlow(p, 8, "Move");
    await tapTile(p, 28);
    let aimPr = await probe(p);
    let aimPath = "tap";
    if (aimPr.strips.move?.dest !== "Destination: cell 28") {
      // On phone the open inspector overlays the lower yard, so the tapped cell may
      // not receive the pointer. The flow's own documented alternative is the N key
      // ("Tap the yard (or press N)") — cycle to the same free destination.
      aimPath = "N-key (inspector overlay covers the tapped cell on phone)";
      for (let i = 0; i < 40 && aimPr.strips.move?.dest !== "Destination: cell 28"; i++) {
        await p.keyboard.press("n");
        await p.waitForTimeout(120);
        aimPr = await probe(p);
      }
    }
    check("H.move.aim28", aimPr.strips.move?.dest === "Destination: cell 28", `dest=${aimPr.strips.move?.dest} path=${aimPath}`);
    await scrollStripIntoView(p);
    await shot("H", "phone-move-valid", p, "h2-phone-move-valid.png", {
      mode: "phone", floors: true, reach: true,
      strip: { flow: "move", valid: "true", verdict: "ok", confirmDisabled: false, actionsReachable: true, contains: { dest: "Destination: cell 28" } },
    });
    await pressEscape(p); // retire the move flow, inspector stays
    await clickPanelFace(p, "Dismantle");
    await scrollStripIntoView(p);
    await shot("H", "phone-dismantle-impact", p, "h3-phone-dismantle-impact.png", {
      mode: "phone", floors: true,
      strip: { flow: "dismantle", armed: "false", fits: "true", confirmLabel: "Dismantle machine", actionsReachable: true, contains: { impact: "Build price returns +18" } },
    });
    await clickSync(p, "dismantle"); // arm
    await p.waitForTimeout(320);
    await scrollStripIntoView(p);
    await shot("H", "phone-dismantle-armed", p, "h4-phone-dismantle-armed.png", {
      mode: "phone", floors: true, reach: true,
      strip: { flow: "dismantle", armed: "true", confirmLabel: "Tap again to dismantle", actionsReachable: true },
    });
    await clickSync(p, "keep");
    sequences.push({ id: "H", viewport: "390x844", seed: "yard(sorter@8, sorter@20, scrap 100)", moveAimPath: aimPath, ...seqConsole("H", errors) });
    await ctx.close();
  }

  // ---- I: phone 200% text — floors, reach, scrollIntoView ----
  {
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 }, yardSeed({ textScale: 2 }));
    await settle(p);
    await armPlacement(p, "sorter");
    await tapTile(p, 28);
    await scrollStripIntoView(p);
    await shot("I", "ts2-place", p, "i1-phone-ts2-place.png", {
      mode: "phone", floors: true, reach: true,
      strip: { flow: "placement", valid: "true", verdict: "ok", contains: { cell: "Cell 28" } },
    });
    await pressEscape(p);
    await openFlow(p, 8, "Dismantle");
    await scrollStripIntoView(p);
    await shot("I", "ts2-dismantle", p, "i2-phone-ts2-dismantle.png", {
      mode: "phone", floors: true, reach: true,
      strip: { flow: "dismantle", armed: "false", fits: "true", actionsReachable: true, contains: { impact: "Build price returns +18" } },
    });
    sequences.push({ id: "I", viewport: "390x844 @200% text", seed: "yard(sorter@8, scrap 100) + textScale=2", ...seqConsole("I", errors) });
    await ctx.close();
  }

  // ---- J: save/reload after real build + move + dismantle commands ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, yardSeed({}));
    await settle(p);
    // Real build at 28.
    await armPlacement(p, "sorter");
    await tapTile(p, 28);
    const build = await clickSync(p, "primary");
    check("J.build.ok", build.ok && build.after.machines.some((m) => m.tile === 28), build.ok ? "" : build.reason);
    await p.waitForTimeout(350);
    // Real move 8 -> 20.
    await openFlow(p, 8, "Move");
    await tapTile(p, 20);
    const mv = await clickSync(p, "move");
    check("J.move.ok", mv.ok && mv.after.machines.some((m) => m.tile === 20 && m.id === mv.before.machines.find((x) => x.tile === 8).id), mv.ok ? "" : mv.reason);
    await p.waitForTimeout(350);
    // Real dismantle of the machine at 28 (arm + commit).
    await openFlow(p, 28, "Dismantle");
    await clickSync(p, "dismantle");
    await p.waitForTimeout(250);
    const dis = await clickSync(p, "dismantle");
    check("J.dismantle.ok", dis.ok && !dis.after.machines.some((m) => m.tile === 28), dis.ok ? "" : dis.reason);
    await p.waitForTimeout(400);
    const post = await probe(p);
    const postTiles = post.sim.machines.map((m) => m.tile).sort((a, b) => a - b);
    check("J.post.state", JSON.stringify(postTiles) === "[20]" && post.sim.revision === dis.after.revision,
      `tiles=${JSON.stringify(postTiles)} rev=${post.sim.revision}`);
    await shot("J", "commands-done", p, "j1-desk-commands-done.png", { mode: "rail", stripNull: "placement", panelNull: true });
    // Reload: the persisted save must boot the SAME yard (no commands after reload).
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForSelector("text=Begin recovery", { timeout: 15000 }).catch(() => {});
    await settle(p);
    const re = await probe(p);
    const reTiles = re.sim.machines.map((m) => m.tile).sort((a, b) => a - b);
    check("J.reload.parity", JSON.stringify(reTiles) === JSON.stringify(postTiles) &&
      re.sim.revision === post.sim.revision && re.sim.storeUnits === post.sim.storeUnits &&
      re.sim.machines[0].blueprint === "sorter",
      `tiles ${JSON.stringify(postTiles)}->${JSON.stringify(reTiles)} rev ${post.sim.revision}->${re.sim.revision} units ${post.sim.storeUnits}->${re.sim.storeUnits}`);
    await shot("J", "reloaded", p, "j2-desk-reloaded.png", { mode: "rail", floors: true, reach: true });
    sequences.push({ id: "J", viewport: "1280x800", seed: "yard(sorter@8, scrap 100)", postTiles, reTiles, ...seqConsole("J", errors) });
    await ctx.close();
  }
} catch (err) {
  failures.push(`probe crashed: ${err && err.stack ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

const passed = captures.filter((c) => c.passed).length;
const receipt = {
  task: "UI-RESET-53 explicit placement, move and dismantle flows",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/53",
  headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
  headShaNote: "code commit under test; the evidence-only commit containing this receipt follows it as PR head",
  tool: "playwright-core headless Chrome, DOM/geometry/console assertions only (no vision)",
  seed: "command-built yards via the game's own applyCommand/advance + planConnections + encodeSave checksum (identical fixture arithmetic to tests/ui/place-53.test.tsx yardState); fresh boot for A/B; one-shot sessionStorage guard so the reload probe boots the PERSISTED save, not the seed",
  mutations: MUTATIONS,
  resolutions: [
    "probe fix: the sim projection referenced a Node-side constant inside page.evaluate (ReferenceError -> null sim); replaced with the literal storage key",
    "probe fix: addInitScript re-runs on every navigation — a sessionStorage one-shot guard keeps p.reload() from re-seeding over the persisted commands",
    "probe fix: the empty-yard repeated-tap expectation is blueprint-agnostic — at tutorial 9 the yard ladder arms the nearest unbuilt blueprint (furnace, 10 scrap + 5 ferrous), and the contract under test is the explained shortfall, never a silent buy",
    "probe fix: on phone the open inspector can overlay the tapped yard cell; the move-aim probe falls back to the flow's documented N-key path (recorded per sequence as moveAimPath)",
  ],
  frameAudit: "every capture frame runs probe()+audit() before screenshot; checks recorded per frame; any failed check fails the run; every action-level assertion (charges, refunds, parity, no-dispatch arms, repeated taps, reload) is recorded with its numbers in actionChecks, pass or fail",
  actionProof: "clickSync clicks the real button (dock primary / strip Confirm / Keep machine / Sell) and reads localStorage in the same JS task (dispatch->applyCommand->persist synchronous; zero engine ticks between click and read). The pre-click baseline is flushed through the real HudTop sound toggle (setSettings -> synchronous persist, zero sim effect, restored); baselineLagTicks recorded per action. Tile taps project through the canvas's own camera stamp (dataset.cam) with the pointer handler's screenToWorld inverse",
  parityProof: "dismantle: printed total === Node-side registered-set formula (buildRefund + tray + inBuf + batch + registered belt refunds) === same-task storeUnits delta, on EMPTY-belt seeds (dropRoute also returns in-transit cargo; the seed drains scrap after connecting so cargo=0, matching the #54 inspector contract). move: printed per-line charge === same-task store delta. The orphaned output link (connectRoute overwrites outRoute; engine follow-up #100 HELD) stays unrefunded — the delta discriminates registered-set vs all-touching",
  viewports: ["1280x800 desktop rail", "390x844 phone", "390x844 phone @200% text"],
  sequences,
  summary: { frames: captures.length, passed, failed: captures.length - passed, checkFailures: failures.length, actionChecks: actionChecks.length, actionChecksPassed: actionChecks.filter((c) => c.ok).length },
  failures,
  actionChecks,
  captures,
};
fs.writeFileSync(path.join(out, "receipt-place-53.json"), JSON.stringify(receipt, null, 2));
console.log(`\nframes=${captures.length} passed=${passed} failures=${failures.length} actionChecks=${actionChecks.length}`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
