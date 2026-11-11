// UI-RESET-50 (G2 wave 2): headless-Chrome camera + interaction probe.
// Proves, at real phone (390x844, touch) and desktop (1280x800, mouse) viewports:
//   - the camera fits the shell's usable world region (paint-truth dataset.cam
//     stamp equals the fit recomputed from the painted chrome boxes),
//   - edge-cell selection AND edge-cell placement (mature yard, dock Build flow),
//   - zoom clamps 1.2..6 + Reset view, wheel anchor invariance, button zoom,
//   - pointer pan and CDP touch pan/pinch/touchCancel,
//   - tap vs drag vs cancel separation (no accidental select/salvage/place),
//   - camera intent retention across inspector open + viewport resize, and
//     Reset retiring the intent,
//   - sim/save preserved (fingerprint stable except the intended build).
// DOM/console/geometry probes only - no visual inspection.
//
// Usage (worktree root, after pnpm build):
//   node node_modules/vite/bin/vite.js preview --port 4180 --strictPort  (2nd shell)
//   $env:RUSTWAKE_SHA="<full head sha>"; node work/evidence/UI-RESET-50/probe-camera-50.mjs
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = resolve(root, "work/evidence/UI-RESET-50/captures");
mkdirSync(out, { recursive: true });
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4180/";
const exe = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
if (!exe) { console.error("no local Chrome/Edge executable found"); process.exit(1); }
const seedText = readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8");

const CELL = 32, WORLD_W = 192, WORLD_H = 224;
const MIN_SCALE = 1.2, MAX_SCALE = 6, ZOOM_STEP = 1.25;
const CONTEXT_TITLES = ["Yard store", "Research", "Yard record", "While you were away"];
const failures = [];
const contexts = [];
const frames = [];
let frameNo = 0;

const fail = (ctx, check, detail) => failures.push({ context: ctx, check, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Node-side mirror of camera.ts clampCamera, used only to compute expectations.
function clampCam(cam, view, fitted) {
  const halfW = view.w / (2 * cam.scale), halfH = view.h / (2 * cam.scale);
  return {
    x: halfW >= WORLD_W / 2 ? fitted.x : Math.min(WORLD_W - halfW, Math.max(halfW, cam.x)),
    y: halfH >= WORLD_H / 2 ? fitted.y : Math.min(WORLD_H - halfH, Math.max(halfH, cam.y)),
    scale: cam.scale,
  };
}
const tileWorld = (tile) => ({ x: (tile % 6) * CELL + 16, y: Math.floor(tile / 6) * CELL + 16 });

// ---- in-page probes -------------------------------------------------------
const camProbe = () => {
  const c = document.querySelector("canvas");
  if (!c || !c.dataset.cam) return null;
  const [x, y, scale] = c.dataset.cam.split(",").map(Number);
  const r = c.getBoundingClientRect();
  return { x, y, scale, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, view: { w: window.innerWidth, h: window.innerHeight } };
};
// The fit App.fitToShell owes, recomputed from the painted chrome boxes.
const fitProbe = () => {
  const lead = document.querySelector(".hud__lead") ?? document.querySelector(".hud__top");
  const dock = document.querySelector(".dock");
  if (!lead || !dock) return null;
  const W = window.innerWidth, H = window.innerHeight;
  const top = lead.getBoundingClientRect().bottom + 6;
  const bottom = Math.max(0, H - dock.getBoundingClientRect().top) + 6;
  const rail = document.querySelector(".shell-rail");
  const railBox = rail ? rail.getBoundingClientRect() : null;
  const railActive = railBox !== null && railBox.width > 0;
  const left = railActive ? railBox.right + 6 : 0;
  const right = railActive ? 334 : 60; // SHELL_RIGHT_GUTTER_PX / SHELL_ZOOM_GUTTER_PX
  const regionW = Math.max(1, W - left - right);
  const raw = Math.min(4, regionW / 200);
  const usableH = H - top - bottom;
  let scale, y;
  if (usableH <= 0) { scale = Math.max(1.4, raw); y = 112; }
  else {
    const band = usableH / 236;
    scale = band >= raw ? Math.max(1.4, raw) : Math.max(1.1, Math.min(raw, band));
    y = 112 + (H / 2 - (top + usableH / 2)) / scale;
  }
  let x = 96;
  if (left > 0 || right > 0) x += (W / 2 - (left + regionW / 2)) / scale;
  return { x, y, scale, insets: { top, bottom, left, right }, usableH };
};
const stateProbe = () => {
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  const zoom = [...document.querySelectorAll(".shell-zoom button")].map((n) => {
    const r = n.getBoundingClientRect();
    return { label: n.getAttribute("aria-label"), x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const box = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  return {
    panelTitles: [...document.querySelectorAll(".panel__title")].map((n) => (n.textContent ?? "").trim()),
    objective: (document.querySelector(".objective")?.textContent ?? "").trim(),
    buildMode: !!document.querySelector(".hud--build"),
    dockFaces: [...document.querySelectorAll(".dock .dock__btn")].map((n) => (n.textContent ?? "").trim().slice(0, 40)),
    zoom,
    boxes: { lead: box(".hud__lead") ?? box(".hud__top"), dock: box(".dock"), rail: box(".shell-rail"), panel: box(".panel") },
    toast: (document.querySelector(".toast")?.textContent ?? "").trim() || null,
    sim: sim ? {
      tick: sim.tick, revision: sim.revision, tutorial: sim.tutorial,
      machineTiles: sim.machines.map((m) => m.tile),
      fingerprint: JSON.stringify([
        sim.machines.map((m) => [m.id, m.blueprint, m.tile]),
        sim.routes.map((r) => [r.id, r.from, r.to, r.filter]),
        sim.tutorial,
      ]),
    } : null,
  };
};
const inkProbe = () => {
  const canvas = document.querySelector("canvas");
  if (!canvas || canvas.width === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const W = canvas.width, H = canvas.height;
  const img = ctx.getImageData(0, 0, W, H).data;
  const bg = [img[0], img[1], img[2]];
  const stepX = Math.max(1, Math.floor(W / 64)), stepY = Math.max(1, Math.floor(H / 64));
  let diff = 0, samples = 0;
  for (let y = 0; y < H; y += stepY) for (let x = 0; x < W; x += stepX) {
    const i = (y * W + x) * 4;
    samples += 1;
    if (Math.abs(img[i] - bg[0]) + Math.abs(img[i + 1] - bg[1]) + Math.abs(img[i + 2] - bg[2]) > 24) diff += 1;
  }
  return { samples, diff, ratio: Number((diff / samples).toFixed(4)) };
};

// ---- helpers ---------------------------------------------------------------
const wait = (p, ms) => p.waitForTimeout(ms);
const cam = (p) => p.evaluate(camProbe);
const fitted = (p) => p.evaluate(fitProbe);
const st = (p) => p.evaluate(stateProbe);
const screenOf = (c, wx, wy) => ({ x: c.rect.x + c.rect.w / 2 + (wx - c.x) * c.scale, y: c.rect.y + c.rect.h / 2 + (wy - c.y) * c.scale });
const worldOf = (c, sx, sy) => ({ x: c.x + (sx - c.rect.x - c.rect.w / 2) / c.scale, y: c.y + (sy - c.rect.y - c.rect.h / 2) / c.scale });

async function shot(p, ctxName, name, note) {
  const s = await st(p);
  const c = await cam(p);
  await p.screenshot({ path: resolve(out, name + ".png") });
  frameNo += 1;
  frames.push({ file: name + ".png", context: ctxName, note, cam: c, state: s });
  console.log(`${name}.png cam=${c ? `${c.x},${c.y},${c.scale}` : "null"} panels=${JSON.stringify(s.panelTitles)} ${note}`);
}
const clickButton = (p, text) => p.evaluate((t) => {
  const n = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith(t) && !b.disabled);
  if (!n) return false;
  n.click();
  return true;
}, text);
const zoomClick = (p, label, times) => p.evaluate(([l, n]) => {
  const b = document.querySelector(`.shell-zoom button[aria-label="${l}"]`);
  if (!b) return false;
  for (let i = 0; i < n; i += 1) b.click();
  return true;
}, [label, times]);

async function settle(p) {
  await p.click("text=Begin recovery");
  for (let i = 0; i < 40; i += 1) {
    await wait(p, 250);
    const state = await p.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Back to yard"));
      if (back) { back.click(); return "back"; }
      const begin = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Begin recovery"));
      return begin ? "gate" : "yard";
    });
    if (state === "back") { await wait(p, 500); return; }
    if (state === "yard" && i >= 8) { await wait(p, 300); return; }
  }
}
// Drag the world so `target` lands near the view centre (clamps respected);
// two passes converge. Works for mouse and CDP touch alike.
async function panTo(p, ctxName, target, touch) {
  for (let pass = 0; pass < 2; pass += 1) {
    const c = await cam(p);
    const centre = { x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2 };
    const dx = (c.x - target.x) * c.scale, dy = (c.y - target.y) * c.scale;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
    const steps = 8;
    if (touch) {
      await touch("touchStart", [{ id: 1, x: centre.x, y: centre.y }]);
      for (let i = 1; i <= steps; i += 1) await touch("touchMove", [{ id: 1, x: centre.x + (dx * i) / steps, y: centre.y + (dy * i) / steps }]);
      await touch("touchEnd", []);
    } else {
      await p.mouse.move(centre.x, centre.y);
      await p.mouse.down();
      for (let i = 1; i <= steps; i += 1) await p.mouse.move(centre.x + (dx * i) / steps, centre.y + (dy * i) / steps);
      await p.mouse.up();
    }
    await wait(p, 120);
  }
}
const tapAt = async (p, x, y) => { await p.mouse.click(x, y); await wait(p, 300); };
const touchTap = async (touch, x, y) => {
  await touch("touchStart", [{ id: 1, x, y }]);
  await touch("touchEnd", []);
};
// Wait for the persisted save to show `count` machines (flush is ~1 s of sim).
async function waitMachines(p, count) {
  for (let i = 0; i < 24; i += 1) {
    const s = await st(p);
    if (s.sim && s.sim.machineTiles.length === count) return s;
    await wait(p, 250);
  }
  return st(p);
}

// Fixture provisioning: every blueprint costs >= 20 scrap, so the placement
// witness needs a funded store. Same envelope mutation + fnv checksum
// recompute as capture-shell-49; the sim still validates the price (no
// gameplay or save-schema change). lastSeenMs moves to install time so the
// load credits no offline window: the seed is a snapshot, and catching up the
// wall-clock gap since it was written would run the capped offline economy
// (the sorter consumes scrap to its blocked equilibrium) before the witness
// can spend it, and would make the fixture depend on the run date.
const SEED_MUT = { "payload.sim.store.scrap": 200 };
const install = (ctx, text, mut) => ctx.addInitScript(([raw, m]) => {
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
  const env = JSON.parse(raw);
  if (m) {
    for (const [path, value] of Object.entries(JSON.parse(m))) {
      let node = env;
      const parts = path.split(".");
      for (const q of parts.slice(0, -1)) node = node[q];
      node[parts[parts.length - 1]] = value;
    }
    env.payload.lastSeenMs = Date.now();
    env.checksum = fnv(JSON.stringify(env.payload));
  }
  localStorage.setItem("rustwake.save.v1", JSON.stringify(env));
}, [text, mut ? JSON.stringify(mut) : null]);

async function makeContext(browser, name, vp) {
  const c = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
  await install(c, seedText, SEED_MUT);
  const p = await c.newPage();
  const consoleErrors = [], pageErrors = [], badResponses = [], requestFailures = [];
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  p.on("pageerror", (e) => pageErrors.push(String(e)));
  p.on("response", (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
  p.on("requestfailed", (r) => requestFailures.push({ url: r.url(), error: r.failure()?.errorText }));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery", { timeout: 15000 });
  const cdp = await c.newCDPSession(p);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((q) => ({ x: q.x, y: q.y, id: q.id })) });
  return { name, c, p, touch, vp, consoleErrors, pageErrors, badResponses, requestFailures };
}
function finishContext(ctx, extra) {
  const clean = ctx.consoleErrors.length === 0 && ctx.pageErrors.length === 0 && ctx.badResponses.length === 0 && ctx.requestFailures.length === 0;
  if (!clean) fail(ctx.name, "zeroErrors", { consoleErrors: ctx.consoleErrors, pageErrors: ctx.pageErrors, badResponses: ctx.badResponses, requestFailures: ctx.requestFailures });
  contexts.push({ context: ctx.name, viewport: [ctx.vp.w, ctx.vp.h], consoleErrors: ctx.consoleErrors, pageErrors: ctx.pageErrors, badResponses: ctx.badResponses, requestFailures: ctx.requestFailures, ...extra });
}
// Zoom faces: visible, 44 px floor, inside the viewport, clear of lead/dock.
function zoomFaceChecks(ctx, s) {
  const labels = s.zoom.map((z) => z.label);
  const ok = ["Zoom in", "Zoom out", "Reset view"].every((l) => labels.includes(l));
  if (!ok) fail(ctx, "zoomFacesPresent", labels);
  for (const z of s.zoom) {
    if (z.w < 44 || z.h < 44) fail(ctx, "zoomFace44", z);
    if (z.x < 0 || z.y < 0 || z.x + z.w > ctx.vp.w + 0.5 || z.y + z.h > ctx.vp.h + 0.5) fail(ctx, "zoomFaceInside", z);
    for (const key of ["lead", "dock"]) {
      const b = s.boxes[key];
      if (!b) continue;
      const ix = Math.min(z.x + z.w, b.right) - Math.max(z.x, b.x);
      const iy = Math.min(z.y + z.h, b.bottom) - Math.max(z.y, b.y);
      if (ix > 1 && iy > 1) fail(ctx, `zoomFaceOverlaps_${key}`, z);
    }
  }
  return ok;
}
const camNearFit = (ctx, c, f, tag) => {
  if (!c || !f) { fail(ctx, tag, { cam: c, fit: f }); return false; }
  const ok = near(c.x, f.x, 0.02) && near(c.y, f.y, 0.02) && near(c.scale, f.scale, 0.002);
  if (!ok) fail(ctx, tag, { cam: c, fit: f });
  return ok;
};

// ---- desktop ---------------------------------------------------------------
async function desktop(browser) {
  const ctx = await makeContext(browser, "desk1280", { w: 1280, h: 800, dpr: 1, mobile: false });
  const { p } = ctx;
  const extra = {};
  await settle(p);
  await wait(p, 600);

  // A1 rest fit + zoom faces + ink.
  const c0 = await cam(p), f0 = await fitted(p), s0 = await st(p);
  extra.restFit = camNearFit(ctx.name, c0, f0, "restFit");
  extra.fit = f0; extra.restCam = c0;
  zoomFaceChecks(ctx, s0);
  const ink = await p.evaluate(inkProbe);
  extra.ink = ink;
  if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", ink);
  await shot(p, ctx.name, "01-desk-rest", "mature rest: camera fits the rail/inspector band");

  // A2 edge-cell selection: tile 0 is the yard's top-left corner cell.
  const w0 = tileWorld(0);
  const pt0 = screenOf(c0, w0.x, w0.y);
  await tapAt(p, pt0.x, pt0.y);
  const sSel = await st(p), cSel = await cam(p), fSel = await fitted(p);
  extra.edgeSelect = { tile: 0, at: pt0, title: sSel.panelTitles[0] ?? null };
  if (sSel.panelTitles[0] !== "Scrap sorter") fail(ctx.name, "edgeSelect", extra.edgeSelect);
  // No user intent yet: opening the inspector may move the chrome band (the
  // objective text changes), and the camera must take the fresh shell fit.
  camNearFit(ctx.name, cSel, fSel, "selectFreshFit");
  await shot(p, ctx.name, "02-desk-edge-select", "corner cell 0 selected: Scrap sorter inspector");
  await p.keyboard.press("Escape"); await wait(p, 300);

  // A3 zoom clamps + reset.
  await zoomClick(p, "Zoom in", 14); await wait(p, 250);
  const cMax = await cam(p);
  extra.zoomMax = cMax.scale;
  if (!near(cMax.scale, MAX_SCALE, 0.001)) fail(ctx.name, "zoomMaxClamp", cMax);
  await zoomClick(p, "Zoom out", 24); await wait(p, 250);
  const cMin = await cam(p);
  extra.zoomMin = cMin.scale;
  if (!near(cMin.scale, MIN_SCALE, 0.001)) fail(ctx.name, "zoomMinClamp", cMin);
  await shot(p, ctx.name, "03-desk-zoom-min", "zoomed out to the 1.2 floor");
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  const cReset = await cam(p);
  // Reset owes the LIVE shell fit: the objective text (and thus the lead band)
  // can change after a build, so the rest-time fit is not the right baseline.
  extra.resetFit = camNearFit(ctx.name, cReset, await fitted(p), "resetFit");

  // A4 wheel anchor: at max zoom the y axis is free, x stays pinned to the fit.
  await zoomClick(p, "Zoom in", 14); await wait(p, 200);
  const cW0 = await cam(p);
  const anchor = { x: cW0.rect.x + cW0.rect.w * 0.55, y: cW0.rect.y + cW0.rect.h * 0.5 };
  const wBefore = worldOf(cW0, anchor.x, anchor.y);
  await p.mouse.move(anchor.x, anchor.y);
  await p.mouse.wheel(0, 120); await wait(p, 250);
  const cW1 = await cam(p);
  const wAfter = worldOf(cW1, anchor.x, anchor.y);
  const expectScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cW0.scale * Math.exp(-120 * 0.0015)));
  extra.wheel = { before: cW0, after: cW1, wBefore, wAfter, expectScale };
  if (!near(cW1.scale, expectScale, 0.002)) fail(ctx.name, "wheelFactor", extra.wheel);
  if (!near(wAfter.y, wBefore.y, 0.05)) fail(ctx.name, "wheelAnchorY", extra.wheel);
  if (!near(cW1.x, f0.x, 0.02)) fail(ctx.name, "wheelPinnedX", extra.wheel);
  await p.mouse.wheel(0, -120); await wait(p, 250);
  const cW2 = await cam(p);
  if (!near(cW2.scale, MAX_SCALE, 0.001)) fail(ctx.name, "wheelUpClamp", cW2);

  // A5 pointer pan at max zoom (y free, x pinned): drag up 60 px in 10 px
  // steps. Each step clears the 8 px tap threshold, so the first move already
  // pans (a sub-threshold first step would be absorbed by the pending phase).
  // Dragging the world up moves the camera centre down-world: y increases.
  const cP0 = await cam(p);
  const centre = { x: cP0.rect.x + cP0.rect.w / 2, y: cP0.rect.y + cP0.rect.h / 2 };
  await p.mouse.move(centre.x, centre.y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i += 1) await p.mouse.move(centre.x, centre.y - (60 * i) / 6);
  await p.mouse.up(); await wait(p, 250);
  const cP1 = await cam(p);
  const expectPan = clampCam({ x: cP0.x, y: cP0.y + 60 / cP0.scale, scale: cP0.scale }, cP0.view, f0);
  extra.pan = { before: cP0, after: cP1, expect: expectPan };
  if (!near(cP1.y, expectPan.y, 0.03) || !near(cP1.x, expectPan.x, 0.03)) fail(ctx.name, "pointerPan", extra.pan);
  const sPan = await st(p);
  if (sPan.panelTitles.length > 0) fail(ctx.name, "panNoSelect", sPan.panelTitles);

  // A6 drag over a machine never selects; a tap after does. Bring tile 8 on screen.
  await panTo(p, ctx.name, tileWorld(8), null);
  const cD = await cam(p);
  const m8 = screenOf(cD, tileWorld(8).x, tileWorld(8).y);
  const sBeforeDrag = await st(p);
  await p.mouse.move(m8.x, m8.y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i += 1) await p.mouse.move(m8.x + (50 * i) / 6, m8.y - (50 * i) / 6);
  for (let i = 1; i <= 6; i += 1) await p.mouse.move(m8.x + 50 - (50 * i) / 6, m8.y - 50 + (50 * i) / 6);
  await p.mouse.up(); await wait(p, 300);
  const sAfterDrag = await st(p);
  extra.dragReturnNoTap = { before: sBeforeDrag.panelTitles, after: sAfterDrag.panelTitles };
  if (JSON.stringify(sBeforeDrag.panelTitles) !== JSON.stringify(sAfterDrag.panelTitles)) fail(ctx.name, "dragReturnNoTap", extra.dragReturnNoTap);
  const cD2 = await cam(p);
  const m8b = screenOf(cD2, tileWorld(8).x, tileWorld(8).y);
  await tapAt(p, m8b.x, m8b.y);
  const sTap = await st(p);
  extra.tapAfterDrag = sTap.panelTitles[0] ?? null;
  if (!sTap.panelTitles[0] || CONTEXT_TITLES.includes(sTap.panelTitles[0])) fail(ctx.name, "tapAfterDrag", sTap.panelTitles);
  await p.keyboard.press("Escape"); await wait(p, 300);

  // A7 edge-cell placement: dock Build -> tap corner cell 35 -> dock place.
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  const cB = await cam(p);
  const before = await st(p);
  const built = await clickButton(p, "Build");
  await wait(p, 300);
  const sBuild = await st(p);
  extra.buildEntered = built && sBuild.buildMode;
  if (!extra.buildEntered) fail(ctx.name, "buildEntered", { built, dock: sBuild.dockFaces });
  const w35 = tileWorld(35);
  const pt35 = screenOf(cB, w35.x, w35.y);
  await tapAt(p, pt35.x, pt35.y);
  const sGhost = await st(p);
  extra.ghost = { at: pt35, objective: sGhost.objective };
  if (!sGhost.objective.includes("cell 35")) fail(ctx.name, "ghostOnEdgeCell", extra.ghost);
  await shot(p, ctx.name, "04-desk-ghost-35", "build ghost on corner cell 35 before placing");
  const placed = await p.evaluate(() => {
    const n = document.querySelector(".dock .dock__btn--primary");
    if (!n) return false;
    n.click();
    return true;
  });
  const after = await waitMachines(p, before.sim.machineTiles.length + 1);
  extra.placement = { placed, tilesBefore: before.sim.machineTiles, tilesAfter: after.sim.machineTiles, revision: [before.sim.revision, after.sim.revision] };
  if (!placed || !after.sim.machineTiles.includes(35)) fail(ctx.name, "edgePlacement", extra.placement);
  if (after.sim.revision <= before.sim.revision) fail(ctx.name, "placementRevision", extra.placement);
  await shot(p, ctx.name, "05-desk-placed-35", "machine built on corner cell 35");

  // A8 intent retention: zoom, pan the built corner machine on screen, open its
  // inspector, resize rail->column and back. Tile 0 would sit under the rail at
  // this zoom (x is pinned at 1280 wide), so tile 35 is the selection witness.
  await zoomClick(p, "Zoom in", 3); await wait(p, 200);
  await panTo(p, ctx.name, tileWorld(35), null);
  const cI0 = await cam(p);
  const ptSel = screenOf(cI0, tileWorld(35).x, tileWorld(35).y);
  await tapAt(p, ptSel.x, ptSel.y);
  const sI = await st(p), cI1 = await cam(p), fI = await fitted(p);
  // Intent keeps the zoom; the position takes the clamped refit against the
  // band the open inspector paints (exactly refitCamera keepIntent semantics).
  const expectI = clampCam({ x: cI0.x, y: cI0.y, scale: cI0.scale }, cI0.view, fI);
  extra.inspectorKeepsCamera = near(cI1.x, expectI.x, 0.03) && near(cI1.y, expectI.y, 0.03) && near(cI1.scale, cI0.scale, 0.001);
  if (!extra.inspectorKeepsCamera) fail(ctx.name, "inspectorKeepsCamera", { before: cI0, after: cI1, expect: expectI });
  if (sI.panelTitles[0] !== "Scrap sorter") fail(ctx.name, "inspectorTitle", sI.panelTitles);
  await p.setViewportSize({ width: 1024, height: 768 }); await wait(p, 700);
  const sR = await st(p), cR = await cam(p);
  extra.resizeIntent = { scaleBefore: cI0.scale, scaleAfter: cR.scale, title: sR.panelTitles[0] ?? null };
  if (!near(cR.scale, cI0.scale, 0.001)) fail(ctx.name, "resizeKeepsZoom", extra.resizeIntent);
  if (sR.panelTitles[0] !== "Scrap sorter") fail(ctx.name, "resizeKeepsSelection", extra.resizeIntent);
  await shot(p, ctx.name, "06-desk-resize-intent", "1024x768 column: zoom intent + selection survive");
  await p.setViewportSize({ width: 1280, height: 800 }); await wait(p, 700);
  const sR2 = await st(p);
  if (sR2.panelTitles[0] !== "Scrap sorter") fail(ctx.name, "resizeBackSelection", sR2.panelTitles);
  await p.keyboard.press("Escape"); await wait(p, 300);

  // A9 Reset retires intent: the next resize takes the fresh fit, not the zoom.
  await zoomClick(p, "Zoom in", 3); await wait(p, 200);
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  await p.setViewportSize({ width: 1024, height: 768 }); await wait(p, 700);
  const fSmall = await fitted(p), cSmall = await cam(p);
  extra.resetRetiresIntent = camNearFit(ctx.name, cSmall, fSmall, "resetRetiresIntent");
  await p.setViewportSize({ width: 1280, height: 800 }); await wait(p, 700);

  // A10 sim/save preserved: only the intended build changed the fingerprint.
  const end = await st(p);
  const tick2 = end.sim.tick;
  await wait(p, 1400);
  const end2 = await st(p);
  extra.sim = { tick1: tick2, tick2: end2.sim.tick, tutorial: end2.sim.tutorial, machines: end2.sim.machineTiles.length };
  if (!(end2.sim.tick > tick2)) fail(ctx.name, "simTicking", extra.sim);
  if (end2.sim.tutorial !== 9) fail(ctx.name, "tutorialPreserved", end2.sim.tutorial);
  const routesBefore = JSON.parse(before.sim.fingerprint)[1];
  const routesAfter = JSON.parse(end2.sim.fingerprint)[1];
  extra.routesStable = JSON.stringify(routesBefore) === JSON.stringify(routesAfter);
  if (!extra.routesStable) fail(ctx.name, "routesStable", { routesBefore, routesAfter });
  finishContext(ctx, extra);
  await ctx.c.close();
}

// ---- phone -----------------------------------------------------------------
async function phone(browser) {
  const ctx = await makeContext(browser, "phone390", { w: 390, h: 844, dpr: 3, mobile: true });
  const { p, touch } = ctx;
  const extra = {};
  await settle(p);
  await wait(p, 600);

  // B1 rest fit + zoom faces in the right gutter + ink.
  const c0 = await cam(p), f0 = await fitted(p), s0 = await st(p);
  extra.restFit = camNearFit(ctx.name, c0, f0, "restFit");
  extra.fit = f0; extra.restCam = c0;
  zoomFaceChecks(ctx, s0);
  const ink = await p.evaluate(inkProbe);
  extra.ink = ink;
  if (!ink || ink.ratio <= 0.02) fail(ctx.name, "worldPaints", ink);
  await shot(p, ctx.name, "07-phone-rest", "mature rest at 390x844: fit reserves the zoom gutter");

  // B2 edge-cell selection by touch tap: tile 5, top-right corner of the yard.
  const w5 = tileWorld(5);
  const pt5 = screenOf(c0, w5.x, w5.y);
  await touchTap(touch, pt5.x, pt5.y); await wait(p, 350);
  const sSel = await st(p), cSel = await cam(p), fSel = await fitted(p);
  extra.edgeSelect = { tile: 5, at: pt5, title: sSel.panelTitles[0] ?? null };
  if (!sSel.panelTitles[0] || CONTEXT_TITLES.includes(sSel.panelTitles[0])) fail(ctx.name, "edgeSelect", extra.edgeSelect);
  // No intent yet: the open inspector grows the lead, so the camera owes the
  // fresh shell fit (the stamp must track the painted band, not stay stale).
  camNearFit(ctx.name, cSel, fSel, "selectFreshFit");
  await shot(p, ctx.name, "08-phone-edge-select", "corner cell 5 selected by touch tap");
  await p.keyboard.press("Escape"); await wait(p, 300);

  // B3 touch pan: zoom in 4 steps (both axes free), drag (+60, -40).
  await zoomClick(p, "Zoom in", 4); await wait(p, 250);
  const cP0 = await cam(p);
  const centre = { x: cP0.rect.x + cP0.rect.w / 2, y: cP0.rect.y + cP0.rect.h / 2 };
  await touch("touchStart", [{ id: 1, x: centre.x, y: centre.y }]);
  for (let i = 1; i <= 8; i += 1) await touch("touchMove", [{ id: 1, x: centre.x + (60 * i) / 8, y: centre.y - (40 * i) / 8 }]);
  await touch("touchEnd", []); await wait(p, 300);
  const cP1 = await cam(p);
  const expectPan = clampCam({ x: cP0.x - 60 / cP0.scale, y: cP0.y + 40 / cP0.scale, scale: cP0.scale }, cP0.view, f0);
  extra.touchPan = { before: cP0, after: cP1, expect: expectPan };
  if (!near(cP1.x, expectPan.x, 0.05) || !near(cP1.y, expectPan.y, 0.05)) fail(ctx.name, "touchPan", extra.touchPan);
  const sPan = await st(p);
  if (sPan.panelTitles.length > 0) fail(ctx.name, "touchPanNoSelect", sPan.panelTitles);

  // B4 pinch: spread about the view centre clamps at 6; close halves to 3 and
  //    re-pins the zoomed-out y axis to the fit. Centre anchor keeps x,y put
  //    while both axes are free.
  const cZ0 = await cam(p);
  const mid = { x: cZ0.rect.x + cZ0.rect.w / 2, y: cZ0.rect.y + cZ0.rect.h / 2 };
  await touch("touchStart", [{ id: 1, x: mid.x - 45, y: mid.y }, { id: 2, x: mid.x + 45, y: mid.y }]);
  for (let i = 1; i <= 6; i += 1) {
    const half = 45 + (30 * i) / 6;
    await touch("touchMove", [{ id: 1, x: mid.x - half, y: mid.y }, { id: 2, x: mid.x + half, y: mid.y }]);
  }
  await touch("touchEnd", [{ id: 2, x: mid.x + 75, y: mid.y }]);
  await touch("touchEnd", []); await wait(p, 300);
  const cZ1 = await cam(p);
  extra.pinchSpread = { before: cZ0, after: cZ1 };
  if (!near(cZ1.scale, MAX_SCALE, 0.001)) fail(ctx.name, "pinchSpreadClamp", extra.pinchSpread);
  if (!near(cZ1.x, cZ0.x, 0.03) || !near(cZ1.y, cZ0.y, 0.03)) fail(ctx.name, "pinchCentreAnchor", extra.pinchSpread);
  const sPinch = await st(p);
  if (sPinch.panelTitles.length > 0) fail(ctx.name, "pinchNoSelect", sPinch.panelTitles);
  await touch("touchStart", [{ id: 1, x: mid.x - 75, y: mid.y }, { id: 2, x: mid.x + 75, y: mid.y }]);
  for (let i = 1; i <= 6; i += 1) {
    const half = 75 - (37.5 * i) / 6;
    await touch("touchMove", [{ id: 1, x: mid.x - half, y: mid.y }, { id: 2, x: mid.x + half, y: mid.y }]);
  }
  await touch("touchEnd", [{ id: 2, x: mid.x + 37.5, y: mid.y }]);
  await touch("touchEnd", []); await wait(p, 300);
  const cZ2 = await cam(p);
  const expectClose = clampCam({ x: cZ1.x, y: cZ1.y, scale: cZ1.scale * 0.5 }, cZ1.view, f0);
  extra.pinchClose = { before: cZ1, after: cZ2, expect: expectClose };
  if (!near(cZ2.scale, expectClose.scale, 0.002)) fail(ctx.name, "pinchCloseFactor", extra.pinchClose);
  if (!near(cZ2.x, expectClose.x, 0.03) || !near(cZ2.y, expectClose.y, 0.03)) fail(ctx.name, "pinchCloseClamp", extra.pinchClose);
  await shot(p, ctx.name, "09-phone-pinch", "after pinch spread to 6 and close to 3");

  // B5 touchCancel spoils the gesture: sub-threshold move + cancel over a
  //    machine, then the late lift, must not select. A fresh tap then does.
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  await panTo(p, ctx.name, tileWorld(8), touch);
  const cC = await cam(p);
  const m8 = screenOf(cC, tileWorld(8).x, tileWorld(8).y);
  const sC0 = await st(p);
  await touch("touchStart", [{ id: 1, x: m8.x, y: m8.y }]);
  await touch("touchMove", [{ id: 1, x: m8.x + 3, y: m8.y + 2 }]);
  // touchCancel with no remaining points ends the sequence; the browser fires
  // pointercancel for every active pointer, so no touchEnd may follow.
  await touch("touchCancel", []); await wait(p, 300);
  const sC1 = await st(p);
  extra.cancelNoTap = { before: sC0.panelTitles, after: sC1.panelTitles };
  if (JSON.stringify(sC0.panelTitles) !== JSON.stringify(sC1.panelTitles)) fail(ctx.name, "cancelNoTap", extra.cancelNoTap);
  const cC2 = await cam(p);
  const m8b = screenOf(cC2, tileWorld(8).x, tileWorld(8).y);
  await touchTap(touch, m8b.x, m8b.y); await wait(p, 350);
  const sC2 = await st(p);
  extra.freshTapAfterCancel = sC2.panelTitles[0] ?? null;
  if (!sC2.panelTitles[0] || CONTEXT_TITLES.includes(sC2.panelTitles[0])) fail(ctx.name, "freshTapAfterCancel", sC2.panelTitles);
  await p.keyboard.press("Escape"); await wait(p, 300);

  // B6 touch drag out-and-back over a machine never taps.
  const cD = await cam(p);
  const m8c = screenOf(cD, tileWorld(8).x, tileWorld(8).y);
  const sD0 = await st(p);
  await touch("touchStart", [{ id: 1, x: m8c.x, y: m8c.y }]);
  for (let i = 1; i <= 5; i += 1) await touch("touchMove", [{ id: 1, x: m8c.x + (40 * i) / 5, y: m8c.y - (30 * i) / 5 }]);
  for (let i = 1; i <= 5; i += 1) await touch("touchMove", [{ id: 1, x: m8c.x + 40 - (40 * i) / 5, y: m8c.y - 30 + (30 * i) / 5 }]);
  await touch("touchEnd", []); await wait(p, 300);
  const sD1 = await st(p);
  extra.touchDragReturnNoTap = { before: sD0.panelTitles, after: sD1.panelTitles };
  if (JSON.stringify(sD0.panelTitles) !== JSON.stringify(sD1.panelTitles)) fail(ctx.name, "touchDragReturnNoTap", extra.touchDragReturnNoTap);

  // B7 edge-cell placement by touch: Build -> tap cell 35 -> place.
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  const cB = await cam(p);
  const before = await st(p);
  const built = await clickButton(p, "Build");
  await wait(p, 300);
  const sBuild = await st(p);
  extra.buildEntered = built && sBuild.buildMode;
  if (!extra.buildEntered) fail(ctx.name, "buildEntered", { built, dock: sBuild.dockFaces });
  const pt35 = screenOf(cB, tileWorld(35).x, tileWorld(35).y);
  await touchTap(touch, pt35.x, pt35.y); await wait(p, 350);
  const sGhost = await st(p);
  extra.ghost = { at: pt35, objective: sGhost.objective };
  if (!sGhost.objective.includes("cell 35")) fail(ctx.name, "ghostOnEdgeCell", extra.ghost);
  await shot(p, ctx.name, "10-phone-ghost-35", "touch ghost on corner cell 35");
  const placed = await p.evaluate(() => {
    const n = document.querySelector(".dock .dock__btn--primary");
    if (!n) return false;
    n.click();
    return true;
  });
  const after = await waitMachines(p, before.sim.machineTiles.length + 1);
  extra.placement = { placed, tilesBefore: before.sim.machineTiles, tilesAfter: after.sim.machineTiles, revision: [before.sim.revision, after.sim.revision] };
  if (!placed || !after.sim.machineTiles.includes(35)) fail(ctx.name, "edgePlacement", extra.placement);
  await shot(p, ctx.name, "11-phone-placed-35", "machine built on corner cell 35 by touch flow");

  // B8 zoom clamps + reset on phone.
  await zoomClick(p, "Zoom in", 14); await wait(p, 250);
  const cMax = await cam(p);
  extra.zoomMax = cMax.scale;
  if (!near(cMax.scale, MAX_SCALE, 0.001)) fail(ctx.name, "zoomMaxClamp", cMax);
  await zoomClick(p, "Zoom out", 24); await wait(p, 250);
  const cMin = await cam(p);
  extra.zoomMin = cMin.scale;
  if (!near(cMin.scale, MIN_SCALE, 0.001)) fail(ctx.name, "zoomMinClamp", cMin);
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  // Live fit, not the rest-time f0: the post-build objective text can grow the
  // lead band, and Reset must track the band the shell paints right now.
  extra.resetFit = camNearFit(ctx.name, await cam(p), await fitted(p), "resetFit");

  // B9 intent across inspector + resize 390x844 -> 412x915 and back. Tile 8 is
  // the witness: tile 0 would sit under the lead at this zoom (y clamps).
  await zoomClick(p, "Zoom in", 2); await wait(p, 200);
  await panTo(p, ctx.name, tileWorld(8), touch);
  const cI0 = await cam(p);
  const pt0 = screenOf(cI0, tileWorld(8).x, tileWorld(8).y);
  await touchTap(touch, pt0.x, pt0.y); await wait(p, 350);
  const sI = await st(p), cI1 = await cam(p), fI = await fitted(p);
  const expectI = clampCam({ x: cI0.x, y: cI0.y, scale: cI0.scale }, cI0.view, fI);
  extra.inspectorKeepsCamera = near(cI1.x, expectI.x, 0.03) && near(cI1.y, expectI.y, 0.03) && near(cI1.scale, cI0.scale, 0.001);
  if (!extra.inspectorKeepsCamera) fail(ctx.name, "inspectorKeepsCamera", { before: cI0, after: cI1, expect: expectI });
  extra.inspectorTitle = sI.panelTitles[0] ?? null;
  if (!sI.panelTitles[0] || CONTEXT_TITLES.includes(sI.panelTitles[0])) fail(ctx.name, "inspectorTitle", sI.panelTitles);
  await p.setViewportSize({ width: 412, height: 915 }); await wait(p, 700);
  const sR = await st(p), cR = await cam(p);
  extra.resizeIntent = { scaleBefore: cI0.scale, scaleAfter: cR.scale, title: sR.panelTitles[0] ?? null };
  if (!near(cR.scale, cI0.scale, 0.001)) fail(ctx.name, "resizeKeepsZoom", extra.resizeIntent);
  if (sR.panelTitles[0] !== extra.inspectorTitle) fail(ctx.name, "resizeKeepsSelection", extra.resizeIntent);
  await shot(p, ctx.name, "12-phone-resize-intent", "412x915: zoom intent + selection survive");
  await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 700);
  const sR2 = await st(p);
  if (sR2.panelTitles[0] !== extra.inspectorTitle) fail(ctx.name, "resizeBackSelection", sR2.panelTitles);
  await p.keyboard.press("Escape"); await wait(p, 300);
  await zoomClick(p, "Zoom in", 2); await wait(p, 200);
  await zoomClick(p, "Reset view", 1); await wait(p, 250);
  await p.setViewportSize({ width: 412, height: 915 }); await wait(p, 700);
  const fBig = await fitted(p), cBig = await cam(p);
  extra.resetRetiresIntent = camNearFit(ctx.name, cBig, fBig, "resetRetiresIntent");
  await p.setViewportSize({ width: 390, height: 844 }); await wait(p, 700);

  // B10 sim/save preserved.
  const end = await st(p);
  await wait(p, 1400);
  const end2 = await st(p);
  extra.sim = { tick1: end.sim.tick, tick2: end2.sim.tick, tutorial: end2.sim.tutorial, machines: end2.sim.machineTiles.length };
  if (!(end2.sim.tick > end.sim.tick)) fail(ctx.name, "simTicking", extra.sim);
  if (end2.sim.tutorial !== 9) fail(ctx.name, "tutorialPreserved", end2.sim.tutorial);
  const routesBefore = JSON.parse(before.sim.fingerprint)[1];
  const routesAfter = JSON.parse(end2.sim.fingerprint)[1];
  extra.routesStable = JSON.stringify(routesBefore) === JSON.stringify(routesAfter);
  if (!extra.routesStable) fail(ctx.name, "routesStable", { routesBefore, routesAfter });
  finishContext(ctx, extra);
  await ctx.c.close();
}

const browser = await chromium.launch({ executablePath: exe });
try {
  // A crash in one context is a recorded failure, not a lost receipt.
  try { await desktop(browser); } catch (e) { fail("desk1280", "crash", String(e?.stack ?? e)); }
  try { await phone(browser); } catch (e) { fail("phone390", "crash", String(e?.stack ?? e)); }
  const receipt = {
    task: "UI-RESET-50 camera framing + touch/mouse interaction probe",
    issue: "https://github.com/darkmatter2222/Rustwake/issues/50",
    headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
    url,
    measuredAt: new Date().toISOString(),
    tool: "playwright-core + local Chrome/Edge headless, vite preview; DOM/console/geometry probes + CDP touch only (no visual inspection)",
    seed: "docs/evidence/yard-mature.json (tick 18298, 8 machines, tutorial 9, drone repaired); payload.sim.store.scrap=200 + payload.lastSeenMs=install time via envelope mutation + fnv checksum recompute: funds the 20-scrap sorter placement and credits no offline catch-up window (sim price validation unchanged)",
    cameraTruth: "canvas.dataset.cam paint stamp (x,y to 0.01; scale to 0.001); fit recomputed from painted chrome boxes",
    contexts,
    frames,
    summary: { contexts: contexts.length, frames: frames.length, failures: failures.length, pass: failures.length === 0 },
    failures,
  };
  writeFileSync(resolve(out, "probe-camera-50.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(`wrote ${frames.length} frames; ${failures.length} failures`);
  if (failures.length > 0) { console.error("FAILURES:", JSON.stringify(failures, null, 2)); process.exitCode = 1; }
} finally {
  await browser.close();
}
