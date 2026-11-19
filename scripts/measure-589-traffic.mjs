// #589 measurement driver (numeric evidence only; not visual acceptance).
// Usage: node scripts/measure-589-traffic.mjs [srcDir] [seconds] [mode]
//   srcDir: directory containing simulation.js (default ../src)
//   mode: "multi" (freight test-12 fixture) or "fresh" (zero-input fresh yard)
// Reports: arrivals, shipments, delivered units, min pairwise envelope gap
// sampled EVERY tick, per-truck end state, reroute count.
import {pathToFileURL} from "node:url";
import path from "node:path";

const srcDir = process.argv[2] || path.resolve(import.meta.dirname, "../src");
const seconds = Number(process.argv[3] || 200);
const mode = process.argv[4] || "multi";
const sim = await import(pathToFileURL(path.join(srcDir, "simulation.js")).href);
const trafficUrl = pathToFileURL(path.join(srcDir, "traffic.js")).href;
let gapFn = null, MIN_GAP = null;
try { ({envelopeGapWorld: gapFn, MIN_GAP_WORLD: MIN_GAP} = await import(trafficUrl)); } catch {}
const {createGame, advanceGame, freightTotals, buildAt} = sim;
const {INITIAL_BANK} = await import(pathToFileURL(path.join(srcDir, "content.js")).href);

const g = createGame();
if (mode === "multi") {
  g.buildings.find(b => b.id === 3).remaining = 1e9;
  for (const b of g.buildings) b.inventory = {};
  const ZERO_BANK = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0]));
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
  // Conservation is only meaningful in the frozen-power multi fixture; in a
  // fresh yard production legitimately grows totals every cycle.
  if (mode === "multi" && norm(t.totals) !== baseNorm) leaks++;
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
