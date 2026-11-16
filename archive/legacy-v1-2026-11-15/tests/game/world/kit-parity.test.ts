// @vitest-environment node
/**
 * Kit parity guard (issue #133): the embedded placement table must match the
 * authored kit (docs/vision/assets/kit.json, T04 / PR #190) exactly, and the
 * binding clearance numbers must re-derive from the authored geometry.
 * Read-only: this test never writes kit assets. kit.json is imported as a
 * JSON module (resolveJsonModule) so no node built-ins or DOM are needed.
 */
import { describe, expect, it } from "vitest";
import kitJson from "../../../docs/vision/assets/kit.json";
import { BLUEPRINTS } from "../../../src/game/content/defs";
import {
  CRANE_SWING_RADIUS_MU,
  GATE_EFFECTIVE_MARGIN_MU,
  GATE_OPEN_CLEAR_MU,
  MU_PER_UNIT,
  PRODUCTION_MIN_MARGIN_MU,
  TRUCK_ACTUAL_WIDTH_MU,
  TRUCK_GROUND_FLOAT_MU,
  TRUCK_HEIGHT_MU,
  WORLD_ASSET_IDS,
  WORLD_KIT,
} from "../../../src/game/world";

interface KitJsonSocket {
  name: string;
  position: [number, number, number];
  kind: string;
  approach: [number, number, number];
  clearanceWidth: number;
}
interface KitJsonPart {
  name: string;
  parent: string;
  center: [number, number, number];
  size: [number, number, number];
}
interface KitJsonGroup {
  name: string;
  parent: string;
  position: [number, number, number];
}
interface KitJsonAsset {
  id: string;
  footprint: [number, number];
  front: string;
  parts: KitJsonPart[];
  groups: KitJsonGroup[];
  sockets?: KitJsonSocket[];
  animations?: { name: string; target: string; values: [number, number, number][] }[];
}

// JSON modules infer number[] rather than tuples; the authored schema is
// asserted here and every field used below is checked against WORLD_KIT.
const kit = kitJson as unknown as { assets: KitJsonAsset[] };
const byId = new Map(kit.assets.map((a) => [a.id, a]));
const mu = (v: number): number => Math.round(v * MU_PER_UNIT);

describe("embedded kit table matches authored kit.json", () => {
  it("covers exactly the eight placeable assets (vehicles/worker excluded)", () => {
    expect([...WORLD_ASSET_IDS].sort()).toEqual(
      ["crane", "depot", "furnace", "generator", "sorter", "turret", "wall_gate", "warehouse"].sort(),
    );
    for (const excluded of ["truck", "forklift", "drone", "worker"]) {
      expect(byId.has(excluded)).toBe(true); // authored, but not placeable
      expect(WORLD_ASSET_IDS.includes(excluded as never)).toBe(false);
    }
  });

  for (const assetId of WORLD_ASSET_IDS) {
    it(`${assetId}: footprint, front and sockets match kit.json`, () => {
      const authored = byId.get(assetId);
      expect(authored, `kit.json missing ${assetId}`).toBeDefined();
      const embedded = WORLD_KIT[assetId];
      expect(embedded.footprint).toEqual(authored!.footprint);
      expect(authored!.front).toBe("+Z");
      const authoredSockets = authored!.sockets ?? [];
      expect(embedded.sockets.length).toBe(authoredSockets.length);
      for (let i = 0; i < authoredSockets.length; i += 1) {
        const a = authoredSockets[i];
        const e = embedded.sockets[i];
        expect(e.name).toBe(a.name);
        expect(e.kind).toBe(a.kind);
        expect([e.x, e.z]).toEqual([mu(a.position[0]), mu(a.position[2])]);
        expect(e.clearanceWidth).toBe(mu(a.clearanceWidth));
        expect(a.approach).toEqual([0, 0, 1]); // front +Z approach
      }
    });
  }

  it("sorter/furnace costs reuse the audited v1 content tables", () => {
    expect(WORLD_KIT.sorter.buildCost).toEqual(BLUEPRINTS.sorter.buildCost);
    expect(WORLD_KIT.furnace.buildCost).toEqual(BLUEPRINTS.furnace.buildCost);
  });
});

describe("binding clearance numbers re-derive from authored geometry", () => {
  it("crane swing radius from boom corner about the slew axis = 2508 mu", () => {
    const crane = byId.get("crane")!;
    const slew = crane.groups.find((g) => g.name === "slew")!;
    const boom = crane.parts.find((p) => p.name === "boom")!;
    expect(boom.parent).toBe("slew");
    // Slew rotates about the vertical axis through its own x/z origin.
    expect([slew.position[0], slew.position[2]]).toEqual([0, 0]);
    const farX = mu(boom.center[0] + boom.size[0] / 2);
    const farZ = mu(boom.size[2] / 2);
    const radius = Math.ceil(Math.sqrt(farX * farX + farZ * farZ));
    expect([farX, farZ]).toEqual([2500, 200]);
    expect(radius).toBe(2508);
    expect(CRANE_SWING_RADIUS_MU).toBe(radius);
  });

  it("truck wheel-inclusive width = 1180 mu (overhang beats nominal 1000)", () => {
    const truck = byId.get("truck")!;
    const wheelGroups = truck.groups.filter((g) => g.name.startsWith("wheel_"));
    expect(wheelGroups.length).toBe(6);
    let maxEdge = 0;
    for (const g of wheelGroups) {
      const mesh = truck.parts.find((p) => p.parent === g.name)!;
      const edge = mu(Math.abs(g.position[0]) + mesh.size[0] / 2);
      maxEdge = Math.max(maxEdge, edge);
    }
    expect(maxEdge * 2).toBe(1180);
    expect(TRUCK_ACTUAL_WIDTH_MU).toBe(maxEdge * 2);
    expect(TRUCK_ACTUAL_WIDTH_MU).toBeGreaterThan(mu(truck.footprint[0]));
  });

  it("truck height above ground = 1250 mu with 50 mu blockout float", () => {
    const truck = byId.get("truck")!;
    const cab = truck.parts.find((p) => p.name === "cab")!;
    const cabTop = mu(cab.center[1] + cab.size[1] / 2);
    const wheelGroup = truck.groups.find((g) => g.name.startsWith("wheel_"))!;
    const mesh = truck.parts.find((p) => p.parent === wheelGroup.name)!;
    const wheelBottom = mu(wheelGroup.position[1] - mesh.size[1] / 2);
    expect(cabTop).toBe(1300);
    expect(wheelBottom).toBe(50); // blockout float: wheels rest 0.05 u above ground
    expect(TRUCK_GROUND_FLOAT_MU).toBe(wheelBottom);
    expect(TRUCK_HEIGHT_MU).toBe(cabTop - wheelBottom);
    expect(TRUCK_HEIGHT_MU).toBe(1250);
  });

  it("wall_gate open clearance = 1350 mu; effective rest margin = 50 mu", () => {
    const gate = byId.get("wall_gate")!;
    const anim = gate.animations!.find((a) => a.name === "gate_open")!;
    const openY = mu(anim.values[anim.values.length - 1][1]);
    const panel = gate.parts.find((p) => p.name === "panel")!;
    const halfHeight = mu(panel.size[1] / 2);
    const clear = openY - halfHeight;
    expect(openY).toBe(2000);
    expect(clear).toBe(1350);
    expect(GATE_OPEN_CLEAR_MU).toBe(clear);
    const effective = clear - TRUCK_HEIGHT_MU - TRUCK_GROUND_FLOAT_MU;
    expect(effective).toBe(50);
    expect(GATE_EFFECTIVE_MARGIN_MU).toBe(effective);
    // Blockout accepts 50 mu; production demands >= 150 mu (kit must change).
    expect(GATE_EFFECTIVE_MARGIN_MU).toBeGreaterThanOrEqual(0);
    expect(GATE_EFFECTIVE_MARGIN_MU).toBeLessThan(PRODUCTION_MIN_MARGIN_MU);
    expect(PRODUCTION_MIN_MARGIN_MU).toBe(150);
  });
});