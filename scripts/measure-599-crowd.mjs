// Refs 599 crowd separation ruler. SAME harness as tests/crowd.test.mjs
// (runWindow + roadTraffic + anchorScript), reported as JSON for before/after
// evidence at whatever density src/crowd.js currently declares. Numeric only.
// Usage: node scripts/measure-599-crowd.mjs [seconds]
import {CELL, WORLD_SIZE} from "../src/content.js";
import {CROWD_MOTION, crowdPlan, createCrowdState, stepCrowd} from "../src/crowd.js";

const M = CROWD_MOTION;
const origin = (i) => (i - WORLD_SIZE / 2 + 0.5) * CELL;
const DTS = [0.016, 0.033, 0.07, 0.05, 0.025, 0.07, 0.04];
const SEEDS = [4073, 1, 777, 9999, 12345, 2026, 31337];
const R = {w: M.workerRadius, f: M.forkliftRadius, t: M.truckRadius, d: M.droneRadius, s: M.workerRadius};
const Y = {w: 0.85, f: 0.55, t: 0.675, s: 0.85};
const seconds = Number(process.argv[2] || 240);

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
function anchorScript() {
  const targets = [null, {x: origin(16), y: 5.6, z: origin(13), id: "furnace-4"},
    null, {x: origin(7), y: 4.14, z: origin(9), id: "salvager-1"}];
  return (t) => ({trucks: [], anchor: targets[Math.floor(t / 20) % targets.length], reduced: false});
}

// Keys are the two class letters SORTED (d<f<s<t<w): forklift-station is "fs".
// (The original "sf" entry never matched the sorted key and silently skipped
// the forklift-station pair — fixed so the pair is actually measured.)
const KEYS = ["ww", "fw", "tw", "ft", "dw", "df", "dt", "sw", "fs", "st", "ss"];
const perSeed = [];
const agg = Object.fromEntries(KEYS.map(k => [k, Infinity]));
let walkers = 0, stations = 0, segments = 0, maxWorkerStep = 0, locomotion = 0;
for (const seed of SEEDS) {
  const plan = crowdPlan(seed);
  const state = createCrowdState(plan);
  walkers = plan.walkers.length; stations = (plan.stations || []).length; segments = plan.segments.length;
  const traffic = roadTraffic(), anchors = anchorScript();
  const min = Object.fromEntries(KEYS.map(k => [k, Infinity]));
  let t = 0, fi = 0, frames = 0;
  const startDist = state.walkers.map(w => w.dist);
  while (t < seconds - 1e-9) {
    const dt = Math.min(DTS[fi % DTS.length], seconds - t);
    const e1 = traffic(t, dt), e2 = anchors(t);
    const env = {trucks: e1.trucks, anchor: e2.anchor, reduced: false};
    const pw = state.walkers.map(w => ({x: w.x, z: w.z}));
    stepCrowd(state, plan, dt, env);
    frames++;
    state.walkers.forEach((w, i) => { maxWorkerStep = Math.max(maxWorkerStep, Math.hypot(w.x - pw[i].x, w.z - pw[i].z)); });
    const movers = [
      ...state.walkers.filter(w => !w.hidden).map(w => ({cls: "w", x: w.x, y: Y.w, z: w.z, r: R.w})),
      ...(state.forklift.hidden ? [] : [{cls: "f", x: state.forklift.x, y: Y.f, z: state.forklift.z, r: R.f}]),
      ...(state.stations || []).filter(s => !s.hidden).map(s => ({cls: "s", x: s.x, y: Y.s, z: s.z, r: R.s})),
      ...(env.trucks || []).map(tr => ({cls: "t", x: tr.x, y: Y.t, z: tr.z, r: R.t})),
      {cls: "d", x: state.drone.x, y: state.drone.y, z: state.drone.z, r: R.d}
    ];
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const a = movers[i], b = movers[j];
      if (a.cls === "t" && b.cls === "t") continue;
      const kk = [a.cls, b.cls].sort().join("");
      if (!(kk in min)) continue;
      const dist = (a.cls === "d" || b.cls === "d") ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Math.hypot(a.x - b.x, a.z - b.z);
      min[kk] = Math.min(min[kk], dist - a.r - b.r);
    }
    t += dt; fi++;
  }
  const dist = state.walkers.reduce((s, w, i) => s + (w.dist - startDist[i]), 0);
  locomotion += dist;
  for (const k of KEYS) agg[k] = Math.min(agg[k], min[k]);
  perSeed.push({seed, frames, min, walkerDistSum: Number(dist.toFixed(3))});
}
const finite = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number.isFinite(v) ? Number(v.toFixed(9)) : null]));
console.log(JSON.stringify({
  seconds, seeds: SEEDS, walkers, stations, segments,
  clearanceMargin: M.clearanceMargin, laneOffset: M.laneOffset,
  workerHardR: 2 * M.workerRadius + M.clearanceMargin + 0.02,
  maxWorkerStep: Number(maxWorkerStep.toFixed(6)), maxWorkerStepBudget: M.maxWorkerStep,
  locomotionTotal: Number(locomotion.toFixed(3)),
  aggregateMin: finite(agg), perSeed: perSeed.map(p => ({...p, min: finite(p.min)}))
}, null, 1));
