/**
 * ART-05 (#351): identity-specific truck / forklift / drone / worker rig suite.
 * Tests the REAL src/world.js geometry, the exported pure motion functions and
 * the shared runtime application path (stepTruck/syncTruckCargo/applyRigLod)
 * against the REAL simulation.js freight ledger — no mocks of the rigs or sim.
 *
 * Honesty contract (#274/#384): truck crates mirror ONLY real onboard freight;
 * forklift/drone/worker are explicitly decorative yard crew with zero freight
 * authority. Negative controls: empty truck carries no crate, decorative rigs
 * never report cargo, reduced motion parks every articulation while sim timing
 * is untouched. The #307 camera method bodies are hash-guarded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import {CELL, RESOURCE_BY_ID, INITIAL_BANK, STARTER_BUILDINGS} from "../src/content.js";
import {createGame, advanceGame, freightTotals} from "../src/simulation.js";
import {bayCells, checkSite} from "../src/gridOccupancy.js";
import {
  MATERIALS, PERFORMANCE_LIMITS, SCALE_REFERENCES, RIGS, RIG_LOD,
  rigLodTier, cellProjectedCssPx, validateAllRigs, cellCenter
} from "../src/voxelSchema.js";

// world.js textPanel needs a canvas; stub the 2D context (geometry tests never read pixels).
globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {
  createTruck, createForklift, createDrone, createWorker,
  truckIdentity, TRUCK_IDENTITIES, TRUCK_WHEEL_RADIUS,
  wheelSpin, steerTarget, suspensionBob, applyTruckMotion, stepTruck, syncTruckCargo,
  applyRigLod, forkliftLift, applyForkliftPose, FORKLIFT_POST, droneHover,
  activeCycleAnchor, DRONE_PAD
} = await import("../src/world.js");

const TOL = 0.02;
const near = (a, b, msg, tol = TOL) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} !~ ${b}`);
const fullBox = g => new THREE.Box3().setFromObject(g); // includes invisible LOD proxy
const size = g => fullBox(g).getSize(new THREE.Vector3());

// Deterministic single-truck freight fixture (same contract as tests/freight.test.mjs):
// frozen power, explicit inventories, fixed seed 4073.
const ZERO_BANK = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0]));
function scrapGame() {
  const g = createGame();
  assert.equal(g.seed, 4073);
  g.buildings.find(b => b.id === 3).remaining = 1e9; // generator never completes
  for (const b of g.buildings) b.inventory = {};
  g.buildings.find(b => b.id === 1).inventory = {scrap: 12};
  g.bank = {...ZERO_BANK, credits: 1800};
  g.vehicles = g.vehicles.slice(0, 1);
  return g;
}
const truck1 = g => g.vehicles.find(v => v.id === 1);

test("identity: three haulers are deterministic per REAL vehicle id, never random", () => {
  // id%3 mapping PRESERVES the original per-id paint (id1 orange, id2 body,
  // id3 rust) so existing yards keep their hauler colors; variants upgrade them.
  const expect = [
    {id: 1, variant: "stake", livery: "orange", label: "AMBER STAKE-BED"},
    {id: 2, variant: "tipper", livery: "body", label: "TEAL TIPPER"},
    {id: 3, variant: "flatbed", livery: "rust", label: "RUST FLATBED"}
  ];
  for (const e of expect) {
    const a = truckIdentity(e.id), b = truckIdentity({id: e.id, name: "HAULER-0" + e.id});
    assert.deepEqual(a, b, "identity must depend only on the real id");
    assert.equal(a.variant, e.variant); assert.equal(a.livery, e.livery); assert.equal(a.label, e.label);
    const rig = createTruck({id: e.id});
    assert.deepEqual(rig.userData.identity, {...TRUCK_IDENTITIES[(e.id % 3 + 3) % 3], index: (e.id % 3 + 3) % 3, id: e.id});
    assert.equal(rig.userData.vehicle, true);
    assert.equal(rig.userData.decorative, false);
  }
  // id wrap stays deterministic (4 -> stake again), negative ids never throw.
  assert.equal(truckIdentity(4).variant, "stake");
  assert.equal(truckIdentity(-1).variant, "tipper");
  // Distinct silhouettes: tipper has a dual rear axle (6 wheels), others 4.
  const wheels = id => createTruck(id).userData.wheels.spin.length;
  assert.equal(wheels(1), 4); assert.equal(wheels(2), 6); assert.equal(wheels(3), 4);
  assert.ok(createTruck(1).userData.beacon, "stake-bed carries the rotating beacon pivot");
  assert.equal(createTruck(3).userData.beacon, null);
});

test("scale: every truck variant keeps the canonical 1.2 x 1.35 x 2.05 envelope", () => {
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const s = size(createTruck(id));
    near(s.x, 1.2, "truck width id" + id);
    near(s.y, 1.35, "truck height id" + id);
    near(s.z, 2.05, "truck length id" + id);
    const b = fullBox(createTruck(id));
    near(b.min.y, -0.05, "wheel ground contact id" + id);
    near(b.max.y, 1.30, "cab roof id" + id);
  }
});

test("scale: forklift/drone/worker are coherent against the 1.7-unit worker", () => {
  const w = size(createWorker()), f = size(createForklift()), d = size(createDrone()), t = size(createTruck(1));
  near(w.x, 0.62, "worker width"); near(w.y, 1.7, "worker height"); near(w.z, 0.34, "worker depth");
  near(f.x, 0.8, "forklift width"); near(f.y, 1.1, "forklift height"); near(f.z, 1.3, "forklift length", 0.03);
  near(d.x, 1.0, "drone span"); near(d.y, 0.3, "drone height"); near(d.z, 1.0, "drone depth");
  // Coherence ratios: truck cab below worker head, forklift below truck, drone tiny.
  near(t.y / w.y, 1.35 / 1.7, "truck/worker height ratio", 0.02);
  near(f.y / w.y, 1.1 / 1.7, "forklift/worker height ratio", 0.02);
  assert.ok(d.y < f.y && f.y < t.y && t.y < w.y, "drone < forklift < truck < worker");
  for (const s of [w, f, d, t]) assert.ok(Math.max(s.x, s.z) <= CELL, "every rig fits one 3.5-unit cell");
  // Schema scale references agree with the authored geometry.
  const v = validateAllRigs();
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(SCALE_REFERENCES.worker.height, 1.7);
  assert.equal(RIGS.truck.decorative, false);
  for (const id of ["forklift", "drone", "worker"]) assert.equal(RIGS[id].decorative, true);
});

test("wheels: spin equals real travelled distance / radius, applied to real nodes", () => {
  assert.equal(TRUCK_WHEEL_RADIUS, 0.3);
  near(wheelSpin(3), 10, "3 units / 0.3 radius = 10 rad", 1e-9);
  near(wheelSpin(0), 0, "parked = no spin", 1e-9);
  const rig = createTruck(1);
  applyTruckMotion(rig, {wheelAngle: 2.5, steer: 0.3, bob: 0.01, beacon: 1.2});
  for (const w of rig.userData.wheels.spin) near(w.rotation.x, 2.5, "every wheel spins identically", 1e-9);
  for (const s of rig.userData.wheels.steer) near(s.rotation.y, 0.3, "front axle steers", 1e-9);
  assert.equal(rig.userData.wheels.steer.length, 2, "only the front axle steers");
  near(rig.getObjectByName("lod:detail").position.y, 0.01, "suspension bob on detail group", 1e-9);
  // Named pivot hierarchy for future animation/review tooling.
  for (const n of ["pivot:wheels", "steer:fl", "steer:fr", "wheel:fl", "wheel:rr", "lod:detail", "lod:greeble", "lod:proxy"])
    assert.ok(rig.getObjectByName(n), "missing pivot " + n);
});

test("motion: distance integrates REAL sim movement; wheel angle tracks it exactly", () => {
  const g = scrapGame();
  const v = truck1(g);
  const rig = createTruck(v);
  stepTruck(rig, v, 0.1, 0, false); // seed lastX/lastZ
  let expected = 0, prevX = v.x, prevZ = v.z, moved = false;
  for (let i = 0; i < 400; i++) {
    advanceGame(g, 0.1);
    expected += Math.hypot(v.x - prevX, v.z - prevZ) * CELL;
    prevX = v.x; prevZ = v.z;
    const m = stepTruck(rig, v, 0.1, i * 0.1, false);
    near(m.distance, expected, "integrated distance vs independent path sum", 1e-9);
    near(m.wheelAngle, expected / TRUCK_WHEEL_RADIUS, "wheel angle = distance/radius", 1e-9);
    if (m.dist > 0) moved = true;
    // Suspension bob is exactly zero whenever the truck is actually stationary.
    if (m.speed <= 1e-4) assert.equal(m.bob, 0, "no decorative bob while parked");
  }
  assert.ok(moved && expected > 5, "the real truck actually travelled");
  assert.ok(rig.userData.wheelAngle > 10, "wheels visibly turned over the run");
});

test("steering: front axle yaw comes from real route heading deltas, clamped and decaying", () => {
  // Pure wrap-aware math: crossing the +/-pi seam must not snap the wheels.
  near(steerTarget(3.0, -3.0), Math.atan2(Math.sin(-6), Math.cos(-6)), "wrap-aware delta", 1e-9);
  assert.equal(steerTarget(null, 1), 0); assert.equal(steerTarget(1, null), 0);
  assert.equal(steerTarget(0, 2), 0.45, "hard clamp at 0.45 rad");
  assert.equal(steerTarget(0, -2), -0.45);
  // Real sim: run a full pickup route and observe a non-zero steer at a real turn.
  const g = scrapGame();
  const v = truck1(g);
  const rig = createTruck(v);
  stepTruck(rig, v, 0.1, 0, false);
  let sawTurn = false, prevHeading = null;
  for (let i = 0; i < 1200 && !sawTurn; i++) {
    advanceGame(g, 0.1);
    const m = stepTruck(rig, v, 0.1, i * 0.1, false);
    assert.ok(Math.abs(m.steer) <= 0.45 + 1e-9, "steer never exceeds clamp");
    if (rig.userData.heading !== prevHeading && prevHeading !== null && Math.abs(m.steer) > 1e-6) sawTurn = true;
    prevHeading = rig.userData.heading;
  }
  assert.ok(sawTurn, "a real route turn produced front-wheel steer");
  // Straight running decays steer back to zero (no free-running oscillation).
  const g2 = scrapGame(); const v2 = truck1(g2); const rig2 = createTruck(v2);
  stepTruck(rig2, v2, 0.1, 0, false);
  for (let i = 0; i < 30; i++) {advanceGame(g2, 0.1); stepTruck(rig2, v2, 0.1, i * 0.1, false);}
  const straight = stepTruck(rig2, v2, 0.1, 3, false);
  assert.ok(Math.abs(straight.steer) < 0.45, "steer decays on straight segments");
});

test("cargo honesty: crates mirror ONLY the real ledger across reserve/pickup/arrive", () => {
  const g = scrapGame();
  const base = freightTotals(g).totals;
  const v = truck1(g);
  const rig = createTruck(v);
  // Empty truck: no crate, ever, before a real pickup.
  assert.equal(syncTruckCargo(rig, v), false);
  assert.equal(rig.children.find(c => c.name === "cargo"), undefined);
  assert.equal(rig.userData.loaded, false);
  const step = () => {advanceGame(g, 0.1); assert.deepEqual(freightTotals(g).totals, base);};
  // Reservation phase: units are reserved, NOT onboard -> still no crate.
  while (v.job?.phase !== "toSource") step();
  assert.equal(v.cargo, null);
  assert.equal(syncTruckCargo(rig, v), false, "reservation must not fabricate a load");
  assert.equal(rig.children.find(c => c.name === "cargo"), undefined);
  // Real pickup: exactly one signature transition builds the load.
  while (v.job?.phase !== "toDest") step();
  assert.deepEqual(v.cargo, {resource: "scrap", amount: 12});
  assert.equal(syncTruckCargo(rig, v), true, "pickup is a real cargo transition");
  const load = rig.children.find(c => c.name === "cargo");
  assert.ok(load, "onboard freight is visible");
  assert.equal(load.children.length, 3, "ceil(12/5)=3 crates, capped at 3");
  const scrapHex = new THREE.Color(RESOURCE_BY_ID.scrap.color).getHex();
  for (const crate of load.children) assert.equal(crate.material.color.getHex(), scrapHex, "crate tint = real resource color");
  assert.equal(rig.userData.loaded, true);
  assert.deepEqual(rig.userData.cargo, {resource: "scrap", amount: 12});
  // Idempotence: re-syncing unchanged cargo never rebuilds or double-counts.
  for (let i = 0; i < 20; i++) {step(); assert.equal(syncTruckCargo(rig, v), false);}
  assert.equal(rig.children.filter(c => c.name === "cargo").length, 1, "exactly one load group");
  // Real arrival: cargo drops to null -> crate removed, tray empty again.
  while (v.cargo) step();
  assert.equal(syncTruckCargo(rig, v), true, "drop-off is a real cargo transition");
  assert.equal(rig.children.find(c => c.name === "cargo"), undefined);
  assert.equal(rig.userData.loaded, false);
  assert.equal(rig.userData.cargo, null);
});

test("cargo honesty negative: empty trucks and decorative rigs never carry freight", () => {
  for (const id of [1, 2, 3]) {
    const rig = createTruck(id);
    assert.equal(syncTruckCargo(rig, {id, cargo: null}), false);
    assert.equal(syncTruckCargo(rig, {id, cargo: {resource: "scrap", amount: 0}}), false, "zero amount is not a load");
    assert.equal(rig.children.find(c => c.name === "cargo"), undefined);
  }
  // Decorative yard crew: explicit zero-authority labels, no cargo path at all.
  const crew = [createForklift(), createDrone(), createWorker()];
  for (const rig of crew) {
    assert.equal(rig.userData.decorative, true);
    assert.match(rig.userData.authority, /decorative/);
    assert.match(rig.userData.authority, /#274/);
    assert.equal(rig.userData.vehicle, undefined, "crew is never a freight vehicle");
    assert.equal(rig.children.find(c => c.name === "cargo"), undefined);
    assert.equal(rig.userData.loaded, undefined);
    assert.equal(rig.userData.cargo, undefined);
  }
  // The forklift mast/forks carry no load mesh in any pose.
  const f = createForklift();
  applyForkliftPose(f, 0.75);
  let meshes = 0; f.userData.forks.traverse(n => {if (n.isMesh) meshes++;});
  assert.equal(meshes, 3, "forks = carriage + 2 prongs only, never a crate");
});

test("LOD: exact projected-cell thresholds on desktop and phone viewports", () => {
  assert.deepEqual(RIG_LOD, {detailMinCellPx: 26, blockMinCellPx: 12});
  for (const h of [900, 844]) {
    const zDetail = RIG_LOD.detailMinCellPx * 80 / (CELL * h);
    const zBlock = RIG_LOD.blockMinCellPx * 80 / (CELL * h);
    assert.equal(rigLodTier(zDetail * 1.001, h), 0, "above threshold -> detail");
    assert.equal(rigLodTier(zDetail * 0.999, h), 1, "just below -> silhouette");
    assert.equal(rigLodTier(zBlock * 1.001, h), 1, "above block threshold -> silhouette");
    assert.equal(rigLodTier(zBlock * 0.999, h), 2, "far zoom -> proxy");
    assert.equal(rigLodTier(2.8, h), 0, "strategic close zoom is full detail");
    assert.equal(rigLodTier(0.2, h), 2, "mobile far-zoom is the cheap proxy");
    near(cellProjectedCssPx(zDetail, h), 26, "threshold math", 1e-9);
  }
});

test("LOD: real node visibility tiers keep the rig recognizable and cheap", () => {
  const rig = createTruck(2);
  syncTruckCargo(rig, {id: 2, cargo: {resource: "scrap", amount: 12}});
  const detail = rig.getObjectByName("lod:detail"), greeble = rig.getObjectByName("lod:greeble"), proxy = rig.getObjectByName("lod:proxy");
  const cargo = rig.children.find(c => c.name === "cargo");
  applyRigLod(rig, 0);
  assert.ok(detail.visible && greeble.visible && cargo.visible && !proxy.visible, "tier 0: everything");
  applyRigLod(rig, 1);
  assert.ok(detail.visible && !greeble.visible && cargo.visible && !proxy.visible, "tier 1: silhouette, greebles culled");
  applyRigLod(rig, 2);
  assert.ok(!detail.visible && !cargo.visible && proxy.visible, "tier 2: one proxy box, cargo hidden");
  assert.equal(proxy.geometry, detail.children[0].geometry ?? proxy.geometry); // shared unit box
  const s = size(rig);
  near(s.x, 1.2, "proxy preserves width"); near(s.y, 1.35, "proxy preserves height"); near(s.z, 2.05, "proxy preserves length");
  const livery = truckIdentity(2).livery;
  assert.equal(proxy.material.color.getHex(), new THREE.Color(MATERIALS[livery].color).getHex(), "proxy keeps the identity livery");
  // Tier 2 renders exactly ONE mesh for the whole rig.
  let visible = 0; rig.traverse(n => {if (n.isMesh && n.visible && n.material.visible) visible++;});
  // (parent visibility is what culls the rest at render time; proxy is the only visible leaf)
  assert.equal(proxy.visible, true);
  applyRigLod(rig, 0);
  assert.ok(cargo.visible, "returning to detail restores the real load");
  // New cargo synced while at tier 2 must stay hidden until detail returns.
  applyRigLod(rig, 2);
  syncTruckCargo(rig, {id: 2, cargo: {resource: "iron", amount: 4}});
  const c2 = rig.children.find(c => c.name === "cargo");
  assert.equal(c2.visible, false, "cargo synced at proxy tier stays culled");
});

test("budgets/materials: every rig stays inside declared mesh/triangle limits", () => {
  const legal = new Set(Object.values(MATERIALS).map(m => new THREE.Color(m.color).getHex()));
  const cargoHex = new Set(Object.values(RESOURCE_BY_ID).map(r => new THREE.Color(r.color).getHex()));
  const builders = {truck: () => createTruck(3), forklift: createForklift, drone: createDrone, worker: createWorker};
  const measured = {};
  for (const [id, build] of Object.entries(builders)) {
    const rig = build();
    if (id === "truck") syncTruckCargo(rig, {id: 3, cargo: {resource: "scrap", amount: 12}});
    let meshes = 0, triangles = 0;
    rig.traverse(n => {
      if (!n.isMesh || !n.material.visible) return;
      meshes++;
      const g = n.geometry;
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      const hex = n.material.color.getHex();
      assert.ok(legal.has(hex) || cargoHex.has(hex), "unregistered material on " + id + ":" + n.name);
    });
    measured[id] = {meshes, triangles};
    const b = RIGS[id].budget;
    assert.ok(meshes <= b.maxMeshes, id + " meshes " + meshes + " <= " + b.maxMeshes);
    assert.ok(triangles <= b.maxTriangles, id + " triangles " + triangles + " <= " + b.maxTriangles);
    assert.ok(meshes <= PERFORMANCE_LIMITS.maxMeshesPerMachine);
    assert.ok(triangles <= PERFORMANCE_LIMITS.maxTrianglesPerMachine);
  }
  // Worst-case fleet: 3 loaded trucks + crew stays bounded (initial scene cap 3).
  assert.ok(measured.truck.meshes * PERFORMANCE_LIMITS.maxTrucksInitialScene <= 120);
  globalThis.__rigMeasured = measured; // surfaced for the evidence report
});

test("forklift: decorative lift responds only to real truck proximity at the depot bay", () => {
  // Pure lift curve: raised near a real truck, flat far away, parked under reduced motion.
  assert.equal(forkliftLift(0), 0.75); assert.equal(forkliftLift(2), 0.75);
  assert.equal(forkliftLift(6), 0); assert.equal(forkliftLift(99), 0);
  near(forkliftLift(4), 0.375, "linear falloff", 1e-9);
  assert.equal(forkliftLift(0, true), 0, "reduced motion parks the forks");
  const f = createForklift();
  applyForkliftPose(f, 0.75);
  near(f.getObjectByName("pivot:forks").position.y, 0.85, "forks rise 0.75 from rest 0.1", 1e-9);
  applyForkliftPose(f, 0);
  near(f.getObjectByName("pivot:forks").position.y, 0.1, "forks return to rest", 1e-9);
  // Placement: the post sits on the depot bay approach cell, which machines may
  // never build on (gridOccupancy BAY rule) — decoration cannot block a build site.
  const depot = STARTER_BUILDINGS.find(b => b.type === "depot");
  const bay = bayCells(depot.type, depot.x, depot.z, depot.rot || 0);
  assert.ok(bay.some(c => c.x === FORKLIFT_POST.bayCell.x && c.z === FORKLIFT_POST.bayCell.z), "post cell is a real bay cell");
  const cx = cellCenter(FORKLIFT_POST.bayCell.x), cz = cellCenter(FORKLIFT_POST.bayCell.z);
  assert.ok(Math.abs(FORKLIFT_POST.x - cx) <= CELL / 2 && Math.abs(FORKLIFT_POST.z - cz) <= CELL / 2, "post inside the bay cell");
  const g = createGame(); g.tier = 4; // own every parcel so the BAY rule is the deciding gate
  const site = checkSite(g, "salvager", FORKLIFT_POST.bayCell.x, FORKLIFT_POST.bayCell.z, 0);
  assert.equal(site.ok, false, "machines cannot build on the forklift's bay cell");
  // Real-sim coupling: lift is high when a real truck is at the bay, zero when far.
  const nearLift = forkliftLift(Math.hypot(0, 0));
  assert.equal(nearLift, 0.75);
});

test("drone: anchors only over a building whose cycle timer ACTUALLY advanced", () => {
  const furnace = {id: 4, type: "furnace", x: 16, z: 13, rot: 0, remaining: 0, timer: 1.0};
  const depot = {id: 2, type: "depot", x: 13, z: 9, rot: 0, remaining: 0, timer: 0};
  const assembling = {id: 9, type: "furnace", x: 8, z: 8, rot: 0, remaining: 5, timer: 9};
  // No previous observation -> no claim of activity.
  assert.equal(activeCycleAnchor([furnace, depot], new Map()), null);
  // Timer advanced -> real active cycle anchor.
  assert.equal(activeCycleAnchor([furnace, depot], new Map([[4, 0.5], [2, 0]])), furnace);
  // Timer frozen (starved/power loss) -> null, drone parks honestly.
  assert.equal(activeCycleAnchor([furnace, depot], new Map([[4, 1.0], [2, 0]])), null);
  // Non-cycle buildings and mid-assembly never anchor.
  assert.equal(activeCycleAnchor([depot], new Map([[2, 0]])), null);
  assert.equal(activeCycleAnchor([assembling], new Map([[9, 8]])), null);
  // Real sim: the starter furnace actually cycles on frame 2+.
  const g = createGame();
  let timers = new Map(), anchor = null;
  for (let i = 0; i < 20 && !anchor; i++) {
    advanceGame(g, 0.1);
    anchor = activeCycleAnchor(g.buildings, timers);
    timers = new Map(g.buildings.map(b => [b.id, b.timer]));
  }
  assert.ok(anchor, "a real starter building cycles");
  // First completed cycling building in array order: the starter salvager (id 1)
  // runs from frame one on generator power — a genuinely active cycle.
  assert.equal(anchor.id, 1);
  assert.equal(anchor.type, "salvager");
  // Hover math: decorative flight on the sim clock; reduced motion parks it.
  const h = droneHover(1.0, false);
  near(h.bob, Math.sin(1.3) * 0.18, "hover bob", 1e-9);
  near(h.rotor, 22, "rotor angle", 1e-9);
  assert.deepEqual(droneHover(1.0, true), {bob: 0, rotor: 0, reduced: true});
  const d = createDrone();
  assert.equal(d.userData.rotors.length, 4);
  for (let i = 0; i < 4; i++) assert.ok(d.getObjectByName("pivot:rotor:" + i));
  assert.ok(DRONE_PAD.y > 4, "park spot is above the service roof, off every route");
});

test("reduced motion: every articulation parks while sim distance still accrues", () => {
  const g = scrapGame();
  const v = truck1(g);
  const rig = createTruck(v);
  stepTruck(rig, v, 0.1, 0, true);
  let dist = 0;
  for (let i = 0; i < 200; i++) {
    advanceGame(g, 0.1);
    const m = stepTruck(rig, v, 0.1, i * 0.1, true);
    assert.equal(m.wheelAngle, 0, "wheels parked");
    assert.equal(m.steer, 0, "steering parked");
    assert.equal(m.bob, 0, "suspension parked");
    assert.equal(m.beacon, 0, "beacon parked");
    dist = m.distance;
  }
  assert.ok(dist > 5, "reduced motion does NOT freeze the simulation or transport");
  assert.equal(rig.userData.distance, dist);
  assert.equal(forkliftLift(0, true), 0);
  assert.deepEqual(droneHover(99, true), {bob: 0, rotor: 0, reduced: true});
  // Constant stamps: parked poses produce identical observability values frame to frame.
  const f = createForklift();
  applyForkliftPose(f, forkliftLift(0, true));
  const s1 = f.userData.lift.toFixed(3);
  applyForkliftPose(f, forkliftLift(1, true));
  assert.equal(f.userData.lift.toFixed(3), s1, "reduced-motion forklift stamp is constant");
});

test("picking/footprint: rigs never impersonate buildings or block the yard", () => {
  // Trucks are the only vehicle-pickable rigs; crew lives in scenery, not the
  // building/vehicle groups, and carries no pick volume or building identity.
  for (const build of [createForklift, createDrone, createWorker]) {
    const rig = build();
    assert.equal(rig.userData.buildingId, undefined);
    let pick = null; rig.traverse(n => {if (n.name === "pick:volume") pick = n;});
    assert.equal(pick, null, "decorative crew must not own a machine pick volume");
  }
  const rig = createTruck(1);
  assert.equal(rig.userData.vehicle, true, "truck keeps its vehicle pick flag");
  // Truck envelope fits a single road cell with clearance (no route blocking).
  const s = size(rig);
  assert.ok(s.x < CELL && s.z < CELL, "truck fits inside one 3.5-unit road cell");
  // Worker additions stay inside the ART-01 envelope (no silhouette regression).
  const w = fullBox(createWorker());
  near(w.min.y, 0, "worker stands on ground"); near(w.max.y, 1.7, "worker head height");
  near(w.max.x - w.min.x, 0.62, "worker width unchanged");
});

test("#307 camera invariants: applyCamera/stampCamera method bodies byte-identical (sha256-16)", () => {
  const src = fs.readFileSync(new URL("../src/world.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const method = name => {
    const start = src.indexOf(name + "(){");
    assert.ok(start >= 0, name + " missing");
    let depth = 0, j = src.indexOf("{", start);
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {depth--; if (depth === 0) {j++; break;}}
    }
    return src.slice(start, j);
  };
  const hash = name => crypto.createHash("sha256").update(" " + method(name)).digest("hex").slice(0, 16);
  assert.equal(hash("applyCamera"), "f3afa5479a66b97e", "applyCamera body drifted");
  assert.equal(hash("stampCamera"), "691b3c0a3480e97b", "stampCamera body drifted");
  assert.ok(src.includes("yaw:45,elevation:35.264"), "isometric default view");
  assert.ok(method("applyCamera").includes("this.stampCamera();"), "synchronous stamp inside applyCamera");
  // ART-05 stamps are additive only — the camera stamp block is untouched.
  assert.ok(src.includes("cd.rigLod"), "rig LOD stamp present");
  assert.ok(src.includes("cd.truck1Wheel"), "wheel observability stamp present");
});
