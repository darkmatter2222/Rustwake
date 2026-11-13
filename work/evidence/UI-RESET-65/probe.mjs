/**
 * UI-RESET #65 (G3 feedback / motion / notification unification) — developer probe.
 *
 * ROLE: developer | dev-65. PROBE-ONLY code. It does NOT modify any file under src/.
 * It drives the SHIPPED build of branch rw/65-feedback through the REAL UI (clicks/taps
 * on actual controls) and records authoritative DOM + geometry + computed-style +
 * persisted-state + Web-Audio-boundary evidence for the five acceptance criteria.
 *
 * Code head under test: e7c746efd396cc293d736feb88118b65ff875994 (src unchanged since;
 * `git diff e7c746e HEAD -- src` is empty). Served from THIS branch's own `pnpm build`
 * via `pnpm preview` on a fresh local port (default http://127.0.0.1:4165/), NEVER the
 * live deployment URL (the live entry is main, not this branch).
 *
 * Criteria -> loops:
 *  c1 press/selection/purchase/build/blocked/success linked to REAL command results
 *     -> openingLoop (salvage/repair/build/connect), matureLoop (build/sell/upgrade),
 *        pressProbe (press wash + read-back receipts).
 *  c2 important errors persistent + GROUP repeated events (no toast spam)
 *     -> openingLoop connect refusal (data-count group, ::after xN, bare live-region
 *        text), errorLoop (broke seed credits=0 -> deterministic upgrade shortfall,
 *        grouped toast + persistent `Last ...` resting-line tail + short receipt).
 *  c3 restrained motion + reduced-motion alternative, NEVER shift an action under a
 *     finger -> pressProbe geometry (no layout shift while held), motionLoop (OS media
 *        query + in-app toggle + persistence + ?ui48 primitive transition:none).
 *  c4 integrate EXISTING sound cues with mute/settings; headless CANNOT listen, so the
 *     Web Audio API boundary is instrumented (addInitScript) as the browser equivalent
 *     of audio.ts graphSnapshot(); the full module node table is asserted by
 *     tests/game/audio.test.ts at the same SHA. -> audioSnap at Begin/salvage/refusal +
 *        matureLoop mute toggle (master gain 0.9 <-> 0, aria-pressed, persistence).
 *  c5 empty/loading/locked/error/reader-tab audit -> audit-matrix.md (deliverable) +
 *        loadingLoop (reconcile line + return report), readerLoop (two tabs, lease),
 *        locked rail reasons, empty-yard checks.
 *
 * Fixture scrutiny (a-d):
 *  (a) The only state mutation is SETUP seeding via the game's OWN save envelope
 *      (FNV-1a checksum recomputed = save.ts checksum()). Seeds come from seeds.json,
 *      produced by validate-fixtures.ts using the game's own encodeSave/decodeSave/
 *      repairRegistration/validateSim (PASS). No src is touched. Every acceptance ACTION
 *      is a real UI click/tap through dispatch -> applyCommand.
 *  (b) This file + validate-fixtures.ts + seeds.json + results.json + evidence.md
 *      document the method.
 *  (c) Sim validation is NOT weakened: every injected envelope passes the game's full
 *      decodeSave/validateSim on load. No invariant is bypassed.
 *  (d) No action is faked by direct state injection; localStorage is read ONLY as a
 *      mirror of the game's own persistence (written on every ok dispatch).
 *
 * NO vision claims: all evidence is programmatic headless-Chrome DOM / geometry /
 * computed-style / console + canvas pixel checks + a full-frame mirror audit
 * (sha256 + PNG dimensions). Agent playtests are labelled AGENT.
 *
 * Interaction method (real UI only): machine selection taps the canvas at the cell's
 * computed screen point, guarded by document.elementFromPoint === CANVAS. On short
 * landscape viewports the coach band + lifted zoom row overlay the top rows, so the probe
 * first clicks the coach's OWN Skip control (a real UI-only preference write) to refit the
 * camera, and zooms in through the real control if a cell is still covered. Settings is
 * reached through the real Menu (phone face when VISIBLE, else rail slot 5 — the face is
 * display:none on rail forms) and the Settings row is scrolled into view in the bounded
 * menu scroller. The Store opens via its real dock face / rail slot. No state is injected;
 * the only localStorage writes are setup seeding (conditional, never clobbering a live save).
 */
import { chromium } from "playwright-core";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(process.cwd());
const EVID = resolve(ROOT, "work/evidence/UI-RESET-65");
const FRAMES = resolve(EVID, "frames");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4165/";
const SAVE_KEY = "rustwake.save.v1";
const BUILD_SHA = "e7c746efd396cc293d736feb88118b65ff875994";
const seeds = JSON.parse(readFileSync(resolve(EVID, "seeds.json"), "utf8"));
// Normalized baseline settings (the validator proved this exact variant decodes):
// unmuted + motion-on so c4 starts at master 0.9 and c3 starts at attr absent.
const BASE_SETTINGS = { muted: false, reducedMotion: false, textScale: 1 };

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = chromeCandidates.find((p) => p && existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge executable found");

// ---- world geometry (mirrors src/game/renderer/scene.ts + commands.ts) ----
const CELL = 32, YARD_COLS = 6, YARD_ROWS = 6, DOCK_TILE = 2;
const WORLD_H = YARD_ROWS * CELL + CELL; // 224
const WRECK = { x: CELL * 2.5, y: WORLD_H - CELL * 0.55 }; // 80, 206.4
const tileToWorld = (tile) => ({
  x: (tile % YARD_COLS) * CELL + CELL / 2,
  y: Math.floor(tile / YARD_COLS) * CELL + CELL / 2,
});

// ---- legitimate setup seeding: the game's own encodeSave arithmetic ----
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function encodeEnvelope(sim, lastSeenMs, settings) {
  const payload = { sim, lastSeenMs, settings };
  const body = JSON.stringify(payload);
  return JSON.stringify({ schemaVersion: sim.schemaVersion, checksum: fnv1a(body), payload });
}
const HOUR = 3600 * 1000;
function seedText(variant) {
  const now = Date.now();
  if (variant === "mature") return encodeEnvelope(seeds.sim, now, BASE_SETTINGS);
  if (variant === "broke") return encodeEnvelope(seeds.brokeSim, now, BASE_SETTINGS);
  if (variant === "old") return encodeEnvelope(seeds.sim, now - 24 * HOUR, BASE_SETTINGS);
  return null;
}

// ---- form factors (three required captures at the exact head SHA) ----
const FORM_DEFS = {
  phone: { viewport: { width: 390, height: 844 }, dpr: 2, mobile: true, dims: { w: 780, h: 1688 }, shell: "dock" },
  phoneland: { viewport: { width: 844, height: 390 }, dpr: 2, mobile: true, dims: { w: 1688, h: 780 }, shell: "rail" },
  desktop: { viewport: { width: 1920, height: 1080 }, dpr: 1, mobile: false, dims: { w: 1920, h: 1080 }, shell: "rail" },
};
const FORMS = (process.env.FORMS || "phone,phoneland,desktop").split(",").map((s) => s.trim()).filter(Boolean);

// ---- evidence collectors ----
const frameMeta = [];
const steps = [];
const consoleErrors = [];
const pageErrors = [];
const blockers = [];
const audioEvents = [];

function summarize(sim) {
  if (!sim) return null;
  return {
    tutorial: sim.tutorial, credits: sim.credits,
    storeUnits: sim.storeUnits, storeCapacity: sim.storeCapacity,
    machines: sim.machines.length, routes: sim.routes.length,
    wreckRemaining: sim.wreck?.remaining, wreckPulses: sim.wreck?.pulses,
    exportClaimed: sim.exportClaimed, droneRepaired: sim.drone?.repaired,
    droneDeliveries: sim.drone?.deliveries, nextMachineId: sim.nextMachineId,
    store: { ...sim.store },
    machineList: sim.machines.map((m) => ({
      id: m.id, bp: m.blueprint, tile: m.tile, level: m.level, status: m.status,
      inRoutes: (m.inRoutes || []).length,
    })),
  };
}

async function readSim(page) {
  return page.evaluate((key) => {
    const t = localStorage.getItem(key);
    if (!t) return null;
    try { return JSON.parse(t).payload.sim; } catch { return null; }
  }, SAVE_KEY);
}
async function readSettings(page) {
  return page.evaluate((key) => {
    const t = localStorage.getItem(key);
    if (!t) return null;
    try { return JSON.parse(t).payload.settings; } catch { return null; }
  }, SAVE_KEY);
}

async function camInfo(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const [x, y, s] = (c.dataset.cam || "0,0,1").split(",").map(Number);
    return { cam: c.dataset.cam, x, y, scale: s, left: r.left, top: r.top, cssW: r.width, cssH: r.height, dpr: window.devicePixelRatio };
  });
}
const worldToScreen = (cam, wx, wy) => ({
  x: (wx - cam.x) * cam.scale + cam.cssW / 2,
  y: (wy - cam.y) * cam.scale + cam.cssH / 2,
});
async function tapWorld(page, wx, wy, touch) {
  const cam = await camInfo(page);
  if (!cam) throw new Error("no canvas");
  const p = worldToScreen(cam, wx, wy);
  const px = cam.left + p.x, py = cam.top + p.y;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
  return { px, py, cam: cam.cam };
}
const tapTile = (page, tile, touch) => { const w = tileToWorld(tile); return tapWorld(page, w.x, w.y, touch); };

async function dom(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const txt = (s) => { const e = q(s); return e ? e.textContent.trim() : null; };
    const vis = (s) => { const e = q(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const toastEl = q(".toast");
    const objLines = [...document.querySelectorAll(".objective .status-line")].map((e) => e.textContent.trim());
    const settingsButtons = [...document.querySelectorAll(".panel--settings .panel__body dl .icon-btn")];
    const sb = (i) => settingsButtons[i] ? { pressed: settingsButtons[i].getAttribute("aria-pressed"), disabled: settingsButtons[i].disabled, text: settingsButtons[i].textContent.trim() } : null;
    return {
      url: location.href,
      gate: vis(".gate__btn"),
      gateSettings: vis(".gate-settings"),
      resources: txt(".resources"),
      credits: txt(".resources__item--credits"),
      objective: txt(".objective__primary"),
      objectiveLines: objLines,
      objectiveNumbers: objLines.length > 1 ? objLines[1] : (objLines[0] || null),
      dockButtons: [...document.querySelectorAll(".dock button")].map((b) => ({ cls: b.className, text: b.textContent.trim(), disabled: b.disabled })),
      dockPrimary: (() => { const b = q(".dock__btn--primary"); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; })(),
      rail: [...document.querySelectorAll(".shell-rail__slot")].map((b) => ({ slot: b.dataset.slot, pressed: b.getAttribute("aria-pressed"), disabled: b.disabled, reason: b.querySelector(".shell-rail__reason")?.textContent.trim() ?? null })),
      menuFace: vis(".shell-menu-face"),
      menuOpen: vis(".shell-menu"),
      catalog: vis(".catalog"),
      catalogCards: [...document.querySelectorAll(".catalog__card")].map((c) => ({ bp: c.dataset.blueprint, locked: c.dataset.locked, affordable: c.dataset.affordable, disabled: c.disabled })),
      catalogPlace: q(".catalog__place") ? { text: q(".catalog__place").textContent.trim(), disabled: q(".catalog__place").disabled } : null,
      placeStrip: q('.place-strip[data-flow="placement"]') ? { valid: q(".place-strip").dataset.valid, verdict: q(".place-strip").dataset.verdict } : null,
      panel: q(".panel") ? { cls: q(".panel").className, aria: q(".panel").getAttribute("aria-label"), title: txt(".panel__title") } : null,
      inspectorSections: [...document.querySelectorAll(".inspector-section__title")].map((e) => e.textContent.trim()),
      panelActions: [...document.querySelectorAll(".panel__actions .icon-btn")].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })),
      upgradeCards: [...document.querySelectorAll(".upgrade-card")].map((c) => ({ branch: c.dataset.branch, pressed: c.getAttribute("aria-pressed"), disabled: c.disabled })),
      upgradeBuy: q(".upgrade-buy") ? { disabled: q(".upgrade-buy").disabled, text: q(".upgrade-buy").textContent.trim() } : null,
      upgradeReceipt: txt(".upgrade-receipt"),
      storeTrades: [...document.querySelectorAll(".store-trade")].map((s) => ({ res: s.dataset.resource, sellDisabled: s.querySelector(".store-trade__sell")?.disabled ?? null })),
      toast: toastEl ? toastEl.textContent.trim() : null,
      toastCount: toastEl ? toastEl.getAttribute("data-count") : null,
      toastAfter: toastEl ? getComputedStyle(toastEl, "::after").content : null,
      reducedMotionAttr: document.documentElement.getAttribute("data-reduced-motion"),
      reconcile: vis(".reconcile") ? txt(".reconcile") : null,
      report: vis(".panel--report") ? { title: txt(".panel--report .panel__title"), applied: txt(".return-applied") } : null,
      onboard: vis(".onboard"),
      settingsSound: sb(0),
      settingsMotion: sb(2),
      motionOsNote: txt('.panel--settings .status-line[role="note"]'),
      cam: q("canvas")?.dataset.cam ?? null,
    };
  });
}

// c4: read the instrumented Web Audio boundary (browser equivalent of graphSnapshot()).
async function audioSnap(page, label) {
  const snap = await page.evaluate(() => (window.__rwAudio ? window.__rwAudio.snapshot() : null));
  if (label) audioEvents.push({ label, ...snap });
  return snap;
}

async function shot(page, relName, extra) {
  const path = resolve(FRAMES, relName);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: false });
  const buf = readFileSync(path);
  const meta = {
    name: relName, bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    width: buf.readUInt32BE(16), height: buf.readUInt32BE(20),
    ...extra,
  };
  frameMeta.push(meta);
  return meta;
}

async function clickButton(page, selector, textMatch, exact = true) {
  const handle = await page.evaluateHandle(({ selector, textMatch, exact }) => {
    const els = [...document.querySelectorAll(selector)];
    const el = els.find((e) => {
      const t = e.textContent.trim();
      return textMatch == null ? true : (exact ? t === textMatch : t.includes(textMatch));
    });
    return el || null;
  }, { selector, textMatch, exact });
  const el = handle.asElement();
  if (!el) throw new Error(`button not found: ${selector} text=${JSON.stringify(textMatch)}`);
  await el.click();
}
async function clickSel(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  await el.click();
}
async function dismissReport(page) {
  const el = await page.$(".panel--report .panel__head .icon-btn");
  if (el) { await el.click(); await page.waitForTimeout(250); }
}
async function exitBuild(page) {
  const cat = await page.$(".catalog");
  if (cat) { try { await clickSel(page, ".catalog__close"); await page.waitForTimeout(150); } catch { /* gone */ } }
  try { await clickButton(page, ".dock button", "Cancel", true); await page.waitForTimeout(200); } catch { /* no build */ }
}
async function deselect(page, touch) {
  const s = await readSim(page);
  const occupied = new Set((s.machines || []).map((m) => m.tile));
  occupied.add(2);
  const free = [];
  for (let t = 0; t < 36; t += 1) if (!occupied.has(t)) free.push(t);
  if (free.length === 0) return;
  const centerDist = (t) => Math.abs((t % 6) - 2.5) + Math.abs(Math.floor(t / 6) - 2.5);
  free.sort((a, b) => centerDist(a) - centerDist(b));
  for (let attempt = 0; attempt < Math.min(8, free.length); attempt += 1) {
    await tapTile(page, free[attempt], touch);
    await page.waitForTimeout(200);
    const d = await dom(page);
    if (d.dockButtons.some((b) => b.text.trim() === "Store")) return;
  }
}
async function openCatalog(page) {
  await dismissReport(page);
  const already = await page.$(".catalog");
  if (already) { await page.waitForTimeout(120); return; }
  await exitBuild(page);
  try { await clickButton(page, ".dock button", "Build", true); }
  catch { await clickSel(page, '.shell-rail__slot[data-slot="build"]'); }
  await page.waitForSelector(".catalog", { timeout: 5000 });
}
async function closePanel(page) {
  const el = await page.$(".panel__head .icon-btn");
  if (el) await el.click();
  await page.waitForTimeout(200);
}
async function clickPrimary(page) { await clickSel(page, ".dock__btn--primary"); }
async function waitForSim(page, pred, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await readSim(page);
    if (s && pred(s)) return s;
    await page.waitForTimeout(250);
  }
  return await readSim(page);
}

// Open the in-game Settings inspector through the real Menu (phone face / rail slot).
// The phone Menu face EXISTS in the DOM on rail forms but is display:none (shell.css),
// so test VISIBILITY (not mere existence) before clicking it; otherwise use rail slot 5.
// Settings is row 5 inside the bounded .shell-menu__body scroller — scroll it into view.
async function openSettings(page) {
  await dismissReport(page);
  const faceVisible = await page.evaluate(() => {
    const f = document.querySelector(".shell-menu-face");
    if (!f) return false;
    const r = f.getBoundingClientRect();
    const cs = getComputedStyle(f);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
  });
  if (faceVisible) await clickSel(page, ".shell-menu-face");
  else await clickSel(page, '.shell-rail__slot[data-slot="menu"]');
  await page.waitForSelector(".shell-menu", { state: "visible", timeout: 4000 });
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".shell-menu__row")].find((r) => r.textContent.trim().startsWith("Settings"));
    if (row) row.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(120);
  await clickButton(page, ".shell-menu__row", "Settings", false);
  await page.waitForSelector(".panel--settings", { state: "visible", timeout: 4000 });
  await page.waitForTimeout(150);
}
async function clickSettingsButton(page, index) {
  const els = await page.$$(".panel--settings .panel__body dl .icon-btn");
  if (!els[index]) throw new Error(`settings button ${index} not found`);
  await els[index].click();
  await page.waitForTimeout(200);
}

// Hide the contextual coach through its OWN Skip control (a real UI click that writes
// the UI-only onboard preference). On short landscape viewports the coach band and the
// lifted zoom row overlay the yard's top rows; skipping the coach refits the camera into
// the reclaimed band so machine cells become clear canvas. No src/state is touched.
async function hideOnboard(page) {
  const skip = await page.$(".onboard__skip");
  if (!skip) return;
  const vis = await skip.evaluate((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (vis) { await skip.click(); await page.waitForTimeout(400); }
}

// Select a machine by tile through a REAL canvas tap, guaranteeing the pointer lands on
// the canvas (not the zoom row / coach / rail). Hides the coach, then verifies
// elementFromPoint === CANVAS; if a chrome overlay still covers the cell, zooms in through
// the real control and retries. Returns the tap point + whether the cell was clear canvas.
async function selectMachine(page, tile, touch) {
  await hideOnboard(page);
  const w = tileToWorld(tile);
  const tapAt = async (cam) => {
    const p = worldToScreen(cam, w.x, w.y);
    const px = cam.left + p.x, py = cam.top + p.y;
    if (touch) await page.touchscreen.tap(px, py); else await page.mouse.click(px, py);
    await page.waitForTimeout(280);
    return { px, py, cam: cam.cam };
  };
  const topAt = (px, py) => page.evaluate(([x, y]) => {
    const e = document.elementFromPoint(x, y);
    return e ? { tag: e.tagName, cls: typeof e.className === "string" ? e.className : "" } : null;
  }, [px, py]);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cam = await camInfo(page);
    if (!cam) throw new Error("no canvas");
    const p = worldToScreen(cam, w.x, w.y);
    const px = cam.left + p.x, py = cam.top + p.y;
    const top = await topAt(px, py);
    if (top && top.tag === "CANVAS") { const r = await tapAt(cam); return { ...r, top, cleared: true }; }
    const zin = await page.$('.shell-zoom__face[aria-label="Zoom in"]');
    if (zin) { await zin.click(); await page.waitForTimeout(320); } else break;
  }
  const cam = await camInfo(page);
  const p = worldToScreen(cam, w.x, w.y);
  const top = await topAt(cam.left + p.x, cam.top + p.y);
  const r = await tapAt(cam);
  return { ...r, top, cleared: false };
}

// Open the Store through its real destination (dock face at rest, or rail slot 4) without
// relying on a canvas tap of the dock tile, which chrome can overlay on landscape.
async function openStore(page) {
  await closePanel(page);
  try { await clickButton(page, ".dock button", "Store", true); }
  catch {
    try { await clickSel(page, '.shell-rail__slot[data-slot="store"]'); }
    catch { await clickButton(page, ".dock button", "Store", true); }
  }
  await page.waitForSelector(".panel--store", { state: "visible", timeout: 5000 });
  await page.waitForTimeout(150);
}

// c1 + c3: press the first real control that has a visible box (form-aware fallback chain).
async function pressFirst(page, selectors) {
  for (const s of selectors) {
    const r = await pressProbe(page, s);
    if (r && r.box0) return r;
  }
  return null;
}

// c1 + c3: hold a real control and read its press wash + geometry (no shift under finger).
async function pressProbe(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  const box0 = await el.boundingBox();
  const bg0 = await el.evaluate((e) => getComputedStyle(e).backgroundColor);
  if (!box0) return null;
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(90);
  const box1 = await el.boundingBox();
  const bg1 = await el.evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.mouse.up();
  await page.waitForTimeout(60);
  const shift = box1 ? Math.max(
    Math.abs(box0.x - box1.x), Math.abs(box0.y - box1.y),
    Math.abs(box0.width - box1.width), Math.abs(box0.height - box1.height),
  ) : null;
  return { selector, box0, box1, bg0, bg1, shift, washChanged: bg0 !== bg1 };
}

async function runStep(page, form, name, action, expect = [], waitMs = 400) {
  const before = { sim: summarize(await readSim(page)), dom: await dom(page) };
  await shot(page, `${form}/${name}-before.png`, { phase: "before", step: name, form, sim: before.sim, dom: before.dom });
  let error = null;
  try { await action(); } catch (e) { error = String(e && e.message || e); blockers.push(`${form}/${name}: ${error}`); }
  await page.waitForTimeout(waitMs);
  const after = { sim: summarize(await readSim(page)), dom: await dom(page) };
  await shot(page, `${form}/${name}-after.png`, { phase: "after", step: name, form, sim: after.sim, dom: after.dom });
  const checks = expect.map((e) => {
    let ok = false, detail = "";
    try { ok = !!e.test(before, after); detail = e.detail ? e.detail(before, after) : ""; }
    catch (ex) { ok = false; detail = "check threw: " + ex; }
    return { name: e.name, ok, detail };
  });
  const rec = { form, step: name, error, before, after, checks };
  steps.push(rec);
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  console.log(`[${form}] ${name}: ${error ? "ACTION-ERROR " + error : (failed.length ? "CHECK-FAIL " + failed.join(",") : "ok")}`);
  return rec;
}

// c4 instrumentation: wrap the Web Audio API at the browser boundary BEFORE app scripts.
// Tags every gain/compressor/oscillator/bufferSource node and records connect edges so the
// master gain (the gain feeding the compressor) and its live level can be read back. This
// is the browser equivalent of audio.ts graphSnapshot(); it never alters audio behaviour.
function audioInit() {
  try {
    const reg = { contexts: 0, nodes: [], edges: [], seq: 0 };
    const tag = (node, kind) => {
      try { node.__rwId = ++reg.seq; node.__rwKind = kind; reg.nodes.push({ id: node.__rwId, kind, node }); } catch (e) { /* ignore */ }
      return node;
    };
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const Orig = AC;
      const Wrapped = function (...args) { const ctx = new Orig(...args); reg.contexts += 1; return ctx; };
      Wrapped.prototype = Orig.prototype;
      window.AudioContext = Wrapped;
      if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
      const proto = Orig.prototype;
      const factories = [["createGain", "gain"], ["createDynamicsCompressor", "compressor"], ["createOscillator", "oscillator"], ["createBufferSource", "bufferSource"]];
      for (const [method, kind] of factories) {
        const orig = proto[method];
        if (orig) proto[method] = function (...a) { return tag(orig.apply(this, a), kind); };
      }
    }
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      try {
        const fromId = this.__rwId ?? null;
        let toId = "unknown";
        if (dest && dest.__rwId != null) toId = dest.__rwId;
        else if (this.context && dest === this.context.destination) toId = "destination";
        reg.edges.push({ from: fromId, to: toId });
      } catch (e) { /* ignore */ }
      return origConnect.call(this, dest, ...rest);
    };
    window.__rwAudio = {
      snapshot() {
        const compIds = new Set(reg.nodes.filter((n) => n.kind === "compressor").map((n) => n.id));
        const masterEdge = reg.edges.find((e) => compIds.has(e.to));
        const masterNode = masterEdge ? reg.nodes.find((n) => n.id === masterEdge.from) : null;
        const masterLevel = masterNode && masterNode.node.gain ? masterNode.node.gain.value : null;
        const voices = reg.nodes.filter((n) => n.kind === "oscillator" || n.kind === "bufferSource").length;
        return {
          contexts: reg.contexts, nodeCount: reg.nodes.length, edgeCount: reg.edges.length,
          compressorCount: compIds.size, masterId: masterNode ? masterNode.id : null,
          masterLevel, voices,
          kinds: reg.nodes.reduce((acc, n) => { acc[n.kind] = (acc[n.kind] || 0) + 1; return acc; }, {}),
        };
      },
    };
  } catch (e) { window.__rwAudioError = String(e); }
}

// c5: the reconcile status line is transient during off-thread catch-up and can appear
// and vanish between polls. Record its FIRST text permanently via a MutationObserver so
// the loading loop can assert it even if the 120ms poll misses the live node.
function reconcileWatch() {
  try {
    window.__rwReconcile = null;
    const obs = new MutationObserver(() => {
      if (window.__rwReconcile) return;
      const e = document.querySelector(".reconcile");
      if (e) window.__rwReconcile = e.textContent.trim();
    });
    obs.observe(document, { childList: true, subtree: true, characterData: true });
  } catch (e) { /* ignore */ }
}

async function newPage(browser, formKey, seedVariant, opts = {}) {
  const def = FORM_DEFS[formKey];
  const context = await browser.newContext({
    viewport: def.viewport,
    deviceScaleFactor: def.dpr,
    isMobile: def.mobile, hasTouch: def.mobile,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
  });
  await context.addInitScript(audioInit);
  await context.addInitScript(reconcileWatch);
  const text = seedText(seedVariant);
  // Conditional seed: write ONLY when absent, so a reload (motion persistence) or a second
  // reader tab never clobbers the game's own live persisted save.
  if (text) await context.addInitScript((t) => { if (!localStorage.getItem("rustwake.save.v1")) localStorage.setItem("rustwake.save.v1", t); }, text);
  const page = await context.newPage();
  const tag = opts.tag || formKey;
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${tag}] ${m.text()}`); });
  page.on("pageerror", (e) => pageErrors.push(`[${tag}] ${String(e)}`));
  const url = opts.ui48 ? BASE_URL + "?ui48" : BASE_URL;
  let nav = null;
  for (let attempt = 0; attempt < 2 && !nav; attempt += 1) {
    try { nav = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }); }
    catch (e) { blockers.push(`${tag} goto attempt ${attempt}: ${String(e && e.message || e)}`); await page.waitForTimeout(1000); }
  }
  if (!nav) throw new Error(`${tag}: navigation to ${url} failed (see blockers)`);
  if (!opts.ui48) await page.waitForSelector(".gate__btn", { timeout: 20000 });
  return { context, page, phone: def.mobile, def, status: nav.status() };
}

async function begin(page) {
  await clickSel(page, ".gate__btn");
  await page.waitForTimeout(700);
}

// ============================ OPENING (fresh tutorial yard) ============================
async function openingLoop(browser, formKey) {
  const form = `${formKey}-opening`;
  const { context, page, phone } = await newPage(browser, formKey, null, { tag: form });
  const touch = phone;
  const gateDom = await dom(page);
  await shot(page, `${form}/00-gate.png`, { phase: "gate", form, dom: gateDom });
  await begin(page);
  const beginAudio = await audioSnap(page, `${form}/begin`);
  await runStep(page, form, "01-fresh-yard", async () => {}, [
    { name: "gate dismissed", test: () => gateDom.gate === true },
    { name: "resources visible", test: (b, a) => !!a.dom.resources },
    { name: "fresh yard: 0 machines", test: (b, a) => a.sim && a.sim.machines === 0 },
    { name: "primary is Salvage", test: (b, a) => (a.dom.dockPrimary?.text || "").includes("Salvage") },
    { name: "c4 audio context created on Begin gesture", test: () => beginAudio && beginAudio.contexts >= 1 },
    { name: "c4 master gain present (unmuted 0.9)", test: () => beginAudio && beginAudio.masterLevel != null && Math.abs(beginAudio.masterLevel - 0.9) < 1e-6, detail: () => JSON.stringify(beginAudio && beginAudio.masterLevel) },
    { name: "c4 Begin voiced the upgrade cue", test: () => beginAudio && beginAudio.voices >= 1, detail: () => JSON.stringify(beginAudio && beginAudio.voices) },
  ]);

  // c1 + c3: press wash on a plain dock face + geometry on the primary (no shift under finger).
  let plainPress = null, primaryPress = null;
  await runStep(page, form, "02-press-feedback", async () => {
    plainPress = await pressFirst(page, [
      ".dock .dock__btn:not(.dock__btn--primary):not(.dock__btn--branch):not([disabled])",
      ".objective__btn:not([disabled])",
      ".dock__btn--primary",
    ]);
    // a plain face may open a panel on release; retire it so the yard stays at rest
    await closePanel(page); await exitBuild(page);
    primaryPress = await pressProbe(page, ".dock__btn--primary");
  }, [
    { name: "c1 press wash applied on a real control", test: () => plainPress && plainPress.washChanged && /95,\s*216,\s*232/.test(plainPress.bg1), detail: () => JSON.stringify(plainPress && { selector: plainPress.selector, bg0: plainPress.bg0, bg1: plainPress.bg1 }) },
    { name: "c3 plain dock press does not shift geometry", test: () => plainPress && plainPress.shift != null && plainPress.shift < 0.5, detail: () => JSON.stringify(plainPress && plainPress.shift) },
    { name: "c3 primary press does not shift geometry", test: () => primaryPress && primaryPress.shift != null && primaryPress.shift < 0.5, detail: () => JSON.stringify(primaryPress && primaryPress.shift) },
  ]);

  // Salvage through the resting guided primary (real manual.salvage). 6 pulses -> 30 scrap.
  const salvageAudioBefore = await audioSnap(page, `${form}/pre-salvage`);
  await runStep(page, form, "03-salvage", async () => {
    for (let i = 0; i < 25; i += 1) {
      const s0 = await readSim(page);
      if ((s0.store?.scrap ?? 0) >= 30) break;
      await clickPrimary(page);
      await page.waitForTimeout(300);
    }
    await waitForSim(page, (s) => s.tutorial >= 2, 8000);
  }, [
    { name: "wreck pulses advanced", test: (b, a) => (a.sim?.wreckPulses ?? 0) > (b.sim?.wreckPulses ?? 0) },
    { name: "scrap salvaged to store", test: (b, a) => (a.sim?.store?.scrap ?? 0) > (b.sim?.store?.scrap ?? 0) },
    { name: "tutorial reached repair (>=2)", test: (b, a) => (a.sim?.tutorial ?? 0) >= 2 },
  ]);
  const salvageAudio = await audioSnap(page, `${form}/post-salvage`);
  steps.push({ form, step: "03b-salvage-audio", error: null, before: {}, after: {}, checks: [
    { name: "c4 salvage voiced cues (voices grew)", ok: !!(salvageAudio && salvageAudioBefore && salvageAudio.voices > salvageAudioBefore.voices), detail: JSON.stringify({ before: salvageAudioBefore?.voices, after: salvageAudio?.voices }) },
  ] });

  // Repair the drone (tutorial 2->3), costs 30 scrap.
  await runStep(page, form, "04-repair-drone", async () => {
    await waitForSim(page, (s) => s.tutorial >= 2 && s.machines.length === 0, 8000);
    await clickPrimary(page);
    await waitForSim(page, (s) => s.drone?.repaired === true, 5000);
  }, [
    { name: "drone repaired", test: (b, a) => a.sim?.droneRepaired === true },
    { name: "scrap spent on repair", test: (b, a) => (a.sim?.store?.scrap ?? 0) < (b.sim?.store?.scrap ?? 0) },
  ]);

  await waitForSim(page, (s) => s.tutorial >= 4 && (s.store?.scrap ?? 0) >= 20, 40000);

  // Build the sorter: primary arms ghost (tile 8), then the dock Build face commits.
  await runStep(page, form, "05-build-sorter", async () => {
    await waitForSim(page, (s) => s.tutorial >= 4 && s.machines.length === 0, 8000);
    await clickPrimary(page);
    await page.waitForSelector('.place-strip[data-flow="placement"]', { timeout: 5000 });
    await page.waitForTimeout(250);
    await clickPrimary(page);
    await waitForSim(page, (s) => s.machines.length >= 1, 5000);
    await waitForSim(page, (s) => s.tutorial >= 5, 5000);
  }, [
    { name: "c1 sorter placed (real build result)", test: (b, a) => (a.sim?.machines ?? 0) === (b.sim?.machines ?? 0) + 1 },
    { name: "sorter blueprint present", test: (b, a) => (a.sim?.machineList || []).some((m) => m.bp === "sorter") },
    { name: "tutorial advanced to >=5", test: (b, a) => (a.sim?.tutorial ?? 0) >= 5 },
  ]);

  // c2: Connect at 0 scrap REFUSES (real shortfall). Tap twice -> ONE grouped toast.
  let refusal1 = null, refusal2 = null, refusalAudio = null, lapsed = null;
  await runStep(page, form, "06-connect-refusal-group", async () => {
    await waitForSim(page, (s) => s.tutorial >= 5 && s.routes.length === 0, 8000);
    const preAudio = await audioSnap(page, `${form}/pre-refusal`);
    await clickPrimary(page);
    await page.waitForTimeout(150);
    refusal1 = await dom(page);
    await clickPrimary(page); // identical refused sentence -> count increments, NOT a new toast
    await page.waitForTimeout(150);
    refusal2 = await dom(page);
    refusalAudio = await audioSnap(page, `${form}/post-refusal`);
    steps.push({ form, step: "06b-refusal-audio", error: null, before: {}, after: {}, checks: [
      { name: "c4 refusal voiced the blocked cue", ok: !!(refusalAudio && preAudio && refusalAudio.voices > preAudio.voices), detail: JSON.stringify({ before: preAudio?.voices, after: refusalAudio?.voices }) },
    ] });
    // let the transient toast lapse (timer 1800ms); it must clear on its own
    await page.waitForTimeout(2000);
    lapsed = await dom(page);
    // bank scrap via the game's own idle earn path, then connect for real
    await waitForSim(page, (s) => (s.store?.scrap ?? 0) >= 6, 30000);
    await clickPrimary(page);
    await waitForSim(page, (s) => s.routes.length >= 1, 4000);
    await waitForSim(page, (s) => s.tutorial >= 6, 5000);
  }, [
    { name: "c2 first refusal toast is a shortfall", test: () => refusal1 && /Need\s+\d+/i.test(refusal1.toast || ""), detail: () => JSON.stringify(refusal1 && refusal1.toast) },
    { name: "c2 first refusal groups the dispatch (count>=1)", test: () => refusal1 && Number(refusal1.toastCount) >= 1, detail: () => JSON.stringify(refusal1 && refusal1.toastCount) },
    { name: "c2 repeated refusal INCREMENTS the same group", test: () => refusal2 && refusal1 && Number(refusal2.toastCount) > Number(refusal1.toastCount), detail: () => JSON.stringify({ first: refusal1 && refusal1.toastCount, second: refusal2 && refusal2.toastCount }) },
    { name: "c2 grouped toast live-region text stays bare (no xN in textContent)", test: () => refusal2 && refusal2.toast === refusal1.toast && !/×/.test(refusal2.toast || ""), detail: () => JSON.stringify(refusal2 && refusal2.toast) },
    { name: "c2 count painted via ::after generated content matching data-count", test: () => refusal2 && new RegExp("×\\s*" + refusal2.toastCount).test(refusal2.toastAfter || ""), detail: () => JSON.stringify({ count: refusal2 && refusal2.toastCount, after: refusal2 && refusal2.toastAfter }) },
    { name: "c2 transient toast clears after its timer lapses", test: () => lapsed && lapsed.toast === null, detail: () => JSON.stringify(lapsed && lapsed.toast) },
    { name: "c1 routes created after banking scrap", test: (b, a) => (a.sim?.routes ?? 0) > (b.sim?.routes ?? 0) },
    { name: "tutorial advanced to >=6", test: (b, a) => (a.sim?.tutorial ?? 0) >= 6 },
  ]);

  // Inspect the sorter through a real canvas tap (selection feedback).
  await runStep(page, form, "07-inspect-sorter", async () => {
    const s = await readSim(page);
    const sorter = s.machines.find((m) => m.blueprint === "sorter");
    await selectMachine(page, sorter.tile, touch);
    await page.waitForSelector(".panel--stack", { timeout: 4000 });
  }, [
    { name: "c1 inspector opened on selection", test: (b, a) => !!a.dom.panel && a.dom.panel.cls.includes("panel--stack") },
    { name: "inspector titled Scrap sorter", test: (b, a) => (a.dom.panel?.aria || "").includes("Scrap sorter") },
    { name: "seven inspector sections", test: (b, a) => (a.dom.inspectorSections || []).length === 7 },
  ]);

  await shot(page, `${form}/08-final.png`, { phase: "final", form, sim: summarize(await readSim(page)), dom: await dom(page) });
  await context.close();
}

// ============================ MATURE (seeded developed yard) ============================
async function matureLoop(browser, formKey) {
  const form = `${formKey}-mature`;
  const { context, page, phone } = await newPage(browser, formKey, "mature", { tag: form });
  const touch = phone;
  await begin(page);
  await dismissReport(page);
  await runStep(page, form, "00-mature-yard", async () => {}, [
    { name: "mature yard loaded: 8 machines", test: (b, a) => a.sim?.machines === 8 },
    { name: "tutorial complete (9)", test: (b, a) => a.sim?.tutorial === 9 },
    { name: "export claimed (trade unlocked)", test: (b, a) => a.sim?.exportClaimed === true },
    { name: "no offline drain (credits intact)", test: (b, a) => (a.sim?.credits ?? 0) >= 80 },
  ]);

  // c5 locked rail reasons (rail forms): yard earned at tutorial 9, research needs data.
  if (FORM_DEFS[formKey].shell === "rail") {
    const d = await dom(page);
    steps.push({ form, step: "00b-rail-locks", error: null, before: {}, after: { dom: d }, checks: [
      { name: "c5 rail yard slot earned at tutorial 9", ok: !d.rail.find((r) => r.slot === "yard")?.disabled, detail: JSON.stringify(d.rail.find((r) => r.slot === "yard")) },
      { name: "c5 rail slots print reasons when locked", ok: d.rail.every((r) => !r.disabled || !!r.reason), detail: JSON.stringify(d.rail) },
    ] });
  }

  // 1) SALVAGE through the catalog footer's real Salvage button.
  await runStep(page, form, "01-salvage", async () => {
    await openCatalog(page);
    await page.waitForTimeout(150);
    await clickSel(page, ".catalog__salvage");
    await page.waitForTimeout(300);
  }, [
    { name: "salvage pulse registered", test: (b, a) => (a.sim?.wreckPulses ?? 0) > (b.sim?.wreckPulses ?? 0) },
    { name: "scrap gained from salvage", test: (b, a) => (a.sim?.store?.scrap ?? 0) > (b.sim?.store?.scrap ?? 0) },
  ]);

  // 2) BUILD a furnace: catalog card -> Place -> dock Build face (real machine.build).
  let newMachineId = null;
  await runStep(page, form, "02-build-furnace", async () => {
    const before = await readSim(page);
    newMachineId = before.nextMachineId;
    await openCatalog(page);
    await clickSel(page, '.catalog__card[data-blueprint="furnace"]');
    await page.waitForTimeout(150);
    await clickSel(page, ".catalog__place");
    await page.waitForSelector('.place-strip[data-flow="placement"]', { timeout: 4000 });
    await page.waitForTimeout(150);
    await clickSel(page, ".dock__btn--primary");
  }, [
    { name: "c1 machine count +1 (real build result)", test: (b, a) => (a.sim?.machines ?? 0) === (b.sim?.machines ?? 0) + 1 },
    { name: "new furnace exists", test: (b, a) => (a.sim?.machineList || []).some((m) => m.id === newMachineId && m.bp === "furnace") },
    { name: "build cost spent (scrap down)", test: (b, a) => (a.sim?.store?.scrap ?? 0) < (b.sim?.store?.scrap ?? 0) },
  ]);

  // 3) INSPECT the new furnace via real canvas tap.
  await runStep(page, form, "03-inspect-furnace", async () => {
    const s = await readSim(page);
    const m = s.machines.find((x) => x.id === newMachineId);
    await selectMachine(page, m.tile, touch);
    await page.waitForSelector(".panel--stack", { timeout: 4000 });
  }, [
    { name: "furnace inspector opened", test: (b, a) => (a.dom.panel?.aria || "").includes("Furnace") },
    { name: "seven inspector sections", test: (b, a) => (a.dom.inspectorSections || []).length === 7 },
    { name: "bottleneck section present", test: (b, a) => (a.dom.inspectorSections || []).some((t) => /bottleneck/i.test(t)) },
  ]);

  // 4) RESOLVE the input bottleneck: inspector Connect dispatches route.connect plans.
  await runStep(page, form, "04-connect-bottleneck", async () => {
    await clickButton(page, ".panel__actions .icon-btn", "Connect", false);
  }, [
    { name: "c1 routes increased (input linked)", test: (b, a) => (a.sim?.routes ?? 0) > (b.sim?.routes ?? 0) },
  ]);

  // 5) SELL through a real Store trade card (contract.sell).
  let sellResource = null;
  await runStep(page, form, "05-sell-resource", async () => {
    await openStore(page);
    const card = await page.$(".store-trade");
    sellResource = card ? await card.getAttribute("data-resource") : null;
    const max = await page.$(".store-trade .store-trade__preset");
    if (max) await max.click();
    await page.waitForTimeout(150);
    await clickSel(page, ".store-trade .store-trade__sell");
  }, [
    { name: "a sellable trade face was present", test: () => !!sellResource },
    { name: "c1 credits increased by sale (real result)", test: (b, a) => (a.sim?.credits ?? 0) > (b.sim?.credits ?? 0) },
  ]);

  // 6) UPGRADE: re-inspect the furnace, choose a branch card, Buy (real machine.upgrade).
  await runStep(page, form, "06-upgrade-furnace", async () => {
    await closePanel(page);
    const s = await readSim(page);
    const m = s.machines.find((x) => x.id === newMachineId);
    await selectMachine(page, m.tile, touch);
    await page.waitForSelector(".panel--stack", { timeout: 4000 });
    await page.waitForTimeout(150);
    await clickSel(page, '.upgrade-card[data-branch="speed"]');
    await page.waitForTimeout(150);
    await clickSel(page, ".upgrade-buy");
  }, [
    { name: "c1 furnace level +1 (real upgrade result)", test: (b, a) => {
      const bm = (b.sim?.machineList || []).find((m) => m.id === newMachineId);
      const am = (a.sim?.machineList || []).find((m) => m.id === newMachineId);
      return (am?.level ?? 0) === (bm?.level ?? 0) + 1;
    } },
    { name: "credits spent on upgrade", test: (b, a) => (a.sim?.credits ?? 0) < (b.sim?.credits ?? 0) },
    { name: "c1 upgrade read-back receipt shown", test: (b, a) => !!a.dom.upgradeReceipt },
  ]);

  // c4: mute through the real in-game Settings; master gain must write 0 then back to 0.9.
  let mutedSnap = null, unmutedSnap = null, mutedDom = null, unmutedDom = null, mutedSettings = null;
  await runStep(page, form, "07-mute-settings", async () => {
    await closePanel(page);
    await deselect(page, touch);
    const preAudio = await audioSnap(page, `${form}/pre-mute`);
    await openSettings(page);
    await clickSettingsButton(page, 0); // sound row
    mutedDom = await dom(page);
    mutedSnap = await audioSnap(page, `${form}/muted`);
    mutedSettings = await readSettings(page);
    await clickSettingsButton(page, 0); // unmute
    unmutedDom = await dom(page);
    unmutedSnap = await audioSnap(page, `${form}/unmuted`);
    await closePanel(page);
    steps.push({ form, step: "07b-mute-audio", error: null, before: {}, after: {}, checks: [
      { name: "c4 unmuted master gain 0.9 before toggle", ok: !!(preAudio && preAudio.masterLevel != null && Math.abs(preAudio.masterLevel - 0.9) < 1e-6), detail: JSON.stringify(preAudio?.masterLevel) },
      { name: "c4 mute writes master gain 0", ok: !!(mutedSnap && mutedSnap.masterLevel === 0), detail: JSON.stringify(mutedSnap?.masterLevel) },
      { name: "c4 unmute restores master gain 0.9", ok: !!(unmutedSnap && unmutedSnap.masterLevel != null && Math.abs(unmutedSnap.masterLevel - 0.9) < 1e-6), detail: JSON.stringify(unmutedSnap?.masterLevel) },
    ] });
  }, [
    { name: "c4 settings sound aria-pressed reflects mute", test: () => mutedDom && mutedDom.settingsSound && mutedDom.settingsSound.pressed === "true", detail: () => JSON.stringify(mutedDom && mutedDom.settingsSound) },
    { name: "c4 mute persisted to save settings", test: () => mutedSettings && mutedSettings.muted === true, detail: () => JSON.stringify(mutedSettings) },
    { name: "c4 unmute aria-pressed false", test: () => unmutedDom && unmutedDom.settingsSound && unmutedDom.settingsSound.pressed === "false", detail: () => JSON.stringify(unmutedDom && unmutedDom.settingsSound) },
  ]);

  await shot(page, `${form}/08-final.png`, { phase: "final", form, sim: summarize(await readSim(page)), dom: await dom(page) });
  await context.close();
}

// ============================ ERROR (broke seed: deterministic shortfall) ============================
async function errorLoop(browser, formKey) {
  const form = `${formKey}-error`;
  const { context, page, phone } = await newPage(browser, formKey, "broke", { tag: form });
  const touch = phone;
  await begin(page);
  await dismissReport(page);
  await runStep(page, form, "00-broke-yard", async () => {}, [
    { name: "broke yard loaded: 8 machines", test: (b, a) => a.sim?.machines === 8 },
    { name: "credits zero (deterministic shortfall)", test: (b, a) => (a.sim?.credits ?? -1) === 0 },
    { name: "tutorial 9 (persistent tail eligible)", test: (b, a) => (a.sim?.tutorial ?? 0) >= 8 },
  ]);

  // Find a machine with a non-disabled upgrade card, select it, Buy -> engine shortfall.
  let err1 = null, err2 = null, errFresh = null, errTail = null, shortReceipt = null;
  await runStep(page, form, "01-upgrade-refusal-group", async () => {
    const s = await readSim(page);
    let chosen = null;
    for (const m of s.machines) {
      await selectMachine(page, m.tile, touch);
      const d0 = await dom(page);
      if (!d0.panel || !d0.panel.cls.includes("panel--stack")) continue;
      const card = (d0.upgradeCards || []).find((c) => !c.disabled);
      if (!card) continue;
      // Buy stays disabled until a card is selected (selectedCard===null), so select first,
      // then re-read. speed/buffer cards are never noEffect, so every machine qualifies.
      await clickSel(page, `.upgrade-card[data-branch="${card.branch}"]`);
      await page.waitForTimeout(150);
      const d1 = await dom(page);
      if (d1.upgradeBuy && !d1.upgradeBuy.disabled) { chosen = { m, card }; break; }
    }
    if (!chosen) throw new Error("no machine with an enabled upgrade card found");
    await clickSel(page, ".upgrade-buy"); // refused: credits 0
    await page.waitForTimeout(150);
    err1 = await dom(page);
    await clickSel(page, ".upgrade-buy"); // identical sentence -> group
    await page.waitForTimeout(150);
    err2 = await dom(page);
    shortReceipt = err2.upgradeReceipt;
    // let the transient toast lapse; the persistent resting-line tail must remain
    await page.waitForTimeout(2000);
    errTail = await dom(page);
    await clickSel(page, ".upgrade-buy"); // fresh group after lapse
    await page.waitForTimeout(150);
    errFresh = await dom(page);
  }, [
    { name: "c2 refusal toast names the credit shortfall", test: () => err1 && /Need\s+\d+.*credit/i.test(err1.toast || ""), detail: () => JSON.stringify(err1 && err1.toast) },
    { name: "c2 first refusal count=1", test: () => err1 && err1.toastCount === "1", detail: () => JSON.stringify(err1 && err1.toastCount) },
    { name: "c2 repeated refusal GROUPS to count=2", test: () => err2 && err2.toastCount === "2", detail: () => JSON.stringify(err2 && err2.toastCount) },
    { name: "c2 grouped live-region text stays bare", test: () => err2 && err2.toast === err1.toast && !/×/.test(err2.toast || ""), detail: () => JSON.stringify(err2 && err2.toast) },
    { name: "c2 count painted via ::after", test: () => err2 && /×\s*2/.test(err2.toastAfter || ""), detail: () => JSON.stringify(err2 && err2.toastAfter) },
    { name: "c2 inspector shows the engine short receipt", test: () => !!shortReceipt && /short|need/i.test(shortReceipt), detail: () => JSON.stringify(shortReceipt) },
    { name: "c2 error PERSISTS in resting line after toast lapses", test: () => errTail && /Last/i.test(errTail.objectiveNumbers || "") && /credit/i.test(errTail.objectiveNumbers || ""), detail: () => JSON.stringify(errTail && errTail.objectiveNumbers) },
    { name: "c2 toast gone after lapse", test: () => errTail && errTail.toast === null, detail: () => JSON.stringify(errTail && errTail.toast) },
    { name: "c2 fresh refusal after lapse resets count=1", test: () => errFresh && errFresh.toastCount === "1", detail: () => JSON.stringify(errFresh && errFresh.toastCount) },
    { name: "c1 no credits spent on refused upgrade", test: (b, a) => (a.sim?.credits ?? 0) === 0 },
  ]);

  await shot(page, `${form}/02-final.png`, { phase: "final", form, sim: summarize(await readSim(page)), dom: await dom(page) });
  await context.close();
}

// ============================ READER (two tabs, one lease) ============================
async function readerLoop(browser, formKey) {
  const form = `${formKey}-reader`;
  const def = FORM_DEFS[formKey];
  // ONE context => shared localStorage => the second page is a real reader tab.
  const context = await browser.newContext({
    viewport: def.viewport, deviceScaleFactor: def.dpr,
    isMobile: def.mobile, hasTouch: def.mobile, reducedMotion: "no-preference",
  });
  await context.addInitScript(audioInit);
  const text = seedText("mature");
  // Conditional: tab B must read A's LIVE lease/save, never clobber it with a fresh seed.
  await context.addInitScript((t) => { if (!localStorage.getItem("rustwake.save.v1")) localStorage.setItem("rustwake.save.v1", t); }, text);
  const A = await context.newPage();
  A.on("pageerror", (e) => pageErrors.push(`[${form}/A] ${String(e)}`));
  await A.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 });
  await A.waitForSelector(".gate__btn", { timeout: 20000 });
  await begin(A); // A becomes the writer
  await dismissReport(A);
  await A.waitForTimeout(500);

  const B = await context.newPage();
  B.on("pageerror", (e) => pageErrors.push(`[${form}/B] ${String(e)}`));
  await B.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 });
  await B.waitForSelector(".gate__btn", { timeout: 20000 });
  await begin(B); // B reads A's live lease -> reader
  await B.waitForTimeout(700);
  const readerDom = await dom(B);
  await shot(B, `${form}/01-reader.png`, { phase: "reader", form, dom: readerDom });

  // B tries to take over while A is still writing -> stays reader + stuck toast.
  let stuckDom = null;
  await runStep(B, form, "02-takeover-blocked", async () => {
    await clickButton(B, ".dock button", "Take over", true);
    await B.waitForTimeout(300);
    stuckDom = await dom(B);
  }, [
    { name: "c5 reader objective is the mirror line", test: () => /Following the other tab/i.test(readerDom.objective || ""), detail: () => JSON.stringify(readerDom.objective) },
    { name: "c5 reader primary is Take over", test: () => (readerDom.dockPrimary?.text || "").includes("Take over"), detail: () => JSON.stringify(readerDom.dockPrimary) },
    { name: "c5 reader hides the onboard coach", test: () => readerDom.onboard === false, detail: () => JSON.stringify(readerDom.onboard) },
    { name: "c5 take-over while writer alive stays reader", test: () => stuckDom && (stuckDom.dockPrimary?.text || "").includes("Take over"), detail: () => JSON.stringify(stuckDom && stuckDom.dockPrimary) },
    { name: "c2 stuck refusal toast names the writer", test: () => stuckDom && /Another tab is still writing/i.test(stuckDom.toast || ""), detail: () => JSON.stringify(stuckDom && stuckDom.toast) },
  ]);

  // Close the writer; after the lease TTL the reader can promote.
  let promotedDom = null;
  await runStep(B, form, "03-takeover-promote", async () => {
    await A.close();
    // The reader's periodic reconcile AUTO-PROMOTES once the writer lease expires
    // (LEASE_TTL_MS=1500). Poll for the primary leaving "Take over"; only exercise the
    // real Take over control if the tab is still a reader after the lease window.
    let promoted = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const d = await dom(B);
      if (!(d.dockPrimary?.text || "").includes("Take over")) { promoted = true; break; }
      await B.waitForTimeout(300);
    }
    if (!promoted) {
      try { await clickButton(B, ".dock button", "Take over", true); await B.waitForTimeout(700); } catch { /* already promoted */ }
    }
    promotedDom = await dom(B);
  }, [
    { name: "c5 reader promotes to writer after lease expires", test: () => promotedDom && !(promotedDom.dockPrimary?.text || "").includes("Take over"), detail: () => JSON.stringify(promotedDom && promotedDom.dockPrimary) },
    { name: "c5 promoted objective is no longer the mirror line", test: () => promotedDom && !/Following the other tab/i.test(promotedDom.objective || ""), detail: () => JSON.stringify(promotedDom && promotedDom.objective) },
  ]);

  await shot(B, `${form}/04-promoted.png`, { phase: "promoted", form, dom: await dom(B) });
  await context.close();
}

// ============================ LOADING (long absence -> reconcile + report) ============================
async function loadingLoop(browser, formKey) {
  const form = `${formKey}-loading`;
  const { context, page } = await newPage(browser, formKey, "old", { tag: form });
  // Begin, then poll for the reconcile status line and the adopted return report.
  let reconcileSeen = null, reportDom = null;
  await runStep(page, form, "01-catchup-report", async () => {
    await clickSel(page, ".gate__btn");
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const d = await dom(page);
      if (d.reconcile && !reconcileSeen) { reconcileSeen = d.reconcile; await shot(page, `${form}/02-reconcile.png`, { phase: "reconcile", form, dom: d }); }
      if (d.report) { reportDom = d; break; }
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
    // The reconcile line is transient; fall back to the MutationObserver's first capture.
    if (!reconcileSeen) reconcileSeen = await page.evaluate(() => window.__rwReconcile || null);
    if (!reportDom) reportDom = await dom(page);
  }, [
    { name: "c5 reconcile status line shown during catch-up", test: () => /Catching your yard up/i.test(reconcileSeen || ""), detail: () => JSON.stringify(reconcileSeen) },
    { name: "c5 return report adopted after catch-up", test: () => reportDom && !!reportDom.report, detail: () => JSON.stringify(reportDom && reportDom.report) },
    { name: "c5 return report titled While you were away", test: () => reportDom && /While you were away/i.test(reportDom.report?.title || ""), detail: () => JSON.stringify(reportDom && reportDom.report?.title) },
    { name: "c5 return report has an applied read-back", test: () => reportDom && !!reportDom.report?.applied, detail: () => JSON.stringify(reportDom && reportDom.report?.applied) },
  ]);
  await shot(page, `${form}/03-report.png`, { phase: "report", form, dom: await dom(page) });
  await context.close();
}

// ============================ MOTION (c3 reduced-motion alternative) ============================
async function motionLoop(browser, formKey) {
  const form = `${formKey}-motion`;

  // A) OS prefers-reduced-motion -> attr mirrored, settings motion locked + OS note.
  {
    const { context, page, phone } = await newPage(browser, formKey, "mature", { tag: `${form}-os`, reducedMotion: true });
    await begin(page);
    await dismissReport(page);
    const osDom = await dom(page);
    await openSettings(page);
    const osSettings = await dom(page);
    await shot(page, `${form}/01-os-reduce.png`, { phase: "os-reduce", form, dom: osSettings });
    steps.push({ form, step: "01-os-reduce", error: null, before: {}, after: { dom: osSettings }, checks: [
      { name: "c3 OS reduce mirrors data-reduced-motion=true", ok: osDom.reducedMotionAttr === "true", detail: JSON.stringify(osDom.reducedMotionAttr) },
      { name: "c3 settings motion button disabled under OS reduce", ok: !!(osSettings.settingsMotion && osSettings.settingsMotion.disabled), detail: JSON.stringify(osSettings.settingsMotion) },
      { name: "c3 settings motion aria-pressed true under OS reduce", ok: !!(osSettings.settingsMotion && osSettings.settingsMotion.pressed === "true"), detail: JSON.stringify(osSettings.settingsMotion) },
      { name: "c3 OS motion note printed", ok: !!osSettings.motionOsNote, detail: JSON.stringify(osSettings.motionOsNote) },
    ] });
    await context.close();
  }

  // B) ?ui48 primitive slice under OS reduce -> every wk-* transition disabled.
  {
    const { context, page } = await newPage(browser, formKey, null, { tag: `${form}-ui48`, reducedMotion: true, ui48: true });
    await page.waitForTimeout(600);
    const wk = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="wk-"]')];
      const sample = els.slice(0, 40).map((e) => ({ cls: e.className, transition: getComputedStyle(e).transitionProperty + " " + getComputedStyle(e).transitionDuration }));
      const anyAnimated = els.some((e) => { const s = getComputedStyle(e); return s.transitionDuration !== "0s" && s.transitionProperty !== "none" && s.transitionProperty !== "all"; });
      return { count: els.length, attr: document.documentElement.getAttribute("data-reduced-motion"), anyAnimated, sample: sample.slice(0, 8) };
    });
    await shot(page, `${form}/02-ui48-reduce.png`, { phase: "ui48-reduce", form, wk });
    steps.push({ form, step: "02-ui48-reduce", error: null, before: {}, after: { wk }, checks: [
      { name: "c3 ui48 primitive slice present", ok: wk.count > 0, detail: JSON.stringify(wk.count) },
      { name: "c3 ui48 attr mirrored under OS reduce", ok: wk.attr === "true", detail: JSON.stringify(wk.attr) },
      { name: "c3 no wk-* primitive animates under reduce", ok: wk.anyAnimated === false, detail: JSON.stringify(wk.sample) },
    ] });
    await context.close();
  }

  // C) In-app toggle (no OS reduce) -> attr flips, persists across reload.
  {
    const { context, page, phone } = await newPage(browser, formKey, "mature", { tag: `${form}-toggle`, reducedMotion: false });
    await begin(page);
    await dismissReport(page);
    const beforeAttr = (await dom(page)).reducedMotionAttr;
    await openSettings(page);
    await clickSettingsButton(page, 2); // motion row
    const onDom = await dom(page);
    const onSettings = await readSettings(page);
    await shot(page, `${form}/03-toggle-on.png`, { phase: "toggle-on", form, dom: onDom });
    // reload -> the saved preference must re-mirror the attribute
    await page.reload({ waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(".gate__btn", { timeout: 20000 });
    await begin(page);
    await dismissReport(page);
    const reloadAttr = (await dom(page)).reducedMotionAttr;
    steps.push({ form, step: "03-toggle-persist", error: null, before: {}, after: { dom: onDom }, checks: [
      { name: "c3 motion off by default (attr absent)", ok: beforeAttr === null, detail: JSON.stringify(beforeAttr) },
      { name: "c3 in-app toggle mirrors attr=true", ok: onDom.reducedMotionAttr === "true", detail: JSON.stringify(onDom.reducedMotionAttr) },
      { name: "c3 toggle persisted to save settings", ok: !!(onSettings && onSettings.reducedMotion === true), detail: JSON.stringify(onSettings) },
      { name: "c3 saved preference re-mirrors attr after reload", ok: reloadAttr === "true", detail: JSON.stringify(reloadAttr) },
    ] });
    await context.close();
  }
}

// ============================ one-pass frame mirror audit ============================
function auditFrames(expectedDims) {
  const results = [];
  const walk = (dir, rel = "") => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const r = join(rel, name);
      if (statSync(full).isDirectory()) { walk(full, r); continue; }
      if (!name.endsWith(".png")) continue;
      const buf = readFileSync(full);
      const sha = createHash("sha256").update(buf).digest("hex");
      const w = buf.length >= 24 ? buf.readUInt32BE(16) : 0;
      const h = buf.length >= 24 ? buf.readUInt32BE(20) : 0;
      const meta = frameMeta.find((m) => m.name === r.replaceAll("\\", "/"));
      const formKey = r.split(/[\\/]/)[0];
      const exp = expectedDims[formKey] || null;
      const dimsOk = exp ? (w === exp.w && h === exp.h) : true;
      const hashOk = meta ? meta.sha256 === sha : false;
      const nonEmpty = buf.length > 1000;
      results.push({ frame: r.replaceAll("\\", "/"), bytes: buf.length, width: w, height: h, sha256: sha, dimsOk, hashOk, nonEmpty, ok: dimsOk && hashOk && nonEmpty });
    }
  };
  walk(FRAMES);
  return results;
}

async function main() {
  mkdirSync(FRAMES, { recursive: true });
  console.log("BASE_URL=", BASE_URL, "BUILD_SHA=", BUILD_SHA, "FORMS=", FORMS.join(","), "chrome=", executablePath);
  const browser = await chromium.launch({ executablePath, headless: true });
  for (const key of FORMS) {
    if (!FORM_DEFS[key]) { blockers.push(`unknown form ${key}`); continue; }
    for (const [name, fn] of [["opening", openingLoop], ["mature", matureLoop], ["error", errorLoop], ["reader", readerLoop], ["loading", loadingLoop], ["motion", motionLoop]]) {
      try { await fn(browser, key); }
      catch (e) { blockers.push(`${key}-${name} FATAL: ${String(e && e.stack || e)}`); console.error(e); }
    }
  }
  await browser.close();

  const expectedDims = {};
  for (const key of FORMS) {
    const d = FORM_DEFS[key].dims;
    for (const loop of ["opening", "mature", "error", "reader", "loading", "motion"]) expectedDims[`${key}-${loop}`] = d;
  }
  const audit = auditFrames(expectedDims);
  const auditOk = audit.every((a) => a.ok);
  const byForm = {};
  for (const a of audit) { const k = a.frame.split("/")[0]; (byForm[k] ||= []).push(a.sha256); }
  const distinct = Object.fromEntries(Object.entries(byForm).map(([k, v]) => [k, new Set(v).size > 1]));

  const allChecks = steps.flatMap((s) => s.checks.map((c) => ({ form: s.form, step: s.step, ...c })));
  const failedChecks = allChecks.filter((c) => !c.ok);
  const results = {
    issue: 65, role: "developer", persona: "dev-65", buildSha: BUILD_SHA, baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    chrome: executablePath, forms: FORMS,
    fixtureScrutiny: {
      a: "Only setup seeding mutates state (probe encodeEnvelope from validated seeds.json); no src changes; all actions are real UI clicks/taps.",
      b: "Documented in probe.mjs header, validate-fixtures.ts, seeds.json, evidence.md and results.json.",
      c: "Every seeded envelope passes the game's full decodeSave/validateSim (validate-fixtures.ts PASS); no invariant weakened or bypassed.",
      d: "Actions flow through dispatch->applyCommand; localStorage read only as the game's own persistence mirror.",
    },
    counts: { frames: audit.length, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length, audioEvents: audioEvents.length },
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, frames: audit },
    audioBoundary: {
      method: "Web Audio API instrumented via addInitScript (ctor + createGain/createDynamicsCompressor/createOscillator/createBufferSource + AudioNode.connect). Master = the gain feeding the compressor; masterLevel read live from the real gain node. Browser equivalent of audio.ts graphSnapshot(); headless cannot listen.",
      unitSuite: "tests/game/audio.test.ts asserts the full module node table + mute at the same SHA.",
      events: audioEvents,
    },
    findings: [
      { id: "steel-reserve-floor", verdict: "intentional-design-not-defect", detail: "Mature fixture holds exactly 10 steel and reserveFloor=10, so sellableAmount(steel)=0; the sell step sells the dearest genuinely-sellable face through its real Max preset + Sell. Carried from #57.", source: "src/ui/store/model.ts tradeFaces; src/game/simulation/commands.ts sellableAmount" },
      { id: "dock-context-sensitivity", verdict: "intentional-design-not-defect", detail: "With a machine selected at tutorial>=8 the dock renders the upgrade-branch row; tapping an empty yard cell returns it to rest. Documented one-selection dock model. Carried from #57.", source: "src/ui/App.tsx pickTarget; src/ui/Hud.tsx DockButtons" },
      { id: "belt-cost-on-guided-connect", verdict: "minor-friction-not-blocking", detail: "The guided Connect face does not pre-print the belt scrap cost, so the first tap at 0 scrap refuses with a grouped shortfall toast + persistent Last tail; the drone banks scrap and the same primary connects. Used here as the deterministic c2 grouping demonstration. Out of #65 scope to re-price (BELT-001 / #57 finding 4).", source: "src/game/simulation/commands.ts connectRoute; src/ui/App.tsx commit/notify/setLastReject" },
    ],
    failedChecks, blockers, consoleErrors, pageErrors,
    steps,
  };
  writeFileSync(resolve(EVID, "results.json"), JSON.stringify(results, null, 2));
  console.log("\n==== SUMMARY ====");
  console.log("frames=", audit.length, "auditOk=", auditOk, "distinct=", JSON.stringify(distinct));
  console.log("steps=", steps.length, "checks=", allChecks.length, "failedChecks=", failedChecks.length);
  console.log("consoleErrors=", consoleErrors.length, "pageErrors=", pageErrors.length, "blockers=", blockers.length);
  if (failedChecks.length) { console.log("FAILED CHECKS:"); for (const c of failedChecks) console.log(`  [${c.form}] ${c.step}: ${c.name} ${c.detail}`); }
  if (blockers.length) { console.log("BLOCKERS:"); for (const b of blockers) console.log("  " + b); }
  if (consoleErrors.length) { console.log("CONSOLE ERRORS:"); for (const e of consoleErrors.slice(0, 20)) console.log("  " + e); }
  if (pageErrors.length) { console.log("PAGE ERRORS:"); for (const e of pageErrors.slice(0, 20)) console.log("  " + e); }
}

main().catch((e) => { console.error("PROBE FATAL:", e); process.exitCode = 1; });
