/*
 * #242 evidence probe: fresh-yard canvas census against a LOCAL vite preview of
 * this branch's production build (before/after on the same protocol the
 * coordinator used on the live URL — probe-live-fresh.mjs).
 *
 * Usage:
 *   node tests/perf/first-run-242.probe.mjs --url http://localhost:4183/rustwake/ --out docs/evidence/242/after
 *
 * Protocol (identical sampling to the live baseline): fresh context (no seeded
 * save), 824x1830 viewport, click .gate__btn, dismiss .return-resume, click
 * .shell-zoom__face--reset ("Recenter"), wait 5s, read canvas dataset + a 20x40
 * (800-sample) pixel census + sim state from localStorage. Then a save round-trip
 * check: reload, re-enter, and compare the persisted sim/settings.
 *
 * playwright-core is resolved from PLAYWRIGHT_PATH (default: the shared
 * rw-qwen install) because this repo does not depend on playwright directly.
 * Real Chrome + SwiftShader flags match the commissioned headless environment.
 */
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const url = arg("url", "http://localhost:4183/rustwake/");
const out = arg("out", "docs/evidence/242/run");
const pwPath = arg(
  "playwright",
  "C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-236/node_modules/playwright-core/index.mjs"
);
const { chromium } = await import(pathToFileURL(pwPath).href);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [
    "--ignore-certificate-errors",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--no-sandbox",
  ],
});
const context = await browser.newContext({
  viewport: { width: 824, height: 1830 },
  reducedMotion: "no-preference",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console:" + m.text().slice(0, 160));
});

const enter = async () => {
  await page.evaluate(() => {
    document.querySelector(".gate__btn")?.click();
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document.querySelector(".return-resume")?.click();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.querySelector(".shell-zoom__face--reset")?.click();
  });
  await page.waitForTimeout(5000);
};

const census = () =>
  page.evaluate(() => {
    const c = document.querySelector("canvas");
    const raw = localStorage.getItem("rustwake.save.v1");
    let sim = null;
    let settings = null;
    try {
      const parsed = JSON.parse(raw);
      sim = parsed.payload.sim;
      settings = parsed.payload.settings;
    } catch {}
    const ctx = c.getContext("2d");
    const W = c.width,
      H = c.height;
    const img = ctx.getImageData(0, 0, W, H).data;
    const counts = new Map();
    let n = 0;
    for (let gy = 0; gy < 40; gy++) {
      for (let gx = 0; gx < 20; gx++) {
        const x = Math.floor((W * (gx + 0.5)) / 20),
          y = Math.floor((H * (gy + 0.5)) / 40);
        const i = (y * W + x) * 4;
        const key = img[i] + "," + img[i + 1] + "," + img[i + 2];
        counts.set(key, (counts.get(key) || 0) + 1);
        n++;
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const bg = top[0][0];
    const nonBg = n - top[0][1];
    // Structure-tone family: the two pinned census tones plus their immediate
    // neighbours (same lit bodyLight/wreck/steelLight materials, +/-2 rounding).
    const near = (key, r, g, b) => {
      const [kr, kg, kb] = key.split(",").map(Number);
      return Math.abs(kr - r) <= 2 && Math.abs(kg - g) <= 2 && Math.abs(kb - b) <= 2;
    };
    let structure = 0;
    let structurePinned = 0;
    for (const [key, count] of counts) {
      if (near(key, 117, 138, 147) || near(key, 94, 120, 130)) structure += count;
      if (key === "117,138,147" || key === "94,120,130") structurePinned += count;
    }
    return {
      world3d: c.dataset.world3d,
      cam: c.dataset.cam,
      cw: W,
      ch: H,
      machines: sim?.machines?.length ?? null,
      tick: sim?.tick ?? null,
      tutorial: sim?.tutorial,
      scrap: sim?.scrap,
      credits: sim?.credits,
      objective: document.querySelector(".objective__primary")?.textContent?.trim() ?? null,
      panelOpen: !!document.querySelector(".shell-sheet .panel"),
      saveBytes: raw?.length ?? 0,
      settingsJson: JSON.stringify(settings ?? null),
      // Stable persisted fields only: tick and pulse timers advance while the
      // live sim runs between the two reads, so they are not round-trip signals.
      simJson: JSON.stringify({
        machines: sim?.machines ?? null,
        tutorial: sim?.tutorial ?? null,
        droneRepaired: sim?.drone?.repaired ?? null,
        wreckGeneration: sim?.wreck?.generation ?? null,
        credits: sim?.credits ?? null,
      }),
      census: {
        samples: n,
        uniqueColors: counts.size,
        dominant: bg,
        nonDominantPct: Math.round((100 * nonBg) / n),
        structurePinned,
        structureFamily: structure,
        top,
      },
    };
  });

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
const gate = await page.evaluate(() => ({
  btn: document.querySelector(".gate__btn")?.textContent?.trim() ?? null,
  save: document.querySelector(".gate__save")?.textContent?.trim() ?? null,
}));
await enter();
const before = await census();
await page.screenshot({ path: `${out}/fresh-yard.png` });

// Save round-trip: reload the same context, re-enter, compare persisted state.
await page.reload({ waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);
const gateAfterReload = await page.evaluate(() => ({
  btn: document.querySelector(".gate__btn")?.textContent?.trim() ?? null,
  save: document.querySelector(".gate__save")?.textContent?.trim() ?? null,
}));
await enter();
const afterReload = await census();
const roundTrip = {
  gateAfterReload,
  settingsEqual: before.settingsJson === afterReload.settingsJson,
  simEqual: before.simJson === afterReload.simJson,
  machinesBefore: before.machines,
  machinesAfter: afterReload.machines,
  tutorialBefore: before.tutorial,
  tutorialAfter: afterReload.tutorial,
  world3dAfterReload: afterReload.world3d,
  simBefore: before.simJson,
  simAfter: afterReload.simJson,
};

const report = {
  issue: 242,
  url,
  generatedOn: new Date().toISOString(),
  gate,
  fresh: before,
  roundTrip,
  errors: errors.slice(0, 10),
};
writeFileSync(`${out}/census.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      world3d: before.world3d,
      objective: before.objective,
      machines: before.machines,
      tutorial: before.tutorial,
      census: before.census,
      roundTrip,
      errors: report.errors,
    },
    null,
    2
  )
);
await browser.close();
