// UI-RESET-95: headless-Chrome boot probe for the mechanical Panels.tsx split.
// Proves the built app still boots to an interactive yard with zero console
// errors, that the shell markers are intact at both bands, and that every panel
// reachable without canvas picking (Store, Research, Yard, ReturnReport) still
// mounts through the re-export facade in the real app. MachinePanel mounting is
// covered by the existing app tests + the DOM-identity harness (canvas picking
// is camera-dependent and out of scope for a module move).
//
// Usage (worktree root):
//   pnpm exec vite preview --port 4205 --strictPort   (second shell, same cwd)
//   node work/evidence/UI-RESET-95/boot-probe-95.mjs <receipt.json>
// DOM/console/resource probes only - no visual inspection.
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = process.argv[2];
if (!outPath) { console.error("usage: boot-probe-95.mjs <receipt.json>"); process.exit(1); }
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4205/";
const exe = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
if (!exe) { console.error("no local Chrome/Edge executable found"); process.exit(1); }
const seedText = readFileSync(resolve("docs/evidence/yard-mature.json"), "utf8");
const failures = [];
const contexts = [];

const fail = (ctx, check, detail) => failures.push({ context: ctx, check, detail });

// Canvas ink: strided sample against the corner background pixel (same probe as
// UI-RESET-91 / capture-shell-49) - proves the world actually paints.
const inkProbe = () => {
  const canvas = document.querySelector("canvas");
  if (!canvas || canvas.width === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const W = canvas.width, H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H).data;
  const bg = [img[0], img[1], img[2]];
  const stepX = Math.max(1, Math.floor(W / 64)), stepY = Math.max(1, Math.floor(H / 64));
  let diff = 0, samples = 0;
  for (let y = 0; y < H; y += stepY) {
    for (let x = 0; x < W; x += stepX) {
      const i = (y * W + x) * 4;
      samples += 1;
      if (Math.abs(img[i] - bg[0]) + Math.abs(img[i + 1] - bg[1]) + Math.abs(img[i + 2] - bg[2]) > 24) diff += 1;
    }
  }
  return { samples, diff, ratio: Number((diff / samples).toFixed(4)) };
};
const simTick = () => {
  const raw = localStorage.getItem("rustwake.save.v1");
  if (!raw) return null;
  try { return JSON.parse(raw).payload.sim.tick; } catch { return null; }
};
const chunkEntries = () => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/assets/"));

// Census of every mounted .panel (facade-mounted panels included) plus the
// shell markers for the active band.
const shellCensus = () => {
  const panels = [...document.querySelectorAll(".panel")].map((el) => ({
    classes: el.className,
    aria: el.getAttribute("aria-label"),
    title: el.querySelector(".panel__title")?.textContent?.trim() ?? null,
  }));
  const rail = document.querySelector(".shell-rail");
  const railVisible = !!rail && rail.getBoundingClientRect().width > 0;
  const slots = [...document.querySelectorAll(".shell-rail [data-slot]")].map((b) => b.getAttribute("data-slot"));
  const dock = document.querySelector(".dock");
  return {
    panels,
    railPresent: !!rail, railVisible, slots,
    dockPresent: !!dock,
    menuFacePresent: !!document.querySelector(".shell-menu-face"),
    menuDialogOpen: !!document.querySelector('.shell-menu[role="dialog"]'),
  };
};

const install = (ctx, text) => ctx.addInitScript((raw) => {
  localStorage.setItem("rustwake.save.v1", raw);
}, text);

async function run() {
  const browser = await chromium.launch({ executablePath: exe });
  try {
    // Served index.html: every asset link must stay relative (base "./").
    const html = await (await fetch(url)).text();
    const links = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.includes("assets/"));
    const htmlCheck = { assetLinks: links, allRelative: links.length > 0 && links.every((u) => u.startsWith("./assets/")) };
    if (!htmlCheck.allRelative) fail("index.html", "relativeLinks", JSON.stringify(links));

    const make = async (name, vp, seed) => {
      const c = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
      if (seed) await install(c, seed);
      const p = await c.newPage();
      const consoleErrors = [], pageErrors = [], badResponses = [], requestFailures = [];
      p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      p.on("pageerror", (e) => pageErrors.push(String(e)));
      p.on("response", (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
      p.on("requestfailed", (r) => requestFailures.push({ url: r.url(), error: r.failure()?.errorText }));
      await p.goto(url, { waitUntil: "networkidle" });
      await p.waitForSelector("text=Begin recovery", { timeout: 15000 });
      return { name, c, p, consoleErrors, pageErrors, badResponses, requestFailures };
    };
    const finish = (ctx, extra) => {
      const clean = ctx.consoleErrors.length === 0 && ctx.pageErrors.length === 0 && ctx.badResponses.length === 0 && ctx.requestFailures.length === 0;
      if (!clean) fail(ctx.name, "zeroErrors", JSON.stringify({ consoleErrors: ctx.consoleErrors, pageErrors: ctx.pageErrors, badResponses: ctx.badResponses, requestFailures: ctx.requestFailures }));
      const chunks = ctx.chunks ?? [];
      const has = (re) => chunks.some((n) => re.test(n));
      const chunkCheck = {
        entryLoaded: has(/\/assets\/index-[^/]*\.js/),
        tablesLoaded: has(/\/assets\/tables-[^/]*\.js/),
        vendorLoaded: has(/\/assets\/vendor-[^/]*\.js/),
        workerFetched: has(/\/assets\/catchup\.worker-[^/]*\.js/),
      };
      if (!chunkCheck.entryLoaded) fail(ctx.name, "entryLoaded", JSON.stringify(chunks));
      if (!chunkCheck.tablesLoaded) fail(ctx.name, "tablesLoaded", JSON.stringify(chunks));
      contexts.push({
        context: ctx.name, viewport: ctx.vp, gateSeen: true,
        consoleErrors: ctx.consoleErrors, pageErrors: ctx.pageErrors,
        badResponses: ctx.badResponses, requestFailures: ctx.requestFailures,
        chunks, chunkCheck, ...extra,
      });
      console.log(`${ctx.name}: errors=${ctx.consoleErrors.length + ctx.pageErrors.length} badResponses=${ctx.badResponses.length} worker=${chunkCheck.workerFetched}`);
    };
    const clickSlot = async (ctx, slot) => {
      await ctx.p.evaluate((s) => document.querySelector(`.shell-rail [data-slot="${s}"]`)?.click(), slot);
      await ctx.p.waitForTimeout(350);
    };
    const expectPanel = async (ctx, label, title, check) => {
      const census = await ctx.p.evaluate(shellCensus);
      const hit = census.panels.find((x) => x.title === title);
      if (!hit) { fail(ctx.name, label, `panel titled "${title}" not mounted; panels=${JSON.stringify(census.panels)}`); return null; }
      if (check && !check(hit)) fail(ctx.name, label, JSON.stringify(hit));
      return hit;
    };
    const escape = async (ctx) => { await ctx.p.keyboard.press("Escape"); await ctx.p.waitForTimeout(300); };

    // A. Fresh yard at desktop 1280x800: gate -> Begin -> ticking sim, painted
    //    world, rail markers, StorePanel through the facade, menu open/close.
    {
      const ctx = await make("fresh-desk1280", { w: 1280, h: 800, dpr: 1, mobile: false }, null);
      ctx.vp = [1280, 800];
      await ctx.p.click("text=Begin recovery");
      await ctx.p.waitForTimeout(700);
      const gateGone = await ctx.p.evaluate(() => ![...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim().startsWith("Begin recovery")));
      if (!gateGone) fail(ctx.name, "gateCleared", "Begin recovery still painted");
      let tick1 = null;
      for (let i = 0; i < 20 && tick1 === null; i += 1) {
        tick1 = await ctx.p.evaluate(simTick);
        if (tick1 === null) await ctx.p.waitForTimeout(250);
      }
      await ctx.p.waitForTimeout(1400);
      const tick2 = await ctx.p.evaluate(simTick);
      const ticking = tick1 !== null && tick2 !== null && tick2 > tick1;
      if (!ticking) fail(ctx.name, "simTicking", JSON.stringify({ tick1, tick2 }));
      const ink = await ctx.p.evaluate(inkProbe);
      if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", JSON.stringify(ink));
      const markers = await ctx.p.evaluate(shellCensus);
      const slotsOk = ["yard", "build", "store", "research", "menu"].every((s) => markers.slots.includes(s));
      if (!markers.railPresent || !markers.railVisible || !slotsOk) fail(ctx.name, "railMarkers", JSON.stringify(markers));
      // StorePanel via the rail (fresh yard: store slot is always live).
      await clickSlot(ctx, "store");
      const storePanel = await expectPanel(ctx, "storePanelOpens", "Yard store", (h) => h.classes.includes("panel--stack"));
      await escape(ctx);
      const storeClosed = await ctx.p.evaluate(() => ![...document.querySelectorAll(".panel__title")].some((h) => h.textContent?.trim() === "Yard store"));
      if (!storeClosed) fail(ctx.name, "storePanelCloses", "Escape did not close StorePanel");
      // Menu sheet opens from the rail and Escape closes it.
      await clickSlot(ctx, "menu");
      const menuOpen = await ctx.p.evaluate(() => !!document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuOpen) fail(ctx.name, "menuOpens", "rail menu click did not open the dialog");
      await escape(ctx);
      const menuClosed = await ctx.p.evaluate(() => !document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuClosed) fail(ctx.name, "menuCloses", "Escape did not close the menu");
      ctx.chunks = await ctx.p.evaluate(chunkEntries);
      finish(ctx, { gateCleared: gateGone, tick1, tick2, ticking, ink, markers, storePanel, storeClosed, menuOpen, menuClosed });
      await ctx.c.close();
    }

    // B. Mature yard at desktop: stale lastSeenMs forces the catch-up worker;
    //    ReturnReportPanel must paint before "Back to yard" settles it. Then
    //    Yard/Research/Store panels open through the facade via the rail, and
    //    the menu's Yard row reaches YardPanel too (tutorial 9 in the seed).
    {
      const ctx = await make("mature-desk1280-worker", { w: 1280, h: 800, dpr: 1, mobile: false }, seedText);
      ctx.vp = [1280, 800];
      await ctx.p.click("text=Begin recovery");
      let reportPanel = null, backSeen = false;
      for (let i = 0; i < 40; i += 1) {
        await ctx.p.waitForTimeout(250);
        reportPanel = await ctx.p.evaluate(() => {
          const el = document.querySelector(".panel--report");
          if (!el) return null;
          return { classes: el.className, aria: el.getAttribute("aria-label"), title: el.querySelector(".panel__title")?.textContent?.trim() ?? null };
        });
        if (reportPanel) break;
      }
      if (!reportPanel || reportPanel.title !== "While you were away") fail(ctx.name, "returnReportPanel", JSON.stringify(reportPanel));
      // Click "Back to yard" only after the report panel itself is recorded.
      for (let i = 0; i < 20; i += 1) {
        const state = await ctx.p.evaluate(() => {
          const back = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Back to yard"));
          if (back) { back.click(); return "back"; }
          return document.querySelector(".panel--report") ? "report" : "yard";
        });
        if (state === "back") { backSeen = true; break; }
        if (state === "yard" && i >= 8) break;
        await ctx.p.waitForTimeout(250);
      }
      if (!backSeen) fail(ctx.name, "returnReport", "Back to yard never painted (catch-up did not settle)");
      await ctx.p.waitForTimeout(600);
      const ink = await ctx.p.evaluate(inkProbe);
      if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", JSON.stringify(ink));
      const tick = await ctx.p.evaluate(simTick);
      // YardPanel via the rail yard slot (seed tutorial 9 unlocks it).
      await clickSlot(ctx, "yard");
      const yardPanel = await expectPanel(ctx, "yardPanelOpens", "Yard record", (h) => h.classes.includes("panel--stack"));
      const yardExport = await ctx.p.evaluate(() => {
        const ta = document.querySelector(".panel--stack textarea.panel__code");
        return ta ? { present: true, length: ta.value.length } : { present: false, length: 0 };
      });
      if (!yardExport.present || yardExport.length === 0) fail(ctx.name, "yardExportText", JSON.stringify(yardExport));
      await escape(ctx);
      // ResearchPanel via the rail (seed has data > 0 so the slot is live).
      await clickSlot(ctx, "research");
      const researchPanel = await expectPanel(ctx, "researchPanelOpens", "Research", (h) => h.classes.includes("panel--research"));
      await escape(ctx);
      // StorePanel via the rail.
      await clickSlot(ctx, "store");
      const storePanel = await expectPanel(ctx, "storePanelOpens", "Yard store");
      await escape(ctx);
      // Menu -> Yard row reaches YardPanel as well.
      await clickSlot(ctx, "menu");
      await ctx.p.evaluate(() => {
        const row = [...document.querySelectorAll('.shell-menu button')].find((b) => (b.textContent ?? "").trim().startsWith("Yard"));
        row?.click();
      });
      await ctx.p.waitForTimeout(350);
      const yardViaMenu = await expectPanel(ctx, "yardPanelViaMenu", "Yard record");
      await escape(ctx);
      ctx.chunks = await ctx.p.evaluate(chunkEntries);
      finish(ctx, { reportPanel, backSeen, ink, tickAfterCatchup: tick, yardPanel, yardExport, researchPanel, storePanel, yardViaMenu });
      await ctx.c.close();
    }

    // C. Fresh yard at the phone band 390x844: gate -> Begin -> dock + Menu
    //    face markers, StorePanel from the dock, menu dialog open/close.
    {
      const ctx = await make("fresh-phone390", { w: 390, h: 844, dpr: 3, mobile: true }, null);
      ctx.vp = [390, 844];
      await ctx.p.click("text=Begin recovery");
      await ctx.p.waitForTimeout(700);
      const ink = await ctx.p.evaluate(inkProbe);
      if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", JSON.stringify(ink));
      const markers = await ctx.p.evaluate(shellCensus);
      if (!markers.menuFacePresent || !markers.dockPresent) fail(ctx.name, "phoneMarkers", JSON.stringify(markers));
      // StorePanel from the dock's Store button.
      await ctx.p.evaluate(() => {
        const btn = [...document.querySelectorAll(".dock button")].find((b) => (b.textContent ?? "").trim().startsWith("Store"));
        btn?.click();
      });
      await ctx.p.waitForTimeout(350);
      const storePanel = await expectPanel(ctx, "storePanelOpens", "Yard store");
      await escape(ctx);
      const storeClosed = await ctx.p.evaluate(() => ![...document.querySelectorAll(".panel__title")].some((h) => h.textContent?.trim() === "Yard store"));
      if (!storeClosed) fail(ctx.name, "storePanelCloses", "Escape did not close StorePanel");
      await ctx.p.evaluate(() => document.querySelector(".shell-menu-face")?.click());
      await ctx.p.waitForTimeout(350);
      const menuOpen = await ctx.p.evaluate(() => !!document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuOpen) fail(ctx.name, "menuOpens", "phone Menu face click did not open the dialog");
      await escape(ctx);
      const menuClosed = await ctx.p.evaluate(() => !document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuClosed) fail(ctx.name, "menuCloses", "Escape did not close the menu");
      ctx.chunks = await ctx.p.evaluate(chunkEntries);
      finish(ctx, { ink, markers, storePanel, storeClosed, menuOpen, menuClosed });
      await ctx.c.close();
    }

    const receipt = {
      task: "UI-RESET-95 Panels.tsx mechanical split boot probe",
      issue: "https://github.com/darkmatter2222/Rustwake/issues/95",
      headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
      url,
      measuredAt: new Date().toISOString(),
      tool: "playwright-core + local Chrome/Edge headless, vite preview; DOM/console/resource probes only (no visual inspection)",
      seed: "docs/evidence/yard-mature.json (tick 18298, tutorial 9, stale lastSeenMs forces the catch-up worker)",
      panelCoverage: "StorePanel (rail + dock), ResearchPanel (rail), YardPanel (rail + menu row), ReturnReportPanel (catch-up); MachinePanel covered by app tests + DOM-identity harness",
      indexHtml: htmlCheck,
      contexts,
      summary: { contexts: contexts.length, failures: failures.length, pass: failures.length === 0 },
      failures,
    };
    writeFileSync(resolve(outPath), JSON.stringify(receipt, null, 2) + "\n");
    console.log(`wrote ${outPath}: ${failures.length} failures`);
    if (failures.length > 0) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
  } finally {
    await browser.close();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
