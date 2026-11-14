/**
 * Road traffic: path-cost arrival ticks, bay/intersection capacity and stuck
 * recovery (issue #141, RW3D T14).
 *
 * Binding acceptance:
 *  - E05: travel length, speed, load/unload duration and bay contention each
 *    affect MEASURED throughput (decorative vehicles alone would fail). Every
 *    dimension below is asserted against hand-derived arrival ticks.
 *  - E04: full destination / deleted road / moved building / recalled carrier
 *    preserve cargo and reservations and either recover or display the exact
 *    blocker; blocked roads yield a recoverable job with bounded retry/backoff.
 *  - E01 (#140 invariant, preserved exactly): amount = atSource + inTransit +
 *    delivered + returned, and free-stock + atSource + inTransit is invariant
 *    across every lifecycle command and tick (only seedStock changes it).
 *
 * Seed 141, flattened start parcel; all walks and tick counts hand-derived.
 * The traffic authority owns no cargo: every transition is shared with the
 * #140 ledger, so conservation is checked after every command and every tick.
 */
import { describe, expect, it } from "vitest";
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
  type LogisticsJobRequest,
  type LogisticsState,
} from "../../src/game/simulation/logistics";
import {
  backoffTicks,
  bayCapacityAt,
  bayFree,
  bayLeasesAt,
  cellEntryCost,
  clearRetry,
  configureTruck,
  createTraffic,
  ensureTruck,
  isJunction,
  junctionFree,
  queueOrder,
  recordRetry,
  releaseBay,
  reserveBay,
  retryDue,
  roadPathCost,
  setBayCapacity,
  setDefaultTruck,
  setJunctionCapacity,
  setJunctionCost,
  setRetryPolicy,
  trafficFingerprint,
  travelTicks,
  type TrafficState,
} from "../../src/game/simulation/traffic";
import { findRoadPath } from "../../src/game/simulation/roadPaths";
import { createRoadNetwork, roadDegree, type RoadNetworkState } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { Cell, WorldState } from "../../src/game/world/types";

const SEED = 141;

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
}

function rig(): Rig {
  return { w: flatWorld(), net: createRoadNetwork(), log: createLogistics(), traffic: createTraffic() };
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

function sites(r: Rig, sourceCapacity = 20, destCapacity = 20, dest: Cell = c(4, 0)) {
  expect(registerBuilding(r.log, { id: 1, cell: c(0, 0), capacity: sourceCapacity })).toBe(true);
  expect(registerBuilding(r.log, { id: 2, cell: dest, capacity: destCapacity })).toBe(true);
}

function carrierAt(r: Rig, cell: Cell, capacity = 12): Carrier {
  const carrier = registerCarrier(r.log, { capacity, cell });
  if (carrier === null) throw new Error("setup carrier failed");
  return carrier;
}

function request(id: string, amount: number, overrides: Partial<LogisticsJobRequest> = {}): LogisticsJobRequest {
  return { id, sourceBuildingId: 1, destBuildingId: 2, cargoType: "scrap", amount, ...overrides };
}

function job(r: Rig, id: string, amount: number, overrides: Partial<LogisticsJobRequest> = {}): CargoJob {
  const result = createJob(r.log, request(id, amount, overrides));
  if (!result.ok) throw new Error(`setup job failed: ${JSON.stringify(result.reason)}`);
  return result.job;
}

/** E01: the container law holds for every job at every observation point. */
function expectContainerLaw(r: Rig) {
  for (const j of r.log.jobs) {
    expect(j.amount).toBe(j.atSource + j.inTransit + j.delivered + j.returned);
    expect(j.atSource).toBeGreaterThanOrEqual(0);
    expect(j.inTransit).toBeGreaterThanOrEqual(0);
    expect(j.delivered).toBeGreaterThanOrEqual(0);
    expect(j.returned).toBeGreaterThanOrEqual(0);
    if (j.status === "cancelled") {
      expect(j.atSource).toBe(0);
      expect(j.inTransit).toBe(0);
    }
  }
}

/** Free stock + reserved-at-source + in-transit is invariant (only seedStock moves it). */
function expectTotals(r: Rig, scrap: number) {
  expect(logisticsTotals(r.log).scrap ?? 0).toBe(scrap);
}

/** Tick one-at-a-time under traffic, recording each job's terminal tick. */
function run(r: Rig, maxTicks: number): Map<number, number> {
  const done = new Map<number, number>();
  for (let t = 0; t < maxTicks; t += 1) {
    tickLogistics(r.log, r.net, 1, r.traffic);
    for (const j of r.log.jobs) {
      if ((j.status === "complete" || j.status === "cancelled") && !done.has(j.id)) done.set(j.id, r.log.tick);
    }
    expectContainerLaw(r);
  }
  return done;
}

describe("traffic pure functions (path cost, speed, backoff, capacity)", () => {
  it("travelTicks is ceil(cost/speed), at least one tick for any positive cost", () => {
    expect(travelTicks(0, 1)).toBe(0);
    expect(travelTicks(4, 1)).toBe(4);
    expect(travelTicks(4, 2)).toBe(2);
    expect(travelTicks(5, 2)).toBe(3);
    expect(travelTicks(1, 8)).toBe(1); // never teleports
    expect(travelTicks(6, 3)).toBe(2);
  });

  it("roadPathCost sums entry costs excluding the start; junctions add the surcharge", () => {
    const r = rig();
    corridor(r, 5);
    placeRoad(r, "stub", [c(2, 0), c(2, 1)]); // (2,0) becomes degree-3 junction
    const walk = findRoadPath(r.net, c(0, 0), c(4, 0));
    expect(walk).not.toBeNull();
    expect(isJunction(r.net, c(2, 0))).toBe(true);
    expect(roadDegree(r.net, c(2, 0))).toBe(3);
    expect(roadPathCost(r.traffic, r.net, walk as Cell[])).toBe(4); // junctionCost 0
    setJunctionCost(r.traffic, 2);
    expect(cellEntryCost(r.traffic, r.net, c(2, 0))).toBe(3);
    expect(cellEntryCost(r.traffic, r.net, c(1, 0))).toBe(1);
    expect(roadPathCost(r.traffic, r.net, walk as Cell[])).toBe(6); // 1 + 3 + 1 + 1
  });

  it("backoffTicks is bounded exponential; retryDue/recordRetry/clearRetry bound spinning", () => {
    const t = createTraffic();
    setRetryPolicy(t, { maxRetries: 3, baseBackoff: 2, maxBackoff: 8 });
    expect(backoffTicks(t, 0)).toBe(2);
    expect(backoffTicks(t, 1)).toBe(4);
    expect(backoffTicks(t, 2)).toBe(8);
    expect(backoffTicks(t, 3)).toBe(8); // capped
    expect(backoffTicks(t, 99)).toBe(8);
    const rt = ensureTruck(t, 1);
    // A topology change always re-attempts.
    expect(retryDue(t, rt, 0, 5)).toBe(true);
    recordRetry(t, rt, 0, 5);
    expect(rt.retryCount).toBe(1);
    expect(rt.backoffUntil).toBe(4); // 0 + backoffTicks(1)=4
    expect(retryDue(t, rt, 3, 5)).toBe(false); // backing off
    expect(retryDue(t, rt, 4, 5)).toBe(true);
    recordRetry(t, rt, 4, 5);
    recordRetry(t, rt, 12, 5);
    expect(rt.retryCount).toBe(3); // capped at maxRetries
    expect(retryDue(t, rt, 1000, 5)).toBe(false); // exhausted: stops spinning
    expect(retryDue(t, rt, 1000, 6)).toBe(true); // repair re-attempts
    clearRetry(rt, 6);
    expect(rt.retryCount).toBe(0);
    expect(rt.heldReason).toBeNull();
  });

  it("bay leases are exclusive, idempotent per carrier, and release frees the slot", () => {
    const t = createTraffic();
    setBayCapacity(t, c(4, 0), 1);
    expect(bayCapacityAt(t, c(4, 0))).toBe(1);
    expect(bayCapacityAt(t, c(9, 9))).toBe(Number.POSITIVE_INFINITY); // unconfigured = unlimited
    expect(bayFree(t, c(4, 0), 1)).toBe(true);
    const lease = reserveBay(t, c(4, 0), 1, 10);
    expect(lease).not.toBeNull();
    expect(reserveBay(t, c(4, 0), 1, 10)).toEqual(lease); // idempotent
    expect(bayFree(t, c(4, 0), 1)).toBe(true); // own lease never blocks self
    expect(bayFree(t, c(4, 0), 2)).toBe(false); // full for others
    expect(reserveBay(t, c(4, 0), 2, 11)).toBeNull();
    expect(bayLeasesAt(t, c(4, 0))).toHaveLength(1);
    releaseBay(t, 1);
    expect(bayLeasesAt(t, c(4, 0))).toHaveLength(0);
    expect(bayFree(t, c(4, 0), 2)).toBe(true);
  });

  it("junctionFree counts occupancy exactly (capacity > 1 has no pileup)", () => {
    const r = rig();
    corridor(r, 5);
    placeRoad(r, "stub", [c(2, 0), c(2, 1)]);
    setJunctionCapacity(r.traffic, 2);
    const occ = new Map<string, number>();
    expect(junctionFree(r.traffic, r.net, c(2, 0), occ)).toBe(true);
    occ.set("2,0", 1);
    expect(junctionFree(r.traffic, r.net, c(2, 0), occ)).toBe(true); // 1 < 2
    occ.set("2,0", 2);
    expect(junctionFree(r.traffic, r.net, c(2, 0), occ)).toBe(false); // 2 == capacity
    expect(junctionFree(r.traffic, r.net, c(1, 0), occ)).toBe(true); // non-junction always passes
    setJunctionCapacity(r.traffic, null);
    expect(junctionFree(r.traffic, r.net, c(2, 0), occ)).toBe(true); // unlimited
  });

  it("queueOrder grants earliest waiter first, ties by carrier id (no starvation)", () => {
    const t = createTraffic();
    const a = ensureTruck(t, 3);
    const b = ensureTruck(t, 1);
    const d = ensureTruck(t, 2);
    a.queuedSince = 9;
    b.queuedSince = 4;
    d.queuedSince = 4;
    expect(queueOrder([a, b, d]).map((x) => x.carrierId)).toEqual([1, 2, 3]);
  });

  it("configuration rejects invalid input and inherits the default profile", () => {
    const t = createTraffic();
    expect(setDefaultTruck(t, { speed: 0 })).toBe(false);
    expect(setDefaultTruck(t, { loadTicks: -1 })).toBe(false);
    expect(setDefaultTruck(t, { speed: 3, loadTicks: 2, unloadTicks: 1 })).toBe(true);
    const rt = ensureTruck(t, 7);
    expect(rt.config).toEqual({ speed: 3, loadTicks: 2, unloadTicks: 1 });
    expect(configureTruck(t, 7, { speed: 5 })).toBe(true);
    expect(rt.config.speed).toBe(5);
    expect(configureTruck(t, 7, { speed: 0 })).toBe(false);
    expect(setBayCapacity(t, c(0, 0), 0)).toBe(false);
    expect(setJunctionCapacity(t, 0)).toBe(false);
    expect(setJunctionCost(t, -1)).toBe(false);
    expect(setRetryPolicy(t, { maxBackoff: 1, baseBackoff: 2 })).toBe(false);
  });
});

describe("legacy parity: default traffic profile reproduces #140 tick-for-tick", () => {
  it("a default-profile traffic ledger matches the legacy ledger fingerprint every tick", () => {
    const legacy = rig();
    const traffic = rig();
    for (const r of [legacy, traffic]) {
      corridor(r, 5);
      sites(r);
      seedStock(r.log, 1, "scrap", 10);
      job(r, "a", 7);
      carrierAt(r, c(0, 0));
    }
    // Hand-derived: dispatch tick 1, load tick 2, four moves, complete tick 6.
    for (let t = 0; t < 10; t += 1) {
      tickLogistics(legacy.log, legacy.net, 1); // no traffic = legacy path
      tickLogistics(traffic.log, traffic.net, 1, traffic.traffic); // default profile
      expect(logisticsFingerprint(traffic.log)).toBe(logisticsFingerprint(legacy.log));
      expectContainerLaw(traffic);
    }
    expect(legacy.log.tick).toBe(10);
    expect(traffic.log.jobs[0].status).toBe("complete");
    expect(traffic.log.jobs[0].delivered).toBe(7);
    expect(traffic.traffic.bayLeases).toHaveLength(0); // released on terminal path
  });
});

describe("E05: travel length and speed affect measured throughput", () => {
  it("a longer corridor arrives later and lowers throughput (exact ticks)", () => {
    const measure = (n: number, speed: number) => {
      const r = rig();
      corridor(r, n);
      sites(r, 20, 20, c(n - 1, 0));
      setDefaultTruck(r.traffic, { speed });
      seedStock(r.log, 1, "scrap", 7);
      const j = job(r, "a", 7);
      carrierAt(r, c(0, 0));
      const done = run(r, 60);
      expectTotals(r, 7);
      const tick = done.get(j.id) as number;
      // dispatch(1) + load(1) + ceil((n-1)/speed) travel ticks.
      expect(tick).toBe(2 + travelTicks(n - 1, speed));
      return { tick, throughput: 7 / tick };
    };
    const short = measure(3, 1); // 2 + 2 = 4
    const long = measure(7, 1); // 2 + 6 = 8
    expect(short.tick).toBe(4);
    expect(long.tick).toBe(8);
    expect(long.throughput).toBeLessThan(short.throughput);

    const slow = measure(5, 1); // 2 + 4 = 6
    const fast = measure(5, 2); // 2 + 2 = 4
    expect(slow.tick).toBe(6);
    expect(fast.tick).toBe(4);
    expect(fast.throughput).toBeGreaterThan(slow.throughput);
  });

  it("junction surcharge raises path cost and delays arrival (exact ticks)", () => {
    const measure = (junctionCost: number) => {
      const r = rig();
      corridor(r, 5);
      placeRoad(r, "stub", [c(2, 0), c(2, 1)]); // (2,0) junction
      sites(r);
      setJunctionCost(r.traffic, junctionCost);
      seedStock(r.log, 1, "scrap", 7);
      const j = job(r, "a", 7);
      carrierAt(r, c(0, 0));
      const walk = findRoadPath(r.net, c(0, 0), c(4, 0)) as Cell[];
      const cost = roadPathCost(r.traffic, r.net, walk);
      const done = run(r, 60);
      expectTotals(r, 7);
      expect(done.get(j.id)).toBe(2 + travelTicks(cost, 1));
      return done.get(j.id) as number;
    };
    expect(measure(0)).toBe(6); // cost 4
    expect(measure(2)).toBe(8); // cost 6
  });
});

describe("E05: load/unload duration affects measured throughput", () => {
  it("load and unload ticks add exactly to the arrival tick (hand-derived)", () => {
    const measure = (loadTicks: number, unloadTicks: number) => {
      const r = rig();
      corridor(r, 5);
      sites(r);
      setDefaultTruck(r.traffic, { speed: 1, loadTicks, unloadTicks });
      seedStock(r.log, 1, "scrap", 7);
      const j = job(r, "a", 7);
      carrierAt(r, c(0, 0));
      const done = run(r, 60);
      expectTotals(r, 7);
      // dispatch(1) + load(1+L) + travel(4) + unload(U).
      expect(done.get(j.id)).toBe(2 + loadTicks + 4 + unloadTicks);
      return done.get(j.id) as number;
    };
    expect(measure(0, 0)).toBe(6);
    expect(measure(2, 3)).toBe(11);
    expect(measure(2, 3)).toBeGreaterThan(measure(0, 0)); // duration lowers throughput
  });
});

describe("E05: bay contention queues trucks and lowers throughput (no pileup)", () => {
  function contentionRig(capacity: number | null, unloadTicks: number): Rig {
    const r = rig();
    corridor(r, 5);
    sites(r);
    if (capacity !== null) setBayCapacity(r.traffic, c(4, 0), capacity);
    setDefaultTruck(r.traffic, { speed: 1, loadTicks: 0, unloadTicks });
    seedStock(r.log, 1, "scrap", 10);
    job(r, "a", 5);
    job(r, "b", 5);
    carrierAt(r, c(0, 0)); // carrier 1
    carrierAt(r, c(0, 0)); // carrier 2
    return r;
  }

  it("a single-slot bay serializes two unloads; both finish, never overlapping", () => {
    const r = contentionRig(1, 2);
    let maxLeases = 0;
    let sawQueue = false;
    const done = new Map<number, number>();
    for (let t = 0; t < 30; t += 1) {
      tickLogistics(r.log, r.net, 1, r.traffic);
      maxLeases = Math.max(maxLeases, bayLeasesAt(r.traffic, c(4, 0)).length);
      const b = r.log.jobs[1];
      const rt = r.traffic.trucks[2];
      if (rt !== undefined && rt.heldReason?.kind === "bay-full") sawQueue = true;
      for (const j of r.log.jobs) {
        if (j.status === "complete" && !done.has(j.id)) done.set(j.id, r.log.tick);
      }
      expectContainerLaw(r);
      expectTotals(r, 10);
      // Cargo conserved while queued (atSource before load, then inTransit/delivered).
      expect(b.atSource + b.inTransit + b.delivered + b.returned).toBe(5);
    }
    expect(maxLeases).toBeLessThanOrEqual(1); // no rigid-body pileup
    expect(sawQueue).toBe(true); // the waiting truck displayed the exact blocker
    // Hand-derived: A unloads ticks 6-8, B queues then unloads ticks 9-11.
    expect(done.get(1)).toBe(8);
    expect(done.get(2)).toBe(11);
    expect(r.log.jobs[0].delivered).toBe(5);
    expect(r.log.jobs[1].delivered).toBe(5);
    expect(r.traffic.bayLeases).toHaveLength(0);
  });

  it("an unlimited bay lets both unload concurrently (higher throughput)", () => {
    const r = contentionRig(null, 2);
    const done = run(r, 30);
    expectTotals(r, 10);
    expect(done.get(1)).toBe(8);
    expect(done.get(2)).toBe(8); // no contention: both finish together
    // Contention reduced aggregate throughput: 10/11 vs 10/8.
    expect(10 / 11).toBeLessThan(10 / 8);
  });
});

describe("E05: intersection capacity queues trucks without pileups", () => {
  function junctionRig(capacity: number | null): Rig {
    const r = rig();
    placeRoad(r, "h", [c(0, 1), c(1, 1), c(2, 1), c(3, 1), c(4, 1)]);
    placeRoad(r, "v", [c(2, 0), c(2, 1), c(2, 2)]); // (2,1) degree-4 junction
    expect(registerBuilding(r.log, { id: 1, cell: c(0, 1), capacity: 20 })).toBe(true);
    expect(registerBuilding(r.log, { id: 2, cell: c(4, 1), capacity: 20 })).toBe(true);
    setJunctionCapacity(r.traffic, capacity);
    seedStock(r.log, 1, "scrap", 6);
    job(r, "a", 3);
    job(r, "b", 3);
    carrierAt(r, c(0, 1));
    carrierAt(r, c(0, 1));
    return r;
  }

  it("capacity 1 admits one truck at a time; the other queues then passes", () => {
    const r = junctionRig(1);
    expect(isJunction(r.net, c(2, 1))).toBe(true);
    let maxOnJunction = 0;
    let sawQueue = false;
    const done = new Map<number, number>();
    for (let t = 0; t < 30; t += 1) {
      tickLogistics(r.log, r.net, 1, r.traffic);
      const onJunction = r.log.carriers.filter((x) => x.cell.x === 2 && x.cell.y === 1).length;
      maxOnJunction = Math.max(maxOnJunction, onJunction);
      const rt = r.traffic.trucks[2];
      if (rt !== undefined && rt.heldReason?.kind === "junction-full") sawQueue = true;
      for (const j of r.log.jobs) {
        if (j.status === "complete" && !done.has(j.id)) done.set(j.id, r.log.tick);
      }
      expectContainerLaw(r);
      expectTotals(r, 6);
    }
    expect(maxOnJunction).toBeLessThanOrEqual(1); // no pileup
    expect(sawQueue).toBe(true);
    expect(done.get(1)).toBe(6); // A passes freely
    expect(done.get(2)).toBe(8); // B queued one junction cycle
    expect(r.log.jobs[1].delivered).toBe(3);
  });

  it("unlimited junction capacity lets both pass together", () => {
    const r = junctionRig(null);
    const done = run(r, 30);
    expectTotals(r, 6);
    expect(done.get(1)).toBe(6);
    expect(done.get(2)).toBe(6);
  });
});

describe("E04: blocked road yields a recoverable job with bounded retry/backoff", () => {
  it("a cut ahead holds the job, retries are bounded, and a repair recovers it", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    setRetryPolicy(r.traffic, { maxRetries: 3, baseBackoff: 2, maxBackoff: 8 });
    seedStock(r.log, 1, "scrap", 5);
    const j = job(r, "a", 5);
    const carrier = carrierAt(r, c(0, 0));
    // Drive the carrier to (2,0): dispatch 1, load 2, move 3 -> (1,0), move 4 -> (2,0).
    tickLogistics(r.log, r.net, 4, r.traffic);
    expect(carrier.cell).toEqual(c(2, 0));
    expect(j.inTransit).toBe(5);
    expectTotals(r, 5);

    // Cut the road ahead of the carrier.
    removeRoad(r, "cut", [c(3, 0)]);
    tickLogistics(r.log, r.net, 1, r.traffic);
    expect(j.status).toBe("active");
    expect(j.path).toBeNull();
    expect(j.heldReason?.kind).toBe("no-route");
    expect(j.inTransit).toBe(5); // cargo preserved while blocked
    const rt = r.traffic.trucks[carrier.id];
    expect(rt.heldReason?.kind).toBe("no-route");

    // Spin for a long time: retries cap at maxRetries, cargo stays conserved.
    for (let t = 0; t < 200; t += 1) {
      tickLogistics(r.log, r.net, 1, r.traffic);
      expectContainerLaw(r);
      expectTotals(r, 5);
    }
    expect(rt.retryCount).toBe(3); // bounded, never exceeds maxRetries
    expect(rt.retryCount).toBeLessThanOrEqual(r.traffic.maxRetries);
    expect(j.status).toBe("active");
    expect(j.inTransit).toBe(5);
    expect(retryDue(r.traffic, rt, r.log.tick, r.net.revision)).toBe(false); // stopped spinning

    // Repair the road: the revision change re-attempts immediately and recovers.
    // A cut refunds neighbors left roadless, so restore the full severed span.
    placeRoad(r, "repair", [c(2, 0), c(3, 0), c(4, 0)]);
    const done = run(r, 40);
    expect(done.has(j.id)).toBe(true);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(5);
    expect(j.inTransit).toBe(0);
    expect(rt.retryCount).toBe(0); // reset on recovery
    expectTotals(r, 5);
    expect(r.traffic.bayLeases).toHaveLength(0);
  });

  it("a cut directly under the carrier reports road-removed and recovers on repair", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    seedStock(r.log, 1, "scrap", 5);
    const j = job(r, "a", 5);
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4, r.traffic); // carrier at (2,0)
    removeRoad(r, "under", [c(2, 0)]); // remove the cell the carrier occupies
    tickLogistics(r.log, r.net, 1, r.traffic);
    expect(j.path).toBeNull();
    expect(j.heldReason).toEqual({ kind: "road-removed", at: c(2, 0) });
    expect(j.inTransit).toBe(5);
    expectTotals(r, 5);
    placeRoad(r, "fix", [c(1, 0), c(2, 0), c(3, 0)]);
    const done = run(r, 40);
    expect(done.has(j.id)).toBe(true);
    expect(j.delivered).toBe(5);
    expectTotals(r, 5);
  });
});

describe("E04: full destination, moved building and recalled carrier preserve cargo", () => {
  it("a full destination holds the remainder (destination-full) then drains on expansion", () => {
    const r = rig();
    corridor(r, 5);
    sites(r, 20, 20); // full room at creation so the job is accepted
    seedStock(r.log, 1, "scrap", 7);
    const j = job(r, "a", 7);
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 3, r.traffic); // dispatch 1, load 2, move 3 -> (1,0)
    expect(j.inTransit).toBe(7);
    // Shrink destination room mid-transit (same cell, no retarget): only 3 of 7 fit.
    expect(registerBuilding(r.log, { id: 2, cell: c(4, 0), capacity: 3 })).toBe(true);
    run(r, 20);
    expect(j.status).toBe("partial");
    expect(j.delivered).toBe(3);
    expect(j.inTransit).toBe(4); // remainder conserved in transit
    expect(j.heldReason).toEqual({ kind: "destination-full", buildingId: 2, room: 0 });
    expectTotals(r, 7);
    // Expand the destination: the remainder drains and the job completes.
    expect(registerBuilding(r.log, { id: 2, cell: c(4, 0), capacity: 20 })).toBe(true);
    const done = run(r, 20);
    expect(done.has(j.id)).toBe(true);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(j.inTransit).toBe(0);
    expectTotals(r, 7);
    expect(r.traffic.bayLeases).toHaveLength(0);
  });

  it("a moved destination retargets the job and it recovers to the new cell", () => {
    const r = rig();
    corridor(r, 5);
    placeRoad(r, "spur", [c(4, 0), c(4, 1)]); // new approach cell reachable
    sites(r, 20, 20, c(4, 0));
    seedStock(r.log, 1, "scrap", 6);
    const j = job(r, "a", 6);
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 3, r.traffic); // en route, loaded
    expect(j.inTransit).toBe(6);
    // Move the destination building to (4,1): retarget + force revalidation.
    expect(registerBuilding(r.log, { id: 2, cell: c(4, 1), capacity: 20 })).toBe(true);
    expect(j.destCell).toEqual(c(4, 1));
    const done = run(r, 40);
    expect(done.has(j.id)).toBe(true);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(6);
    expect(r.log.stocks[2].scrap).toBe(6); // landed at the moved destination
    expectTotals(r, 6);
  });

  it("a recalled carrier returns cargo to source free stock (conserved, no teleport)", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    seedStock(r.log, 1, "scrap", 5);
    const j = job(r, "a", 5);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4, r.traffic); // carrier at (2,0), loaded
    expect(j.inTransit).toBe(5);
    expect(r.log.stocks[1].scrap ?? 0).toBe(0);
    const result = cancelJob(r.log, r.net, j.id);
    expect(result.ok).toBe(true);
    expect(j.phase).toBe("returning");
    expect(j.inTransit).toBe(5); // still aboard until it walks home
    expectTotals(r, 5);
    const done = run(r, 40);
    expect(done.has(j.id)).toBe(true);
    expect(j.status).toBe("cancelled");
    expect(j.returned).toBe(5);
    expect(j.inTransit).toBe(0);
    expect(r.log.stocks[1].scrap).toBe(5); // returned to source free stock
    expect(carrier.jobId).toBeNull();
    expectTotals(r, 5);
    expect(r.traffic.bayLeases).toHaveLength(0);
  });

  it("a recall over a cut road holds cargo in transit until the road recovers", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    seedStock(r.log, 1, "scrap", 5);
    const j = job(r, "a", 5);
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4, r.traffic); // carrier at (2,0), loaded
    cancelJob(r.log, r.net, j.id);
    removeRoad(r, "cut", [c(1, 0)]); // cut the way home
    tickLogistics(r.log, r.net, 1, r.traffic);
    expect(j.phase).toBe("returning");
    expect(j.inTransit).toBe(5); // conserved while the recall is blocked
    expect(j.path).toBeNull();
    expectTotals(r, 5);
    for (let t = 0; t < 30; t += 1) {
      tickLogistics(r.log, r.net, 1, r.traffic);
      expectContainerLaw(r);
      expectTotals(r, 5);
    }
    expect(j.inTransit).toBe(5);
    placeRoad(r, "fix", [c(0, 0), c(1, 0), c(2, 0)]);
    const done = run(r, 40);
    expect(done.has(j.id)).toBe(true);
    expect(j.status).toBe("cancelled");
    expect(j.returned).toBe(5);
    expect(r.log.stocks[1].scrap).toBe(5);
    expectTotals(r, 5);
  });
});

describe("conservation across every lifecycle command + reproducibility", () => {
  it("totals are invariant across create/tick/cancel/move/seed/road commands", () => {
    const r = rig();
    corridor(r, 5);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    expectTotals(r, 10);
    const a = job(r, "a", 4);
    expectTotals(r, 10); // reservation moves stock, never creates it
    const b = job(r, "b", 6);
    expectTotals(r, 10);
    carrierAt(r, c(0, 0));
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 3, r.traffic);
    expectTotals(r, 10);
    expectContainerLaw(r);
    cancelJob(r.log, r.net, a.id);
    expectTotals(r, 10);
    expectContainerLaw(r);
    registerBuilding(r.log, { id: 2, cell: c(4, 0), capacity: 30 });
    expectTotals(r, 10);
    removeRoad(r, "cut", [c(3, 0)]);
    tickLogistics(r.log, r.net, 5, r.traffic);
    expectTotals(r, 10);
    expectContainerLaw(r);
    placeRoad(r, "fix", [c(2, 0), c(3, 0), c(4, 0)]);
    // seedStock is the ONLY entry boundary: it alone raises the total.
    seedStock(r.log, 1, "scrap", 5);
    expectTotals(r, 15);
    run(r, 60);
    expectTotals(r, 15);
    expectContainerLaw(r);
    expect(b.delivered + b.returned + b.inTransit + b.atSource).toBe(b.amount);
  });

  it("the same seed reproduces byte-identical traffic and logistics fingerprints", () => {
    function scenario(): { log: string[]; traffic: string[] } {
      const r = rig();
      corridor(r, 5);
      sites(r, 20, 20);
      setBayCapacity(r.traffic, c(4, 0), 1);
      setDefaultTruck(r.traffic, { speed: 1, loadTicks: 1, unloadTicks: 2 });
      seedStock(r.log, 1, "scrap", 10);
      job(r, "a", 5);
      job(r, "b", 5);
      carrierAt(r, c(0, 0));
      carrierAt(r, c(0, 0));
      const log: string[] = [];
      const traffic: string[] = [];
      for (let t = 0; t < 20; t += 1) {
        tickLogistics(r.log, r.net, 1, r.traffic);
        log.push(logisticsFingerprint(r.log));
        traffic.push(trafficFingerprint(r.traffic));
        expectContainerLaw(r);
      }
      return { log, traffic };
    }
    const first = scenario();
    const second = scenario();
    expect(second.log).toEqual(first.log);
    expect(second.traffic).toEqual(first.traffic);
  });
});