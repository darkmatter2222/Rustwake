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
const clickByText = async (page, text) => {
  const handle = await page.evaluateHandle((label) => {
    return [...document.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").trim().startsWith(label)
    );
  }, text);
  const element = handle.asElement();
  if (!element) return false;
  await element.click();
  return true;
};

const playSession = async (page) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  for (let i = 0; i < 6; i += 1) {
    await page.click(".dock__btn--primary");
    await page.waitForTimeout(650);
  }
  await page.click(".dock__btn--primary"); // Repair drone
  for (let i = 0; i < 60; i += 1) {
    const button = await page.$(".dock__btn--primary");
    if (!button) break;
    await button.click();
    await page.waitForTimeout(1100);
    // A rejected placement leaves build mode; back out so the loop continues.
    if (await page.$(".toast")) {
      await page.waitForTimeout(1100); // Let the drone deliver first.
      await clickByText(page, "Cancel");
      await page.waitForTimeout(150);
    }
  }
  await clickByText(page, "Cancel");
  await page.waitForTimeout(1500); // Let the yard run for the final frame.
  const summary = await page.evaluate(() => {
    const raw = localStorage.getItem("rustwake.save.v1");
    if (!raw) return null;
    const sim = JSON.parse(raw).payload.sim;
    return {
      tick: sim.tick,
      tutorial: sim.tutorial,
      credits: sim.credits,
      store: sim.store,
      machines: sim.machines.map((m) => `${m.blueprint} L${m.level} x${m.batchesDone}`),
      routes: sim.routes.length,
    };
  });
  console.log(`session state: ${JSON.stringify(summary)}`);
};

/** Taps a coarse grid until a machine panel opens, then returns its text. */
const openMachinePanel = async (page) => {
  for (let y = 120; y <= 560; y += 24) {
    for (let x = 40; x <= 350; x += 24) {
      await page.mouse.click(x, y);
      const text = await page.evaluate(() => {
        const panel = document.querySelector(".panel");
        return panel ? panel.textContent ?? "" : null;
      });
      if (text && text.includes("Next step")) return text;
    }
  }
  return null;
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

  const panelText = await openMachinePanel(mobilePage);
  await mobilePage.screenshot({ path: resolve(out, "latest-machine-mobile.png") });
  console.log(`machine panel: ${panelText ?? "not opened"}`);

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
