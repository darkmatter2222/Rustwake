// @vitest-environment node
/**
 * Fleet motion acceptance: measured throughput (E05) and a 60s activity clip
 * (V04) for issue #143 (RW3D T16).
 *
 * E05 — "truck travel length, speed, load/unload and bay contention affect
 * measured throughput; decorative vehicles alone fail." Every dimension is
 * asserted against hand-derived completion ticks from the real #140/#141
 * engine, and the adapter's stages/queue states are observed on the way.
 *
 * V04 — "60s activity clip shows independently timed mechanisms and
 * event-driven cargo; paused/starved/unpowered machines do not fake
 * production." A 600-frame clip (10 Hz) drives two independently configured
 * carriers, staggered job events, a 60-frame pause and a starvation tail;
 * conservation, cargo binding and freeze invariants hold on every frame.
 *
 * Seed 143, flattened start parcel. The adapter is presentation-only: it never
 * advances the ledger, so all throughput is the engine's, not the renderer's.
 */
import { describe, expect, it } from "vitest";
import {
  createJob,
  createLogistics,
  logisticsTotals,
  registerBuilding,
  registerCarrier,
  seedStock,
  tickLogistics,
  type Carrier,
  type CargoJob,
  type LogisticsState,
} from "../../src/game/simulation/logistics";
import {
  configureTruck,
  createTraffic,
  setBayCapacity,
  setDefaultTruck,
  setJunctionCapacity,
  type TrafficState,
} from "../../src/game/simulation/traffic";
import { createRoadNetwork, type RoadNetworkState } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { Cell, WorldState } from "../../src/game/world/types";
import {
  deriveFleetFrame,
  type FleetFrame,
  type FleetMemory,
  type FleetUnit,
} from "../../src/game/renderer/fleet";

const SEED = 143;

function flatWorld(): WorldState {
  const w = createWorld(SEED);
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) w.terrain[terrainIndex(x, y)] = "flat";
  }
  w.stock.scrap = 1000;
  return w;
}

const c = (x: number, y: number): Cell => ({ x, y });

interface Rig {
  w: WorldState;
  net: RoadNetworkState;
  log: LogisticsState;
  traffic: TrafficState;
  memory: FleetMemory | null;
}

function rig(): Rig {
  return {
    w: flatWorld(),
    net: createRoadNetwork(),
    log: createLogistics(),
    traffic: createTraffic(),
    memory: null,
  };
}

function placeRoad(r: Rig, id: string, cells: Cell[]) {
  const result = applyRoadCommand(r.w, r.net, { id, type: "road.place", cells });
  if (!result.ok) throw new Error(`setup road failed: ${JSON.stringify(result.rejection)}`);
}

function corridor(r: Rig, n = 5) {
  const cells: Cell[] = [];
  for (let x = 0; x < n; x += 1) cells.push(c(x, 0));
  placeRoad(r, "line", cells);
}

function sites(r: Rig, dest: Cell = c(4, 0), stock = 100) {
  expect(registerBuilding(r.log, { id: 1, cell: c(0, 0), capacity: 400 })).toBe(true);
  expect(registerBuilding(r.log, { id: 2, cell: dest, capacity: 400 })).toBe(true);
  expect(seedStock(r.log, 1, "scrap", stock)).toBe(true);
}

function carrierAt(r: Rig, cell: Cell, capacity = 12): Carrier {
  const carrier = registerCarrier(r.log, { capacity, cell });
  if (carrier === null) throw new Error("setup carrier failed");
  return carrier;
}

function job(r: Rig, id: string, amount: number): CargoJob {
  const result = createJob(r.log, {
    id,
    sourceBuildingId: 1,
    destBuildingId: 2,
    cargoType: "scrap",
    amount,
  });
  if (!result.ok) throw new Error(`setup job failed: ${JSON.stringify(result.reason)}`);
  return result.job;
}

function observe(r: Rig, phase: number, reducedMotion = false): FleetFrame {
  const out = deriveFleetFrame(r.log, r.traffic, r.memory, phase, reducedMotion);
  r.memory = out.memory;
  return out.frame;
}

function unitOf(frame: FleetFrame, carrierId: number): FleetUnit {
  const unit = frame.units.find((u) => u.carrierId === carrierId);
  if (unit === undefined) throw new Error(`no unit for carrier ${carrierId}`);
  return unit;
}

function expectConserved(r: Rig, total: number) {
  for (const j of r.log.jobs) {
    expect(j.amount).toBe(j.atSource + j.inTransit + j.delivered + j.returned);
  }
  expect(logisticsTotals(r.log).scrap ?? 0).toBe(total);
}

function expectCargoBound(r: Rig, frame: FleetFrame) {
  for (const unit of frame.units) {
    const j = unit.jobId === null ? undefined : r.log.jobs.find((jj) => jj.id === unit.jobId);
    if (unit.cargo > 0) {
      expect(j).toBeDefined();
      expect(unit.cargo).toBe(j!.inTransit);
      expect(unit.cargoType).toBe(j!.cargoType);
    } else {
      expect(unit.cargoType).toBeNull();
    }
  }
}

interface Trace {
  /** jobId -> engine tick the job reached a terminal status. */
  complete: Map<number, number>;
  stages: Map<number, Set<string>>;
  queueBayTicks: number[];
  queueJunctionTicks: number[];
  cargoLoadEvents: number;
  deliveryEvents: number;
}

/** Tick the real engine one step at a time, deriving a frame after each. */
function trace(r: Rig, maxTicks: number, total = 100): Trace {
  const out: Trace = {
    complete: new Map(),
    stages: new Map(),
    queueBayTicks: [],
    queueJunctionTicks: [],
    cargoLoadEvents: 0,
    deliveryEvents: 0,
  };
  const prevCargo = new Map<number, number>();
  let prevDelivered = 0;
  for (let t = 1; t <= maxTicks; t += 1) {
    tickLogistics(r.log, r.net, 1, r.traffic);
    const frame = observe(r, 1);
    expectConserved(r, total);
    expectCargoBound(r, frame);
    for (const unit of frame.units) {
      let set = out.stages.get(unit.carrierId);
      if (!set) {
        set = new Set();
        out.stages.set(unit.carrierId, set);
      }
      set.add(unit.stage);
      if (unit.stage === "queue-bay") out.queueBayTicks.push(t);
      if (unit.stage === "queue-junction") out.queueJunctionTicks.push(t);
      const pc = prevCargo.get(unit.carrierId) ?? 0;
      if (pc === 0 && unit.cargo > 0) out.cargoLoadEvents += 1;
      prevCargo.set(unit.carrierId, unit.cargo);
    }
    let delivered = 0;
    for (const j of r.log.jobs) {
      delivered += j.delivered;
      if ((j.status === "complete" || j.status === "cancelled") && !out.complete.has(j.id)) {
        out.complete.set(j.id, t);
      }
    }
    if (delivered > prevDelivered) out.deliveryEvents += 1;
    prevDelivered = delivered;
  }
  return out;
}

const makespan = (t: Trace) => Math.max(...t.complete.values());
const firstDone = (t: Trace) => Math.min(...t.complete.values());

describe("E05: measured throughput (hand-derived completion ticks)", () => {
  it("travel length changes arrival: corridor 5 completes t6, corridor 9 t10", () => {
    const short = rig();
    corridor(short, 5);
    sites(short);
    carrierAt(short, c(0, 0));
    job(short, "j", 12);
    const ts = trace(short, 12);
    expect(ts.complete.get(1)).toBe(6);

    const long = rig();
    corridor(long, 9);
    sites(long, c(8, 0));
    carrierAt(long, c(0, 0));
    job(long, "j", 12);
    const tl = trace(long, 14);
    expect(tl.complete.get(1)).toBe(10);
    // Four extra cells at speed 1 cost exactly four extra ticks.
    expect(tl.complete.get(1)! - ts.complete.get(1)!).toBe(4);
  });

  it("speed changes arrival: corridor 9 at speed 2 completes t6 (vs t10 at speed 1)", () => {
    const r = rig();
    corridor(r, 9);
    sites(r, c(8, 0));
    carrierAt(r, c(0, 0));
    job(r, "j", 12);
    setDefaultTruck(r.traffic, { speed: 2, loadTicks: 0, unloadTicks: 0 });
    const t = trace(r, 12);
    expect(t.complete.get(1)).toBe(6);
  });

  it("load/unload timers change arrival: L3+U3 adds six ticks (t6 -> t12)", () => {
    const bare = rig();
    corridor(bare, 5);
    sites(bare);
    carrierAt(bare, c(0, 0));
    job(bare, "j", 12);
    const tb = trace(bare, 12);
    expect(tb.complete.get(1)).toBe(6);

    const timed = rig();
    corridor(timed, 5);
    sites(timed);
    carrierAt(timed, c(0, 0));
    job(timed, "j", 12);
    setDefaultTruck(timed.traffic, { speed: 1, loadTicks: 3, unloadTicks: 3 });
    const tt = trace(timed, 16);
    expect(tt.complete.get(1)).toBe(12);
    expect(tt.complete.get(1)! - tb.complete.get(1)!).toBe(6);
    expect(tt.stages.get(1)).toContain("load");
    expect(tt.stages.get(1)).toContain("unload");
  });

  it("bay contention costs real throughput: makespan 11 (cap 1) vs 8 (cap 2)", () => {
    const contested = rig();
    corridor(contested, 5);
    sites(contested);
    carrierAt(contested, c(0, 0));
    carrierAt(contested, c(0, 0));
    job(contested, "a", 12);
    job(contested, "b", 12);
    setDefaultTruck(contested.traffic, { speed: 1, loadTicks: 2, unloadTicks: 0 });
    setBayCapacity(contested.traffic, c(0, 0), 1);
    const tc = trace(contested, 16);
    expect(firstDone(tc)).toBe(8);
    expect(makespan(tc)).toBe(11);
    // The second carrier queues at the source bay for three ticks (t2..t4).
    expect(tc.queueBayTicks).toEqual([2, 3, 4]);
    expect(tc.cargoLoadEvents).toBe(2);
    expect(tc.deliveryEvents).toBe(2);

    const free = rig();
    corridor(free, 5);
    sites(free);
    carrierAt(free, c(0, 0));
    carrierAt(free, c(0, 0));
    job(free, "a", 12);
    job(free, "b", 12);
    setDefaultTruck(free.traffic, { speed: 1, loadTicks: 2, unloadTicks: 0 });
    setBayCapacity(free.traffic, c(0, 0), 2);
    const tf = trace(free, 16);
    expect(firstDone(tf)).toBe(8);
    expect(makespan(tf)).toBe(8);
    expect(tf.queueBayTicks).toEqual([]);
    // Contention costs exactly three ticks of makespan.
    expect(makespan(tc) - makespan(tf)).toBe(3);
  });

  it("a queued bay carrier freezes across a phase sweep (no fake delivery)", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const a = carrierAt(r, c(0, 0));
    const b = carrierAt(r, c(0, 0));
    job(r, "a", 12);
    job(r, "b", 12);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 2, unloadTicks: 0 });
    setBayCapacity(r.traffic, c(0, 0), 1);
    tickLogistics(r.log, r.net, 1, r.traffic); // t1 dispatch
    observe(r, 1); // t2: one loads, one queues
    tickLogistics(r.log, r.net, 1, r.traffic);
    const queuedFrame = observe(r, 0);
    const queued = queuedFrame.units.find((u) => u.stage === "queue-bay");
    expect(queued).toBeDefined();
    expect(queued!.heldKind).toBe("bay-full");
    expect(queued!.moving).toBe(false);
    expect(queued!.cargo).toBe(0);
    const pos = { ...queued!.pos };
    const wheels = queued!.wheelTurns;
    for (const phase of [0.25, 0.5, 0.75, 1, 0, 0.5, 1]) {
      const u = unitOf(observe(r, phase), queued!.carrierId);
      expect(u.stage).toBe("queue-bay");
      expect(u.pos).toEqual(pos);
      expect(u.wheelTurns).toBe(wheels);
      expect(u.moving).toBe(false);
    }
    // The other carrier is independently loading at the same bay.
    const loader = queuedFrame.units.find((u) => u.carrierId !== queued!.carrierId);
    expect(loader!.stage).toBe("load");
    expect([a.id, b.id]).toContain(queued!.carrierId);
    expectConserved(r, 100);
  });

  it("junction contention costs real throughput: makespan 8 (cap 1) vs 6 (unlimited)", () => {
    const contested = rig();
    corridor(contested, 5);
    placeRoad(contested, "stub", [c(2, 0), c(2, 1)]); // (2,0) degree-3 junction
    sites(contested);
    carrierAt(contested, c(0, 0));
    carrierAt(contested, c(0, 0));
    job(contested, "a", 12);
    job(contested, "b", 12);
    setJunctionCapacity(contested.traffic, 1);
    const tc = trace(contested, 12);
    expect(firstDone(tc)).toBe(6);
    // FIFO grants the queued truck the next tick's first move, but the leader
    // still occupies the junction at that instant, so it queues t4 AND t5 and
    // completes t8 (two ticks of contention cost).
    expect(makespan(tc)).toBe(8);
    expect(tc.queueJunctionTicks).toEqual([4, 5]);

    const free = rig();
    corridor(free, 5);
    placeRoad(free, "stub", [c(2, 0), c(2, 1)]);
    sites(free);
    carrierAt(free, c(0, 0));
    carrierAt(free, c(0, 0));
    job(free, "a", 12);
    job(free, "b", 12);
    setJunctionCapacity(free.traffic, null);
    const tf = trace(free, 12);
    expect(makespan(tf)).toBe(6);
    expect(tf.queueJunctionTicks).toEqual([]);
    expect(makespan(tc) - makespan(tf)).toBe(2);
  });
});

describe("V04: 60s activity clip (600 frames @ 10 Hz)", () => {
  it("independently timed carriers, event-driven cargo, pause + starvation freeze", () => {
    const r = rig();
    corridor(r, 9);
    sites(r, c(8, 0), 200);
    const c1 = carrierAt(r, c(0, 0)); // at source: slow, long timers
    const c2 = carrierAt(r, c(8, 0)); // at dest: fast, short timers -> travels empty
    expect(configureTruck(r.traffic, c1.id, { speed: 1, loadTicks: 2, unloadTicks: 2 })).toBe(true);
    expect(configureTruck(r.traffic, c2.id, { speed: 2, loadTicks: 3, unloadTicks: 1 })).toBe(true);

    // Event-driven cargo: jobs arrive in staggered batches, not a fixed loop.
    let jobSeq = 0;
    const spawn = (n: number) => {
      for (let i = 0; i < n; i += 1) job(r, `clip-${jobSeq++}`, 12);
    };
    spawn(2); // tick 0

    const stagesSeen = new Set<string>();
    const firstCargoTick = new Map<number, number>();
    const prevCargo = new Map<number, number>();
    const prevWheels = new Map<number, number>();
    let prevDelivered = 0;
    let loadEvents = 0;
    let deliveryEvents = 0;
    let pauseFrames = 0;
    let starveRejections = 0;
    let engineTicks = 0;

    const PAUSE_START = 200;
    const PAUSE_END = 260;

    for (let frame = 1; frame <= 600; frame += 1) {
      if (frame >= PAUSE_START && frame < PAUSE_END) {
        // Session paused: the engine does NOT tick. The renderer may sweep the
        // sub-tick phase, but cargo, delivery and progress must stay frozen.
        const before = r.log.jobs.map((j) => ({
          id: j.id,
          delivered: j.delivered,
          inTransit: j.inTransit,
          progress: j.progress,
        }));
        const w1 = new Map<number, number>();
        for (const phase of [0, 0.5, 1]) {
          const f = observe(r, phase);
          expectCargoBound(r, f);
          for (const u of f.units) {
            stagesSeen.add(u.stage);
            if (phase === 1) w1.set(u.carrierId, u.wheelTurns);
          }
        }
        for (const j of r.log.jobs) {
          const b = before.find((x) => x.id === j.id)!;
          expect(j.delivered).toBe(b.delivered);
          expect(j.inTransit).toBe(b.inTransit);
          expect(j.progress).toBe(b.progress);
        }
        // Wheels at phase 1 cannot accumulate while paused.
        const again = observe(r, 1);
        for (const u of again.units) expect(u.wheelTurns).toBe(w1.get(u.carrierId));
        pauseFrames += 1;
        expectConserved(r, 200);
        continue;
      }

      if (frame === 60 || frame === 120) spawn(2);
      if (frame === 400) {
        // Starvation tail: drain the source until creation is rejected. A
        // starved yard must not invent cargo or keep producing.
        for (let i = 0; i < 40; i += 1) {
          const res = createJob(r.log, {
            id: `starve-${jobSeq++}`,
            sourceBuildingId: 1,
            destBuildingId: 2,
            cargoType: "scrap",
            amount: 12,
          });
          if (!res.ok) {
            expect(res.reason.reason).toBe("insufficient-stock");
            starveRejections += 1;
            break;
          }
        }
      }

      tickLogistics(r.log, r.net, 1, r.traffic);
      engineTicks += 1;
      const canonical = observe(r, 1);
      expectConserved(r, 200);
      expectCargoBound(r, canonical);

      // Stage is a function of the ledger window, not the sub-tick phase.
      const early = observe(r, 0.2);
      const late = observe(r, 0.8);
      for (const u of canonical.units) {
        expect(unitOf(early, u.carrierId).stage).toBe(u.stage);
        expect(unitOf(late, u.carrierId).stage).toBe(u.stage);
        stagesSeen.add(u.stage);
        const pc = prevCargo.get(u.carrierId) ?? 0;
        if (pc === 0 && u.cargo > 0) {
          loadEvents += 1;
          if (!firstCargoTick.has(u.carrierId)) firstCargoTick.set(u.carrierId, r.log.tick);
        }
        prevCargo.set(u.carrierId, u.cargo);
        const pw = prevWheels.get(u.carrierId) ?? 0;
        expect(u.wheelTurns).toBeGreaterThanOrEqual(pw); // monotone at phase 1
        prevWheels.set(u.carrierId, u.wheelTurns);
      }
      let delivered = 0;
      for (const j of r.log.jobs) delivered += j.delivered;
      expect(delivered).toBeGreaterThanOrEqual(prevDelivered);
      if (delivered > prevDelivered) deliveryEvents += 1;
      prevDelivered = delivered;
    }

    // Independently timed mechanisms: the two carriers load on different ticks.
    expect(firstCargoTick.get(c1.id)).toBe(4);
    expect(firstCargoTick.get(c2.id)).toBe(8);
    expect(firstCargoTick.get(c1.id)).not.toBe(firstCargoTick.get(c2.id));

    // Event-driven cargo actually moved through the yard.
    expect(loadEvents).toBeGreaterThanOrEqual(6);
    expect(deliveryEvents).toBeGreaterThanOrEqual(6);
    expect(pauseFrames).toBe(60);
    expect(starveRejections).toBeGreaterThanOrEqual(1);
    expect(engineTicks).toBe(540); // 600 frames minus the 60-frame pause

    // The clip exercised the real lifecycle stages, including empty travel.
    for (const stage of ["parked", "load", "move-empty", "move-loaded", "depart", "align", "unload"]) {
      expect(stagesSeen.has(stage), `stage ${stage}`).toBe(true);
    }

    // Starved/idle carriers do not fake production: parked, empty, frozen.
    const end = observe(r, 1);
    for (const u of end.units) {
      if (u.jobId === null) {
        expect(u.stage).toBe("parked");
        expect(u.cargo).toBe(0);
        expect(u.moving).toBe(false);
        const frozen = { ...u.pos };
        const wheels = u.wheelTurns;
        for (const phase of [0, 0.5, 1, 0.5, 1]) {
          const uu = unitOf(observe(r, phase), u.carrierId);
          expect(uu.pos).toEqual(frozen);
          expect(uu.wheelTurns).toBe(wheels);
        }
      }
    }
    expectConserved(r, 200);
  });
});
