// Temporary layout measurement for save-63 CSS iteration. Not part of the
// evidence probe; deleted before final handoff. Boots the built app with the
// post-import yard (2 machines) at large text and dumps the panel box model.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { applyCommand } from "../../src/game/simulation/commands.ts";
import { advance } from "../../src/game/simulation/engine.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist", "index.html");
if (!existsSync(dist)) throw new Error("run pnpm build first");
const PORT = 5179;

function buildImported(textScale) {
  const sim = createInitialState();
  for (let i = 0; i < 10; i++) { applyCommand(sim, { id: `m-salvage-${i}`, type: "manual.salvage" }); advance(sim, 6); }
  applyCommand(sim, { id: "m-repair", type: "drone.repair" });
  advance(sim, 262);
  applyCommand(sim, { id: "m-build-1", type: "machine.build", blueprint: "sorter", tile: 8 });
  for (const tile of [9, 10, 11, 12]) {
    if (applyCommand(sim, { id: `m-build-2-${tile}`, type: "machine.build", blueprint: "sorter", tile }).ok) break;
  }
  applyCommand(sim, { id: "m-route", type: "route.connect", from: 0, to: sim.machines[0].id, filter: "scrap" });
  advance(sim, 2400);
  sim.tutorial = 9;
  return encodeSave(sim, Date.now(), { ...DEFAULT_SETTINGS, muted: true, reducedMotion: false, textScale });
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));

const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath, headless: true, args: ["--autoplay-policy=user-gesture-required"] });

async function measure(name, viewport, dsf, isMobile, scale) {
  const text = buildImported(scale);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
  await ctx.addInitScript(([key, val]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, val); }, [SAVE_KEY, text]);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.click(".gate__btn");
  await page.waitForSelector(".dock, .shell-rail", { timeout: 15000 });
  const report = await page.$(".panel--report .panel__head .icon-btn");
  if (report) await report.click();
  await page.waitForTimeout(400);
  // open yard
  const railSlot = await page.$('.shell-rail__slot[data-slot="yard"]');
  if (railSlot && (await railSlot.boundingBox())?.width > 0) await railSlot.click();
  else {
    const btns = await page.$$(".dock button");
    for (const b of btns) { if (((await b.textContent()) || "").trim().startsWith("Yard")) { await b.click(); break; } }
  }
  await page.waitForSelector('.panel[aria-label="Yard record"]', { timeout: 8000 });
  await page.waitForTimeout(300);

  const dump = await page.evaluate(() => {
    const hud = document.querySelector(".hud");
    const hudRect = hud.getBoundingClientRect();
    const panels = [...hud.querySelectorAll(":scope > .panel")].map((p) => ({
      cls: p.className, aria: p.getAttribute("aria-label"),
      rect: p.getBoundingClientRect().toJSON(),
      maxH: getComputedStyle(p).maxHeight,
    }));
    const panel = document.querySelector('.panel[aria-label="Yard record"]');
    const head = panel.querySelector(".panel__head");
    const body = panel.querySelector(".panel__body");
    const cs = getComputedStyle(panel);
    const lead = document.querySelector(".hud__lead");
    const dock = document.querySelector(".dock");
    const out = {
      viewport: { w: innerWidth, h: innerHeight },
      rootFont: getComputedStyle(document.documentElement).fontSize,
      scaleVar: getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim(),
      inspectorTop: getComputedStyle(document.documentElement).getPropertyValue("--shell-inspector-top").trim(),
      hudRect: hudRect.toJSON(),
      leadRect: lead ? lead.getBoundingClientRect().toJSON() : null,
      dockRect: dock ? dock.getBoundingClientRect().toJSON() : null,
      panels,
      panelPadding: cs.padding, panelGap: cs.gap,
      headRect: head.getBoundingClientRect().toJSON(),
      body: { scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, rect: body.getBoundingClientRect().toJSON() },
      pages: {},
    };
    return out;
  });

  // measure each page content height by navigating
  const PANEL = '.panel[aria-label="Yard record"]';
  async function pageHeights(label) {
    return page.evaluate((sel) => {
      const body = document.querySelector(sel + " .panel__body");
      return { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
    }, PANEL);
  }
  dump.pages.record = await pageHeights();
  // backup
  await page.evaluate(() => { const b = [...document.querySelectorAll('.panel[aria-label="Yard record"] button')].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith("Backup")); if (b) b.click(); });
  await page.waitForTimeout(150);
  dump.pages.backup = await pageHeights();
  await page.evaluate(() => { const b = [...document.querySelectorAll('.panel[aria-label="Yard record"] button')].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith("Back")); if (b) b.click(); });
  await page.waitForTimeout(150);
  // replace
  await page.evaluate(() => { const b = [...document.querySelectorAll('.panel[aria-label="Yard record"] button')].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith("Import")); if (b) b.click(); });
  await page.waitForTimeout(150);
  dump.pages.replace = await pageHeights();

  console.log("==== " + name + " ====");
  console.log(JSON.stringify(dump, null, 1));
  await ctx.close();
}

try {
  await measure("phone-portrait-ts2-imported", { width: 390, height: 844 }, 2, true, 2);
  await measure("phone-portrait-ts1.5-imported", { width: 390, height: 844 }, 2, true, 1.5);
  await measure("phone-landscape-ts2-imported", { width: 844, height: 390 }, 2, true, 2);
  await measure("desktop-ts2-imported", { width: 1920, height: 1080 }, 1, false, 2);
} finally {
  await browser.close();
  server.kill();
}
