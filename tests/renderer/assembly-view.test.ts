// @vitest-environment node
/**
 * RW3D T10 (#137): AssemblyView scene-graph tests. Numerical observation of
 * the live three.js graph (names, visibility, transforms, shared resources)
 * — no WebGL context needed, no pixels judged (non-vision agent).
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AssemblyView } from "../../src/game/renderer/three/assemblyView";
import type { AssemblyBuildingSnapshot, AssemblySnapshot } from "../../src/game/renderer/assembly";
import { KIT_GEOMETRY } from "../../src/game/renderer/kitGeometry";

const D = 50;

function bld(over: Partial<AssemblyBuildingSnapshot> = {}): AssemblyBuildingSnapshot {
  return {
    id: 1,
    asset: "warehouse",
    cell: { x: 2, y: 3 },
    rotation: 0,
    progressTicks: 0,
    durationTicks: D,
    completed: false,
    level: 1,
    ...over,
  };
}

function snap(buildings: AssemblyBuildingSnapshot[], tick = 0): AssemblySnapshot {
  return { tick, buildings };
}

function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object") {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe("AssemblyView scene graph", () => {
  it("builds named kit groups with correct hierarchy and placement", () => {
    const view = new AssemblyView();
    view.sync(snap([bld({ progressTicks: D, rotation: 90 })]), { reducedMotion: false, framePhase: 0 });
    const building = view.root.getObjectByName("building-1-warehouse") as THREE.Group;
    expect(building).toBeDefined();
    // Rotated footprint [6,4] -> [4,6]; center = cell + half rotated size.
    expect(building.position.x).toBeCloseTo(2 + 2, 6);
    expect(building.position.z).toBeCloseTo(3 + 3, 6);
    expect(building.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    for (const g of KIT_GEOMETRY.warehouse.groups) {
      expect(building.getObjectByName(g.name), `group ${g.name}`).toBeDefined();
    }
    const roof = building.getObjectByName("roof") as THREE.Group;
    const ventFan = building.getObjectByName("ventFan") as THREE.Group;
    expect(ventFan.parent).toBe(roof);
    const door0 = building.getObjectByName("door0") as THREE.Group;
    expect((building.getObjectByName("doorPanel0") as THREE.Mesh).parent).toBe(door0);
    expect((building.getObjectByName("foundation") as THREE.Mesh).parent).toBe(building);
    view.dispose();
  });

  it("stages visibility in order: 1/3/6/11/18 warehouse parts at the V05 clip points", () => {
    const view = new AssemblyView();
    const expected = [1, 3, 6, 11, 18, 18];
    const names = ["base", "frame", "walls", "roof", "activation", "activation"];
    [0, 10, 20, 30, 40, 50].forEach((p, i) => {
      view.sync(snap([bld({ progressTicks: p })], p), { reducedMotion: false, framePhase: 0 });
      const [r] = view.stageReport();
      expect(r.visibleParts, `progress ${p}`).toBe(expected[i]);
      expect(r.stageName).toBe(names[i]);
      expect(r.done).toBe(p === 50);
      expect(r.totalParts).toBe(18);
    });
    view.dispose();
  });

  it("applies mechanical entrance transforms to part meshes, rest at completion", () => {
    const view = new AssemblyView();
    view.sync(snap([bld({ progressTicks: 0 })]), { reducedMotion: false, framePhase: 0 });
    const foundation = view.root.getObjectByName("foundation") as THREE.Mesh;
    expect(foundation.visible).toBe(true);
    expect(foundation.position.y).toBeCloseTo(0.1 + 0.25, 6);
    const pier = view.root.getObjectByName("centerPier") as THREE.Mesh;
    expect(pier.visible).toBe(false);

    view.sync(snap([bld({ progressTicks: D })], D), { reducedMotion: false, framePhase: 0 });
    expect(foundation.position.y).toBeCloseTo(0.1, 6);
    expect(pier.visible).toBe(true);
    expect(pier.scale.y).toBeCloseTo(2, 6); // kit size.y, sy = 1
    view.dispose();
  });

  it("reduced motion keeps staged visibility but every transform at rest", () => {
    const view = new AssemblyView();
    view.sync(snap([bld({ progressTicks: 3 })]), { reducedMotion: true, framePhase: 0.5 });
    const foundation = view.root.getObjectByName("foundation") as THREE.Mesh;
    expect(foundation.visible).toBe(true);
    expect(foundation.position.y).toBeCloseTo(0.1, 6); // no settle interpolation
    const [r] = view.stageReport();
    expect(r.visibleParts).toBe(1);
    for (const g of r.idleGroups) {
      expect(g.rotation).toEqual([0, 0, 0]);
    }
    view.dispose();
  });

  it("idle mechanisms animate from (tick + framePhase) only when completed", () => {
    const view = new AssemblyView();
    // Mid-build: no idle motion even with a phase.
    view.sync(snap([bld({ progressTicks: 45 })], 45), { reducedMotion: false, framePhase: 0.5 });
    let [r] = view.stageReport();
    for (const g of r.idleGroups) expect(g.rotation).toEqual([0, 0, 0]);

    // Completed at tick 0, phase 0: identity (deterministic seam).
    view.sync(snap([bld({ progressTicks: D })], 0), { reducedMotion: false, framePhase: 0 });
    [r] = view.stageReport();
    const vent0 = r.idleGroups.find((g) => g.name === "ventFan")!;
    expect(vent0.rotation[1]).toBe(0);

    // Same tick, later phase: fan has turned, lift has raised.
    view.sync(snap([bld({ progressTicks: D })], 0), { reducedMotion: false, framePhase: 0.5 });
    [r] = view.stageReport();
    const vent1 = r.idleGroups.find((g) => g.name === "ventFan")!;
    expect(vent1.rotation[1]).toBeCloseTo((2 * Math.PI * 0.5) / 17, 6);
    const lift = r.idleGroups.find((g) => g.name === "palletLift")!;
    const kitLift = KIT_GEOMETRY.warehouse.groups.find((g) => g.name === "palletLift")!;
    expect(lift.position[1]).toBeGreaterThan(kitLift.position[1]);

    // Reduced motion: identical state renders static.
    view.sync(snap([bld({ progressTicks: D })], D), { reducedMotion: true, framePhase: 0.5 });
    [r] = view.stageReport();
    for (const g of r.idleGroups) {
      expect(g.rotation).toEqual([0, 0, 0]);
    }
    view.dispose();
  });

  it("upgrade modules appear from level alone and rebuild only on identity change", () => {
    const view = new AssemblyView();
    view.sync(snap([bld({ progressTicks: D, level: 3 })], D), { reducedMotion: false, framePhase: 0 });
    const building = view.root.getObjectByName("building-1-warehouse") as THREE.Group;
    expect(building.getObjectByName("upgradeModule1")).toBeDefined();
    expect(building.getObjectByName("upgradeModule2")).toBeDefined();
    expect(building.getObjectByName("upgradeModule3")).toBeUndefined();
    expect(view.stageReport()[0].upgradeModules).toBe(2);

    // Progress-only update keeps the same group instance (no rebuild).
    view.sync(snap([bld({ progressTicks: D, level: 3 })], D + 1), { reducedMotion: false, framePhase: 0 });
    expect(view.root.getObjectByName("building-1-warehouse")).toBe(building);

    // Level change rebuilds with the new module set.
    view.sync(snap([bld({ progressTicks: D, level: 1 })], D + 2), { reducedMotion: false, framePhase: 0 });
    const rebuilt = view.root.getObjectByName("building-1-warehouse") as THREE.Group;
    expect(rebuilt).not.toBe(building);
    expect(rebuilt.getObjectByName("upgradeModule1")).toBeUndefined();
    expect(view.stageReport()[0].upgradeModules).toBe(0);
    view.dispose();
  });

  it("reconciles removals and shares geometry/materials across buildings", () => {
    const view = new AssemblyView();
    const a = bld({ id: 1, progressTicks: D });
    const b = bld({ id: 2, asset: "depot", cell: { x: 12, y: 3 }, progressTicks: D });
    view.sync(snap([a, b], D), { reducedMotion: false, framePhase: 0 });
    expect(view.root.children).toHaveLength(2);
    const counts = view.resourceCounts();
    expect(counts.geometries).toBe(1);
    expect(counts.materials).toBe(10);
    const f1 = (view.root.children[0] as THREE.Group).getObjectByName("foundation") as THREE.Mesh;
    const f2 = (view.root.children[1] as THREE.Group).getObjectByName("foundation") as THREE.Mesh;
    expect(f1.geometry).toBe(f2.geometry);
    expect(f1.material).toBe(f2.material); // both steel

    view.sync(snap([a], D), { reducedMotion: false, framePhase: 0 });
    expect(view.root.children).toHaveLength(1);
    expect(view.stageReport().map((r) => r.id)).toEqual([1]);
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });

  it("never mutates the caller's snapshot (frozen inputs accepted)", () => {
    const view = new AssemblyView();
    const frozen = deepFreeze(snap([bld({ progressTicks: 25 })], 25));
    expect(() => {
      view.sync(frozen, { reducedMotion: false, framePhase: 0.25 });
      view.sync(frozen, { reducedMotion: true, framePhase: 0.75 });
    }).not.toThrow();
    expect(frozen.buildings[0].progressTicks).toBe(25);
    view.dispose();
  });

  it("clamps out-of-range framePhase without a clock read", () => {
    const view = new AssemblyView();
    view.sync(snap([bld({ progressTicks: D })], 0), { reducedMotion: false, framePhase: 5 });
    const [r] = view.stageReport();
    const vent = r.idleGroups.find((g) => g.name === "ventFan")!;
    expect(vent.rotation[1]).toBeCloseTo((2 * Math.PI * 1) / 17, 6);
    view.dispose();
  });
});
