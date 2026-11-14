// RW3D T09 (#136) production building capture scene.
// Builds the six authored assets straight from docs/vision/assets/kit.json
// (source of truth), each staged with worker + truck scale references at
// ACTUAL gameplay scale (1 cell = 1 unit). Orthographic front/side/iso views,
// white-on-black mask pass for silhouette bounds, and deterministic clip
// sampling for motion frame strips. No RNG, no clock-dependent state.
// three 0.187.0 EXACT per ADR-0001 (own package.json).
import * as THREE from "three";

const W = 1600;
const H = 900;
const PAD = 48;
const T09 = ["warehouse", "depot", "sorter", "furnace", "generator", "wreckSections"];
const VIEWS = { front: [0, 0, 1], side: [1, 0, 0], iso: [0.5773502692, 0.5773502692, 0.5773502692] };

const kit = await (await fetch("/docs/vision/assets/kit.json")).json();
const byId = new Map(kit.assets.map((a) => [a.id, a]));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#20241f");
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4a40, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(6, 12, 8);
scene.add(sun);

const helpers = new THREE.Group();
const grid = new THREE.GridHelper(24, 24, 0x9aa08f, 0x4a4f45);
helpers.add(grid);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshLambertMaterial({ color: new THREE.Color("#3a3f38") })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.002;
helpers.add(ground);
scene.add(helpers);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function buildAsset(a) {
  const root = new THREE.Group();
  root.name = a.id;
  const nodes = new Map([["root", root]]);
  for (const g of a.groups) {
    const n = new THREE.Object3D();
    n.name = g.name;
    n.position.fromArray(g.position);
    nodes.get(g.parent).add(n);
    nodes.set(g.name, n);
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const off = { root: [0, 0, 0] };
  for (const g of a.groups) {
    const p = off[g.parent];
    off[g.name] = [p[0] + g.position[0], p[1] + g.position[1], p[2] + g.position[2]];
  }
  for (const p of a.parts) {
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(kit.palette[p.material]) }));
    mesh.name = p.name;
    mesh.position.fromArray(p.center);
    mesh.scale.fromArray(p.size);
    nodes.get(p.parent).add(mesh);
    const o = off[p.parent];
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], o[i] + p.center[i] - p.size[i] / 2);
      max[i] = Math.max(max[i], o[i] + p.center[i] + p.size[i] / 2);
    }
  }
  return { root, nodes, min, max };
}

// One stage per T09 asset: building at origin, worker and truck refs beside it.
const stages = new Map();
for (const id of T09) {
  const a = byId.get(id);
  const built = buildAsset(a);
  const stage = new THREE.Group();
  stage.name = `stage:${id}`;
  stage.add(built.root);
  const worker = buildAsset(byId.get("worker"));
  worker.root.position.set(a.footprint[0] / 2 + 1.25, 0, 0);
  const truck = buildAsset(byId.get("truck"));
  truck.root.position.set(-a.footprint[0] / 2 - 1.75, 0, 0);
  stage.add(worker.root, truck.root);
  stage.visible = false;
  scene.add(stage);
  const unionMin = [
    Math.min(built.min[0], truck.root.position.x + truck.min[0]),
    0,
    Math.min(built.min[2], truck.min[2], worker.min[2]),
  ];
  const unionMax = [
    Math.max(built.max[0], worker.root.position.x + worker.max[0]),
    Math.max(built.max[1], truck.max[1], worker.max[1]),
    Math.max(built.max[2], truck.max[2], worker.max[2]),
  ];
  stages.set(id, { ...built, stage, refs: [worker.root, truck.root], unionMin, unionMax });
}

// Yard overview: all six authored assets in a row plus worker/truck refs.
const yard = new THREE.Group();
yard.name = "yard";
{
  let x = 0;
  const order = [...T09, "worker", "truck"];
  for (const id of order) {
    const b = buildAsset(byId.get(id));
    const w = b.max[0] - b.min[0];
    b.root.position.set(x - b.min[0], 0, 0);
    yard.add(b.root);
    x += w + 2.0;
  }
  yard.visible = false;
  scene.add(yard);
}
const yardBox = new THREE.Box3().setFromObject(yard);

let camParams = null;
function fitCamera(center, min, max, dir, pad = PAD) {
  const d = new THREE.Vector3(...dir).normalize();
  camera.position.set(center[0] + d.x * 60, center[1] + d.y * 60, center[2] + d.z * 60);
  camera.up.set(0, 1, 0);
  camera.lookAt(center[0], center[1], center[2]);
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  const right = [e[0], e[1], e[2]];
  const up = [e[4], e[5], e[6]];
  let lo = Infinity, hi = -Infinity, ulo = Infinity, uhi = -Infinity;
  for (const cx of [min[0], max[0]]) for (const cy of [min[1], max[1]]) for (const cz of [min[2], max[2]]) {
    const v = [cx - center[0], cy - center[1], cz - center[2]];
    const px = v[0] * right[0] + v[1] * right[1] + v[2] * right[2];
    const py = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
    lo = Math.min(lo, px); hi = Math.max(hi, px);
    ulo = Math.min(ulo, py); uhi = Math.max(uhi, py);
  }
  const ppu = Math.min((W - 2 * pad) / (hi - lo), (H - 2 * pad) / (uhi - ulo));
  camera.left = -W / (2 * ppu);
  camera.right = W / (2 * ppu);
  camera.top = H / (2 * ppu);
  camera.bottom = -H / (2 * ppu);
  camera.updateProjectionMatrix();
  camParams = { center, right, up, ppu, W, H };
}

function show(id, view) {
  for (const s of stages.values()) s.stage.visible = false;
  yard.visible = false;
  helpers.visible = true;
  if (id === "yard") {
    yard.visible = true;
    const c = yardBox.getCenter(new THREE.Vector3()).toArray();
    fitCamera(c, yardBox.min.toArray(), yardBox.max.toArray(), VIEWS[view]);
  } else {
    const s = stages.get(id);
    s.stage.visible = true;
    for (const r of s.refs) r.visible = true;
    const c = [(s.unionMin[0] + s.unionMax[0]) / 2, (s.unionMin[1] + s.unionMax[1]) / 2, (s.unionMin[2] + s.unionMax[2]) / 2];
    fitCamera(c, s.unionMin, s.unionMax, VIEWS[view]);
  }
  renderer.render(scene, camera);
  return camParams;
}

// ---- mask pass: white-on-black silhouette of the asset alone ---------------
// Threshold >128 = 50% coverage midpoint: with antialiasing, edge pixels carry
// partial coverage; the midpoint keeps measured bounds within +/-1px of the
// true projection even at pointy iso corners (a >250 threshold erodes them).
const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function measureMask() {
  const c2 = document.createElement("canvas");
  c2.width = W; c2.height = H;
  const ctx = c2.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(renderer.domElement, 0, 0);
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      if (data[i] > 128 && data[i + 1] > 128 && data[i + 2] > 128) {
        n += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return n ? { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels: n } : null;
}
function maskPass(id, view) {
  show(id, view);
  const s = stages.get(id);
  for (const r of s.refs) r.visible = false;
  helpers.visible = false;
  const bg = scene.background;
  scene.background = new THREE.Color(0x000000);
  scene.overrideMaterial = maskMat;
  renderer.render(scene, camera);
  const bounds = measureMask();
  scene.overrideMaterial = null;
  scene.background = bg;
  for (const r of s.refs) r.visible = true;
  helpers.visible = true;
  renderer.render(scene, camera);
  const groundPx = H / 2 + camParams.center[1] * camParams.ppu;
  return { bounds, cam: camParams, groundPx, localMinY: s.min[1] };
}

// ---- deterministic clip sampling (mirrored in capture.mjs) -----------------
function sampleClip(an, t) {
  const ts = an.times;
  if (t <= ts[0]) return [...an.values[0]];
  if (t >= ts[ts.length - 1]) return [...an.values[an.values.length - 1]];
  let i = 0;
  while (ts[i + 1] < t) i += 1;
  const f = (t - ts[i]) / (ts[i + 1] - ts[i]);
  const a = an.values[i];
  const b = an.values[i + 1];
  if (an.path === "rotation") {
    const d = a.reduce((s, v, k) => s + v * b[k], 0);
    const bb = d < 0 ? b.map((v) => -v) : b;
    const q = a.map((v, k) => v + (bb[k] - v) * f);
    const n = Math.hypot(...q);
    return q.map((v) => v / n);
  }
  return a.map((v, k) => v + (b[k] - v) * f);
}
function applyClip(id, name, t) {
  const s = stages.get(id);
  const an = byId.get(id).animations.find((x) => x.name === name);
  const node = s.nodes.get(an.target);
  const v = sampleClip(an, t);
  if (an.path === "translation") node.position.fromArray(v);
  else if (an.path === "rotation") node.quaternion.set(v[0], v[1], v[2], v[3]);
  else node.scale.fromArray(v);
  return { target: an.target, path: an.path, position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray() };
}
function resetPose(id) {
  const s = stages.get(id);
  const a = byId.get(id);
  for (const g of a.groups) {
    const n = s.nodes.get(g.name);
    n.position.fromArray(g.position);
    n.quaternion.set(0, 0, 0, 1);
    n.scale.set(1, 1, 1);
  }
}

// Motion frame strip: fixed sample times, asset-only framing, in-page composite.
function strip(id, clipName, times, view) {
  resetPose(id);
  const s = stages.get(id);
  for (const r of s.refs) r.visible = false;
  const center = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2];
  fitCamera(center, s.min, s.max, VIEWS[view], 24);
  // Crop window from projected asset corners (fixed for the whole strip).
  const corners = [];
  for (const cx of [s.min[0], s.max[0]]) for (const cy of [s.min[1], s.max[1]]) for (const cz of [s.min[2], s.max[2]]) {
    const v = [cx - center[0], cy - center[1], cz - center[2]];
    corners.push([
      W / 2 + (v[0] * camParams.right[0] + v[1] * camParams.right[1] + v[2] * camParams.right[2]) * camParams.ppu,
      H / 2 - (v[0] * camParams.up[0] + v[1] * camParams.up[1] + v[2] * camParams.up[2]) * camParams.ppu,
    ]);
  }
  const pad = 10;
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])) - pad));
  const x1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => c[0])) + pad));
  const y1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => c[1])) + pad));
  const fw = x1 - x0;
  const fh = y1 - y0;
  const out = document.createElement("canvas");
  out.width = fw * times.length;
  out.height = fh + 24;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, out.width, out.height);
  const frames = [];
  times.forEach((t, i) => {
    const actual = applyClip(id, clipName, t);
    renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, x0, y0, fw, fh, i * fw, 0, fw, fh);
    ctx.fillStyle = "#ddd";
    ctx.font = "14px monospace";
    ctx.fillText(`t=${t}s`, i * fw + 6, fh + 16);
    frames.push({ t, actual });
  });
  resetPose(id);
  for (const r of s.refs) r.visible = true;
  return { dataUrl: out.toDataURL("image/png"), frames, crop: { x0, y0, w: fw, h: fh } };
}

window.__fixture = {
  ready: true,
  meta: { threeRevision: THREE.REVISION, order: T09, palette: kit.palette, canvas: { w: W, h: H } },
  show,
  maskPass,
  applyClip,
  resetPose,
  strip,
  aabb: (id) => ({ min: stages.get(id).min, max: stages.get(id).max }),
};
