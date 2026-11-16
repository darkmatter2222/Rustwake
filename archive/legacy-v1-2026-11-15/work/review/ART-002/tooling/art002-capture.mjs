// ART-002 g1 (independent QA): fresh still captures from the LIVE route.
// Method mirrors docs/screenshots/live-d7af68a-provenance.json: organic tap-driven
// run on the deployed artifact, 250 ms taps on .dock__btn--primary, gate button
// "Begin recovery" first, fork-row frame right after the last primary tap, rest
// frame after 1.2 s without a tap. Text scale 2.0 is set through the player's own
// "Text size" control ([aria-label^="Text size"]). Seeded mature cases install
// docs/evidence/yard-mature.json as the stored save before first paint.
// Outputs land under work/review/ART-002/captures only.
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..", ".."); // work/review/ART-002/tooling -> repo root
const out = resolve(here, "captures");
mkdirSync(out, { recursive: true });

const url = "https://home.darkmatter2222.com/rustwake/";
const ARTIFACT = "rustwake-d7af68a";
const SOURCE_SHA = "d7af68a1df31d6b0cb5e313330f7cb5853d74a32";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));

const template = JSON.parse(
  readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"),
);

const clickHandle = async (page, predicateArg, text) => {
  const handle = await page.evaluateHandle(
    ({ arg, txt }) =>
      [...document.querySelectorAll("button")].find((node) => {
        const t = (node.textContent ?? "").trim();
        if (arg === "startsWith") return t.startsWith(txt);
        return t === txt;
      }) ?? null,
    { arg: predicateArg, txt: text },
  );
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
};

const dockState = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".dock__btn")].map((n) => (n.textContent ?? "").trim()),
  );

const pageMetrics = (page) =>
  page.evaluate(() => {
    const hud = document.querySelector(".hud");
    const faces = [...document.querySelectorAll(".dock__btn")].map((n) => {
      const r = n.getBoundingClientRect();
      return { text: (n.textContent ?? "").trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      hudBox: hud ? { h: +hud.getBoundingClientRect().height.toFixed(1) } : null,
      faces,
      textScale: getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim(),
    };
  });

const setForkText = async (page) => {
  for (let i = 0; i < 4; i += 1) {
    const label = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label^="Text size"]');
      return btn ? (btn.textContent ?? "").trim() : null;
    });
    if (label === "A 2") return true;
    if (label === null) return false;
    await page.evaluate(() => document.querySelector('[aria-label^="Text size"]').click());
    await page.waitForTimeout(120);
  }
  return false;
};

const shot = async (page, file) => {
  const buffer = await page.screenshot({ path: resolve(out, file) });
  return createHash("sha256").update(buffer).digest("hex");
};

const runOrganic = async (browser, tag, width, height, dpr, textScale) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: dpr === 2,
    hasTouch: dpr === 2,
  });
  const errors = [];
  context.on("weberror", (e) => errors.push(String(e.error())));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  let textSet = null;
  if (textScale === 2) textSet = await setForkText(page);
  let taps = 0;
  let forkSeen = false;
  for (let i = 0; i < 400; i += 1) {
    const btn = await page.$(".dock__btn--primary");
    if (!btn) break;
    await btn.click();
    taps += 1;
    await page.waitForTimeout(250);
    const faces = await dockState(page);
    forkSeen =
      faces.some((t) => t.startsWith("Faster batches")) &&
      faces.some((t) => t.startsWith("Less power"));
    if (forkSeen) break;
  }
  const forkFile = `live-${ARTIFACT.slice(8)}-${tag}-fork.png`;
  const forkSha = await shot(page, forkFile);
  const forkMetrics = await pageMetrics(page);
  await page.waitForTimeout(1200); // rest: no tap within the last 1.2 s
  const restFile = `live-${ARTIFACT.slice(8)}-${tag}-rest.png`;
  const restSha = await shot(page, restFile);
  const restMetrics = await pageMetrics(page);
  const rows = [];
  for (const [f, sha, m] of [
    [forkFile, forkSha, forkMetrics],
    [restFile, restSha, restMetrics],
  ]) {
    rows.push({
      file: f, sha256: sha, artifact: ARTIFACT, sourceSha: SOURCE_SHA,
      viewport: `${width}x${height}`, dpr, textScale, capture: "organic",
      moment: f.endsWith("fork.png") ? "fork row open, after the last primary tap" : "rest frame, no tap within the last 1.2 s",
      primaryTaps: taps, textScaleSet: textSet, pageErrors: errors.length,
      metrics: m,
    });
  }
  await context.close();
  return rows;
};

const runSeeded = async (browser, tag, width, height, dpr) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    isMobile: dpr === 2,
    hasTouch: dpr === 2,
  });
  const errors = [];
  context.on("weberror", (e) => errors.push(String(e.error())));
  await context.addInitScript(
    (text) => localStorage.setItem("rustwake.save.v1", text),
    JSON.stringify(template),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  await page.waitForTimeout(400);
  await clickHandle(page, "exact", "Back to yard"); // the seed gap opens a report
  await page.waitForTimeout(250);
  const file = `live-${ARTIFACT.slice(8)}-${tag}.png`;
  const sha = await shot(page, file);
  const metrics = await pageMetrics(page);
  await context.close();
  return [
    {
      file, sha256: sha, artifact: ARTIFACT, sourceSha: SOURCE_SHA,
      viewport: `${width}x${height}`, dpr, textScale: 1, capture: "seeded",
      moment: "mature yard (docs/evidence/yard-mature.json), report dismissed",
      pageErrors: errors.length, metrics,
    },
  ];
};

const browser = await chromium.launch({ executablePath, headless: true });
const rows = [];
try {
  rows.push(...(await runOrganic(browser, "390-ts1", 390, 844, 2, 1)));
  rows.push(...(await runOrganic(browser, "360-ts2", 360, 640, 2, 2)));
  rows.push(...(await runOrganic(browser, "412-ts1", 412, 915, 2, 1)));
  rows.push(...(await runOrganic(browser, "desktop-1440", 1440, 900, 1, 1)));
  rows.push(...(await runSeeded(browser, "seed-mature-390", 390, 844, 2)));
  rows.push(...(await runSeeded(browser, "seed-mature-desktop", 1440, 900, 1)));
} finally {
  await browser.close();
}
writeFileSync(resolve(out, "art002-stills-provenance.json"), JSON.stringify(rows, null, 2), "utf8");
const hashes = new Set(rows.map((r) => r.sha256));
console.log(`frames=${rows.length} distinctSha=${hashes.size}`);
for (const r of rows) {
  console.log(
    `${r.file} sha=${r.sha256.slice(0, 12)} taps=${r.primaryTaps ?? "-"} ` +
      `scroll=${r.metrics.scrollHeight}/${r.metrics.innerHeight} errors=${r.pageErrors} ` +
      `faces=${JSON.stringify(r.metrics.faces)}`
  );
}
