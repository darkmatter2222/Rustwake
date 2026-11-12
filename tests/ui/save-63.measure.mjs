/**
 * UI-RESET-63 layout measurement companion to save-63.evidence.mjs: boots the
 * BUILT app (pnpm build first) with the post-import yard (2 machines) and dumps
 * the save panel box model at every form factor x text scale, then walks the
 * three pages (record/backup/replace) recording body scrollHeight/clientHeight
 * — the spec 6.4 "0 px inner panel scroll" budget. The return report is settled
 * and dismissed first (single-panel budget), exactly like the evidence probe.
 *
 * Run from the worktree root AFTER `pnpm build`:
 *   pnpm tsx tests/ui/save-63.measure.mjs
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { applyCommand } from "../../src/game/simulation/commands.ts";
import { advance } from "../../src/game/simulation/engine.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (!existsSync(path.join(root, "dist", "index.html"))) throw new Error("run pnpm build first");
const PORT = Number(process.env.RW63M_PORT ?? 5179);
const PANEL = '.panel[aria-label="Yard record"]';

/** The post-import yard: two machines, one route, tutorial complete. */
function buildImported(textScale) {
  const sim = createInitialState();
  for (let i = 0; i < 10; i += 1) { applyCommand(sim, { id: `m-salvage-${i}`, type: "manual.salvage" }); advance(sim, 6); }
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
  "C:/Program Files (x86)/Google/Chrome/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));

const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const url = `http://127.0.0.1:${PORT}/`;
const deadline = Date.now() + 30000;
for (;;) {
  try { const res = await fetch(url); if (res.ok) break; } catch { /* not up yet */ }
  if (Date.now() > deadline) { server.kill(); throw new Error("preview server did not start"); }
  await new Promise((r) => setTimeout(r, 300));
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--autoplay-policy=user-gesture-required"] });

/** Settle the boot catch-up, then dismiss the return report (single panel). */
async function settleAndDismiss(page) {
  // The boot credit is synchronous in createStore, so the report is already
  // mounted when the shell appears; a bounded wait covers slow first paints.
  try {
    await page.waitForSelector(".panel--report", { timeout: 2500 });
  } catch { /* no absence worth a report */ }
  const close = await page.$(".panel--report .panel__head .icon-btn");
  if (close) {
    await close.click();
    await page.waitForSelector(".panel--report", { state: "detached" });
  }
}

async function measure(name, viewport, dsf, isMobile, scale) {
  const text = buildImported(scale);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
  await ctx.addInitScript(([key, val]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, val); }, [SAVE_KEY, text]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
  await page.click(".gate__btn");
  await page.waitForSelector(".dock, .shell-rail", { timeout: 20000 });
  await settleAndDismiss(page);
  const railSlot = await page.$('.shell-rail__slot[data-slot="yard"]');
  if (railSlot && (await railSlot.boundingBox())?.width > 0) await railSlot.click();
  else {
    const btns = await page.$$(".dock button");
    for (const b of btns) { if (((await b.textContent()) || "").trim().startsWith("Yard")) { await b.click(); break; } }
  }
  await page.waitForSelector(PANEL, { timeout: 8000 });

  const dump = await page.evaluate((sel) => {
    const rect = (n) => (n ? (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(n.getBoundingClientRect()) : null);
    const hud = document.querySelector(".hud");
    const panel = document.querySelector(sel);
    const head = panel.querySelector(".panel__head");
    const body = panel.querySelector(".panel__body");
    const cs = getComputedStyle(panel);
    const rootCs = getComputedStyle(document.documentElement);
    const panels = [...hud.querySelectorAll(":scope > .panel")].map((p) => ({
      cls: p.className, aria: p.getAttribute("aria-label"), rect: rect(p), maxH: getComputedStyle(p).maxHeight,
    }));
    const heights = (selector) => [...panel.querySelectorAll(selector)].map((n) => ({
      cls: n.className, text: (n.textContent || "").trim().slice(0, 24), h: Math.round(n.getBoundingClientRect().height * 100) / 100,
    }));
    return {
      viewport: { w: innerWidth, h: innerHeight },
      rootFont: rootCs.fontSize,
      scaleVar: rootCs.getPropertyValue("--text-scale").trim(),
      textLarge: document.documentElement.classList.contains("text-large"),
      inspectorTop: rootCs.getPropertyValue("--shell-inspector-top").trim(),
      hudRect: rect(hud),
      leadRect: rect(document.querySelector(".hud__lead")),
      dockRect: rect(document.querySelector(".dock")),
      panels,
      panelPadding: cs.padding, panelGap: cs.gap,
      headRect: rect(head),
      body: { scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, rect: rect(body) },
      elements: {
        stats: heights(".save-stat"),
        actions: heights(".panel__actions"),
        buttons: heights("button"),
        headings: heights(".save-heading"),
        labels: heights(".panel__field"),
        hints: heights(".save-hint"),
        codes: heights(".save-code"),
        status: heights(".status-line"),
      },
      pages: {},
    };
  }, PANEL);

  const pageHeights = () =>
    page.evaluate((sel) => {
      const panel = document.querySelector(sel);
      const body = panel.querySelector(".panel__body");
      const heights = (selector) => [...panel.querySelectorAll(selector)].map((n) => ({
        cls: n.className, text: (n.textContent || "").trim().slice(0, 24), h: Math.round(n.getBoundingClientRect().height * 100) / 100,
      }));
      return {
        scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflow: body.scrollHeight - body.clientHeight,
        elements: {
          headings: heights(".save-heading"), labels: heights(".panel__field"), hints: heights(".save-hint"),
          codes: heights(".save-code"), actions: heights(".panel__actions"), buttons: heights(".panel__actions button"),
          status: heights(".status-line"), stats: heights(".save-stat"),
        },
      };
    }, PANEL);
  const clickPanel = (label) =>
    page.evaluate(({ sel, label }) => {
      const b = [...document.querySelectorAll(sel + " button")].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith(label));
      if (b) b.click();
    }, { sel: PANEL, label });

  dump.pages.record = await pageHeights();
  await clickPanel("Backup");
  await page.waitForSelector("#rustwake-save-export");
  dump.pages.backup = await pageHeights();
  await clickPanel("Back");
  await page.waitForSelector(`${PANEL} .save-stats`);
  await clickPanel("Import");
  await page.waitForSelector("#rustwake-save-import");
  dump.pages.replace = await pageHeights();

  console.log("==== " + name + " ====");
  console.log(JSON.stringify(dump, null, 1));
  await ctx.close();
}

try {
  for (const [name, viewport, dsf, isMobile] of [
    ["phone", { width: 390, height: 844 }, 2, true],
    ["phone-landscape", { width: 844, height: 390 }, 2, true],
    ["desktop", { width: 1920, height: 1080 }, 1, false],
  ]) {
    for (const scale of [1, 1.5, 2]) {
      await measure(`${name}-ts${scale}`, viewport, dsf, isMobile, scale);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
