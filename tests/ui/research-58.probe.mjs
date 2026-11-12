/**
 * UI-RESET-58 (issue #58) — developer acceptance probe.
 *
 * ROLE: developer (rw/58-research). PROBE-ONLY code: nothing under src/ is
 * modified by this file. It drives THIS BRANCH'S app through the REAL UI
 * (clicks/taps on actual controls -> props.dispatch -> store.dispatch ->
 * applyCommand) and records DOM + geometry + persisted-state evidence.
 * No vision is used: every visual claim is a programmatic DOM/geometry or
 * pixel-hash assertion, never an eyeballed screenshot.
 *
 * Run against the branch's own build (never the live site):
 *   pnpm build
 *   pnpm preview --port 5158 --strictPort --host 127.0.0.1   (background)
 *   $env:BASE_URL='http://127.0.0.1:5158/'; $env:RW58_SHA='<head sha>';
 *   node tests/ui/research-58.probe.mjs
 * Artifacts land in RW58_EVID (default C:/Users/ryans/AppData/Local/Temp/rw-coord/UI-RESET-58).
 *
 * Fixture scrutiny (task a-d):
 *  (a) The only state mutation is SETUP seeding. Fixtures are derived from the
 *      repo's own docs/evidence/yard-mature.json by editing the fixture sim
 *      BEFORE encoding (research ranks, Data balance, and — for deterministic
 *      balances — removing the Signal lab, the game's only Data producer, so
 *      no Data accrues mid-observation). storeUnits is recomputed as the exact
 *      sum of the store. The envelope is the game's OWN encodeSave arithmetic
 *      (FNV-1a checksum, lastSeenMs=Date.now() to avoid offline catch-up).
 *      Every acceptance ACTION (open panel, buy, Details, scroll, close) is a
 *      real UI click/tap/scroll through dispatch -> applyCommand.
 *  (b) This file + results.json document the method, fixtures and derivations.
 *  (c) Validation is NOT weakened: each seeded envelope still passes the
 *      game's full decodeSave/repairRegistration/validateSim on load (route
 *      endpoints, research ranks and quantity maps all stay sound). No
 *      invariant is bypassed; the probe asserts the loaded mirror matches the
 *      seed before any action.
 *  (d) No action is faked by state injection. localStorage is read ONLY as a
 *      mirror of the game's own persistence (written on every ok dispatch).
 *
 * Entry-gate note (existing spec 5.5, NOT changed by #58): showResearch() in
 * App.tsx offers the Research destination only once Data exists or a node is
 * known. The panel's no-data state is therefore demonstrated the reachable
 * way: one node owned, balance spent to 0. A fresh yard's disabled rail slot
 * ("Needs data") / absent dock button is captured as the pre-entry state.
 */
import { chromium } from "playwright-core";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";

const ROOT = resolve(process.cwd());
const EVID = process.env.RW58_EVID || "C:/Users/ryans/AppData/Local/Temp/rw-coord/UI-RESET-58";
const FRAMES = resolve(EVID, "frames");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5158/";
const BUILD_SHA = process.env.RW58_SHA || "unset";
const SAVE_KEY = "rustwake.save.v1";

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = chromeCandidates.find((p) => p && existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge executable found");

// ---- content truth mirrored from the READ-ONLY tables (src/game/content) ----
// research.ts: labels, verbatim effects, costs, prerequisite chain.
const NODES = [
  { id: "cutters", label: "Efficient Cutters", cost: 4, effect: "One cutting pulse gives 7 scrap instead of 5." },
  { id: "buffers", label: "Smart Buffers", cost: 8, effect: "Every machine holds 6 more units of input, so short gaps do not halt it." },
  { id: "dispatch", label: "Route Dispatch", cost: 12, effect: "A newly connected link carries 8 more units at once." },
];
const DATA_NOTE = "Signal lab makes 2 Data every 15s from 1 circuits.";

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

/**
 * Derive a deterministic fixture: set research ranks + Data balance, and remove
 * the Signal lab (machine id 8) with its routes so no Data is produced while
 * the probe observes. Route references on surviving machines are pruned the
 * same way the game's own repairRegistration prunes them. storeUnits is
 * recomputed as the exact store sum. This is fixture SETUP, not a game action.
 */
function deriveFixture({ research, data, keepSignalLab, textScale }) {
  const sim = JSON.parse(JSON.stringify(mature.payload.sim));
  sim.research = { ...research };
  sim.store.data = data;
  if (!keepSignalLab) {
    const dead = new Set(
      sim.routes
        .filter((r) => (r.from.kind === "machine" && r.from.id === 8) || (r.to.kind === "machine" && r.to.id === 8))
        .map((r) => r.id)
    );
    sim.routes = sim.routes.filter((r) => !dead.has(r.id));
    sim.machines = sim.machines.filter((m) => m.id !== 8);
    for (const m of sim.machines) {
      m.inRoutes = (m.inRoutes || []).filter((id) => !dead.has(id));
      if (m.outRoute !== null && dead.has(m.outRoute)) m.outRoute = null;
    }
  }
  sim.storeUnits = Object.values(sim.store).reduce((a, b) => a + b, 0);
  const settings = { ...mature.payload.settings, textScale: textScale ?? 1 };
  return { sim, settings };
}

const FIXTURES = {
  // One node owned, 10 Data: buffers available, dispatch locked. Buyable.
  partial: deriveFixture({ research: { cutters: 1 }, data: 10 }),
  // One node owned, balance spent to 0: the reachable no-data panel state.
  noData: deriveFixture({ research: { cutters: 1 }, data: 0 }),
  // The mature yard verbatim: all three nodes owned, 76 Data.
  completed: deriveFixture({ research: { cutters: 1, buffers: 1, dispatch: 1 }, data: 76, keepSignalLab: true }),
  // Partial progress at text scale 2 (the app's .text-large threshold is 1.5).
  large: deriveFixture({ research: { cutters: 1 }, data: 10, textScale: 2 }),
};

// ---- evidence collectors ----
const frameMeta = [];
const steps = [];
const consoleErrors = [];
const pageErrors = [];
const blockers = [];
const fontBaseline = {}; // per form: ts1 computed sizes, compared at ts2

function summarize(sim) {
  if (!sim) return null;
  return {
    tutorial: sim.tutorial,
    research: { ...sim.research },
    data: sim.store?.data ?? 0,
    storeUnits: sim.storeUnits,
    machines: sim.machines.length,
    routes: sim.routes.length,
    machineList: sim.machines.map((m) => ({ id: m.id, bp: m.blueprint, tile: m.tile })),
  };
}

async function readSim(page) {
  return page.evaluate((key) => {
    const t = localStorage.getItem(key);
    if (!t) return null;
    try { return JSON.parse(t).payload.sim; } catch { return null; }
  }, SAVE_KEY);
}

/** One panel-scoped DOM + geometry snapshot. All claims derive from this. */
async function researchDom(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const panel = q(".panel--research");
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const fontPx = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
    const body = panel ? panel.querySelector(".panel__body") : null;
    const summary = panel ? panel.querySelector(".research-summary") : null;
    const focus = panel ? panel.querySelector(".research-focus") : null;
    const cards = panel
      ? [...panel.querySelectorAll(".node")].map((n) => {
          const buy = n.querySelector(".node__buy");
          const details = n.querySelector(".research-details");
          return {
            id: n.getAttribute("data-node"),
            legacy: n.getAttribute("data-state"),
            state: n.getAttribute("data-research-state"),
            aria: n.getAttribute("aria-label"),
            name: n.querySelector(".node__name")?.textContent.trim() ?? null,
            badge: n.querySelector(".research-badge")?.textContent.trim() ?? null,
            effect: n.querySelector(".node__effect")?.textContent.trim() ?? null,
            prereq: n.querySelector(".research-prereq")?.textContent.trim() ?? null,
            stateLine: n.querySelector(".node__state")?.textContent.trim() ?? null,
            why: n.querySelector(".research-why")?.textContent.trim() ?? null,
            cost: n.querySelector(".node__cost")?.textContent.trim() ?? null,
            buy: buy ? { text: buy.textContent.trim(), disabled: buy.disabled, rect: rect(buy) } : null,
            details: details ? { aria: details.getAttribute("aria-label"), rect: rect(details) } : null,
            rect: rect(n),
            fonts: {
              name: fontPx(n.querySelector(".node__name")),
              effect: fontPx(n.querySelector(".node__effect")),
              badge: fontPx(n.querySelector(".research-badge")),
              stateLine: fontPx(n.querySelector(".node__state")),
            },
          };
        })
      : [];
    const segs = panel
      ? [...panel.querySelectorAll(".research-seg")].map((s) => ({
          state: s.getAttribute("data-research-state"),
          name: s.querySelector(".research-seg__name")?.textContent.trim() ?? null,
          word: s.querySelector(".research-seg__state")?.textContent.trim() ?? null,
          rect: rect(s),
        }))
      : [];
    return {
      url: location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      rootFontSize: fontPx(document.documentElement),
      textLarge: document.documentElement.classList.contains("text-large"),
      railMode: window.matchMedia("(min-width: 1200px), (min-width: 600px) and (max-height: 460px)").matches,
      docScrollW: document.documentElement.scrollWidth,
      gate: !!q(".gate__btn"),
      dockResearch: [...document.querySelectorAll(".dock button")].some((b) => b.textContent.trim() === "Research"),
      railResearch: (() => {
        const s = q('.shell-rail__slot[data-slot="research"]');
        return s ? { disabled: s.disabled, reason: s.querySelector(".shell-rail__reason")?.textContent.trim() ?? null } : null;
      })(),
      panel: panel
        ? {
            cls: panel.className,
            aria: panel.getAttribute("aria-label"),
            title: panel.querySelector(".panel__title")?.textContent.trim() ?? null,
            rect: rect(panel),
            lead: panel.querySelector(".panel__lead")?.textContent.trim() ?? null,
            progress: panel.querySelector(".research-progress")?.textContent.trim() ?? null,
            dataNote: panel.querySelector(".research-datanote")?.textContent.trim() ?? null,
            body: body
              ? {
                  rect: rect(body),
                  scrollTop: body.scrollTop,
                  scrollHeight: body.scrollHeight,
                  clientHeight: body.clientHeight,
                  overflowY: getComputedStyle(body).overflowY,
                }
              : null,
            summary: summary
              ? { rect: rect(summary), position: getComputedStyle(summary).position, offsetFromBodyTop: summary.getBoundingClientRect().top - body.getBoundingClientRect().top }
              : null,
            focus: focus
              ? {
                  id: focus.getAttribute("data-focus"),
                  title: focus.querySelector(".research-focus__title")?.textContent.trim() ?? null,
                  where: focus.querySelector(".research-focus__where")?.textContent.trim() ?? null,
                  rows: [...focus.querySelectorAll(".research-focus__row")].map((r) => ({
                    label: r.querySelector("dt")?.textContent.trim() ?? null,
                    value: r.querySelector("dd")?.textContent.trim() ?? null,
                  })),
                }
              : null,
            cards,
            segs,
          }
        : null,
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

async function clickButton(page, selector, textMatch) {
  const handle = await page.evaluateHandle(({ selector, textMatch }) => {
    const els = [...document.querySelectorAll(selector)];
    return els.find((e) => e.textContent.trim() === textMatch) || null;
  }, { selector, textMatch });
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

/** The real player path to the panel: dock Research button on phones, rail slot on desktop. */
async function openResearch(page, phone) {
  await dismissReport(page);
  if (phone) await clickButton(page, ".dock button", "Research");
  else await clickSel(page, '.shell-rail__slot[data-slot="research"]');
  await page.waitForSelector(".panel--research", { timeout: 5000 });
  await page.waitForTimeout(200);
}

async function scrollBodyToBottom(page) {
  await page.evaluate(() => {
    const body = document.querySelector(".panel--research .panel__body");
    if (body) body.scrollTop = body.scrollHeight;
  });
  await page.waitForTimeout(200);
}

// Bring a card's HEAD to just below the sticky overview, so the top of a card
// taller than the scrollport is provably viewable (not permanently occluded).
// At large text a card can exceed the scrollport height, so "whole card fits"
// is impossible; traversability (head AND tail each reachable) is the real bar.
async function scrollCardHeadIntoView(page, nodeId) {
  await page.evaluate((id) => {
    const body = document.querySelector(".panel--research .panel__body");
    const cardEl = document.querySelector(`.node[data-node="${id}"]`);
    const summary = document.querySelector(".panel--research .research-summary");
    if (!body || !cardEl) return;
    const bodyTop = body.getBoundingClientRect().top;
    const cardTopInBody = cardEl.getBoundingClientRect().top - bodyTop;
    const contentOffset = body.scrollTop + cardTopInBody; // card head in content coords
    const summaryH = summary ? summary.getBoundingClientRect().height : 0;
    const target = contentOffset - summaryH - 2; // head lands just under the stuck strip
    body.scrollTop = Math.max(0, Math.min(target, body.scrollHeight - body.clientHeight));
  }, nodeId);
  await page.waitForTimeout(200);
}

async function runStep(page, form, name, action, expect = [], waitMs = 350) {
  const before = { sim: summarize(await readSim(page)), dom: await researchDom(page) };
  await shot(page, `${form}/${name}-before.png`, { phase: "before", step: name, form, sim: before.sim });
  let error = null;
  try { await action(); } catch (e) { error = String((e && e.message) || e); blockers.push(`${form}/${name}: ${error}`); }
  await page.waitForTimeout(waitMs);
  const after = { sim: summarize(await readSim(page)), dom: await researchDom(page) };
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
  const phone = form.startsWith("phone");
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
    deviceScaleFactor: phone ? 2 : 1,
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

const card = (dom, id) => dom.panel?.cards.find((c) => c.id === id) ?? null;
const statesOf = (dom) => dom.panel?.cards.map((c) => `${c.id}:${c.state}`).join(",") ?? "";

// ============================ partial progress + real purchase ============================
async function partialLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-partial`, FIXTURES.partial);
  const seedCheck = await readSim(page);
  await runStep(page, `${form}-partial`, "00-open", async () => {
    await openResearch(page, phone);
  }, [
    { name: "seed loaded intact (cutters=1, data=10, 7 machines)", test: () => seedCheck?.research?.cutters === 1 && seedCheck?.store?.data === 10 && seedCheck?.machines?.length === 7 },
    { name: "panel mount contract (class/role/title)", test: (b, a) => !!a.dom.panel && a.dom.panel.cls.includes("panel--research") && a.dom.panel.cls.includes("panel--stack") && a.dom.panel.aria === "Research" && a.dom.panel.title === "Research" },
    { name: "four states: completed/available/locked", test: (b, a) => statesOf(a.dom) === "cutters:completed,buffers:available,dispatch:locked" },
    { name: "legacy data-state preserved (known/open/locked)", test: (b, a) => a.dom.panel.cards.map((c) => c.legacy).join(",") === "known,open,locked" },
    { name: "progress 1 of 3 researched", test: (b, a) => a.dom.panel.progress === "1 of 3 researched" },
    { name: "readable prerequisites", test: (b, a) => card(a.dom, "cutters").prereq === "First node — no prerequisite." && card(a.dom, "buffers").prereq === "Requires Efficient Cutters — completed" && card(a.dom, "dispatch").prereq === "Requires Smart Buffers — not researched yet" },
    { name: "exact effects verbatim before purchase", test: (b, a) => NODES.every((n) => card(a.dom, n.id).effect === n.effect) },
    { name: "exact costs on chip and buy target", test: (b, a) => NODES.every((n) => card(a.dom, n.id).cost === `${n.cost} Data`) && card(a.dom, "buffers").buy.text === "Buy · 8 Data" },
    { name: "why-unavailable: locked names its prerequisite", test: (b, a) => card(a.dom, "dispatch").why === "Research Smart Buffers first to open this node." && card(a.dom, "buffers").why === null },
    { name: "only the available node's buy is enabled", test: (b, a) => a.dom.panel.cards.filter((c) => c.buy && !c.buy.disabled).map((c) => c.id).join(",") === "buffers" },
    { name: "focus readout targets the next node with live numbers", test: (b, a) => a.dom.panel.focus.id === "buffers" && a.dom.panel.focus.title === "Where the next upgrade lands" && a.dom.panel.focus.rows.some((r) => /input$/.test(r.label) && /-> 18 units$/.test(r.value)) },
    { name: "overview segments mirror card states", test: (b, a) => a.dom.panel.segs.map((s) => s.state).join(",") === a.dom.panel.cards.map((c) => c.state).join(",") },
    { name: "panel inside viewport, no horizontal overflow", test: (b, a) => a.dom.panel.rect.left >= -1 && a.dom.panel.rect.right <= a.dom.viewport.w + 1 && a.dom.docScrollW <= a.dom.viewport.w + 1 },
    { name: "buy target keeps the 44px floor", test: (b, a) => a.dom.panel.cards.every((c) => !c.buy || c.buy.rect.height >= 44) },
    { name: "type stays readable (badge >= 9px, effect >= 11px at scale 1)", test: (b, a) => a.dom.panel.cards.every((c) => c.fonts.badge >= 9 && c.fonts.effect >= 11) },
  ]);
  fontBaseline[form] = (await researchDom(page)).panel?.cards[0]?.fonts ?? null;

  await runStep(page, `${form}-partial`, "01-buy-buffers", async () => {
    await clickButton(page, '.node[data-node="buffers"] .node__buy', "Buy · 8 Data");
    await page.waitForTimeout(250);
  }, [
    { name: "engine moved: buffers rank 1, exactly 8 Data spent", test: (b, a) => a.sim.research.buffers === 1 && a.sim.data === b.sim.data - 8 && a.sim.data === 2 },
    { name: "bought card completed immediately (Known, no buy)", test: (b, a) => card(a.dom, "buffers").state === "completed" && card(a.dom, "buffers").stateLine === "Known" && card(a.dom, "buffers").buy === null },
    { name: "next card answers with the new balance", test: (b, a) => card(a.dom, "dispatch").state === "unlocked" && card(a.dom, "dispatch").why === "Need 10 more Data — have 2 of 12." && card(a.dom, "dispatch").buy.disabled === true },
    { name: "focus pinned to the bought node", test: (b, a) => a.dom.panel.focus.id === "buffers" && a.dom.panel.focus.title === "Just bought — live in the yard" },
    { name: "progress advanced to 2 of 3", test: (b, a) => a.dom.panel.progress === "2 of 3 researched" },
    { name: "overview still mirrors the cards", test: (b, a) => a.dom.panel.segs.map((s) => s.state).join(",") === a.dom.panel.cards.map((c) => c.state).join(",") },
  ]);

  await runStep(page, `${form}-partial`, "02-scroll-overview", async () => {
    await scrollBodyToBottom(page);
  }, [
    { name: "last card reachable (fully inside the scroller)", test: (b, a) => {
        const c = card(a.dom, "dispatch").rect, body = a.dom.panel.body.rect;
        return c.top >= body.top - 1 && c.bottom <= body.bottom + 1;
      } },
    { name: "overview stays put: sticky while scrolling, or whole panel fits", test: (b, a) => {
        const body = a.dom.panel.body;
        if (body.scrollHeight > body.clientHeight + 4) {
          return body.scrollTop > 0 && Math.abs(a.dom.panel.summary.offsetFromBodyTop) <= 2 && a.dom.panel.summary.position === "sticky";
        }
        return a.dom.panel.cards.every((c) => c.rect.bottom <= body.rect.bottom + 1);
      }, detail: (b, a) => `scrollH=${a.dom.panel.body.scrollHeight} clientH=${a.dom.panel.body.clientHeight} scrollTop=${a.dom.panel.body.scrollTop} summaryOffset=${a.dom.panel.summary.offsetFromBodyTop.toFixed(1)}` },
    { name: "no type shrunk by scrolling (fonts unchanged)", test: (b, a) => JSON.stringify(card(a.dom, "cutters").fonts) === JSON.stringify(card(b.dom, "cutters").fonts) },
  ]);

  await runStep(page, `${form}-partial`, "03-details-dispatch", async () => {
    await clickSel(page, '.node[data-node="dispatch"] .research-details');
  }, [
    { name: "Details moves the focus readout to Route Dispatch", test: (b, a) => a.dom.panel.focus.id === "dispatch" && a.dom.panel.focus.title === "Where Route Dispatch lands" },
    { name: "dispatch rows carry the engine's now -> after capacity", test: (b, a) => a.dom.panel.focus.rows.some((r) => r.value === "24 units -> 32 units") && a.dom.panel.focus.rows.some((r) => r.label === "Links already in the yard") },
  ]);

  await runStep(page, `${form}-partial`, "04-close", async () => {
    await clickSel(page, ".panel--research .panel__head .icon-btn");
  }, [
    { name: "panel closed", test: (b, a) => a.dom.panel === null },
  ]);
  await context.close();
}

// ============================ no-data (reachable: balance spent to 0) ============================
async function noDataLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-nodata`, FIXTURES.noData);
  await runStep(page, `${form}-nodata`, "00-open", async () => {
    await openResearch(page, phone);
  }, [
    { name: "seed loaded intact (cutters=1, data=0)", test: (b, a) => a.sim.research.cutters === 1 && a.sim.data === 0 },
    { name: "no-data answer names the content table's Data source", test: (b, a) => a.dom.panel.dataNote === DATA_NOTE },
    { name: "lead shows the zero balance", test: (b, a) => a.dom.panel.lead === "Data0" },
    { name: "unlocked node prints the engine's shortfall", test: (b, a) => card(a.dom, "buffers").state === "unlocked" && card(a.dom, "buffers").why === "Need 8 more Data — have 0 of 8." },
    { name: "locked node still names its prerequisite", test: (b, a) => card(a.dom, "dispatch").why === "Research Smart Buffers first to open this node." },
    { name: "every buy disabled at zero Data", test: (b, a) => a.dom.panel.cards.every((c) => !c.buy || c.buy.disabled) },
    { name: "progress 1 of 3 researched", test: (b, a) => a.dom.panel.progress === "1 of 3 researched" },
  ]);
  await context.close();
}

// ============================ completed research ============================
async function completedLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-completed`, FIXTURES.completed);
  await runStep(page, `${form}-completed`, "00-open", async () => {
    await openResearch(page, phone);
  }, [
    { name: "seed loaded intact (all ranks 1, data=76)", test: (b, a) => a.sim.research.cutters === 1 && a.sim.research.buffers === 1 && a.sim.research.dispatch === 1 && a.sim.data === 76 },
    { name: "all three completed, legacy Known kept", test: (b, a) => a.dom.panel.cards.every((c) => c.state === "completed" && c.stateLine === "Known" && c.badge === "Completed") },
    { name: "no buy targets remain", test: (b, a) => a.dom.panel.cards.every((c) => c.buy === null) },
    { name: "progress 3 of 3 researched", test: (b, a) => a.dom.panel.progress === "3 of 3 researched" },
    { name: "focus reports the live effective numbers", test: (b, a) => a.dom.panel.focus.id === "done" && a.dom.panel.focus.title === "Every node is active in the yard" && ["7 scrap", "+6 units per machine", "32 units"].every((v) => a.dom.panel.focus.rows.some((r) => r.value === v)) },
    { name: "no earn-more note once complete", test: (b, a) => a.dom.panel.dataNote === null },
    { name: "overview all completed", test: (b, a) => a.dom.panel.segs.every((s) => s.state === "completed") },
  ]);
  await context.close();
}

// ============================ large text (scale 2) ============================
async function largeLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-large`, FIXTURES.large);
  await runStep(page, `${form}-large`, "00-open", async () => {
    await openResearch(page, phone);
  }, [
    { name: "app large-text mode active at scale 2", test: (b, a) => a.dom.textLarge === true && a.dom.rootFontSize === 30 },
    { name: "type scales UP, never shrinks (2x the scale-1 baseline)", test: (b, a) => {
        const base = fontBaseline[form];
        const now = a.dom.panel.cards[0].fonts;
        if (!base) return now.badge >= 18 && now.effect >= 22;
        return ["name", "effect", "badge", "stateLine"].every((k) => Math.abs(now[k] / base[k] - 2) < 0.1);
      }, detail: (b, a) => `baseline=${JSON.stringify(fontBaseline[form])} now=${JSON.stringify(a.dom.panel.cards[0].fonts)}` },
    { name: "buy target keeps the 44px floor at scale 2", test: (b, a) => a.dom.panel.cards.every((c) => !c.buy || c.buy.rect.height >= 44) },
    { name: "panel inside viewport, no horizontal overflow", test: (b, a) => a.dom.panel.rect.left >= -1 && a.dom.panel.rect.right <= a.dom.viewport.w + 1 && a.dom.docScrollW <= a.dom.viewport.w + 1 },
    { name: "all decision lines still painted", test: (b, a) => a.dom.panel.cards.every((c) => c.prereq && c.effect && c.stateLine) && !!a.dom.panel.summary && !!a.dom.panel.focus },
  ]);
  // At scale 2 a card can be taller than the phone scrollport, so "whole card
  // fits at once" is geometrically impossible. The real acceptance bar is
  // traversability: the last card's TAIL (cost + Buy) and its HEAD must each be
  // bringable into the visible band below the sticky overview. Prove both.
  await runStep(page, `${form}-large`, "01-scroll-tail", async () => {
    await scrollBodyToBottom(page);
  }, [
    { name: "last card tail (cost + Buy) reachable at scale 2", test: (b, a) => {
        const c = card(a.dom, "dispatch").rect, body = a.dom.panel.body.rect;
        const bandTop = a.dom.panel.summary ? a.dom.panel.summary.rect.bottom : body.top;
        return c.bottom <= body.bottom + 1 && c.bottom > bandTop - 1 && c.top < body.bottom;
      }, detail: (b, a) => {
        const c = card(a.dom, "dispatch").rect, body = a.dom.panel.body.rect;
        return `cardBottom=${c.bottom.toFixed(1)} bodyBottom=${body.bottom.toFixed(1)} summaryBottom=${a.dom.panel.summary.rect.bottom.toFixed(1)}`;
      } },
    { name: "overview stays sticky while scrolling at scale 2", test: (b, a) => {
        const body = a.dom.panel.body;
        if (body.scrollHeight > body.clientHeight + 4) {
          return body.scrollTop > 0 && Math.abs(a.dom.panel.summary.offsetFromBodyTop) <= 2 && a.dom.panel.summary.position === "sticky";
        }
        return a.dom.panel.cards.every((c) => c.rect.bottom <= body.rect.bottom + 1);
      }, detail: (b, a) => `scrollH=${a.dom.panel.body.scrollHeight} clientH=${a.dom.panel.body.clientHeight} scrollTop=${a.dom.panel.body.scrollTop} summaryOffset=${a.dom.panel.summary.offsetFromBodyTop.toFixed(1)}` },
  ]);
  await runStep(page, `${form}-large`, "02-scroll-head", async () => {
    await scrollCardHeadIntoView(page, "dispatch");
  }, [
    { name: "last card head reachable below the overview at scale 2", test: (b, a) => {
        const c = card(a.dom, "dispatch").rect, body = a.dom.panel.body.rect;
        const bandTop = a.dom.panel.summary ? a.dom.panel.summary.rect.bottom : body.top;
        return c.top >= bandTop - 1 && c.top <= body.bottom + 1;
      }, detail: (b, a) => {
        const c = card(a.dom, "dispatch").rect, body = a.dom.panel.body.rect;
        return `cardTop=${c.top.toFixed(1)} summaryBottom=${a.dom.panel.summary.rect.bottom.toFixed(1)} bodyBottom=${body.bottom.toFixed(1)}`;
      } },
    { name: "no type shrunk by scrolling at scale 2 (fonts unchanged)", test: (b, a) => JSON.stringify(card(a.dom, "dispatch").fonts) === JSON.stringify(card(b.dom, "dispatch").fonts) },
  ]);
  await runStep(page, `${form}-large`, "03-buy", async () => {
    await clickButton(page, '.node[data-node="buffers"] .node__buy', "Buy · 8 Data");
    await page.waitForTimeout(250);
  }, [
    { name: "purchase works at scale 2 (buffers=1, data=2)", test: (b, a) => a.sim.research.buffers === 1 && a.sim.data === 2 },
    { name: "focus pinned to the bought node at scale 2", test: (b, a) => a.dom.panel.focus.id === "buffers" && a.dom.panel.focus.title === "Just bought — live in the yard" },
  ]);
  await context.close();
}

// ============================ fresh yard: the existing entry gate ============================
async function freshLoop(browser, form) {
  const { context, page, phone } = await newPage(browser, `${form}-fresh`, null);
  await runStep(page, `${form}-fresh`, "00-entry-gate", async () => {}, [
    { name: "fresh yard has no Data and no research", test: (b, a) => a.sim.data === 0 && Object.keys(a.sim.research || {}).length === 0 },
    { name: "existing spec 5.5 gate: destination not offered yet", test: (b, a) => phone ? a.dom.dockResearch === false : (a.dom.railResearch?.disabled === true && a.dom.railResearch?.reason === "Needs data") },
    { name: "no research panel mounted", test: (b, a) => a.dom.panel === null },
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
  // The mirror audit hashes every PNG under frames/ against this run's shot
  // metadata, so stale frames from an earlier run (e.g. renamed steps) would
  // read as hash mismatches. Start each run from a clean frames dir so the
  // evidence is exactly one self-consistent capture at the head SHA.
  if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  console.log("BASE_URL=", BASE_URL, "BUILD_SHA=", BUILD_SHA, "chrome=", executablePath, "EVID=", EVID);
  const browser = await chromium.launch({ executablePath, headless: true });
  const forms = [
    { key: "phone", dims: { w: 780, h: 1688 } },
    { key: "desktop", dims: { w: 1920, h: 1080 } },
  ];
  for (const f of forms) {
    for (const [name, loop] of [
      ["partial", partialLoop],
      ["nodata", noDataLoop],
      ["completed", completedLoop],
      ["large", largeLoop],
      ["fresh", freshLoop],
    ]) {
      try { await loop(browser, f.key); }
      catch (e) { blockers.push(`${f.key}-${name} FATAL: ${String((e && e.stack) || e)}`); console.error(e); }
    }
  }
  await browser.close();

  const expectedDims = {};
  for (const f of forms) {
    for (const suffix of ["partial", "nodata", "completed", "large", "fresh"]) {
      expectedDims[`${f.key}-${suffix}`] = f.dims;
    }
  }
  const audit = auditFrames(expectedDims);
  const auditOk = audit.every((a) => a.ok);
  const byForm = {};
  for (const a of audit) { const k = a.frame.split("/")[0]; (byForm[k] ||= []).push(a.sha256); }
  const distinct = Object.fromEntries(Object.entries(byForm).map(([k, v]) => [k, new Set(v).size > 1]));

  const allChecks = steps.flatMap((s) => s.checks.map((c) => ({ form: s.form, step: s.step, ...c })));
  const failedChecks = allChecks.filter((c) => !c.ok);
  const results = {
    issue: 58, role: "developer", buildSha: BUILD_SHA, baseUrl: BASE_URL,
    branch: "rw/58-research",
    generatedAt: new Date().toISOString(),
    chrome: executablePath,
    method: "headless Chrome DOM + geometry + persisted-state mirror only; no vision. Screenshots are hashed mirrors, not inspected visually.",
    fixtureScrutiny: {
      a: "Only setup seeding mutates state: fixtures derived from docs/evidence/yard-mature.json before encoding (research ranks, Data balance, Signal lab removed for deterministic balances, storeUnits recomputed as the store sum). No src changes; every action is a real UI click/tap/scroll through dispatch -> applyCommand.",
      b: "Documented in this probe header, the FIXTURES table and results.json.",
      c: "Seeded envelopes pass the game's full decodeSave/repairRegistration/validateSim; the 00-open steps assert the loaded mirror matches the seed. No invariant weakened or bypassed.",
      d: "No action faked by injection; localStorage read only as the game's own persistence mirror (written on every ok dispatch).",
    },
    fixtures: Object.fromEntries(Object.entries(FIXTURES).map(([k, v]) => [k, {
      research: v.sim.research, data: v.sim.store.data, storeUnits: v.sim.storeUnits,
      machines: v.sim.machines.length, routes: v.sim.routes.length, textScale: v.settings.textScale,
    }])),
    counts: { frames: audit.length, steps: steps.length, checks: allChecks.length, failedChecks: failedChecks.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, blockers: blockers.length },
    frameAudit: { ok: auditOk, distinctFramesPerForm: distinct, frames: audit },
    findings: [
      {
        id: "entry-gate-spec-5-5",
        verdict: "existing-design-not-changed-by-58",
        detail: "App.tsx showResearch() offers the Research destination only once Data exists or a node is known (spec 5.5). A fresh yard therefore shows a disabled rail slot with the reason 'Needs data' (desktop) or no dock Research button (phone). The panel's no-data state is demonstrated the reachable way: one node owned, balance spent to 0. #58 does not alter this gate (App.tsx is outside its ownership).",
        source: "src/ui/App.tsx showResearch; src/ui/shell/Shell.tsx ShellRail reason; src/ui/Hud.tsx DockButtons",
      },
      {
        id: "signal-lab-removed-for-determinism",
        verdict: "fixture-derivation-not-gameplay",
        detail: "The mature yard's Signal lab produces 2 Data every 15s, which would drift the no-data/partial balances mid-observation. The probe removes that one machine and its two routes from the derived fixtures (references pruned exactly like the game's repairRegistration) so balances stay fixed. The completed fixture keeps the full mature yard verbatim.",
        source: "src/game/content/defs.ts BLUEPRINTS.signalLab + RECIPES R11; src/game/persistence/save.ts repairRegistration",
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