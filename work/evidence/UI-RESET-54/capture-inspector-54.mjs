// UI-RESET-54 — machine inspector evidence probe (issue #54, G2 wave 3).
//
// Purpose: prove the sectioned machine inspector paints its claimed state on
// real builds in both form factors, and that every action under test goes
// through the REAL UI path (click -> dispatchCommand -> applyCommand ->
// persisted sim), never direct state injection.
//
// Prerequisites (from the worktree root):
//   pnpm build
//   node node_modules/vite/bin/vite.js preview --port 4235 --strictPort
//   node work/evidence/UI-RESET-54/capture-inspector-54.mjs
//
// NO VISION: every frame is audited by DOM/geometry/console assertions only.
// FRAME AUDIT hard rule: shot() records probe() + audit() for EVERY capture;
// a frame whose claimed state is not painted fails the run (exit 1).
//
// Probe-only seed mutations (NEVER in src; sim validation untouched). The
// base seed is docs/evidence/yard-mature.json; install() recomputes the
// fnv1a checksum after mutation so the save loads:
//   base        payload.lastSeenMs = Date.now()   (skip catch-up drift)
//   credits     sim.credits = 1000                (seed has 82; M1 lvl14
//               upgrade costs 222 via the engine's iterative ceil formula,
//               so the printed-cost upgrade demo needs funds; the printed
//               cost is still the real engine formula, asserted against the
//               sim delta)
//   starved     route 4 removed, M2.inRoutes=[], M1.outRoute=null
//               (keeps the furnace starved while the frame is captured;
//               otherwise the live belt feeds it within ~5 ticks)
//   power       M1.batchPower=9, M1.batchMilli=1e9 (batch never completes,
//               input never drains -> M1 draw pinned at 9 > capacity 8, so
//               the yard is ALWAYS power limited). Other machines start at 0
//               but the engine re-starts starved machines live and restores
//               their blueprint draw, so the exact demand (9..15) and percent
//               are computed from the live sim at frame time and the DOM is
//               asserted against that — never a hard-coded drift-prone number
//   fullOutput  M1.tray = 6 ferrous + 6 nonferrous (12/12), routes 2/3/4
//               removed, M1.outRoute=null, M2.inRoutes stripped of 4
//   busyLink    route 4 busyTicks=9000 ageTicks=10000 => 90% busy
//   textScale   settings.textScale = 2              (200% text frame)
//
// Synchronous action proof: page.evaluate clicks the real button and reads
// localStorage in the SAME task — dispatch -> applyCommand -> persist is
// synchronous, so zero engine ticks elapse between click and read and store
// deltas cannot drift from drone deliveries. The pre-click baseline is itself
// flushed through the real HudTop sound toggle (setSettings persists the live
// sim synchronously and mutates no sim field; the toggle is restored after the
// read), because the ~1 s interval checkpoint alone can lag the live engine.
// DOM re-render is asserted after a short settle wait.
//
// Scroll proof: the phone sheet scrolls its actions into view with
// scrollIntoView({block:"nearest"}) — the smallest scroll that paints every
// face — instead of the absolute body bottom, which at 200% text parks the
// faces above the clip behind the taller consequence notes.
//
// Camera/tap helpers are copied from the proven UI-RESET-49 shell probe
// (App.fitToShell reproduction); taps land on real canvas machine centres.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const out = __dirname;
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4235/";
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
const MUTATIONS = [
  "base: payload.lastSeenMs = Date.now() (avoid catch-up drift)",
  "credits: sim.credits = 1000 (seed 82 < lvl14 upgrade cost 222, iterative ceil)",
  "starved: route 4 removed, M2.inRoutes=[], M1.outRoute=null (furnace stays starved)",
  "power: M1.batchPower=9 + batchMilli=1e9 (draw pinned > capacity 8); others start 0, live demand/percent computed from sim at frame time",
  "fullOutput: M1 tray 12/12, routes 2/3/4 removed, outRoute=null, M2.inRoutes stripped",
  "busyLink: route 4 busyTicks=9000 ageTicks=10000 (90% busy)",
  "textScale: settings.textScale=2 (200% text)",
];

// The engine's real upgrade cost: iterative ceil, NOT ceil(base*1.16^level).
function engineUpgradeCost(base, level) {
  let cost = base;
  for (let i = 1; i < level; i += 1) cost = Math.ceil(cost * 1.16);
  return cost;
}

// Live power frame: demand = sum of batchPower over machines with progress>0
// (engine allocatePower), percent = round(min(1, 8/demand)*100).
function powerFrame(pr) {
  const demand = pr.sim.machines.reduce((t, m) => t + (m.progress > 0 ? m.batchPower : 0), 0);
  const percent = demand === 0 ? 100 : Math.max(0, Math.min(100, Math.round(Math.min(1, 8 / demand) * 100)));
  return { demand, percent };
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Node-side seed mutation: parse, mutate (incl. array ops), re-checksum.
function seedWith(fn) {
  const env = JSON.parse(seedRaw);
  fn(env.payload.sim, env.payload.settings, env.payload);
  env.checksum = fnv1a(JSON.stringify(env.payload));
  return JSON.stringify(env);
}
const baseSeed = () => seedWith((_s, _st, p) => { p.lastSeenMs = Date.now(); });

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

// Mature saves boot into the return report after catch-up; press "Back to
// yard" once it paints. Fresh yards (and lastSeenMs=now seeds) just clear the
// gate. Copied from the UI-RESET-49 probe.
async function settle(p, mature) {
  await p.click("text=Begin recovery");
  if (!mature) { await p.waitForTimeout(450); return; }
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

// Shell + inspector probe: boxes, painted rects (clip-aware), floors, scroll,
// shell markers, inspector sections/rows/notes/actions/context panes, sim.
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
    const tabs = panel ? [...panel.querySelectorAll(".inspector-context__btn")].map((b) => ({
      label: b.textContent.trim(),
      pressed: b.getAttribute("aria-pressed") === "true",
      minH: Math.round(b.getBoundingClientRect().height),
    })) : [];
    const pane = panel?.querySelector(".inspector-context__pane");
    const paneRows = pane ? readRows(pane) : [];
    const body = panel?.querySelector(".panel__body");
    const progress = panel?.querySelector(".inspector-progress");
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
        sections, rowMap, notes, faces, accentCount, tabs, paneRows,
        primaryNote: (panel.querySelector(".inspector-actions-note")?.textContent ?? "").trim(),
        secondaryNote: (panel.querySelector(".inspector-actions-note--secondary")?.textContent ?? "").trim(),
        progressNow: progress ? progress.getAttribute("aria-valuenow") : null,
      } : null,
      sim: sim ? {
        tick: sim.tick, revision: sim.revision, credits: sim.credits, storeUnits: sim.storeUnits, powerRatio: sim.powerRatio,
        machines: sim.machines.map((m) => ({ id: m.id, blueprint: m.blueprint, tile: m.tile, level: m.level, batchMilli: m.batchMilli, batchPower: m.batchPower, progress: m.progress, status: m.status, trayUnits: m.trayUnits, inBufUnits: m.inBufUnits, batchUnits: (m.batch ?? []).reduce((t, b) => t + b.qty, 0) })),
        machineTiles: sim.machines.map((m) => m.tile),
        routes: sim.routes.map((r) => ({ id: r.id, from: r.from.id, to: r.to.id, filter: r.filter, busyTicks: r.busyTicks ?? 0, ageTicks: r.ageTicks ?? 0, run: r.run ? r.run.length : null })),
      } : null,
    };
  });
}

// The camera the shell paints, reproduced from the painted chrome boxes exactly
// as App.fitToShell does (scene.ts fitCamera + the rail recentering term).
// From the UI-RESET-49 probe, updated for UI-RESET-50: phone/column reserve the
// zoom stack's right gutter SHELL_ZOOM_GUTTER_PX = 44 + 10 + 6 = 60 (layout.ts),
// rail reserves SHELL_RIGHT_GUTTER_PX = 334.
function cameraFor(boxes, W, H) {
  const { lead, dock, rail } = boxes;
  if (!lead || !dock) return null;
  const top = lead.bottom + 6;
  const bottom = Math.max(0, H - dock.y) + 6;
  const left = rail ? rail.right + 6 : 0;
  const right = rail ? 334 : 60;
  const regionW = Math.max(1, W - left - right);
  const usableH = H - top - bottom;
  const raw = Math.min(4, regionW / 200); // WORLD_W + 8 = 200
  let scale, y;
  if (usableH <= 0) { scale = Math.max(1.4, raw); y = 112; }
  else {
    const bandScale = usableH / 236; // WORLD_H + 12 = 236
    scale = bandScale >= raw ? Math.max(1.4, raw) : Math.max(1.1, Math.min(raw, bandScale));
    const bandCentre = top + usableH / 2;
    y = 112 + (H / 2 - bandCentre) / scale;
  }
  let x = 96; // WORLD_W / 2
  if (left > 0 || right > 0) x += (W / 2 - (left + regionW / 2)) / scale;
  return { x, y, scale };
}

// Tap a machine centre inside the clear world band; prefer a specific tile
// when it is clear, otherwise fall back to the first clear machine.
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
  await p.mouse.click(hit.sx, hit.sy);
  await p.waitForTimeout(400);
  const after = await probe(p);
  const machine = pr.sim.machines.find((m) => m.tile === hit.tile);
  return { tile: hit.tile, sx: Math.round(hit.sx), sy: Math.round(hit.sy), machine, probe: after };
}

// Click a real .panel__actions button and read the persisted sim in the SAME
// evaluate task: dispatch -> applyCommand -> persist is synchronous, so the
// delta is exact (no engine ticks, no drone-delivery drift).
//
// The baseline needs one more step. The store checkpoints on a ~1 s interval,
// so a localStorage read taken before the click can be up to a second stale
// while the engine keeps moving storeUnits (belt loading, drone arrivals,
// overflow drain). `setSettings` persists synchronously too and touches no sim
// field, so clicking the real HudTop sound toggle first flushes the LIVE sim
// into the save: that read is the exact pre-command state. The toggle is
// clicked again afterwards to restore the setting. Both clicks are real UI
// events, and the whole sequence is one JS task, so no tick lands between the
// baseline and the command.
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
    flush.click(); // setSettings -> persist: live sim, no sim mutation
    const live = action(); // re-query: the settings notify may have re-rendered the face
    if (!live) return { ok: false, reason: "action face vanished after the baseline flush: " + prefix };
    const label = (live.getAttribute("aria-label") ?? live.textContent ?? "").trim();
    const before = readSim();
    live.click(); // dispatch -> applyCommand -> persist
    const after = readSim();
    const restore = sound();
    if (restore) restore.click();
    return { ok: true, label, before, after, baselineLagTicks: before.tick - stale.tick };
  }, labelPrefix);
}

async function openContextTab(p, label) {
  await p.evaluate((l) => {
    const btn = [...document.querySelectorAll(".inspector-context__btn")].find((b) => b.textContent.trim() === l);
    if (btn) btn.click();
  }, label);
  await p.waitForTimeout(300);
}

// Scroll the ACTIONS into view, not the absolute body bottom. At 200% text the
// two consequence notes below the faces are taller than the sheet's visible
// body window, so `scrollTop = scrollHeight` parks the faces entirely above the
// clip (painted height 0) even though they are one flick away. `nearest` is the
// smallest scroll that makes the whole action row visible — exactly what a
// player does to reach the buttons — and leaves the notes partially painted
// below, which the frame audit records as-is.
async function scrollActionsIntoView(p) {
  await p.evaluate(() => {
    const a = document.querySelector(".panel.panel--stack .panel__actions");
    if (a) a.scrollIntoView({ block: "nearest" });
  });
  await p.waitForTimeout(250);
}

const captures = [];
const failures = [];
const actionChecks = [];
let frameNo = 0;

// Every action-level assertion is recorded with its numbers, pass or fail, so
// the receipt is auditable on its own — not just a failure list.
function check(name, ok, detail) {
  actionChecks.push({ check: name, ok: !!ok, detail: detail ?? "" });
  if (!ok) failures.push(`${name}: ${detail}`);
  return ok;
}

// Frame audit: base shell checks + every claimed inspector state, recorded.
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
    if (p.mode === "rail") {
      const lead = p.boxes.lead; const top = parseFloat(p.markers.shellInspectorTop);
      ok("marker.shell-inspector-top", Number.isFinite(top) && lead && top >= lead.bottom + 5, `top=${p.markers.shellInspectorTop} lead=${JSON.stringify(lead)}`);
    }
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
      for (const r of expect.rowMatches ?? []) ok(`row/${r.label}/`, new RegExp(r.pattern).test(pn.rowMap[r.label] ?? ""), `got "${pn.rowMap[r.label]}" want /${r.pattern}/`);
      for (const t of expect.noteContains ?? []) ok(`note~${t.slice(0, 24)}`, pn.notes.some((n) => n.includes(t)), JSON.stringify(pn.notes));
      if (expect.noteCount != null) ok("noteCount", pn.notes.length === expect.noteCount, `notes=${pn.notes.length} ${JSON.stringify(pn.notes)}`);
      if (expect.firstAction) ok("firstAction", (pn.faces[0] ?? "").startsWith(expect.firstAction), JSON.stringify(pn.faces));
      if (expect.actionCount != null) ok("actionCount", pn.faces.length === expect.actionCount, JSON.stringify(pn.faces));
      if (expect.actionCountMin != null) ok("actionCountMin", pn.faces.length >= expect.actionCountMin, JSON.stringify(pn.faces));
      if (expect.actionGrammar) ok("actionGrammar", pn.faces.length > 0 && pn.faces.every((f) => ACTION_GRAMMAR.test(f)), JSON.stringify(pn.faces));
      if (expect.accentOne) ok("accentOne", pn.accentCount === 1, `accent=${pn.accentCount}`);
      if (expect.primaryConsistent) ok("primaryConsistent", pn.faces.length > 0 && pn.primaryNote.startsWith(`${pn.faces[0].split(" ")[0]} is the primary action`), `first=${pn.faces[0]} note=${pn.primaryNote.slice(0, 90)}`);
      if (expect.primaryContains) ok("primaryNote", pn.primaryNote.includes(expect.primaryContains), pn.primaryNote.slice(0, 120));
      if (expect.secondary) ok("secondaryNote", pn.secondaryNote.includes("Move and Dismantle are secondary"), pn.secondaryNote.slice(0, 120));
      if (expect.progressNumeric) { const n = Number(pn.progressNow); ok("progressNumeric", Number.isFinite(n) && n >= 0 && n <= 100, `now=${pn.progressNow}`); }
      if (expect.paneTab) {
        const tab = pn.tabs.find((t) => t.label === expect.paneTab);
        ok("paneTabPressed", !!tab && tab.pressed, JSON.stringify(pn.tabs));
      }
      for (const r of expect.paneRowContains ?? []) ok(`paneRow~${r.label}`, pn.paneRows.some((pr) => pr.label === r.label && pr.value.includes(r.text)), JSON.stringify(pn.paneRows));
      if (expect.contextFloors) ok("contextFloors", pn.tabs.length === 3 && pn.tabs.every((t) => t.minH >= 44), JSON.stringify(pn.tabs));
      if (expect.longContent) ok("longContent", p.bodyScroll && p.bodyScroll.sh > p.bodyScroll.ch + 8, JSON.stringify(p.bodyScroll));
      if (expect.bodyScroller) ok("bodyScroller", p.bodyScroll && /(auto|scroll)/.test(p.bodyScroll.overflow), JSON.stringify(p.bodyScroll));
      if (expect.actionsReachable) {
        const acts = p.buttons.filter((b) => b.inPanelActions);
        ok("actionsReachable", acts.length >= 3 && acts.every((b) => b.visible && b.minH >= 44), JSON.stringify(acts));
      }
    }
  }
  if (expect.floors) {
    const bad = p.buttons.filter((b) => b.visible && b.minH < 44);
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
  // ---- A: desktop 1280x800 fresh boot (shell/camera/HUD markers, console) ----
  {
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 });
    await settle(p, false);
    await shot("A", "yard-fresh", p, "a1-desk-yard-fresh.png", { mode: "rail", markers: true, floors: true, reach: true, panelNull: true });
    sequences.push({ id: "A", viewport: "1280x800", seed: "fresh", ...seqConsole("A", errors) });
    await ctx.close();
  }

  // ---- B: phone 390x844 fresh boot ----
  {
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 });
    await settle(p, false);
    await shot("B", "yard-fresh", p, "b1-phone-yard-fresh.png", { mode: "phone", markers: true, floors: true, reach: true, panelNull: true });
    sequences.push({ id: "B", viewport: "390x844", seed: "fresh", ...seqConsole("B", errors) });
    await ctx.close();
  }

  // ---- C: desktop seeded — full inspector + real Upgrade/Move/Dismantle ----
  {
    const seed = seedWith((s, _st, pay) => { pay.lastSeenMs = Date.now(); s.credits = 1000; });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("C.tap", tap.machine && tap.machine.blueprint === "sorter" && !!tap.probe.panel, JSON.stringify(tap.machine));
    const m1before = tap.probe.sim.machines.find((m) => m.id === 1);
    const rev0 = tap.probe.sim.revision;
    await shot("C", "inspector-rest", p, "c1-desk-inspector.png", {
      mode: "rail", markers: true, panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Status", value: "Working" }, { label: "Level", value: "14" }, { label: "Cell", value: "0" }],
      rowContains: [
        { label: "Actual rate", text: "batches/s" }, { label: "Actual rate", text: "s window" },
        { label: "Max rate", text: "batches/s at full power" }, { label: "Batch", text: "%" },
      ],
      rowMatches: [{ label: "Links", pattern: "ticks|tiles" }],
      firstAction: "Upgrade", actionCount: 3, accentOne: true, actionGrammar: true,
      primaryContains: "Upgrade is the primary action", secondary: true,
      noteCount: 0, progressNumeric: true,
    });

    // Recovery context panes: no dispatch, no selection loss.
    await openContextTab(p, "Storage");
    const stPr = await shot("C", "pane-storage", p, "c2-desk-pane-storage.png", {
      panel: true, title: "Scrap sorter", paneTab: "Storage", contextFloors: true,
      paneRowContains: [
        { label: "Store capacity", text: "/900" },
        { label: "Scrap", text: "" },
        { label: "Reserve", text: "kept per material" },
      ],
    });
    check("C.storage.noDispatch", stPr.sim.revision === rev0, `revision ${rev0} -> ${stPr.sim.revision}`);
    await openContextTab(p, "Routes");
    const rtPr = await shot("C", "pane-routes", p, "c3-desk-pane-routes.png", {
      panel: true, title: "Scrap sorter", paneTab: "Routes",
      paneRowContains: [
        { label: "dock → scrap sorter", text: "carries Scrap" },
        { label: "scrap sorter → furnace", text: "busy" },
      ],
    });
    check("C.routes.noDispatch", rtPr.sim.revision === rev0, `revision ${rev0} -> ${rtPr.sim.revision}`);
    check("C.routes.count", rtPr.panel.paneRows.filter((r) => r.label.includes("→")).length === 4, JSON.stringify(rtPr.panel.paneRows));
    await openContextTab(p, "Power");
    const cPower = powerFrame(await probe(p));
    const pwPr = await shot("C", "pane-power", p, "c4-desk-pane-power.png", {
      panel: true, title: "Scrap sorter", paneTab: "Power",
      paneRowContains: [
        { label: "Yard demand", text: `${cPower.demand}/8` },
        { label: "This machine", text: "1 unit" },
        { label: "Shared speed", text: `${cPower.percent}%` },
      ],
    });
    check("C.power.noDispatch", pwPr.sim.revision === rev0, `revision ${rev0} -> ${pwPr.sim.revision}`);
    await openContextTab(p, "Power"); // toggle closed

    // Upgrade: real click -> command -> persisted state, printed cost exact.
    const up = await clickActionSync(p, "Upgrade");
    check("C.upgrade.clicked", up.ok, up.reason ?? "");
    const upCost = Number((up.label.match(/Upgrade · (\d+) credits/) ?? [])[1]);
    check("C.upgrade.cost", upCost === engineUpgradeCost(30, 14), `printed=${upCost} engine=${engineUpgradeCost(30, 14)}`);
    check("C.upgrade.credits", up.after.credits === up.before.credits - upCost, `${up.before.credits} -> ${up.after.credits} cost=${upCost}`);
    const upM = up.after.machines.find((m) => m.id === 1);
    check("C.upgrade.level", upM.level === 15, `level=${upM.level}`);
    check("C.upgrade.faster", upM.batchMilli < m1before.batchMilli, `${m1before.batchMilli} -> ${upM.batchMilli}`);
    await p.waitForTimeout(400);
    await shot("C", "after-upgrade", p, "c5-desk-after-upgrade.png", {
      panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Level", value: "15" }],
      firstAction: "Upgrade", actionCount: 3,
      rowContains: [{ label: "Next upgrade", text: "credits" }],
    });

    // Move: real click -> tile change, routes/identity preserved.
    const mv = await clickActionSync(p, "Move");
    check("C.move.clicked", mv.ok, mv.reason ?? "");
    const mvTile = Number((mv.label.match(/Move · cell (\d+)/) ?? [])[1]);
    const mvCharge = Number((mv.label.match(/(\d+) units$/) ?? [])[1]);
    const mvM = mv.after.machines.find((m) => m.id === 1);
    check("C.move.tile", mvM.tile === mvTile && mvTile !== 0, `tile=${mvM.tile} printed=${mvTile}`);
    check("C.move.charge", mv.before.storeUnits - mv.after.storeUnits === mvCharge, `${mv.before.storeUnits} -> ${mv.after.storeUnits} charge=${mvCharge} baselineLagTicks=${mv.baselineLagTicks}`);
    check("C.move.identity", mvM.level === 15 && mvM.blueprint === "sorter", JSON.stringify(mvM));
    check("C.move.routes", JSON.stringify(mv.after.routes.map((r) => r.id)) === JSON.stringify(mv.before.routes.map((r) => r.id)), "route ids changed");
    await p.waitForTimeout(400);
    await shot("C", "after-move", p, "c6-desk-after-move.png", {
      panel: true, title: "Scrap sorter",
      rowEquals: [{ label: "Cell", value: String(mvTile) }],
      firstAction: "Upgrade", actionCount: 3,
    });

    // Dismantle: real click -> refund, machine gone, panel unmounts.
    const dm = await clickActionSync(p, "Dismantle");
    check("C.dismantle.clicked", dm.ok, dm.reason ?? "");
    const dmRefund = Number((dm.label.match(/Dismantle · \+(\d+) units/) ?? [])[1]);
    const dmM = dm.before.machines.find((m) => m.id === 1);
    // clickActionSync reads the raw save sim, where the batch is an ItemStack[] (not the projected batchUnits).
    const dmBatch = (dmM?.batch ?? []).reduce((t, b) => t + b.qty, 0);
    check("C.dismantle.refund", dm.after.storeUnits - dm.before.storeUnits === dmRefund, `${dm.before.storeUnits} -> ${dm.after.storeUnits} refund=${dmRefund} tray=${dmM?.trayUnits} buf=${dmM?.inBufUnits} batch=${dmBatch} baselineLagTicks=${dm.baselineLagTicks}`);
    check("C.dismantle.gone", dm.after.machines.length === dm.before.machines.length - 1 && !dm.after.machines.some((m) => m.id === 1), `machines=${dm.after.machines.length}`);
    await p.waitForTimeout(400);
    await shot("C", "after-dismantle", p, "c7-desk-after-dismantle.png", { mode: "rail", markers: true, panelNull: true });
    sequences.push({ id: "C", viewport: "1280x800", seed: "yard-mature + lastSeenMs=now + credits=1000", actions: ["Upgrade", "Move", "Dismantle"], tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("C", errors) });
    await ctx.close();
  }

  // ---- D: starved furnace — missing-input bottleneck explanation ----
  {
    const seed = seedWith((s, _st, pay) => {
      pay.lastSeenMs = Date.now();
      s.routes = s.routes.filter((r) => r.id !== 4);
      s.machines.find((m) => m.id === 2).inRoutes = [];
      s.machines.find((m) => m.id === 1).outRoute = null;
    });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 1);
    check("D.tap", tap.machine && tap.machine.blueprint === "furnace", JSON.stringify(tap.machine));
    await shot("D", "starved", p, "d1-desk-starved.png", {
      panel: true, title: "Furnace", sections: true,
      rowEquals: [{ label: "Status", value: "Needs input" }, { label: "Needs", value: "2 Ferrous" }],
      noteContains: ["Missing input: the buffer is short", "2 ferrous"],
      noteCount: 1, actionGrammar: true, primaryConsistent: true, actionCountMin: 3,
    });
    sequences.push({ id: "D", viewport: "1280x800", seed: "yard-mature + route 4 removed (furnace stays starved)", tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("D", errors) });
    await ctx.close();
  }

  // ---- E: power-limited yard — capped rate row + explanation + Power pane ----
  {
    const seed = seedWith((s, _st, pay) => {
      pay.lastSeenMs = Date.now();
      for (const m of s.machines) m.batchPower = 0;
      const m1 = s.machines.find((m) => m.id === 1);
      m1.batchPower = 9;
      m1.batchMilli = 1000000000; // batch never completes: draw pinned at 9
    });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("E.tap", tap.machine && tap.machine.id === 1, JSON.stringify(tap.machine));
    const ePower = powerFrame(await probe(p));
    check("E.powerLimited", ePower.demand > 8 && ePower.percent < 100, JSON.stringify(ePower));
    await shot("E", "power-limited", p, "e1-desk-power-limited.png", {
      panel: true, title: "Scrap sorter", sections: true,
      rowContains: [
        { label: "Rate at current power", text: "batches/s" },
        { label: "Power", text: `Power limited: ${ePower.percent}% speed` },
      ],
      noteContains: ["Power limited: the yard requests", `${ePower.demand}/8`, `${ePower.percent}%`],
      noteCount: 1,
    });
    await openContextTab(p, "Power");
    const ePanePower = powerFrame(await probe(p));
    await shot("E", "power-pane", p, "e2-desk-power-pane.png", {
      panel: true, title: "Scrap sorter", paneTab: "Power",
      paneRowContains: [
        { label: "Yard demand", text: `${ePanePower.demand}/8` },
        { label: "This machine", text: "9 units" },
        { label: "Shared speed", text: `${ePanePower.percent}%` },
      ],
    });
    sequences.push({ id: "E", viewport: "1280x800", seed: "yard-mature + M1 draw pinned 9 (> capacity 8)", power: ePower, tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("E", errors) });
    await ctx.close();
  }

  // ---- F: full output — tray-full explanation ----
  {
    const seed = seedWith((s, _st, pay) => {
      pay.lastSeenMs = Date.now();
      const m1 = s.machines.find((m) => m.id === 1);
      m1.tray = [{ resource: "ferrous", qty: 6 }, { resource: "nonferrous", qty: 6 }];
      m1.trayUnits = 12;
      m1.outRoute = null;
      s.routes = s.routes.filter((r) => ![2, 3, 4].includes(r.id));
      for (const m of s.machines) m.inRoutes = m.inRoutes.filter((id) => ![2, 3, 4].includes(id));
    });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("F.tap", tap.machine && tap.machine.id === 1, JSON.stringify(tap.machine));
    await shot("F", "full-output", p, "f1-desk-full-output.png", {
      panel: true, title: "Scrap sorter", sections: true,
      rowEquals: [{ label: "Status", value: "Cargo full" }, { label: "Tray", value: "12/12" }],
      noteContains: ["Output full: the tray holds", "12/12"],
      noteCount: 2,
    });
    sequences.push({ id: "F", viewport: "1280x800", seed: "yard-mature + tray 12/12 + output routes removed", tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("F", errors) });
    await ctx.close();
  }

  // ---- G: busy output link — transport constraint explanation ----
  {
    const seed = seedWith((s, _st, pay) => {
      pay.lastSeenMs = Date.now();
      const r4 = s.routes.find((r) => r.id === 4);
      r4.busyTicks = 9000; r4.ageTicks = 10000;
    });
    const { ctx, p, errors } = await make(browser, { w: 1280, h: 800 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("G.tap", tap.machine && tap.machine.id === 1, JSON.stringify(tap.machine));
    await shot("G", "busy-link", p, "g1-desk-busy-link.png", {
      panel: true, title: "Scrap sorter", sections: true,
      noteContains: ["Transport limit: the output link is", "90% busy"],
      noteCount: 1,
      rowMatches: [{ label: "Links", pattern: "ticks|tiles" }],
    });
    sequences.push({ id: "G", viewport: "1280x800", seed: "yard-mature + route 4 90% busy", tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("G", errors) });
    await ctx.close();
  }

  // ---- H: phone sheet — long content, scroll-to-actions, pane in sheet ----
  {
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 }, baseSeed());
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("H.tap", !!tap.probe.panel, `no panel after tap at ${tap.sx},${tap.sy} tile ${tap.tile}`);
    if (tap.probe.panel) {
      const title = tap.probe.panel.title;
      await shot("H", "sheet-rest", p, "h1-phone-sheet.png", {
        mode: "phone", markers: true, panel: true, title, sections: true,
        longContent: true, bodyScroller: true, contextFloors: true, floors: true,
      });
      await scrollActionsIntoView(p);
      await shot("H", "sheet-actions", p, "h2-phone-sheet-actions.png", {
        panel: true, title, actionsReachable: true, floors: true,
        actionGrammar: true, primaryConsistent: true, actionCountMin: 3, secondary: true,
      });
      await openContextTab(p, "Storage");
      await scrollActionsIntoView(p);
      await shot("H", "sheet-pane", p, "h3-phone-sheet-pane.png", {
        panel: true, title, paneTab: "Storage", actionsReachable: true,
        paneRowContains: [{ label: "Store capacity", text: "/900" }],
      });
    }
    sequences.push({ id: "H", viewport: "390x844", seed: "yard-mature + lastSeenMs=now", tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("H", errors) });
    await ctx.close();
  }

  // ---- I: phone 200% text — floors, reach, no body scroll ----
  {
    const seed = seedWith((_s, st, pay) => { pay.lastSeenMs = Date.now(); st.textScale = 2; });
    const { ctx, p, errors } = await make(browser, { w: 390, h: 844, mobile: true, dpr: 2 }, seed);
    await settle(p, true);
    const tap = await tapMachine(p, 0);
    check("I.tap", !!tap.probe.panel, `no panel after tap at ${tap.sx},${tap.sy} tile ${tap.tile}`);
    if (tap.probe.panel) {
      const title = tap.probe.panel.title;
      await shot("I", "ts2-rest", p, "i1-phone-ts2.png", {
        mode: "phone", markers: true, panel: true, title, sections: true,
        floors: true, reach: true, longContent: true, bodyScroller: true, contextFloors: true,
      });
      await scrollActionsIntoView(p);
      await shot("I", "ts2-actions", p, "i2-phone-ts2-actions.png", {
        panel: true, title, actionsReachable: true, floors: true, reach: true,
      });
    }
    sequences.push({ id: "I", viewport: "390x844 @200% text", seed: "yard-mature + textScale=2", tapped: { tile: tap.tile, sx: tap.sx, sy: tap.sy }, ...seqConsole("I", errors) });
    await ctx.close();
  }
} catch (err) {
  failures.push(`probe crashed: ${err && err.stack ? err.stack : String(err)}`);
} finally {
  await browser.close();
}

const passed = captures.filter((c) => c.passed).length;
const receipt = {
  task: "UI-RESET-54 machine inspector",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/54",
  headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
  headShaNote: "code commit under test; the evidence-only commit containing this receipt follows it as PR head",
  tool: "playwright-core headless Chrome, DOM/geometry/console assertions only (no vision)",
  seed: "docs/evidence/yard-mature.json",
  mutations: MUTATIONS,
  frameAudit: "every capture frame runs probe()+audit() before screenshot; checks recorded per frame; any failed check fails the run; every action-level assertion (tap identity, costs, charges, refunds, no-dispatch panes, console) is recorded with its numbers in actionChecks, pass or fail",
  actionProof: "clickActionSync clicks the real .panel__actions button and reads localStorage in the same JS task (dispatch->applyCommand->persist synchronous; zero engine ticks between click and read). The pre-click baseline is flushed through the real HudTop sound toggle first: setSettings persists the LIVE sim synchronously with zero sim effect and is restored after the read, so the ~1s interval checkpoint cannot lag the baseline (baselineLagTicks recorded per action)",
  scrollProof: "phone sheet frames scroll .panel__actions into view with scrollIntoView({block:'nearest'}) — the smallest scroll that paints every face. Absolute body bottom is NOT used: at 200% text the consequence notes below the faces are taller than the body window and would park the faces above the clip",
  resolutions: [
    "C.tap / D.tap / C.move.identity (probe bug): the sim projection read m.type, but the save schema and MachinePanel use m.blueprint; projection and the three checks now read blueprint. No UI change.",
    "C.move.charge (probe bug): the pre-click localStorage baseline was the ~1s interval checkpoint, stale against live engine storeUnits drift (belt loading / drone arrivals / overflow drain). clickActionSync now flushes the live sim via the real HudTop sound toggle (setSettings -> synchronous persist, zero sim effect, restored) inside the same JS task. No UI change.",
    "C.dismantle.refund (REAL UI DEFECT, fixed): dismantleMachine also returns the in-progress machine.batch to the store (commands.ts), but the printed refund omitted it. Live-confirmed with the exact baseline: printed 28 vs engine delta 30, machine.batch=[scrap x2]. MachinePanel.tsx refundUnits now adds batch units; inspector-54.test.tsx gained a batch-holding regression case. Read-only fixtures are batch-free and unchanged (i18n '+23 units' = 18 build + 1 buffer + 2x2 links; belt-extent refundOf(20)+6; panel-rows grammar only) — verified by replicating the i18n fixture: batch=[], printed 23 = engine delta 23.",
    "I/ts2-actions (probe bug): scrollBodyBottom set scrollTop=scrollHeight; at 200% text the two consequence notes (~399px) exceed the 271px body window, parking all three faces fully above the clip (painted h=0). Live geometry verified the faces are reachable by ordinary scrolling: scrollIntoView({block:'nearest'}) paints all three at 44px. The probe now scrolls the actions into view. No UI change.",
  ],
  viewports: ["1280x800 desktop rail", "390x844 phone sheet", "390x844 phone @200% text"],
  sequences,
  summary: { frames: captures.length, passed, failed: captures.length - passed, checkFailures: failures.length, actionChecks: actionChecks.length, actionChecksPassed: actionChecks.filter((c) => c.ok).length },
  failures,
  actionChecks,
  captures,
};
fs.writeFileSync(path.join(out, "receipt-inspector-54.json"), JSON.stringify(receipt, null, 2));
console.log(`\nframes=${captures.length} passed=${passed} failures=${failures.length}`);
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
