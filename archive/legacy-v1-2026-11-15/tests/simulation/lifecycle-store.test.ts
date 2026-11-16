/**
 * Store-level LifecycleApi contract (issue #146, RW3D T19): safe MOVE,
 * DISMANTLE and CARGO RECALL over the session build yard + logistics ledger.
 * Mirrors the #140/#141 store harnesses (reservations/traffic-store):
 *  - previews are pure reads (any role) and equal what the commit charges;
 *  - every commit is writer-gated and validates world law AND cargo/recovery
 *    state before the first mutation, so a refusal leaves BOTH ledgers
 *    byte-identical (world + logistics fingerprints);
 *  - cargo is conserved across recall/move/dismantle (logisticsTotals), and
 *    construction material is conserved across the world lifecycle including
 *    the visible overflow ledger;
 *  - checkpoint-only writes: no lifecycle commit touches SAVE_KEY; the sim
 *    slice of the export is unchanged, while (#228) the yard slice reflects
 *    the committed lifecycle change.
 *
 * Fixtures place real buildings in getBuildWorld() and register matching
 * logistics buildings (the documented id/approach-cell convention). Costs and
 * refunds are read from the kit at call time; conservation baselines are
 * captured DYNAMICALLY from the live ledgers, never hardcoded (#214 retune).
 */
import { describe, expect, it } from "vitest";
import type { ResourceId } from "../../src/game/content/defs";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { logisticsFingerprint, logisticsTotals } from "../../src/game/simulation/logistics";
import {
  ROTATIONS,
  WORLD_KIT,
  advanceWorldTo,
  applyWorldCommand,
  dismantleRefundOf,
  moveFeeOf,
  stockUnits,
  validateMove,
  worldFingerprint,
  type Cell,
  type Rotation,
  type WorldState,
} from "../../src/game/world";
import { createStore } from "../../src/app/store";
import { findLegalCell } from "../game/world/helpers";

const c = (x: number, y: number): Cell => ({ x, y });

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

/** Dynamic world conservation baseline: total goods per resource + credits. */
interface WorldBaseline {
  stock: Partial<Record<ResourceId, number>>;
  credits: number;
}

function worldBaseline(w: WorldState): WorldBaseline {
  const resources = new Set<ResourceId>([
    ...(Object.keys(w.stock) as ResourceId[]),
    ...(Object.keys(w.committed) as ResourceId[]),
  ]);
  for (const r of w.reservations) for (const i of r.items) resources.add(i.resource);
  for (const e of w.overflow ?? []) resources.add(e.resource);
  const stock: Partial<Record<ResourceId, number>> = {};
  for (const resource of resources) {
    let reserved = 0;
    for (const r of w.reservations) for (const i of r.items) if (i.resource === resource) reserved += i.qty;
    let overflow = 0;
    for (const e of w.overflow ?? []) if (e.resource === resource) overflow += e.qty;
    stock[resource] = (w.stock[resource] ?? 0) + reserved + (w.committed[resource] ?? 0) + overflow;
  }
  let reservedCredits = 0;
  for (const r of w.reservations) reservedCredits += r.credits;
  return { stock, credits: w.credits + reservedCredits + w.committedCredits };
}

function expectWorldConserved(w: WorldState, base: WorldBaseline, label: string): void {
  for (const resource of Object.keys(base.stock) as ResourceId[]) {
    let reserved = 0;
    for (const r of w.reservations) for (const i of r.items) if (i.resource === resource) reserved += i.qty;
    let overflow = 0;
    for (const e of w.overflow ?? []) if (e.resource === resource) overflow += e.qty;
    const sum = (w.stock[resource] ?? 0) + reserved + (w.committed[resource] ?? 0) + overflow;
    if (sum !== base.stock[resource]) {
      throw new Error(`${label}: world conservation violated for ${resource}: expected ${base.stock[resource]}, got ${sum}`);
    }
  }
  let reservedCredits = 0;
  for (const r of w.reservations) reservedCredits += r.credits;
  const creditSum = w.credits + reservedCredits + w.committedCredits;
  if (creditSum !== base.credits) {
    throw new Error(`${label}: world credit conservation violated: expected ${base.credits}, got ${creditSum}`);
  }
}

function completeBuilding(w: WorldState, id: string, asset: keyof typeof WORLD_KIT): Cell {
  const cell = findLegalCell(w, asset);
  const res = applyWorldCommand(w, { id, type: "world.place", asset, cell, rotation: 0 });
  if (!res.ok) throw new Error(`setup place failed: ${JSON.stringify(res.rejection)}`);
  advanceWorldTo(w, w.tick + WORLD_KIT[asset].constructionTicks);
  return cell;
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

/**
 * Two completed buildings (generator id 1, warehouse id 2) with matching
 * logistics buildings, seeded source stock and one pending cargo job 1->2.
 * Stock is granted for the fixture; baselines are captured afterwards.
 */
function yard(store: Store): { gen: Cell; wh: Cell } {
  const w = store.getBuildWorld();
  w.stock.scrap = 1000;
  w.stock.steel = 1000;
  w.stock.ferrous = 1000;
  w.credits = 1000;
  const gen = completeBuilding(w, "setup-gen", "generator");
  const wh = completeBuilding(w, "setup-wh", "warehouse");
  expect(store.registerLogisticsBuilding({ id: 1, cell: gen, capacity: 50 })).toBe(true);
  expect(store.registerLogisticsBuilding({ id: 2, cell: wh, capacity: 50 })).toBe(true);
  expect(store.seedLogisticsStock(1, "scrap", 20)).toBe(true);
  expect(store.createLogisticsJob({ id: "job-1", sourceBuildingId: 1, destBuildingId: 2, cargoType: "scrap", amount: 7 }).ok).toBe(true);
  return { gen, wh };
}

describe("store LifecycleApi: preview -> move commit conserves both ledgers", () => {
  it("preview is pure; move recalls affected cargo, preserves id, retargets approach; checkpoint untouched", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");
    yard(store);
    const w = store.getBuildWorld();
    const log = store.getLogistics();
    const baseWorld = worldBaseline(w);
    const baseLog = logisticsTotals(log);
    const fpW = worldFingerprint(w);
    const fpL = logisticsFingerprint(log);
    const saveBefore = storage.getItem(SAVE_KEY);
    const exportBefore = store.exportSave();

    const target = findLegalMoveTarget(w, 1);
    const preview = store.previewMoveBuilding(1, target.cell, target.rotation);
    expect(preview.world.rejection).toBeNull();
    expect(preview.world.fee).toEqual(moveFeeOf("generator"));
    expect(preview.affectedJobs.map((j) => j.jobId)).toEqual([1]);
    // Preview changed neither ledger.
    expect(worldFingerprint(w)).toBe(fpW);
    expect(logisticsFingerprint(log)).toBe(fpL);

    const completedTick = w.buildings.find((b) => b.id === 1)!.completedTick;
    const result = store.moveBuilding(1, target.cell, target.rotation);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recalledJobIds).toEqual([1]);
    // Affected cargo job cancelled (cargo conserved by cancelJob).
    expect(store.getLogisticsJobs().find((j) => j.id === 1)!.status).toBe("cancelled");
    // Building moved; id + completedTick preserved; approach cell retargeted.
    const moved = w.buildings.find((b) => b.id === 1)!;
    expect(moved.cell).toEqual(target.cell);
    expect(moved.rotation).toBe(target.rotation);
    expect(moved.completedTick).toBe(completedTick);
    expect(log.buildings[1].cell).toEqual(target.cell);
    // Both ledgers conserved. The commit itself never writes SAVE_KEY (the
    // checkpoint cadence owns writes) and leaves the sim slice untouched;
    // #228: the export's yard slice now reflects the move.
    expect(logisticsTotals(log)).toEqual(baseLog);
    expectWorldConserved(w, baseWorld, "after move");
    expect(storage.getItem(SAVE_KEY)).toBe(saveBefore);
    const exportAfter = store.exportSave();
    expect(JSON.parse(exportAfter).payload.sim).toEqual(JSON.parse(exportBefore).payload.sim);
    expect(JSON.parse(exportAfter).payload.world.buildings.find((b: { id: number }) => b.id === 1).cell).toEqual(target.cell);
  });

  it("a refused move (world law) leaves both ledgers byte-identical", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-a" });
    yard(store);
    const w = store.getBuildWorld();
    const log = store.getLogistics();
    const fpW = worldFingerprint(w);
    const fpL = logisticsFingerprint(log);
    // same-position is a world-law refusal; cargo must NOT be recalled first.
    const b = w.buildings.find((x) => x.id === 1)!;
    const result = store.moveBuilding(1, b.cell, b.rotation);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("same-position");
    expect(worldFingerprint(w)).toBe(fpW);
    expect(logisticsFingerprint(log)).toBe(fpL);
    expect(store.getLogisticsJobs().find((j) => j.id === 1)!.status).not.toBe("cancelled");
  });
});

describe("store LifecycleApi: dismantle blockers, recovery transfer and overflow", () => {
  it("cargo-not-drained / inventory-present / unknown-recovery / recovery-full refuse atomically", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-a" });
    yard(store);
    const w = store.getBuildWorld();
    const log = store.getLogistics();

    // Pending job 1->2 touches building 2: dismantle is blocked, atomically.
    const pBlocked = store.previewDismantleBuilding(2);
    expect(pBlocked.cargoDrained).toBe(false);
    expect(pBlocked.blocker?.reason).toBe("cargo-not-drained");
    let fpW = worldFingerprint(w);
    let fpL = logisticsFingerprint(log);
    let refused = store.dismantleBuilding(2);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.rejection.reason).toBe("cargo-not-drained");
    expect(worldFingerprint(w)).toBe(fpW);
    expect(logisticsFingerprint(log)).toBe(fpL);

    // Drain cargo, then seed free inventory at building 2.
    expect(store.recallCargo().ok).toBe(true);
    expect(store.seedLogisticsStock(2, "scrap", 5)).toBe(true);
    const pInv = store.previewDismantleBuilding(2);
    expect(pInv.cargoDrained).toBe(true);
    expect(pInv.inventoryUnits).toBe(5);
    expect(pInv.blocker?.reason).toBe("inventory-present");
    fpW = worldFingerprint(w);
    fpL = logisticsFingerprint(log);
    refused = store.dismantleBuilding(2);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.rejection.reason).toBe("inventory-present");
    expect(worldFingerprint(w)).toBe(fpW);
    expect(logisticsFingerprint(log)).toBe(fpL);

    // Unknown recovery building.
    expect(store.previewDismantleBuilding(2, 999).blocker?.reason).toBe("unknown-recovery");
    refused = store.dismantleBuilding(2, 999);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.rejection.reason).toBe("unknown-recovery");
    expect(worldFingerprint(w)).toBe(fpW);
    expect(logisticsFingerprint(log)).toBe(fpL);

    // Recovery building with no room (capacity 2, filled to 2). Registering and
    // seeding it is legitimate setup mutation; re-baseline before the refusal.
    expect(store.registerLogisticsBuilding({ id: 3, cell: c(0, 0), capacity: 2 })).toBe(true);
    expect(store.seedLogisticsStock(3, "scrap", 2)).toBe(true);
    fpW = worldFingerprint(w);
    fpL = logisticsFingerprint(log);
    const pFull = store.previewDismantleBuilding(2, 3);
    expect(pFull.blocker?.reason).toBe("recovery-full");
    expect(pFull.recovery).toEqual({ buildingId: 3, room: 0 });
    refused = store.dismantleBuilding(2, 3);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.rejection.reason).toBe("recovery-full");
    expect(worldFingerprint(w)).toBe(fpW);
    expect(logisticsFingerprint(log)).toBe(fpL);
  });

  it("dismantle with recovery transfers inventory, refunds materials and overflows visibly", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    yard(store);
    const w = store.getBuildWorld();
    const log = store.getLogistics();
    expect(store.recallCargo().ok).toBe(true); // drain job 1
    expect(store.seedLogisticsStock(2, "scrap", 5)).toBe(true);
    const baseWorld = worldBaseline(w);
    const baseLog = logisticsTotals(log);
    const saveBefore = storage.getItem(SAVE_KEY);
    const exportBefore = store.exportSave();

    // Force a full store so the warehouse refund overflows visibly.
    w.storageCapacity = stockUnits(w);
    const preview = store.previewDismantleBuilding(2, 1);
    expect(preview.blocker).toBeNull();
    expect(preview.world.refund).toEqual(dismantleRefundOf("warehouse"));
    expect(preview.recovery).toEqual({ buildingId: 1, room: 50 - 20 });
    const refundTotal = preview.world.refund.reduce((a, i) => a + i.qty, 0);
    const fpW = worldFingerprint(w);
    expect(worldFingerprint(w)).toBe(fpW); // preview pure

    const result = store.dismantleBuilding(2, 1);
    expect(result.ok).toBe(true);
    // Building removed from both ledgers; inventory moved 2 -> 1 (conserved).
    expect(w.buildings.find((b) => b.id === 2)).toBeUndefined();
    expect(log.buildings[2]).toBeUndefined();
    expect(log.stocks[2]).toBeUndefined();
    expect(logisticsTotals(log)).toEqual(baseLog);
    // Refund overflowed visibly (full store); world material conserved.
    const overflowTotal = (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    expect(overflowTotal).toBe(refundTotal);
    for (const e of w.overflow ?? []) expect(e.source.buildingId).toBe(2);
    expectWorldConserved(w, baseWorld, "after dismantle");
    // Commit never writes SAVE_KEY; sim slice unchanged. #228: the export's
    // yard slice now reflects the dismantle (building gone, refund overflowed).
    expect(storage.getItem(SAVE_KEY)).toBe(saveBefore);
    const exportAfter = store.exportSave();
    expect(JSON.parse(exportAfter).payload.sim).toEqual(JSON.parse(exportBefore).payload.sim);
    const exportedWorld = JSON.parse(exportAfter).payload.world;
    expect(exportedWorld.buildings.find((b: { id: number }) => b.id === 2)).toBeUndefined();
    expect(exportedWorld.overflow.reduce((a: number, e: { qty: number }) => a + e.qty, 0)).toBe(refundTotal);
  });
});

describe("store LifecycleApi: cargo recall recovers overflow exactly once", () => {
  it("preview predicts recovery; recall drains the ledger without touching logistics cargo", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10, leaseId: "tab-a" });
    yard(store);
    const w = store.getBuildWorld();
    const log = store.getLogistics();
    expect(store.recallCargo().ok).toBe(true); // drain job 1
    w.storageCapacity = stockUnits(w); // full store
    // Dismantle building 1 (generator): its 20 scrap inventory moves to recovery 2.
    expect(store.dismantleBuilding(1, 2).ok).toBe(true);
    const baseWorld = worldBaseline(w);
    const overflowTotal = (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    expect(overflowTotal).toBeGreaterThan(0);

    // No free room: nothing recoverable.
    expect(store.previewRecallCargo().overflow.recoveredUnits).toBe(0);
    // Free room: the preview predicts the exact full recovery.
    w.storageCapacity = stockUnits(w) + overflowTotal;
    const plan = store.previewRecallCargo();
    expect(plan.overflow.recoveredUnits).toBe(overflowTotal);
    const fpL = logisticsFingerprint(log);
    const result = store.recallCargo();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recoveredOverflowUnits).toBe(overflowTotal);
      expect(result.recalledJobIds).toEqual([]); // no non-terminal jobs remain
    }
    expect((w.overflow ?? []).length).toBe(0);
    expectWorldConserved(w, baseWorld, "after recall");
    // Overflow is world construction material; recalling it does not touch cargo.
    expect(logisticsFingerprint(log)).toBe(fpL);
    // A second recall recovers nothing (no duplication).
    const again = store.recallCargo();
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.recoveredOverflowUnits).toBe(0);
    expectWorldConserved(w, baseWorld, "after second recall");
  });
});

describe("store LifecycleApi: writer-gated and session-only", () => {
  it("reader tabs are refused every lifecycle commit; previews remain pure reads", () => {
    const storage = memoryStorage();
    const writer = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    yard(writer);
    const reader = createStore({ storage, now: () => 10, leaseId: "tab-b" });
    expect(reader.getRole()).toBe("reader");

    const move = reader.moveBuilding(1, c(1, 1), 0);
    expect(move.ok).toBe(false);
    if (!move.ok) expect(move.rejection.reason).toBe("read-only");
    const dismantle = reader.dismantleBuilding(1);
    expect(dismantle.ok).toBe(false);
    if (!dismantle.ok) expect(dismantle.rejection.reason).toBe("read-only");
    const recall = reader.recallCargo();
    expect(recall.ok).toBe(false);
    if (!recall.ok) expect(recall.rejection.reason).toBe("read-only");

    // Previews are pure reads available to any role (no throw, no mutation).
    expect(() => reader.previewMoveBuilding(1, c(1, 1), 0)).not.toThrow();
    expect(() => reader.previewDismantleBuilding(1)).not.toThrow();
    expect(() => reader.previewRecallCargo()).not.toThrow();

    // The writer's yard is untouched by the reader's refused attempts.
    expect(writer.getLogisticsJobs().find((j) => j.id === 1)!.status).not.toBe("cancelled");
    expect(writer.getBuildWorld().buildings.length).toBe(2);
  });

  it("a fresh store over the same storage starts with an empty session yard (nothing persisted)", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    yard(store);
    store.recallCargo();
    store.getBuildWorld().storageCapacity = stockUnits(store.getBuildWorld());
    store.dismantleBuilding(1, 2);
    // Lifecycle state is session-only: a new tab does not inherit it.
    const fresh = createStore({ storage, now: () => 10, leaseId: "tab-c" });
    expect(fresh.getBuildWorld().buildings.length).toBe(0);
    expect(fresh.getBuildWorld().overflow ?? []).toHaveLength(0);
    expect(fresh.getLogisticsJobs()).toHaveLength(0);
  });
});
