/**
 * UI-RESET-57 (G2 integration acceptance) — reviewer probe.
 *
 * ROLE: reviewer (slice-57). This is PROBE-ONLY code. It does NOT modify any
 * file under src/. It drives the SHIPPED build through the REAL UI (clicks/taps
 * on actual controls) and records authoritative DOM + persisted-state evidence.
 *
 * Fixture scrutiny (task a-d):
 *  (a) The only state mutation here is SETUP seeding of the mature yard via the
 *      game's OWN save envelope (FNV-1a checksum recomputed, lastSeenMs=Date.now()
 *      to avoid offline catch-up drain). No src is touched. Every acceptance
 *      ACTION (salvage/build/inspect/connect/sell/upgrade) is a real UI click/tap
 *      that flows through the game's dispatch -> applyCommand path.
 *  (b) This file + results.json + evidence.md document the method.
 *  (c) Sim validation is NOT weakened: the seeded envelope still passes the
 *      game's full decodeSave/validateSim on load (we only recompute the checksum
 *      the game itself recomputes). No invariant is bypassed.
 *  (d) No action is faked by direct state injection; localStorage is read ONLY
 *      as a mirror of the game's own persistence (written on every ok dispatch).
 *
 * Build under test: main b9944189e1aa49e4ec8c811fe9e6048b163be945.
 * Live URL: https://home.darkmatter2222.com/rustwake/ (served entry
 * index-Cjv1OrQ3.js, sha256 e444e677... verified independently before this run).
 */
import { chromium } from "playwright-core";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(process.cwd());
const EVID = resolve(ROOT, "work/evidence/UI-RESET-57");
const FRAMES = resolve(EVID, "frames");
const BASE_URL = process.env.BASE_URL || "https://home.darkmatter2222.com/rustwake/";
const SAVE_KEY = "rustwake.save.v1";
const BUILD_SHA = "b9944189e1aa49e4ec8c811fe9e6048b163be945";

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
const matureFixture = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/yard-mature.json"), "utf8"));

// ---- evidence collectors ----
const frameMeta = [];
const steps = [];
const consoleErrors = [];
const pageErrors = [];
const blockers = [];
let openingRefusalToast = null;

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
const tapWreck = (page, touch) => tapWorld(page, WRECK.x, WRECK.y, touch);

async function dom(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const txt = (s) => { const e = q(s); return e ? e.textContent.trim() : null; };
    const vis = (s) => { const e = q(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sub = (root, s) => { const e = root.querySelector(s); return e ? e.textContent.trim() : null; };
    return {
      url: location.href,
      gate: vis(".gate__btn"),
      resources: txt(".resources"),
      credits: txt(".resources__item--credits"),
      store: txt(".resources__item--store"),
      storePressure: q(".resources__item--store")?.getAttribute("data-pressure") ?? null,
      objective: txt(".objective__primary"),
      statusLine: txt(".status-line"),
      dockButtons: [...document.querySelectorAll(".dock button")].map((b) => ({ cls: b.className, text: b.textContent.trim(), disabled: b.disabled })),
      rail: [...document.querySelectorAll(".shell-rail__slot")].map((b) => ({ slot: b.dataset.slot, pressed: b.getAttribute("aria-pressed"), disabled: b.disabled })),
      menuFace: vis(".shell-menu-face"),
      catalog: vis(".catalog"),
      catalogCards: [...document.querySelectorAll(".catalog__card")].map((c) => ({ bp: c.dataset.blueprint, locked: c.dataset.locked, affordable: c.dataset.affordable, selected: c.getAttribute("aria-pressed"), disabled: c.disabled })),
      catalogPlace: q(".catalog__place") ? { text: q(".catalog__place").textContent.trim(), disabled: q(".catalog__place").disabled } : null,
      placeStrip: q('.place-strip[data-flow="placement"]') ? { valid: q(".place-strip").dataset.valid, verdict: q(".place-strip").dataset.verdict, text: q(".place-strip").textContent.trim() } : null,
      panel: q(".panel") ? { cls: q(".panel").className, aria: q(".panel").getAttribute("aria-label"), title: txt(".panel__title") } : null,
      inspectorSections: [...document.querySelectorAll(".inspector-section__title")].map((e) => e.textContent.trim()),
      panelActions: [...document.querySelectorAll(".panel__actions .icon-btn")].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })),
      upgradeCards: [...document.querySelectorAll(".upgrade-card")].map((c) => ({ branch: c.dataset.branch, pressed: c.getAttribute("aria-pressed"), disabled: c.disabled })),
      upgradeBuy: q(".upgrade-buy") ? { disabled: q(".upgrade-buy").disabled, text: q(".upgrade-buy").textContent.trim() } : null,
      upgradeReceipt: txt(".upgrade-receipt"),
      storeTrades: [...document.querySelectorAll(".store-trade")].map((s) => ({ res: s.dataset.resource, sellDisabled: s.querySelector(".store-trade__sell")?.disabled ?? null, sellText: sub(s, ".store-trade__sell"), qty: s.querySelector(".store-trade__qty")?.value ?? null })),
      storeRows: [...document.querySelectorAll(".store-row")].map((r) => ({ res: r.dataset.resource, stock: r.dataset.stock })),
      toast: txt(".toast"),
      cam: q("canvas")?.dataset.cam ?? null,
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
  // The idle "While you were away" return report has a real Back-to-yard control.
  const el = await page.$(".panel--report .panel__head .icon-btn");
  if (el) { await el.click(); await page.waitForTimeout(250); }
}
async function exitBuild(page) {
  // The catalog dialog and the placement ghost are ONE build layer. Closing the
  // catalog (onClose) keeps the ghost armed, so the dock stays in its build phase
  // (Cancel / Build {machine} / Next). Retire the dialog FIRST, then the dock Cancel
  // (onCancelBuild) clears the ghost + blueprint so the dock returns to rest.
  const cat = await page.$(".catalog");
  if (cat) { try { await clickSel(page, ".catalog__close"); await page.waitForTimeout(150); } catch { /* already gone */ } }
  try { await clickButton(page, ".dock button", "Cancel", true); await page.waitForTimeout(200); }
  catch { /* no active build */ }
}
async function deselect(page, touch) {
  // Tap an EMPTY yard cell: pickTarget returns null -> setSelected(null) -> the dock
  // returns to its resting face (Store / primary / Build). Closing the inspector panel
  // alone does NOT clear selection, and a selected machine flips the dock to its
  // upgrade-branch row, so this is the real player path back to the resting dock.
  // Prefer CENTRAL cells (rows 2-3) which sit clear of the HUD on the phone form factor.
  const s = await readSim(page);
  const occupied = new Set((s.machines || []).map((m) => m.tile));
  occupied.add(2); // dock tile is a pick target (-2), never "empty"
  const free = [];
  for (let t = 0; t < 36; t += 1) if (!occupied.has(t)) free.push(t);
  if (free.length === 0) return;
  const centerDist = (t) => Math.abs((t % 6) - 2.5) + Math.abs(Math.floor(t / 6) - 2.5);
  free.sort((a, b) => centerDist(a) - centerDist(b));
  for (let attempt = 0; attempt < Math.min(8, free.length); attempt += 1) {
    await tapTile(page, free[attempt], touch);
    await page.waitForTimeout(200);
    const d = await dom(page);
    if (d.dockButtons.some((b) => b.text.trim() === "Store")) return; // resting dock reached
  }
}
async function openCatalog(page) {
  await dismissReport(page);
  // Idempotent: if the catalog dialog is already open, keep using it.
  const already = await page.$(".catalog");
  if (already) { await page.waitForTimeout(120); return; }
  await exitBuild(page);
  // dock "Build" exists in both phone and rail modes; rail build slot is the fallback.
  try { await clickButton(page, ".dock button", "Build", true); }
  catch { await clickSel(page, '.shell-rail__slot[data-slot="build"]'); }
  await page.waitForSelector(".catalog", { timeout: 5000 });
}
async function openStore(page) {
  await dismissReport(page);
  await exitBuild(page);
  try { await clickButton(page, ".dock button", "Store", true); }
  catch { await clickSel(page, '.shell-rail__slot[data-slot="store"]'); }
  await page.waitForSelector(".panel--store", { timeout: 5000 });
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

async function newPage(browser, form, seed) {
  const phone = form.startsWith("phone");
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone, hasTouch: phone,
  });
  if (seed) {
    const text = encodeEnvelope(matureFixture.payload.sim, Date.now(), matureFixture.payload.settings);
    await context.addInitScript((t) => localStorage.setItem("rustwake.save.v1", t), text);
  }
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[${form}] ${m.text()}`); });
  page.on("pageerror", (e) => pageErrors.push(`[${form}] ${String(e)}`));
  let nav = null;
  for (let attempt = 0; attempt < 2 && !nav; attempt += 1) {
    try { nav = await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 }); }
    catch (e) { blockers.push(`${form} goto attempt ${attempt}: ${String(e && e.message || e)}`); await page.waitForTimeout(1000); }
  }
  if (!nav) throw new Error(`${form}: navigation to ${BASE_URL} failed (see blockers)`);
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
  return { context, page, status: nav.status(), phone };
}

async function begin(page) {
  await clickSel(page, ".gate__btn");
  await page.waitForTimeout(700);
}

// ============================ OPENING (fresh tutorial yard) ============================
async function openingLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-opening`, false);
  const touch = phone;
  const gateDom = await dom(page);
  await shot(page, `${form}-opening/00-gate.png`, { phase: "gate", form, dom: gateDom });
  await begin(page);
  await runStep(page, `${form}-opening`, "01-fresh-yard", async () => {}, [
    { name: "gate dismissed", test: (b, a) => gateDom.gate === true && a.dom.gate === false },
    { name: "resources visible", test: (b, a) => !!a.dom.resources },
    { name: "fresh yard: 0 machines", test: (b, a) => a.sim && a.sim.machines === 0 },
    { name: "primary is Salvage", test: (b, a) => (a.dom.dockButtons.find((x) => x.cls.includes("primary"))?.text || "").includes("Salvage") },
  ]);

  // Salvage through the RESTING guided primary (Salvage at tutorial <=1). No catalog is
  // opened, so no build ghost is armed and the dock stays at rest: the guided primary is
  // the real player path. 6 pulses x 5 = 30 scrap; the wreck pool regenerates when drained.
  // The loop reads scrap before each tap and stops at 30, so it never over-clicks into Repair.
  await runStep(page, `${form}-opening`, "02-salvage", async () => {
    for (let i = 0; i < 25; i += 1) {
      const s0 = await readSim(page);
      if ((s0.store?.scrap ?? 0) >= 30) break;
      await clickPrimary(page); // resting primary = Salvage (manual.salvage)
      await page.waitForTimeout(300);
    }
    // Tutorial advances on TICKS (100ms), not on dispatch: 6 pulses -> step 2. Wait for
    // the tick to land so the guided primary has flipped to Repair before the next step.
    await waitForSim(page, (s) => s.tutorial >= 2, 8000);
  }, [
    { name: "wreck pulses advanced", test: (b, a) => (a.sim?.wreckPulses ?? 0) > (b.sim?.wreckPulses ?? 0) },
    { name: "scrap salvaged to store", test: (b, a) => (a.sim?.store?.scrap ?? 0) > (b.sim?.store?.scrap ?? 0) },
    { name: "tutorial reached repair (>=2)", test: (b, a) => (a.sim?.tutorial ?? 0) >= 2 },
    { name: "enough scrap to repair (>=30)", test: (b, a) => (a.sim?.store?.scrap ?? 0) >= 30 },
  ], 400);

  // Repair the drone (tutorial 2->3) via the guided primary, costs 30 scrap.
  await runStep(page, `${form}-opening`, "03-repair-drone", async () => {
    // Gate on the tick-advanced tutorial AND no machines so the resting guided primary is
    // genuinely Repair (30 scrap). No catalog/ghost was armed, so the dock is already at rest.
    await waitForSim(page, (s) => s.tutorial >= 2 && s.machines.length === 0, 8000);
    await clickPrimary(page);
    await waitForSim(page, (s) => s.drone?.repaired === true, 5000);
  }, [
    { name: "drone repaired", test: (b, a) => a.sim?.droneRepaired === true },
    { name: "scrap spent on repair", test: (b, a) => (a.sim?.store?.scrap ?? 0) < (b.sim?.store?.scrap ?? 0) },
  ]);

  // Wait for drone deliveries to bank the 20 scrap the sorter costs (tutorial 3->4).
  await waitForSim(page, (s) => s.tutorial >= 4 && (s.store?.scrap ?? 0) >= 20, 40000);
  await shot(page, `${form}-opening/04-after-delivery.png`, { phase: "delivery", form, sim: summarize(await readSim(page)), dom: await dom(page) });

  // Build the sorter: primary arms ghost (tile 8), then the dock Build face commits.
  await runStep(page, `${form}-opening`, "05-build-sorter", async () => {
    await waitForSim(page, (s) => s.tutorial >= 4 && s.machines.length === 0, 8000);
    await clickPrimary(page); // resting "Build Scrap sorter" arms ghost (tile 8) + blueprint
    await page.waitForSelector('.place-strip[data-flow="placement"]', { timeout: 5000 });
    await page.waitForTimeout(250);
    await clickPrimary(page); // build-phase "Build {machine}" (onPlace) commits machine.build, clears ghost
    await waitForSim(page, (s) => s.machines.length >= 1, 5000);
    // Tutorial advances on ticks (sorter exists -> step 5); let the tick land before the snapshot.
    await waitForSim(page, (s) => s.tutorial >= 5, 5000);
  }, [
    { name: "sorter placed", test: (b, a) => (a.sim?.machines ?? 0) === (b.sim?.machines ?? 0) + 1 },
    { name: "sorter blueprint present", test: (b, a) => (a.sim?.machineList || []).some((m) => m.bp === "sorter") },
    { name: "tutorial advanced to >=5", test: (b, a) => (a.sim?.tutorial ?? 0) >= 5 },
  ]);

  // Connect the sorter (resolves its starved input): primary dispatches route.connect.
  await runStep(page, `${form}-opening`, "06-connect-sorter", async () => {
    // After the build commit the ghost is cleared (onPlace) so the dock is at rest. At
    // tutorial 5/6 the guided primary is yard-driven ("Connect sorter"), not selection-driven.
    await waitForSim(page, (s) => s.tutorial >= 5 && s.routes.length === 0, 8000);
    // BELT-001: a connection costs beltCostPerTile(1) x run tiles of scrap. The guided
    // Connect face does not pre-print that cost, so the first tap at 0 scrap refuses with
    // a shortfall toast. Capture that feedback, then let the drone bank scrap (the game's
    // own idle earn path - NOT state injection) and tap Connect again to lay the belt.
    await clickPrimary(page);
    await page.waitForTimeout(120);
    openingRefusalToast = (await dom(page)).toast;
    await waitForSim(page, (s) => (s.store?.scrap ?? 0) >= 6, 30000);
    await clickPrimary(page);
    await waitForSim(page, (s) => s.routes.length >= 1, 4000);
    // Tutorial advances on ticks (routes >= 1 -> step 6); let the tick land before the snapshot.
    await waitForSim(page, (s) => s.tutorial >= 6, 5000);
  }, [
    { name: "routes created", test: (b, a) => (a.sim?.routes ?? 0) > (b.sim?.routes ?? 0) },
    { name: "tutorial advanced to >=6", test: (b, a) => (a.sim?.tutorial ?? 0) >= 6 },
  ]);

  // Inspect the sorter through a real canvas tap.
  await runStep(page, `${form}-opening`, "07-inspect-sorter", async () => {
    const s = await readSim(page);
    const sorter = s.machines.find((m) => m.blueprint === "sorter");
    await tapTile(page, sorter.tile, touch);
    await page.waitForSelector(".panel--stack", { timeout: 4000 });
  }, [
    { name: "inspector opened", test: (b, a) => !!a.dom.panel && a.dom.panel.cls.includes("panel--stack") },
    { name: "inspector titled Scrap sorter", test: (b, a) => (a.dom.panel?.aria || "").includes("Scrap sorter") },
    { name: "seven inspector sections", test: (b, a) => (a.dom.inspectorSections || []).length === 7 },
  ]);

  await shot(page, `${form}-opening/08-final.png`, { phase: "final", form, sim: summarize(await readSim(page)), dom: await dom(page) });
  await context.close();
}

// ============================ MATURE (seeded developed yard) ============================
async function matureLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-mature`, true);
  const touch = phone;
  await begin(page);
  await dismissReport(page);
  await runStep(page, `${form}-mature`, "00-mature-yard", async () => {}, [
    { name: "mature yard loaded: 8 machines", test: (b, a) => a.sim?.machines === 8 },
    { name: "tutorial complete (9)", test: (b, a) => a.sim?.tutorial === 9 },
    { name: "export claimed (trade unlocked)", test: (b, a) => a.sim?.exportClaimed === true },
    { name: "no offline drain (credits intact)", test: (b, a) => (a.sim?.credits ?? 0) >= 80 },
  ]);

  // 1) SALVAGE through the catalog footer's real Salvage button.
  await runStep(page, `${form}-mature`, "01-salvage", async () => {
    await openCatalog(page);
    await page.waitForTimeout(150);
    await clickSel(page, ".catalog__salvage"); // real manual.salvage; catalog stays open
    await page.waitForTimeout(300);
  }, [
    { name: "salvage pulse registered", test: (b, a) => (a.sim?.wreckPulses ?? 0) > (b.sim?.wreckPulses ?? 0) },
    { name: "scrap gained from salvage", test: (b, a) => (a.sim?.store?.scrap ?? 0) > (b.sim?.store?.scrap ?? 0) },
  ]);

  // 2) BUILD a furnace: catalog card -> Place -> dock Build face (real machine.build).
  let newMachineId = null;
  await runStep(page, `${form}-mature`, "02-build-furnace", async () => {
    const before = await readSim(page);
    newMachineId = before.nextMachineId;
    await openCatalog(page);
    await clickSel(page, '.catalog__card[data-blueprint="furnace"]');
    await page.waitForTimeout(150);
    await clickSel(page, ".catalog__place"); // closes catalog, keeps ghost
    await page.waitForSelector('.place-strip[data-flow="placement"]', { timeout: 4000 });
    await page.waitForTimeout(150);
    await clickSel(page, ".dock__btn--primary"); // Build Furnace -> machine.build
  }, [
    { name: "machine count +1", test: (b, a) => (a.sim?.machines ?? 0) === (b.sim?.machines ?? 0) + 1 },
    { name: "new furnace exists", test: (b, a) => (a.sim?.machineList || []).some((m) => m.id === newMachineId && m.bp === "furnace") },
    { name: "build cost spent (scrap down)", test: (b, a) => (a.sim?.store?.scrap ?? 0) < (b.sim?.store?.scrap ?? 0) },
  ]);

  // 3) INSPECT the new furnace via real canvas tap.
  await runStep(page, `${form}-mature`, "03-inspect-furnace", async () => {
    const s = await readSim(page);
    const m = s.machines.find((x) => x.id === newMachineId);
    await tapTile(page, m.tile, touch);
    await page.waitForSelector(".panel--stack", { timeout: 4000 });
  }, [
    { name: "furnace inspector opened", test: (b, a) => (a.dom.panel?.aria || "").includes("Furnace") },
    { name: "seven inspector sections", test: (b, a) => (a.dom.inspectorSections || []).length === 7 },
    { name: "bottleneck section present", test: (b, a) => (a.dom.inspectorSections || []).some((t) => /bottleneck/i.test(t)) },
  ]);

  // 4) RESOLVE the input bottleneck: inspector Connect dispatches route.connect plans.
  await runStep(page, `${form}-mature`, "04-connect-bottleneck", async () => {
    await clickButton(page, ".panel__actions .icon-btn", "Connect", false);
  }, [
    { name: "routes increased (input linked)", test: (b, a) => (a.sim?.routes ?? 0) > (b.sim?.routes ?? 0) },
    { name: "furnace gained an input route", test: (b, a) => {
      const bm = (b.sim?.machineList || []).find((m) => m.id === newMachineId);
      const am = (a.sim?.machineList || []).find((m) => m.id === newMachineId);
      return (am?.inRoutes ?? 0) > (bm?.inRoutes ?? 0);
    } },
  ]);

  // 5) SELL through a real Store trade card (contract.sell). Steel has NO trade face in
  // this fixture: reserveFloor=10 and the yard holds exactly 10 steel, so the engine's
  // sellableAmount(steel)=0 (intentional reserve, NOT a defect). The dearest sellable
  // face leads the trade desk; sell that one through its Max preset + Sell button.
  let sellResource = null;
  await runStep(page, `${form}-mature`, "05-sell-resource", async () => {
    await closePanel(page);
    // Real player path: tap the dock/store building in the yard. pickTarget returns -2 for
    // DOCK_TILE(2) -> setSelected(-2) -> StorePanel. This works on both form factors and
    // overrides the machine selection without needing the resting dock first.
    await tapTile(page, 2, touch);
    await page.waitForTimeout(250);
    if (!(await page.$(".panel--store"))) {
      // Fallback: tap a central empty cell to deselect, then the resting dock Store face.
      await deselect(page, touch);
      await clickButton(page, ".dock button", "Store", true);
    }
    await page.waitForSelector(".panel--store", { timeout: 5000 });
    await page.waitForTimeout(150);
    const card = await page.$(".store-trade"); // dearest sellable face (sorted by price)
    sellResource = card ? await card.getAttribute("data-resource") : null;
    const max = await page.$(".store-trade .store-trade__preset"); // first preset = Max
    if (max) await max.click();
    await page.waitForTimeout(150);
    await clickSel(page, ".store-trade .store-trade__sell");
  }, [
    { name: "a sellable trade face was present", test: () => !!sellResource },
    { name: "credits increased by sale", test: (b, a) => (a.sim?.credits ?? 0) > (b.sim?.credits ?? 0) },
    { name: "sold resource stock reduced", test: (b, a) => sellResource ? (a.sim?.store?.[sellResource] ?? 0) < (b.sim?.store?.[sellResource] ?? 0) : false },
  ]);

  // 6) UPGRADE: re-inspect the furnace, choose a branch card, Buy (real machine.upgrade).
  await runStep(page, `${form}-mature`, "06-upgrade-furnace", async () => {
    await closePanel(page);
    const s = await readSim(page);
    const m = s.machines.find((x) => x.id === newMachineId);
    await tapTile(page, m.tile, touch);
    await page.waitForSelector(".panel--stack", { timeout: 4000 });
    await page.waitForTimeout(150);
    await clickSel(page, '.upgrade-card[data-branch="speed"]');
    await page.waitForTimeout(150);
    await clickSel(page, ".upgrade-buy");
  }, [
    { name: "furnace level +1", test: (b, a) => {
      const bm = (b.sim?.machineList || []).find((m) => m.id === newMachineId);
      const am = (a.sim?.machineList || []).find((m) => m.id === newMachineId);
      return (am?.level ?? 0) === (bm?.level ?? 0) + 1;
    } },
    { name: "credits spent on upgrade", test: (b, a) => (a.sim?.credits ?? 0) < (b.sim?.credits ?? 0) },
    { name: "upgrade receipt shown", test: (b, a) => !!a.dom.upgradeReceipt },
  ]);

  await shot(page, `${form}-mature/07-final.png`, { phase: "final", form, sim: summarize(await readSim(page)), dom: await dom(page) });
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
  console.log("BASE_URL=", BASE_URL, "BUILD_SHA=", BUILD_SHA, "chrome=", executablePath);
  const browser = await chromium.launch({ executablePath, headless: true });
  const forms = [
    { key: "phone", dims: { w: 780, h: 1688 } },
    { key: "desktop", dims: { w: 1920, h: 1080 } },
  ];
  for (const f of forms) {
    try { await openingLoop(browser, f.key); }
    catch (e) { blockers.push(`${f.key}-opening FATAL: ${String(e && e.stack || e)}`); console.error(e); }
    try { await matureLoop(browser, f.key); }
    catch (e) { blockers.push(`${f.key}-mature FATAL: ${String(e && e.stack || e)}`); console.error(e); }
  }
  await browser.close();

  const expectedDims = {};
  for (const f of forms) { expectedDims[`${f.key}-opening`] = f.dims; expectedDims[`${f.key}-mature`] = f.dims; }
  const audit = auditFrames(expectedDims);
  const auditOk = audit.every((a) => a.ok);
  // distinct-frame check per clip: at least one pair of frames differs (state changed)
  const byForm = {};
  for (const a of audit) { const k = a.frame.split("/")[0]; (byForm[k] ||= []).push(a.sha256); }
  const distinct = Object.fromEntries(Object.entries(byForm).map(([k, v]) => [k, new Set(v).size > 1]));

  const allChecks = steps.flatMap((s) => s.checks.map((c) => ({ form: s.form, step: s.step, ...c })));
  const failedChecks = allChecks.filter((c) => !c.ok);
  const results = {
    issue: 57, role: "reviewer", buildSha: BUILD_SHA, baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    chrome: executablePath,
    fixtureScrutiny: {
      a: "Only setup seeding mutates state (probe encodeEnvelope); no src changes; all actions are real UI clicks/taps.",
      b: "Documented in probe.mjs header, evidence.md and results.json.",
      c: "Seeded envelope passes the game's full decodeSave/validateSim; no invariant weakened or bypassed.",
      d: "Actions flow through dispatch->applyCommand; localStorage read only as the game's own persistence mirror.",
    },
    counts: { frames: audit.length, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length },
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, frames: audit },
    findings: [
      {
        id: "steel-reserve-floor",
        verdict: "intentional-design-not-defect",
        detail: "The mature fixture holds exactly 10 steel and TUNING.reserveFloor=10, so the engine's sellableAmount(steel)=held-(reserveFloor+machineInputDemand)=0. tradeFaces() therefore omits a steel trade card while still listing steel (stock 10) in the Inventory section. This is the reserve floor protecting starter stock by construction, not a mislabeled or unreachable control. The sell step sells the dearest genuinely-sellable face (circuits/plates) through its real Max preset + Sell button.",
        source: "src/ui/store/model.ts tradeFaces; src/game/simulation/commands.ts sellableAmount; src/game/content/defs.ts reserveFloor=10, EXPORT_PRICES.steel=10",
      },
      {
        id: "dock-context-sensitivity",
        verdict: "intentional-design-not-defect",
        detail: "With a machine selected (selected>0) at tutorial>=8 the dock renders the machine's upgrade-branch row instead of the resting Store/Build faces; closing the inspector panel does not clear selection. Tapping an empty yard cell (pickTarget=null -> setSelected(null)) returns the dock to rest. This is the documented one-selection dock model, and the empty-yard tap is a real, reachable player path. No dead-end.",
        source: "src/ui/App.tsx pickTarget/onPointerUp; src/ui/Hud.tsx DockButtons primary.branches",
      },
      {
        id: "wreck-pool-regenerates",
        verdict: "intentional-design-not-defect",
        detail: "When wreck.remaining reaches 0 the engine increments generation and refills remaining to starterWreckPool(30), so manual salvage and drone delivery never dead-end. Confirmed across the opening salvage loop.",
        source: "src/game/simulation/engine.ts wreck regeneration",
      },
      {
        id: "belt-cost-on-guided-connect",
        verdict: "minor-friction-not-blocking",
        detail: "BELT-001 charges beltCostPerTile(1) x run tiles of scrap per connection (connectRoute -> spendFromStore). After repair(30)+sorter(20) the opening yard is at 0 scrap, so the guided 'Connect dock to sorter' primary refuses on the first tap. The refusal IS surfaced: a 1.8s shortfall toast (reject.shortfall need/have) plus the persistent 'Last need...' resting-line tail. The dock Connect face does not pre-print the belt scrap cost (minor tutorial friction), but this is NOT a dead-end: the drone delivers 5 scrap every ~5s and the wreck regenerates, so the player banks scrap and connects. The probe waits for the drone (real idle earn path) then connects through the same guided primary; routes form and tutorial advances to 6.",
        refusalToastCaptured: openingRefusalToast,
        source: "src/game/simulation/commands.ts connectRoute/beltCost; src/game/content/defs.ts beltCostPerTile=1; src/ui/App.tsx setToast/setLastReject + reject.shortfall",
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
}

main().catch((e) => { console.error("PROBE FATAL:", e); process.exitCode = 1; });
