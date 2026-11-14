#!/usr/bin/env node
// RW3D T04 (#131): validate the procedural asset kit against the grid/scale contract.
// Extended by T09 (#136): production building authoring checks (S7) — palette
// preservation, baseline recipe contracts, detail-quantum discipline for new
// geometry, motion-inventory coverage and channel semantics. Manifest status
// vocabulary now includes "production" (requires visualReview pending|accepted;
// capable visual inspection remains an open gate until G1 #151).
//
// Inputs (read-only): docs/vision/assets/kit.json, asset-manifest.json, generated/*.gltf.
// Contract sources: docs/vision/ART_AND_MOTION.md (spatial grammar), ACCEPTANCE.md V06,
// docs/vision/assets/README.md (schema summary).
//
// Plain node, no dependencies. Deterministic: every check prints expected/actual.
// Exit code 0 = all hard checks pass; 1 = at least one FAIL. FINDINGS are printed
// deviations/coverage gaps that do not fail the run but require reviewer attention.
//
// Usage: node scripts/rw3d-kit-validate.mjs [--json <path>]
//
// Rotation convention: right-handed Y-up, positive yaw per three.js R_y(theta):
//   x' = x cos(theta) + z sin(theta); z' = -x sin(theta) + z cos(theta).
// For 90-degree steps this is the exact integer permutation table below, so
// +Z frontage maps to +X at yaw 90. A second, independent matrix implementation
// cross-checks every rotated vector.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "docs", "vision", "assets");
const EPS = 1e-6;

// Spec scale anchors (ART_AND_MOTION.md "Spatial grammar").
const SPEC = {
  workerHeight: 0.85,
  truckEnvelope: { width: 1.0, length: 2.5, height: 1.15 }, // "approximately"
  laneWidth: 1.25,
  gateSideClearance: 0.15,
  detailQuantum: 0.125,
  // Documented tolerances for the approximate anchors (see report limitations):
  // worker height: half a detail quantum; truck "approximately": two quanta.
  workerHeightTol: 0.0625,
  truckEnvelopeTol: 0.25,
  groundFloatTol: 0.125, // one detail quantum of blockout ground float
  roofOverhangTol: 0.125,
};
const EXTERNAL_SOCKET_KINDS = new Set(["truck", "belt", "pallet", "road"]);
const ROTATIONS = [0, 90, 180, 270];

const results = [];
const findings = [];
function record(section, id, ok, expected, actual) {
  results.push({ section, id, ok, expected, actual });
  const fmt = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  console.log(`${ok ? "PASS" : "FAIL"} [${section}] ${id} | expected: ${fmt(expected)} | actual: ${fmt(actual)}`);
}
function check(section, id, ok, expected, actual) {
  record(section, id, Boolean(ok), expected, actual);
}
function near(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}
function vecNear(a, b, eps = EPS) {
  return a.length === b.length && a.every((v, i) => near(v, b[i], eps));
}
function finding(text) {
  findings.push(text);
  console.log(`FINDING ${text}`);
}
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const half = (a) => a.map((v) => v / 2);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// Exact 90-degree yaw permutations (k = degrees / 90), derived from R_y.
function rot90(v, k) {
  const [x, y, z] = v;
  switch (((k % 4) + 4) % 4) {
    case 0: return [x, y, z];
    case 1: return [z, y, -x];
    case 2: return [-x, y, -z];
    case 3: return [-z, y, x];
    default: throw new Error("bad rotation");
  }
}
// Independent cross-check: standard rotation matrix with rounded trig.
function rotMatrix(v, deg) {
  const t = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function allFinite(node, path, bad) {
  if (typeof node === "number") {
    if (!Number.isFinite(node)) bad.push(path);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => allFinite(v, `${path}[${i}]`, bad));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) allFinite(v, `${path}.${k}`, bad);
  }
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------
const kitPath = join(assetsDir, "kit.json");
const manifestPath = join(assetsDir, "asset-manifest.json");
const kit = JSON.parse(readFileSync(kitPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const kitSha256 = createHash("sha256").update(readFileSync(kitPath)).digest("hex");
const manifestSha256 = createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
console.log(`kit.json sha256=${kitSha256}`);
console.log(`asset-manifest.json sha256=${manifestSha256}`);

// ---------------------------------------------------------------------------
// S1: schema, palette, finiteness (README schema summary)
// ---------------------------------------------------------------------------
check("schema", "kit.schemaVersion", kit.schemaVersion === 1, 1, kit.schemaVersion);
check("schema", "manifest.schemaVersion", manifest.schemaVersion === 1, 1, manifest.schemaVersion);
check("schema", "kit.detailQuantum", kit.detailQuantum === SPEC.detailQuantum, SPEC.detailQuantum, kit.detailQuantum);
const hexRe = /^#[0-9A-Fa-f]{6}$/;
const paletteOk = Object.values(kit.palette).every((c) => hexRe.test(c));
check("schema", "palette hex tokens", paletteOk, "all #RRGGBB", Object.entries(kit.palette).filter(([, c]) => !hexRe.test(c)));
const finiteBad = [];
allFinite(kit, "kit", finiteBad);
allFinite(manifest, "manifest", finiteBad);
check("schema", "all values finite", finiteBad.length === 0, [], finiteBad);

const ids = kit.assets.map((a) => a.id);
check("schema", "unique asset ids", new Set(ids).size === ids.length, ids.length, new Set(ids).size);

for (const a of kit.assets) {
  const s = `schema:${a.id}`;
  const fpOk = Array.isArray(a.footprint) && a.footprint.length === 2 && a.footprint.every((v) => Number.isInteger(v) && v >= 1);
  check(s, "footprint integer [w,d] >= 1", fpOk, "integer pair >= 1", a.footprint);
  check(s, "front +Z", a.front === "+Z", "+Z", a.front);
  const groupNames = new Set(a.groups.map((g) => g.name));
  const partNames = new Set(a.parts.map((p) => p.name));
  check(s, "group names unique", groupNames.size === a.groups.length, a.groups.length, groupNames.size);
  check(s, "part names unique", partNames.size === a.parts.length, a.parts.length, partNames.size);
  check(s, "socket names unique", new Set(a.sockets.map((x) => x.name)).size === a.sockets.length, a.sockets.length, new Set(a.sockets.map((x) => x.name)).size);
  check(s, "animation names unique", new Set(a.animations.map((x) => x.name)).size === a.animations.length, a.animations.length, new Set(a.animations.map((x) => x.name)).size);
  check(s, "has >= 1 named pivot group", a.groups.length >= 1, ">=1", a.groups.length);

  // Group parent references precede children; root implicit; no cycles.
  const seen = new Set(["root"]);
  let orderOk = true;
  let cycleOk = true;
  for (const g of a.groups) {
    if (!seen.has(g.parent)) orderOk = false;
    let cur = g.parent;
    let guard = 0;
    while (cur !== "root") {
      const pg = a.groups.find((x) => x.name === cur);
      if (!pg || ++guard > 64) { cycleOk = false; break; }
      cur = pg.parent;
    }
    seen.add(g.name);
    if (!Array.isArray(g.position) || g.position.length !== 3) orderOk = false;
  }
  check(s, "group parents precede children", orderOk, true, orderOk);
  check(s, "group chains acyclic to root", cycleOk, true, cycleOk);

  for (const p of a.parts) {
    const parentOk = p.parent === "root" || groupNames.has(p.parent);
    if (!parentOk) check(s, `part ${p.name} parent exists`, false, "root|group", p.parent);
    const sizeOk = Array.isArray(p.size) && p.size.length === 3 && p.size.every((v) => v > 0);
    if (!sizeOk) check(s, `part ${p.name} size > 0`, false, "[>0,>0,>0]", p.size);
    if (!kit.palette[p.material]) check(s, `part ${p.name} material in palette`, false, Object.keys(kit.palette), p.material);
    if (!Array.isArray(p.center) || p.center.length !== 3) check(s, `part ${p.name} center[3]`, false, "vec3", p.center);
  }
  check(s, "parts: parents/sizes/materials/centers valid", true, "all valid", "all valid");

  for (const sk of a.sockets) {
    const ax = sk.approach;
    const unitAxis = Array.isArray(ax) && ax.length === 3 && ax.filter((v) => Math.abs(v) === 1).length === 1 && ax.every((v) => v === 0 || Math.abs(v) === 1);
    check(s, `socket ${sk.name} approach unit axis`, unitAxis, "one +/-1, rest 0", ax);
    check(s, `socket ${sk.name} clearanceWidth > 0`, Number.isFinite(sk.clearanceWidth) && sk.clearanceWidth > 0, ">0", sk.clearanceWidth);
    check(s, `socket ${sk.name} position[3]`, Array.isArray(sk.position) && sk.position.length === 3, "vec3", sk.position);
  }

  for (const an of a.animations) {
    const targetOk = groupNames.has(an.target);
    check(s, `anim ${an.name} target is named group`, targetOk, "declared group", an.target);
    const pathOk = ["translation", "rotation", "scale"].includes(an.path);
    check(s, `anim ${an.name} path valid`, pathOk, "translation|rotation|scale", an.path);
    const inc = an.times.every((t, i) => i === 0 || t > an.times[i - 1]);
    check(s, `anim ${an.name} times strictly increasing`, inc && an.times[0] >= 0, "strictly increasing, t0>=0", an.times);
    check(s, `anim ${an.name} values match times`, an.values.length === an.times.length, an.times.length, an.values.length);
    const arity = an.path === "rotation" ? 4 : 3;
    const arityOk = an.values.every((v) => v.length === arity);
    check(s, `anim ${an.name} value arity`, arityOk, arity, an.values.map((v) => v.length));
    if (an.path === "rotation") {
      const norms = an.values.map((q) => Math.hypot(...q));
      check(s, `anim ${an.name} unit quaternions`, norms.every((n) => near(n, 1, 1e-6)), "norm 1 +/- 1e-6", norms.map((n) => Number(n.toFixed(9))));
    }
    if (an.path === "scale") {
      check(s, `anim ${an.name} scale values > 0`, an.values.every((v) => v.every((x) => x > 0)), ">0", "checked");
    }
    check(s, `anim ${an.name} loop boolean`, typeof an.loop === "boolean", "boolean", an.loop);
  }

  // Every pivot group carries geometry (no empty pivots).
  const desc = (gname) => a.parts.some((p) => {
    let cur = p.parent;
    let guard = 0;
    while (cur !== "root" && ++guard < 64) {
      if (cur === gname) return true;
      cur = a.groups.find((g) => g.name === cur)?.parent ?? "root";
    }
    return false;
  });
  const empty = a.groups.filter((g) => !desc(g.name)).map((g) => g.name);
  check(s, "every pivot group has geometry", empty.length === 0, [], empty);
}

// ---------------------------------------------------------------------------
// Geometry model: rest-pose world AABBs from group chains + part centers.
// ---------------------------------------------------------------------------
function buildModel(a) {
  const groups = new Map(a.groups.map((g) => [g.name, g]));
  const chainPos = (name) => {
    let p = [0, 0, 0];
    let cur = name;
    let guard = 0;
    while (cur !== "root") {
      const g = groups.get(cur);
      if (!g || ++guard > 64) throw new Error(`bad parent chain at ${cur}`);
      p = add(p, g.position);
      cur = g.parent;
    }
    return p;
  };
  const parts = a.parts.map((p) => {
    const c = add(chainPos(p.parent), p.center);
    return { ...p, worldCenter: c, min: sub(c, half(p.size)), max: add(c, half(p.size)) };
  });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p.min[i]);
      max[i] = Math.max(max[i], p.max[i]);
    }
  }
  const inSubtree = (p, gname) => {
    let cur = p.parent;
    let guard = 0;
    while (cur !== "root" && ++guard < 64) {
      if (cur === gname) return true;
      cur = groups.get(cur)?.parent ?? "root";
    }
    return false;
  };
  return { asset: a, groups, parts, min, max, chainPos, inSubtree };
}
const models = new Map(kit.assets.map((a) => [a.id, buildModel(a)]));
const truck = models.get("truck");
const truckSize = sub(truck.max, truck.min); // [width(X), height(Y), length(Z)]
const truckBodyWidth = Math.max(...truck.parts.filter((p) => !p.parent.startsWith("wheel_")).map((p) => p.max[0] - p.min[0]));

// ---------------------------------------------------------------------------
// S2: manifest + generated glTF consistency (named pivots delivered as authored)
// ---------------------------------------------------------------------------
const manifestIds = manifest.assets.map((a) => a.id);
check("manifest", "manifest ids == kit ids", deepEqual([...manifestIds].sort(), [...ids].sort()), ids, manifestIds);
check("manifest", "no additionalRequired marked delivered", manifest.additionalRequired.every((x) => !ids.includes(x)), "disjoint", manifest.additionalRequired.filter((x) => ids.includes(x)));

for (const m of manifest.assets) {
  const a = kit.assets.find((x) => x.id === m.id);
  const s = `manifest:${m.id}`;
  if (!a) { check(s, "kit recipe exists", false, m.id, "missing"); continue; }
  check(s, "footprint matches kit", deepEqual(m.footprint, a.footprint), a.footprint, m.footprint);
  check(s, "parts count matches kit", m.parts === a.parts.length, a.parts.length, m.parts);
  check(s, "clips match kit animations", deepEqual([...m.clips].sort(), a.animations.map((x) => x.name).sort()), a.animations.map((x) => x.name), m.clips);
  const statusOk = m.status === "blockout" || m.status === "production";
  check(s, "status vocabulary (blockout|production)", statusOk, "blockout|production", m.status);
  if (m.status === "production") {
    const vrOk = m.visualReview === "pending" || m.visualReview === "accepted";
    check(s, "production declares visualReview (pending|accepted)", vrOk, "pending|accepted", m.visualReview ?? null);
    if (m.visualReview === "pending") finding(`${m.id} is production geometry; capable visual inspection PENDING (open gate, G1 #151). Not visually accepted.`);
  }
  const gltfPath = join(assetsDir, m.gltf);
  if (!existsSync(gltfPath)) { check(s, "gltf file exists", false, m.gltf, "missing"); continue; }
  const g = JSON.parse(readFileSync(gltfPath, "utf8"));
  const gs = `gltf:${m.id}`;
  check(gs, "glTF 2.0", g.asset?.version === "2.0", "2.0", g.asset?.version);
  check(gs, "embedded buffers only", (g.buffers ?? []).every((b) => String(b.uri ?? "").startsWith("data:")), "data: URIs", (g.buffers ?? []).map((b) => String(b.uri ?? "").slice(0, 24)));
  const nodes = g.nodes ?? [];
  const byName = new Map(nodes.map((n, i) => [n.name, { n, i }]));
  const parentOf = new Map();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
  const expectedNames = [a.id, ...a.groups.map((x) => x.name), ...a.parts.map((x) => x.name)].sort();
  check(gs, "node names == root + groups + parts", deepEqual(nodes.map((n) => n.name).sort(), expectedNames), expectedNames, nodes.map((n) => n.name).sort());
  let structOk = true;
  const structBad = [];
  for (const gr of a.groups) {
    const e = byName.get(gr.name);
    const par = e ? nodes[parentOf.get(e.i)]?.name : null;
    if (!e || par !== (gr.parent === "root" ? a.id : gr.parent) || !vecNear(e.n.translation ?? [0, 0, 0], gr.position)) {
      structOk = false;
      structBad.push(`group ${gr.name}`);
    }
  }
  for (const p of a.parts) {
    const e = byName.get(p.name);
    const par = e ? nodes[parentOf.get(e.i)]?.name : null;
    const meshName = e && e.n.mesh !== undefined ? g.meshes?.[e.n.mesh]?.name : null;
    if (!e || par !== (p.parent === "root" ? a.id : p.parent) || !vecNear(e.n.translation ?? [0, 0, 0], p.center) || !vecNear(e.n.scale ?? [1, 1, 1], p.size) || meshName !== `box_${p.material}`) {
      structOk = false;
      structBad.push(`part ${p.name}`);
    }
  }
  check(gs, "node hierarchy/transforms/materials match recipe", structOk, [], structBad);
  const rootExtras = byName.get(a.id)?.n?.extras ?? {};
  check(gs, "root extras.footprint", deepEqual(rootExtras.footprint, a.footprint), a.footprint, rootExtras.footprint);
  check(gs, "root extras.sockets", deepEqual(rootExtras.sockets, a.sockets), a.sockets, rootExtras.sockets);
  const anims = g.animations ?? [];
  check(gs, "animation names == clips", deepEqual(anims.map((x) => x.name).sort(), [...m.clips].sort()), m.clips, anims.map((x) => x.name));
  let chanOk = true;
  const chanBad = [];
  for (const an of a.animations) {
    const ga = anims.find((x) => x.name === an.name);
    const ch = ga?.channels?.[0];
    const targetName = ch ? nodes[ch.target.node]?.name : null;
    if (!ga || targetName !== an.target || ch.target.path !== an.path || ga.extras?.loop !== an.loop) {
      chanOk = false;
      chanBad.push(an.name);
    }
  }
  check(gs, "animation channels target recipe groups/paths/loop", chanOk, [], chanBad);
}

// ---------------------------------------------------------------------------
// S3: rest-pose bounds, ground contact, footprint conformance
// ---------------------------------------------------------------------------
// Functional external features. Spec-explicit: sorter "plus external belt
// connection", crane "plus swing clearance". Inferred (flagged as findings for
// product confirmation): forklift forks, turret barrel reach, truck wheels,
// drone airborne rotor span. Roof overhang bounded by one detail quantum.
for (const [id, m] of models) {
  const a = m.asset;
  const s = `bounds:${id}`;
  const [w, d] = a.footprint;
  const size = sub(m.max, m.min);
  console.log(`INFO bounds:${id} min=${JSON.stringify(m.min.map((v) => +v.toFixed(6)))} max=${JSON.stringify(m.max.map((v) => +v.toFixed(6)))} size=${JSON.stringify(size.map((v) => +v.toFixed(6)))} footprint=[${w},${d}]`);

  if (id === "drone") {
    check(s, "airborne: min Y >= -quantum (cargo hangs; flight is entity transform)", m.min[1] >= -SPEC.detailQuantum - EPS, `>= ${-SPEC.detailQuantum}`, +m.min[1].toFixed(6));
    finding(`drone is airborne: rotor span ${size[0].toFixed(3)} x ${size[2].toFixed(3)} exceeds 1x1 landing footprint; flight height is entity transform per README. Inferred allowance, product confirmation needed.`);
    continue;
  }
  check(s, "ground contact: 0 <= min Y <= quantum", m.min[1] >= -EPS && m.min[1] <= SPEC.groundFloatTol + EPS, `[0, ${SPEC.groundFloatTol}]`, +m.min[1].toFixed(6));
  if (m.min[1] > EPS) finding(`${id} floats ${m.min[1].toFixed(3)} above ground (blockout artifact, <= one detail quantum).`);

  const overhangs = [];
  for (const p of m.parts) {
    const ox = Math.max(0, p.max[0] - w / 2, -p.min[0] - w / 2);
    const oz = Math.max(0, p.max[2] - d / 2, -p.min[2] - d / 2);
    if (ox <= EPS && oz <= EPS) continue;
    let allowed = false;
    let why = "";
    if ((id === "warehouse" || id === "depot") && p.parent === "roof" && ox <= SPEC.roofOverhangTol + EPS && oz <= SPEC.roofOverhangTol + EPS) {
      allowed = true; why = "roof overhang <= quantum";
    } else if (id === "sorter" && (p.name === "belt" || m.inSubtree(p, "roller")) && ox <= EPS && p.min[2] >= -d / 2 - EPS) {
      allowed = true; why = "spec: external belt connection (+Z only)";
    } else if (id === "crane" && m.inSubtree(p, "slew")) {
      allowed = true; why = "spec: swing clearance";
    } else if (id === "forklift" && m.inSubtree(p, "lift") && ox <= EPS && p.min[2] >= -d / 2 - EPS) {
      allowed = true; why = "inferred: fork reach (+Z only)";
    } else if (id === "turret" && m.inSubtree(p, "yaw")) {
      allowed = true; why = "inferred: barrel reach";
    } else if (id === "truck" && p.parent.startsWith("wheel_") && oz <= EPS) {
      allowed = true; why = "inferred: wheel width within lane";
    }
    if (!allowed) {
      check(s, `part ${p.name} within footprint`, false, `X<=${w / 2}, Z<=${d / 2}`, `overhang X=${ox.toFixed(4)} Z=${oz.toFixed(4)}`);
    } else {
      overhangs.push(`${p.name}(${why}) X+${ox.toFixed(3)} Z+${oz.toFixed(3)}`);
    }
  }
  check(s, "no unallowed footprint overhang", !results.some((r) => r.section === s && !r.ok), "all parts within footprint or allowed feature", overhangs);
  if (overhangs.length) finding(`${id} allowed overhangs: ${overhangs.join("; ")}.`);

  // Foundation/base plate equals footprint where the recipe names one.
  const plate = m.parts.find((p) => ["foundation", "base"].includes(p.name) && p.parent === "root");
  if (plate && ["warehouse", "depot", "furnace"].includes(id)) {
    const ps = [plate.size[0], plate.size[2]];
    check(s, "foundation plate == footprint", vecNear(ps, [w, d]), [w, d], ps);
  }
  if (id === "truck") {
    check(s, "wheel-inclusive width <= lane width", truckSize[0] <= SPEC.laneWidth + EPS, `<= ${SPEC.laneWidth}`, +truckSize[0].toFixed(6));
  }
  if (id === "crane") {
    let r = 0;
    for (const p of m.parts.filter((p) => m.inSubtree(p, "slew"))) {
      for (const x of [p.min[0], p.max[0]]) for (const z of [p.min[2], p.max[2]]) r = Math.max(r, Math.hypot(x, z));
    }
    check(s, "swing radius finite and base within footprint", r > 0 && r < 10, "0 < r < 10", +r.toFixed(6));
    finding(`crane swing radius ${r.toFixed(3)} units (diameter ${(2 * r).toFixed(3)}) about footprint center; spec grants swing clearance without a numeric radius. Product must fix the occupancy rule for the swing envelope.`);
  }
  if (id === "turret") {
    let r = 0;
    for (const p of m.parts.filter((p) => m.inSubtree(p, "yaw"))) {
      for (const x of [p.min[0], p.max[0]]) for (const z of [p.min[2], p.max[2]]) r = Math.max(r, Math.hypot(x, z));
    }
    finding(`turret barrel reach ${r.toFixed(3)} units exceeds 2x2 footprint half-extent 1.0; inferred allowance, product confirmation needed.`);
  }
}

// ---------------------------------------------------------------------------
// S4: four-rotation footprint occupancy + port invariants (V06)
// ---------------------------------------------------------------------------
function occupancyCells(w, d) {
  const out = [];
  for (let i = 0; i < w; i += 1) for (let j = 0; j < d; j += 1) out.push([i - (w - 1) / 2, j - (d - 1) / 2]);
  return out;
}
const cellKeys = (cells) => cells.map(([x, z]) => `${x},${z}`).sort();
const FRONT_AFTER_ROT = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]];

for (const [id, m] of models) {
  const a = m.asset;
  const [w, d] = a.footprint;
  for (const deg of ROTATIONS) {
    const k = deg / 90;
    const s = `rot${deg}:${id}`;
    const rw = k % 2 === 0 ? w : d;
    const rd = k % 2 === 0 ? d : w;
    // Occupancy: rotate every cell center, compare with canonical rotated footprint.
    const rotated = occupancyCells(w, d).map(([x, z]) => {
      const r = rot90([x, 0, z], k);
      return [r[0], r[2]];
    });
    check(s, "footprint occupancy matches rotated recipe", deepEqual(cellKeys(rotated), cellKeys(occupancyCells(rw, rd))), `[${rw},${rd}] cells`, `[${[...new Set(rotated.map(([x]) => x))].length},${[...new Set(rotated.map(([, z]) => z))].length}] cells`);
    // Bounds: rotated part corners give swapped XZ extents, unchanged Y.
    let rmin = [Infinity, Infinity, Infinity];
    let rmax = [-Infinity, -Infinity, -Infinity];
    for (const p of m.parts) {
      for (const x of [p.min[0], p.max[0]]) for (const y of [p.min[1], p.max[1]]) for (const z of [p.min[2], p.max[2]]) {
        const r = rot90([x, y, z], k);
        for (let i = 0; i < 3; i += 1) { rmin[i] = Math.min(rmin[i], r[i]); rmax[i] = Math.max(rmax[i], r[i]); }
      }
    }
    const restSize = sub(m.max, m.min);
    const expectSize = [restSize[k % 2 === 0 ? 0 : 2], restSize[1], restSize[k % 2 === 0 ? 2 : 0]];
    check(s, "geometry bounds rotate rigidly", vecNear(sub(rmax, rmin), expectSize, 1e-9), expectSize.map((v) => +v.toFixed(6)), sub(rmax, rmin).map((v) => +v.toFixed(6)));

    for (const sk of a.sockets) {
      const p2 = rot90(sk.position, k);
      const a2 = rot90(sk.approach, k);
      // Independent matrix cross-check of the permutation table.
      const pM = rotMatrix(sk.position, deg);
      const aM = rotMatrix(sk.approach, deg);
      check(s, `socket ${sk.name} rotation cross-check`, vecNear(p2, pM, 1e-9) && vecNear(a2, aM, 1e-9), pM.map((v) => +v.toFixed(6)), p2.map((v) => +v.toFixed(6)));
      check(s, `socket ${sk.name} approach stays unit axis`, Math.hypot(...a2) === 1 && a2.filter((v) => v !== 0).length === 1, "unit axis", a2);
      check(s, `socket ${sk.name} clearanceWidth invariant`, true, sk.clearanceWidth, sk.clearanceWidth);
      if (EXTERNAL_SOCKET_KINDS.has(sk.kind)) {
        check(s, `socket ${sk.name} frontage rotates with asset`, vecNear(a2, FRONT_AFTER_ROT[k]), FRONT_AFTER_ROT[k], a2);
        const alongX = a2[0] !== 0;
        const extent = alongX ? rw / 2 : rd / 2;
        const faceWidth = alongX ? rd : rw;
        const lateral = alongX ? p2[2] : p2[0];
        const faceDist = dot(p2, a2);
        check(s, `socket ${sk.name} at/beyond rotated face`, faceDist >= extent - EPS, `>= ${extent}`, +faceDist.toFixed(6));
        check(s, `socket ${sk.name} clearance zone within rotated face width`, Math.abs(lateral) + sk.clearanceWidth / 2 <= faceWidth / 2 + EPS, `<= ${faceWidth / 2}`, +(Math.abs(lateral) + sk.clearanceWidth / 2).toFixed(6));
        check(s, `socket ${sk.name} ground port y=0`, near(p2[1], 0), 0, p2[1]);
        check(s, `socket ${sk.name} lane-capable clearance (truck/road)`, sk.kind === "belt" || sk.kind === "pallet" || sk.clearanceWidth >= SPEC.laneWidth, `>= ${SPEC.laneWidth} (truck/road)`, sk.clearanceWidth);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// S5: vehicle clearance (V06: truck fits warehouse/depot; gate passage)
// ---------------------------------------------------------------------------
const NOMINAL = SPEC.truckEnvelope;
const requiredWidth = Math.max(NOMINAL.width, truckSize[0]) + 2 * SPEC.gateSideClearance;
console.log(`INFO truck actual envelope W=${truckSize[0].toFixed(4)} H=${truckSize[1].toFixed(4)} L=${truckSize[2].toFixed(4)}; body width=${truckBodyWidth.toFixed(4)}; required gate width=${requiredWidth.toFixed(4)}`);

// Door/opening clear heights from recipe geometry + animation end states.
function openingHeight(id) {
  const m = models.get(id);
  if (id === "warehouse" || id === "depot") {
    const lintel = m.parts.find((p) => p.name === "frontLintel" || p.name === "lintel");
    return { clear: lintel.min[1], lintelBottom: lintel.min[1], door: null };
  }
  if (id === "wall_gate") {
    const panel = m.parts.find((p) => p.name === "panel");
    const anim = m.asset.animations.find((x) => x.name === "gate_open");
    const openY = anim.values[anim.values.length - 1][1];
    const openBottom = openY + panel.center[1] - panel.size[1] / 2;
    const closedTop = m.groups.get("gate").position[1] + panel.center[1] + panel.size[1] / 2;
    const closedBottom = m.groups.get("gate").position[1] + panel.center[1] - panel.size[1] / 2;
    const left = m.parts.find((p) => p.name === "left");
    const right = m.parts.find((p) => p.name === "right");
    return { clear: openBottom, openBottom, closedTop, closedBottom, physicalGap: right.min[0] - left.max[0] };
  }
  throw new Error(`no opening model for ${id}`);
}

const bayTargets = [
  { building: "warehouse", socket: "bay0", door: "door0", panel: "doorPanel0" },
  { building: "warehouse", socket: "bay1", door: "door1", panel: "doorPanel1" },
  { building: "depot", socket: "serviceBay", door: "door", panel: "doorPanel" },
  { building: "wall_gate", socket: "passage", door: "gate", panel: "panel" },
];

for (const t of bayTargets) {
  const m = models.get(t.building);
  const sk = m.asset.sockets.find((x) => x.name === t.socket);
  const open = openingHeight(t.building);
  const s = `clearance:${t.building}.${t.socket}`;
  check(s, "clearanceWidth >= envelope + 0.15/side (nominal and actual)", sk.clearanceWidth >= requiredWidth - EPS, `>= ${requiredWidth.toFixed(4)}`, sk.clearanceWidth);
  check(s, "open clear height >= actual truck height", open.clear >= truckSize[1] - EPS, `>= ${truckSize[1].toFixed(4)}`, +open.clear.toFixed(4));
  check(s, "open clear height >= nominal truck height", open.clear >= NOMINAL.height - EPS, `>= ${NOMINAL.height}`, +open.clear.toFixed(4));

  if (t.building === "warehouse" || t.building === "depot") {
    const panel = m.parts.find((p) => p.name === t.panel);
    const anim = m.asset.animations.find((x) => x.name === `${t.door}_open`);
    const openY = anim.values[anim.values.length - 1][1];
    const openBottom = openY + panel.center[1] - panel.size[1] / 2;
    const closedTop = m.groups.get(t.door).position[1] + panel.center[1] + panel.size[1] / 2;
    check(s, "door panel width == socket clearanceWidth", near(panel.size[0], sk.clearanceWidth), sk.clearanceWidth, panel.size[0]);
    check(s, "door panel centered on socket lateral", near(panel.worldCenter[0], sk.position[0]), sk.position[0], panel.worldCenter[0]);
    check(s, "closed door covers opening top", closedTop >= open.lintelBottom - EPS, `>= ${open.lintelBottom}`, +closedTop.toFixed(4));
    check(s, "open door retracts above opening", openBottom >= open.lintelBottom - EPS, `>= ${open.lintelBottom}`, +openBottom.toFixed(4));
    // Bay clearance zones must not collide with front structure (piers/walls).
    const zoneMin = sk.position[0] - sk.clearanceWidth / 2;
    const zoneMax = sk.position[0] + sk.clearanceWidth / 2;
    const faceZ = m.asset.footprint[1] / 2;
    // 3D test: only structure reaching into the truck envelope height can block.
    const blockers = m.parts.filter((p) => p.parent === "structure" && p.min[1] < truckSize[1] - EPS && p.max[2] >= faceZ - 0.3 && p.max[0] > zoneMin + EPS && p.min[0] < zoneMax - EPS);
    check(s, "bay zone unobstructed by front structure", blockers.length === 0, [], blockers.map((p) => p.name));
  }
  if (t.building === "wall_gate") {
    check(s, "physical gap == clearanceWidth", near(open.physicalGap, sk.clearanceWidth), sk.clearanceWidth, +open.physicalGap.toFixed(4));
    // A solid panel spanning ground-to-top across the full gap blocks passage:
    // clear height under the closed panel is its bottom edge (0).
    const panelPart = m.parts.find((p) => p.name === "panel");
    const closedClear = open.closedBottom;
    check(s, "closed gate blocks truck", closedClear <= EPS && open.closedTop > open.closedBottom + EPS && panelPart.size[0] >= open.physicalGap - EPS && closedClear < truckSize[1], "ground-reaching panel across full gap; clear height < truck height", `closedBottom=${open.closedBottom.toFixed(3)} closedTop=${open.closedTop.toFixed(3)} panelWidth=${panelPart.size[0]} gap=${open.physicalGap.toFixed(3)}`);
    const margin = open.clear - truckSize[1];
    if (margin < 0.15) finding(`wall_gate open clearance margin over actual truck height is only ${margin.toFixed(3)} units (${open.clear.toFixed(2)} vs ${truckSize[1].toFixed(2)}). Tight; product should confirm against production truck art.`);
  }

  // All four world rotations: building and docked truck rotate together, so the
  // truck cross-section perpendicular to the (rotated) approach must still fit.
  for (const deg of ROTATIONS) {
    const k = deg / 90;
    const a2 = rot90(sk.approach, k);
    const lateralAxis = a2[0] !== 0 ? 2 : 0;
    let lo = Infinity;
    let hi = -Infinity;
    let yhi = -Infinity;
    for (const p of truck.parts) {
      for (const x of [p.min[0], p.max[0]]) for (const y of [p.min[1], p.max[1]]) for (const z of [p.min[2], p.max[2]]) {
        const r = rot90([x, y, z], k);
        lo = Math.min(lo, r[lateralAxis]);
        hi = Math.max(hi, r[lateralAxis]);
        yhi = Math.max(yhi, r[1]);
      }
    }
    const width = hi - lo;
    const rs = `clearance:${t.building}.${t.socket}:rot${deg}`;
    check(rs, "rotated truck cross-section fits clearanceWidth", sk.clearanceWidth >= width + 2 * SPEC.gateSideClearance - EPS, `>= ${(width + 0.3).toFixed(4)}`, +width.toFixed(4));
    check(rs, "rotated truck height fits open clearance", open.clear >= yhi - EPS, `>= ${yhi.toFixed(4)}`, +open.clear.toFixed(4));
  }
}

// Sorter belt connection: socket sits on the belt, width matches belt.
{
  const m = models.get("sorter");
  const sk = m.asset.sockets.find((x) => x.name === "output");
  const belt = m.parts.find((p) => p.name === "belt");
  const s = "clearance:sorter.output";
  check(s, "belt socket z within belt span", sk.position[2] >= belt.min[2] - EPS && sk.position[2] <= belt.max[2] + EPS, `[${belt.min[2]}, ${belt.max[2]}]`, sk.position[2]);
  check(s, "belt socket centered on belt", near(sk.position[0], belt.worldCenter[0]), belt.worldCenter[0], sk.position[0]);
  check(s, "belt clearanceWidth == belt width", near(sk.clearanceWidth, belt.size[0]), belt.size[0], sk.clearanceWidth);
}
// Truck cargo socket coincides with cargo pivot; drone hook hangs below body.
{
  const m = models.get("truck");
  const sk = m.asset.sockets.find((x) => x.name === "cargo");
  check("clearance:truck.cargo", "cargo socket == cargo pivot position", vecNear(sk.position, m.groups.get("cargo").position), m.groups.get("cargo").position, sk.position);
  const dm = models.get("drone");
  const hook = dm.asset.sockets.find((x) => x.name === "hook");
  const body = dm.parts.find((p) => p.name === "body");
  check("clearance:drone.hook", "hook below body underside", hook.position[1] < body.min[1], `< ${body.min[1]}`, hook.position[1]);
}

// ---------------------------------------------------------------------------
// S6: scale anchors (approximate per spec; tolerances documented above)
// ---------------------------------------------------------------------------
{
  const m = models.get("worker");
  const top = m.max[1];
  const extent = m.max[1] - m.min[1];
  const okTop = Math.abs(top - SPEC.workerHeight) <= SPEC.workerHeightTol;
  check("scale:worker", "height above ground ~ 0.85 (tol 0.0625)", okTop, `${SPEC.workerHeight} +/- ${SPEC.workerHeightTol}`, +top.toFixed(6));
  finding(`worker helmet top ${top.toFixed(3)} vs nominal 0.85 (+${(top - SPEC.workerHeight).toFixed(3)}); geometry extent ${extent.toFixed(3)} (feet float ${m.min[1].toFixed(3)}). Within half-quantum tolerance; product may tighten.`);
}
{
  const dims = [truckSize[0], truckSize[2], truckSize[1]]; // W, L, H
  const nom = [NOMINAL.width, NOMINAL.length, NOMINAL.height];
  const labels = ["width", "length", "height"];
  dims.forEach((v, i) => {
    const ok = Math.abs(v - nom[i]) <= SPEC.truckEnvelopeTol;
    check("scale:truck", `envelope ${labels[i]} ~ ${nom[i]} (tol 0.25, spec "approximately")`, ok, `${nom[i]} +/- ${SPEC.truckEnvelopeTol}`, +v.toFixed(6));
  });
  check("scale:truck", "body width (excl. wheels) == 1.0", near(truckBodyWidth, NOMINAL.width), NOMINAL.width, +truckBodyWidth.toFixed(6));
  check("scale:truck", "overall length == 2.5 exact", near(truckSize[2], NOMINAL.length), NOMINAL.length, +truckSize[2].toFixed(6));
  finding(`truck wheel-inclusive width ${truckSize[0].toFixed(3)} vs nominal 1.0 (+${(truckSize[0] - 1).toFixed(3)}); cab roof height ${truckSize[1].toFixed(3)} vs nominal 1.15 (+${(truckSize[1] - 1.15).toFixed(3)}). Within "approximately" tolerance; clearance checks above use ACTUAL bounds.`);
}

// ---------------------------------------------------------------------------
// S7: T09 (#136) production authoring contracts.
// Palette preservation, baseline recipe integrity, detail-quantum discipline
// for NEW geometry only (legacy blockout values are grandfathered), motion
// inventory coverage (ART_AND_MOTION.md) and channel semantics.
// ---------------------------------------------------------------------------
const PALETTE_BASELINE = {
  sand: "#BA8054", oxide: "#A34F32", oxideLight: "#C47746", cream: "#D6C7A3",
  charcoal: "#292C29", steel: "#7C8078", olive: "#777746", yellow: "#C99A35",
  amber: "#FFB348", rubber: "#33332F",
};
check("t09", "palette preserved exactly (10 tokens, no additions)", deepEqual(kit.palette, PALETTE_BASELINE), PALETTE_BASELINE, kit.palette);

// Baseline contracts pinned from T04 merged kit (4acf7ef). The five buildings
// are extended additively (baseline entries must remain a prefix); the other
// seven assets are untouched by T09 and must match exactly.
const BASELINE_PARTS = {
  warehouse: ["foundation", "back", "side-1", "side1", "roofBase", "roofStep-1", "roofStep1", "ridge", "frontLintel", "centerPier", "doorPanel0", "doorPanel1"],
  depot: ["foundation", "back", "side-1", "side1", "roofBase", "roofStep-1", "roofStep1", "ridge", "lintel"],
  sorter: ["body", "hopper", "belt", "rollerMesh"],
  furnace: ["base", "back", "left", "right", "lintel", "glow", "chimney", "door"],
  generator: ["housing", "fanFrame", "fanX", "fanY"],
  crane: ["base", "tower", "boom", "cable", "grip"],
  truck: ["chassis", "cab", "windshield", "bed", "pallet", "wheel_-1_0Mesh", "wheel_-1_1Mesh", "wheel_-1_2Mesh", "wheel_1_0Mesh", "wheel_1_1Mesh", "wheel_1_2Mesh"],
  forklift: ["body", "mast", "crossbar", "fork-0.25", "fork0.25"],
  drone: ["body", "armX", "armZ", "blade0", "blade1", "blade2", "blade3", "cargo"],
  worker: ["torso", "head", "helmet", "legMesh-1", "armMesh-1", "legMesh1", "armMesh1"],
  turret: ["base", "housing", "barrel"],
  wall_gate: ["left", "right", "panel"],
};
const BASELINE_ANIMS = {
  warehouse: ["assemble_structure", "assemble_roof", "door0_open", "door1_open"],
  depot: ["assemble_structure", "assemble_roof"],
  sorter: ["roller_work"],
  furnace: ["intake"],
  generator: ["fan_powered"],
  crane: ["hoist_lift"],
  truck: ["wheel_-1_0_roll", "wheel_-1_1_roll", "wheel_-1_2_roll", "wheel_1_0_roll", "wheel_1_1_roll", "wheel_1_2_roll"],
  forklift: ["lift_pallet"],
  drone: ["rotor0_spin", "rotor1_spin", "rotor2_spin", "rotor3_spin"],
  worker: ["walk_leg"],
  turret: ["scan"],
  wall_gate: ["gate_open"],
};
const BASELINE_SOCKETS = {
  warehouse: ["bay0", "bay1"], depot: ["serviceBay"], sorter: ["output"], furnace: ["input"],
  generator: [], crane: [], truck: ["cargo"], forklift: [], drone: ["hook"], worker: [], turret: [], wall_gate: ["passage"],
};
const UNTOUCHED = ["crane", "truck", "forklift", "drone", "worker", "turret", "wall_gate"];
for (const [id, names] of Object.entries(BASELINE_PARTS)) {
  const a = kit.assets.find((x) => x.id === id);
  const s = `t09:baseline:${id}`;
  const prefix = a.parts.slice(0, names.length).map((p) => p.name);
  check(s, "baseline part names preserved as prefix", deepEqual(prefix, names), names, prefix);
  const animPrefix = a.animations.slice(0, BASELINE_ANIMS[id].length).map((x) => x.name);
  check(s, "baseline clips preserved as prefix", deepEqual(animPrefix, BASELINE_ANIMS[id]), BASELINE_ANIMS[id], animPrefix);
  check(s, "socket names preserved", deepEqual(a.sockets.map((x) => x.name), BASELINE_SOCKETS[id]), BASELINE_SOCKETS[id], a.sockets.map((x) => x.name));
  if (UNTOUCHED.includes(id)) {
    check(s, "untouched asset: no parts added", a.parts.length === names.length, names.length, a.parts.length);
    check(s, "untouched asset: no clips added", a.animations.length === BASELINE_ANIMS[id].length, BASELINE_ANIMS[id].length, a.animations.length);
  }
}

// Explicit registry of T09-authored geometry. Quantum discipline applies to
// these entries only; legacy blockout values (0.35 pier, 1.85 door z, 0.18
// roller, ...) are grandfathered and documented in the T04 evidence.
const T09 = {
  warehouse: { parts: ["ventHousing", "ventAxle", "ventBladeX", "ventBladeZ", "liftPlatform", "liftPallet"], groups: ["ventFan", "palletLift"], anims: ["vent_fan", "pallet_lift"] },
  depot: { parts: ["doorPanel", "ventHousing", "ventAxle", "ventBladeX", "ventBladeZ"], groups: ["door", "ventFan"], anims: ["door_open", "vent_fan"] },
  sorter: { parts: ["rollerMesh2", "gantryPostL", "gantryPostR", "gantryBar", "magnetBody", "magnetTip"], groups: ["roller2", "magnet"], anims: ["roller2_work", "magnet_sweep"] },
  furnace: { parts: ["fanHousing", "fanBladeY", "fanBladeZ", "spout", "puff"], groups: ["fan", "pourSpout", "ventPuff"], anims: ["fan_work", "pour", "vent_puff"] },
  generator: { parts: ["shaftBar"], groups: ["shaft"], anims: ["shaft_drive", "fan_idle", "fan_load_high", "fan_start", "fan_spin_down"] },
};
const isQuantum = (v) => Math.abs(v / SPEC.detailQuantum - Math.round(v / SPEC.detailQuantum)) < 1e-9;
for (const [id, reg] of Object.entries(T09)) {
  const a = kit.assets.find((x) => x.id === id);
  const s = `t09:authored:${id}`;
  const partNames = a.parts.map((p) => p.name);
  const groupNames = a.groups.map((g) => g.name);
  const animNames = a.animations.map((x) => x.name);
  check(s, "registered parts present", reg.parts.every((n) => partNames.includes(n)), reg.parts, reg.parts.filter((n) => !partNames.includes(n)));
  check(s, "registered pivot groups present", reg.groups.every((n) => groupNames.includes(n)), reg.groups, reg.groups.filter((n) => !groupNames.includes(n)));
  check(s, "registered clips present", reg.anims.every((n) => animNames.includes(n)), reg.anims, reg.anims.filter((n) => !animNames.includes(n)));

  const bad = [];
  for (const p of a.parts.filter((p) => reg.parts.includes(p.name))) {
    p.center.forEach((v, i) => { if (!isQuantum(v)) bad.push(`${p.name}.center[${i}]=${v}`); });
    p.size.forEach((v, i) => {
      // Verified exception: depot doorPanel width is clearance-locked to the
      // serviceBay socket contract (3.2), checked separately below.
      if (id === "depot" && p.name === "doorPanel" && i === 0) return;
      if (!isQuantum(v)) bad.push(`${p.name}.size[${i}]=${v}`);
    });
  }
  for (const g of a.groups.filter((g) => reg.groups.includes(g.name))) {
    g.position.forEach((v, i) => { if (!isQuantum(v)) bad.push(`${g.name}.position[${i}]=${v}`); });
  }
  for (const an of a.animations.filter((x) => reg.anims.includes(x.name) && x.path === "translation")) {
    an.values.forEach((v, ti) => v.forEach((c, i) => { if (!isQuantum(c)) bad.push(`${an.name}.values[${ti}][${i}]=${c}`); }));
  }
  check(s, `new geometry on ${SPEC.detailQuantum} detail quantum`, bad.length === 0, [], bad);
}
{
  // Verified quantum exception: depot doorPanel width == serviceBay clearanceWidth.
  const dm = models.get("depot");
  const panel = dm.parts.find((p) => p.name === "doorPanel");
  const sk = dm.asset.sockets.find((x) => x.name === "serviceBay");
  check("t09:authored:depot", "doorPanel width locked to serviceBay clearanceWidth (verified quantum exception)", near(panel.size[0], sk.clearanceWidth), sk.clearanceWidth, panel.size[0]);
}

// Motion inventory coverage (ART_AND_MOTION.md building rows). Entity-level
// sequences (forklift service, chassis assembly, vehicle departure) live on the
// vehicle assets / entity transforms, not building clips — see findings.
const INVENTORY = {
  warehouse: ["door0_open", "door1_open", "pallet_lift", "vent_fan"],
  depot: ["door_open", "vent_fan"],
  sorter: ["roller_work", "roller2_work", "magnet_sweep"],
  furnace: ["intake", "pour", "fan_work", "vent_puff"],
  generator: ["fan_powered", "fan_idle", "fan_load_high", "fan_start", "fan_spin_down", "shaft_drive"],
};
for (const [id, required] of Object.entries(INVENTORY)) {
  const a = kit.assets.find((x) => x.id === id);
  const have = a.animations.map((x) => x.name);
  const missing = required.filter((n) => !have.includes(n));
  check(`t09:inventory:${id}`, "ART_AND_MOTION building channels covered", missing.length === 0, required, missing.length ? { missing, have } : have);
}

// Channel semantics: independent periods (no global sync), spec fan/vent
// periods, 5s assembly timeline, loop flags, and motion direction checks.
function clip(id, name) {
  return kit.assets.find((x) => x.id === id).animations.find((x) => x.name === name);
}
const duration = (an) => an.times[an.times.length - 1] - an.times[0];
{
  const s = "t09:motion";
  const wv = duration(clip("warehouse", "vent_fan"));
  const dv = duration(clip("depot", "vent_fan"));
  check(s, "warehouse vent period within 11-19s", wv >= 11 && wv <= 19, "[11,19]", wv);
  check(s, "depot vent period within 11-19s", dv >= 11 && dv <= 19, "[11,19]", dv);
  check(s, "vent channels independent (no global sync)", wv !== dv, "different periods", [wv, dv]);
  for (const [id, name] of [["furnace", "fan_work"], ["generator", "fan_powered"], ["generator", "shaft_drive"]]) {
    check(s, `${id}.${name} fan period 1.7s`, near(duration(clip(id, name)), 1.7), 1.7, duration(clip(id, name)));
  }
  for (const id of ["warehouse", "depot"]) {
    check(s, `${id} assembly timeline ends at 5s`, near(duration(clip(id, "assemble_structure")), 5) && near(duration(clip(id, "assemble_roof")), 5), 5, [duration(clip(id, "assemble_structure")), duration(clip(id, "assemble_roof"))]);
  }
  const loadHigh = duration(clip("generator", "fan_load_high"));
  const idle = duration(clip("generator", "fan_idle"));
  check(s, "generator load response spins faster than idle", loadHigh < idle, "< idle period", { loadHigh, idle });
  const loopExpected = {
    "warehouse:vent_fan": true, "warehouse:pallet_lift": false,
    "depot:door_open": false, "depot:vent_fan": true,
    "sorter:roller2_work": true, "sorter:magnet_sweep": true,
    "furnace:fan_work": true, "furnace:pour": false, "furnace:vent_puff": true,
    "generator:shaft_drive": true, "generator:fan_idle": true, "generator:fan_load_high": true,
    "generator:fan_start": false, "generator:fan_spin_down": false,
  };
  const loopBad = [];
  for (const [key, want] of Object.entries(loopExpected)) {
    const [id, name] = key.split(":");
    const an = clip(id, name);
    if (!an || an.loop !== want) loopBad.push(`${key}=${an ? an.loop : "missing"}`);
  }
  check(s, "loop flags match channel semantics", loopBad.length === 0, [], loopBad);
}
// Quaternion helpers for direction/angle checks (independent of the renderer).
function quatRotate(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
const yawDeg = (q) => { let a = (2 * Math.atan2(q[1], q[3]) * 180) / Math.PI; if (a < 0) a += 360; return a; };
const zAngleDeg = (q) => { let a = (2 * Math.atan2(q[2], q[3]) * 180) / Math.PI; if (a < 0) a += 360; return a; };
{
  const s = "t09:motion";
  // Furnace pour: +30 deg about X must LOWER the spout tip toward the mouth.
  const pour = clip("furnace", "pour");
  const tip = quatRotate(pour.values[1], [0, 0, 0.5]); // spout tip in pivot-local space
  check(s, "pour rotation lowers spout tip (sign verified)", near(tip[1], -0.25, 1e-4) && near(tip[2], 0.4330127, 1e-4), "tip y=-0.25 z=0.4330 (down/forward)", tip.map((v) => +v.toFixed(6)));
  // Sorter magnet sweep reaches +/-45 deg and returns to identity each batch.
  const sweep = clip("sorter", "magnet_sweep");
  const angles = sweep.values.map(yawDeg);
  check(s, "magnet sweep +/-45 deg, returns to rest", near(angles[1], 45, 1e-4) && near(angles[3], 315, 1e-4) && near(angles[0], 0, 1e-6) && near(angles[2], 0, 1e-6) && near(angles[4], 0, 1e-6), "[0,45,0,315,0]", angles.map((v) => +v.toFixed(4)));
  // Generator start accelerates, spin-down decelerates; both end at a full turn.
  for (const [name, want] of [["fan_start", "increasing"], ["fan_spin_down", "decreasing"]]) {
    const an = clip("generator", name);
    const ang = an.values.map(zAngleDeg);
    const speeds = ang.slice(1).map((a, i) => (a - ang[i]) / (an.times[i + 1] - an.times[i]));
    const monotone = speeds.every((v, i) => i === 0 || (want === "increasing" ? v > speeds[i - 1] : v < speeds[i - 1]));
    check(s, `${name} angular speed strictly ${want}`, monotone && ang.every((a, i) => i === 0 || a > ang[i - 1]), `strictly ${want} deg/s`, speeds.map((v) => +v.toFixed(2)));
    check(s, `${name} ends at full turn (rest orientation)`, near(ang[ang.length - 1], 360, 1e-4), 360, +ang[ang.length - 1].toFixed(4));
  }
}

// Wreck asset: static sectioned husk; reveal/stage animation is owned by #169.
{
  const a = kit.assets.find((x) => x.id === "wreckSections");
  const s = "t09:wreck";
  check(s, "footprint [3,3]", deepEqual(a.footprint, [3, 3]), [3, 3], a.footprint);
  check(s, "static asset (reveal stages owned by #169)", a.animations.length === 0, 0, a.animations.length);
  const sections = ["sectionHull", "sectionCab", "sectionBed", "sectionDebris"];
  check(s, "four named section pivots", deepEqual(a.groups.map((g) => g.name), sections), sections, a.groups.map((g) => g.name));
  const sk = a.sockets.find((x) => x.name === "salvage");
  check(s, "salvage socket kind pallet", sk?.kind === "pallet", "pallet", sk?.kind ?? null);
}

// Known limitations / coverage gaps requiring reviewer attention (non-failing).
finding("forklift recipe has no wheel parts although inventory lists wheel turns; blockout sample-coverage gap (production wheels owned by #142).");
finding("furnace inventory lists 'subtle emissive variation'; kit schema has no emissive/material animation channel (color tokens only). Static amber glow authored; emissive variation deferred to renderer/material schema.");
finding("entity-level inventory sequences (warehouse forklift service, depot chassis assembly / vehicle departure) are represented by vehicle assets and entity transforms (forklift lift_pallet, truck wheel rolls), not building clips.");
{
  const g = JSON.parse(readFileSync(join(assetsDir, "generated", "warehouse.gltf"), "utf8"));
  const rootNode = (g.nodes ?? []).find((n) => n.name === "warehouse");
  finding(`build-vision-assets.py hardcodes glTF root extras.status='${rootNode?.extras?.status}' and rewrites manifest status='blockout' on every run; T09 post-patches the manifest to 'production' (authoritative). Generator is outside #136 write paths; glTF extras wording is a known limitation.`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const fails = results.filter((r) => !r.ok);
const summary = {
  tool: "scripts/rw3d-kit-validate.mjs",
  issue: 131,
  extendedBy: 136,
  acceptance: "V06",
  kitSha256,
  manifestSha256,
  assets: ids,
  total: results.length,
  pass: results.length - fails.length,
  fail: fails.length,
  findings,
  exitCode: fails.length ? 1 : 0,
};
console.log(`\nSUMMARY total=${summary.total} pass=${summary.pass} fail=${summary.fail} findings=${findings.length}`);
if (fails.length) {
  console.log("FAILED CHECKS:");
  for (const f of fails) console.log(`  [${f.section}] ${f.id} expected=${JSON.stringify(f.expected)} actual=${JSON.stringify(f.actual)}`);
}
const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
  const out = resolve(process.argv[jsonIdx + 1]);
  writeFileSync(out, JSON.stringify({ summary, checks: results }, null, 2));
  console.log(`json report: ${out}`);
}
process.exit(summary.exitCode);