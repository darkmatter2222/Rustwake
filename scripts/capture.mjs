// Screenshot capture for README evidence. Requires a running preview server.
// Usage: npm run preview (background) then node scripts/capture.mjs
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "docs/screenshots");
mkdirSync(out, { recursive: true });

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));

// One scripted session: six pulses, repair, then build and connect as the
// primary action changes. Real time lets the drone deliver between clicks.
const playSession = async (page) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  for (let i = 0; i < 6; i += 1) {
    await page.click(".dock__btn--primary");
    await page.waitForTimeout(650);
  }
  await page.click(".dock__btn--primary"); // Repair drone
  for (let i = 0; i < 30; i += 1) {
    const button = await page.$(".dock__btn--primary");
    if (!button) break;
    await button.click();
    await page.waitForTimeout(700);
  }
};

const browser = await chromium.launch({ executablePath });
try {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await playSession(mobilePage);
  await mobilePage.screenshot({ path: resolve(out, "latest-mobile.png") });

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const desktopPage = await desktop.newPage();
  await playSession(desktopPage);
  await desktopPage.screenshot({ path: resolve(out, "latest-desktop.png") });

  console.log("captured latest-mobile.png and latest-desktop.png");
} finally {
  await browser.close();
}
