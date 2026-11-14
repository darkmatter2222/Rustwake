/**
 * Placement law (issue #133): typed rejections for every failure class,
 * structural atomicity (rejected command = byte-identical state), crane
 * keep-out clearance, entrance corridors both directions, wall_gate
 * blockout/production modes, and contiguous milestone-gated expansion.
 */
import { describe, expect, it } from "vitest";
import {
  PARCEL_CREDIT_COST,
  ROTATIONS,
  WORLD_KIT,
  applyWorldCommand,
  cellOwned,
  centerMu,
  entranceCorridor,
  footprintCells,
  rectCellsMu,
  rectIntersectsDisc,
  cellRectMu,
  terrainAt,
  validatePlacement,
  worldFingerprint,
  type Cell,
  type Rotation,
  type WorldRejection,
  type WorldState,
} from "../../../src/game/world";
import {
  SEED,
  expectOk,
  expectReason,
  findCellWhere,
  findLegalCell,
  newWorld,
  place,
} from "./helpers";

/** Scan start land x four yaws for the first placement yielding a reason. */
function findRejection(
  w: WorldState,
  asset: string,
  reason: WorldRejection["reason"],
  blocker?: string,
): { cell: Cell; rotation: Rotation; rejection: WorldRejection } {
  for (const rotation of ROTATIONS) {
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const cell = { x, y };
        const rejection = validatePlacement(w, asset, cell, rotation);
        if (rejection === null || rejection.reason !== reason) continue;
        if (blocker !== undefined && "blocker" in rejection && rejection.blocker !== blocker) continue;
        return { cell, rotation, rejection };
      }
    }
  }
  throw new Error(`no ${asset} placement yields ${reason}${blocker ? "/" + blocker : ""} (seed ${w.seed})`);
}

/** Assert a command rejects with the reason AND leaves state byte-identical. */
function expectAtomicRejection(
  w: WorldState,
  asset: string,
  cell: Cell,
  rotation: number,
  reason: WorldRejection["reason"],
): WorldRejection {
  const before = worldFingerprint(w);
  const revisionBefore = w.revision;
  const seenBefore = Object.keys(w.seenCommands).length;
  const result = place(w, `reject-${reason}-${cell.x}-${cell.y}-${rotation}`, asset, cell.x, cell.y, rotation);
  const rejection = expectReason(result, reason);
  expect(worldFingerprint(w), `atomicity: ${reason} must not mutate state`).toBe(before);
  expect(w.revision).toBe(revisionBefore);
  expect(Object.keys(w.seenCommands).length).toBe(seenBefore);
  return rejection;
}

describe("typed rejections are atomic (fingerprint unchanged)", () => {
  it("unknown-asset", () => {
    const w = newWorld();
    const r = expectAtomicRejection(w, "millennium-falcon", { x: 8, y: 8 }, 0, "unknown-asset");
    expect(r).toEqual({ reason: "unknown-asset", asset: "millennium-falcon" });
  });

  it("invalid-rotation (only 0/90/180/270 are legal)", () => {
    const w = newWorld();
    for (const bad of [45, 1, -90, 360, 90.5]) {
      const r = expectAtomicRejection(w, "generator", { x: 8, y: 8 }, bad, "invalid-rotation");
      expect(r).toEqual({ reason: "invalid-rotation", rotation: bad });
    }
  });

  it("invalid-cell (non-integer coordinates)", () => {
    const w = newWorld();
    expectAtomicRejection(w, "generator", { x: 1.5, y: 8 }, 0, "invalid-cell");
    expectAtomicRejection(w, "generator", { x: 8, y: Number.NaN }, 0, "invalid-cell");
  });

  it("outside-land (unowned ring and beyond the plan)", () => {
    const w = newWorld();
    const r1 = expectAtomicRejection(w, "generator", { x: -1, y: 8 }, 0, "outside-land");
    expect(r1.reason).toBe("outside-land");
    expectAtomicRejection(w, "generator", { x: 24, y: 8 }, 0, "outside-land");
    expectAtomicRejection(w, "generator", { x: 40, y: 8 }, 0, "outside-land");
  });

  it("terrain-unsupported on salvage and rough ground", () => {
    const w = newWorld();
    const salvage = findCellWhere(w, (c) => terrainAt(w, c.x, c.y) === "salvage");
    const r1 = expectAtomicRejection(w, "generator", salvage, 0, "terrain-unsupported");
    expect(r1).toMatchObject({ reason: "terrain-unsupported", terrain: "salvage" });
    const rough = findCellWhere(w, (c) => terrainAt(w, c.x, c.y) === "rough");
    const r2 = expectAtomicRejection(w, "generator", rough, 0, "terrain-unsupported");
    expect(r2).toMatchObject({ reason: "terrain-unsupported", terrain: "rough" });
  });

  it("occupied (site occupies from the moment of reservation)", () => {
    const w = newWorld();
    const c = findLegalCell(w, "generator");
    expectOk(place(w, "g1", "generator", c.x, c.y));
    const r = expectAtomicRejection(w, "generator", c, 0, "occupied");
    expect(r).toMatchObject({ reason: "occupied", occupantId: 1 });
    // Partial overlap rejects too.
    expectAtomicRejection(w, "generator", { x: c.x + 1, y: c.y }, 0, "occupied");
  });

  it("insufficient-material reports need/have per resource", () => {
    const w = newWorld();
    const c = findLegalCell(w, "sorter");
    w.stock.scrap = 5;
    const r = expectAtomicRejection(w, "sorter", c, 0, "insufficient-material");
    expect(r).toEqual({ reason: "insufficient-material", resource: "scrap", need: 20, have: 5 });
  });

  it("insufficient-credits reports need/have", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    w.credits = 3;
    const r = expectAtomicRejection(w, "warehouse", c, 0, "insufficient-credits");
    expect(r).toEqual({ reason: "insufficient-credits", need: 20, have: 3 });
  });
});

describe("crane keep-out zone (clearance, not occupancy)", () => {
  it("footprints inside the swing disc reject with keepout", () => {
    const w = newWorld();
    const c = findLegalCell(w, "crane");
    expectOk(place(w, "crane1", "crane", c.x, c.y));
    const [cx, cz] = centerMu(c, WORLD_KIT.crane.footprint, 0);
    const r = WORLD_KIT.crane.keepoutRadiusMu!;
    // Find a flat, owned, unoccupied cell whose rect touches the disc.
    const craneCells = new Set(footprintCells(c, WORLD_KIT.crane.footprint, 0).map((f) => `${f.x},${f.y}`));
    const inside = findCellWhere(w, (cell) => {
      if (!cellOwned(w, cell.x, cell.y)) return false;
      if (terrainAt(w, cell.x, cell.y) !== "flat") return false;
      const fp = footprintCells(cell, WORLD_KIT.generator.footprint, 0);
      if (fp.some((f) => craneCells.has(`${f.x},${f.y}`))) return false;
      if (fp.some((f) => !cellOwned(w, f.x, f.y) || terrainAt(w, f.x, f.y) !== "flat")) return false;
      return rectIntersectsDisc(cellRectMu(cell), cx, cz, r);
    });
    const rejection = expectAtomicRejection(w, "generator", inside, 0, "keepout");
    expect(rejection).toMatchObject({ reason: "keepout", craneId: 1 });
  });

  it("footprints fully outside the disc are legal", () => {
    const w = newWorld();
    const c = findLegalCell(w, "crane");
    expectOk(place(w, "crane1", "crane", c.x, c.y));
    w.stock.steel = (w.stock.steel ?? 0) + 10; // fund the scenario: crane 6 + generator 8 > seed steel 12
    const [cx, cz] = centerMu(c, WORLD_KIT.crane.footprint, 0);
    const r = WORLD_KIT.crane.keepoutRadiusMu!;
    const outside = findLegalCell(w, "generator", 0, (cell) => {
      const fp = footprintCells(cell, WORLD_KIT.generator.footprint, 0);
      return fp.every((f) => !rectIntersectsDisc(cellRectMu(f), cx, cz, r + 1000));
    });
    expectOk(place(w, "g-far", "generator", outside.x, outside.y));
  });

  it("crane-vs-crane is symmetric: overlapping swings reject both ways", () => {
    const w = newWorld();
    const c = findLegalCell(w, "crane");
    expectOk(place(w, "craneA", "crane", c.x, c.y));
    // A second crane 4 u away: its disc covers A's footprint edge (2.5 u < 2.508 u).
    const offsets: Cell[] = [
      { x: 4, y: 0 },
      { x: -4, y: 0 },
      { x: 0, y: 4 },
      { x: 0, y: -4 },
    ];
    let tested = 0;
    for (const off of offsets) {
      const cell = { x: c.x + off.x, y: c.y + off.y };
      const fp = footprintCells(cell, WORLD_KIT.crane.footprint, 0);
      if (fp.some((f) => !cellOwned(w, f.x, f.y) || terrainAt(w, f.x, f.y) !== "flat")) continue;
      const rejection = expectAtomicRejection(w, "crane", cell, 0, "keepout");
      expect(rejection.reason).toBe("keepout");
      tested += 1;
    }
    expect(tested, "at least one nearby crane offset must be testable on seed " + SEED).toBeGreaterThanOrEqual(1);
  });

  it("a crane may not be placed where its swing covers an existing footprint", () => {
    const w = newWorld();
    const g = findLegalCell(w, "generator");
    expectOk(place(w, "g1", "generator", g.x, g.y));
    // Crane centered 3 u from the 2x2 generator: disc edge distance is
    // 3000 - 1000 = 2000 mu < 2508 mu, so the swing covers the generator.
    const offsets: Cell[] = [
      { x: 3, y: 0 },
      { x: -3, y: 0 },
      { x: 0, y: 3 },
      { x: 0, y: -3 },
    ];
    let tested = 0;
    for (const off of offsets) {
      const cell = { x: g.x + off.x, y: g.y + off.y };
      const fp = footprintCells(cell, WORLD_KIT.crane.footprint, 0);
      if (fp.some((f) => !cellOwned(w, f.x, f.y) || terrainAt(w, f.x, f.y) !== "flat")) continue;
      expectAtomicRejection(w, "crane", cell, 0, "keepout");
      tested += 1;
    }
    expect(tested).toBeGreaterThanOrEqual(1);
  });
});

describe("entrance corridors", () => {
  it("candidate corridor blocked by an existing footprint -> entrance-blocked/occupancy", () => {
    const w = newWorld();
    const g = findLegalCell(w, "generator");
    expectOk(place(w, "g1", "generator", g.x, g.y));
    const found = findRejection(w, "warehouse", "entrance-blocked", "occupancy");
    const r = expectAtomicRejection(w, "warehouse", found.cell, found.rotation, "entrance-blocked");
    expect(r).toMatchObject({ reason: "entrance-blocked", blocker: "occupancy" });
  });

  it("candidate corridor running off owned land -> entrance-blocked/land", () => {
    const w = newWorld();
    const found = findRejection(w, "warehouse", "entrance-blocked", "land");
    expectAtomicRejection(w, "warehouse", found.cell, found.rotation, "entrance-blocked");
  });

  it("candidate corridor over salvage -> entrance-blocked/terrain", () => {
    const w = newWorld();
    const found = findRejection(w, "warehouse", "entrance-blocked", "terrain");
    expectAtomicRejection(w, "warehouse", found.cell, found.rotation, "entrance-blocked");
  });

  it("candidate corridor through a crane swing -> entrance-blocked/keepout", () => {
    const w = newWorld();
    // Explicit clear-zone geometry (seed-independent): the crane at (9,7) has
    // disc center (10500, 8500) mu, r = 2508. A warehouse at (8,14) rot 180
    // keeps its footprint out of the disc (nearest edge dz = 5500 mu) while
    // bay1's corridor (x 8200..10700, z 11000..14000) reaches dz = 2500 mu:
    // 2500^2 = 6250000 <= 2508^2 = 6290064, so the swing blocks the entrance.
    expectOk(place(w, "crane1", "crane", 9, 7));
    w.stock.steel = (w.stock.steel ?? 0) + 10; // fund the scenario: crane 6 + warehouse 8 > seed steel 12
    const cell = { x: 8, y: 14 };
    expect(validatePlacement(w, "warehouse", cell, 180)).toMatchObject({
      reason: "entrance-blocked",
      socket: "bay1",
      blocker: "keepout",
    });
    const r = expectAtomicRejection(w, "warehouse", cell, 180, "entrance-blocked");
    expect(r).toMatchObject({ reason: "entrance-blocked", socket: "bay1", blocker: "keepout" });
  });

  it("new footprint may not obstruct an EXISTING entrance -> entrance-obstructed", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    expectOk(place(w, "wh1", "warehouse", c.x, c.y));
    const found = findRejection(w, "generator", "entrance-obstructed");
    const r = expectAtomicRejection(w, "generator", found.cell, found.rotation, "entrance-obstructed");
    expect(r).toMatchObject({ reason: "entrance-obstructed", ownerId: 1 });
    if ("socket" in r) expect(typeof r.socket).toBe("string");
  });

  it("a crane swing may not cover an existing entrance -> entrance-obstructed", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    expectOk(place(w, "wh1", "warehouse", c.x, c.y));
    const found = findRejection(w, "crane", "entrance-obstructed");
    expectAtomicRejection(w, "crane", found.cell, found.rotation, "entrance-obstructed");
  });

  it("two warehouses may share a road: corridors overlap, footprints do not", () => {
    const w = newWorld();
    w.stock.steel = (w.stock.steel ?? 0) + 16; // fund the pair: 2 x 8 steel > seed steel 12
    // Facing pair across a shared 3 u road, found by scan on the clear zone.
    let placed = false;
    outer: for (let y = 6; y <= 12; y += 1) {
      for (let x = 6; x <= 12; x += 1) {
        const a = { x, y };
        const b = { x, y: y + 7 }; // 4 deep + 3 road
        if (validatePlacement(w, "warehouse", a, 0) !== null) continue;
        if (validatePlacement(w, "warehouse", b, 180) !== null) continue;
        expectOk(place(w, "whA", "warehouse", a.x, a.y, 0));
        expectOk(place(w, "whB", "warehouse", b.x, b.y, 180));
        const corrA = entranceCorridor(WORLD_KIT.warehouse, a, 0, WORLD_KIT.warehouse.sockets[0]);
        // rot 180 mirrors the bays: B's bay1 faces A's bay0 across the road.
        const corrB = entranceCorridor(WORLD_KIT.warehouse, b, 180, WORLD_KIT.warehouse.sockets[1]);
        const cellsA = rectCellsMu(corrA).map((c) => `${c.x},${c.y}`);
        const cellsB = new Set(rectCellsMu(corrB).map((c) => `${c.x},${c.y}`));
        expect(cellsA.some((k) => cellsB.has(k)), "corridors should share the road").toBe(true);
        placed = true;
        break outer;
      }
    }
    expect(placed, "a facing warehouse pair must fit the clear zone").toBe(true);
  });
});

describe("wall_gate vertical clearance (product ruling b)", () => {
  it("blockout accepts the 50 mu effective rest margin", () => {
    const w = newWorld();
    expect(w.clearanceMode).toBe("blockout");
    const c = findLegalCell(w, "wall_gate");
    expectOk(place(w, "gate1", "wall_gate", c.x, c.y));
  });

  it("production rejects with vertical-clearance 50 < 150, atomically", () => {
    const w = newWorld();
    // Find the cell in blockout (legal there), then switch to production.
    const c = findLegalCell(w, "wall_gate");
    w.clearanceMode = "production";
    const before = worldFingerprint(w);
    const r = expectAtomicRejection(w, "wall_gate", c, 0, "vertical-clearance");
    expect(r).toEqual({
      reason: "vertical-clearance",
      asset: "wall_gate",
      effectiveMu: 50,
      requiredMu: 150,
    });
    expect(worldFingerprint(w)).toBe(before);
  });
});

describe("expansion parcels", () => {
  it("requires a milestone token, contiguity and payment; charges once", () => {
    const w = newWorld();
    // Parcel 2 is (0,-8): edge-contiguous with start land.
    const locked = applyWorldCommand(w, { id: "x0", type: "world.expand", parcelId: 2 });
    expectReason(locked, "milestone-locked");
    expect(w.parcels.find((p) => p.id === 2)!.owned).toBe(false);

    w.milestoneTokens = 1;
    const before = worldFingerprint(w);
    const ok = applyWorldCommand(w, { id: "x1", type: "world.expand", parcelId: 2 });
    expectOk(ok);
    expect(w.parcels.find((p) => p.id === 2)!.owned).toBe(true);
    expect(w.stock.scrap).toBe(120 - 30);
    expect(w.credits).toBe(60 - PARCEL_CREDIT_COST);
    expect(w.committed.scrap).toBe(30);
    expect(w.committedCredits).toBe(PARCEL_CREDIT_COST);
    expect(w.milestoneTokens).toBe(0);
    expect(worldFingerprint(w)).not.toBe(before);

    const again = applyWorldCommand(w, { id: "x2", type: "world.expand", parcelId: 2 });
    expectReason(again, "already-owned");
  });

  it("corner parcel is not-contiguous until a neighbor is owned", () => {
    const w = newWorld();
    w.milestoneTokens = 2;
    // Parcel 1 is the (-8,-8) corner: touches start land only at a point.
    expectReason(applyWorldCommand(w, { id: "c1", type: "world.expand", parcelId: 1 }), "not-contiguous");
    expectOk(applyWorldCommand(w, { id: "c2", type: "world.expand", parcelId: 2 }));
    expectOk(applyWorldCommand(w, { id: "c3", type: "world.expand", parcelId: 1 }));
    expect(w.parcels.find((p) => p.id === 1)!.owned).toBe(true);
  });

  it("unknown parcel and insufficient funds reject atomically", () => {
    const w = newWorld();
    w.milestoneTokens = 1;
    const beforeUnknown = worldFingerprint(w);
    expectReason(applyWorldCommand(w, { id: "n1", type: "world.expand", parcelId: 999 }), "parcel-not-found");
    expect(worldFingerprint(w)).toBe(beforeUnknown);
    w.stock.scrap = 0; // deliberate scenario mutation; re-baseline the fingerprint
    const beforeBroke = worldFingerprint(w);
    expectReason(applyWorldCommand(w, { id: "n2", type: "world.expand", parcelId: 2 }), "insufficient-material");
    expect(worldFingerprint(w)).toBe(beforeBroke);
  });

  it("newly owned parcel becomes buildable", () => {
    const w = newWorld();
    w.milestoneTokens = 1;
    expectOk(applyWorldCommand(w, { id: "e1", type: "world.expand", parcelId: 2 }));
    const cell = { x: 1, y: -7 };
    expect(cellOwned(w, cell.x, cell.y)).toBe(true);
    expectOk(place(w, "g-new", "generator", cell.x, cell.y));
  });
});

describe("validation order is deterministic", () => {
  it("land before terrain before occupancy before materials", () => {
    const w = newWorld();
    w.stock.scrap = 0; // would fail materials last
    // Off-land cell that is also rough-ish: land must win.
    const r = validatePlacement(w, "generator", { x: -1, y: -1 }, 0);
    expect(r?.reason).toBe("outside-land");
    // Salvage cell with zero stock: terrain must win over materials.
    const salvage = findCellWhere(w, (c) => terrainAt(w, c.x, c.y) === "salvage");
    const r2 = validatePlacement(w, "generator", salvage, 0);
    expect(r2?.reason).toBe("terrain-unsupported");
  });
});