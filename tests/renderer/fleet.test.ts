// @vitest-environment node
/**
 * Fleet transport adapter motion contract (issue #143, RW3D T16).
 *
 * Binding acceptance:
 *  - E05: every visible load belongs to a REAL cargo job (#140 ledger + #141
 *    traffic runtime); brake/align/lift-load/depart/unload stages follow the
 *    actual phase + timer + hold transitions; a paused, held or queued job
 *    freezes instead of continuing a fake delivery.
 *  - V04: motion is event-driven and state-derived — no clock, no decorative
 *    loop. Sub-tick phase only interpolates BACKWARD over cells already walked.
 *
 * Seed 143, flattened start parcel; all tick counts hand-derived against the
 * traffic engine (dispatch after the active pass; load/unload timers count down
 * one per tick; speed budget spends one point per cell entry). The adapter is
 * pure: these tests drive the real tickLogistics and assert the derived frame
 * never mutates the ledgers, never invents cargo, and never drifts when k = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelJob,
  createJob,
  createLogistics,
  logisticsFingerprint,
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
  createTraffic,
  setDefaultTruck,
  trafficFingerprint,
  type TrafficState,
} from "../../src/game/simulation/traffic";
import { createRoadNetwork, type RoadNetworkState } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { Cell, WorldState } from "../../src/game/world/types";
import {
  deriveFleetFrame,
  getFleetFrame,
  publishFleetFrame,
  resetFleetFrame,
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

function removeRoad(r: Rig, id: string, cells: Cell[]) {
  const result = applyRoadCommand(r.w, r.net, { id, type: "road.remove", cells });
  if (!result.ok) throw new Error(`setup removal failed: ${JSON.stringify(result.rejection)}`);
}

/** Straight corridor along y = 0: (0,0) .. (n-1,0). */
function corridor(r: Rig, n = 5) {
  const cells: Cell[] = [];
  for (let x = 0; x < n; x += 1) cells.push(c(x, 0));
  placeRoad(r, "line", cells);
}

function sites(r: Rig, dest: Cell = c(4, 0)) {
  expect(registerBuilding(r.log, { id: 1, cell: c(0, 0), capacity: 40 })).toBe(true);
  expect(registerBuilding(r.log, { id: 2, cell: dest, capacity: 40 })).toBe(true);
  expect(seedStock(r.log, 1, "scrap", 100)).toBe(true);
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

/** One engine tick + one derived frame at the given sub-tick phase. */
function step(r: Rig, phase = 1, reducedMotion = false): FleetFrame {
  tickLogistics(r.log, r.net, 1, r.traffic);
  return observe(r, phase, reducedMotion);
}

/** Derive without ticking (the caller's phase sweep inside one session tick). */
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

function jobOf(r: Rig, jobId: number | null): CargoJob | undefined {
  return jobId === null ? undefined : r.log.jobs.find((j) => j.id === jobId);
}

/** E01 container law + conserved totals, after every observation. */
function expectConserved(r: Rig, total = 100) {
  for (const j of r.log.jobs) {
    expect(j.amount).toBe(j.atSource + j.inTransit + j.delivered + j.returned);
  }
  expect(logisticsTotals(r.log).scrap ?? 0).toBe(total);
}

/** E05: every visible cargo unit is bound to the real ledger, never decorative. */
function expectCargoBound(r: Rig, frame: FleetFrame) {
  for (const unit of frame.units) {
    const j = jobOf(r, unit.jobId);
    if (unit.cargo > 0) {
      expect(j).toBeDefined();
      expect(unit.cargo).toBe(j!.inTransit);
      expect(unit.cargoType).toBe(j!.cargoType);
    } else {
      expect(unit.cargoType).toBeNull();
      expect(j === undefined || j.inTransit === 0).toBe(true);
    }
    const carrier = r.log.carriers.find((cc) => cc.id === unit.carrierId);
    expect(unit.capacity).toBe(carrier!.capacity);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

beforeEach(() => {
  resetFleetFrame();
});

describe("fleet bridge (session-only, additive)", () => {
  it("is empty by default and stable between publishes", () => {
    const empty = getFleetFrame();
    expect(empty.tick).toBe(0);
    expect(empty.units).toHaveLength(0);
    expect(getFleetFrame()).toBe(empty); // same reference: no per-read allocation

    const r = rig();
    corridor(r);
    sites(r);
    carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    const published = publishFleetFrame(r.log, r.traffic, 0.5, false);
    expect(published.tick).toBe(r.log.tick);
    expect(published.units).toHaveLength(1);
    expect(getFleetFrame()).toBe(published);
    expect(getFleetFrame()).toBe(published); // still stable before the next publish

    resetFleetFrame();
    expect(getFleetFrame().units).toHaveLength(0);
  });

  it("publish derives exactly what deriveFleetFrame derives from the same ledgers", () => {
    const r = rig();
    corridor(r);
    sites(r);
    carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    step(r, 1);
    step(r, 1);
    step(r, 1); // t3: mid-transit, a real walked window
    // Both derivations start from empty memory at the same ledger tick, so the
    // bridge must reproduce the pure function exactly (no hidden state).
    resetFleetFrame();
    const direct = deriveFleetFrame(r.log, r.traffic, null, 0.25, false);
    const published = publishFleetFrame(r.log, r.traffic, 0.25, false);
    expect(published.tick).toBe(direct.frame.tick);
    expect(published.units).toEqual(direct.frame.units);
  });
});

describe("real-job binding (E05)", () => {
  it("idle carriers park with zero cargo and zero motion across a phase sweep", () => {
    const r = rig();
    corridor(r);
    sites(r);
    carrierAt(r, c(2, 0));
    carrierAt(r, c(3, 0));
    // No jobs at all: a decorative fleet would still animate here.
    for (const phase of [0, 0.25, 0.5, 0.75, 1, 0, 0.5, 1]) {
      const frame = observe(r, phase);
      for (const unit of frame.units) {
        expect(unit.stage).toBe("parked");
        expect(unit.jobId).toBeNull();
        expect(unit.cargo).toBe(0);
        expect(unit.cargoType).toBeNull();
        expect(unit.moving).toBe(false);
        expect(unit.lift).toBe(0);
        expect(unit.wheelTurns).toBe(0);
        expect(unit.pos).toEqual({ x: unit.cell.x + 0.5, y: unit.cell.y + 0.5 });
      }
    }
    expectConserved(r);
  });

  it("cargo, stages and lift follow the real lifecycle tick by tick", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    const j = job(r, "j1", 12);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 3, unloadTicks: 3 });

    const stages: string[] = [];
    // Hand-derived: dispatch t1; load timer t2..t4 (cargo lands t5); travel
    // t6 depart, t7 move-loaded, t8 align, t9 arrive + unload timer t9..t11;
    // complete t12.
    const expected: Record<number, string> = {
      1: "move-empty", // dispatched to-source after the active pass; pre-load, k = 0
      2: "load",
      3: "load",
      4: "load",
      5: "move-loaded", // loaded, new leg, k = 0: frozen at the source bay
      6: "depart",
      7: "move-loaded",
      8: "align",
      9: "unload",
      10: "unload",
      11: "unload",
      12: "parked",
    };
    for (let t = 1; t <= 12; t += 1) {
      const frame = step(r, 1);
      const unit = unitOf(frame, carrier.id);
      stages.push(unit.stage);
      expect(unit.stage, `tick ${t}`).toBe(expected[t]);
      expectCargoBound(r, frame);
      expectConserved(r);
      const rt = r.traffic.trucks[carrier.id];
      if (unit.stage === "load") {
        expect(j.phase).toBe("to-source");
        expect(rt.loadRemaining).toBeGreaterThan(0);
        expect(unit.cargo).toBe(0);
        expect(unit.lift).toBeGreaterThan(0);
        expect(unit.lift).toBeLessThanOrEqual(1);
        expect(unit.moving).toBe(false);
      } else if (unit.stage === "unload") {
        expect(j.phase).toBe("to-dest");
        expect(rt.unloadRemaining).toBeGreaterThan(0);
        expect(unit.cargo).toBe(12);
        expect(unit.lift).toBeGreaterThan(0);
        // At phase 1 the rig rests on the destination bay cell (it may have
        // slid into the bay on the arrival tick, so moving can be true there).
        expect(unit.pos).toEqual({ x: 4.5, y: 0.5 });
      } else {
        expect(unit.lift).toBe(0);
      }
      if (t >= 5 && t <= 11) expect(unit.cargo).toBe(12);
      else expect(unit.cargo).toBe(0);
    }
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(12);
    expect(new Set(stages)).toEqual(
      new Set(["move-empty", "parked", "load", "move-loaded", "depart", "align", "unload"])
    );
  });

  it("lift rides the real timer fraction inside a load window", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 4, unloadTicks: 0 });
    step(r, 1); // t1 dispatch
    step(r, 0); // t2 loadRemaining 4 -> done 0
    const rt = r.traffic.trucks[carrier.id];
    expect(rt.loadRemaining).toBe(4);
    for (const [phase, want] of [
      [0, 0],
      [0.25, 0.0625],
      [0.5, 0.125],
      [1, 0.25],
    ] as const) {
      const unit = unitOf(observe(r, phase), carrier.id);
      expect(unit.stage).toBe("load");
      expect(unit.lift).toBeCloseTo(want, 10);
      expect(unit.pos).toEqual({ x: 0.5, y: 0.5 }); // frozen while loading
      expect(unit.wheelTurns).toBe(0);
    }
  });

  it("a cancelled loaded job recalls real cargo, then parks empty", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    const j = job(r, "j1", 12);
    // Default profile: immediate load/unload. Travel to progress 2 (tick 4).
    for (let t = 1; t <= 4; t += 1) step(r, 1);
    expect(j.inTransit).toBe(12);
    expect(j.phase).toBe("to-dest");
    const cancelled = cancelJob(r.log, r.net, j.id);
    expect(cancelled.ok).toBe(true);
    expect(j.phase).toBe("returning");
    const frame = observe(r, 0.5);
    const unit = unitOf(frame, carrier.id);
    expect(unit.stage).toBe("recall");
    expect(unit.cargo).toBe(12); // still the real ledger, not a fake box
    expectCargoBound(r, frame);
    // Recall walks back to the source and settles the cargo there.
    for (let t = 0; t < 10 && j.status !== "cancelled"; t += 1) {
      const f = step(r, 1);
      expectCargoBound(r, f);
      expectConserved(r);
    }
    expect(j.status).toBe("cancelled");
    expect(j.returned).toBe(12);
    expect(j.inTransit).toBe(0);
    const end = unitOf(observe(r, 1), carrier.id);
    expect(end.stage).toBe("parked");
    expect(end.cargo).toBe(0);
  });
});

describe("blocked and paused jobs freeze (E05/V04)", () => {
  it("a road cut under the carrier holds with the exact blocker and zero drift", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    const j = job(r, "j1", 12);
    for (let t = 1; t <= 4; t += 1) step(r, 1); // progress 2, loaded
    expect(j.progress).toBe(2);
    removeRoad(r, "cut", [c(2, 0)]); // the cell under the carrier
    const held = step(r, 0);
    const unit = unitOf(held, carrier.id);
    expect(unit.stage).toBe("held");
    expect(unit.heldKind).toBe("road-removed");
    expect(unit.cargo).toBe(12); // cargo preserved while blocked
    expect(unit.moving).toBe(false);
    const frozenPos = { ...unit.pos };
    const frozenWheels = unit.wheelTurns;
    for (const phase of [0.25, 0.5, 0.75, 1, 0, 0.5, 1]) {
      const u = unitOf(observe(r, phase), carrier.id);
      expect(u.stage).toBe("held");
      expect(u.pos).toEqual(frozenPos);
      expect(u.wheelTurns).toBe(frozenWheels);
      expect(u.cargo).toBe(12);
      expect(u.moving).toBe(false);
    }
    expectConserved(r);
    // Repair recovers the job (bounded retry from the leg origin); the adapter
    // clamps the progress reset to k = 0 so recovery never fakes a teleport.
    placeRoad(r, "repair", [c(1, 0), c(2, 0), c(3, 0)]);
    let sawMovingAgain = false;
    for (let t = 0; t < 20 && j.status !== "complete"; t += 1) {
      const f = step(r, 1);
      expectCargoBound(r, f);
      expectConserved(r);
      const u = unitOf(f, carrier.id);
      if (u.moving) sawMovingAgain = true;
    }
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(12);
    expect(sawMovingAgain).toBe(true);
  });

  it("a cut ahead of the carrier holds no-route and freezes, cargo intact", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    for (let t = 1; t <= 4; t += 1) step(r, 1);
    removeRoad(r, "cut", [c(3, 0), c(4, 0)]);
    const unit = unitOf(step(r, 0), carrier.id);
    expect(unit.stage).toBe("held");
    expect(unit.heldKind).toBe("no-route");
    expect(unit.cargo).toBe(12);
    const pos = { ...unit.pos };
    for (const phase of [0.5, 1, 0.5, 1]) {
      const u = unitOf(observe(r, phase), carrier.id);
      expect(u.pos).toEqual(pos);
      expect(u.moving).toBe(false);
    }
    expectConserved(r);
  });

  it("a paused session never advances cargo, delivery or wheels", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    const j = job(r, "j1", 12);
    for (let t = 1; t <= 4; t += 1) step(r, 1); // mid-transit, progress 2
    const progress = j.progress;
    const delivered = j.delivered;
    const inTransit = j.inTransit;
    const path = j.path!;
    const from = path[progress - 1];
    const to = path[progress];
    // No further engine ticks: the caller's phase may only finish the slide
    // over the cells ALREADY walked, never predict the next cell. Within this
    // fixed window wheelTurns = distance + k * phase, bounded by [w0, w1].
    const w0 = unitOf(observe(r, 0), carrier.id).wheelTurns;
    const w1 = unitOf(observe(r, 1), carrier.id).wheelTurns;
    expect(w1).toBeGreaterThanOrEqual(w0);
    for (const phase of [0, 0.25, 0.5, 0.75, 1, 0, 0.25, 0.5, 0.75, 1]) {
      const frame = observe(r, phase);
      const unit = unitOf(frame, carrier.id);
      expect(j.progress).toBe(progress);
      expect(j.delivered).toBe(delivered);
      expect(j.inTransit).toBe(inTransit);
      expect(unit.cargo).toBe(inTransit);
      expect(unit.stage).toBe("move-loaded");
      // Position stays on the walked segment [from, to].
      expect(unit.pos.x).toBeGreaterThanOrEqual(from.x + 0.5);
      expect(unit.pos.x).toBeLessThanOrEqual(to.x + 0.5);
      expect(unit.pos.y).toBe(0.5);
      expect(unit.wheelTurns).toBeCloseTo(w0 + (w1 - w0) * phase, 10);
      expect(unit.wheelTurns).toBeGreaterThanOrEqual(w0);
      expect(unit.wheelTurns).toBeLessThanOrEqual(w1);
      expectCargoBound(r, frame);
    }
    // At phase 1 the carrier rests exactly on the authoritative cell.
    const rest = unitOf(observe(r, 1), carrier.id);
    expect(rest.pos).toEqual({ x: to.x + 0.5, y: to.y + 0.5 });
    // Repeated sweeps do not accumulate distance.
    const wheels = rest.wheelTurns;
    for (const phase of [0, 0.5, 1, 1]) observe(r, phase);
    expect(unitOf(observe(r, 1), carrier.id).wheelTurns).toBe(wheels);
    expectConserved(r);
  });

  it("a held job with no path keeps the carrier cell, not a stale path cell", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    for (let t = 1; t <= 4; t += 1) step(r, 1);
    removeRoad(r, "cut", [c(2, 0)]);
    step(r, 1); // revalidate -> path null
    const unit = unitOf(observe(r, 0.5), carrier.id);
    expect(unit.cell).toEqual(carrier.cell);
    expect(unit.pos).toEqual({ x: carrier.cell.x + 0.5, y: carrier.cell.y + 0.5 });
  });
});

describe("backward-looking interpolation numerics", () => {
  it("a one-cell window slides from the previous cell to the current cell", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    step(r, 1); // t1 dispatch
    step(r, 1); // t2 immediate load, new leg progress 0
    const frame = step(r, 0); // t3 progress 1, k = 1
    const unit = unitOf(frame, carrier.id);
    expect(unit.moving).toBe(true);
    expect(unit.stage).toBe("depart");
    expect(unit.pos).toEqual({ x: 0.5, y: 0.5 }); // phase 0: previous cell
    expect(unit.wheelTurns).toBe(0);
    const mid = unitOf(observe(r, 0.5), carrier.id);
    expect(mid.pos).toEqual({ x: 1.0, y: 0.5 });
    expect(mid.wheelTurns).toBeCloseTo(0.5, 10);
    expect(mid.heading).toBe(0); // grid +x
    const end = unitOf(observe(r, 1), carrier.id);
    expect(end.pos).toEqual({ x: 1.5, y: 0.5 });
    expect(end.wheelTurns).toBe(1);
  });

  it("a two-cell window (speed 2) traverses both walked segments", () => {
    const r = rig();
    corridor(r, 9);
    sites(r, c(8, 0));
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    setDefaultTruck(r.traffic, { speed: 2, loadTicks: 0, unloadTicks: 0 });
    step(r, 1); // t1 dispatch
    step(r, 1); // t2 load
    const unit = unitOf(step(r, 0), carrier.id); // t3 progress 2, k = 2
    expect(unit.moving).toBe(true);
    expect(unit.pos).toEqual({ x: 0.5, y: 0.5 });
    expect(unitOf(observe(r, 0.25), carrier.id).pos).toEqual({ x: 1.0, y: 0.5 });
    expect(unitOf(observe(r, 0.5), carrier.id).pos).toEqual({ x: 1.5, y: 0.5 });
    expect(unitOf(observe(r, 1), carrier.id).pos).toEqual({ x: 2.5, y: 0.5 });
    expect(unitOf(observe(r, 1), carrier.id).wheelTurns).toBe(2);
  });

  it("a new leg resets progress without faking motion (k clamps to 0)", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 2, unloadTicks: 0 });
    step(r, 1); // t1 dispatch
    step(r, 1); // t2 loadRemaining 2
    step(r, 1); // t3 loadRemaining 1
    const loaded = step(r, 1); // t4 load complete, new leg progress 0
    const unit = unitOf(loaded, carrier.id);
    expect(unit.cargo).toBe(12);
    expect(unit.moving).toBe(false);
    expect(unit.pos).toEqual({ x: 0.5, y: 0.5 });
    expect(unit.wheelTurns).toBe(0);
    for (const phase of [0, 0.5, 1]) {
      expect(unitOf(observe(r, phase), carrier.id).pos).toEqual({ x: 0.5, y: 0.5 });
    }
  });

  it("reduced motion is discrete: cell-centre positions, full lift, integer wheels", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    const carrier = carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 3, unloadTicks: 3 });
    step(r, 1);
    const loading = step(r, 0, true); // t2 load window
    const lu = unitOf(loading, carrier.id);
    expect(lu.stage).toBe("load");
    expect(lu.lift).toBe(1);
    const a = observe(r, 0.13, true);
    const b = observe(r, 0.87, true);
    expect(a.units).toEqual(b.units); // phase cannot move a reduced-motion frame
    for (let t = 3; t <= 12; t += 1) {
      const frame = step(r, 0.4, true);
      for (const unit of frame.units) {
        expect(unit.pos).toEqual({ x: unit.cell.x + 0.5, y: unit.cell.y + 0.5 });
        expect(Number.isInteger(unit.wheelTurns)).toBe(true);
        if (unit.stage === "load" || unit.stage === "unload") expect(unit.lift).toBe(1);
      }
      expectCargoBound(r, frame);
    }
    expectConserved(r);
  });

  it("never mutates the ledgers, the traffic runtime or the input memory", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    carrierAt(r, c(0, 0));
    job(r, "j1", 12);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 2, unloadTicks: 2 });
    step(r, 1);
    step(r, 1);
    const logBefore = logisticsFingerprint(r.log);
    const trafficBefore = trafficFingerprint(r.traffic);
    deepFreeze(r.log);
    deepFreeze(r.traffic);
    deepFreeze(r.memory);
    const out = deriveFleetFrame(r.log, r.traffic, r.memory, 0.5, false);
    expect(out.frame.units).toHaveLength(1);
    expect(out.memory).not.toBe(r.memory);
    expect(logisticsFingerprint(r.log)).toBe(logBefore);
    expect(trafficFingerprint(r.traffic)).toBe(trafficBefore);
    expectConserved(r);
  });
});
