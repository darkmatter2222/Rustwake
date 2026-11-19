/**
 * #590 BEFORE fixtures — verbatim base behavior at 956a47066b227140431e0e33046b0683eb5be40e
 * (main before yard life). Provenance: `git show 956a4706:src/world.js`.
 *
 * These exist so the yardLife invariants can be measured against the REAL base
 * implementation, not a strawman:
 *  - baseDronePose: the base update() drone block SET the drone position to the
 *    anchor roof (or the pad) every frame — a teleport. The helpers it calls
 *    (activeCycleAnchor, droneHover, worldFootprint, machineDescriptor) are
 *    byte-identical between base and HEAD (the #590 diff does not touch them),
 *    so they are passed in from the live modules by the caller.
 *  - baseWorkerRig: a geometry-identical replica of the base createWorker box
 *    list (the #590 change only wraps the two leg boxes in pivot groups — no
 *    box added, removed or resized). rigShell/box are replicated exactly as in
 *    world.js (shared unit BoxGeometry, same group/proxy structure) so mesh and
 *    triangle counts are measured from real THREE geometry, not asserted.
 */
import * as THREE from "three";

// Verbatim base update() drone placement (956a4706:src/world.js), with the
// renderer object replaced by a plain pose record. h = {activeCycleAnchor,
// droneHover, worldFootprint, machineDescriptor, DRONE_PAD}.
// Returns {pos, anchorId, timers} — timers is the next prevTimers map.
export function baseDronePose(h, buildings, prevTimers, elapsed, reduced) {
  const anchor = h.activeCycleAnchor(buildings, prevTimers);
  const timers = new Map(buildings.map((b) => [b.id, b.timer]));
  let anchorId = "none";
  const hover = h.droneHover(elapsed || 0, reduced);
  let pos;
  if (anchor) {
    const wf = h.worldFootprint(anchor.type, anchor.x, anchor.z, anchor.rot || 0);
    const desc = h.machineDescriptor(anchor.type);
    const roofY = (desc?.bounds.height || 2.5) + 1.4;
    pos = {x: wf.pivot.x, y: roofY + hover.bob, z: wf.pivot.z}; // position.set — the teleport
    anchorId = String(anchor.id);
  } else {
    pos = {x: h.DRONE_PAD.x, y: h.DRONE_PAD.y, z: h.DRONE_PAD.z};
  }
  return {pos, anchorId, timers};
}

// --- geometry-identical replica of world.js rigShell/box (956a4706) ----------
const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = () => new THREE.MeshStandardMaterial({color: "#888888"});
function box(parent, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(geo, mat());
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}
function rigShell(name, proxySize, proxyCenter) {
  const g = new THREE.Group();
  g.name = name;
  const detail = new THREE.Group();
  detail.name = "lod:detail";
  g.add(detail);
  const greeble = new THREE.Group();
  greeble.name = "lod:greeble";
  detail.add(greeble);
  const proxy = new THREE.Mesh(geo, mat());
  proxy.name = "lod:proxy";
  proxy.scale.set(...proxySize);
  proxy.position.set(...proxyCenter);
  proxy.visible = false;
  g.add(proxy);
  return {g, detail, greeble};
}

// Verbatim base createWorker body (956a4706:src/world.js) — static legs, arm
// pivots only. Material identities are irrelevant to mesh/triangle counts.
export function baseWorkerRig() {
  const {g, detail, greeble} = rigShell("scale:worker", [.62, 1.7, .34], [0, .85, 0]);
  box(detail, -.12, .39, 0, .2, .78, .22);
  box(detail, .12, .39, 0, .2, .78, .22);
  box(detail, 0, 1.09, 0, .56, .62, .3);
  const armL = new THREE.Group();
  armL.name = "pivot:arm-l";
  armL.position.set(-.25, 1.3, 0);
  box(armL, 0, -.25, 0, .12, .5, .16);
  detail.add(armL);
  const armR = new THREE.Group();
  armR.name = "pivot:arm-r";
  armR.position.set(.25, 1.3, 0);
  box(armR, 0, -.25, 0, .12, .5, .16);
  detail.add(armR);
  box(detail, 0, 1.5, 0, .28, .28, .28);
  box(detail, 0, 1.64, 0, .34, .12, .34);
  box(greeble, 0, .82, 0, .58, .1, .32);   // tool belt
  box(greeble, -.12, 1.12, .16, .1, .4, .02); // hi-vis vest stripes
  box(greeble, .12, 1.12, .16, .1, .4, .02);
  return g;
}

export function countRig(g) {
  let meshes = 0, triangles = 0;
  g.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      const idx = o.geometry.index;
      triangles += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
    }
  });
  return {meshes, triangles};
}
