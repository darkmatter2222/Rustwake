// RW3D T03 renderer spike (issue #130). Bounded proof: one reference glTF
// blockout, orthographic orbit/pan/zoom, raycast selection, state-driven hoist.
// Renderer boundary per TECHNICAL_CONTRACT: this module owns camera + visual
// time only; it reads a static scene description and never touches economy state.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createHoistController, HOIST_MIN_Y, HOIST_MAX_Y } from "./pivot.js";
import { PALETTE } from "./palette.js";

const FIXED_DT = 1 / 60;
const DEFAULT_YAW = 45;        // ART_AND_MOTION: default yaw 45 deg
const DEFAULT_ELEV = 35.264;   // ... elevation 35.264 deg, orthographic
const CAMERA_RADIUS = 26;
const FRUSTUM_HEIGHT = 9;      // frames the useful entity, not an empty plot
const TARGET = new THREE.Vector3(0, 1, 0);

const canvas = document.getElementById("scene");
const hud = {
  asset: document.getElementById("hud-asset"),
  selection: document.getElementById("hud-selection"),
  pivot: document.getElementById("hud-pivot"),
  camera: document.getElementById("hud-camera"),
  fps: document.getElementById("hud-fps"),
};
const fatalEl = document.getElementById("fatal");
function showFatal(message) {
  fatalEl.style.display = "grid";
  fatalEl.textContent = message;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  showFatal("WebGL is not available on this device/browser. The spike cannot render; no save data exists to lose. Try a WebGL-capable browser.");
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // capped DPR
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false; // blockout-flat quality tier

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.muted);

// Flat-ish lighting: one directional sun from upper-left of the default view
// plus ambient/hemisphere fill. No cinematic effects.
// Ambient-dominant fill calibrated so lit palette tokens read near their
// authored sRGB values (three's Lambert/Standard BRDF divides irradiance by PI).
const hemi = new THREE.HemisphereLight(0xf4ebd8, 0xba8054, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
sun.position.set(-8, 12, 6);
scene.add(sun);

// Terrain patch: flat sand plane + sparse stones/shrub (palette tokens only).
const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.MeshLambertMaterial({ color: PALETTE.sand })
);
terrain.rotation.x = -Math.PI / 2;
terrain.name = "terrain";
scene.add(terrain);
const grid = new THREE.GridHelper(12, 12, new THREE.Color(PALETTE.steel), new THREE.Color(PALETTE.sandLight));
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);
const decor = [
  { p: [4.5, 0.15, -3.5], s: [0.3, 0.3, 0.3], c: PALETTE.steel },
  { p: [-4.2, 0.2, 3.8], s: [0.45, 0.4, 0.45], c: PALETTE.olive },
  { p: [-3.8, 0.12, -4.4], s: [0.24, 0.24, 0.24], c: PALETTE.steel },
];
for (const d of decor) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...d.s), new THREE.MeshLambertMaterial({ color: d.c }));
  m.position.set(...d.p);
  scene.add(m);
}

const aspect = () => window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  (-FRUSTUM_HEIGHT * aspect()) / 2, (FRUSTUM_HEIGHT * aspect()) / 2,
  FRUSTUM_HEIGHT / 2, -FRUSTUM_HEIGHT / 2, 0.1, 100
);
function setCameraSpherical(yawDeg, elevDeg) {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const elev = THREE.MathUtils.degToRad(elevDeg);
  camera.position.set(
    TARGET.x + CAMERA_RADIUS * Math.cos(elev) * Math.sin(yaw),
    TARGET.y + CAMERA_RADIUS * Math.sin(elev),
    TARGET.z + CAMERA_RADIUS * Math.cos(elev) * Math.cos(yaw)
  );
  camera.lookAt(TARGET);
}
setCameraSpherical(DEFAULT_YAW, DEFAULT_ELEV);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = false; // deterministic camera for reproducible captures
controls.screenSpacePanning = true;
controls.minZoom = 0.5;
controls.maxZoom = 8;
controls.minPolarAngle = THREE.MathUtils.degToRad(8);
controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
controls.update();
const initialCamera = { position: camera.position.clone(), zoom: camera.zoom };
let resizeCount = 0;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hoistController = createHoistController({ reducedMotion });

let crane = null;
let craneMeshes = [];
let hoist = null;
const selectionBox = new THREE.Box3();
const selectionHelper = new THREE.Box3Helper(selectionBox, new THREE.Color(PALETTE.amber));
selectionHelper.visible = false;
scene.add(selectionHelper);
let selected = null;
const selectionLatencies = [];

function updateHud() {
  hud.selection.textContent = selected ? "SELECTED: crane (3x3)" : "selection: none";
  hud.selection.classList.toggle("sel-on", Boolean(selected));
  hud.pivot.textContent = `hoist: ${hoistController.state} y=${hoistController.y.toFixed(3)} (bounds ${HOIST_MIN_Y}..${HOIST_MAX_Y})`;
  const dir = camera.position.clone().sub(controls.target);
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
  hud.camera.textContent = `camera: yaw ${yaw.toFixed(1)} zoom ${camera.zoom.toFixed(2)}`;
}
function select(name) {
  selected = name === "crane" && crane ? "crane" : null;
  selectionHelper.visible = Boolean(selected);
  if (selected) selectionBox.setFromObject(crane);
  updateHud();
}
function applyPivot() {
  if (hoist) hoist.position.y = hoistController.y;
}
function updateSelectionBox() {
  if (selected) selectionBox.setFromObject(crane);
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX, clientY, eventTimeStamp) {
  if (!crane) return;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(craneMeshes, false);
  select(hits.length > 0 ? "crane" : null);
  if (typeof eventTimeStamp === "number") {
    selectionLatencies.push(Math.max(0, performance.now() - eventTimeStamp));
  }
}
let downX = 0, downY = 0;
canvas.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
canvas.addEventListener("pointerup", (e) => {
  // Click-vs-drag threshold keeps orbit/pan gestures from selecting (U02 intent).
  if (e.button === 0 && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
    pickAt(e.clientX, e.clientY, e.timeStamp);
  }
});

function resetCamera() {
  camera.position.copy(initialCamera.position);
  camera.zoom = initialCamera.zoom;
  camera.updateProjectionMatrix();
  controls.target.copy(TARGET);
  controls.update();
  updateHud();
}
function orbitTo(yawDeg, elevDeg) { setCameraSpherical(yawDeg, elevDeg); controls.update(); updateHud(); }
function setZoom(z) { camera.zoom = z; camera.updateProjectionMatrix(); controls.update(); updateHud(); }

document.getElementById("btn-cycle").addEventListener("click", () => { hoistController.startCycle(); updateHud(); });
document.getElementById("btn-reset-pivot").addEventListener("click", () => { hoistController.reset(); applyPivot(); updateHud(); });
document.getElementById("btn-reset-camera").addEventListener("click", resetCamera);

window.addEventListener("resize", () => {
  const a = aspect();
  camera.left = (-FRUSTUM_HEIGHT * a) / 2;
  camera.right = (FRUSTUM_HEIGHT * a) / 2;
  camera.top = FRUSTUM_HEIGHT / 2;
  camera.bottom = -FRUSTUM_HEIGHT / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeCount += 1;
});

canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  showFatal("WebGL context lost. Rendering paused; this spike holds no save data. Reload to recover.");
});

const api = {
  ready: false,
  threeRevision: THREE.REVISION,
  startup: { firstFrameMs: null, gltfLoadMs: null },
  selectionLatencies,
  pivot: () => ({ state: hoistController.state, y: hoistController.y, reducedMotion }),
  stats: () => ({
    frame, resizeCount,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  }),
  glInfo: () => {
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
      version: gl.getParameter(gl.VERSION),
    };
  },
  select,
  startCycle: () => hoistController.startCycle(),
  resetPivot: () => { hoistController.reset(); applyPivot(); updateHud(); },
  resetCamera, orbitTo, setZoom,
  projectCraneCenter: () => {
    const c = new THREE.Box3().setFromObject(crane).getCenter(new THREE.Vector3());
    c.project(camera);
    return { x: (c.x * 0.5 + 0.5) * window.innerWidth, y: (-c.y * 0.5 + 0.5) * window.innerHeight };
  },
  waitFrames: (n) => new Promise((resolve) => {
    let i = 0;
    const step = () => { i += 1; if (i >= n) resolve(true); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }),
  runBench,
};
window.__RW3D__ = api;

let frame = 0;
let benchRunning = false;
let lastTs = performance.now();
let fpsWindow = [];
function loop(ts) {
  requestAnimationFrame(loop);
  if (!api.ready || document.hidden || benchRunning) { lastTs = ts; return; }
  const dt = Math.min(Math.max((ts - lastTs) / 1000, 0), 0.1);
  lastTs = ts;
  hoistController.tick(dt);
  applyPivot();
  updateSelectionBox();
  controls.update();
  renderer.render(scene, camera);
  frame += 1;
  fpsWindow.push(dt);
  if (fpsWindow.length >= 30) {
    const mean = fpsWindow.reduce((a, b) => a + b, 0) / fpsWindow.length;
    hud.fps.textContent = `fps: ${(1 / mean).toFixed(1)}`;
    fpsWindow = [];
    updateHud();
  }
}
requestAnimationFrame(loop);

// Deterministic bounded benchmark timeline (seed rw3d-t03-bench-v1):
// 0-299 idle; 300-599 full 360 orbit + lift cycle; 600-749 zoom in, select,
// second cycle; 750-899 zoom out, deselect, camera reset. Fixed dt = 1/60.
function benchTimeline(i) {
  if (i === 300 || i === 675) hoistController.startCycle();
  if (i >= 300 && i < 600) orbitTo(DEFAULT_YAW + (360 * (i - 300)) / 300, DEFAULT_ELEV);
  if (i === 600) select("crane");
  if (i >= 600 && i < 750) setZoom(1 + (1.5 * (i - 600)) / 150);
  if (i >= 750 && i < 900) setZoom(2.5 - (1.5 * (i - 750)) / 150);
  if (i === 800) select(null);
  if (i === 899) resetCamera();
}
function runBench(frames) {
  benchRunning = true;
  select(null);
  hoistController.reset();
  applyPivot();
  resetCamera();
  return new Promise((resolve) => {
    const samples = [];
    let i = 0;
    let prevTs = null;
    const step = (ts) => {
      const t0 = performance.now();
      benchTimeline(i);
      hoistController.tick(FIXED_DT);
      applyPivot();
      updateSelectionBox();
      controls.update();
      renderer.render(scene, camera);
      const t1 = performance.now();
      samples.push({
        i,
        renderMs: +(t1 - t0).toFixed(3),
        rafMs: prevTs === null ? null : +(ts - prevTs).toFixed(3),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      });
      prevTs = ts;
      frame += 1;
      i += 1;
      if (i < frames) requestAnimationFrame(step);
      else { benchRunning = false; lastTs = performance.now(); resolve(samples); }
    };
    requestAnimationFrame(step);
  });
}

const loader = new GLTFLoader();
const loadStart = performance.now();
loader.load(
  `${import.meta.env.BASE_URL}assets/crane.gltf`,
  (gltf) => {
    crane = gltf.scene;
    crane.name = "crane";
    scene.add(crane);
    craneMeshes = [];
    crane.traverse((o) => { if (o.isMesh) craneMeshes.push(o); });
    hoist = crane.getObjectByName("hoist");
    if (!hoist) { showFatal("Reference asset missing named pivot 'hoist'."); return; }
    applyPivot();
    api.startup.gltfLoadMs = +(performance.now() - loadStart).toFixed(1);
    hud.asset.textContent = `asset: crane.gltf (${craneMeshes.length} meshes, pivot 'hoist')`;
    renderer.render(scene, camera);
    api.startup.firstFrameMs = +performance.now().toFixed(1);
    api.ready = true;
    updateHud();
  },
  undefined,
  (err) => { showFatal("Failed to load reference asset crane.gltf: " + (err?.message ?? err)); }
);
