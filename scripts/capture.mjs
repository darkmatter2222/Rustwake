// Screenshot capture for README evidence. Requires a running preview server.
// Usage: npm run preview (background) then node scripts/capture.mjs
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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

/** Opens the Research dock target by exact label, so the primary is not hit. */
const clickDock = async (page, label) => {
  const handle = await page.evaluateHandle((text) => {
    return [...document.querySelectorAll(".dock__btn")].find(
      (node) => (node.textContent ?? "").trim() === text
    );
  }, label);
  const element = handle.asElement();
  if (!element) return false;
  await element.click();
  return true;
};

/**
 * Research appears in the dock once data exists. The panel is photographed with the
 * first node already bought, so the image shows `Known` rather than only a price.
 */
const captureResearch = async (page, file) => {
  if (!(await clickDock(page, "Research"))) {
    console.log(`research panel (${file}): dock target not unlocked in this session`);
    return null;
  }
  await page.waitForTimeout(200);
  const bought = await clickByText(page, "Buy ·");
  if (bought) await page.waitForTimeout(200);
  const text = await page.evaluate(() => document.querySelector(".panel")?.textContent ?? "");
  await page.screenshot({ path: resolve(out, file) });
  console.log(`research panel (${file}, buy tapped=${bought}): ${text.slice(0, 240)}`);
  await clickByText(page, "Close");
  await page.waitForTimeout(150);
  return text;
};

/**
 * The yard record panel (B-06), photographed at phone size because it is the surface
 * a player uses to move a yard to another device: the record lines and the export
 * field in one frame.
 */
const captureYard = async (page, file) => {
  if (!(await clickDock(page, "Yard"))) {
    console.log(`yard panel (${file}): dock target not unlocked in this session`);
    return null;
  }
  await page.waitForTimeout(200);
  const info = await page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const field = panel?.querySelector("textarea");
    return {
      text: panel?.textContent ?? "",
      fieldChars: field?.value.length ?? 0,
      fieldHeight: field ? Math.round(field.getBoundingClientRect().height) : 0,
    };
  });
  await page.screenshot({ path: resolve(out, file) });
  console.log(
    `yard panel (${file}, ${info.fieldChars} chars, field ${info.fieldHeight} px):` +
      ` ${info.text.slice(0, 170)}`
  );
  await clickByText(page, "Close");
  await page.waitForTimeout(150);
  return info;
};

/** True once the dock carries the Research target, which needs `data > 0`. */
const researchUnlocked = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".dock__btn")].some(
      (node) => (node.textContent ?? "").trim() === "Research"
    )
  );

/** Same FNV-1a the app uses, so a rewritten envelope still verifies (D-11). */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Simulates an absence: shift the ledger reference back, install it as the
 * stored save before scripts run, and reload so the real offline catch-up path
 * (spec 18.1) does the work rather than a hand-written state.
 */
const applyAbsence = async (page, hours) => {
  const raw = await page.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  if (!raw) return false;
  const env = JSON.parse(raw);
  env.payload.lastSeenMs -= hours * 3600000;
  env.checksum = fnv1a(JSON.stringify(env.payload));
  const text = JSON.stringify(env);
  await page.addInitScript((value) => {
    localStorage.setItem("rustwake.save.v1", value);
  }, text);
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

  // A twelve-hour absence exercises the same economy, then the yard continues.
  const beforeAbsence = await page.evaluate(
    () => JSON.parse(localStorage.getItem("rustwake.save.v1") ?? "{}")?.payload?.sim?.tick ?? null
  );
  const stamped = await applyAbsence(page, 12);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  await page.waitForTimeout(300);
  // The refreshed tab starts as a follower while the previous document's lease
  // lapses (1.5 s), and the absence is credited when it is promoted.
  await page.waitForTimeout(1800);
  const report = await page.evaluate(
    () => document.querySelector(".panel")?.textContent ?? "(no report)"
  );
  const afterAbsence = await page.evaluate(
    () => JSON.parse(localStorage.getItem("rustwake.save.v1") ?? "{}")?.payload?.sim?.tick ?? null
  );
  console.log(
    `absence: applied=${stamped} tick ${beforeAbsence} -> ${afterAbsence}`
  );
  console.log(`return report: ${report.slice(0, 200)}`);
  await clickByText(page, "Back to yard");
  await page.waitForTimeout(200);

  // Keep working after the absence until the yard earns data, which is what unlocks
  // the Research target (B-25). The headless ladder reaches its eighth machine at
  // round 396, so 240 rounds is a settled mid-yard without spending the whole run.
  let rounds = 0;
  for (let i = 0; i < 240; i += 1) {
    rounds = i + 1;
    const button = await page.$(".dock__btn--primary");
    if (!button) break;
    await button.click();
    await page.waitForTimeout(900);
    if (await page.$(".toast")) {
      await clickByText(page, "Cancel");
      await page.waitForTimeout(150);
    }
    if (await researchUnlocked(page)) break;
  }
  await clickByText(page, "Cancel");
  await page.waitForTimeout(4000); // Let the yard run for the final frame.
  const dockPrimary = await page.evaluate(() => {
    const primary = document.querySelector(".dock__btn--primary");
    const price = primary?.querySelector(".dock__cost")?.textContent ?? "";
    return primary ? `${primary.textContent?.replace(price, "").trim()} / ${price}` : "";
  });
  console.log(`post-absence rounds worked: ${rounds}`);
  console.log(`dock primary: ${dockPrimary}`);
  const summary = await page.evaluate(() => {
    const raw = localStorage.getItem("rustwake.save.v1");
    if (!raw) return null;
    const sim = JSON.parse(raw).payload.sim;
    return {
      tick: sim.tick,
      tutorial: sim.tutorial,
      credits: sim.credits,
      lastSeenMs: JSON.parse(raw).payload.lastSeenMs,
      store: sim.store,
      machines: sim.machines.map((m) => `${m.blueprint} L${m.level} x${m.batchesDone}`),
      routes: sim.routes.length,
      research: sim.research,
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

/** Two pages in one context share localStorage, so this is the real 22.3 case. */
const checkLease = async (context, firstPage) => {
  const second = await context.newPage();
  await second.goto(url, { waitUntil: "networkidle" });
  await second.waitForSelector("text=Begin recovery");
  await second.click("text=Begin recovery");
  await second.waitForTimeout(400);
  const readerLine = await second.evaluate(() => {
    return document.querySelector(".objective")?.textContent ?? "";
  });
  const readerDock = await second.evaluate(() => {
    return document.querySelector(".dock__btn--primary")?.textContent ?? "";
  });
  const before = await second.evaluate(() => {
    const raw = localStorage.getItem("rustwake.save.v1");
    const lease = localStorage.getItem("rustwake.lease.v1");
    const sim = raw ? JSON.parse(raw).payload.sim : null;
    return {
      tick: sim?.tick,
      scrap: sim?.store?.scrap,
      hud: document.querySelector(".resources")?.textContent ?? "",
      lease,
    };
  });
  await second.screenshot({ path: resolve(out, "latest-multitab.png") });

  // The owner goes away; the follower may claim the expired lease.
  await firstPage.close();
  await second.waitForTimeout(2000);
  await clickByText(second, "Take over");
  await second.waitForTimeout(1200);
  const after = await second.evaluate(() => {
    const raw = localStorage.getItem("rustwake.save.v1");
    const lease = localStorage.getItem("rustwake.lease.v1");
    const sim = raw ? JSON.parse(raw).payload.sim : null;
    return {
      tick: sim?.tick,
      scrap: sim?.store?.scrap,
      hud: document.querySelector(".resources")?.textContent ?? "",
      card: document.querySelector(".objective")?.textContent ?? "",
      lease,
    };
  });
  console.log(`reader card: ${readerLine}`);
  console.log(`reader dock: ${readerDock}`);
  console.log(`reader hud:  ${before.hud}`);
  console.log(`before handover: ${JSON.stringify({ ...before, hud: undefined })}`);
  console.log(`after handover:  ${JSON.stringify({ ...after, hud: undefined })}`);
  console.log(`owner hud after handover: ${after.hud}`);
  await second.close();
};

const browser = await chromium.launch({ executablePath });
const seedPath = resolve(root, "docs/evidence/yard-mature.json");
const seedText = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : null;

/** Installs a saved envelope before the first paint, so the yard starts mature. */
const installSeed = async (context) => {
  if (!seedText) return;
  await context.addInitScript((value) => {
    localStorage.setItem("rustwake.save.v1", value);
  }, seedText);
};

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
  await clickByText(mobilePage, "Close"); // So the research image carries one panel.
  await mobilePage.waitForTimeout(150);

  const organicResearch = await captureResearch(mobilePage, "latest-research-phone.png");
  const organicYard = await captureYard(mobilePage, "latest-yard.png");

  await checkLease(mobile, mobilePage);

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  // A mature yard from `npx tsx scripts/probe-supply.mjs` is installed as the
  // stored save before the first paint, so the research dock (which needs data)
  // is on screen inside the capture window (BL-07).
  await installSeed(desktop);
  const desktopPage = await desktop.newPage();
  await playSession(desktopPage);
  await desktopPage.screenshot({ path: resolve(out, "latest-desktop.png") });
  await captureResearch(desktopPage, "latest-research.png");

  // The short organic session stops at four machines (one drone is the binding
  // constraint, so the store sits at the reserve floor and the 30-50-scrap prices
  // are rarely met), which is before the signal lab earns data. The phone-size
  // research image therefore comes from the same seeded mature yard the desktop
  // row uses, and the gallery says so.
  if ((!organicResearch || !organicYard) && seedText) {
    const seededPhone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await installSeed(seededPhone);
    const seededPage = await seededPhone.newPage();
    await seededPage.goto(url, { waitUntil: "networkidle" });
    await seededPage.waitForSelector("text=Begin recovery");
    await seededPage.click("text=Begin recovery");
    await seededPage.waitForTimeout(400);
    await clickByText(seededPage, "Back to yard"); // The seed's gap opens a report.
    await seededPage.waitForTimeout(200);
    const seededResearch = await captureResearch(seededPage, "latest-research-phone.png");
    const seededYard = organicYard ?? (await captureYard(seededPage, "latest-yard.png"));
    console.log(
      `research phone source: ${
        organicResearch ? "organic session" : "seeded mature yard (docs/evidence/yard-mature.json)"
      }, captured=${Boolean(organicResearch || seededResearch)}`
    );
    await seededPhone.close();
  }

  console.log(
    "captured latest-mobile.png, latest-machine-mobile.png, latest-multitab.png," +
      " latest-research-phone.png, latest-desktop.png, latest-research.png, latest-yard.png"
  );
} finally {
  await browser.close();
}
