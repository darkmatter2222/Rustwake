/**
 * Conserved logistics jobs + reservations (issue #140, RW3D T13).
 * Binding acceptance: E01 (cargo never created/destroyed across the whole
 * lifecycle), E03 (last pallet resolves to exactly one job; fair oldest-first
 * dispatch, no starvation), E04 (full destination / deleted road preserve
 * cargo and report the exact blocker; recovery resumes the job).
 * Seed 140, flattened start parcel fixture; all walks and counts hand-derived.
 */
import { describe, expect, it } from "vitest";
import type { ResourceId } from "../../src/game/content/defs";
import { SAVE_KEY } from "../../src/game/persistence/save";
import {
  buildingUnits,
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
import { createRoadNetwork, type RoadNetworkState } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import { createWorld, terrainIndex } from "../../src/game/world/terrain";
import type { Cell, WorldState } from "../../src/game/world/types";
import { createStore } from "../../src/app/store";

const SEED = 140;

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
}

function rig(): Rig {
  return { w: flatWorld(), net: createRoadNetwork(), log: createLogistics() };
}

function placeRoad(r: Rig, id: string, cells: Cell[]) {
  const result = applyRoadCommand(r.w, r.net, { id, type: "road.place", cells });
  if (!result.ok) throw new Error(`setup road failed: ${JSON.stringify(result.rejection)}`);
  return result;
}

function removeRoad(r: Rig, id: string, cells: Cell[]) {
  const result = applyRoadCommand(r.w, r.net, { id, type: "road.remove", cells });
  if (!result.ok) throw new Error(`setup removal failed: ${JSON.stringify(result.rejection)}`);
  return result;
}

/** Straight five-cell corridor along y = 0: (0,0) .. (4,0). */
function corridor(r: Rig) {
  placeRoad(r, "line", [c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0)]);
}

/** 3x2 rectangle loop: two parallel routes between (0,0) and (2,0). */
function loop(r: Rig) {
  placeRoad(r, "top", [c(0, 0), c(1, 0), c(2, 0)]);
  placeRoad(r, "bottom", [c(0, 1), c(1, 1), c(2, 1)]);
  placeRoad(r, "left", [c(0, 0), c(0, 1)]);
  placeRoad(r, "right", [c(2, 0), c(2, 1)]);
}

/** Source building 1 at (0,0), destination building 2 at (4,0). */
function sites(r: Rig, sourceCapacity = 20, destCapacity = 20) {
  expect(registerBuilding(r.log, { id: 1, cell: c(0, 0), capacity: sourceCapacity })).toBe(true);
  expect(registerBuilding(r.log, { id: 2, cell: c(4, 0), capacity: destCapacity })).toBe(true);
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
      // A settled cancel holds nothing: everything was delivered or returned.
      expect(j.atSource).toBe(0);
      expect(j.inTransit).toBe(0);
    }
  }
}

describe("reservation identity and no double-booking", () => {
  it("issues unique reservation ids, one per job/kind; a carrier serves one job", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const a = job(r, "a", 3);
    const b = job(r, "b", 4);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 1);
    const ids = r.log.reservations.map((reservation) => reservation.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      r.log.reservations.filter((x) => x.jobId === a.id).map((x) => x.kind).sort(),
    ).toEqual(["carrier", "destination", "source"]);
    expect(
      r.log.reservations.filter((x) => x.jobId === b.id).map((x) => x.kind).sort(),
    ).toEqual(["destination", "source"]);
    expect(carrier.jobId).toBe(a.id);
    expect(b.status).toBe("pending");
    expect(b.heldReason).toEqual({ kind: "no-carrier", needCapacity: 4 });
    // Reservation payloads carry the reserved units and the creation tick.
    const source = r.log.reservations.find((x) => x.jobId === a.id && x.kind === "source");
    expect(source).toMatchObject({ buildingId: 1, carrierId: null, resource: "scrap", amount: 3, createdTick: 0 });
    const carrierRes = r.log.reservations.find((x) => x.kind === "carrier");
    expect(carrierRes).toMatchObject({ jobId: a.id, buildingId: null, carrierId: carrier.id, amount: 3 });
  });

  it("E03: the last pallet goes to exactly one job; cancel frees it for a retry", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 1);
    const first = createJob(r.log, request("first", 1));
    const second = createJob(r.log, request("second", 1));
    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      reason: { reason: "insufficient-stock", resource: "scrap", need: 1, have: 0 },
    });
    expect(r.log.stocks[1].scrap).toBe(0);
    expect(r.log.reservations.filter((x) => x.kind === "source")).toHaveLength(1);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 1 });
    if (first.ok) cancelJob(r.log, r.net, first.job.id);
    expect(r.log.stocks[1].scrap).toBe(1);
    expect(r.log.reservations).toHaveLength(0);
    const retry = createJob(r.log, request("retry", 1));
    expect(retry.ok).toBe(true);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 1 });
  });

  it("reserves destination room exclusively against other jobs' intent", () => {
    const r = rig();
    corridor(r);
    sites(r, 20, 5);
    seedStock(r.log, 1, "scrap", 10);
    const a = createJob(r.log, request("a", 3));
    const b = createJob(r.log, request("b", 3));
    expect(a.ok).toBe(true);
    expect(b).toEqual({
      ok: false,
      reason: { reason: "insufficient-room", buildingId: 2, need: 3, have: 2 },
    });
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("a rejected creation changes nothing (byte-identical fingerprint)", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 2);
    const before = logisticsFingerprint(r.log);
    const rejected = createJob(r.log, request("too-big", 3));
    expect(rejected.ok).toBe(false);
    expect(logisticsFingerprint(r.log)).toBe(before);
  });

  it("rejects invalid requests with stable typed reasons", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    expect(createJob(r.log, request("zero", 0))).toEqual({
      ok: false,
      reason: { reason: "invalid-amount", amount: 0 },
    });
    expect(createJob(r.log, request("frac", 1.5))).toEqual({
      ok: false,
      reason: { reason: "invalid-amount", amount: 1.5 },
    });
    expect(createJob(r.log, request("bad-res", 1, { cargoType: "unobtainium" as ResourceId }))).toEqual({
      ok: false,
      reason: { reason: "invalid-resource", resource: "unobtainium" },
    });
    expect(createJob(r.log, request("bad-src", 1, { sourceBuildingId: 0 }))).toEqual({
      ok: false,
      reason: { reason: "invalid-building", buildingId: 0 },
    });
    expect(createJob(r.log, request("unknown", 1, { destBuildingId: 99 }))).toEqual({
      ok: false,
      reason: { reason: "unknown-building", buildingId: 99 },
    });
    expect(createJob(r.log, request("same", 1, { destBuildingId: 1 }))).toEqual({
      ok: false,
      reason: { reason: "same-building" },
    });
    expect(createJob(r.log, request("prio", 1, { priority: 0.5 }))).toEqual({
      ok: false,
      reason: { reason: "invalid-priority", priority: 0.5 },
    });
    expect(registerBuilding(r.log, { id: 3, cell: c(0, 0), capacity: 5 })).toBe(true);
    expect(createJob(r.log, request("co-located", 1, { destBuildingId: 3 }))).toEqual({
      ok: false,
      reason: { reason: "same-location" },
    });
    expect(r.log.jobs).toHaveLength(0);
    expect(r.log.reservations).toHaveLength(0);
  });
});

describe("conserved lifecycle (E01)", () => {
  it("create -> reserve -> dispatch -> load -> travel -> unload with exact counts", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    expect(r.log.stocks[1].scrap).toBe(3);
    expect(j.atSource).toBe(7);
    expect(j.inTransit).toBe(0);
    expect(j.delivered).toBe(0);
    expect(j.status).toBe("pending");
    expect(j.phase).toBe("waiting");
    expect(j.createdTick).toBe(0);
    expect(j.reservedAt).toBe(0);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });

    tickLogistics(r.log, r.net, 1); // dispatch: trivial walk to the source cell
    expect(j.status).toBe("active");
    expect(j.phase).toBe("to-source");
    expect(j.carrierId).toBe(carrier.id);
    expect(carrier.jobId).toBe(j.id);
    expect(j.path).toEqual([c(0, 0)]);
    expect(j.atSource).toBe(7);

    tickLogistics(r.log, r.net, 1); // arrive source: load, start the delivery leg
    expect(j.phase).toBe("to-dest");
    expect(j.atSource).toBe(0);
    expect(j.inTransit).toBe(7);
    expect(j.path).toEqual([c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0)]);
    expect(carrier.cell).toEqual(c(0, 0));
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    expectContainerLaw(r);

    const legs: Array<[number, Cell]> = [[3, c(1, 0)], [4, c(2, 0)], [5, c(3, 0)]];
    for (const [tick, cell] of legs) {
      tickLogistics(r.log, r.net, 1);
      expect(r.log.tick).toBe(tick);
      expect(carrier.cell).toEqual(cell);
      expect(j.inTransit).toBe(7);
      expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
      expectContainerLaw(r);
    }

    tickLogistics(r.log, r.net, 1); // tick 6: arrive destination, unload, settle
    expect(j.status).toBe("complete");
    expect(j.phase).toBe("done");
    expect(j.delivered).toBe(7);
    expect(j.inTransit).toBe(0);
    expect(r.log.stocks[1].scrap).toBe(3);
    expect(r.log.stocks[2].scrap).toBe(7);
    expect(buildingUnits(r.log, 2)).toBe(7);
    expect(carrier.jobId).toBeNull();
    expect(carrier.cell).toEqual(c(4, 0));
    expect(r.log.reservations).toHaveLength(0);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    expectContainerLaw(r);
  });

  it("creation replay is idempotent; cancel replay returns cargo exactly once", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const first = createJob(r.log, request("haul", 7));
    expect(first.ok).toBe(true);
    const before = logisticsFingerprint(r.log);
    const replay = createJob(r.log, request("haul", 7));
    expect(replay.ok).toBe(true);
    if (replay.ok && first.ok) {
      expect(replay.replayed).toBe(true);
      expect(replay.job.id).toBe(first.job.id);
    }
    expect(logisticsFingerprint(r.log)).toBe(before);
    expect(r.log.stocks[1].scrap).toBe(3); // deducted once, not twice
    expect(r.log.reservations).toHaveLength(2);

    cancelJob(r.log, r.net, 1);
    expect(r.log.stocks[1].scrap).toBe(10);
    const afterCancel = logisticsFingerprint(r.log);
    const again = cancelJob(r.log, r.net, 1);
    expect(again.ok).toBe(true);
    expect(logisticsFingerprint(r.log)).toBe(afterCancel);
    expect(r.log.stocks[1].scrap).toBe(10);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("seedStock is the only entry boundary; invalid setups are refused", () => {
    const r = rig();
    corridor(r);
    sites(r);
    expect(seedStock(r.log, 99, "scrap", 5)).toBe(false); // unknown building
    expect(seedStock(r.log, 1, "scrap", 0)).toBe(false);
    expect(seedStock(r.log, 1, "scrap", 1.5)).toBe(false);
    expect(seedStock(r.log, 1, "unobtainium" as ResourceId, 5)).toBe(false);
    expect(registerCarrier(r.log, { capacity: 0, cell: c(0, 0) })).toBeNull();
    expect(registerBuilding(r.log, { id: 0, cell: c(0, 0), capacity: 5 })).toBe(false);
    expect(registerBuilding(r.log, { id: 5, cell: c(0, 0), capacity: -1 })).toBe(false);
    expect(logisticsTotals(r.log)).toEqual({});
    expect(seedStock(r.log, 1, "scrap", 5)).toBe(true);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 5 });
  });
});

describe("partial unload and full destination (E04)", () => {
  it("partial unload retains the remainder; draining the destination resumes it", () => {
    const r = rig();
    corridor(r);
    sites(r, 40, 20);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7); // room 20 reserved at creation
    seedStock(r.log, 2, "scrap", 15); // external deposit AFTER reservation
    const hauler = carrierAt(r, c(0, 0));
    const totals = { scrap: 25 };
    expect(logisticsTotals(r.log)).toEqual(totals);

    tickLogistics(r.log, r.net, 6); // dispatch, load, travel, arrive: only 5 fit
    expect(j.status).toBe("partial");
    expect(j.delivered).toBe(5);
    expect(j.inTransit).toBe(2);
    expect(j.atSource).toBe(0);
    expect(j.heldReason).toEqual({ kind: "destination-full", buildingId: 2, room: 0 });
    expect(r.log.stocks[2].scrap).toBe(20);
    expect(hauler.cell).toEqual(c(4, 0));
    expect(logisticsTotals(r.log)).toEqual(totals);
    expectContainerLaw(r);

    tickLogistics(r.log, r.net, 3); // still full: nothing moves, nothing is lost
    expect(j.status).toBe("partial");
    expect(j.inTransit).toBe(2);
    expect(hauler.cell).toEqual(c(4, 0));
    expect(logisticsTotals(r.log)).toEqual(totals);

    // Recovery: haul 15 units of the blocking stock back out.
    const drain = createJob(r.log, { id: "drain", sourceBuildingId: 2, destBuildingId: 1, cargoType: "scrap", amount: 15 });
    expect(drain.ok).toBe(true);
    carrierAt(r, c(4, 0), 20);
    tickLogistics(r.log, r.net, 20);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    const drainJob = r.log.jobs[1];
    expect(drainJob.status).toBe("complete");
    expect(drainJob.delivered).toBe(15);
    expect(r.log.stocks[1].scrap).toBe(18); // 3 leftover + 15 drained back
    expect(r.log.stocks[2].scrap).toBe(7); // 20 - 15 drained + 2 remainder
    expect(r.log.reservations).toHaveLength(0);
    expect(logisticsTotals(r.log)).toEqual(totals);
    expectContainerLaw(r);
  });

  it("a destination filled after reservation holds ALL cargo in transit", () => {
    const r = rig();
    corridor(r);
    sites(r, 20, 7);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7); // room 7 reserved
    seedStock(r.log, 2, "scrap", 7); // external over-fill: room 0
    carrierAt(r, c(0, 0));
    expect(logisticsTotals(r.log)).toEqual({ scrap: 17 });

    tickLogistics(r.log, r.net, 6);
    expect(j.status).toBe("partial");
    expect(j.delivered).toBe(0);
    expect(j.inTransit).toBe(7);
    expect(j.heldReason).toEqual({ kind: "destination-full", buildingId: 2, room: 0 });
    expect(r.log.stocks[2].scrap).toBe(7);
    tickLogistics(r.log, r.net, 5);
    expect(j.inTransit).toBe(7); // conserved, never destroyed
    expect(logisticsTotals(r.log)).toEqual({ scrap: 17 });
    expectContainerLaw(r);

    const drain = createJob(r.log, { id: "drain", sourceBuildingId: 2, destBuildingId: 1, cargoType: "scrap", amount: 7 });
    expect(drain.ok).toBe(true);
    carrierAt(r, c(4, 0), 12);
    tickLogistics(r.log, r.net, 20);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(r.log.stocks[1].scrap).toBe(10); // 3 + 7 drained back
    expect(r.log.stocks[2].scrap).toBe(7); // the 7 delivered units
    expect(logisticsTotals(r.log)).toEqual({ scrap: 17 });
  });
});

describe("cancellation returns cargo (E01/E04)", () => {
  it("cancel before dispatch returns reserved stock immediately", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    const result = cancelJob(r.log, r.net, j.id);
    expect(result.ok).toBe(true);
    expect(j.status).toBe("cancelled");
    expect(j.phase).toBe("done");
    expect(j.atSource).toBe(0);
    expect(r.log.stocks[1].scrap).toBe(10);
    expect(r.log.reservations).toHaveLength(0);
    expect(carrier.jobId).toBeNull();
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("cancel after dispatch but before loading returns stock and frees the carrier", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 1); // dispatched, not yet loaded
    expect(j.phase).toBe("to-source");
    cancelJob(r.log, r.net, j.id);
    expect(j.status).toBe("cancelled");
    expect(j.atSource).toBe(0);
    expect(r.log.stocks[1].scrap).toBe(10);
    expect(carrier.jobId).toBeNull();
    expect(r.log.reservations).toHaveLength(0);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("cancel mid-transit recalls the cargo along the road (no teleport)", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4); // carrier at (2,0), 7 aboard
    expect(carrier.cell).toEqual(c(2, 0));
    expect(j.inTransit).toBe(7);
    const result = cancelJob(r.log, r.net, j.id);
    expect(result.ok).toBe(true);
    expect(j.status).toBe("active"); // recall in progress, not yet settled
    expect(j.phase).toBe("returning");
    expect(j.path).toEqual([c(2, 0), c(1, 0), c(0, 0)]);
    expect(j.inTransit).toBe(7);
    expect(r.log.stocks[1].scrap).toBe(3); // not returned until arrival
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    tickLogistics(r.log, r.net, 1);
    expect(carrier.cell).toEqual(c(1, 0));
    expect(j.inTransit).toBe(7);
    tickLogistics(r.log, r.net, 1);
    expect(j.status).toBe("cancelled");
    expect(j.phase).toBe("done");
    expect(j.inTransit).toBe(0);
    expect(r.log.stocks[1].scrap).toBe(10);
    expect(carrier.jobId).toBeNull();
    expect(r.log.reservations).toHaveLength(0);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    expectContainerLaw(r);
  });

  it("a cut route holds the recall with the exact blocker; repair resumes it", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4); // carrier (2,0)
    removeRoad(r, "cut", [c(1, 0)]); // between carrier and source
    cancelJob(r.log, r.net, j.id);
    expect(j.phase).toBe("returning");
    expect(j.path).toBeNull();
    expect(j.heldReason).toEqual({ kind: "no-route", from: c(2, 0), to: c(0, 0) });
    expect(j.inTransit).toBe(7);
    tickLogistics(r.log, r.net, 5); // held: no movement, no loss
    expect(carrier.cell).toEqual(c(2, 0));
    expect(j.inTransit).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    // Repair spans the cut: edges only exist between consecutive placed cells.
    placeRoad(r, "repair", [c(0, 0), c(1, 0), c(2, 0)]);
    tickLogistics(r.log, r.net, 1); // retry from the leg origin, walk resumes
    expect(j.heldReason).toBeNull();
    expect(carrier.cell).toEqual(c(1, 0));
    expect(j.inTransit).toBe(7);
    tickLogistics(r.log, r.net, 1);
    expect(j.status).toBe("cancelled");
    expect(r.log.stocks[1].scrap).toBe(10);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("road removed under a recalling carrier holds cargo until repair", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4); // carrier (2,0)
    cancelJob(r.log, r.net, j.id); // recall path stamped
    expect(j.phase).toBe("returning");
    removeRoad(r, "cut", [c(2, 0)]); // under the carrier
    tickLogistics(r.log, r.net, 1);
    expect(j.heldReason).toEqual({ kind: "road-removed", at: c(2, 0) });
    expect(j.path).toBeNull();
    expect(j.inTransit).toBe(7);
    tickLogistics(r.log, r.net, 3);
    expect(carrier.cell).toEqual(c(2, 0));
    expect(j.inTransit).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    placeRoad(r, "repair", [c(1, 0), c(2, 0), c(3, 0)]);
    tickLogistics(r.log, r.net, 2); // retry + walk back to source
    expect(j.status).toBe("cancelled");
    expect(r.log.stocks[1].scrap).toBe(10);
    expect(carrier.jobId).toBeNull();
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("cancel after a partial unload recalls only the remainder", () => {
    const r = rig();
    corridor(r);
    sites(r, 40, 20);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    seedStock(r.log, 2, "scrap", 15);
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 6); // partial: 5 delivered, 2 aboard
    expect(j.status).toBe("partial");
    cancelJob(r.log, r.net, j.id);
    expect(j.phase).toBe("returning");
    expect(j.inTransit).toBe(2);
    expect(j.path).toEqual([c(4, 0), c(3, 0), c(2, 0), c(1, 0), c(0, 0)]);
    tickLogistics(r.log, r.net, 4); // walk back, arrive source
    expect(j.status).toBe("cancelled");
    expect(j.delivered).toBe(5); // stays at the destination
    expect(j.inTransit).toBe(0);
    expect(r.log.stocks[1].scrap).toBe(5); // 3 leftover + 2 recalled
    expect(r.log.stocks[2].scrap).toBe(20); // 15 seed + 5 delivered
    expect(r.log.reservations).toHaveLength(0);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 25 });
    expectContainerLaw(r);
  });

  it("unknown jobs are refused; terminal cancels are idempotent no-ops", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    expect(cancelJob(r.log, r.net, 999)).toEqual({ ok: false, reason: { reason: "unknown-job" } });
    const j = job(r, "haul", 7);
    carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 6); // complete
    const before = logisticsFingerprint(r.log);
    const result = cancelJob(r.log, r.net, j.id);
    expect(result.ok).toBe(true);
    expect(j.status).toBe("complete");
    expect(logisticsFingerprint(r.log)).toBe(before);
    expect(r.log.stocks[2].scrap).toBe(7);
  });
});

describe("deterministic tie-breaks and fairness (E03)", () => {
  it("same-tick jobs tie-break by id; one carrier serves one job", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const a = job(r, "a", 3);
    const b = job(r, "b", 4);
    expect(a.createdTick).toBe(b.createdTick);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 1);
    expect(carrier.jobId).toBe(a.id);
    expect(a.status).toBe("active");
    expect(b.status).toBe("pending");
    expect(b.heldReason).toEqual({ kind: "no-carrier", needCapacity: 4 });
  });

  it("player priority outranks age", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const low = job(r, "low", 3);
    const high = job(r, "high", 3, { priority: 1 });
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 1);
    expect(carrier.jobId).toBe(high.id);
    expect(low.status).toBe("pending");
  });

  it("oldest-first dispatch drains the queue without starvation", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 6);
    const jobs = [1, 2, 3, 4, 5, 6].map((i) => job(r, `j${i}`, 1));
    const c1 = carrierAt(r, c(0, 0), 1);
    const c2 = carrierAt(r, c(0, 0), 1);
    tickLogistics(r.log, r.net, 1);
    expect(jobs[0].status).toBe("active");
    expect(jobs[1].status).toBe("active");
    expect(jobs.slice(2).every((j) => j.status === "pending")).toBe(true);
    expect(c1.jobId).toBe(jobs[0].id);
    expect(c2.jobId).toBe(jobs[1].id);
    tickLogistics(r.log, r.net, 5); // tick 6: first pair settles, next pair dispatches
    expect(jobs[0].status).toBe("complete");
    expect(jobs[1].status).toBe("complete");
    expect(jobs[2].status).toBe("active");
    expect(jobs[3].status).toBe("active");
    expect(jobs[4].status).toBe("pending");
    expect(jobs[5].status).toBe("pending");
    tickLogistics(r.log, r.net, 94);
    expect(jobs.every((j) => j.status === "complete")).toBe(true);
    expect(jobs.every((j) => j.delivered === 1)).toBe(true);
    expect(r.log.stocks[2].scrap).toBe(6);
    expect(r.log.reservations).toHaveLength(0);
    expect(c1.jobId).toBeNull();
    expect(c2.jobId).toBeNull();
    expect(logisticsTotals(r.log)).toEqual({ scrap: 6 });
    expectContainerLaw(r);
  });

  it("identical seeds and command sequences produce byte-identical state", () => {
    const run = () => {
      const r = rig();
      corridor(r);
      sites(r);
      seedStock(r.log, 1, "scrap", 10);
      job(r, "a", 3);
      job(r, "b", 4);
      carrierAt(r, c(0, 0));
      carrierAt(r, c(4, 0), 8);
      tickLogistics(r.log, r.net, 30);
      expect(r.log.jobs.every((j) => j.status === "complete")).toBe(true);
      return logisticsFingerprint(r.log);
    };
    expect(run()).toBe(run());
  });
});

describe("road removal pauses and resumes delivery (E04)", () => {
  it("a cut ahead re-routes a moving carrier without touching cargo", () => {
    const r = rig();
    loop(r);
    expect(registerBuilding(r.log, { id: 1, cell: c(0, 0), capacity: 20 })).toBe(true);
    expect(registerBuilding(r.log, { id: 2, cell: c(2, 0), capacity: 20 })).toBe(true);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 5);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 2); // dispatch, load: top walk stamped
    expect(j.phase).toBe("to-dest");
    expect(j.path).toEqual([c(0, 0), c(1, 0), c(2, 0)]);
    removeRoad(r, "cut", [c(1, 0)]);
    tickLogistics(r.log, r.net, 1); // revalidate: unique remaining route is the bottom
    expect(j.path).toEqual([c(0, 0), c(0, 1), c(1, 1), c(2, 1), c(2, 0)]);
    expect(j.inTransit).toBe(5);
    expect(carrier.cell).toEqual(c(0, 1));
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    tickLogistics(r.log, r.net, 3);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(5);
    expect(r.log.stocks[2].scrap).toBe(5);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    expectContainerLaw(r);
  });

  it("road removed under the carrier holds cargo; repair resumes delivery", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 4); // carrier (2,0), 7 aboard
    removeRoad(r, "cut", [c(2, 0)]);
    tickLogistics(r.log, r.net, 1);
    expect(j.heldReason).toEqual({ kind: "road-removed", at: c(2, 0) });
    expect(j.path).toBeNull();
    expect(j.inTransit).toBe(7);
    expect(j.status).toBe("active");
    tickLogistics(r.log, r.net, 5); // backoff: no movement, no loss
    expect(carrier.cell).toEqual(c(2, 0));
    expect(j.inTransit).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    placeRoad(r, "repair", [c(1, 0), c(2, 0), c(3, 0)]);
    tickLogistics(r.log, r.net, 1); // retry from the leg origin (roadPaths parity)
    expect(j.heldReason).toBeNull();
    expect(carrier.cell).toEqual(c(1, 0));
    tickLogistics(r.log, r.net, 3);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(r.log.stocks[2].scrap).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    expectContainerLaw(r);
  });

  it("unreachable jobs stay pending with the exact blocker; a new road dispatches them", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(6, 0)); // off-network
    tickLogistics(r.log, r.net, 1);
    expect(j.status).toBe("pending");
    expect(j.heldReason).toEqual({ kind: "no-route", from: c(6, 0), to: c(0, 0) });
    expect(j.routeCache).toEqual({ revision: r.net.revision, carrierId: carrier.id, path: null });
    tickLogistics(r.log, r.net, 5); // backoff: cached null, no re-resolution
    expect(j.status).toBe("pending");
    expect(j.heldReason).toEqual({ kind: "no-route", from: c(6, 0), to: c(0, 0) });
    expect(j.routeCache).toEqual({ revision: r.net.revision, carrierId: carrier.id, path: null });
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    // The link shares (4,0) with the corridor so the joining edge is created.
    placeRoad(r, "link", [c(4, 0), c(5, 0), c(6, 0)]);
    tickLogistics(r.log, r.net, 1);
    expect(j.status).toBe("active");
    expect(j.phase).toBe("to-source");
    expect(j.carrierId).toBe(carrier.id);
    tickLogistics(r.log, r.net, 20);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });

  it("a cut before loading holds the carrier; cargo stays reserved at source", () => {
    const r = rig();
    corridor(r);
    sites(r);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(4, 0)); // far end: five-cell walk to source
    tickLogistics(r.log, r.net, 2); // dispatch, one step to (3,0)
    expect(j.phase).toBe("to-source");
    expect(carrier.cell).toEqual(c(3, 0));
    expect(j.atSource).toBe(7);
    expect(j.inTransit).toBe(0);
    removeRoad(r, "cut", [c(2, 0)]);
    tickLogistics(r.log, r.net, 1);
    expect(j.heldReason).toEqual({ kind: "no-route", from: c(3, 0), to: c(0, 0) });
    expect(j.atSource).toBe(7);
    expect(r.log.stocks[1].scrap).toBe(3);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    placeRoad(r, "repair", [c(1, 0), c(2, 0), c(3, 0)]);
    tickLogistics(r.log, r.net, 12);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
    expectContainerLaw(r);
  });

  it("re-registering a moved building retargets an in-flight job", () => {
    const r = rig();
    placeRoad(r, "line", [c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(4, 0), c(5, 0), c(6, 0)]);
    expect(registerBuilding(r.log, { id: 1, cell: c(0, 0), capacity: 20 })).toBe(true);
    expect(registerBuilding(r.log, { id: 2, cell: c(4, 0), capacity: 20 })).toBe(true);
    seedStock(r.log, 1, "scrap", 10);
    const j = job(r, "haul", 7);
    const carrier = carrierAt(r, c(0, 0));
    tickLogistics(r.log, r.net, 3); // carrier (1,0), loaded
    expect(carrier.cell).toEqual(c(1, 0));
    expect(j.inTransit).toBe(7);
    expect(registerBuilding(r.log, { id: 2, cell: c(6, 0), capacity: 20 })).toBe(true);
    expect(j.destCell).toEqual(c(6, 0));
    tickLogistics(r.log, r.net, 1); // revalidate: old walk ends at the old cell
    expect(j.path).toEqual([c(1, 0), c(2, 0), c(3, 0), c(4, 0), c(5, 0), c(6, 0)]);
    expect(carrier.cell).toEqual(c(2, 0));
    tickLogistics(r.log, r.net, 4);
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(carrier.cell).toEqual(c(6, 0));
    expect(r.log.stocks[2].scrap).toBe(7);
    expect(logisticsTotals(r.log)).toEqual({ scrap: 10 });
  });
});

describe("store integration (session-only, writer-gated)", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
  }

  it("writer creates/cancels jobs, step() advances them, saves stay untouched", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");
    const saveBefore = storage.getItem(SAVE_KEY);
    const exportBefore = store.exportSave();

    const road = store.commitRoad({
      id: "road-1",
      type: "road.place",
      cells: [c(8, 12), c(9, 12), c(10, 12), c(11, 12), c(12, 12)],
    });
    expect(road.result.ok).toBe(true);
    expect(store.registerLogisticsBuilding({ id: 1, cell: c(8, 12), capacity: 20 })).toBe(true);
    expect(store.registerLogisticsBuilding({ id: 2, cell: c(12, 12), capacity: 20 })).toBe(true);
    expect(store.seedLogisticsStock(1, "scrap", 10)).toBe(true);
    const carrier = store.registerLogisticsCarrier({ capacity: 12, cell: c(8, 12) });
    expect(carrier).not.toBeNull();
    const created = store.createLogisticsJob(request("job-1", 7));
    expect(created.ok).toBe(true);
    expect(store.getLogisticsJobs()).toHaveLength(1);
    expect(store.getLogisticsReservations()).toHaveLength(2);

    // Session-only: logistics mutations never touch SAVE_KEY or the export.
    expect(storage.getItem(SAVE_KEY)).toBe(saveBefore);
    expect(store.exportSave()).toBe(exportBefore);

    store.step(1); // dispatch
    expect(store.getLogisticsJobs()[0].status).toBe("active");
    store.step(5); // load + four moves: complete at tick 6
    const j = store.getLogisticsJobs()[0];
    expect(j.status).toBe("complete");
    expect(j.delivered).toBe(7);
    expect(store.getLogisticsReservations()).toHaveLength(0);
    expect(logisticsTotals(store.getLogistics())).toEqual({ scrap: 10 });

    // Cancel path through the store: a fresh job returns its stock on cancel.
    const second = store.createLogisticsJob(request("job-2", 3));
    expect(second.ok).toBe(true);
    const cancelled = store.cancelLogisticsJob(2);
    expect(cancelled.ok).toBe(true);
    expect(store.getLogistics().stocks[1].scrap).toBe(3); // 10 - 7 delivered + 3 - 3 returned
    expect(store.getLogisticsReservations()).toHaveLength(0);
  });

  it("reader tabs are refused every mutation and never mirror the session ledger", () => {
    const storage = memoryStorage();
    const writer = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    writer.commitRoad({
      id: "road-1",
      type: "road.place",
      cells: [c(8, 12), c(9, 12), c(10, 12), c(11, 12), c(12, 12)],
    });
    writer.registerLogisticsBuilding({ id: 1, cell: c(8, 12), capacity: 20 });
    writer.registerLogisticsBuilding({ id: 2, cell: c(12, 12), capacity: 20 });
    writer.seedLogisticsStock(1, "scrap", 10);
    writer.registerLogisticsCarrier({ capacity: 12, cell: c(8, 12) });
    expect(writer.createLogisticsJob(request("job-1", 7)).ok).toBe(true);
    writer.step(6);

    const reader = createStore({ storage, now: () => 10, leaseId: "tab-b" });
    expect(reader.getRole()).toBe("reader");
    // The ledger is session-only: the reader starts empty even after reconcile.
    expect(reader.getLogisticsJobs()).toHaveLength(0);
    expect(reader.getLogisticsReservations()).toHaveLength(0);
    expect(reader.createLogisticsJob(request("job-2", 1))).toEqual({
      ok: false,
      reason: { reason: "read-only" },
    });
    expect(reader.cancelLogisticsJob(1)).toEqual({ ok: false, reason: { reason: "read-only" } });
    expect(reader.registerLogisticsBuilding({ id: 9, cell: c(0, 0), capacity: 1 })).toBe(false);
    expect(reader.seedLogisticsStock(1, "scrap", 1)).toBe(false);
    expect(reader.registerLogisticsCarrier({ capacity: 1, cell: c(0, 0) })).toBeNull();
    expect(reader.getLogisticsJobs()).toHaveLength(0);
    // The writer's ledger is untouched by the reader's attempts.
    expect(writer.getLogisticsJobs()[0].status).toBe("complete");
    expect(writer.getLogistics().stocks[1].scrap).toBe(3);
  });
});
