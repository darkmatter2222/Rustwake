import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// UI-RESET-AUDIT (#45) follow-up set: desktop-fresh states + landscape/superwide panels.
// Prerequisites: npm ci && npm run build, then npm run preview -- --port 4173
//   node work/evidence/UI-RESET-45/capture-extra-45.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = resolve(root, "work/evidence/UI-RESET-45/captures");
mkdirSync(out, { recursive: true });
const url = process.env.RUSTWAKE_URL || "http://localhost:4173/";
const exe = [process.env.CHROME_PATH, "C://Program Files//Google//Chrome//Application//chrome.exe", "C://Program Files (x86)//Microsoft//Edge//Application//msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const seedPath = resolve(root, "docs/evidence/yard-mature.json");
const seedText = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : null;
const receipt = [];
const info = (page) => page.evaluate(() => {
  const txt = (s) => document.querySelector(s)?.textContent ?? null;
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  const de = document.documentElement;
  return { chips: txt(".resources"), objective: txt(".objective"), reconcile: txt(".reconcile"), toast: txt(".toast"), panel: txt(".panel"), dock: [...document.querySelectorAll(".dock__btn, .gate__btn, .icon-btn")].map((n) => (n.textContent || "").trim()).filter(Boolean), tick: sim ? sim.tick : null, docScroll: [de.scrollWidth, de.clientWidth, de.scrollHeight, de.clientHeight] };
});
const shot = async (page, name, note) => { const s = await info(page); await page.screenshot({ path: resolve(out, name + ".png") }); receipt.push(Object.assign({ file: name + ".png", note }, s)); console.log(name + ".png - " + note); };
const byText = (page, label) => page.evaluate((t) => { const n = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().startsWith(t)); if (!n) return false; n.click(); return true; }, label);
const install = (ctx, text, mut) => ctx.addInitScript(([raw, m]) => { const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }; const env = JSON.parse(raw); if (m) { for (const [path, value] of Object.entries(JSON.parse(m))) { let node = env; const parts = path.split("."); for (const q of parts.slice(0, -1)) node = node[q]; node[parts[parts.length - 1]] = value; } env.checksum = fnv(JSON.stringify(env.payload)); } localStorage.setItem("rustwake.save.v1", JSON.stringify(env)); }, [text, mut ? JSON.stringify(mut) : null]);
const browser = await chromium.launch({ executablePath: exe });
const make = async (w, h, dpr, mobile, seed, mut) => { const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile }); if (seed) await install(c, seed, mut); const p = await c.newPage(); await p.goto(url, { waitUntil: "networkidle" }); await p.waitForSelector("text=Begin recovery"); return { c, p }; };
const begin = async (p) => { await p.click("text=Begin recovery"); await p.waitForTimeout(250); };
const wait = (p, ms) => p.waitForTimeout(ms);
const selectMachine = async (page, x0, x1, y0, y1) => { for (let y = y0; y <= y1; y += 20) { for (let x = x0; x <= x1; x += 20) { await page.mouse.click(x, y); const t = await page.evaluate(() => document.querySelector(".panel")?.textContent ?? null); if (t) return t; } } return null; };
const rows = (p) => p.evaluate(() => { const d = document.querySelector(".dock"); const r = d.getBoundingClientRect(); const btns = [...document.querySelectorAll(".dock__btn")].map((n) => { const b = n.getBoundingClientRect(); return Math.round(b.x) + "," + Math.round(b.y) + " " + Math.round(b.width) + "x" + Math.round(b.height); }); const ys = [...new Set(btns.map((s) => Number(s.split(" ")[0].split(",")[1])))]; return { dock: [r.x, r.y, r.width, r.height].map(Math.round).join(","), faces: btns.length, rows: ys.length }; });
try {
  { const { c, p } = await make(390, 844, 2, true, seedText, null);
    await begin(p); await wait(p, 1500); await byText(p, "Back to yard"); await wait(p, 250);
    console.log("phone rest:", JSON.stringify(await rows(p)));
    await byText(p, "Store"); await wait(p, 160);
    console.log("phone store:", JSON.stringify(await rows(p)));
    await byText(p, "Close"); await wait(p, 140);
    const opened = await selectMachine(p, 60, 330, 150, 560); await wait(p, 140);
    console.log("phone machine+fork:", JSON.stringify(await rows(p)), "opened:", Boolean(opened));
    await c.close(); }
  { const { c, p } = await make(1920, 1080, 1, false, seedText, null);
    await begin(p); await wait(p, 1600); await byText(p, "Back to yard"); await wait(p, 250);
    console.log("desktop rest:", JSON.stringify(await rows(p)));
    const opened = await selectMachine(p, 600, 1300, 250, 800); await wait(p, 140);
    console.log("desktop machine+fork:", JSON.stringify(await rows(p)), "opened:", Boolean(opened));
    await c.close(); }
} finally { await browser.close(); }
