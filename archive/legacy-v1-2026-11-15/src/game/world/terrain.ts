/**
 * Deterministic terrain and parcel plan (issue #133).
 *
 * Seed -> terrain is a pure integer function (mulberry32-style uint32 PRNG,
 * Fisher-Yates shuffle, no Math.random, no Date). The same seed always yields
 * the same salvage/rough layout; different seeds differ. The central starter
 * clear zone [6, 18)^2 is never obstructed, so no seed can produce an
 * inaccessible starting layout (GAME_SYSTEMS "World and placement").
 *
 * Parcel plan: parcel 0 is the owned 24x24 start land [0, 24)^2. Sixteen 8x8
 * expansion parcels tile one ring around it over [-8, 32)^2. Purchases must
 * be edge-contiguous with already-owned land and gated by milestone tokens.
 */
import {
  GRID_MIN,
  GRID_SIZE,
  PARCEL_SIZE,
  ROUGH_CELLS,
  SALVAGE_DEPOSITS,
  START_CLEAR_MAX,
  START_CLEAR_MIN,
  START_SIZE,
  WORLD_SCHEMA_VERSION,
  type Cell,
  type Parcel,
  type TerrainKind,
  type WorldState,
} from "./types";
import { CONTENT_VERSION } from "../simulation/types";

/** Integer-only PRNG (mulberry32). State is a uint32; every draw is uniform. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, n) from the PRNG; n must be a positive integer. */
export function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

function inStartLand(x: number, y: number): boolean {
  return x >= 0 && x < START_SIZE && y >= 0 && y < START_SIZE;
}

function inClearZone(x: number, y: number): boolean {
  return x >= START_CLEAR_MIN && x < START_CLEAR_MAX && y >= START_CLEAR_MIN && y < START_CLEAR_MAX;
}

/** The 16 expansion parcels, row-major (y outer, x inner), ids 1..16. */
export function expansionParcels(): Parcel[] {
  const parcels: Parcel[] = [];
  let id = 1;
  for (let by = -1; by <= 3; by += 1) {
    for (let bx = -1; bx <= 3; bx += 1) {
      // Skip the 3x3 blocks fully covered by the start land.
      if (bx >= 0 && bx <= 2 && by >= 0 && by <= 2) continue;
      parcels.push({
        id,
        x: bx * PARCEL_SIZE,
        y: by * PARCEL_SIZE,
        size: PARCEL_SIZE,
        owned: false,
      });
      id += 1;
    }
  }
  return parcels;
}

/** Full parcel plan: start land first, then the expansion ring. */
export function parcelPlan(): Parcel[] {
  return [
    { id: 0, x: 0, y: 0, size: START_SIZE, owned: true },
    ...expansionParcels(),
  ];
}

/**
 * Seed-driven terrain over the full plan extent. Salvage deposits and rough
 * ground only occur on the start land, outside the clear zone; expansion
 * parcels are flat until a later issue authors their own content.
 */
export function generateTerrain(seed: number): TerrainKind[] {
  const terrain: TerrainKind[] = new Array<TerrainKind>(GRID_SIZE * GRID_SIZE).fill("flat");
  const rng = createRng(seed);
  const index = (x: number, y: number): number => (y - GRID_MIN) * GRID_SIZE + (x - GRID_MIN);

  // Eligible start-land cells outside the clear zone, shuffled deterministically.
  const eligible: Cell[] = [];
  for (let y = 0; y < START_SIZE; y += 1) {
    for (let x = 0; x < START_SIZE; x += 1) {
      if (!inClearZone(x, y)) eligible.push({ x, y });
    }
  }
  for (let i = eligible.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1);
    const tmp = eligible[i];
    eligible[i] = eligible[j];
    eligible[j] = tmp;
  }

  const isSalvage = (x: number, y: number): boolean =>
    inStartLand(x, y) && terrain[index(x, y)] === "salvage";

  // Salvage deposits: anchors keep Chebyshev distance >= 2 from other salvage
  // so deposits never merge into an unbuildable wall; each grows 0..2 cells.
  let deposits = 0;
  const anchors: Cell[] = [];
  for (const cell of eligible) {
    if (deposits >= SALVAGE_DEPOSITS) break;
    if (terrain[index(cell.x, cell.y)] !== "flat") continue;
    let tooClose = false;
    for (const a of anchors) {
      if (Math.max(Math.abs(a.x - cell.x), Math.abs(a.y - cell.y)) < 2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    anchors.push(cell);
    terrain[index(cell.x, cell.y)] = "salvage";
    deposits += 1;
    const growth = randInt(rng, 3); // 0, 1 or 2 extra cells
    const dirs: Cell[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    let grown = 0;
    for (const dir of dirs) {
      if (grown >= growth) break;
      const nx = cell.x + dir.x;
      const ny = cell.y + dir.y;
      if (!inStartLand(nx, ny) || inClearZone(nx, ny)) continue;
      if (terrain[index(nx, ny)] !== "flat") continue;
      // Never grow adjacent to a different deposit's anchor.
      let touchesOther = false;
      for (const a of anchors) {
        if (a.x === cell.x && a.y === cell.y) continue;
        if (Math.max(Math.abs(a.x - nx), Math.abs(a.y - ny)) < 2) {
          touchesOther = true;
          break;
        }
      }
      if (touchesOther) continue;
      terrain[index(nx, ny)] = "salvage";
      grown += 1;
    }
  }

  // Rough ground: remaining eligible cells on the outer two-cell ring.
  let rough = 0;
  for (const cell of eligible) {
    if (rough >= ROUGH_CELLS) break;
    const edge = cell.x < 2 || cell.x >= START_SIZE - 2 || cell.y < 2 || cell.y >= START_SIZE - 2;
    if (!edge) continue;
    if (terrain[index(cell.x, cell.y)] !== "flat") continue;
    let nearSalvage = false;
    for (let dy = -1; dy <= 1 && !nearSalvage; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (isSalvage(cell.x + dx, cell.y + dy)) {
          nearSalvage = true;
          break;
        }
      }
    }
    if (nearSalvage) continue;
    terrain[index(cell.x, cell.y)] = "rough";
    rough += 1;
  }

  return terrain;
}

export function terrainIndex(x: number, y: number): number {
  return (y - GRID_MIN) * GRID_SIZE + (x - GRID_MIN);
}

export function inGridExtent(x: number, y: number): boolean {
  return x >= GRID_MIN && x < GRID_MIN + GRID_SIZE && y >= GRID_MIN && y < GRID_MIN + GRID_SIZE;
}

export function terrainAt(w: WorldState, x: number, y: number): TerrainKind | undefined {
  if (!inGridExtent(x, y)) return undefined;
  return w.terrain[terrainIndex(x, y)];
}

export function parcelAt(w: WorldState, x: number, y: number): Parcel | undefined {
  return w.parcels.find((p) => x >= p.x && x < p.x + p.size && y >= p.y && y < p.y + p.size);
}

export function cellOwned(w: WorldState, x: number, y: number): boolean {
  const p = parcelAt(w, x, y);
  return p !== undefined && p.owned;
}

/**
 * P1 economic seed (GAME_SYSTEMS): 120 scrap, 12 ferrous, 12 steel, 60 credits.
 * Milestone tokens start at zero; progression grants them in a later issue.
 */
export function createWorld(seed: number): WorldState {
  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    revision: 0,
    tick: 0,
    seed: seed >>> 0,
    clearanceMode: "blockout",
    parcels: parcelPlan(),
    terrain: generateTerrain(seed),
    buildings: [],
    sites: [],
    reservations: [],
    stock: { scrap: 120, ferrous: 12, steel: 12 },
    credits: 60,
    committed: {},
    committedCredits: 0,
    milestoneTokens: 0,
    nextBuildingId: 1,
    nextSiteId: 1,
    nextReservationId: 1,
    seenCommands: {},
  };
}