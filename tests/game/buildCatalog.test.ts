/**
 * T11 (#138): the build catalog, pure placement preview and the store's
 * session-only BuildPlacementApi slice.
 *
 * Reproducible: every scenario derives from fixed seeds (world helper SEED 133,
 * store session seed 138) and integer ledgers — no wall clock, no randomness.
 * Acceptance mapping: U01 (ghost facts before placement), U02 (explicit
 * confirm/cancel + repeat, no accidental buys), U03 (locked/unaffordable
 * reasons with preserved selection context).
 */
import { describe, expect, it } from "vitest";
import {
  BUILD_CATALOG,
  BUILD_READY_TEXT,
  buildShortfalls,
  canAffordBuild,
  catalogEntry,
  firstFitCell,
  labelForBuildReject,
  previewBuildPlacement,
  rotateQuarter,
  unlockStatusFor,
  type BuildUnlockContext,
} from "../../src/game/world/buildCatalog";
import { WORLD_ASSET_IDS, WORLD_KIT, type WorldAssetId } from "../../src/game/world/kit";
import type { Rotation } from "../../src/game/world/types";
import type { WorldRejection } from "../../src/game/world/transactions";
import { createStore, type BuildConfirmResult } from "../../src/app/store";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { cloneWorld, expectOk, expectReason, findLegalCell, newWorld, place } from "./world/helpers";

const freshCtx: BuildUnlockContext = { research: {}, milestoneTokens: 0 };

/** Byte fingerprint of the world ledger: refusals must leave it identical. */
const fingerprint = (w: ReturnType<typeof newWorld>): string => JSON.stringify(w);

/**
 * The frozen world helpers speak WorldCommandResult; confirmBuildPlacement
 * widens that union with pre-transaction guards (no-selection/no-ghost/locked/
 * read-only). These local assertions narrow the union first, then delegate to
 * the frozen authority — the helpers themselves stay untouched.
 */
function expectBuildOk(
  result: BuildConfirmResult,
): asserts result is { ok: true; revision: number } {
  if (!result.ok) {
    throw new Error(`expected build confirm ok, got ${JSON.stringify(result)}`);
  }
  expectOk(result);
}

function expectBuildReason(
  result: BuildConfirmResult,
  reason: WorldRejection["reason"],
): asserts result is { ok: false; rejection: WorldRejection } {
  if (result.ok || "reason" in result) {
    throw new Error(`expected world rejection '${reason}', got ${JSON.stringify(result)}`);
  }
  expectReason(result, reason);
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    raw: map,
  };
}

describe("T11 catalog data (kit parity)", () => {
  it("enumerates every placeable kit asset in kit order, never hiding one", () => {
    expect(BUILD_CATALOG.map((entry) => entry.id)).toEqual([...WORLD_ASSET_IDS]);
    expect(BUILD_CATALOG).toHaveLength(8);
  });

  it("mirrors the kit's footprint, cost, credits and assembly duration", () => {
    for (const entry of BUILD_CATALOG) {
      const asset = WORLD_KIT[entry.id];
      expect(entry.footprint).toEqual({ w: asset.footprint[0], h: asset.footprint[1] });
      expect(entry.cost).toEqual(asset.buildCost);
      expect(entry.credits).toBe(asset.creditCost);
      expect(entry.constructionTicks).toBe(asset.constructionTicks);
      expect(entry.rotation).toBe("quarter-turns");
      expect(entry.sockets.map((s) => s.name)).toEqual(asset.sockets.map((s) => s.name));
    }
    expect(catalogEntry("warehouse").name).toBe("Warehouse");
    expect(() => catalogEntry("bogus" as WorldAssetId)).toThrow(/unknown catalog asset/);
  });
});

describe("T11 unlock rules (U03: locked entries print their reason)", () => {
  it("keeps the P1 core five always available", () => {
    for (const id of ["warehouse", "depot", "sorter", "furnace", "generator"] as const) {
      expect(unlockStatusFor(id, freshCtx)).toEqual({ unlocked: true, reason: null });
    }
  });

  it("locks crane behind Route Dispatch research and defense behind a milestone", () => {
    expect(unlockStatusFor("crane", freshCtx)).toEqual({
      unlocked: false,
      reason: "Requires Route Dispatch research",
    });
    for (const id of ["turret", "wall_gate"] as const) {
      expect(unlockStatusFor(id, freshCtx)).toEqual({
        unlocked: false,
        reason: "Requires a defense milestone",
      });
    }
  });

  it("unlocks crane at dispatch rank > 0 and defense at one milestone token", () => {
    const researched: BuildUnlockContext = { research: { dispatch: 1 }, milestoneTokens: 0 };
    expect(unlockStatusFor("crane", researched).unlocked).toBe(true);
    expect(unlockStatusFor("turret", researched).unlocked).toBe(false);
    const defended: BuildUnlockContext = { research: {}, milestoneTokens: 1 };
    expect(unlockStatusFor("turret", defended).unlocked).toBe(true);
    expect(unlockStatusFor("wall_gate", defended).unlocked).toBe(true);
    expect(unlockStatusFor("crane", defended).unlocked).toBe(false);
  });
});

describe("T11 exact shortfalls (U01/U03: have/need, never vague)", () => {
  it("reports nothing when the world ledger can pay", () => {
    const w = newWorld();
    expect(buildShortfalls(w, "warehouse")).toEqual([]);
    expect(canAffordBuild(w, "warehouse")).toBe(true);
  });

  it("reports the exact material line in kit order", () => {
    const w = newWorld();
    w.stock.steel = 2;
    expect(buildShortfalls(w, "warehouse")).toEqual([
      { resource: "steel", need: 8, have: 2 },
    ]);
    expect(canAffordBuild(w, "warehouse")).toBe(false);
  });

  it("reports credits after materials", () => {
    const w = newWorld();
    w.credits = 5;
    expect(buildShortfalls(w, "generator")).toEqual([
      { resource: "credits", need: 25, have: 5 },
    ]);
    w.stock.scrap = 3;
    expect(buildShortfalls(w, "generator")).toEqual([
      { resource: "scrap", need: 20, have: 3 },
      { resource: "credits", need: 25, have: 5 },
    ]);
  });
});

describe("T11 rotation and preview (U01: the ghost never lies)", () => {
  it("cycles quarter turns", () => {
    expect(rotateQuarter(0)).toBe(90);
    expect(rotateQuarter(90)).toBe(180);
    expect(rotateQuarter(180)).toBe(270);
    expect(rotateQuarter(270)).toBe(0);
  });

  it("previews a valid placement with footprint, front and ready text", () => {
    const w = newWorld();
    const cell = firstFitCell(w, "warehouse", 0);
    expect(cell).not.toBeNull();
    const preview = previewBuildPlacement(w, "warehouse", cell as { x: number; y: number }, 0);
    expect(preview.valid).toBe(true);
    expect(preview.rejection).toBeNull();
    expect(preview.reason).toBe(BUILD_READY_TEXT);
    expect(preview.footprint).toEqual({ w: 6, h: 4 });
    expect(preview.front).toEqual({ dx: 0, dy: 1 });
    expect(preview.cells).toHaveLength(24);
    expect(preview.shortfalls).toEqual([]);
  });

  it("rotates the footprint and the frontage together", () => {
    const w = newWorld();
    const cell = { x: 2, y: 2 };
    const at90 = previewBuildPlacement(w, "warehouse", cell, 90);
    expect(at90.footprint).toEqual({ w: 4, h: 6 });
    expect(at90.front).toEqual({ dx: 1, dy: 0 });
    const at180 = previewBuildPlacement(w, "warehouse", cell, 180);
    expect(at180.front).toEqual({ dx: 0, dy: -1 });
    const at270 = previewBuildPlacement(w, "warehouse", cell, 270);
    expect(at270.footprint).toEqual({ w: 4, h: 6 });
    expect(at270.front).toEqual({ dx: -1, dy: 0 });
  });

  it("refuses outside land, occupancy and drained stock with typed reasons", () => {
    const w = newWorld();
    const outside = previewBuildPlacement(w, "warehouse", { x: -1, y: 0 }, 0);
    expect(outside.valid).toBe(false);
    expect(outside.rejection?.reason).toBe("outside-land");
    expect(outside.reason).toContain("Outside owned land");

    const cell = findLegalCell(w, "warehouse");
    expectOk(place(w, "p1", "warehouse", cell.x, cell.y));
    const occupied = previewBuildPlacement(w, "warehouse", cell, 0);
    expect(occupied.rejection?.reason).toBe("occupied");
    expect(occupied.reason).toContain("occupied");

    const drained = newWorld();
    drained.stock.steel = 0;
    // Validation order contract: the origin footprint crosses salvage ground
    // (seed 133, cell 1,0), so the SITE refusal wins even with drained stock —
    // the ghost must name the terrain, never a misleading cost line.
    const rough = previewBuildPlacement(drained, "warehouse", { x: 0, y: 0 }, 0);
    expect(rough.rejection?.reason).toBe("terrain-unsupported");
    expect(rough.reason).toBe("Salvage terrain cannot support this building — pick flat ground.");
    // On buildable ground the same drained ledger prints the exact material
    // line: arming is cost-tolerant, so the ghost lands on a site whose only
    // refusal is affordability (U03).
    const site = firstFitCell(drained, "warehouse", 0);
    expect(site).not.toBeNull();
    const poor = previewBuildPlacement(drained, "warehouse", site as { x: number; y: number }, 0);
    expect(poor.rejection?.reason).toBe("insufficient-material");
    expect(poor.reason).toBe("Need 8 steel (have 0).");
    expect(poor.shortfalls).toEqual([{ resource: "steel", need: 8, have: 0 }]);
  });

  it("arms deterministically: firstFitCell matches the row-major legal scan", () => {
    const w = newWorld();
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const fit = firstFitCell(w, "warehouse", rotation);
      expect(fit).toEqual(findLegalCell(w, "warehouse", rotation));
    }
    expect(firstFitCell(w, "warehouse", 0)).toEqual(firstFitCell(cloneWorld(w), "warehouse", 0));
    // Cost-tolerant arming: draining the ledger changes the ghost's REASON,
    // never its site — the first buildable cell is a property of the ground.
    const drained = cloneWorld(w);
    drained.stock.steel = 0;
    drained.credits = 0;
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      expect(firstFitCell(drained, "warehouse", rotation)).toEqual(
        firstFitCell(w, "warehouse", rotation),
      );
    }
  });

  it("labels every rejection tag with a non-empty recovery line", () => {
    const samples: WorldRejection[] = [
      { reason: "unknown-asset", asset: "bogus" },
      { reason: "invalid-rotation", rotation: 45 },
      { reason: "invalid-cell", cell: { x: 0.5, y: 0 } },
      { reason: "outside-land", cells: [{ x: -1, y: 0 }] },
      { reason: "terrain-unsupported", cells: [{ x: 0, y: 0 }], terrain: "rough" },
      { reason: "occupied", cells: [{ x: 0, y: 0 }], occupantId: 1 },
      { reason: "keepout", craneId: 1, cells: [{ x: 0, y: 0 }] },
      { reason: "entrance-blocked", socket: "bay0", blocker: "occupancy", cells: [] },
      { reason: "entrance-obstructed", ownerId: 1, socket: "bay0", cells: [] },
      { reason: "vertical-clearance", asset: "wall_gate", effectiveMu: 0, requiredMu: 150 },
      { reason: "insufficient-material", resource: "steel", need: 8, have: 2 },
      { reason: "insufficient-credits", need: 20, have: 5 },
      { reason: "site-not-found", siteId: 1 },
      { reason: "parcel-not-found", parcelId: 9 },
      { reason: "already-owned", parcelId: 0 },
      { reason: "not-contiguous", parcelId: 9 },
      { reason: "milestone-locked", parcelId: 9 },
    ];
    for (const rejection of samples) {
      const label = labelForBuildReject(rejection);
      expect(label.length, rejection.reason).toBeGreaterThan(0);
    }
    expect(labelForBuildReject({ reason: "insufficient-material", resource: "steel", need: 8, have: 2 })).toBe(
      "Need 8 steel (have 2).",
    );
    expect(labelForBuildReject({ reason: "insufficient-credits", need: 20, have: 5 })).toBe(
      "Need 20 credits (have 5).",
    );
    expect(
      labelForBuildReject({ reason: "terrain-unsupported", cells: [{ x: 0, y: 0 }], terrain: "rough" }),
    ).toBe("Rough terrain cannot support this building — pick flat ground.");
  });
});

describe("T11 store slice: session-only placement state machine", () => {
  it("starts idle with the fixed-seed yard and never touches the save slot", () => {
    const store = createStore({ storage: null });
    const placement = store.getBuildPlacement();
    expect(placement).toEqual({
      selectedAsset: null,
      rotation: 0,
      ghostCell: null,
      mode: "idle",
      repeat: false,
      lastRejection: null,
      placedCount: 0,
    });
    const w = store.getBuildWorld();
    expect(w.seed).toBe(138);
    expect(w.revision).toBe(0);
    expect(w.credits).toBe(60);
    expect(w.stock).toEqual({ scrap: 120, ferrous: 12, steel: 12 });
  });

  it("arms a valid ghost on selection and refuses locked entries with context kept (U03)", () => {
    const store = createStore({ storage: null });
    expect(store.selectBuildAsset("warehouse")).toEqual({ ok: true });
    const armed = store.getBuildPlacement();
    expect(armed.selectedAsset).toBe("warehouse");
    expect(armed.mode).toBe("placing");
    expect(armed.ghostCell).not.toBeNull();
    const preview = previewBuildPlacement(
      store.getBuildWorld(),
      "warehouse",
      armed.ghostCell as { x: number; y: number },
      armed.rotation,
    );
    expect(preview.valid).toBe(true);

    // Locked crane refuses with its reason; the warehouse stays armed.
    const refused = store.selectBuildAsset("crane");
    expect(refused).toEqual({
      ok: false,
      reason: "locked",
      detail: "Requires Route Dispatch research",
    });
    expect(store.getBuildPlacement().selectedAsset).toBe("warehouse");
    expect(store.getBuildPlacement().ghostCell).toEqual(armed.ghostCell);

    expect(store.selectBuildAsset("bogus" as WorldAssetId).ok).toBe(false);
    expect(store.getBuildPlacement().selectedAsset).toBe("warehouse");
  });

  it("confirms one atomic placement: exact deduction, one site, then idle (U02)", () => {
    const store = createStore({ storage: null });
    store.selectBuildAsset("warehouse");
    const before = fingerprint(store.getBuildWorld());
    const result = store.confirmBuildPlacement();
    expectBuildOk(result);
    expect(result.ok && result.revision).toBe(1);
    const w = store.getBuildWorld();
    expect(w.stock.scrap).toBe(90);
    expect(w.stock.steel).toBe(4);
    expect(w.credits).toBe(40);
    expect(w.sites).toHaveLength(1);
    expect(w.reservations).toHaveLength(1);
    expect(w.buildings).toHaveLength(0);
    expect(before).not.toBe(fingerprint(w));
    const after = store.getBuildPlacement();
    expect(after.mode).toBe("idle");
    expect(after.selectedAsset).toBeNull();
    expect(after.ghostCell).toBeNull();
    expect(after.placedCount).toBe(1);
  });

  it("guards confirm without a selection and leaves the ledger byte-identical (U02)", () => {
    const store = createStore({ storage: null });
    const before = fingerprint(store.getBuildWorld());
    expect(store.confirmBuildPlacement()).toEqual({ ok: false, reason: "no-selection" });
    expect(fingerprint(store.getBuildWorld())).toBe(before);
    expect(store.getBuildPlacement().placedCount).toBe(0);
  });

  it("repeat mode keeps the ghost armed and charges each placement separately (U02)", () => {
    const store = createStore({ storage: null });
    store.toggleBuildRepeat();
    expect(store.getBuildPlacement().repeat).toBe(true);
    expect(store.getBuildPlacement().mode).toBe("idle");
    store.selectBuildAsset("sorter");
    expect(store.getBuildPlacement().mode).toBe("repeating");

    expectBuildOk(store.confirmBuildPlacement());
    const first = store.getBuildPlacement();
    expect(first.mode).toBe("repeating");
    expect(first.selectedAsset).toBe("sorter");
    expect(first.ghostCell).not.toBeNull();
    expect(first.placedCount).toBe(1);
    expect(store.getBuildWorld().stock.scrap).toBe(100);

    // Re-aim at the next fitting cell: the second placement validates on its own.
    const next = firstFitCell(store.getBuildWorld(), "sorter", 0);
    expect(next).not.toBeNull();
    store.setBuildGhostCell(next as { x: number; y: number });
    expectBuildOk(store.confirmBuildPlacement());
    const w = store.getBuildWorld();
    expect(w.sites).toHaveLength(2);
    expect(w.stock.scrap).toBe(80);
    expect(store.getBuildPlacement().placedCount).toBe(2);
    expect(store.getBuildPlacement().mode).toBe("repeating");
  });

  it("preserve-on-refusal: a blocked confirm keeps the armed ghost and spends nothing (U03)", () => {
    const store = createStore({ storage: null });
    store.selectBuildAsset("warehouse");
    const cell = store.getBuildPlacement().ghostCell as { x: number; y: number };
    expectBuildOk(store.confirmBuildPlacement());
    // Re-arm the same asset on the now-occupied cell.
    store.selectBuildAsset("warehouse");
    store.setBuildGhostCell(cell);
    const before = fingerprint(store.getBuildWorld());
    const result = store.confirmBuildPlacement();
    expectBuildReason(result, "occupied");
    const placement = store.getBuildPlacement();
    expect(placement.selectedAsset).toBe("warehouse");
    expect(placement.ghostCell).toEqual(cell);
    expect(placement.lastRejection?.reason).toBe("occupied");
    expect(fingerprint(store.getBuildWorld())).toBe(before);
  });

  it("unaffordable entries arm with the exact shortfall and refuse the confirm (U03)", () => {
    const store = createStore({ storage: null });
    store.getBuildWorld().stock.steel = 2;
    expect(store.selectBuildAsset("warehouse")).toEqual({ ok: true });
    const before = fingerprint(store.getBuildWorld());
    const result = store.confirmBuildPlacement();
    expectBuildReason(result, "insufficient-material");
    if (!result.ok && result.rejection.reason === "insufficient-material") {
      expect(result.rejection).toMatchObject({ resource: "steel", need: 8, have: 2 });
    }
    const placement = store.getBuildPlacement();
    expect(placement.selectedAsset).toBe("warehouse");
    expect(placement.ghostCell).not.toBeNull();
    expect(placement.lastRejection?.reason).toBe("insufficient-material");
    expect(fingerprint(store.getBuildWorld())).toBe(before);
  });

  it("cancel disarms without any spend and keeps the repeat preference (U02)", () => {
    const store = createStore({ storage: null });
    store.toggleBuildRepeat();
    store.selectBuildAsset("warehouse");
    store.rotateBuildAsset();
    const before = fingerprint(store.getBuildWorld());
    store.cancelBuildPlacement();
    const placement = store.getBuildPlacement();
    expect(placement.selectedAsset).toBeNull();
    expect(placement.ghostCell).toBeNull();
    expect(placement.rotation).toBe(0);
    expect(placement.mode).toBe("idle");
    expect(placement.repeat).toBe(true);
    expect(fingerprint(store.getBuildWorld())).toBe(before);
  });

  it("rotates the armed ghost and ignores fractional cells", () => {
    const store = createStore({ storage: null });
    store.rotateBuildAsset(); // idle: no-op
    expect(store.getBuildPlacement().rotation).toBe(0);
    store.selectBuildAsset("warehouse");
    store.rotateBuildAsset();
    expect(store.getBuildPlacement().rotation).toBe(90);
    const preview = previewBuildPlacement(
      store.getBuildWorld(),
      "warehouse",
      store.getBuildPlacement().ghostCell as { x: number; y: number },
      90,
    );
    expect(preview.footprint).toEqual({ w: 4, h: 6 });
    const cell = store.getBuildPlacement().ghostCell as { x: number; y: number };
    store.setBuildGhostCell({ x: 1.5, y: 2 });
    expect(store.getBuildPlacement().ghostCell).toEqual(cell);
    store.setBuildGhostCell({ x: 3, y: 4 });
    expect(store.getBuildPlacement().ghostCell).toEqual({ x: 3, y: 4 });
  });

  it("advances construction with the authoritative ticks (5 s assembly)", () => {
    const store = createStore({ storage: null });
    store.selectBuildAsset("warehouse");
    expectBuildOk(store.confirmBuildPlacement());
    expect(store.getBuildWorld().sites).toHaveLength(1);
    store.step(49);
    expect(store.getBuildWorld().sites).toHaveLength(1);
    store.step(1);
    expect(store.getBuildWorld().sites).toHaveLength(0);
    expect(store.getBuildWorld().buildings).toHaveLength(1);
  });

  it("never persists the build yard: the save slot stays untouched by placement", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    store.selectBuildAsset("warehouse");
    expectBuildOk(store.confirmBuildPlacement());
    // The confirm path never calls persist: no SAVE_KEY write from the slice.
    expect(storage.raw.has(SAVE_KEY)).toBe(false);
    // The legacy sim still persists on its own cadence, without world fields.
    store.step(1);
    const raw = storage.raw.get(SAVE_KEY);
    expect(raw).toBeDefined();
    expect(raw).not.toContain('"terrain"');
    expect(raw).not.toContain('"parcels"');
    expect(raw).not.toContain('"milestoneTokens"');
  });

  it("gates confirm to the writer tab; readers preview but never commit", () => {
    const storage = memoryStorage();
    const writer = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    const reader = createStore({ storage, now: () => 1_000, leaseId: "tab-b" });
    expect(writer.getRole()).toBe("writer");
    expect(reader.getRole()).toBe("reader");

    // Selection and previews are free for any role.
    expect(reader.selectBuildAsset("warehouse")).toEqual({ ok: true });
    const before = fingerprint(reader.getBuildWorld());
    expect(reader.confirmBuildPlacement()).toEqual({ ok: false, reason: "read-only" });
    expect(fingerprint(reader.getBuildWorld())).toBe(before);
    expect(reader.getBuildPlacement().selectedAsset).toBe("warehouse");

    // The owner tab commits normally; the build yard is session-local per tab
    // (#148 owns the shared persistence), so the reader's yard stays untouched.
    writer.selectBuildAsset("warehouse");
    expectBuildOk(writer.confirmBuildPlacement());
    expect(writer.getBuildWorld().sites).toHaveLength(1);
    expect(reader.getBuildWorld().sites).toHaveLength(0);
  });
});