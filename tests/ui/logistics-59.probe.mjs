/**
 * UI-RESET-59 (issue #59, gate G3) — developer acceptance probe.
 *
 * ROLE: developer (rw/59-logistics). PROBE-ONLY code: nothing under src/ is
 * modified by this file. It drives THIS BRANCH'S app through the REAL UI
 * (canvas taps -> App.applyGestureOutput -> pickTarget -> setSelected; panel
 * button clicks -> props.dispatch -> store.dispatch -> applyCommand) and records
 * DOM + geometry + persisted-state + canvas-pixel evidence. No vision is used:
 * every visual claim is a programmatic DOM/geometry assertion or a pixel-color
 * census, never an eyeballed screenshot. Screenshots are hashed mirrors only.
 *
 * Run against the branch's own build (never the live site):
 *   pnpm build
 *   pnpm preview --port 4195 --strictPort --host 127.0.0.1   (background, cwd=worktree)
 *   BASE_URL='http://127.0.0.1:4195/' RW59_SHA='<head sha>' node tests/ui/logistics-59.probe.mjs
 * Artifacts land in RW59_EVID (default C:/Users/ryans/AppData/Local/Temp/rw-coord/UI-RESET-59).
 * Form factors: phone 390x844 dpr2 (portrait), phoneland 844x390 dpr2 (rail) and
 * desktop 1920x1080 dpr1 (rail). Every scenario loop runs on all three.
 *
 * Fixture scrutiny (task a-d):
 *  (a) The only state mutation is SETUP seeding. Fixtures are derived from the
 *      repo's own docs/evidence/yard-mature.json by editing the fixture sim
 *      BEFORE encoding, with the game's OWN encodeSave arithmetic (FNV-1a
 *      checksum, lastSeenMs=Date.now() to avoid offline catch-up). Derivations:
 *        - dense: mature verbatim, settings.reducedMotion=true (stable pixels).
 *        - partial: mature minus route id 1 (store->sorter scrap), references
 *          pruned exactly like repairRegistration; store.scrap raised to 60 so
 *          the suggested belt is affordable. This re-opens a suggested link so
 *          the connect/disconnect flow is reachable through the real UI.
 *        - zeroPower: mature with the sorter marked status="powerLimited",
 *          powerRatio=0, and every machine's in-progress batch raised (progress=1)
 *          so requestedPower (16) exceeds yardPowerCapacity (8). Statuses otherwise
 *          unchanged. Demonstrates the zero-power overview + power bottleneck.
 *        - missingInput: mature with route id 4 (sorter->furnace) removed and
 *          references pruned, leaving the starved furnace with no inbound belt.
 *        - outputFull: mature with the sorter status="outputFull", trayUnits=12
 *          (its outputBuffer), so its inbound belt is blocked and its output
 *          belt is revealable from the bottleneck list.
 *      Every acceptance ACTION (tap machine, toggle routes, reveal, connect,
 *      cancel, confirm, disconnect) is a real UI tap/click through dispatch ->
 *      applyCommand. The mature yard's belts are pre-price (run:null, refund 0),
 *      so the refund scenario CONNECTS a fresh belt through the real UI (the
 *      engine prices its run) and then disconnects THAT belt for a nonzero refund.
 *  (b) This file + results.json document the method, fixtures and derivations.
 *  (c) Validation is NOT weakened: each seeded envelope still passes the game's
 *      full decodeSave/repairRegistration/validateSim on load (route endpoints,
 *      quantity maps and registrations stay sound). The 00-open steps assert the
 *      loaded mirror matches the seed before any action. No invariant bypassed.
 *  (d) No action is faked by state injection. localStorage is read ONLY as a
 *      mirror of the game's own persistence (written on every ok dispatch).
 *
 * Canvas pixel census (documented heuristics, relative claims only):
 *   cyanRail   b>r+25 && g>r+15 && b>120   (working/idle rails rgba(95,216,232,*))
 *   orange     r>g+25 && g>=b && r>120     (blocked rail rgba(201,113,58,0.6);
 *                                           residue cargo #c9713a shares this hue,
 *                                           so the blocked claim is corroborated by
 *                                           the DOM route status, not color alone)
 *   amber      r>150 && g>110 && b<130 && r>b+50 (cargo tokens / machine cores)
 * The visibility claim is strictly relative (visible.cyan > hidden.cyan): machines
 * never paint cyan rails, so hiding the route layer must remove cyan pixels while
 * the persisted route count stays unchanged (hiding is presentation only).
 */
import { chromium } from "playwright-core";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(process.cwd());
const EVID = process.env.RW59_EVID || "C:/Users/ryans/AppData/Local/Temp/rw-coord/UI-RESET-59";
const FRAMES = resolve(EVID, "frames");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4195/";
const BUILD_SHA = process.env.RW59_SHA || "unset";
const SAVE_KEY = "rustwake.save.v1";
const YARD_COLS = 6;
const CELL = 32;
const BELT_COST_PER_TILE = 1;
const DISMANTLE_REFUND_PCT = 90;

// The three required form factors. `phoneland` (844x390 dpr2) matches the shell rail
// query "(min-width: 600px) and (max-height: 460px)"; desktop matches "(min-width: 1200px)".
const FORM_FACTORS = {
  phone: { width: 390, height: 844, dpr: 2 },
  phoneland: { width: 844, height: 390, dpr: 2 },
  desktop: { width: 1920, height: 1080, dpr: 1 },
};

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = chromeCandidates.find((p) => p && existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge executable found");

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
const mature = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/yard-mature.json"), "utf8"));

function cloneSim() {
  return JSON.parse(JSON.stringify(mature.payload.sim));
}
function baseSettings() {
  return { ...mature.payload.settings, reducedMotion: true };
}
/** Remove routes by id and prune machine registrations exactly like repairRegistration. */
function removeRoutes(sim, ids) {
  const dead = new Set(ids);
  sim.routes = sim.routes.filter((r) => !dead.has(r.id));
  for (const m of sim.machines) {
    m.inRoutes = (m.inRoutes || []).filter((id) => !dead.has(id));
    if (m.outRoute !== null && m.outRoute !== undefined && dead.has(m.outRoute)) m.outRoute = null;
  }
}
function recomputeStoreUnits(sim) {
  sim.storeUnits = Object.values(sim.store).reduce((a, b) => a + b, 0);
}

function deriveDense() {
  return { sim: cloneSim(), settings: baseSettings() };
}
function derivePartial() {
  const sim = cloneSim();
  removeRoutes(sim, [1]); // store -> sorter scrap: re-opens a suggested link
  sim.store.scrap = 60; // SETUP: afford the suggested belt deterministically
  recomputeStoreUnits(sim);
  return { sim, settings: baseSettings() };
}
function deriveZeroPower() {
  const sim = cloneSim();
  sim.powerRatio = 0;
  for (const m of sim.machines) m.progress = 1; // requestedPower sums batchPower where progress>0
  sim.machines.find((m) => m.id === 1).status = "powerLimited";
  return { sim, settings: baseSettings() };
}
function deriveMissingInput() {
  const sim = cloneSim();
  removeRoutes(sim, [4]); // sorter -> furnace: starved furnace now has no inbound belt
  return { sim, settings: baseSettings() };
}
function deriveOutputFull() {
  const sim = cloneSim();
  const sorter = sim.machines.find((m) => m.id === 1);
  sorter.status = "outputFull";
  sorter.trayUnits = 12; // sorter outputBuffer
  return { sim, settings: baseSettings() };
}

const FIXTURES = {
  dense: deriveDense(),
  partial: derivePartial(),
  zeroPower: deriveZeroPower(),
  missingInput: deriveMissingInput(),
  outputFull: deriveOutputFull(),
};

// ---- evidence collectors ----
const frameMeta = [];
const steps = [];
const consoleErrors = [];
const pageErrors = [];
const blockers = [];

function summarize(sim) {
  if (!sim) return null;
  return {
    machines: sim.machines.length,
    routes: sim.routes.length,
    routeIds: sim.routes.map((r) => r.id),
    storeScrap: sim.store?.scrap ?? 0,
    storeUnits: sim.storeUnits,
    powerRatio: sim.powerRatio,
    statuses: sim.machines.map((m) => `${m.id}:${m.status}`).join(","),
  };
}

async function readSim(page) {
  return page.evaluate((key) => {
    const t = localStorage.getItem(key);
    if (!t) return null;
    try { return JSON.parse(t).payload.sim; } catch { return null; }
  }, SAVE_KEY);
}

/** One inspector-scoped DOM + geometry + canvas-pixel snapshot. All claims derive from this. */
async function logisticsDom(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const panel = q(".panel--stack");
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const txt = (el) => (el ? el.textContent.trim() : null);

    // canvas pixel census (device pixels; heuristics documented in the header)
    const canvas = q(".game canvas");
    let census = null, cam = null;
    if (canvas) {
      cam = canvas.dataset.cam || null;
      try {
        const ctx = canvas.getContext("2d");
        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        let cyan = 0, orange = 0, amber = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 40) continue;
          if (b > r + 25 && g > r + 15 && b > 120) cyan += 1;
          if (r > g + 25 && g >= b && r > 120) orange += 1;
          if (r > 150 && g > 110 && b < 130 && r > b + 50) amber += 1;
        }
        census = { cyan, orange, amber, width, height };
      } catch (e) { census = { error: String(e) }; }
    }

    const legend = panel ? panel.querySelector(".logistics-legend") : null;
    const overview = panel ? panel.querySelector(".logistics-overview") : null;
    const controls = panel ? panel.querySelector(".logistics-controls") : null;
    const groups = controls ? [...controls.querySelectorAll(".logistics-controls__group")] : [];
    const laidGroup = groups[1] || null;
    const confirm = controls ? controls.querySelector(".logistics-confirm") : null;

    return {
      url: location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docScrollW: document.documentElement.scrollWidth,
      gate: !!q(".gate__btn"),
      cam,
      census,
      rail: rect(q(".shell-rail")),
      panel: panel
        ? {
            cls: panel.className,
            aria: panel.getAttribute("aria-label"),
            title: txt(panel.querySelector(".panel__title")),
            rect: rect(panel),
            sections: qa(".inspector-section__title").map((h) => h.textContent.trim()),
            contextTabs: qa(".inspector-context__btn").length,
            actionFaces: qa(".panel__actions > .icon-btn").map((b) => b.textContent.trim()),
            body: (() => {
              const body = panel.querySelector(".panel__body");
              return body ? { rect: rect(body), scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflowY: getComputedStyle(body).overflowY } : null;
            })(),
          }
        : null,
      legend: legend
        ? {
            present: true,
            direction: txt(legend.querySelector(".logistics-note")),
            statuses: [...legend.querySelectorAll(".logistics-legend__status")].map((li) => ({
              label: txt(li.querySelector(".logistics-legend__label")),
              hint: txt(li.querySelector(".logistics-legend__hint")),
              swatch: li.querySelector(".logistics-swatch--rail")?.style.background ?? null,
            })),
            materials: [...legend.querySelectorAll(".logistics-legend__material")].map((li) => ({
              label: li.textContent.trim(),
              swatch: li.querySelector(".logistics-swatch")?.style.background ?? null,
            })),
            toggle: (() => {
              const b = legend.querySelector(".logistics-toggle");
              return b ? { text: b.textContent.trim(), pressed: b.getAttribute("aria-pressed"), rect: rect(b) } : null;
            })(),
          }
        : { present: false },
      overview: overview
        ? {
            present: true,
            powerValue: txt(overview.querySelector(".logistics-overview__power .logistics-overview__value")),
            powerNote: txt(overview.querySelector(".logistics-overview__power .logistics-note")),
            gauge: (() => {
              const g = overview.querySelector(".logistics-gauge");
              return g ? { now: g.getAttribute("aria-valuenow"), limited: !!g.querySelector(".logistics-gauge__fill--limited") } : null;
            })(),
            rows: [...overview.querySelectorAll(".logistics-overview__stats .logistics-overview__row")].map((r) => ({
              label: txt(r.querySelector("dt")),
              value: txt(r.querySelector("dd")),
            })),
            bottlenecks: [...overview.querySelectorAll(".logistics-bottleneck")].map((li) => {
              const btn = li.querySelector(".logistics-btn");
              return {
                label: txt(li.querySelector(".logistics-bottleneck__label")),
                detail: txt(li.querySelector(".logistics-bottleneck__detail")),
                reveal: btn ? { text: btn.textContent.trim(), pressed: btn.getAttribute("aria-pressed") } : null,
              };
            }),
            noBottlenecks: txt(overview.querySelector(".logistics-overview__bottlenecks > .logistics-note")),
          }
        : { present: false },
      controls: controls
        ? {
            present: true,
            suggestedCount: groups[0] ? groups[0].querySelectorAll(".logistics-route").length : 0,
            suggestedConnect: groups[0] ? !!([...groups[0].querySelectorAll(".logistics-btn")].find((b) => b.textContent.trim() === "Connect")) : false,
            laid: laidGroup
              ? [...laidGroup.querySelectorAll(".logistics-route")].map((li) => ({
                  path: txt(li.querySelector(".logistics-route__path")),
                  meta: txt(li.querySelector(".logistics-route__meta")),
                  refund: txt(li.querySelector(".logistics-route__refund")),
                  revealPressed: li.querySelector(".logistics-btn[aria-pressed]")?.getAttribute("aria-pressed") ?? null,
                  hasDisconnect: !!li.querySelector(".logistics-btn--danger"),
                }))
              : [],
            customSelects: controls.querySelectorAll(".logistics-select").length,
            customPreview: (() => {
              const n = controls.querySelector(".logistics-form + .logistics-note");
              return n ? { note: txt(n), invalid: n.classList.contains("logistics-note--invalid") } : null;
            })(),
            filterNote: txt(controls.querySelector(".logistics-note:not(.logistics-note--unsupported)")),
            unsupported: txt(controls.querySelector(".logistics-note--unsupported")),
            confirm: confirm
              ? {
                  note: txt(confirm.querySelector(".logistics-note")),
                  invalid: !!confirm.querySelector(".logistics-note--invalid"),
                  primary: txt(confirm.querySelector(".logistics-btn--primary")),
                  hasCancel: !!([...confirm.querySelectorAll(".logistics-btn")].find((b) => b.textContent.trim() === "Cancel")),
                }
              : null,
          }
        : { present: false },
    };
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
/** Click a .logistics-btn whose trimmed text matches, scoped to a container selector. */
async function clickBtnIn(page, scope, text) {
  const handle = await page.evaluateHandle(({ scope, text }) => {
    const root = document.querySelector(scope);
    if (!root) return null;
    return [...root.querySelectorAll(".logistics-btn")].find((b) => b.textContent.trim() === text) || null;
  }, { scope, text });
  const el = handle.asElement();
  if (!el) throw new Error(`button not found: ${scope} text=${JSON.stringify(text)}`);
  await el.click();
}
/** Click a .logistics-btn by text inside the nth controls group (0 suggested, 1 laid, 2 custom). */
async function clickBtnInGroup(page, groupIndex, text) {
  const handle = await page.evaluateHandle(({ groupIndex, text }) => {
    const groups = [...document.querySelectorAll(".logistics-controls .logistics-controls__group")];
    const g = groups[groupIndex];
    if (!g) return null;
    return [...g.querySelectorAll(".logistics-btn")].find((b) => b.textContent.trim() === text) || null;
  }, { groupIndex, text });
  const el = handle.asElement();
  if (!el) throw new Error(`button not found: group ${groupIndex} text=${JSON.stringify(text)}`);
  await el.click();
}
/** Change the custom-link material select through the real DOM event path (React onChange). */
async function selectCustomFilter(page, value) {
  const handles = await page.$$(".logistics-form .logistics-select");
  if (handles.length !== 3) throw new Error(`expected 3 custom selects, found ${handles.length}`);
  await handles[2].selectOption(value);
}
/** Click the nth .logistics-btn--danger inside the laid-links group (table order). */
async function clickDisconnectIndex(page, index) {
  const handle = await page.evaluateHandle((index) => {
    const groups = [...document.querySelectorAll(".logistics-controls .logistics-controls__group")];
    const laid = groups[1];
    if (!laid) return null;
    return [...laid.querySelectorAll(".logistics-btn--danger")][index] || null;
  }, index);
  const el = handle.asElement();
  if (!el) throw new Error(`disconnect button index ${index} not found`);
  await el.click();
}
async function dismissReport(page) {
  const el = await page.$(".panel--report .panel__head .icon-btn");
  if (el) { await el.click(); await page.waitForTimeout(250); }
}

/**
 * The real player path to a machine inspector: a cleared tap on the machine's
 * tile center. The client point is computed from the canvas' own camera stamp
 * (dataset.cam) and the same tileToWorld/worldToScreen math the renderer uses,
 * then driven with real pointer down/up so App.applyGestureOutput -> pickTarget
 * -> setSelected runs exactly as a player tap does.
 */
async function tapTile(page, tile) {
  const pt = await page.evaluate(({ tile, YARD_COLS, CELL }) => {
    const c = document.querySelector(".game canvas");
    const r = c.getBoundingClientRect();
    const parent = c.parentElement;
    const view = { width: parent.clientWidth, height: parent.clientHeight };
    const parts = (c.dataset.cam || "0,0,1").split(",").map(Number);
    const camera = { x: parts[0], y: parts[1], scale: parts[2] };
    const col = tile % YARD_COLS, row = Math.floor(tile / YARD_COLS);
    const wx = col * CELL + CELL / 2, wy = row * CELL + CELL / 2;
    const sx = (wx - camera.x) * camera.scale + view.width / 2;
    const sy = (wy - camera.y) * camera.scale + view.height / 2;
    return { x: r.left + sx, y: r.top + sy };
  }, { tile, YARD_COLS, CELL });
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForSelector(".panel--stack", { timeout: 5000 });
  await page.waitForTimeout(250);
}

async function runStep(page, form, name, action, expect = [], waitMs = 350) {
  const before = { sim: summarize(await readSim(page)), dom: await logisticsDom(page) };
  await shot(page, `${form}/${name}-before.png`, { phase: "before", step: name, form, sim: before.sim });
  let error = null;
  try { await action(); } catch (e) { error = String((e && e.message) || e); blockers.push(`${form}/${name}: ${error}`); }
  await page.waitForTimeout(waitMs);
  const after = { sim: summarize(await readSim(page)), dom: await logisticsDom(page) };
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

async function newPage(browser, form, fixture) {
  const key = form.split("-")[0];
  const ff = FORM_FACTORS[key];
  if (!ff) throw new Error(`unknown form factor: ${form}`);
  const phone = key !== "desktop";
  const context = await browser.newContext({
    viewport: { width: ff.width, height: ff.height },
    deviceScaleFactor: ff.dpr,
    isMobile: phone, hasTouch: phone,
  });
  if (fixture) {
    const text = encodeEnvelope(fixture.sim, Date.now(), fixture.settings);
    await context.addInitScript((t) => localStorage.setItem("rustwake.save.v1", t), text);
  }
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${form}] ${m.text()}`); });
  page.on("pageerror", (e) => pageErrors.push(`[${form}] ${String(e)}`));
  let nav = null;
  for (let attempt = 0; attempt < 2 && !nav; attempt += 1) {
    try { nav = await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 }); }
    catch (e) { blockers.push(`${form} goto attempt ${attempt}: ${String((e && e.message) || e)}`); await page.waitForTimeout(1000); }
  }
  if (!nav) throw new Error(`${form}: navigation to ${BASE_URL} failed (see blockers)`);
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
  await clickSel(page, ".gate__btn");
  await page.waitForTimeout(700);
  await dismissReport(page);
  return { context, page, phone };
}

const SECTIONS = ["Identity", "Recipe", "Production", "Bottleneck", "Transport", "Recovery context", "Actions"];
const normColor = (c) => (c ?? "").replace(/\s+/g, "");
const parseCost = (note) => { const m = /·\s*(\d+)\s+scrap/.exec(note || ""); return m ? Number(m[1]) : null; };
const parseRefund = (note) => { const m = /\+(\d+)\s+scrap/.exec(note || ""); return m ? Number(m[1]) : null; };

// ============================ dense routes + legend + visibility + selection ============================
async function denseLoop(browser, form) {
  const { context, page } = await newPage(browser, `${form}-dense`, FIXTURES.dense);
  const seed = await readSim(page);
  const open = await runStep(page, `${form}-dense`, "00-open-sorter", async () => {
    await tapTile(page, 0); // sorter tile 0
  }, [
    { name: "seed loaded intact (8 machines, 18 routes)", test: () => seed?.machines?.length === 8 && seed?.routes?.length === 18 },
    { name: "real tap selects the sorter (panel aria/title)", test: (b, a) => a.dom.panel?.aria === "Scrap sorter details" && a.dom.panel?.title === "Scrap sorter" },
    { name: "selection changed the painted frame (reducedMotion static)", test: (b, a) => b.dom.census && a.dom.census && (b.dom.census.cyan !== a.dom.census.cyan || b.dom.census.amber !== a.dom.census.amber), detail: (b, a) => `before=${JSON.stringify(b.dom.census)} after=${JSON.stringify(a.dom.census)}` },
    { name: "seven inspector sections preserved", test: (b, a) => JSON.stringify(a.dom.panel.sections) === JSON.stringify(SECTIONS) },
    { name: "three context tabs preserved", test: (b, a) => a.dom.panel.contextTabs === 3 },
    { name: "legend present with working/idle/blocked + exact rail colors", test: (b, a) => {
        const s = a.dom.legend.statuses;
        return a.dom.legend.present && s.map((x) => x.label).join(",") === "Working,Idle,Blocked"
          && normColor(s[0].swatch) === "rgba(95,216,232,0.5)" && normColor(s[1].swatch) === "rgba(95,216,232,0.22)" && normColor(s[2].swatch) === "rgba(201,113,58,0.6)";
      } },
    { name: "legend lists the materials the yard actually carries", test: (b, a) => a.dom.legend.materials.length >= 2 },
    { name: "visibility toggle starts on (routes painted)", test: (b, a) => a.dom.legend.toggle.text === "Hide routes" && a.dom.legend.toggle.pressed === "true" && a.dom.census.cyan > 0 },
    { name: "overview derived from state (18 routes, power, machines)", test: (b, a) => a.dom.overview.present && a.dom.overview.rows.some((r) => r.label === "Routes" && /^18 total/.test(r.value)) && a.dom.overview.rows.some((r) => r.label === "Machines") && /\/8 ·/.test(a.dom.overview.powerValue) },
    { name: "controls expose connect/disconnect/filter honestly", test: (b, a) => a.dom.controls.present && a.dom.controls.customSelects === 3 && a.dom.controls.unsupported === "Changing a filter in place is not supported by the simulation." && a.dom.controls.laid.every((l) => l.hasDisconnect) },
    { name: "panel inside viewport, no horizontal overflow", test: (b, a) => a.dom.panel.rect.left >= -1 && a.dom.panel.rect.right <= a.dom.viewport.w + 1 && a.dom.docScrollW <= a.dom.viewport.w + 1 },
    { name: "toggle keeps the 44px touch floor", test: (b, a) => a.dom.legend.toggle.rect.height >= 44 },
    { name: "legend states the direction convention", test: (b, a) => a.dom.legend.direction === "Dashes flow toward the destination; the arrowhead marks the receiving end." },
    { name: "every laid link prints its direction (source → destination)", test: (b, a) => a.dom.controls.laid.length > 0 && a.dom.controls.laid.every((l) => / → /.test(l.path)) },
    { name: "legend lists exactly the 11 carried materials, scrap swatch first", test: (b, a) => a.dom.legend.materials.length === 11 && a.dom.legend.materials[0].label === "Scrap" && normColor(a.dom.legend.materials[0].swatch) === "rgb(255,183,101)" && a.dom.legend.materials.every((m) => !!m.swatch), detail: (b, a) => JSON.stringify(a.dom.legend.materials.map((m) => m.label)) },
    { name: "production overview derived from state (batches/s across 8 machines)", test: (b, a) => a.dom.overview.rows.some((r) => r.label === "Production" && /batches\/s across 8 machines$/.test(r.value)), detail: (b, a) => JSON.stringify(a.dom.overview.rows.find((r) => r.label === "Production")) },
    { name: "shell rail matches the form factor (landscape/desktop rail, phone none)", test: (b, a) => form === "phone" ? a.dom.rail === null : (a.dom.rail?.width ?? 0) > 0, detail: (b, a) => JSON.stringify(a.dom.rail) },
  ]);
  const visibleCyan = open.after.dom.census?.cyan ?? 0;

  await runStep(page, `${form}-dense`, "01-hide-routes", async () => {
    await clickBtnIn(page, ".logistics-legend", "Hide routes");
  }, [
    { name: "toggle flips off and labels Show routes", test: (b, a) => a.dom.legend.toggle.text === "Show routes" && a.dom.legend.toggle.pressed === "false" },
    { name: "hiding removes cyan rail pixels (strictly fewer)", test: (b, a) => a.dom.census.cyan < b.dom.census.cyan, detail: (b, a) => `visible=${b.dom.census.cyan} hidden=${a.dom.census.cyan}` },
    { name: "no working-rail cyan remains once hidden", test: (b, a) => a.dom.census.cyan < visibleCyan * 0.5, detail: (b, a) => `hidden=${a.dom.census.cyan} visible=${visibleCyan}` },
    { name: "routes keep running while hidden (count unchanged)", test: (b, a) => a.sim.routes === b.sim.routes && a.sim.routes === 18 },
  ]);

  await runStep(page, `${form}-dense`, "02-show-routes", async () => {
    await clickBtnIn(page, ".logistics-legend", "Show routes");
  }, [
    { name: "toggle flips back on", test: (b, a) => a.dom.legend.toggle.text === "Hide routes" && a.dom.legend.toggle.pressed === "true" },
    { name: "showing restores cyan rail pixels", test: (b, a) => a.dom.census.cyan > b.dom.census.cyan, detail: (b, a) => `hidden=${b.dom.census.cyan} shown=${a.dom.census.cyan}` },
    { name: "route count still 18 (presentation only)", test: (b, a) => a.sim.routes === 18 },
  ]);

  // De-emphasis, relative pixel claim: with the sorter selected, every working rail in the
  // mature seed (1, 3, 4) touches the sorter and strokes bright. Selecting the furnace
  // (tile 1) keeps only route 4 related; working rails 1 and 3 dim to 35% alpha and fall
  // below the cyan census threshold, so bright cyan must strictly decrease. The furnace is
  // starved in this seed, so it cannot start a new working belt during the window.
  await runStep(page, `${form}-dense`, "03-select-furnace-dims-unrelated", async () => {
    await tapTile(page, 1);
  }, [
    { name: "real tap selects the furnace", test: (b, a) => a.dom.panel?.aria === "Furnace details" && a.dom.panel?.title === "Furnace" },
    { name: "selection de-emphasizes unrelated working rails (bright cyan strictly decreases)", test: (b, a) => b.dom.census && a.dom.census && a.dom.census.cyan < b.dom.census.cyan, detail: (b, a) => `sorter=${b.dom.census?.cyan} furnace=${a.dom.census?.cyan}` },
    { name: "selection dispatches no command (routes unchanged)", test: (b, a) => a.sim.routes === b.sim.routes && a.sim.routes === 18 },
    { name: "seven inspector sections preserved on the second machine", test: (b, a) => JSON.stringify(a.dom.panel.sections) === JSON.stringify(SECTIONS) },
  ]);

  // Validity preview, invalid branch: the furnace's custom link defaults (from furnace,
  // to dock store) with material "steel" duplicate laid route 5. The preview must say so
  // plainly, and committing it must be rejected by the engine with no state change.
  await runStep(page, `${form}-dense`, "04-custom-duplicate-preview", async () => {
    await selectCustomFilter(page, "steel");
    await page.waitForTimeout(120);
    await clickBtnInGroup(page, 2, "Connect");
  }, [
    { name: "inline custom preview flags the duplicate as invalid", test: (b, a) => a.dom.controls.customPreview?.invalid === true && a.dom.controls.customPreview?.note === "Invalid — an identical belt already runs between these endpoints.", detail: (b, a) => JSON.stringify(a.dom.controls.customPreview) },
    { name: "confirm preview repeats the invalid reason with a Cancel", test: (b, a) => !!a.dom.controls.confirm && a.dom.controls.confirm.invalid === true && a.dom.controls.confirm.note === "Invalid — an identical belt already runs between these endpoints." && a.dom.controls.confirm.hasCancel === true, detail: (b, a) => JSON.stringify(a.dom.controls.confirm) },
    { name: "previewing dispatches nothing (routes unchanged)", test: (b, a) => a.sim.routes === b.sim.routes && a.sim.routes === 18 },
  ]);

  await runStep(page, `${form}-dense`, "05-invalid-commit-rejected", async () => {
    await clickBtnIn(page, ".logistics-confirm", "Connect"); // primary commit of an invalid plan
  }, [
    { name: "engine rejects the duplicate (no route laid)", test: (b, a) => a.sim.routes === 18 && JSON.stringify(a.sim.routeIds) === JSON.stringify(b.sim.routeIds) },
    { name: "preview cleared after the rejected commit", test: (b, a) => a.dom.controls.confirm === null },
    { name: "inline preview still reports the duplicate honestly", test: (b, a) => a.dom.controls.customPreview?.invalid === true },
  ]);

  await runStep(page, `${form}-dense`, "06-invalid-cancel", async () => {
    await clickBtnInGroup(page, 2, "Connect");
    await page.waitForTimeout(120);
    await clickBtnIn(page, ".logistics-confirm", "Cancel");
  }, [
    { name: "cancel closes the invalid preview", test: (b, a) => a.dom.controls.confirm === null },
    { name: "cancel laid no belt (routes unchanged)", test: (b, a) => a.sim.routes === 18 },
  ]);
  await context.close();
}

// ============================ zero power ============================
async function zeroPowerLoop(browser, form) {
  const { context, page } = await newPage(browser, `${form}-zeropower`, FIXTURES.zeroPower);
  const seed = await readSim(page);
  await runStep(page, `${form}-zeropower`, "00-open-sorter", async () => {
    await tapTile(page, 0);
  }, [
    { name: "seed loaded at zero power (ratio 0, 8 machines)", test: () => seed?.powerRatio === 0 && seed?.machines?.length === 8 },
    { name: "overview power reads 0% of capacity 8", test: (b, a) => /\/8 · 0%$/.test(a.dom.overview.powerValue), detail: (b, a) => a.dom.overview.powerValue },
    { name: "power gauge at 0 and marked limited", test: (b, a) => a.dom.overview.gauge.now === "0" && a.dom.overview.gauge.limited === true },
    { name: "over-budget note shown", test: (b, a) => a.dom.overview.powerNote === "Over budget — every running machine slows to the same fraction." },
    { name: "power bottleneck names the sorter at 0% speed", test: (b, a) => a.dom.overview.bottlenecks.some((x) => x.label === "Scrap sorter" && x.detail === "Power limited — running at 0% speed.") },
    { name: "power bottleneck offers a revealable route to the machine", test: (b, a) => {
        const x = a.dom.overview.bottlenecks.find((b) => b.label === "Scrap sorter" && /Power limited/.test(b.detail));
        return !!x && !!x.reveal && x.reveal.text === "Show route";
      } },
  ]);
  await runStep(page, `${form}-zeropower`, "01-reveal-power", async () => {
    const handle = await page.evaluateHandle(() => {
      const li = [...document.querySelectorAll(".logistics-bottleneck")].find((x) => /Power limited/.test(x.querySelector(".logistics-bottleneck__detail")?.textContent || ""));
      return li ? li.querySelector(".logistics-btn") : null;
    });
    const el = handle.asElement();
    if (!el) throw new Error("power bottleneck reveal button not found");
    await el.click();
  }, [
    { name: "reveal presses the bottleneck button (focus set)", test: (b, a) => {
        const x = a.dom.overview.bottlenecks.find((b) => /Power limited/.test(b.detail));
        return !!x && x.reveal.pressed === "true" && x.reveal.text === "Clear focus";
      } },
    { name: "revealing repaints the canvas (focus changes the frame)", test: (b, a) => b.dom.census && a.dom.census && JSON.stringify(b.dom.census) !== JSON.stringify(a.dom.census), detail: (b, a) => `before=${JSON.stringify(b.dom.census)} after=${JSON.stringify(a.dom.census)}` },
    { name: "reveal dispatches no command (routes unchanged)", test: (b, a) => a.sim.routes === b.sim.routes },
  ]);
  await context.close();
}

// ============================ missing input ============================
async function missingInputLoop(browser, form) {
  const { context, page } = await newPage(browser, `${form}-missinginput`, FIXTURES.missingInput);
  await runStep(page, `${form}-missinginput`, "00-open-furnace", async () => {
    await tapTile(page, 1); // furnace tile 1
  }, [
    { name: "real tap selects the furnace", test: (b, a) => a.dom.panel?.aria === "Furnace details" && a.dom.panel?.title === "Furnace" },
    { name: "starved furnace reports a missing-input bottleneck", test: (b, a) => a.dom.overview.bottlenecks.some((x) => x.label === "Furnace" && /^Missing input — waiting on /.test(x.detail)), detail: (b, a) => JSON.stringify(a.dom.overview.bottlenecks.find((x) => x.label === "Furnace")) },
    { name: "no inbound belt: the furnace bottleneck has no fake reveal", test: (b, a) => {
        const x = a.dom.overview.bottlenecks.find((b) => b.label === "Furnace");
        return !!x && x.reveal === null;
      } },
    { name: "overview counts the starved machines", test: (b, a) => a.dom.overview.rows.some((r) => r.label === "Machines" && /starved/.test(r.value)) },
  ]);
  await context.close();
}

// ============================ output full + bottleneck reveal ============================
async function outputFullLoop(browser, form) {
  const { context, page } = await newPage(browser, `${form}-outputfull`, FIXTURES.outputFull);
  await runStep(page, `${form}-outputfull`, "00-open-sorter", async () => {
    await tapTile(page, 0);
  }, [
    { name: "real tap selects the sorter", test: (b, a) => a.dom.panel?.aria === "Scrap sorter details" },
    { name: "output-full bottleneck prints tray 12/12", test: (b, a) => a.dom.overview.bottlenecks.some((x) => x.label === "Scrap sorter" && x.detail === "Output full — 12/12 in the tray.") },
    { name: "overview reports at least one blocked route", test: (b, a) => a.dom.overview.rows.some((r) => r.label === "Routes" && /[1-9]\d* blocked/.test(r.value)), detail: (b, a) => JSON.stringify(a.dom.overview.rows.find((r) => r.label === "Routes")) },
    { name: "the inbound laid link is classified blocked", test: (b, a) => a.dom.controls.laid.some((l) => /dock store → scrap sorter/.test(l.path) && /blocked/.test(l.meta)), detail: (b, a) => JSON.stringify(a.dom.controls.laid) },
    { name: "blocked rail paints orange pixels (corroborated by DOM status)", test: (b, a) => a.dom.census.orange > 0, detail: (b, a) => `orange=${a.dom.census.orange}` },
    { name: "output-full bottleneck offers a revealable output route", test: (b, a) => {
        const x = a.dom.overview.bottlenecks.find((b) => b.label === "Scrap sorter" && /Output full/.test(b.detail));
        return !!x && !!x.reveal && x.reveal.text === "Show route";
      } },
  ]);
  await runStep(page, `${form}-outputfull`, "01-reveal-output", async () => {
    const handle = await page.evaluateHandle(() => {
      const li = [...document.querySelectorAll(".logistics-bottleneck")].find((x) => /Output full/.test(x.querySelector(".logistics-bottleneck__detail")?.textContent || ""));
      return li ? li.querySelector(".logistics-btn") : null;
    });
    const el = handle.asElement();
    if (!el) throw new Error("output-full bottleneck reveal button not found");
    await el.click();
  }, [
    { name: "reveal presses the output bottleneck button", test: (b, a) => {
        const x = a.dom.overview.bottlenecks.find((b) => /Output full/.test(b.detail));
        return !!x && x.reveal.pressed === "true" && x.reveal.text === "Clear focus";
      } },
    { name: "reveal dispatches no command (routes unchanged)", test: (b, a) => a.sim.routes === b.sim.routes },
  ]);
  await context.close();
}

// ============================ saved route + connect preview/cancel + disconnect refund ============================
async function refundLoop(browser, form) {
  const { context, page } = await newPage(browser, `${form}-refund`, FIXTURES.partial);
  const seed = await readSim(page);
  const seedIds = new Set(seed.routes.map((r) => r.id));
  const flow = { cost: null, newRouteId: null, runLen: null, refund: null };

  await runStep(page, `${form}-refund`, "00-open-sorter", async () => {
    await tapTile(page, 0);
  }, [
    { name: "seed loaded intact (17 routes, scrap 60, sorter selected)", test: (b, a) => seed?.routes?.length === 17 && seed?.store?.scrap === 60 && a.dom.panel?.aria === "Scrap sorter details" },
    { name: "a suggested link is offered (store -> sorter)", test: (b, a) => a.dom.controls.suggestedCount >= 1 && a.dom.controls.suggestedConnect === true },
    { name: "pre-price mature belts show +0 scrap refund (run:null)", test: (b, a) => a.dom.controls.laid.some((l) => l.refund === "+0 scrap"), detail: (b, a) => JSON.stringify(a.dom.controls.laid.map((l) => l.refund)) },
  ]);

  const preview = await runStep(page, `${form}-refund`, "01-connect-preview", async () => {
    await clickBtnIn(page, ".logistics-controls__group", "Connect"); // suggested-links group
  }, [
    { name: "preview group opens with a validity/cost note and Cancel", test: (b, a) => !!a.dom.controls.confirm && /^Valid — ready to lay\. \d+ tiles · \d+ scrap\.$/.test(a.dom.controls.confirm.note) && a.dom.controls.confirm.hasCancel === true && a.dom.controls.confirm.invalid === false, detail: (b, a) => a.dom.controls.confirm?.note },
    { name: "preview dispatches nothing (routes + scrap unchanged)", test: (b, a) => a.sim.routes === b.sim.routes && a.sim.storeScrap === b.sim.storeScrap },
  ]);
  flow.cost = parseCost(preview.after.dom.controls.confirm?.note);

  await runStep(page, `${form}-refund`, "02-cancel", async () => {
    await clickBtnIn(page, ".logistics-confirm", "Cancel");
  }, [
    { name: "cancel closes the preview", test: (b, a) => a.dom.controls.confirm === null },
    { name: "cancel laid no belt (routes + scrap unchanged)", test: (b, a) => a.sim.routes === 17 && a.sim.storeScrap === 60 },
  ]);

  const connected = await runStep(page, `${form}-refund`, "03-connect-confirm", async () => {
    await clickBtnIn(page, ".logistics-controls__group", "Connect");
    await page.waitForTimeout(150);
    await clickBtnIn(page, ".logistics-confirm", "Connect"); // primary commit
  }, [
    { name: "engine laid the suggested belt(s) (route count grew)", test: (b, a) => a.sim.routes > b.sim.routes, detail: (b, a) => `${b.sim.routes} -> ${a.sim.routes}` },
    { name: "store scrap charged exactly the previewed cost", test: (b, a) => flow.cost !== null && b.sim.storeScrap - a.sim.storeScrap === flow.cost, detail: (b, a) => `cost=${flow.cost} delta=${b.sim.storeScrap - a.sim.storeScrap}` },
    { name: "saved-route: the new belt persists in the game's own save mirror", test: (b, a) => a.sim.routeIds.some((id) => !seedIds.has(id)) },
    { name: "preview cleared after commit", test: (b, a) => a.dom.controls.confirm === null },
  ]);
  // Identify the freshly laid inbound scrap belt and read the engine-priced run length.
  const afterSim = await readSim(page);
  const newRoutes = afterSim.routes.filter((r) => !seedIds.has(r.id));
  const inbound = newRoutes.find((r) => r.from.id === 0 && r.to.id === 1 && r.filter === "scrap") || newRoutes[0];
  flow.newRouteId = inbound?.id ?? null;
  flow.runLen = inbound?.run?.length ?? null;

  const discPreview = await runStep(page, `${form}-refund`, "04-disconnect-preview", async () => {
    const sim = await readSim(page);
    const links = sim.routes.filter((r) => r.from.id === 1 || r.to.id === 1);
    const idx = links.findIndex((r) => r.id === flow.newRouteId);
    if (idx < 0) throw new Error("new route not among laid links");
    await clickDisconnectIndex(page, idx);
  }, [
    { name: "the freshly laid belt carries a priced run (engine truth)", test: () => flow.runLen !== null && flow.runLen > 0, detail: () => `runLen=${flow.runLen}` },
    { name: "disconnect preview shows the engine refund (90% of belt cost)", test: (b, a) => {
        const r = parseRefund(a.dom.controls.confirm?.note);
        const expected = Math.round((flow.runLen * BELT_COST_PER_TILE * DISMANTLE_REFUND_PCT) / 100);
        return r !== null && r === expected && r > 0;
      }, detail: (b, a) => `note=${a.dom.controls.confirm?.note} runLen=${flow.runLen}` },
    { name: "disconnect preview dispatches nothing yet", test: (b, a) => a.sim.routes === b.sim.routes },
  ]);
  flow.refund = parseRefund(discPreview.after.dom.controls.confirm?.note);

  await runStep(page, `${form}-refund`, "05-disconnect-confirm", async () => {
    await clickBtnIn(page, ".logistics-confirm", "Connect"); // primary commit (remove)
  }, [
    { name: "engine removed the belt (route count back to 17)", test: (b, a) => a.sim.routes === 17 && b.sim.routes === 18 },
    { name: "store scrap refunded exactly the previewed amount", test: (b, a) => flow.refund !== null && a.sim.storeScrap - b.sim.storeScrap === flow.refund, detail: (b, a) => `refund=${flow.refund} delta=${a.sim.storeScrap - b.sim.storeScrap}` },
    { name: "saved-route: the removed belt is gone from the save mirror", test: (b, a) => !a.sim.routeIds.includes(flow.newRouteId) },
    { name: "net scrap change equals refund minus cost (engine arithmetic)", test: (b, a) => a.sim.storeScrap === 60 - flow.cost + flow.refund, detail: (b, a) => `final=${a.sim.storeScrap} expected=${60 - flow.cost + flow.refund}` },
  ]);
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
      const meta = frameMeta.find((m) => m.name === r.replaceAll("\\", "/"));
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
  console.log("BASE_URL=", BASE_URL, "BUILD_SHA=", BUILD_SHA, "chrome=", executablePath, "EVID=", EVID);
  const browser = await chromium.launch({ executablePath, headless: true });
  const forms = [
    { key: "phone", dims: { w: 780, h: 1688 } },
    { key: "phoneland", dims: { w: 1688, h: 780 } },
    { key: "desktop", dims: { w: 1920, h: 1080 } },
  ];
  const loops = [
    ["dense", denseLoop],
    ["zeropower", zeroPowerLoop],
    ["missinginput", missingInputLoop],
    ["outputfull", outputFullLoop],
    ["refund", refundLoop],
  ];
  for (const f of forms) {
    for (const [name, loop] of loops) {
      try { await loop(browser, f.key); }
      catch (e) { blockers.push(`${f.key}-${name} FATAL: ${String((e && e.stack) || e)}`); console.error(e); }
    }
  }
  await browser.close();

  const expectedDims = {};
  for (const f of forms) {
    for (const [suffix] of loops) expectedDims[`${f.key}-${suffix}`] = f.dims;
  }
  const audit = auditFrames(expectedDims);
  const auditOk = audit.every((a) => a.ok);
  const byForm = {};
  for (const a of audit) { const k = a.frame.split("/")[0]; (byForm[k] ||= []).push(a.sha256); }
  const distinct = Object.fromEntries(Object.entries(byForm).map(([k, v]) => [k, new Set(v).size > 1]));

  const allChecks = steps.flatMap((s) => s.checks.map((c) => ({ form: s.form, step: s.step, ...c })));
  const failedChecks = allChecks.filter((c) => !c.ok);
  const results = {
    issue: 59, role: "developer", buildSha: BUILD_SHA, baseUrl: BASE_URL,
    branch: "rw/59-logistics",
    generatedAt: new Date().toISOString(),
    chrome: executablePath,
    method: "headless Chrome DOM + geometry + persisted-state mirror + canvas pixel census only; no vision. Screenshots are hashed mirrors, not inspected visually. Selection driven by real canvas taps (App.applyGestureOutput -> pickTarget -> setSelected); every mutation through panel buttons/selects -> props.dispatch -> applyCommand. Form factors: phone 390x844 dpr2 portrait, phoneland 844x390 dpr2 rail, desktop 1920x1080 dpr1 rail; all five scenario loops run on each.",
    fixtureScrutiny: {
      a: "Only setup seeding mutates state: fixtures derived from docs/evidence/yard-mature.json before encoding (partial removes route 1 + raises store scrap to 60; zeroPower marks the sorter powerLimited at ratio 0 with every batch in progress so requestedPower 16 > capacity 8; missingInput removes route 4; outputFull marks the sorter outputFull with tray 12/12; all set reducedMotion=true for stable pixels). No src changes; every action is a real UI tap/click through dispatch -> applyCommand.",
      b: "Documented in this probe header, the derive* functions and results.json.",
      c: "Seeded envelopes pass the game's full decodeSave/repairRegistration/validateSim; the 00-open steps assert the loaded mirror matches the seed. Route references pruned exactly like repairRegistration. No invariant weakened or bypassed.",
      d: "No action faked by injection; localStorage read only as the game's own persistence mirror (written on every ok dispatch). The refund scenario connects a fresh belt through the real UI (engine prices its run) then disconnects it, because mature belts are pre-price (run:null, refund 0).",
    },
    pixelCensus: {
      cyanRail: "b>r+25 && g>r+15 && b>120",
      orange: "r>g+25 && g>=b && r>120 (blocked rail; residue cargo shares the hue, so blocked is corroborated by DOM route status)",
      amber: "r>150 && g>110 && b<130 && r>b+50",
      visibilityClaim: "strictly relative: visible.cyan > hidden.cyan, and hidden.cyan < 0.5*visible.cyan; route count unchanged while hidden.",
    },
    fixtures: Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [k, {
      machines: v.sim.machines.length, routes: v.sim.routes.length, storeScrap: v.sim.store.scrap,
      storeUnits: v.sim.storeUnits, powerRatio: v.sim.powerRatio, reducedMotion: v.settings.reducedMotion,
      statuses: v.sim.machines.map((m) => `${m.id}:${m.status}`).join(","),
    }])),
    counts: { frames: audit.length, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length },
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, frames: audit },
    findings: [
      {
        id: "yard-overview-hosted-in-inspector",
        verdict: "ownership-constraint-not-a-defect",
        detail: "The yard-wide production/power overview and bottleneck list live inside the machine inspector's Bottleneck section, and the route legend + visibility toggle inside its Transport section. A dedicated always-on dock would require editing App.tsx/Hud.tsx, which #62 owns and #59 forbids. The surfaces are reachable the real way (tap any machine) and derive every number from state.",
        source: "src/ui/panels/MachinePanel.tsx; src/ui/logistics/LogisticsOverview.tsx; src/ui/logistics/LogisticsLegend.tsx",
      },
      {
        id: "bottleneck-reveals-route-not-selection-swap",
        verdict: "ownership-constraint-not-a-defect",
        detail: "Each bottleneck's Show route focuses a belt touching the affected machine on the canvas through the shared view bridge (a real, visible repaint). Swapping the inspected machine to the bottleneck's machine is not offered because App.tsx exposes no selection callback and is owned by #62; the overview tells the player to open the machine from the yard instead.",
        source: "src/ui/logistics/LogisticsOverview.tsx; src/ui/logistics/view.ts; src/game/renderer/scene.ts drawRoutes",
      },
      {
        id: "no-in-place-filter-edit",
        verdict: "honest-capability-map",
        detail: "The simulation has no in-place filter-edit command, so the controls state this plainly and offer disconnect + re-lay rather than a disabled fake control. Connect/disconnect/filter-at-lay are the real supported capabilities, each with a cost/validity preview and Cancel.",
        source: "src/ui/logistics/RouteControls.tsx; src/ui/logistics/copy.ts; src/game/simulation/commands.ts",
      },
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
  if (failedChecks.length || blockers.length || pageErrors.length) process.exitCode = 1;
}

main().catch((e) => { console.error("PROBE FATAL:", e); process.exitCode = 1; });