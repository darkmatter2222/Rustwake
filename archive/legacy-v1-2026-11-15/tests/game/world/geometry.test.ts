/**
 * Rotation permutations, clearance math and integer geometry (issue #133).
 * Binding rulings hard-checked here: four yaw rotations for occupancy cell
 * sets, socket permutation and frontage; crane swing r = 2.508 u is
 * clearance, never occupancy; clearance = max(nominal, actual) + 2 * 0.15 u.
 */
import { describe, expect, it } from "vitest";
import {
  CLEARANCE_MARGIN_MU,
  CRANE_SWING_RADIUS_MU,
  MU_PER_UNIT,
  ROTATIONS,
  WORLD_ASSET_IDS,
  WORLD_KIT,
  centerMu,
  entranceCorridor,
  entranceDepthMu,
  footprintCells,
  frontageDir,
  rotateLocalMu,
  rotatedSize,
  socketClearanceWidth,
  socketWorldMu,
  type Rotation,
} from "../../../src/game/world";

describe("rotation permutations (all assets x four yaws)", () => {
  for (const assetId of WORLD_ASSET_IDS) {
    const asset = WORLD_KIT[assetId];
    for (const rotation of ROTATIONS) {
      it(`${assetId} @ ${rotation}: occupancy cell set is the rotated footprint`, () => {
        const cell = { x: 5, y: 7 };
        const [w, d] = rotatedSize(asset.footprint, rotation);
        const cells = footprintCells(cell, asset.footprint, rotation);
        expect(cells.length).toBe(w * d);
        const expected: { x: number; y: number }[] = [];
        for (let dy = 0; dy < d; dy += 1) {
          for (let dx = 0; dx < w; dx += 1) expected.push({ x: cell.x + dx, y: cell.y + dy });
        }
        expect(cells).toEqual(expected);
        // 90/270 swap width and depth; 0/180 preserve them.
        const swap = rotation === 90 || rotation === 270;
        expect([w, d]).toEqual(
          swap ? [asset.footprint[1], asset.footprint[0]] : [asset.footprint[0], asset.footprint[1]],
        );
      });

      it(`${assetId} @ ${rotation}: sockets permute rigidly about the center`, () => {
        const cell = { x: 5, y: 7 };
        const [cx, cz] = centerMu(cell, asset.footprint, rotation);
        const [cx0, cz0] = centerMu(cell, asset.footprint, 0);
        // Rotate the rot-0 world sockets rigidly about the rot-0 center, then
        // re-anchor: the anchor is the footprint min corner, so non-square
        // footprints shift their center when width/depth swap at 90/270.
        const rotatedFromZero = asset.sockets.map((s) => {
          const [wx, wz] = [cx0 + s.x, cz0 + s.z]; // rot-0 world position
          const [rx, rz] = rotateLocalMu(wx - cx0, wz - cz0, rotation);
          return [cx + rx, cz + rz];
        });
        const direct = asset.sockets.map((s) => socketWorldMu(asset, cell, rotation, s));
        expect(direct).toEqual(rotatedFromZero);
        // Pairwise socket distances are rotation-invariant (rigid permutation).
        for (let i = 0; i < asset.sockets.length; i += 1) {
          for (let j = i + 1; j < asset.sockets.length; j += 1) {
            const a = asset.sockets[i];
            const b = asset.sockets[j];
            const d0 = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
            const dx = direct[i][0] - direct[j][0];
            const dz = direct[i][1] - direct[j][1];
            expect(dx * dx + dz * dz).toBe(d0);
          }
        }
        for (const [x, z] of direct) {
          expect(Number.isInteger(x)).toBe(true);
          expect(Number.isInteger(z)).toBe(true);
        }
        // Distances from center are rotation-invariant (rigid permutation).
        for (let i = 0; i < asset.sockets.length; i += 1) {
          const s = asset.sockets[i];
          const d0 = (s.x - 0) ** 2 + (s.z - 0) ** 2;
          const dx = direct[i][0] - cx;
          const dz = direct[i][1] - cz;
          expect(dx * dx + dz * dz).toBe(d0);
        }
      });

      it(`${assetId} @ ${rotation}: frontage follows +Z -> +X -> -Z -> -X`, () => {
        const depthMu = asset.footprint[1] * MU_PER_UNIT;
        const [fx, fz] = rotateLocalMu(0, depthMu, rotation);
        const dir = frontageDir(rotation);
        expect([fx, fz]).toEqual([dir.x * depthMu, dir.y * depthMu]);
      });
    }
  }

  it("frontage cycle is exactly +Z, +X, -Z, -X", () => {
    expect(ROTATIONS.map(frontageDir)).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
    ]);
  });

  it("rotateLocalMu composes: four 90-degree turns are the identity", () => {
    for (const [x, z] of [
      [1550, 2150],
      [-1550, 2150],
      [0, 700],
      [2500, -200],
    ]) {
      let p: [number, number] = [x, z];
      for (let i = 0; i < 4; i += 1) p = rotateLocalMu(p[0], p[1], 90);
      expect(p).toEqual([x, z]);
    }
    expect(rotateLocalMu(3, 7, 90)).toEqual([7, -3]);
    expect(rotateLocalMu(3, 7, 180)).toEqual([-3, -7]);
    expect(rotateLocalMu(3, 7, 270)).toEqual([-7, 3]);
  });

  it("entrance corridors rotate rigidly with the building", () => {
    const cell = { x: 5, y: 7 };
    for (const assetId of WORLD_ASSET_IDS) {
      const asset = WORLD_KIT[assetId];
      for (const socket of asset.sockets) {
        const base = entranceCorridor(asset, cell, 0, socket);
        const [cx, cz] = centerMu(cell, asset.footprint, 0);
        for (const rotation of ROTATIONS) {
          // Re-anchor to the rotated footprint center (the min-corner anchor
          // shifts the center when width/depth swap at 90/270).
          const [cxr, czr] = centerMu(cell, asset.footprint, rotation);
          const corners: [number, number][] = [
            [base.minX, base.minZ],
            [base.minX, base.maxZ],
            [base.maxX, base.minZ],
            [base.maxX, base.maxZ],
          ];
          const rotated = corners.map(([x, z]) => {
            const [rx, rz] = rotateLocalMu(x - cx, z - cz, rotation);
            return [cxr + rx, czr + rz];
          });
          const want = {
            minX: Math.min(...rotated.map((p) => p[0])),
            minZ: Math.min(...rotated.map((p) => p[1])),
            maxX: Math.max(...rotated.map((p) => p[0])),
            maxZ: Math.max(...rotated.map((p) => p[1])),
          };
          expect(entranceCorridor(asset, cell, rotation, socket)).toEqual(want);
        }
      }
    }
  });
});

describe("crane swing clearance (binding ruling: clearance, not occupancy)", () => {
  it("radius is exactly 2508 mu = ceil(sqrt(2500^2 + 200^2))", () => {
    const squared = 2500 * 2500 + 200 * 200;
    expect(CRANE_SWING_RADIUS_MU).toBe(2508);
    expect(2507 * 2507).toBeLessThan(squared);
    expect(2508 * 2508).toBeGreaterThanOrEqual(squared);
    expect(WORLD_KIT.crane.keepoutRadiusMu).toBe(CRANE_SWING_RADIUS_MU);
  });

  it("crane occupancy stays the 3x3 footprint, not the disc", () => {
    for (const rotation of ROTATIONS) {
      const cells = footprintCells({ x: 0, y: 0 }, WORLD_KIT.crane.footprint, rotation);
      expect(cells.length).toBe(9);
    }
  });
});

describe("clearance width = max(nominal, actual) + 2 * 0.15 u", () => {
  const expected: Record<string, Record<string, number>> = {
    warehouse: { bay0: 2500, bay1: 2500 }, // max(2200, truck 1180) + 300
    depot: { serviceBay: 3500 }, // max(3200, 1180) + 300
    sorter: { output: 1300 }, // max(1000, 0) + 300
    furnace: { input: 1600 }, // max(1300, pallet 900) + 300
    wall_gate: { passage: 2100 }, // max(1800, truck 1180) + 300
  };
  for (const [assetId, sockets] of Object.entries(expected)) {
    for (const [name, width] of Object.entries(sockets)) {
      it(`${assetId}.${name} clearance width is ${width} mu`, () => {
        const socket = WORLD_KIT[assetId as keyof typeof WORLD_KIT].sockets.find((s) => s.name === name);
        expect(socket).toBeDefined();
        expect(socketClearanceWidth(socket!)).toBe(width);
        expect(CLEARANCE_MARGIN_MU).toBe(150);
      });
    }
  }

  it("entrance depth: vehicles stage 3 u, belts/cargo dock 1 u", () => {
    for (const assetId of WORLD_ASSET_IDS) {
      for (const socket of WORLD_KIT[assetId].sockets) {
        const want = socket.kind === "belt" || socket.kind === "cargo" ? 1000 : 3000;
        expect(entranceDepthMu(socket)).toBe(want);
      }
    }
  });

  it("all corridor coordinates are integer mu", () => {
    for (const assetId of WORLD_ASSET_IDS) {
      const asset = WORLD_KIT[assetId];
      for (const rotation of ROTATIONS as Rotation[]) {
        for (const socket of asset.sockets) {
          const r = entranceCorridor(asset, { x: 3, y: 4 }, rotation, socket);
          for (const v of [r.minX, r.minZ, r.maxX, r.maxZ]) {
            expect(Number.isInteger(v)).toBe(true);
          }
          const swap = rotation === 90 || rotation === 270;
          const width = socketClearanceWidth(socket);
          const depth = entranceDepthMu(socket);
          expect(r.maxX - r.minX).toBe(swap ? depth : width);
          expect(r.maxZ - r.minZ).toBe(swap ? width : depth);
        }
      }
    }
  });
});