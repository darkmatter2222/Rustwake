/**
 * UI-RESET-56 (issue #56): headless DOM/geometry evidence for the rebuilt yard store.
 *
 * Tool: playwright-core + installed Chrome/Edge, headless. No visual inspection:
 * every claim below is a DOM text, ARIA, computed-style or bounding-rect probe.
 * Every captured PNG carries a frame audit: the receipt lists the named checks
 * that must have passed before the frame was taken, and the run fails if any
 * frame lacks its proof.
 *
 * Run from the worktree root (preview server must already be serving dist/):
 *   node work/evidence/UI-RESET-56/store-probe-56.mjs
 * Env:
 *   RUSTWAKE_URL  preview origin (default http://localhost:4240/)
 *   RUSTWAKE_SHA  immutable head SHA stamped into the receipt
 *   CHROME_PATH   optional browser executable override
 *
 * Contexts:
 *   A fresh-phone390   390x844  no save: boot markers, dock Store -> locked
 *                               pre-contract store, zero-stock rows reachable
 *   B fresh-desk1280  1280x800  no save: rail boot markers, rail store slot ->
 *                               locked store, entry-chunk budget + wave-2
 *                               camera/shell byte markers, close/reopen
 *   C full-phone390    390x844  seeded static full store: HUD alert -> Open
 *                               store -> grouped surfaces, qty selection with
 *                               exact proceeds, invalid quantities blocked,
 *                               REAL sell (credits/stock/revision/tick), rapid
 *                               taps to the reserve floor, zero-sellable note
 *   D full-desk1280   1280x800  same seed in rail mode: alert geometry, REAL
 *                               default-tranche sell, rapid taps, close and
 *                               reopen via the rail slot with state preserved
 *
 * Fixture rules (issue #56): the seed mutates docs/evidence/yard-mature.json IN
 * MEMORY ONLY (probe code, never src), recomputes the save checksum with the
 * game's own FNV-1a (src/game/persistence/save.ts) and sets lastSeenMs=Date.now()
 * so no offline catch-up runs. The app's validateSim accepts the seed (it boots
 * and ticks). Every action under test is a real UI click through the app's own
 * dispatch path; no state is injected. The seed empties machines/routes/spares
 * and breaks the drone so stock is STATIC except for the engine's own overflow
 * drain, which the probes assert explicitly. Persistence runs on a ~1 s cadence
 * (PERSIST_MS), so localStorage reads poll before declaring a defect.
 */
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4240/";
const headSha = process.env.RUSTWAKE_SHA ?? "pending-stamp";
const exe = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => existsSync(p));
if (!exe) {
  console.error("store-probe-56: no Chrome/Edge executable found");
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

/** Static full store: no machines/routes/drones, so nothing drains or refills
 *  except the engine's own overflow drain (asserted, not assumed). */
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

/* ------------------------------------------------------- page-side probes */

const PAGE_PROBES = {
  simSave: () => {
    try {
      const raw = localStorage.getItem("rustwake.save.v1");
      if (!raw) return null;
      return JSON.parse(raw).payload.sim;
    } catch {
      return null;
    }
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
  chips: () =>
    [...document.querySelectorAll(".resources__item")].map((el) => ({
      text: el.textContent.replace(/\s+/g, " ").trim(),
      svg: el.querySelectorAll("svg").length,
      strong: el.querySelectorAll("strong").length,
      pressure: el.getAttribute("data-pressure"),
      cue: el.getAttribute("data-cue"),
    })),
  alert: () => {
    const el = document.querySelector(".hud-alert");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      text: (el.querySelector(".hud-alert__text")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      tier: el.getAttribute("data-tier"),
      role: el.getAttribute("role"),
      svg: el.querySelectorAll("svg").length,
      action: el.querySelector(".hud-alert__action")?.textContent.trim() ?? null,
      rect: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 100) / 100),
    };
  },
  shell: () => {
    const rail = document.querySelector(".shell-rail");
    const menuFace = document.querySelector(".shell-menu-face");
    return {
      rail: rail ? { slots: [...rail.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot")), width: rail.getBoundingClientRect().width } : null,
      menuFace: menuFace ? menuFace.getBoundingClientRect().width > 0 : false,
    };
  },
  zoom: () => {
    const z = document.querySelector(".shell-zoom");
    if (!z) return null;
    return {
      role: z.getAttribute("role"),
      label: z.getAttribute("aria-label"),
      faces: [...z.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
      visible: z.getBoundingClientRect().width > 0,
    };
  },
  hudMarkers: () => ({
    hud: !!document.querySelector(".hud"),
    fragments: document.querySelectorAll('[class*="hud__"]').length,
  }),
  storePanel: () => {
    const panel = document.querySelector('[aria-label="Store contents"]');
    if (!panel) return null;
    const text = panel.textContent.replace(/\s+/g, " ");
    const cards = [...panel.querySelectorAll(".store-trade")].map((c) => ({
      resource: c.getAttribute("data-resource"),
      name: c.querySelector(".store-trade__name")?.textContent.trim() ?? "",
      price: c.querySelector(".store-trade__price")?.textContent.trim() ?? "",
      facts: c.querySelector(".store-trade__facts")?.textContent.trim() ?? "",
      preview: c.querySelector(".store-trade__preview")?.textContent.trim() ?? "",
      previewValid: c.querySelector(".store-trade__preview")?.getAttribute("data-valid"),
      qty: c.querySelector(".store-trade__qty")?.value ?? null,
      sellText: c.querySelector(".store-trade__sell")?.textContent.trim() ?? "",
      sellDisabled: c.querySelector(".store-trade__sell")?.disabled ?? null,
      decDisabled: c.querySelector('button[aria-label^="Decrease"]')?.disabled ?? null,
      incDisabled: c.querySelector('button[aria-label^="Increase"]')?.disabled ?? null,
      glyph: c.querySelectorAll(".store-trade__head svg").length,
    }));
    const groups = [...panel.querySelectorAll(".store-section[class*='store-group--']")].map((g) => {
      const dl = g.querySelector("dl");
      const ds = dl ? getComputedStyle(dl) : null;
      return {
        label: g.getAttribute("aria-label"),
        title: g.querySelector(".store-section__title")?.textContent.trim() ?? "",
        dlDisplay: ds ? ds.display : null,
        dlTracks: ds ? ds.gridTemplateColumns.split(" ").length : 0,
        rows: [...g.querySelectorAll(".store-row")].map((r) => {
          const rs = getComputedStyle(r);
          const dt = r.querySelector("dt");
          return {
            resource: r.getAttribute("data-resource"),
            stock: r.getAttribute("data-stock"),
            dt: dt?.textContent.trim() ?? "",
            dd: r.querySelector("dd")?.textContent.trim() ?? "",
            share: r.querySelector(".store-row__share")?.textContent.trim() ?? "",
            cue: r.querySelector(".store-row__cue")?.textContent.trim() ?? "",
            glyph: r.querySelectorAll("dt svg").length,
            dtOpacity: dt ? getComputedStyle(dt).opacity : null,
            firstTwo: [...r.children].slice(0, 2).map((el) => el.tagName),
            rowDisplay: rs.display,
            rowAlign: rs.alignItems,
          };
        }),
      };
    });
    const diag = panel.querySelector(".store-section--diag");
    const diagRows = diag ? [...diag.querySelectorAll(".panel__row")].map((r) => ({
      dt: r.querySelector("dt")?.textContent.trim() ?? "",
      dd: r.querySelector("dd")?.textContent.trim() ?? "",
      firstTwo: [...r.children].slice(0, 2).map((el) => el.tagName),
    })) : [];
    const capRow = diagRows.find((r) => r.dt === "Capacity");
    const pair = capRow ? capRow.dd : null;
    const body = panel.querySelector(".panel__body");
    const bs = body ? getComputedStyle(body) : null;
    const scrollers = [...panel.querySelectorAll("*")]
      .filter((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowY))
      .map((el) => el.className);
    return {
      title: panel.querySelector(".panel__title")?.textContent.trim() ?? "",
      tradeSectionLabel: panel.querySelector(".store-section--trade")?.getAttribute("aria-label") ?? null,
      note: panel.querySelector(".store-note")?.textContent.trim() ?? null,
      cards,
      groups,
      diagRows,
      capacityPair: pair,
      capacityOccurrences: pair ? text.split(pair).length - 1 : -1,
      body: bs ? { overflowY: bs.overflowY, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight } : null,
      scrollers,
      hasNaN: /NaN|undefined|Infinity/.test(text),
      buttons: [...panel.querySelectorAll("button")].map((b) => ({
        label: (b.getAttribute("aria-label") ?? b.textContent).trim(),
        text: b.textContent.trim(),
        minHeight: parseFloat(getComputedStyle(b).minHeight) || 0,
        height: Math.round(b.getBoundingClientRect().height * 100) / 100,
        visible: b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height > 0,
        disabled: b.disabled,
      })),
    };
  },
  keyScan: (sel) => {
    const prefixes = ["btn","row","value","card","step","hint","unit","res","status","reject","import","report","note","field","title","aria","gate","sound","glyph","advice","evidence","yard","tut","objective","bottleneck","reader","chip","hud","phase","store"];
    const pattern = new RegExp(`\\b(${prefixes.join("|")})\\.[a-z]`);
    const root = document.querySelector(sel);
    if (!root) return { scanned: false, leaks: [] };
    const leaks = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
  oneUnits: () => {
    const t = (document.querySelector(".hud")?.textContent ?? "") + " " +
      (document.querySelector('[aria-label="Store contents"]')?.textContent ?? "");
    return /\b1 units\b/.test(t);
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
  assetScan: async () => {
    const entries = performance
      .getEntriesByType("resource")
      .filter((e) => /\/assets\/index-.*\.(js|css)$/.test(e.name));
    const out = [];
    for (const e of entries) {
      const text = await (await fetch(e.name)).text();
      out.push({
        name: e.name.split("/").pop(),
        chars: text.length,
        pinch: /pinch/i.test(text),
        zoom: /zoom/i.test(text),
        wheel: /wheel/i.test(text),
        inspectorTop: text.includes("--shell-inspector-top"),
      });
    }
    return out;
  },
  diagInView: () => {
    const d = document.querySelector('[aria-label="Store contents"] .store-section--diag');
    if (!d) return false;
    const r = d.getBoundingClientRect();
    return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
  },
  scrollTop: () => {
    const body = document.querySelector('[aria-label="Store contents"] .panel__body');
    if (body) body.scrollTop = 0;
    return body ? body.scrollTop : null;
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
  const ctx = { name, viewport, seed: seed ? seed.describe : null, checks: [], screenshots: [], frames: [], errors };
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

/** Every frame names the checks that prove its claimed state; the receipt
 *  audits them and the run fails if any frame was captured without proof. */
async function shot(page, ctx, name, claims) {
  if (!claims || claims.length === 0) {
    failures.push(`${ctx.name}: frame ${name} declared no audit claims`);
  }
  const file = `${ctx.name}-${name}.png`;
  await page.screenshot({ path: path.join(here, file) });
  ctx.screenshots.push(file);
  ctx.frames.push({ file, claims: claims ?? [] });
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

/** Poll a page probe until the Node-side predicate holds (PERSIST_MS tolerance). */
async function pollValue(page, fn, arg, pick, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let v = await page.evaluate(fn, arg);
  while (!pick(v) && Date.now() < deadline) {
    await page.waitForTimeout(100);
    v = await page.evaluate(fn, arg);
  }
  return v;
}

function findChip(chips, cueOrText) {
  return chips.find((c) => (cueOrText.startsWith("data:") ? c.cue === cueOrText.slice(5) : c.text.startsWith(cueOrText)));
}

function rowOf(panel, resource) {
  return panel.groups.flatMap((g) => g.rows).find((r) => r.resource === resource);
}

function diagOf(panel, label) {
  return panel.diagRows.find((r) => r.dt === label);
}

async function reachability(page, ctx, label) {
  const rows = page.locator('[aria-label="Store contents"] .store-row');
  const n = await rows.count();
  const vp = page.viewportSize();
  const results = [];
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded({ timeout: 3000 });
    const box = await row.boundingBox();
    const ok = !!box && box.width > 0 && box.height > 0 && box.y >= 0 && box.y + box.height <= vp.height + 1;
    results.push({
      resource: await row.getAttribute("data-resource"),
      ok,
      y: box ? Math.round(box.y) : null,
      bottom: box ? Math.round(box.y + box.height) : null,
    });
  }
  check(ctx, `${label}: all 15 inventory rows reachable by scrolling`, n === 15 && results.every((r) => r.ok), results);
}

async function commonChecks(page, ctx) {
  const p = await page.evaluate(PAGE_PROBES.storePanel);
  const small = p ? p.buttons.filter((b) => b.visible && b.minHeight < 44) : [];
  check(ctx, "panel visible buttons min-height >= 44px", p !== null && small.length === 0, { count: p?.buttons.length, small });
  const hudScan = await page.evaluate(PAGE_PROBES.keyScan, ".hud");
  const panelScan = await page.evaluate(PAGE_PROBES.keyScan, '[aria-label="Store contents"]');
  check(ctx, "no untranslated i18n keys painted", hudScan.scanned && panelScan.scanned && hudScan.leaks.length === 0 && panelScan.leaks.length === 0, { hudScan, panelScan });
  check(ctx, "never '1 units'", !(await page.evaluate(PAGE_PROBES.oneUnits)), null);
  check(ctx, "panel has no NaN/undefined/Infinity", p !== null && !p.hasNaN, p?.hasNaN);
}

async function bootChecks(page, ctx, form) {
  const shell = await page.evaluate(PAGE_PROBES.shell);
  const zoom = await page.evaluate(PAGE_PROBES.zoom);
  const hud = await page.evaluate(PAGE_PROBES.hudMarkers);
  if (form === "phone") {
    check(ctx, "phone boot: menu face present, no rail", shell.menuFace === true && shell.rail === null, shell);
  } else {
    check(ctx, "desktop boot: rail paints 5 destination slots",
      shell.rail !== null && shell.rail.width > 0 && shell.rail.slots.join(",") === "yard,build,store,research,menu" && shell.menuFace === false, shell);
  }
  check(ctx, "camera controls present (wave-2 regression)",
    zoom !== null && zoom.visible && zoom.role === "group" && zoom.label === "Camera zoom" &&
    zoom.faces.join(",") === "Zoom in,Zoom out,Reset view", zoom);
  check(ctx, "HUD markers present (wave-2 regression)", hud.hud === true && hud.fragments >= 1, hud);
}

/* ------------------------------------------- shared panel assertion sets */

const FULL_CLAIMS = (p) => [
  `${p} panel surfaces`,
  `${p} trade cards dearest first`,
  `${p} plates card exact`,
  `${p} scrap card exact`,
  `${p} grouped inventory 15 rows`,
  `${p} row grammar preserved`,
  `${p} diagnostics exact`,
  `${p} body is the one scroller`,
];

async function assertFullPanel(page, ctx, p) {
  const panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, `${p} panel surfaces`,
    panel && panel.title === "Yard store" && panel.tradeSectionLabel === "Trade desk" &&
    panel.groups.map((g) => g.label).join("|") === "Raw materials|Intermediate materials|Finished goods" &&
    panel.groups.map((g) => g.title).join("|") === "Raw materials|Intermediate materials|Finished goods" &&
    diagOf(panel, "Diagnostics") === undefined && panel.diagRows.length > 0 && !panel.hasNaN,
    panel && { title: panel.title, trade: panel.tradeSectionLabel, groups: panel.groups.map((g) => g.label), diagRows: panel.diagRows.length });
  check(ctx, `${p} trade cards dearest first`,
    panel.cards.map((c) => c.resource).join(",") === "plates,scrap", panel.cards.map((c) => c.resource));
  const c0 = panel.cards[0];
  check(ctx, `${p} plates card exact`,
    c0 && c0.name === "Plates" && c0.glyph >= 1 && c0.price === "15 credits per unit" &&
    c0.facts === "Stock 880 · Sellable 60" && c0.preview === "60 × 15 = 900 credits" &&
    c0.previewValid === "true" && c0.qty === "60" && c0.sellText === "Sell 60 · +900" && c0.sellDisabled === false, c0);
  const c1 = panel.cards[1];
  check(ctx, `${p} scrap card exact`,
    c1 && c1.name === "Scrap" && c1.glyph >= 1 && c1.price === "1 credit per unit" &&
    c1.facts === "Stock 20 · Sellable 10" && c1.preview === "10 × 1 = 10 credits" &&
    c1.previewValid === "true" && c1.qty === "10" && c1.sellText === "Sell 10 · +10" && c1.sellDisabled === false, c1);
  const [raw, mid, fin] = panel.groups;
  const allRows = panel.groups.flatMap((g) => g.rows);
  check(ctx, `${p} grouped inventory 15 rows`,
    raw.rows.map((r) => r.resource).join(",") === "scrap" &&
    fin.rows.map((r) => r.resource).join(",") === "alloy,data,chassis" &&
    mid.rows.length === 11 && mid.rows.some((r) => r.resource === "plates") &&
    allRows.length === 15 &&
    allRows.every((r) => r.glyph >= 1 && r.dt.length > 0 && r.dd.length > 0 && r.share.endsWith("% of capacity") && r.cue.includes(" · ")) &&
    rowOf(panel, "plates").stock === "880" && rowOf(panel, "plates").dd === "880" &&
    rowOf(panel, "plates").share === "98% of capacity" &&
    rowOf(panel, "plates").cue === "not made yet · not used yet" &&
    rowOf(panel, "scrap").stock === "20" && rowOf(panel, "scrap").share === "2% of capacity" &&
    rowOf(panel, "scrap").cue === "salvage + drones · not used yet",
    { raw: raw.rows.map((r) => r.resource), mid: mid.rows.length, fin: fin.rows.map((r) => r.resource), plates: rowOf(panel, "plates"), scrap: rowOf(panel, "scrap") });
  check(ctx, `${p} row grammar preserved`,
    panel.groups.every((g) => g.dlDisplay === "grid" && g.dlTracks === 1) &&
    allRows.every((r) => r.firstTwo.join(",") === "DT,DD" && r.rowDisplay === "flex" && r.rowAlign === "baseline") &&
    panel.diagRows.every((r) => r.firstTwo.join(",") === "DT,DD"),
    { dls: panel.groups.map((g) => [g.dlDisplay, g.dlTracks]), sample: allRows[0], diagSample: panel.diagRows[0] });
  check(ctx, `${p} diagnostics exact`,
    panel.capacityPair === "900/900" && panel.capacityOccurrences === 1 &&
    diagOf(panel, "Sell floor")?.dd === "10 units kept per material" &&
    diagOf(panel, "Overflow hold")?.dd === "40" &&
    diagOf(panel, "Storage cause")?.dd === "Storage is full at 100%. Sell a surplus in the yard store to free room." &&
    diagOf(panel, "Largest holds")?.dd === "Plates 880 · Scrap 20" &&
    diagOf(panel, "Recovery")?.dd === "Sell a tranche in the trade desk · 40 units held outside return as space frees" &&
    panel.diagRows.filter((r) => r.dt === "Measured").every((r) => !r.dd.includes("900/900")),
    panel.diagRows);
  check(ctx, `${p} body is the one scroller`,
    panel.body && ["auto", "scroll"].includes(panel.body.overflowY) &&
    panel.body.scrollHeight > panel.body.clientHeight &&
    panel.scrollers.length === 1 && panel.scrollers[0].includes("panel__body"),
    { body: panel.body, scrollers: panel.scrollers });
  return panel;
}

const LOCKED_CLAIMS = (p) => [
  `${p} locked note + no faces`,
  `${p} locked Sell row`,
  `${p} capacity once at 0/900`,
  `${p} zero-stock rows honest`,
  `${p} grouped inventory 15 rows`,
  `${p} row grammar preserved`,
  `${p} body is the one scroller`,
];

async function assertLockedPanel(page, ctx, p) {
  const panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, `${p} locked note + no faces`,
    panel && panel.title === "Yard store" && panel.cards.length === 0 &&
    panel.note === "Finish the first steel contract to open selling.",
    panel && { title: panel.title, cards: panel.cards.length, note: panel.note });
  check(ctx, `${p} locked Sell row`,
    diagOf(panel, "Sell")?.dd === "Opens after the first steel contract" &&
    diagOf(panel, "Sell floor") === undefined && diagOf(panel, "Overflow hold") === undefined &&
    diagOf(panel, "Storage cause") === undefined,
    panel.diagRows);
  check(ctx, `${p} capacity once at 0/900`,
    panel.capacityPair === "0/900" && panel.capacityOccurrences === 1,
    { pair: panel.capacityPair, occurrences: panel.capacityOccurrences });
  const allRows = panel.groups.flatMap((g) => g.rows);
  check(ctx, `${p} zero-stock rows honest`,
    allRows.length === 15 &&
    allRows.every((r) => r.stock === "0" && r.dd === "0" && r.dtOpacity === "0.6" && r.share === "0% of capacity") &&
    rowOf(panel, "scrap").cue === "salvage + drones · not used yet" &&
    rowOf(panel, "plates").cue === "not made yet · not used yet",
    { count: allRows.length, sample: allRows[0], plates: rowOf(panel, "plates") });
  const [raw, mid, fin] = panel.groups;
  check(ctx, `${p} grouped inventory 15 rows`,
    panel.groups.map((g) => g.label).join("|") === "Raw materials|Intermediate materials|Finished goods" &&
    raw.rows.map((r) => r.resource).join(",") === "scrap" &&
    fin.rows.map((r) => r.resource).join(",") === "alloy,data,chassis" &&
    mid.rows.length === 11 &&
    allRows.every((r) => r.glyph >= 1 && r.dt.length > 0),
    { raw: raw.rows.map((r) => r.resource), mid: mid.rows.length, fin: fin.rows.map((r) => r.resource) });
  check(ctx, `${p} row grammar preserved`,
    panel.groups.every((g) => g.dlDisplay === "grid" && g.dlTracks === 1) &&
    allRows.every((r) => r.firstTwo.join(",") === "DT,DD" && r.rowDisplay === "flex" && r.rowAlign === "baseline") &&
    panel.diagRows.every((r) => r.firstTwo.join(",") === "DT,DD"),
    { dls: panel.groups.map((g) => [g.dlDisplay, g.dlTracks]), sample: allRows[0] });
  check(ctx, `${p} body is the one scroller`,
    panel.body && ["auto", "scroll"].includes(panel.body.overflowY) &&
    panel.body.scrollHeight >= panel.body.clientHeight &&
    panel.scrollers.length === 1 && panel.scrollers[0].includes("panel__body"),
    { body: panel.body, scrollers: panel.scrollers });
  return panel;
}

/** Rapid-tap the plates sell face until the card retires at the reserve floor. */
async function rapidTapPlates(page, ctx, label, expectedTaps, expectedCredits) {
  let taps = 0;
  for (let i = 0; i < 25; i += 1) {
    const btn = page.locator('.store-trade[data-resource="plates"] .store-trade__sell');
    if ((await btn.count()) === 0) break;
    await btn.click({ timeout: 3000 });
    taps += 1;
  }
  const settled = await pollValue(page, PAGE_PROBES.simSave, undefined,
    (s) => s && s.store.plates === 10 && s.credits === expectedCredits && s.overflow.length === 0 && s.store.scrap === 60 && s.storeUnits === 70, 8000);
  check(ctx, `${label} rapid taps: ${expectedTaps} tranches, no oversell, no double-pay`,
    taps === expectedTaps && settled && settled.store.plates === 10 && settled.credits === expectedCredits &&
    settled.store.scrap === 60 && settled.storeUnits === 70 && settled.overflow.length === 0,
    { taps, plates: settled?.store?.plates, credits: settled?.credits, scrap: settled?.store?.scrap, units: settled?.storeUnits, overflow: settled?.overflow?.length });
  const panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, `${label} plates face retires at floor; scrap tranche honest`,
    panel.cards.map((c) => c.resource).join(",") === "scrap" &&
    panel.cards[0].facts === "Stock 60 · Sellable 50" &&
    panel.cards[0].preview === "50 × 1 = 50 credits" &&
    panel.cards[0].sellText === "Sell 50 · +50" &&
    rowOf(panel, "plates").stock === "10",
    { cards: panel.cards, platesRow: rowOf(panel, "plates") });
  return settled;
}

/** Sell the last scrap tranche: both faces retire, the note replaces them, alert clears. */
async function sellOutScrap(page, ctx, label) {
  await page.click('.store-trade[data-resource="scrap"] .store-trade__sell');
  const final = await pollValue(page, PAGE_PROBES.simSave, undefined,
    (s) => s && s.credits === 13182 && s.store.scrap === 10 && s.store.plates === 10, 6000);
  const panel = await page.evaluate(PAGE_PROBES.storePanel);
  const alert = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, `${label} zero-sellable honesty: note, retired faces, alert clears`,
    final && final.credits === 13182 && final.store.scrap === 10 && final.storeUnits === 20 &&
    panel.cards.length === 0 &&
    panel.note === "Nothing is sellable right now: stock sits at or below the reserve the yard keeps." &&
    alert === null && rowOf(panel, "plates").stock === "10" && rowOf(panel, "scrap").stock === "10",
    { credits: final?.credits, scrap: final?.store?.scrap, units: final?.storeUnits, cards: panel.cards.length, note: panel.note, alert });
  await page.evaluate(PAGE_PROBES.scrollTop);
  return final;
}

/* ------------------------------------------------------------- contexts */

async function freshPhone() {
  const { browser, page, ctx } = await makeContext("A-fresh-phone390", { width: 390, height: 844 }, null);
  ctx.page = page;
  await enterYard(page, ctx);

  const chips = await page.evaluate(PAGE_PROBES.chips);
  check(ctx, "fresh phone chips pinned", chips.map((c) => c.text).join("|") === "Scrap0|Credits0|Store 0/900", chips);
  await bootChecks(page, ctx, "phone");
  check(ctx, "no storage alert on fresh yard", (await page.evaluate(PAGE_PROBES.alert)) === null, null);
  await shot(page, ctx, "yard", ["fresh phone chips pinned", "phone boot: menu face present, no rail", "camera controls present (wave-2 regression)", "HUD markers present (wave-2 regression)", "no storage alert on fresh yard"]);

  await page.click('.dock button:text-is("Store")');
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  await page.waitForTimeout(250);
  await assertLockedPanel(page, ctx, "A");
  await page.evaluate(PAGE_PROBES.scrollTop);
  await shot(page, ctx, "store-locked", LOCKED_CLAIMS("A"));
  await reachability(page, ctx, "A phone");
  await commonChecks(page, ctx);

  await page.click('[aria-label="Store contents"] button:text-is("Close")');
  await page.waitForSelector('[aria-label="Store contents"]', { state: "detached", timeout: 5000 });
  check(ctx, "A close button dismisses the panel", (await page.evaluate(PAGE_PROBES.storePanel)) === null, null);
  await finish(browser, ctx);
}

async function freshDesk() {
  const { browser, page, ctx } = await makeContext("B-fresh-desk1280", { width: 1280, height: 800 }, null);
  ctx.page = page;
  await enterYard(page, ctx);

  const chips = await page.evaluate(PAGE_PROBES.chips);
  check(ctx, "fresh desktop chips pinned", chips.map((c) => c.text).join("|") === "Scrap0|Credits0|Store 0/900", chips);
  await bootChecks(page, ctx, "desktop");
  check(ctx, "no storage alert on fresh desktop yard", (await page.evaluate(PAGE_PROBES.alert)) === null, null);
  await shot(page, ctx, "yard", ["fresh desktop chips pinned", "desktop boot: rail paints 5 destination slots", "camera controls present (wave-2 regression)", "HUD markers present (wave-2 regression)", "no storage alert on fresh desktop yard"]);

  const chunks = await page.evaluate(PAGE_PROBES.chunks);
  const entry = chunks.find((c) => /^index-.*\.js$/.test(c.name));
  ctx.entryBytes = entry ? entry.decodedBodySize : null;
  check(ctx, "entry chunk < 233000 B ceiling", entry && entry.decodedBodySize > 0 && entry.decodedBodySize < 233000, { entry, chunks });
  const scan = await page.evaluate(PAGE_PROBES.assetScan);
  const js = scan.find((s) => s.name.endsWith(".js"));
  const css = scan.find((s) => s.name.endsWith(".css"));
  check(ctx, "wave-2 camera markers in entry bytes (pinch/zoom/wheel)", js && js.pinch && js.zoom && js.wheel, js);
  check(ctx, "wave-2 shell marker --shell-inspector-top in entry CSS", css && css.inspectorTop, css);

  await page.click('.shell-rail [data-slot="store"]');
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  await page.waitForTimeout(250);
  const pressed = await page.getAttribute('.shell-rail [data-slot="store"]', "aria-pressed");
  check(ctx, "B rail store slot opens panel and stays pressed", pressed === "true", pressed);
  await assertLockedPanel(page, ctx, "B");
  await page.evaluate(PAGE_PROBES.scrollTop);
  await shot(page, ctx, "store-locked", [...LOCKED_CLAIMS("B"), "B rail store slot opens panel and stays pressed"]);
  await reachability(page, ctx, "B desktop");
  await commonChecks(page, ctx);

  await page.click('[aria-label="Store contents"] button:text-is("Close")');
  await page.waitForSelector('[aria-label="Store contents"]', { state: "detached", timeout: 5000 });
  const unpressed = await page.getAttribute('.shell-rail [data-slot="store"]', "aria-pressed");
  check(ctx, "B close unpresses the rail slot", unpressed === "false", unpressed);
  await page.click('.shell-rail [data-slot="store"]');
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  const reopened = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, "B rail slot reopens the locked store", reopened !== null && reopened.note === "Finish the first steel contract to open selling.", reopened?.note);
  await finish(browser, ctx);
}

async function fullPhone() {
  const seed = fullStoreSeed();
  seed.describe = { storeUnits: 900, storeCapacity: 900, store: { plates: 880, scrap: 20 }, overflow: 40, machines: 0, routes: 0, exportClaimed: true, tutorial: 9, lastSeenMs: "now (no catch-up)" };
  const { browser, page, ctx } = await makeContext("C-full-phone390", { width: 390, height: 844 }, seed);
  ctx.page = page;
  await enterYard(page, ctx);

  await page.waitForSelector(".hud-alert", { timeout: 8000 });
  const alert = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, "C full alert: role=status, exact recovery copy",
    alert?.role === "status" && alert.tier === "full" && alert.svg >= 1 &&
    alert.text === "Store full · 900/900 · 40 held outside · sell to free space" && alert.action === "Open store", alert);
  await shot(page, ctx, "alert", ["C full alert: role=status, exact recovery copy"]);

  await page.click(".hud-alert__action");
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  await page.waitForTimeout(300);
  await assertFullPanel(page, ctx, "C");
  await page.evaluate(PAGE_PROBES.scrollTop);
  await shot(page, ctx, "store-full", FULL_CLAIMS("C"));

  await reachability(page, ctx, "C phone");
  await page.locator('[aria-label="Store contents"] .store-section--diag').scrollIntoViewIfNeeded();
  check(ctx, "C diagnostics section scrolled into view", await page.evaluate(PAGE_PROBES.diagInView), null);
  await shot(page, ctx, "store-diagnostics", ["C diagnostics exact", "C diagnostics section scrolled into view"]);
  await page.evaluate(PAGE_PROBES.scrollTop);

  /* Quantity selection: exact proceeds preview for a chosen tranche. */
  const qtyInput = page.locator('.store-trade[data-resource="plates"] .store-trade__qty');
  await qtyInput.fill("7");
  let panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, "C qty 7 preview exact",
    panel.cards[0].qty === "7" && panel.cards[0].preview === "7 × 15 = 105 credits" &&
    panel.cards[0].previewValid === "true" && panel.cards[0].sellText === "Sell 7 · +105" &&
    panel.cards[0].sellDisabled === false, panel.cards[0]);
  await shot(page, ctx, "qty-7", ["C qty 7 preview exact"]);

  /* Invalid quantities: disabled face, named reason, nothing dispatched. */
  const invalidCases = [
    ["0", "Enter a whole number from 1 to 60."],
    ["abc", "Enter a whole number from 1 to 60."],
    ["", "Enter a whole number from 1 to 60."],
    ["3.5", "Enter a whole number from 1 to 60."],
    ["-4", "Enter a whole number from 1 to 60."],
    ["999", "Only 60 units sellable above the reserve."],
  ];
  for (let i = 0; i < invalidCases.length; i += 1) {
    const [raw, reason] = invalidCases[i];
    await qtyInput.fill(raw);
    panel = await page.evaluate(PAGE_PROBES.storePanel);
    check(ctx, `C invalid qty case ${i} blocked`,
      panel.cards[0].preview === reason && panel.cards[0].previewValid === "false" && panel.cards[0].sellDisabled === true,
      { raw, preview: panel.cards[0].preview, valid: panel.cards[0].previewValid, disabled: panel.cards[0].sellDisabled });
  }
  const untouched = await page.evaluate(PAGE_PROBES.simSave);
  check(ctx, "C invalid entries dispatch nothing", untouched && untouched.credits === 82 && untouched.store.plates === 880,
    { credits: untouched?.credits, plates: untouched?.store?.plates });
  await shot(page, ctx, "invalid-qty", ["C invalid qty case 5 blocked", "C invalid entries dispatch nothing"]);

  /* Stepper + presets against the engine ceiling. */
  await page.click('button[aria-label="Half Plates"]');
  panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, "C Half preset = 30 with exact proceeds",
    panel.cards[0].qty === "30" && panel.cards[0].preview === "30 × 15 = 450 credits" && panel.cards[0].sellText === "Sell 30 · +450", panel.cards[0]);
  await page.click('button[aria-label="Max Plates"]');
  panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, "C Max preset = 60, increase disabled at ceiling",
    panel.cards[0].qty === "60" && panel.cards[0].incDisabled === true && panel.cards[0].preview === "60 × 15 = 900 credits", panel.cards[0]);
  await page.click('button[aria-label="Decrease Plates quantity"]');
  panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, "C stepper decrease 60 -> 59",
    panel.cards[0].qty === "59" && panel.cards[0].preview === "59 × 15 = 885 credits" && panel.cards[0].decDisabled === false, panel.cards[0]);
  await page.click('button[aria-label="Increase Plates quantity"]');
  panel = await page.evaluate(PAGE_PROBES.storePanel);
  check(ctx, "C stepper increase 59 -> 60",
    panel.cards[0].qty === "60" && panel.cards[0].incDisabled === true, panel.cards[0]);

  /* REAL sell of the chosen 7 through the UI: credits, stock, revision, tick. */
  await qtyInput.fill("7");
  const before = await pollValue(page, PAGE_PROBES.simSave, undefined, (s) => s && s.tick > seed.sim.tick, 6000);
  check(ctx, "C persistence live before sell",
    before && before.tick > seed.sim.tick && before.credits === 82 && before.store.plates === 880,
    { tick: before?.tick, seedTick: seed.sim.tick, credits: before?.credits });
  await page.click('.store-trade[data-resource="plates"] .store-trade__sell');
  const afterDom = await pollValue(page, PAGE_PROBES.storePanel, undefined,
    (p) => p && p.cards[0] && p.cards[0].facts === "Stock 873 · Sellable 60", 5000);
  check(ctx, "C sell 7 updates card facts", afterDom?.cards[0]?.facts === "Stock 873 · Sellable 60", afterDom?.cards[0]);
  const chipCredits = findChip(await page.evaluate(PAGE_PROBES.chips), "Credits")?.text;
  check(ctx, "C credits chip 82 -> 187", chipCredits === "Credits187", chipCredits);
  const after = await pollValue(page, PAGE_PROBES.simSave, undefined, (s) => s && s.revision > before.revision, 6000);
  check(ctx, "C sell committed: revision+1, tick advances, exact ledger",
    after && after.revision > before.revision && after.tick > before.tick && after.credits === 187 && after.store.plates === 873,
    { before: { rev: before?.revision, tick: before?.tick }, after: { rev: after?.revision, tick: after?.tick, credits: after?.credits, plates: after?.store?.plates } });
  const drained = await pollValue(page, PAGE_PROBES.simSave, undefined,
    (s) => s && s.store.scrap === 27 && s.storeUnits === 900 && s.overflow.reduce((n, i) => n + i.qty, 0) === 33, 6000);
  check(ctx, "C overflow returns as space frees (7 scrap)",
    drained && drained.store.scrap === 27 && drained.storeUnits === 900 && drained.overflow[0]?.qty === 33,
    { scrap: drained?.store?.scrap, units: drained?.storeUnits, overflow: drained?.overflow });
  panel = await page.evaluate(PAGE_PROBES.storePanel);
  const alertHigh = await page.evaluate(PAGE_PROBES.alert);
  /* The drain refills the freed 7 slots from overflow, so units return to
   * 900/900 and the alert stays `full` while 33 units remain outside. It only
   * clears once overflow is exhausted AND fill drops below the high mark. */
  check(ctx, "C panel reflects drain; alert stays full while overflow remains",
    diagOf(panel, "Overflow hold")?.dd === "33" && diagOf(panel, "Capacity")?.dd === "900/900" &&
    panel.capacityOccurrences === 1 && rowOf(panel, "scrap").stock === "27" &&
    alertHigh?.tier === "full" && alertHigh.role === "status" &&
    alertHigh.text === "Store full · 900/900 · 33 held outside · sell to free space",
    { overflowRow: diagOf(panel, "Overflow hold"), capacity: diagOf(panel, "Capacity"), scrapRow: rowOf(panel, "scrap")?.stock, alert: alertHigh });
  await page.evaluate(PAGE_PROBES.scrollTop);
  await shot(page, ctx, "after-sell-7", [
    "C sell 7 updates card facts", "C credits chip 82 -> 187",
    "C sell committed: revision+1, tick advances, exact ledger",
    "C overflow returns as space frees (7 scrap)", "C panel reflects drain; alert stays full while overflow remains",
  ]);

  /* Rapid taps: 863 sellable plates = 14x60 + 23 -> 15 tranches, floor 10. */
  await rapidTapPlates(page, ctx, "C", 15, 13132);
  await sellOutScrap(page, ctx, "C");
  await shot(page, ctx, "nothing-sellable", ["C zero-sellable honesty: note, retired faces, alert clears"]);

  await commonChecks(page, ctx);
  await finish(browser, ctx);
}

async function fullDesk() {
  const seed = fullStoreSeed();
  seed.describe = { storeUnits: 900, storeCapacity: 900, store: { plates: 880, scrap: 20 }, overflow: 40, machines: 0, routes: 0, exportClaimed: true, tutorial: 9, lastSeenMs: "now (no catch-up)" };
  const { browser, page, ctx } = await makeContext("D-full-desk1280", { width: 1280, height: 800 }, seed);
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
  check(ctx, "D rail-mode alert sits in reserved band, clear of rail/dock/objective",
    a && geo.rail && a.left >= geo.rail.right && geo.dock && a.bottom <= geo.dock.top &&
    geo.objective && a.top >= geo.objective.bottom && a.right <= geo.viewport.w - 334 + 1, geo);
  const alert = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, "D rail-mode alert keeps full recovery copy",
    alert?.text === "Store full · 900/900 · 40 held outside · sell to free space" && alert.role === "status" && alert.action === "Open store", alert);
  await shot(page, ctx, "rail-alert", ["D rail-mode alert sits in reserved band, clear of rail/dock/objective", "D rail-mode alert keeps full recovery copy"]);

  await page.click(".hud-alert__action");
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  await page.waitForTimeout(300);
  await assertFullPanel(page, ctx, "D");
  await page.evaluate(PAGE_PROBES.scrollTop);
  await shot(page, ctx, "store-full", FULL_CLAIMS("D"));
  await reachability(page, ctx, "D desktop");
  await page.evaluate(PAGE_PROBES.scrollTop);

  /* REAL sell of the default full tranche (60) through the UI. */
  const before = await pollValue(page, PAGE_PROBES.simSave, undefined, (s) => s && s.tick > seed.sim.tick, 6000);
  check(ctx, "D persistence live before sell",
    before && before.tick > seed.sim.tick && before.credits === 82 && before.store.plates === 880,
    { tick: before?.tick, seedTick: seed.sim.tick, credits: before?.credits });
  await page.click('.store-trade[data-resource="plates"] .store-trade__sell');
  const afterDom = await pollValue(page, PAGE_PROBES.storePanel, undefined,
    (p) => p && p.cards[0] && p.cards[0].facts === "Stock 820 · Sellable 60", 5000);
  check(ctx, "D sell 60 updates card facts", afterDom?.cards[0]?.facts === "Stock 820 · Sellable 60", afterDom?.cards[0]);
  const chipCredits = findChip(await page.evaluate(PAGE_PROBES.chips), "Credits")?.text;
  check(ctx, "D credits chip 82 -> 982", chipCredits === "Credits982", chipCredits);
  const after = await pollValue(page, PAGE_PROBES.simSave, undefined, (s) => s && s.revision > before.revision, 6000);
  check(ctx, "D sell committed: revision+1, tick advances, exact ledger",
    after && after.revision > before.revision && after.tick > before.tick && after.credits === 982 && after.store.plates === 820,
    { before: { rev: before?.revision, tick: before?.tick }, after: { rev: after?.revision, tick: after?.tick, credits: after?.credits, plates: after?.store?.plates } });
  const drained = await pollValue(page, PAGE_PROBES.simSave, undefined,
    (s) => s && s.store.scrap === 60 && s.storeUnits === 880 && s.overflow.length === 0, 6000);
  check(ctx, "D overflow fully returns as space frees (40 scrap)",
    drained && drained.store.scrap === 60 && drained.storeUnits === 880 && drained.overflow.length === 0,
    { scrap: drained?.store?.scrap, units: drained?.storeUnits, overflow: drained?.overflow?.length });
  let panel = await page.evaluate(PAGE_PROBES.storePanel);
  const alertHigh = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, "D diagnostics shed full-only rows; alert demotes to high",
    diagOf(panel, "Capacity")?.dd === "880/900" && panel.capacityOccurrences === 1 &&
    diagOf(panel, "Overflow hold") === undefined && diagOf(panel, "Storage cause") === undefined &&
    diagOf(panel, "Largest holds") === undefined && diagOf(panel, "Recovery") === undefined &&
    diagOf(panel, "Sell floor")?.dd === "10 units kept per material" &&
    rowOf(panel, "scrap").stock === "60" &&
    alertHigh?.tier === "high" && alertHigh.role === null && alertHigh.text === "Store nearly full · 880/900",
    { diag: panel.diagRows, alert: alertHigh });

  /* Rapid taps: 810 sellable plates = 13x60 + 30 -> 14 tranches, floor 10. */
  await rapidTapPlates(page, ctx, "D", 14, 13132);
  await sellOutScrap(page, ctx, "D");

  /* Close and reopen through the rail slot: state preserved. */
  await page.click('[aria-label="Store contents"] button:text-is("Close")');
  await page.waitForSelector('[aria-label="Store contents"]', { state: "detached", timeout: 5000 });
  const unpressed = await page.getAttribute('.shell-rail [data-slot="store"]', "aria-pressed");
  check(ctx, "D close unpresses the rail slot", unpressed === "false", unpressed);
  await page.click('.shell-rail [data-slot="store"]');
  await page.waitForSelector('[aria-label="Store contents"]', { timeout: 5000 });
  await page.waitForTimeout(250);
  panel = await page.evaluate(PAGE_PROBES.storePanel);
  const pressed = await page.getAttribute('.shell-rail [data-slot="store"]', "aria-pressed");
  const alertGone = await page.evaluate(PAGE_PROBES.alert);
  check(ctx, "D rail reopen preserves sold-out state",
    pressed === "true" && panel !== null && panel.cards.length === 0 &&
    panel.note === "Nothing is sellable right now: stock sits at or below the reserve the yard keeps." &&
    rowOf(panel, "plates").stock === "10" && rowOf(panel, "scrap").stock === "10" &&
    diagOf(panel, "Capacity")?.dd === "20/900" && panel.capacityOccurrences === 1 && alertGone === null,
    { pressed, cards: panel?.cards.length, note: panel?.note, capacity: diagOf(panel, "Capacity"), alert: alertGone });
  await page.evaluate(PAGE_PROBES.scrollTop);
  await shot(page, ctx, "reopened", ["D rail reopen preserves sold-out state"]);

  await commonChecks(page, ctx);
  await finish(browser, ctx);
}

/* ------------------------------------------------------------------ main */

const browser0 = await chromium.launch({ executablePath: exe, headless: true });
await browser0.close();

await freshPhone();
await freshDesk();
await fullPhone();
await fullDesk();

/* Frame audit: every captured frame must name checks that passed. */
const frameAudit = [];
for (const c of contexts) {
  for (const f of c.frames) {
    const missing = f.claims.filter((n) => !c.checks.some((k) => k.name === n && k.pass));
    frameAudit.push({ context: c.name, file: f.file, claims: f.claims, proven: missing.length === 0, missing });
    if (missing.length > 0) failures.push(`${c.name}: frame ${f.file} lacks proof for: ${missing.join("; ")}`);
  }
}

const desk = contexts.find((c) => c.name === "B-fresh-desk1280");
const totalChecks = contexts.reduce((n, c) => n + c.checks.length, 0);
const receipt = {
  task: "UI-RESET-56",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/56",
  headSha,
  url,
  measuredAt: new Date().toISOString(),
  tool: "playwright-core headless Chromium; DOM/ARIA/computed-style/geometry probes only (no visual inspection)",
  seedSource: "docs/evidence/yard-mature.json (mutated in memory; FNV-1a checksum recomputed; lastSeenMs=Date.now() skips catch-up)",
  fixtureRules: {
    mutation: "probe code only, in-memory seed clone; src/ untouched",
    documented: "seed shape recorded per context in this receipt",
    simValidation: "save checksum recomputed with the game's own FNV-1a; the app boots, validates and ticks the seed",
    actionPath: "every sell/stepper/preset/alert/dock/rail action is a real UI click through the app's dispatch; no state injection",
    persistence: "localStorage reads poll up to 6-8 s to tolerate the ~1 s PERSIST_MS save cadence",
  },
  entryBudget: {
    bytes: desk?.entryBytes ?? null,
    baseMainBytes: 100254,
    delta: desk?.entryBytes != null ? desk.entryBytes - 100254 : null,
    ceiling: 233000,
  },
  contexts,
  frameAudit: {
    frames: frameAudit.length,
    allProven: frameAudit.every((f) => f.proven),
    unproven: frameAudit.filter((f) => !f.proven),
    detail: frameAudit,
  },
  summary: {
    pass: failures.length === 0,
    contexts: contexts.length,
    checks: totalChecks,
    failed: failures.length,
  },
  failures,
};
writeFileSync(path.join(here, "store-probe-56-receipt.json"), JSON.stringify(receipt, null, 2));
console.log(`store-probe-56: ${totalChecks} checks across ${contexts.length} contexts; ${frameAudit.length} frames audited; ${failures.length} failures`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);