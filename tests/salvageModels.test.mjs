// ART-02 (#348): load-bearing validation of the rebuilt salvage trio structures —
// Scrap Extractor (salvager) and Crusher + screening plant (crusher). The trio's
// "sorter" outcome is the crusher's oscillating screen deck + twin discharge chutes:
// V2's content registry has no standalone buildable sorter (that would require
// src/content.js + src/simulation.js, outside the ART-02 lease), and the crusher's
// real simulation outputs {iron:6, stone:2} ARE mechanical separation.
//
// These tests measure the REAL procedural geometry in src/world.js and the pure
// shared pose function art02Pose (the tested pose is the rendered pose — update()
// calls the same function). They FAIL on main's pre-ART-02 world.js (rollback
// injection proof): art02Pose does not exist there, the crusher has no pivots and
// the salvager silhouette is the old generic box.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import {WORLD_SIZE} from "../src/content.js";
import {machineDescriptor, MATERIALS, PERFORMANCE_LIMITS, SCALE_REFERENCES} from "../src/voxelSchema.js";

globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding, art02Pose, ART02_MOTION} = await import("../src/world.js");

const TOL = 0.02;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL, msg + ": " + a + " vs " + b);
const build = (type, remaining = 0) => {
  const group = makeBuilding({id: 99, type, x: WORLD_SIZE / 2 - 0.5, z: WORLD_SIZE / 2 - 0.5, remaining}, 0).group;
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  return group;
};
function staticBox(group) {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  group.traverse((node) => {
    if (!node.isMesh || node.name === "pick:volume") return;
    for (let p = node.parent; p; p = p.parent) if (p.name?.startsWith("pivot:")) return;
    box.expandByObject(node);
  });
  return box;
}
const meshesOf = (group) => {
  const out = [];
  group.traverse(n => {if (n.isMesh && n.name !== "pick:volume" && n.material.visible) out.push(n);});
  return out;
};
const hexOf = m => new THREE.Color(MATERIALS[m].color).getHex();
const isBox = n => n.geometry.type === "BoxGeometry";
const isCyl = n => n.geometry.type === "CylinderGeometry";

// ---- Pure motion contract (shared by update() and these tests) ----

test("ART-02 pose: counter-rotating rollers, periodic rocker/screen, reduced-motion parks at zero", () => {
  const p = art02Pose(1.234, false, 7);
  near(p.rollerA, 1.234 * ART02_MOTION.rollSpeed, "rollerA angle");
  near(p.rollerB, -p.rollerA, "rollers must counter-rotate");
  near(p.rocker, Math.sin(1.234 * ART02_MOTION.rockerSpeed + 7) * ART02_MOTION.rockerAmp, "rocker angle");
  near(p.screen, Math.sin(1.234 * ART02_MOTION.screenSpeed + 7) * ART02_MOTION.screenAmp, "screen angle");
  assert.ok(Math.abs(p.rocker) <= ART02_MOTION.rockerAmp + 1e-9, "rocker amplitude bound");
  assert.ok(Math.abs(p.screen) <= ART02_MOTION.screenAmp + 1e-9, "screen amplitude bound");
  // Exact periodicity of the oscillating channels; rollers advance linearly.
  const t = 2.7, pr = 2 * Math.PI / ART02_MOTION.rockerSpeed, ps = 2 * Math.PI / ART02_MOTION.screenSpeed;
  near(art02Pose(t + pr, false, 7).rocker, art02Pose(t, false, 7).rocker, "rocker period");
  near(art02Pose(t + ps, false, 7).screen, art02Pose(t, false, 7).screen, "screen period");
  near(art02Pose(t + 1, false, 7).rollerA - art02Pose(t, false, 7).rollerA, ART02_MOTION.rollSpeed, "roller speed");
  const parked = art02Pose(9.9, true, 7);
  assert.deepEqual(parked, {rocker: 0, rollerA: 0, rollerB: 0, screen: 0}, "reduced motion must park every ART-02 part");
  // t=0 rest pose (=== tolerates -0 from the negated roller channel).
  for (const v of Object.values(art02Pose(0, false, 0))) assert.ok(v === 0, "t=0 rest pose must be zero");
});

test("schema pivot declarations mirror ART02_MOTION exactly (no declaration drift)", () => {
  const rocker = machineDescriptor("salvager").pivots[0];
  assert.equal(rocker.motion.kind, "oscillate");
  assert.equal(rocker.motion.amplitude, ART02_MOTION.rockerAmp);
  assert.equal(rocker.motion.speed, ART02_MOTION.rockerSpeed);
  const [ra, rb, scr] = machineDescriptor("crusher").pivots;
  assert.equal(ra.motion.kind, "spin");
  assert.equal(ra.motion.speed, ART02_MOTION.rollSpeed);
  assert.equal(rb.motion.speed, -ART02_MOTION.rollSpeed);
  assert.equal(scr.motion.kind, "oscillate");
  assert.equal(scr.motion.amplitude, ART02_MOTION.screenAmp);
  assert.equal(scr.motion.speed, ART02_MOTION.screenSpeed);
  for (const pv of [ra, rb, scr]) assert.equal(pv.axis, "x", "crusher working parts rotate/shake about X");
  // update() must consume the SAME pure pose (source coupling guard, crane pattern).
  const src = fs.readFileSync("src/world.js", "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("art02Pose(time,this.reducedMotion,id)"), "update() must call the shared pure pose");
  for (const stamp of ["cd.art02Arm", "cd.art02Roller", "cd.art02Screen", "cd.art02Reduced"])
    assert.ok(src.includes(stamp), "missing observability stamp " + stamp);
});

// ---- Salvager (Scrap Extractor) structure ----

test("salvager: distinct body/roof/side silhouette — stepped roof, glazed cab, stack, fins, intake+chute", () => {
  const g = build("salvager"), desc = machineDescriptor("salvager");
  const size = staticBox(g).getSize(new THREE.Vector3());
  near(size.x, desc.bounds.width, "salvager width");
  near(size.y, 2.74, "salvager static height (exhaust stack cap)");
  near(size.z, desc.bounds.depth, "salvager depth");
  assert.ok(size.y > 2.5, "extractor must read taller than the old 2.285 generic box");
  const meshes = meshesOf(g);
  // Glazed operator cab (glass is unique to the salvager among the trio).
  assert.ok(meshes.some(m => m.material.color.getHex() === hexOf("glass")), "missing cab glass");
  // Exhaust stack: two registered cylinders rising above the roof line.
  const stack = meshes.filter(m => isCyl(m) && m.position.y > 2);
  assert.equal(stack.length, 2, "stack + cap cylinders");
  // Side radiator fins: three dark slats on the -X side.
  const fins = meshes.filter(m => isBox(m) && m.position.x < -1.3 && m.material.color.getHex() === hexOf("dark"));
  assert.equal(fins.length, 3, "radiator fins");
  // Front intake mouth + discharge chute both on +Z frontage.
  assert.ok(meshes.some(m => isBox(m) && m.material.color.getHex() === hexOf("black") && m.position.z > 1.3), "intake mouth");
  assert.ok(meshes.some(m => isBox(m) && m.position.x > 0.5 && m.position.z > 1.2 && m.material.color.getHex() === hexOf("steel")), "discharge chute");
  // Rear counterweight behind the hull.
  assert.ok(meshes.some(m => isBox(m) && m.position.z < -1.2 && m.material.color.getHex() === hexOf("dark")), "counterweight");
});

test("salvager: rocker pivot keeps the ART-01 contract and gains a 3-tooth grapple head", () => {
  const g = build("salvager");
  const arm = g.getObjectByName("pivot:rocker");
  assert.ok(arm, "pivot:rocker missing");
  assert.deepEqual([...arm.position], [0, 2.4, -0.2], "rocker offset unchanged");
  const teeth = arm.children.filter(m => m.isMesh && isBox(m) && m.material.color.getHex() === hexOf("orange") && Math.abs(m.scale.y - 0.28) < 1e-6);
  assert.equal(teeth.length, 3, "grapple teeth");
  const pv = machineDescriptor("salvager").pivots[0];
  // Animated reach stays inside the declared swingRadius (head + teeth at z -2.5).
  arm.updateWorldMatrix(true, true);
  const full = new THREE.Box3().setFromObject(arm);
  const reach = Math.max(Math.abs(full.min.z - arm.position.z), Math.abs(full.max.z - arm.position.z),
    Math.abs(full.min.x), Math.abs(full.max.x));
  assert.ok(reach <= pv.swingRadius + TOL, "rocker reach " + reach + " exceeds swingRadius");
  // Tallest animated pose still inside the declared pick height.
  assert.ok(full.max.y <= machineDescriptor("salvager").pick.size[1] + TOL, "arm exceeds pick height");
});

// ---- Crusher + screening plant structure ----

test("crusher: open chamber, stepped hopper roof, twin discharge chutes, ladder and flywheel", () => {
  const g = build("crusher"), desc = machineDescriptor("crusher");
  const size = staticBox(g).getSize(new THREE.Vector3());
  near(size.x, desc.bounds.width, "crusher width");
  near(size.y, 2.51, "crusher static height (hopper rails)");
  near(size.z, desc.bounds.depth, "crusher depth");
  const meshes = meshesOf(g);
  // Stepped hopper: three stacked mouth sections narrowing downward.
  const hopper = meshes.filter(m => isBox(m) && m.position.y > 1.7 && m.position.y < 2.4 && Math.abs(m.position.z + 0.15) < 1e-6);
  assert.equal(hopper.length, 3, "hopper throat/mid/flare");
  assert.ok(hopper[0].scale.x !== hopper[2].scale.x, "hopper must step, not be one box");
  // Twin discharge chutes side by side on the +Z frontage (ferrous + aggregate).
  const chutes = meshes.filter(m => isBox(m) && Math.abs(Math.abs(m.position.x) - 0.85) < 1e-6 && Math.abs(m.position.z - 1.28) < 1e-6);
  assert.equal(chutes.length, 4, "two chutes + two rims");
  const rims = chutes.filter(m => m.position.y > 1);
  assert.equal(new Set(rims.map(m => m.material.color.getHex())).size, 2, "chute rims must differ (separate streams)");
  // Side ladder on +X.
  assert.equal(meshes.filter(m => isBox(m) && m.position.x > 1.25 && m.material.color.getHex() === hexOf("steel")).length, 5, "ladder rails+rungs");
});

test("crusher: three named working pivots — counter-rotating toothed rollers + oscillating screen deck", () => {
  const g = build("crusher");
  const ra = g.getObjectByName("pivot:rollerA"), rb = g.getObjectByName("pivot:rollerB"), scr = g.getObjectByName("pivot:screen");
  assert.ok(ra && rb && scr, "named pivots missing");
  assert.deepEqual([...ra.position], [0, 1.35, 0.42]);
  assert.deepEqual([...rb.position], [0, 1.35, -0.18]);
  assert.deepEqual([...scr.position], [0, 0.95, 0.95]);
  for (const r of [ra, rb]) {
    assert.ok(r.children.some(m => isCyl(m) && m.material.color.getHex() === hexOf("steel")), "roller shaft");
    assert.equal(r.children.filter(m => isBox(m) && m.material.color.getHex() === hexOf("steel")).length, 4, "roller teeth");
  }
  // Drive flywheel belongs to rollerA only, on the rotation axis so it spins in place.
  const fly = ra.children.find(m => isCyl(m) && m.material.color.getHex() === hexOf("dark"));
  assert.ok(fly, "flywheel missing");
  near(fly.position.x, -1.32, "flywheel x");
  near(fly.position.y, 0, "flywheel on axis");
  near(fly.position.z, 0, "flywheel on axis");
  assert.ok(!rb.children.some(m => isCyl(m) && m.material.color.getHex() === hexOf("dark")), "rollerB has no flywheel");
  // Screen deck: frame + 5 mesh bars.
  assert.equal(scr.children.filter(m => isBox(m) && m.material.color.getHex() === hexOf("dark")).length, 5, "screen mesh bars");
  assert.equal(scr.children.filter(m => isBox(m) && m.material.color.getHex() === hexOf("steel")).length, 1, "screen frame");
  // Animated reach inside declared swingRadius (flywheel is the widest rollerA pose).
  ra.updateWorldMatrix(true, true);
  const reach = Math.max(Math.abs(new THREE.Box3().setFromObject(ra).min.x), Math.abs(new THREE.Box3().setFromObject(ra).max.x));
  assert.ok(reach <= machineDescriptor("crusher").pivots[0].swingRadius + TOL, "rollerA reach");
  // Every pivot part uses a registered shared material.
  const legal = new Set(Object.values(MATERIALS).map(m => new THREE.Color(m.color).getHex()));
  for (const pv of [ra, rb, scr]) pv.traverse(m => {if (m.isMesh) assert.ok(legal.has(m.material.color.getHex()), "unregistered pivot material");});
});

test("crusher/salvager frontage: loading bay and status light are byte-exact to the ART-01 contract", () => {
  for (const type of ["salvager", "crusher"]) {
    const g = build(type), desc = machineDescriptor(type);
    const bay = g.getObjectByName("port:loading-bay"), status = g.getObjectByName("status:light");
    assert.deepEqual([...bay.position], [0, 0.11, 3.5 * 0.37], type + " bay position");
    assert.deepEqual([...bay.scale], [1.22, 0.08, 0.42], type + " bay size");
    assert.deepEqual([...status.position], desc.frontage.statusLight, type + " status position");
    assert.ok(desc.frontage.bay.size[0] >= SCALE_REFERENCES.truck.width, type + " bay fits truck");
    const pick = g.getObjectByName("pick:volume");
    assert.deepEqual([...pick.scale], desc.pick.size, type + " pick size");
    assert.deepEqual([...pick.position], desc.pick.center, type + " pick center");
    assert.equal(pick.material.visible, false, type + " pick never renders");
  }
});

// ---- ART-03 seam: refinery is untouched ----

test("ART-03 seam: refinery geometry is EXACTLY the pre-ART-02 shared branch (no collateral change)", () => {
  const g = build("refinery");
  const size = staticBox(g).getSize(new THREE.Vector3());
  near(size.x, 3.045, "refinery width");
  near(size.y, 2.34, "refinery height unchanged");
  near(size.z, 3.045, "refinery depth");
  assert.equal(machineDescriptor("refinery").pivots.length, 0, "refinery stays static until ART-03");
  // main baseline: foundation(2) + body + 3 rollers + hopper + grille + bay + status = 10 meshes.
  assert.equal(meshesOf(g).length, 10, "refinery mesh count unchanged");
  assert.ok(!g.getObjectByName("pivot:rollerA"), "crusher pivots must not leak into refinery");
  // The two machines are now genuinely distinct structures.
  const crusher = build("crusher");
  assert.notEqual(machineDescriptor("crusher").bounds.height, machineDescriptor("refinery").bounds.height);
  assert.ok(meshesOf(crusher).length > meshesOf(g).length * 2, "crusher must be a richer structure than the old shared box");
});

// ---- Staging, budgets, camera invariants ----

test("mid-build staging: crusher at 10% keeps foundation + low parts, hides hopper; salvager hides its high rocker", () => {
  // Existing staging semantics (unchanged by ART-02): at ratio<.65 a part is
  // visible iff position.y<1.4 (low structure reads as "under construction")
  // or ratio>.35. Crusher rollers/screen sit at y<=1.35 so they follow the
  // low-part rule exactly like the chamber walls; the high hopper is hidden.
  const g = build("crusher", 4.5);
  const foot = g.children[0];
  assert.equal(foot.visible, true, "foundation always visible");
  const flare = g.children.find(c => c.isMesh && Math.abs(c.position.y - 2.28) < 1e-6);
  assert.ok(flare && flare.visible === false, "hopper flare hidden at 10%");
  for (const name of ["pivot:rollerA", "pivot:rollerB", "pivot:screen"]) {
    const pv = g.getObjectByName(name);
    assert.equal(pv.visible, pv.position.y < 1.4, name + " follows the low-part staging rule");
  }
  assert.equal(g.getObjectByName("pick:volume").material.visible, false);
  const s = build("salvager", 4.5);
  assert.equal(s.getObjectByName("pivot:rocker").visible, false, "high rocker hidden at 10%");
});

test("ART-02 budgets: measured mesh/triangle counts inside declared and global limits", () => {
  for (const type of ["salvager", "crusher"]) {
    const desc = machineDescriptor(type);
    let meshes = 0, triangles = 0;
    build(type).traverse(n => {
      if (!n.isMesh || n.name === "pick:volume" || !n.material.visible) return;
      meshes++;
      triangles += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
    });
    assert.ok(meshes <= desc.budget.maxMeshes, type + " meshes " + meshes + " > " + desc.budget.maxMeshes);
    assert.ok(triangles <= desc.budget.maxTriangles, type + " tris " + triangles + " > " + desc.budget.maxTriangles);
    assert.ok(desc.budget.maxMeshes <= PERFORMANCE_LIMITS.maxMeshesPerMachine);
    assert.ok(desc.budget.maxTriangles <= PERFORMANCE_LIMITS.maxTrianglesPerMachine);
    assert.ok(meshes >= (type === "salvager" ? 26 : 40), type + " structure too sparse to read as industrial");
  }
});

test("camera invariants: applyCamera/stampCamera byte-identical to main (sha256-16 guard)", () => {
  const src = fs.readFileSync("src/world.js", "utf8").replace(/\r\n/g, "\n");
  const methodBody = name => {
    const start = src.indexOf(name + "(){");
    assert.ok(start >= 0, name + " missing");
    let depth = 0, j = src.indexOf("{", start);
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {depth--; if (depth === 0) {j++; break;}}
    }
    return src.slice(start, j);
  };
  for (const [name, expected, len] of [["applyCamera", "f3afa5479a66b97e", 602], ["stampCamera", "691b3c0a3480e97b", 252]]) {
    const body = methodBody(name);
    assert.equal(body.length, len, name + " length drift");
    assert.equal(crypto.createHash("sha256").update(" " + body).digest("hex").slice(0, 16), expected, name + " hash drift");
  }
});
