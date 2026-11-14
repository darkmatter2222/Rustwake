/**
 * RW3D T16 (#143) fleet motion harness: drives the REAL three.js YardWorld
 * against the REAL #140 logistics ledger + #141 traffic runtime at a scripted
 * fixed dt. No animation loop, no clock reads — every frame is an explicit
 * (tick, framePhase) pair so the capture script can assert numerical invariants.
 *
 * The fleet bridge (renderer/fleet.ts) is derived ONLY from real cargo jobs and
 * published here exactly as the production blit path will publish it (#148
 * cutover owes the store->publish feed). The renderer itself only ever reads the
 * bridge snapshot; this harness supplies the engine ticks the store will supply.
 *
 * Numerical checks only — a non-vision agent cannot self-certify visual fidelity;
 * capable visual inspection remains PENDING (architecture G1 #151).
 */
import {
  createJob,
  createLogistics,
  logisticsFingerprint,
  logisticsTotals,
  registerBuilding,
  registerCarrier,
  seedStock,
  tickLogistics,
  cancelJob,
} from "/src/game/simulation/logistics.ts";
import {
  configureTruck,
  createTraffic,
  setBayCapacity,
  setDefaultTruck,
  setJunctionCapacity,
  trafficFingerprint,
} from "/src/game/simulation/traffic.ts";
import { createRoadNetwork } from "/src/game/world/roadGraph.ts";
import { applyRoadCommand } from "/src/game/world/roadTool.ts";
import { createWorld, terrainIndex } from "/src/game/world/terrain.ts";
import { createInitialState } from "/src/game/simulation/types.ts";
import { YardWorld } from "/src/game/renderer/three/worldRenderer.ts";
import { CELL } from "/src/game/renderer/grid.ts";
import {
  getFleetFrame,
  publishFleetFrame,
  resetFleetFrame,
} from "/src/game/renderer/fleet.ts";

const VIEW = { width: 960, height: 600 };
let rig = null;
let world = null;
let sim = null;
let camera = { x: CELL * 2.5, y: CELL, scale: 3, yaw: 0, elev: 90 };
let reducedMotion = false;
let framePhase = 1;
let jobSeq = 0;

const c = (x, y) => ({ x, y });

function flatWorld(seed) {
  const w = createWorld(seed);
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) w.terrain[terrainIndex(x, y)] = "flat";
  }
  w.stock.scrap = 1000;
  return w;
}

function makeRig(seed) {
  return {
    w: flatWorld(seed),
    net: createRoadNetwork(),
    log: createLogistics(),
    traffic: createTraffic(),
  };
}

function placeRoad(id, cells) {
  const res = applyRoadCommand(rig.w, rig.net, { id, type: "road.place", cells });
  if (!res.ok) throw new Error(`road place failed: ${JSON.stringify(res.rejection)}`);
}
function removeRoad(id, cells) {
  const res = applyRoadCommand(rig.w, rig.net, { id, type: "road.remove", cells });
  if (!res.ok) throw new Error(`road remove failed: ${JSON.stringify(res.rejection)}`);
}
function corridor(n) {
  const cells = [];
  for (let x = 0; x < n; x += 1) cells.push(c(x, 0));
  placeRoad("line", cells);
}
function sites(dest = c(4, 0), stock = 100) {
  if (!registerBuilding(rig.log, { id: 1, cell: c(0, 0), capacity: 400 })) throw new Error("site 1");
  if (!registerBuilding(rig.log, { id: 2, cell: dest, capacity: 400 })) throw new Error("site 2");
  if (!seedStock(rig.log, 1, "scrap", stock)) throw new Error("seed stock");
}
function carrierAt(cell, capacity = 12) {
  const carrier = registerCarrier(rig.log, { capacity, cell });
  if (carrier === null) throw new Error("carrier");
  return carrier;
}
function job(id, amount) {
  const res = createJob(rig.log, {
    id,
    sourceBuildingId: 1,
    destBuildingId: 2,
    cargoType: "scrap",
    amount,
  });
  if (!res.ok) throw new Error(`job failed: ${JSON.stringify(res.reason)}`);
  return res.job;
}

function ensureWorld() {
  if (world) return;
  const canvas = document.getElementById("scene");
  world = new YardWorld(canvas);
  world.resize(VIEW);
  sim = createInitialState();
}

/** Publish the bridge from the real ledgers, sync + render one frame. */
function frame(phase, rm) {
  framePhase = phase;
  reducedMotion = rm;
  publishFleetFrame(rig.log, rig.traffic, phase, rm);
  world.sync(sim, camera, VIEW, { reducedMotion: rm, framePhase: phase, selected: null });
  world.render();
  return sample();
}

function ledgerSummary() {
  let conserved = true;
  for (const j of rig.log.jobs) {
    if (j.amount !== j.atSource + j.inTransit + j.delivered + j.returned) conserved = false;
  }
  const total = logisticsTotals(rig.log).scrap ?? 0;
  const units = getFleetFrame().units;
  let bound = true;
  let loaded = 0;
  for (const u of units) {
    if (u.cargo > 0) {
      loaded += 1;
      const j = rig.log.jobs.find((jj) => jj.id === u.jobId);
      if (!j || u.cargo !== j.inTransit || u.cargoType !== j.cargoType) bound = false;
    } else if (u.cargoType !== null) {
      bound = false;
    }
  }
  return { conserved, total, bound, loaded, jobs: rig.log.jobs.length };
}

function sample() {
  return {
    tick: rig.log.tick,
    fleet: world.fleetReport(),
    ledger: ledgerSummary(),
    fingerprints: {
      logistics: logisticsFingerprint(rig.log),
      traffic: trafficFingerprint(rig.traffic),
    },
    reducedMotion,
    framePhase,
    stats: world.stats(),
  };
}

function focusCorridor(n) {
  camera = { x: ((n - 1) / 2) * CELL + CELL / 2, y: CELL, scale: 3, yaw: 0, elev: 90 };
}

/** Named scenario setups; each leaves the bridge published at tick 0, phase 1. */
function setup(name, seed) {
  ensureWorld();
  resetFleetFrame();
  rig = makeRig(seed);
  jobSeq = 0;
  if (name === "empty") {
    corridor(5);
    sites();
    carrierAt(c(2, 0));
    carrierAt(c(3, 0));
    focusCorridor(5);
    // No publish: the bridge stays empty (default) -> every rig hidden.
    world.sync(sim, camera, VIEW, { reducedMotion: false, framePhase: 1, selected: null });
    world.render();
    return sample();
  }
  if (name === "lifecycle") {
    corridor(5);
    sites();
    carrierAt(c(0, 0));
    job("j1", 12);
    setDefaultTruck(rig.traffic, { speed: 1, loadTicks: 3, unloadTicks: 3 });
    focusCorridor(5);
    return frame(1, false);
  }
  if (name === "contention") {
    corridor(5);
    sites();
    carrierAt(c(0, 0));
    carrierAt(c(0, 0));
    job("a", 12);
    job("b", 12);
    setDefaultTruck(rig.traffic, { speed: 1, loadTicks: 2, unloadTicks: 0 });
    setBayCapacity(rig.traffic, c(0, 0), 1);
    focusCorridor(5);
    return frame(1, false);
  }
  if (name === "held") {
    corridor(5);
    sites();
    carrierAt(c(0, 0));
    job("j1", 12);
    focusCorridor(5);
    return frame(1, false);
  }
  if (name === "clip") {
    corridor(9);
    sites(c(8, 0), 200);
    const c1 = carrierAt(c(0, 0));
    const c2 = carrierAt(c(8, 0));
    configureTruck(rig.traffic, c1.id, { speed: 1, loadTicks: 2, unloadTicks: 2 });
    configureTruck(rig.traffic, c2.id, { speed: 2, loadTicks: 3, unloadTicks: 1 });
    job("clip-0", 12);
    job("clip-1", 12);
    jobSeq = 2;
    focusCorridor(9);
    return frame(1, false);
  }
  throw new Error(`unknown scenario ${name}`);
}

window.__RW3D__ = {
  setup,
  /** One real engine tick + one rendered frame. */
  tick(phase = 1, rm = false) {
    tickLogistics(rig.log, rig.net, 1, rig.traffic);
    return frame(phase, rm);
  },
  /** Render without ticking (caller phase sweep / paused session). */
  observe(phase, rm = false) {
    return frame(phase, rm);
  },
  setMotion(rm, phase) {
    return frame(phase, rm);
  },
  /** Re-publish idle carriers (no jobs) to show parked rigs with zero cargo. */
  publishIdle() {
    return frame(1, false);
  },
  resetBridge() {
    resetFleetFrame();
    world.sync(sim, camera, VIEW, { reducedMotion: false, framePhase: 1, selected: null });
    world.render();
    return sample();
  },
  cutRoad(cells) {
    removeRoad("cut", cells.map(([x, y]) => c(x, y)));
    return sample();
  },
  repairRoad(cells) {
    placeRoad("repair", cells.map(([x, y]) => c(x, y)));
    return sample();
  },
  spawnJobs(n, amount = 12) {
    for (let i = 0; i < n; i += 1) job(`clip-${jobSeq++}`, amount);
    return sample();
  },
  /** Non-throwing spawn probe: returns how many were created vs rejected. */
  trySpawn(n, amount = 12) {
    let created = 0;
    let rejected = 0;
    let reason = null;
    for (let i = 0; i < n; i += 1) {
      const res = createJob(rig.log, {
        id: `starve-${jobSeq++}`,
        sourceBuildingId: 1,
        destBuildingId: 2,
        cargoType: "scrap",
        amount,
      });
      if (res.ok) created += 1;
      else {
        rejected += 1;
        reason = res.reason.reason;
        break;
      }
    }
    return { created, rejected, reason, sample: sample() };
  },
  setBay(cell, cap) {
    setBayCapacity(rig.traffic, c(cell[0], cell[1]), cap);
    return sample();
  },
  setJunction(cap) {
    setJunctionCapacity(rig.traffic, cap);
    return sample();
  },
  cancel(jobId) {
    const res = cancelJob(rig.log, rig.net, jobId);
    return { res, sample: sample() };
  },
  jobs() {
    return rig.log.jobs.map((j) => ({
      id: j.id,
      status: j.status,
      phase: j.phase,
      progress: j.progress,
      amount: j.amount,
      atSource: j.atSource,
      inTransit: j.inTransit,
      delivered: j.delivered,
      returned: j.returned,
    }));
  },
  sample,
};
