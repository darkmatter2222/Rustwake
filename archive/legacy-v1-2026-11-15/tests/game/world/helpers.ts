/**
 * Shared helpers for the world-grid suite (issue #133).
 * Deterministic seeds only; every scenario is reproducible from SEED.
 */
import {
  applyWorldCommand,
  createWorld,
  validatePlacement,
  type Cell,
  type Rotation,
  type WorldCommand,
  type WorldCommandResult,
  type WorldRejection,
  type WorldState,
} from "../../../src/game/world";
import type { ResourceId } from "../../../src/game/content/defs";

export const SEED = 133;

export function newWorld(seed: number = SEED): WorldState {
  return createWorld(seed);
}

export function placeCmd(
  id: string,
  asset: string,
  x: number,
  y: number,
  rotation: number = 0,
): WorldCommand {
  return { id, type: "world.place", asset, cell: { x, y }, rotation };
}

export function place(
  w: WorldState,
  id: string,
  asset: string,
  x: number,
  y: number,
  rotation: number = 0,
): WorldCommandResult {
  return applyWorldCommand(w, placeCmd(id, asset, x, y, rotation));
}

/** First start-land cell where the placement validates (row-major scan). */
export function findLegalCell(
  w: WorldState,
  asset: string,
  rotation: Rotation = 0,
  predicate?: (cell: Cell) => boolean,
): Cell {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const cell = { x, y };
      if (predicate !== undefined && !predicate(cell)) continue;
      if (validatePlacement(w, asset, cell, rotation) === null) return cell;
    }
  }
  throw new Error(`no legal cell for ${asset} rot ${rotation} (seed ${w.seed})`);
}

/** First start-land cell matching a predicate, regardless of placement law. */
export function findCellWhere(w: WorldState, predicate: (cell: Cell) => boolean): Cell {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const cell = { x, y };
      if (predicate(cell)) return cell;
    }
  }
  throw new Error(`no cell matches predicate (seed ${w.seed})`);
}

export function expectOk(result: WorldCommandResult): asserts result is { ok: true; revision: number } {
  if (!result.ok) {
    throw new Error(`expected ok, got rejection: ${JSON.stringify(result.rejection)}`);
  }
}

export function expectReason(
  result: WorldCommandResult,
  reason: WorldRejection["reason"],
): WorldRejection {
  if (result.ok) {
    throw new Error(`expected rejection '${reason}', got ok (revision ${result.revision})`);
  }
  if (result.rejection.reason !== reason) {
    throw new Error(
      `expected rejection '${reason}', got '${result.rejection.reason}': ${JSON.stringify(result.rejection)}`,
    );
  }
  return result.rejection;
}

export interface LedgerTotals {
  stock: number;
  reserved: number;
  committed: number;
}

export function totals(w: WorldState, resource: ResourceId): LedgerTotals {
  let reserved = 0;
  for (const r of w.reservations) {
    for (const item of r.items) {
      if (item.resource === resource) reserved += item.qty;
    }
  }
  return {
    stock: w.stock[resource] ?? 0,
    reserved,
    committed: w.committed[resource] ?? 0,
  };
}

export function reservedCredits(w: WorldState): number {
  let sum = 0;
  for (const r of w.reservations) sum += r.credits;
  return sum;
}

/** Closed-system conservation: stock + reserved + committed = initial. */
export function expectConserved(w: WorldState, initial: Partial<Record<ResourceId, number>>): void {
  const resources = new Set<ResourceId>([
    ...(Object.keys(initial) as ResourceId[]),
    ...(Object.keys(w.stock) as ResourceId[]),
    ...(Object.keys(w.committed) as ResourceId[]),
  ]);
  for (const r of w.reservations) {
    for (const item of r.items) resources.add(item.resource);
  }
  for (const resource of resources) {
    const t = totals(w, resource);
    const sum = t.stock + t.reserved + t.committed;
    const want = initial[resource] ?? 0;
    if (sum !== want) {
      throw new Error(
        `conservation violated for ${resource}: expected ${want}, got ${sum} ` +
          `(stock ${t.stock} + reserved ${t.reserved} + committed ${t.committed})`,
      );
    }
  }
}

export function expectCreditsConserved(w: WorldState, initialCredits: number): void {
  const sum = w.credits + reservedCredits(w) + w.committedCredits;
  if (sum !== initialCredits) {
    throw new Error(
      `credit conservation violated: expected ${initialCredits}, got ${sum} ` +
        `(credits ${w.credits} + reserved ${reservedCredits(w)} + committed ${w.committedCredits})`,
    );
  }
}

/** Deep clone via JSON (the same seam a save/load round-trip uses). */
export function cloneWorld(w: WorldState): WorldState {
  return JSON.parse(JSON.stringify(w)) as WorldState;
}