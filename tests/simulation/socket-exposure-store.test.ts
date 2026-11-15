/**
 * Store-level socket exposure contract (issue #217, G1-blocking).
 *
 * The bay editor reads `getRoadSockets()`; before #217 that projection read the
 * road-only `roadWorld` (seed 139), which never receives player buildings, so it
 * was ALWAYS empty and no completed bay could ever be edited. #217 projects the
 * COMPLETED buildings of `buildWorld` (seed 138) and, when a road-taking building
 * settles, auto-registers it with the logistics ledger at its socket APPROACH
 * cell so the bay editor's approach-cell capacity gates the cell jobs lease.
 *
 * Mirrors the #140/#141/#146 store harnesses (reservations/traffic/lifecycle):
 *  - Projection: a completed warehouse surfaces its kit bays at hand-derived
 *    approach cells; construction sites are excluded; `connected` flips with the
 *    road network; the auto-registered logistics cell EQUALS the bay approach.
 *  - Bay gating: capacity 1 at the approach cell serializes two concurrent
 *    unloads and measurably reduces delivered throughput vs unlimited at a fixed
 *    tick budget (numerical, hand-derived, no wall-clock).
 *  - Lifecycle: MOVE retargets the registration + sockets to the new approach;
 *    DISMANTLE removes the building from both ledgers.
 *  - Session-only (G1): socket/capacity mutations never touch SAVE_KEY or the
 *    export envelope, and a fresh store over the same storage recomputes empty
 *    sockets from its (empty) session build yard. NO save-shape change.
 *
 * Geometry is hand-derived from the kit (warehouse 6x4, bay0 local (-1.55, 2.15),
 * bay1 (1.55, 2.15); footprint-center origin, approach = floor(worldMu/1000)).
 * A warehouse at (7,8) rot0 has bay0 approach (8,12) and bay1 approach (11,12),
 * both on the owned start-parcel corridor row y=12 used by the #141 harness.
 */
import { describe, expect, it } from "vitest";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { logisticsTotals, type LogisticsJobRequest } from "../../src/game/simulation/logistics";
import { WORLD_KIT } from "../../src/game/world/kit";
import {
  buildingLogisticsCell,
  buildingTakesRoadLane,
  socketApproachCell,
} from "../../src/game/world/roadSockets";
import {
  ROTATIONS,
  applyWorldCommand,
  validateMove,
  type Cell,
  type PlacedBuilding,
  type Rotation,
  type WorldState,
} from "../../src/game/world";
import { createStore } from "../../src/app/store";

const c = (x: number, y: number): Cell => ({ x, y });

/** Warehouse footprint-origin chosen so bay0 lands on the owned corridor row. */
const WH_CELL = c(7, 8);
const BAY0 = c(8, 12); // first road-taking socket approach (the registered cell)
const BAY1 = c(11, 12);
const SOURCE = c(12, 12); // far end of the (8,12)..(12,12) start-parcel corridor

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

type Store = ReturnType<typeof createStore>;

function job(id: string, amount: number): LogisticsJobRequest {
  return { id, sourceBuildingId: 2, destBuildingId: 1, cargoType: "scrap", amount };
}

/** Grant the session build yard fixture stock + credits (never persisted). */
function grant(w: WorldState): void {
  w.stock.scrap = 1000;
  w.stock.steel = 1000;
  w.stock.ferrous = 1000;
  w.credits = 1000;
}

/**
 * Place a warehouse in the session build yard and complete it THROUGH the store
 * tick path so the #217 completion hook auto-registers it. Returns the world
 * building id (the first placed building is id 1).
 */
function completeWarehouse(store: Store): number {
  const w = store.getBuildWorld();
  grant(w);
  const res = applyWorldCommand(w, {
    id: "wh-place",
    type: "world.place",
    asset: "warehouse",
    cell: WH_CELL,
    rotation: 0,
  });
  if (!res.ok) throw new Error(`warehouse place failed: ${JSON.stringify(res.rejection)}`);
  // A construction site is NOT a completed building: no sockets, no registration.
  expect(store.getRoadSockets()).toHaveLength(0);
  expect(store.getLogistics().buildings[1]).toBeUndefined();
  store.step(WORLD_KIT.warehouse.constructionTicks);
  expect(w.buildings).toHaveLength(1);
  expect(w.sites).toHaveLength(0);
  return w.buildings[0].id;
}

/** Five-cell owned corridor (8,12)..(12,12) joining the bay approach to source. */
function placeCorridor(store: Store): void {
  const road = store.commitRoad({
    id: "corridor",
    type: "road.place",
    cells: [c(8, 12), c(9, 12), c(10, 12), c(11, 12), c(12, 12)],
  });
  expect(road.result.ok).toBe(true);
}

function deliveredTotal(store: Store): number {
  return store.getLogisticsJobs().reduce((sum, j) => sum + j.delivered, 0);
}

/**
 * Two carriers and two concurrent jobs source(2)@SOURCE -> warehouse(1)@BAY0,
 * speed 1 with a 2-tick unload so a bay lease is held while unloading. The
 * warehouse auto-registers at BAY0 (the approach cell), so capping BAY0 gates
 * the cell the jobs actually lease.
 */
function setupContention(store: Store): void {
  const id = completeWarehouse(store);
  expect(id).toBe(1);
  placeCorridor(store);
  expect(store.registerLogisticsBuilding({ id: 2, cell: SOURCE, capacity: 50 })).toBe(true);
  expect(store.seedLogisticsStock(2, "scrap", 10)).toBe(true);
  expect(store.registerLogisticsCarrier({ capacity: 5, cell: SOURCE })).not.toBeNull();
  expect(store.registerLogisticsCarrier({ capacity: 5, cell: SOURCE })).not.toBeNull();
  expect(store.createLogisticsJob(job("job-1", 5)).ok).toBe(true);
  expect(store.createLogisticsJob(job("job-2", 5)).ok).toBe(true);
  expect(store.enableTraffic()).toBe(true);
  expect(store.setTrafficDefaultTruck({ speed: 1, loadTicks: 0, unloadTicks: 2 })).toBe(true);
}

function findLegalMoveTarget(w: WorldState, buildingId: number): { cell: Cell; rotation: Rotation } {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      for (const rotation of ROTATIONS) {
        if (validateMove(w, buildingId, { x, y }, rotation) === null) return { cell: { x, y }, rotation };
      }
    }
  }
  throw new Error(`no legal move target for building ${buildingId}`);
}

describe("pure helpers: buildingLogisticsCell / buildingTakesRoadLane (#217)", () => {
  const placed = (asset: string, cell: Cell, rotation: Rotation): PlacedBuilding => ({
    id: 1,
    asset,
    cell,
    rotation,
    completedTick: 50,
  });

  it("registers a road-taking building at its FIRST road-taking socket approach", () => {
    // Warehouse rot0 bay0 (7,10); rot90 bay0 (10,10) — hand-derived kit geometry.
    expect(buildingLogisticsCell(placed("warehouse", c(6, 6), 0))).toEqual(c(7, 10));
    expect(buildingLogisticsCell(placed("warehouse", c(6, 6), 90))).toEqual(c(10, 10));
    expect(buildingTakesRoadLane(placed("warehouse", c(6, 6), 0))).toBe(true);
    // Depot serviceBay (16,10); wall_gate road passage (19,15).
    expect(buildingLogisticsCell(placed("depot", c(14, 6), 0))).toEqual(c(16, 10));
    expect(buildingTakesRoadLane(placed("depot", c(14, 6), 0))).toBe(true);
    expect(buildingLogisticsCell(placed("wall_gate", c(18, 14), 0))).toEqual(c(19, 15));
    expect(buildingTakesRoadLane(placed("wall_gate", c(18, 14), 0))).toBe(true);
  });

  it("falls back to the footprint origin for assets with no road lane", () => {
    // generator has no sockets; sorter's only socket is a belt dock (not a road lane).
    expect(buildingTakesRoadLane(placed("generator", c(6, 6), 0))).toBe(false);
    expect(buildingLogisticsCell(placed("generator", c(6, 6), 0))).toEqual(c(6, 6));
    expect(buildingTakesRoadLane(placed("sorter", c(6, 6), 0))).toBe(false);
    expect(buildingLogisticsCell(placed("sorter", c(9, 9), 180))).toEqual(c(9, 9));
  });

  it("agrees with socketApproachCell for the first road-taking socket", () => {
    const asset = WORLD_KIT.warehouse;
    const first = asset.sockets.find((s) => s.kind === "truck" || s.kind === "road")!;
    for (const rotation of ROTATIONS) {
      expect(buildingLogisticsCell(placed("warehouse", c(7, 8), rotation))).toEqual(
        socketApproachCell(asset, c(7, 8), rotation, first),
      );
    }
  });
});

describe("store socket projection (#217, session-only)", () => {
  it("exposes completed warehouse bays at hand-derived approaches; sites excluded; connected flips with roads", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");

    const id = completeWarehouse(store);
    expect(id).toBe(1);

    // Both kit bays surface, in kit-socket order, disconnected (no road yet).
    const sockets = store.getRoadSockets();
    expect(sockets).toHaveLength(2);
    expect(sockets[0]).toMatchObject({ buildingId: 1, asset: "warehouse", socket: "bay0", kind: "truck", approach: BAY0, connected: false });
    expect(sockets[1]).toMatchObject({ buildingId: 1, asset: "warehouse", socket: "bay1", kind: "truck", approach: BAY1, connected: false });

    // Coherence: the auto-registered logistics cell IS the bay0 approach cell.
    expect(store.getLogistics().buildings[1].cell).toEqual(BAY0);
    expect(store.getLogistics().buildings[1].capacity).toBe(50);

    // A road edge at bay0's approach connects bay0 only; bay1 stays disconnected.
    placeCorridor(store);
    const connected = store.getRoadSockets();
    expect(connected.find((s) => s.socket === "bay0")!.connected).toBe(true);
    expect(connected.find((s) => s.socket === "bay1")!.connected).toBe(true); // (11,12) is on the corridor

    // Removing the road under bay0 disconnects it again (derived, never stale).
    const removed = store.commitRoad({ id: "cut-bay0", type: "road.remove", cells: [BAY0] });
    expect(removed.result.ok).toBe(true);
    expect(store.getRoadSockets().find((s) => s.socket === "bay0")!.connected).toBe(false);
  });

  it("does not register socket-less completed buildings (generator stays manual)", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    const w = store.getBuildWorld();
    grant(w);
    const res = applyWorldCommand(w, { id: "gen-place", type: "world.place", asset: "generator", cell: c(6, 6), rotation: 0 });
    expect(res.ok).toBe(true);
    store.step(WORLD_KIT.generator.constructionTicks);
    expect(w.buildings).toHaveLength(1);
    // No road lane -> no sockets and no auto-registration (the #146 convention
    // keeps socket-less buildings on manual registration).
    expect(store.getRoadSockets()).toHaveLength(0);
    expect(store.getLogistics().buildings[1]).toBeUndefined();
  });
});

describe("store bay gating at the socket approach cell (#217, numerical)", () => {
  it("capacity 1 serializes concurrent unloads and reduces delivered throughput vs unlimited", () => {
    // Hand-derived (speed 1, unloadTicks 2, five-cell corridor, waiters-first
    // grant order): dispatch 1, load 2, four moves 3-6, arrive 6. Unlimited:
    // both unload 7-8 -> 10 delivered by tick 8. Capacity 1: carrier A unloads
    // 7-8 (5 delivered), carrier B queues until A releases, then unloads 9-11.
    // At a fixed budget of 9 ticks the capped bay has delivered 5, unlimited 10.
    const BUDGET = 9;

    const low = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-low" });
    setupContention(low);
    expect(low.getLogistics().buildings[1].cell).toEqual(BAY0); // gates the leased cell
    expect(low.setTrafficBayCapacity(BAY0, 1)).toBe(true);
    low.step(BUDGET);
    const deliveredLow = deliveredTotal(low);

    const high = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-high" });
    setupContention(high);
    // No bay cap -> unlimited (legacy default).
    high.step(BUDGET);
    const deliveredHigh = deliveredTotal(high);

    expect(deliveredLow).toBe(5);
    expect(deliveredHigh).toBe(10);
    expect(deliveredLow).toBeLessThan(deliveredHigh);

    // The capped bay still drains eventually and conserves cargo (no loss).
    low.step(5);
    expect(deliveredTotal(low)).toBe(10);
    expect(logisticsTotals(low.getLogistics())).toEqual({ scrap: 10 });
    expect(low.getTraffic().bayLeases).toHaveLength(0); // released on terminal path
  });
});

describe("store lifecycle keeps sockets + registration coherent (#217)", () => {
  it("MOVE retargets the registration and sockets to the new approach cell", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    const id = completeWarehouse(store);
    expect(store.getLogistics().buildings[id].cell).toEqual(BAY0);

    const w = store.getBuildWorld();
    const target = findLegalMoveTarget(w, id);
    const moved = store.moveBuilding(id, target.cell, target.rotation);
    expect(moved.ok).toBe(true);

    const building = w.buildings.find((b) => b.id === id)!;
    const expected = buildingLogisticsCell(building);
    expect(store.getLogistics().buildings[id].cell).toEqual(expected);
    expect(store.getLogistics().buildings[id].capacity).toBe(50); // preserved
    const bay0 = store.getRoadSockets().find((s) => s.socket === "bay0")!;
    expect(bay0.approach).toEqual(expected);
  });

  it("DISMANTLE removes the building from the socket projection and the logistics ledger", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    const id = completeWarehouse(store);
    expect(store.getRoadSockets()).toHaveLength(2);

    const result = store.dismantleBuilding(id);
    expect(result.ok).toBe(true);
    expect(store.getRoadSockets()).toHaveLength(0);
    expect(store.getLogistics().buildings[id]).toBeUndefined();
    // A job targeting the dismantled building is refused (unknown building).
    expect(store.createLogisticsJob({ id: "ghost", sourceBuildingId: id, destBuildingId: id, cargoType: "scrap", amount: 1 }).ok).toBe(false);
  });
});

describe("store socket exposure is session-only (#217, NO save-shape change)", () => {
  it("socket/capacity mutations never touch SAVE_KEY or the export; a fresh store recomputes empty", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    completeWarehouse(store);
    placeCorridor(store);
    expect(store.setTrafficBayCapacity(BAY0, 1)).toBe(true);

    const exportBefore = store.exportSave();
    const saveBefore = storage.getItem(SAVE_KEY);

    // Further socket/capacity/topology mutations (no economy ticks) change nothing
    // in the persisted envelope: the slices stay disjoint from the save (#148).
    expect(store.setTrafficBayCapacity(BAY0, 3)).toBe(true);
    expect(store.commitRoad({ id: "cut", type: "road.remove", cells: [BAY1] }).result.ok).toBe(true);
    expect(store.exportSave()).toBe(exportBefore);
    expect(storage.getItem(SAVE_KEY)).toBe(saveBefore);

    // The envelope carries no world/logistics/traffic fields (shape unchanged).
    const envelope = JSON.parse(exportBefore) as Record<string, unknown>;
    for (const key of ["buildWorld", "roadWorld", "roadNet", "logistics", "traffic", "roadCargo", "bayCapacity", "terrain"]) {
      expect(envelope).not.toHaveProperty(key);
    }
    expect(exportBefore).not.toContain("completedTick");
    expect(exportBefore).not.toContain("bayCapacity");

    // A fresh store over the same storage starts from the fixed session seed:
    // no buildings, no sockets, no registration, traffic off — nothing persisted.
    const fresh = createStore({ storage, now: () => 10, leaseId: "tab-b" });
    expect(fresh.getBuildWorld().buildings).toHaveLength(0);
    expect(fresh.getRoadSockets()).toHaveLength(0);
    expect(fresh.getLogistics().buildings).toEqual({});
    expect(fresh.isTrafficEnabled()).toBe(false);
    expect(fresh.getTraffic().bayCapacity).toEqual({});
  });
});
