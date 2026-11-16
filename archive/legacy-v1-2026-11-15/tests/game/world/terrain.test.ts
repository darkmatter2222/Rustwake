/**
 * Deterministic terrain, parcel plan and initial economy (issue #133).
 * Seed -> layout is reproducible; the starter clear zone is never obstructed;
 * expansion parcels tile one contiguous ring around the 24x24 start land.
 */
import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  PARCEL_SIZE,
  ROUGH_CELLS,
  SALVAGE_DEPOSITS,
  START_CLEAR_MAX,
  START_CLEAR_MIN,
  START_SIZE,
  WORLD_SCHEMA_VERSION,
  createWorld,
  expansionParcels,
  generateTerrain,
  parcelPlan,
  terrainAt,
} from "../../../src/game/world";
import { CONTENT_VERSION } from "../../../src/game/simulation/types";
import { newWorld } from "./helpers";

describe("seed determinism", () => {
  it("same seed produces byte-identical terrain", () => {
    for (const seed of [0, 1, 133, 424242, 0xffffffff]) {
      const a = generateTerrain(seed);
      const b = generateTerrain(seed);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("different seeds produce different layouts", () => {
    const a = JSON.stringify(generateTerrain(133));
    const b = JSON.stringify(generateTerrain(134));
    expect(a).not.toBe(b);
  });

  it("createWorld is reproducible including the full state", () => {
    const a = createWorld(133);
    const b = createWorld(133);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(a.contentVersion).toBe(CONTENT_VERSION);
  });

  it("25 seeds all obey the layout invariants", () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const w = createWorld(seed);
      expect(w.terrain.length).toBe(GRID_SIZE * GRID_SIZE);
      let salvage = 0;
      let rough = 0;
      for (let y = 0; y < START_SIZE; y += 1) {
        for (let x = 0; x < START_SIZE; x += 1) {
          const kind = terrainAt(w, x, y);
          const inClear =
            x >= START_CLEAR_MIN && x < START_CLEAR_MAX && y >= START_CLEAR_MIN && y < START_CLEAR_MAX;
          if (inClear) {
            expect(kind, `seed ${seed} clear zone (${x},${y})`).toBe("flat");
          }
          if (kind === "salvage") salvage += 1;
          if (kind === "rough") rough += 1;
        }
      }
      expect(salvage, `seed ${seed} salvage cells`).toBeGreaterThanOrEqual(SALVAGE_DEPOSITS);
      expect(salvage, `seed ${seed} salvage cells`).toBeLessThanOrEqual(SALVAGE_DEPOSITS * 3);
      expect(rough, `seed ${seed} rough cells`).toBe(ROUGH_CELLS);
      // Expansion ring stays flat in this issue.
      for (const p of expansionParcels()) {
        for (let dy = 0; dy < p.size; dy += 1) {
          for (let dx = 0; dx < p.size; dx += 1) {
            expect(terrainAt(w, p.x + dx, p.y + dy)).toBe("flat");
          }
        }
      }
    }
  });
});

describe("parcel plan", () => {
  it("start land plus 16 expansion parcels tile [-8, 32)^2 exactly once", () => {
    const plan = parcelPlan();
    expect(plan.length).toBe(17);
    expect(plan[0]).toMatchObject({ id: 0, x: 0, y: 0, size: START_SIZE, owned: true });
    const coverage = new Map<string, number>();
    for (const p of plan) {
      expect(p.size === START_SIZE || p.size === PARCEL_SIZE).toBe(true);
      for (let dy = 0; dy < p.size; dy += 1) {
        for (let dx = 0; dx < p.size; dx += 1) {
          const key = `${p.x + dx},${p.y + dy}`;
          coverage.set(key, (coverage.get(key) ?? 0) + 1);
        }
      }
    }
    expect(coverage.size).toBe(GRID_SIZE * GRID_SIZE);
    for (const count of coverage.values()) expect(count).toBe(1);
    const ring = plan.slice(1);
    expect(ring.every((p) => !p.owned)).toBe(true);
    expect(new Set(ring.map((p) => p.id)).size).toBe(16);
  });

  it("12 ring parcels share an edge with start land; 4 corners touch only at a point", () => {
    const start = { x: 0, y: 0, size: START_SIZE };
    const sharesEdge = (p: { x: number; y: number; size: number }): boolean => {
      const yOverlap = Math.min(p.y + p.size, start.y + start.size) - Math.max(p.y, start.y);
      const xOverlap = Math.min(p.x + p.size, start.x + start.size) - Math.max(p.x, start.x);
      const vertical = (p.x + p.size === start.x || p.x === start.x + start.size) && yOverlap > 0;
      const horizontal = (p.y + p.size === start.y || p.y === start.y + start.size) && xOverlap > 0;
      return vertical || horizontal;
    };
    const ring = expansionParcels();
    const edge = ring.filter(sharesEdge);
    const corner = ring.filter((p) => !sharesEdge(p));
    expect(edge.length).toBe(12);
    expect(corner.length).toBe(4);
    for (const p of corner) {
      // Corner parcels are still reachable: each shares an edge with two
      // edge-ring parcels, so buying a neighbor unlocks them (contiguity is
      // against OWNED land, enforced by world.expand).
      const neighbors = ring.filter(
        (q) =>
          q.id !== p.id &&
          ((q.x + q.size === p.x || p.x + p.size === q.x) &&
            Math.min(q.y + q.size, p.y + p.size) - Math.max(q.y, p.y) > 0),
      );
      expect(neighbors.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("initial economy (GAME_SYSTEMS P1 seed)", () => {
  it("starts with 120 scrap, 12 ferrous, 12 steel, 60 credits, no tokens", () => {
    const w = newWorld();
    expect(w.stock).toEqual({ scrap: 120, ferrous: 12, steel: 12 });
    expect(w.credits).toBe(60);
    expect(w.milestoneTokens).toBe(0);
    expect(w.buildings.length).toBe(0);
    expect(w.sites.length).toBe(0);
    expect(w.reservations.length).toBe(0);
    expect(w.revision).toBe(0);
    expect(w.tick).toBe(0);
    expect(w.clearanceMode).toBe("blockout");
  });
});