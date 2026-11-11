/**
 * UI-RESET-51 (issue #51): headless DOM/geometry evidence for the rebuilt HUD.
 *
 * Tool: playwright-core + installed Chrome/Edge, headless. No visual inspection:
 * every claim below is a DOM text, ARIA, computed-style or bounding-rect probe.
 *
 * Run from the worktree root:
 *   node work/evidence/UI-RESET-51/hud-probe-51.mjs
 * Env:
 *   RUSTWAKE_URL  preview origin (default http://localhost:4190/)
 *   RUSTWAKE_SHA  immutable head SHA stamped into the receipt
 *   CHROME_PATH   optional browser executable override
 *
 * Contexts:
 *   A fresh-phone390   390x844  no save: chips/icons, all-resources drawer,
 *                               objective modes, layout stability across ticks
 *   B fresh-desk1280  1280x800  no save: rail band, cluster, entry-chunk budget
 *   C full-phone390    390x844  seeded full store: alert -> Open store -> sell
 *                               recovery until the alert clears
 *   D power-desk1280  1280x800  seeded power pressure: power cue chip + canvas
 *                               tap selects the sorter; panel Status must equal
 *                               the authoritative persisted sim status
 *   E full-desk1280   1280x800  seeded full store in rail mode: alert geometry
 *                               stays clear of rail, dock and objective
 *
 * Seeds mutate docs/evidence/yard-mature.json, recompute the save checksum
 * (FNV-1a, src/game/persistence/save.ts) and set lastSeenMs = Date.now() so no
 * catch-up window runs and the yard is deterministic. Scratch seeds are kept
 * in memory only; the receipt records their shape.
 */
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4190/";
const headSha = process.env.RUSTWAKE_SHA ?? "pending-stamp";
const exe = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => existsSync(p));
if (!exe) {
  console.error("hud-probe-51: no Chrome/Edge executable found");
  process.exit(1);
}

/* ------------------------------------------------------------------ seeds */

function checksum(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function encode(sim, lastSeenMs, settings) {
  const payload = { sim, lastSeenMs, settings };
  return JSON.stringify({
    schemaVersion: 1,
    checksum: checksum(JSON.stringify(payload)),
    payload,
  });
}

const mature = JSON.parse(
  readFileSync(path.resolve(here, "../../../docs/evidence/yard-mature.json"), "utf8")
);

/** Static full store: no machines/routes/drones, so nothing drains or refills. */
function fullStoreSeed() {
  const env = JSON.parse(JSON.stringify(mature));
  const sim = env.payload.sim;
  sim.machines = [];
  sim.routes = [];
  sim.spares = [];
  sim.drone.repaired = false;
  sim.drone.inFlight = null;
  sim.store = { plates: 880, scrap: 20 };
  sim.storeUnits = 900;
  sim.storeCapacity = 900;
  sim.overflow = [{ resource: "scrap", qty: 40 }];
  sim.exportClaimed = true;
  sim.tutorial = 9;
  return { raw: encode(sim, Date.now(), env.payload.settings), sim };
}

/** Eight machines mid-batch at 10 power each: requested 80 vs capacity 8. */
function powerSeed() {
  const env = JSON.parse(JSON.stringify(mature));
  const sim = env.payload.sim;
  for (const m of sim.machines) {
    m.batchPower = 10;
    m.progress = 1;
    m.progressRem = 0;
    m.status = "running";
  }
  return { raw: encode(sim, Date.now(), env.payload.settings), sim };
}

/* ------------------------------------------------------- page-side probes */

const PAGE_PROBES = {
  chips: () =>
    [...document.querySelectorAll(".resources__item")].map((el) => ({
      text: el.textContent.replace(/\s+/g, " ").trim(),
      svg: el.querySelectorAll("svg").length,
      strong: el.querySelectorAll("strong").length,
      pressure: el.getAttribute("data-pressure"),
      cue: el.getAttribute("data-cue"),
    })),
  rects: (selectors) => {
    const out = {};
    for (const sel of selectors) {
      out[sel] = [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 100) / 100);
      });
    }
    return out;
  },
  buttons: () =>
    [...document.querySelectorAll(".hud button")].map((b) => ({
      label: (b.getAttribute("aria-label") ?? b.textContent).trim(),
      minHeight: parseFloat(getComputedStyle(b).minHeight) || 0,
      height: Math.round(b.getBoundingClientRect().height * 100) / 100,
      visible: b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height > 0,
    })),
  keyScan: () => {
    const prefixes = ["btn","row","value","card","step","hint","unit","res","status","reject","import","report","note","field","title","aria","gate","sound","glyph","advice","evidence","yard","tut","objective","bottleneck","reader","chip","hud","phase"];
    const pattern = new RegExp(`\\b(${prefixes.join("|")})\\.[a-z]`);
    const hud = document.querySelector(".hud");
    if (!hud) return { scanned: false, leaks: [] };
    const leaks = [];
    const walker = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let count = 0;
    while (node) {
      count += 1;
      const text = node.textContent.trim();
      if (text && pattern.test(text)) leaks.push(text.slice(0, 80));
      node = walker.nextNode();
    }
    return { scanned: true, textNodes: count, leaks };
  },
  objective: () => {
    const card = document.querySelector(".objective");
    if (!card) return null;
    const lines = [...card.children].filter((el) => el.textContent.trim().length > 0);
    const sizes = [...new Set(lines.map((el) => getComputedStyle(el).fontSize))];
    const nums = sizes.map((s) => parseFloat(s)).sort((a, b) => a - b);
    const controls = [...card.querySelectorAll("button.objective__btn")].map((b) => ({
      label: b.getAttribute("aria-label"),
      text: b.textContent.trim(),
      svg: b.querySelectorAll("svg").length,
      minHeight: parseFloat(getComputedStyle(b).minHeight) || 0,
    }));
    return {
      className: card.className,
      lineCount: lines.length,
      fontSizes: sizes,
      ratio: nums.length === 2 ? nums[1] / nums[0] : null,
      controls,
    };
  },
  allResources: () => {
    const drawer = document.getElementById("hud-all-resources");
    if (!drawer) return null;
    return {
      role: drawer.getAttribute("role"),
      label: drawer.getAttribute("aria-label"),
      rows: [...drawer.querySelectorAll(".hud-all__row")].map((row) => ({
        svg: row.querySelectorAll("svg").length,
        label: row.querySelector(".hud-all__label")?.textContent ?? "",
        value: row.querySelector(".hud-all__value")?.textContent ?? "",
      })),
    };
  },
  alert: () => {
    const el = document.querySelector(".hud-alert");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      // The message span only: the whole element's textContent also carries the
      // action button's face ("Open store"), which is asserted separately.
      text: (el.querySelector(".hud-alert__text")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      tier: el.getAttribute("data-tier"),
      role: el.getAttribute("role"),
      svg: el.querySelectorAll("svg").length,
      action: el.querySelector(".hud-alert__action")?.textContent.trim() ?? null,
      rect: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 100) / 100),
    };
  },
  simTick: () => {
    try {
      const raw = localStorage.getItem("rustwake.save.v1");
      if (!raw) return null;
      return JSON.parse(raw).payload.sim.tick;
    } catch {
      return null;
    }
  },
  simMachine: (index) => {
    try {
      const raw = localStorage.getItem("rustwake.save.v1");
      if (!raw) return null;
      const m = JSON.parse(raw).payload.sim.machines[index];
      return m ? { id: m.id, blueprint: m.blueprint, status: m.status, tile: m.tile } : null;
    } catch {
      return null;
    }
  },
  /** Reproduce App.fitToShell + scene.fitCamera to tap a machine tile. */
  machineScreenPoint: (tile) => {
    const CELL = 32, WORLD_W = 192, WORLD_H = 224;
    const canvas = document.querySelector(".game > canvas") ?? document.querySelector("canvas");
    const lead = document.querySelector(".hud__lead") ?? document.querySelector(".hud__top");
    const dock = document.querySelector(".dock");
    if (!canvas || !lead || !dock) return null;
    const cr = canvas.getBoundingClientRect();
    const cssW = cr.width, cssH = cr.height;
    const rail = document.querySelector(".shell-rail");
    const railBox = rail ? rail.getBoundingClientRect() : null;
    const railActive = railBox !== null && railBox.width > 0;
    const insets = {
      top: lead.getBoundingClientRect().bottom + 6,
      bottom: Math.max(0, cssH - dock.getBoundingClientRect().top) + 6,
      left: railActive ? railBox.right + 6 : 0,
      right: railActive ? 334 : 0,
    };
    const regionWidth = Math.max(1, cssW - insets.left - insets.right);
    const raw = Math.min(4, regionWidth / (WORLD_W + 8));
    const usableH = cssH - insets.top - insets.bottom;
    let cam;
    if (usableH <= 0) {
      cam = { x: WORLD_W / 2, y: WORLD_H / 2, scale: Math.max(1.4, raw) };
    } else {
      const bandScale = usableH / (WORLD_H + 12);
      const scale = bandScale >= raw ? Math.max(1.4, raw) : Math.max(1.1, Math.min(raw, bandScale));
      const bandCentre = insets.top + usableH / 2;
      cam = { x: WORLD_W / 2, y: WORLD_H / 2 + (cssH / 2 - bandCentre) / scale, scale };
    }
    if (insets.left > 0 || insets.right > 0) {
      cam.x += (cssW / 2 - (insets.left + regionWidth / 2)) / cam.scale;
    }
    const wx = (tile % 6) * CELL + CELL / 2;
    const wy = Math.floor(tile / 6) * CELL + CELL / 2;
    return {
      x: (wx - cam.x) * cam.scale + cssW / 2 + cr.left,
      y: (wy - cam.y) * cam.scale + cssH / 2 + cr.top,
      scale: cam.scale,
      insets,
    };
  },
  machinePanel: () => {
    const panel = document.querySelector('.panel--stack[role="group"][aria-label$=" details"]');
    if (!panel) return null;
    const rows = [...panel.querySelectorAll(".panel__row")].map((row) => ({
      dt: row.querySelector("dt")?.textContent.trim() ?? "",
      dd: row.querySelector("dd")?.textContent.trim() ?? "",
    }));
    return {
      label: panel.getAttribute("aria-label"),
      title: panel.querySelector(".panel__title")?.textContent.trim() ?? "",
      status: rows.find((r) => r.dt === "Status")?.dd ?? null,
      hasNaN: /NaN|undefined|Infinity/.test(panel.textContent),
    };
  },
  storePanel: () => {
    const panel = document.querySelector('[aria-label="Store contents"]');
    if (!panel) return null;
    return {
      title: panel.querySelector(".panel__title")?.textContent.trim() ?? "",
      sellButtons: [...panel.querySelectorAll("button")]
        .map((b) => b.textContent.trim())
        .filter((t) => t.startsWith("Sell")),
      locked: panel.textContent.includes("Opens after the first steel contract"),
    };
  },
  chunks: () =>
    performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes("/assets/"))
      .map((e) => ({
        name: e.name.split("/").pop(),
        decodedBodySize: e.decodedBodySize,
        transferSize: e.transferSize,
      })),
  shell: () => {
    const rail = document.querySelector(".shell-rail");
    const menuFace = document.querySelector(".shell-menu-face");
    return {
      rail: rail ? { slots: [...rail.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot")), width: rail.getBoundingClientRect().width } : null,
      menuFace: menuFace ? menuFace.getBoundingClientRect().width > 0 : false,
    };
  },
};

/* ------------------------------------------------------------- harness */

const failures = [];
const contexts = [];

function check(ctx, name, pass, detail) {
  ctx.checks.push({ name, pass: !!pass, detail });
  if (!pass) failures.push(`${ctx.name}: ${name} — ${JSON.stringify(detail)}`);
}

async function makeContext(name, viewport, seed) {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
  });
  if (seed) {
    await context.addInitScript((raw) => {
      localStorage.setItem("rustwake.save.v1", raw);
    }, seed.raw);
  }
  const page = await context.newPage();
  const errors = { console: [], page: [], responses: [], requests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.console.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => errors.page.push(String(err).slice(0, 200)));
  page.on("response", (res) => {
    if (res.status() >= 400) errors.responses.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => errors.requests.push(`${req.url()} ${req.failure()?.errorText}`));
  const ctx = { name, viewport, seed: seed ? seed.describe : null, checks: [], screenshots: [], errors };
  contexts.push(ctx);
  return { browser, context, page, ctx, errors };
}

async function enterYard(page, ctx) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("text=Begin recovery", { timeout: 15000 });
  await page.click("text=Begin recovery");
  await page.waitForSelector(".resources", { timeout: 15000 });
  await page.waitForTimeout(400);
  ctx.simTickStart = await page.evaluate(PAGE_PROBES.simTick);
}

async function shot(page, ctx, name) {
  const file = `${ctx.name}-${name}.png`;
  await page.screenshot({ path: path.join(here, file) });
  ctx.screenshots.push(file);
}

async function finish(browser, ctx) {
  ctx.simTickEnd = await ctx.page.evaluate(PAGE_PROBES.simTick).catch(() => null);
  const zeroErrors =
    ctx.errors.console.length === 0 &&
    ctx.errors.page.length === 0 &&
    ctx.errors.responses.length === 0 &&
    ctx.errors.requests.length === 0;
  check(ctx, "zero console/page/network errors", zeroErrors, ctx.errors);
  check(ctx, "sim ticks advanced during probe", ctx.simTickEnd > ctx.simTickStart, {
    start: ctx.simTickStart,
    end: ctx.simTickEnd,
  });
  await browser.close();
}

const STABILITY_SELECTORS = [".hud__top", ".resources", ".resources__item", ".objective", ".dock", ".hud-alert"];

async function stability(page, ctx, label, waitMs) {
  const before = await page.evaluate(PAGE_PROBES.rects, STABILITY_SELECTORS);
  const tickBefore = await page.evaluate(PAGE_PROBES.simTick);
  await page.waitForTimeout(waitMs);
  const after = await page.evaluate(PAGE_PROBES.rects, STABILITY_SELECTORS);
  const tickAfter = await page.evaluate(PAGE_PROBES.simTick);
  check(ctx, `${label}: layout stable across ticks`, JSON.stringify(before) === JSON.stringify(after), {
    tickBefore,
    tickAfter,
    before,
    after,
  });
}

async function commonChecks(page, ctx) {
  const buttons = await page.evaluate(PAGE_PROBES.buttons);
  const small = buttons.filter((b) => b.visible && b.minHeight < 44);
  check(ctx, "all visible .hud buttons min-height >= 44px", small.length === 0, { count: buttons.length, small });
  const scan = await page.evaluate(PAGE_PROBES.keyScan);
  check(ctx, "no untranslated i18n keys painted in HUD", scan.scanned && scan.leaks.length === 0, scan);
}

function findChip(chips, cueOrText) {
  return chips.find((c) => (cueOrText.startsWith("data:") ? c.cue === cueOrText.slice(5) : c.text.startsWith(cueOrText)));
}

/* ------------------------------------------------------------- contexts */

async function freshPhone() {
  const { browser, page, ctx } = await makeContext("A-fresh-phone390", { width: 390, height: 844 }, null);
  ctx.page = page;
  await enterYard(page, ctx);
  await shot(page, ctx, "yard");

  const chips = await page.evaluate(PAGE_PROBES.chips);
  check(ctx, "fresh chips pinned: Scrap0 / Credits0 / Store 0/900",
    chips.map((c) => c.text).join("|") === "Scrap0|Credits0|Store 0/900", chips);
  check(ctx, "every chip has icon svg + value strong", chips.every((c) => c.svg >= 1 && c.strong >= 1), chips);
  const storeChip = findChip(chips, "Store");
  check(ctx, "store chip pressure ok at 0/900", storeChip?.pressure === "ok", storeChip);
  check(ctx, "no power/production cues on healthy fresh yard", chips.every((c) => c.cue === null), chips);
  check(ctx, "no storage alert on fresh yard", (await page.evaluate(PAGE_PROBES.alert)) === null, null);

  const cluster = await page.evaluate(() =>
    [...document.querySelectorAll(".cluster button")].map((b) => ({
      label: b.getAttribute("aria-label"),
      expanded: b.getAttribute("aria-expanded"),
      controls: b.getAttribute("aria-controls"),
    }))
  );
  check(ctx, "cluster keeps Home last, adds All resources toggle",
    cluster.length === 4 && cluster[3].label === "Return to yard view" && cluster[2].label === "All resources", cluster);

  await page.click('button[aria-label="All resources"]');
  await page.waitForSelector("#hud-all-resources", { timeout: 5000 });
  const drawer = await page.evaluate(PAGE_PROBES.allResources);
  const toggle = await page.evaluate(() => document.querySelector('button[aria-label="All resources"]').getAttribute("aria-expanded"));
  check(ctx, "all-resources drawer: 15 rows, glyph+label+value, aria wired",
    toggle === "true" && drawer?.role === "group" && drawer?.label === "All resources" &&
    drawer?.rows.length === 15 && drawer.rows.every((r) => r.svg >= 1 && r.label.length > 0 && r.value.length > 0),
    { toggle, drawer });
  await shot(page, ctx, "all-resources");
  await page.click('button[aria-label="All resources"]');
  await page.waitForSelector("#hud-all-resources", { state: "detached", timeout: 5000 });
  check(ctx, "all-resources drawer closes", (await page.evaluate(PAGE_PROBES.allResources)) === null, null);

  const full = await page.evaluate(PAGE_PROBES.objective);
  check(ctx, "objective full: <=3 text lines, 2 font sizes ratio >= 1.25",
    full && full.lineCount <= 3 && full.fontSizes.length === 2 && full.ratio >= 1.25, full);
  check(ctx, "objective controls svg-only, >= 44px",
    full.controls.length === 2 && full.controls.every((c) => c.text === "" && c.svg >= 1 && c.minHeight >= 44), full.controls);
  await page.click('button[aria-label="Collapse objective"]');
  const concise = await page.evaluate(PAGE_PROBES.objective);
  check(ctx, "objective collapses to concise", concise?.className.includes("objective--concise") && concise.lineCount === 1, concise);
  await page.click('button[aria-label="Expand objective"]');
  const expanded = await page.evaluate(PAGE_PROBES.objective);
  check(ctx, "objective expands back to full", expanded?.className === "objective" && expanded.lineCount === full.lineCount, expanded);
  await page.click('button[aria-label="Dismiss objective"]');
  const dismissed = await page.evaluate(PAGE_PROBES.objective);
  check(ctx, "objective dismisses to restore-only control",
    dismissed?.className.includes("objective--dismissed") && dismissed.lineCount === 0 &&
    dismissed.controls.length === 1 && dismissed.controls[0].label === "Show objective", dismissed);
  await shot(page, ctx, "objective-dismissed");
  await page.click('button[aria-label="Show objective"]');
  const restored = await page.evaluate(PAGE_PROBES.objective);
  check(ctx, "objective restores", restored?.className === "objective" && restored.lineCount === full.lineCount, restored);

  const shell = await page.evaluate(PAGE_PROBES.shell);
  check(ctx, "phone shell: menu face present, no rail", shell.menuFace === true && shell.rail === null, shell);

  await commonChecks(page, ctx);
  await stability(page, ctx, "fresh phone", 2000);
  await finish(browser, ctx);
}

async function freshDesk() {
  const { browser, page, ctx } = await makeContext("B-fresh-desk1280", { width: 1280, height: 800 }, null);
  ctx.page = page;
  await enterYard(page, ctx);
  await shot(page, ctx, "yard");

  const chips = await page.evaluate(PAGE_PROBES.chips);
  check(ctx, "fresh desktop chips pinned", chips.map((c) => c.text).join("|") === "Scrap0|Credits0|Store 0/900", chips);
  check(ctx, "every chip has icon svg + value strong", chips.every((c) => c.svg >= 1 && c.strong >= 1), chips);
  check(ctx, "no alert/cues on healthy desktop yard",
    (await page.evaluate(PAGE_PROBES.alert)) === null && chips.every((c) => c.cue === null), chips);

  const shell = await page.evaluate(PAGE_PROBES.shell);
  check(ctx, "desktop rail: 5 destination slots painted",
    shell.rail !== null && shell.rail.width > 0 && shell.rail.slots.join(",") === "yard,build,store,research,menu", shell);

  await page.click('button[aria-label="All resources"]');
  await page.waitForSelector("#hud-all-resources", { timeout: 5000 });
  const drawer = await page.evaluate(PAGE_PROBES.allResources);
  check(ctx, "all-resources drawer works in rail mode", drawer?.rows.length === 15, drawer?.rows.length);
  await page.click('button[aria-label="All resources"]');
  await page.waitForSelector("#hud-all-resources", { state: "detached", timeout: 5000 });

  const chunks = await page.evaluate(PAGE_PROBES.chunks);
  const entry = chunks.find((c) => /^index-.*\.js$/.test(c.name));
  check(ctx, "entry chunk < 233000 B ceiling", entry && entry.decodedBodySize > 0 && entry.decodedBodySize < 233000, { entry, chunks });

  await commonChecks(page, ctx);
  await stability(page, ctx, "fresh desktop", 2000);
  await finish(browser, ctx);
}

async function fullPhone() {
  const seed = fullStoreSeed();
  seed.describe = { storeUnits: 900, storeCapacity: 900, overflow: 40, machines: 0, exportClaimed: true, lastSeenMs: "now (no catch-up)" };
  const { browser, page, ctx } = await makeContext("C-full-phone390", { width: 390, height: 844 }, seed);
  ctx.page = page;
  await enterYard(page, ctx);

  await page.waitForSelector(".hud-alert", { timeout: 8000 });
  const alert = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, "full alert: role=status, exact recovery copy",
    alert?.role === "status" && alert.text === "Store full · 900/900 · 40 held outside · sell to free space" &&
    alert.tier === "full" && alert.svg >= 1 && alert.action === "Open store", alert);
  const chips = await page.evaluate(PAGE_PROBES.chips);
  const storeChip = findChip(chips, "Store");
  check(ctx, "store chip reads 900/900 at full pressure with warn glyph",
    storeChip?.text === "Store 900/900" && storeChip.pressure === "full" && storeChip.svg >= 2, storeChip);
  await shot(page, ctx, "alert");
  await stability(page, ctx, "full store phone", 1500);

  await page.click(".hud-alert__action");
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  const panel = await page.evaluate(PAGE_PROBES.storePanel);
  // The seeded store holds plates AND scrap, so the panel offers one sell face per
  // resource; the plates face is the recovery the alert names.
  check(ctx, "alert action opens Yard store with sell recovery",
    panel?.title === "Yard store" && panel.sellButtons.includes("Sell 60 · +900") && !panel.locked, panel);
  await shot(page, ctx, "store-panel");

  const creditsBefore = findChip(await page.evaluate(PAGE_PROBES.chips), "Credits")?.text;
  let sells = 0;
  for (let i = 0; i < 5; i += 1) {
    const current = await page.evaluate(PAGE_PROBES.storePanel);
    const sell = current?.sellButtons[0];
    if (!sell) break;
    await page.click(`[aria-label="Store contents"] button:has-text("Sell")`);
    sells += 1;
    await page.waitForTimeout(450);
    if ((await page.evaluate(PAGE_PROBES.alert)) === null) break;
  }
  const afterAlert = await page.evaluate(PAGE_PROBES.alert);
  const afterChips = await page.evaluate(PAGE_PROBES.chips);
  const afterStore = findChip(afterChips, "Store");
  check(ctx, "selling frees space: alert clears, pressure returns to ok",
    sells >= 3 && afterAlert === null && afterStore?.pressure === "ok", { sells, afterAlert, afterStore });
  check(ctx, "credits ledger consistent with sales",
    findChip(afterChips, "Credits")?.text === "Credits2782" && creditsBefore === "Credits82",
    { creditsBefore, after: findChip(afterChips, "Credits")?.text, sells });
  await shot(page, ctx, "recovered");
  await commonChecks(page, ctx);
  await finish(browser, ctx);
}

async function powerDesk() {
  const seed = powerSeed();
  seed.describe = { machines: seed.sim.machines.length, batchPowerEach: 10, requested: 80, capacity: 8, lastSeenMs: "now (no catch-up)" };
  const { browser, page, ctx } = await makeContext("D-power-desk1280", { width: 1280, height: 800 }, seed);
  ctx.page = page;
  await enterYard(page, ctx);

  await page.waitForSelector('.resources__item[data-cue="power"]', { timeout: 8000 });
  const chips = await page.evaluate(PAGE_PROBES.chips);
  const power = findChip(chips, "data:power");
  check(ctx, "power cue: meaningful text + non-color warn glyph",
    power?.text === "Power 10 % · 8 limited" && power.svg >= 2, power);
  check(ctx, "no production cue when all machines power-limited", findChip(chips, "data:production") === undefined, chips);
  check(ctx, "no storage alert at 312/900", (await page.evaluate(PAGE_PROBES.alert)) === null, null);
  await shot(page, ctx, "power-cue");
  await stability(page, ctx, "power cue desktop", 1200);

  // Tap the sorter (tile 0) through the real canvas pointer path.
  const point = await page.evaluate(PAGE_PROBES.machineScreenPoint, 0);
  check(ctx, "camera fit reproduced for canvas tap", point !== null && Number.isFinite(point.x) && Number.isFinite(point.y), point);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('.panel--stack[role="group"][aria-label$=" details"]', { timeout: 5000 });
  const panel = await page.evaluate(PAGE_PROBES.machinePanel);
  const authoritative = await page.evaluate(PAGE_PROBES.simMachine, 0);
  const STATUS_LABEL = { idle: "Ready", running: "Working", starved: "Needs input", outputFull: "Cargo full", powerLimited: "Power limited", paused: "Paused" };
  check(ctx, "selected-machine panel Status matches authoritative sim",
    panel !== null && authoritative !== null && panel.status === STATUS_LABEL[authoritative.status] &&
    authoritative.status === "powerLimited" && !panel.hasNaN, { panel, authoritative });
  await shot(page, ctx, "machine-panel");
  await page.click('.panel--stack[role="group"][aria-label$=" details"] button:has-text("Close")');
  await page.waitForSelector('.panel--stack[role="group"][aria-label$=" details"]', { state: "detached", timeout: 5000 });

  await commonChecks(page, ctx);
  await finish(browser, ctx);
}

async function fullDesk() {
  const seed = fullStoreSeed();
  seed.describe = { storeUnits: 900, storeCapacity: 900, overflow: 40, machines: 0, exportClaimed: true, lastSeenMs: "now (no catch-up)" };
  const { browser, page, ctx } = await makeContext("E-full-desk1280", { width: 1280, height: 800 }, seed);
  ctx.page = page;
  await enterYard(page, ctx);

  await page.waitForSelector(".hud-alert", { timeout: 8000 });
  const geo = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    return { alert: box(".hud-alert"), rail: box(".shell-rail"), dock: box(".dock"), objective: box(".objective"), viewport: { w: innerWidth, h: innerHeight } };
  });
  const a = geo.alert;
  const clearOfRail = a && geo.rail && a.left >= geo.rail.right;
  const clearOfDock = a && geo.dock && a.bottom <= geo.dock.top;
  const clearOfObjective = a && geo.objective && a.top >= geo.objective.bottom;
  const insideReserved = a && a.right <= geo.viewport.w - 334 + 1;
  check(ctx, "rail-mode alert sits in reserved band, clear of rail/dock/objective",
    clearOfRail && clearOfDock && clearOfObjective && insideReserved, geo);
  const alert = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, "rail-mode alert keeps full recovery copy",
    alert?.text === "Store full · 900/900 · 40 held outside · sell to free space" && alert.role === "status", alert);
  await shot(page, ctx, "rail-alert");
  await stability(page, ctx, "full store desktop", 1500);
  await commonChecks(page, ctx);
  await finish(browser, ctx);
}

/* ------------------------------------------------------------------ main */

const browser0 = await chromium.launch({ executablePath: exe, headless: true });
await browser0.close();

await freshPhone();
await freshDesk();
await fullPhone();
await powerDesk();
await fullDesk();

const totalChecks = contexts.reduce((n, c) => n + c.checks.length, 0);
const receipt = {
  task: "UI-RESET-51",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/51",
  headSha,
  url,
  measuredAt: new Date().toISOString(),
  tool: "playwright-core headless Chromium; DOM/ARIA/computed-style/geometry probes only (no visual inspection)",
  seedSource: "docs/evidence/yard-mature.json (mutated in memory; FNV-1a checksum recomputed; lastSeenMs=Date.now() skips catch-up)",
  contexts,
  summary: {
    pass: failures.length === 0,
    contexts: contexts.length,
    checks: totalChecks,
    failed: failures.length,
  },
  failures,
};
writeFileSync(path.join(here, "hud-probe-51-receipt.json"), JSON.stringify(receipt, null, 2));
console.log(`hud-probe-51: ${totalChecks} checks across ${contexts.length} contexts; ${failures.length} failures`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
