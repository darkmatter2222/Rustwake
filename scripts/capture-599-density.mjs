// Refs 599 density capture. Spawns a LOCAL vite preview of the CURRENT build,
// one Chromium, desktop + phone at the DEFAULT landing camera (no orbit/zoom).
// Evidence: real composited page.screenshot() PNGs, projected worker px from the
// real canvas rect + camera stamps, crewWalkers stamp, rAF rate, and a motion
// pixel-diff decoded in a 2D canvas (paired with distinct-colour counts).
// Numeric smoke only — NOT visual approval; sponsor G1 (Refs 276) is the gate.
// Usage: RUSTWAKE_CAPTURE_OUT=docs/evidence/599-density/before node scripts/capture-599-density.mjs
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {cellProjectedCssPx} from "../src/voxelSchema.js";

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/599-density/before");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4188);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const WORKER_H = 1.7; // locked rig envelope height (src/voxelSchema.js SCALE_REFERENCES.worker)

const stamp = page => page.locator(".world-canvas").evaluate(c => ({
  yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
  zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
  world3d: c.dataset.world3d, crewWalkers: c.dataset.crewWalkers, crewStations: c.dataset.crewStations,
  crew1Dist: c.dataset.crew1Dist, crewReducedMotion: c.dataset.crewReducedMotion, rigLod: c.dataset.rigLod
}));
const rect = page => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});

const report = {issue: 599, build: "production-preview", source_sha: process.env.RUSTWAKE_SOURCE_SHA || "local",
  started: new Date().toISOString(), views: [], status: "UNKNOWN", errors: [],
  limitations: ["One headless Chromium/SwiftShader run; phone emulated; rAF rate is software-GL indicative",
    "Numeric smoke + captures are evidence only, not sponsor G1 (Refs 276) visual approval"]};
let child, browser;
await mkdir(OUT, {recursive: true});

// Decode two PNG buffers in a 2D canvas, count differing pixels + distinct colours.
async function motionDiff(page, bufA, bufB) {
  const a = bufA.toString("base64"), b = bufB.toString("base64");
  return page.evaluate(async ([a, b]) => {
    const load = src => new Promise((res, rej) => {const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = "data:image/png;base64," + src;});
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = ia.width, h = ia.height;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", {willReadFrequently: true});
    cx.drawImage(ia, 0, 0); const da = cx.getImageData(0, 0, w, h).data;
    cx.clearRect(0, 0, w, h); cx.drawImage(ib, 0, 0); const db = cx.getImageData(0, 0, w, h).data;
    let diff = 0; const ca = new Set(), cb = new Set();
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) diff++;
      ca.add((da[i] >> 4) + "," + (da[i + 1] >> 4) + "," + (da[i + 2] >> 4));
      cb.add((db[i] >> 4) + "," + (db[i + 1] >> 4) + "," + (db[i + 2] >> 4));
    }
    const total = w * h;
    return {width: w, height: h, total, diffPixels: diff, motionPct: Number((100 * diff / total).toFixed(3)),
      distinctColorsA: ca.size, distinctColorsB: cb.size};
  }, [a, b]);
}

try {
  child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {stdio: ["ignore", "pipe", "pipe"]});
  child.stdout.on("data", () => {});
  child.stderr.on("data", d => report.errors.push("preview: " + d.toString().slice(0, 300)));
  let open = false;
  for (let i = 0; i < 70; i++) {try {const r = await fetch(HOST, {signal: AbortSignal.timeout(2000)}); if (r.ok) {open = true; break;}} catch {} await new Promise(r => setTimeout(r, 200));}
  if (!open) throw Error("preview not available");
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});

  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true}
  ]) {
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "no-preference"});
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await page.waitForTimeout(1500);
    const s = await stamp(page), r = await rect(page);
    const elevRad = s.elevation * Math.PI / 180;
    const cellPx = cellProjectedCssPx(s.zoom, r.height);
    const workerPx = WORKER_H * Math.cos(elevRad) * r.height * s.zoom / 80;
    await page.screenshot({path: resolve(OUT, v.name + "-landing.png"), fullPage: false});

    // rAF rate over 5 s (software GL indicative).
    const raf = await page.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const f = () => {n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res({frames: n, ms: Number((performance.now() - t0).toFixed(1))});};
      requestAnimationFrame(f);
    }));
    const rafRate = Number((raf.frames / (raf.ms / 1000)).toFixed(2));

    // Motion: two canvas-clipped frames 1.2 s apart, decoded + diffed in 2D.
    const clip = {x: r.left, y: r.top, width: r.width, height: r.height};
    const d0 = await stamp(page);
    const fa = await page.screenshot({clip});
    await page.waitForTimeout(1200);
    const fb = await page.screenshot({clip});
    const d1 = await stamp(page);
    const motion = await motionDiff(page, fa, fb);
    await writeFile(resolve(OUT, v.name + "-motion-a.png"), fa);
    await writeFile(resolve(OUT, v.name + "-motion-b.png"), fb);
    const crewMoved = Number(d1.crew1Dist) > Number(d0.crew1Dist);

    report.views.push({name: v.name, viewport: v.viewport, stamp: s, canvasRect: r,
      projectedCellPx: Number(cellPx.toFixed(3)), projectedWorkerHeightPx: Number(workerPx.toFixed(3)),
      raf, rafRate, motion, crew1DistStart: d0.crew1Dist, crew1DistEnd: d1.crew1Dist, crewMoved,
      screenshots: {landing: v.name + "-landing.png", motionA: v.name + "-motion-a.png", motionB: v.name + "-motion-b.png"},
      pageErrors: errs});
    if (s.world3d !== "ready" || errs.length) throw Error("capture failure at " + v.name + ": " + JSON.stringify({s, errs}));
    await ctx.close();
  }
  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {
  report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("599 density capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
