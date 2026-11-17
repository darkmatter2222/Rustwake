// CAM-08 (#344) pointer-ownership evidence on the PRODUCTION preview build.
// One Chromium instance, sequential desktop + emulated-phone contexts. Real CDP
// mouse/touch events drive the SAME production input path (cameraInput ->
// panWithAnchor/transformGesture -> world.setView/applyCamera/stampCamera). Every
// pose is read from the canvas dataset, stamped SYNCHRONOUSLY from the rendered
// THREE camera (dataset == applied; #307 method hashes preserved).
//
// Reproduces the ownership failures and proves the fix with exact pixel deltas:
//  (A) mouse left-drag pan keeps the down-anchor under the pointer (<=1px);
//  (B) NEGATIVE ghost drag: a buttons===0 hover after an out-of-window release
//      must NOT move the camera (pre-fix panned from the stale anchor);
//  (C) NEGATIVE lostpointercapture mid-drag: native capture release purges the
//      track; a later hover must NOT ghost-drag (pre-fix stuck pressed state);
//  (D) out-of-window release WITH capture: anchor-exact, capture freed, no tap;
//  (E) wheel zoom anchor regression (<=1px);
//  (F) phone two-finger pinch + finger lift rebases with no target jump;
//  (G) NEGATIVE phone touch cancellation in BUILD mode: no purchase, no duplicate
//      click (structures unchanged, lastSiteOk !== "true");
//  (H) select-mode tap selects a starter building exactly once (tap path alive).
//
// PASS_NUMERIC_ONLY: headless SwiftShader, phone EMULATED. This does NOT certify
// visual fidelity — G1 (#276) sponsor review is still required before any claim.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS, normalizeCamera, groundAtScreen, panWithAnchor} from "../src/camera.js";
import {createGame} from "../src/simulation.js";
import {SAVE_KEY, CELL, WORLD_SIZE} from "../src/content.js";
import {spawn} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const OUT = resolve(process.env.RUSTWAKE_CAM08_OUT || "docs/evidence/344-cam-08");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4293);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOST = `${ORIGIN}/rustwake/`;
const TOL = 1;
const report = {issue: 344, version: 2, build: "production-preview",
  source_sha: process.env.GITHUB_SHA || "local", started: new Date().toISOString(),
  views: [], measurements: {}, status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is EMULATED, not a physical device",
    "PASS_NUMERIC_ONLY: camera/stamp/DOM measurements are exact; visual fidelity is screenshot-only and NOT self-certified",
    "G1 visual review (#276) is sponsor-reserved; these artifacts are evidence for that review, not approval",
    "Ghost-drag / lost-capture negatives compare the fixed build's actual pose against the computed pre-fix legacy pose; the pre-fix Node failure (11/22) is recorded separately",
    "Out-of-canvas pan is measured inside the +/-90 envelope; beyond it the documented CAM-01 pan clamp legitimately stops the anchor",
    "CDP touchMove events are queued until the next compositor frame or dispatchTouchEvent; Page.startScreencast forces frames and the harness asserts each move reached the canvas (pointer-event log) before measuring. touchEnd lists the points being RELEASED and delivers pointerup immediately; touchCancel must carry no points and ends the sequence, so the late-up-after-cancel case uses a synthetic PointerEvent with the cancelled pointerId against the real canvas listener."
  ]};

const rad = d => d * Math.PI / 180;
const kOf = (box, zoom) => CAMERA_LIMITS.frustumHeight / (box.height * zoom);
function errPx(cam, expected, pixel, box) {
  const c = normalizeCamera(cam), a = groundAtScreen(c, pixel, box);
  const gx = a.x - expected.x, gz = a.z - expected.z;
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  const u = cs * gx - sn * gz, v = -Math.sin(rad(c.elevation)) * (sn * gx + cs * gz);
  return Math.hypot(u, v) / kOf(box, c.zoom);
}
// Forward projection: world ground -> CSS pixel (inverse of groundAtScreen).
function pixelOf(cam, ground, box) {
  const c = normalizeCamera(cam), k = kOf(box, c.zoom);
  const X = ground.x - c.x, Z = ground.z - c.z;
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  const u = cs * X - sn * Z, v = -Math.sin(rad(c.elevation)) * (sn * X + cs * Z);
  return {x: u / k + box.width / 2, y: box.height / 2 - v / k};
}
const targetStep = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

let child, browser;
await mkdir(OUT, {recursive: true});
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
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});

  const game = createGame();
  const inject = async ctx => {
    // Count unique WebGL contexts BEFORE any page script (measured, not assumed).
    await ctx.addInitScript(() => {
      window.__rwCam08 = {webglContexts: 0};
      const seen = new WeakSet();
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = orig.call(this, type, ...rest);
        if (c && /webgl/i.test(String(type)) && !seen.has(c)) {seen.add(c); window.__rwCam08.webglContexts++;}
        return c;
      };
    });
    const json = JSON.stringify(game);
    await ctx.addInitScript(({json, key}) => {
      const save = JSON.parse(json); save.lastSavedAt = Date.now();
      localStorage.setItem(key, JSON.stringify(save));
      localStorage.setItem("rustwake:v2:intro", "1");
    }, {json, key: SAVE_KEY});
  };
  const newPage = async ctx => {
    const page = await ctx.newPage(), errs = [], failed = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {try {if (new URL(r.url()).origin === ORIGIN) failed.push(r.url());} catch {}});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 20000});
    return {page, errs, failed};
  };
  const pose = page => page.locator(".world-canvas").evaluate(c => ({
    yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
    zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ)
  }));
  const rect = page => page.locator(".world-canvas").evaluate(c => {const r = c.getBoundingClientRect(); return {left: r.left, top: r.top, width: r.width, height: r.height};});
  // Poll until the FULL pose stops changing. The camera animates zoom/pan
  // smoothly, so a single short wait can catch a mid-flight pose and poison
  // anchor / target-step measurements.
  const stablePose = async page => {
    let prev = await pose(page);
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(40);
      const cur = await pose(page);
      if (cur.x === prev.x && cur.z === prev.z && cur.zoom === prev.zoom && cur.yaw === prev.yaw && cur.elevation === prev.elevation) return cur;
      prev = cur;
    }
    return prev;
  };
  // Press Home and poll until the FULL pose (x/z/zoom/yaw) is settled, not just
  // yaw===45 — the recenter animates x/z/zoom and a transient home pose would
  // poison the down-anchor measurement.
  const goHome = async page => {
    await page.keyboard.press("Home");
    for (let i = 0; i < 60; i++) {
      const a = await pose(page); await page.waitForTimeout(50); const b = await pose(page);
      const same = a.x === b.x && a.z === b.z && a.zoom === b.zoom && a.yaw === b.yaw && a.elevation === b.elevation;
      if (same && b.yaw === 45) return b;
    }
    throw Error("HOME did not settle");
  };
  const stampCheck = async (page, label) => {
    const p = await pose(page), re = normalizeCamera(p);
    const fixedPoint = ["yaw", "elevation", "zoom", "x", "z"].every(k => Math.abs(p[k] - re[k]) < 1e-9);
    if (!fixedPoint) throw Error("STAMP_NOT_APPLIED " + label + ": " + JSON.stringify({p, re}));
    return {pose: p, fixedPoint};
  };
  const structures = page => page.evaluate(() => {
    const m = document.querySelector(".footline")?.textContent?.match(/(\d+)\s+STRUCTURES/);
    return m ? Number(m[1]) : null;
  });
  const siteOk = page => page.evaluate(() => document.body.dataset.lastSiteOk ?? null);
  // The phone context sheet (UX-07 #365) covers the canvas center in build
  // mode; a touch there lands on the sheet (the browser then cancels it for
  // scroll takeover) and the canvas never sees it. Pick a press point that
  // elementFromPoint confirms is the WORLD CANVAS itself.
  const canvasPoint = async (page, candidates) => {
    for (const [fx, fy] of candidates) {
      const p = await page.evaluate(([fx, fy]) => {
        const c = document.querySelector(".world-canvas"), r = c.getBoundingClientRect();
        const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
        return document.elementFromPoint(x, y) === c ? {x, y} : null;
      }, [fx, fy]);
      if (p) return p;
    }
    throw Error("NO_CANVAS_POINT: every candidate press point is covered by UI");
  };
  const PHONE_POINT_CANDIDATES = [[0.5, 0.35], [0.5, 0.3], [0.7, 0.3], [0.3, 0.35], [0.5, 0.25], [0.75, 0.25], [0.25, 0.3], [0.5, 0.45]];
  const hasCapture = (page, id) => page.locator(".world-canvas").evaluate((c, pid) => c.hasPointerCapture(pid), id);
  const webglCount = page => page.evaluate(() => window.__rwCam08?.webglContexts ?? null);

  // ================= DESKTOP 1440x900 =================
  {
    const vp = {width: 1440, height: 900};
    const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: 1, reducedMotion: "reduce"});
    await inject(ctx);
    const {page, errs, failed} = await newPage(ctx);
    const cdp = await ctx.newCDPSession(page);
    const box = await rect(page);
    const home = await pose(page);
    const N0 = await structures(page);
    await page.screenshot({path: resolve(OUT, "desktop-cam08-home.png"), fullPage: false, animations: "disabled"});
    const mouse = (type, x, y, button = "none", buttons = 0) =>
      cdp.send("Input.dispatchMouseEvent", {type, x, y, button, buttons, clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0});

    // ---- (A) real mouse left-drag pan: anchor-exact, no tap ----
    const p0 = {x: 600, y: 400}, p1 = {x: 760, y: 520};
    const anchorA = groundAtScreen(home, p0, box);
    await mouse("mousePressed", p0.x, p0.y, "left", 1);
    await mouse("mouseMoved", p1.x, p1.y, "left", 1);
    const afterA = await stablePose(page);
    const errA = errPx(afterA, anchorA, p1, box);
    await stampCheck(page, "pan");
    await mouse("mouseReleased", p1.x, p1.y, "left", 0);
    if (errA > TOL) throw Error("PAN_ANCHOR_DRIFT " + errA + "px");
    if (await structures(page) !== N0) throw Error("PAN purchased a structure");
    report.measurements.desktopPan = {viewport: vp, p0, p1, anchorWorld: anchorA, pose: afterA, errorCssPx: errA, structuresBefore: N0, structuresAfter: await structures(page), expected: "down-anchor under pointer <=1px; no tap"};
    await page.screenshot({path: resolve(OUT, "desktop-cam08-pan.png"), fullPage: false, animations: "disabled"});

    // ---- (B) NEGATIVE ghost drag: buttons===0 hover after out-of-window release ----
    await goHome(page);
    const bHome = await pose(page);
    const g0 = {x: 600, y: 400}, g1 = {x: 760, y: 520}, g2 = {x: 1000, y: 700};
    const anchorB = groundAtScreen(bHome, g0, box);
    await mouse("mousePressed", g0.x, g0.y, "left", 1);
    await mouse("mouseMoved", g1.x, g1.y, "left", 1);
    const draggedB = await stablePose(page);
    // Button released OUTSIDE the window: no mouseReleased delivered to the page.
    // The pointer hovers back with buttons===0 (stale track). FIXED: purge, no pan.
    await mouse("mouseMoved", g2.x, g2.y, "none", 0);
    const afterB = await stablePose(page);
    const ghostSlip = targetStep(draggedB, afterB);
    // Pre-fix legacy ghost pose: pan from the stale down-anchor to the hover pixel.
    const legacyB = panWithAnchor(draggedB, anchorB, g2, box);
    // The unwanted pan magnitude: in the settled pose the anchor sits under g1,
    // so evaluating it at the hover pixel g2 gives the screen slip the legacy
    // ghost-drag would "correct" (== the g1->g2 hover distance). Approved: 0.
    const legacyErrB = errPx(draggedB, anchorB, g2, box);
    const legacyStepB = targetStep(draggedB, legacyB);
    const approvedErrB = errPx(afterB, anchorB, g1, box);
    await mouse("mouseReleased", g2.x, g2.y, "left", 0); // cleanup
    if (ghostSlip > 1e-6) throw Error("GHOST_DRAG: camera moved " + ghostSlip + " world units on a buttons===0 hover");
    if (!(legacyErrB > TOL)) throw Error("NEGATIVE_CONTROL: legacy ghost drift " + legacyErrB + "px must exceed " + TOL);
    report.measurements.negativeGhostDrag = {viewport: vp, g0, g1, g2, anchorWorld: anchorB, draggedPose: draggedB, actualPoseAfterHover: afterB, actualTargetStep: ghostSlip, legacyGhostPose: legacyB, legacyGhostTargetStep: legacyStepB, legacyGhostDriftCssPx: legacyErrB, approvedDriftCssPx: approvedErrB, expected: "fixed: zero target step on hover (slip 0); pre-fix legacy ghost pan would slip >1px"};
    await page.screenshot({path: resolve(OUT, "desktop-cam08-ghost-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (C) NEGATIVE lostpointercapture mid-drag (native capture release) ----
    await goHome(page);
    // Record the real mouse pointerId from a production pointerdown.
    await page.evaluate(() => {window.__cam08pid = null; const c = document.querySelector(".world-canvas"); c.addEventListener("pointerdown", e => {window.__cam08pid = e.pointerId;}, {once: true});});
    const cHome = await pose(page);
    const c0 = {x: 600, y: 400}, c1 = {x: 720, y: 480}, c2 = {x: 1000, y: 700};
    const anchorC = groundAtScreen(cHome, c0, box);
    await mouse("mousePressed", c0.x, c0.y, "left", 1);
    await mouse("mouseMoved", c1.x, c1.y, "left", 1);
    const draggedC = await stablePose(page);
    const pid = await page.evaluate(() => window.__cam08pid);
    const capturedBefore = await hasCapture(page, pid);
    // Native releasePointerCapture fires a real lostpointercapture event.
    await page.locator(".world-canvas").evaluate((c, id) => c.releasePointerCapture(id), pid);
    await page.waitForTimeout(30);
    const capturedAfter = await hasCapture(page, pid);
    await mouse("mouseMoved", c2.x, c2.y, "none", 0); // hover after lost capture
    const afterC = await stablePose(page);
    const stuckSlip = targetStep(draggedC, afterC);
    const legacyC = panWithAnchor(draggedC, anchorC, c2, box);
    // Unwanted pan magnitude: settled anchor sits under c1; evaluating at the
    // post-lost-capture hover pixel c2 gives the slip the legacy stuck track
    // would apply (== c1->c2 hover distance). Approved: anchor stays under c1.
    const legacyErrC = errPx(draggedC, anchorC, c2, box);
    const legacyStepC = targetStep(draggedC, legacyC);
    const approvedErrC = errPx(afterC, anchorC, c1, box);
    await mouse("mouseReleased", c2.x, c2.y, "left", 0);
    if (!capturedBefore) throw Error("LOST_CAPTURE: pointer was not captured before release");
    if (capturedAfter) throw Error("LOST_CAPTURE: capture still held after release");
    if (stuckSlip > 1e-6) throw Error("STUCK_TRACK: camera moved " + stuckSlip + " after lostpointercapture hover");
    if (!(legacyErrC > TOL)) throw Error("NEGATIVE_CONTROL: legacy stuck drift " + legacyErrC + "px must exceed " + TOL);
    report.measurements.negativeLostCapture = {viewport: vp, pointerId: pid, capturedBefore, capturedAfter, c0, c1, c2, anchorWorld: anchorC, draggedPose: draggedC, actualPoseAfterHover: afterC, actualTargetStep: stuckSlip, legacyStuckPose: legacyC, legacyStuckTargetStep: legacyStepC, legacyStuckDriftCssPx: legacyErrC, approvedDriftCssPx: approvedErrC, expected: "native lostpointercapture purges track; zero target step on hover; pre-fix legacy stuck pan would slip >1px"};
    await page.screenshot({path: resolve(OUT, "desktop-cam08-lostcapture-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (D) out-of-window release WITH capture: anchor-exact, freed, no tap ----
    await goHome(page);
    const dHome = await pose(page);
    // Start near the canvas right edge so the out-of-window drag is short and
    // stays inside the +/-90 pan envelope (a long drag would legitimately clamp).
    const rightEdge = box.left + box.width;
    const d0 = {x: Math.round(rightEdge - 140), y: Math.round(box.top + box.height * 0.5)};
    const dOut = {x: Math.round(rightEdge + 60), y: d0.y + 40}; // 60px past the right edge
    const anchorD = groundAtScreen(dHome, d0, box);
    await mouse("mousePressed", d0.x, d0.y, "left", 1);
    await mouse("mouseMoved", dOut.x, dOut.y, "left", 1);
    const afterD = await stablePose(page);
    const errD = errPx(afterD, anchorD, dOut, box);
    await mouse("mouseReleased", dOut.x, dOut.y, "left", 0);
    const capturedD = await hasCapture(page, pid);
    const settledD = await pose(page);
    await mouse("mouseMoved", 700, 450, "none", 0); // hover back
    const hoverD = await stablePose(page);
    const hoverStep = targetStep(settledD, hoverD);
    if (errD > TOL) throw Error("OUT_OF_WINDOW_ANCHOR " + errD + "px");
    if (capturedD) throw Error("OUT_OF_WINDOW: capture not released on up");
    if (hoverStep > 1e-6) throw Error("OUT_OF_WINDOW ghost hover step " + hoverStep);
    if (await structures(page) !== N0) throw Error("OUT_OF_WINDOW purchased");
    report.measurements.outOfWindowRelease = {viewport: vp, d0, dOut, anchorWorld: anchorD, pose: afterD, errorCssPx: errD, captureReleased: !capturedD, hoverTargetStep: hoverStep, structuresAfter: await structures(page), expected: "captured out-of-canvas drag anchors <=1px; up releases capture; hover inert; no purchase"};
    await page.screenshot({path: resolve(OUT, "desktop-cam08-outofwindow.png"), fullPage: false, animations: "disabled"});

    // ---- (E) wheel zoom anchor regression ----
    await goHome(page);
    const eHome = await pose(page);
    const cursor = {x: 1140, y: 450};
    const anchorE = groundAtScreen(eHome, cursor, box);
    await page.mouse.move(cursor.x, cursor.y);
    await page.mouse.wheel(0, -120);
    const afterE = await stablePose(page);
    const errE = errPx(afterE, anchorE, cursor, box);
    await stampCheck(page, "wheel");
    if (errE > TOL) throw Error("WHEEL_ANCHOR " + errE + "px");
    if (!(afterE.zoom > eHome.zoom)) throw Error("WHEEL did not zoom in");
    report.measurements.wheelZoomAnchor = {viewport: vp, cursor, anchorWorld: anchorE, zoomBefore: eHome.zoom, zoomAfter: afterE.zoom, errorCssPx: errE, expected: "ground under cursor fixed <=1px through wheel zoom"};

    // one WebGL context, no document scroll
    const gl = await page.evaluate(() => ({
      contextCount: window.__rwCam08?.webglContexts ?? null,
      scroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 || Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    if (gl.contextCount !== 1) throw Error("WEBGL_CONTEXT_COUNT " + gl.contextCount + " !== 1");
    report.views.push({name: "desktop", viewport: vp, pageErrors: errs, failedRequests: failed, documentScroll: gl.scroll, webglContextCount: gl.contextCount, structures: N0});
    if (errs.length || failed.length || gl.scroll) throw Error("desktop failure: errors=" + errs.join(";") + " failed=" + failed.join(",") + " scroll=" + gl.scroll);
    await ctx.close();
  }

  // ================= PHONE 390x844 (EMULATED touch) =================
  {
    const vp = {width: 390, height: 844};
    const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce"});
    await inject(ctx);
    const {page, errs, failed} = await newPage(ctx);
    const cdp = await ctx.newCDPSession(page);
    // CDP touch delivery semantics (verified empirically on this headless
    // Chromium, see docs/CAMERA.md CAM-08): Input.dispatchTouchEvent touchEnd
    // lists the points being RELEASED and delivers their pointerup immediately,
    // but touchMove events are QUEUED until the next compositor frame or the
    // next dispatchTouchEvent. Without forced frames, measuring after a single
    // touchMove reads the pre-move pose (this produced the earlier false
    // SURVIVOR_REBASE_DRIFT 50px == hypot(40,30), the full unapplied move).
    // Page.startScreencast forces BeginFrames so queued moves deliver promptly;
    // touchMoveDelivered below additionally ASSERTS each move reached the canvas
    // (via the pointer-event log) before any pose is measured.
    cdp.on("Page.screencastFrame", p => {cdp.send("Page.screencastFrameAck", {sessionId: p.sessionId}).catch(() => {});});
    await cdp.send("Page.startScreencast", {format: "jpeg", quality: 20, everyNthFrame: 1});
    const box = await rect(page);
    const home = await pose(page);
    const N0phone = await structures(page);
    await page.screenshot({path: resolve(OUT, "phone-cam08-home.png"), fullPage: false, animations: "disabled"});
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", {type, touchPoints: points});
    const touchMoveDelivered = async points => {
      const since = await page.evaluate(() => window.__cam08events.length);
      await touch("touchMove", points);
      const want = points.map(p => ({x: Math.round(p.x), y: Math.round(p.y)}));
      for (let i = 0; i < 60; i++) {
        const ev = await page.evaluate(n => window.__cam08events.slice(n), since);
        if (want.every(w => ev.some(e => e.t === "pointermove" && e.x === w.x && e.y === w.y))) return ev;
        await page.waitForTimeout(40);
      }
      throw Error("HARNESS_MOVE_NOT_DELIVERED: touchMove never reached the canvas: " + JSON.stringify(want));
    };
    await page.evaluate(() => {window.__cam08events = []; const c = document.querySelector(".world-canvas"); for (const t of ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture","pointerout"]) c.addEventListener(t, e => {window.__cam08events.push({t, id: e.pointerId, b: e.buttons, x: Math.round(e.clientX), y: Math.round(e.clientY)});}, true);});

    // ---- (F) two-finger pinch + finger lift rebase, no target jump ----
    const centroid = {x: box.left + box.width * 0.6, y: box.top + box.height * 0.5};
    const localC = {x: box.width * 0.6, y: box.height * 0.5};
    const anchorF = groundAtScreen(home, localC, box);
    let half = 60;
    await touch("touchStart", [{x: centroid.x - half, y: centroid.y, id: 1}, {x: centroid.x + half, y: centroid.y, id: 2}]);
    await page.waitForTimeout(50);
    let maxPinchErr = 0;
    for (let i = 0; i < 5; i++) {
      half = Math.min(140, half + 18);
      await touchMoveDelivered([{x: centroid.x - half, y: centroid.y, id: 1}, {x: centroid.x + half, y: centroid.y, id: 2}]);
      const after = await stablePose(page);
      const e = errPx(after, anchorF, localC, box); maxPinchErr = Math.max(maxPinchErr, e);
      if (e > TOL) throw Error("PINCH_CENTROID_DRIFT " + e + "px");
    }
    const pinchPose = await stablePose(page);
    const beforeLift = pinchPose;
    // CDP touchEnd lists the points being RELEASED (not the survivors) and
    // delivers their pointerup immediately. Release finger 1 (touch id 1,
    // left); finger 2 (touch id 2, right) survives with a rebased anchor.
    await touch("touchEnd", [{x: centroid.x - half, y: centroid.y, id: 1}]);
    const afterLift = await stablePose(page);
    const liftStep = targetStep(beforeLift, afterLift);
    if (liftStep > 1e-6) throw Error("FINGER_LIFT_JUMP " + liftStep + " world units");
    // survivor continues: its current ground stays under it
    const survivorLocal = {x: localC.x + half, y: localC.y};
    const survivorAnchor = groundAtScreen(afterLift, survivorLocal, box);
    // Move the survivor INWARD (the right finger sits near the 390px edge; an
    // outward move would leave the viewport and CDP drops out-of-bounds touches).
    const nextLocal = {x: survivorLocal.x - 40, y: survivorLocal.y + 30};
    // Prove the REAL survivor path ran: the move must have been delivered as a
    // pointermove on the existing track, with NO fresh pointerdown after the
    // lift (a fresh press would mean the harness lifted the wrong finger).
    const survivorEvents = await touchMoveDelivered([{x: box.left + nextLocal.x, y: box.top + nextLocal.y, id: 2}]);
    const survivorMoveDelivered = true; // guaranteed by touchMoveDelivered
    const freshPressAfterLift = survivorEvents.some(e => e.t === "pointerdown");
    if (freshPressAfterLift) throw Error("SURVIVOR_PATH: lift synthesized a fresh press instead of continuing the survivor track: " + JSON.stringify(survivorEvents));
    const afterSurvivor = await stablePose(page);
    const survivorErr = errPx(afterSurvivor, survivorAnchor, nextLocal, box);
    await touch("touchEnd", []);
    if (survivorErr > TOL) throw Error("SURVIVOR_REBASE_DRIFT " + survivorErr + "px");
    report.measurements.phonePinchLift = {viewport: vp, emulated: true, centroid: localC, anchorWorld: anchorF, maxPinchErrorCssPx: maxPinchErr, pinchZoom: pinchPose.zoom, fingerLiftTargetStep: liftStep, survivorRebaseErrorCssPx: survivorErr, survivorMoveDelivered, freshPressAfterLift, survivorEvents, expected: "centroid anchored <=1px; finger lift zero target jump; survivor rebased <=1px on its continuing track (no fresh press)"};
    await page.screenshot({path: resolve(OUT, "phone-cam08-pinch-lift.png"), fullPage: false, animations: "disabled"});

    // ---- (G) NEGATIVE touch cancellation in BUILD mode: no purchase ----
    await page.locator('[data-tool="build"]').click();
    await page.waitForTimeout(60);
    const Ng = await structures(page);
    await page.evaluate(() => {delete document.body.dataset.lastSiteOk;});
    const site = await canvasPoint(page, PHONE_POINT_CANDIDATES);
    await touch("touchStart", [{x: site.x, y: site.y, id: 5}]);
    await page.waitForTimeout(40);
    await touchMoveDelivered([{x: site.x + 40, y: site.y + 50, id: 5}]); // drag >6px (delivered before cancel)
    await page.waitForTimeout(40);
    // CDP protocol: TouchCancel must not carry any touch points (it cancels
    // the whole active sequence); the browser delivers pointercancel.
    await touch("touchCancel", []);
    await page.waitForTimeout(40);
    const cancelledId = await page.evaluate(() => {const ev = window.__cam08events; for (let i = ev.length - 1; i >= 0; i--) if (ev[i].t === "pointercancel") return ev[i].id; return null;});
    if (cancelledId == null) throw Error("CANCEL_NOT_DELIVERED: no pointercancel reached the canvas");
    // CDP cannot emit touchEnd after touchCancel ("Must send a TouchStart
    // first"), so the late-up-after-cancel regression is exercised with a
    // synthetic PointerEvent carrying the SAME pointerId the browser just
    // cancelled — it runs the REAL canvas pointerup listener in the page.
    await page.evaluate(id => {document.querySelector(".world-canvas").dispatchEvent(new PointerEvent("pointerup", {pointerId: id, pointerType: "touch", clientX: 0, clientY: 0, buttons: 0, button: 0, bubbles: true}));}, cancelledId);
    await page.waitForTimeout(60);
    const NgAfter = await structures(page);
    const okAfterCancel = await siteOk(page);
    if (NgAfter !== Ng) throw Error("CANCEL_PURCHASE: structures " + Ng + " -> " + NgAfter + " after touch cancellation");
    if (okAfterCancel === "true") throw Error("CANCEL_PURCHASE: lastSiteOk true after cancellation");
    report.measurements.negativeTouchCancel = {viewport: vp, emulated: true, mode: "build", pressPoint: site, cancelledPointerId: cancelledId, lateUpAfterCancel: "synthetic PointerEvent with the cancelled pointerId (CDP cannot touchEnd after touchCancel)", structuresBefore: Ng, structuresAfter: NgAfter, lastSiteOkAfterCancel: okAfterCancel, expected: "cancelled touch drag submits NO build (structures unchanged, lastSiteOk !== true), even with a late pointerup for the cancelled id"};
    await page.screenshot({path: resolve(OUT, "phone-cam08-cancel-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (H) select-mode tap selects a starter building exactly once ----
    await page.locator('[data-tool="select"]').click();
    await page.waitForTimeout(60);
    // Find a starter building whose projected pixel is NOT covered by the
    // phone sheet/dock (elementFromPoint must be the canvas itself).
    const tapPose = await pose(page);
    let b = null, pixB = null, tap = null;
    for (const cand of game.buildings) {
      const groundB = {x: (cand.x + 0.5 - WORLD_SIZE / 2) * CELL, z: (cand.z + 0.5 - WORLD_SIZE / 2) * CELL};
      const pix = pixelOf(tapPose, groundB, box);
      const p = {x: Math.round(box.left + pix.x), y: Math.round(box.top + pix.y)};
      const hit = await page.evaluate(({x, y}) => {
        const c = document.querySelector(".world-canvas");
        return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y) === c;
      }, p);
      if (hit) {b = cand; pixB = pix; tap = p; break;}
    }
    if (!tap) throw Error("NO_TAP_TARGET: every starter building projects under UI cover");
    await touch("touchStart", [{x: tap.x, y: tap.y, id: 9}]);
    await page.waitForTimeout(40);
    await touch("touchEnd", []);
    await page.waitForTimeout(80);
    const selectedStatus = await page.evaluate(() => document.querySelector('[data-testid="inspector-status"]')?.textContent ?? null);
    const inspectorEmpty = await page.locator('[data-testid="inspector-empty"]').count();
    if (inspectorEmpty !== 0 || !selectedStatus) throw Error("TAP_SELECT: clean tap did not populate the inspector (empty=" + inspectorEmpty + " status=" + selectedStatus + ")");
    // A second identical tap must not duplicate side effects (still one selection).
    await touch("touchStart", [{x: tap.x, y: tap.y, id: 10}]);
    await page.waitForTimeout(40);
    await touch("touchEnd", []);
    await page.waitForTimeout(80);
    const structuresH = await structures(page);
    const inspectorEmpty2 = await page.locator('[data-testid="inspector-empty"]').count();
    if (inspectorEmpty2 !== 0) throw Error("TAP_ONCE: second identical tap lost the selection");
    if (structuresH !== N0phone) throw Error("TAP_PURCHASE: select mode changed structures " + N0phone + " -> " + structuresH);
    report.measurements.tapOnce = {viewport: vp, emulated: true, buildingCell: {x: b.x, z: b.z}, tapPixel: pixB, tapCss: tap, inspectorEmptyAfterTap: inspectorEmpty, selectedStatus, inspectorEmptyAfterSecondTap: inspectorEmpty2, structuresAfter: structuresH, expected: "a clean tap selects the starter building (inspector populated); a second identical tap keeps one selection; select mode never purchases"};
    await page.screenshot({path: resolve(OUT, "phone-cam08-tap-once.png"), fullPage: false, animations: "disabled"});

    const scroll = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 || Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2);
    const phoneGl = await webglCount(page);
    if (phoneGl !== 1) throw Error("PHONE_WEBGL_CONTEXT_COUNT " + phoneGl + " !== 1");
    report.views.push({name: "phone", viewport: vp, emulated: true, pageErrors: errs, failedRequests: failed, documentScroll: scroll, webglContextCount: phoneGl});
    if (errs.length || failed.length || scroll) throw Error("phone failure: errors=" + errs.join(";") + " failed=" + failed.join(",") + " scroll=" + scroll);
    await cdp.send("Page.stopScreencast").catch(() => {});
    await ctx.close();
  }

  report.status = "PASS_NUMERIC_ONLY";
} catch (e) {report.errors.push(String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;}
finally {
  if (browser) await browser.close();
  if (child) child.kill("SIGTERM");
  report.completed = new Date().toISOString();
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("CAM-08 pointer-ownership capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}
