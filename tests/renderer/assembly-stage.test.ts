// @vitest-environment node
/**
 * RW3D T10 (#137): pure assembly controller — stage clock, part poses,
 * upgrade modules, and the WorldState -> presentation adapter.
 * Numerical only (non-vision agent); visual fidelity is a capable
 * reviewer's verdict, not asserted here.
 */
import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_STAGES,
  assemblyStageAt,
  buildingStageReport,
  partAssemblyPose,
  stageBoundary,
  upgradeModulesFor,
  UPGRADE_MODULE_CAP,
  worldAssemblySnapshot,
} from "../../src/game/renderer/assembly";
import { KIT_GEOMETRY, KIT_PALETTE } from "../../src/game/renderer/kitGeometry";
import { WORLD_ASSET_IDS } from "../../src/game/world/kit";
import { advanceWorldTo, applyWorldCommand, worldFingerprint } from "../../src/game/world";
import { findLegalCell, newWorld, place } from "../game/world/helpers";

const D = 50; // P1 construction duration, ticks (5 s at TICK_MS 100)

describe("stage clock (ART_AND_MOTION timeline, V05 five stages)", () => {
  it("maps the 50-tick reference to exact integer boundaries", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => stageBoundary(i, D))).toEqual([0, 6, 16, 28, 38, 50]);
  });

  it("scales boundaries for other durations without floats", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => stageBoundary(i, 100))).toEqual([0, 12, 32, 56, 76, 100]);
    for (const d of [1, 7, 50, 133, 500]) {
      for (let i = 0; i <= 5; i += 1) expect(Number.isInteger(stageBoundary(i, d))).toBe(true);
    }
  });

  it("V05 clip points 0/1/2/3/4/5 s show base/frame/walls/roof/activation/complete", () => {
    const names = [0, 10, 20, 30, 40, 50].map((t) => {
      const s = assemblyStageAt(t, D);
      return s.done ? "complete" : s.name;
    });
    expect(names).toEqual(["base", "frame", "walls", "roof", "activation", "complete"]);
  });

  it("stage boundaries are exact and monotone over the whole build", () => {
    const expected: Array<[number, number]> = [
      [0, 0], [5, 0], [6, 1], [15, 1], [16, 2], [27, 2], [28, 3], [37, 3], [38, 4], [49, 4],
    ];
    for (const [p, stage] of expected) {
      const s = assemblyStageAt(p, D);
      expect(s.stage, `progress ${p}`).toBe(stage);
      expect(s.name).toBe(ASSEMBLY_STAGES[stage]);
      expect(s.done).toBe(false);
      expect(s.localT).toBeGreaterThanOrEqual(0);
      expect(s.localT).toBeLessThanOrEqual(1000);
    }
    let prev = -1;
    for (let p = 0; p <= D; p += 1) {
      const s = assemblyStageAt(p, D);
      expect(s.stage).toBeGreaterThanOrEqual(prev);
      prev = s.stage;
    }
    expect(assemblyStageAt(D, D).done).toBe(true);
    expect(assemblyStageAt(D + 99, D).done).toBe(true);
  });

  it("clamps degenerate inputs deterministically", () => {
    expect(assemblyStageAt(-5, D).stage).toBe(0);
    expect(assemblyStageAt(0, 0).done).toBe(true);
    expect(assemblyStageAt(3, -2).done).toBe(true);
  });

  it("is a pure function: identical inputs, identical outputs", () => {
    for (let p = 0; p <= D; p += 7) {
      expect(JSON.stringify(assemblyStageAt(p, D))).toEqual(JSON.stringify(assemblyStageAt(p, D)));
    }
  });
});

describe("part poses (mechanical entrances, no balloon scaling)", () => {
  it("foundation settles from +0.25 u during base", () => {
    const start = partAssemblyPose("warehouse", "foundation", 0, D, false);
    expect(start.visible).toBe(true);
    expect(start.dy).toBeCloseTo(0.25, 6);
    const mid = partAssemblyPose("warehouse", "foundation", 3, D, false);
    expect(mid.dy).toBeCloseTo(0.125, 6); // smoothstep(0.5) = 0.5
    expect(partAssemblyPose("warehouse", "foundation", 6, D, false).dy).toBe(0);
  });

  it("frame parts rise with a pinned bottom edge", () => {
    expect(partAssemblyPose("warehouse", "centerPier", 5, D, false).visible).toBe(false);
    const start = partAssemblyPose("warehouse", "centerPier", 6, D, false);
    expect(start.visible).toBe(true);
    expect(start.sy).toBeCloseTo(0.001, 6);
    // centerPier size.y = 2: bottom pinned means dy = -(2/2)*(1-sy).
    expect(start.dy).toBeCloseTo(-0.999, 6);
    const rest = partAssemblyPose("warehouse", "centerPier", 16, D, false);
    expect(rest.sy).toBe(1);
    expect(rest.dy).toBe(0);
  });

  it("wall modules translate in from their own side", () => {
    const back = partAssemblyPose("warehouse", "back", 16, D, false);
    expect(back.visible).toBe(true);
    expect(back.dx).toBeCloseTo(0.6, 6); // center.x = 0 -> +X side
    const left = partAssemblyPose("warehouse", "side-1", 16, D, false);
    expect(left.dx).toBeCloseTo(-0.6, 6);
    expect(partAssemblyPose("warehouse", "side-1", 28, D, false).dx).toBe(0);
  });

  it("roof settles from +0.8 u; doors align from +0.5 u; mechanisms switch on", () => {
    expect(partAssemblyPose("warehouse", "roofBase", 28, D, false).dy).toBeCloseTo(0.8, 6);
    expect(partAssemblyPose("warehouse", "doorPanel0", 38, D, false).dy).toBeCloseTo(0.5, 6);
    const vent = partAssemblyPose("warehouse", "ventAxle", 38, D, false);
    expect(vent.visible).toBe(true);
    expect(vent.dy).toBe(0); // idle motion belongs to the view layer
  });

  it("nothing is visible before its stage; everything rests at completion", () => {
    for (const asset of WORLD_ASSET_IDS) {
      const parts = KIT_GEOMETRY[asset].parts;
      let prevVisible = 0;
      for (let p = 0; p <= D; p += 1) {
        let visible = 0;
        for (const part of parts) {
          const pose = partAssemblyPose(asset, part.name, p, D, false);
          if (pose.visible) visible += 1;
          expect(pose.sy).toBeGreaterThan(0);
          if (p === D) {
            expect(pose.dx).toBe(0);
            expect(pose.dy).toBe(0);
            expect(pose.dz).toBe(0);
            expect(pose.sy).toBe(1);
          }
        }
        expect(visible, `${asset} visible count monotone at ${p}`).toBeGreaterThanOrEqual(prevVisible);
        prevVisible = visible;
      }
      expect(prevVisible).toBe(parts.length);
    }
  });

  it("reduced motion: discrete static stages, every transform at rest (U07)", () => {
    for (const asset of WORLD_ASSET_IDS) {
      for (let p = 0; p <= D; p += 3) {
        for (const part of KIT_GEOMETRY[asset].parts) {
          const pose = partAssemblyPose(asset, part.name, p, D, true);
          expect(pose.dx).toBe(0);
          expect(pose.dy).toBe(0);
          expect(pose.dz).toBe(0);
          expect(pose.sy).toBe(1);
          // Visibility still staged: same discrete membership as full motion.
          const full = partAssemblyPose(asset, part.name, p, D, false);
          expect(pose.visible).toBe(full.visible);
        }
      }
    }
  });

  it("unknown parts are hidden, never invented", () => {
    expect(partAssemblyPose("warehouse", "notAPart", 25, D, false).visible).toBe(false);
  });
});

describe("upgrade modules (presentation of sim level, never a cost)", () => {
  it("one named module per level above 1, capped", () => {
    expect(upgradeModulesFor("warehouse", 1)).toEqual([]);
    expect(upgradeModulesFor("warehouse", 2).map((m) => m.name)).toEqual(["upgradeModule1"]);
    expect(upgradeModulesFor("warehouse", 5)).toHaveLength(UPGRADE_MODULE_CAP);
    expect(upgradeModulesFor("warehouse", 99)).toHaveLength(UPGRADE_MODULE_CAP);
    expect(upgradeModulesFor("warehouse", 0)).toEqual([]);
  });

  it("modules stay inside the footprint and use palette materials", () => {
    for (const asset of WORLD_ASSET_IDS) {
      const [w, d] = KIT_GEOMETRY[asset].footprint;
      for (const m of upgradeModulesFor(asset, 1 + UPGRADE_MODULE_CAP)) {
        expect(Math.abs(m.center[0]) + m.size[0] / 2).toBeLessThanOrEqual(w / 2 + 1e-9);
        expect(Math.abs(m.center[2]) + m.size[2] / 2).toBeLessThanOrEqual(d / 2 + 1e-9);
        expect(m.center[1]).toBeGreaterThan(0);
        expect(m.material in KIT_PALETTE).toBe(true);
      }
    }
  });

  it("is deterministic for identical (asset, level)", () => {
    expect(JSON.stringify(upgradeModulesFor("depot", 4))).toEqual(JSON.stringify(upgradeModulesFor("depot", 4)));
  });
});

describe("worldAssemblySnapshot adapter (economy state -> presentation)", () => {
  it("sites render integer progress; completion flips exactly at the settle tick", () => {
    const w = newWorld();
    const cell = findLegalCell(w, "warehouse");
    const res = place(w, "p1", "warehouse", cell.x, cell.y);
    expect(res.ok).toBe(true);
    const site = w.sites[0];
    expect(site.durationTicks).toBe(D);

    advanceWorldTo(w, 25);
    const mid = worldAssemblySnapshot(w);
    expect(mid.tick).toBe(25);
    expect(mid.buildings).toHaveLength(1);
    expect(mid.buildings[0].completed).toBe(false);
    expect(mid.buildings[0].progressTicks).toBe(25);
    expect(assemblyStageAt(25, D).name).toBe("walls");

    advanceWorldTo(w, D);
    const done = worldAssemblySnapshot(w);
    expect(done.buildings).toHaveLength(1);
    expect(done.buildings[0].completed).toBe(true);
    expect(done.buildings[0].id).toBe(site.buildingId);
    expect(w.sites).toHaveLength(0);
    expect(w.buildings).toHaveLength(1);
  });

  it("levels come from the caller's sim lookup, default 1", () => {
    const w = newWorld();
    const cell = findLegalCell(w, "depot");
    expect(place(w, "p1", "depot", cell.x, cell.y).ok).toBe(true);
    advanceWorldTo(w, D);
    const id = w.buildings[0].id;
    expect(worldAssemblySnapshot(w).buildings[0].level).toBe(1);
    expect(worldAssemblySnapshot(w, (bid) => (bid === id ? 3 : 1)).buildings[0].level).toBe(3);
    expect(buildingStageReport(worldAssemblySnapshot(w, () => 3).buildings[0]).upgradeModules).toBe(2);
  });

  it("duplicate place command never double-charges (E02) and snapshot stays stable", () => {
    const w = newWorld();
    const cell = findLegalCell(w, "warehouse");
    expect(place(w, "p1", "warehouse", cell.x, cell.y).ok).toBe(true);
    const fpAfterPlace = worldFingerprint(w);
    const again = applyWorldCommand(w, { id: "p1", type: "world.place", asset: "warehouse", cell, rotation: 0 });
    expect(again.ok).toBe(true);
    expect(worldFingerprint(w)).toBe(fpAfterPlace);
    expect(w.sites).toHaveLength(1);
    expect(w.reservations).toHaveLength(1);
  });

  it("stage report counts match the kit part table", () => {
    const w = newWorld();
    const cell = findLegalCell(w, "warehouse");
    expect(place(w, "p1", "warehouse", cell.x, cell.y).ok).toBe(true);
    const at0 = buildingStageReport(worldAssemblySnapshot(w).buildings[0]);
    expect(at0.stageName).toBe("base");
    expect(at0.visibleParts).toBe(1); // foundation only
    expect(at0.totalParts).toBe(KIT_GEOMETRY.warehouse.parts.length);
    advanceWorldTo(w, D);
    const atEnd = buildingStageReport(worldAssemblySnapshot(w).buildings[0]);
    expect(atEnd.done).toBe(true);
    expect(atEnd.visibleParts).toBe(atEnd.totalParts);
  });
});
