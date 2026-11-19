// Refs 599 placement probe: which candidate patrol corridors / station cells
// are blocked by roads, footprints or volumetric dressing, per seed?
// Pure data probe against the REAL yardSceneryPlan + crowdConflicts rules.
globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})};
const {yardSceneryPlan, DEFAULT_YARD_SEED} = await import("../src/world.js");
const {crowdConflicts, CROWD_MOTION} = await import("../src/crowd.js");
const {createGame} = await import("../src/simulation.js");
const {CELL, WORLD_SIZE} = await import("../src/content.js");

const origin = (i) => (i - WORLD_SIZE / 2 + 0.5) * CELL;
const M = CROWD_MOTION;

// Candidate NEW patrol segments (cell ranges inclusive).
const NEW_SEGMENTS = [
  {id: "north-z7-w", x0: 6, z0: 7, x1: 10, z1: 7},
  {id: "north-z7-e", x0: 12, z0: 7, x1: 13, z1: 7},
  {id: "south-z18-w", x0: 6, z0: 18, x1: 10, z1: 18},
  {id: "south-z18-m", x0: 12, z0: 18, x1: 13, z1: 18},
  {id: "south-z18-e", x0: 16, z0: 18, x1: 18, z1: 18},
  {id: "east-x20", x0: 20, z0: 9, x1: 20, z1: 16},
  {id: "west-x4", x0: 4, z0: 9, x1: 4, z1: 16}
];
// Candidate station cells (static workers).
const STATIONS = [
  {id: "salvager-tender", x: 6, z: 9},
  {id: "depot-queue-1", x: 14, z: 9},
  {id: "depot-queue-2", x: 15, z: 9},
  {id: "depot-queue-3", x: 16, z: 9},
  {id: "furnace-tender", x: 17, z: 13},
  {id: "generator-tender", x: 6, z: 16},
  {id: "crane-tender", x: 14, z: 7},
  {id: "market-clerk", x: 14, z: 18}
];

const SEEDS = [4073, 1, 777, 9999, 12345, 2026, 31337];
const report = [];
for (const seed of SEEDS) {
  const g = createGame();
  g.seed = seed;
  const sp = yardSceneryPlan(seed);
  // Build a synthetic plan containing ONLY the candidate segments and reuse
  // the real crowdConflicts corridor rule (roads + footprints + volumetrics).
  const segs = NEW_SEGMENTS.map((d) => {
    const cells = [];
    for (let x = d.x0; x <= d.x1; x++) for (let z = d.z0; z <= d.z1; z++) cells.push([x, z]);
    const ax = origin(d.x0), az = origin(d.z0), bx = origin(d.x1), bz = origin(d.z1);
    const len = Math.hypot(bx - ax, bz - az) || 1;
    return {id: d.id, ax, az, bx, bz, ux: (bx - ax) / len, uz: (bz - az) / len, len, cells};
  });
  const plan = {segments: segs, forklift: {cells: [[13, 10], [12, 10]], post: {x: 0, z: 0}}};
  const conf = crowdConflicts(plan, g, sp);
  // Station cells: same blocker set as corridors, point radius = workerRadius.
  const blocked = new Set(g.roads);
  const {footprintCells} = await import("../src/gridOccupancy.js");
  const {key} = await import("../src/gridOccupancy.js");
  for (const b of g.buildings) for (const c of footprintCells(b.type, b.x, b.z, b.rot || 0)) blocked.add(key(c.x, c.z));
  const vols = [];
  for (const o of sp.props || []) vols.push({x: o.x, z: o.z, r: Math.hypot(o.w || 1, o.d || 1) / 2});
  for (const o of sp.rubble || []) if ((o.h || 0) > 0.1) vols.push({x: o.x, z: o.z, r: Math.hypot(o.w || 1, o.d || 1) / 2});
  const stationBlocked = STATIONS.map((st) => {
    const wx = origin(st.x), wz = origin(st.z);
    if (blocked.has(key(st.x, st.z))) return {id: st.id, why: "cell"};
    for (const v of vols) if (Math.hypot(v.x - wx, v.z - wz) < v.r + M.workerRadius + M.clearanceMargin) return {id: st.id, why: "vol"};
    return null;
  }).filter(Boolean);
  report.push({seed, hiddenSegments: segs.filter((s, i) => conf.segments[i]).map((s) => s.id), stationBlocked});
}
console.log(JSON.stringify(report, null, 1));