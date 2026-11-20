/**
 * #590 yard life: invariant suite for the PURE crowd module (src/crowd.js).
 * No THREE, no DOM, no timers, no servers — nothing keeps the event loop alive.
 *
 * Proven here (measured, not asserted-by-claim):
 *  - anti-teleport: bounded per-step displacement for walkers, forklift and
 *    drone across a long window at the App dt clamp (<=0.07), including an
 *    adversarial pure-vertical anchor ascent phased to maximise arrival bob;
 *  - pairwise clearance MINIMA across the whole window: every mover against
 *    every other mover and against live truck envelopes (report + invariant);
 *  - locomotion: non-zero travelled distance, heading reversals, distance-
 *    driven limb poses that freeze when distance is constant;
 *  - determinism: same seed + same dt/env sequence => byte-identical state;
 *  - reduced motion / dt=0: full positional hold, zero rotor/bob;
 *  - no authority: stepCrowd never mutates env inputs (deep-frozen) or plan;
 *  - rebuild-only visibility: fresh save hides nothing, paving/building hides
 *    the affected corridor, bay aprons stay walkable, volumetric dressing blocks.
 *
 * The base-drone teleport BEFORE measurement and the byte-identical economy
 * proof live in tests/yardLife.test.mjs (they need the real world/sim helpers).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {CELL, WORLD_SIZE} from "../src/content.js";
import {createGame, roadLine} from "../src/simulation.js";
import {key} from "../src/gridOccupancy.js";
import {CROWD_MOTION, crowdPlan, createCrowdState, stepCrowd, crowdConflicts, workerPose, stationPose} from "../src/crowd.js";

const M = CROWD_MOTION;
const origin = (i) => (i - WORLD_SIZE / 2 + 0.5) * CELL;
const DTS = [0.016, 0.033, 0.07, 0.05, 0.025, 0.07, 0.04]; // all <= App clamp 0.07
const SEEDS = [4073, 1, 777, 9999, 12345, 2026, 31337];
const R = {w: M.workerRadius, f: M.forkliftRadius, t: M.truckRadius, d: M.droneRadius, s: M.workerRadius};
const Y = {w: 0.85, f: 0.55, t: 0.675, s: 0.85}; // mover center heights for drone 3D clearance

// --- shared window harness --------------------------------------------------
// envAt(t, dt, state, plan) -> {trucks:[{x,z}], anchor:{x,y,z,id}|null, reduced}
// Measures per-step displacement and pairwise clearance AFTER each commit.
function runWindow(seed, seconds, envAt, planOpts) {
  const plan = crowdPlan(seed, planOpts);
  const state = createCrowdState(plan);
  const met = {
    frames: 0, maxWorkerStep: 0, maxForkliftStep: 0, maxDroneStep: 0,
    // Refs 599: station crew ("s") join the pairwise matrix. Keys are the two
    // class letters SORTED (f<s<t<w), so forklift-station is "fs", not "sf".
    min: {ww: Infinity, fw: Infinity, tw: Infinity, ft: Infinity, dw: Infinity, df: Infinity, dt: Infinity,
      sw: Infinity, fs: Infinity, st: Infinity, ss: Infinity},
    yieldFrames: 0, activeFrames: 0, droneModes: new Set()
  };
  let t = 0, fi = 0;
  while (t < seconds - 1e-9) {
    const dt = Math.min(DTS[fi % DTS.length], seconds - t);
    const env = envAt(t, dt, state, plan);
    const pw = state.walkers.map((w) => ({x: w.x, z: w.z, s: w.s}));
    const pf = {x: state.forklift.x, z: state.forklift.z};
    const pd = {x: state.drone.x, y: state.drone.y, z: state.drone.z};
    stepCrowd(state, plan, dt, env);
    met.frames++;
    state.walkers.forEach((w, i) => {
      met.maxWorkerStep = Math.max(met.maxWorkerStep, Math.hypot(w.x - pw[i].x, w.z - pw[i].z));
      const seg = plan.segments[w.seg];
      assert.ok(w.s >= -1e-9 && w.s <= seg.len + 1e-9, "walker left its segment");
    });
    met.maxForkliftStep = Math.max(met.maxForkliftStep, Math.hypot(state.forklift.x - pf.x, state.forklift.z - pf.z));
    const d = state.drone;
    met.maxDroneStep = Math.max(met.maxDroneStep, Math.hypot(d.x - pd.x, d.y - pd.y, d.z - pd.z));
    met.droneModes.add(d.mode);
    // Pairwise clearance: ground pairs in 2D, drone pairs in 3D.
    const movers = [
      ...state.walkers.filter((w) => !w.hidden).map((w) => ({cls: "w", x: w.x, y: Y.w, z: w.z, r: R.w})),
      ...(state.forklift.hidden ? [] : [{cls: "f", x: state.forklift.x, y: Y.f, z: state.forklift.z, r: R.f}]),
      ...(state.stations || []).filter((s) => !s.hidden).map((s) => ({cls: "s", x: s.x, y: Y.s, z: s.z, r: R.s})),
      ...(env.trucks || []).map((tr) => ({cls: "t", x: tr.x, y: Y.t, z: tr.z, r: R.t})),
      {cls: "d", x: d.x, y: d.y, z: d.z, r: R.d}
    ];
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const a = movers[i], b = movers[j];
      if (a.cls === "t" && b.cls === "t") continue; // truck-truck is economy authority, not crowd
      const kk = [a.cls, b.cls].sort().join("");
      if (!(kk in met.min)) continue;
      const dist = (a.cls === "d" || b.cls === "d")
        ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
        : Math.hypot(a.x - b.x, a.z - b.z);
      met.min[kk] = Math.min(met.min[kk], dist - a.r - b.r);
    }
    // Crossing-yield measurement (report only): higher-seg walker pinned while
    // the lower-seg walker activates the constant waiting interval.
    const waitR = 2 * M.workerRadius + M.clearanceMargin + 0.02 + M.laneOffset + M.crossingPad;
    for (const c of plan.crossings) {
      for (const o of state.walkers) {
        if (o.seg !== c.a || o.hidden) continue;
        const odx = c.x - o.x, odz = c.z - o.z, od = Math.hypot(odx, odz);
        const seg = plan.segments[o.seg];
        const approaching = (seg.ux * o.dir * odx + seg.uz * o.dir * odz) > 0;
        const active = od < waitR + M.laneOffset || (od < M.crossingLookahead && approaching);
        if (!active) continue;
        met.activeFrames++;
        for (let wi = 0; wi < state.walkers.length; wi++) {
          const w = state.walkers[wi];
          if (w.seg === c.b && !w.hidden && Math.abs(w.s - pw[wi].s) < 1e-9) met.yieldFrames++;
        }
      }
    }
    t += dt; fi++;
  }
  return {plan, state, met};
}

// Realistic truck traffic: three trucks looping on the INITIAL road centerlines
// (x=11 vertical, z=12 and z=8 horizontal) at the real freight speed 2.1 u/s.
// Trucks stay on road cell centers exactly like simulation.js moveVehicle.
function roadTraffic() {
  const loops = [
    {axis: "x", fixed: origin(11), lo: origin(4), hi: origin(20)},
    {axis: "z", fixed: origin(12), lo: origin(5), hi: origin(19)},
    {axis: "z", fixed: origin(8), lo: origin(5), hi: origin(19)}
  ].map((l, i) => ({...l, p: l.lo + (i * 7) % (l.hi - l.lo), dir: i % 2 ? -1 : 1}));
  return (t, dt) => {
    const trucks = loops.map((l) => {
      l.p += l.dir * 2.1 * dt;
      if (l.p > l.hi) {l.p = l.hi; l.dir = -1;}
      if (l.p < l.lo) {l.p = l.lo; l.dir = 1;}
      return l.axis === "x" ? {x: l.fixed, z: l.p} : {x: l.p, z: l.fixed};
    });
    return {trucks, anchor: null, reduced: false};
  };
}

// Anchor script: alternate pad / two real roof anchors every 20 s (the pad->
// furnace transit is ~60 u at 6.5 u/s ~ 10 s, so each anchor persists long
// enough to actually arrive). Roofs use the same formula world.js uses
// (bounds.height + 1.4). Furnace (16,13) h=4.2 and salvager (7,9) h=2.74 are
// far apart and far from the pad -> long transits.
function anchorScript() {
  const targets = [
    null,
    {x: origin(16), y: 4.2 + 1.4, z: origin(13), id: "furnace-4"},
    null,
    {x: origin(7), y: 2.74 + 1.4, z: origin(9), id: "salvager-1"}
  ];
  return (t) => ({trucks: [], anchor: targets[Math.floor(t / 20) % targets.length], reduced: false});
}

function assertMotionBounds(met) {
  assert.ok(met.maxWorkerStep <= M.maxWorkerStep + 1e-9, "walker step " + met.maxWorkerStep);
  assert.ok(met.maxForkliftStep <= M.maxForkliftStep + 1e-9, "forklift step " + met.maxForkliftStep);
  assert.ok(met.maxDroneStep <= M.maxDroneStep + 1e-9, "drone step " + met.maxDroneStep);
}
function assertGroundClearance(met) {
  // Refs 599: station pairs (sw/fs/st/ss) hold the SAME declared margin.
  for (const kk of ["ww", "fw", "tw", "ft", "sw", "fs", "st", "ss"])
    assert.ok(met.min[kk] >= M.clearanceMargin - 1e-9, kk + " clearance " + met.min[kk] + " < margin " + M.clearanceMargin);
  for (const kk of ["dw", "df", "dt"])
    assert.ok(met.min[kk] > 0, "drone clearance " + kk + " " + met.min[kk]);
}

// --- tests -------------------------------------------------------------------

test("plan + initial state are deterministic pure data; seeds differ", () => {
  for (const seed of SEEDS) {
    const a = crowdPlan(seed), b = crowdPlan(seed);
    assert.deepEqual(a, b);
    assert.deepEqual(a, JSON.parse(JSON.stringify(a)), "plan must be plain serializable data");
    assert.deepEqual(createCrowdState(a), createCrowdState(b));
    // Refs 599 RE-DECLARATION (was 10): 22 walkers on 13 corridors + 8 station
    // crew. Headcount is a declared budget, raised explicitly for the density
    // outcome — the per-rig geometry budgets are unchanged.
    assert.equal(a.walkers.length, 22, "twenty-two walking crew (Refs 599)");
    assert.equal(a.stations.length, 8, "eight station crew (Refs 599)");
    assert.equal(a.segments.length, 13, "thirteen patrol corridors (Refs 599)");
  }
  assert.notDeepEqual(crowdPlan(4073).walkers, crowdPlan(9999).walkers);
  assert.notDeepEqual(crowdPlan(4073).stations, crowdPlan(9999).stations, "station phases must be seeded");
});

test("anti-teleport + pairwise clearance: 240 s window, real road traffic, switching anchors (7 seeds)", (t) => {
  const report = [];
  for (const seed of SEEDS) {
    const traffic = roadTraffic(), anchors = anchorScript();
    const {met} = runWindow(seed, 240, (tt, dt, st, pl) => {
      const e1 = traffic(tt, dt), e2 = anchors(tt, dt, st, pl);
      return {trucks: e1.trucks, anchor: e2.anchor, reduced: false};
    });
    assertMotionBounds(met);
    assertGroundClearance(met);
    assert.ok(met.droneModes.has("flying"), "drone must actually fly");
    assert.ok(met.droneModes.has("hovering"), "drone must reach an anchor");
    assert.ok(met.droneModes.has("parked"), "drone must park when no cycle");
    report.push({seed, frames: met.frames, maxWorkerStep: +met.maxWorkerStep.toFixed(4),
      maxForkliftStep: +met.maxForkliftStep.toFixed(4), maxDroneStep: +met.maxDroneStep.toFixed(4),
      minClearance: Object.fromEntries(Object.entries(met.min).map(([k, v]) => [k, +v.toFixed(4)])),
      yieldFrac: met.activeFrames ? +(met.yieldFrames / met.activeFrames).toFixed(3) : null});
  }
  t.diagnostic("MEASURED " + JSON.stringify(report));
});

test("anti-teleport NEGATIVE control: the declared drone bound is violated by a pad->roof snap", () => {
  // The base implementation SET the drone position to the anchor roof every
  // frame (teleport). One such snap is ~60 world units — this asserts the
  // magnitude the base produced, so the bound above is not vacuous. The real
  // base-code before/after measurement is in yardLife.test.mjs.
  const pad = {x: -47.5, y: 5.9, z: -23};
  const roof = {x: origin(16), y: 5.6, z: origin(13)};
  const snap = Math.hypot(roof.x - pad.x, roof.y - pad.y, roof.z - pad.z);
  assert.ok(snap > 50, "pad->furnace roof distance " + snap);
  assert.ok(snap > M.maxDroneStep * 100, "base snap exceeds the declared bound by >100x");
});

test("adversarial drone: pure-vertical ascent to a tall roof above the pad, every frame dt x full bob-phase sweep", (t) => {
  // Worst case for the arrival commit: horizontal distance ~0, drone BELOW the
  // target (ascent), hover bob adding up to +0.18 on the arrival frame. The
  // follow gain leaves up to ~0.35 u of vertical gap when the arrive radius
  // triggers, so an unclamped arrival snap can reach ~0.53 u > the 0.5 bound.
  // Sweep dt in the App's real range and the sim-clock phase finely enough to
  // cover a full sin(elapsed*1.3) cycle (250 x 0.02 s x 1.3 = 6.5 rad > 2pi).
  const tall = {x: -47.5, y: 6.8 + 1.4, z: -23, id: "stress-tall"}; // tallest machine 6.8
  const report = [];
  for (const dt of [0.016, 0.033, 0.05, 0.07]) {
    let worst = 0, worstPhase = -1;
    for (let phase = 0; phase < 250; phase++) {
      const plan = crowdPlan(4073);
      const state = createCrowdState(plan);
      // Advance the clock while parked (anchor null) to shift the bob phase.
      for (let k = 0; k < phase; k++) stepCrowd(state, plan, 0.02, {trucks: [], anchor: null, reduced: false});
      let maxStep = 0;
      for (let f = 0; f < 300; f++) {
        const pd = {x: state.drone.x, y: state.drone.y, z: state.drone.z};
        stepCrowd(state, plan, dt, {trucks: [], anchor: tall, reduced: false});
        maxStep = Math.max(maxStep, Math.hypot(state.drone.x - pd.x, state.drone.y - pd.y, state.drone.z - pd.z));
      }
      assert.equal(state.drone.mode, "hovering", "vertical ascent must arrive at dt " + dt);
      if (maxStep > worst) {worst = maxStep; worstPhase = phase;}
    }
    report.push({dt, worstStep: +worst.toFixed(6), worstPhase});
    assert.ok(worst <= M.maxDroneStep + 1e-9, "dt " + dt + ": drone step " + worst + " exceeds declared bound " + M.maxDroneStep);
  }
  t.diagnostic("MEASURED vertical-ascent worst steps " + JSON.stringify(report) + " (bound " + M.maxDroneStep + ")");
});

test("truck-yield stress: trucks drive ONTO an alley (synthetic worst case) — retreat stays bounded and clear", (t) => {
  // Legal roads never come within 2.9 u of a visible patrol path (measured in
  // yardLife), so this synthetic stress drives a truck slowly down alley-z10-w
  // to exercise the retreat/interval-union machinery itself, then parks a
  // second truck straddling the path. Speed 0.5 < retreat 1.25 keeps escape
  // reachable; the truck never swallows a segment end.
  const z = origin(10);
  const plan0 = crowdPlan(4073);
  const seg = plan0.segments[0];
  const trucks = [{x: origin(5), z, dir: 1, speed: 0.5, stop: origin(8)}, {x: origin(11), z, dir: -1, speed: 0.5, stop: origin(9)}];
  const {met} = runWindow(4073, 120, (tt, dt) => {
    for (const tr of trucks) {
      const next = tr.x + tr.dir * tr.speed * dt;
      tr.x = tr.dir > 0 ? Math.min(next, tr.stop) : Math.max(next, tr.stop);
    }
    return {trucks: trucks.map((tr) => ({x: tr.x, z: tr.z})), anchor: null, reduced: false};
  });
  assertMotionBounds(met);
  assert.ok(met.min.tw >= M.clearanceMargin - 1e-9, "walker-truck clearance " + met.min.tw);
  assert.ok(met.min.ww >= M.clearanceMargin - 1e-9, "walker-walker clearance " + met.min.ww);
  assert.ok(met.min.ft >= M.clearanceMargin - 1e-9, "forklift-truck clearance " + met.min.ft);
  t.diagnostic("MEASURED stress min clearance " + JSON.stringify(Object.fromEntries(Object.entries(met.min).map(([k, v]) => [k, +v.toFixed(4)]))));
});

test("locomotion + limbs: every walker travels, headings reverse, poses are distance-driven and freeze", () => {
  const traffic = roadTraffic(), anchors = anchorScript();
  const {state, met} = runWindow(4073, 120, (tt, dt, st, pl) => {
    const e1 = traffic(tt, dt), e2 = anchors(tt, dt, st, pl);
    return {trucks: e1.trucks, anchor: e2.anchor, reduced: false};
  });
  for (const w of state.walkers) {
    assert.ok(w.dist > 20, "walker travelled only " + w.dist);
    assert.ok(w.dist <= 120 * M.retreatSpeed + 1e-6, "distance consistent with speed cap");
  }
  assert.ok(state.forklift.dist > 1, "forklift shuttle travelled " + state.forklift.dist);
  // Limb pose is a pure function of travelled distance: non-zero, varying,
  // opposite-phase legs/arms, and frozen when distance is constant.
  const p1 = workerPose(0.31), p2 = workerPose(0.53), p3 = workerPose(0.31);
  assert.deepEqual(p1, p3, "pose is pure in dist");
  assert.notDeepEqual(p1, p2, "pose varies with distance");
  assert.ok(Math.abs(p1.legL) > 1e-3 && Math.abs(p1.armL) > 1e-3);
  assert.equal(p1.legL, -p1.legR);
  assert.equal(p1.armL, -p1.armR);
  assert.deepEqual(workerPose(0), {legL: 0, legR: 0, armL: 0, armR: 0});
  assert.deepEqual(workerPose(99, true), {legL: 0, legR: 0, armL: 0, armR: 0}, "reduced motion zeroes limbs");
  assert.ok(met.activeFrames > 0, "crossing interactions must occur");
});

test("determinism: same seed + same dt/env sequence => byte-identical trajectories", () => {
  const mk = () => {
    const traffic = roadTraffic(), anchors = anchorScript();
    return runWindow(2026, 90, (tt, dt, st, pl) => {
      const e1 = traffic(tt, dt), e2 = anchors(tt, dt, st, pl);
      return {trucks: e1.trucks, anchor: e2.anchor, reduced: false};
    });
  };
  const a = mk(), b = mk();
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state), "state byte-identical");
  const c = runWindow(31337, 90, (() => {const tr = roadTraffic(), an = anchorScript(); return (tt, dt, st, pl) => ({trucks: tr(tt, dt).trucks, anchor: an(tt, dt, st, pl).anchor, reduced: false});})());
  assert.notEqual(JSON.stringify(a.state.walkers), JSON.stringify(c.state.walkers), "different seed diverges");
});

test("reduced motion and dt=0 hold every mover with zero drift", () => {
  const plan = crowdPlan(4073);
  const state = createCrowdState(plan);
  // First fly the drone out to an anchor so the hold is tested mid-flight too.
  const anchor = {x: origin(16), y: 5.6, z: origin(13), id: "furnace-4"};
  for (let f = 0; f < 100; f++) stepCrowd(state, plan, 0.07, {trucks: [{x: origin(11), z: origin(10)}], anchor, reduced: false});
  // First reduced frame zeroes rotor/bob (decorative spin holds too); the
  // positional snapshot is taken after it so the hold comparison is exact.
  stepCrowd(state, plan, 0.07, {trucks: [{x: origin(11), z: origin(12)}], anchor, reduced: true});
  const snapshot = JSON.stringify({walkers: state.walkers, stations: state.stations, forklift: state.forklift, drone: state.drone});
  for (let f = 0; f < 300; f++) {
    stepCrowd(state, plan, DTS[f % DTS.length], {trucks: [{x: origin(11), z: origin(12)}], anchor, reduced: true});
    assert.equal(state.drone.rotor, 0);
    assert.equal(state.drone.bob, 0);
  }
  assert.equal(JSON.stringify({walkers: state.walkers, stations: state.stations, forklift: state.forklift, drone: state.drone}), snapshot, "reduced motion: zero drift");
  for (let f = 0; f < 100; f++) stepCrowd(state, plan, 0, {trucks: [], anchor: null, reduced: false});
  assert.equal(JSON.stringify({walkers: state.walkers, stations: state.stations, forklift: state.forklift, drone: state.drone}), snapshot, "dt=0: zero drift");
  // Release resumes motion.
  stepCrowd(state, plan, 0.07, {trucks: [], anchor, reduced: false});
  assert.notEqual(JSON.stringify(state.walkers), JSON.stringify(JSON.parse(snapshot).walkers));
});

test("no authority: stepCrowd never mutates deep-frozen env inputs or the plan", () => {
  const plan = crowdPlan(4073);
  const planJson = JSON.stringify(plan);
  const state = createCrowdState(plan);
  const trucks = [Object.freeze({x: origin(11), z: origin(10)}), Object.freeze({x: origin(13), z: origin(12)})];
  const anchor = Object.freeze({x: origin(16), y: 5.6, z: origin(13), id: "furnace-4"});
  const env = Object.freeze({trucks: Object.freeze(trucks), anchor, reduced: false});
  for (let f = 0; f < 600; f++) stepCrowd(state, plan, DTS[f % DTS.length], env); // strict mode throws on any write
  assert.equal(JSON.stringify(plan), planJson, "plan untouched");
  assert.ok(state.walkers.some((w) => w.dist > 0), "sim actually ran");
});

test("visibility is rebuild-only: fresh save hides nothing; paving/building hides corridors; bays stay walkable", () => {
  const g = createGame();
  const plan = crowdPlan(g.seed);
  const fresh = crowdConflicts(plan, g, null);
  assert.deepEqual(fresh.segments, plan.segments.map(() => false), "fresh save: all patrols visible");
  assert.equal(fresh.forklift, false);
  assert.equal(fresh.shuttle, true, "bay apron is walkable — not a blocker");
  // Pave a cell of alley-z14-e (x12..18, z14) from the z=12 road.
  const rich = createGame();
  rich.tier = 2;
  rich.bank = Object.fromEntries(Object.keys(rich.bank).map((k) => [k, 1e9]));
  const r = roadLine(rich, {x: 12, z: 12}, {x: 12, z: 14});
  assert.equal(r.ok, true, r.reason);
  const conf = crowdConflicts(plan, rich, null);
  assert.equal(conf.segments[3], true, "paved alley-z14-e hides");
  assert.equal(conf.segments[0], false, "unaffected alley stays visible");
  // Pave the forklift post cell (13,10) -> forklift hidden, shuttle off.
  const rich2 = createGame();
  rich2.tier = 2;
  rich2.bank = Object.fromEntries(Object.keys(rich2.bank).map((k) => [k, 1e9]));
  assert.equal(roadLine(rich2, {x: 13, z: 12}, {x: 13, z: 10}).ok, true);
  const conf2 = crowdConflicts(plan, rich2, null);
  assert.equal(conf2.forklift, true, "paved post hides the forklift");
  assert.equal(conf2.shuttle, false);
  // Volumetric dressing reaching a corridor blocks it (synthetic prop on alley-z10-w).
  const vols = {props: [{x: origin(8), z: origin(10), w: 1.5, d: 1.5}], rubble: []};
  const conf3 = crowdConflicts(plan, createGame(), vols);
  assert.equal(conf3.segments[0], true, "volumetric prop blocks the corridor");
  assert.equal(conf3.segments[1], false);
  // Hidden walkers are skipped by the sim and never drift.
  const state = createCrowdState(plan);
  state.walkers[0].hidden = true;
  const before = JSON.stringify(state.walkers[0]);
  for (let f = 0; f < 100; f++) stepCrowd(state, plan, 0.07, {trucks: [], anchor: null, reduced: false});
  assert.equal(JSON.stringify(state.walkers[0]), before, "hidden walker frozen");
});

test("intersection right-of-way: higher-index walkers yield, lower indices never pin (measured)", (t) => {
  const traffic = roadTraffic();
  const {met} = runWindow(4073, 240, (tt, dt) => ({trucks: traffic(tt, dt).trucks, anchor: null, reduced: false}));
  assert.ok(met.activeFrames > 100, "crossings must activate repeatedly, got " + met.activeFrames);
  assert.ok(met.yieldFrames > 0, "higher-index walkers must actually yield");
  const frac = met.yieldFrames / met.activeFrames;
  t.diagnostic("MEASURED crossing yield fraction " + frac.toFixed(3) + " (" + met.yieldFrames + "/" + met.activeFrames + " walker-frames)");
  // Every walker still travels substantial distance — no deadlock starvation.
  const {state} = runWindow(4073, 240, (tt, dt) => ({trucks: traffic(tt, dt).trucks, anchor: null, reduced: false}));
  for (const w of state.walkers) assert.ok(w.dist > 50, "walker starved: dist " + w.dist);
});

// --- Refs 599: stationary-but-animated station crew --------------------------

test("station pose: pure clock+phase, legs locked, arms work, freezes at dt=0/reduced (with negative control)", () => {
  const zero = {legL: 0, legR: 0, armL: 0, armR: 0};
  assert.deepEqual(stationPose(0, 1.23), zero, "dt=0 clock holds the pose");
  assert.deepEqual(stationPose(-1, 1.23), zero, "non-positive clock holds the pose");
  assert.deepEqual(stationPose(7.7, 1.23, true), zero, "reduced motion holds the pose");
  const p1 = stationPose(3.1, 0.7), p2 = stationPose(3.1, 0.7), p3 = stationPose(3.6, 0.7);
  assert.deepEqual(p1, p2, "pose is pure in (elapsed, phase)");
  assert.notDeepEqual(p1, p3, "NEGATIVE CONTROL: arms must actually swing on the clock");
  assert.notDeepEqual(p1, stationPose(3.1, 2.9), "seeded phase must change the pose");
  assert.equal(p1.legL, 0); assert.equal(p1.legR, 0, "station crew never walk");
  assert.ok(Math.abs(p1.armL) > 1e-3, "arms must be mid-swing at this phase");
  // Every plan station phase is finite and the pose stays bounded for all time.
  for (const seed of SEEDS) {
    for (const st of crowdPlan(seed).stations) {
      assert.ok(Number.isFinite(st.phase));
      for (const t of [0.016, 1, 60, 3600]) {
        const p = stationPose(t, st.phase);
        assert.ok(Math.abs(p.armL) <= 0.35 + 1e-9 && Math.abs(p.armR) <= 0.25 + 1e-9, "arm swing bounded");
      }
    }
  }
});

test("station seed clearance: createCrowdState relaxes every walker off every station hard radius (7 seeds)", () => {
  const hardR = 2 * M.workerRadius + M.clearanceMargin; // seed-time relax radius
  let worst = Infinity;
  for (const seed of SEEDS) {
    const plan = crowdPlan(seed), state = createCrowdState(plan);
    assert.equal(state.stations.length, 8);
    for (const st of state.stations) assert.equal(st.hidden, false, "fresh stations visible");
    for (const w of state.walkers) for (const st of state.stations) {
      const gap = Math.hypot(w.x - st.x, w.z - st.z) - hardR;
      assert.ok(gap >= -1e-9, `seed ${seed}: walker inside station hard radius (${gap})`);
      worst = Math.min(worst, gap);
    }
  }
  assert.ok(worst > 0.1, "relax must leave real slack, worst gap " + worst);
});

test("station visibility: fresh hides none; dismantled anchor hides its tender; paving the cell hides it", () => {
  const g = createGame();
  const plan = crowdPlan(g.seed);
  const fresh = crowdConflicts(plan, g, null);
  assert.deepEqual(fresh.stations, plan.stations.map(() => false), "fresh save: all 8 stations visible");
  // Dismantle the salvager -> only its tender hides (anchor-machine rule).
  const g2 = createGame();
  g2.buildings = g2.buildings.filter((b) => b.type !== "salvager");
  const conf2 = crowdConflicts(plan, g2, null);
  assert.equal(conf2.stations[0], true, "dismantled salvager hides salvager-tender");
  assert.deepEqual(conf2.stations.slice(1), plan.stations.slice(1).map(() => false), "other tenders unaffected");
  // Pave the salvager-tender cell (6,9) -> hidden by the road rule.
  const g3 = createGame();
  g3.tier = 2;
  g3.bank = Object.fromEntries(Object.keys(g3.bank).map((k) => [k, 1e9]));
  assert.equal(roadLine(g3, {x: 6, z: 9}, {x: 6, z: 9}).ok, true);
  const conf3 = crowdConflicts(plan, g3, null);
  assert.equal(conf3.stations[0], true, "paved station cell hides the tender");
  // Volumetric dressing reaching the standing radius hides it too.
  const st0 = plan.stations[0];
  const vols = {props: [{x: st0.x, z: st0.z, w: 1.5, d: 1.5}], rubble: []};
  assert.equal(crowdConflicts(plan, createGame(), vols).stations[0], true, "volumetric prop hides the station");
  // Hidden stations are skipped as threats and never drift.
  const state = createCrowdState(plan);
  state.stations[0].hidden = true;
  const before = JSON.stringify(state.stations[0]);
  for (let f = 0; f < 100; f++) stepCrowd(state, plan, 0.07, {trucks: [], anchor: null, reduced: false});
  assert.equal(JSON.stringify(state.stations[0]), before, "hidden station frozen");
});
