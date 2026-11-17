// ART-03 (#349): load-bearing validation of the four industrial rigs — turbine
// generator, induction furnace, fuel refinery, alloy foundry.
//
// These tests drive the REAL rendered code path: makeBuilding() geometry from
// src/world.js plus applyArt03() — the exact function World.update() calls — with
// real simulation state (powerStatus + inventory fit from src/simulation.js via
// src/art03.js). The tested pose/status IS the rendered pose/status.
//
// They FAIL on main's pre-ART-03 blobs (rollback injection proof, see
// docs/evidence/349-art-03/prefix-proof.json): main has no src/art03.js, no
// applyArt03 export, no art03 metadata, and the refinery is the old shared box.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import {BLUEPRINTS, WORLD_SIZE} from "../src/content.js";
import {machineDescriptor, MATERIALS, PERFORMANCE_LIMITS} from "../src/voxelSchema.js";

globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding, applyArt03, ART03_TYPES, ART03_MOTION, art03Pose, art03Advance, machineStatus, smokePuff} =
  await import("../src/world.js");
const {ART03_SMOKE, STATUS_MATERIALS, inputsFit, generatorLoad, timerDelta} = await import("../src/art03.js");

const TOL = 1e-9;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6, msg + ": " + a + " vs " + b);
const hexOf = key => new THREE.Color(MATERIALS[key].color).getHex();

// Real simulation-shaped fixtures (same fields simulation.js reads).
const bld = (id, type, extra = {}) =>
  ({id, type, x: 4, z: 4, rot: 0, level: 1, remaining: 0, timer: 0, inventory: {}, ...extra});
const game = (buildings, elapsed = 0) => ({buildings, elapsed});
const stocked = type => ({...BLUEPRINTS[type].inputs});
const rig = (type, extra = {}) => makeBuilding({id: 99, type, x: WORLD_SIZE / 2 - 0.5, z: WORLD_SIZE / 2 - 0.5, remaining: 0, ...extra}, 0);

// Drive the real application path exactly as update() does (lazy a03 init included).
function step(obj, g, b, reducedMotion = false, id = 99) {
  return applyArt03(obj, g, b, reducedMotion, id);
}
const pivotOf = (obj, id) => obj.group.getObjectByName("pivot:" + id);
const emitOf = (obj, id) => obj.group.getObjectByName("emit:" + id);
const lightOf = obj => obj.art03.statusNodes.light;
const hotNodes = obj => ["window", "glow", "ingot"].map(k => obj.art03.statusNodes[k]).filter(Boolean);

// ---- Pure status authority: simulation only ----

test("machineStatus derives ONLY from simulation state (power grid + real inventory)", () => {
  const gen = bld(1, "generator");
  const furnace = bld(2, "furnace", {inventory: stocked("furnace")});
  assert.equal(machineStatus(game([gen, furnace]), furnace), "working");
  const starvedB = {...furnace, inventory: {}};
  assert.equal(machineStatus(game([gen, starvedB]), starvedB), "starved");
  assert.equal(machineStatus(game([furnace]), furnace), "unpowered", "no generator => unpowered");
  const asmB = {...furnace, remaining: 3};
  assert.equal(machineStatus(game([asmB]), asmB), "assembling", "assembly precedes power");
  // Overloaded grid: 5 furnaces demand 15 > supply 12 => unpowered even stocked.
  const five = [gen, ...[2, 3, 4, 5, 6].map(i => bld(i, "furnace", {inventory: stocked("furnace")}))];
  assert.equal(machineStatus(game(five), five[1]), "unpowered");
  // Generator: idle with no demand, working under real load, load = demand/supply.
  assert.equal(machineStatus(game([gen]), gen), "idle");
  assert.equal(machineStatus(game([gen, furnace]), gen), "working");
  near(generatorLoad(game([gen, furnace])).load, 3 / 12, "generator load fraction");
  near(generatorLoad(game(five)).load, 1, "load capped at 1");
  // Cycle-0 non-generator utility stays idle.
  assert.equal(machineStatus(game([gen, bld(7, "depot")]), bld(7, "depot")), "idle");
  assert.equal(machineStatus(game([]), bld(8, "no-such-type")), "idle");
  // inputsFit mirrors simulation.js fits epsilon (1e-7) exactly.
  assert.ok(inputsFit({iron: 5 - 5e-8, fuel: 2}, BLUEPRINTS.furnace.inputs), "within sim epsilon");
  assert.ok(!inputsFit({iron: 4.9, fuel: 2}, BLUEPRINTS.furnace.inputs), "short input must not fit");
  assert.ok(!inputsFit(undefined, BLUEPRINTS.furnace.inputs), "missing bag must not fit");
});

test("timerDelta is wrap-aware and rejects resets instead of fabricating work", () => {
  near(timerDelta(1, 3, 5.5), 2, "plain advance");
  near(timerDelta(5.4, 0.2, 5.5), 0.3, "one sim wrap (timer %= cycle)");
  assert.equal(timerDelta(0, 5.5, 5.5), 0, "delta >= cycle rejected");
  assert.equal(timerDelta(3, 9, 5.5), 0, "teleport rejected");
  assert.equal(timerDelta(1, 2, 0), 0, "no cycle => no work");
  assert.equal(timerDelta(undefined, undefined, 5.5), 0, "missing timers => 0");
});

test("NEGATIVE: starved sim timers advance but the work clock must NOT (no smoke, frozen pivots)", () => {
  const gen = bld(1, "generator");
  const b = bld(2, "furnace", {inventory: stocked("furnace")});
  let g = game([gen, b]);
  let state = {clock: 0, lastTimer: 0, lastElapsed: 0};
  // Working step: sim timer advances 2s => work clock advances 2s.
  b.timer = 2;
  state = art03Advance(state, g, b);
  assert.equal(state.status, "working");
  near(state.clock, 2, "working clock integrates sim delta");
  // Starve it: simulation STILL advances the timer (it just produces nothing).
  b.inventory = {};
  b.timer = 4;
  state = art03Advance(state, g, b);
  assert.equal(state.status, "starved");
  assert.equal(state.advance, 0, "starved advance must be 0");
  near(state.clock, 2, "starved clock frozen despite sim timer moving");
  assert.equal(state.lastTimer, 4, "starved step still tracks the sim timer");
  // Unpower it: frozen too.
  g = game([b]);
  b.timer = 4.5;
  state = art03Advance(state, g, b);
  assert.equal(state.status, "unpowered");
  near(state.clock, 2, "unpowered clock frozen");
  // Restock + repower: work resumes from the tracked timer, no fabricated jump.
  g = game([gen, b]);
  b.inventory = stocked("furnace");
  b.timer = 5;
  state = art03Advance(state, g, b);
  assert.equal(state.status, "working");
  near(state.clock, 2.5, "resume integrates only the new working delta");
  // Assembling never works.
  b.remaining = 2;
  const asm = art03Advance(state, g, b);
  assert.equal(asm.status, "assembling");
  assert.equal(asm.advance, 0);
});

test("generator work clock integrates elapsed delta x REAL load fraction", () => {
  const gen = bld(1, "generator");
  const furnace = bld(2, "furnace", {inventory: stocked("furnace")});
  let state = {clock: 0, lastTimer: 0, lastElapsed: 0};
  state = art03Advance(state, game([gen, furnace], 4), gen);
  assert.equal(state.status, "working");
  near(state.advance, 4 * (3 / 12), "elapsed x load");
  near(state.clock, 1, "generator clock");
  // Idle generator (no demand): clock parked.
  const idle = art03Advance({clock: 0, lastTimer: 0, lastElapsed: 0}, game([gen], 9), gen);
  assert.equal(idle.status, "idle");
  assert.equal(idle.advance, 0);
});

test("reducedMotion parks the work clock but keeps tracking sim timers (no jump on re-enable)", () => {
  const gen = bld(1, "generator");
  const b = bld(2, "furnace", {inventory: stocked("furnace"), timer: 1});
  const g = game([gen, b]);
  let state = {clock: 5, lastTimer: 1, lastElapsed: 0};
  b.timer = 3;
  state = art03Advance(state, g, b, true);
  near(state.clock, 5, "reduced motion freezes clock");
  assert.equal(state.lastTimer, 3, "but tracks the sim timer");
  b.timer = 4;
  state = art03Advance(state, g, b, false);
  near(state.clock, 6, "re-enable integrates only the new delta, never the parked backlog");
});

// ---- Pure pose + smoke contracts (the rendered pose) ----

test("art03Pose: exact channels, counter-rotating turbine, bounded oscillation, parked rest", () => {
  const t = 1.234, id = 7, M = ART03_MOTION;
  const p = art03Pose(t, false, id);
  near(p.fan, t * M.fanSpeed, "fan");
  near(p.turbine, -t * M.turbineSpeed, "turbine counter-rotates");
  near(p.blower, t * M.blowerSpeed, "blower");
  near(p.foundryFan, t * M.foundryFanSpeed, "foundry fan");
  near(p.pump, t * M.pumpSpeed, "pump");
  near(p.charge, Math.sin(t * M.chargeSpeed + id) * M.chargeAmp, "charge flap");
  near(p.crucible, Math.sin(t * M.crucibleSpeed + id) * M.crucibleAmp, "crucible tilt");
  near(p.valve, Math.sin(t * M.valveSpeed + id) * M.valveAmp, "valve wheel");
  near(p.pulse, Math.sin(t * M.pulseSpeed + id) * M.pulseAmp, "heat pulse");
  for (const [k, amp] of [["charge", M.chargeAmp], ["crucible", M.crucibleAmp], ["valve", M.valveAmp], ["pulse", M.pulseAmp]])
    assert.ok(Math.abs(p[k]) <= amp + TOL, k + " amplitude bound");
  // Exact periodicity of oscillating channels.
  for (const [k, speed] of [["charge", M.chargeSpeed], ["crucible", M.crucibleSpeed], ["valve", M.valveSpeed]]) {
    const period = 2 * Math.PI / speed;
    near(art03Pose(t + period, false, id)[k], p[k], k + " period");
  }
  const parked = art03Pose(9.9, true, id);
  for (const v of Object.values(parked)) assert.equal(v, 0, "reduced motion parks every channel");
  for (const v of Object.values(art03Pose(0, false, 0))) assert.ok(v === 0, "t=0 rest pose zero");
});

test("smokePuff: deterministic periodic rise + shrink, wraps negative phases", () => {
  const S = ART03_SMOKE;
  for (const phase of [-3.25, 0, 0.4, 1, 7.7]) {
    for (let i = 0; i < S.count; i++) {
      const s = smokePuff(phase, i);
      assert.ok(s.y >= 0 && s.y < S.rise + TOL, "rise bounded");
      assert.ok(s.s > 0 && s.s <= S.base + TOL, "scale bounded");
      const wrapped = smokePuff(phase + 1, i);
      near(s.y, wrapped.y, "period 1 in phase (y)");
      near(s.s, wrapped.s, "period 1 in phase (s)");
    }
  }
  const a = smokePuff(0.1, 0), b = smokePuff(0.6, 0);
  assert.ok(b.y > a.y && b.s < a.s, "later phase rises and shrinks");
  near(smokePuff(-0.25, 0).y, smokePuff(0.75, 0).y, "negative phase wraps (y)");
  near(smokePuff(-0.25, 0).s, smokePuff(0.75, 0).s, "negative phase wraps (s)");
});

// ---- Schema declarations mirror the runtime constants (no drift) ----

test("schema pivot/emission/animation declarations mirror ART03_MOTION + ART03_SMOKE exactly", () => {
  const M = ART03_MOTION;
  const want = {
    generator: [["spin", "y", "spin", M.fanSpeed], ["turbine", "z", "spin", -M.turbineSpeed]],
    furnace: [["charge", "x", "oscillate", M.chargeSpeed, M.chargeAmp], ["blower", "x", "spin", M.blowerSpeed]],
    foundry: [["crucible", "x", "oscillate", M.crucibleSpeed, M.crucibleAmp], ["fan", "y", "spin", M.foundryFanSpeed]],
    refinery: [["pump", "x", "spin", M.pumpSpeed], ["valve", "y", "oscillate", M.valveSpeed, M.valveAmp]]
  };
  for (const type of ART03_TYPES) {
    const desc = machineDescriptor(type);
    assert.deepEqual(desc.pivots.map(p => p.id), want[type].map(w => w[0]), type + " pivot ids");
    desc.pivots.forEach((pv, i) => {
      const [id, axis, kind, speed, amp] = want[type][i];
      assert.equal(pv.node, "pivot:" + id);
      assert.equal(pv.axis, axis, type + "/" + id + " axis");
      assert.equal(pv.motion.kind, kind);
      assert.equal(pv.motion.speed, speed, type + "/" + id + " speed drift");
      if (kind === "oscillate") assert.equal(pv.motion.amplitude, amp, type + "/" + id + " amplitude drift");
      assert.ok(pv.swingRadius > 0 && pv.swingRadius <= 5.25, "swing radius bounded");
    });
    // Every pivot offset must sit inside the static pad envelope (x/z) and under height+0.5.
    for (const pv of desc.pivots) {
      assert.ok(Math.abs(pv.offset[0]) <= desc.bounds.width / 2 + TOL, "pivot x inside pad");
      assert.ok(Math.abs(pv.offset[2]) <= desc.bounds.depth / 2 + TOL, "pivot z inside pad");
      assert.ok(pv.offset[1] <= desc.bounds.height + 0.5, "pivot y bounded");
    }
    // Emissions declared with real offsets/puffs/material; flare flagged on refinery.
    assert.ok(desc.emissions.length >= 1, type + " must declare emission points");
    for (const em of desc.emissions) {
      assert.ok(em.node.startsWith("emit:"), "emission node naming");
      assert.equal(em.puffs, em.flare ? 1 : ART03_SMOKE.count);
      assert.ok(MATERIALS[em.material], "emission material registered");
    }
    assert.ok(desc.statusSurfaces.light === "status:light", type + " status light declared");
    if (type === "furnace" || type === "foundry") {
      assert.equal(desc.animations[0].kind, "pulse");
      assert.equal(desc.animations[0].amplitude, M.pulseAmp);
      assert.equal(desc.animations[0].speed, M.pulseSpeed);
    }
    assert.ok(desc.budget.maxMeshes <= PERFORMANCE_LIMITS.maxMeshesPerMachine, type + " global mesh cap");
    assert.ok(desc.budget.maxTriangles <= PERFORMANCE_LIMITS.maxTrianglesPerMachine, type + " global tri cap");
  }
  const flare = machineDescriptor("refinery").emissions.find(e => e.node === "emit:flare");
  assert.ok(flare && flare.flare === true && flare.material === "furnace", "refinery flare declaration");
});

test("footprint, frontage/bay port and pick contract UNCHANGED for all four rigs", () => {
  const ref = machineDescriptor("salvager"); // untouched by ART-03 — the contract reference
  for (const type of ART03_TYPES) {
    const desc = machineDescriptor(type);
    assert.deepEqual(desc.footprint, ref.footprint, type + " footprint unchanged (1 cell, CELL world, PAD pad)");
    assert.deepEqual(desc.frontage, ref.frontage, type + " frontage/bay/status port unchanged");
    assert.deepEqual(desc.pick.size, [3.5, desc.pick.size[1], 3.5], type + " pick spans the cell");
    assert.equal(desc.pick.center[1], desc.pick.size[1] / 2, "pick grounded");
    assert.equal(desc.bounds.width, desc.footprint.pad[0], "bounds width = pad");
    assert.equal(desc.bounds.depth, desc.footprint.pad[1], "bounds depth = pad");
    const obj = rig(type);
    assert.deepEqual(obj.group.userData.voxel.footprint, desc.footprint, "rendered userData footprint");
    assert.deepEqual(obj.group.userData.voxel.frontage, desc.frontage, "rendered userData frontage");
    const pick = obj.group.getObjectByName("pick:volume");
    assert.deepEqual([...pick.scale], desc.pick.size, "rendered pick volume");
    assert.equal(pick.material.visible, false, "pick never renders");
  }
});

// ---- Real scene graph: independent pivots, status materials, emissions ----

test("pivots are independent objects with their own transforms at declared offsets", () => {
  for (const type of ART03_TYPES) {
    const obj = rig(type), desc = machineDescriptor(type);
    const nodes = desc.pivots.map(p => pivotOf(obj, p.id));
    assert.equal(new Set(nodes).size, nodes.length, type + " pivots must be distinct objects");
    desc.pivots.forEach((pv, i) => {
      const n = nodes[i];
      assert.ok(n && n.isObject3D && !n.isMesh, type + "/" + pv.id + " is a transform group");
      assert.deepEqual([...n.position], pv.offset, type + "/" + pv.id + " offset");
      assert.equal(n.parent, obj.group, type + "/" + pv.id + " hangs off the rig root (independent)");
    });
    // Rotating one pivot must not move another's world position.
    obj.group.updateWorldMatrix(true, true);
    const before = nodes.map(n => n.getWorldPosition(new THREE.Vector3()).toArray());
    nodes[0].rotation[nodes[0].userData.axis || desc.pivots[0].axis] = 1.1;
    obj.group.updateWorldMatrix(true, true);
    nodes.forEach((n, i) => {
      if (i === 0) return;
      assert.deepEqual(n.getWorldPosition(new THREE.Vector3()).toArray(), before[i], type + " pivot " + i + " unaffected");
    });
    // parts metadata drives update(): kind a03, role + axis per pivot.
    const a03parts = obj.parts.filter(p => p.kind === "a03");
    assert.equal(a03parts.length, desc.pivots.length, type + " a03 part count");
  }
});

test("scene graph: working / starved / unpowered are materially distinguishable via the REAL applyArt03 path", () => {
  for (const type of ART03_TYPES) {
    const obj = rig(type);
    const gen = bld(1, "generator");
    // A real consumer keeps the grid loaded (the generator itself needs demand).
    const consumer = bld(2, "furnace", {inventory: stocked("furnace")});
    const b = bld(99, type, {inventory: stocked(type)});
    const powered = game([gen, consumer, b]);
    // Cycling rigs: working/starved/unpowered. The generator has no recipe inputs;
    // its honest negative state is idle (zero demand), never starved/unpowered.
    const states = type === "generator"
      ? [["working", powered, () => {}], ["idle", game([gen, b]), () => {}]]
      : [["working", powered, () => {}],
         ["starved", powered, () => {b.inventory = {};}],
         ["unpowered", game([consumer, b]), () => {b.inventory = stocked(type);}]];
    const seen = {};
    for (const [label, g, mutate] of states) {
      mutate();
      const stamp = step(obj, g, b);
      assert.equal(stamp.status, label, type + " derived status");
      const sm = STATUS_MATERIALS[label];
      assert.equal(lightOf(obj).material.color.getHex(), hexOf(sm.light), type + " status light material");
      for (const n of hotNodes(obj))
        assert.equal(n.material.color.getHex(), hexOf(sm.hot), type + " hot surface material in " + label);
      for (const e of obj.art03.emits)
        assert.equal(e.visible, label === "working", type + " emissions visible only when working");
      seen[label] = [lightOf(obj).material.color.getHex(), ...hotNodes(obj).map(n => n.material.color.getHex())];
    }
    // Pairwise distinct visual signatures across the runtime states.
    const keys = Object.keys(seen);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++)
      assert.notDeepEqual(seen[keys[i]], seen[keys[j]], type + " " + keys[i] + " vs " + keys[j] + " must look different");
  }
  // Assembling reads cold (legacy mint light, dark hot surfaces) — distinct from working.
  const f = rig("furnace");
  const asm = step(f, game([bld(1, "generator"), bld(99, "furnace", {remaining: 3})]), bld(99, "furnace", {remaining: 3}));
  assert.equal(asm.status, "assembling");
  assert.equal(lightOf(f).material.color.getHex(), hexOf("lights"));
  for (const n of hotNodes(f)) assert.equal(n.material.color.getHex(), hexOf("dark"));
});

test("NEGATIVE in the real graph: starved timer motion freezes pivots and hides smoke; working animates them", () => {
  for (const type of ART03_TYPES) {
    const obj = rig(type);
    const gen = bld(1, "generator");
    const consumer = bld(2, "furnace", {inventory: stocked("furnace")});
    const b = bld(99, type, {inventory: stocked(type)});
    const g = game([gen, consumer, b], 10);
    // First frame initializes the work clock from the CURRENT sim timers (no
    // fabricated backlog) — then advance the sim and expect real motion.
    step(obj, g, b);
    if (BLUEPRINTS[type].cycle > 0) b.timer = 2; else g.elapsed = 40;
    const work = step(obj, g, b);
    assert.equal(work.status, "working");
    assert.ok(work.clock > 0, type + " work clock advanced");
    const desc = machineDescriptor(type);
    const pose = art03Pose(work.clock, false, 99);
    const roles = {generator: ["fan", "turbine"], furnace: ["charge", "blower"], foundry: ["crucible", "foundryFan"], refinery: ["pump", "valve"]};
    desc.pivots.forEach((pv, i) => {
      const n = pivotOf(obj, pv.id);
      near(n.rotation[pv.axis], pose[roles[type][i]], type + "/" + pv.id + " rendered angle = pure pose");
    });
    const frozen = desc.pivots.map(p => pivotOf(obj, p.id).rotation.clone());
    // Negative: cycling rigs starve (sim timer STILL advances, pivots must not);
    // the generator idles when real demand drops to zero (elapsed still advances).
    let ng = g;
    if (BLUEPRINTS[type].cycle > 0) {b.inventory = {}; b.timer = 4;}
    else {ng = game([gen, b], 80);}
    const neg = step(obj, ng, b);
    assert.equal(neg.status, BLUEPRINTS[type].cycle > 0 ? "starved" : "idle");
    near(neg.clock, work.clock, type + " work clock frozen while negative");
    desc.pivots.forEach((pv, i) => {
      const n = pivotOf(obj, pv.id);
      assert.deepEqual([...n.rotation.toArray()], [...frozen[i].toArray()], type + "/" + pv.id + " frozen while negative");
    });
    for (const e of obj.art03.emits) assert.equal(e.visible, false, type + " no smoke while negative");
  }
});

test("material pool ownership: status swaps reassign registered entries, never mutate the pool", () => {
  // Snapshot every registered material's colour/emissive via a probe rig's nodes.
  const probe = rig("furnace");
  const poolMats = new Set();
  probe.group.traverse(n => {if (n.isMesh && n.name !== "pick:volume") poolMats.add(n.material);});
  const snapshot = [...poolMats].map(m => [m.uuid, m.color.getHex(), m.emissive.getHex(), m.emissiveIntensity]);
  const gen = bld(1, "generator");
  const b = bld(99, "furnace", {inventory: stocked("furnace")});
  const g = game([gen, b]);
  for (let i = 0; i < 3; i++) {
    b.timer = i + 1; step(probe, g, b);
    b.inventory = {}; step(probe, g, b);
    b.inventory = stocked("furnace");
  }
  step(probe, game([b]), b); // unpowered
  for (const [uuid, color, emissive, intensity] of snapshot) {
    const m = [...poolMats].find(x => x.uuid === uuid);
    assert.equal(m.color.getHex(), color, "pool colour mutated");
    assert.equal(m.emissive.getHex(), emissive, "pool emissive mutated");
    assert.equal(m.emissiveIntensity, intensity, "pool emissiveIntensity mutated");
  }
  // Shared identity: two rigs in the same status use the SAME material object.
  const other = rig("refinery");
  const rb = bld(98, "refinery", {inventory: stocked("refinery")});
  step(probe, game([gen, b, rb]), b);
  step(other, game([gen, b, rb]), rb);
  assert.equal(lightOf(probe).material, lightOf(other).material, "status light material is shared, not cloned");
  assert.equal(probe.art03.statusNodes.window.material, other.art03.statusNodes.window.material, "hot material shared");
});

test("emission points: declared offsets, work-clock rise/shrink, flare flicker, hidden when not working", () => {
  for (const type of ART03_TYPES) {
    const obj = rig(type), desc = machineDescriptor(type);
    for (const em of desc.emissions) {
      const e = obj.group.getObjectByName(em.node);
      assert.ok(e, type + " " + em.node + " exists");
      assert.deepEqual([...e.position], em.offset, type + " emission offset matches declaration");
      assert.equal(e.children.length, em.puffs, type + " puff count");
      assert.equal(e.visible, false, "emissions start hidden (never hardcoded on)");
      e.children.forEach((p, i) => assert.equal(p.userData.puff, i, "puff index"));
    }
    const gen = bld(1, "generator");
    const consumer = bld(2, "furnace", {inventory: stocked("furnace")});
    const b = bld(99, type, {inventory: stocked(type)});
    const g = game([gen, consumer, b], 10);
    step(obj, g, b); // initialize work clock from current sim timers
    if (BLUEPRINTS[type].cycle > 0) b.timer = 3; else g.elapsed = 60;
    const stamp = step(obj, g, b);
    assert.equal(stamp.status, "working", type + " must be working to emit");
    assert.ok(stamp.clock > 0, type + " emission phase must come from real work");
    const phase = stamp.clock * ART03_SMOKE.speed;
    for (const em of desc.emissions) {
      const e = obj.group.getObjectByName(em.node);
      assert.equal(e.visible, true, type + " emitting while working");
      if (em.flare) {
        near(e.scale.y, 1 + 0.25 * Math.sin(stamp.clock * 7 + 99), "flare flicker from work clock");
        continue;
      }
      e.children.forEach(p => {
        const s = smokePuff(phase, p.userData.puff, ART03_SMOKE.count);
        near(p.position.y, s.y, "puff rise");
        near(p.scale.x, s.s, "puff shrink");
      });
    }
  }
});

test("furnace/foundry heat pulse scales the group only while working; generator/refinery never pulse", () => {
  for (const type of ART03_TYPES) {
    const obj = rig(type);
    const gen = bld(1, "generator");
    const consumer = bld(2, "furnace", {inventory: stocked("furnace")});
    const b = bld(99, type, {inventory: stocked(type)});
    const g = game([gen, consumer, b], 10);
    step(obj, g, b); // initialize work clock from current sim timers
    if (BLUEPRINTS[type].cycle > 0) b.timer = 2.2; else g.elapsed = 30;
    const stamp = step(obj, g, b);
    assert.equal(stamp.status, "working", type + " working for pulse check");
    assert.ok(stamp.clock > 0, type + " pulse must come from real work");
    const pulses = type === "furnace" || type === "foundry";
    const pose = art03Pose(stamp.clock, false, 99);
    near(obj.group.scale.y, pulses ? 1 + pose.pulse : 1, type + " working scale");
    if (BLUEPRINTS[type].cycle > 0) {b.inventory = {}; step(obj, g, b);}
    else step(obj, game([gen, b], 30), b); // generator: demand gone => idle
    near(obj.group.scale.y, 1, type + " negative-state scale rests at 1");
  }
});

test("reduced motion in the REAL path: pivots parked, emissions hidden, status colours still apply", () => {
  for (const type of ART03_TYPES) {
    const obj = rig(type);
    const gen = bld(1, "generator");
    const consumer = bld(2, "furnace", {inventory: stocked("furnace")});
    const b = bld(99, type, {inventory: stocked(type), timer: 2});
    const stamp = step(obj, game([gen, consumer, b], 10), b, true);
    assert.equal(stamp.status, "working", "status derivation is not motion — still derived");
    for (const pv of machineDescriptor(type).pivots) {
      const n = pivotOf(obj, pv.id);
      assert.equal(n.rotation[pv.axis], 0, type + "/" + pv.id + " parked");
    }
    for (const e of obj.art03.emits) assert.equal(e.visible, false, "no smoke under reduced motion");
    assert.equal(lightOf(obj).material.color.getHex(), hexOf("lights"), "working colour still applies");
    near(obj.group.scale.y, 1, "no pulse under reduced motion");
    // Negative-state colour still applies under reduced motion (starved amber for
    // cycling rigs; idle teal for the generator when real demand drops to zero).
    if (BLUEPRINTS[type].cycle > 0) {
      b.inventory = {};
      step(obj, game([gen, consumer, b], 10), b, true);
      assert.equal(lightOf(obj).material.color.getHex(), hexOf("statusStarved"), "starved amber under reduced motion");
    } else {
      step(obj, game([gen, b], 10), b, true);
      assert.equal(lightOf(obj).material.color.getHex(), hexOf("statusIdle"), "idle teal under reduced motion");
    }
  }
});

test("ART-03 budgets: measured mesh/triangle counts inside declared limits", () => {
  for (const type of ART03_TYPES) {
    const desc = machineDescriptor(type);
    let meshes = 0, triangles = 0;
    rig(type).group.traverse(n => {
      if (!n.isMesh || n.name === "pick:volume" || !n.material.visible) return;
      meshes++;
      triangles += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3;
    });
    assert.ok(meshes <= desc.budget.maxMeshes, type + " meshes " + meshes + " > " + desc.budget.maxMeshes);
    assert.ok(triangles <= desc.budget.maxTriangles, type + " tris " + triangles + " > " + desc.budget.maxTriangles);
    assert.ok(meshes >= 28, type + " rig too sparse to read as industrial (" + meshes + " meshes)");
  }
});

test("update() consumes applyArt03 + observability stamps; camera bodies byte-identical to main", () => {
  const src = fs.readFileSync("src/world.js", "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("applyArt03(obj,g,b,this.reducedMotion,id)"), "update() must call the shared application path");
  for (const stamp of ['cd["art03"', "cd.art03Load", "cd.art03Clock", "cd.art03Reduced"])
    assert.ok(src.includes(stamp), "missing observability stamp " + stamp);
  assert.ok(!src.includes("p.kind===\"spin\""), "old wall-clock spin branch must be gone");
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
