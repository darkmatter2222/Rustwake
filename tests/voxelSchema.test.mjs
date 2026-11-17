// ART-01 (#347): reproducible validation of the canonical voxel geometry schema
// against the ACTUAL original 3D source geometry in src/world.js — not pixels.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import {CELL, WORLD_SIZE, BUILDINGS} from "../src/content.js";
import {
  SCHEMA_ID, PARCEL, SCALE_REFERENCES, MATERIALS, PERFORMANCE_LIMITS, MACHINES,
  machineDescriptor, validateMachine, validateAllMachines, cellProjectedCssPx, minZoomForPick
} from "../src/voxelSchema.js";

// world.js textPanel needs a canvas; stub the 2D context (geometry tests never read pixels).
globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding, createTruck, createWorker} = await import("../src/world.js");

const TOL = 0.02;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= TOL, msg + ": " + a + " vs " + b);

// Static envelope of a machine group: excludes named animated pivot assemblies
// and the invisible schema pick volume, exactly as the schema declares.
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
function fullBox(group) {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  group.traverse((node) => {if (node.isMesh && node.name !== "pick:volume") box.expandByObject(node);});
  return box;
}
const build = (type, remaining = 0) =>
  makeBuilding({id: 99, type, x: WORLD_SIZE / 2 - 0.5, z: WORLD_SIZE / 2 - 0.5, remaining}, 0).group;

test("schema identity, parcel and cell scale match content registry and design tokens", () => {
  assert.equal(SCHEMA_ID, "rustwake.voxel.geometry.v1");
  assert.equal(CELL, 3.5);
  assert.equal(WORLD_SIZE, 24);
  assert.deepEqual(PARCEL.cells, [24, 24]);
  assert.deepEqual(PARCEL.world, [84, 84]);
  const tokens = JSON.parse(fs.readFileSync("docs/design/tokens.json", "utf8"));
  assert.equal(tokens.layout.worldUnitsPerCell, CELL);
  assert.deepEqual(tokens.layout.initialCells, [24, 24]);
  assert.equal(tokens.layout.minimumTouchTargetCssPx, 44);
});

test("every initial machine has a descriptor and passes full schema validation", () => {
  const report = validateAllMachines();
  assert.equal(report.machines.length, BUILDINGS.length);
  assert.deepEqual(report.errors, []);
  assert.ok(report.ok, JSON.stringify(report.errors));
  for (const b of BUILDINGS) assert.ok(MACHINES[b.id], "missing " + b.id);
});

test("material registry mirrors tokens.json world colors and world.js source ownership", () => {
  const tokens = JSON.parse(fs.readFileSync("docs/design/tokens.json", "utf8"));
  const source = fs.readFileSync("src/world.js", "utf8").toLowerCase();
  for (const [key, m] of Object.entries(MATERIALS)) {
    assert.equal(m.color, tokens.world[key], "token color drift: " + key);
    assert.ok(source.includes(m.color.toLowerCase()), "world.js missing material " + key);
    if (m.emissive) assert.equal(m.emissive, tokens.world[key === "lights" ? "lampEmission" : "furnaceEmission"]);
    assert.equal(m.owner, "world.js mats");
  }
});

test("all 12 machines: real static geometry fits the 3.5-unit cell and matches declared bounds", () => {
  for (const b of BUILDINGS) {
    const desc = machineDescriptor(b.id), box = staticBox(build(b.id));
    const size = box.getSize(new THREE.Vector3());
    near(size.x, desc.bounds.width, b.id + " width");
    near(size.y, desc.bounds.height, b.id + " height");
    near(size.z, desc.bounds.depth, b.id + " depth");
    assert.ok(box.min.y >= -TOL, b.id + " geometry below ground");
    assert.ok(size.x <= CELL + TOL && size.z <= CELL + TOL, b.id + " static overhang beyond cell");
    assert.ok(desc.footprint.world[0] === CELL && desc.footprint.world[1] === CELL);
  }
});

test("pick volume encloses the full silhouette, covers the whole cell and is schema-owned", () => {
  for (const b of BUILDINGS) {
    const group = build(b.id), desc = machineDescriptor(b.id);
    const pick = group.getObjectByName("pick:volume");
    assert.ok(pick, b.id + " missing pick volume");
    assert.equal(pick.material.visible, false, "pick volume must never render");
    assert.deepEqual([...pick.scale], desc.pick.size);
    assert.deepEqual([...pick.position], desc.pick.center);
    assert.ok(pick.scale.x >= CELL && pick.scale.z >= CELL, b.id + " pick smaller than cell");
    const staticSize = staticBox(group).getSize(new THREE.Vector3());
    assert.ok(pick.scale.x >= staticSize.x - TOL && pick.scale.y >= staticSize.y - TOL && pick.scale.z >= staticSize.z - TOL,
      b.id + " pick volume does not enclose static silhouette");
    // Animated horizontal reach (crane boom) is declared via swingRadius, never by
    // inflating the pick cell beyond the logical footprint.
    for (const pv of desc.pivots) assert.ok(pv.swingRadius <= SCALE_REFERENCES.maxAnimatedReach);
    assert.equal(group.userData.voxel.schema, SCHEMA_ID);
    assert.equal(group.userData.voxel.type, b.id);
  }
});

test("frontage loading bay and status light exist on +Z and fit a truck", () => {
  for (const b of BUILDINGS) {
    const group = build(b.id), desc = machineDescriptor(b.id);
    const bay = group.getObjectByName("port:loading-bay");
    const status = group.getObjectByName("status:light");
    assert.ok(bay && status, b.id + " missing port/status nodes");
    near(bay.position.z, desc.frontage.bay.offset[1], b.id + " bay offset");
    assert.ok(bay.position.z > 0, b.id + " bay must face +Z");
    assert.ok(desc.frontage.bay.size[0] >= SCALE_REFERENCES.truck.width, b.id + " bay narrower than truck");
    const half = CELL / 2;
    assert.ok(Math.abs(bay.position.z) + desc.frontage.bay.size[1] / 2 <= half + TOL, b.id + " bay outside cell");
  }
});

test("named pivots match schema offsets, axes and motion; animated reach is bounded", () => {
  const expected = {salvager: "rocker", generator: "spin", crane: "crane", turret: "rotate"};
  for (const b of BUILDINGS) {
    const group = build(b.id), desc = machineDescriptor(b.id);
    assert.equal(desc.pivots.length, expected[b.id] ? 1 : 0, b.id + " pivot count");
    for (const pv of desc.pivots) {
      const node = group.getObjectByName(pv.node);
      assert.ok(node, b.id + " missing " + pv.node);
      assert.deepEqual([...node.position], pv.offset, b.id + " pivot offset");
      assert.equal(expected[b.id], pv.id);
      assert.ok(pv.swingRadius <= SCALE_REFERENCES.maxAnimatedReach);
    }
    if (b.id === "furnace" || b.id === "foundry")
      assert.equal(desc.animations[0].kind, "pulse");
  }
  // Crane boom overhangs the cell only while animated; declared reach covers it.
  const crane = fullBox(build("crane")).getSize(new THREE.Vector3());
  assert.ok(crane.x / 2 <= machineDescriptor("crane").pivots[0].swingRadius + TOL);
});

test("every rendered mesh uses a registered shared material (palette ownership)", () => {
  const legal = new Set(Object.values(MATERIALS).map(m => new THREE.Color(m.color).getHex()));
  for (const b of BUILDINGS) {
    build(b.id).traverse((node) => {
      if (!node.isMesh || node.name === "pick:volume" || node.material.map) return; // signage canvas texture exempt
      assert.ok(legal.has(node.material.color.getHex()), b.id + " unregistered material on " + node.name);
    });
  }
});

test("truck and worker scale references match real geometry and machine ratios", () => {
  const truck = createTruck(0), tb = new THREE.Box3().setFromObject(truck).getSize(new THREE.Vector3());
  near(tb.x, SCALE_REFERENCES.truck.width, "truck width");
  near(tb.y, SCALE_REFERENCES.truck.height, "truck height");
  near(tb.z, SCALE_REFERENCES.truck.length, "truck length");
  assert.ok(SCALE_REFERENCES.truck.length <= CELL, "truck must fit one road cell");
  const worker = createWorker(), wb = new THREE.Box3().setFromObject(worker).getSize(new THREE.Vector3());
  near(wb.y, SCALE_REFERENCES.worker.height, "worker height");
  near(wb.x, SCALE_REFERENCES.worker.width, "worker width");
  near(wb.z, SCALE_REFERENCES.worker.depth, "worker depth");
  for (const b of BUILDINGS) {
    const ratio = machineDescriptor(b.id).bounds.height / SCALE_REFERENCES.worker.height;
    assert.ok(ratio >= SCALE_REFERENCES.machineHeightRatio.min && ratio <= SCALE_REFERENCES.machineHeightRatio.max,
      b.id + " machine/worker height ratio " + ratio);
  }
});

test("performance: real mesh/triangle counts stay inside declared per-machine budgets", () => {
  for (const b of BUILDINGS) {
    const desc = machineDescriptor(b.id);
    let meshes = 0, triangles = 0;
    build(b.id).traverse((node) => {
      if (!node.isMesh || node.name === "pick:volume" || !node.material.visible) return;
      meshes++;
      const g = node.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    assert.ok(meshes <= desc.budget.maxMeshes, b.id + " meshes " + meshes);
    assert.ok(triangles <= desc.budget.maxTriangles, b.id + " triangles " + triangles);
    assert.ok(desc.budget.maxMeshes <= PERFORMANCE_LIMITS.maxMeshesPerMachine);
    assert.ok(desc.budget.maxTriangles <= PERFORMANCE_LIMITS.maxTrianglesPerMachine);
  }
});

test("accessible pick projection: desktop default meets 44px; phone zoom floor is explicit", () => {
  // Desktop default zoom 1.15 at 900css px canvas (App.jsx default).
  assert.ok(cellProjectedCssPx(1.15, 900) >= 44);
  // Phone 390x844 default zoom 1: full-cell target is smaller than 44px; the schema
  // publishes the exact zoom floor instead of hiding it. Ground-plane cell picking
  // still targets the whole cell at any zoom.
  const floor = minZoomForPick(844);
  assert.ok(floor > 1 && floor < 1.5);
  assert.ok(cellProjectedCssPx(floor, 844) >= 44 - 1e-6);
  for (const b of BUILDINGS) assert.equal(machineDescriptor(b.id).pick.minProjectedCssPx, 44);
});

test("negative validation: broken descriptors are rejected, not silently accepted", () => {
  const base = machineDescriptor("salvager");
  const bad = [
    {...base, footprint: {...base.footprint, cells: [0, 1]}},
    {...base, footprint: {...base.footprint, cells: [25, 1]}},
    {...base, footprint: {...base.footprint, world: [7, 3.5]}},
    {...base, bounds: {...base.bounds, width: 4.2}},
    {...base, bounds: {...base.bounds, height: 0.4}}, // below human scale
    {...base, bounds: {...base.bounds, height: 9}},   // above human scale ceiling
    {...base, pick: {...base.pick, size: [2, base.bounds.height, 2]}},
    {...base, pick: {...base.pick, size: [3.5, 1, 3.5]}},
    {...base, pick: {...base.pick, minProjectedCssPx: 20}},
    {...base, frontage: {...base.frontage, face: "-z"}},
    {...base, frontage: {...base.frontage, bay: {...base.frontage.bay, offset: [0, 3]}}},
    {...base, frontage: {...base.frontage, bay: {...base.frontage.bay, size: [0.5, 0.42]}}},
    {...base, pivots: [{...base.pivots[0], node: "arm"}]},
    {...base, pivots: [{...base.pivots[0], axis: "w"}]},
    {...base, pivots: [{...base.pivots[0], offset: [9, 0, 0]}]},
    {...base, pivots: [{...base.pivots[0], swingRadius: 9}]},
    {...base, parts: [{id: "body", material: "neon-unobtanium"}]},
    {...base, budget: {maxMeshes: 500, maxTriangles: 100000}}
  ];
  for (const desc of bad) assert.equal(validateMachine("salvager", desc).ok, false, JSON.stringify(desc).slice(0, 120));
  assert.equal(validateMachine("no-such-machine").ok, false);
  assert.equal(validateMachine("salvager").ok, true);
});

test("mid-build staging keeps foundation and pick volume, never a pop-in balloon", () => {
  const group = build("furnace", 4.5); // ratio 0.1: only foundation stage
  const foot = group.children[0];
  assert.equal(foot.visible, true);
  assert.equal(group.getObjectByName("pick:volume").material.visible, false);
  const body = group.children.find(c => c.isMesh && c !== foot && c.name !== "pick:volume" && c.position.y > 1.4);
  assert.equal(body.visible, false, "high walls must not appear at 10% build");
});
