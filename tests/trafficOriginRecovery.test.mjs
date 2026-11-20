// Refs #596 — B-tests: bounded origin-cell join-hold recovery (traffic).
//
// Drives the NON-EXPORTED recovery call graph (commitRecoveryRoute /
// recoveryAvoid / originSidestep / rerouteAroundBlocker / recoverDeparture /
// commitDeparture / assignJob) exclusively through the exported entry points
// (createGame / advanceGame / freightTotals / roadPath / dockApproach) and
// asserts OBSERVABLE state: v.recoveryTries, v.route / j.toDest, v.waiting,
// v.blockedBy, v.waitTime, v.x / v.z, j.phase, freightLedger arrivals.
// No test-only exports or setters were added to src/.
//
// Negative control is BASE-MATERIALIZED: the identical fixture runs against
// src/ extracted from base 0791dc55b37ee60ed2b308a69fa4dd002e2f9a94 (the PR's
// merge-base parity point — NOT current main, which moved via #609; the
// coordinator proved the merge clean/disjoint, so no rebase). CI checks out
// shallow (fetch-depth 1), so the base commit is fetched on demand
// (GitHub allows arbitrary-SHA wants) into an os.tmpdir() scratch dir and
// imported via pathToFileURL. The control FAILS LOUDLY if the base cannot be
// materialized — it is never skipped. The gap ruler is ALWAYS this checkout's
// traffic.js envelopeGapWorld for BOTH revisions (identical square-envelope
// metric; base has no ORIGIN_RECOVERY_RADIUS_CELLS / originSidestep at all).
//
// Measured pins below were produced by scripts/measure-596-recovery.mjs and
// tick-level scratch probes on this machine; they are regression pins, not
// visual acceptance. Nothing here certifies visual fidelity — sponsor G1 on
// the deployed build is the only visual gate.
import test, {after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {
  createGame, advanceGame, freightTotals, roadPath, dockApproach,
  ORIGIN_RECOVERY_MAX_TRIES
} from "../src/simulation.js";
import {INITIAL_BANK} from "../src/content.js";
import {
  envelopeGapWorld, MIN_GAP_WORLD, ORIGIN_RECOVERY_RADIUS_CELLS,
  WAIT_TIMEOUT_SECONDS, laneRoute
} from "../src/traffic.js";
import {bayApproachDistance, ART04_DOCK} from "../src/art04.js";

const BASE_SHA = "0791dc55b37ee60ed2b308a69fa4dd002e2f9a94";
const ROOT = path.resolve(import.meta.dirname, "..");
const STEP = 0.5, GAP_EPS = 1e-6;
const K = (x, z) => x + "," + z;
const ZERO_BANK = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0]));
const norm = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const routeKey = r => r ? r.map(p => K(p.x, p.z)).join("|") : null;

// ---- base materialization (survives CI shallow + sparse checkout) ----
function git(args) {
  return spawnSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
}
function materializeBase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rw596-base-"));
  if (git(["cat-file", "-e", BASE_SHA + "^{commit}"]).status !== 0) {
    // CI checkout is fetch-depth 1: fetch the exact base commit (GitHub permits
    // arbitrary-SHA wants). No shell involved; spawnSync argv only.
    git(["fetch", "--depth=1", "origin", BASE_SHA]);
  }
  assert.equal(git(["cat-file", "-e", BASE_SHA + "^{commit}"]).status, 0,
    "base commit " + BASE_SHA + " must be materializable for the negative control");
  const ls = git(["ls-tree", "--name-only", BASE_SHA, "src/"]);
  assert.equal(ls.status, 0, "git ls-tree base src/");
  const files = ls.stdout.split("\n").filter(f => f.endsWith(".js"));
  assert.ok(files.includes("src/simulation.js") && files.includes("src/content.js"),
    "base src/ must contain simulation.js and content.js");
  fs.mkdirSync(path.join(dir, "src"));
  for (const f of files) {
    const show = git(["show", BASE_SHA + ":" + f]);
    assert.equal(show.status, 0, "git show " + BASE_SHA + ":" + f);
    fs.writeFileSync(path.join(dir, f), show.stdout);
  }
  return dir;
}
const BASE_DIR = materializeBase();
const baseSim = await import(pathToFileURL(path.join(BASE_DIR, "src", "simulation.js")).href);
after(() => { fs.rmSync(BASE_DIR, {recursive: true, force: true}); });

// ---- fixtures (identical construction for base and head; head laneRoute is
// the placement ruler for both — LANE_OFFSET_CELLS is 0.35 in both revisions) ----
function dry(g) {
  // remaining>0 = under assembly (skipped by production); 1e9 freezes the
  // generator OUT of the power supply => no production, no dispatch candidates.
  g.buildings.find(b => b.id === 3).remaining = 1e9;
  for (const b of g.buildings) b.inventory = {};
  g.bank = {...ZERO_BANK, credits: 1800};
  return g;
}
// B1 canonical origin-cell join-hold: mover id1 holds at the salvager bay (7,9);
// its route origin lane cell (7,8.35) is occupied by idle jobless truck id2.
// The normal obstacle reroute refuses (its lane start lands on the blocker), so
// ONLY originSidestep (head) can commit a clear origin within R+1. The initial
// mover/blocker pair is 0.225 world apart — a pre-existing sub-gap HELD, not
// repaired (TRAFFIC.md limitation 3). Base has no sidestep => 0 arrivals.
function originGame(sim) {
  const g = dry(sim.createGame());
  g.vehicles = g.vehicles.slice(0, 2);
  const route = []; for (let x = 7; x <= 13; x++) route.push({x, z: 8});
  const [a, b] = g.vehicles;
  a.speed = 2.25; a.x = 7; a.z = 9; a.heading = {x: 1, z: 0};
  a.cargo = {resource: "scrap", amount: 5};
  a.job = {sourceId: 1, destId: 2, resource: "scrap", amount: 5, phase: "toDest",
    toSource: [{x: 7, z: 8}], toDest: route, route, segment: 0, progress: 0};
  b.x = 7; b.z = 8.35; b.heading = {x: 1, z: 0};
  return g;
}
// B8 pickup-flip departure hold: mover id1 sits AT the pickup flip (toSource end
// (13,12.35), depot stop (13,12)); its reserved departure toDest begins at lane
// cell (13,11.65), occupied by idle jobless truck id2. The yard is genuinely dry
// (generator frozen out of power; the reservation already left the depot bag at
// dispatch, so the depot inventory stays empty — pickupCargo loads from the job,
// never re-reads inventory). The load is 2 scrap: below the >=3 output-dispatch
// floor, so the destination salvager never generates a follow-on job and the
// yard stays dry after delivery (an earlier 5-scrap variant dispatched the idle
// blocker on the destination's output — a fixture confound, removed). Base's
// flip-hold branch has NO recovery call => permanent hold, 0 arrivals. Head
// recoverDeparture sidesteps the departure origin after the timeout, lands
// j.toDest ROUTE-ONLY (position untouched until pickupCargo's join snap), then
// pickupCargo flips phase the same tick.
function pickupGame(sim) {
  const g = dry(sim.createGame());
  g.vehicles = g.vehicles.slice(0, 2);
  g.buildings.push({id: 94, type: "salvager", x: 16, z: 7, rot: 0, level: 1, remaining: 0, inventory: {}, timer: 0});
  const toSource = []; for (let x = 5; x <= 13; x++) toSource.push({x, z: 12});
  const toDest = [{x: 13, z: 12}, {x: 12, z: 12}, {x: 11, z: 12}, {x: 11, z: 11},
    {x: 11, z: 10}, {x: 11, z: 9}, {x: 11, z: 8}, {x: 12, z: 8}, {x: 13, z: 8},
    {x: 14, z: 8}, {x: 15, z: 8}, {x: 16, z: 8}];
  const [a, b] = g.vehicles;
  a.speed = 2.25; a.cargo = null;
  a.job = {sourceId: 2, destId: 94, resource: "scrap", amount: 2, phase: "toSource",
    toSource, toDest, route: toSource, segment: toSource.length - 1, progress: 1};
  const l = laneRoute(toSource);
  a.x = l.points[toSource.length - 1].x; a.z = l.points[toSource.length - 1].z;
  a.heading = l.headings[toSource.length - 2] || {x: 1, z: 0};
  b.x = 13; b.z = 11.65; b.heading = {x: -1, z: 0};
  return g;
}
// B9 bounded-effort honesty fixture: a tight ring with three loaded trucks whose
// goals are mutually occupied. The perpendicular wait-for cycle PERSISTS at head
// (0 arrivals, blockedBy cycle, all waiting) — recovery is bounded effort, NOT
// deadlock-freedom. Initial pair [1,2] is 0.225 world apart (HELD).
function cycleGame(sim) {
  const g = dry(sim.createGame());
  if (!g.roads.includes(K(12, 9))) g.roads.push(K(12, 9));
  g.buildings.push({id: 90, type: "salvager", x: 12, z: 7, rot: 0, level: 1, remaining: 0, inventory: {}, timer: 0});
  g.buildings.push({id: 91, type: "salvager", x: 12, z: 10, rot: 2, level: 1, remaining: 0, inventory: {}, timer: 0});
  g.buildings.push({id: 93, type: "salvager", x: 11, z: 7, rot: 0, level: 1, remaining: 0, inventory: {}, timer: 0});
  const place = (v, route) => {
    const l = laneRoute(route);
    v.x = l.points[0].x; v.z = l.points[0].z;
    v.heading = l.headings[0] || {x: 1, z: 0};
    v.job.route = route; v.job.segment = 0; v.job.progress = 0;
  };
  const mk = (id, dst, route) => {
    const v = g.vehicles.find(v => v.id === id);
    v.speed = 2.25; v.cargo = {resource: "scrap", amount: 5};
    v.job = {sourceId: 1, destId: dst, resource: "scrap", amount: 5, phase: "toDest",
      toSource: [route[0]], toDest: route, route, segment: 0, progress: 0};
    place(v, route);
  };
  mk(1, 90, [{x: 11, z: 8}, {x: 12, z: 8}]);
  mk(2, 91, [{x: 12, z: 8}, {x: 12, z: 9}]);
  mk(3, 93, [{x: 12, z: 9}, {x: 11, z: 9}, {x: 11, z: 8}]);
  return g;
}
// Normal mid-route reroute control (trafficSeparation detour fixture): the
// blocker sits MID-ROUTE, so the ordinary obstacle reroute dissolves the hold
// WITHOUT spending any origin-sidestep budget.
function detourGame() {
  const g = dry(createGame());
  g.vehicles = g.vehicles.slice(0, 2);
  const route = []; for (let x = 7; x <= 13; x++) route.push({x, z: 8});
  const [a, b] = g.vehicles;
  a.speed = 2.25; a.x = 7; a.z = 8.35; a.heading = {x: 1, z: 0};
  a.cargo = {resource: "scrap", amount: 5};
  a.job = {sourceId: 1, destId: 2, resource: "scrap", amount: 5, phase: "toDest",
    toSource: [{x: 7, z: 8}], toDest: route, route, segment: 0, progress: 0};
  b.x = 8; b.z = 8.35; b.heading = {x: 1, z: 0};
  return g;
}
function minPairGap(g) {
  let min = Infinity, pair = null;
  for (let a = 0; a < g.vehicles.length; a++)
    for (let b = a + 1; b < g.vehicles.length; b++) {
      const gap = envelopeGapWorld(g.vehicles[a], g.vehicles[b]);
      if (gap < min) { min = gap; pair = [g.vehicles[a].id, g.vehicles[b].id]; }
    }
  return {min, pair};
}
// Tick harness: collects arrivals, sidestep commits (recoveryTries increments),
// per-commit displacement, post-commit separation, conservation leaks, and the
// per-tick budget ceiling. prev snapshot is taken BEFORE each advanceGame.
function run(g, sim, seconds, onTick) {
  const ticks = Math.round(seconds / STEP);
  const baseNorm = norm(freightTotals(g).totals);
  const out = {arrivals: 0, delivered: 0, leaks: 0, commits: 0, maxDisp: 0, maxDispAt: -1,
    commitTicks: [], minGapAfterCommit: Infinity, maxTries: 0, initialMinGap: minPairGap(g).min};
  const prev = new Map();
  let sawCommit = false;
  for (let i = 0; i < ticks; i++) {
    for (const v of g.vehicles)
      prev.set(v.id, {x: v.x, z: v.z, tries: v.recoveryTries || 0, route: routeKey(v.job?.route),
        toDest: routeKey(v.job?.toDest), phase: v.job?.phase ?? null,
        sourceId: v.job?.sourceId ?? null, destId: v.job?.destId ?? null,
        resource: v.job?.resource ?? null, amount: v.job?.amount ?? null,
        cargo: v.cargo ? {...v.cargo} : null});
    sim.advanceGame(g, STEP);
    if (norm(freightTotals(g).totals) !== baseNorm) out.leaks++;
    for (const v of g.vehicles) {
      const p = prev.get(v.id);
      const tries = v.recoveryTries || 0;
      out.maxTries = Math.max(out.maxTries, tries);
      if (tries > p.tries) {
        out.commits++;
        out.commitTicks.push(i + 1);
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d > out.maxDisp) { out.maxDisp = d; out.maxDispAt = i + 1; }
        sawCommit = true;
      }
    }
    if (sawCommit) out.minGapAfterCommit = Math.min(out.minGapAfterCommit, minPairGap(g).min);
    if (onTick) onTick(g, i + 1, prev, out);
  }
  out.arrivals = g.freightLedger.filter(e => e.kind === "arrive").length;
  out.delivered = g.stats.delivered;
  return out;
}
function blockedByCycle(g) {
  const byId = Object.fromEntries(g.vehicles.map(v => [v.id, v.blockedBy]));
  for (const v of g.vehicles) {
    const seen = new Set(); let cur = v.id;
    while (cur != null && byId[cur] != null && !seen.has(cur)) { seen.add(cur); cur = byId[cur]; }
    if (cur != null && seen.has(cur)) return true;
  }
  return false;
}

// ============================ B1 + B4 + B5 ============================
test("B1 origin-cell join-hold: base 0791dc55 starves (0 arrivals), head recovers (1 arrival); displacement <= R+1; held 0.225 pair disclosed", t => {
  const gh = originGame({createGame, advanceGame});
  const gb = originGame(baseSim);
  const initRouteH = routeKey(gh.vehicles[0].job.route);
  const initRouteB = routeKey(gb.vehicles[0].job.route);
  assert.equal(initRouteH, initRouteB, "identical fixture route both revisions");
  // The pre-existing sub-gap park pair is HELD, not repaired (limitation 3).
  assert.ok(Math.abs(minPairGap(gh).min - 0.225) < 1e-9, "head initial held pair 0.225 world");
  assert.ok(Math.abs(minPairGap(gb).min - 0.225) < 1e-9, "base initial held pair 0.225 world");
  assert.ok(minPairGap(gh).min < MIN_GAP_WORLD, "the held pair is genuinely below the declared gap");

  const rh = run(gh, {advanceGame}, 60);
  const rb = run(gb, baseSim, 60);
  t.diagnostic(`BASE ${BASE_SHA}: arrivals=${rb.arrivals} delivered=${rb.delivered} commits=${rb.commits} leaks=${rb.leaks}`);
  t.diagnostic(`HEAD: arrivals=${rh.arrivals} delivered=${rh.delivered} commits=${rh.commits} maxDisp=${rh.maxDisp} cells @tick ${rh.maxDispAt} minGapAfterCommit=${rh.minGapAfterCommit} leaks=${rh.leaks}`);

  // Base-failing negative control: identical fixture, zero arrivals at base.
  assert.equal(rb.arrivals, 0, "base must starve behind the origin-cell park");
  assert.equal(rb.delivered, 0);
  assert.equal(rb.commits, 0, "base has no sidestep mechanism");
  assert.equal(rb.leaks, 0);
  const bm = gb.vehicles[0];
  assert.equal(bm.waiting, true); assert.equal(bm.blockedBy, 2);
  assert.equal(bm.waitTime, 60);
  assert.equal(routeKey(bm.job.route), initRouteB, "base route never changes");
  assert.equal(bm.x, 7); assert.equal(bm.z, 9, "base mover never leaves the bay");
  assert.ok(!("recoveryTries" in bm) || bm.recoveryTries === 0, "base legacy shape");

  // Head recovers: exactly one sidestep commit, one arrival, freight credited.
  assert.equal(rh.arrivals, 1, "head dissolves the origin hold");
  assert.equal(rh.delivered, 5);
  assert.equal(gh.bank.scrap, 5, "load credited exactly once");
  assert.equal(rh.commits, 1);
  assert.equal(rh.leaks, 0);
  assert.deepEqual(rh.commitTicks, [20], "first commit at t=10s (tick 20) — timeout-gated");
  // B4 displacement bound: measured max 1.680029761641144 cells (bay (7,9) ->
  // sidestep lane start (6,7.65)); structural bound R+1 = 4 cells.
  assert.ok(rh.maxDisp > 0, "a real relocation happened");
  assert.ok(Math.abs(rh.maxDisp - 1.680029761641144) < 1e-9, "pinned measured sidestep displacement");
  assert.ok(rh.maxDisp <= ORIGIN_RECOVERY_RADIUS_CELLS + 1, "displacement <= R+1 = 4 cells");
  // B5 separation: every pair >= MIN_GAP_WORLD on every tick after the commit.
  assert.ok(rh.minGapAfterCommit >= MIN_GAP_WORLD - GAP_EPS,
    `post-commit separation holds: ${rh.minGapAfterCommit}`);
  assert.ok(Math.abs(rh.minGapAfterCommit - 1.4499999999999993) < 1e-6,
    "pinned post-commit min gap (adjacent-cell lane envelopes)");
  const hm = gh.vehicles[0];
  assert.equal(hm.job, null, "delivered and idle in the dry yard");
  assert.equal(hm.recoveryTries, 1, "budget spent exactly once");
  assert.equal(gh.vehicles[1].job, null, "blocker stays an idle park");
  assert.equal(gh.vehicles[1].x, 7); assert.equal(gh.vehicles[1].z, 8.35);
});

test("B1 radius bound: the only clear road cell at Manhattan 4 (> R=3) — recovery refuses, budget unspent, route frozen", t => {
  const g = originGame({createGame, advanceGame});
  // Park idle trucks on EVERY road cell within Manhattan R of the origin cell
  // (7,8): (6,8),(8,8) d1; (5,8),(9,8) d2; (10,8),(5,9) d3. A park at the cell
  // center overlaps every lane start of that cell (0.35 offset < 2*0.293
  // envelope half), and recoveryAvoid excludes the parked cells. The only
  // remaining clear road cell with a path to the dock stop is (11,8) — d4 > R.
  const parks = [[6, 8], [8, 8], [5, 8], [9, 8], [10, 8], [5, 9]];
  let id = 3;
  for (const [x, z] of parks)
    g.vehicles.push({id: id++, name: "PARK-" + id, x, z, speed: 2.25, job: null, cargo: null,
      anim: 0, heading: {x: 1, z: 0}, waiting: false, blockedBy: null, waitTime: 0});
  assert.ok(g.roads.includes(K(11, 8)), "(11,8) is asphalt");
  assert.equal(Math.abs(11 - 7) + Math.abs(8 - 8), ORIGIN_RECOVERY_RADIUS_CELLS + 1,
    "the clear cell sits exactly one cell beyond the radius");
  const probeRoute = [{x: 11, z: 8}, {x: 12, z: 8}, {x: 13, z: 8}];
  const probeStart = laneRoute(probeRoute).points[0];
  for (const u of g.vehicles)
    if (u.id !== 1) assert.ok(envelopeGapWorld({x: probeStart.x, z: probeStart.z, heading: {x: 1, z: 0}}, u) >= MIN_GAP_WORLD - GAP_EPS,
      "the out-of-radius lane start is genuinely clear of every truck");
  assert.ok(roadPath(g, {x: 11, z: 8}, {x: 13, z: 12}), "a valid path exists from the clear cell to the dock stop");
  assert.ok(minPairGap(g).min >= MIN_GAP_WORLD - GAP_EPS || Math.abs(minPairGap(g).min - 0.225) < 1e-9,
    "only the disclosed held pair is sub-gap initially");

  const initRoute = routeKey(g.vehicles[0].job.route);
  const r = run(g, {advanceGame}, 60);
  t.diagnostic(`radius-bound: arrivals=${r.arrivals} commits=${r.commits} maxTries=${r.maxTries} leaks=${r.leaks}`);
  assert.equal(r.arrivals, 0, "no recovery beyond the radius");
  assert.equal(r.commits, 0);
  assert.equal(r.maxTries, 0, "budget never spent");
  assert.equal(r.leaks, 0);
  const m = g.vehicles[0];
  assert.equal(routeKey(m.job.route), initRoute, "route frozen");
  assert.equal(m.x, 7); assert.equal(m.z, 9);
  assert.equal(m.waiting, true); assert.equal(m.blockedBy, 2);
  assert.equal(m.waitTime, 60, "honest queuing, not a silent skip");
});

// ============================ B2 budget ============================
test("B2 budget: a preset tries=2 spends the last try (cap 3); preset tries=3 refuses; per-tick ceiling holds", t => {
  assert.equal(ORIGIN_RECOVERY_MAX_TRIES, 3, "declared per-job budget");
  const g2 = originGame({createGame, advanceGame});
  g2.vehicles[0].recoveryTries = 2;
  const r2 = run(g2, {advanceGame}, 60);
  t.diagnostic(`preset-2: arrivals=${r2.arrivals} commits=${r2.commits} maxTries=${r2.maxTries} finalTries=${g2.vehicles[0].recoveryTries}`);
  assert.equal(r2.arrivals, 1, "the last budgeted try still recovers");
  assert.equal(r2.commits, 1);
  assert.equal(r2.maxTries, 3, "never exceeds the cap");
  assert.equal(g2.vehicles[0].recoveryTries, 3, "budget exhausted exactly at the cap");
  assert.ok(r2.maxDisp <= ORIGIN_RECOVERY_RADIUS_CELLS + 1);
  assert.ok(r2.minGapAfterCommit >= MIN_GAP_WORLD - GAP_EPS);
  assert.equal(r2.leaks, 0);

  const g3 = originGame({createGame, advanceGame});
  g3.vehicles[0].recoveryTries = 3;
  const initRoute = routeKey(g3.vehicles[0].job.route);
  const r3 = run(g3, {advanceGame}, 60);
  t.diagnostic(`preset-3: arrivals=${r3.arrivals} commits=${r3.commits} maxTries=${r3.maxTries}`);
  assert.equal(r3.arrivals, 0, "exhausted budget refuses a fourth try");
  assert.equal(r3.commits, 0);
  assert.equal(r3.maxTries, 3);
  assert.equal(r3.leaks, 0);
  const m = g3.vehicles[0];
  assert.equal(m.recoveryTries, 3);
  assert.equal(routeKey(m.job.route), initRoute, "route frozen at exhaustion");
  assert.equal(m.x, 7); assert.equal(m.z, 9);
  assert.equal(m.waiting, true); assert.equal(m.blockedBy, 2); assert.equal(m.waitTime, 60);
});

test("B2 budget: fresh dispatch resets recoveryTries to 0 (per-job, not per-truck)", t => {
  const g = createGame(); // shipped starter yard: powered, stocked, dispatching
  for (const v of g.vehicles) v.recoveryTries = 3;
  let firstDispatchT = null;
  for (let i = 0; i < 40; i++) {
    advanceGame(g, STEP);
    const dispatched = g.vehicles.filter(v => v.job);
    if (dispatched.length && firstDispatchT === null) firstDispatchT = (i + 1) * STEP;
    for (const v of dispatched)
      assert.equal(v.recoveryTries, 0, `truck ${v.id}: assignJob must reset the budget on fresh dispatch`);
    if (firstDispatchT !== null && (i + 1) * STEP >= firstDispatchT + 5) break;
  }
  t.diagnostic(`dispatch-reset: first dispatch at t=${firstDispatchT}s`);
  assert.ok(firstDispatchT !== null, "the starter yard must dispatch (non-vacuous)");
  assert.equal(firstDispatchT, 4, "pinned measured: first dispatch at t=4s");
  const idle = g.vehicles.filter(v => !v.job);
  for (const v of idle) assert.equal(v.recoveryTries, 3, "undispatched trucks keep their state — no global reset");
});

test("B2 budget: normal mid-route reroutes consume NO origin-sidestep budget", t => {
  const g = detourGame();
  let reroutes = 0, maxJump = 0, sawBlock = false;
  const r = run(g, {advanceGame}, 60, (gg, tick, prev) => {
    const a = gg.vehicles[0];
    if (a.waiting && a.blockedBy === 2) sawBlock = true;
    for (const v of gg.vehicles) {
      const p = prev.get(v.id);
      const rk = routeKey(v.job?.route);
      if (rk && p.route && rk !== p.route && v.job.phase === p.phase && v.job.segment === 0 && v.job.progress === 0) {
        reroutes++;
        maxJump = Math.max(maxJump, Math.hypot(v.x - p.x, v.z - p.z));
      }
    }
  });
  t.diagnostic(`detour: arrivals=${r.arrivals} reroutes=${reroutes} maxJump=${maxJump} commits=${r.commits} maxTries=${r.maxTries}`);
  assert.ok(sawBlock, "fixture genuinely queues behind the mid-route idle blocker");
  assert.equal(r.arrivals, 1, "the normal reroute dissolves the hold");
  assert.equal(r.delivered, 5);
  assert.equal(reroutes, 1, "exactly one reroute — no thrash");
  assert.ok(maxJump <= 1.0, "normal reroute displacement bounded (measured 0.7733 cells)");
  assert.equal(r.commits, 0, "no sidestep commit — the normal path committed first");
  assert.equal(r.maxTries, 0, "recoveryTries stays 0 through normal reroutes");
  assert.equal(g.vehicles[0].recoveryTries || 0, 0);
  assert.equal(r.leaks, 0);
  assert.ok(r.minGapAfterCommit === Infinity || r.minGapAfterCommit >= MIN_GAP_WORLD - GAP_EPS);
  assert.ok(minPairGap(g).min >= MIN_GAP_WORLD - GAP_EPS, "separation holds through the normal reroute");
});

// ============================ B3 timeout gate ============================
test("B3 timeout gate: route/position/budget frozen while waitTime < 10s; first commit exactly at the timeout (origin + pickup)", t => {
  const gh = originGame({createGame, advanceGame});
  const initRoute = routeKey(gh.vehicles[0].job.route);
  let commitT = null;
  for (let i = 0; i < 24; i++) {
    advanceGame(gh, STEP);
    const m = gh.vehicles[0];
    const tNow = (i + 1) * STEP;
    if ((m.recoveryTries || 0) > 0) { if (commitT === null) commitT = tNow; continue; }
    assert.ok(tNow < WAIT_TIMEOUT_SECONDS || commitT !== null, "no commit before the timeout");
    assert.equal(m.recoveryTries || 0, 0, "budget unspent while waiting");
    assert.equal(routeKey(m.job.route), initRoute, "route frozen while waiting");
    assert.equal(m.x, 7); assert.equal(m.z, 9, "position frozen at the bay");
    assert.equal(m.job.phase, "toDest");
    assert.equal(m.waiting, true); assert.equal(m.blockedBy, 2);
    assert.equal(m.waitTime, tNow, "honest continuous wait accumulation");
  }
  assert.equal(commitT, WAIT_TIMEOUT_SECONDS, "origin first commit exactly at t=10s");

  const gp = pickupGame({createGame, advanceGame});
  const initToDest = routeKey(gp.vehicles[0].job.toDest);
  const initRouteP = routeKey(gp.vehicles[0].job.route);
  let commitP = null;
  for (let i = 0; i < 24; i++) {
    advanceGame(gp, STEP);
    const m = gp.vehicles[0];
    const tNow = (i + 1) * STEP;
    if ((m.recoveryTries || 0) > 0) { if (commitP === null) commitP = tNow; continue; }
    assert.equal(m.recoveryTries || 0, 0);
    assert.equal(routeKey(m.job.toDest), initToDest, "departure route frozen while waiting");
    assert.equal(routeKey(m.job.route), initRouteP);
    assert.equal(m.x, 13); assert.equal(m.z, 12.35, "position frozen at the pickup flip");
    assert.equal(m.job.phase, "toSource", "no early phase flip");
    assert.equal(m.waiting, true); assert.equal(m.blockedBy, 2);
    assert.equal(m.waitTime, tNow);
  }
  assert.equal(commitP, WAIT_TIMEOUT_SECONDS, "pickup first commit exactly at t=10s");
  t.diagnostic(`timeout gate: origin commit t=${commitT}s, pickup commit t=${commitP}s (WAIT_TIMEOUT_SECONDS=${WAIT_TIMEOUT_SECONDS})`);
});

// ============================ B6 freight invariance ============================
test("B6 freight invariance: recovery never mutates job identity/cargo/phase; conservation holds every tick (origin + cycle)", t => {
  const gh = originGame({createGame, advanceGame});
  let identityHeld = true;
  const rh = run(gh, {advanceGame}, 60, (gg, tick, prev) => {
    for (const v of gg.vehicles) {
      const p = prev.get(v.id);
      if ((v.recoveryTries || 0) > p.tries && v.job) {
        if (v.job.sourceId !== p.sourceId || v.job.destId !== p.destId ||
            v.job.resource !== p.resource || v.job.amount !== p.amount ||
            v.job.phase !== p.phase) identityHeld = false;
        if (JSON.stringify(v.cargo) !== JSON.stringify(p.cargo)) identityHeld = false;
      }
    }
  });
  assert.ok(identityHeld, "job identity + cargo unchanged across the sidestep commit");
  assert.equal(rh.leaks, 0, "freightTotals conserved every tick");
  assert.equal(rh.arrivals, 1);

  const gc = cycleGame({createGame, advanceGame});
  const rc = run(gc, {advanceGame}, 60);
  assert.equal(rc.leaks, 0, "cycle yard conserved every tick");
  assert.equal(rc.arrivals, 0);
  for (const v of gc.vehicles) {
    assert.deepEqual(v.cargo, {resource: "scrap", amount: 5}, "cargo intact on every held truck");
    assert.equal(v.job.phase, "toDest");
    assert.equal(v.job.amount, 5);
  }
  t.diagnostic(`freight invariance: origin leaks=${rh.leaks}, cycle leaks=${rc.leaks}, cargo intact on all 3 held trucks`);
});

// ============================ B7 #580 clause-1 ============================
test("B7 #580 clause-1: stop-terminated leg stays stop-terminated through recovery; corridor never re-appended; dockingSteps 0", t => {
  // Targeted: a stop-terminated depot leg (route ends ON the live dock stop
  // (13,12), not on the bay) whose origin lane cell is parked. Recovery must
  // commit a route that STILL ends at the stop — the corridor tail is only
  // re-appended when the current route ends on the corridor, never at a stop.
  const g = dry(createGame());
  g.vehicles = g.vehicles.slice(0, 2);
  const route = [];
  for (let x = 7; x <= 11; x++) route.push({x, z: 8});
  for (let z = 9; z <= 12; z++) route.push({x: 11, z});
  route.push({x: 12, z: 12}, {x: 13, z: 12});
  const [a, b] = g.vehicles;
  a.speed = 2.25; a.x = 7; a.z = 9; a.heading = {x: 1, z: 0};
  a.cargo = {resource: "scrap", amount: 5};
  a.job = {sourceId: 1, destId: 2, resource: "scrap", amount: 5, phase: "toDest",
    toSource: [{x: 7, z: 8}], toDest: route, route, segment: 0, progress: 0};
  b.x = 7; b.z = 8.35; b.heading = {x: 1, z: 0};
  const depot = g.buildings.find(x => x.id === 2);
  const a0 = dockApproach(g, depot);
  assert.deepEqual(a0.stop, {x: 13, z: 12}, "live facing-side dock stop");
  assert.deepEqual(route[route.length - 1], a0.stop, "fixture leg is stop-terminated");
  const corridor = new Set(a0.cells.map(p => K(p.x, p.z)));
  let dockingSteps = 0, minDist = Infinity, committedRoute = null, identityHeld = true;
  const r = run(g, {advanceGame}, 60, (gg, tick, prev) => {
    const m = gg.vehicles[0];
    if ((m.recoveryTries || 0) > (prev.get(1).tries) && m.job) {
      committedRoute = m.job.route.map(p => ({x: p.x, z: p.z}));
      const p = prev.get(1);
      if (m.job.sourceId !== p.sourceId || m.job.destId !== p.destId || m.job.phase !== p.phase) identityHeld = false;
    }
    const {distance} = bayApproachDistance(gg, depot);
    if (distance < minDist) minDist = distance;
    if (distance <= ART04_DOCK.near) dockingSteps++;
  });
  t.diagnostic(`clause-1 targeted: arrivals=${r.arrivals} commits=${r.commits} dockingSteps=${dockingSteps} minBayDist=${minDist} committedRouteEnd=${committedRoute ? K(committedRoute[committedRoute.length - 1].x, committedRoute[committedRoute.length - 1].z) : null}`);
  assert.equal(r.commits, 1, "recovery actually fired (non-vacuous)");
  assert.ok(identityHeld, "freight identity unchanged across the commit");
  assert.ok(committedRoute, "captured the committed route");
  assert.deepEqual(committedRoute[committedRoute.length - 1], {x: 13, z: 12},
    "committed route STILL ends at the dock stop — stop semantics preserved");
  assert.ok(committedRoute.every(p => !corridor.has(K(p.x, p.z))),
    "no corridor cell re-appended to a stop-terminated leg");
  assert.equal(dockingSteps, 0, "the shutter never opens on the stop-terminated control");
  assert.ok(minDist > ART04_DOCK.near, "truck stays outside the near window");
  assert.equal(r.arrivals, 1, "freight still delivered at the stop");
  assert.equal(r.leaks, 0);

  // Full strip control (dockApproach580 clause-1 replica): zero-input shipped
  // yard, 660 sim-s, corridor stripped from every leg after each tick. Head
  // recovery is ACTIVE in this run and must not re-open the shutter.
  const c = createGame();
  assert.deepEqual(c.bank, INITIAL_BANK);
  assert.equal(c.tier, 0);
  const cDepot = c.buildings.find(x => x.id === 2);
  const ca = dockApproach(c, cDepot);
  const cCorridor = new Set(ca.cells.map(p => K(p.x, p.z)));
  const strip = leg => {
    if (!Array.isArray(leg)) return;
    while (leg.length && cCorridor.has(K(leg[leg.length - 1].x, leg[leg.length - 1].z))) leg.pop();
    while (leg.length && cCorridor.has(K(leg[0].x, leg[0].z))) leg.shift();
  };
  let cMin = Infinity, cDocking = 0, cFirst = null;
  const dt = 0.25;
  for (let tt = 0; tt < 660; tt += dt) {
    advanceGame(c, dt);
    for (const v of c.vehicles) { if (!v.job) continue; strip(v.job.route); strip(v.job.toSource); strip(v.job.toDest); }
    const {distance} = bayApproachDistance(c, cDepot);
    if (distance < cMin) cMin = distance;
    if (distance <= ART04_DOCK.near) { cDocking++; if (cFirst === null) cFirst = tt; }
  }
  t.diagnostic(`clause-1 strip control (660s, recovery active): dockingSteps=${cDocking} minBayDist=${cMin} firstDockT=${cFirst}`);
  assert.equal(cDocking, 0, "stop semantics with recovery active: dockingSteps must stay 0");
  assert.equal(cFirst, null);
  assert.ok(cMin > ART04_DOCK.near, "minBayDist stays outside near 2.5");
});

// ============================ B8 pickup-flip route-only ============================
test("B8 pickup-flip: recoverDeparture lands toDest ROUTE-ONLY; flip snaps to the new lane start and only proceeds when the join is clear; base starves", t => {
  const gp = pickupGame({createGame, advanceGame});
  const initToDest = routeKey(gp.vehicles[0].job.toDest);
  let commitTick = null, snapOk = false, flipLedgerOk = false, routeCopied = false, joinClear = true;
  const rp = run(gp, {advanceGame}, 60, (gg, tick, prev) => {
    const m = gg.vehicles[0];
    const p = prev.get(1);
    if ((m.recoveryTries || 0) > p.tries && commitTick === null) {
      commitTick = tick;
      // Route-only landing: the new toDest is the sidestepped departure; the
      // phase flip (pickupCargo) copies it to j.route and snaps the truck to
      // the NEW lane start, then integrates the remaining tick motion. The
      // commit itself never teleports the truck: its post-tick position must
      // lie exactly on the new departure lane, speed*STEP cells from the start.
      const newLane = laneRoute(m.job.toDest);
      const travel = m.speed * STEP; // cells (speed is cells/sec)
      let arc = 0, found = null;
      for (let s = 0; s < newLane.points.length - 1; s++) {
        const len = newLane.lengths[s] || 1;
        if (arc + len >= travel - 1e-9) {
          const f = (travel - arc) / len;
          const A = newLane.points[s], B = newLane.points[s + 1];
          found = {x: A.x + (B.x - A.x) * f, z: A.z + (B.z - A.z) * f};
          break;
        }
        arc += len;
      }
      snapOk = !!found && Math.hypot(m.x - found.x, m.z - found.z) < 1e-6;
      routeCopied = routeKey(m.job.route) === routeKey(m.job.toDest);
      flipLedgerOk = gg.freightLedger.some(e => e.kind === "pickup" && e.vehicleId === 1 && e.time === tick * STEP);
      for (const u of gg.vehicles)
        if (u.id !== 1 && envelopeGapWorld(m, u) < MIN_GAP_WORLD - GAP_EPS) joinClear = false;
    }
  });
  t.diagnostic(`HEAD pickup: arrivals=${rp.arrivals} delivered=${rp.delivered} commits=${rp.commits} commitTick=${commitTick} maxDisp=${rp.maxDisp} minGapAfterCommit=${rp.minGapAfterCommit} leaks=${rp.leaks}`);
  assert.equal(commitTick, 20, "departure recovery commits at t=10s");
  assert.ok(snapOk, "post-flip position lies exactly on the NEW departure lane at speed*STEP arc — the commit moved nothing itself");
  assert.ok(routeCopied, "pickupCargo copied the recovered toDest to j.route");
  assert.ok(flipLedgerOk, "pickup ledger entry lands at the commit time — phase flip via pickupCargo only");
  assert.ok(joinClear, "the flip only proceeded because the new join was clear (>= MIN_GAP_WORLD)");
  assert.equal(rp.arrivals, 1, "head delivers exactly once through the recovered departure");
  assert.equal(rp.delivered, 2);
  assert.equal(gp.buildings.find(b => b.id === 94).inventory.scrap, 2, "load deposited at the destination");
  assert.equal(rp.leaks, 0, "dry pickup yard conserved every tick");
  assert.ok(rp.maxDisp <= ORIGIN_RECOVERY_RADIUS_CELLS + 1, "commit-tick relocation (flip snap + motion) within R+1");
  assert.ok(rp.minGapAfterCommit >= MIN_GAP_WORLD - GAP_EPS, "post-commit separation holds");
  assert.equal(gp.vehicles[1].job, null, "the idle blocker never dispatched in the dry yard");

  // Base-failing control: identical fixture, base flip-hold has NO recovery.
  const gb = pickupGame(baseSim);
  const baseToDest = routeKey(gb.vehicles[0].job.toDest);
  let toDestFrozen = true, phaseFrozen = true, posFrozen = true;
  const rbase = run(gb, baseSim, 60, gg => {
    const m = gg.vehicles[0];
    if (routeKey(m.job?.toDest) !== baseToDest) toDestFrozen = false;
    if (m.job?.phase !== "toSource") phaseFrozen = false;
    if (m.x !== 13 || m.z !== 12.35) posFrozen = false;
  });
  t.diagnostic(`BASE pickup ${BASE_SHA}: arrivals=${rbase.arrivals} commits=${rbase.commits} toDestFrozen=${toDestFrozen} phaseFrozen=${phaseFrozen} posFrozen=${posFrozen}`);
  assert.equal(rbase.arrivals, 0, "base starves at the pickup flip");
  assert.equal(rbase.commits, 0);
  assert.ok(toDestFrozen, "base toDest never changes");
  assert.ok(phaseFrozen, "base phase never flips");
  assert.ok(posFrozen, "base mover never leaves the flip position");
  const bm = gb.vehicles[0];
  assert.equal(bm.waiting, true); assert.equal(bm.blockedBy, 2); assert.equal(bm.waitTime, 60);
  assert.equal(rbase.leaks, 0);
});

// ============================ B9 cycle honesty ============================
test("B9 perpendicular crossing cycle STILL deadlocks at head: bounded effort, not deadlock-freedom (base also 0)", t => {
  const gh = cycleGame({createGame, advanceGame});
  const gb = cycleGame(baseSim);
  assert.ok(Math.abs(minPairGap(gh).min - 0.225) < 1e-9, "constructed held pair [1,2] 0.225 world");
  const rh = run(gh, {advanceGame}, 60);
  const rb = run(gb, baseSim, 60);
  t.diagnostic(`HEAD cycle: arrivals=${rh.arrivals} commits=${rh.commits} maxDisp=${rh.maxDisp} maxTries=${rh.maxTries} minGapAfterCommit=${rh.minGapAfterCommit} cycle=${blockedByCycle(gh)} allWaiting=${gh.vehicles.every(v => v.waiting)}`);
  t.diagnostic(`BASE cycle: arrivals=${rb.arrivals} commits=${rb.commits} cycle=${blockedByCycle(gb)} allWaiting=${gb.vehicles.every(v => v.waiting)}`);
  assert.equal(rh.arrivals, 0, "the perpendicular cycle persists at head — disclosed limitation");
  assert.equal(rb.arrivals, 0, "base also deadlocks (honest parity)");
  assert.equal(rh.leaks, 0); assert.equal(rb.leaks, 0);
  assert.ok(blockedByCycle(gh), "head wait-for graph still contains a cycle");
  assert.ok(blockedByCycle(gb), "base wait-for graph contains a cycle");
  assert.ok(gh.vehicles.every(v => v.waiting), "all head trucks waiting");
  assert.ok(gb.vehicles.every(v => v.waiting), "all base trucks waiting");
  // Budget was exercised and exhausted where recovery could fire — bounded.
  assert.equal(rh.commits, 3, "pinned: three sidestep commits (truck 2 exhausts its budget)");
  assert.equal(rh.maxTries, ORIGIN_RECOVERY_MAX_TRIES, "budget ceiling reached, never exceeded");
  assert.equal(gh.vehicles.find(v => v.id === 2).recoveryTries, 3, "truck 2 exhausted");
  assert.ok(rh.maxDisp <= ORIGIN_RECOVERY_RADIUS_CELLS + 1, "cycle sidesteps within R+1");
  assert.ok(Math.abs(rh.maxDisp - 1.3946325680981349) < 1e-9, "pinned cycle max displacement");
  assert.ok(rh.minGapAfterCommit >= MIN_GAP_WORLD - GAP_EPS, "separation holds after every cycle commit");
  for (const v of gh.vehicles) assert.deepEqual(v.cargo, {resource: "scrap", amount: 5}, "freight intact in the deadlock");
});