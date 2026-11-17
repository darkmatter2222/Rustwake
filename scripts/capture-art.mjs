// ART-01 (#347) production-build art/schema capture. NEW script — does not modify
// scripts/capture-v2.mjs (owned concurrently by #337 CAM-01).
// Run AFTER `npm run build`: spawns vite preview, one Chromium, sequential contexts.
// Captures desktop + phone landing, invalid-placement negative state, and a near-zoom
// detail frame; records the voxel-schema stamp and full machine validation table.
// Numeric smoke only — NOT visual approval; independent reviewer/product verdict required.
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {SCHEMA_ID, validateAllMachines, cellCenter, cellProjectedCssPx, minZoomForPick} from "../src/voxelSchema.js";

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "artifacts/art-01");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4174);
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const report = {
  version: 1, build: "production-preview", issue: 347, schema: SCHEMA_ID,
  source_sha: process.env.GITHUB_SHA || "local", started: new Date().toISOString(),
  views: [], machineValidation: validateAllMachines(),
  pickProjection: {
    desktopDefault: {zoom: 1.15, canvasHeight: 900, cellCssPx: cellProjectedCssPx(1.15, 900)},
    phoneDefault: {zoom: 1, canvasHeight: 844, cellCssPx: cellProjectedCssPx(1, 844)},
    phoneZoomFloorFor44px: minZoomForPick(844)
  },
  status: "UNKNOWN", errors: [],
  limitations: ["One headless Chromium/SwiftShader run; phone view is emulated", "Not art parity or sponsor approval"]
};
let child, browser;
await mkdir(OUT, {recursive: true});

// Inverse of src/camera.js groundAtScreen: world ground point -> canvas CSS pixel.
function screenOfGround(cam, rect, wx, wz) {
  const wpp = 80 / (rect.height * cam.zoom);
  const dx = wx - cam.x, dz = wz - cam.z;
  const th = cam.yaw * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
  const u = cs * dx - sn * dz;
  const v = (-sn * dx - cs * dz) * Math.sin(cam.elevation * Math.PI / 180);
  return {x: rect.left + rect.width / 2 + u / wpp, y: rect.top + rect.height / 2 - v / wpp};
}
const pose = (page) => page.locator(".world-canvas").evaluate(c => ({
  yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
  zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ),
  voxelSchema: c.dataset.voxelSchema, machineCount: Number(c.dataset.machineCount),
  world3d: c.dataset.world3d
}));
const canvasRect = (page) => page.locator(".world-canvas").evaluate(c => {
  const r = c.getBoundingClientRect();
  return {left: r.left, top: r.top, width: r.width, height: r.height};
});

try {
  child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {stdio: ["ignore", "pipe", "pipe"]});
  child.stdout.on("data", () => {});
  child.stderr.on("data", d => report.errors.push("preview: " + d.toString().slice(0, 400)));
  let open = false;
  for (let i = 0; i < 70; i++) {
    try {const r = await fetch(HOST, {signal: AbortSignal.timeout(2000)}); if (r.ok) {open = true; break;}} catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  if (!open) throw Error("Production preview did not become available");
  if (!report.machineValidation.ok) throw Error("Schema validation failed: " + report.machineValidation.errors.join("; "));
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
  for (const v of [
    {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false},
    {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true}
  ]) {
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.isMobile, hasTouch: v.touch, reducedMotion: "reduce"});
    const page = await ctx.newPage(), errs = [], failed = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === `http://127.0.0.1:${PORT}`) failed.push(r.url());} catch {}});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    await page.waitForTimeout(1100);
    const landing = await pose(page);
    await page.screenshot({path: resolve(OUT, v.name + "-world.png"), fullPage: false, animations: "disabled"});

    // Negative state: attempt to construct on the occupied starter depot cell (13,9).
    await page.getByRole("button", {name: "Construct", exact: true}).click();
    await page.waitForTimeout(350);
    const rect = await canvasRect(page), cam = await pose(page);
    const depot = screenOfGround(cam, rect, cellCenter(13), cellCenter(9));
    let ghostShot = null;
    if (!v.isMobile) {
      await page.mouse.move(depot.x, depot.y);
      await page.waitForTimeout(450); // red invalid ghost over occupied cell
      ghostShot = v.name + "-negative-ghost.png";
      await page.screenshot({path: resolve(OUT, ghostShot), fullPage: false, animations: "disabled"});
      await page.mouse.click(depot.x, depot.y);
    } else {
      // The mobile build catalog covers the lower half of the screen; pan the yard
      // upward with a real one-finger touch drag so the occupied depot cell sits in
      // the visible canvas above the panel, then tap it.
      const cdp = await ctx.newCDPSession(page);
      const sx = rect.width / 2, sy = 320, ey = 150;
      await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: sx, y: sy}]});
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: sx, y: sy + (ey - sy) * i / 8}]});
      await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
      await page.waitForTimeout(400);
      const cam2 = await pose(page);
      const depot2 = screenOfGround(cam2, rect, cellCenter(13), cellCenter(9));
      await page.touchscreen.tap(depot2.x, depot2.y);
    }
    await page.getByRole("status").filter({hasText: "occupies this site"}).waitFor({timeout: 8000});
    const toastShot = v.name + "-negative-toast.png";
    await page.screenshot({path: resolve(OUT, toastShot), fullPage: false, animations: "disabled"});
    const toastText = await page.getByRole("status").innerText();
    // Return to select mode so the detail frame is clean gameplay.
    await page.getByRole("button", {name: "Inspect", exact: true}).click();
    await page.waitForTimeout(250);

    let detailShot = null, detailPose = null;
    if (!v.isMobile) {
      // Near-zoom detail: wheel zoom anchored on the depot shows pivots, bay, worker + truck scale.
      const before = await pose(page);
      await page.mouse.move(depot.x, depot.y);
      await page.mouse.wheel(0, -1400);
      await page.waitForFunction(p => Number(document.querySelector(".world-canvas").dataset.cameraZoom) > p, before.zoom, {timeout: 8000, polling: 50});
      await page.waitForTimeout(700);
      detailPose = await pose(page);
      detailShot = v.name + "-detail.png";
      await page.screenshot({path: resolve(OUT, detailShot), fullPage: false, animations: "disabled"});
    }
    const final = await pose(page);
    const scroll = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2);
    report.views.push({
      name: v.name, viewport: v.viewport, landing, final, detailPose, toastText,
      screenshots: {landing: v.name + "-world.png", ghost: ghostShot, negative: toastShot, detail: detailShot},
      pageErrors: errs, failedRequests: failed, documentScroll: scroll
    });
    if (landing.world3d !== "ready" || landing.voxelSchema !== SCHEMA_ID || landing.machineCount !== 6 ||
      scroll || errs.length || failed.length || !toastText.includes("occupies this site"))
      throw Error("ART-01 capture failure at " + v.name + ": " + JSON.stringify({landing, scroll, errs, failed, toastText}));
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
  console.log("ART-01 production capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
