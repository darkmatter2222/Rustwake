// RW3D T04 (#131) scale fixture — acceptance V06.
// Renders every kit.json recipe at canonical scale (1 unit = 1 grid cell,
// 2 m conceptual) in rest pose, orthographic front / side / iso views, with a
// 1-unit grid, scale bar and the worker as scale references. The rest pass
// plays no animation: it validates geometry scale.
//
// T15 (#142) adds a MOTION pass (acceptance V04): each rig clip is played
// independently with glTF channel semantics (the channel REPLACES the target
// node's local TRS; LINEAR rotation interpolates via slerp). The browser
// returns world transforms for every pivot group so the node-side driver can
// prove motion isolation numerically (target moves, non-subtree bit-stable),
// and motion poses are rendered + silhouette-checked like the rest pass.
//
// The capture driver (capture.mjs) uses two passes per view:
//   beauty: helpers visible, paper background -> evidence PNG
//   mask:   helpers hidden, pure white background, one asset visible at a time
//           -> silhouette pixel bounds compared against projected part corners.
// Non-vision authoring: numeric checks only; visual fidelity is NOT certified.
import * as THREE from "three";

const W = 1600;
const H = 900;
const HOVER = 1.0; // drone flight height is an entity transform (assets README)
const GAP = 2.0; // row gap between asset bounds, units
const BEAUTY_BG = 0xedeae3;
const MASK_BG = 0xffffff;
const VIEWS = {
  front: { dir: [0, 0, 1], layout: "x" }, // from +Z: frontage faces camera
  side: { dir: [1, 0, 0], layout: "z" }, // from +X (east): screen x = -Z
  iso: { dir: [0.5773503, 0.5773503, 0.5773503], layout: "x" }, // yaw 45, elev 35.264
};

const kit = await (await fetch("/docs/vision/assets/kit.json")).json();

// ---- recipe -> scene graph (rest pose) ------------------------------------
function groupOffsets(asset) {
  const off = { root: [0, 0, 0] };
  for (const g of asset.groups ?? []) {
    const p = off[g.parent ?? "root"];
    off[g.name] = [p[0] + g.position[0], p[1] + g.position[1], p[2] + g.position[2]];
  }
  return off;
}

function localBounds(asset) {
  const off = groupOffsets(asset);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of asset.parts) {
    const o = off[p.parent ?? "root"];
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], o[a] + p.center[a] - p.size[a] / 2);
      max[a] = Math.max(max[a], o[a] + p.center[a] + p.size[a] / 2);
    }
  }
  return { min, max };
}

function buildAsset(asset) {
  const root = new THREE.Group();
  root.name = asset.id;
  const nodes = { root };
  for (const g of asset.groups ?? []) {
    const n = new THREE.Group();
    n.name = g.name;
    n.position.fromArray(g.position);
    nodes[g.parent ?? "root"].add(n);
    nodes[g.name] = n;
  }
  const partMeshes = [];
  for (const p of asset.parts) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]),
      new THREE.MeshLambertMaterial({ color: kit.palette[p.material] })
    );
    mesh.name = p.name;
    mesh.position.fromArray(p.center);
    nodes[p.parent ?? "root"].add(mesh);
    partMeshes.push({ mesh, part: p });
  }
  // T15: rest TRS per pivot group, so motion clips can REPLACE local TRS and
  // reset deterministically (glTF channels target node TRS, not deltas).
  const rest = {};
  for (const g of asset.groups ?? []) {
    rest[g.name] = { p: [...g.position], q: [0, 0, 0, 1] };
  }
  return { asset, root, nodes, rest, partMeshes, bounds: localBounds(asset), groundCenter: [0, 0, 0] };
}

const built = kit.assets.map(buildAsset);

// ---- renderer / scene ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.75);
sun.position.set(6, 12, 8);
scene.add(sun);
const assetsGroup = new THREE.Group();
assetsGroup.name = "assets";
for (const b of built) assetsGroup.add(b.root);
scene.add(assetsGroup);
const helpers = new THREE.Group();
helpers.name = "helpers";
scene.add(helpers);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
let ppu = 0; // pixels per world unit for the current view

// ---- layout ----------------------------------------------------------------
function layout(mode) {
  let cursor = 0;
  const centers = [];
  for (const b of built) {
    const ext = mode === "x" ? b.bounds.max[0] - b.bounds.min[0] : b.bounds.max[2] - b.bounds.min[2];
    const pitch = ext + GAP;
    centers.push(cursor + pitch / 2);
    cursor += pitch;
  }
  const shift = -cursor / 2;
  built.forEach((b, i) => {
    const c = centers[i] + shift;
    const hover = b.asset.id === "drone" ? HOVER : 0;
    if (mode === "x") {
      b.root.position.set(c - (b.bounds.min[0] + b.bounds.max[0]) / 2, hover, 0);
      b.groundCenter = [b.root.position.x, 0, 0];
    } else {
      b.root.position.set(0, hover, c - (b.bounds.min[2] + b.bounds.max[2]) / 2);
      b.groundCenter = [0, 0, b.root.position.z];
    }
  });
}

function fitCamera(dir) {
  const box = new THREE.Box3();
  for (const b of built) box.expandByObject(b.root);
  const center = box.getCenter(new THREE.Vector3());
  const d = new THREE.Vector3().fromArray(dir).normalize();
  camera.position.copy(center).addScaledVector(d, 120);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  let hw = 0;
  let hh = 0;
  const v = new THREE.Vector3();
  for (const sx of [box.min.x, box.max.x])
    for (const sy of [box.min.y, box.max.y])
      for (const sz of [box.min.z, box.max.z]) {
        v.set(sx, sy, sz).sub(center);
        hw = Math.max(hw, Math.abs(v.dot(right)));
        hh = Math.max(hh, Math.abs(v.dot(up)));
      }
  const aspect = W / H;
  const halfH = Math.max(hh, hw / aspect) * 1.08 + 0.5;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  ppu = H / (2 * halfH);
  return { center, box };
}

// ---- helpers (grid, labels, scale bar) — hidden in the mask pass -----------
function textSprite(draw, cw, ch, worldW) {
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  draw(canvas.getContext("2d"), cw, ch);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(worldW, (worldW * ch) / cw, 1);
  return sprite;
}

function labelSprite(text, sub) {
  return textSprite((ctx, cw, ch) => {
    ctx.fillStyle = "rgba(41,44,41,0.85)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#f2efe8";
    ctx.font = "600 44px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, cw / 2, 56);
    if (sub) {
      ctx.font = "32px system-ui, sans-serif";
      ctx.fillStyle = "#d6c7a3";
      ctx.fillText(sub, cw / 2, 104);
    }
  }, 512, 128, 3.4);
}

function rebuildHelpers(viewName, frame, poseLabel = "rest pose") {
  for (const child of [...helpers.children]) {
    child.material?.map?.dispose();
    child.material?.dispose();
    child.geometry?.dispose();
    helpers.remove(child);
  }
  const span = Math.max(frame.box.max.x - frame.box.min.x, frame.box.max.z - frame.box.min.z);
  const gridSize = Math.ceil(span) + 6;
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x7c8078, 0xb9b4a4);
  grid.position.set(frame.center.x, 0, frame.center.z);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  helpers.add(grid);

  for (const b of built) {
    const topY = b.root.position.y + b.bounds.max[1];
    const sub = `${b.asset.footprint[0]}x${b.asset.footprint[1]} cells` + (b.asset.id === "worker" ? " · 0.85 u nominal" : "") + (b.asset.id === "drone" ? ` · hover ${HOVER.toFixed(1)} u` : "");
    const label = labelSprite(b.asset.id, sub);
    label.position.set(b.root.position.x, topY + 0.9, b.root.position.z);
    helpers.add(label);
  }

  const bar = textSprite((ctx, cw, ch) => {
    ctx.fillStyle = "rgba(242,239,232,0.92)";
    ctx.fillRect(0, 0, cw, ch);
    const x0 = 40;
    const segW = (cw - 80) / 5;
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i % 2 ? "#d6c7a3" : "#292c29";
      ctx.fillRect(x0 + i * segW, 24, segW, 36);
    }
    ctx.fillStyle = "#292c29";
    ctx.font = "28px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i += 1) ctx.fillText(String(i), x0 + i * segW, 96);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillText("units (1 cell = 2 m conceptual)", cw / 2, 140);
  }, 1024, 160, 7);
  if (VIEWS[viewName].layout === "x") bar.position.set(frame.box.min.x + 3.5, 0.06, frame.box.max.z + 3.2);
  else bar.position.set(frame.box.max.x + 3.6, 0.06, frame.box.min.z + 3.5);
  helpers.add(bar);

  const title = textSprite((ctx, cw, ch) => {
    ctx.fillStyle = "rgba(41,44,41,0.85)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#f2efe8";
    ctx.font = "600 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`RW3D kit scale fixture · ${viewName} · ${poseLabel} · orthographic`, cw / 2, 60);
    ctx.font = "30px system-ui, sans-serif";
    ctx.fillStyle = "#d6c7a3";
    ctx.fillText("kit.json blockout recipes · 1 unit = 1 grid cell · worker = scale reference", cw / 2, 108);
  }, 1400, 140, 12);
  title.position.set(frame.center.x, frame.box.max.y + 3.2, frame.center.z);
  helpers.add(title);
}

// ---- views -----------------------------------------------------------------
function setView(name, { showHelpers = true, background = BEAUTY_BG, poseLabel = "rest pose" } = {}) {
  const view = VIEWS[name];
  if (!view) throw new Error(`unknown view ${name}`);
  layout(view.layout);
  const frame = fitCamera(view.dir);
  rebuildHelpers(name, frame, poseLabel);
  helpers.visible = showHelpers;
  scene.background = new THREE.Color(background);
  for (const b of built) b.root.visible = true;
  renderer.render(scene, camera);
  return { ppu, center: frame.center.toArray() };
}

// ---- mask pass: silhouette bounds vs projected part corners ----------------
const readCanvas = document.createElement("canvas");
readCanvas.width = W;
readCanvas.height = H;
const readCtx = readCanvas.getContext("2d", { willReadFrequently: true });

function measureSilhouette() {
  readCtx.drawImage(renderer.domElement, 0, 0);
  const d = readCtx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let x1 = -1;
  let y0 = H;
  let y1 = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function expectedBounds(b) {
  const v = new THREE.Vector3();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { mesh, part } of b.partMeshes) {
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          v.set((sx * part.size[0]) / 2, (sy * part.size[1]) / 2, (sz * part.size[2]) / 2);
          v.applyMatrix4(mesh.matrixWorld).project(camera);
          const px = ((v.x + 1) / 2) * W;
          const py = ((1 - v.y) / 2) * H;
          x0 = Math.min(x0, px);
          y0 = Math.min(y0, py);
          x1 = Math.max(x1, px);
          y1 = Math.max(y1, py);
        }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function maskPass(name) {
  setView(name, { showHelpers: false, background: MASK_BG });
  const assets = [];
  for (const b of built) {
    for (const other of built) other.root.visible = other === b;
    renderer.render(scene, camera);
    const actual = measureSilhouette();
    const expected = expectedBounds(b);
    const g = new THREE.Vector3().fromArray(b.groundCenter).project(camera);
    assets.push({
      id: b.asset.id,
      expected,
      actual,
      groundPx: { x: ((g.x + 1) / 2) * W, y: ((1 - g.y) / 2) * H },
      localMinY: b.bounds.min[1],
      localMaxY: b.bounds.max[1],
      hover: b.root.position.y,
    });
  }
  for (const b of built) b.root.visible = true;
  return { view: name, ppu, assets };
}

// ---- T15 motion pass: independent clip playback + numeric isolation --------
const RIG_IDS = ["truck", "forklift", "crane", "drone", "worker"];
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
function sampleChannel(an, t) {
  const ts = an.times;
  const vs = an.values;
  if (t <= ts[0]) return [...vs[0]];
  if (t >= ts[ts.length - 1]) return [...vs[vs.length - 1]];
  let i = 0;
  while (i < ts.length - 2 && ts[i + 1] < t) i += 1;
  const f = (t - ts[i]) / (ts[i + 1] - ts[i]);
  if (an.path === "rotation") {
    // glTF LINEAR rotation = slerp (shortest path; authored keys have dot >= 0).
    qa.fromArray(vs[i]);
    qb.fromArray(vs[i + 1]);
    qa.slerp(qb, f);
    return qa.toArray();
  }
  return vs[i].map((c, k) => c + (vs[i + 1][k] - c) * f);
}
function resetPose(assetId) {
  const b = built.find((x) => x.asset.id === assetId);
  for (const [name, r] of Object.entries(b.rest)) {
    const n = b.nodes[name];
    n.position.fromArray(r.p);
    n.quaternion.fromArray(r.q);
    n.scale.set(1, 1, 1);
  }
}
function worldTransforms(assetId) {
  const b = built.find((x) => x.asset.id === assetId);
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return Object.keys(b.rest).map((name) => {
    const n = b.nodes[name];
    return { name, pos: n.getWorldPosition(v).toArray(), quat: n.getWorldQuaternion(q).toArray() };
  });
}
function applyClip(assetId, clipName, t) {
  const b = built.find((x) => x.asset.id === assetId);
  const an = b.asset.animations.find((x) => x.name === clipName);
  if (!an) throw new Error(`unknown clip ${assetId}/${clipName}`);
  resetPose(assetId);
  const node = b.nodes[an.target];
  const value = sampleChannel(an, t);
  if (an.path === "translation") node.position.fromArray(value);
  else if (an.path === "rotation") node.quaternion.fromArray(value).normalize();
  else if (an.path === "scale") node.scale.fromArray(value);
  else throw new Error(`unsupported path ${an.path}`);
  return { asset: assetId, clip: clipName, t, target: an.target, groups: worldTransforms(assetId) };
}
function applyPose(spec) {
  for (const id of RIG_IDS) resetPose(id);
  for (const s of spec) applyClip(s.asset, s.clip, s.t);
  scene.updateMatrixWorld(true);
}
function motionMeta() {
  return RIG_IDS.map((id) => {
    const a = kit.assets.find((x) => x.id === id);
    return {
      id,
      clips: a.animations.map((an) => ({ name: an.name, target: an.target, path: an.path, times: an.times, loop: an.loop, duration: an.times[an.times.length - 1] - an.times[0] })),
    };
  });
}
function showMotion(viewName, spec, label) {
  setView(viewName, { poseLabel: `motion ${label}` });
  applyPose(spec);
  renderer.render(scene, camera);
}
function motionMaskPass(viewName, spec) {
  setView(viewName, { showHelpers: false, background: MASK_BG, poseLabel: "motion" });
  applyPose(spec);
  const assets = [];
  for (const b of built.filter((x) => RIG_IDS.includes(x.asset.id))) {
    for (const other of built) other.root.visible = other === b;
    renderer.render(scene, camera);
    assets.push({ id: b.asset.id, expected: expectedBounds(b), actual: measureSilhouette() });
  }
  for (const b of built) b.root.visible = true;
  for (const id of RIG_IDS) resetPose(id);
  return { view: viewName, ppu, assets };
}

window.__fixture = {
  ready: true,
  meta: { W, H, threeRevision: THREE.REVISION, order: built.map((b) => b.asset.id), hover: HOVER, views: Object.keys(VIEWS) },
  show: (name) => setView(name),
  maskPass,
  // T15 motion API
  motionMeta,
  applyClip,
  resetPose,
  worldTransforms,
  applyPose,
  showMotion,
  motionMaskPass,
};
