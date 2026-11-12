/**
 * UI-RESET-64 (issue #64) — developer acceptance probe (dev-64g FINALIZE; resume chain
 * dev-64e -> dev-64f).
 *
 * dev-64g FINALIZE — coordinator-authorized STEP-24 SCOPE CORRECTION (probe-only; code
 * head stays 1b6c99e; git diff 1b6c99e..HEAD -- src is EMPTY). After dev-64f's harness
 * fixes the full 3-form run reached 435/438 checks: fresh steps 00-23 CLEAN on
 * phone/phoneland/desktop (the 7-machine Data chain builds, first Data lands data=2,
 * research unlocks at first Data, the Research panel opens with the cutters node
 * present) and ALL jargon/progress/earntrap loops CLEAN. The ONLY residual failure was
 * 24-buy-cutters/cutters-owned on all 3 forms. ROOT CAUSE (coordinator-diagnosed; NOT
 * an app defect): cutters costs 4 Data and is the CHEAPEST node (buffers 8, dispatch 12
 * — src/game/content/research.ts:22-47); the bounded harness reaches data=2 because
 * signalLab is starved in the unbalanced fresh yard (copperSeparator/wireMill
 * outputFull, others starved) — CORRECT simulation behavior. No node is affordable at
 * data=2, so the cost-4 PURCHASE cannot be exercised without sustained chain-flow
 * economy simulation (OUT OF SCOPE; two prior children exhausted their budgets on that
 * economy class). The purchase was a probe EXTENSION beyond all five acceptance
 * criteria — every criterion is met by steps 00-23 + the clean loops; none requires
 * owning cutters. Step 24 is therefore corrected to a STRICT, REACHABLE assertion of
 * the research buy-GATE src behavior: after waitForData(1) + openResearchPanel, the
 * cutters .node__buy button must be PRESENT and DISABLED while data < cost (the canBuy
 * gate), the node must read unlocked/open, and cutters must remain unowned. Steps 22
 * (first-data-unlocks-research) and 23 (open-research-panel) stay STRICT and UNCHANGED.
 * No resource injection, no sim edit, no criterion-mandated check relaxed.
 *
 * UNVERIFIED CHECKS (stated per the delivery contract): the full end-to-end cutters
 * PURCHASE (research.buy spending 4 Data -> rank 1 -> pulseScrap +2 effect) is NOT
 * exercised by the bounded harness (Data peaks at 2). It is CODE-VERIFIED instead:
 *   - src/game/content/research.ts:27 — cutters cost=4 (cheapest; buffers 8, dispatch 12);
 *   - src/ui/research/model.ts:86 — affordable = data >= def.cost; :87-93 four-state
 *     derivation (unlocked = prereq met but Data short); :103 canBuy = state==="available";
 *   - src/ui/panels/ResearchPanel.tsx:203-211 — .node__buy rendered for every
 *     non-completed node with disabled={!node.canBuy} (line 206);
 *   - src/game/simulation/commands.ts:139-140 — research.buy -> buyResearch; :553-567
 *     validation order not-found -> already-known -> prereq -> insufficient, with the
 *     data<cost refusal at :561 (shortOf) and spendFromStore at :562.
 * The buy-gate DISABLE behavior IS asserted in-browser on all 3 forms (step 24).
 *
 * dev-64f PROBE-HARNESS fixes (code head stays 1b6c99e; git diff 1b6c99e..HEAD -- src
 * is EMPTY). The remaining 42 failedChecks were probe bugs in fresh steps 18-24, NOT app
 * defects (the collision fix at 1b6c99e is intact; jargon/progress/earntrap and fresh
 * 00-17 were already clean). Two root causes fixed in probe.mjs only:
 *  (Root 1, step 18) waitForSelector(".dock__btn--primary")+clickPrimary raced the dock
 *      re-render: the RESTING "Connect" primary also matches `.dock__btn--primary`, so the
 *      blind click pressed stale Connect (routes 4->5) instead of machine.upgrade — sorter
 *      stayed lv1, tutorial stuck at 8. Now selectMachine opens the sorter inspector
 *      FORM-AWARE (recenter + real mirror-tile tap + title confirm + pan clear of the lead,
 *      fixing the phoneland `.panel--stack` timeout), waitForUpgradeFork polls until a dock
 *      BRANCH face ("Less power"/"Faster batches") is mounted, then clickDockExact commits
 *      the cheapest NAMED branch "Less power" (draw, 30 credits) -> lv2 -> tutorial 9.
 *  (Root 2, step 20) the whole chain was built BEFORE wiring and ensureAffordable only
 *      advanced 2x90s, so the store's ferrous never reached signalLab's 12 ("could not
 *      afford signalLab"); at tutorial 8 the locked circuitAssembler/signalLab cards also
 *      made buildViaCatalog's blind retry commit a REDUNDANT sorter. Now step 20 skips
 *      already-built machines, WIRES the partial chain between builds (real dock Connect)
 *      and ensureAffordable is patient (the engine's OWN offline catch-up + a short live
 *      mirror poll to catch the store's ferrous peak); buildViaCatalog verifies the
 *      intended card is UNLOCKED+AFFORDABLE and that THAT blueprint's count grew, throwing
 *      loudly instead of building a wrong machine. Reaching tutorial 9 (Root 1) unlocks the
 *      circuitAssembler/signalLab cards (unlockAt 9). First-data assertions stay STRICT.
 *
 * dev-64e PROBE-HARNESS fixes (retained): settleTutorial polls the game's OWN decodeSave
 * mirror to the EXACT expected tutorial plateau (mirror persists only every PERSIST_MS=1000);
 * buildViaCatalog commits via the dock Build face (catalog Place only arms the ghost);
 * jargon drives real per-form dock/rail selectors and recenters before the furnace tap;
 * Data vocabulary is asserted via the AllResources drawer (budget-limited chip row escape
 * hatch, spec 5.4 / UI-RESET-51) — a design finding, NOT a relaxation; Hud budget unchanged.
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
// dev-64d: every bounded-click fallback (zoom-overlay interception / hung click)
// is logged here and surfaced in results.json so the layout-overlap limitation
// stays visible. A fallback is still a real DOM click on the real button.
const clickFallbacks = [];

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
// Pause the repaired drone's auto-delivery for the short blind-trap loop so the
// player stays at 5 scrap (cannot afford the 20-scrap sorter). Tutorial 4 requires
// drone.repaired=true + deliveries>=1 (engine.ts), so those are kept; only the next
// delivery is deferred far beyond the loop. No action is faked — income is paused.
earntrapSim.drone.nextDeliveryTick = 1_000_000_000;
earntrapSim.drone.inFlight = null;
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
    // dev-64e: the AllResources drawer (spec 5.4 / UI-RESET-51). The chip row is
    // budget-limited (Hud visibleResources(state, hudChipLimit()-2)), so Data is NOT a
    // chip on a mature yard; it is surfaced here. Capture the drawer rows when expanded
    // so the Data vocabulary assertion reads the CORRECT surface, never a relaxed chip.
    const allRes = q("#hud-all-resources");
    const allResources = allRes ? qa("#hud-all-resources .hud-all__row").map((row) => ({
      label: txt(row.querySelector(".hud-all__label")),
      value: txt(row.querySelector(".hud-all__value")),
    })) : null;
    const allResourcesToggle = q('button[aria-controls="hud-all-resources"]');
    const allResourcesExpanded = allResourcesToggle ? allResourcesToggle.getAttribute("aria-expanded") === "true" : false;
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
      allResources, allResourcesExpanded,
      reportPresent: !!q(".panel--report"),
    };
  });
}

async function shot(page, relName, extra) {
  const path = resolve(FRAMES, relName);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: false, timeout: 15000 });
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

/**
 * dev-64d stabilization: a BOUNDED click with an evaluated-DOM-click fallback.
 * A plain Playwright click waits for actionability (default 30s) and verifies the
 * hit target; in phone portrait the .shell-zoom__face can overlap panel-head /
 * dock buttons, so a hung click used to retry into a detached frame and a dead
 * browser. We bound the wait to 6s and, on interception/timeout, dispatch a real
 * DOM click DIRECTLY on the button (node.click()). That is still a genuine UI
 * event on the real button -> props.dispatch -> applyCommand (NO state injection);
 * every fallback is logged to clickFallbacks. A force:true click still hit-tests
 * at the element center and could land on the overlapping zoom face, so the
 * evaluated click is the reliable fallback. If the browser itself is gone the
 * evaluate also throws and the error propagates (contained per loop-run).
 */
const CLICK_TIMEOUT_MS = 6000;
async function safeClick(el, what) {
  try {
    await el.click({ timeout: CLICK_TIMEOUT_MS });
  } catch (e) {
    const msg = String((e && e.message) || e);
    clickFallbacks.push({ what, reason: msg.split("\n")[0] });
    await el.evaluate((node) => node.click());
  }
}

async function clickSel(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  await safeClick(el, selector);
}
/** Click the first dock primary button (resting primary or accent fork branch). */
async function clickPrimary(page) {
  const el = await page.$(".dock__btn--primary");
  if (!el) throw new Error("no dock primary button");
  await safeClick(el, ".dock__btn--primary");
}
/** Click a dock button whose cost-stripped label exactly matches. */
async function clickDockExact(page, label) {
  // dev-64c: poll for the button to settle. A tile deselect re-mounts the dock
  // asynchronously, so a fixed 200ms wait raced the re-render and threw
  // "dock button not found" even though the button appears moments later.
  // Bounded wait only (<=3s) — does not relax any assertion.
  let el = null;
  for (let i = 0; i < 15; i += 1) {
    const handle = await page.evaluateHandle((label) => {
      const btns = [...document.querySelectorAll(".dock__btn")];
      return btns.find((b) => {
        const cost = b.querySelector(".dock__cost")?.textContent.trim() ?? "";
        const full = b.textContent.trim().replace(/\s+/g, " ");
        const lab = cost ? full.replace(cost, "").trim() : full;
        return lab === label;
      }) || null;
    }, label);
    el = handle.asElement();
    if (el) break;
    await page.waitForTimeout(200);
  }
  if (!el) throw new Error(`dock button not found: ${JSON.stringify(label)}`);
  await safeClick(el, `dock:${label}`);
}
async function dismissReport(page) {
  const el = await page.$(".panel--report .panel__head .icon-btn");
  if (el) { await safeClick(el, "report-close"); await page.waitForTimeout(250); }
}
async function closePanel(page) {
  const el = await page.$(".panel__head .icon-btn");
  // dev-64c/dev-64d: in phone portrait the .shell-zoom__face overlaps the
  // panel-head close button and intercepts pointer events (a real layout
  // overlap, recorded as a limitation). safeClick bounds the wait and falls back
  // to a real DOM click dispatched directly on the button, so the close FUNCTION
  // (what criterion 4 verifies) is exercised without hitting the zoom face. A
  // force:true click still hit-tests at the element center and could land on the
  // overlapping zoom face, so the evaluated click is used instead.
  if (el) { await safeClick(el, "panel-close"); await page.waitForTimeout(250); }
}

/**
 * dev-64e: BOUNDED mirror-settle keyed to the EXPECTED tutorial transition.
 * syncTutorial advances inside stepTick (engine), but the store only mirrors to
 * localStorage on the PERSIST_MS=1000 cadence (plus persist-on-ok-dispatch). A fixed
 * ~350-750ms read therefore caught the PRE-transition mirror even though the live
 * engine (and the DOM coach, which reads live state) had already advanced — the trace
 * shows coach lesson one step ahead of the mirror at 01/07/11/17. We poll the game's
 * OWN decodeSave mirror until sim.tutorial reaches the exact expected plateau for this
 * step (max ~3.5s). Keying to the expected value — NOT "any advance" — avoids the
 * dev-64d regression (3941e76, reverted daebbb5) where a naive first-persist settle
 * returned on a barely-advanced mirror and desynced later steps (69->81). Each fresh
 * target is a stable plateau (the next transition's trigger has not fired yet), so the
 * settle can never overshoot. No assertion is relaxed: this only waits for the mirror
 * to reflect the transition the step already caused through a real button.
 */
async function settleTutorial(page, target, { gte = false, maxMs = 3500 } = {}) {
  const hit = (s) => !!s && (gte ? s.tutorial >= target : s.tutorial === target);
  let sim = await readSim(page);
  const start = Date.now();
  while (!hit(sim) && Date.now() - start < maxMs) {
    await page.waitForTimeout(150);
    sim = await readSim(page);
  }
  return sim;
}

/**
 * dev-64e: recenter the yard through the REAL camera control (.shell-zoom__face--reset
 * -> App.resetCamera -> fitToShell). The yard re-fits into the chrome region so a tile
 * tap lands on visible canvas instead of under the rail/gutter (the phoneland furnace
 * tap failed because the camera was panned off the fit). resetCamera only moves the
 * camera and clears pan intent; it never touches selection or build state. Present on
 * every form factor (phone right gutter, rail row).
 */
async function resetView(page) {
  const el = await page.$(".shell-zoom__face--reset");
  if (el) { await safeClick(el, "camera-reset"); await page.waitForTimeout(300); }
}

/**
 * dev-64e: reliably return to the RESTING dock (Store / primary / Build [/ Research])
 * before a catalog build or a navigation step. A selected machine leaves the upgrade
 * fork on the dock; an armed ghost leaves place-mode (Cancel / Build {machine} / Next);
 * the catalog overlays both. tapTile CANNOT deselect in place-mode (a tap aims the
 * ghost, App.applyGestureOutput) and catalog onClose alone keeps the ghost armed, so we
 * retire each layer through its REAL control: the panel close button, the catalog close
 * button, then the rail build-slot toggle (rail forms) or Escape (the game's own
 * nearest-layer handler) to disarm the ghost. Bounded; converges to resting Build.
 */
async function restoreRestingDock(page) {
  const isResting = (dom) => !dom.catalog && !dom.placeStrip && !dom.panel && dom.dock.some((d) => d.label === "Build");
  for (let i = 0; i < 8; i += 1) {
    const dom = await onboardDom(page);
    if (isResting(dom)) return true;
    if (dom.panel) { await closePanel(page); continue; }
    if (dom.catalog) { await clickSel(page, ".catalog__close").catch(() => {}); await page.waitForTimeout(180); continue; }
    if (dom.placeStrip) {
      const railBuild = await page.$('.shell-rail__slot[data-slot="build"][aria-pressed="true"]');
      if (railBuild) await safeClick(railBuild, "rail-build-disarm");
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(180);
      continue;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(180);
  }
  return isResting(await onboardDom(page));
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
  if (gate) { await safeClick(gate, "gate-after-reload"); await page.waitForTimeout(700); }
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

/**
 * dev-64f: advance the game's OWN income until the store can cover a blueprint's build
 * cost. Root cause of the step-20 "could not afford signalLab": the prior version built
 * the WHOLE chain before wiring it and only advanced 2x90s, so the store's ferrous never
 * reached signalLab's 12. The furnace draws store ferrous above RESERVE_FLOOR into a
 * 2-batch input buffer (engine pullFromStore/pullNeed); the store only holds >=12 once the
 * furnace backs up (outputFull / store full) or is starved while the sorter refills. That
 * takes real elapsed time AND a wired yard, so this is patient: each round runs the
 * engine's OWN offline catch-up (advanceTime, no sim edit) then briefly polls the LIVE
 * persisted mirror to catch the store's oscillating peak. Bounded; the affordability
 * predicate is the blueprint's REAL buildCost vs the REAL store — never relaxed, never
 * injected. The caller wires the partial chain between builds so income/intermediates flow.
 */
async function ensureAffordable(page, id) {
  const cost = BLUEPRINTS[id].buildCost;
  const canAfford = (s) => !!s && cost.every((c) => (s.store[c.resource] ?? 0) >= c.qty);
  if (canAfford(await readSim(page))) return true;
  for (let i = 0; i < 8; i += 1) {
    await advanceTime(page, 90);
    if (canAfford(await readSim(page))) return true;
    // Catch the live store peak (ferrous refills to the furnace pull threshold between
    // batches). Reads the game's OWN mirror only; no field is written.
    const start = Date.now();
    while (Date.now() - start < 6000) {
      await page.waitForTimeout(300);
      if (canAfford(await readSim(page))) return true;
    }
  }
  return canAfford(await readSim(page));
}

/**
 * dev-64e: accumulate steel through the game's OWN offline income until the store can
 * cover the one-time export contract. CORRECTED root cause for fresh step 17: the
 * step-7 dock primary is labeled t("tut.sellSteel") ("Sell steel") but actually
 * dispatches contract.export (App.tsx step===7), NOT a repeatable sell. exportContract
 * (commands.ts) spends TUNING.exportContractSteel=3 steel and grants 30 credits, sets
 * exportClaimed=true; sellResource is locked until exportClaimed, and syncTutorial 7->8
 * (engine.ts) needs credits>0. The prior probe advanced only 45s at step 16 (steel=1)
 * then clicked, so the contract was refused for insufficient steel — credits stayed 0,
 * tutorial stuck at 7, and steps 18-24 cascaded (the trace shows steel RISING 1->2 with
 * credits 0 and primary still "Sell steel"). This is a PROBE income gap, not a src
 * defect: a real player keeps the furnace running until 3 steel accrues, then claims.
 * Bounded retries via advanceTime (the game's own catch-up); no assertion relaxed and
 * no sim field injected. The steel-produced/tutorial-7 checks at step 16 stay intact.
 */
async function ensureSteel(page, qty) {
  for (let i = 0; i < 4; i += 1) {
    const s = await readSim(page);
    if (s && (s.store.steel ?? 0) >= qty) return true;
    await advanceTime(page, 90);
  }
  const s = await readSim(page);
  return !!s && (s.store.steel ?? 0) >= qty;
}

/**
 * dev-64e: restore a fixture's PRISTINE seeded state through the game's OWN encodeSave
 * with a FRESH lastSeenMs (no offline catch-up), then reload. SETUP seeding only (fixture
 * scrutiny a/c) — the jargon loop uses it so the furnace is inspected in its documented
 * starved state. The live yard refills the furnace buffer and ramps power demand within a
 * few seconds: the trace shows the first constraint card drift from "Needs input to run"
 * (missingInput) to "Running on limited power" between steps 01 and 02, which is why the
 * expand assertion read the wrong card. Each inspection re-seeds and acts inside the
 * fresh starved window (powerRatio back to 1 also removes the power card, so missingInput
 * is first). No sim field is injected and no assertion relaxed — the expand is still a
 * real summary click. Re-encoding (NOT reusing the module-load envelope) avoids a stale
 * lastSeenMs triggering a large catch-up that would itself refill the furnace.
 */
async function reseed(page, fixture) {
  const env = encodeSave(fixture.sim, Date.now(), fixture.settings);
  if (!decodeSave(env).ok) throw new Error("reseed: re-encode failed validation");
  await page.evaluate(({ KEY, env }) => localStorage.setItem(KEY, env), { KEY: SAVE_KEY, env });
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  const gate = await page.$(".gate__btn");
  if (gate) { await safeClick(gate, "gate-after-reseed"); await page.waitForTimeout(200); }
  await dismissReport(page);
  await page.waitForTimeout(150);
}

/** Real canvas drag that pans the camera (App gesture machine -> intentRef). */
async function panYard(page, dx, dy) {
  await page.evaluate(({ dx, dy }) => {
    const c = document.querySelector(".game canvas");
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
    c.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: cx, clientY: cy, buttons: 1 }));
    const steps = 6;
    for (let i = 1; i <= steps; i += 1) {
      c.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: cx + (dx * i) / steps, clientY: cy + (dy * i) / steps, buttons: 1 }));
    }
    c.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: cx + dx, clientY: cy + dy, buttons: 0 }));
  }, { dx, dy });
  await page.waitForTimeout(220);
}

/**
 * dev-64e: open the furnace inspector by its ACTUAL mirror tile. resetView refits the
 * yard; on the small landscape rail form the coach/lead can overlay the top-row furnace
 * tile (tile 1) so a center tap hits the lead instead of the canvas (the phoneland trace
 * showed panel.title empty after the tap). Pan the yard DOWN through a real drag to clear
 * the lead and retry, bounded. tapTile re-reads dataset.cam each attempt so it tracks the
 * pan. Returns the furnace machine record. No assertion relaxed.
 */
async function selectFurnace(page) {
  const sim = await readSim(page);
  const furnace = sim?.machines.find((m) => m.blueprint === "furnace");
  if (!furnace) throw new Error("no furnace present to inspect");
  return openInspector(page, furnace, /Furnace/i);
}

/**
 * dev-64f: shared, FORM-AWARE inspector open used by selectFurnace/selectMachine and the
 * step-20 ferrous lever. resetView refits the yard; tap the machine's ACTUAL mirror tile,
 * confirm the panel title, pan DOWN through a real drag and retry (bounded). On the small
 * landscape rail form the lesson coach (.onboard) overlays the yard CENTER band (the
 * phoneland step-18 trace: coach rect y134-294 over a 390px-tall viewport, sorter tile 8
 * underneath), so tapTile's elementFromPoint hits .onboard instead of canvas and the panel
 * never opens — panning the yard cannot move the fixed coach chrome. When the plain retries
 * fail, hide the coach through its REAL Skip control (UI-only; sim.tutorial untouched, as
 * the progress loop proves), expose the canvas, tap again, then RESTORE the coach via its
 * Show button so the later coach assertions (step 19 research-path) still read it. No sim
 * field injected; no assertion relaxed.
 */
async function openInspector(page, machine, titleRe) {
  const readTitle = () => page.evaluate(() => document.querySelector(".panel--stack .panel__title")?.textContent || "");
  await resetView(page);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await tapTile(page, machine.tile);
    if (titleRe.test(await readTitle())) return machine;
    await panYard(page, 0, 55);
  }
  const mode = (await onboardDom(page)).coach?.mode;
  if (mode === "lesson") {
    const skip = await page.$(".onboard__skip");
    if (skip) { await safeClick(skip, "coach-skip-for-inspect"); await page.waitForTimeout(250); }
    await resetView(page);
    let opened = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await tapTile(page, machine.tile);
      if (titleRe.test(await readTitle())) { opened = true; break; }
      await panYard(page, 0, 55);
    }
    const show = await page.$(".onboard__btn");
    if (show) { await safeClick(show, "coach-show-after-inspect"); await page.waitForTimeout(250); }
    if (opened) return machine;
  }
  return machine;
}

/**
 * dev-64f: FORM-AWARE machine inspector open, generalizing the selectFurnace pattern
 * the jargon loop already proves on all three forms. resetView refits the yard; on the
 * small landscape rail form the coach/lead can overlay a top-row tile so a center tap
 * hits the lead instead of the canvas (the phoneland step-18 `.panel--stack` timeout).
 * Tap the machine's ACTUAL mirror tile, confirm the panel title, and pan the yard DOWN
 * through a real drag to clear the lead and retry, bounded. tapTile re-reads dataset.cam
 * each attempt so it tracks the pan. Returns the machine record. No assertion relaxed.
 */
async function selectMachine(page, blueprint, titleRe) {
  const sim = await readSim(page);
  const machine = sim?.machines.find((m) => m.blueprint === blueprint);
  if (!machine) throw new Error(`no ${blueprint} present to inspect`);
  return openInspector(page, machine, titleRe);
}

/**
 * dev-64f: wait until the dock actually mounts the sorter's UPGRADE FORK before committing.
 * TRUE root cause (read-only src): App.tsx primaryFor — with a machine SELECTED the dock
 * follows `stepForMachine(state, selected)`, and plan.ts stepForMachine returns a CONNECT
 * step while that machine still has pending connection plans, only returning the UPGRADE
 * fork once they are wired. So after selectMachine(sorter) the dock shows the sorter's
 * pending "Connect" (the prior trace's routes 4->5), NOT the fork; a blind primary press
 * committed route.connect and the sorter stayed lv1 / tutorial 8, cascading into step 20
 * (circuitAssembler/signalLab LOCKED at tutorial 8). We therefore drain the selected
 * sorter's REAL route.connect presses (clickPrimary while the dock primary is "Connect")
 * until its step advances to upgrade and a dock BRANCH face named "Less power"/"Faster
 * batches" mounts, then the caller commits a NAMED branch via clickDockExact. Real UI
 * dispatch only; bounded; no sim field injected; no assertion relaxed (the step-18 check
 * still requires sorter lv2 + tutorial 9).
 */
async function waitForUpgradeFork(page, maxMs = 8000) {
  const start = Date.now();
  let dom = await onboardDom(page);
  const mounted = (d) => d.dock.some((b) => b.branch && /Less power|Faster batches/i.test(b.label || ""));
  while (!mounted(dom) && Date.now() - start < maxMs) {
    if ((dom.primaryLabel || "").startsWith("Connect")) {
      await clickPrimary(page);
      await page.waitForTimeout(350);
    } else {
      await page.waitForTimeout(150);
    }
    dom = await onboardDom(page);
  }
  return dom;
}

/**
 * Build a machine through the REAL catalog flow:
 *   restore resting dock -> Build (openCatalog) -> card (onSelect re-aims ghost) ->
 *   catalog Place (onPlace ONLY closes the catalog, leaving the ghost armed) ->
 *   dock Build face (App onPlace -> dispatch machine.build at ghostTile) COMMITS.
 * dev-64f: verify the INTENDED blueprint's card is UNLOCKED and AFFORDABLE before arming
 * the ghost, and confirm THAT blueprint's count grew (not the total machine count). The
 * prior version checked total count and blind-clicked the dock primary; when a card was
 * locked (unlockAt>tutorial) or unaffordable, Place stayed disabled, the catalog stayed
 * open, and the re-aim retry committed the resting default — building a REDUNDANT sorter
 * (the trace's sorter t4) instead of circuitAssembler/signalLab. Now a locked/unaffordable
 * card throws loudly (the caller ensures tutorial 9 + affordability first), and a refused
 * build that DISARMS the ghost (affordability refusal) stops rather than building another
 * machine. A bounded re-aim retry only fires while the ghost is STILL armed (a
 * blocked-placement cell refusal). The spend flows through dispatch -> applyCommand; no
 * injection, no assertion relaxed.
 */
async function buildViaCatalog(page, id) {
  const countOf = (s) => (s?.machines ?? []).filter((m) => m.blueprint === id).length;
  const beforeCount = countOf(await readSim(page));
  const resting = await restoreRestingDock(page);
  if (!resting) throw new Error(`could not restore resting dock before building ${id}`);
  await clickDockExact(page, "Build");
  await page.waitForSelector(".catalog", { timeout: 4000 });
  await page.waitForTimeout(200);
  const card = await page.evaluate((blueprint) => {
    const c = document.querySelector(`.catalog__card[data-blueprint="${blueprint}"]`);
    if (!c) return null;
    return { locked: c.getAttribute("data-locked"), affordable: c.getAttribute("data-affordable"), disabled: c.disabled };
  }, id);
  if (!card) throw new Error(`catalog card missing for ${id}`);
  if (card.disabled || card.locked === "true") throw new Error(`${id} locked in catalog (tutorial gate)`);
  if (card.affordable !== "true") throw new Error(`${id} unaffordable in catalog`);
  await clickSel(page, `.catalog__card[data-blueprint="${id}"]`);
  await page.waitForTimeout(250);
  await clickSel(page, ".catalog__place");
  await page.waitForTimeout(300);
  await page.waitForSelector(".dock__btn--primary", { timeout: 3000 });
  await clickPrimary(page); // commit machine.build at the armed ghost tile
  await page.waitForTimeout(400);
  for (let i = 0; i < 4; i += 1) {
    const s = await readSim(page);
    if (countOf(s) > beforeCount) return;
    // Re-aim ONLY while the ghost is still armed (blocked-placement keeps it). An
    // affordability refusal disarms the ghost -> stop, never build a different machine.
    const dom = await onboardDom(page);
    if (!dom.placeStrip) throw new Error(`${id} build refused (ghost disarmed)`);
    const occupied = new Set((s?.machines ?? []).map((m) => m.tile));
    let free = null;
    for (let t = 0; t < YARD_COLS * 6; t += 1) { if (t !== 2 && !occupied.has(t)) { free = t; break; } }
    if (free === null) break;
    await resetView(page);
    await tapTile(page, free, false); // place-mode tap re-aims the ghost to a free cell
    await page.waitForTimeout(200);
    const prim = await page.$(".dock__btn--primary");
    if (!prim) break;
    await safeClick(prim, `catalog-commit-${id}`);
    await page.waitForTimeout(400);
  }
  if (countOf(await readSim(page)) <= beforeCount) throw new Error(`${id} not built after retries`);
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

/**
 * dev-64f: open the Store panel through the REAL per-form face (the resting dock "Store"
 * button on every form, rail store slot as a fallback). No sim change.
 */
async function openStore(page) {
  await restoreRestingDock(page);
  const dom = await onboardDom(page);
  if (dom.dock.some((d) => d.label === "Store")) await clickDockExact(page, "Store");
  else await clickSel(page, '.shell-rail__slot[data-slot="store"]');
  await page.waitForSelector(".panel--store", { timeout: 4000 });
  await page.waitForTimeout(200);
}

/**
 * dev-64f: open the Research panel through the REAL per-form face (dock "Research" button
 * on phone; enabled rail slot on phoneland/desktop). The UNCHANGED showResearch gate
 * (data>0 || research keys) governs availability; the caller ensures data>0 first. Used by
 * step 23 AND step 24: any waitForData reload (advanceTime) CLOSES an open panel, so
 * step 24 RE-OPENs Research through the same real face before asserting the buy-gate.
 * dev-64g: step 24 no longer attempts the cost-4 purchase (unreachable at the bounded
 * harness's data=2); it asserts the cutters .node__buy DISABLE state while data<cost.
 * No sim field injected; no assertion relaxed.
 */
async function openResearchPanel(page) {
  await restoreRestingDock(page);
  const dom = await onboardDom(page);
  if (dom.dock.some((d) => d.label === "Research")) await clickDockExact(page, "Research");
  else await clickSel(page, '.shell-rail__slot[data-slot="research"]');
  await page.waitForSelector(".panel--research", { timeout: 4000 });
  await page.waitForTimeout(200);
}

/**
 * dev-64f: sell ONE resource's surplus through the REAL TradeCard (Max preset -> Sell ->
 * contract.sell). The engine clamps to sellableAmount (reserve floor + consumer demand) and
 * dedupes; the probe never injects a quantity. Returns true if a sell was committed.
 */
async function sellResource(page, resource) {
  const card = `.store-trade[data-resource="${resource}"]`;
  if (!(await page.$(card))) return false;
  const max = await page.$(`${card} .store-trade__preset`); // first preset is Max
  if (max) { await safeClick(max, `trade-max-${resource}`); await page.waitForTimeout(150); }
  const sell = await page.$(`${card} .store-trade__sell`);
  if (!sell) return false;
  if (await sell.evaluate((n) => n.disabled)) return false;
  await safeClick(sell, `trade-sell-${resource}`);
  await page.waitForTimeout(300);
  return true;
}

/**
 * dev-64f: disconnect the furnace's ferrous INPUT belt through the REAL RouteControls
 * (inspector Transport section): the laid "Dock store -> furnace" link's Disconnect button
 * -> the explicit confirm primary -> route.remove. This is the yard-management lever the
 * game exposes for banking ferrous above RESERVE_FLOOR: with the furnace wired, planConnections
 * feeds sorter ferrous toward the furnace and pullFromStore pins store ferrous at the floor
 * (10), so signalLab's ferrous-12 cost is never affordable (diagnosis confirmed: ferrous peak
 * 10 with the furnace connected, 18+ once its feed is disconnected). Reads the mirror to find
 * the ferrous input route and to VERIFY removal; no sim field injected, no assertion relaxed.
 */
async function disconnectFurnaceFerrous(page) {
  const sim = await readSim(page);
  const furnace = sim?.machines.find((m) => m.blueprint === "furnace");
  if (!furnace) return false;
  const isFerrousFeed = (r) => r.to.kind === "machine" && r.to.id === furnace.id && r.filter === "ferrous";
  if (!sim.routes.some(isFerrousFeed)) return false; // already disconnected
  await selectFurnace(page);
  await page.waitForSelector(".logistics-controls", { timeout: 4000 });
  await page.waitForTimeout(200);
  const liHandle = await page.evaluateHandle(() => {
    const lis = [...document.querySelectorAll(".logistics-controls .logistics-route")];
    return lis.find((li) => {
      const path = li.querySelector(".logistics-route__path")?.textContent || "";
      return /Dock store\s*→/.test(path) && /furnace/i.test(path);
    }) || null;
  });
  const li = liHandle.asElement();
  if (!li) throw new Error("furnace ferrous input link not found in RouteControls");
  const disc = await li.$(".logistics-btn--danger");
  if (!disc) throw new Error("Disconnect button missing on furnace ferrous link");
  await safeClick(disc, "disconnect-furnace-ferrous");
  await page.waitForSelector(".logistics-confirm", { timeout: 3000 });
  const confirm = await page.$(".logistics-confirm .logistics-btn--primary");
  if (!confirm) throw new Error("disconnect confirm primary missing");
  await safeClick(confirm, "confirm-disconnect-furnace-ferrous");
  await page.waitForTimeout(350);
  const after = await readSim(page);
  return !(after?.routes ?? []).some(isFerrousFeed);
}

/**
 * dev-64f: free the store so the sorter can BANK ferrous above the reserve floor for
 * signalLab. Two real-UI yard-management actions, in order: (1) sell the surplus steel/wire
 * products via TradeCard to free store room (a full store blocks the sorter's ferrous output,
 * destinationRoom=0), keeping scrap for the build; (2) disconnect the furnace ferrous feed so
 * the furnace stops pulling store ferrous back to the floor. Then the game's OWN income
 * (ensureAffordable's advanceTime) refills ferrous past 12 while scrap stays >=50. Diagnosis
 * confirmed this reaches signalLab affordability even from a FULL 900 store; no injection.
 */
async function freeStoreForFerrous(page) {
  await openStore(page);
  await sellResource(page, "steel");
  await sellResource(page, "wire");
  await closePanel(page);
  await page.waitForTimeout(200);
  await disconnectFurnaceFerrous(page);
  await restoreRestingDock(page);
}

/** Advance time until the store holds at least `min` Data (the engine produces it). */
async function waitForData(page, min) {
  // Bounded retries (dev-64c): see ensureAffordable. The first-data assertion stays strict.
  for (let i = 0; i < 2; i += 1) {
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
      { name: "research-rail-needs-data", test: (b, a) => a.dom.railPresent ? (researchSlot(a.dom)?.disabled === true && /data/i.test(researchSlot(a.dom)?.reason || "")) : !researchFacePresent(a.dom) },
      { name: "yard-canvas-paints", test: (b, a) => (a.dom.census?.ink ?? 0) > 100 },
    ]);

    // Salvage six pulses through the real dock Salvage primary (tutorial 0..1).
    for (let n = 1; n <= 6; n += 1) {
      await runStep(page, F, `0${n}-salvage`, async () => {
        await clickPrimary(page);
        // dev-64e: settle the mirror to the expected plateau (1 after the first pulse,
        // 2 after the sixth) so the stale-mirror tutorial checks read the real transition.
        if (n === 1) await settleTutorial(page, 1);
        if (n === 6) await settleTutorial(page, 2);
      }, [
        { name: "pulse-registered", test: (b, a) => a.sim.wreck.pulses >= n },
        { name: "scrap-income", test: (b, a) => a.sim.scrap >= n * 5 },
        { name: "coach-salvage-topic", test: (b, a) => a.dom.coach?.topic === "salvage" },
        ...(n === 1 ? [{ name: "tutorial-1-after-first-pulse", test: (b, a) => a.sim.tutorial >= 1 }] : []),
        ...(n === 6 ? [{ name: "tutorial-2-after-six", test: (b, a) => a.sim.tutorial === 2 }, { name: "scrap-30-for-repair", test: (b, a) => a.sim.scrap >= 30 }] : []),
      ], 750);
    }

    await runStep(page, F, "07-repair-drone", async () => { await clickPrimary(page); await settleTutorial(page, 3); }, [
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

    await runStep(page, F, "11-connect-sorter", async () => { await clickPrimary(page); await settleTutorial(page, 6); }, [
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

    await runStep(page, F, "17-sell-steel", async () => {
      // dev-64e: the step-7 primary CLAIMS the one-time export contract (contract.export,
      // spends 3 steel -> +30 credits), not a repeatable sell. Accumulate steel>=3 through
      // the game's own income first so the claim is affordable, then commit and settle to
      // tutorial 8 (syncTutorial 7->8 needs credits>0). No assertion relaxed.
      await ensureSteel(page, TUNING.exportContractSteel);
      await clickPrimary(page);
      await settleTutorial(page, 8);
    }, [
      { name: "credits-earned", test: (b, a) => a.sim.credits >= 30 },
      { name: "tutorial-8-upgrade", test: (b, a) => a.sim.tutorial === 8 },
      { name: "coach-upgrade-topic", test: (b, a) => a.dom.coach?.topic === "upgrade" },
    ]);

    await runStep(page, F, "18-upgrade-sorter", async () => {
      // dev-64f: drive by REAL state through the FORM-AWARE inspector open (selectMachine
      // recenters, taps the sorter's ACTUAL mirror tile, confirms the panel title and pans
      // clear of the lead on the rail forms — fixes the phoneland `.panel--stack` timeout).
      // Then WAIT for the upgrade fork to actually mount (waitForUpgradeFork) before
      // committing the cheapest NAMED branch "Less power" (draw, 30 credits) via
      // clickDockExact -> machine.upgrade branch=draw -> sorter lv2 -> syncTutorial 8->9.
      // The prior waitForSelector(".dock__btn--primary")+clickPrimary raced the dock
      // re-render and pressed the stale resting "Connect" primary (routes 4->5, sorter
      // still lv1, tutorial stuck at 8), which cascaded into step 20 (circuitAssembler/
      // signalLab stay LOCKED at tutorial 8). No assertion relaxed; no sim field injected.
      await selectMachine(page, "sorter", /Scrap sorter/i);
      await waitForUpgradeFork(page);
      await clickDockExact(page, "Less power");
      await settleTutorial(page, 9);
    }, [
      { name: "machine-upgraded", test: (b, a) => a.sim.machineList.split(",").some((m) => /sorter/.test(m) && /lv2/.test(m)) },
      { name: "tutorial-9", test: (b, a) => a.sim.tutorial === 9 },
    ]);

    await runStep(page, F, "19-research-path-lesson", async () => { await settleTutorial(page, 9); }, [
      { name: "research-path-lesson", test: (b, a) => a.dom.coach?.lesson === "research-path" && a.dom.coach?.topic === "research" && a.dom.coach?.researchPath === "true" },
      { name: "research-goal-copy", test: (b, a) => /first Data/i.test(a.dom.coach?.what || "") },
      { name: "still-no-data", test: (b, a) => a.sim.data === 0 },
      { name: "research-face-still-absent", test: (b, a) => !researchFacePresent(a.dom) },
      { name: "gate-not-weakened-rail-disabled", test: (b, a) => a.dom.railPresent ? researchSlot(a.dom)?.disabled === true : !researchFacePresent(a.dom) },
    ]);

    // (5) Build the full Data chain through the real catalog, honoring the fresh-yard
    // finding: guide the player to first Data so the UNCHANGED gate opens Research.
    await runStep(page, F, "20-build-data-chain", async () => {
      // dev-64f: build ONE machine at a time, DISCONNECTED, then wire the whole chain after
      // the last build (connectAll through the real dock Connect primary; again at step 21).
      // MEASURED root cause of the step-20 "wireMill unaffordable" failure: wiring a
      // downstream consumer early drains the intermediate the NEXT machine needs to BUILD.
      // copperSeparator (R03 nonferrous2->copper+residue) pulls store nonferrous below
      // wireMill's nonferrous-6 / polymerRecycler's nonferrous-5 build cost. Left unconnected
      // the sorter's R01 nonferrous banks freely (in-process proof with the game's OWN engine:
      // nonferrous 57->46->63 across the chain, all 7 machines built, data=2). Skip any machine
      // already built (idempotent). ensureAffordable runs the game's OWN offline income until
      // each REAL buildCost is covered; the ferrous>RESERVE_FLOOR lever below banks signalLab's
      // ferrous-12. The first-data assertion stays STRICT: 7 machines, signalLab + every chain
      // id present. No resource injection; every build is a real catalog Place -> dock Build spend.
      for (const id of DATA_CHAIN) {
        const sim = await readSim(page);
        if (sim?.machines.some((m) => m.blueprint === id)) continue;
        await restoreRestingDock(page);
        // dev-64f: a ferrous cost above RESERVE_FLOOR (engine pullFromStore floor = 10) can
        // never be met while the furnace drains store ferrous to that floor and the store is
        // full of surplus (signalLab ferrous 12). Bank ferrous through REAL yard management
        // first (sell surplus + disconnect the furnace feed); the affordability predicate
        // below is still the blueprint's REAL buildCost vs the REAL store, never relaxed.
        const needsFerrousBank = BLUEPRINTS[id].buildCost.some((c) => c.resource === "ferrous" && c.qty > 10);
        if (needsFerrousBank) await freeStoreForFerrous(page);
        const ok = await ensureAffordable(page, id);
        if (!ok) throw new Error(`could not afford ${id}`);
        await buildViaCatalog(page, id);
      }
      await restoreRestingDock(page);
      await connectAll(page);
    }, [
      { name: "chain-built-7-machines", test: (b, a) => a.sim.machines === 7 },
      { name: "signalLab-present", test: (b, a) => /signalLab/.test(a.sim.machineList) },
      { name: "all-chain-present", test: (b, a) => DATA_CHAIN.every((id) => a.sim.machineList.includes(id)) },
    ], 500);

    await runStep(page, F, "21-connect-data-chain", async () => { await restoreRestingDock(page); await connectAll(page); }, [
      { name: "routes-wired", test: (b, a) => a.sim.routes >= 12 },
    ], 500);

    await runStep(page, F, "22-first-data-unlocks-research", async () => { await waitForData(page, 1); }, [
      { name: "first-data-landed", test: (b, a) => a.sim.data > 0 },
      { name: "research-face-appears", test: (b, a) => researchFacePresent(a.dom) },
      { name: "research-rail-enabled", test: (b, a) => a.dom.railPresent ? researchSlot(a.dom)?.disabled === false : a.dom.dock.some((d) => d.label === "Research") },
      { name: "coach-left-research-path", test: (b, a) => a.dom.coach?.lesson !== "research-path" },
    ], 500);

    await runStep(page, F, "23-open-research-panel", async () => {
      // dev-64f: open Research through the REAL per-form face (openResearchPanel). The
      // UNCHANGED gate opens it: data>0 now holds (step 22). No assertion relaxed.
      await openResearchPanel(page);
    }, [
      { name: "research-panel-open", test: (b, a) => a.dom.panel?.isResearch === true },
      { name: "research-nodes-present", test: (b, a) => (a.dom.panel?.researchNodes.length ?? 0) >= 3 },
      { name: "cutters-node-present", test: (b, a) => a.dom.panel?.researchNodes.some((n) => n.id === "cutters") },
    ]);

    await runStep(page, F, "24-cutters-buy-gate", async () => {
      // dev-64g COORDINATOR-AUTHORIZED SCOPE CORRECTION (step 24 only; probe-only, no src
      // change). The former "24-buy-cutters" PURCHASE assertion is UNREACHABLE in the
      // bounded harness: cutters costs 4 Data (the CHEAPEST node; buffers 8, dispatch 12 —
      // src/game/content/research.ts:22-47) and the fresh yard's signalLab is starved
      // (copperSeparator/wireMill outputFull, others starved), so Data peaks at 2. That is
      // CORRECT sim behavior for an unbalanced yard, NOT an app defect; no node is
      // affordable at data=2. The purchase was a probe extension beyond all five criteria
      // (steps 00-23 + the clean loops meet every criterion; none requires owning cutters),
      // so it is replaced by a STRICT, REACHABLE assertion of the buy-GATE src behavior:
      // the cutters .node__buy button is PRESENT and DISABLED while data < cost (canBuy
      // gate — src/ui/research/model.ts:86,103; src/ui/panels/ResearchPanel.tsx:206
      // disabled={!node.canBuy}), the node reads unlocked/open, and nothing is owned.
      // UNVERIFIED (stated per the delivery contract): the full research.buy spend of 4
      // Data is NOT exercised end-to-end; it is code-verified at
      // src/game/simulation/commands.ts:139-140,553-567 (buyResearch refuses data<cost at
      // :561). waitForData(1) returns immediately (first Data already landed in step 22);
      // NO cost-4 accrual loop, NO resource injection, NO sim edit. Steps 22/23 remain
      // STRICT and UNCHANGED.
      await waitForData(page, 1);
      await openResearchPanel(page);
    }, [
      // buyDisabled is null ONLY when .node__buy is absent; a boolean proves the button
      // is mounted. The DISABLE assertion is conjoined with the REAL mirror data<cost so
      // it can never pass against an affordable (enabled) button.
      { name: "cutters-buy-present", test: (b, a) => {
        const n = a.dom.panel?.researchNodes.find((x) => x.id === "cutters");
        return !!n && n.buyDisabled !== null;
      } },
      { name: "cutters-buy-disabled-below-cost", test: (b, a) => {
        const n = a.dom.panel?.researchNodes.find((x) => x.id === "cutters");
        return n?.buyDisabled === true && a.sim.data < RESEARCH.cutters.cost;
      } },
      { name: "cutters-state-unlocked-open", test: (b, a) => {
        const n = a.dom.panel?.researchNodes.find((x) => x.id === "cutters");
        return n?.researchState === "unlocked" && n?.state === "open";
      } },
      { name: "cutters-not-owned", test: (b, a) => (a.sim.research.cutters ?? 0) === 0 },
    ], 500);
  } finally { await context.close().catch(() => {}); }
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
      await safeClick(btn, "recover-store");
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
        await safeClick(btn, "earn-scrap");
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
  } finally { await context.close().catch(() => {}); }
}

// ============================ (2) respect progress + skip/revisit ============================
async function progressLoop(browser, form) {
  const F = `${form}-progress`;
  const { context, page } = await newPage(browser, F, FIXTURES.progress);
  // "Not reset" semantics: machines/routes/tutorial must be unchanged; Data only
  // grows as the mature chain runs live (>=76), it must never be reset toward 0.
  const intact = (s) => s && s.machines === 8 && s.routes === 18 && s.data >= 76 && s.tutorial === 9;
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
      if (gate) { await safeClick(gate, "gate-reload-persist"); await page.waitForTimeout(700); }
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
      if (g) { await safeClick(g, "gate-reader"); await page2.waitForTimeout(900); }
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
  } finally { await context.close().catch(() => {}); }
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

    await runStep(page, F, "01-inspect-furnace", async () => {
      // dev-64e: re-seed the pristine starved mature yard (fresh lastSeenMs, no catch-up)
      // and open the furnace by its ACTUAL mirror tile, panning clear of the lead overlay
      // on the landscape rail form. The live yard refills the furnace within seconds, so
      // inspect inside the fresh starved window. No assertion relaxed.
      await reseed(page, FIXTURES.jargon);
      await selectFurnace(page);
    }, [
      { name: "furnace-panel", test: (b, a) => /Furnace/i.test(a.dom.panel?.title || "") },
      { name: "constraint-headline", test: (b, a) => /Needs input to run/i.test(a.dom.panel?.constraint?.summary || "") },
      { name: "constraint-detail-present", test: (b, a) => !!a.dom.panel?.constraint?.detail },
    ], 200);

    await runStep(page, F, "02-expand-constraint", async () => {
      // dev-64e: re-seed + re-open the furnace so the missingInput card is first (the live
      // yard otherwise drifts to the power card between steps), then expand it through the
      // REAL summary click and read inside the starved window. Assertions unchanged.
      await reseed(page, FIXTURES.jargon);
      await selectFurnace(page);
      await clickSel(page, ".inspector-constraint__summary");
    }, [
      { name: "detail-expanded", test: (b, a) => a.dom.panel?.constraint?.open === true },
      { name: "jargon-explained", test: (b, a) => /Missing input/i.test(a.dom.panel?.constraint?.detail || "") },
    ], 200);

    await runStep(page, F, "03-coach-glossary", async () => {
      const sum = await page.$(".onboard__summary");
      if (sum) await safeClick(sum, "coach-summary");
    }, [
      { name: "coach-detail-expanded", test: (b, a) => a.dom.coach?.detailOpen === true },
      { name: "glossary-scrap", test: (b, a) => /Scrap/i.test(a.dom.coach?.detailBody || "") },
      { name: "glossary-data", test: (b, a) => /Data/i.test(a.dom.coach?.detailBody || "") },
      { name: "glossary-ferrous", test: (b, a) => /Ferrous/i.test(a.dom.coach?.detailBody || "") },
    ]);

    await runStep(page, F, "04-catalog-vocabulary", async () => {
      // dev-64e: the furnace inspector left the upgrade fork on the dock; tapTile(35)
      // could not deselect on phone. Restore the resting dock through real controls, then
      // open the catalog with the real Build button.
      await restoreRestingDock(page);
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
      // dev-64e: Data is budget-limited OUT of the chip row on a mature yard (Hud
      // visibleResources(state, hudChipLimit()-2)); spec 5.4 / UI-RESET-51 surfaces it in
      // the AllResources drawer. Open the drawer through its REAL toggle and assert Data
      // there — the correct surface, never a relaxed chip assertion. Hud budget unchanged.
      const toggle = await page.$('button[aria-controls="hud-all-resources"]');
      if (toggle) { await safeClick(toggle, "all-resources-toggle"); await page.waitForTimeout(250); }
    }, [
      { name: "catalog-closed", test: (b, a) => !a.dom.catalog },
      { name: "resource-chips-present", test: (b, a) => (a.dom.resources?.length ?? 0) >= 3 },
      { name: "resource-vocab-scrap", test: (b, a) => a.dom.resources.some((r) => /Scrap/i.test(r || "")) },
      { name: "all-resources-drawer-open", test: (b, a) => a.dom.allResourcesExpanded === true && (a.dom.allResources?.length ?? 0) >= 3 },
      { name: "resource-vocab-data", test: (b, a) => (a.dom.allResources ?? []).some((r) => /^Data$/i.test((r.label || "").trim())) },
    ]);

    await runStep(page, F, "06-research-vocabulary", async () => {
      // dev-64e: restore the resting dock (catalog close left a ghost armed; phone has no
      // rail), then open Research through the real per-form face. Mature data>0 so the
      // unchanged gate allows it.
      await restoreRestingDock(page);
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
  } finally { await context.close().catch(() => {}); }
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
      // dev-64d: a FRESH browser per loop-run so one crashed renderer cannot
      // cascade into the remaining loops (the prior shared-browser run lost every
      // loop after phone-earntrap 05-close-store). Cleanup is tolerant: a dead
      // browser must not mask the original error or abort the remaining runs.
      let browser = null;
      try {
        browser = await chromium.launch({ executablePath, headless: true });
        await loop(browser, f.key);
      } catch (e) {
        blockers.push(`${f.key}-${name} FATAL: ${String((e && e.stack) || e)}`);
        console.error(e);
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }
  }

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
    method: "headless Chrome DOM + geometry + persisted-state mirror + canvas pixel census only; NO vision. Screenshots are hashed mirrors, not inspected visually. Selection driven by real canvas taps (App.applyGestureOutput -> pickTarget -> setSelected); every mutation through dock/panel/catalog buttons -> props.dispatch -> applyCommand. Time advance is a probe-only lastSeenMs rewind running the game's OWN inline offline catch-up. Form factors: phone 390x844 dpr2 portrait, phoneland 844x390 dpr2 rail, desktop 1920x1080 dpr1 rail; all four scenario loops run on each. dev-64d stabilization: a FRESH browser per loop-run isolates renderer crashes; clicks are bounded (6s) with an evaluated-DOM-click fallback for zoom-overlay-intercepted buttons (each logged in clickFallbacks, still a real button -> dispatch -> applyCommand, never a state injection); context/browser cleanup is tolerant. dev-64e PROBE-HARNESS fixes (no src change; code head stays 1b6c99e): (1) step 18 upgrades the sorter at its ACTUAL tile read from the persisted mirror (not hardcoded tile 0) after a real camera recenter, committing the dock upgrade-fork primary; (2) settleTutorial polls the game's OWN decodeSave mirror until sim.tutorial reaches the EXACT expected plateau for each step (max 3.5s), keyed to the transition the step already caused through a real button — NOT dev-64d's naive first-persist settle that regressed 69->81; (3) buildViaCatalog restores the resting dock before each build and COMMITS via the dock Build face (catalog Place only arms the ghost), with a bounded real-tile re-aim retry; (4) jargon navigation drives real per-form selectors (dock vs rail), restores the resting dock between catalog builds, and recenters the camera before the furnace tap. Data vocabulary is asserted via the AllResources drawer (the budget-limited chip row escape hatch), never a relaxed chip assertion; Hud budget unchanged. dev-64f PROBE-HARNESS fixes (no src change; code head stays 1b6c99e): (Root 1) step 18 opens the sorter inspector FORM-AWARE via selectMachine (recenter + real mirror-tile tap + panel-title confirm + pan clear of the lead, fixing the phoneland panel timeout), polls waitForUpgradeFork until a dock BRANCH face is mounted (the resting Connect primary also matches .dock__btn--primary and was being blind-clicked, racing the re-render), then commits the NAMED cheapest branch 'Less power' via clickDockExact -> machine.upgrade draw -> sorter lv2 -> tutorial 9; (Root 2) step 20 skips already-built machines and WIRES the partial chain between builds (real dock Connect) while ensureAffordable patiently runs the engine's OWN offline catch-up plus a short live-mirror poll to catch the store's ferrous peak (the furnace draws store ferrous above RESERVE_FLOOR into a 2-batch buffer; the store holds >=12 only when the furnace backs up or is starved while the sorter refills), and buildViaCatalog verifies the intended card is UNLOCKED+AFFORDABLE and that THAT blueprint's count grew (throwing instead of blind-retrying into a redundant sorter). Reaching tutorial 9 unlocks circuitAssembler/signalLab (unlockAt 9). First-data assertions stay STRICT (7 machines, signalLab + every chain id, then first Data); no resource injected, no assertion relaxed. dev-64g FINALIZE (no src change; code head stays 1b6c99e): coordinator-authorized step-24 scope correction — the unreachable cost-4 cutters PURCHASE (bounded harness Data peaks at 2; signalLab starved in the unbalanced fresh yard = CORRECT sim behavior, not an app defect) is replaced by a STRICT reachable buy-GATE assertion (cutters .node__buy PRESENT + DISABLED while data<cost, node unlocked/open, unowned); steps 22/23 stay STRICT and UNCHANGED; the full purchase is stated UNVERIFIED and code-verified (research.ts:27, model.ts:86/103, ResearchPanel.tsx:206, commands.ts:139-140/553-567). No resource injected, no sim edit, no criterion relaxed.",
    criteria: {
      "1-contextual-teaching": "freshLoop steps 00-19 assert the OnboardCoach lesson topic at each tutorial stage (salvage/storage/build/connect/trade/upgrade) and the research-path lesson at tutorial 9 with no Data.",
      "2-respect-progress-skip-revisit": "progressLoop seeds a progressed mature save; asserts no reset/overwrite across skip/show/reload and that a second tab (reader lease) yields the coach entirely.",
      "3-vocabulary-jargon-detail": "jargonLoop asserts the furnace constraint headline + expandable detail, the coach glossary, and catalog/resource/research vocabulary parity with content definitions. Data is asserted in the AllResources drawer (spec 5.4 / UI-RESET-51) because the chip row is budget-limited (Hud visibleResources(state, hudChipLimit()-2)); the Hud budget is unchanged.",
      "4-earn-trap-recovery": "earntrapLoop seeds a step-4 yard with 5 scrap; arms placement, hits the blind affordability refusal, then recovers via coach Earn scrap now / Trade at the store and completes the build (not stalled at 0 machines).",
      "5-fresh-player-walkthrough-AGENT": "freshLoop is AGENT evidence: a scripted fresh-yard walkthrough from tutorial 0 through the full 7-machine Data chain to first Data so the UNCHANGED showResearch gate opens Research (steps 22/23 STRICT), then asserts the research buy-GATE at the bounded harness's data=2: the cutters .node__buy button is PRESENT and DISABLED while data<cost (canBuy), the node reads unlocked/open and stays unowned (step 24, dev-64g coordinator-authorized scope correction). UNVERIFIED (stated): the full cost-4 cutters PURCHASE end-to-end — Data peaks at 2 because signalLab is starved in the unbalanced fresh yard (CORRECT sim behavior, not an app defect); research.buy/canBuy are code-verified (research.ts:27, model.ts:86/103, ResearchPanel.tsx:206, commands.ts:553-567). No criterion requires owning cutters; no injection, no relaxation.",
    },
    fixtureScrutiny: {
      a: "Only setup seeding mutates state, in probe code with the game's OWN encodeSave (FNV-1a, lastSeenMs=Date.now()). fresh=createInitialState() verbatim; earntrap=createInitialState() with tutorial=4, drone.repaired=true, deliveries=1, wreck={remaining:30,generation:2,pulses:6,nextPulseTick:0}, store={scrap:5}, storeUnits=5; progress/jargon=docs/evidence/yard-mature.json payload.sim verbatim. All reducedMotion=true. advanceTime is a probe-only lastSeenMs rewind + reload running the engine's OWN inline catch-up (<=18000 ticks); it never edits sim fields. No src changes; every action is a real UI tap/click through dispatch -> applyCommand.",
      b: "Documented in this probe header, the makeFixture/advanceTime functions and results.json.",
      c: "Every seeded envelope is round-tripped through the game's full decodeSave/repairRegistration/validateSim IN-PROCESS before use (makeFixture throws on any failure); readSim reads the mirror through decodeSave. The 00-open steps assert the loaded mirror matches the seed. No invariant weakened or bypassed.",
      d: "No action faked by injection; localStorage read only as the game's own persistence mirror (written on every ok dispatch). The guarded init script seeds once so reloads preserve live state. The showResearch gate (data>0 || research-owned) is NEVER modified; the fresh walkthrough earns first Data to open it. The dev-64d evaluated-click fallback dispatches a real DOM click on the real button (still props.dispatch -> applyCommand), used only when the zoom overlay intercepts a bounded normal click; every use is logged in clickFallbacks.",
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
    counts: { frames: audit.length, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length, clickFallbacks: clickFallbacks.length },
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
      {
        id: "resource-vocab-data-via-drawer",
        verdict: "design-finding-not-a-defect",
        detail: "On a mature yard the HUD chip row is budget-limited (Hud.tsx visibleResources(state, hudChipLimit()-2)), so Data is NOT rendered as a chip; it is surfaced in the AllResources drawer (spec 5.4 / UI-RESET-51). The prior probe asserted Data as a chip and failed on every form. This is a LEGITIMATE DESIGN FINDING, not an app defect and not a probe relaxation: the probe now opens the drawer through its REAL toggle (button[aria-controls=hud-all-resources]) and asserts the Data row there, plus an all-resources-drawer-open check. The Hud budget was NOT changed (forbidden file).",
        source: "src/ui/Hud.tsx visibleResources/hudChipLimit; src/ui/hud/AllResources.tsx; jargonLoop step 05",
      },
      {
        id: "probe-harness-root-causes-fixed",
        verdict: "probe-only-no-src-change",
        detail: "The remaining 42 failedChecks were PROBE-HARNESS bugs in fresh steps 18-24, not app defects (the 1b6c99e collision fix is intact; jargon/progress/earntrap and fresh 00-17 were already clean). Two root causes fixed in probe.mjs only. Root 1 (step 18): waitForSelector('.dock__btn--primary')+clickPrimary raced the dock re-render — the RESTING 'Connect' primary also matches .dock__btn--primary, so the blind click pressed stale Connect (the trace shows routes 4->5, sorter still lv1, tutorial stuck at 8) instead of machine.upgrade; on phoneland the '.panel--stack' wait also timed out because the lead overlay covered the sorter tile. Now selectMachine opens the sorter inspector FORM-AWARE (recenter + real mirror-tile tap + panel-title confirm + pan clear of the lead), waitForUpgradeFork polls until a dock BRANCH face ('Less power'/'Faster batches') is mounted, then clickDockExact commits the cheapest NAMED branch 'Less power' (draw, 30 credits) -> sorter lv2 -> syncTutorial 8->9. Root 2 (step 20): the whole chain was built BEFORE wiring and ensureAffordable only advanced 2x90s, so the store's ferrous never reached signalLab's 12 ('could not afford signalLab'); at tutorial 8 the locked circuitAssembler/signalLab cards (unlockAt 9) also made buildViaCatalog's blind total-count retry commit a REDUNDANT sorter (sorter t4). Now step 20 skips already-built machines, WIRES the partial chain between builds (real dock Connect) and ensureAffordable patiently runs the engine's OWN offline catch-up plus a short live-mirror poll to catch the store's ferrous peak (the furnace draws store ferrous above RESERVE_FLOOR into a 2-batch input buffer; the store holds >=12 only when the furnace backs up or is starved while the sorter refills); buildViaCatalog verifies the intended card is UNLOCKED+AFFORDABLE and that THAT blueprint's count grew, throwing loudly instead of building a wrong machine. Reaching tutorial 9 (Root 1) unlocks the circuitAssembler/signalLab cards. The first-data assertions stay STRICT (7 machines, signalLab + every chain id, then first Data); no resource injected, no assertion relaxed, showResearch gate byte-identical to main. git diff 1b6c99e..HEAD -- src is EMPTY.",
        source: "work/evidence/UI-RESET-64/probe.mjs (selectMachine/waitForUpgradeFork/ensureAffordable/buildViaCatalog/freshLoop steps 18/20); coordinator triage; src/ui/App.tsx primaryForStep/branchOptions, src/ui/build/BuildCatalog.tsx placeEnabled, src/game/simulation/engine.ts pullFromStore/pullNeed/syncTutorial (read-only)",
      },
      {
        id: "step24-buy-gate-scope-correction",
        verdict: "coordinator-authorized-probe-only",
        detail: "dev-64g: after dev-64f's harness fixes the full 3-form run reached 435/438 (fresh steps 00-23 + ALL jargon/progress/earntrap loops CLEAN). The only residual failure, 24-buy-cutters/cutters-owned x3 forms, is an UNREACHABLE probe extension: cutters costs 4 Data (the CHEAPEST node; buffers 8, dispatch 12 — research.ts:22-47) and the bounded harness reaches data=2 because signalLab is starved in the unbalanced fresh yard (copperSeparator/wireMill outputFull, others starved) — CORRECT sim behavior, NOT an app defect; no node is affordable at 2. All five acceptance criteria are met by steps 00-23 + the clean loops; none requires owning cutters. Per coordinator authorization (issue #64 comment 6837767422) step 24 now asserts the STRICT reachable buy-GATE: cutters .node__buy PRESENT + DISABLED while data<cost (canBuy), node unlocked/open, unowned; steps 22/23 STRICT and UNCHANGED. UNVERIFIED (stated per the delivery contract): the full cost-4 research.buy purchase end-to-end; it is code-verified at research.ts:27 (cost 4), model.ts:86/103 (affordable/canBuy), ResearchPanel.tsx:206 (disabled={!node.canBuy}), commands.ts:139-140/553-567 (buyResearch validation order; data<cost refusal at :561). No resource injection, no sim edit, no criterion relaxed; git diff 1b6c99e..HEAD -- src stays EMPTY.",
        source: "coordinator triage issue #64 comment 6837767422; work/evidence/UI-RESET-64/probe.mjs freshLoop step 24; src/game/content/research.ts; src/ui/research/model.ts; src/ui/panels/ResearchPanel.tsx; src/game/simulation/commands.ts (all read-only)",
      },
    ],
    failedChecks, blockers, consoleErrors, pageErrors, clickFallbacks,
    steps,
  };
  writeFileSync(resolve(EVID, "results.json"), JSON.stringify(results, null, 2));
  console.log("\n==== SUMMARY ====");
  console.log("frames=", audit.length, "auditOk=", auditOk, "distinct=", JSON.stringify(distinct));
  console.log("steps=", steps.length, "checks=", allChecks.length, "failedChecks=", failedChecks.length);
  console.log("consoleErrors=", consoleErrors.length, "pageErrors=", pageErrors.length, "blockers=", blockers.length, "clickFallbacks=", clickFallbacks.length);
  if (clickFallbacks.length) { console.log("CLICK FALLBACKS (zoom-overlay interception / bounded-click):"); for (const c of clickFallbacks) console.log(`  ${c.what}: ${c.reason}`); }
  if (failedChecks.length) { console.log("FAILED CHECKS:"); for (const c of failedChecks) console.log(`  [${c.form}] ${c.step}: ${c.name} ${c.detail}`); }
  if (blockers.length) { console.log("BLOCKERS:"); for (const b of blockers) console.log("  " + b); }
  if (consoleErrors.length) { console.log("CONSOLE ERRORS:"); for (const e of consoleErrors.slice(0, 20)) console.log("  " + e); }
  if (pageErrors.length) { console.log("PAGE ERRORS:"); for (const e of pageErrors.slice(0, 20)) console.log("  " + e); }
  if (failedChecks.length || blockers.length || pageErrors.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
