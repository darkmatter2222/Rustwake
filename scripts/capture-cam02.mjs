// CAM-02 (#338) gesture-state-machine evidence on the PRODUCTION preview build.
// One Chromium instance, sequential desktop + emulated-phone contexts. Real CDP
// mouse/touch events drive the SAME production input path (cameraInput state
// machine -> onTap -> App buildAt/roadLine -> simulation spend). Every pose is
// read from the canvas dataset, stamped SYNCHRONOUSLY from the rendered THREE
// camera (#307 method hashes preserved: applyCamera f3afa5479a66b97e,
// stampCamera 691b3c0a3480e97b).
//
// MATERIAL SPEND is measured, not assumed: body.dataset.fleetProbe.bank (the
// SAME snapshot the UI renders) plus the footline STRUCTURES / ROAD CELLS
// counters, before vs after every gesture. The injected fixture is createGame()
// with vehicles:[] so the bank is STATIC except for player transactions (no
// freight income noise); the gesture path under test is byte-identical.
//
// Cases (issue #338 acceptance):
//  desktop: 5px drag / 4px jitter click (DOWN-cell commit across a cell edge) /
//  right-drag orbit / middle click / shift stationary press / orbit+click chord /
//  wheel during press / simulated pointercancel + real late up / clean build
//  click exactly once + selection / road two-click gesture with a drag between.
//  phone: 10px drag / 9px jitter tap / two-finger turn / pinch+lift /
//  touchCancel stationary + mid-drag / clean tap exactly once + selection.
//  Deterministic NEGATIVES: every gesture case above runs in BUILD mode at a
//  checkSite-valid cell, so a stray tap WOULD spend; actual spend must be 0.
//
// PASS_NUMERIC_ONLY: headless SwiftShader, phone EMULATED. This does NOT certify
// visual fidelity — G1 (#276) sponsor review is still required before any claim.
import {chromium} from "playwright-core";
import {CAMERA_LIMITS, normalizeCamera, groundAtScreen} from "../src/camera.js";
import {createGame, buildAt, roadLine} from "../src/simulation.js";
import {checkSite} from "../src/gridOccupancy.js";
import {SAVE_KEY, CELL, WORLD_SIZE, BLUEPRINTS} from "../src/content.js";
import {spawn} from "node:child_process";
import {mkdir, writeFile, readFile, readdir} from "node:fs/promises";
import {resolve} from "node:path";
import {inflateSync} from "node:zlib";

const OUT = resolve(process.env.RUSTWAKE_CAM02_OUT || "docs/evidence/338-cam-02");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT || 4294);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HOST = `${ORIGIN}/rustwake/`;
const TOL = 1;
const SALVAGER_COST = BLUEPRINTS.salvager.cost; // {credits:180, scrap:28, stone:12}
const report = {issue: 338, version: 2, build: "production-preview",
  source_sha: process.env.GITHUB_SHA || "local", started: new Date().toISOString(),
  views: [], measurements: {}, status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run; phone view is EMULATED, not a physical device (#268/#275 open)",
    "PASS_NUMERIC_ONLY: bank/structure/pose/DOM measurements are exact; visual fidelity is screenshot-only and NOT self-certified",
    "G1 visual review (#276) is sponsor-reserved; these artifacts are evidence for that review, not approval",
    "Hosted-browser deployment receipt (#333) is owed at deployment time, not by this local preview capture; branch CI success is NOT a production release",
    "Fixture = createGame() with vehicles:[] so freight income cannot pollute bank deltas; the pointer->onTap->buildAt/roadLine path under test is unchanged",
    "CDP touchMove events queue until the next compositor frame; Page.startScreencast forces BeginFrames and the harness ASSERTS each move reached the canvas before measuring (playwright-core 1.65.1 here vs lockfile 1.49.1 — delivery is asserted, not assumed)",
    "touchCancel carries no points and ends the CDP sequence; the late-up-after-cancel regression uses a synthetic PointerEvent with the cancelled pointerId against the real canvas listener (desktop uses a REAL CDP mouseReleased as the late up)",
    "The pre-fix Node failure proof (14 behavioral + 6 state-contract of 25 new tests) is recorded separately in prefix-proof.json"
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
function pixelOf(cam, ground, box) {
  const c = normalizeCamera(cam), k = kOf(box, c.zoom);
  const X = ground.x - c.x, Z = ground.z - c.z;
  const cs = Math.cos(rad(c.yaw)), sn = Math.sin(rad(c.yaw));
  const u = cs * X - sn * Z, v = -Math.sin(rad(c.elevation)) * (sn * X + cs * Z);
  return {x: u / k + box.width / 2, y: box.height / 2 - v / k};
}
const cellAt = (cam, css, box) => {
  const g = groundAtScreen(cam, {x: css.x - box.left, y: css.y - box.top}, box);
  return {x: Math.floor(g.x / CELL + WORLD_SIZE / 2), z: Math.floor(g.z / CELL + WORLD_SIZE / 2)};
};
const cellGround = c => ({x: (c.x + 0.5 - WORLD_SIZE / 2) * CELL, z: (c.z + 0.5 - WORLD_SIZE / 2) * CELL});
const bankDelta = (before, after) => {
  const d = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const v = (after[k] ?? 0) - (before[k] ?? 0);
    if (v !== 0) d[k] = v;
  }
  return d;
};
const negCost = cost => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, -v]));

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

  // Fixture: starter yard, NO vehicles -> bank static except player transactions.
  const fixture = createGame();
  fixture.vehicles = [];
  const inject = async ctx => {
    await ctx.addInitScript(() => {
      window.__rwCam02 = {webglContexts: 0};
      const seen = new WeakSet();
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = orig.call(this, type, ...rest);
        if (c && /webgl/i.test(String(type)) && !seen.has(c)) {seen.add(c); window.__rwCam02.webglContexts++;}
        return c;
      };
    });
    const json = JSON.stringify(fixture);
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
    await page.waitForFunction(() => !!document.body.dataset.fleetProbe, null, {timeout: 20000});
    // Condition-based spend-settle clock: count REAL fleetProbe attribute writes
    // (the app re-stamps every ~270ms UI snapshot; a dataset set queues a mutation
    // record even when the JSON is unchanged). noSpend waits for >=2 fresh writes
    // after a gesture instead of a fixed sleep, so a loaded host cannot false-PASS
    // by measuring a stale snapshot nor false-FAIL by timing out early.
    await page.evaluate(() => {
      window.__cam02probeTicks = 0;
      new MutationObserver(ms => {for (const m of ms) if (m.attributeName === "data-fleet-probe") window.__cam02probeTicks++;})
        .observe(document.body, {attributes: true, attributeFilter: ["data-fleet-probe"]});
    });
    return {page, errs, failed};
  };
  const pose = page => page.locator(".world-canvas").evaluate(c => ({
    yaw: Number(c.dataset.cameraYaw), elevation: Number(c.dataset.cameraElevation),
    zoom: Number(c.dataset.cameraZoom), x: Number(c.dataset.cameraX), z: Number(c.dataset.cameraZ)
  }));
  const rect = page => page.locator(".world-canvas").evaluate(c => {const r = c.getBoundingClientRect(); return {left: r.left, top: r.top, width: r.width, height: r.height};});
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
  const counts = page => page.evaluate(() => {
    const t = document.querySelector(".footline")?.textContent || "";
    const s = t.match(/(\d+)\s+STRUCTURES/), r = t.match(/(\d+)\s+ROAD CELLS/);
    return {structures: s ? Number(s[1]) : null, roads: r ? Number(r[1]) : null};
  });
  const bank = page => page.evaluate(() => JSON.parse(document.body.dataset.fleetProbe).bank);
  const siteOk = page => page.evaluate(() => document.body.dataset.lastSiteOk ?? null);
  const clearSite = page => page.evaluate(() => {delete document.body.dataset.lastSiteOk; delete document.body.dataset.lastSiteCode; delete document.body.dataset.lastSiteReason;});
  const inspectorText = page => page.evaluate(() => document.querySelector(".inspector-panel")?.textContent ?? null);
  const inspectorEmpty = page => page.locator('[data-testid="inspector-empty"]').count();
  // Condition-based mode wait: the REAL aria-pressed state, never a fixed sleep.
  const setMode = async (page, tool) => {
    await page.locator(`[data-tool="${tool}"]`).click();
    await page.waitForFunction(t => document.querySelector('[data-tool="' + t + '"]')?.getAttribute("aria-pressed") === "true", tool, {timeout: 5000});
  };
  // A build commit raises a NOTICE toast that floats over the world band. It is
  // a real, dismissible UI element (aria-label "Dismiss notice"); dismissing it
  // is a player action, not a gate relaxation. Wait until it is actually gone.
  const dismissToast = async page => {
    const btn = page.locator('[aria-label="Dismiss notice"]');
    if (await btn.count()) await btn.first().click();
    await page.waitForFunction(() => !document.querySelector(".toast"), null, {timeout: 5000});
  };
  // Wait for the UI snapshot (270ms cadence) to reflect a transaction.
  const waitCounts = async (page, before, want) => {
    await page.waitForFunction(w => {
      const t = document.querySelector(".footline")?.textContent || "";
      const s = t.match(/(\d+)\s+STRUCTURES/), r = t.match(/(\d+)\s+ROAD CELLS/);
      return (s ? Number(s[1]) : null) === w.structures && (r ? Number(r[1]) : null) === w.roads;
    }, want, {timeout: 5000});
  };
  // fleetProbe refreshes on a ~270ms cadence; footline updates immediately.
  // Wait until the bank snapshot actually moves before measuring a spend.
  const waitBankMoved = async (page, beforeBank) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const b = await bank(page);
      if (Object.keys(bankDelta(beforeBank, b)).length) return b;
      await page.waitForTimeout(60);
    }
    throw Error("BANK_NEVER_MOVED after confirmed transaction");
  };
  const noSpend = async (page, before, label, {noTap = false} = {}) => {
    // Wait for >=2 REAL fleetProbe snapshot writes after the gesture (condition-
    // based; the ~270ms cadence means any transaction would be visible by then).
    const t0 = await page.evaluate(() => window.__cam02probeTicks ?? 0);
    await page.waitForFunction(n => (window.__cam02probeTicks ?? 0) >= n + 2, t0, {timeout: 15000});
    const after = await bank(page), c = await counts(page), ok = await siteOk(page);
    const delta = bankDelta(before.bank, after);
    if (Object.keys(delta).length) throw Error(label + " SPENT materials: " + JSON.stringify(delta));
    if (c.structures !== before.counts.structures || c.roads !== before.counts.roads)
      throw Error(label + " changed counts: " + JSON.stringify({before: before.counts, after: c}));
    if (ok === "true") throw Error(label + " lastSiteOk=true (a build was submitted)");
    // Stronger build-mode negative: lastSiteOk is stamped by EVERY build-mode tap
    // (even a rejected one). null proves no tap reached the gameplay dispatch.
    if (noTap && ok !== null) throw Error(label + " lastSiteOk=" + JSON.stringify(ok) + " (a tap reached buildAt)");
    return {bankDelta: delta, countsAfter: c, lastSiteOk: ok, probeTicksWaited: 2};
  };
  const snap = async page => ({bank: await bank(page), counts: await counts(page)});
  // Find a checkSite-valid salvager cell whose projected pixel is the CANVAS
  // itself (not UI cover). jitter>0 additionally requires the down pixel to sit
  // where a +jitter px x-move crosses a cell edge (DOWN-cell commit proof).
  const findSite = async (page, cam, box, vp, jitter = 0) => {
    for (let z = 0; z < WORLD_SIZE; z++) for (let x = 0; x < WORLD_SIZE; x++) {
      if (!checkSite(fixture, "salvager", x, z, 0).ok) continue;
      const pix = pixelOf(cam, cellGround({x, z}), box);
      const offsets = jitter ? Array.from({length: 81}, (_, i) => i - 40) : [0];
      for (const ox of offsets) {
        const css = {x: Math.round(box.left + pix.x + ox), y: Math.round(box.top + pix.y)};
        if (css.x < 2 || css.y < 2 || css.x >= vp.width - 2 || css.y >= vp.height - 2) continue;
        const down = cellAt(cam, css, box);
        if (down.x !== x || down.z !== z) continue;
        if (jitter) {
          const rel = cellAt(cam, {x: css.x + jitter, y: css.y}, box);
          if (rel.x === down.x && rel.z === down.z) continue;
        }
        const hit = await page.evaluate(({x, y}) => document.elementFromPoint(x, y) === document.querySelector(".world-canvas"), css);
        if (hit) return {cell: {x, z}, css, releaseCell: jitter ? cellAt(cam, {x: css.x + jitter, y: css.y}, box) : null};
      }
    }
    throw Error("NO_BUILD_SITE: no checkSite-valid cell projects onto the bare canvas" + (jitter ? " with a " + jitter + "px cell-edge crossing" : ""));
  };
  const expectBuild = async (page, before, site, label) => {
    await waitCounts(page, before.counts, {structures: before.counts.structures + 1, roads: before.counts.roads});
    const after = await waitBankMoved(page, before.bank), c = await counts(page), ok = await siteOk(page);
    const delta = bankDelta(before.bank, after);
    const want = negCost(SALVAGER_COST);
    if (JSON.stringify(delta) !== JSON.stringify(want))
      throw Error(label + " BANK_DELTA " + JSON.stringify(delta) + " !== " + JSON.stringify(want));
    if (ok !== "true") throw Error(label + " lastSiteOk=" + ok);
    const insp = await inspectorText(page);
    const siteTag = "SITE " + site.cell.x + "." + site.cell.z;
    if (!insp || !insp.includes("Scrap Extractor") || !insp.includes(siteTag))
      throw Error(label + " SELECTION wrong: " + JSON.stringify({insp, siteTag}));
    // mirror the confirmed transaction so the next findSite sees true occupancy
    const m = buildAt(fixture, "salvager", site.cell.x, site.cell.z, 0);
    if (!m.ok) throw Error(label + " MIRROR_DISAGREE " + JSON.stringify(m));
    return {bankDelta: delta, expectedBankDelta: want, countsBefore: before.counts, countsAfter: c, lastSiteOk: ok, inspectorHasSiteTag: siteTag, newBuildingId: m.building.id};
  };
  const hasCapture = (page, id) => page.locator(".world-canvas").evaluate((c, pid) => c.hasPointerCapture(pid), id);
  const webglCount = page => page.evaluate(() => window.__rwCam02?.webglContexts ?? null);
  const recordPid = page => page.evaluate(() => {window.__cam02pid = null; const c = document.querySelector(".world-canvas"); c.addEventListener("pointerdown", e => {window.__cam02pid = e.pointerId;}, {once: true});});

  // ================= DESKTOP 1440x900 =================
  {
    const vp = {width: 1440, height: 900};
    const ctx = await browser.newContext({viewport: vp, deviceScaleFactor: 1, reducedMotion: "reduce"});
    await inject(ctx);
    const {page, errs, failed} = await newPage(ctx);
    const cdp = await ctx.newCDPSession(page);
    const box = await rect(page);
    const home = await goHome(page);
    if (home.yaw !== 45 || Math.abs(home.elevation - 35.264) > 1e-6) throw Error("HOME_POSE " + JSON.stringify(home));
    const N0 = await counts(page);
    await page.screenshot({path: resolve(OUT, "desktop-cam02-home.png"), fullPage: false, animations: "disabled"});
    const mouse = (type, x, y, button = "none", buttons = 0, modifiers = 0) =>
      cdp.send("Input.dispatchMouseEvent", {type, x, y, button, buttons, modifiers, clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0});

    // ---- (A) BUILD mode, exactly-5px left drag: pans, NEVER spends ----
    await setMode(page, "build");
    await clearSite(page);
    let cam = await pose(page);
    const sA = await findSite(page, cam, box, vp);
    const beforeA = await snap(page);
    const anchorA = groundAtScreen(cam, {x: sA.css.x - box.left, y: sA.css.y - box.top}, box);
    await mouse("mousePressed", sA.css.x, sA.css.y, "left", 1);
    await mouse("mouseMoved", sA.css.x + 5, sA.css.y, "left", 1); // hypot == 5 == mouse slop
    const afterA = await stablePose(page);
    const errA = errPx(afterA, anchorA, {x: sA.css.x + 5 - box.left, y: sA.css.y - box.top}, box);
    await stampCheck(page, "5px-pan");
    await mouse("mouseReleased", sA.css.x + 5, sA.css.y, "left", 0);
    const nsA = await noSpend(page, beforeA, "DRAG_5PX", {noTap: true});
    if (errA > TOL) throw Error("DRAG_5PX ANCHOR " + errA + "px");
    // Selection stays correct: a committed build would auto-exit to inspect
    // (aria-pressed false on the build tool) and mount the inspector sheet.
    const stillBuildA = await page.evaluate(() => document.querySelector('[data-tool="build"]')?.getAttribute("aria-pressed"));
    if (stillBuildA !== "true") throw Error("DRAG_5PX left build mode (a build committed)");
    if (await inspectorEmpty(page) !== 0) throw Error("DRAG_5PX opened an inspector selection");
    report.measurements.desktopDrag5px = {viewport: vp, mode: "build", site: sA.cell, pressCss: sA.css, dragPx: 5, anchorWorld: anchorA, poseAfter: afterA, errorCssPx: errA, ...nsA, modeStillBuild: stillBuildA === "true", inspectorEmpty: await inspectorEmpty(page), expected: "5px mouse drag pans anchor-exact <=1px and spends NOTHING (bank delta {}, counts unchanged, lastSiteOk null = no tap reached buildAt, build mode retained, no selection)"};
    await page.screenshot({path: resolve(OUT, "desktop-cam02-drag5-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (B) BUILD mode, 4px jitter across a cell edge: ONE build at DOWN cell ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    cam = await pose(page);
    const sB = await findSite(page, cam, box, vp, 4);
    const beforeB = await snap(page);
    await mouse("mousePressed", sB.css.x, sB.css.y, "left", 1);
    await mouse("mouseMoved", sB.css.x + 4, sB.css.y, "left", 1); // 4 < 5 -> click
    await mouse("mouseReleased", sB.css.x + 4, sB.css.y, "left", 0);
    const bB = await expectBuild(page, beforeB, sB, "JITTER_4PX");
    // exactly once: mode auto-exited to inspect; a second tap on the SAME pixel
    // must select, not re-build (no extra spend, no extra structure). CAM-05
    // docks the sheet on the half OPPOSITE the machine, so the pixel stays bare.
    await clearSite(page);
    const beforeB2 = await snap(page);
    const hitB2 = await page.evaluate(({x, y}) => document.elementFromPoint(x, y) === document.querySelector(".world-canvas"), sB.css);
    if (!hitB2) throw Error("SECOND_TAP pixel covered by UI");
    await mouse("mousePressed", sB.css.x, sB.css.y, "left", 1);
    await mouse("mouseReleased", sB.css.x, sB.css.y, "left", 0);
    const nsB2 = await noSpend(page, beforeB2, "SECOND_TAP");
    const inspB2 = await inspectorText(page);
    if (!inspB2 || !inspB2.includes("SITE " + sB.cell.x + "." + sB.cell.z)) throw Error("SECOND_TAP lost selection");
    report.measurements.desktopJitter4pxCommit = {viewport: vp, mode: "build", downCell: sB.cell, releasePixelCell: sB.releaseCell, pressCss: sB.css, releaseCss: {x: sB.css.x + 4, y: sB.css.y}, jitterPx: 4, ...bB, secondTap: {...nsB2, selectionKept: true}, expected: "4px jitter commits EXACTLY ONE salvager at the DOWN cell (not the release cell): bank delta == -cost, structures +1, inspector SITE == down cell; second tap selects, spends 0"};
    await page.screenshot({path: resolve(OUT, "desktop-cam02-jitter-commit.png"), fullPage: false, animations: "disabled"});

    // ---- (C) BUILD mode right-drag orbit: yaw changes, NEVER spends ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    cam = await pose(page);
    const sC = await findSite(page, cam, box, vp);
    const beforeC = await snap(page);
    await mouse("mousePressed", sC.css.x, sC.css.y, "right", 2);
    await mouse("mouseMoved", sC.css.x + 80, sC.css.y + 30, "right", 2);
    const afterC = await stablePose(page);
    await stampCheck(page, "orbit");
    await mouse("mouseReleased", sC.css.x + 80, sC.css.y + 30, "right", 0);
    const nsC = await noSpend(page, beforeC, "RIGHT_DRAG", {noTap: true});
    if (afterC.yaw === cam.yaw) throw Error("RIGHT_DRAG did not orbit");
    report.measurements.desktopRightDragOrbit = {viewport: vp, mode: "build", site: sC.cell, yawBefore: cam.yaw, yawAfter: afterC.yaw, ...nsC, expected: "right-drag orbits yaw and spends NOTHING"};
    await page.screenshot({path: resolve(OUT, "desktop-cam02-orbit-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (D) NEGATIVE middle-button click in BUILD mode ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    cam = await pose(page);
    const sD = await findSite(page, cam, box, vp);
    const beforeD = await snap(page);
    await mouse("mousePressed", sD.css.x, sD.css.y, "middle", 4);
    await mouse("mouseReleased", sD.css.x, sD.css.y, "middle", 0);
    const nsD = await noSpend(page, beforeD, "MIDDLE_CLICK", {noTap: true});
    report.measurements.negativeMiddleClick = {viewport: vp, mode: "build", site: sD.cell, ...nsD, expected: "middle click spends NOTHING (pre-fix tapped: only button 2 was excluded)"};

    // ---- (E) NEGATIVE shift+left stationary press in BUILD mode ----
    await clearSite(page);
    const beforeE = await snap(page);
    await mouse("mousePressed", sD.css.x, sD.css.y, "left", 1, 8); // Shift=8
    await mouse("mouseReleased", sD.css.x, sD.css.y, "left", 0, 8);
    const nsE = await noSpend(page, beforeE, "SHIFT_PRESS", {noTap: true});
    report.measurements.negativeShiftStationary = {viewport: vp, mode: "build", site: sD.cell, modifiers: "Shift", ...nsE, expected: "shift+left stationary press is orbit intent: spends NOTHING (pre-fix tapped)"};

    // ---- (F) NEGATIVE orbit+click button chord in BUILD mode ----
    await clearSite(page);
    const beforeF = await snap(page);
    await mouse("mousePressed", sD.css.x, sD.css.y, "right", 2);
    await mouse("mouseMoved", sD.css.x + 60, sD.css.y + 20, "right", 2); // orbit
    await mouse("mousePressed", sD.css.x + 60, sD.css.y + 20, "left", 3); // chord: left down while right held
    await mouse("mouseReleased", sD.css.x + 60, sD.css.y + 20, "left", 2); // left up, right still held
    const midF = await noSpend(page, beforeF, "CHORD_MID", {noTap: true});
    await mouse("mouseReleased", sD.css.x + 60, sD.css.y + 20, "right", 0); // final right up
    const nsF = await noSpend(page, beforeF, "CHORD_FINAL", {noTap: true});
    report.measurements.negativeOrbitClickChord = {viewport: vp, mode: "build", site: sD.cell, afterLeftRelease: midF, afterFinalRelease: nsF, expected: "orbit+click chord: NEITHER the non-final left release NOR the final right release spends (pre-fix re-armed a fresh track and tapped on the left release)"};

    // ---- (G) NEGATIVE wheel zoom during a stationary left press ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    cam = await pose(page);
    const sG = await findSite(page, cam, box, vp);
    const beforeG = await snap(page);
    await mouse("mousePressed", sG.css.x, sG.css.y, "left", 1);
    await cdp.send("Input.dispatchMouseEvent", {type: "mouseWheel", x: sG.css.x, y: sG.css.y, deltaX: 0, deltaY: -120});
    const zoomedG = await stablePose(page);
    await mouse("mouseReleased", sG.css.x, sG.css.y, "left", 0);
    const nsG = await noSpend(page, beforeG, "WHEEL_DURING_PRESS", {noTap: true});
    if (!(zoomedG.zoom > cam.zoom)) throw Error("WHEEL_DURING_PRESS did not zoom");
    report.measurements.negativeWheelDuringPress = {viewport: vp, mode: "build", site: sG.cell, zoomBefore: cam.zoom, zoomAfter: zoomedG.zoom, ...nsG, expected: "wheel zoom while a contact is held marks the gesture: release spends NOTHING (pre-fix tapped)"};

    // ---- (H) NEGATIVE simulated pointercancel of a stationary press + REAL late up ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    cam = await pose(page);
    const sH = await findSite(page, cam, box, vp);
    const beforeH = await snap(page);
    await recordPid(page);
    await mouse("mousePressed", sH.css.x, sH.css.y, "left", 1);
    await page.waitForFunction(() => window.__cam02pid != null, null, {timeout: 5000});
    const pidH = await page.evaluate(() => window.__cam02pid);
    const capturedH = await hasCapture(page, pidH);
    if (!capturedH) throw Error("POINTERCANCEL press did not capture");
    // Simulated OS/browser pointercancel (CDP has no mouse-cancel primitive);
    // dispatchEvent is synchronous, so the purge has run when evaluate resolves.
    // The REAL CDP mouseReleased below is the late-up regression.
    await page.evaluate(id => {document.querySelector(".world-canvas").dispatchEvent(new PointerEvent("pointercancel", {pointerId: id, pointerType: "mouse", clientX: 0, clientY: 0, buttons: 0, button: 0, bubbles: true}));}, pidH);
    await mouse("mouseReleased", sH.css.x, sH.css.y, "left", 0); // real late up
    const nsH = await noSpend(page, beforeH, "POINTERCANCEL", {noTap: true});
    const capturedAfterH = await hasCapture(page, pidH);
    if (capturedAfterH) throw Error("POINTERCANCEL capture not freed");
    report.measurements.negativePointerCancelDesktop = {viewport: vp, mode: "build", site: sH.cell, pointerId: pidH, capturedBefore: capturedH, capturedAfter: capturedAfterH, cancel: "synthetic PointerEvent(pointercancel) with the real mouse pointerId", lateUp: "REAL CDP mouseReleased", ...nsH, expected: "cancelled stationary press + late real pointerup spends NOTHING; capture freed"};
    await page.screenshot({path: resolve(OUT, "desktop-cam02-cancel-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (I) BUILD mode clean intentional click: exactly once + selection ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    cam = await pose(page);
    const sI = await findSite(page, cam, box, vp);
    const beforeI = await snap(page);
    await mouse("mousePressed", sI.css.x, sI.css.y, "left", 1);
    await mouse("mouseReleased", sI.css.x, sI.css.y, "left", 0);
    const bI = await expectBuild(page, beforeI, sI, "CLEAN_CLICK");
    report.measurements.desktopCleanClickCommit = {viewport: vp, mode: "build", site: sI.cell, pressCss: sI.css, ...bI, expected: "clean click commits EXACTLY ONE salvager: bank delta == -{credits:180,scrap:28,stone:12}, structures +1, inspector selects the NEW building at the tapped cell, build mode auto-exits"};
    await page.screenshot({path: resolve(OUT, "desktop-cam02-clean-commit.png"), fullPage: false, animations: "disabled"});

    // ---- (J) ROAD gesture: drag commits nothing; two clean clicks pave once ----
    await goHome(page); await setMode(page, "road"); await clearSite(page);
    cam = await pose(page);
    // Find a straight road route on the mirror: trial roadLine on a clone.
    let route = null;
    outer:
    for (let z = 2; z < WORLD_SIZE - 2; z++) for (let x = 2; x < WORLD_SIZE - 8; x++) {
      const a = {x, z}, b = {x: x + 5, z};
      const trial = structuredClone(fixture);
      const r = roadLine(trial, a, b);
      if (!r.ok || r.cells < 3) continue;
      const pa = pixelOf(cam, cellGround(a), box), pb = pixelOf(cam, cellGround(b), box);
      const ca = {x: Math.round(box.left + pa.x), y: Math.round(box.top + pa.y)};
      const cb = {x: Math.round(box.left + pb.x), y: Math.round(box.top + pb.y)};
      if (ca.x < 2 || ca.y < 2 || cb.x >= vp.width - 2 || cb.y >= vp.height - 2) continue;
      const hit = await page.evaluate(([p, q]) => {
        const c = document.querySelector(".world-canvas");
        return document.elementFromPoint(p.x, p.y) === c && document.elementFromPoint(q.x, q.y) === c;
      }, [ca, cb]);
      if (hit) {route = {a, b, ca, cb, cells: r.cells, cost: {credits: 4 * r.cells, stone: 3 * r.cells}}; break outer;}
    }
    if (!route) throw Error("NO_ROAD_ROUTE");
    const beforeJ = await snap(page);
    // J1: a drag in road mode (no origin armed) must pave NOTHING.
    await mouse("mousePressed", route.ca.x, route.ca.y, "left", 1);
    await mouse("mouseMoved", route.cb.x, route.cb.y, "left", 1);
    await mouse("mouseReleased", route.cb.x, route.cb.y, "left", 0);
    const nsJ1 = await noSpend(page, beforeJ, "ROAD_DRAG");
    // J2: clean origin click arms roadStart (no spend yet).
    await goHome(page); cam = await pose(page);
    const pa2 = pixelOf(cam, cellGround(route.a), box), pb2 = pixelOf(cam, cellGround(route.b), box);
    const oa = {x: Math.round(box.left + pa2.x), y: Math.round(box.top + pa2.y)};
    const ob = {x: Math.round(box.left + pb2.x), y: Math.round(box.top + pb2.y)};
    // The ROUNDED press pixel must still pick the intended origin cell.
    const oaCell = cellAt(cam, {x: oa.x - box.left, y: oa.y - box.top}, box);
    if (!oaCell || oaCell.x !== route.a.x || oaCell.z !== route.a.z) throw Error("ROAD_ORIGIN_PIXEL_CELL " + JSON.stringify(oaCell) + " !== " + JSON.stringify(route.a));
    const beforeJ2 = await snap(page);
    await mouse("mousePressed", oa.x, oa.y, "left", 1);
    await mouse("mouseReleased", oa.x, oa.y, "left", 0);
    const nsJ2 = await noSpend(page, beforeJ2, "ROAD_ORIGIN");
    // J3: a drag from origin toward destination pans but must NOT pave.
    await mouse("mousePressed", oa.x, oa.y, "left", 1);
    await mouse("mouseMoved", ob.x, ob.y, "left", 1);
    await mouse("mouseReleased", ob.x, ob.y, "left", 0);
    const nsJ3 = await noSpend(page, beforeJ2, "ROAD_DRAG_BETWEEN");
    // J4: clean destination click paves EXACTLY the route once.
    await goHome(page); cam = await pose(page);
    const pb3 = pixelOf(cam, cellGround(route.b), box);
    const ob3 = {x: Math.round(box.left + pb3.x), y: Math.round(box.top + pb3.y)};
    const obCell = cellAt(cam, {x: ob3.x - box.left, y: ob3.y - box.top}, box);
    if (!obCell || obCell.x !== route.b.x || obCell.z !== route.b.z) throw Error("ROAD_DEST_PIXEL_CELL " + JSON.stringify(obCell) + " !== " + JSON.stringify(route.b));
    await mouse("mousePressed", ob3.x, ob3.y, "left", 1);
    await mouse("mouseReleased", ob3.x, ob3.y, "left", 0);
    await waitCounts(page, beforeJ2.counts, {structures: beforeJ2.counts.structures, roads: beforeJ2.counts.roads + route.cells});
    const afterJ = await waitBankMoved(page, beforeJ2.bank), cJ = await counts(page);
    const deltaJ = bankDelta(beforeJ2.bank, afterJ);
    const wantJ = negCost(route.cost);
    if (JSON.stringify(deltaJ) !== JSON.stringify(wantJ)) throw Error("ROAD_BANK_DELTA " + JSON.stringify(deltaJ) + " !== " + JSON.stringify(wantJ));
    const mJ = roadLine(fixture, route.a, route.b);
    if (!mJ.ok || mJ.cells !== route.cells) throw Error("ROAD_MIRROR_DISAGREE " + JSON.stringify(mJ));
    report.measurements.roadGesture = {viewport: vp, mode: "road", origin: route.a, destination: route.b, originPixelCell: oaCell, destinationPixelCell: obCell, dragOnly: nsJ1, originClick: nsJ2, dragBetween: nsJ3, destinationClick: {bankDelta: deltaJ, expectedBankDelta: wantJ, countsBefore: beforeJ2.counts, countsAfter: cJ, roadCellsAdded: route.cells}, expected: "drag (armed or not) pave NOTHING and spend 0; origin click arms without spend; destination click paves exactly the route once: roads +N, bank -{4N credits, 3N stone}, structures unchanged"};
    await page.screenshot({path: resolve(OUT, "desktop-cam02-road.png"), fullPage: false, animations: "disabled"});

    // ---- (K) select-mode tap selects a starter building, spends nothing ----
    // CAM-05 retains the selection across tool switches: nextToolMode("select",
    // selectedId!=null) would land in "inspect". Escape is the explicit deselect
    // (selection cleared, mode select) so the select tool really arms.
    await goHome(page);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-tool="select"]')?.getAttribute("aria-pressed") === "true", null, {timeout: 5000});
    await setMode(page, "select"); await clearSite(page);
    cam = await pose(page);
    let tapK = null;
    for (const b of fixture.buildings) {
      const pix = pixelOf(cam, cellGround(b), box);
      const p = {x: Math.round(box.left + pix.x), y: Math.round(box.top + pix.y)};
      if (p.x < 2 || p.y < 2 || p.x >= vp.width - 2 || p.y >= vp.height - 2) continue;
      const hit = await page.evaluate(({x, y}) => document.elementFromPoint(x, y) === document.querySelector(".world-canvas"), p);
      if (hit) {tapK = {b, p}; break;}
    }
    if (!tapK) throw Error("NO_SELECT_TARGET");
    const beforeK = await snap(page);
    await mouse("mousePressed", tapK.p.x, tapK.p.y, "left", 1);
    await mouse("mouseReleased", tapK.p.x, tapK.p.y, "left", 0);
    const nameK = BLUEPRINTS[tapK.b.type].name;
    // Condition-based: wait for the REAL inspector to show the tapped building.
    await page.waitForFunction(n => (document.querySelector(".inspector-panel")?.textContent ?? "").includes(n), nameK, {timeout: 5000});
    const nsK = await noSpend(page, beforeK, "SELECT_TAP");
    const inspK = await inspectorText(page);
    if (!inspK || !inspK.includes(nameK)) throw Error("SELECT_TAP did not select " + nameK + ": " + JSON.stringify(inspK));
    report.measurements.selectTap = {viewport: vp, mode: "select", buildingCell: {x: tapK.b.x, z: tapK.b.z}, buildingName: nameK, ...nsK, selected: true, expected: "clean select-mode tap selects the starter building and spends NOTHING"};

    const gl = await page.evaluate(() => ({
      contextCount: window.__rwCam02?.webglContexts ?? null,
      scroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 || Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2
    }));
    if (gl.contextCount !== 1) throw Error("WEBGL_CONTEXT_COUNT " + gl.contextCount + " !== 1");
    report.views.push({name: "desktop", viewport: vp, pageErrors: errs, failedRequests: failed, documentScroll: gl.scroll, webglContextCount: gl.contextCount, homePose: home, counts: N0});
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
    cdp.on("Page.screencastFrame", p => {cdp.send("Page.screencastFrameAck", {sessionId: p.sessionId}).catch(() => {});});
    await cdp.send("Page.startScreencast", {format: "jpeg", quality: 20, everyNthFrame: 1});
    const box = await rect(page);
    const home = await goHome(page);
    const N0 = await counts(page);
    await page.screenshot({path: resolve(OUT, "phone-cam02-home.png"), fullPage: false, animations: "disabled"});
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", {type, touchPoints: points});
    await page.evaluate(() => {window.__cam02events = []; const c = document.querySelector(".world-canvas"); for (const t of ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture","pointerout"]) c.addEventListener(t, e => {window.__cam02events.push({t, id: e.pointerId, b: e.buttons, x: Math.round(e.clientX), y: Math.round(e.clientY)});}, true);});
    const touchMoveDelivered = async points => {
      const since = await page.evaluate(() => window.__cam02events.length);
      await touch("touchMove", points);
      const want = points.map(p => ({x: Math.round(p.x), y: Math.round(p.y)}));
      for (let i = 0; i < 60; i++) {
        const ev = await page.evaluate(n => window.__cam02events.slice(n), since);
        if (want.every(w => ev.some(e => e.t === "pointermove" && e.x === w.x && e.y === w.y))) return ev;
        await page.waitForTimeout(40);
      }
      throw Error("HARNESS_MOVE_NOT_DELIVERED: " + JSON.stringify(want));
    };
    // Condition-based touchStart delivery: wait until a REAL pointerdown at each
    // press pixel appears in the canvas event log (browser pointerIds differ from
    // CDP touch ids, so match by rounded coordinates, never by id).
    const waitDownAt = async (points, since) => {
      await page.waitForFunction(({n, pts}) => {
        const ev = window.__cam02events.slice(n);
        return pts.every(p => ev.some(e => e.t === "pointerdown" && e.x === Math.round(p.x) && e.y === Math.round(p.y)));
      }, {n: since, pts: points}, {timeout: 10000});
    };
    const logLen = () => page.evaluate(() => window.__cam02events.length);
    // Condition-based touchCancel delivery: wait for a REAL pointercancel in the
    // log after the given index, then return the cancelled browser pointerId.
    const waitCancel = async since => {
      await page.waitForFunction(n => window.__cam02events.slice(n).some(e => e.t === "pointercancel"), since, {timeout: 10000});
      return page.evaluate(n => {const ev = window.__cam02events.slice(n); for (let i = ev.length - 1; i >= 0; i--) if (ev[i].t === "pointercancel") return ev[i].id; return null;}, since);
    };
    // Two-finger gestures need a zone where EVERY swept pixel is bare canvas
    // (the compact build sheet / HUD must not swallow a finger). Verify the
    // twist + pinch + survivor extremes at candidate heights before driving.
    const bareGestureZone = async () => {
      const zoneDiag = [];
      for (const fy of [0.3, 0.25, 0.35, 0.2, 0.4, 0.15]) {
        const lc = {x: box.width * 0.5, y: box.height * fy};
        const c = {x: box.left + lc.x, y: box.top + lc.y};
        const pts = [];
        for (const deg of [0, 10, 20, 30, 40]) {
          const r = rad(deg), h = 55 + deg * 0.4;
          pts.push({x: c.x - Math.cos(r) * h, y: c.y - Math.sin(r) * h}, {x: c.x + Math.cos(r) * h, y: c.y + Math.sin(r) * h});
        }
        for (const h of [50, 68, 86, 104, 120]) pts.push({x: c.x - h, y: c.y}, {x: c.x + h, y: c.y});
        pts.push({x: c.x + 120 - 35, y: c.y + 25});
        const diag = await page.evaluate(ps => {
          const c = document.querySelector(".world-canvas");
          const bad = [];
          for (const p of ps) {const el = document.elementFromPoint(p.x, p.y); if (el !== c) bad.push({p, cover: el ? (el.className && String(el.className).slice(0, 60) || el.tagName) : "null"});}
          return bad;
        }, pts);
        if (!diag.length) return {local: lc, css: c, heightFraction: fy};
        zoneDiag.push({fy, bad: diag.slice(0, 4)});
      }
      throw Error("NO_BARE_GESTURE_ZONE: " + JSON.stringify(zoneDiag));
    };
    // Phone build-mode sheet can cover the canvas center: restrict sites to the
    // upper band and verify elementFromPoint (findSite already does).
    const phoneSite = async (jitter = 0) => {
      const cam = await pose(page);
      for (let z = 0; z < WORLD_SIZE; z++) for (let x = 0; x < WORLD_SIZE; x++) {
        if (!checkSite(fixture, "salvager", x, z, 0).ok) continue;
        const pix = pixelOf(cam, cellGround({x, z}), box);
        const offsets = jitter ? Array.from({length: 81}, (_, i) => i - 40) : [0];
        for (const ox of offsets) {
          const css = {x: Math.round(box.left + pix.x + ox), y: Math.round(box.top + pix.y)};
          if (css.y > box.top + box.height * 0.42 || css.x < 4 || css.x >= vp.width - 14 || css.y < 4) continue;
          const down = cellAt(cam, css, box);
          if (down.x !== x || down.z !== z) continue;
          if (jitter) {
            const rel = cellAt(cam, {x: css.x + jitter, y: css.y}, box);
            if (rel.x === down.x && rel.z === down.z) continue;
            if (css.x + jitter >= vp.width - 2) continue;
          }
          const hit = await page.evaluate(({x, y}) => document.elementFromPoint(x, y) === document.querySelector(".world-canvas"), css);
          if (hit) return {cell: {x, z}, css, releaseCell: jitter ? cellAt(cam, {x: css.x + jitter, y: css.y}, box) : null, cam};
        }
      }
      throw Error("NO_PHONE_BUILD_SITE" + (jitter ? " (jitter " + jitter + ")" : ""));
    };

    // ---- (P1) BUILD mode 10px touch drag: pans, NEVER spends ----
    await setMode(page, "build"); await clearSite(page);
    const sP1 = await phoneSite();
    const beforeP1 = await snap(page);
    const anchorP1 = groundAtScreen(sP1.cam, {x: sP1.css.x - box.left, y: sP1.css.y - box.top}, box);
    const sinceP1 = await logLen();
    await touch("touchStart", [{x: sP1.css.x, y: sP1.css.y, id: 1}]);
    await waitDownAt([{x: sP1.css.x, y: sP1.css.y}], sinceP1);
    await touchMoveDelivered([{x: sP1.css.x + 10, y: sP1.css.y, id: 1}]); // == touch slop
    const afterP1 = await stablePose(page);
    const errP1 = errPx(afterP1, anchorP1, {x: sP1.css.x + 10 - box.left, y: sP1.css.y - box.top}, box);
    await stampCheck(page, "phone-10px-pan");
    await touch("touchEnd", []);
    const nsP1 = await noSpend(page, beforeP1, "TOUCH_DRAG_10PX", {noTap: true});
    if (errP1 > TOL) throw Error("TOUCH_DRAG_10PX ANCHOR " + errP1 + "px");
    report.measurements.phoneDrag10px = {viewport: vp, emulated: true, mode: "build", site: sP1.cell, dragPx: 10, errorCssPx: errP1, ...nsP1, expected: "10px touch drag pans anchor-exact <=1px and spends NOTHING"};
    await page.screenshot({path: resolve(OUT, "phone-cam02-drag10-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (P2) BUILD mode 9px jitter tap across a cell edge: ONE build at DOWN cell ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    const sP2 = await phoneSite(9);
    const beforeP2 = await snap(page);
    const sinceP2 = await logLen();
    await touch("touchStart", [{x: sP2.css.x, y: sP2.css.y, id: 2}]);
    await waitDownAt([{x: sP2.css.x, y: sP2.css.y}], sinceP2);
    await touchMoveDelivered([{x: sP2.css.x + 9, y: sP2.css.y, id: 2}]); // 9 < 10 -> tap
    await touch("touchEnd", []);
    const bP2 = await expectBuild(page, beforeP2, sP2, "PHONE_JITTER_9PX");
    report.measurements.phoneJitter9pxCommit = {viewport: vp, emulated: true, mode: "build", downCell: sP2.cell, releasePixelCell: sP2.releaseCell, jitterPx: 9, ...bP2, expected: "9px touch jitter commits EXACTLY ONE salvager at the DOWN cell: bank delta == -cost, structures +1, inspector SITE == down cell (pre-fix >6px slop panned and spent nothing)"};
    await page.screenshot({path: resolve(OUT, "phone-cam02-jitter-commit.png"), fullPage: false, animations: "disabled"});

    // ---- (P3) BUILD mode two-finger turn (twist): orbits, NEVER spends ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    await dismissToast(page);
    const beforeP3 = await snap(page);
    const camP3 = await pose(page);
    const zone3 = await bareGestureZone();
    const centroid = zone3.css, localC = zone3.local;
    const anchorP3 = groundAtScreen(camP3, localC, box);
    let half = 55;
    let lastA = {x: centroid.x - half, y: centroid.y}, lastB = {x: centroid.x + half, y: centroid.y};
    const sinceP3 = await logLen();
    await touch("touchStart", [{x: lastA.x, y: lastA.y, id: 3}, {x: lastB.x, y: lastB.y, id: 4}]);
    await waitDownAt([lastA, lastB], sinceP3);
    let maxTwistErr = 0;
    for (let deg = 10; deg <= 40; deg += 10) {
      const r = rad(deg); half = 55 + deg * 0.4;
      lastA = {x: centroid.x - Math.cos(r) * half, y: centroid.y - Math.sin(r) * half};
      lastB = {x: centroid.x + Math.cos(r) * half, y: centroid.y + Math.sin(r) * half};
      await touchMoveDelivered([{x: lastA.x, y: lastA.y, id: 3}, {x: lastB.x, y: lastB.y, id: 4}]);
      const after = await stablePose(page);
      const e = errPx(after, anchorP3, localC, box); maxTwistErr = Math.max(maxTwistErr, e);
      if (e > TOL) throw Error("TWIST_CENTROID_DRIFT " + e + "px");
    }
    const twistPose = await stablePose(page);
    // Protocol-correct partial release: touchEnd lists the RELEASED point at its
    // actual last position; the empty-points touchEnd then releases the survivor.
    await touch("touchEnd", [{x: lastA.x, y: lastA.y, id: 3}]);
    await touch("touchEnd", []);
    const nsP3 = await noSpend(page, beforeP3, "TWO_FINGER_TURN", {noTap: true});
    if (twistPose.yaw === camP3.yaw) throw Error("TWO_FINGER_TURN did not orbit");
    report.measurements.phoneTwoFingerTurn = {viewport: vp, emulated: true, mode: "build", twistDeg: 40, gestureZoneHeightFraction: zone3.heightFraction, yawBefore: camP3.yaw, yawAfter: twistPose.yaw, maxCentroidErrorCssPx: maxTwistErr, ...nsP3, expected: "two-finger turn orbits yaw with centroid anchored <=1px and spends NOTHING for either finger"};
    await page.screenshot({path: resolve(OUT, "phone-cam02-twist-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (P4) BUILD mode pinch + finger lift + survivor: NEVER spends ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    await dismissToast(page);
    const beforeP4 = await snap(page);
    const camP4 = await pose(page);
    const zone4 = await bareGestureZone();
    const localF = zone4.local, centF = zone4.css;
    const anchorP4 = groundAtScreen(camP4, localF, box);
    let h4 = 50;
    const sinceP4 = await logLen();
    await touch("touchStart", [{x: centF.x - h4, y: centF.y, id: 5}, {x: centF.x + h4, y: centF.y, id: 6}]);
    await waitDownAt([{x: centF.x - h4, y: centF.y}, {x: centF.x + h4, y: centF.y}], sinceP4);
    let maxPinchErr = 0;
    for (let i = 0; i < 4; i++) {
      h4 = Math.min(120, h4 + 18);
      await touchMoveDelivered([{x: centF.x - h4, y: centF.y, id: 5}, {x: centF.x + h4, y: centF.y, id: 6}]);
      const after = await stablePose(page);
      const e = errPx(after, anchorP4, localF, box); maxPinchErr = Math.max(maxPinchErr, e);
      if (e > TOL) throw Error("PINCH_CENTROID_DRIFT " + e + "px");
    }
    const pinchPose = await stablePose(page);
    await touch("touchEnd", [{x: centF.x - h4, y: centF.y, id: 5}]); // left finger lifts
    const afterLift = await stablePose(page);
    const liftStep = Math.hypot(afterLift.x - pinchPose.x, afterLift.z - pinchPose.z);
    if (liftStep > 1e-6) throw Error("FINGER_LIFT_JUMP " + liftStep);
    const survivorLocal = {x: localF.x + h4, y: localF.y};
    const survivorAnchor = groundAtScreen(afterLift, survivorLocal, box);
    const nextLocal = {x: survivorLocal.x - 35, y: survivorLocal.y + 25};
    const evP4 = await touchMoveDelivered([{x: box.left + nextLocal.x, y: box.top + nextLocal.y, id: 6}]);
    if (evP4.some(e => e.t === "pointerdown")) throw Error("SURVIVOR_PATH fresh press after lift");
    const afterSurv = await stablePose(page);
    const survErr = errPx(afterSurv, survivorAnchor, nextLocal, box);
    await touch("touchEnd", []);
    const nsP4 = await noSpend(page, beforeP4, "PINCH_LIFT", {noTap: true});
    if (survErr > TOL) throw Error("SURVIVOR_REBASE_DRIFT " + survErr + "px");
    report.measurements.phonePinchLift = {viewport: vp, emulated: true, mode: "build", gestureZoneHeightFraction: zone4.heightFraction, maxPinchErrorCssPx: maxPinchErr, pinchZoom: pinchPose.zoom, fingerLiftTargetStep: liftStep, survivorRebaseErrorCssPx: survErr, ...nsP4, expected: "pinch zooms centroid-anchored <=1px; finger lift zero target jump; survivor rebases <=1px; NOTHING spent at any stage"};

    // ---- (P5) NEGATIVE touchCancel of a STATIONARY build press + late up ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    const sP5 = await phoneSite();
    const beforeP5 = await snap(page);
    const sinceP5 = await logLen();
    await touch("touchStart", [{x: sP5.css.x, y: sP5.css.y, id: 7}]);
    await waitDownAt([{x: sP5.css.x, y: sP5.css.y}], sinceP5);
    await touch("touchCancel", []);
    const cancelledId = await waitCancel(sinceP5);
    await page.evaluate(id => {document.querySelector(".world-canvas").dispatchEvent(new PointerEvent("pointerup", {pointerId: id, pointerType: "touch", clientX: 0, clientY: 0, buttons: 0, button: 0, bubbles: true}));}, cancelledId);
    const nsP5 = await noSpend(page, beforeP5, "PHONE_CANCEL_STATIONARY", {noTap: true});
    report.measurements.negativePhoneCancelStationary = {viewport: vp, emulated: true, mode: "build", site: sP5.cell, cancelledPointerId: cancelledId, lateUp: "synthetic PointerEvent with the cancelled pointerId (CDP cannot touchEnd after touchCancel)", ...nsP5, expected: "cancelled STATIONARY build press + late up spends NOTHING (a stationary press is exactly the pre-fix tap shape; cancel must purge it)"};
    await page.screenshot({path: resolve(OUT, "phone-cam02-cancel-negative.png"), fullPage: false, animations: "disabled"});

    // ---- (P6) NEGATIVE touchCancel MID-DRAG in build mode ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    const sP6 = await phoneSite();
    const beforeP6 = await snap(page);
    const sinceP6 = await logLen();
    await touch("touchStart", [{x: sP6.css.x, y: sP6.css.y, id: 8}]);
    await waitDownAt([{x: sP6.css.x, y: sP6.css.y}], sinceP6);
    await touchMoveDelivered([{x: sP6.css.x + 40, y: sP6.css.y + 50, id: 8}]);
    await touch("touchCancel", []);
    const cid6 = await waitCancel(sinceP6);
    await page.evaluate(id => {document.querySelector(".world-canvas").dispatchEvent(new PointerEvent("pointerup", {pointerId: id, pointerType: "touch", clientX: 0, clientY: 0, buttons: 0, button: 0, bubbles: true}));}, cid6);
    const nsP6 = await noSpend(page, beforeP6, "PHONE_CANCEL_MID_DRAG", {noTap: true});
    report.measurements.negativePhoneCancelMidDrag = {viewport: vp, emulated: true, mode: "build", site: sP6.cell, cancelledPointerId: cid6, ...nsP6, expected: "cancelled touch DRAG + late up spends NOTHING"};

    // ---- (P7) BUILD mode clean intentional tap: exactly once + selection ----
    await goHome(page); await setMode(page, "build"); await clearSite(page);
    const sP7 = await phoneSite();
    const beforeP7 = await snap(page);
    const sinceP7 = await logLen();
    await touch("touchStart", [{x: sP7.css.x, y: sP7.css.y, id: 9}]);
    await waitDownAt([{x: sP7.css.x, y: sP7.css.y}], sinceP7);
    await touch("touchEnd", []);
    const bP7 = await expectBuild(page, beforeP7, sP7, "PHONE_CLEAN_TAP");
    report.measurements.phoneCleanTapCommit = {viewport: vp, emulated: true, mode: "build", site: sP7.cell, pressCss: sP7.css, ...bP7, expected: "clean touch tap commits EXACTLY ONE salvager: bank delta == -cost, structures +1, inspector selects the new building at the tapped cell"};
    await page.screenshot({path: resolve(OUT, "phone-cam02-clean-commit.png"), fullPage: false, animations: "disabled"});

    const scroll = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 || Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2);
    const phoneGl = await webglCount(page);
    if (phoneGl !== 1) throw Error("PHONE_WEBGL_CONTEXT_COUNT " + phoneGl + " !== 1");
    report.views.push({name: "phone", viewport: vp, emulated: true, pageErrors: errs, failedRequests: failed, documentScroll: scroll, webglContextCount: phoneGl, homePose: home, counts: N0});
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
  // Non-blank proof: full-frame zlib PNG decode, distinct RGB colours +
  // luminance stddev (numeric only, NO vision).
  try {
    const files = (await readdir(OUT)).filter(f => f.endsWith(".png")).sort();
    const results = [];
    for (const f of files) {
      const buf = await readFile(resolve(OUT, f));
      const d = decodePng(buf);
      results.push({file: "docs/evidence/338-cam-02/" + f, width: d.width, height: d.height, distinctColors: d.distinctColors, luminanceMean: d.luminanceMean, luminanceStddev: d.luminanceStddev});
    }
    const minColors = Math.min(...results.map(r => r.distinctColors));
    const minSigma = Math.min(...results.map(r => r.luminanceStddev));
    await writeFile(resolve(OUT, "nonblank.json"), JSON.stringify({method: "zlib full-frame PNG decode, distinct RGB colours + luminance stddev (no vision)", minDistinctColors: 500, minLuminanceStddev: 5, results}, null, 2) + "\n");
    if (minColors < 500 || minSigma < 5) {report.errors.push("NONBLANK_FAIL colors=" + minColors + " sigma=" + minSigma); report.status = "FAIL"; process.exitCode = 1;}
    report.nonblank = {minDistinctColors: minColors, minLuminanceStddev: minSigma};
  } catch (e) {report.errors.push("nonblank: " + String(e.stack || e)); report.status = "FAIL"; process.exitCode = 1;}
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("CAM-02 gesture-state-machine capture:", report.status, OUT);
  if (report.errors.length) console.error(report.errors.join("\n"));
}

// Minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced, all 5 scanline filters.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw Error("not a PNG");
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; if (data[12] !== 0) throw Error("interlaced PNG unsupported");}
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw Error("unsupported PNG format " + bitDepth + "/" + colorType);
  const ch = colorType === 6 ? 4 : 3, stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw Error("bad filter " + filter);
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  const colors = new Set();
  let sum = 0, sum2 = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const r = px[i * ch], g = px[i * ch + 1], b = px[i * ch + 2];
    colors.add((r << 16) | (g << 8) | b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += lum; sum2 += lum * lum;
  }
  const mean = sum / n, sigma = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return {width, height, distinctColors: colors.size, luminanceMean: Math.round(mean * 1000) / 1000, luminanceStddev: Math.round(sigma * 1000) / 1000};
}