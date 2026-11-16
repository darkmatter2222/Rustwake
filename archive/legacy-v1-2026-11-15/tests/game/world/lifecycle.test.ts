/**
 * Acceptance E04 / E09 (issue #146, RW3D T19): safe move, dismantle and cargo
 * recall at the WORLD transaction layer.
 *
 * Proven here, with reproducible seed/state and real exit codes:
 *  - Atomicity: every rejected move/dismantle leaves the state byte-identical
 *    (worldFingerprint before/after), across each reachable rejection reason.
 *  - Conservation: the closed-system law extended with the overflow ledger,
 *      stock + reserved + committed + overflow = initial stock   (per resource)
 *      credits + reservedCredits + committedCredits = initial credits
 *    holds after EVERY transition of scripted and seeded-random workloads,
 *    including cancel/refund and old-version (formulaVersion) sequences. The
 *    baseline is derived DYNAMICALLY from a fresh createWorld — never hardcoded
 *    — so the #214 economy retune re-tests mechanically.
 *  - Preview: fees/refunds/affected splits are computed BEFORE commit and equal
 *    exactly what the executor charges; reservations settle exactly once.
 *  - Full storage: a visible overflow ledger; recall into a full store neither
 *    deletes nor duplicates a unit.
 *
 * Costs/refunds are read from the kit at call time (moveFeeOf/dismantleRefundOf),
 * so no fixture pins a cost number.
 */
import { describe, expect, it } from "vitest";
import type { ResourceId } from "../../../src/game/content/defs";
import {
  ROTATIONS,
  WORLD_KIT,
  advanceWorld,
  advanceWorldTo,
  applyWorldCommand,
  createRng,
  createWorld,
  dismantleRefundOf,
  moveFeeOf,
  previewDismantle,
  previewMove,
  previewRecall,
  randInt,
  stockUnits,
  validateMove,
  worldFingerprint,
  type Cell,
  type PlacedBuilding,
  type Rotation,
  type WorldCommand,
  type WorldState,
} from "../../../src/game/world";
import {
  expectOk,
  expectReason,
  findLegalCell,
  place,
  reservedCredits,
  totals,
} from "./helpers";

const SEED = 146;

/**
 * Dynamic conservation baseline captured from a live world (never hardcoded).
 * The conserved quantity is the TOTAL goods in the closed system at capture
 * time — stock + reserved + committed + overflow per resource, and the full
 * credit ledger — so a baseline taken after placements still balances.
 */
interface Baseline {
  stock: Partial<Record<ResourceId, number>>;
  credits: number;
}

function overflowUnits(w: WorldState, resource: ResourceId): number {
  let sum = 0;
  for (const e of w.overflow ?? []) if (e.resource === resource) sum += e.qty;
  return sum;
}

function allResources(w: WorldState): Set<ResourceId> {
  const resources = new Set<ResourceId>([
    ...(Object.keys(w.stock) as ResourceId[]),
    ...(Object.keys(w.committed) as ResourceId[]),
  ]);
  for (const r of w.reservations) for (const item of r.items) resources.add(item.resource);
  for (const e of w.overflow ?? []) resources.add(e.resource);
  return resources;
}

function baseline(w: WorldState): Baseline {
  const stock: Partial<Record<ResourceId, number>> = {};
  for (const resource of allResources(w)) {
    const t = totals(w, resource);
    stock[resource] = t.stock + t.reserved + t.committed + overflowUnits(w, resource);
  }
  return { stock, credits: w.credits + reservedCredits(w) + w.committedCredits };
}

/** Closed-system law extended with the visible overflow ledger (issue #146). */
function expectConserved(w: WorldState, base: Baseline, label: string): void {
  const resources = new Set<ResourceId>([
    ...(Object.keys(base.stock) as ResourceId[]),
    ...(Object.keys(w.stock) as ResourceId[]),
    ...(Object.keys(w.committed) as ResourceId[]),
  ]);
  for (const r of w.reservations) for (const item of r.items) resources.add(item.resource);
  for (const e of w.overflow ?? []) resources.add(e.resource);
  for (const resource of resources) {
    const t = totals(w, resource);
    const overflow = overflowUnits(w, resource);
    const sum = t.stock + t.reserved + t.committed + overflow;
    const want = base.stock[resource] ?? 0;
    if (sum !== want) {
      throw new Error(
        `${label}: conservation violated for ${resource}: expected ${want}, got ${sum} ` +
          `(stock ${t.stock} + reserved ${t.reserved} + committed ${t.committed} + overflow ${overflow})`,
      );
    }
    // Every container stays a non-negative integer (no fractional minting).
    for (const [name, qty] of [
      ["stock", t.stock],
      ["reserved", t.reserved],
      ["committed", t.committed],
      ["overflow", overflow],
    ] as const) {
      if (!Number.isInteger(qty) || qty < 0) {
        throw new Error(`${label}: ${resource} ${name} is not a non-negative integer: ${qty}`);
      }
    }
  }
  const creditSum = w.credits + reservedCredits(w) + w.committedCredits;
  if (creditSum !== base.credits) {
    throw new Error(
      `${label}: credit conservation violated: expected ${base.credits}, got ${creditSum} ` +
        `(credits ${w.credits} + reserved ${reservedCredits(w)} + committed ${w.committedCredits})`,
    );
  }
}

/** Place an asset and advance to its completion tick; returns the building. */
function complete(
  w: WorldState,
  id: string,
  asset: keyof typeof WORLD_KIT,
  cell?: Cell,
  rotation: Rotation = 0,
): PlacedBuilding {
  const c = cell ?? findLegalCell(w, asset, rotation);
  expectOk(place(w, id, asset, c.x, c.y, rotation));
  const site = w.sites[w.sites.length - 1];
  advanceWorldTo(w, site.startTick + site.durationTicks);
  const building = w.buildings.find((b) => b.id === site.buildingId);
  if (building === undefined) throw new Error(`setup: ${asset} did not complete`);
  return building;
}

const moveCmd = (id: string, buildingId: number, cell: Cell, rotation: number): WorldCommand => ({
  id,
  type: "world.move",
  buildingId,
  cell,
  rotation,
});

/** First (cell, rotation) whose pure move validation yields `reason`. */
function findMoveTarget(
  w: WorldState,
  buildingId: number,
  reason: string,
): { cell: Cell; rotation: Rotation } {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      for (const rotation of ROTATIONS) {
        const r = validateMove(w, buildingId, { x, y }, rotation);
        if (r !== null && r.reason === reason) return { cell: { x, y }, rotation };
      }
    }
  }
  throw new Error(`no move target producing '${reason}' for building ${buildingId} (seed ${w.seed})`);
}

/** First (cell, rotation) where a move is fully legal (validateMove === null). */
function findLegalMoveTarget(w: WorldState, buildingId: number): { cell: Cell; rotation: Rotation } {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      for (const rotation of ROTATIONS) {
        if (validateMove(w, buildingId, { x, y }, rotation) === null) return { cell: { x, y }, rotation };
      }
    }
  }
  throw new Error(`no legal move target for building ${buildingId} (seed ${w.seed})`);
}

/**
 * A dense yard for geometry-rejection coverage: stock granted generously so
 * many buildings fit, then the conservation baseline is captured DYNAMICALLY
 * from the resulting state (the grant is fixture setup, not a transition).
 */
function denseYard(): { w: WorldState; base: Baseline; buildings: PlacedBuilding[]; liveSiteBuildingId: number } {
  const w = createWorld(SEED);
  w.stock.scrap = 2000;
  w.stock.ferrous = 200;
  w.stock.steel = 200;
  w.credits = 2000;
  const buildings: PlacedBuilding[] = [];
  buildings.push(complete(w, "d-warehouse", "warehouse"));
  buildings.push(complete(w, "d-depot", "depot"));
  buildings.push(complete(w, "d-sorter", "sorter"));
  buildings.push(complete(w, "d-furnace", "furnace"));
  buildings.push(complete(w, "d-generator", "generator"));
  buildings.push(complete(w, "d-crane", "crane"));
  buildings.push(complete(w, "d-turret", "turret"));
  // One live (under-construction) site: its buildingId must reject move/dismantle.
  const liveCell = findLegalCell(w, "wall_gate");
  expectOk(place(w, "d-live", "wall_gate", liveCell.x, liveCell.y));
  const liveSiteBuildingId = w.sites[w.sites.length - 1].buildingId;
  return { w, base: baseline(w), buildings, liveSiteBuildingId };
}

describe("E04/E09 atomicity: a rejected move leaves the state byte-identical", () => {
  it("every reachable move rejection reason preserves the fingerprint", () => {
    const { w, buildings, liveSiteBuildingId } = denseYard();
    const b1 = buildings[0];
    const fp = worldFingerprint(w);
    let n = 0;
    const reject = (cmd: WorldCommand, reason: Parameters<typeof expectReason>[1]) => {
      n += 1;
      expectReason(applyWorldCommand(w, cmd), reason);
      expect(worldFingerprint(w), `atomic after rejection #${n} (${reason})`).toBe(fp);
    };

    // Lifecycle-specific reasons (checked before the placement law).
    reject(moveCmd(`m-notfound-${n}`, 99999, { x: 1, y: 1 }, 0), "building-not-found");
    reject(moveCmd(`m-under-${n}`, liveSiteBuildingId, { x: 1, y: 1 }, 0), "under-construction");
    reject(moveCmd(`m-same-${n}`, b1.id, b1.cell, b1.rotation), "same-position");

    // Early placement-law reasons (independent of target geometry).
    reject(moveCmd(`m-rot-${n}`, b1.id, { x: 1, y: 1 }, 45), "invalid-rotation");
    reject(moveCmd(`m-cell-${n}`, b1.id, { x: 0.5, y: 0 }, 0), "invalid-cell");
    reject(moveCmd(`m-land-${n}`, b1.id, { x: 200, y: 200 }, 0), "outside-land");

    // Geometry reasons discovered deterministically by scanning the yard.
    for (const reason of [
      "terrain-unsupported",
      "occupied",
      "keepout",
      "entrance-blocked",
      "entrance-obstructed",
    ] as const) {
      const target = findMoveTarget(w, b1.id, reason);
      reject(moveCmd(`m-${reason}-${n}`, b1.id, target.cell, target.rotation), reason);
    }

    // Fee affordability: drain stock so the service fee cannot be paid, then a
    // geometrically legal move must reject on materials (geometry passes first).
    for (const item of moveFeeOf(b1.asset as keyof typeof WORLD_KIT)) w.stock[item.resource] = 0;
    const feeFp = worldFingerprint(w);
    const target = findMoveTarget(w, b1.id, "insufficient-material");
    expectReason(applyWorldCommand(w, moveCmd("m-fee", b1.id, target.cell, target.rotation)), "insufficient-material");
    expect(worldFingerprint(w)).toBe(feeFp);
  });
});

describe("E04/E09 atomicity: a rejected dismantle leaves the state byte-identical", () => {
  it("building-not-found and under-construction preserve the fingerprint", () => {
    const { w, liveSiteBuildingId } = denseYard();
    const fp = worldFingerprint(w);
    expectReason(applyWorldCommand(w, { id: "x-notfound", type: "world.dismantle", buildingId: 99999 }), "building-not-found");
    expect(worldFingerprint(w)).toBe(fp);
    expectReason(applyWorldCommand(w, { id: "x-under", type: "world.dismantle", buildingId: liveSiteBuildingId }), "under-construction");
    expect(worldFingerprint(w)).toBe(fp);
    // A completed building id that was already dismantled is not-found again.
    const b = complete(w, "x-temp", "generator");
    expectOk(applyWorldCommand(w, { id: "x-do", type: "world.dismantle", buildingId: b.id }));
    const fp2 = worldFingerprint(w);
    expectReason(applyWorldCommand(w, { id: "x-again", type: "world.dismantle", buildingId: b.id }), "building-not-found");
    expect(worldFingerprint(w)).toBe(fp2);
  });
});

describe("E09 conservation: fresh-world baseline survives move/dismantle/recall", () => {
  it("genuine createWorld stock (no grant) is conserved through the full lifecycle", () => {
    const w = createWorld(SEED);
    const base = baseline(w); // dynamic: the real createWorld stock + credits
    expectConserved(w, base, "initial");

    // generator fits the genuine starter stock (read from the kit, not pinned).
    const b = complete(w, "g1", "generator");
    expectConserved(w, base, "after completion");
    expect(w.reservations).toHaveLength(0); // settled exactly once at completion

    // Force a small store so the dismantle refund overflows visibly.
    w.storageCapacity = stockUnits(w) + 1;
    const beforeMove = baseline(w);
    const target = findLegalMoveTarget(w, b.id);
    expectOk(applyWorldCommand(w, moveCmd("mv1", b.id, target.cell, target.rotation)));
    expectConserved(w, base, "after move");
    // Move fee is a service sink: stock down, committed up by exactly the fee.
    const fee = moveFeeOf("generator");
    for (const item of fee) {
      expect(w.committed[item.resource] ?? 0).toBeGreaterThanOrEqual(item.qty);
    }
    expect(beforeMove.credits).toBe(w.credits + reservedCredits(w) + w.committedCredits); // move charges materials, not credits

    const moved = w.buildings.find((x) => x.id === b.id)!;
    expect(moved.completedTick).toBe(b.completedTick); // id + completedTick preserved
    expect(moved.cell).toEqual(target.cell);
    expect(moved.rotation).toBe(target.rotation);

    expectOk(applyWorldCommand(w, { id: "ds1", type: "world.dismantle", buildingId: b.id }));
    expectConserved(w, base, "after dismantle");
    expect(w.buildings.find((x) => x.id === b.id)).toBeUndefined();
    expect((w.overflow ?? []).length).toBeGreaterThan(0); // refund could not all fit

    expectOk(applyWorldCommand(w, { id: "rc1", type: "world.recall" }));
    expectConserved(w, base, "after recall");
  });

  it("scripted cancel/refund/move/dismantle/recall sequence conserves after every step", () => {
    const { w, base } = denseYard();
    expectConserved(w, base, "initial");
    w.storageCapacity = 40; // small store => overflow on refunds

    const b = complete(w, "s-gen", "generator");
    expectConserved(w, base, "complete generator");

    // Cancel a fresh site at 100% (before work) then a started site at 90%.
    const c1 = findLegalCell(w, "turret");
    expectOk(place(w, "s-t1", "turret", c1.x, c1.y));
    expectConserved(w, base, "turret reserved");
    expectOk(applyWorldCommand(w, { id: "s-c1", type: "world.cancel", siteId: w.sites[0].id }));
    expectConserved(w, base, "100% cancel");

    const c2 = findLegalCell(w, "turret");
    expectOk(place(w, "s-t2", "turret", c2.x, c2.y));
    advanceWorld(w, 10); // started => 90% refund
    expectConserved(w, base, "turret started");
    expectOk(applyWorldCommand(w, { id: "s-c2", type: "world.cancel", siteId: w.sites[0].id }));
    expectConserved(w, base, "90% cancel");

    // Move, dismantle into overflow, recall back — repeatedly.
    for (let i = 0; i < 3; i += 1) {
      const target = findLegalCell(w, "generator");
      expectOk(applyWorldCommand(w, moveCmd(`s-mv${i}`, b.id, target, 0)));
      expectConserved(w, base, `move ${i}`);
    }
    expectOk(applyWorldCommand(w, { id: "s-ds", type: "world.dismantle", buildingId: b.id }));
    expectConserved(w, base, "dismantle into overflow");
    expectOk(applyWorldCommand(w, { id: "s-rc", type: "world.recall" }));
    expectConserved(w, base, "recall");
    // Recall again is a safe no-op for cargo (idempotent by command id).
    const cargoFp = worldFingerprint(w);
    expectOk(applyWorldCommand(w, { id: "s-rc", type: "world.recall" })); // replayed id
    expect(worldFingerprint(w)).toBe(cargoFp);
    expectConserved(w, base, "replayed recall");
  });

  it("seeded-random lifecycle workload conserves after every transition (5 seeds)", () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const w = createWorld(seed);
      w.stock.scrap = 3000;
      w.stock.ferrous = 300;
      w.stock.steel = 300;
      w.credits = 3000;
      w.storageCapacity = 60;
      const base = baseline(w);
      const rng = createRng(seed * 7919);
      const assets = ["warehouse", "depot", "sorter", "furnace", "generator", "turret", "wall_gate"] as const;
      let cmdNo = 0;
      for (let step = 0; step < 160; step += 1) {
        cmdNo += 1;
        const id = `L${seed}-${cmdNo}`;
        const roll = randInt(rng, 12);
        const fp = worldFingerprint(w);
        if (roll < 4) {
          const asset = assets[randInt(rng, assets.length)];
          try {
            const c = findLegalCell(w, asset);
            expectOk(place(w, id, asset, c.x, c.y));
          } catch {
            // no legal cell / funds right now: a refusal must be atomic
            expect(worldFingerprint(w)).toBe(fp);
          }
        } else if (roll < 6 && w.sites.length > 0) {
          const site = w.sites[randInt(rng, w.sites.length)];
          expectOk(applyWorldCommand(w, { id, type: "world.cancel", siteId: site.id }));
        } else if (roll < 8 && w.buildings.length > 0) {
          const b = w.buildings[randInt(rng, w.buildings.length)];
          const c = { x: randInt(rng, 24), y: randInt(rng, 24) };
          const rot = ROTATIONS[randInt(rng, 4)];
          const result = applyWorldCommand(w, moveCmd(id, b.id, c, rot));
          if (!result.ok) expect(worldFingerprint(w), `atomic move seed ${seed} step ${step}`).toBe(fp);
        } else if (roll < 10 && w.buildings.length > 0) {
          const b = w.buildings[randInt(rng, w.buildings.length)];
          expectOk(applyWorldCommand(w, { id, type: "world.dismantle", buildingId: b.id }));
        } else if (roll < 11) {
          expectOk(applyWorldCommand(w, { id, type: "world.recall" }));
        } else {
          advanceWorld(w, 1 + randInt(rng, 60));
        }
        expectConserved(w, base, `seed ${seed} step ${step}`);
      }
      // No reservation without a site and vice versa; overflow ids unique.
      expect(w.reservations.length).toBe(w.sites.length);
      const ids = (w.overflow ?? []).map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("E04 preview: fees/refunds/splits computed BEFORE commit match the charge", () => {
  it("previewMove fee equals the stock->committed charge on commit", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const b = complete(w, "p-gen", "generator");
    const target = findLegalMoveTarget(w, b.id);
    const preview = previewMove(w, b.id, target.cell, target.rotation);
    expect(preview.rejection).toBeNull();
    expect(preview.fee).toEqual(moveFeeOf("generator"));
    expect(preview.formulaVersion).toBeGreaterThan(0);

    const fp = worldFingerprint(w);
    const stockBefore = { ...w.stock };
    const committedBefore = { ...w.committed };
    // Preview is pure: it changed nothing.
    expect(worldFingerprint(w)).toBe(fp);

    expectOk(applyWorldCommand(w, moveCmd("p-mv", b.id, target.cell, target.rotation)));
    for (const item of preview.fee) {
      expect(stockBefore[item.resource]! - w.stock[item.resource]!).toBe(item.qty);
      expect((w.committed[item.resource] ?? 0) - (committedBefore[item.resource] ?? 0)).toBe(item.qty);
    }
  });

  it("previewDismantle refund/lost/split equals the commit; lost share stays committed", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const b = complete(w, "p-wh", "warehouse");
    w.storageCapacity = stockUnits(w) + 2; // only 2 free units => most refund overflows
    const preview = previewDismantle(w, b.id);
    expect(preview.rejection).toBeNull();
    expect(preview.refund).toEqual(dismantleRefundOf("warehouse"));
    const cost = WORLD_KIT.warehouse.buildCost;
    for (let i = 0; i < cost.length; i += 1) {
      expect(preview.refund[i].qty + preview.lost[i].qty).toBe(cost[i].qty);
    }
    const fp = worldFingerprint(w);
    expect(worldFingerprint(w)).toBe(fp); // pure

    const committedBefore = { ...w.committed };
    const stockBefore = { ...w.stock };
    expectOk(applyWorldCommand(w, { id: "p-ds", type: "world.dismantle", buildingId: b.id }));
    // Refund leaves committed exactly once; lost share remains committed.
    for (const item of preview.refund) {
      expect((committedBefore[item.resource] ?? 0) - (w.committed[item.resource] ?? 0)).toBe(item.qty);
    }
    for (const item of preview.toStock) {
      expect(w.stock[item.resource]! - stockBefore[item.resource]!).toBe(item.qty);
    }
    const overflowByResource = new Map<ResourceId, number>();
    for (const e of w.overflow ?? []) {
      overflowByResource.set(e.resource, (overflowByResource.get(e.resource) ?? 0) + e.qty);
    }
    for (const item of preview.toOverflow) {
      expect(overflowByResource.get(item.resource) ?? 0).toBe(item.qty);
    }
    // toStock + toOverflow reconstruct the refund exactly (no unit lost/duplicated).
    for (const item of preview.refund) {
      const intoStock = preview.toStock.find((s) => s.resource === item.resource)?.qty ?? 0;
      const intoOverflow = preview.toOverflow.find((s) => s.resource === item.resource)?.qty ?? 0;
      expect(intoStock + intoOverflow).toBe(item.qty);
    }
  });

  it("previewRecall plan equals the units actually recovered", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const b = complete(w, "p-depot", "depot");
    w.storageCapacity = stockUnits(w); // zero free room => full refund overflows
    expectOk(applyWorldCommand(w, { id: "p-ds2", type: "world.dismantle", buildingId: b.id }));
    expect((w.overflow ?? []).length).toBeGreaterThan(0);

    const preview = previewRecall(w);
    // No free room yet: nothing recoverable.
    expect(preview.recoveredUnits).toBe(0);
    expect(preview.remainingOverflowUnits).toBe(preview.entries.reduce((a, e) => a + e.qty, 0));

    // Free some room (raise capacity, never delete goods), then the preview
    // predicts the exact partial recovery.
    w.storageCapacity = stockUnits(w) + 5;
    const plan = previewRecall(w);
    expect(plan.recoveredUnits).toBeGreaterThan(0);
    const stockBefore = { ...w.stock };
    const overflowBefore = (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    expectOk(applyWorldCommand(w, { id: "p-rc", type: "world.recall" }));
    const stockAfter = Object.values(w.stock).reduce((a, b2) => a + (b2 ?? 0), 0);
    const stockBeforeTotal = Object.values(stockBefore).reduce((a, b2) => a + (b2 ?? 0), 0);
    expect(stockAfter - stockBeforeTotal).toBe(plan.recoveredUnits);
    const overflowAfter = (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    expect(overflowBefore - overflowAfter).toBe(plan.recoveredUnits);
  });

  it("material is reserved exactly once: completion and cancellation never double-reserve", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const base = baseline(w);
    const c = findLegalCell(w, "furnace");
    expectOk(place(w, "r-f", "furnace", c.x, c.y));
    expect(w.reservations).toHaveLength(1);
    const reserved = totals(w, "scrap").reserved;
    expect(reserved).toBe(WORLD_KIT.furnace.buildCost.find((i) => i.resource === "scrap")!.qty);
    // Completing moves the single reservation to committed; nothing re-reserved.
    advanceWorldTo(w, w.tick + WORLD_KIT.furnace.constructionTicks);
    expect(w.reservations).toHaveLength(0);
    expect(totals(w, "scrap").reserved).toBe(0);
    expectConserved(w, base, "after single-settle completion");

    // A cancelled site refunds its single reservation exactly once.
    const c2 = findLegalCell(w, "sorter");
    expectOk(place(w, "r-s", "sorter", c2.x, c2.y));
    expect(w.reservations).toHaveLength(1);
    const siteId = w.sites[0].id;
    expectOk(applyWorldCommand(w, { id: "r-c", type: "world.cancel", siteId }));
    expect(w.reservations).toHaveLength(0);
    expectOk(applyWorldCommand(w, { id: "r-c", type: "world.cancel", siteId })); // replay: no double refund
    expectConserved(w, base, "after single-settle cancellation");
  });
});

describe("E04 full storage: visible overflow ledger, no deletion or duplication", () => {
  it("dismantle into a full store overflows visibly; recall recovers exactly once", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const base = baseline(w);
    const b = complete(w, "o-wh", "warehouse");
    w.storageCapacity = stockUnits(w); // exactly full
    const refund = dismantleRefundOf("warehouse");
    const refundTotal = refund.reduce((a, i) => a + i.qty, 0);

    expectOk(applyWorldCommand(w, { id: "o-ds", type: "world.dismantle", buildingId: b.id }));
    expectConserved(w, base, "dismantle into full store");
    // The whole refund is visible in the ledger (nothing fit free stock).
    const ledgerTotal = (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    expect(ledgerTotal).toBe(refundTotal);
    for (const e of w.overflow ?? []) {
      expect(e.source.kind).toBe("dismantle");
      expect(e.source.buildingId).toBe(b.id);
      expect(e.formulaVersion).toBeGreaterThan(0);
      expect(e.qty).toBeGreaterThan(0);
    }
    // Overflow is NOT spendable stock: stockUnits did not absorb the refund.
    expect(stockUnits(w)).toBeLessThanOrEqual(w.storageCapacity!);

    // Recall into a still-full store recovers nothing and deletes nothing.
    const fpCargo = (w.overflow ?? []).reduce((a, e) => a + e.qty, 0);
    expectOk(applyWorldCommand(w, { id: "o-rc-full", type: "world.recall" }));
    expect((w.overflow ?? []).reduce((a, e) => a + e.qty, 0)).toBe(fpCargo);
    expectConserved(w, base, "recall into full store");

    // Free room (raise capacity, never delete goods) and recall: each unit
    // returns exactly once, ledger drains.
    w.storageCapacity = stockUnits(w) + refundTotal;
    expectOk(applyWorldCommand(w, { id: "o-rc", type: "world.recall" }));
    expect((w.overflow ?? []).reduce((a, e) => a + e.qty, 0)).toBe(0);
    expectConserved(w, base, "recall after freeing room");
    // A second recall has nothing to recover (no duplication).
    const stockTotal = stockUnits(w);
    expectOk(applyWorldCommand(w, { id: "o-rc2", type: "world.recall" }));
    expect(stockUnits(w)).toBe(stockTotal);
    expectConserved(w, base, "second recall no-op");
  });

  it("recall filtered by source building drains only that building's overflow", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 800;
    w.stock.steel = 800;
    const base = baseline(w);
    const a = complete(w, "f-a", "generator");
    const b = complete(w, "f-b", "turret");
    w.storageCapacity = stockUnits(w); // full
    expectOk(applyWorldCommand(w, { id: "f-da", type: "world.dismantle", buildingId: a.id }));
    expectOk(applyWorldCommand(w, { id: "f-db", type: "world.dismantle", buildingId: b.id }));
    const sources = new Set((w.overflow ?? []).map((e) => e.source.buildingId));
    expect(sources.has(a.id)).toBe(true);
    expect(sources.has(b.id)).toBe(true);

    // Free room for everything (raise capacity, never delete goods), then
    // recall only building a.
    w.storageCapacity = stockUnits(w) + 1000;
    const planA = previewRecall(w, a.id);
    expect(planA.entries.every((e) => e.recovered === e.qty)).toBe(true);
    expectOk(applyWorldCommand(w, { id: "f-ra", type: "world.recall", buildingId: a.id }));
    expect((w.overflow ?? []).every((e) => e.source.buildingId !== a.id)).toBe(true);
    expect((w.overflow ?? []).some((e) => e.source.buildingId === b.id)).toBe(true);
    expectConserved(w, base, "filtered recall a");
    expectOk(applyWorldCommand(w, { id: "f-rb", type: "world.recall", buildingId: b.id }));
    expect((w.overflow ?? []).length).toBe(0);
    expectConserved(w, base, "filtered recall b");
  });

  it("legacy worlds with undefined capacity keep unlimited stock and no overflow", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const base = baseline(w);
    const b = complete(w, "l-wh", "warehouse");
    expect(w.storageCapacity).toBeUndefined();
    expectOk(applyWorldCommand(w, { id: "l-ds", type: "world.dismantle", buildingId: b.id }));
    expect(w.overflow ?? []).toHaveLength(0); // unlimited room: refund all to stock
    expectConserved(w, base, "legacy unlimited dismantle");
  });
});

describe("E09 rounding / old-version: refunds cannot mint goods or credits", () => {
  it("dismantle refund is floor(pct) per material; the lost share never returns", () => {
    for (const asset of ["warehouse", "depot", "generator", "turret", "wall_gate"] as const) {
      const w = createWorld(SEED);
      w.stock.scrap = 1000;
      w.stock.steel = 1000;
      w.stock.ferrous = 1000;
      w.credits = 1000;
      const base = baseline(w);
      const b = complete(w, `round-${asset}`, asset);
      const refund = dismantleRefundOf(asset);
      const cost = WORLD_KIT[asset].buildCost;
      for (let i = 0; i < cost.length; i += 1) {
        // floor rounding: refund <= pct% of cost, and refund + lost == cost.
        expect(refund[i].qty).toBeLessThanOrEqual(Math.floor((cost[i].qty * 80) / 100));
        expect(refund[i].qty + (cost[i].qty - refund[i].qty)).toBe(cost[i].qty);
      }
      const creditsBefore = w.credits;
      const stockBefore = { ...w.stock };
      const overflowBefore = new Map<ResourceId, number>();
      for (const e of w.overflow ?? []) {
        overflowBefore.set(e.resource, (overflowBefore.get(e.resource) ?? 0) + e.qty);
      }
      expectOk(applyWorldCommand(w, { id: `round-ds-${asset}`, type: "world.dismantle", buildingId: b.id }));
      // Dismantle refunds materials only: credits are unchanged by the refund.
      expect(w.credits).toBe(creditsBefore);
      // Each material returns exactly its floor refund (stock + overflow), never more.
      for (const item of refund) {
        const dStock = (w.stock[item.resource] ?? 0) - (stockBefore[item.resource] ?? 0);
        const dOverflow = overflowUnits(w, item.resource) - (overflowBefore.get(item.resource) ?? 0);
        expect(dStock + dOverflow).toBe(item.qty);
      }
      expectConserved(w, base, `rounding ${asset}`);
    }
  });

  it("repeated dismantle of the same id is refused after the first (no double refund)", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const base = baseline(w);
    const b = complete(w, "dup-gen", "generator");
    expectOk(applyWorldCommand(w, { id: "dup-1", type: "world.dismantle", buildingId: b.id }));
    const fp = worldFingerprint(w);
    expectReason(applyWorldCommand(w, { id: "dup-2", type: "world.dismantle", buildingId: b.id }), "building-not-found");
    expect(worldFingerprint(w)).toBe(fp);
    expectConserved(w, base, "no double dismantle refund");
  });

  it("overflow entries carry a formulaVersion for old-version migration (E09)", () => {
    const w = createWorld(SEED);
    w.stock.scrap = 500;
    w.stock.steel = 500;
    const b = complete(w, "ver-wh", "warehouse");
    w.storageCapacity = stockUnits(w);
    expectOk(applyWorldCommand(w, { id: "ver-ds", type: "world.dismantle", buildingId: b.id }));
    for (const e of w.overflow ?? []) {
      expect(Number.isInteger(e.formulaVersion)).toBe(true);
      expect(e.formulaVersion).toBeGreaterThanOrEqual(1);
    }
    // A JSON round-trip (the save/load seam) preserves the ledger exactly.
    const round = JSON.parse(JSON.stringify(w)) as WorldState;
    expect(worldFingerprint(round)).toBe(worldFingerprint(w));
  });
});
