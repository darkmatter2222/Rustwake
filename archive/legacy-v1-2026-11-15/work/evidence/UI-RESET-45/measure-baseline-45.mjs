import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET-AUDIT (#45): numeric composition + legibility probe of the pre-restart build.
// npm run build; npm run preview -- --port 4173; node work/evidence/UI-RESET-45/measure-baseline-45.mjs
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const exe = [process.env.CHROME_PATH, "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe", "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const seedText = readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8");

const probe = () => {
  const box = (s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const canvas = document.querySelector("canvas");
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  let world = null;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, ink = 0;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        if (img[i] > 14 || img[i + 1] > 24 || img[i + 2] > 40) {
          ink += 1;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    world = { cssX: Math.round(minX / dpr), cssY: Math.round(minY / dpr), cssW: Math.round((maxX - minX) / dpr), cssH: Math.round((maxY - minY) / dpr), inkSamples: ink };
  }
  const de = document.documentElement;
  const fonts = [...document.querySelectorAll(".resources__item, .objective__primary, .status-line, .dock__btn, .dock__cost, .panel dt, .panel dd, .node__title, .node__cost")]
    .map((n) => { const r = n.getBoundingClientRect(); return { cls: n.className, px: Math.round(parseFloat(getComputedStyle(n).fontSize) * 100) / 100, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, clipped: r.height > 0 && (n.scrollHeight > Math.ceil(r.height) + 1) }; });
  const targets = [...document.querySelectorAll("button")].map((n) => { const r = n.getBoundingClientRect(); return { label: (n.textContent ?? "").trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), under44: r.width < 44 || r.height < 44 }; });
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr },
    docScroll: { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight },
    rects: { top: box(".hud__top"), chips: box(".resources"), cluster: box(".cluster"), objective: box(".objective"), dock: box(".dock"), panel: box(".panel"), canvas: box("canvas") },
    world,
    chips: document.querySelectorAll(".resources__item").length,
    dockLabels: [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()),
    fonts, targets,
  };
};

const run = async (w, h, dpr, mobile) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await c.addInitScript((value) => localStorage.setItem("rustwake.save.v1", value), seedText);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  await p.click("text=Begin recovery");
  await p.waitForTimeout(1500);
  const closed = await p.evaluate(() => { const n = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith("Back to yard")); if (!n) return false; n.click(); return true; });
  await p.waitForTimeout(300);
  const rest = await p.evaluate(probe);
  await p.evaluate(() => { const n = [...document.querySelectorAll(".dock__btn")].find((x) => (x.textContent ?? "").trim().startsWith("Store")); if (n) n.click(); });
  await p.waitForTimeout(300);
  const withStore = await p.evaluate(probe);
  await p.evaluate(() => { const n = [...document.querySelectorAll(".dock__btn")].find((x) => (x.textContent ?? "").trim().startsWith("Research")); if (n) n.click(); });
  await p.waitForTimeout(300);
  const withResearch = await p.evaluate(probe);
  await c.close();
  return { closed, rest, withStore, withResearch };
};

const browser = await chromium.launch({ executablePath: exe });
const out = {};
try {
  out["phone-390x844-dpr2"] = await run(390, 844, 2, true);
  out["phone-360x640-dpr3"] = await run(360, 640, 3, true);
  out["landscape-844x390"] = await run(844, 390, 2, true);
  out["desktop-1920x1080"] = await run(1920, 1080, 1, false);
  out["desktop-1366x768"] = await run(1366, 768, 1, false);
  out["desktop-2560x1440"] = await run(2560, 1440, 1, false);
  writeFileSync(resolve(root, "work/evidence/UI-RESET-45/measures.json"), JSON.stringify({ headSha: process.env.RUSTWAKE_SHA ?? "unknown", seed: "docs/evidence/yard-mature.json", out }, null, 2) + String.fromCharCode(10));
  console.log("wrote measures.json");
} finally {
  await browser.close();
}
