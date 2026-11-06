// ART-002 g1: geometry probe on the live route — canvas box, objective card box,
// dock box at the fork moment (organic, same tap cadence as art002-capture.mjs).
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const url = "https://home.darkmatter2222.com/rustwake/";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => existsSync(p));

const GEOM = () => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
  };
  const card = document.querySelector(".objective") ?? null;
  const cardBox = card
    ? (() => { const b = card.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; })()
    : null;
  return {
    canvas: r("canvas"),
    card: cardBox,
    dock: r(".dock"),
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  };
};

const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
for (const [tag, w, h, dpr, ts] of [
  ["390-ts1", 390, 844, 2, 1],
  ["360-ts2", 360, 640, 2, 2],
  ["desktop-1440", 1440, 900, 1, 1],
]) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
    isMobile: dpr === 2,
    hasTouch: dpr === 2,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  if (ts === 2) {
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => document.querySelector('[aria-label^="Text size"]')?.click());
      await page.waitForTimeout(100);
    }
  }
  let faces = [];
  for (let i = 0; i < 400; i += 1) {
    const btn = await page.$(".dock__btn--primary");
    if (!btn) break;
    await btn.click();
    await page.waitForTimeout(250);
    faces = await page.evaluate(() =>
      [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()),
    );
    if (faces.some((t) => t.startsWith("Faster batches")) && faces.some((t) => t.startsWith("Less power"))) break;
  }
  const geom = await page.evaluate(GEOM);
  results.push({ tag, viewport: `${w}x${h}`, dpr, ts, taps: faces.length ? undefined : 0, geom });
  console.log(`${tag} ${JSON.stringify(geom)}`);
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
