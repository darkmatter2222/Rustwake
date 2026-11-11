// UI-RESET-91: headless-Chrome boot probe for the vendor-chunk split. Proves the
// built app still boots to an interactive yard with zero console errors after
// react/react-dom/scheduler move to their own chunk, and that the catch-up
// worker still loads (mature seed -> return report -> Back to yard).
//
// Usage (worktree root):
//   pnpm exec vite preview --port 4175 --strictPort   (second shell)
//   node work/evidence/UI-RESET-91/boot-probe-91.mjs <receipt.json> [expectVendor]
// expectVendor = "1" asserts a vendor-*.js chunk loaded; "0" (default) is the
// pre-change baseline run. DOM/console probes only - no visual inspection.
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = process.argv[2];
const expectVendor = process.argv[3] === "1";
if (!outPath) { console.error("usage: boot-probe-91.mjs <receipt.json> [expectVendor]"); process.exit(1); }
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4175/";
const exe = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
if (!exe) { console.error("no local Chrome/Edge executable found"); process.exit(1); }
const seedText = readFileSync(resolve("docs/evidence/yard-mature.json"), "utf8");
const failures = [];
const contexts = [];

const fail = (ctx, check, detail) => failures.push({ context: ctx, check, detail });

// Canvas ink: strided sample against the corner background pixel (same probe as
// capture-shell-49) - proves the world actually paints, not just an empty canvas.
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
        expectVendor,
      };
      if (!chunkCheck.entryLoaded) fail(ctx.name, "entryLoaded", JSON.stringify(chunks));
      if (!chunkCheck.tablesLoaded) fail(ctx.name, "tablesLoaded", JSON.stringify(chunks));
      if (expectVendor && !chunkCheck.vendorLoaded) fail(ctx.name, "vendorLoaded", JSON.stringify(chunks));
      contexts.push({
        context: ctx.name, viewport: ctx.vp, gateSeen: true,
        consoleErrors: ctx.consoleErrors, pageErrors: ctx.pageErrors,
        badResponses: ctx.badResponses, requestFailures: ctx.requestFailures,
        chunks, chunkCheck, ...extra,
      });
      console.log(`${ctx.name}: errors=${ctx.consoleErrors.length + ctx.pageErrors.length} badResponses=${ctx.badResponses.length} vendor=${chunkCheck.vendorLoaded} worker=${chunkCheck.workerFetched}`);
    };

    // A. Fresh yard at desktop: gate -> Begin recovery -> ticking sim, painted
    //    world, and a real React interaction (rail menu opens, Escape closes).
    {
      const ctx = await make("fresh-desk1280", { w: 1280, h: 800, dpr: 1, mobile: false }, null);
      ctx.vp = [1280, 800];
      await ctx.p.click("text=Begin recovery");
      await ctx.p.waitForTimeout(700);
      const gateGone = await ctx.p.evaluate(() => ![...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim().startsWith("Begin recovery")));
      if (!gateGone) fail(ctx.name, "gateCleared", "Begin recovery still painted");
      // The save is flushed every PERSIST_MS (1000 ms of sim), not every tick:
      // wait for the first persisted save, then sample again past one flush.
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
      await ctx.p.evaluate(() => document.querySelector('.shell-rail [data-slot="menu"]')?.click());
      await ctx.p.waitForTimeout(350);
      const menuOpen = await ctx.p.evaluate(() => !!document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuOpen) fail(ctx.name, "menuOpens", "rail menu click did not open the dialog");
      await ctx.p.keyboard.press("Escape");
      await ctx.p.waitForTimeout(300);
      const menuClosed = await ctx.p.evaluate(() => !document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuClosed) fail(ctx.name, "menuCloses", "Escape did not close the menu");
      ctx.chunks = await ctx.p.evaluate(chunkEntries);
      finish(ctx, { gateCleared: gateGone, tick1, tick2, ticking, ink, menuOpen, menuClosed });
      await ctx.c.close();
    }

    // B. Mature yard: the stale lastSeenMs forces the catch-up worker hop; the
    //    return report ("Back to yard") only settles once catch-up answers, so
    //    reaching the yard proves the worker chunk still loads and runs.
    {
      const ctx = await make("mature-desk1280-worker", { w: 1280, h: 800, dpr: 1, mobile: false }, seedText);
      ctx.vp = [1280, 800];
      await ctx.p.click("text=Begin recovery");
      let backSeen = false;
      for (let i = 0; i < 40; i += 1) {
        await ctx.p.waitForTimeout(250);
        const state = await ctx.p.evaluate(() => {
          const back = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Back to yard"));
          if (back) { back.click(); return "back"; }
          const begin = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Begin recovery"));
          return begin ? "gate" : "yard";
        });
        if (state === "back") { backSeen = true; break; }
        if (state === "yard" && i >= 8) break;
      }
      if (!backSeen) fail(ctx.name, "returnReport", "Back to yard never painted (catch-up did not settle)");
      await ctx.p.waitForTimeout(600);
      const ink = await ctx.p.evaluate(inkProbe);
      if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", JSON.stringify(ink));
      const tick = await ctx.p.evaluate(simTick);
      ctx.chunks = await ctx.p.evaluate(chunkEntries);
      finish(ctx, { backSeen, ink, tickAfterCatchup: tick });
      await ctx.c.close();
    }

    // C. Fresh yard at the phone band: gate -> Begin -> dock + Menu face, and
    //    the face opens the menu (React events across the chunk boundary).
    {
      const ctx = await make("fresh-phone390", { w: 390, h: 844, dpr: 3, mobile: true }, null);
      ctx.vp = [390, 844];
      await ctx.p.click("text=Begin recovery");
      await ctx.p.waitForTimeout(700);
      const ink = await ctx.p.evaluate(inkProbe);
      if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", JSON.stringify(ink));
      await ctx.p.evaluate(() => document.querySelector(".shell-menu-face")?.click());
      await ctx.p.waitForTimeout(350);
      const menuOpen = await ctx.p.evaluate(() => !!document.querySelector('.shell-menu[role="dialog"]'));
      if (!menuOpen) fail(ctx.name, "menuOpens", "phone Menu face click did not open the dialog");
      await ctx.p.keyboard.press("Escape");
      await ctx.p.waitForTimeout(300);
      ctx.chunks = await ctx.p.evaluate(chunkEntries);
      finish(ctx, { ink, menuOpen });
      await ctx.c.close();
    }

    const receipt = {
      task: "UI-RESET-91 vendor chunk split boot probe",
      issue: "https://github.com/darkmatter2222/Rustwake/issues/91",
      headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
      url, expectVendor,
      measuredAt: new Date().toISOString(),
      tool: "playwright-core + local Chrome/Edge headless, vite preview; DOM/console/resource probes only (no visual inspection)",
      seed: "docs/evidence/yard-mature.json (tick 18298, stale lastSeenMs forces the catch-up worker)",
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
