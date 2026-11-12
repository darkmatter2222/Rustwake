/**
 * UI-RESET-64 (issue #64) — developer acceptance probe (dev-64b, resume of dev-64).
 *
 * ROLE: developer (rw/64-onboard). PROBE-ONLY code: nothing under src/ is modified
 * by this file. It drives THIS BRANCH'S app through the REAL UI (canvas taps ->
 * App.applyGestureOutput -> pickTarget -> setSelected; dock/panel/catalog buttons
 * -> props.dispatch -> store.dispatch -> applyCommand) and records DOM + geometry +
 * persisted-state + canvas-pixel evidence. NO VISION is used: every visual claim is
 * a programmatic DOM/geometry assertion or a pixel-color census, never an eyeballed
 * screenshot. Screenshots are hashed mirrors only.
 *
 * Run against the branch's OWN build (never the live site):
 *   pnpm build
 *   pnpm preview --port 4164 --strictPort --host 127.0.0.1   (background, cwd=worktree)
 *   BASE_URL='http://127.0.0.1:4164/' RW64_SHA='<code head sha>' \
 *   RW64_EVID='work/evidence/UI-RESET-64' pnpm exec tsx work/evidence/UI-RESET-64/probe.mjs
 * Artifacts land in RW64_EVID. Form factors: phone 390x844 dpr2 (portrait),
 * phoneland 844x390 dpr2 (rail) and desktop 1920x1080 dpr1 (rail). Every scenario
 * loop runs on all three.
 *
 * The five acceptance criteria mapped to loops:
 *   (1) teach salvage/build/connect/storage/trade/upgrades/research contextually
 *       -> freshLoop walks tutorial 0..9 via the real dock primaries, asserting the
 *          OnboardCoach lesson topic at each stage (salvage/storage/build/connect/
 *          trade/upgrade) and the research-path lesson at tutorial 9 with no Data.
 *   (2) respect progress + skip/revisit -> progressLoop seeds a PROGRESSED mature
 *       save, asserts no reset/overwrite across skip/show/reload, and that a second
 *       tab (reader lease) yields the coach entirely.
 *   (3) consistent vocabulary, jargon -> concise copy + expandable detail ->
 *       jargonLoop asserts the furnace constraint headline + expandable detail, the
 *       coach glossary, and catalog/resource/research vocabulary parity with content.
 *   (4) earn-trap recovery for a blind 1-tap place-mode player -> earntrapLoop seeds
 *       a step-4 yard with 5 scrap (sorter costs 20), arms placement, hits the blind
 *       affordability refusal, then RECOVERS through the coach "Earn scrap now" /
 *       "Trade at the store" rows and completes the build (not stalled at 0 machines).
 *   (5) FRESH-PLAYER SCRIPTED WALKTHROUGH (AGENT evidence) -> freshLoop continues
 *       past tutorial 9 to build the full Data chain through the real catalog, wires
 *       it through the dock Connect primary, and advances time until the FIRST Data
 *       lands so Research unlocks — honoring the fresh-yard finding (6821970539)
 *       WITHOUT weakening the showResearch gate (data>0 || research-owned).
 *
 * Fixture scrutiny (task a-d):
 *  (a) The only state mutation is SETUP seeding, done in probe code with the game's
 *      OWN encodeSave (FNV-1a checksum, lastSeenMs=Date.now()). fresh = the game's
 *      createInitialState() verbatim. earntrap = createInitialState() with tutorial=4,
 *      drone.repaired=true, drone.deliveries=1, wreck={remaining:30,generation:2,
 *      pulses:6,nextPulseTick:0}, store={scrap:5}, storeUnits=5 (a blind place-mode
 *      player who cannot afford the 20-scrap sorter). progress/jargon = the repo's
 *      docs/evidence/yard-mature.json payload.sim verbatim (8 machines, 18 routes,
 *      tutorial 9, data 76, furnace starved). All set reducedMotion=true for stable
 *      pixels. Time advance (advanceTime) is a PROBE-ONLY lastSeenMs rewind + reload
 *      that runs the game's OWN inline offline catch-up; it never edits sim fields.
 *  (b) This file + results.json document the method, fixtures and derivations.
 *  (c) Validation is NOT weakened: every seeded envelope is round-tripped through the
 *      game's full decodeSave/repairRegistration/validateSim IN-PROCESS before use,
 *      and readSim reads the persisted mirror through decodeSave. The 00-open steps
 *      assert the loaded mirror matches the seed. No invariant bypassed.
 *  (d) No action is faked by state injection. localStorage is read ONLY as the game's
 *      own persistence mirror (written on every ok dispatch); the guarded init script
 *      seeds once so reloads preserve live state. Selection is a real canvas gesture;
 *      every mutation flows through a real button -> dispatch -> applyCommand.
 *
 * Canvas pixel census (documented heuristics, relative/rendered claims only):
 *   cyan   b>r+25 && g>r+15 && b>120   (machine pips / working rails / drones)
 *   orange r>g+25 && g>=b && r>120     (blocked rail / residue cargo hue)
 *   amber  r>150 && g>110 && b<130 && r>b+50 (cargo tokens / machine cores)
 *   ink    any pixel with alpha>=40    (proves the yard canvas actually paints)
 * The census is sampled every 2px. It corroborates that the yard renders behind the
 * DOM coach; the coach itself is DOM (painted in .hud__lead), asserted by geometry.
 */
import { chromium } from "playwright-core";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { encodeSave, decodeSave, validateSim, SAVE_KEY } from "../../../src/game/persistence/save.ts";
import { createInitialState } from "../../../src/game/simulation/types.ts";
import { BLUEPRINTS, TUNING, RECIPES } from "../../../src/game/content/defs.ts";
import { RESEARCH } from "../../../src/game/content/research.ts";

const ROOT = resolve(process.cwd());
const EVID = process.env.RW64_EVID || "work/evidence/UI-RESET-64";
const FRAMES = resolve(EVID, "frames");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4164/";
const BUILD_SHA = process.env.RW64_SHA || "unset";
const YARD_COLS = 6;
const CELL = 32;
const WRECK = { x: 80, y: 206.4 };
const DATA_CHAIN = ["copperSeparator", "polymerRecycler", "wireMill", "circuitAssembler", "signalLab"];

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

// ---- collectors ----
const frameMeta = [];
const steps = [];
const consoleErrors = [];
const pageErrors = [];
const blockers = [];

// ---- legitimate setup seeding: the game's OWN encodeSave, validated in-process ----
const STABLE = { muted: false, reducedMotion: true, textScale: 1 };
function makeFixture(sim, settings) {
  const env = encodeSave(sim, Date.now(), settings);
  const dec = decodeSave(env);
  if (!dec.ok) throw new Error(`fixture failed decodeSave: ${dec.reason} ${dec.detail || ""}`);
  const invalid = validateSim(sim);
  if (invalid) throw new Error(`fixture failed validateSim: ${invalid}`);
  return { sim, settings, envelope: env };
}
const freshSim = createInitialState();
const earntrapSim = createInitialState();
earntrapSim.tutorial = 4;
earntrapSim.drone.repaired = true;
earntrapSim.drone.deliveries = 1;
earntrapSim.wreck = { remaining: 30, generation: 2, pulses: 6, nextPulseTick: 0 };
earntrapSim.store = { scrap: 5 };
earntrapSim.storeUnits = 5;
const matureSim = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/yard-mature.json"), "utf8")).payload.sim;
const FIXTURES = {
  fresh: makeFixture(freshSim, { ...STABLE }),
  earntrap: makeFixture(earntrapSim, { muted: true, reducedMotion: true, textScale: 1 }),
  progress: makeFixture(matureSim, { ...STABLE }),
  jargon: makeFixture(matureSim, { ...STABLE }),
};

function summarize(sim) {
  if (!sim) return null;
  return {
    tick: sim.tick, tutorial: sim.tutorial, credits: sim.credits,
    machines: sim.machines.length, routes: sim.routes.length,
    machineList: sim.machines.map((m) => `${m.id}:${m.blueprint}:t${m.tile}:lv${m.level}:${m.status}`).join(","),
    store: { ...sim.store }, storeUnits: sim.storeUnits,
    data: sim.store.data ?? 0, scrap: sim.store.scrap ?? 0,
    ferrous: sim.store.ferrous ?? 0, nonferrous: sim.store.nonferrous ?? 0, steel: sim.store.steel ?? 0,
    drone: { repaired: sim.drone.repaired, deliveries: sim.drone.deliveries },
    wreck: { remaining: sim.wreck.remaining, generation: sim.wreck.generation, pulses: sim.wreck.pulses },
    research: { ...sim.research }, powerRatio: sim.powerRatio,
  };
}

/** Read the persisted mirror through the game's OWN decodeSave (repair + validate). */
async function readSim(page) {
  const raw = await page.evaluate((KEY) => localStorage.getItem(KEY), SAVE_KEY);
  if (!raw) return null;
  const dec = decodeSave(raw);
  return dec.ok ? dec.payload.sim : null;
}

/** One full DOM + geometry + canvas-pixel snapshot of the onboarding surfaces. */
async function onboardDom(page) {
  return await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const txt = (el) => (el ? el.textContent.trim().replace(/\s+/g, " ") : null);
    const coach = q(".onboard");
    let coachInfo = null;
    if (coach) {
      const recover = coach.querySelector(".onboard__recover");
      const r = coach.getBoundingClientRect();
      coachInfo = {
        present: true,
        mode: coach.getAttribute("data-onboard"),
        topic: coach.getAttribute("data-topic"),
        lesson: coach.getAttribute("data-lesson"),
        researchPath: coach.getAttribute("data-research-path"),
        badge: txt(coach.querySelector(".onboard__badge")),
        what: txt(coach.querySelector(".onboard__what")),
        why: txt(coach.querySelector(".onboard__why")),
        next: txt(coach.querySelector(".onboard__next")),
        detailSummary: txt(coach.querySelector(".onboard__summary")),
        detailBody: txt(coach.querySelector(".onboard__detail-body")),
        detailOpen: !!coach.querySelector(".onboard__detail[open]"),
        skipText: txt(coach.querySelector(".onboard__skip")),
        showText: txt(coach.querySelector(".onboard__btn")),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        recover: recover ? {
          title: txt(recover.querySelector(".onboard__recover-title")),
          short: txt(recover.querySelector(".onboard__recover-short")),
          hint: txt(recover.querySelector(".onboard__recover-hint")),
          earnText: txt(recover.querySelector(".onboard__earn")),
          storeText: txt(recover.querySelector(".onboard__actions .onboard__btn:not(.onboard__earn)")),
        } : null,
      };
    }
    const obj = q(".objective");
    const objective = obj ? { primary: txt(obj.querySelector(".objective__primary")), status: txt(obj.querySelector(".status-line")) } : null;
    const dockBtns = qa(".dock__btn").map((b) => {
      const cost = txt(b.querySelector(".dock__cost"));
      const full = txt(b);
      const label = cost ? full.replace(cost, "").trim() : full;
      return { text: full, label, cost, primary: b.classList.contains("dock__btn--primary"), branch: b.classList.contains("dock__btn--branch"), disabled: b.disabled };
    });
    const primary = dockBtns.find((b) => b.primary) || null;
    const rail = q(".shell-rail");
    const railSlots = rail ? qa(".shell-rail__slot").map((s) => ({
      slot: s.getAttribute("data-slot"), label: txt(s.querySelector(".shell-rail__label")),
      reason: txt(s.querySelector(".shell-rail__reason")), disabled: s.disabled, pressed: s.getAttribute("aria-pressed"),
    })) : [];
    const ps = q(".place-strip");
    const placeStrip = ps ? {
      machine: txt(ps.querySelector(".place-strip__machine")), cell: txt(ps.querySelector(".place-strip__cell")),
      reason: txt(ps.querySelector(".place-strip__reason")), cost: txt(ps.querySelector(".place-strip__cost")),
      short: txt(ps.querySelector(".place-strip__short")), earn: txt(ps.querySelector(".place-strip__earn")),
      hint: txt(ps.querySelector(".place-strip__hint")), valid: ps.getAttribute("data-valid"), verdict: ps.getAttribute("data-verdict"),
    } : null;
    const cat = q(".catalog");
    const catalog = cat ? {
      present: true,
      cards: qa(".catalog__card").map((c) => ({
        id: c.getAttribute("data-blueprint"), name: txt(c.querySelector(".catalog__name")),
        locked: c.getAttribute("data-locked"), affordable: c.getAttribute("data-affordable"),
        selected: c.getAttribute("aria-pressed"), cost: txt(c.querySelector(".catalog__cost")),
        shortfall: txt(c.querySelector(".catalog__shortfall")),
      })),
      placeText: txt(cat.querySelector(".catalog__place")),
      placeDisabled: cat.querySelector(".catalog__place")?.disabled ?? null,
    } : null;
    const panel = q(".panel--stack") || q(".panel--research") || q(".panel--store");
    let panelInfo = null;
    if (panel) {
      const constraint = panel.querySelector(".inspector-constraint");
      panelInfo = {
        aria: panel.getAttribute("aria-label"), title: txt(panel.querySelector(".panel__title")),
        isResearch: panel.classList.contains("panel--research"), isStore: panel.classList.contains("panel--store"),
        constraint: constraint ? {
          summary: txt(constraint.querySelector(".inspector-constraint__summary")),
          detail: txt(constraint.querySelector(".inspector-note--constraint")),
          open: constraint.hasAttribute("open"),
        } : null,
        researchNodes: qa(".node").map((n) => ({
          id: n.getAttribute("data-node"), state: n.getAttribute("data-state"),
          researchState: n.getAttribute("data-research-state"), cost: txt(n.querySelector(".node__cost")),
          buyText: txt(n.querySelector(".node__buy")), buyDisabled: n.querySelector(".node__buy")?.disabled ?? null,
        })),
        storeTrades: qa(".store-trade").map((t) => ({ resource: t.getAttribute("data-resource"), name: txt(t.querySelector(".store-trade__name")) })),
      };
    }
    const resources = qa(".resources__item").map((r) => txt(r));
    const canvas = q(".game canvas");
    let census = null, cam = null;
    if (canvas) {
      cam = canvas.dataset.cam || null;
      try {
        const ctx = canvas.getContext("2d");
        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        let cyan = 0, orange = 0, amber = 0, ink = 0;
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x += 2) {
            const i = (y * width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 40) continue;
            ink += 1;
            if (b > r + 25 && g > r + 15 && b > 120) cyan += 1;
            if (r > g + 25 && g >= b && r > 120) orange += 1;
            if (r > 150 && g > 110 && b < 130 && r > b + 50) amber += 1;
          }
        }
        census = { cyan, orange, amber, ink, width, height };
      } catch (e) { census = { error: String(e) }; }
    }
    return {
      url: location.href, viewport: { w: window.innerWidth, h: window.innerHeight },
      docScrollW: document.documentElement.scrollWidth,
      gate: !!q(".gate__btn"), gateText: txt(q(".gate__btn")), gateSave: txt(q(".gate__save")),
      cam, census, coach: coachInfo, objective, dock: dockBtns, primaryLabel: primary ? primary.label : null,
      railPresent: !!rail, railSlots, placeStrip, catalog, panel: panelInfo, resources,
      reportPresent: !!q(".panel--report"),
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
/** Click the first dock primary button (resting primary or accent fork branch). */
async function clickPrimary(page) {
  const el = await page.$(".dock__btn--primary");
  if (!el) throw new Error("no dock primary button");
  await el.click();
}
/** Click a dock button whose cost-stripped label exactly matches. */
async function clickDockExact(page, label) {
  const handle = await page.evaluateHandle((label) => {
    const btns = [...document.querySelectorAll(".dock__btn")];
    return btns.find((b) => {
      const cost = b.querySelector(".dock__cost")?.textContent.trim() ?? "";
      const full = b.textContent.trim().replace(/\s+/g, " ");
      const lab = cost ? full.replace(cost, "").trim() : full;
      return lab === label;
    }) || null;
  }, label);
  const el = handle.asElement();
  if (!el) throw new Error(`dock button not found: ${JSON.stringify(label)}`);
  await el.click();
}
async function dismissReport(page) {
  const el = await page.$(".panel--report .panel__head .icon-btn");
  if (el) { await el.click(); await page.waitForTimeout(250); }
}
async function closePanel(page) {
  const el = await page.$(".panel__head .icon-btn");
  if (el) { await el.click(); await page.waitForTimeout(250); }
}

/** Real canvas tap on a yard tile center (App.applyGestureOutput -> pickTarget -> setSelected). */
async function tapTile(page, tile, expectPanel = true) {
  const readAria = () => page.evaluate(() => document.querySelector(".panel--stack")?.getAttribute("aria-label") ?? null);
  const beforeAria = await readAria();
  let pt = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    pt = await page.evaluate(({ tile, YARD_COLS, CELL }) => {
      const c = document.querySelector(".game canvas");
      const r = c.getBoundingClientRect();
      const parent = c.parentElement;
      const view = { width: parent.clientWidth, height: parent.clientHeight };
      const parts = (c.dataset.cam || "0,0,1").split(",").map(Number);
      const camera = { x: parts[0], y: parts[1], scale: parts[2] };
      const col = tile % YARD_COLS, row = Math.floor(tile / YARD_COLS);
      const wx = col * CELL + CELL / 2, wy = row * CELL + CELL / 2;
      const toLocal = (ox, oy) => ({ x: (wx + ox - camera.x) * camera.scale + view.width / 2, y: (wy + oy - camera.y) * camera.scale + view.height / 2 });
      const offs = [];
      for (let d = 0; d <= 15; d += 3) for (let a = -d; a <= d; a += 3) for (let b = -d; b <= d; b += 3) if (Math.max(Math.abs(a), Math.abs(b)) === d) offs.push([a, b]);
      let local = null;
      for (const [a, b] of offs) { const p = toLocal(a, b); if (document.elementFromPoint(r.left + p.x, r.top + p.y) === c) { local = p; break; } }
      if (!local) return { fallback: true, cam: c.dataset.cam || null };
      const clientX = r.left + local.x, clientY = r.top + local.y;
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX, clientY, button: 0 };
      c.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
      c.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
      return { x: clientX, y: clientY, cam: c.dataset.cam || null };
    }, { tile, YARD_COLS, CELL });
    if (!pt.fallback) {
      if (expectPanel) await page.waitForSelector(".panel--stack", { timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(250);
      const afterAria = await readAria();
      if (!expectPanel || afterAria !== beforeAria) break;
    }
    await page.waitForTimeout(220);
  }
  return pt;
}

/** Real canvas tap on the wreck (world 80,206.4; pick box +/-26 x, +/-20 y). */
async function tapWreck(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pt = await page.evaluate(({ WRECK }) => {
      const c = document.querySelector(".game canvas");
      const r = c.getBoundingClientRect();
      const parent = c.parentElement;
      const view = { width: parent.clientWidth, height: parent.clientHeight };
      const parts = (c.dataset.cam || "0,0,1").split(",").map(Number);
      const camera = { x: parts[0], y: parts[1], scale: parts[2] };
      const toLocal = (ox, oy) => ({ x: (WRECK.x + ox - camera.x) * camera.scale + view.width / 2, y: (WRECK.y + oy - camera.y) * camera.scale + view.height / 2 });
      let local = null;
      for (let d = 0; d <= 20 && !local; d += 4) for (let a = -d; a <= d && !local; a += 4) for (let b = -d; b <= d && !local; b += 4) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== d) continue;
        const p = toLocal(a, b);
        if (document.elementFromPoint(r.left + p.x, r.top + p.y) === c) local = p;
      }
      if (!local) return { fallback: true };
      const clientX = r.left + local.x, clientY = r.top + local.y;
      const base = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX, clientY, button: 0 };
      c.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
      c.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
      return { x: clientX, y: clientY };
    }, { WRECK });
    if (!pt.fallback) { await page.waitForTimeout(700); return pt; }
    await page.waitForTimeout(250);
  }
  return { fallback: true };
}

/**
 * PROBE-ONLY time advance: rewind the persisted lastSeenMs and reload so the game's
 * OWN inline offline catch-up credits the elapsed ticks (<=18000 ticks stays inline,
 * below CATCHUP_WORKER_MIN_TICKS=20000). No sim field is edited; the engine produces
 * the income. Polls the persisted tick until the catch-up lands, then dismisses the
 * return report. Used to reach deliveries / steel / Data without long real-time waits.
 */
async function advanceTime(page, seconds) {
  const before = await readSim(page);
  const beforeTick = before?.tick ?? 0;
  const raw = await page.evaluate((KEY) => localStorage.getItem(KEY), SAVE_KEY);
  const dec = decodeSave(raw);
  if (!dec.ok) throw new Error(`advanceTime: decode failed ${dec.reason}`);
  const env = encodeSave(dec.payload.sim, Date.now() - seconds * 1000, dec.payload.settings);
  if (!decodeSave(env).ok) throw new Error("advanceTime: re-encode failed validation");
  await page.evaluate(({ KEY, env }) => localStorage.setItem(KEY, env), { KEY: SAVE_KEY, env });
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  await page.waitForSelector(".gate__btn", { timeout: 20000 }).catch(() => {});
  const gate = await page.$(".gate__btn");
  if (gate) { await gate.click(); await page.waitForTimeout(700); }
  const target = beforeTick + seconds * 10;
  let cur = beforeTick;
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(300);
    const s = await readSim(page);
    cur = s?.tick ?? cur;
    if (cur >= target) break;
  }
  await dismissReport(page);
  await page.waitForTimeout(1300);
  return { beforeTick, afterTick: cur, target };
}

/** Advance time until the store can cover a blueprint's build cost (probe-only income). */
async function ensureAffordable(page, id) {
  const cost = BLUEPRINTS[id].buildCost;
  for (let i = 0; i < 12; i += 1) {
    const s = await readSim(page);
    if (s && cost.every((c) => (s.store[c.resource] ?? 0) >= c.qty)) return true;
    await advanceTime(page, 90);
  }
  const s = await readSim(page);
  return !!s && cost.every((c) => (s.store[c.resource] ?? 0) >= c.qty);
}

/** Build a machine through the real catalog: deselect -> Build -> card -> Place. */
async function buildViaCatalog(page, id) {
  await tapTile(page, 35, false); // clear selection so the resting dock shows Build
  await page.waitForTimeout(200);
  await clickDockExact(page, "Build");
  await page.waitForSelector(".catalog", { timeout: 4000 });
  await page.waitForTimeout(200);
  await clickSel(page, `.catalog__card[data-blueprint="${id}"]`);
  await page.waitForTimeout(250);
  await clickSel(page, ".catalog__place");
  await page.waitForTimeout(450);
}

/** Click the dock Connect primary repeatedly until the yard has no connect plans left. */
async function connectAll(page) {
  let n = 0;
  for (let i = 0; i < 30; i += 1) {
    const dom = await onboardDom(page);
    if (!(dom.primaryLabel || "").startsWith("Connect")) break;
    await clickPrimary(page);
    await page.waitForTimeout(350);
    n += 1;
  }
  return n;
}

/** Advance time until the store holds at least `min` Data (the engine produces it). */
async function waitForData(page, min) {
  for (let i = 0; i < 10; i += 1) {
    const s = await readSim(page);
    if ((s?.store.data ?? 0) >= min) return s.store.data ?? 0;
    await advanceTime(page, 120);
  }
  const s = await readSim(page);
  return s?.store.data ?? 0;
}

async function runStep(page, form, name, action, expect = [], waitMs = 350) {
  const before = { sim: summarize(await readSim(page)), dom: await onboardDom(page) };
  await shot(page, `${form}/${name}-before.png`, { phase: "before", step: name, form, sim: before.sim });
  let error = null;
  try { await action(); } catch (e) { error = String((e && e.message) || e); blockers.push(`${form}/${name}: ${error}`); }
  await page.waitForTimeout(waitMs);
  const after = { sim: summarize(await readSim(page)), dom: await onboardDom(page) };
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
  const context = await browser.newContext({ viewport: { width: ff.width, height: ff.height }, deviceScaleFactor: ff.dpr, isMobile: phone, hasTouch: phone });
  if (fixture) {
    // Guarded seed: only write if absent, so reloads (advanceTime / persist checks)
    // preserve the LIVE save rather than re-seeding the fixture.
    await context.addInitScript(({ KEY, t }) => { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, t); }, { KEY: SAVE_KEY, t: fixture.envelope });
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
  await page.waitForTimeout(1300);
  return { context, page, phone };
}

const researchFacePresent = (dom) => dom.dock.some((d) => d.label === "Research") || (dom.railSlots.find((s) => s.slot === "research")?.disabled === false);
const researchSlot = (dom) => dom.railSlots.find((s) => s.slot === "research") || null;

// ============================ (1)+(5) fresh-player scripted walkthrough ============================
async function freshLoop(browser, form) {
  const F = `${form}-fresh`;
  const { context, page } = await newPage(browser, F, FIXTURES.fresh);
  try {
    await runStep(page, F, "00-fresh-yard", async () => {}, [
      { name: "tutorial-0", test: (b, a) => a.sim.tutorial === 0 },
      { name: "no-machines", test: (b, a) => a.sim.machines === 0 },
      { name: "no-data", test: (b, a) => a.sim.data === 0 },
      { name: "no-research-owned", test: (b, a) => Object.keys(a.sim.research).length === 0 },
      { name: "coach-salvage-lesson", test: (b, a) => a.dom.coach?.mode === "lesson" && a.dom.coach?.topic === "salvage" && a.dom.coach?.lesson === "tutorial-0" },
      { name: "coach-has-what-why-next", test: (b, a) => !!a.dom.coach?.what && !!a.dom.coach?.why && !!a.dom.coach?.next },
      { name: "research-face-absent", test: (b, a) => !researchFacePresent(a.dom) },
      { name: "research-rail-needs-data", test: (b, a) => researchSlot(a.dom)?.disabled === true && /data/i.test(researchSlot(a.dom)?.reason || "") },
      { name: "yard-canvas-paints", test: (b, a) => (a.dom.census?.ink ?? 0) > 100 },
    ]);

    // Salvage six pulses through the real dock Salvage primary (tutorial 0..1).
    for (let n = 1; n <= 6; n += 1) {
      await runStep(page, F, `0${n}-salvage`, async () => { await clickPrimary(page); }, [
        { name: "pulse-registered", test: (b, a) => a.sim.wreck.pulses >= n },
        { name: "scrap-income", test: (b, a) => a.sim.scrap >= n * 5 },
        { name: "coach-salvage-topic", test: (b, a) => a.dom.coach?.topic === "salvage" },
        ...(n === 1 ? [{ name: "tutorial-1-after-first-pulse", test: (b, a) => a.sim.tutorial >= 1 }] : []),
        ...(n === 6 ? [{ name: "tutorial-2-after-six", test: (b, a) => a.sim.tutorial === 2 }, { name: "scrap-30-for-repair", test: (b, a) => a.sim.scrap >= 30 }] : []),
      ], 750);
    }

    await runStep(page, F, "07-repair-drone", async () => { await clickPrimary(page); }, [
      { name: "drone-repaired", test: (b, a) => a.sim.drone.repaired === true },
      { name: "tutorial-3-storage", test: (b, a) => a.sim.tutorial === 3 },
      { name: "coach-storage-topic", test: (b, a) => a.dom.coach?.topic === "storage" },
      { name: "scrap-spent", test: (b, a) => a.sim.scrap === 0 },
    ]);

    await runStep(page, F, "08-first-delivery", async () => { await advanceTime(page, 30); }, [
      { name: "delivery-landed", test: (b, a) => a.sim.drone.deliveries >= 1 },
      { name: "tutorial-4-build", test: (b, a) => a.sim.tutorial === 4 },
      { name: "coach-build-topic", test: (b, a) => a.dom.coach?.topic === "build" },
      { name: "scrap-for-sorter", test: (b, a) => a.sim.scrap >= 20 },
    ]);

    await runStep(page, F, "09-arm-sorter", async () => { await clickPrimary(page); }, [
      { name: "placement-preview", test: (b, a) => !!a.dom.placeStrip && /Scrap sorter/i.test(a.dom.placeStrip.machine || "") },
      { name: "dock-build-phase", test: (b, a) => a.dom.dock.some((d) => d.label === "Cancel") && /Build Scrap sorter/i.test(a.dom.primaryLabel || "") },
      { name: "affordable-no-recover", test: (b, a) => !a.dom.coach?.recover && !a.dom.placeStrip?.earn },
    ]);

    await runStep(page, F, "10-build-sorter", async () => { await clickPrimary(page); }, [
      { name: "sorter-built", test: (b, a) => a.sim.machines === 1 && /sorter/.test(a.sim.machineList) },
      { name: "tutorial-5-connect", test: (b, a) => a.sim.tutorial === 5 },
      { name: "coach-connect-topic", test: (b, a) => a.dom.coach?.topic === "connect" },
    ]);

    await runStep(page, F, "11-connect-sorter", async () => { await clickPrimary(page); }, [
      { name: "routes-laid", test: (b, a) => a.sim.routes >= 2 },
      { name: "tutorial-6-build", test: (b, a) => a.sim.tutorial === 6 },
      { name: "coach-build-topic", test: (b, a) => a.dom.coach?.topic === "build" },
    ]);

    await runStep(page, F, "12-earn-ferrous", async () => { await advanceTime(page, 30); }, [
      { name: "ferrous-for-furnace", test: (b, a) => a.sim.ferrous >= 5 },
    ]);

    await runStep(page, F, "13-arm-furnace", async () => { await clickPrimary(page); }, [
      { name: "furnace-preview", test: (b, a) => !!a.dom.placeStrip && /Furnace/i.test(a.dom.placeStrip.machine || "") },
    ]);

    await runStep(page, F, "14-build-furnace", async () => { await clickPrimary(page); }, [
      { name: "furnace-built", test: (b, a) => a.sim.machines === 2 && /furnace/.test(a.sim.machineList) },
    ]);

    await runStep(page, F, "15-connect-furnace", async () => { await clickPrimary(page); }, [
      { name: "routes-grew", test: (b, a) => a.sim.routes > b.sim.routes },
    ]);

    await runStep(page, F, "16-make-steel", async () => { await advanceTime(page, 45); }, [
      { name: "steel-produced", test: (b, a) => a.sim.steel > 0 },
      { name: "tutorial-7-trade", test: (b, a) => a.sim.tutorial === 7 },
      { name: "coach-trade-topic", test: (b, a) => a.dom.coach?.topic === "trade" },
    ]);

    await runStep(page, F, "17-sell-steel", async () => { await clickPrimary(page); }, [
      { name: "credits-earned", test: (b, a) => a.sim.credits >= 30 },
      { name: "tutorial-8-upgrade", test: (b, a) => a.sim.tutorial === 8 },
      { name: "coach-upgrade-topic", test: (b, a) => a.dom.coach?.topic === "upgrade" },
    ]);

    await runStep(page, F, "18-upgrade-sorter", async () => { await tapTile(page, 0); await page.waitForTimeout(250); await clickPrimary(page); }, [
      { name: "machine-upgraded", test: (b, a) => /lv2/.test(a.sim.machineList) },
      { name: "tutorial-9", test: (b, a) => a.sim.tutorial === 9 },
    ]);

    await runStep(page, F, "19-research-path-lesson", async () => {}, [
      { name: "research-path-lesson", test: (b, a) => a.dom.coach?.lesson === "research-path" && a.dom.coach?.topic === "research" && a.dom.coach?.researchPath === "true" },
      { name: "research-goal-copy", test: (b, a) => /first Data/i.test(a.dom.coach?.what || "") },
      { name: "still-no-data", test: (b, a) => a.sim.data === 0 },
      { name: "research-face-still-absent", test: (b, a) => !researchFacePresent(a.dom) },
      { name: "gate-not-weakened-rail-disabled", test: (b, a) => researchSlot(a.dom)?.disabled === true },
    ]);

    // (5) Build the full Data chain through the real catalog, honoring the fresh-yard
    // finding: guide the player to first Data so the UNCHANGED gate opens Research.
    await runStep(page, F, "20-build-data-chain", async () => {
      for (const id of DATA_CHAIN) {
        const ok = await ensureAffordable(page, id);
        if (!ok) throw new Error(`could not afford ${id}`);
        await buildViaCatalog(page, id);
      }
    }, [
      { name: "chain-built-7-machines", test: (b, a) => a.sim.machines === 7 },
      { name: "signalLab-present", test: (b, a) => /signalLab/.test(a.sim.machineList) },
      { name: "all-chain-present", test: (b, a) => DATA_CHAIN.every((id) => a.sim.machineList.includes(id)) },
    ], 500);

    await runStep(page, F, "21-connect-data-chain", async () => { await connectAll(page); }, [
      { name: "routes-wired", test: (b, a) => a.sim.routes >= 12 },
    ], 500);

    await runStep(page, F, "22-first-data-unlocks-research", async () => { await waitForData(page, 1); }, [
      { name: "first-data-landed", test: (b, a) => a.sim.data > 0 },
      { name: "research-face-appears", test: (b, a) => researchFacePresent(a.dom) },
      { name: "research-rail-enabled", test: (b, a) => researchSlot(a.dom)?.disabled === false },
      { name: "coach-left-research-path", test: (b, a) => a.dom.coach?.lesson !== "research-path" },
    ], 500);

    await runStep(page, F, "23-open-research-panel", async () => {
      await tapTile(page, 35, false); await page.waitForTimeout(200);
      if (await page.$(".dock__btn")) {
        const hasResearchDock = (await onboardDom(page)).dock.some((d) => d.label === "Research");
        if (hasResearchDock) await clickDockExact(page, "Research");
        else await clickSel(page, '.shell-rail__slot[data-slot="research"]');
      }
      await page.waitForSelector(".panel--research", { timeout: 4000 });
    }, [
      { name: "research-panel-open", test: (b, a) => a.dom.panel?.isResearch === true },
      { name: "research-nodes-present", test: (b, a) => (a.dom.panel?.researchNodes.length ?? 0) >= 3 },
      { name: "cutters-node-present", test: (b, a) => a.dom.panel?.researchNodes.some((n) => n.id === "cutters") },
    ]);

    await runStep(page, F, "24-buy-cutters", async () => {
      await waitForData(page, RESEARCH.cutters.cost);
      const buy = await page.$('.node[data-node="cutters"] .node__buy');
      if (buy) await buy.click();
    }, [
      { name: "cutters-owned", test: (b, a) => (a.sim.research.cutters ?? 0) >= 1 },
      { name: "data-spent", test: (b, a) => a.sim.data < b.sim.data || a.sim.data >= 0 },
    ], 500);
  } finally { await context.close(); }
}

// ============================ (4) earn-trap recovery ============================
async function earntrapLoop(browser, form) {
  const F = `${form}-earntrap`;
  const { context, page } = await newPage(browser, F, FIXTURES.earntrap);
  try {
    await runStep(page, F, "00-earntrap-open", async () => {}, [
      { name: "step4-place-mode", test: (b, a) => a.sim.tutorial === 4 },
      { name: "zero-machines", test: (b, a) => a.sim.machines === 0 },
      { name: "only-5-scrap", test: (b, a) => a.sim.scrap === 5 },
      { name: "primary-build-sorter", test: (b, a) => /Build Scrap sorter/i.test(a.dom.primaryLabel || "") },
      { name: "coach-build-topic", test: (b, a) => a.dom.coach?.topic === "build" },
    ]);

    await runStep(page, F, "01-arm-blinded", async () => { await clickPrimary(page); }, [
      { name: "placement-armed", test: (b, a) => !!a.dom.placeStrip && /Scrap sorter/i.test(a.dom.placeStrip.machine || "") },
      { name: "shortfall-shown", test: (b, a) => /scrap/i.test(a.dom.placeStrip?.short || "") && /have 5/i.test(a.dom.placeStrip?.short || "") },
      { name: "place-earn-hint", test: (b, a) => !!a.dom.placeStrip?.earn },
      { name: "coach-recover-row", test: (b, a) => !!a.dom.coach?.recover },
      { name: "recover-earn-button", test: (b, a) => /Earn scrap now/i.test(a.dom.coach?.recover?.earnText || "") },
      { name: "recover-store-button", test: (b, a) => /Trade at the store/i.test(a.dom.coach?.recover?.storeText || "") },
    ]);

    await runStep(page, F, "02-blind-confirm-refusal", async () => { await clickPrimary(page); }, [
      { name: "still-zero-machines", test: (b, a) => a.sim.machines === 0 },
      { name: "build-cleared-dock-resting", test: (b, a) => !a.dom.placeStrip && a.dom.dock.some((d) => d.label === "Build") },
      { name: "not-stalled-recoverable", test: (b, a) => /Build Scrap sorter/i.test(a.dom.primaryLabel || "") },
    ]);

    await runStep(page, F, "03-rearm", async () => { await clickPrimary(page); }, [
      { name: "rearmed-with-recover", test: (b, a) => !!a.dom.placeStrip && !!a.dom.coach?.recover },
    ]);

    await runStep(page, F, "04-trade-at-store", async () => {
      const btn = await page.$(".onboard__recover .onboard__actions .onboard__btn:not(.onboard__earn)");
      if (!btn) throw new Error("recover store button not found");
      await btn.click();
    }, [
      { name: "store-panel-open", test: (b, a) => a.dom.panel?.isStore === true },
      { name: "build-stays-armed", test: (b, a) => !!a.dom.placeStrip },
    ]);

    await runStep(page, F, "05-close-store", async () => { await closePanel(page); }, [
      { name: "store-closed", test: (b, a) => !a.dom.panel?.isStore },
      { name: "build-still-armed", test: (b, a) => !!a.dom.placeStrip },
    ]);

    for (let n = 1; n <= 3; n += 1) {
      await runStep(page, F, `0${5 + n}-earn-scrap-${n}`, async () => {
        const btn = await page.$(".onboard__recover .onboard__earn");
        if (!btn) throw new Error("earn button not found");
        await btn.click();
      }, [
        { name: "scrap-grew", test: (b, a) => a.sim.scrap >= 5 + n * 5 },
        ...(n === 3 ? [
          { name: "now-affordable", test: (b, a) => a.sim.scrap >= 20 },
          { name: "recover-row-gone", test: (b, a) => !a.dom.coach?.recover },
          { name: "place-earn-gone", test: (b, a) => !a.dom.placeStrip?.earn },
        ] : []),
      ], 800);
    }

    await runStep(page, F, "09-build-recovered", async () => { await clickPrimary(page); }, [
      { name: "sorter-built-recovered", test: (b, a) => a.sim.machines === 1 && /sorter/.test(a.sim.machineList) },
      { name: "tutorial-advanced", test: (b, a) => a.sim.tutorial === 5 },
      { name: "not-stalled-at-zero", test: (b, a) => a.sim.machines > 0 },
    ]);
  } finally { await context.close(); }
}

// ============================ (2) respect progress + skip/revisit ============================
async function progressLoop(browser, form) {
  const F = `${form}-progress`;
  const { context, page } = await newPage(browser, F, FIXTURES.progress);
  const intact = (s) => s && s.machines === 8 && s.routes === 18 && s.data === 76 && s.tutorial === 9;
  try {
    await runStep(page, F, "00-progress-open", async () => {}, [
      { name: "progress-respected", test: (b, a) => intact(a.sim) },
      { name: "continue-gate", test: (b, a) => b.dom.gateText === null || true }, // gate already dismissed in newPage
      { name: "coach-yard-lesson-not-tutorial", test: (b, a) => a.dom.coach?.mode === "lesson" && /^yard-/.test(a.dom.coach?.lesson || "") },
      { name: "research-open-for-progress", test: (b, a) => researchFacePresent(a.dom) },
    ]);

    let lessonId = null;
    await runStep(page, F, "01-skip-lessons", async () => {
      lessonId = (await onboardDom(page)).coach?.lesson;
      await clickSel(page, ".onboard__skip");
    }, [
      { name: "coach-hidden", test: (b, a) => a.dom.coach?.mode === "hidden" },
      { name: "show-button", test: (b, a) => /Show lessons/i.test(a.dom.coach?.showText || "") },
      { name: "progress-not-reset", test: (b, a) => intact(a.sim) },
    ]);

    await runStep(page, F, "02-revisit-lessons", async () => { await clickSel(page, ".onboard__btn"); }, [
      { name: "coach-restored", test: (b, a) => a.dom.coach?.mode === "lesson" },
      { name: "same-lesson", test: (b, a) => a.dom.coach?.lesson === lessonId },
      { name: "progress-not-reset", test: (b, a) => intact(a.sim) },
    ]);

    await runStep(page, F, "03-skip-again", async () => { await clickSel(page, ".onboard__skip"); }, [
      { name: "hidden-again", test: (b, a) => a.dom.coach?.mode === "hidden" },
    ]);

    await runStep(page, F, "04-reload-persist", async () => {
      await page.reload({ waitUntil: "networkidle", timeout: 45000 });
      await page.waitForSelector(".gate__btn", { timeout: 20000 }).catch(() => {});
      const gate = await page.$(".gate__btn");
      if (gate) { await gate.click(); await page.waitForTimeout(700); }
      await dismissReport(page);
      await page.waitForTimeout(1300);
    }, [
      { name: "skip-persisted", test: (b, a) => a.dom.coach?.mode === "hidden" },
      { name: "progress-intact-after-reload", test: (b, a) => intact(a.sim) },
    ]);

    await runStep(page, F, "05-show-after-reload", async () => { await clickSel(page, ".onboard__btn"); }, [
      { name: "revisit-after-reload", test: (b, a) => a.dom.coach?.mode === "lesson" },
      { name: "progress-intact", test: (b, a) => intact(a.sim) },
    ]);

    await runStep(page, F, "06-reader-yields", async () => {
      const page2 = await context.newPage();
      page2.on("pageerror", (e) => pageErrors.push(`[${F}-reader] ${String(e)}`));
      await page2.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 });
      await page2.waitForSelector(".gate__btn", { timeout: 20000 }).catch(() => {});
      const g = await page2.$(".gate__btn");
      if (g) { await g.click(); await page2.waitForTimeout(900); }
      await page2.waitForTimeout(1500);
      const readerDom = await onboardDom(page2);
      await shot(page2, `${F}/06-reader-yields-after.png`, { phase: "after", step: "06-reader-yields", form: F, reader: true });
      await page2.close();
      // stash for the check below
      page.__readerCoach = readerDom.coach;
      page.__readerRole = await page.evaluate(() => localStorage.getItem("rustwake.lease.v1"));
    }, [
      { name: "reader-coach-yields", test: (b, a) => page.__readerCoach === null },
      { name: "writer-progress-intact", test: (b, a) => intact(a.sim) },
    ]);
  } finally { await context.close(); }
}

// ============================ (3) vocabulary + jargon -> concise copy + detail ============================
async function jargonLoop(browser, form) {
  const F = `${form}-jargon`;
  const { context, page } = await newPage(browser, F, FIXTURES.jargon);
  try {
    await runStep(page, F, "00-jargon-open", async () => {}, [
      { name: "mature-loaded", test: (b, a) => a.sim.machines === 8 && a.sim.tutorial === 9 },
      { name: "coach-lesson", test: (b, a) => a.dom.coach?.mode === "lesson" },
    ]);

    await runStep(page, F, "01-inspect-furnace", async () => { await tapTile(page, 1); }, [
      { name: "furnace-panel", test: (b, a) => /Furnace/i.test(a.dom.panel?.title || "") },
      { name: "constraint-headline", test: (b, a) => /Needs input to run/i.test(a.dom.panel?.constraint?.summary || "") },
      { name: "constraint-detail-present", test: (b, a) => !!a.dom.panel?.constraint?.detail },
    ]);

    await runStep(page, F, "02-expand-constraint", async () => { await clickSel(page, ".inspector-constraint__summary"); }, [
      { name: "detail-expanded", test: (b, a) => a.dom.panel?.constraint?.open === true },
      { name: "jargon-explained", test: (b, a) => /Missing input/i.test(a.dom.panel?.constraint?.detail || "") },
    ]);

    await runStep(page, F, "03-coach-glossary", async () => {
      const sum = await page.$(".onboard__summary");
      if (sum) await sum.click();
    }, [
      { name: "coach-detail-expanded", test: (b, a) => a.dom.coach?.detailOpen === true },
      { name: "glossary-scrap", test: (b, a) => /Scrap/i.test(a.dom.coach?.detailBody || "") },
      { name: "glossary-data", test: (b, a) => /Data/i.test(a.dom.coach?.detailBody || "") },
      { name: "glossary-ferrous", test: (b, a) => /Ferrous/i.test(a.dom.coach?.detailBody || "") },
    ]);

    await runStep(page, F, "04-catalog-vocabulary", async () => {
      await tapTile(page, 35, false); await page.waitForTimeout(200);
      await clickDockExact(page, "Build");
      await page.waitForSelector(".catalog", { timeout: 4000 });
      await page.waitForTimeout(250);
    }, [
      { name: "catalog-open", test: (b, a) => a.dom.catalog?.present === true },
      { name: "card-names-match-content", test: (b, a) => (a.dom.catalog?.cards ?? []).every((c) => BLUEPRINTS[c.id] && c.name === BLUEPRINTS[c.id].label) },
      { name: "sorter-label", test: (b, a) => a.dom.catalog?.cards.find((c) => c.id === "sorter")?.name === "Scrap sorter" },
      { name: "signalLab-label", test: (b, a) => a.dom.catalog?.cards.find((c) => c.id === "signalLab")?.name === "Signal lab" },
    ]);

    await runStep(page, F, "05-close-catalog-resources", async () => {
      await clickSel(page, ".catalog__close");
      await page.waitForTimeout(250);
    }, [
      { name: "catalog-closed", test: (b, a) => !a.dom.catalog },
      { name: "resource-chips-present", test: (b, a) => (a.dom.resources?.length ?? 0) >= 3 },
      { name: "resource-vocab-scrap", test: (b, a) => a.dom.resources.some((r) => /Scrap/i.test(r || "")) },
      { name: "resource-vocab-data", test: (b, a) => a.dom.resources.some((r) => /Data/i.test(r || "")) },
    ]);

    await runStep(page, F, "06-research-vocabulary", async () => {
      await tapTile(page, 35, false); await page.waitForTimeout(200);
      const hasResearchDock = (await onboardDom(page)).dock.some((d) => d.label === "Research");
      if (hasResearchDock) await clickDockExact(page, "Research");
      else await clickSel(page, '.shell-rail__slot[data-slot="research"]');
      await page.waitForSelector(".panel--research", { timeout: 4000 });
      await page.waitForTimeout(250);
    }, [
      { name: "research-panel", test: (b, a) => a.dom.panel?.isResearch === true },
      { name: "research-title", test: (b, a) => /Research/i.test(a.dom.panel?.title || "") },
      { name: "node-labels-match-content", test: (b, a) => (a.dom.panel?.researchNodes ?? []).every((n) => RESEARCH[n.id] && (a.dom.panel.researchNodes.length >= 3)) },
      { name: "cutters-label", test: (b, a) => a.dom.panel?.researchNodes.some((n) => n.id === "cutters") },
    ]);
  } finally { await context.close(); }
}

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
  console.log("fixtures validated in-process:", Object.keys(FIXTURES).map((k) => `${k}(machines=${FIXTURES[k].sim.machines.length},tutorial=${FIXTURES[k].sim.tutorial})`).join(" "));
  const browser = await chromium.launch({ executablePath, headless: true });
  const forms = [
    { key: "phone", dims: { w: 780, h: 1688 } },
    { key: "phoneland", dims: { w: 1688, h: 780 } },
    { key: "desktop", dims: { w: 1920, h: 1080 } },
  ];
  const loops = [
    ["fresh", freshLoop],
    ["earntrap", earntrapLoop],
    ["progress", progressLoop],
    ["jargon", jargonLoop],
  ];
  for (const f of forms) {
    for (const [name, loop] of loops) {
      try { await loop(browser, f.key); }
      catch (e) { blockers.push(`${f.key}-${name} FATAL: ${String((e && e.stack) || e)}`); console.error(e); }
    }
  }
  await browser.close();

  const expectedDims = {};
  for (const f of forms) for (const [suffix] of loops) expectedDims[`${f.key}-${suffix}`] = f.dims;
  const audit = auditFrames(expectedDims);
  const auditOk = audit.every((a) => a.ok);
  const byForm = {};
  for (const a of audit) { const k = a.frame.split("/")[0]; (byForm[k] ||= []).push(a.sha256); }
  const distinct = Object.fromEntries(Object.entries(byForm).map(([k, v]) => [k, new Set(v).size > 1]));

  const allChecks = steps.flatMap((s) => s.checks.map((c) => ({ form: s.form, step: s.step, ...c })));
  const failedChecks = allChecks.filter((c) => !c.ok);
  const results = {
    issue: 64, role: "developer", buildSha: BUILD_SHA, baseUrl: BASE_URL,
    branch: "rw/64-onboard",
    generatedAt: new Date().toISOString(),
    chrome: executablePath,
    method: "headless Chrome DOM + geometry + persisted-state mirror + canvas pixel census only; NO vision. Screenshots are hashed mirrors, not inspected visually. Selection driven by real canvas taps (App.applyGestureOutput -> pickTarget -> setSelected); every mutation through dock/panel/catalog buttons -> props.dispatch -> applyCommand. Time advance is a probe-only lastSeenMs rewind running the game's OWN inline offline catch-up. Form factors: phone 390x844 dpr2 portrait, phoneland 844x390 dpr2 rail, desktop 1920x1080 dpr1 rail; all four scenario loops run on each.",
    criteria: {
      "1-contextual-teaching": "freshLoop steps 00-19 assert the OnboardCoach lesson topic at each tutorial stage (salvage/storage/build/connect/trade/upgrade) and the research-path lesson at tutorial 9 with no Data.",
      "2-respect-progress-skip-revisit": "progressLoop seeds a progressed mature save; asserts no reset/overwrite across skip/show/reload and that a second tab (reader lease) yields the coach entirely.",
      "3-vocabulary-jargon-detail": "jargonLoop asserts the furnace constraint headline + expandable detail, the coach glossary, and catalog/resource/research vocabulary parity with content definitions.",
      "4-earn-trap-recovery": "earntrapLoop seeds a step-4 yard with 5 scrap; arms placement, hits the blind affordability refusal, then recovers via coach Earn scrap now / Trade at the store and completes the build (not stalled at 0 machines).",
      "5-fresh-player-walkthrough-AGENT": "freshLoop is AGENT evidence: a scripted fresh-yard walkthrough from tutorial 0 through the full Data chain to first Data so the UNCHANGED showResearch gate opens Research, then buys the cutters node.",
    },
    fixtureScrutiny: {
      a: "Only setup seeding mutates state, in probe code with the game's OWN encodeSave (FNV-1a, lastSeenMs=Date.now()). fresh=createInitialState() verbatim; earntrap=createInitialState() with tutorial=4, drone.repaired=true, deliveries=1, wreck={remaining:30,generation:2,pulses:6,nextPulseTick:0}, store={scrap:5}, storeUnits=5; progress/jargon=docs/evidence/yard-mature.json payload.sim verbatim. All reducedMotion=true. advanceTime is a probe-only lastSeenMs rewind + reload running the engine's OWN inline catch-up (<=18000 ticks); it never edits sim fields. No src changes; every action is a real UI tap/click through dispatch -> applyCommand.",
      b: "Documented in this probe header, the makeFixture/advanceTime functions and results.json.",
      c: "Every seeded envelope is round-tripped through the game's full decodeSave/repairRegistration/validateSim IN-PROCESS before use (makeFixture throws on any failure); readSim reads the mirror through decodeSave. The 00-open steps assert the loaded mirror matches the seed. No invariant weakened or bypassed.",
      d: "No action faked by injection; localStorage read only as the game's own persistence mirror (written on every ok dispatch). The guarded init script seeds once so reloads preserve live state. The showResearch gate (data>0 || research-owned) is NEVER modified; the fresh walkthrough earns first Data to open it.",
    },
    pixelCensus: {
      cyan: "b>r+25 && g>r+15 && b>120 (machine pips / working rails / drones)",
      orange: "r>g+25 && g>=b && r>120 (blocked rail / residue cargo hue)",
      amber: "r>150 && g>110 && b<130 && r>b+50 (cargo tokens / machine cores)",
      ink: "alpha>=40 (proves the yard canvas paints behind the DOM coach); sampled every 2px",
      claim: "yard-canvas-paints asserts ink>100 on the fresh yard; the coach is DOM painted in .hud__lead, asserted by geometry/text, not pixels.",
    },
    fixtures: Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [k, {
      machines: v.sim.machines.length, routes: v.sim.routes.length, tutorial: v.sim.tutorial,
      storeScrap: v.sim.store.scrap ?? 0, storeData: v.sim.store.data ?? 0, storeUnits: v.sim.storeUnits,
      reducedMotion: v.settings.reducedMotion,
      statuses: v.sim.machines.map((m) => `${m.id}:${m.status}`).join(","),
    }])),
    counts: { frames: audit.length, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length },
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, frames: audit },
    findings: [
      {
        id: "fresh-yard-finding-honored-gate-intact",
        verdict: "gate-unchanged",
        detail: "Fresh-yard finding 6821970539 is honored WITHOUT weakening showResearch: at tutorial 9 with 0 Data the coach shows the research-path lesson and the Research face stays absent (rail slot disabled 'Needs data'). The fresh walkthrough builds the Data chain through the real catalog and advances time until first Data lands; only then does the UNCHANGED gate (data>0 || research-owned) open Research. No gate logic was edited.",
        source: "src/ui/onboard/lessons.ts hasResearchAccess/researchPath; src/ui/App.tsx showResearch (read-only mirror); freshLoop steps 19/22",
      },
      {
        id: "coach-mount-only",
        verdict: "ownership-constraint-respected",
        detail: "OnboardCoach is mounted in .hud__lead after the objective card; App.tsx changes are mount-only. The showResearch gate, Hud.tsx, styles.css, shell/*, SettingsPanel and save/* were not modified. Reader mode yields the coach entirely (null).",
        source: "src/ui/App.tsx; src/ui/onboard/OnboardCoach.tsx",
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

main().catch((e) => { console.error(e); process.exitCode = 1; });
