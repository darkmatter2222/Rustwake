// #589 separation evidence — the sponsor's G1 REJECT was "movers interpenetrate".
// These tests are the falsifiable numeric half of the remedy. They are NOT
// visual acceptance: the sponsor's on-screen judgement at G1 (#276) is owed on
// the deployed build and no numeric pixel count can substitute for it.
//
// BEFORE values below were measured against the base 956a4706 by extracting
// `git archive 956a4706 src` to a scratch dir and running the IDENTICAL fixture
// through scripts/measure-589-traffic.mjs (modes collision/fresh/multi/detour).
// The gap ruler is always THIS checkout's traffic.js envelopeGapWorld (square
// conservative envelope, world units), so base and head use the same metric.
// Reproduce: node scripts/measure-589-traffic.mjs <scratch>/base/src 10 collision
//
//   fixture    base min gap      head min gap      base arrivals  head arrivals
//   collision  -2.05 world       +0.4 world        2              2
//   fresh 660  -2.05 world       +0.3000000023     43             42
//   multi 200  -2.05 world       +0.3000000035     4              4
//   detour 60  (no recovery:     +0.3000000035     0 (scratch     1
//              0 arrivals,                        WAIT_TIMEOUT=1e9)
//              permanent stall)
//
// A test that would also pass at the base is not evidence: the collision and
// fresh-yard gap assertions FAIL on the base numbers above (-2.05 < 0.3).
import test from "node:test";
import assert from "node:assert/strict";
import {createGame, advanceGame, freightTotals, buildAt, persist, readGame} from "../src/simulation.js";
import {INITIAL_BANK} from "../src/content.js";
import {envelopeGapWorld, MIN_GAP_WORLD} from "../src/traffic.js";

const ZERO_BANK = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0]));
const STEP = 0.5; // the real advanceGame substep cadence
const GAP_EPS = 1e-6; // fp slack on the declared clearance, never a relaxation

const norm = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));

function minPairGap(g) {
  let min = Infinity, pair = null;
  for (let a = 0; a < g.vehicles.length; a++)
    for (let b = a + 1; b < g.vehicles.length; b++) {
      const gap = envelopeGapWorld(g.vehicles[a], g.vehicles[b]);
      if (gap < min) { min = gap; pair = [g.vehicles[a].id, g.vehicles[b].id]; }
    }
  return {min, pair};
}

// Deliberate head-on fixture (identical to measure script mode "collision"):
// TWO trucks, equal speed 7/3 cells/s, opposing 14-cell routes on the SAME road
// row z=12 (x=5..19). They coincide at x=12 exactly on tick 5 (t=3.0 s). Frozen
// power + empty bags keep the dispatcher out of the fixture; the loads are
// pre-reserved onboard cargo, so both deliveries must still complete.
function collisionGame() {
  const g = createGame();
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
  return g;
}

// Idle-blocker gridlock (identical to measure script mode "detour"). A DRY yard
// gives the dispatcher no candidates, so idle truck 2 parked at (8, 8.35) — the
// eastbound lane of cell (8,8), mid-route — never moves. Truck 1's pre-reserved
// load clamps behind it; only rerouteAroundBlocker dissolves the block. The
// bay-queue last resort does not apply (blocker is 5 cells from the route end).
function detourGame() {
  const g = createGame();
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
  b.x = 8; b.z = 8.35; b.heading = {x: 1, z: 0};
  return g;
}

// freight.test.mjs test-12 multi-carrier yard (identical to measure mode "multi").
function multiGame() {
  const g = createGame();
  g.buildings.find(b => b.id === 3).remaining = 1e9;
  for (const b of g.buildings) b.inventory = {};
  g.bank = {...ZERO_BANK, credits: 5000, scrap: 28, stone: 12, iron: 40};
  const built = buildAt(g, "salvager", 6, 7);
  assert.equal(built.ok, true, "multi fixture build must succeed");
  built.building.remaining = 0;
  built.building.inventory = {scrap: 20};
  g.buildings.find(b => b.id === 1).inventory = {scrap: 12};
  return g;
}

// One shared 660 s zero-input fresh-yard run backs both the invariant and the
// throughput test (1320 ticks at the real cadence, sampled EVERY tick).
let freshRun = null;
function freshYard660() {
  if (freshRun) return freshRun;
  const g = createGame();
  const ticks = Math.round(660 / STEP);
  let minGap = Infinity, minAt = -1, minPair = null, reroutes = 0, maxJump = 0;
  const prevPos = new Map(), prevRoute = new Map(), prevPhase = new Map();
  for (let i = 0; i < ticks; i++) {
    for (const v of g.vehicles) {
      prevPos.set(v.id, {x: v.x, z: v.z});
      prevRoute.set(v.id, v.job ? v.job.route.map(p => p.x + "," + p.z).join("|") : null);
      prevPhase.set(v.id, v.job?.phase ?? null);
    }
    advanceGame(g, STEP);
    const {min, pair} = minPairGap(g);
    if (min < minGap) { minGap = min; minAt = i; minPair = pair; }
    for (const v of g.vehicles) {
      const p = prevPos.get(v.id);
      const r = v.job ? v.job.route.map(q => q.x + "," + q.z).join("|") : null;
      if (r && prevRoute.get(v.id) && r !== prevRoute.get(v.id) &&
          v.job.phase === prevPhase.get(v.id) && v.job.segment === 0 && v.job.progress === 0) {
        reroutes++;
        maxJump = Math.max(maxJump, Math.hypot(v.x - p.x, v.z - p.z));
      }
    }
  }
  freshRun = {
    g, minGap, minAt, minPair, reroutes, maxJump,
    arrivals: g.freightLedger.filter(e => e.kind === "arrive").length,
    delivered: g.stats.delivered, shipments: g.stats.shipments
  };
  return freshRun;
}

test("collision fixture: head-on pass keeps declared clearance (base overlapped -2.05 world)", t => {
  const g = collisionGame();
  const base = norm(freightTotals(g).totals);
  let minGap = Infinity, minAt = -1, met = false;
  for (let i = 0; i < Math.round(10 / STEP); i++) {
    advanceGame(g, STEP);
    assert.equal(norm(freightTotals(g).totals), base, "freight conserved every tick");
    const {min} = minPairGap(g);
    if (min < minGap) { minGap = min; minAt = i; }
    const [a, b] = g.vehicles;
    if (Math.abs(a.x - b.x) < 0.6) met = true; // the trucks actually met
  }
  // NON-VACUITY: the fixture provably overlapped at the base. Measured before
  // value at 956a4706 (scratch extraction, identical fixture, same ruler):
  // minGap = -2.049999999999999 world at tick 5 (t=3.0 s), pair [1,2] — the
  // square envelopes fully coincident at x=12. This assertion FAILS there.
  assert.ok(met, "fixture must bring the trucks to the same cell region");
  assert.ok(minGap >= MIN_GAP_WORLD - GAP_EPS,
    `head-on pass must keep >= ${MIN_GAP_WORLD} world; measured ${minGap} at tick ${minAt}`);
  assert.equal(g.freightLedger.filter(e => e.kind === "arrive").length, 2,
    "separation must not cost deliveries: both loads arrive (base also 2)");
  assert.equal(g.stats.delivered, 10);
  t.diagnostic(`collision after: minGap=${minGap} world at tick ${minAt}; before(base 956a4706)=-2.049999999999999 at tick 5`);
});

test("fresh yard 660 s zero-input: pairwise envelope gap never below MIN_GAP_WORLD", t => {
  const r = freshYard660();
  // BEFORE at base 956a4706, same 660 s zero-input run: minGap = -2.05 world
  // at tick 102, pair [1,3] — the sponsor's overlap reproduces on a fresh yard
  // with no player input at all. This assertion FAILS there.
  assert.ok(r.minGap >= MIN_GAP_WORLD - GAP_EPS,
    `measured min ${r.minGap} at tick ${r.minAt} pair ${r.minPair}`);
  assert.equal(r.reroutes, 0, "a normal fresh yard never needs deadlock recovery");
  t.diagnostic(`fresh 660s after: minGap=${r.minGap} at tick ${r.minAt} pair ${r.minPair}; before(base)=-2.049999999999999 at tick 102 pair [1,3]`);
});

test("fresh yard 660 s: throughput does not collapse vs base (no furnace starvation)", t => {
  const r = freshYard660();
  // Measured base 956a4706 over the identical window: 43 arrivals / 293
  // shipments / 2778 delivered. Head: 42 / 253 / 2639 (95.0% of base units).
  // Floors sit below the measured head values with margin; a collapse like the
  // earlier full-sweep design (1 arrival / 200 s) fails them outright.
  assert.ok(r.arrivals >= 40, `arrivals ${r.arrivals} (base 43) — blocking must not starve the yard`);
  assert.ok(r.delivered >= 2400, `delivered ${r.delivered} (base 2778) — >= 86% of base`);
  t.diagnostic(`fresh 660s throughput after: arrivals=${r.arrivals} shipments=${r.shipments} delivered=${r.delivered}; before(base): 43/293/2778`);
});

// Motion + queue attribution state, excluding wall-clock fields.
const motionState = g => JSON.stringify(g.vehicles.map(v => ({
  id: v.id, x: v.x, z: v.z, heading: v.heading, waiting: v.waiting,
  blockedBy: v.blockedBy, waitTime: v.waitTime, cargo: v.cargo,
  job: v.job && {phase: v.job.phase, segment: v.job.segment, progress: v.job.progress,
    sourceId: v.job.sourceId, destId: v.job.destId, amount: v.job.amount,
    route: v.job.route, toSource: v.job.toSource, toDest: v.job.toDest}
})));

test("determinism: same seed => identical trajectories and queue attribution, across save/reload", () => {
  const store = new Map();
  globalThis.localStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
  const a = createGame(), b = createGame();
  assert.equal(a.seed, b.seed);
  const ticks = Math.round(120 / STEP);
  const reloadAt = Math.round(60 / STEP);
  let ga = a;
  for (let i = 0; i < ticks; i++) {
    if (i === reloadAt) {
      assert.equal(persist(ga), true);
      ga = readGame(); // real save path: reconcile + sanitize, no offline catch-up
    }
    advanceGame(ga, STEP);
    advanceGame(b, STEP);
    assert.equal(motionState(ga), motionState(b), `tick ${i}: trajectories + queue attribution must match`);
    assert.equal(ga.stats.delivered, b.stats.delivered);
    assert.equal(ga.stats.shipments, b.stats.shipments);
  }
  delete globalThis.localStorage;
});

test("freight integrity: multi-carrier yard conserves every resource on every tick", t => {
  const g = multiGame();
  const base = norm(freightTotals(g).totals);
  let minGap = Infinity;
  for (let i = 0; i < Math.round(200 / STEP); i++) {
    advanceGame(g, STEP);
    assert.equal(norm(freightTotals(g).totals), base, `tick ${i}: no lost or duplicated freight`);
    minGap = Math.min(minGap, minPairGap(g).min);
  }
  assert.ok(minGap >= MIN_GAP_WORLD - GAP_EPS, `multi min gap ${minGap}`);
  // Base 956a4706 identical fixture: 4 arrivals / 47 delivered (and -2.05 world
  // overlap at tick 15). Head matches throughput exactly while separating.
  assert.ok(g.freightLedger.filter(e => e.kind === "arrive").length >= 4,
    "multi-carrier deliveries keep flowing (base 4)");
  assert.equal(g.stats.delivered, 47);
  t.diagnostic(`multi 200s after: minGap=${minGap}, delivered=47 (base 47, base minGap -2.05)`);
});

test("freight guards still behave under the separation integrator (ROUTE_BLOCKED / SOURCE_MISSING / JOB_MISSING)", () => {
  // ROUTE_BLOCKED: sever a road cell on the active route -> load returns once.
  const g1 = collisionGame();
  const base1 = norm(freightTotals(g1).totals);
  g1.roads = g1.roads.filter(k => k !== "10,12");
  advanceGame(g1, STEP);
  const returns1 = g1.freightLedger.filter(e => e.kind === "return");
  assert.ok(returns1.some(e => e.reason === "ROUTE_BLOCKED"), "severed route returns freight");
  assert.equal(norm(freightTotals(g1).totals), base1, "return conserves units");
  // SOURCE_MISSING: vanish the source building -> load returns to bank once.
  const g2 = collisionGame();
  const base2 = norm(freightTotals(g2).totals);
  g2.buildings = g2.buildings.filter(b => b.id !== 1);
  advanceGame(g2, STEP);
  assert.ok(g2.freightLedger.some(e => e.kind === "return" && e.reason === "SOURCE_MISSING"));
  assert.equal(norm(freightTotals(g2).totals), base2);
  // JOB_MISSING: cargo without a job is returned, never hauled ghost freight.
  const g3 = collisionGame();
  const base3 = norm(freightTotals(g3).totals);
  g3.vehicles[0].job = null; // cargo stays onboard
  advanceGame(g3, STEP);
  assert.ok(g3.freightLedger.some(e => e.kind === "return" && e.reason === "JOB_MISSING"));
  assert.equal(norm(freightTotals(g3).totals), base3);
});

test("reroute recovery: idle-blocker gridlock starves without it, delivers with it; bounded, no oscillation", t => {
  const g = detourGame();
  const base = norm(freightTotals(g).totals);
  let minGap = Infinity, reroutes = 0, maxJump = 0, sawBlock = false, cargoIntact = true;
  const prevPos = new Map(), prevRoute = new Map(), prevPhase = new Map();
  for (let i = 0; i < Math.round(60 / STEP); i++) {
    for (const v of g.vehicles) {
      prevPos.set(v.id, {x: v.x, z: v.z});
      prevRoute.set(v.id, v.job ? v.job.route.map(p => p.x + "," + p.z).join("|") : null);
      prevPhase.set(v.id, v.job?.phase ?? null);
    }
    advanceGame(g, STEP);
    assert.equal(norm(freightTotals(g).totals), base, `tick ${i}: recovery must not lose freight`);
    minGap = Math.min(minGap, minPairGap(g).min);
    const a = g.vehicles[0];
    if (a.waiting && a.blockedBy === 2) sawBlock = true;
    if (a.job && (a.cargo?.amount !== 5 || a.job.phase !== "toDest")) cargoIntact = false;
    for (const v of g.vehicles) {
      const p = prevPos.get(v.id);
      const r = v.job ? v.job.route.map(q => q.x + "," + q.z).join("|") : null;
      if (r && prevRoute.get(v.id) && r !== prevRoute.get(v.id) &&
          v.job.phase === prevPhase.get(v.id) && v.job.segment === 0 && v.job.progress === 0) {
        reroutes++;
        maxJump = Math.max(maxJump, Math.hypot(v.x - p.x, v.z - p.z));
      }
    }
  }
  // NON-VACUITY (measured, scratch instrumentation only — repo src untouched):
  // a copy of HEAD src with WAIT_TIMEOUT_SECONDS=1e9 (recovery disabled) runs
  // this identical fixture to 0 arrivals / 0 delivered; truck 1 stalls at
  // (7.329, 8.35), waitTime 60 s, blockedBy 2, cargo 5 — permanent starvation.
  // With recovery: 1 arrival / 5 delivered. The fixture genuinely gridlocks.
  assert.ok(sawBlock, "fixture must actually queue behind the idle blocker");
  assert.equal(g.freightLedger.filter(e => e.kind === "arrive").length, 1, "recovery dissolves the gridlock");
  assert.equal(g.stats.delivered, 5);
  assert.equal(g.bank.scrap, 5, "load credited exactly once");
  assert.equal(g.freightLedger.filter(e => e.kind === "return").length, 0, "no freight returned/lost");
  assert.ok(cargoIntact, "cargo amount and delivery phase intact across reroute");
  // Bounded displacement: measured largest single-tick relocation 0.7732782
  // cells (2.706 world) at tick 19 — the clamped position (7.3286, 8.35) to the
  // detour lane start (7, 7.65). Bound 1.0 cell = 3.5 world (~1.7 truck lengths).
  // This is a recovery snap, not integrated motion; it is separation-checked
  // before commit (min gap below holds on the reroute tick too). Larger jumps
  // are not exhaustively excluded — see TRAFFIC.md limitations.
  assert.equal(reroutes, 1, "exactly one recovery — no reroute/re-block thrash");
  assert.ok(maxJump <= 1.0, `reroute displacement ${maxJump} cells must stay <= 1.0`);
  assert.ok(minGap >= MIN_GAP_WORLD - GAP_EPS, `gap holds through recovery: ${minGap}`);
  t.diagnostic(`detour after: arrivals=1 delivered=5 reroutes=${reroutes} maxJump=${maxJump} cells minGap=${minGap}; no-recovery scratch: 0 arrivals, stalled waitTime=60`);
});
