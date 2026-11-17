// ART-04 (#350): load-bearing validation of the four civic rigs — freight depot,
// trade exchange, signal observatory, parts fabricator.
//
// These tests drive the REAL rendered code path: makeBuilding() geometry from
// src/world.js plus applyArt04() — the exact function World.update() calls — with
// real simulation state (machineStatus/timerDelta from src/art03.js, bayCells
// from src/gridOccupancy.js, g.stats.sold written only by simulation.js sell()).
// The tested pose/status IS the rendered pose/status.
//
// They FAIL on main's pre-ART-04 blockouts (rollback injection proof): main has
// no src/art04.js, no applyArt04 export, no art04 metadata, depot/market share
// one blockout body, and research/fabricator are the same box + mast/boxes.
//
// Two acceptance clauses are proven here against REAL scene graphs:
//  (1) six-rig numeric pairwise silhouette distinctness (occupancy-grid Jaccard
//      distance over the actual makeBuilding meshes — not pixels, not vibes);
//  (2) every loading socket stays reachable: a freight-truck envelope swept
//      along the bay approach corridor (all four rotations) never intersects
//      any rig mesh, with the depot shutter OPEN and pivots at a live pose.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import {BLUEPRINTS, WORLD_SIZE, CELL, STARTER_BUILDINGS} from "../src/content.js";
import {bayCells, worldFootprint} from "../src/gridOccupancy.js";
import {machineDescriptor, MATERIALS, PERFORMANCE_LIMITS, SCALE_REFERENCES} from "../src/voxelSchema.js";

globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding, applyArt04, ART04_TYPES, ART04_MOTION, ART04_DOCK, art04Pose, art04Advance,
  bayApproachDistance, depotDoorLift, FORKLIFT_POST} = await import("../src/world.js");
const {ART04_STATUS_LIGHT, art04HotMaterial} = await import("../src/art04.js");
const {machineStatus, timerDelta} = await import("../src/art03.js");

const TOL = 1e-9;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6, msg + ": " + a + " vs " + b);
const hexOf = key => new THREE.Color(MATERIALS[key].color).getHex();

// Real simulation-shaped fixtures (same fields simulation.js reads/writes).
const bld = (id, type, extra = {}) =>
  ({id, type, x: 4, z: 4, rot: 0, level: 1, remaining: 0, timer: 0, inventory: {}, ...extra});
const game = (buildings, elapsed = 0, extra = {}) => ({buildings, elapsed, vehicles: [], stats: {sold: 0}, ...extra});
const stocked = type => ({...BLUEPRINTS[type].inputs});
const rig = (type, extra = {}) => makeBuilding({id: 99, type, x: WORLD_SIZE / 2 - 0.5, z: WORLD_SIZE / 2 - 0.5, remaining: 0, ...extra}, 0);
const localRig = (type) => { // identity transform: authored local space measurement
  const g = rig(type).group;
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
  return g;
};
const step = (obj, g, b, reducedMotion = false, id = 99) => applyArt04(obj, g, b, reducedMotion, id);
const pivotOf = (obj, id) => obj.group.getObjectByName("pivot:" + id);
const lightOf = obj => obj.art04.statusNodes.light;
const origin = i => (i - WORLD_SIZE / 2 + .5) * CELL;

// ---- Pure status authority: simulation only, never wall time ----

test("research/fabricator status derives ONLY from machineStatus (power grid + real inventory)", () => {
  for (const type of ["research", "fabricator"]) {
    const gen = bld(1, "generator");
    const b = bld(99, type, {inventory: stocked(type)});
    const powered = game([gen, b]);
    assert.equal(machineStatus(powered, b), "working", type);
    assert.equal(art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, powered, b).status, "working");
    const starved = {...b, inventory: {}};
    assert.equal(art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, game([gen, starved]), starved).status, "starved");
    assert.equal(art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, game([starved]), starved).status, "unpowered");
    const asm = {...b, remaining: 3};
    assert.equal(art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, game([asm]), asm).status, "assembling");
  }
});

test("depot status is the REAL nearest-truck bay distance, never a timer", () => {
  const depot = STARTER_BUILDINGS.find(b => b.type === "depot");
  const b = bld(2, "depot", {x: depot.x, z: depot.z, rot: 0});
  const bay = bayCells("depot", b.x, b.z, 0)[0];
  // No trucks => idle, shutter closed, distance Infinity (honest "none").
  let s = art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, game([b]), b);
  assert.equal(s.status, "idle");
  assert.equal(s.truckDistance, Infinity);
  assert.equal(s.advance, 0, "depot has no production cycle — no work clock");
  // Truck exactly on the bay approach cell => docking.
  const atBay = game([b], 0, {vehicles: [{x: bay.x, z: bay.z}]});
  s = art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, atBay, b);
  assert.equal(s.status, "docking");
  near(s.truckDistance, 0, "truck on the bay cell");
  // Far truck => idle again. The lamp follows the truck, not elapsed time.
  const far = game([b], 999, {vehicles: [{x: bay.x, z: bay.z + 4}]});
  s = art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, far, b);
  assert.equal(s.status, "idle");
  near(s.truckDistance, 4 * CELL, "distance is world units to the bay cell center");
  // Nearest of several trucks wins; other buildings' trucks count too (real yard).
  const two = game([b], 0, {vehicles: [{x: bay.x, z: bay.z + 3}, {x: bay.x + 1, z: bay.z}]});
  near(art04Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, two, b).truckDistance, CELL, "nearest truck");
});

test("bayApproachDistance uses the occupancy bay contract for every rotation", () => {
  const b = bld(2, "depot", {x: 10, z: 10});
  for (const rot of [0, 1, 2, 3]) {
    const bay = bayCells("depot", 10, 10, rot)[0];
    const g = game([b], 0, {vehicles: [{x: bay.x, z: bay.z}]});
    const r = bayApproachDistance(g, {...b, rot});
    near(r.distance, 0, "rot " + rot + " truck on declared bay cell");
    near(r.bay.x, origin(bay.x), "bay world x");
    near(r.bay.z, origin(bay.z), "bay world z");
  }
});

test("market lamp reads trading ONLY on a real g.stats.sold increase; beam clock is labelled ambient", () => {
  const b = bld(6, "market");
  let state = {clock: 0, lastTimer: 0, lastElapsed: 0, lastSold: 100};
  // No sale => idle, but the AMBIENT decoration clock still integrates elapsed.
  let g = game([b], 5, {stats: {sold: 100}});
  state = art04Advance(state, g, b);
  assert.equal(state.status, "idle");
  near(state.advance, 5, "ambient clock integrates sim elapsed delta");
  near(state.clock, 5);
  assert.equal(state.load, 1, "load label 1 = declared ambient decoration, no production authority");
  // A real sale (simulation.js sell() is the only writer of stats.sold) => trading.
  g = game([b], 6, {stats: {sold: 140}});
  state = art04Advance(state, g, b);
  assert.equal(state.status, "trading");
  // No further sale => back to idle even though elapsed keeps moving.
  g = game([b], 9, {stats: {sold: 140}});
  state = art04Advance(state, g, b);
  assert.equal(state.status, "idle");
  near(state.clock, 9, "ambient clock never fabricates a sale");
  // Missing stats object is honest idle, never a crash or a fake trade.
  state = art04Advance(state, {buildings: [b], elapsed: 10, vehicles: []}, b);
  assert.equal(state.status, "idle");
});

test("NEGATIVE: starved/unpowered sim timers advance but civic work clocks must NOT", () => {
  for (const type of ["research", "fabricator"]) {
    const gen = bld(1, "generator");
    const b = bld(99, type, {inventory: stocked(type)});
    let g = game([gen, b]);
    let state = {clock: 0, lastTimer: 0, lastElapsed: 0};
    b.timer = 2;
    state = art04Advance(state, g, b);
    assert.equal(state.status, "working");
    near(state.clock, 2, "working clock integrates the sim timer delta");
    // Starve: sim timer STILL advances (simulation.js ticks it), work must not.
    b.inventory = {}; b.timer = 4;
    state = art04Advance(state, g, b);
    assert.equal(state.status, "starved");
    assert.equal(state.advance, 0);
    near(state.clock, 2, "starved clock frozen despite sim timer moving");
    assert.equal(state.lastTimer, 4, "still tracks the sim timer");
    // Unpower: frozen too.
    g = game([b]); b.timer = 4.5;
    state = art04Advance(state, g, b);
    assert.equal(state.status, "unpowered");
    near(state.clock, 2);
    // Restock + repower: resume integrates ONLY the new working delta.
    g = game([gen, b]); b.inventory = stocked(type); b.timer = 5;
    state = art04Advance(state, g, b);
    assert.equal(state.status, "working");
    near(state.clock, 2.5, "no fabricated backlog jump");
    // Wrap-aware: timer %= cycle wrap integrates the small real delta.
    const cycle = BLUEPRINTS[type].cycle;
    b.timer = cycle - 0.1; state = art04Advance(state, g, b);
    b.timer = 0.2; state = art04Advance(state, g, b);
    near(state.clock, 2.5 + 0.3 + (cycle - 0.1 - 5), "wrap-aware integration");
    assert.equal(timerDelta(0, cycle, cycle), 0, "teleport rejected (shared art03 guard)");
  }
});

test("reducedMotion parks civic clocks but keeps tracking sim state (no jump on re-enable)", () => {
  const gen = bld(1, "generator");
  const b = bld(99, "fabricator", {inventory: stocked("fabricator"), timer: 1});
  const g = game([gen, b]);
  let state = {clock: 5, lastTimer: 1, lastElapsed: 0, lastSold: 0};
  b.timer = 3;
  state = art04Advance(state, g, b, true);
  near(state.clock, 5, "reduced motion freezes the clock");
  assert.equal(state.lastTimer, 3, "but tracks the sim timer");
  b.timer = 4;
  state = art04Advance(state, g, b, false);
  near(state.clock, 6, "re-enable integrates only the new delta");
  // Market ambient clock parks too, and still tracks elapsed/sold.
  const m = bld(6, "market");
  let ms = {clock: 2, lastTimer: 0, lastElapsed: 4, lastSold: 7};
  ms = art04Advance(ms, game([m], 9, {stats: {sold: 9}}), m, true);
  near(ms.clock, 2, "ambient clock parked");
  assert.equal(ms.lastElapsed, 9);
  assert.equal(ms.lastSold, 9);
  assert.equal(ms.status, "trading", "status derivation is not motion");
});

// ---- Pure pose + shutter contracts (the rendered pose) ----

test("art04Pose: exact channels, 2:1 counter-rotating gear train, bounded oscillation, parked rest", () => {
  const t = 1.234, id = 7, M = ART04_MOTION;
  const p = art04Pose(t, false, id);
  near(p.dish, t * M.dishSpeed, "dish azimuth");
  near(p.feed, Math.sin(t * M.feedSpeed + id) * M.feedAmp, "feed nod");
  near(p.gear, t * M.gearSpeed, "drive gear");
  near(p.pinion, -t * M.pinionSpeed, "pinion counter-rotates");
  near(Math.abs(p.pinion / p.gear), 2, "2:1 radius/speed ratio");
  near(p.hammer, Math.sin(t * M.hammerSpeed + id) * M.hammerAmp, "trip hammer");
  near(p.scale, Math.sin(t * M.scaleSpeed + id) * M.scaleAmp, "balance beam");
  // awning is the beam's exact second harmonic (2*id) so the pair can never
  // alias at both extrema simultaneously for ANY building id.
  near(p.awning, Math.sin(t * M.awningSpeed + 2 * id) * M.awningAmp, "awning");
  for (const [k, amp] of [["feed", M.feedAmp], ["hammer", M.hammerAmp], ["scale", M.scaleAmp], ["awning", M.awningAmp]])
    assert.ok(Math.abs(p[k]) <= amp + TOL, k + " amplitude bound");
  for (const [k, speed] of [["feed", M.feedSpeed], ["hammer", M.hammerSpeed], ["scale", M.scaleSpeed], ["awning", M.awningSpeed]]) {
    const period = 2 * Math.PI / speed;
    near(art04Pose(t + period, false, id)[k], p[k], k + " period");
  }
  const parked = art04Pose(9.9, true, id);
  for (const v of Object.values(parked)) assert.equal(v, 0, "reduced motion parks every channel");
  for (const v of Object.values(art04Pose(0, false, 0))) assert.ok(v === 0, "t=0 rest pose zero");
});

test("market ambient pair never aliases: combined beam+awning displacement bounded away from zero over any 1.2-1.35 sim window for every id", () => {
  // Regression for the rendered-motion capture FAIL at clock 20.35->21.58:
  // the old 0.5/0.8 independent sinusoids both sat near extrema (combined
  // 0.152 rad, pair meanAbsDiff 0.552 < 1). The 2:1 second-harmonic pair has
  // an id-independent lower bound; sample it densely across phases and ids.
  const M = ART04_MOTION;
  assert.equal(M.awningSpeed, 2 * M.scaleSpeed, "awning is the beam's second harmonic");
  let worst = Infinity;
  for (let id = 0; id <= 24; id++)
    for (let i = 0; i < 400; i++) {
      const c = i / 400 * 25;
      for (const d of [1.2, 1.35]) {
        const a = art04Pose(c, false, id), b = art04Pose(c + d, false, id);
        worst = Math.min(worst, Math.hypot(b.scale - a.scale, b.awning - a.awning));
      }
    }
  assert.ok(worst >= 0.3, "combined ambient displacement lower bound, got " + worst);
});

test("depotDoorLift: monotone distance-driven travel, bounded, closed when far/reduced/no trucks", () => {
  const D = ART04_DOCK;
  assert.equal(depotDoorLift(Infinity), 0, "no trucks => closed");
  assert.equal(depotDoorLift(D.far), 0, "at far threshold => closed");
  assert.equal(depotDoorLift(D.far + 3), 0, "beyond far => closed");
  near(depotDoorLift(D.near), D.travel, "at near threshold => fully open");
  near(depotDoorLift(0), D.travel, "truck on the bay => fully open");
  near(depotDoorLift((D.near + D.far) / 2), D.travel / 2, "linear midpoint");
  let prev = -1;
  for (let d = D.far + 1; d >= 0; d -= 0.1) {
    const l = depotDoorLift(d);
    assert.ok(l >= 0 && l <= D.travel + TOL, "bounded travel");
    assert.ok(l >= prev - TOL, "monotone non-decreasing as truck approaches");
    prev = l;
  }
  assert.equal(depotDoorLift(0, true), 0, "reduced motion parks the shutter CLOSED");
});

// ---- Schema declarations mirror the runtime constants (no drift) ----

test("schema pivot declarations mirror ART04_MOTION + ART04_DOCK exactly (incl. lift vocabulary)", () => {
  const M = ART04_MOTION;
  const want = {
    depot: [["door", "y", "lift", undefined, undefined]],
    market: [["scale", "z", "oscillate", M.scaleSpeed, M.scaleAmp], ["awning", "x", "oscillate", M.awningSpeed, M.awningAmp]],
    research: [["dish", "y", "spin", M.dishSpeed], ["feed", "x", "oscillate", M.feedSpeed, M.feedAmp]],
    fabricator: [["gear", "z", "spin", M.gearSpeed], ["pinion", "z", "spin", -M.pinionSpeed], ["hammer", "x", "oscillate", M.hammerSpeed, M.hammerAmp]]
  };
  for (const type of ART04_TYPES) {
    const desc = machineDescriptor(type);
    assert.deepEqual(desc.pivots.map(p => p.id), want[type].map(w => w[0]), type + " pivot ids");
    desc.pivots.forEach((pv, i) => {
      const [id, axis, kind, speed, amp] = want[type][i];
      assert.equal(pv.node, "pivot:" + id);
      assert.equal(pv.axis, axis, type + "/" + id + " axis");
      assert.equal(pv.motion.kind, kind);
      if (kind === "lift") {
        assert.equal(pv.motion.travel, ART04_DOCK.travel, "shutter travel drift");
        assert.equal(pv.motion.drive, "nearest-truck-bay-distance", "shutter drive must be the real truck signal");
      } else {
        assert.equal(pv.motion.speed, speed, type + "/" + id + " speed drift");
        if (kind === "oscillate") assert.equal(pv.motion.amplitude, amp, type + "/" + id + " amplitude drift");
      }
      assert.ok(pv.swingRadius > 0 && pv.swingRadius <= SCALE_REFERENCES.maxAnimatedReach, "swing radius bounded");
      assert.ok(Math.abs(pv.offset[0]) <= desc.bounds.width / 2 + TOL, "pivot x inside envelope");
      assert.ok(Math.abs(pv.offset[2]) <= desc.bounds.depth / 2 + TOL, "pivot z inside envelope");
      assert.ok(pv.offset[1] >= 0 && pv.offset[1] <= desc.bounds.height + 0.5, "pivot y bounded");
      for (const part of pv.parts) assert.ok(MATERIALS[part.material], "pivot part material registered");
    });
    assert.ok(desc.budget.maxMeshes <= PERFORMANCE_LIMITS.maxMeshesPerMachine, type + " global mesh cap");
    assert.ok(desc.budget.maxTriangles <= PERFORMANCE_LIMITS.maxTrianglesPerMachine, type + " global tri cap");
    for (const part of desc.parts) assert.ok(MATERIALS[part.material] || part.material === "canvas-text", "part material registered");
  }
  // The feed horn is NESTED under the dish — declared parent, real parent.
  const feed = machineDescriptor("research").pivots.find(p => p.id === "feed");
  assert.equal(feed.parent, "pivot:dish");
  assert.equal(pivotOf(rig("research"), "feed").parent.name, "pivot:dish");
  // Market ambient channels are explicitly labelled (no production authority).
  for (const pv of machineDescriptor("market").pivots)
    assert.equal(pv.motion.drive, "ambient-elapsed", "market motion must be declared ambient");
});

test("footprint, frontage/bay port, status light and pick contract UNCHANGED for all four civic rigs", () => {
  const ref = machineDescriptor("salvager"); // untouched by ART-04 — the contract reference
  for (const type of ART04_TYPES) {
    const desc = machineDescriptor(type);
    assert.deepEqual(desc.footprint, ref.footprint, type + " footprint unchanged (1 cell, CELL world, PAD pad)");
    assert.deepEqual(desc.frontage, ref.frontage, type + " frontage/bay/status port unchanged");
    assert.deepEqual(desc.pick.size, [CELL, desc.pick.size[1], CELL], type + " pick spans the cell");
    assert.equal(desc.pick.center[1], desc.pick.size[1] / 2, "pick grounded");
    assert.ok(desc.pick.size[1] >= desc.bounds.height, "pick encloses static height");
    const obj = rig(type);
    assert.deepEqual(obj.group.userData.voxel.footprint, desc.footprint, "rendered userData footprint");
    assert.deepEqual(obj.group.userData.voxel.frontage, desc.frontage, "rendered userData frontage");
    const pick = obj.group.getObjectByName("pick:volume");
    assert.deepEqual([...pick.scale], desc.pick.size, "rendered pick volume");
    assert.equal(pick.material.visible, false, "pick never renders");
    const bay = obj.group.getObjectByName("port:loading-bay");
    assert.ok(bay, type + " loading bay port exists");
    near(bay.position.z, CELL * 0.37, type + " bay offset unchanged");
    near(bay.position.y, 0.11, type + " bay height unchanged");
    assert.deepEqual([bay.scale.x, bay.scale.z], [1.22, 0.42], type + " bay size unchanged");
    const status = obj.group.getObjectByName("status:light");
    assert.deepEqual([...status.position], [1.28, 0.95, 1.25], type + " status light position unchanged");
    assert.ok(obj.art04 && obj.art04.statusNodes.light === status, type + " art04 metadata owns the light");
  }
  // Research is SHORTER than the old 4.925 mast — height-aware picking improves.
  assert.ok(machineDescriptor("research").pick.size[1] < 4.925, "research pick height must shrink vs old mast");
  assert.ok(machineDescriptor("research").bounds.height < 4.925, "research static height must shrink");
});

// ---- Real scene graph: status materials, pool ownership, negatives ----

test("scene graph: every civic status is materially distinguishable via the REAL applyArt04 path", () => {
  const gen = bld(1, "generator");
  const cases = {
    depot: [["docking", g => g, b => {}], ["idle", g => g, b => {}]],
    market: [["trading", g => g, b => {}], ["idle", g => g, b => {}]],
    research: [["working", g => g, b => {}], ["starved", g => g, b => {b.inventory = {};}], ["unpowered", g => game([b]), b => {b.inventory = stocked("research");}]],
    fabricator: [["working", g => g, b => {}], ["starved", g => g, b => {b.inventory = {};}], ["unpowered", g => game([b]), b => {b.inventory = stocked("fabricator");}]]
  };
  for (const type of ART04_TYPES) {
    const obj = rig(type);
    const b = bld(99, type, {inventory: stocked(type)});
    const seen = {};
    for (const [label] of cases[type]) {
      let g = game([gen, b]);
      let bb = b;
      if (type === "depot") {
        const bay = bayCells("depot", b.x, b.z, 0)[0];
        g = label === "docking" ? game([b], 0, {vehicles: [{x: bay.x, z: bay.z}]}) : game([b]);
      } else if (type === "market") {
        g = game([b], 1, {stats: {sold: label === "trading" ? 5 : 0}});
        obj.a04 = {clock: 0, lastTimer: 0, lastElapsed: 0, lastSold: 0}; // fresh observer sees the sale
      } else {
        if (label === "starved") bb = {...b, inventory: {}};
        if (label === "unpowered") {g = game([bb]); bb = {...b, inventory: stocked(type)};}
      }
      const stamp = step(obj, g, bb);
      assert.equal(stamp.status, label, type + " derived status");
      assert.equal(lightOf(obj).material.color.getHex(), hexOf(ART04_STATUS_LIGHT[label]), type + " light material in " + label);
      const win = obj.art04.statusNodes.window;
      if (win) assert.equal(win.material.color.getHex(), hexOf(art04HotMaterial(label)), type + " window material in " + label);
      seen[label] = [lightOf(obj).material.color.getHex(), ...(win ? [win.material.color.getHex()] : [])];
    }
    const keys = Object.keys(seen);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++)
      assert.notDeepEqual(seen[keys[i]], seen[keys[j]], type + " " + keys[i] + " vs " + keys[j] + " must look different");
  }
});

test("NEGATIVE in the real graph: starved/unpowered freeze pivots; working renders the pure pose", () => {
  const gen = bld(1, "generator");
  for (const type of ["research", "fabricator"]) {
    const obj = rig(type);
    const b = bld(99, type, {inventory: stocked(type)});
    const g = game([gen, b], 10);
    step(obj, g, b); // initialize from CURRENT sim timers — no fabricated backlog
    b.timer = 2;
    const work = step(obj, g, b);
    assert.equal(work.status, "working");
    assert.ok(work.clock > 0, type + " work clock advanced");
    const pose = art04Pose(work.clock, false, 99);
    const roles = {research: ["dish", "feed"], fabricator: ["gear", "pinion", "hammer"]};
    machineDescriptor(type).pivots.forEach((pv, i) => {
      near(pivotOf(obj, pv.id).rotation[pv.axis], pose[roles[type][i]], type + "/" + pv.id + " rendered angle = pure pose");
    });
    const frozen = machineDescriptor(type).pivots.map(p => pivotOf(obj, p.id).rotation.clone());
    b.inventory = {}; b.timer = 4; // sim timer STILL advances while starved
    const neg = step(obj, g, b);
    assert.equal(neg.status, "starved");
    near(neg.clock, work.clock, type + " clock frozen while starved");
    machineDescriptor(type).pivots.forEach((pv, i) => {
      assert.deepEqual([...pivotOf(obj, pv.id).rotation.toArray()], [...frozen[i].toArray()], type + "/" + pv.id + " frozen");
    });
    b.timer = 5;
    const dead = step(obj, game([b]), b); // no generator => unpowered
    assert.equal(dead.status, "unpowered");
    machineDescriptor(type).pivots.forEach((pv, i) => {
      assert.deepEqual([...pivotOf(obj, pv.id).rotation.toArray()], [...frozen[i].toArray()], type + "/" + pv.id + " frozen unpowered");
    });
  }
});

test("depot shutter in the REAL graph follows the truck; market lamp follows real sales", () => {
  const depot = STARTER_BUILDINGS.find(b => b.type === "depot");
  const obj = rig("depot");
  const b = bld(2, "depot", {x: depot.x, z: depot.z, rot: 0});
  const bay = bayCells("depot", b.x, b.z, 0)[0];
  const door = pivotOf(obj, "door");
  // Far yard: closed.
  let stamp = step(obj, game([b], 0, {vehicles: [{x: bay.x, z: bay.z + 4}]}), b);
  assert.equal(stamp.status, "idle");
  near(stamp.door, 0, "shutter closed with no truck near");
  near(door.position.y, door.userData.baseY, "rendered shutter at rest");
  // Truck approaches: partial lift, monotone.
  stamp = step(obj, game([b], 1, {vehicles: [{x: bay.x, z: bay.z + 1}]}), b);
  const partial = stamp.door;
  assert.ok(partial > 0 && partial < ART04_DOCK.travel, "partial lift mid-approach");
  near(door.position.y, door.userData.baseY + partial, "rendered shutter = pure lift");
  // Truck on the bay: fully open, docking lamp.
  stamp = step(obj, game([b], 2, {vehicles: [{x: bay.x, z: bay.z}]}), b);
  assert.equal(stamp.status, "docking");
  near(stamp.door, ART04_DOCK.travel, "fully open at the bay");
  near(door.position.y, door.userData.baseY + ART04_DOCK.travel, "rendered open shutter");
  assert.equal(lightOf(obj).material.color.getHex(), hexOf("lights"), "docking lamp lit");
  // Truck leaves: closes again — no timer keeps it open.
  stamp = step(obj, game([b], 3, {vehicles: [{x: bay.x, z: bay.z + 4}]}), b);
  near(stamp.door, 0, "shutter closes when the truck leaves");
  assert.equal(lightOf(obj).material.color.getHex(), hexOf("statusIdle"), "idle lamp");
  // Open shutter top stays under the pick/roof envelope (no sky punch-through).
  const openTop = door.userData.baseY + ART04_DOCK.travel + 1.04;
  assert.ok(openTop <= machineDescriptor("depot").pick.size[1] + TOL, "open shutter inside pick envelope");
  // Market: trading lamp only on a real sold delta, ambient beam keeps moving.
  const m = rig("market");
  const mb = bld(6, "market");
  m.a04 = {clock: 0, lastTimer: 0, lastElapsed: 0, lastSold: 10};
  let ms = step(m, game([mb], 1, {stats: {sold: 10}}), mb);
  assert.equal(ms.status, "idle");
  ms = step(m, game([mb], 2, {stats: {sold: 35}}), mb);
  assert.equal(ms.status, "trading");
  assert.equal(lightOf(m).material.color.getHex(), hexOf("lights"), "trading lamp");
  assert.ok(ms.clock > 0, "ambient beam clock advanced");
  near(pivotOf(m, "scale").rotation.z, art04Pose(ms.clock, false, 99).scale, "rendered beam = pure ambient pose");
  ms = step(m, game([mb], 3, {stats: {sold: 35}}), mb);
  assert.equal(ms.status, "idle", "no new sale => idle even though elapsed moved");
  assert.equal(lightOf(m).material.color.getHex(), hexOf("statusIdle"));
});

test("material pool ownership: civic status swaps reassign registered entries, never mutate the pool", () => {
  const probe = rig("fabricator");
  const poolMats = new Set();
  probe.group.traverse(n => {if (n.isMesh && n.name !== "pick:volume") poolMats.add(n.material);});
  const snapshot = [...poolMats].map(m => [m.uuid, m.color.getHex(), m.emissive ? m.emissive.getHex() : null, m.emissiveIntensity ?? null]);
  const gen = bld(1, "generator");
  const b = bld(99, "fabricator", {inventory: stocked("fabricator")});
  const g = game([gen, b]);
  for (let i = 0; i < 3; i++) {
    b.timer = i + 1; step(probe, g, b);
    b.inventory = {}; step(probe, g, b);
    b.inventory = stocked("fabricator");
  }
  step(probe, game([b]), b); // unpowered
  for (const [uuid, color, emissive, intensity] of snapshot) {
    const m = [...poolMats].find(x => x.uuid === uuid);
    assert.equal(m.color.getHex(), color, "pool colour mutated");
    assert.equal(m.emissive ? m.emissive.getHex() : null, emissive, "pool emissive mutated");
    assert.equal(m.emissiveIntensity ?? null, intensity, "pool emissiveIntensity mutated");
  }
  // Shared identity across civic rigs in the same status; no new materials.
  const other = rig("research");
  const rb = bld(98, "research", {inventory: stocked("research")});
  step(probe, game([gen, b, rb]), b);
  step(other, game([gen, b, rb]), rb);
  assert.equal(lightOf(probe).material, lightOf(other).material, "status light material shared, not cloned");
  assert.equal(probe.art04.statusNodes.window.material, other.art04.statusNodes.window.material, "hot material shared");
  const legal = new Set(Object.values(MATERIALS).map(m => new THREE.Color(m.color).getHex()));
  for (const type of ART04_TYPES) localRig(type).traverse(n => {
    if (!n.isMesh || n.name === "pick:volume" || n.material.map) return; // signage canvas exempt
    assert.ok(legal.has(n.material.color.getHex()), type + " unregistered material on " + n.name);
  });
});

test("reduced motion in the REAL civic path: pivots parked, shutter closed, status colours still apply", () => {
  const gen = bld(1, "generator");
  for (const type of ART04_TYPES) {
    const obj = rig(type);
    const b = bld(99, type, {inventory: stocked(type), timer: 2});
    let g = game([gen, b], 10);
    if (type === "depot") {
      const bay = bayCells("depot", b.x, b.z, 0)[0];
      g = game([b], 10, {vehicles: [{x: bay.x, z: bay.z}]});
    }
    if (type === "market") {g = game([b], 10, {stats: {sold: 5}}); obj.a04 = {clock: 0, lastTimer: 0, lastElapsed: 0, lastSold: 0};}
    const stamp = step(obj, g, b, true);
    const wantStatus = type === "depot" ? "docking" : type === "market" ? "trading" : "working";
    assert.equal(stamp.status, wantStatus, "status derivation is not motion — still derived");
    for (const pv of machineDescriptor(type).pivots) {
      if (pv.motion.kind === "lift") continue;
      assert.equal(pivotOf(obj, pv.id).rotation[pv.axis], 0, type + "/" + pv.id + " parked");
    }
    if (type === "depot") {
      near(stamp.door, 0, "shutter parked closed under reduced motion");
      near(pivotOf(obj, "door").position.y, pivotOf(obj, "door").userData.baseY, "rendered shutter parked");
    }
    assert.equal(lightOf(obj).material.color.getHex(), hexOf(ART04_STATUS_LIGHT[wantStatus]), "status colour still applies");
  }
});

test("ART-04 budgets: measured mesh/triangle counts inside declared limits", () => {
  for (const type of ART04_TYPES) {
    const desc = machineDescriptor(type);
    let meshes = 0, triangles = 0;
    rig(type).group.traverse(n => {
      if (!n.isMesh || n.name === "pick:volume" || !n.material.visible) return;
      meshes++;
      triangles += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
    });
    assert.ok(meshes <= desc.budget.maxMeshes, type + " meshes " + meshes + " > " + desc.budget.maxMeshes);
    assert.ok(triangles <= desc.budget.maxTriangles, type + " tris " + triangles + " > " + desc.budget.maxTriangles);
    assert.ok(meshes >= 24, type + " rig too sparse to read as a functional building (" + meshes + " meshes)");
  }
});

// ---- Acceptance (1): six-rig numeric pairwise silhouette distinctness ----

// Occupancy-grid signature of the REAL makeBuilding graph (all meshes at rest
// pose, pick volume excluded): 14x20x14 voxels over the cell box. Pairwise
// metric = Jaccard distance of the occupied voxel sets (0 = identical, 1 =
// disjoint). This is a geometry metric over actual source meshes — not pixels.
const GX = 14, GY = 20, GZ = 14, X0 = -1.75, Y0 = 0, Z0 = -1.75;
const SX = 3.5 / GX, SY = 5 / GY, SZ = 3.5 / GZ;
function signature(group) {
  group.updateWorldMatrix(true, true);
  const bits = new Uint8Array(GX * GY * GZ);
  group.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume") return;
    const bb = new THREE.Box3().setFromObject(n);
    const i0 = Math.max(0, Math.floor((bb.min.x - X0) / SX)), i1 = Math.min(GX - 1, Math.floor((bb.max.x - X0) / SX));
    const j0 = Math.max(0, Math.floor((bb.min.y - Y0) / SY)), j1 = Math.min(GY - 1, Math.floor((bb.max.y - Y0) / SY));
    const k0 = Math.max(0, Math.floor((bb.min.z - Z0) / SZ)), k1 = Math.min(GZ - 1, Math.floor((bb.max.z - Z0) / SZ));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++)
      bits[(i * GY + j) * GZ + k] = 1;
  });
  return bits;
}
function jaccardDistance(a, b) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {if (a[i] | b[i]) union++; if (a[i] & b[i]) inter++;}
  return union ? 1 - inter / union : 0;
}

test("six rig silhouettes are pairwise numerically distinct (occupancy Jaccard over real meshes)", () => {
  const six = ["depot", "market", "research", "fabricator", "salvager", "crusher"];
  const sigs = Object.fromEntries(six.map(t => [t, signature(localRig(t))]));
  let min = Infinity, minPair = "";
  const matrix = {};
  for (let i = 0; i < six.length; i++) for (let j = i + 1; j < six.length; j++) {
    const d = jaccardDistance(sigs[six[i]], sigs[six[j]]);
    matrix[six[i] + "/" + six[j]] = +d.toFixed(4);
    if (d < min) {min = d; minPair = six[i] + "/" + six[j];}
  }
  // Every pair meaningfully non-zero — no two rigs read as the same silhouette.
  // Measured at implementation: min 0.1741 (fabricator/salvager), depot/market
  // 0.1776. Floor 0.15 leaves ~16% headroom. The metric is conservative: both
  // rigs of a pair are single-cell halls, so AABB volume occupancy overlaps by
  // construction; on main the depot/market pair shares ONE blockout body and
  // scores near zero (rollback proof). The 96px rendered-clip pairMetrics in
  // scripts/capture-art04.mjs are the independent second metric.
  assert.ok(matrix["depot/market"] >= 0.15, "depot vs market distinctness " + matrix["depot/market"] + " < 0.15 (smoking-gun pair)");
  assert.ok(min >= 0.15, "minimum pairwise distinctness " + min.toFixed(4) + " (" + minPair + ") < 0.15; matrix " + JSON.stringify(matrix));
  // The four civic rigs also differ in height and mesh density (secondary features).
  const heights = Object.fromEntries(ART04_TYPES.map(t => [t, machineDescriptor(t).bounds.height]));
  assert.equal(new Set(Object.values(heights)).size, 4, "four distinct civic heights");
});

// ---- Acceptance (2): every loading socket reachable by an approaching truck ----

test("freight truck envelope sweeps every bay approach corridor without hitting any rig mesh", () => {
  const T = SCALE_REFERENCES.truck; // 1.2 wide x 1.35 high x 2.05 long
  const halfW = T.width / 2, halfL = T.length / 2;
  const meshBoxes = (group) => {
    group.updateWorldMatrix(true, true);
    const boxes = [];
    group.traverse(n => {
      if (!n.isMesh || n.name === "pick:volume") return;
      boxes.push(new THREE.Box3().setFromObject(n));
    });
    return boxes;
  };
  for (const type of ART04_TYPES) {
    for (const rot of [0, 1, 2, 3]) {
      const b = {id: 99, type, x: 10, z: 10, rot, remaining: 0, timer: 0, inventory: {}};
      const obj = makeBuilding(b, 0);
      // Live pose: pivots at a non-zero work-clock angle; depot shutter OPEN.
      const pose = art04Pose(2.5, false, 99);
      for (const p of obj.parts) if (p.kind === "a04") p.node.rotation[p.axis] = pose[p.role];
      if (obj.art04.door) obj.art04.door.position.y = obj.art04.door.userData.baseY + ART04_DOCK.travel;
      const boxes = meshBoxes(obj.group);
      const bay = bayCells(type, 10, 10, rot)[0];
      const bx = origin(bay.x), bz = origin(bay.z);
      const wf = worldFootprint(type, 10, 10, rot);
      // Approach corridor: the truck drives in from the road side and stops at
      // the bay approach cell (LOG-02 #382 socket contract; ART-05 forklift does
      // the last leg). The corridor therefore runs OUTWARD from the bay center,
      // away from the footprint. The foundation pad (top y=0.4) sits inside the
      // building's OWN footprint cell — road routing + checkSite keep trucks out
      // of it, so the sweep covers bay center -> 3 cells out, the real approach.
      const dx = bx - wf.pivot.x, dz = bz - wf.pivot.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      const alongX = Math.abs(ux) > Math.abs(uz);
      // At the stop point the truck nose must still clear the pad edge.
      const noseGap = len - halfL - CELL * 0.87 / 2;
      assert.ok(noseGap > 0, type + " rot " + rot + " truck nose overlaps foundation pad at the bay stop (gap " + noseGap + ")");
      for (let t = 0; t <= 3 * CELL + 1e-9; t += 0.25) {
        const cx = bx + ux * t, cz = bz + uz * t;
        const truck = new THREE.Box3(
          new THREE.Vector3(cx - (alongX ? halfL : halfW), 0.22, cz - (alongX ? halfW : halfL)),
          new THREE.Vector3(cx + (alongX ? halfL : halfW), 0.22 + T.height, cz + (alongX ? halfW : halfL)));
        for (const bb of boxes)
          assert.ok(!bb.intersectsBox(truck), type + " rot " + rot + " truck at t=" + t + " hits rig mesh " + JSON.stringify(bb));
      }
      // The bay approach cell itself is clear of rig geometry (checkSite convention).
      const bayBox = new THREE.Box3(
        new THREE.Vector3(bx - CELL / 2, 0.22, bz - CELL / 2),
        new THREE.Vector3(bx + CELL / 2, 0.22 + T.height, bz + CELL / 2));
      for (const bb of boxes) assert.ok(!bb.intersectsBox(bayBox), type + " rot " + rot + " bay cell blocked");
    }
  }
});

test("ART-05 forklift post stays outside the truck corridor at the starter depot bay", () => {
  const depot = STARTER_BUILDINGS.find(b => b.type === "depot");
  const bay = bayCells("depot", depot.x, depot.z, 0)[0];
  assert.deepEqual({...FORKLIFT_POST.bayCell}, {x: bay.x, z: bay.z}, "forklift post owns the same bay cell");
  const lateral = Math.abs(FORKLIFT_POST.x - origin(depot.x));
  const need = SCALE_REFERENCES.truck.width / 2 + SCALE_REFERENCES.forklift.width / 2;
  assert.ok(lateral >= need - TOL, "forklift lateral offset " + lateral + " must clear truck+forklift half-widths " + need);
  // The depot rig itself leaves the forklift's lifted pose clear too (shutter open).
  const obj = makeBuilding({id: depot.id, type: "depot", x: depot.x, z: depot.z, rot: 0, remaining: 0}, 0);
  obj.art04.door.position.y = obj.art04.door.userData.baseY + ART04_DOCK.travel;
  obj.group.updateWorldMatrix(true, true);
  const F = SCALE_REFERENCES.forklift;
  const forkBox = new THREE.Box3(
    new THREE.Vector3(FORKLIFT_POST.x - F.width / 2, 0, FORKLIFT_POST.z - F.length / 2),
    new THREE.Vector3(FORKLIFT_POST.x + F.width / 2, F.height + 0.75, FORKLIFT_POST.z + F.length / 2));
  obj.group.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume") return;
    assert.ok(!new THREE.Box3().setFromObject(n).intersectsBox(forkBox), "depot mesh hits the forklift post envelope");
  });
});

// ---- Wiring + honesty source guards ----

test("update() consumes applyArt04 + observability stamps; camera bodies byte-identical to main", () => {
  const src = fs.readFileSync("src/world.js", "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("applyArt04(obj,g,b,this.reducedMotion,id)"), "update() must call the shared civic application path");
  for (const stamp of ['cd["art04"', "cd.art04Clock", "cd.art04Reduced", "cd.art04Door", "cd.art04BayDist", "cd.art04MarketLoad", '+"Clock"]=art04Stamp[t]'])
    assert.ok(src.includes(stamp), "missing observability stamp " + stamp);
  assert.ok(!src.includes('kind==="depot"||kind==="market"'), "the shared depot/market blockout branch must be GONE");
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

test("honesty source guard: art04.js has no wall clock, no DOM, no THREE; applyArt04 takes no time arg", () => {
  const pure = fs.readFileSync("src/art04.js", "utf8");
  for (const banned of ["Date.now", "performance.now", "new Date", "setTimeout", "setInterval", "requestAnimationFrame", "document", "window.", "three"])
    assert.ok(!pure.includes(banned), "src/art04.js must not reference " + banned);
  const src = fs.readFileSync("src/world.js", "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("export function applyArt04(obj,g,b,reducedMotion,id)"), "applyArt04 signature must not take wall time");
  const start = src.indexOf("export function applyArt04");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert.ok(!/\btime\b/.test(body), "applyArt04 body must not read the wall-clock time parameter");
});
