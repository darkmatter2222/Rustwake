// Headless captures + numeric pixel sanity for issue #130 (V03 prototype).
// Reproducible: pnpm capture (seed/state rw3d-t03-capture-v1). Non-vision
// agent: numeric checks only; capable visual inspection remains pending.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { PALETTE } from "../src/palette.js";
import {
  startPreview, stopPreview, launchBrowser, headSha,
  evidenceDir, PREFIX, PREVIEW_URL,
} from "./lib.mjs";

const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TOKENS = Object.entries(PALETTE).map(([k, h]) => ({ token: k, rgb: hexToRgb(h) }));
const dist = (r, g, b, [R, G, B]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B);

function analyze(png) {
  const { width, height, data } = png;
  const n = width * height;
  const colors = new Set();
  let lumSum = 0, lumSq = 0, bg = 0, amber = 0, sandNear = 0, paletteNear = 0;
  const bgRgb = hexToRgb(PALETTE.muted);
  const amberRgb = hexToRgb(PALETTE.amber);
  const sandRgb = hexToRgb(PALETTE.sand);
  for (let i = 0; i < n; i += 1) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    colors.add((r << 16) | (g << 8) | b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum; lumSq += lum * lum;
    if (dist(r, g, b, bgRgb) <= 9) bg += 1;
    if (dist(r, g, b, amberRgb) <= 60) amber += 1;
    if (dist(r, g, b, sandRgb) <= 45) sandNear += 1;
    let best = Infinity;
    for (const t of TOKENS) { const d = dist(r, g, b, t.rgb); if (d < best) best = d; }
    if (best <= 60) paletteNear += 1;
  }
  const mean = lumSum / n;
  return {
    width, height, uniqueColors: colors.size,
    luminanceMean: +mean.toFixed(2),
    luminanceStddev: +Math.sqrt(Math.max(0, lumSq / n - mean * mean)).toFixed(2),
    backgroundFraction: +(bg / n).toFixed(4),
    amberPixels: amber,
    sandNearFraction: +(sandNear / n).toFixed(4),
    paletteNearFraction: +(paletteNear / n).toFixed(4),
  };
}
function diffFraction(a, b) {
  const n = a.width * a.height;
  let diff = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Math.abs(a.data[i * 4] - b.data[i * 4]) + Math.abs(a.data[i * 4 + 1] - b.data[i * 4 + 1]) + Math.abs(a.data[i * 4 + 2] - b.data[i * 4 + 2]);
    if (d > 24) diff += 1;
  }
  return +(diff / n).toFixed(4);
}

const preview = await startPreview();
const { browser, executablePath, probeRenderer, swiftshaderForced } = await launchBrowser();
let exitCode = 0;
const shots = {};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(PREVIEW_URL, { waitUntil: "load" });
  await page.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");
  await page.evaluate(() => window.__RW3D__.waitFrames(3));
  shots.open = await page.screenshot();

  // Interaction: real click selects the crane; one lift cycle runs 60 fixed
  // frames; camera orbits to yaw 75. Deterministic state for the second shot.
  const p = await page.evaluate(() => window.__RW3D__.projectCraneCenter());
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => { window.__RW3D__.startCycle(); window.__RW3D__.orbitTo(75, 35.264); });
  await page.evaluate(() => window.__RW3D__.waitFrames(60));
  const stateAfter = await page.evaluate(() => ({
    pivot: window.__RW3D__.pivot(),
    selection: document.getElementById("hud-selection").textContent,
    camera: document.getElementById("hud-camera").textContent,
    stats: window.__RW3D__.stats(),
  }));
  shots.interactive = await page.screenshot();

  // Desktop phone-size emulation ONLY (390x844 @2x). Not phone evidence.
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const phonePage = await phoneContext.newPage();
  await phonePage.goto(PREVIEW_URL, { waitUntil: "load" });
  await phonePage.waitForFunction("window.__RW3D__ && window.__RW3D__.ready === true");
  await phonePage.evaluate(() => window.__RW3D__.waitFrames(3));
  shots.phoneEmulation = await phonePage.screenshot();
  await phoneContext.close();

  const openPng = PNG.sync.read(shots.open);
  const interPng = PNG.sync.read(shots.interactive);
  const phonePng = PNG.sync.read(shots.phoneEmulation);
  const openStats = analyze(openPng);
  const interStats = analyze(interPng);
  const phoneStats = analyze(phonePng);
  const diff = diffFraction(openPng, interPng);

  writeFileSync(resolve(evidenceDir, `${PREFIX}-open.png`), shots.open);
  writeFileSync(resolve(evidenceDir, `${PREFIX}-interactive.png`), shots.interactive);
  writeFileSync(resolve(evidenceDir, `${PREFIX}-phone-emulation.png`), shots.phoneEmulation);

  check("no page errors", 0, pageErrors.length, pageErrors.length === 0);
  check("open dimensions", "1440x900", `${openStats.width}x${openStats.height}`, openStats.width === 1440 && openStats.height === 900);
  check("open not blank (unique colors > 200)", ">200", openStats.uniqueColors, openStats.uniqueColors > 200);
  check("open luminance stddev > 10", ">10", openStats.luminanceStddev, openStats.luminanceStddev > 10);
  check("open background (muted token) fraction in [0.02,0.9]", "0.02..0.9", openStats.backgroundFraction, openStats.backgroundFraction >= 0.02 && openStats.backgroundFraction <= 0.9);
  check("open sand-family terrain fraction > 0.01", ">0.01", openStats.sandNearFraction, openStats.sandNearFraction > 0.01);
  check("open palette-near fraction > 0.3", ">0.3", openStats.paletteNearFraction, openStats.paletteNearFraction > 0.3);
  check("interactive dimensions", "1440x900", `${interStats.width}x${interStats.height}`, interStats.width === 1440 && interStats.height === 900);
  check("selection amber pixels > 100 (box + HUD, not color-only)", ">100", interStats.amberPixels, interStats.amberPixels > 100);
  check("selection HUD text present", "SELECTED: crane", stateAfter.selection, stateAfter.selection.includes("SELECTED: crane"));
  check("pivot mid-cycle after 60 frames (y < 1.2)", "<1.2", stateAfter.pivot.y, stateAfter.pivot.y < 1.2);
  check("open vs interactive diff fraction > 0.005", ">0.005", diff, diff > 0.005);
  check("phone-emulation dimensions (390x844 @2x)", "780x1688", `${phoneStats.width}x${phoneStats.height}`, phoneStats.width === 780 && phoneStats.height === 1688);
  check("phone-emulation not blank", ">200", phoneStats.uniqueColors, phoneStats.uniqueColors > 200);

  const report = {
    meta: {
      issue: 130, role: "developer", seed: "rw3d-t03-capture-v1", sha: headSha(),
      command: "pnpm --dir prototypes/rw3d-renderer capture",
      timestamp: new Date().toISOString(),
      browser: { executablePath, probeRenderer, swiftshaderForced },
      stateAfter,
      note: "Numeric pixel sanity only. Capable visual inspection pending. phone-emulation.png is desktop emulation, NOT real phone evidence.",
    },
    images: { open: openStats, interactive: interStats, phoneEmulation: phoneStats, openVsInteractiveDiffFraction: diff },
    checks,
  };
  const out = resolve(evidenceDir, `${PREFIX}-pixels.json`);
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`pixel report written: ${out}`);
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${c.expected}, actual ${c.actual}`);
  exitCode = checks.every((c) => c.pass) ? 0 : 1;
} catch (err) {
  console.error("capture failed:", err);
  exitCode = 1;
} finally {
  await browser.close();
  stopPreview(preview);
}
process.exit(exitCode);
