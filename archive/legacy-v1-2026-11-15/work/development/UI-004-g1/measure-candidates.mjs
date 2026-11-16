// Pass-14 candidate wording measurement (throwaway instrument, not a gate).
// Injects candidate shortened primary strings into the RUNNING build at 360x640 dpr2 scale 2.0
// and records wrapped-box counts, so the lever-4 wording is chosen empirically, not guessed.
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4175/";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean).find((c) => existsSync(c));

// provenance: served entry must equal dist entry
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const indexHtml = await (await fetch(url)).text();
const entryRef = (indexHtml.match(/assets\/index-[^"']+\.js/) ?? [null])[0];
const servedEntry = Buffer.from(await (await fetch(url + entryRef)).arrayBuffer());
const diskEntry = readFileSync("dist/" + entryRef);
if (!servedEntry.equals(diskEntry)) throw new Error("served entry != dist entry");
console.log("provenance OK", entryRef, servedEntry.length, "B sha", sha256(servedEntry).slice(0, 12));

const CANDIDATES = [
  ["card.upgrade.orig", "Improve recovery or production: upgrade a machine."],
  ["card.upgrade.a", "Upgrade a machine: speed or power."],
  ["card.upgrade.b", "Upgrade a machine for speed or power."],
  ["card.upgrade.c", "Upgrade a machine to recover faster."],
  ["card.upgrade.d", "Improve a machine: speed or power."],
  ["card.upgrade.e", "Upgrade a machine: faster or leaner."],
  ["step.fork.orig", "Choose what improves on the Circuit assembler · 70 credits"],
  ["step.fork.a", "Upgrade Circuit assembler · 70 credits"],
  ["step.fork.hi", "Upgrade Circuit assembler · 140 credits"],
  ["step.fork.sorter", "Upgrade Scrap sorter · 30 credits"],
  ["step.fork.long", "Upgrade Circuit assembler · 1400 credits"],
];

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto(url, { waitUntil: "load" });
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
for (let i = 0; i < 3; i += 1) {
  const b = page.locator(".hud .icon-btn", { hasText: "A " });
  if ((await b.count()) > 0) await b.first().click({ force: true });
  await page.waitForTimeout(250);
}
await page.waitForTimeout(300);

const out = [];
for (const [key, text] of CANDIDATES) {
  await page.evaluate((t) => { document.querySelector(".objective__primary").textContent = t; }, text);
  await page.waitForTimeout(80);
  const m = await page.evaluate(() => {
    const p = document.querySelector(".objective__primary");
    const cs = getComputedStyle(p);
    const lh = parseFloat(cs.lineHeight);
    const r = p.getBoundingClientRect();
    const card = document.querySelector(".objective");
    return {
      boxes: lh > 0 ? Math.round(r.height / lh) : 0,
      heightPx: Math.round(r.height * 100) / 100,
      lineHeightPx: Math.round(lh * 100) / 100,
      fontSizePx: Math.round(parseFloat(cs.fontSize) * 100) / 100,
      paddingRightPx: cs.paddingRight,
      widthPx: Math.round(r.width * 100) / 100,
      overflowYpx: p.scrollHeight - p.clientHeight,
      cardWidthPx: Math.round(card.getBoundingClientRect().width * 100) / 100,
    };
  });
  out.push({ key, text, chars: text.length, ...m });
}
await context.close();
await browser.close();
for (const r of out) console.log(`${r.key.padEnd(20)} boxes=${r.boxes} h=${r.heightPx} chars=${r.chars} fs=${r.fontSizePx} lh=${r.lineHeightPx} pr=${r.paddingRightPx} w=${r.widthPx} cardW=${r.cardWidthPx} ovf=${r.overflowYpx}  "${r.text}"`);
console.log(JSON.stringify(out, null, 1));