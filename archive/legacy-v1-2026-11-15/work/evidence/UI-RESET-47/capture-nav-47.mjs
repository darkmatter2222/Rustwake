import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET/NAV (#47): painted prototype of the navigation path in navigation-spec.md,
// in the harness style committed for #45 (one read of the painted DOM beside each PNG, one press counter).
// Prereqs, from the worktree root: npm ci && npm run build, then in a second shell
//   node node_modules/vite/bin/vite.js preview --port 4173 --strictPort
// and then:  node work/evidence/UI-RESET-47/capture-nav-47.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = resolve(root, "work/evidence/UI-RESET-47/captures");
mkdirSync(out, { recursive: true });
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const exe = [process.env.CHROME_PATH, "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe", "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const seedPath = resolve(root, "docs/evidence/yard-mature.json");
const seedText = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : null;
const receipt = [];
let presses = 0;
// Auto-settle decomposition (#81): a settle wait is a frame step the sim takes by itself while the
// primary face reads "waits ..."; it is counted separately and is never a press.
let settleWaits = 0;
let settleMs = 0;
const resetCounters = () => { presses = 0; settleWaits = 0; settleMs = 0; };

// One read of what the player actually sees, taken in the same frame as the image.
const info = (page) => page.evaluate(() => {
  const txt = (s) => document.querySelector(s)?.textContent ?? null;
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  const de = document.documentElement;
  return { chips: txt(".resources"), objective: txt(".objective"), toast: txt(".toast"), panel: txt(".panel"), dock: [...document.querySelectorAll(".dock__btn, .gate__btn, .icon-btn")].map((n) => (n.textContent ?? "").trim()).filter(Boolean), buttons: document.querySelectorAll("button").length, docScroll: [de.scrollWidth, de.clientWidth, de.scrollHeight, de.clientHeight], sim: sim ? { tick: sim.tick, tutorial: sim.tutorial, machines: sim.machines.length, routes: sim.routes.length, credits: sim.credits, scrap: sim.store.scrap ?? 0, data: sim.store.data ?? 0, batches: sim.machines.reduce((a, m) => a + (m.batches ?? 0), 0) } : null };
});
const byText = (page, label) => page.evaluate((t) => { const n = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith(t)); if (!n || n.disabled) return false; n.click(); return true; }, label);
const shot = async (page, name, note) => { const s = await info(page); await page.screenshot({ path: resolve(out, name + ".png") }); receipt.push(Object.assign({ file: name + ".png", note, presses, settleWaits, settleMs }, s)); console.log(name + ".png - " + note + " [presses " + presses + ", settleWaits " + settleWaits + "] " + JSON.stringify(s.sim)); };
const install = (ctx, text, mut) => ctx.addInitScript(([raw, m]) => { const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }; const env = JSON.parse(raw); if (m) { for (const [path, value] of Object.entries(JSON.parse(m))) { let node = env; const parts = path.split("."); for (const q of parts.slice(0, -1)) node = node[q]; node[parts[parts.length - 1]] = value; } env.checksum = fnv(JSON.stringify(env.payload)); } localStorage.setItem("rustwake.save.v1", JSON.stringify(env)); }, [text, mut ? JSON.stringify(mut) : null]);
const wait = (page, ms) => page.waitForTimeout(ms);
const primaryLabel = (page) => page.evaluate(() => (document.querySelector(".dock__btn--primary")?.textContent ?? "").trim());
const branchCount = (page) => page.evaluate(() => document.querySelectorAll(".dock__btn--branch").length);
// One settle poll: while the primary face still reads "waits", let the sim run one 500 ms frame step.
const settle = async (page) => { for (let i = 0; i < 30; i += 1) { const l = await primaryLabel(page); if (!/waits/.test(l)) break; settleWaits += 1; settleMs += 500; await wait(page, 500); } };

// Every interaction is one press of one painted face; the counter is the currency of section 6.
const press = async (page, label) => { const ok = await byText(page, label); if (ok) presses += 1; await wait(page, 260); return ok; };
const pressPrimary = async (page) => { const n = await page.$(".dock__btn--primary"); if (!n) return false; await n.click(); presses += 1; await wait(page, 340); return true; };

// The canvas has no DOM hit targets, so selection is a coarse tap grid. A store, research,
// record or report panel that opens on the way is closed again and does not count as a selection.
const openMachine = async (page, x0, x1, y0, y1) => {
  for (let y = y0; y <= y1; y += 20) {
    for (let x = x0; x <= x1; x += 20) {
      await page.mouse.click(x, y);
      const t = await page.evaluate(() => document.querySelector(".panel")?.textContent ?? null);
      if (!t) continue;
      if (/^(Yard store|Research|Yard record|While you were away)/.test(t)) { await byText(page, "Close"); await wait(page, 120); continue; }
      presses += 1;   // the whole scan is one selection, as in the #45 journey map
      return t;
    }
  }
  return null;
};
const tap = async (page, sel) => { const n = await page.$(sel); if (!n) return false; await n.click(); presses += 1; await wait(page, 240); return true; };
const browser = await chromium.launch({ executablePath: exe });
const make = async (w, h, dpr, mobile, seed, mut) => { const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile }); if (seed) await install(c, seed, mut); const p = await c.newPage(); await p.goto(url, { waitUntil: "networkidle" }); await p.waitForSelector("text=Begin recovery"); return { c, p }; };
const begin = async (pg) => { await pg.click("text=Begin recovery"); await wait(pg, 300); };
const paste = (page, text) => page.evaluate((v) => { const el = document.querySelector("#rustwake-save-import"); if (!el) return false; const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); return true; }, text);

// The ladder head is the only face that makes progress, so each step presses it while its
// label still names that step, then reads the painted line back. No step is assumed.

const pressWhile = async (page, prefix, max) => {
  for (let i = 0; i < max; i += 1) {
    const l = await primaryLabel(page);
    if (!l.startsWith(prefix)) return l;
    await pressPrimary(page);
  }
  return primaryLabel(page);
};

const path = [];
try {
  // A. one continuous fresh session at 390x844: salvage, build, inspect, sell, upgrade, then the settings and save faces.
  { const { c, p } = await make(390, 844, 2, true, null, null);
    await press(p, "Begin recovery");
    await shot(p, "01-nav-phone-rest-step0", "rest at tutorial 0: three dock faces, Store / Salvage / Build");
    await pressWhile(p, "Salvage", 14);
    await shot(p, "02-nav-phone-salvage-counted", "salvage counted, the priced repair face has taken the primary slot");
    await pressWhile(p, "Repair", 2);
    await settle(p);
    await shot(p, "03-nav-phone-repair-priced", "the drone repair just committed");
    await press(p, "Build");
    await shot(p, "04-nav-phone-build-ghost", "build phase: Cancel / Build Scrap sorter / Next");
    await pressPrimary(p);
    await shot(p, "05-nav-phone-placed", "after the placing press: the dock is back to its resting faces");
    const opened = await openMachine(p, 60, 330, 150, 560);
    await shot(p, "06-nav-phone-inspect", "machine inspector over the world, 20 px canvas grid");
    await press(p, "Close");
    await pressWhile(p, "Connect", 3);
    await shot(p, "07-nav-phone-connected", "the connect step committed from the primary slot");
    await press(p, "Build");
    await press(p, "Next");
    await settle(p);
    await pressPrimary(p);
    await shot(p, "08-nav-phone-furnace-placed", "furnace placed from the same two-press build step");
    await pressWhile(p, "Connect", 3);
    const opened2 = await openMachine(p, 60, 330, 150, 560);
    await shot(p, "09-nav-phone-two-machines", "inspector painted on the phone at the first machine, ladder head moved on");
    await pressWhile(p, "Sell", 2);
    await shot(p, "10-nav-phone-first-sale", "the first sale landed, the credits chip changes");
    for (let i = 0; i < 12; i += 1) { if ((await branchCount(p)) > 0) break; await pressPrimary(p); }
    const fork = await p.evaluate(() => [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()));
    await shot(p, "11-nav-phone-fork", "the upgrade fork: two priced faces, one accented, dock " + fork.join(" / "));
    if ((await branchCount(p)) > 0) await pressPrimary(p);
    await press(p, "Store");
    await shot(p, "12-nav-phone-store-rows", "store rows with their sell faces");
    await press(p, "Close");
    const hasYard = await press(p, "Yard");
    await shot(p, "13-nav-phone-record-copy", "yard record page with Copy and Import, reachable=" + hasYard);
    await press(p, "Copy");
    await press(p, "Import");
    await paste(p, "{not a rustwake envelope"); presses += 1;
    await shot(p, "17-nav-phone-import-failure", "error state: malformed paste, reason line, Apply and Back");
    await press(p, "Back");
    await press(p, "Close");
    await press(p, "A ");
    await shot(p, "14-nav-phone-text-scale-2", "settings face pressed once: the text scale steps to A 1.25");
    await press(p, "Sound");
    await shot(p, "15-nav-phone-muted", "the second settings face: sound muted, the label flips to Sound X");
    path.push({ session: "A fresh 390x844", presses, autoSettle: { waits: settleWaits, ms: settleMs, note: "500 ms sim frame steps while the primary reads waits; not presses" }, inspectorFirstTry: opened, inspectorSecondTry: opened2 ? opened2.slice(0, 60) : null, fork });
    console.log("path A presses:", presses, "panel:", opened ? opened.slice(0, 44) : "not opened");
    await c.close(); }
  // B. the same path states at the other measured bands, plus the synthetic states, one patch each.
  { const { c, p } = await make(390, 844, 2, true, seedText, { "payload.sim.storeUnits": 900, "payload.sim.overflow": [{ resource: "plates", qty: 41, atTick: 18298 }] });
    await begin(p); await wait(p, 1500); await byText(p, "Back to yard"); await wait(p, 250); resetCounters();
    await press(p, "Store");
    await shot(p, "16-nav-phone-store-full", "full state: 900/900 plus the overflow hold row");
    const sold = await press(p, "Sell ");
    path.push({ session: "B full store, phone 390x844", presses, soldFirstSellFace: sold, note: "rest to sell face, the shortest loop" });
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, seedText, { "payload.sim.credits": 0 });
    await begin(p); await wait(p, 1500); await byText(p, "Back to yard"); await wait(p, 250); resetCounters();
    await openMachine(p, 60, 330, 150, 560);
    await shot(p, "18-nav-phone-unaffordable", "disabled state to paint: credits 0, the priced faces still read enabled");
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, seedText, null);
    await begin(p); await wait(p, 1500); await byText(p, "Back to yard"); await wait(p, 250); resetCounters();
    const seen = [];
    for (const face of ["Store", "Yard", "Build", "Research"]) { seen.push(face + "=" + String(await press(p, face))); await press(p, "Close"); }
    path.push({ session: "C mature rest, phone 390x844", presses, tour: seen, note: "every destination costs an open and a Close" });
    await shot(p, "25-nav-phone-mature-research", "the research sheet at the mature stage, one Close face");
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, null, null);
    await begin(p); resetCounters();
    await shot(p, "19-nav-phone-research-absent", "disabled state to paint: the Research destination has no face at this stage");
    await c.close(); }
  { const { c, p } = await make(1920, 1080, 1, false, seedText, null);
    await begin(p); await wait(p, 1600); await byText(p, "Back to yard"); await wait(p, 250); resetCounters();
    await openMachine(p, 600, 1300, 250, 800);
    await shot(p, "20-nav-desktop1920-inspect", "1920x1080 inspector in the right gutter, five dock faces behind it");
    await c.close(); }
  { const { c, p } = await make(1366, 768, 1, false, seedText, null);
    await begin(p); await wait(p, 1600); await byText(p, "Back to yard"); await wait(p, 250); resetCounters();
    await press(p, "Store");
    await shot(p, "21-nav-desktop1366-store", "1366x768 narrow laptop: the store sheet is the gutter column at x 1104");
    await c.close(); }
  { const { c, p } = await make(2560, 1440, 1, false, seedText, { "payload.sim.storeUnits": 900, "payload.sim.overflow": [{ resource: "plates", qty: 41, atTick: 18298 }] });
    await begin(p); await wait(p, 1600); await byText(p, "Back to yard"); await wait(p, 250); resetCounters();
    await press(p, "Store");
    await shot(p, "22-nav-desktop2560-store", "2560x1440: the sheet at x 1104 lands inside the 896..1662 ink (finding 3)");
    await c.close(); }
  { const { c, p } = await make(844, 390, 2, true, seedText, null);
    await begin(p); await wait(p, 1500); resetCounters();
    await press(p, "Store");
    await shot(p, "23-nav-landscape844-store", "844x390 landscape: sheet 560x157 over a 230 px ink column");
    await press(p, "Close"); await wait(p, 150);
    await openMachine(p, 320, 520, 40, 320);
    await shot(p, "24-nav-landscape844-inspect", "844x390 landscape: inspector plus the fork inside a 46 px row band");
    await c.close(); }
  writeFileSync(resolve(out, "captures-nav.json"), JSON.stringify({ task: "UI-RESET/NAV #47 prototype path", issue: "https://github.com/darkmatter2222/Rustwake/issues/47", headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp", tool: "playwright-core plus local Chrome/Edge, vite preview, one painted read per PNG", seed: "docs/evidence/yard-mature.json plus the #45 synthetic patches", pressConvention: "one press = one painted face activated once; a canvas selection scan counts as one press (#45 J1 convention); settleWaits/settleMs are auto-settle frame steps, never presses", headShaConvention: "stamped by stamp-headsha-47.mjs to the captures commit; see README.md", baseline: { firstSessionJ1Presses: 16, batchesPerSecondAtThatPoint: "0.00" }, sessions: path, captures: receipt }, null, 2) + String.fromCharCode(10));
  console.log("wrote " + receipt.length + " captures; sessions: " + JSON.stringify(path));
} finally {
  await browser.close();
}
