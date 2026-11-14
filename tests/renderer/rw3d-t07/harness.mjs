/*
 * RW3D T07 (#134) evidence harness — developer-owned, test-only.
 *
 * The app shell (src/app, src/ui) is owned by #135 and is NOT touched here, so
 * this page defines window.__RW3D__ itself and drives the REAL renderer modules
 * (drawScene composite, camera math, gesture reducer, three.js world layer)
 * against the REAL engine advanced at fixed dt from the checked-in legacy
 * fixture tests/legacy/fixtures/deep-yard.modern.json (decodeSave + migrate).
 *
 * Deterministic: no RNG, no wall clock in the state path; framePhase is scripted.
 * The only clock reads are performance.now() around render for the bench, which
 * is measurement code, not renderer code.
 */
import * as THREE from "three";
import fixture from "../../legacy/fixtures/deep-yard.modern.json";
import { decodeSave, migrate, encodeSave } from "../../../src/game/persistence/save";
import { advance } from "../../../src/game/simulation/engine";
import { fleetUnits } from "../../../src/game/simulation/types";
import { drawScene, fitCamera } from "../../../src/game/renderer/scene";
import {
  panCamera, zoomAtPoint, quarterTurn, clampCamera, refitCamera,
} from "../../../src/game/renderer/camera";
import { applyGesture, idleGesture } from "../../../src/game/renderer/gestures";
import { screenToWorld } from "../../../src/game/renderer/projection";
import { tileToWorld, worldToTile } from "../../../src/game/renderer/grid";
import { PALETTE } from "../../../src/game/renderer/sprites";
import {
  getWorld3D, pickWorld3D, world3DStatus,
} from "../../../src/game/renderer/three";
import { syncOrthoCamera, projectToScreen } from "../../../src/game/renderer/three/cameraRig";

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

let view = { width: globalThis.innerWidth, height: globalThis.innerHeight };
let insets = undefined;
let fitted;
let camera;
let state;
let settings;
let selected = null;
let phase = 0;
let gesture = idleGesture();
let downAt = 0;
const selectionLatencies = [];
let lastTap = null;
let snap = null;
let loseExt = null;

function loadFixture() {
  const decoded = decodeSave(JSON.stringify(fixture));
  if (!decoded.ok) throw new Error(`fixture decode failed: ${decoded.reason}`);
  const payload = migrate(decoded.payload);
  state = payload.sim;
  settings = payload.settings;
}

function sizeCanvas() {
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
  canvas.width = Math.round(view.width * dpr);
  canvas.height = Math.round(view.height * dpr);
}

function reset() {
  loadFixture();
  selected = null;
  phase = 0;
  gesture = idleGesture();
  insets = undefined;
  fitted = fitCamera(view, insets);
  camera = { ...fitted };
  render();
}

function render(opts = {}) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScene(ctx, state, camera, view, {
    reducedMotion: opts.reducedMotion ?? false,
    buildMode: false,
    ghostTile: null,
    ghostValid: false,
    selected,
    framePhase: phase,
  });
  return world3DStatus();
}

/* Real pointer input: the same reducer the shell uses, wired to DOM events so
 * playwright mouse/touch input exercises the production tap/pan/pinch path. */
function feed(input) {
  const out = applyGesture(gesture, input);
  gesture = out.state;
  if (out.pan) camera = panCamera(camera, view, out.pan.dx, out.pan.dy, fitted);
  if (out.pinch) camera = zoomAtPoint(camera, view, out.pinch.factor, out.pinch.x, out.pinch.y, fitted);
  if (out.tap) {
    const pick = pickWorld3D(out.tap.x, out.tap.y);
    selected = pick && pick.id !== null ? pick.id : null;
    lastTap = { x: out.tap.x, y: out.tap.y, id: selected };
    selectionLatencies.push(performance.now() - downAt);
  }
  render();
}
canvas.addEventListener("pointerdown", (e) => {
  downAt = performance.now();
  canvas.setPointerCapture(e.pointerId);
  feed({ type: "down", id: e.pointerId, x: e.offsetX, y: e.offsetY });
});
canvas.addEventListener("pointermove", (e) => {
  if (gesture.pointers.has(e.pointerId)) feed({ type: "move", id: e.pointerId, x: e.offsetX, y: e.offsetY });
});
canvas.addEventListener("pointerup", (e) => {
  feed({ type: "up", id: e.pointerId, x: e.offsetX, y: e.offsetY });
});
canvas.addEventListener("pointercancel", (e) => feed({ type: "cancel", id: e.pointerId }));

/* Pure-math projection camera for click targeting (same rig the renderer syncs). */
const cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4096);
function projectWorld(x, y, z = 0) {
  syncOrthoCamera(cam3, camera, view);
  return projectToScreen(cam3, view, x, z, y);
}

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dist = (r, g, b, [R, G, B]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B);
const BG = hexToRgb(PALETTE.nightDeep);
const SELECT = hexToRgb(PALETTE.select);
const AMBER = hexToRgb(PALETTE.amber);

function imageData() {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function pixelStats() {
  const { width, height, data } = imageData();
  const n = width * height;
  const colors = new Set();
  let lumSum = 0, lumSq = 0, bg = 0, sel = 0, amber = 0;
  for (let i = 0; i < n; i += 1) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    colors.add((r << 16) | (g << 8) | b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum; lumSq += lum * lum;
    if (dist(r, g, b, BG) <= 9) bg += 1;
    if (dist(r, g, b, SELECT) <= 30) sel += 1;
    if (dist(r, g, b, AMBER) <= 60) amber += 1;
  }
  const mean = lumSum / n;
  return {
    width, height,
    uniqueColors: colors.size,
    luminanceMean: +mean.toFixed(2),
    luminanceStddev: +Math.sqrt(Math.max(0, lumSq / n - mean * mean)).toFixed(2),
    backgroundFraction: +(bg / n).toFixed(4),
    selectPixels: sel,
    amberPixels: amber,
  };
}

function fnv(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 97) { // stride sample: stable, cheap
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function diffFraction(a, b) {
  const n = a.width * a.height;
  let diff = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Math.abs(a.data[i * 4] - b.data[i * 4])
      + Math.abs(a.data[i * 4 + 1] - b.data[i * 4 + 1])
      + Math.abs(a.data[i * 4 + 2] - b.data[i * 4 + 2]);
    if (d > 24) diff += 1;
  }
  return +(diff / n).toFixed(4);
}

sizeCanvas();
reset();

globalThis.__RW3D__ = {
  ready: true,
  selectionLatencies,
  info: () => ({
    fixture: "deep-yard.modern",
    threeRevision: THREE.REVISION,
    dpr,
    tick: state.tick,
    machines: state.machines.length,
    drones: fleetUnits(state).length,
    credits: state.credits,
  }),
  state: () => ({ tick: state.tick, machines: state.machines.length, drones: fleetUnits(state).length, credits: state.credits }),
  saveText: () => encodeSave(state, 0, settings),
  camera: () => ({ ...camera }),
  selected: () => selected,
  lastTap: () => lastTap,
  status: () => world3DStatus(),
  glInfo: () => {
    const w = getWorld3D();
    if (!w) return null;
    const gl = w.canvas.getContext("webgl2") || w.canvas.getContext("webgl");
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return { renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown" };
  },
  setCamera: (patch) => { camera = clampCamera({ ...camera, ...patch }, view, fitted); return { ...camera }; },
  orbitTo: (yaw, elev) => { camera = clampCamera({ ...camera, yaw, elev }, view, fitted); return { ...camera }; },
  quarter: (dir) => { camera = quarterTurn(camera, view, dir, fitted); return { ...camera }; },
  pan: (dx, dy) => { camera = panCamera(camera, view, dx, dy, fitted); return { ...camera }; },
  zoomAt: (sx, sy, factor) => { camera = zoomAtPoint(camera, view, factor, sx, sy, fitted); return { ...camera }; },
  fit: (band) => { insets = band; fitted = fitCamera(view, insets); camera = { ...fitted }; return { ...camera }; },
  resize: (w, h, band, keepIntent = true) => {
    view = { width: w, height: h };
    sizeCanvas();
    insets = band;
    fitted = fitCamera(view, insets);
    camera = refitCamera(camera, fitted, view, keepIntent);
    render();
    return { ...camera };
  },
  setPhase: (p) => { phase = p; },
  advanceTicks: (n) => { advance(state, n); return { tick: state.tick }; },
  render: (opts) => render(opts),
  projectWorld,
  projectMachine: (id) => {
    const m = state.machines.find((mm) => mm.id === id);
    if (!m) return null;
    const p = tileToWorld(m.tile);
    return projectWorld(p.x, p.y, 8);
  },
  machineIds: () => state.machines.map((m) => m.id),
  /* Scripted reducer run (no DOM): returns commit count for cancel/drag safety. */
  dispatch: (inputs) => {
    let g = idleGesture();
    let commits = 0;
    let cam = { ...camera };
    for (const input of inputs) {
      const out = applyGesture(g, input);
      g = out.state;
      if (out.pan) cam = panCamera(cam, view, out.pan.dx, out.pan.dy, fitted);
      if (out.pinch) cam = zoomAtPoint(cam, view, out.pinch.factor, out.pinch.x, out.pinch.y, fitted);
      if (out.tap) commits += 1;
    }
    camera = cam;
    return { commits, camera: { ...cam }, phase: g.phase, spoiled: g.spoiled };
  },
  tapSelect: (sx, sy) => {
    render(); // sync the singleton before picking
    const out = applyGesture(applyGesture(idleGesture(), { type: "down", id: 1, x: sx, y: sy }), { type: "up", id: 1, x: sx, y: sy });
    if (!out.tap) return { committed: false, id: null };
    const pick = pickWorld3D(sx, sy);
    selected = pick && pick.id !== null ? pick.id : null;
    const w = screenToWorld(camera, view, sx, sy);
    render();
    return { committed: true, id: selected, point: pick ? pick.point : null, tile: w ? worldToTile(w.x, w.y) : null };
  },
  pixelStats,
  snapshot: () => { snap = imageData(); return snap.width * snap.height; },
  diffSnapshot: () => (snap ? diffFraction(snap, imageData()) : null),
  pixelHash: () => fnv(imageData().data),
  /* Hidden-tab pause: a hidden drawScene must write nothing. */
  hiddenPause: () => {
    render();
    const before = imageData();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    render();
    const whileHidden = diffFraction(before, imageData());
    delete document.hidden;
    render();
    const afterRestore = diffFraction(before, imageData());
    return { whileHidden, afterRestore };
  },
  /* Reduced motion: discrete stages — two sub-tick phases must paint identically. */
  reducedMotionPair: () => {
    phase = 0.13; render({ reducedMotion: true });
    const a = imageData();
    phase = 0.47; render({ reducedMotion: true });
    const reducedDiff = diffFraction(a, imageData());
    render({ reducedMotion: false });
    const motionDiff = diffFraction(a, imageData());
    phase = 0; render();
    return { reducedDiff, motionDiff };
  },
  loseContext: async () => {
    const w = getWorld3D();
    if (!w) return "unavailable";
    const gl = w.canvas.getContext("webgl2") || w.canvas.getContext("webgl");
    loseExt = gl.getExtension("WEBGL_lose_context");
    if (!loseExt) return "no-extension";
    loseExt.loseContext();
    await new Promise((r) => setTimeout(r, 150));
    return world3DStatus();
  },
  restoreContext: async () => {
    if (!loseExt) return "no-extension";
    loseExt.restoreContext();
    await new Promise((r) => setTimeout(r, 400));
    render();
    return world3DStatus();
  },
  /* Fixed-dt scripted timeline. Returns per-frame render ms + final fingerprint. */
  runTimeline: (frames) => {
    const samples = [];
    for (let i = 0; i < frames; i += 1) {
      advance(state, 1); // fixed dt: one tick per frame
      phase = (i % 4) / 4;
      if (i > 0 && i % 150 === 0) camera = quarterTurn(camera, view, 1, fitted);
      if (i > 0 && i % 200 === 0) camera = zoomAtPoint(camera, view, i % 400 === 0 ? 1.25 : 0.8, view.width / 2, view.height / 2, fitted);
      const t0 = performance.now();
      render();
      samples.push({ frame: i, renderMs: +(performance.now() - t0).toFixed(3) });
    }
    return { samples, state: { tick: state.tick, machines: state.machines.length, credits: state.credits }, hash: fnv(imageData().data), stats: pixelStats() };
  },
  reset: () => { reset(); return { tick: state.tick }; },
};