import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET-AUDIT (#45): fresh headless baseline captures plus painted-DOM evidence
// for the pre-restart build. From the worktree root:
//   npm run build
//   npm run preview -- --port 4173   (separate shell)
//   node work/evidence/UI-RESET-45/capture-baseline-45.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = resolve(root, "work/evidence/UI-RESET-45/captures");
mkdirSync(out, { recursive: true });
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const exe = [process.env.CHROME_PATH, "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe", "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const seedPath = resolve(root, "docs/evidence/yard-mature.json");
const seedText = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : null;
const receipt = [];

// One read of what the player actually sees, taken in the same frame as the image.
const info = (page) => page.evaluate(() => {
  const txt = (s) => document.querySelector(s)?.textContent ?? null;
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  const de = document.documentElement;
  return {
    chips: txt(".resources"),
    objective: txt(".objective"),
    reconcile: txt(".reconcile"),
    toast: txt(".toast"),
    panel: txt(".panel"),
    dock: [...document.querySelectorAll(".dock__btn, .gate__btn, .icon-btn")].map((n) => (n.textContent ?? "").trim()).filter(Boolean),
    tick: sim ? sim.tick : null,
    docScroll: [de.scrollWidth, de.clientWidth, de.scrollHeight, de.clientHeight],
  };
});

const byText = (page, label, sel = "button") => page.evaluate(([t, s]) => { const n = [...document.querySelectorAll(s)].find((x) => (x.textContent ?? "").trim().startsWith(t)); if (!n) return false; n.click(); return true; }, [label, sel]);
const dock = (page, label) => byText(page, label, ".dock__btn");
const tap = async (page, sel) => { const n = await page.$(sel); if (!n) return false; await n.click(); return true; };
const shot = async (page, name, note) => { const s = await info(page); await page.screenshot({ path: resolve(out, name + ".png") }); receipt.push(Object.assign({ file: name + ".png", note }, s)); console.log(name + ".png - " + note); };

// Coarse tap grid until a panel opens: the canvas has no DOM hit targets.
const selectMachine = async (page, x0, x1, y0, y1) => {
  for (let y = y0; y <= y1; y += 20) {
    for (let x = x0; x <= x1; x += 20) {
      await page.mouse.click(x, y);
      const t = await page.evaluate(() => document.querySelector(".panel")?.textContent ?? null);
      if (t) return t;
    }
  }
  return null;
};

const install = (ctx, text, mut) => ctx.addInitScript(([raw, m]) => { const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }; const env = JSON.parse(raw); if (m) { for (const [path, value] of Object.entries(JSON.parse(m))) { let node = env; const parts = path.split("."); for (const q of parts.slice(0, -1)) node = node[q]; node[parts[parts.length - 1]] = value; } env.checksum = fnv(JSON.stringify(env.payload)); } localStorage.setItem("rustwake.save.v1", JSON.stringify(env)); }, [text, mut ? JSON.stringify(mut) : null]);

const browser = await chromium.launch({ executablePath: exe });
const make = async (w, h, dpr, mobile, seed, mut) => { const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile }); if (seed) await install(c, seed, mut); const p = await c.newPage(); await p.goto(url, { waitUntil: "networkidle" }); await p.waitForSelector("text=Begin recovery"); return { c, p }; };
const begin = async (p) => { await p.click("text=Begin recovery"); await p.waitForTimeout(250); };
try {
  { const { c, p } = await make(390, 844, 2, true, null, null);
    await shot(p, "01-phone-fresh-gate", "entry gate at 390x844 dpr2, no save yet");
    await begin(p);
    await shot(p, "02-phone-fresh-rest", "fresh rest: objective card, dock, empty yard");
    await dock(p, "Store"); await shot(p, "03-phone-fresh-store-empty", "StorePanel with an empty store"); await byText(p, "Close");
    for (let i = 0; i < 7; i += 1) { await tap(p, ".dock__btn--primary"); await p.waitForTimeout(320); }
    await shot(p, "04-phone-fresh-repair-face", "salvage counted, repair face with its price");
    await tap(p, ".dock__btn--primary"); await p.waitForTimeout(320);
    await dock(p, "Build"); await p.waitForTimeout(220); await p.mouse.move(150, 300); await p.waitForTimeout(120);
    await shot(p, "05-phone-fresh-build-ghost", "build phase: Cancel / Build X / Next plus ghost on a cell");
    await tap(p, ".dock__btn--primary"); await p.waitForTimeout(420);
    await shot(p, "06-phone-fresh-placed", "after the placing tap: dock back to its resting faces");
    const opened = await selectMachine(p, 60, 330, 150, 560);
    await shot(p, "07-phone-fresh-machine", "MachinePanel status page over the world");
    await byText(p, "Recipe"); await p.waitForTimeout(160);
    await shot(p, "08-phone-fresh-machine-recipe", "MachinePanel recipe page");
    await byText(p, "Close"); await p.waitForTimeout(150);
    await tap(p, ".dock__btn--primary"); await p.waitForTimeout(140);
    await shot(p, "09-phone-fresh-after-tap", "one more primary tap: toast or resting line");
    console.log("machine panel opened:", Boolean(opened));
    await c.close(); }
  { const { c, p } = await make(360, 640, 3, true, null, null);
    await begin(p);
    for (let i = 0; i < 3; i += 1) { await tap(p, ".dock__btn--primary"); await p.waitForTimeout(300); }
    await byText(p, "A "); await byText(p, "A "); await byText(p, "A ");
    await shot(p, "10-phone360-fresh-text2", "360x640 with the text size cycled to A 2");
    await c.close(); }
  { const { c, p } = await make(844, 390, 2, true, seedText, null);
    await begin(p); await p.waitForTimeout(1400);
    await shot(p, "11-landscape-mature-rest", "844x390 landscape with the seeded mature yard");
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, seedText, null);
    await begin(p); await p.waitForTimeout(30);
    await shot(p, "12-phone-mature-reconciling", "offline catch-up still in flight");
    await p.waitForTimeout(1800);
    await shot(p, "13-phone-mature-return-report", "ReturnReportPanel after a long capped absence");
    await byText(p, "Back to yard"); await p.waitForTimeout(300);
    await shot(p, "14-phone-mature-rest", "mature yard at rest at 390x844");
    await dock(p, "Store"); await shot(p, "15-phone-mature-store", "StorePanel: stock, capacity, sell rows, summary"); await byText(p, "Close"); await p.waitForTimeout(150);
    await dock(p, "Research"); await shot(p, "16-phone-mature-research", "ResearchPanel with every node known"); await byText(p, "Close"); await p.waitForTimeout(150);
    await dock(p, "Yard"); await shot(p, "17-phone-mature-yard-export", "YardPanel record page: stats, export field, Copy/Import");
    await byText(p, "Import"); await p.waitForTimeout(160);
    await p.evaluate(() => { const f = document.querySelector("#rustwake-save-import"); if (!f) return; const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set; set.call(f, "{not a rustwake envelope"); f.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.waitForTimeout(120); await byText(p, "Apply"); await p.waitForTimeout(160);
    await shot(p, "18-phone-mature-import-failure", "YardPanel import page after a malformed paste");
    await byText(p, "Back"); await byText(p, "Close"); await p.waitForTimeout(160);
    const opened = await selectMachine(p, 60, 330, 150, 560);
    await shot(p, "19-phone-mature-machine-fork", "MachinePanel plus the named branch faces in the dock");
    console.log("mature phone machine panel:", opened ? "opened" : "NOT opened");
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, seedText, { "payload.sim.storeUnits": 900, "payload.sim.overflow": [{ resource: "plates", qty: 41, atTick: 18298 }] });
    await begin(p); await p.waitForTimeout(1500); await byText(p, "Back to yard"); await p.waitForTimeout(250);
    await dock(p, "Store");
    await shot(p, "20-phone-mature-store-full", "StorePanel at 900/900 with an overflow hold row");
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, seedText, { "payload.sim.credits": 0 });
    await begin(p); await p.waitForTimeout(1500); await byText(p, "Back to yard"); await p.waitForTimeout(250);
    await selectMachine(p, 60, 330, 150, 560);
    await shot(p, "21-phone-mature-unaffordable", "credits 0: priced faces print their shortfall");
    await c.close(); }
  { const { c, p } = await make(1920, 1080, 1, false, seedText, null);
    await begin(p); await p.waitForTimeout(1600);
    await shot(p, "22-desktop1920-report", "1920x1080 with the return report as the boot layer");
    await byText(p, "Back to yard"); await p.waitForTimeout(250);
    await shot(p, "23-desktop1920-rest", "1920x1080 mature yard at rest");
    await selectMachine(p, 600, 1300, 250, 800);
    await shot(p, "24-desktop1920-machine", "1920x1080 inspector in the right gutter");
    await byText(p, "Close"); await dock(p, "Research");
    await shot(p, "25-desktop1920-research", "1920x1080 research list in the gutter column");
    await c.close(); }
  { const { c, p } = await make(1366, 768, 1, false, seedText, null);
    await begin(p); await p.waitForTimeout(1600);
    await shot(p, "26-desktop1366-report", "1366x768 laptop with the boot layer");
    await byText(p, "Back to yard"); await p.waitForTimeout(250);
    await selectMachine(p, 450, 950, 180, 600);
    await shot(p, "27-desktop1366-machine", "1366x768 inspector over the world column");
    await c.close(); }
  { const { c, p } = await make(390, 844, 2, true, seedText, null);
    await begin(p); await p.waitForTimeout(1300);
    const second = await c.newPage();
    await second.goto(url, { waitUntil: "networkidle" });
    await second.waitForSelector("text=Begin recovery");
    await second.click("text=Begin recovery"); await second.waitForTimeout(900);
    await shot(second, "28-phone-reader-tab", "second tab in one context: follower role and Take over face");
    await c.close(); }
  writeFileSync(resolve(out, "captures.json"), JSON.stringify({ task: "UI-RESET-AUDIT #45", headSha: process.env.RUSTWAKE_SHA ?? "unknown", tool: "playwright-core plus local Chrome/Edge, vite preview on 4173", seed: "docs/evidence/yard-mature.json (tick 18298, tutorial 9, 8 machines, 18 routes, all 3 nodes known)", syntheticEdits: { "20-phone-mature-store-full": "payload.sim.storeUnits=900 plus one overflow entry", "21-phone-mature-unaffordable": "payload.sim.credits=0" }, captures: receipt }, null, 2) + String.fromCharCode(10));
  console.log("wrote " + receipt.length + " captures");
} finally {
  await browser.close();
}
