// STRAT-002 g1 QA probe. Modes: fork (fork appearance + one-tap commit),
// blind (40 primary taps, per-tap dock state), rest (seeded mature yard: power line + floor).
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const url = process.argv[2] ?? "http://localhost:4323/";
const mode = process.argv[3] ?? "fork";
const vpW = Number(process.argv[4] ?? 390), vpH = Number(process.argv[5] ?? 844);
const scale = Number(process.argv[6] ?? 1);
const exe = [process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find(p => existsSync(p));
const fnv1a = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
const seed = () => {
  const env = JSON.parse(readFileSync("docs/evidence/yard-mature.json", "utf8"));
  env.payload.settings = { muted: true, reducedMotion: false, textScale: scale };
  const text = JSON.stringify(env.payload);
  return JSON.stringify({ ...env, checksum: fnv1a(text) });
};
const SNAP = () => {
  const btns = [...document.querySelectorAll(".dock__btn")].map(b => {
    const r = b.getBoundingClientRect();
    return { text: (b.textContent ?? "").trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      primary: b.className.includes("primary"), costs: [...b.querySelectorAll(".dock__cost")].map(s => s.textContent),
      clipped: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1,
      clientRects: b.getClientRects().length };
  });
  const se = document.scrollingElement ?? document.documentElement;
  return { btns, scrollHeight: se.scrollHeight, innerHeight: window.innerHeight,
    dock: (() => { const d = document.querySelector(".dock"); if (!d) return null; const r = d.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(v => +v.toFixed(1)); })(),
    objective: document.querySelector(".objective")?.textContent ?? null };
};
const run = async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const context = await browser.newContext({ viewport: { width: vpW, height: vpH }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (mode === "rest") await context.addInitScript(t => localStorage.setItem("rustwake.save.v1", t), seed());
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  const back = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find(n => (n.textContent ?? "").trim() === "Back to yard") ?? null);
  if (back.asElement()) await back.asElement().click();
  await page.waitForTimeout(300);
  if (mode === "rest") {
    const s = await page.evaluate(SNAP);
    console.log(JSON.stringify({ mode, vpW, vpH, scale, ...s }));
    await browser.close(); return;
  }
  const readSave = () => page.evaluate(() => {
    try { const s = JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim;
      return { tick: s.tick, credits: s.credits, machines: s.machines.map(m => ({ id: m.id, level: m.level, branch: m.branch })) }; }
    catch { return null; }
  });
  const tapPrimary = async () => page.evaluate(() => {
    const p = document.querySelector(".dock__btn--primary") ?? document.querySelectorAll(".dock__btn")[2] ?? document.querySelector(".dock__btn");
    p?.click(); return p ? (p.textContent ?? "").trim().slice(0, 30) : null;
  });
  if (mode === "blind") {
    const log = [];
    for (let i = 1; i <= 40; i++) {
      await tapPrimary(); await page.waitForTimeout(250);
      const s = await page.evaluate(SNAP);
      log.push({ tap: i, n: s.btns.length, labels: s.btns.map(b => b.text.split(" ")[0]), fork: s.btns.length === 3 && s.btns.map(b => b.text).join("|").includes("Faster") });
    }
    const fin = await readSave();
    const forkTaps = log.filter(l => l.fork).length;
    console.log(JSON.stringify({ mode, taps: 40, forkVisibleTaps: forkTaps, log: log.slice(0, 6).concat(log.slice(-4)), finalMachines: fin?.machines ?? null, credits: fin?.credits }));
    await browser.close(); return;
  }
  // fork mode: blind-tap primary until the three-option row appears (max 1500)
  let fork = null, pre = null;
  for (let i = 0; i < 1500; i++) {
    const s = await page.evaluate(SNAP);
    if (s.btns.length === 3 && s.btns.map(b => b.text).join("|").includes("Faster")) { fork = s; break; }
    await tapPrimary(); await page.waitForTimeout(60);
  }
  if (!fork) { console.log(JSON.stringify({ mode, fork: null })); await browser.close(); return; }
  pre = await readSave();
  await page.evaluate(() => { const b = [...document.querySelectorAll(".dock__btn")].find(x => (x.textContent ?? "").startsWith("Faster")); b.click(); });
  await page.waitForTimeout(700);
  const post = await readSave();
  const after = await page.evaluate(SNAP);
  console.log(JSON.stringify({ mode, vpW, vpH, scale, forkButtons: fork.btns, dockAtFork: fork.dock, scrollAtFork: [fork.scrollHeight, fork.innerHeight], objectiveAtFork: fork.objective, pre, post, dockAfter: after.btns.map(b => b.text) }));
  await browser.close();
};
run().catch(e => { console.error(JSON.stringify({ mode, error: String(e) })); process.exit(1); });
