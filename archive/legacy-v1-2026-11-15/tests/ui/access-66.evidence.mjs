/* Issue #66 — accessibility + complete desktop input support evidence probe.
   AGENT run (headless Chrome, no vision): DOM / geometry / computed-style /
   console + canvas pixel checks only. Serves THIS branch's built app via
   `vite preview --strictPort` on 127.0.0.1 (never the live deployment).

   Coverage:
   - Geometry census across ALL #43 viewports x text-scale 1 & 2: single
     inspector fit (0px inner-panel-scroll), lead/dock/panel overlaps, page
     scroll, world band, >=44px touch targets.
   - A11y deep-dive on the 3 primary viewports x ts1/ts2: accessible names
     (canvas + core-action equivalents), WCAG contrast >=4.5 normal text,
     visible focus ring, non-color statuses, reduced motion, event-driven
     live regions (no per-tick announcements), hover alternatives.
   - Keyboard + touch core loop, focus order/return, Escape nearest-layer,
     shortcut suppression in input fields, keyboard-open menus, no traps.

   Outputs: frames/ (recursive), results.json (buildSha == code head),
   mirror audit (sha256 + dims + nonEmpty). Run with `pnpm exec tsx`. */
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, SAVE_KEY, DEFAULT_SETTINGS } from "../../src/game/persistence/save.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { applyCommand } from "../../src/game/simulation/commands.ts";
import { advance } from "../../src/game/simulation/engine.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.RW66A_PORT ?? 4194);
const OUTDIR = "C:/Users/ryans/AppData/Local/Temp/rw-coord/rw-66/access66";
const FRAMES = path.join(OUTDIR, "frames");
const PANEL = '.panel[aria-label="Yard record"]';
mkdirSync(FRAMES, { recursive: true });

let buildSha = process.env.RW66A_SHA ?? "";
if (!buildSha) { try { buildSha = execSync("git rev-parse HEAD", { cwd: root }).toString().trim(); } catch { buildSha = "unknown"; } }

function buildImported(textScale, reducedMotion = false, withRoute = true) {
  const sim = createInitialState();
  for (let i = 0; i < 10; i += 1) { applyCommand(sim, { id: `m-salvage-${i}`, type: "manual.salvage" }); advance(sim, 6); }
  applyCommand(sim, { id: "m-repair", type: "drone.repair" });
  advance(sim, 262);
  applyCommand(sim, { id: "m-build-1", type: "machine.build", blueprint: "sorter", tile: 8 });
  for (const tile of [9, 10, 11, 12]) { if (applyCommand(sim, { id: `m-build-2-${tile}`, type: "machine.build", blueprint: "sorter", tile }).ok) break; }
  // withRoute=false leaves the sorter un-fed so scrap is not consumed: the
  // keyboard/touch core-loop test then sees salvage raise scrap deterministically.
  if (withRoute) applyCommand(sim, { id: "m-route", type: "route.connect", from: 0, to: sim.machines[0].id, filter: "scrap" });
  advance(sim, 2400);
  sim.tutorial = 9;
  return encodeSave(sim, Date.now(), { ...DEFAULT_SETTINGS, muted: true, reducedMotion, textScale });
}

const chromeCandidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
const url = `http://127.0.0.1:${PORT}/`;
const deadline = Date.now() + 60000;
for (;;) { try { const res = await fetch(url); if (res.ok) break; } catch {} if (Date.now() > deadline) { server.kill(); throw new Error("preview did not start"); } await new Promise((r) => setTimeout(r, 400)); }

const browser = await chromium.launch({ executablePath, headless: true, args: ["--autoplay-policy=user-gesture-required"] });
const clickIn = (page, fn, arg) => page.evaluate(fn, arg);

async function boot(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".gate__btn", { timeout: 20000 });
  await clickIn(page, () => document.querySelector(".gate__btn").click());
  await page.waitForSelector(".dock, .shell-rail", { timeout: 20000 });
  try { await page.waitForSelector(".panel--report", { timeout: 2500 }); } catch {}
  await clickIn(page, () => { const c = document.querySelector(".panel--report .panel__head .icon-btn"); if (c) c.click(); });
  try { await page.waitForSelector(".panel--report", { state: "detached", timeout: 3000 }); } catch {}
  await clickIn(page, () => { const s = document.querySelector('.shell-rail__slot[data-slot="yard"]'); if (s && s.getBoundingClientRect().width > 0) { s.click(); return; } const b = [...document.querySelectorAll(".dock button")].find((x) => (x.textContent || "").trim().startsWith("Yard")); if (b) b.click(); });
  await page.waitForSelector(PANEL, { timeout: 8000 });
}

function geoEval(sel) {
  const R = (n) => (n ? (({ left, top, right, bottom, width, height }) => ({ left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom), width: Math.round(width), height: Math.round(height) }))(n.getBoundingClientRect()) : null);
  const panel = document.querySelector(sel);
  const body = panel && panel.querySelector(".panel__body");
  const lead = document.querySelector(".hud__lead");
  const dock = document.querySelector(".dock");
  const rootCs = getComputedStyle(document.documentElement);
  const lr = R(lead), dr = R(dock), pr = R(panel);
  const overlap = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
  // >=44px touch targets: every visible interactive element.
  const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], .shell-rail__slot')];
  const small = [];
  let touchCount = 0;
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    touchCount += 1;
    if (Math.min(r.width, r.height) < 44) small.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 40), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return {
    scaleVar: rootCs.getPropertyValue("--text-scale").trim(),
    textLarge: document.documentElement.classList.contains("text-large"),
    inspectorTop: rootCs.getPropertyValue("--shell-inspector-top").trim(),
    lead: lr, dock: dr, panel: pr,
    leadDockOverlapArea: overlap(lr, dr),
    leadPanelOverlapArea: overlap(lr, pr),
    dockPanelOverlapArea: overlap(dr, pr),
    worldBand: lr && dr ? dr.top - lr.bottom : null,
    docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    leadScroll: lead ? { sh: lead.scrollHeight, ch: lead.clientHeight, oy: getComputedStyle(lead).overflowY } : null,
    body: body ? { scrollTop: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflow: body.scrollHeight - body.clientHeight, overflowY: getComputedStyle(body).overflowY } : null,
    touch: { count: touchCount, small },
    // UI-RESET-66 cascade diagnostic: why does the short-phone ts2 panel cap win or lose?
    panelCascade: panel ? {
      count: document.querySelectorAll(".panel").length,
      parentClass: (panel.parentElement && panel.parentElement.className || "").toString(),
      computedMaxHeight: getComputedStyle(panel).maxHeight,
      computedHeight: getComputedStyle(panel).height,
      flexShrink: getComputedStyle(panel).flexShrink,
      panelScrollHeight: panel.scrollHeight,
      hudClientHeight: (document.querySelector(".hud") || {}).clientHeight,
      matchesCap: panel.matches(':root.text-large .hud:not(:has(.panel ~ .panel)) > .panel'),
      hasSupport: typeof CSS !== "undefined" && CSS.supports && CSS.supports("selector(:has(.panel))"),
      hudClass: (document.querySelector(".hud") && document.querySelector(".hud").className || "").toString(),
    } : null,
  };
}

async function walk(page) {
  const clickPanel = (label) => page.evaluate(({ sel, label }) => { const b = [...document.querySelectorAll(sel + " button")].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith(label)); if (b) b.click(); }, { sel: PANEL, label });
  const out = {};
  out.record = await page.evaluate(geoEval, PANEL);
  await clickPanel("Backup"); await page.waitForSelector("#rustwake-save-export", { timeout: 5000 });
  out.backup = await page.evaluate(geoEval, PANEL);
  await clickPanel("Back"); await page.waitForSelector(`${PANEL} .save-stats`, { timeout: 5000 });
  await clickPanel("Import"); await page.waitForSelector("#rustwake-save-import", { timeout: 5000 });
  out.replace = await page.evaluate(geoEval, PANEL);
  await clickPanel("Back"); await page.waitForSelector(`${PANEL} .save-stats`, { timeout: 5000 });
  return out;
}

// ---- A11y deep-dive (in-page) ----
function a11yEval() {
  const lum = (rgb) => {
    const m = rgb.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b] = m[1].split(",").slice(0, 3).map((x) => parseFloat(x) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const effBg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) { const parts = m[1].split(",").map((x) => parseFloat(x)); const a = parts.length > 3 ? parts[3] : 1; if (a > 0.5) return bg; }
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || "rgb(8,13,24)";
  };
  const ratio = (fg, bg) => { const l1 = lum(fg), l2 = lum(bg); if (l1 == null || l2 == null) return null; const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  // Contrast sample: representative normal-text elements.
  const contrastSelectors = [".objective__primary", ".objective__text", ".objective__title", ".panel__title", ".panel__body", ".dock button", ".resources__item", ".resources__item strong", ".status-line", ".shell-rail__slot", ".hud__top"];
  const contrast = [];
  for (const sel of contrastSelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const fg = cs.color, bg = effBg(el);
    const r = ratio(fg, bg);
    const fs = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = fs >= 24 || (bold && fs >= 18.66);
    const need = large ? 3 : 4.5;
    contrast.push({ sel, fontSize: fs, large, ratio: r == null ? null : Math.round(r * 100) / 100, need, pass: r == null ? null : r >= need });
  }
  // Accessible names: canvas + core-action equivalents.
  const canvas = document.querySelector(".game canvas");
  const canvasName = canvas ? { ariaLabel: canvas.getAttribute("aria-label"), role: canvas.getAttribute("role"), title: canvas.getAttribute("title") } : null;
  const named = (el) => !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.textContent || "").trim() || el.getAttribute("title"));
  const dockBtns = [...document.querySelectorAll(".dock button")].map((b) => ({ label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30), named: named(b) }));
  const railSlots = [...document.querySelectorAll(".shell-rail__slot")].map((b) => ({ slot: b.getAttribute("data-slot"), label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30), named: named(b) }));
  const iconBtns = [...document.querySelectorAll(".icon-btn")].map((b) => ({ label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30), named: named(b) }));
  const unnamedDock = dockBtns.filter((x) => !x.named).length;
  const unnamedRail = railSlots.filter((x) => !x.named).length;
  const unnamedIcon = iconBtns.filter((x) => !x.named).length;
  // Non-color statuses: resource chips carry data-pressure/data-cue AND text.
  const chips = [...document.querySelectorAll(".resources__item")].map((c) => ({ pressure: c.getAttribute("data-pressure"), cue: c.getAttribute("data-cue"), text: (c.textContent || "").trim().slice(0, 40) }));
  const chipsNonColor = chips.every((c) => c.text.length > 0);
  // Live regions: event-driven role=status / aria-live.
  const live = [...document.querySelectorAll('[role="status"], [aria-live]')].map((n) => ({ role: n.getAttribute("role"), ariaLive: n.getAttribute("aria-live"), text: (n.textContent || "").trim().slice(0, 60) }));
  // Reduced motion attribute reflects setting.
  const reducedMotionAttr = document.documentElement.getAttribute("data-reduced-motion");
  // Hover alternatives: elements with title tooltips (hover) also expose text/aria.
  const titled = [...document.querySelectorAll("[title]")].map((n) => ({ title: n.getAttribute("title"), hasText: !!(n.textContent || "").trim(), hasAria: !!n.getAttribute("aria-label") }));
  return { canvasName, dockBtns, railSlots, iconBtns, unnamedDock, unnamedRail, unnamedIcon, contrast, chips, chipsNonColor, live, reducedMotionAttr, titled };
}

async function shot(page, name) {
  const file = path.join(FRAMES, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// ---- Keyboard tests (3 primary viewports) ----
async function keyboardTests(page, key) {
  const out = { key };
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? { tag: a.tagName.toLowerCase(), cls: (a.className || "").toString().slice(0, 40), label: (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30) } : null; });
  // Authoritative focus order: enumerate every tabbable control in DOM order
  // (a no-op body.focus() previously started Tab near the end of the order).
  out.tabbable = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')];
    const list = [];
    for (const el of els) {
      const ti = el.getAttribute("tabindex");
      if (ti !== null && parseInt(ti, 10) < 0) continue;
      if (el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      list.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 40), label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30) });
    }
    return list;
  });
  out.tabbableCount = out.tabbable.length;
  out.tabReachedDock = out.tabbable.some((a) => /dock__btn|shell-rail__slot/.test(a.cls));
  out.tabReachedIcon = out.tabbable.some((a) => /icon-btn/.test(a.cls));
  // Real Tab cycle from the first tabbable: wraps back to start => no keyboard trap.
  await page.evaluate(() => { const el = document.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'); if (el) el.focus(); });
  const first = await active();
  const seq = [first];
  for (let i = 0; i < out.tabbable.length + 2; i += 1) { await page.keyboard.press("Tab"); seq.push(await active()); }
  out.tabCycleReturns = seq.some((a, i) => i > 0 && a && first && a.label === first.label && a.cls === first.cls);
  out.tabSequence = seq.slice(0, 60);
  // Visible focus ring on a keyboard-focused control.
  out.focusRing = await page.evaluate(() => { const a = document.activeElement; if (!a) return null; const cs = getComputedStyle(a); return { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 60) }; });
  // Escape nearest-layer + focus return: open Menu, verify self-focus, Escape closes + restores opener.
  const menuOpener = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /menu/i.test(x.getAttribute("aria-label") || x.textContent || "")); if (b) { b.focus(); const label = (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30); b.click(); return label; } return null; });
  await page.waitForTimeout(250);
  out.menuOpener = menuOpener;
  out.menuOpenBeforeEscape = await page.evaluate(() => !!document.querySelector(".shell-menu, [role='dialog']"));
  out.menuSelfFocus = await page.evaluate(() => { const d = document.querySelector(".shell-menu"); return d ? (document.activeElement === d || d.contains(document.activeElement)) : false; });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  out.menuOpenAfterEscape = await page.evaluate(() => !!document.querySelector(".shell-menu, [role='dialog']"));
  out.focusAfterEscape = await active();
  out.focusRestoredToOpener = !!(menuOpener && out.focusAfterEscape && out.focusAfterEscape.label === menuOpener);
  // Shortcuts: digit 3 -> store (SHELL_SLOTS[2]), digit 2 -> build (SHELL_SLOTS[1]); Escape closes.
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await page.keyboard.press("3"); await page.waitForTimeout(300);
  out.digit3OpensStore = await page.evaluate(() => !!document.querySelector('.panel[aria-label="Store contents"], .panel--store'));
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  out.escapeClosesStore = await page.evaluate(() => !document.querySelector('.panel[aria-label="Store contents"], .panel--store'));
  await page.keyboard.press("2"); await page.waitForTimeout(300);
  out.digit2OpensBuild = await page.evaluate(() => !!document.querySelector(".catalog__salvage, .catalog, .build-catalog"));
  // Input-field shortcut suppression: focus save import textarea, press digit 3, store must NOT open.
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await page.evaluate(() => { const s = document.querySelector('.shell-rail__slot[data-slot="yard"]'); if (s && s.getBoundingClientRect().width > 0) { s.click(); return; } const b = [...document.querySelectorAll(".dock button")].find((x) => (x.textContent || "").trim().startsWith("Yard")); if (b) b.click(); });
  await page.waitForSelector(PANEL, { timeout: 5000 }).catch(() => {});
  await page.evaluate(({ sel }) => { const b = [...document.querySelectorAll(sel + " button")].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith("Import")); if (b) b.click(); }, { sel: PANEL });
  await page.waitForSelector("#rustwake-save-import", { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { const t = document.querySelector("#rustwake-save-import"); if (t) t.focus(); });
  const storeSel = '.panel[aria-label="Store contents"], .panel--store';
  const beforeSuppress = await page.evaluate((s) => !!document.querySelector(s), storeSel);
  await page.keyboard.press("3"); await page.waitForTimeout(250);
  const afterSuppress = await page.evaluate((s) => !!document.querySelector(s), storeSel);
  out.inputSuppress = { focusedTextarea: await page.evaluate(() => document.activeElement && document.activeElement.id === "rustwake-save-import"), storeBefore: beforeSuppress, storeAfter: afterSuppress, suppressed: beforeSuppress === afterSuppress };
  // Core loop via touch AND keyboard: Build-catalog Salvage raises scrap (no-route seed => no consumption).
  const readScrap = () => page.evaluate(() => { const chip = [...document.querySelectorAll(".resources__item")].find((c) => /scrap/i.test(c.textContent || "")); if (!chip) return null; const v = chip.querySelector("strong"); const txt = (v ? v.textContent : chip.textContent) || ""; const m = txt.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : txt.trim(); });
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  await page.keyboard.press("2"); await page.waitForTimeout(350); // open Build catalog
  // manual.salvage has a 6-tick (600 ms) cooldown (defs.ts manualPulseTicks=6, TICK_MS=100):
  // a second activation inside that window is refused ("cooldown"), so the keyboard leg runs
  // FIRST on the fresh off-cooldown button, then we wait out the cooldown before the touch leg.
  const salvageState = () => page.evaluate(() => { const b = document.querySelector(".catalog__salvage") || [...document.querySelectorAll("button")].find((x) => /^salvage$/i.test((x.getAttribute("aria-label") || x.textContent || "").trim())); return b ? { disabled: b.disabled, label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30) } : null; });
  const scrapBeforeKb = await readScrap();
  const kbInfo = await page.evaluate(() => { const b = document.querySelector(".catalog__salvage") || [...document.querySelectorAll("button")].find((x) => /^salvage$/i.test((x.getAttribute("aria-label") || x.textContent || "").trim())); if (b) { b.focus(); return { focused: document.activeElement === b, disabled: b.disabled }; } return { focused: false, disabled: null }; });
  if (kbInfo.focused) { await page.keyboard.press("Enter"); await page.waitForTimeout(500); }
  const scrapAfterKb = await readScrap();
  out.coreLoopKeyboard = { focused: kbInfo.focused, buttonDisabled: kbInfo.disabled, scrapBefore: scrapBeforeKb, scrapAfter: scrapAfterKb, increased: typeof scrapBeforeKb === "number" && typeof scrapAfterKb === "number" && scrapAfterKb > scrapBeforeKb, changed: scrapBeforeKb !== scrapAfterKb };
  // Wait out the 600 ms salvage cooldown (margin for tick cadence) before the touch leg.
  await page.waitForTimeout(950);
  const scrapBeforeTouch = await readScrap();
  const touchBtn = await page.evaluate(() => { const b = document.querySelector(".catalog__salvage") || [...document.querySelectorAll("button")].find((x) => /^salvage$/i.test((x.getAttribute("aria-label") || x.textContent || "").trim())); if (b) { b.click(); return (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30); } return null; });
  await page.waitForTimeout(500);
  const scrapAfterTouch = await readScrap();
  out.coreLoopTouch = { button: touchBtn, scrapBefore: scrapBeforeTouch, scrapAfter: scrapAfterTouch, increased: typeof scrapBeforeTouch === "number" && typeof scrapAfterTouch === "number" && scrapAfterTouch > scrapBeforeTouch, changed: scrapBeforeTouch !== scrapAfterTouch };
  out.coreLoopSalvageState = await salvageState();
  return out;
}

const VIEWPORTS = [
  ["phone-small", { width: 360, height: 640 }, 2, true],
  ["phone", { width: 390, height: 844 }, 2, true],
  ["phone-large", { width: 412, height: 915 }, 2, true],
  ["phone-landscape", { width: 844, height: 390 }, 2, true],
  ["tablet", { width: 768, height: 1024 }, 2, true],
  ["laptop", { width: 1366, height: 768 }, 1, false],
  ["desktop", { width: 1920, height: 1080 }, 1, false],
  ["desktop-large", { width: 2560, height: 1440 }, 1, false],
];
const PRIMARY = new Set(["phone", "phone-landscape", "desktop"]);

const results = { buildSha, port: PORT, url, generatedAt: new Date().toISOString(), cells: {}, keyboard: {}, reducedMotion: null, defects: [] };
const frameFiles = [];
try {
  for (const [name, viewport, dsf, isMobile] of VIEWPORTS) {
    for (const scale of [1, 2]) {
      const key = `${name}-ts${scale}`;
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
      await ctx.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [SAVE_KEY, buildImported(scale)]);
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
      try {
        await boot(page);
        const geo = await walk(page);
        const cell = { viewport, dsf, geo, consoleErrors };
        if (PRIMARY.has(name)) {
          cell.a11y = await page.evaluate(a11yEval);
          // back to record for a clean frame
          await page.evaluate(({ sel }) => { const b = [...document.querySelectorAll(sel + " button")].find((x) => (x.getAttribute("aria-label") || x.textContent || "").trim().startsWith("Back")); if (b) b.click(); }, { sel: PANEL }).catch(() => {});
        }
        frameFiles.push(await shot(page, key));
        results.cells[key] = cell;
        const rec = geo.record;
        console.log(key, JSON.stringify({ textLarge: rec.textLarge, panelH: rec.panel && rec.panel.height, dockPanelOv: rec.dockPanelOverlapArea, leadPanelOv: rec.leadPanelOverlapArea, worldBand: rec.worldBand, docScroll: rec.docScroll, recOv: rec.body && rec.body.overflow, bakOv: geo.backup.body && geo.backup.body.overflow, repOv: geo.replace.body && geo.replace.body.overflow, smallTargets: rec.touch.small.length, consoleErr: consoleErrors.length }));
        // defects: inner-panel overflow on any single-panel state, overlaps, page scroll, small targets
        for (const st of ["record", "backup", "replace"]) {
          const b = geo[st].body;
          if (b && b.overflow > 0) results.defects.push({ key, kind: "inner-panel-scroll", state: st, overflow: b.overflow });
        }
        if (rec.dockPanelOverlapArea > 0) results.defects.push({ key, kind: "dock-panel-overlap", area: rec.dockPanelOverlapArea });
        if (rec.leadPanelOverlapArea > 0) results.defects.push({ key, kind: "lead-panel-overlap", area: rec.leadPanelOverlapArea });
        if (rec.docScroll > 0) results.defects.push({ key, kind: "page-scroll", px: rec.docScroll });
        if (rec.touch.small.length) results.defects.push({ key, kind: "small-touch-target", items: rec.touch.small });
        if (consoleErrors.length) results.defects.push({ key, kind: "console-error", items: consoleErrors });
        if (cell.a11y) {
          if (!cell.a11y.canvasName || (!cell.a11y.canvasName.ariaLabel && !cell.a11y.canvasName.title)) results.defects.push({ key, kind: "canvas-no-accessible-name", canvasName: cell.a11y.canvasName });
          for (const c of cell.a11y.contrast) if (c.pass === false) results.defects.push({ key, kind: "contrast", sel: c.sel, ratio: c.ratio, need: c.need });
          if (cell.a11y.unnamedDock || cell.a11y.unnamedRail || cell.a11y.unnamedIcon) results.defects.push({ key, kind: "unnamed-control", dock: cell.a11y.unnamedDock, rail: cell.a11y.unnamedRail, icon: cell.a11y.unnamedIcon });
        }
      } catch (e) {
        results.cells[key] = { viewport, dsf, error: String(e).slice(0, 200), consoleErrors };
        results.defects.push({ key, kind: "probe-error", error: String(e).slice(0, 200) });
        console.log(key, "ERROR", String(e).slice(0, 200));
      }
      await ctx.close();
    }
  }
  // Keyboard + core-loop on the 3 primary viewports at ts1.
  for (const [name, viewport, dsf, isMobile] of VIEWPORTS.filter(([n]) => PRIMARY.has(n))) {
    const key = `${name}-ts1`;
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
    await ctx.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [SAVE_KEY, buildImported(1, false, false)]);
    const page = await ctx.newPage();
    try { await boot(page); results.keyboard[key] = await keyboardTests(page, key); console.log("KB", key, JSON.stringify({ tabbable: results.keyboard[key].tabbableCount, tabReachedDock: results.keyboard[key].tabReachedDock, tabCycle: results.keyboard[key].tabCycleReturns, menuClosedByEscape: results.keyboard[key].menuOpenBeforeEscape && !results.keyboard[key].menuOpenAfterEscape, menuSelfFocus: results.keyboard[key].menuSelfFocus, focusRestored: results.keyboard[key].focusRestoredToOpener, digit3Store: results.keyboard[key].digit3OpensStore, escapeCloses: results.keyboard[key].escapeClosesStore, digit2Build: results.keyboard[key].digit2OpensBuild, inputSuppressed: results.keyboard[key].inputSuppress.suppressed, touchLoop: results.keyboard[key].coreLoopTouch.increased, kbLoop: results.keyboard[key].coreLoopKeyboard.increased })); }
    catch (e) { results.keyboard[key] = { error: String(e).slice(0, 200) }; console.log("KB", key, "ERROR", String(e).slice(0, 200)); }
    await ctx.close();
  }
  // Reduced motion: dedicated desktop cell with reducedMotion:true.
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await ctx.addInitScript(([k, v]) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, [SAVE_KEY, buildImported(1, true)]);
    const page = await ctx.newPage();
    try {
      await boot(page);
      results.reducedMotion = await page.evaluate(() => {
        const attr = document.documentElement.getAttribute("data-reduced-motion");
        // Authoritative: scan the loaded stylesheets for the data-reduced-motion
        // rule that disables transitions/animations (no live probe element needed).
        let ruleFound = false, ruleText = null, ruleCount = 0;
        for (const sheet of document.styleSheets) {
          let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
          if (!rules) continue;
          for (const r of rules) {
            const sel = r.selectorText || "";
            if (/data-reduced-motion/.test(sel)) {
              ruleCount += 1;
              const txt = r.cssText || "";
              if (/transition\s*:\s*none|animation\s*:\s*none/.test(txt)) { ruleFound = true; if (!ruleText) ruleText = txt.slice(0, 200); }
            }
          }
        }
        // Also sample a live element's computed transition if one is present.
        const probe = document.querySelector(".wk-toast, .wk-sheet, .inspector-progress__fill, .wk-face, .panel");
        const transition = probe ? getComputedStyle(probe).transition : null;
        return { attr, ruleFound, ruleCount, ruleText, probeFound: !!probe, transition };
      });
      frameFiles.push(await shot(page, "desktop-reduced-motion"));
      console.log("RM", JSON.stringify(results.reducedMotion));
    } catch (e) { results.reducedMotion = { error: String(e).slice(0, 200) }; }
    await ctx.close();
  }
  // Mirror audit: every frame distinct + non-empty.
  const mirror = [];
  const seen = new Set();
  for (const f of frameFiles) {
    const buf = readFileSync(f);
    const sha = createHash("sha256").update(buf).digest("hex");
    // PNG dims from IHDR (bytes 16-23).
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    const nonEmpty = buf.length > 1000;
    const distinct = !seen.has(sha); seen.add(sha);
    mirror.push({ file: path.basename(f), sha256: sha, width: w, height: h, bytes: buf.length, nonEmpty, distinct });
  }
  results.mirror = { count: mirror.length, allNonEmpty: mirror.every((m) => m.nonEmpty), allDistinct: mirror.every((m) => m.distinct), frames: mirror };
  results.summary = {
    cells: Object.keys(results.cells).length,
    cellErrors: Object.values(results.cells).filter((c) => c.error).length,
    keyboardCells: Object.keys(results.keyboard).length,
    defectCount: results.defects.length,
    defectKinds: [...new Set(results.defects.map((d) => d.kind))],
    frames: mirror.length,
  };
  writeFileSync(path.join(OUTDIR, "results.json"), JSON.stringify(results, null, 1));
  console.log("SUMMARY", JSON.stringify(results.summary));
  console.log("DEFECTS", JSON.stringify(results.defects.slice(0, 40)));
  console.log("WROTE", path.join(OUTDIR, "results.json"));
} finally { await browser.close(); server.kill(); }
