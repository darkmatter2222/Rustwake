import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET/NAV (#47): band rects and face inventory for the path of navigation-spec.md,
// same probe shape as work/evidence/UI-RESET-45/measure-baseline-45.mjs so the two files
// can be read side by side. Prereqs: npm ci && npm run build, then a second shell with
//   node node_modules/vite/bin/vite.js preview --port 4173 --strictPort
// and then:  node work/evidence/UI-RESET-47/measure-nav-47.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const exe = [process.env.CHROME_PATH, "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe", "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const seedText = readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8");

const probe = () => {
  const box = (s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const de = document.documentElement;
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: Math.min(2, Math.max(1, window.devicePixelRatio || 1)) },
    docScroll: { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight },
    rects: { top: box(".hud__top"), chips: box(".resources"), cluster: box(".cluster"), objective: box(".objective"), dock: box(".dock"), panel: box(".panel"), canvas: box("canvas") },
    chips: document.querySelectorAll(".resources__item").length,
    dockLabels: [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()),
    printed: [...document.querySelectorAll(".dock__btn, .icon-btn")].map((n) => (n.textContent ?? "").trim()).filter(Boolean),
    navCount: document.querySelectorAll(".dock").length,
    targets: [...document.querySelectorAll("button")].map((n) => { const r = n.getBoundingClientRect(); return { label: (n.textContent ?? "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), under44: r.width < 44 || r.height < 44, disabled: Boolean(n.disabled) }; }),
    buttons: document.querySelectorAll("button").length,
  };
};

const run = async (browser, w, h, dpr, mobile, name) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await c.addInitScript((raw) => localStorage.setItem("rustwake.save.v1", raw), seedText);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  await p.click("text=Begin recovery");
  await p.waitForTimeout(1600);
  await p.evaluate(() => { const n = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("Back to yard")); if (n) n.click(); });
  await p.waitForTimeout(300);
  const states = { rest: await p.evaluate(probe) };
  for (const face of ["Store", "Research"]) {
    await p.evaluate((t) => { const n = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith(t)); if (n) n.click(); }, face);
    await p.waitForTimeout(220);
    states["with" + face] = await p.evaluate(probe);
    await p.evaluate(() => { const n = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("Close")); if (n) n.click(); });
    await p.waitForTimeout(180);
  }
  await c.close();
  return states;
};

const mkdir = (d) => { try { mkdirSync(d, { recursive: true }); } catch { /* exists */ } };
const out = resolve(root, "work/evidence/UI-RESET-47/captures");
mkdir(out);
const browser = await chromium.launch({ executablePath: exe });
const bands = [["phone-390x844-dpr2", 390, 844, 2, true], ["phone-360x640-dpr3", 360, 640, 3, true], ["landscape-844x390", 844, 390, 2, true], ["desktop-1366x768", 1366, 768, 1, false], ["desktop-1920x1080", 1920, 1080, 1, false], ["desktop-2560x1440", 2560, 1440, 1, false]];
const result = {};
for (const [name, w, h, dpr, mobile] of bands) { result[name] = await run(browser, w, h, dpr, mobile, name); console.log(name + ": rest buttons " + result[name].rest.buttons + ", dock " + result[name].rest.dockLabels.join(" / ")); }
writeFileSync(resolve(out, "measures-nav.json"), JSON.stringify({ task: "UI-RESET/NAV #47 band rects", headSha: process.env.RUSTWAKE_SHA ?? "224e22aa57a68215a2eddfe606ef50462b4d0b5e", note: "same probe shape as #45 measures.json", out: result }, null, 2) + String.fromCharCode(10));
await browser.close();
