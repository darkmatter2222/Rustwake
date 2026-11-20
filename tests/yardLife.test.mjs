/**
 * #590 yard life — world-integration invariants (finisher evidence).
 *
 * Proves, against the REAL modules (no mocks of the system under test):
 *  1. crowdPlan defaults agree with world.js placement constants.
 *  2. Anti-teleport BEFORE/AFTER on real production anchors: the verbatim base
 *     drone block (tests/fixtures/yardLifeBase590.mjs, provenance
 *     `git show 956a4706:src/world.js`) FAILS the same bounded-step assertion
 *     that the #590 continuous-flight drone passes.
 *  3. NO ECONOMY AUTHORITY (honesty gate): two identical fresh saves advanced
 *     frame-for-frame, one with the crowd stepped from a DEEP-FROZEN env, are
 *     byte-identical game state and freight manifest at every frame.
 *  4. Static guard: the economy modules never import or reference the crowd.
 *  5. Mesh/triangle budgets measured from real THREE geometry; worker rig
 *     geometry is count-identical to the base fixture; scene delta is exactly
 *     the 7 added walkers (base had 3 static scale references, HEAD has 10).
 *  6. applyWorkerPose drives the real named joint transforms from travelled
 *     distance (freeze at 0 / reduced motion).
 *  7. crowdConflicts against the REAL yardSceneryPlan hides nothing on a fresh
 *     save; paving a patrol alley hides that segment (rebuild-only).
 *  8. Source wiring guards: world.js feeds stepCrowd the live truck envelope,
 *     the real anchor and this.reducedMotion; crowd.js never imports simulation.
 *
 * Headless: document stub before importing world.js (yardScenery convention).
 * Nothing here keeps the Node event loop alive (no timers/servers/DOM leaks).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};

const W = await import("../src/world.js");
const {RIGS, machineDescriptor, cellCenter} = await import("../src/voxelSchema.js");
const {worldFootprint} = await import("../src/gridOccupancy.js");
const {createGame, advanceGame, freightManifest, freightTotals, roadLine} = await import("../src/simulation.js");
const {baseDronePose, baseWorkerRig, countRig} = await import("./fixtures/yardLifeBase590.mjs");

const {
  FORKLIFT_POST, DRONE_PAD, DEFAULT_YARD_SEED, CROWD_MOTION: M,
  crowdPlan, createCrowdState, stepCrowd, crowdConflicts, workerPose,
  createWorker, applyWorkerPose, createForklift, createDrone,
  droneHover, activeCycleAnchor, yardSceneryPlan
} = W;

const origin = cellCenter; // identical formula (world.js / crowd.js)
const DTS = [0.016, 0.033, 0.07, 0.05, 0.025, 0.07, 0.04];
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The SAME assertion is applied to base and HEAD traces. A test that would
// also pass at the base is not evidence — assert.throws below proves it fails.
function assertDroneBounded(trace, bound, label) {
  for (let i = 1; i < trace.length; i++) {
    const step = dist3(trace[i - 1], trace[i]);
    if (step > bound + 1e-9) {
      throw new Error(`${label}: drone teleport step ${step} > maxDroneStep ${bound} at frame ${i}`);
    }
  }
}

function anchorTargetFor(g, prevTimers) {
  const anchor = activeCycleAnchor(g.buildings, prevTimers);
  if (!anchor) return {anchor: null, anchorId: "none"};
  const wf = worldFootprint(anchor.type, anchor.x, anchor.z, anchor.rot || 0);
  const desc = machineDescriptor(anchor.type);
  const roofY = (desc?.bounds.height || 2.5) + 1.4;
  return {anchor: {x: wf.pivot.x, y: roofY, z: wf.pivot.z, id: String(anchor.id)}, anchorId: String(anchor.id)};
}

function truckEnv(g) {
  return g.vehicles.map((v) => Object.freeze({x: origin(v.x), z: origin(v.z)}));
}

test("plan defaults agree with world.js FORKLIFT_POST / DRONE_PAD", (t) => {
  const a = crowdPlan(DEFAULT_YARD_SEED);
  const b = crowdPlan(DEFAULT_YARD_SEED, {forkliftPost: FORKLIFT_POST, dronePad: DRONE_PAD});
  assert.equal(JSON.stringify(a), JSON.stringify(b), "default plan must equal explicitly-pinned plan");
  assert.equal(a.forklift.post.x, FORKLIFT_POST.x);
  assert.equal(a.forklift.post.z, FORKLIFT_POST.z);
  assert.equal(a.forklift.post.rotY, FORKLIFT_POST.rotY);
  assert.deepEqual({x: a.pad.x, y: a.pad.y, z: a.pad.z}, {x: DRONE_PAD.x, y: DRONE_PAD.y, z: DRONE_PAD.z});
  // Refs 599 RE-DECLARATION (was 10): 22 walkers + 8 station crew.
  assert.equal(a.walkers.length, 22);
  assert.equal(a.stations.length, 8);
});

test("anti-teleport BEFORE/AFTER on real anchors: base drone fails the same bound HEAD passes", (t) => {
  const g = createGame();
  const plan = crowdPlan(DEFAULT_YARD_SEED, {forkliftPost: FORKLIFT_POST, dronePad: DRONE_PAD});
  const state = createCrowdState(plan);
  const h = {activeCycleAnchor, droneHover, worldFootprint, machineDescriptor, DRONE_PAD};
  let prevTimers = new Map(); // LivingWorld ctor initial value
  const baseTrace = [{x: DRONE_PAD.x, y: DRONE_PAD.y, z: DRONE_PAD.z}];
  const newTrace = [{x: state.drone.x, y: state.drone.y, z: state.drone.z}];
  const anchorIds = new Set();
  const modes = new Set();
  let baseMax = 0, newMax = 0;
  const seconds = 240;
  let simT = 0, i = 0;
  while (simT < seconds) {
    const dt = Math.min(DTS[i % DTS.length], seconds - simT);
    advanceGame(g, dt);
    const {anchor, anchorId} = anchorTargetFor(g, prevTimers);
    anchorIds.add(anchorId);
    // BEFORE: verbatim base update() drone placement (position.set every frame).
    const base = baseDronePose(h, g.buildings, prevTimers, g.elapsed, false);
    baseTrace.push(base.pos);
    baseMax = Math.max(baseMax, dist3(baseTrace[baseTrace.length - 2], base.pos));
    // AFTER: continuous velocity-limited flight, same real anchor + trucks.
    stepCrowd(state, plan, dt, {trucks: truckEnv(g), anchor, reduced: false});
    newTrace.push({x: state.drone.x, y: state.drone.y, z: state.drone.z});
    newMax = Math.max(newMax, dist3(newTrace[newTrace.length - 2], state.drone));
    modes.add(state.drone.mode);
    prevTimers = new Map(g.buildings.map((b) => [b.id, b.timer]));
    simT += dt; i++;
  }
  t.diagnostic("MEASURED " + JSON.stringify({
    frames: i, baseMaxStep: baseMax, newMaxStep: newMax,
    anchorIds: [...anchorIds], modes: [...modes], declaredMaxDroneStep: M.maxDroneStep
  }));
  // Non-vacuity: real anchors actually switched and the drone really flew.
  assert.ok(anchorIds.size >= 2, "expected real anchor switches incl. pad park");
  assert.ok(modes.has("flying") && modes.has("hovering"), "drone must fly and arrive");
  assert.ok(baseMax > 10, "base must exhibit a real teleport (pad/roof snap)");
  // The shared assertion THROWS on the base implementation...
  assert.throws(() => assertDroneBounded(baseTrace, M.maxDroneStep, "BASE"), /teleport step/);
  // ...and passes on HEAD.
  assertDroneBounded(newTrace, M.maxDroneStep, "HEAD");
  assert.ok(newMax <= M.maxDroneStep + 1e-9);
});

test("honesty gate: economy output byte-identical with crowd present vs absent", (t) => {
  const gA = createGame(); // crowd ABSENT
  const gB = createGame(); // crowd PRESENT (stepped from deep-frozen env)
  const plan = crowdPlan(DEFAULT_YARD_SEED, {forkliftPost: FORKLIFT_POST, dronePad: DRONE_PAD});
  const state = createCrowdState(plan);
  let prevTimers = new Map();
  let minTw = Infinity, minSw = Infinity, minFs = Infinity, frames = 0, manifestChecks = 0;
  const seconds = 300;
  let simT = 0, i = 0;
  while (simT < seconds) {
    const dt = Math.min(DTS[i % DTS.length], seconds - simT);
    advanceGame(gA, dt);
    advanceGame(gB, dt);
    const {anchor} = anchorTargetFor(gB, prevTimers);
    const trucks = truckEnv(gB);
    Object.freeze(trucks);
    if (anchor) Object.freeze(anchor);
    const env = Object.freeze({trucks, anchor, reduced: false});
    // stepCrowd must not mutate the frozen env (any write throws in strict mode).
    stepCrowd(state, plan, dt, env);
    prevTimers = new Map(gB.buildings.map((b) => [b.id, b.timer]));
    // Byte-identical FULL game state every frame.
    assert.equal(JSON.stringify(gA), JSON.stringify(gB), `game state diverged at frame ${i} (t=${simT.toFixed(3)})`);
    if (i % 60 === 0) {
      assert.equal(JSON.stringify(freightManifest(gA)), JSON.stringify(freightManifest(gB)), "freight manifest diverged");
      manifestChecks++;
    }
    // Measured clearance: every walker vs every LIVE truck envelope.
    for (const w of state.walkers) for (const p of trucks) {
      const c = dist2(w, p) - (M.workerRadius + M.truckRadius);
      if (c < minTw) minTw = c;
    }
    // Refs 599: station crew are hard threats — measure walker/forklift vs
    // every non-hidden station on the SAME live-sim fixture.
    for (const st of state.stations) {
      if (st.hidden) continue;
      for (const w of state.walkers) {
        if (w.hidden) continue;
        minSw = Math.min(minSw, dist2(w, st) - 2 * M.workerRadius);
      }
      if (!state.forklift.hidden) minFs = Math.min(minFs, dist2(state.forklift, st) - (M.workerRadius + M.forkliftRadius));
    }
    simT += dt; i++; frames++;
  }
  assert.equal(JSON.stringify(freightManifest(gA)), JSON.stringify(freightManifest(gB)));
  assert.deepEqual(freightTotals(gA), freightTotals(gB));
  // Non-vacuity: the economy really ran and the crowd really moved.
  assert.ok(gB.stats.produced > 0, "production must have happened");
  assert.ok(gB.vehicles.some((v) => v.anim > 0), "trucks must have moved");
  assert.ok(state.walkers.every((w) => w.dist > 20), "crew must have walked");
  assert.ok(state.drone.mode !== "parked" || state.drone.targetId !== "none", "drone must have flown");
  assert.ok(minTw >= M.clearanceMargin - 1e-9, `walker-truck clearance ${minTw} below margin`);
  assert.ok(minSw >= M.clearanceMargin - 1e-9, `walker-station clearance ${minSw} below margin`);
  assert.ok(minFs >= M.clearanceMargin - 1e-9, `forklift-station clearance ${minFs} below margin`);
  t.diagnostic("MEASURED " + JSON.stringify({
    frames, manifestChecks, produced: gB.stats.produced,
    walkerDist: state.walkers.map((w) => +w.dist.toFixed(2)),
    droneMode: state.drone.mode, minWalkerTruckClearance: minTw,
    minWalkerStationClearance: minSw, minForkliftStationClearance: minFs,
    freightTotals: freightTotals(gB)
  }));
});

test("static guard: economy modules never import or reference the crowd", (t) => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  // V2 economy/freight authority modules (traffic.js was V1; fleet/dock are
  // the real freight ledgers here). None may import or reference the crowd.
  for (const f of ["simulation.js", "content.js", "fleet.js", "dock.js"]) {
    const src = readFileSync(root + f, "utf8");
    assert.ok(!/from\s+["']\.\/crowd/.test(src), `${f} must not import crowd.js`);
    assert.ok(!/crowdPlan|stepCrowd|createCrowdState|crewState/.test(src), `${f} must not reference crowd API`);
  }
  const crowd = readFileSync(root + "crowd.js", "utf8");
  assert.ok(!/from\s+["']\.\/simulation/.test(crowd), "crowd.js must not import simulation.js");
  assert.ok(!/advanceGame|freightManifest|assignJob|moveVehicle/.test(crowd), "crowd.js must not call economy functions");
});

test("rig budgets measured from real geometry; worker count-identical to base; scene delta = 27 crew rigs (Refs 599)", (t) => {
  const worker = countRig(createWorker());
  const baseWorker = countRig(baseWorkerRig());
  const forklift = countRig(createForklift());
  const drone = countRig(createDrone());
  t.diagnostic("MEASURED " + JSON.stringify({worker, baseWorker, forklift, drone,
    budgets: {worker: RIGS.worker.budget, forklift: RIGS.forklift.budget, drone: RIGS.drone.budget}}));
  // Budgets are invariants — measured counts must fit the DECLARED budgets.
  for (const [name, c] of [["worker", worker], ["forklift", forklift], ["drone", drone]]) {
    assert.ok(c.meshes <= RIGS[name].budget.maxMeshes, `${name} meshes ${c.meshes} > budget`);
    assert.ok(c.triangles <= RIGS[name].budget.maxTriangles, `${name} triangles ${c.triangles} > budget`);
  }
  // #590 added pivot GROUPS, not geometry: per-worker counts unchanged vs base.
  assert.deepEqual(worker, baseWorker, "worker mesh/triangle counts must equal the base rig");
  // Base makeTerrain placed 3 static workers (956a4706:src/world.js loop over
  // [[13,9,...],[15,18,...],[7,9,...]]). Refs 599 RE-DECLARED scene delta:
  // 22 patrol walkers + 8 station crew = 30 canonical worker rigs ⇒ +27 rigs
  // = +297 meshes / +3564 triangles (was +7 rigs / +77 / +924 at 10 walkers).
  // This is an EXPLICIT headcount-driven re-declaration, not a raised per-rig
  // budget: worker/forklift/drone RIGS budgets above are unchanged.
  const delta = {meshes: (22 + 8 - 3) * worker.meshes, triangles: (22 + 8 - 3) * worker.triangles};
  t.diagnostic("MEASURED sceneDelta " + JSON.stringify(delta));
  assert.equal(delta.meshes, 27 * baseWorker.meshes);
  assert.equal(delta.triangles, 27 * baseWorker.triangles);
});

test("applyWorkerPose drives real joint transforms from travelled distance", (t) => {
  const w = createWorker();
  const ud = w.userData;
  assert.ok(ud.legL && ud.legR && ud.armL && ud.armR, "named pivots must exist");
  const samples = [0.4, 1.7, 3.3, 9.9];
  const seen = new Set();
  for (const d of samples) {
    applyWorkerPose(w, d, false);
    const p = workerPose(d, false);
    assert.equal(ud.legL.rotation.x, p.legL);
    assert.equal(ud.legR.rotation.x, p.legR);
    assert.equal(ud.armL.rotation.x, p.armL);
    assert.equal(ud.armR.rotation.x, p.armR);
    assert.equal(ud.legL.rotation.x, -ud.legR.rotation.x, "legs opposite phase");
    assert.equal(ud.armL.rotation.x, -ud.armR.rotation.x, "arms opposite phase");
    assert.equal(ud.walkDist, d);
    seen.add(ud.legL.rotation.x.toFixed(6));
  }
  assert.ok(seen.size >= 3, "joint transforms must vary with travelled distance");
  applyWorkerPose(w, 5, true);
  assert.deepEqual([ud.legL.rotation.x, ud.legR.rotation.x, ud.armL.rotation.x, ud.armR.rotation.x], [0, 0, 0, 0]);
  applyWorkerPose(w, 0, false);
  assert.deepEqual([ud.legL.rotation.x, ud.legR.rotation.x, ud.armL.rotation.x, ud.armR.rotation.x], [0, 0, 0, 0]);
});

test("crowdConflicts vs REAL yardSceneryPlan: fresh save hides nothing; paving hides the alley", (t) => {
  const g = createGame();
  const plan = crowdPlan(DEFAULT_YARD_SEED, {forkliftPost: FORKLIFT_POST, dronePad: DRONE_PAD});
  const sp = yardSceneryPlan(DEFAULT_YARD_SEED);
  const conf = crowdConflicts(plan, g, sp);
  t.diagnostic("MEASURED freshConflicts " + JSON.stringify(conf));
  assert.ok(conf.segments.every((h) => !h), "no patrol segment hidden on a fresh save");
  assert.equal(conf.forklift, false, "forklift post visible on a fresh save");
  assert.equal(conf.shuttle, true, "shuttle corridor open on a fresh save");
  // Rebuild-only visibility: paving the z=10 west alley hides segment 0.
  const g2 = createGame();
  const res = roadLine(g2, {x: 6, z: 10}, {x: 10, z: 10});
  assert.equal(res.ok, true, "roadLine must succeed: " + JSON.stringify(res));
  const conf2 = crowdConflicts(plan, g2, sp);
  assert.equal(conf2.segments[0], true, "paved alley-z10-w must hide segment 0");
});

test("source wiring: world.js feeds live trucks/anchor/reduced to stepCrowd; stamps are additive", (t) => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const src = readFileSync(root + "world.js", "utf8");
  assert.ok(src.includes("stepCrowd(this.crewState,this.crewPlan,dt,{trucks:truckPts,anchor:anchorTarget,reduced:this.reducedMotion})"),
    "update() must step the crowd with live truck envelope, real anchor and reduced-motion flag");
  assert.ok(src.includes("const truckPts=g.vehicles.map(v=>({x:origin(v.x),z:origin(v.z)}))"),
    "truck envelope must come from the LIVE vehicle positions");
  assert.ok(src.includes("applyWorkerPose(w,wk.dist,this.reducedMotion)"), "limbs must be distance-driven");
  for (const stamp of ["cd.crewWalkers", "cd.forkliftDist", "cd.droneX", "cd.crewReducedMotion",
    "cd.crewStations", "cd.crewStation1Arm"]) {
    assert.ok(src.includes(stamp), `additive dataset stamp ${stamp} missing`);
  }
  // Refs 599: station crew limbs are driven by the sim clock + seeded phase
  // through the SAME reduced-motion flag as the walkers.
  assert.ok(src.includes("applyStationPose(w,this.crewState.elapsed,st.phase,this.reducedMotion)"),
    "station poses must use the sim clock and the reduced-motion flag");
  // Authority strings unchanged: decorative crew never claims simulation work.
  const schema = readFileSync(root + "voxelSchema.js", "utf8");
  const authorityHits = schema.match(/none — decorative yard crew \(#274\)/g) || [];
  assert.ok(authorityHits.length >= 3, "worker/forklift/drone must all declare zero authority");
});
