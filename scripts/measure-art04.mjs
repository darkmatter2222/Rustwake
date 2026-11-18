// ART-04 (#350): reproducible measurement of the four civic rigs' REAL geometry
// (src/world.js makeBuilding) — static envelope (pivot/emit/pick excluded, same
// rule as tests/voxelSchema.test.mjs staticBox), full animated envelope, mesh
// and triangle counts. Used to author the voxelSchema bounds/budgets and to
// report honest perf before/after. Run: node scripts/measure-art04.mjs
import * as THREE from "three";
import {WORLD_SIZE} from "../src/content.js";

globalThis.document = {
  createElement: (tag) => {
    if (tag !== "canvas") throw new Error("unexpected element " + tag);
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding} = await import("../src/world.js");

const TYPES = process.argv.slice(2).length ? process.argv.slice(2)
  : ["depot", "market", "research", "fabricator"];

function measure(group, excludeAnimated) {
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let meshes = 0, tris = 0;
  group.traverse((node) => {
    if (!node.isMesh || node.name === "pick:volume") return;
    if (excludeAnimated) for (let p = node.parent; p; p = p.parent)
      if (p.name?.startsWith("pivot:") || p.name?.startsWith("emit:")) return;
    box.expandByObject(node);
    meshes++;
    const g = node.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return {box, meshes, tris};
}

const out = {};
for (const type of TYPES) {
  const group = makeBuilding({id: 99, type, x: WORLD_SIZE / 2 - 0.5, z: WORLD_SIZE / 2 - 0.5, remaining: 0}, 0).group;
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
  const s = measure(group, true), f = measure(group, false);
  const size = s.box.getSize(new THREE.Vector3());
  const full = f.box.getSize(new THREE.Vector3());
  const pivots = [];
  group.traverse((n) => { if (n.name?.startsWith("pivot:")) pivots.push({node: n.name, offset: [...n.position], parent: n.parent.name || "root"}); });
  out[type] = {
    static: {width: +size.x.toFixed(4), height: +size.y.toFixed(4), depth: +size.z.toFixed(4),
      min: s.box.min.toArray().map(v => +v.toFixed(4)), max: s.box.max.toArray().map(v => +v.toFixed(4))},
    full: {width: +full.x.toFixed(4), height: +full.y.toFixed(4), depth: +full.z.toFixed(4),
      max: f.box.max.toArray().map(v => +v.toFixed(4))},
    meshes: f.meshes, triangles: f.tris, pivots
  };
}
console.log(JSON.stringify(out, null, 1));
