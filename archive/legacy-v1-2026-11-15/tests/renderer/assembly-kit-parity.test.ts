// @vitest-environment node
/**
 * RW3D T10 (#137): the embedded renderer kit geometry must match the
 * authoring source docs/vision/assets/kit.json exactly (read-only input).
 * Regenerate with tests/renderer/generate-kit-geometry.mjs; never hand-edit.
 */
import { describe, expect, it } from "vitest";
import kitJson from "../../docs/vision/assets/kit.json";
import { KIT_GEOMETRY, KIT_PALETTE } from "../../src/game/renderer/kitGeometry";
import { PART_STAGE } from "../../src/game/renderer/assembly";
import { WORLD_ASSET_IDS } from "../../src/game/world/kit";

interface JsonPart {
  name: string;
  parent: string;
  center: number[];
  size: number[];
  material: string;
}
interface JsonGroup {
  name: string;
  parent: string;
  position: number[];
}
interface JsonAsset {
  id: string;
  footprint: number[];
  groups: JsonGroup[];
  parts: JsonPart[];
}

const jsonAssets = kitJson.assets as unknown as JsonAsset[];

describe("kit geometry parity (renderer embed vs docs/vision/assets/kit.json)", () => {
  it("covers exactly the eight placeable world assets", () => {
    expect(Object.keys(KIT_GEOMETRY)).toEqual([...WORLD_ASSET_IDS]);
  });

  it("palette tokens match verbatim", () => {
    expect({ ...KIT_PALETTE }).toEqual(kitJson.palette);
  });

  for (const id of WORLD_ASSET_IDS) {
    it(`${id}: footprint, groups and parts match the authoring source`, () => {
      const src = jsonAssets.find((a) => a.id === id);
      expect(src, `kit.json missing ${id}`).toBeDefined();
      const embedded = KIT_GEOMETRY[id];
      expect([...embedded.footprint]).toEqual(src!.footprint);
      expect(embedded.groups.map((g) => ({ name: g.name, parent: g.parent, position: [...g.position] }))).toEqual(
        src!.groups.map((g) => ({ name: g.name, parent: g.parent, position: g.position })),
      );
      expect(
        embedded.parts.map((p) => ({
          name: p.name,
          parent: p.parent,
          center: [...p.center],
          size: [...p.size],
          material: p.material,
        })),
      ).toEqual(
        src!.parts.map((p) => ({
          name: p.name,
          parent: p.parent,
          center: p.center,
          size: p.size,
          material: p.material,
        })),
      );
    });
  }

  it("every part has exactly one stage assignment in 0..4, no extras", () => {
    for (const id of WORLD_ASSET_IDS) {
      const partNames = KIT_GEOMETRY[id].parts.map((p) => p.name).sort();
      const staged = Object.keys(PART_STAGE[id]).sort();
      expect(staged, `${id} stage table coverage`).toEqual(partNames);
      for (const stage of Object.values(PART_STAGE[id])) {
        expect(Number.isInteger(stage)).toBe(true);
        expect(stage).toBeGreaterThanOrEqual(0);
        expect(stage).toBeLessThanOrEqual(4);
      }
    }
  });

  it("parent references resolve and materials exist", () => {
    for (const id of WORLD_ASSET_IDS) {
      const geo = KIT_GEOMETRY[id];
      const groupNames = new Set(geo.groups.map((g) => g.name));
      const seen = new Set<string>();
      for (const g of geo.groups) {
        expect(g.parent === "root" || seen.has(g.parent), `${id}/${g.name} parent order`).toBe(true);
        seen.add(g.name);
      }
      for (const p of geo.parts) {
        expect(p.parent === "root" || groupNames.has(p.parent), `${id}/${p.name} parent`).toBe(true);
        expect(p.material in KIT_PALETTE, `${id}/${p.name} material`).toBe(true);
      }
    }
  });
});
