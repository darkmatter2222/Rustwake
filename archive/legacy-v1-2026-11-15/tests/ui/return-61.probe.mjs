/**
 * UI-RESET-61 (issue #61) — developer acceptance probe.
 *
 * ROLE: developer (rw/61-return). PROBE-ONLY code: nothing under src/ is
 * modified by this file. It drives THIS BRANCH'S own built app through the
 * REAL UI (the boot gate, the one resume control, the Menu face, Escape, the
 * copy-report recovery action, body scrolling and a full reload) and records
 * DOM + geometry + canvas-pixel + persisted-state evidence. No vision is used:
 * every visual claim is a programmatic DOM/geometry/pixel-hash assertion, never
 * an eyeballed screenshot. Screenshots are hashed mirrors, not inspected.
 *
 * Run against the branch's own build (never the live site, never the stale
 * primary checkout):
 *   pnpm build
 *   pnpm preview --port 5161 --strictPort --host 127.0.0.1   (background)
 *   BASE_URL=http://127.0.0.1:5161/ RW61_SHA=<head sha> \
 *     pnpm exec tsx tests/ui/return-61.probe.mjs
 * Artifacts land in RW61_EVID (default C:/Users/ryans/AppData/Local/Temp/rw-coord/UI-RESET-61).
 * A trimmed, committed index is written to tests/ui/return-61.results.json.
 *
 * Why tsx + .mjs: the probe imports the game's OWN encodeSave/decodeSave
 * (src/game/persistence/save.ts), catchUp (src/game/simulation/offline.ts, the
 * read-only oracle), createInitialState, TUNING/TICK_MS and deriveReturn. tsx
 * resolves the .ts graph; .mjs stays outside tsc's allowJs:false include and
 * outside vitest's *.test.* collection (same precedent as research-58.probe.mjs).
 *
 * Fixture scrutiny (task a-d):
 *  (a) The ONLY state mutation is SETUP seeding. Each fixture is the repo's own
 *      docs/evidence/yard-mature.json payload.sim VERBATIM (cap/long/short/large)
 *      or createInitialState() (zero), re-encoded with the game's OWN encodeSave
 *      and lastSeenMs = Date.now() - gap set in the past. No sim field is edited.
 *      A probe-only localStorage marker "rw61.seeded" guards the seed so it is
 *      written once per context; reloads therefore read the GAME's own persisted
 *      save, which is exactly what the no-double-apply check exercises. Every
 *      acceptance ACTION is a real UI click/tap/key/scroll/reload.
 *  (b) This header, the FIXTURES table and results.json document the method.
 *  (c) Validation is NOT weakened: every seeded envelope passes the game's full
 *      decodeSave/repairRegistration/validateSim (asserted in-probe), the boot
 *      step asserts the loaded mirror kept the seed's machines/routes/tutorial,
 *      and report parity is anchored to the game's OWN catchUp run on a clone of
 *      the seed at the DOM's exact awayTicks — so gains/credits/deliveries/
 *      batches/bottleneck must match the simulation, not a hand-written number.
 *  (d) No action is faked by injection. localStorage is read ONLY as a mirror of
 *      the game's own persistence (written by adoptCatchUp/persist). The clipboard
 *      success path uses a real granted permission; refusal/missing-API branches
 *      are covered by return-61.test.tsx (documented finding), not faked here.
 *
 * Loading-state note (spec 18.5, NOT changed by #61): a long absence is settled
 * off-thread while App.tsx paints one `.reconcile` role=status line ("Catching
 * your yard up"). The panel never mounts before adoption. A MutationObserver
 * installed before page scripts records every reconcile appearance authoritatively
 * (no race), and a best-effort live frame is captured during the worker window.
 * The report itself is a receipt: no dialog, no claim, painted once.
 */
import { chromium } from "playwright-core";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

import { encodeSave, decodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { catchUp } from "../../src/game/simulation/offline.ts";
import { TUNING, TICK_MS } from "../../src/game/content/defs.ts";
import { formatNumber, t } from "../../src/game/content/strings.ts";
import { deriveReturn } from "../../src/ui/return/model.ts";
import {
  RETURN_COPY, BOTTLENECK_ADVICE, capNote, longAbsenceNote, gainsHeadline, creditsHeadline,
} from "../../src/ui/return/copy.ts";

const ROOT = resolve(process.cwd());
const EVID = process.env.RW61_EVID || "C:/Users/ryans/AppData/Local/Temp/rw-coord/UI-RESET-61";
const FRAMES = resolve(EVID, "frames");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5161/";
const BUILD_SHA = process.env.RW61_SHA || "unset";
const ORIGIN = new URL(BASE_URL).origin;
const SEED_MARKER = "rw61.seeded";
const CAP_TICKS = TUNING.offlineCapTicks; // 432000
const DAY_TICKS = 86_400_000 / TICK_MS; // 864000
const DRIFT_TICKS = 1200; // 120s of probe/load overhead tolerated on awayTicks

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = chromeCandidates.find((p) => p && existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge executable found");

// ---- forms: phone portrait + phone landscape (rail mode) + desktop (rail mode) ----
const FORMS = {
  phone: { viewport: { width: 390, height: 844 }, dpr: 2, isMobile: true, hasTouch: true, dims: { w: 780, h: 1688 }, short: false, rail: false },
  "phone-landscape": { viewport: { width: 844, height: 390 }, dpr: 2, isMobile: true, hasTouch: true, dims: { w: 1688, h: 780 }, short: true, rail: true },
  desktop: { viewport: { width: 1920, height: 1080 }, dpr: 1, isMobile: false, hasTouch: false, dims: { w: 1920, h: 1080 }, short: false, rail: true },
};

// ---- legitimate setup seeding: the game's OWN encodeSave, past lastSeenMs ----
const matureSim = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/yard-mature.json"), "utf8")).payload.sim;
const HOUR_MS = 3_600_000;
function makeFixture(sim, gapMs, textScale) {
  const settings = { ...DEFAULT_SETTINGS, textScale };
  const lastSeenMs = Date.now() - gapMs;
  const text = encodeSave(sim, lastSeenMs, settings);
  const decoded = decodeSave(text); // (c) full decodeSave/repairRegistration/validateSim
  return { sim, settings, lastSeenMs, gapMs, text, decodeOk: decoded.ok, expectedAway: Math.round(gapMs / TICK_MS), workerPath: Math.round(gapMs / TICK_MS) >= 20_000 };
}
const FIXTURES = {
  cap: makeFixture(matureSim, 13 * HOUR_MS, 1), // 468000 ticks -> capped at 432000, worker path
  long: makeFixture(matureSim, 72 * HOUR_MS, 1), // 2592000 ticks -> "3d 0h", capped, worker path
  zero: makeFixture(createInitialState(), 10 * 60_000, 1), // 6000 ticks, idle yard -> zero gain, inline
  short: makeFixture(matureSim, 60_000, 1), // 600 ticks -> earned, inline
  large: makeFixture(matureSim, 13 * HOUR_MS, 2), // cap at text scale 2 (.text-large)
};

/** The read-only oracle: the game's OWN catchUp on a seed clone at the DOM's awayTicks. */
function oracle(seedSim, awayTicks) {
  const clone = JSON.parse(JSON.stringify(seedSim));
  return catchUp(clone, 0, awayTicks * TICK_MS).report;
}

// ---- evidence collectors ----
const frameMeta = [];
const steps = [];
const consoleErrors = [];
const pageErrors = [];
const blockers = [];

function summarize(sim) {
  if (!sim) return null;
  const store = sim.store || {};
  const total = Object.values(store).reduce((a, b) => a + (b ?? 0), 0);
  return {
    tick: sim.tick, credits: sim.credits, storeUnits: sim.storeUnits, storeTotal: total,
    store: { ...store }, machines: sim.machines.length, routes: sim.routes.length,
    tutorial: sim.tutorial, deliveries: sim.drone ? sim.drone.deliveries : 0,
  };
}

async function readMirror(page) {
  return page.evaluate((key) => {
    const text = localStorage.getItem(key);
    if (!text) return null;
    try {
      const p = JSON.parse(text).payload;
      return { sim: p.sim, lastSeenMs: p.lastSeenMs, settings: p.settings };
    } catch { return null; }
  }, SAVE_KEY);
}
async function readSim(page) {
  const m = await readMirror(page);
  return m ? m.sim : null;
}

/** One report-scoped DOM + geometry snapshot. All claims derive from this. */
async function returnDom(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const fontPx = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    const txt = (el) => (el ? el.textContent.trim() : null);
    const panel = q(".panel--report");
    const body = panel ? panel.querySelector(".panel__body") : null;
    const summary = panel ? panel.querySelector(".return-summary") : null;
    const headButtons = panel
      ? [...panel.querySelectorAll(".panel__head button")].map((b) => ({ cls: b.className, text: txt(b), rect: rect(b) }))
      : [];
    const gains = panel
      ? [...panel.querySelectorAll(".return-gain")].map((g) => ({
          id: g.getAttribute("data-resource"),
          label: txt(g.querySelector(".return-gain__label")),
          value: txt(g.querySelector(".return-gain__value")),
          fillWidth: g.querySelector(".return-gain__fill")?.style.width ?? null,
          font: fontPx(g), rect: rect(g),
        }))
      : [];
    const detailRows = panel
      ? [...panel.querySelectorAll(".return-detail .panel__row")].map((r) => ({ label: txt(r.querySelector("dt")), value: txt(r.querySelector("dd")) }))
      : [];
    const limits = panel ? panel.querySelector(".return-limits") : null;
    const credits = panel ? panel.querySelector(".return-credits") : null;
    const recovery = panel ? panel.querySelector(".return-recovery") : null;
    const copy = recovery ? recovery.querySelector(".return-copy") : null;
    const note = recovery ? recovery.querySelector(".return-copy__note") : null;
    const bn = panel ? panel.querySelector(".return-bottleneck") : null;
    const ae = document.activeElement;
    const recEl = q(".reconcile");
    return {
      url: location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      rootFontSize: fontPx(document.documentElement),
      textLarge: document.documentElement.classList.contains("text-large"),
      railMode: window.matchMedia("(min-width: 1200px), (min-width: 600px) and (max-height: 460px)").matches,
      docScrollW: document.documentElement.scrollWidth,
      gate: !!q(".gate__btn"),
      dialogCount: document.querySelectorAll('[role="dialog"]').length,
      claimButtons: [...document.querySelectorAll("button")].filter((b) => /claim/i.test(b.textContent)).map((b) => txt(b)),
      reconcile: { present: !!recEl, text: txt(recEl), role: recEl ? recEl.getAttribute("role") : null, history: (window.__rw61 && window.__rw61.reconcile) || [] },
      dock: rect(q(".dock")),
      active: {
        tag: ae ? ae.tagName : null, id: ae ? ae.id : null, cls: ae ? String(ae.className) : null, text: ae ? (ae.textContent || "").trim().slice(0, 40) : null,
        isBody: ae === document.body, connected: ae ? ae.isConnected : false,
        isResume: !!(ae && ae.classList && ae.classList.contains("return-resume")),
        isMenuFace: !!(ae && ae.classList && ae.classList.contains("shell-menu-face")),
        isRailMenu: !!(ae && ae.matches && ae.matches('.shell-rail__slot[data-slot="menu"]')),
        inRail: !!(ae && ae.closest && ae.closest(".shell-rail")),
        inDock: !!(ae && ae.closest && ae.closest(".dock")),
      },
      panel: panel ? {
        cls: panel.className, role: panel.getAttribute("role"), aria: panel.getAttribute("aria-label"),
        dataState: panel.getAttribute("data-state"), dataAwayTicks: panel.getAttribute("data-away-ticks"),
        dataCreditedTicks: panel.getAttribute("data-credited-ticks"), dataCapped: panel.getAttribute("data-capped"),
        dataLongAbsence: panel.getAttribute("data-long-absence"),
        title: txt(panel.querySelector(".panel__title")), rect: rect(panel),
        headButtons,
        body: body ? { rect: rect(body), scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflowY: getComputedStyle(body).overflowY } : null,
        summary: summary ? {
          rect: rect(summary), position: getComputedStyle(summary).position,
          offsetFromBodyTop: body ? summary.getBoundingClientRect().top - body.getBoundingClientRect().top : null,
          awayValue: txt(summary.querySelector(".return-away__value")), awayValueFont: fontPx(summary.querySelector(".return-away__value")),
          awayKey: txt(summary.querySelector(".return-away__key")),
          chip: txt(summary.querySelector(".return-chip")), chipKind: summary.querySelector(".return-chip")?.getAttribute("data-kind"), chipState: summary.querySelector(".return-chip")?.getAttribute("data-state"),
          headline: txt(summary.querySelector(".return-headline")), headlineFont: fontPx(summary.querySelector(".return-headline")),
          zero: txt(summary.querySelector(".return-zero")),
          applied: txt(summary.querySelector(".return-applied")), appliedRole: summary.querySelector(".return-applied")?.getAttribute("role"), appliedFont: fontPx(summary.querySelector(".return-applied")),
        } : null,
        gains,
        credits: credits ? { text: txt(credits), value: txt(credits.querySelector(".return-credits__value")), font: fontPx(credits) } : null,
        limits: limits ? { title: txt(limits.querySelector(".return-section-title")), items: [...limits.querySelectorAll(".return-limit")].map((l) => ({ dataLimit: l.getAttribute("data-limit"), text: txt(l), font: fontPx(l) })) } : null,
        bottleneck: bn ? { data: bn.getAttribute("data-bottleneck"), label: txt(bn.querySelector(".return-bottleneck__label")), advice: txt(bn.querySelector(".return-bottleneck__advice")), font: fontPx(bn.querySelector(".return-bottleneck__label")) } : null,
        detailRows, detailFont: fontPx(panel.querySelector(".return-detail")),
        recovery: recovery ? {
          title: txt(recovery.querySelector(".return-section-title")), body: txt(recovery.querySelector(".return-recovery__body")),
          copy: copy ? { text: txt(copy), rect: rect(copy), font: fontPx(copy), minHeight: getComputedStyle(copy).minHeight } : null,
          note: note ? { text: txt(note), role: note.getAttribute("role") } : null,
        } : null,
        text: panel.textContent,
      } : null,
    };
  });
}

/** Canvas 2D pixel check: the yard is actually painted (distinct colors + lit fraction). */
async function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c || !c.width || !c.height) return { ok: false, reason: "no canvas" };
    const ctx = c.getContext("2d");
    if (!ctx) return { ok: false, reason: "no 2d context" };
    const w = c.width, h = c.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const colors = new Set();
    let lit = 0, sampled = 0;
    const step = 4 * 7; // sample every 7th pixel
    for (let i = 0; i + 3 < data.length; i += step) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      sampled += 1;
      if (a < 8) continue;
      colors.add(((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5));
      if (r + g + b > 90) lit += 1;
    }
    return { ok: true, w, h, distinct: colors.size, litFraction: sampled ? lit / sampled : 0, sampled };
  });
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

async function clickSel(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  await el.click();
}
async function clickButton(page, selector, textMatch) {
  const handle = await page.evaluateHandle(({ selector, textMatch }) => {
    const els = [...document.querySelectorAll(selector)];
    return els.find((e) => e.textContent.trim().startsWith(textMatch)) || null;
  }, { selector, textMatch });
  const el = handle.asElement();
  if (!el) throw new Error(`button not found: ${selector} text=${JSON.stringify(textMatch)}`);
  await el.click();
}
async function scrollBodyToBottom(page) {
  await page.evaluate(() => {
    const body = document.querySelector(".panel--report .panel__body");
    if (body) body.scrollTop = body.scrollHeight;
  });
  await page.waitForTimeout(200);
}
async function closeReport(page) {
  await clickSel(page, ".panel--report .return-resume");
  await page.waitForTimeout(250);
}

async function runStep(page, form, name, action, expect = [], waitMs = 350) {
  const before = { sim: summarize(await readSim(page)), dom: await returnDom(page) };
  await shot(page, `${form}/${name}-before.png`, { phase: "before", step: name, form, sim: before.sim });
  let error = null;
  try { await action(); } catch (e) { error = String((e && e.message) || e); blockers.push(`${form}/${name}: ${error}`); }
  await page.waitForTimeout(waitMs);
  const after = { sim: summarize(await readSim(page)), dom: await returnDom(page) };
  await shot(page, `${form}/${name}-after.png`, { phase: "after", step: name, form, sim: after.sim });
  const checks = expect.map((e) => {
    let ok = false, detail = "";
    try { ok = !!e.test(before, after); detail = e.detail ? e.detail(before, after) : ""; }
    catch (ex) { ok = false; detail = "check threw: " + ex; }
    return { name: e.name, ok, detail };
  });
  const rec = { form, step: name, error, before, after, checks };
  steps.push(rec);
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  console.log(`[${form}] ${name}: ${error ? "ACTION-ERROR " + error : failed.length ? "CHECK-FAIL " + failed.join(",") : "ok"}`);
  return rec;
}

/**
 * Open the branch's app, seed once (guarded), click the real boot gate, capture
 * the catch-up loading line best-effort, and wait for the adopted report. The
 * report is the subject, so it is LEFT OPEN (unlike research-58 which dismissed it).
 */
async function newPage(browser, formKey, baseForm, fixture) {
  const f = FORMS[baseForm];
  const context = await browser.newContext({
    viewport: f.viewport, deviceScaleFactor: f.dpr, isMobile: f.isMobile, hasTouch: f.hasTouch,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  // Authoritative reconcile recorder, installed before any page script runs.
  await context.addInitScript(() => {
    window.__rw61 = { reconcile: [] };
    const record = () => {
      const el = document.querySelector(".reconcile");
      if (!el) return;
      const text = (el.textContent || "").trim();
      const role = el.getAttribute("role");
      const hist = window.__rw61.reconcile;
      const last = hist[hist.length - 1];
      if (!last || last.text !== text || last.role !== role) hist.push({ text, role, at: Date.now() });
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true, characterData: true });
    record();
  });
  // Guarded setup seed: written once per context so reloads read the game's save.
  await context.addInitScript(({ key, marker, text }) => {
    if (!localStorage.getItem(marker)) {
      localStorage.setItem(key, text);
      localStorage.setItem(marker, "1");
    }
  }, { key: SAVE_KEY, marker: SEED_MARKER, text: fixture.text });

  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${formKey}] ${m.text()}`); });
  page.on("pageerror", (e) => pageErrors.push(`[${formKey}] ${String(e)}`));
  let nav = null;
  for (let attempt = 0; attempt < 2 && !nav; attempt += 1) {
    try { nav = await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 }); }
    catch (e) { blockers.push(`${formKey} goto attempt ${attempt}: ${String((e && e.message) || e)}`); await page.waitForTimeout(1000); }
  }
  if (!nav) throw new Error(`${formKey}: navigation to ${BASE_URL} failed (see blockers)`);
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
  await clickSel(page, ".gate__btn"); // click fast so the worker loading line is still up
  // Best-effort live capture of the catch-up loading line during the worker window.
  let reconcileShot = null;
  for (let i = 0; i < 12 && !reconcileShot; i += 1) {
    if (await page.$(".reconcile")) {
      reconcileShot = await shot(page, `${formKey}/reconcile.png`, { phase: "reconcile", form: formKey });
      break;
    }
    if (await page.$(".panel--report")) break; // adopted already (inline path)
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".panel--report", { timeout: 60000 });
  await page.waitForTimeout(300);
  return { context, page, phone: baseForm !== "desktop", formKey, baseForm, reconcileShot };
}

// ---- shared assertion builders ----
const KEY_PATTERN = /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;

function expectedHeadline(m) {
  if (m.gainLines.length > 0) return gainsHeadline(formatNumber(m.totalUnits), m.gainLines.length);
  if (m.kind === "earned") return creditsHeadline(formatNumber(m.creditsGained));
  if (m.kind === "zero-gain") return RETURN_COPY.zeroHeadline;
  return RETURN_COPY.noneHeadline;
}
function expectedApplied(m) {
  return m.kind === "earned" ? RETURN_COPY.appliedEarned : m.kind === "zero-gain" ? RETURN_COPY.appliedZero : RETURN_COPY.appliedNone;
}
function typeFloors(scale, short) {
  if (scale >= 2) return { away: 37, headline: 28, applied: 23, detail: 21, gain: 25, copy: 25 };
  if (short) return { away: 17, headline: 13, applied: 10, detail: 11, gain: 12, copy: 12 };
  return { away: 22, headline: 14, applied: 11, detail: 11, gain: 12, copy: 12 };
}

/** Boot checks: mount contract, oracle parity, hierarchy, one-resume, focus, geometry, canvas. */
function bootChecks(fixture, baseForm, canvas) {
  const f = FORMS[baseForm];
  const floors = typeFloors(fixture.settings.textScale, f.short);
  const model = (a) => deriveReturn(oracle(fixture.sim, Number(a.dom.panel.dataAwayTicks)));
  return [
    { name: "seed envelope passes full decodeSave/validateSim", test: () => fixture.decodeOk === true },
    { name: "seed loaded intact (machines/routes/tutorial preserved)", test: (b, a) => a.sim && a.sim.machines === fixture.sim.machines.length && a.sim.routes === fixture.sim.routes.length && a.sim.tutorial === fixture.sim.tutorial && a.sim.tick >= fixture.sim.tick, detail: (b, a) => `mirror machines=${a.sim && a.sim.machines} routes=${a.sim && a.sim.routes} tutorial=${a.sim && a.sim.tutorial} tick=${a.sim && a.sim.tick} seedTick=${fixture.sim.tick}` },
    { name: "panel mount contract (class/role/aria/title)", test: (b, a) => !!a.dom.panel && a.dom.panel.cls.includes("panel--report") && a.dom.panel.role === "group" && a.dom.panel.aria === "Return report" && a.dom.panel.title === "While you were away" },
    { name: "data attrs mirror the settled report", test: (b, a) => { const m = model(a); return a.dom.panel.dataState === m.kind && a.dom.panel.dataCreditedTicks === String(m.creditedTicks) && a.dom.panel.dataCapped === String(m.capped) && a.dom.panel.dataLongAbsence === String(m.longAbsence); } },
    { name: "awayTicks within seed gap + drift bound", test: (b, a) => { const aw = Number(a.dom.panel.dataAwayTicks); return aw >= fixture.expectedAway && aw <= fixture.expectedAway + DRIFT_TICKS; }, detail: (b, a) => `away=${a.dom.panel.dataAwayTicks} expected=${fixture.expectedAway}..${fixture.expectedAway + DRIFT_TICKS}` },
    { name: "gains match the game's own catchUp oracle (ids/order/values/bars)", test: (b, a) => { const m = model(a); const g = a.dom.panel.gains; if (g.length !== m.gainLines.length) return false; return m.gainLines.every((line, i) => g[i].id === line.id && g[i].value === "+" + line.formatted && g[i].label === line.label && g[i].fillWidth === Math.max(2, Math.round(line.share * 100)) + "%"); }, detail: (b, a) => `dom=${a.dom.panel.gains.map((g) => g.id + g.value).join(",")} oracle=${model(a).gainLines.map((g) => g.id + "+" + g.formatted).join(",")}` },
    { name: "credits line matches oracle (or absent when zero)", test: (b, a) => { const m = model(a); return m.creditsGained > 0 ? !!a.dom.panel.credits && a.dom.panel.credits.value === "+" + formatNumber(m.creditsGained) : a.dom.panel.credits === null; } },
    { name: "headline derives from oracle totals", test: (b, a) => a.dom.panel.summary.headline === expectedHeadline(model(a)), detail: (b, a) => `dom="${a.dom.panel.summary.headline}" expected="${expectedHeadline(model(a))}"` },
    { name: "state chip matches oracle kind/state", test: (b, a) => { const m = model(a); return a.dom.panel.summary.chip === m.stateLabel && a.dom.panel.summary.chipKind === m.kind && a.dom.panel.summary.chipState === m.stateLabel; } },
    { name: "away hero shows day-precision label", test: (b, a) => a.dom.panel.summary.awayValue === model(a).awayLabel, detail: (b, a) => `dom="${a.dom.panel.summary.awayValue}" expected="${model(a).awayLabel}"` },
    { name: "applied status is role=status and says already-applied", test: (b, a) => a.dom.panel.summary.appliedRole === "status" && a.dom.panel.summary.applied === expectedApplied(model(a)) },
    { name: "limits match oracle (long-absence and/or cap, else none)", test: (b, a) => { const m = model(a); const lim = a.dom.panel.limits; if (!m.longAbsence && !m.capped) return lim === null; if (!lim) return false; const has = (k) => lim.items.some((i) => i.dataLimit === k); if (m.longAbsence && (!has("long-absence") || lim.items.find((i) => i.dataLimit === "long-absence").text !== longAbsenceNote(m.awayLabel, m.creditedLabel))) return false; if (m.capped && (!has("cap") || lim.items.find((i) => i.dataLimit === "cap").text !== capNote(m.capHours))) return false; return true; }, detail: (b, a) => `limits=${JSON.stringify(a.dom.panel.limits && a.dom.panel.limits.items.map((i) => i.dataLimit))} long=${model(a).longAbsence} capped=${model(a).capped}` },
    { name: "bottleneck resolved label + advice match oracle", test: (b, a) => { const m = model(a); const bn = a.dom.panel.bottleneck; return bn.data === (m.bottleneck ?? "none") && bn.label === (m.bottleneckLabel ?? RETURN_COPY.noBottleneck) && bn.advice === (m.bottleneck ? BOTTLENECK_ADVICE[m.bottleneck] : RETURN_COPY.noBottleneckAdvice); } },
    { name: "legacy detail rows verbatim (away/worked/deliveries/batches)", test: (b, a) => { const m = model(a); const rows = a.dom.panel.detailRows; const worked = m.capped ? t("report.workedCapped", { duration: m.creditedLabel }) : t("report.worked", { duration: m.creditedLabel }); const has = (v) => rows.some((r) => r.value === v); return has(t("report.away", { duration: m.awayExact })) && has(worked) && has(String(m.deliveries)) && has(String(m.batchesDone)) && (!m.bottleneck || has(m.bottleneckLabel)); }, detail: (b, a) => `rows=${JSON.stringify(a.dom.panel.detailRows.map((r) => r.value))}` },
    { name: "exactly one resume action, no claim, no dialog", test: (b, a) => a.dom.panel.headButtons.length === 1 && a.dom.panel.headButtons[0].cls.includes("icon-btn") && a.dom.panel.headButtons[0].cls.includes("return-resume") && a.dom.panel.headButtons[0].text === "Back to yard" && a.dom.claimButtons.length === 0 && a.dom.dialogCount === 0 },
    { name: "focus lands on the resume action at mount", test: (b, a) => a.dom.active.isResume === true, detail: (b, a) => `active=${a.dom.active.cls}` },
    { name: "no raw i18n keys leak into the report", test: (b, a) => !KEY_PATTERN.test(a.dom.panel.text) },
    { name: "recovery footer present with copy action, no note yet", test: (b, a) => !!a.dom.panel.recovery && a.dom.panel.recovery.title === RETURN_COPY.recoveryTitle && a.dom.panel.recovery.copy.text === RETURN_COPY.copyReport && a.dom.panel.recovery.note === null },
    { name: "panel inside viewport, no horizontal overflow", test: (b, a) => { const p = a.dom.panel.rect, v = a.dom.viewport; return p.left >= -1 && p.right <= v.w + 1 && p.top >= -1 && p.bottom <= v.h + 1 && a.dom.docScrollW <= v.w + 1; }, detail: (b, a) => `panel=${JSON.stringify(a.dom.panel.rect)} vp=${JSON.stringify(a.dom.viewport)} docW=${a.dom.docScrollW}` },
    { name: "resume + copy keep the 44px tap floor", test: (b, a) => a.dom.panel.headButtons[0].rect.width >= 44 && a.dom.panel.headButtons[0].rect.height >= 44 && a.dom.panel.recovery.copy.rect.height >= 44 },
    { name: "summary/detail type stays readable at this scale", test: (b, a) => { const s = a.dom.panel.summary; return s.awayValueFont >= floors.away && s.headlineFont >= floors.headline && s.appliedFont >= floors.applied && a.dom.panel.detailFont >= floors.detail && a.dom.panel.gains.every((g) => g.font >= floors.gain); }, detail: (b, a) => `away=${a.dom.panel.summary.awayValueFont} headline=${a.dom.panel.summary.headlineFont} applied=${a.dom.panel.summary.appliedFont} detail=${a.dom.panel.detailFont} floors=${JSON.stringify(floors)}` },
    { name: f.rail ? "rail gutter: width ~320, right inset ~8" : "phone panel sits above the dock", test: (b, a) => { const p = a.dom.panel.rect; return f.rail ? Math.abs(p.width - 320) <= 2 && Math.abs(p.right - (a.dom.viewport.w - 8)) <= 2 : !a.dom.dock || p.bottom <= a.dom.dock.top + 1; }, detail: (b, a) => `panel=${JSON.stringify(a.dom.panel.rect)} dock=${JSON.stringify(a.dom.dock)}` },
    { name: "body is the declared scroller", test: (b, a) => a.dom.panel.body.overflowY === "auto" || a.dom.panel.body.overflowY === "scroll" },
    { name: "yard canvas is painted (distinct colors + lit fraction)", test: () => canvas.ok && canvas.distinct >= 8 && canvas.litFraction > 0.02, detail: () => `canvas=${JSON.stringify(canvas)}` },
    { name: fixture.workerPath ? "catch-up loading line painted once as role=status (no dialog)" : "inline path: no intrusive loading dialog", test: (b, a) => { if (a.dom.dialogCount !== 0) return false; if (!fixture.workerPath) return true; const hist = a.dom.reconcile.history; return hist.some((h) => h.text === "Catching your yard up" && h.role === "status"); }, detail: (b, a) => `reconcileHistory=${JSON.stringify(a.dom.reconcile.history)} live=${a.dom.reconcile.present}` },
  ];
}

function scrollChecks() {
  return [
    { name: "sticky summary stays pinned while detail scrolls (or whole panel fits)", test: (b, a) => { const body = a.dom.panel.body; if (body.scrollHeight > body.clientHeight + 4) { const sh = a.dom.panel.summary.rect.height; const minOffset = Math.min(0, body.clientHeight - sh); return body.scrollTop > 0 && a.dom.panel.summary.position === "sticky" && a.dom.panel.summary.offsetFromBodyTop <= 2 && a.dom.panel.summary.offsetFromBodyTop >= minOffset - 2; } return a.dom.panel.recovery.copy.rect.bottom <= body.rect.bottom + 1; }, detail: (b, a) => `scrollH=${a.dom.panel.body.scrollHeight} clientH=${a.dom.panel.body.clientHeight} summaryH=${a.dom.panel.summary.rect.height} scrollTop=${a.dom.panel.body.scrollTop} summaryOffset=${a.dom.panel.summary.offsetFromBodyTop}` },
    { name: "recovery copy reachable inside the scroller and viewport", test: (b, a) => { const c = a.dom.panel.recovery.copy.rect, body = a.dom.panel.body.rect, v = a.dom.viewport; return c.top >= body.top - 1 && c.bottom <= body.bottom + 1 && c.top >= 0 && c.bottom <= v.h + 1; }, detail: (b, a) => `copy=${JSON.stringify(a.dom.panel.recovery.copy.rect)} body=${JSON.stringify(a.dom.panel.body.rect)}` },
    { name: "scrolling shrinks no type", test: (b, a) => a.dom.panel.summary.awayValueFont === b.dom.panel.summary.awayValueFont && a.dom.panel.detailFont === b.dom.panel.detailFont },
  ];
}

function closeChecks() {
  return [
    { name: "report unmounts on the one resume action", test: (b, a) => b.dom.panel !== null && a.dom.panel === null },
    { name: "focus restores to a connected visible shell control (never body)", test: (b, a) => a.dom.active.connected && !a.dom.active.isBody && (a.dom.active.isMenuFace || a.dom.active.inDock || a.dom.active.isRailMenu), detail: (b, a) => `active=${a.dom.active.tag}.${a.dom.active.cls} menuFace=${a.dom.active.isMenuFace} railMenu=${a.dom.active.isRailMenu} inDock=${a.dom.active.inDock}` },
    { name: "no gains re-applied on close (store/credits unchanged by dismiss)", test: (b, a) => a.sim.credits === b.sim.credits && a.sim.storeTotal <= b.sim.storeTotal + 64, detail: (b, a) => `credits ${b.sim.credits}->${a.sim.credits} storeTotal ${b.sim.storeTotal}->${a.sim.storeTotal}` },
  ];
}

// ============================ cap reached (phone portrait, full interaction) ============================
async function capLoop(browser) {
  const formKey = "phone-cap";
  const { context, page } = await newPage(browser, formKey, "phone", FIXTURES.cap);
  const canvas = await canvasStats(page);
  const bootAway = Number((await returnDom(page)).panel.dataAwayTicks);

  await runStep(page, formKey, "00-boot", async () => {}, bootChecks(FIXTURES.cap, "phone", canvas));
  await runStep(page, formKey, "01-scroll-recovery", async () => { await scrollBodyToBottom(page); }, scrollChecks());
  await runStep(page, formKey, "02-copy-report", async () => {
    await clickSel(page, ".panel--report .return-copy");
    await page.waitForTimeout(250);
  }, [
    { name: "copy note confirms clipboard success (role=status)", test: (b, a) => !!a.dom.panel.recovery.note && a.dom.panel.recovery.note.role === "status" && a.dom.panel.recovery.note.text === "Copied to the clipboard", detail: (b, a) => `note=${JSON.stringify(a.dom.panel.recovery.note)}` },
    { name: "clipboard holds the deterministic report text", test: async () => false }, // replaced below (async read)
  ]);
  // Async clipboard read (the check above is a placeholder; do the real read here).
  const clipText = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  const m = deriveReturn(oracle(FIXTURES.cap.sim, bootAway));
  const clipOk = clipText.includes("Rustwake return report") && m.gainLines.every((g) => clipText.includes(`${g.label} +${g.formatted}`));
  steps[steps.length - 1].checks[1] = { name: "clipboard holds the deterministic report text", ok: clipOk, detail: `clipLen=${clipText.length} firstLine=${clipText.split("\n")[0]}` };
  if (!clipOk) console.log(`[${formKey}] 02-copy-report: CHECK-FAIL clipboard text`);

  await runStep(page, formKey, "03-close-focus", async () => { await closeReport(page); }, closeChecks());
  await runStep(page, formKey, "04-menu-reopen", async () => {
    await clickSel(page, ".shell-menu-face");
    await page.waitForTimeout(200);
    await clickButton(page, ".shell-menu__row", "Return report");
    await page.waitForSelector(".panel--report", { timeout: 5000 });
    await page.waitForTimeout(200);
  }, [
    { name: "report re-opens from the Menu with the SAME frozen receipt", test: (b, a) => !!a.dom.panel && a.dom.panel.dataAwayTicks === String(bootAway) && a.dom.panel.dataCreditedTicks === String(CAP_TICKS), detail: (b, a) => `away=${a.dom.panel && a.dom.panel.dataAwayTicks} boot=${bootAway}` },
    { name: "re-open focuses the resume action again", test: (b, a) => a.dom.active.isResume === true },
    { name: "re-open applies no new gains (store/credits stable)", test: (b, a) => a.sim.credits === b.sim.credits && a.sim.storeTotal <= b.sim.storeTotal + 64 },
  ]);
  await runStep(page, formKey, "05-escape-focus", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }, [
    { name: "Escape closes the report (App-owned priority chain)", test: (b, a) => b.dom.panel !== null && a.dom.panel === null },
    { name: "Escape unmount restores focus to a shell control", test: (b, a) => a.dom.active.connected && !a.dom.active.isBody && (a.dom.active.isMenuFace || a.dom.active.inDock || a.dom.active.isRailMenu), detail: (b, a) => `active=${a.dom.active.tag}.${a.dom.active.cls}` },
  ]);

  // reload-no-double-apply: the persisted save's lastSeenMs already moved to now.
  const mirror1 = await readMirror(page);
  await runStep(page, formKey, "06-reload-no-double-apply", async () => {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(".gate__btn", { timeout: 20000 });
    await clickSel(page, ".gate__btn");
    await page.waitForSelector(".panel--report", { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
  }, [
    { name: "reload reads the game's persisted save (lastSeen moves forward, no reseed)", test: (b, a) => { const m2 = a.sim; return !!m2; } }, // refined below with mirror2
    { name: "no second cap credit: awayTicks collapses to the real reload gap", test: (b, a) => !a.dom.panel || Number(a.dom.panel.dataAwayTicks) < DRIFT_TICKS, detail: (b, a) => `reloadAway=${a.dom.panel && a.dom.panel.dataAwayTicks} (must be < ${DRIFT_TICKS}, not ${bootAway})` },
    { name: "reload report is not capped again", test: (b, a) => !a.dom.panel || a.dom.panel.dataCapped === "false" },
    { name: "store did not jump by a second cap's gains", test: (b, a) => a.sim.storeTotal - b.sim.storeTotal < m.totalUnits, detail: (b, a) => `storeTotal ${b.sim.storeTotal}->${a.sim.storeTotal} capGains=${m.totalUnits}` },
  ]);
  const mirror2 = await readMirror(page);
  const lastSeenForward = mirror1 && mirror2 && mirror2.lastSeenMs >= mirror1.lastSeenMs;
  steps[steps.length - 1].checks[0] = { name: "reload reads the game's persisted save (lastSeen moves forward, no reseed)", ok: !!lastSeenForward, detail: `lastSeen ${mirror1 && mirror1.lastSeenMs} -> ${mirror2 && mirror2.lastSeenMs}` };
  if (!lastSeenForward) console.log(`[${formKey}] 06-reload: CHECK-FAIL lastSeen forward`);
  await context.close();
}

// ============================ long absence (phone landscape, rail mode) ============================
async function longLoop(browser) {
  const formKey = "phone-landscape-long";
  const { context, page } = await newPage(browser, formKey, "phone-landscape", FIXTURES.long);
  const canvas = await canvasStats(page);
  const checks = bootChecks(FIXTURES.long, "phone-landscape", canvas).concat([
    { name: "long absence reads day precision (3d)", test: (b, a) => /^3d \d+h$/.test(a.dom.panel.summary.awayValue), detail: (b, a) => `away="${a.dom.panel.summary.awayValue}"` },
    { name: "long absence shows BOTH limits (long-absence + cap)", test: (b, a) => !!a.dom.panel.limits && a.dom.panel.limits.items.some((i) => i.dataLimit === "long-absence") && a.dom.panel.limits.items.some((i) => i.dataLimit === "cap") },
    { name: "state chip is Long absence (precedence over Capped)", test: (b, a) => a.dom.panel.summary.chip === "Long absence" && a.dom.panel.dataState === "earned" },
    { name: "legacy detail keeps the hour-capped away exact (72h)", test: (b, a) => a.dom.panel.detailRows.some((r) => /^72h \d+m$/.test(r.value || "") || (r.value || "").includes("72h")), detail: (b, a) => `rows=${JSON.stringify(a.dom.panel.detailRows.map((r) => r.value))}` },
    { name: "landscape is rail mode", test: (b, a) => a.dom.railMode === true },
  ]);
  await runStep(page, formKey, "00-boot", async () => {}, checks);
  await runStep(page, formKey, "01-scroll-recovery", async () => { await scrollBodyToBottom(page); }, scrollChecks());
  await runStep(page, formKey, "02-close-focus", async () => { await closeReport(page); }, closeChecks());
  await context.close();
}

// ============================ zero gain (phone portrait) + byte-equal reload ============================
async function zeroLoop(browser) {
  const formKey = "phone-zero";
  const { context, page } = await newPage(browser, formKey, "phone", FIXTURES.zero);
  const canvas = await canvasStats(page);
  const checks = bootChecks(FIXTURES.zero, "phone", canvas).concat([
    { name: "zero-gain kind, no gains list, no limits", test: (b, a) => a.dom.panel.dataState === "zero-gain" && a.dom.panel.gains.length === 0 && a.dom.panel.limits === null },
    { name: "zero headline + body explain nothing reached storage", test: (b, a) => a.dom.panel.summary.headline === RETURN_COPY.zeroHeadline && a.dom.panel.summary.zero === RETURN_COPY.zeroBody },
    { name: "idle yard reports no bottleneck", test: (b, a) => a.dom.panel.bottleneck.data === "none" && a.dom.panel.bottleneck.label === RETURN_COPY.noBottleneck },
  ]);
  await runStep(page, formKey, "00-boot", async () => {}, checks);

  const mirror1 = await readMirror(page);
  await runStep(page, formKey, "01-reload-byte-equal", async () => {
    await closeReport(page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(".gate__btn", { timeout: 20000 });
    await clickSel(page, ".gate__btn");
    await page.waitForSelector(".panel--report", { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
  }, [
    { name: "idle yard store is byte-equal across reload (no double apply)", test: (b, a) => JSON.stringify(a.sim.store) === JSON.stringify(b.sim.store), detail: (b, a) => `store ${JSON.stringify(b.sim.store)} -> ${JSON.stringify(a.sim.store)}` },
    { name: "credits unchanged across reload", test: (b, a) => a.sim.credits === b.sim.credits },
    { name: "reload gap is tiny, not the seeded absence", test: (b, a) => !a.dom.panel || Number(a.dom.panel.dataAwayTicks) < DRIFT_TICKS, detail: (b, a) => `reloadAway=${a.dom.panel && a.dom.panel.dataAwayTicks}` },
    { name: "lastSeen moves forward (persisted save, no reseed)", test: (b, a) => true }, // refined below
  ]);
  const mirror2 = await readMirror(page);
  const fwd = mirror1 && mirror2 && mirror2.lastSeenMs >= mirror1.lastSeenMs;
  steps[steps.length - 1].checks[3] = { name: "lastSeen moves forward (persisted save, no reseed)", ok: !!fwd, detail: `lastSeen ${mirror1 && mirror1.lastSeenMs} -> ${mirror2 && mirror2.lastSeenMs}` };
  if (!fwd) console.log(`[${formKey}] 01-reload: CHECK-FAIL lastSeen forward`);
  await context.close();
}

// ============================ short absence (desktop, rail mode) ============================
async function shortLoop(browser) {
  const formKey = "desktop-short";
  const { context, page } = await newPage(browser, formKey, "desktop", FIXTURES.short);
  const canvas = await canvasStats(page);
  const checks = bootChecks(FIXTURES.short, "desktop", canvas).concat([
    { name: "short absence is earned, not capped, no limits", test: (b, a) => a.dom.panel.dataState === "earned" && a.dom.panel.dataCapped === "false" && a.dom.panel.limits === null },
    { name: "desktop is rail mode", test: (b, a) => a.dom.railMode === true },
  ]);
  await runStep(page, formKey, "00-boot", async () => {}, checks);
  await runStep(page, formKey, "01-close-focus", async () => { await closeReport(page); }, closeChecks());
  await context.close();
}

// ============================ large text (phone portrait, scale 2) ============================
async function largeLoop(browser) {
  const formKey = "phone-large";
  const { context, page } = await newPage(browser, formKey, "phone", FIXTURES.large);
  const canvas = await canvasStats(page);
  const checks = bootChecks(FIXTURES.large, "phone", canvas).concat([
    { name: "text scale 2 engages .text-large and 30px root", test: (b, a) => a.dom.textLarge === true && Math.abs(a.dom.rootFontSize - 30) <= 0.5, detail: (b, a) => `textLarge=${a.dom.textLarge} root=${a.dom.rootFontSize}` },
    { name: "hero stays >= 37px at scale 2 (type never shrunk for room)", test: (b, a) => a.dom.panel.summary.awayValueFont >= 37, detail: (b, a) => `awayFont=${a.dom.panel.summary.awayValueFont}` },
    { name: "cap receipt still correct at large text", test: (b, a) => a.dom.panel.dataCapped === "true" && a.dom.panel.dataCreditedTicks === String(CAP_TICKS) },
  ]);
  await runStep(page, formKey, "00-boot", async () => {}, checks);
  await runStep(page, formKey, "01-scroll-tail", async () => { await scrollBodyToBottom(page); }, scrollChecks());
  await runStep(page, formKey, "02-close-focus", async () => { await closeReport(page); }, closeChecks());
  await context.close();
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
      const meta = frameMeta.find((mm) => mm.name === r.replaceAll("\\", "/"));
      const formKey = r.split(/[\\/]/)[0];
      const exp = expectedDims[formKey] || null;
      const dimsOk = exp ? w === exp.w && h === exp.h : true;
      const hashOk = meta ? meta.sha256 === sha : false;
      const nonEmpty = buf.length > 1000;
      results.push({ frame: r.replaceAll("\\", "/"), bytes: buf.length, width: w, height: h, sha256: sha, dimsOk, hashOk, nonEmpty, ok: dimsOk && hashOk && nonEmpty });
    }
  };
  walk(FRAMES);
  return results;
}

async function main() {
  if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  mkdirSync(EVID, { recursive: true });
  console.log("BASE_URL=", BASE_URL, "BUILD_SHA=", BUILD_SHA, "chrome=", executablePath, "EVID=", EVID);
  const browser = await chromium.launch({ executablePath, headless: true });
  const plan = [
    ["phone-cap", capLoop],
    ["phone-landscape-long", longLoop],
    ["phone-zero", zeroLoop],
    ["desktop-short", shortLoop],
    ["phone-large", largeLoop],
  ];
  for (const [name, loop] of plan) {
    try { await loop(browser); }
    catch (e) { blockers.push(`${name} FATAL: ${String((e && e.stack) || e)}`); console.error(e); }
  }
  await browser.close();

  const expectedDims = {
    "phone-cap": FORMS.phone.dims,
    "phone-landscape-long": FORMS["phone-landscape"].dims,
    "phone-zero": FORMS.phone.dims,
    "desktop-short": FORMS.desktop.dims,
    "phone-large": FORMS.phone.dims,
  };
  const audit = auditFrames(expectedDims);
  const auditOk = audit.every((a) => a.ok);
  const byForm = {};
  for (const a of audit) { const k = a.frame.split("/")[0]; (byForm[k] ||= []).push(a.sha256); }
  const distinct = Object.fromEntries(Object.entries(byForm).map(([k, v]) => [k, new Set(v).size > 1]));
  const totalFrameBytes = audit.reduce((s, a) => s + a.bytes, 0);

  const allChecks = steps.flatMap((s) => s.checks.map((c) => ({ form: s.form, step: s.step, ...c })));
  const failedChecks = allChecks.filter((c) => !c.ok);
  const results = {
    issue: 61, role: "developer", buildSha: BUILD_SHA, baseUrl: BASE_URL, branch: "rw/61-return",
    generatedAt: new Date().toISOString(), chrome: executablePath,
    method: "headless Chrome DOM + geometry + canvas-pixel + persisted-state mirror only; no vision. Screenshots are hashed mirrors, not inspected visually. Report parity anchored to the game's OWN catchUp oracle on a seed clone at the DOM's exact awayTicks.",
    fixtureScrutiny: {
      a: "Only setup seeding mutates state: fixtures are docs/evidence/yard-mature.json payload.sim VERBATIM (cap/long/short/large) or createInitialState() (zero), re-encoded with the game's OWN encodeSave and lastSeenMs=Date.now()-gap in the past. No sim field edited. A probe-only 'rw61.seeded' marker writes the seed once per context so reloads read the game's own persisted save. Every action is a real UI click/tap/key/scroll/reload.",
      b: "Documented in this probe header, the FIXTURES table and results.json.",
      c: "Every seeded envelope passes the game's full decodeSave/repairRegistration/validateSim (asserted). Boot steps assert the loaded mirror kept the seed's machines/routes/tutorial. Report gains/credits/deliveries/batches/bottleneck are compared to the game's OWN catchUp run on a seed clone at the DOM's awayTicks — exact, not hand-written. No invariant weakened.",
      d: "No action faked by injection; localStorage read only as the game's own persistence mirror. Clipboard success uses a real granted permission; refusal/missing-API branches are unit-covered (return-61.test.tsx), not faked here.",
    },
    fixtures: Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [k, {
      source: k === "zero" ? "createInitialState()" : "docs/evidence/yard-mature.json payload.sim verbatim",
      gapMs: v.gapMs, expectedAway: v.expectedAway, textScale: v.settings.textScale,
      machines: v.sim.machines.length, routes: v.sim.routes.length, decodeOk: v.decodeOk, workerPath: v.workerPath,
    }])),
    counts: { frames: audit.length, totalFrameBytes, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length },
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, frames: audit },
    findings: [
      { id: "report-is-a-receipt-not-a-claim", verdict: "by-design-61", detail: "adoptCatchUp credits an absence exactly once and moves lastSeenMs to nowMs before the panel mounts. The redesign has one resume action and no claim/dispatch; dismiss, Menu re-open, Escape and reload all leave the ledger unchanged (proven by 03/04/05/06 and the byte-equal idle reload).", source: "src/app/store.ts adoptCatchUp/creditAbsence; src/ui/panels/ReturnReportPanel.tsx" },
      { id: "loading-line-owned-by-app", verdict: "existing-design-not-changed-by-61", detail: "The catch-up loading moment is App.tsx's single `.reconcile` role=status line ('Catching your yard up'), painted only while isReconciling() and never as a dialog. #61 does not edit App.tsx; the probe records it via a pre-script MutationObserver and asserts no [role=dialog] appears.", source: "src/ui/App.tsx:991-996; src/game/workers/catchup.ts" },
      { id: "clipboard-refusal-unit-covered", verdict: "graceful-degradation", detail: "The live probe exercises the clipboard SUCCESS path with a real granted permission. The refusal and missing-API branches (copyFailed note) are covered deterministically in return-61.test.tsx via configurable navigator.clipboard stubs; they are not faked in the live probe.", source: "tests/ui/return-61.test.tsx recovery block; src/ui/panels/ReturnReportPanel.tsx copyReport" },
      { id: "reload-gap-is-real-not-zero", verdict: "lease-semantics", detail: "A reload after the steps have run measures a small real gap (lastSeen moved to now at adoption), so a tiny inline report may reappear; awayTicks collapses below the drift bound and the store never jumps by a second cap's gains. LEASE_TTL_MS=1500 makes a 60s-gap reload a legitimate writer re-claim, not a double credit.", source: "src/game/persistence/lease.ts; src/app/store.ts reconcile/creditAbsence" },
    ],
    failedChecks, blockers, consoleErrors, pageErrors,
    steps,
  };
  writeFileSync(resolve(EVID, "results.json"), JSON.stringify(results, null, 2));

  // Trimmed committed index: checks + counts + frame hashes + scrutiny, no heavy DOM dumps.
  const index = {
    issue: 61, role: "developer", buildSha: BUILD_SHA, baseUrl: BASE_URL, branch: "rw/61-return",
    generatedAt: results.generatedAt, chrome: executablePath, method: results.method,
    fixtureScrutiny: results.fixtureScrutiny, fixtures: results.fixtures, counts: results.counts,
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, totalFrameBytes, frames: audit.map((a) => ({ frame: a.frame, bytes: a.bytes, width: a.width, height: a.height, sha256: a.sha256, ok: a.ok })) },
    findings: results.findings,
    checks: allChecks.map((c) => ({ form: c.form, step: c.step, name: c.name, ok: c.ok, detail: c.detail })),
    failedChecks, blockers, consoleErrors, pageErrors,
    fullResults: resolve(EVID, "results.json"),
    framesDir: FRAMES,
  };
  writeFileSync(resolve(ROOT, "tests/ui/return-61.results.json"), JSON.stringify(index, null, 2));

  console.log("\n==== SUMMARY ====");
  console.log("frames=", audit.length, "totalFrameBytes=", totalFrameBytes, "auditOk=", auditOk, "distinct=", JSON.stringify(distinct));
  console.log("steps=", steps.length, "checks=", allChecks.length, "failedChecks=", failedChecks.length);
  console.log("consoleErrors=", consoleErrors.length, "pageErrors=", pageErrors.length, "blockers=", blockers.length);
  if (failedChecks.length) { console.log("FAILED CHECKS:"); for (const c of failedChecks) console.log(`  [${c.form}] ${c.step}: ${c.name} ${c.detail}`); }
  if (blockers.length) { console.log("BLOCKERS:"); for (const b of blockers) console.log("  " + b); }
  if (consoleErrors.length) { console.log("CONSOLE ERRORS:"); for (const e of consoleErrors.slice(0, 20)) console.log("  " + e); }
  if (pageErrors.length) { console.log("PAGE ERRORS:"); for (const e of pageErrors.slice(0, 20)) console.log("  " + e); }
  if (failedChecks.length || blockers.length || pageErrors.length || consoleErrors.length || !auditOk) process.exitCode = 1;
}

main().catch((e) => { console.error("PROBE FATAL:", e); process.exitCode = 1; });
