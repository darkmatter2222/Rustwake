// #589 measurement driver (numeric evidence only; not visual acceptance).
// Usage: node scripts/measure-589-traffic.mjs [srcDir] [seconds] [mode]
//   srcDir: directory containing simulation.js (default ../src)
//   mode: "multi" (freight test-12 fixture), "fresh" (zero-input fresh yard),
//         "collision" (deliberate head-on fixture, see below), or
//         "detour" (idle-blocker gridlock that only recovery dissolves)
//
// "collision" is the before/after discriminator for the sponsor's overlap
// complaint: TWO trucks, equal speed 7/3 cells/s, opposing 14-cell routes on the
// SAME road row z=12 (x=5..19). They coincide exactly at x=12, t=3.0 s (a tick
// boundary at the real 0.5 s substep). At the base 956a4706 both interpolate
// cell CENTRES, so the sampled pairwise envelope gap is ~ -2.05 world (full
// interpenetration). With #589 right-hand lanes they pass on opposite sides at
// z=12.35 / z=11.65 and the gap never drops below MIN_GAP_WORLD. The same
// fixture is asserted in tests/trafficSeparation.test.mjs; reproduce the BEFORE
// value by pointing srcDir at an extracted base src/ (git archive 956a4706 src).
// The gap metric is always THIS checkout's traffic.js envelopeGapWorld, so base
// and head are measured with the identical ruler.
// Reports: arrivals, shipments, delivered units, min pairwise envelope gap
// sampled EVERY tick, per-truck end state, reroute count.
import {pathToFileURL} from "node:url";
import path from "node:path";

const srcDir = process.argv[2] || path.resolve(import.meta.dirname, "../src");
const seconds = Number(process.argv[3] || 200);
const mode = process.argv[4] || "multi";
const sim = await import(pathToFileURL(path.join(srcDir, "simulation.js")).href);
// Ruler is ALWAYS this checkout's traffic.js (base has none), so before/after
// numbers are measured with the identical envelope metric.
const trafficUrl = pathToFileURL(path.resolve(import.meta.dirname, "../src/traffic.js")).href;
let gapFn = null, MIN_GAP = null;
try { ({envelopeGapWorld: gapFn, MIN_GAP_WORLD: MIN_GAP} = await import(trafficUrl)); } catch {}
const {createGame, advanceGame, freightTotals, buildAt} = sim;
const {INITIAL_BANK} = await import(pathToFileURL(path.join(srcDir, "content.js")).href);
const ZERO_BANK = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0]));

const g = createGame();
if (mode === "collision") {
  // Deliberate head-on: frozen power, empty bags, TWO trucks, opposing routes
  // on the same row. Equal speed 7/3 makes the coincidence land on tick 6.
  g.buildings.find(b => b.id === 3).remaining = 1e9;
  for (const b of g.buildings) b.inventory = {};
  g.bank = {...ZERO_BANK, credits: 1800};
  g.vehicles = g.vehicles.slice(0, 2);
  const east = [];
  for (let x = 5; x <= 19; x++) east.push({x, z: 12});
  const west = east.slice().reverse();
  const mkJob = route => ({sourceId: 1, destId: 2, resource: "scrap", amount: 5,
    phase: "toDest", toSource: [{x: 11, z: 12}], toDest: route, route, segment: 0, progress: 0});
  const [a, b] = g.vehicles;
  a.speed = 7 / 3; b.speed = 7 / 3;
  a.x = 5; a.z = 12; a.job = mkJob(east); a.cargo = {resource: "scrap", amount: 5};
  b.x = 19; b.z = 12; b.job = mkJob(west); b.cargo = {resource: "scrap", amount: 5};
}
if (mode === "detour") {
  // Genuine gridlock-recovery fixture (#589 priority 2). A DRY yard (every bag
  // empty, frozen power) means the dispatcher has NO candidates, so an idle
  // truck parked on the road never moves. Truck 1 carries a pre-reserved load
  // east along row 8 toward the depot; idle truck 2 is parked at (8, 8.35) —
  // the eastbound lane of cell (8,8), mid-route. Truck 1 clamps behind it,
  // queues honestly for WAIT_TIMEOUT_SECONDS, then rerouteAroundBlocker must
  // dissolve the block via the obstacle BFS (west to col 5, south to row 12,
  // east to col 11, north back to row 8). Without recovery (scratch copy with
  // WAIT_TIMEOUT_SECONDS=1e9) truck 1 starves forever: 0 arrivals. With it,
  // the load arrives and conservation holds every tick. The bay-queue last
  // resort does NOT apply: the blocker is 5 cells from the route end (> 1).
  g.buildings.find(b => b.id === 3).remaining = 1e9;
  for (const b of g.buildings) b.inventory = {};
  g.bank = {...ZERO_BANK, credits: 1800};
  g.vehicles = g.vehicles.slice(0, 2);
  const route = [];
  for (let x = 7; x <= 13; x++) route.push({x, z: 8});
  const [a, b] = g.vehicles;
  a.speed = 2.25;
  a.x = 7; a.z = 8.35; a.heading = {x: 1, z: 0};
  a.job = {sourceId: 1, destId: 2, resource: "scrap", amount: 5,
    phase: "toDest", toSource: [{x: 7, z: 8}], toDest: route, route, segment: 0, progress: 0};
  a.cargo = {resource: "scrap", amount: 5};
  b.x = 8; b.z = 8.35; b.heading = {x: 1, z: 0}; // idle, jobless, never dispatched
}
if (mode === "multi") {
  g.buildings.find(b => b.id === 3).remaining = 1e9;
  for (const b of g.buildings) b.inventory = {};
  g.bank = {...ZERO_BANK, credits: 5000, scrap: 28, stone: 12, iron: 40};
  const built = buildAt(g, "salvager", 6, 7);
  if (!built.ok) throw new Error("build failed: " + built.reason);
  built.building.remaining = 0;
  built.building.inventory = {scrap: 20};
  g.buildings.find(b => b.id === 1).inventory = {scrap: 12};
}
const base = freightTotals(g).totals;
// Key-order-insensitive totals comparison (freightTotals insertion order shifts
// as resources move between bank and inventories; deepStrictEqual semantics).
const norm = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const baseNorm = norm(base);
const step = 0.5;
const ticks = Math.round(seconds / step);
let minGap = Infinity, minGapAt = -1, minPair = null;
let leaks = 0, reroutes = 0, maxJump = 0, maxJumpAt = -1;
const prevPos = new Map();
const prevRoute = new Map();
const prevPhase = new Map();
for (let i = 0; i < ticks; i++) {
  for (const v of g.vehicles) {
    prevPos.set(v.id, {x: v.x, z: v.z});
    prevRoute.set(v.id, v.job ? v.job.route.map(p => p.x + "," + p.z).join("|") : null);
    prevPhase.set(v.id, v.job?.phase ?? null);
  }
  advanceGame(g, step);
  const t = freightTotals(g);
  // Conservation is only meaningful in the frozen-power multi/collision
  // fixtures; in a fresh yard production legitimately grows totals every cycle.
  if ((mode === "multi" || mode === "collision" || mode === "detour") && norm(t.totals) !== baseNorm) leaks++;
  for (const v of g.vehicles) {
    const p = prevPos.get(v.id);
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    const r = v.job ? v.job.route.map(q => q.x + "," + q.z).join("|") : null;
    // A reroute changes the route WITHOUT changing phase (pickup flips
    // toSource->toDest, so it is excluded); it resets segment/progress to 0.
    if (r && prevRoute.get(v.id) && r !== prevRoute.get(v.id) &&
        v.job.phase === prevPhase.get(v.id) && v.job.segment === 0 && v.job.progress === 0) {
      reroutes++;
      if (d > maxJump) { maxJump = d; maxJumpAt = i; }
    }
  }
  if (gapFn) {
    for (let a = 0; a < g.vehicles.length; a++) for (let b = a + 1; b < g.vehicles.length; b++) {
      const gap = gapFn(g.vehicles[a], g.vehicles[b]);
      if (gap < minGap) { minGap = gap; minGapAt = i; minPair = [g.vehicles[a].id, g.vehicles[b].id]; }
    }
  }
}
const arrives = g.freightLedger.filter(e => e.kind === "arrive");
console.log(JSON.stringify({
  srcDir, mode, seconds, ticks,
  arrivals: arrives.length,
  shipments: g.stats.shipments,
  delivered: g.stats.delivered,
  conservationLeaks: leaks,
  minGapWorld: gapFn ? minGap : "n/a (base has no traffic.js)",
  minGapAtTick: minGapAt, minPair, declaredMinGap: MIN_GAP,
  rerouteCommits: reroutes,
  maxRerouteDisplacementCells: maxJump, maxRerouteAtTick: maxJumpAt,
  trucks: g.vehicles.map(v => ({
    id: v.id, x: +v.x.toFixed(3), z: +v.z.toFixed(3),
    phase: v.job?.phase ?? null, seg: v.job?.segment ?? null,
    prog: v.job ? +v.job.progress.toFixed(3) : null,
    routeLen: v.job?.route.length ?? null,
    waiting: !!v.waiting, blockedBy: v.blockedBy ?? null,
    waitTime: +(v.waitTime || 0).toFixed(1), cargo: v.cargo?.amount ?? 0
  }))
}, null, 1));
